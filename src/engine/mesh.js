// Heightmap -> mesh, previews and estimates. Port of the desktop's
// core/mesh.py. Every pixel is a vertical column of boxes sitting on a
// solid base; one mesh part per filament band. The footprint is the crop
// rectangle, or the shape mask when there is one - nothing is built
// outside it.

import { hexToRgb, buildLut } from "./solve.js";

export const MESH_DETAIL = { draft: 0.33, standard: 0.2, fine: 0 }; // target cell mm; 0 = every pixel
export const FIRST_LAYER_MM = 0.2;
const DENSITY_G_CM3 = 1.24;      // PLA
const PURGE_G_PER_SWITCH = 3.0;  // rough AMS purge cost per colour change
const Z_EXAGGERATION = 6.0;      // visual only

// ---------------------------------------------------------------- grid prep
/** Block max-pool: a raised detail stays raised after downsampling. */
export function downsampleMax(a, w, h, f) {
  if (f <= 1) return { a, w, h };
  const w2 = Math.ceil(w / f), h2 = Math.ceil(h / f);
  const out = new Uint16Array(w2 * h2);
  for (let y = 0; y < h; y++) {
    const oy = Math.floor(y / f) * w2;
    for (let x = 0; x < w; x++) {
      const o = oy + Math.floor(x / f), v = a[y * w + x];
      if (v > out[o]) out[o] = v;
    }
  }
  // numpy pads with the edge value; max over a partial block is the same
  return { a: out, w: w2, h: h2 };
}

/** A coarse cell is inside when most of its pixels are (majority, so the
 *  outline isn't fattened by a cell). Partial edge blocks count padding
 *  as outside, like the desktop. */
export function downsampleMask(m, w, h, f) {
  if (!m || f <= 1) return m;
  const w2 = Math.ceil(w / f), h2 = Math.ceil(h / f);
  const sum = new Uint32Array(w2 * h2);
  for (let y = 0; y < h; y++) {
    const oy = Math.floor(y / f) * w2;
    for (let x = 0; x < w; x++) sum[oy + Math.floor(x / f)] += m[y * w + x];
  }
  const out = new Uint8Array(w2 * h2);
  const half = f * f / 2;
  for (let i = 0; i < out.length; i++) out[i] = sum[i] >= half ? 1 : 0;
  return out;
}

export function bandBounds(filaments) {
  const out = [];
  let h = 0;
  for (const f of filaments) {
    const bl = f.band_layers | 0;
    if (bl <= 0) continue;
    out.push({ slot: f.slot, name: f.name || `Slot ${f.slot}`, hex: f.hex,
               start_h: out.length ? h : -1, end_h: h + bl });
    h += bl;
  }
  return out;
}

/** Rectangles (c0, c1, r0, r1, zTop) covering every participating cell
 *  exactly once: horizontal runs, merged down while they repeat. */
function* mergeStrips(part, zTop, w, h) {
  let active = new Map();
  for (let r = 0; r <= h; r++) {
    const now = new Map();
    if (r < h) {
      let c = 0;
      while (c < w) {
        const i = r * w + c;
        if (!part[i]) { c++; continue; }
        const c0 = c, zt = zTop[i];
        c++;
        while (c < w && part[r * w + c] && Math.abs(zTop[r * w + c] - zt) < 1e-6) c++;
        const zr = Math.round(zt * 1e6) / 1e6;
        now.set(`${c0},${c},${zr}`, [c0, c, zr]);
      }
    }
    for (const [key, [c0, c1, zt, r0]] of active) {
      if (!now.has(key)) { yield [c0, c1, r0, r, zt]; active.delete(key); }
    }
    for (const [key, [c0, c1, zt]] of now) {
      if (!active.has(key)) active.set(key, [c0, c1, zt, r]);
    }
  }
}

/** Snapped base height: Studio slices a 0.2 mm first layer then layer_h
 *  steps, so the base is snapped to keep colour boundaries on slice edges. */
export function snappedBaseMm(baseLayers, layerH) {
  let base = baseLayers * layerH;
  if (layerH < FIRST_LAYER_MM) {
    base = FIRST_LAYER_MM + Math.max(0, Math.floor(base / layerH - FIRST_LAYER_MM / layerH + 1e-6)) * layerH;
  }
  return base;
}

/** Returns { parts: [{name, extruder, boxes: Float32Array(6n)}], stats }. */
export function buildModel({ heights, w, h, mask, physicalW, layerH, baseLayers, filaments,
                             detail = "standard", name = "HueLite model" }) {
  const baseMm = snappedBaseMm(baseLayers, layerH);
  const pxMm = physicalW / w;
  const target = MESH_DETAIL[detail] ?? MESH_DETAIL.standard;
  const factor = target ? Math.max(1, Math.round(target / pxMm)) : 1;
  const g = downsampleMax(heights, w, h, factor);
  const inside = downsampleMask(mask, w, h, factor);
  const rows = g.h, cols = g.w;
  const cell = physicalW / w * factor;
  const widthMm = cols * cell, heightMm = rows * cell;
  const x0 = -widthMm / 2;

  const parts = [];
  for (const band of bandBounds(filaments)) {
    const part = new Uint8Array(rows * cols);
    const zTop = new Float64Array(rows * cols);
    let any = false;
    const lo = Math.max(band.start_h, 0);
    for (let i = 0; i < part.length; i++) {
      const v = g.a[i];
      if (v > band.start_h && (!inside || inside[i])) { part[i] = 1; any = true; }
      zTop[i] = baseMm + Math.min(band.end_h, Math.max(lo, v)) * layerH;
    }
    if (!any) continue;
    const zBottom = band.start_h < 0 ? 0 : baseMm + band.start_h * layerH;
    const boxes = [];
    for (const [c0, c1, r0, r1, zt] of mergeStrips(part, zTop, cols, rows)) {
      // row 0 is the top of the photo = back of the plate (larger Y)
      boxes.push(x0 + c0 * cell, (rows - r1) * cell - heightMm / 2, zBottom,
                 x0 + c1 * cell, (rows - r0) * cell - heightMm / 2, zt);
    }
    parts.push({ name: band.name, extruder: band.slot, boxes: Float32Array.from(boxes) });
  }
  const nBoxes = parts.reduce((s, p) => s + p.boxes.length / 6, 0);
  return { parts, name, stats: { parts: parts.length, triangles: nBoxes * 12, vertices: nBoxes * 8 } };
}

// ---------------------------------------------------------------- shading
const LIGHT = (() => { const l = [-0.5, -0.35, 0.8]; const n = Math.hypot(...l); return l.map((v) => v / n); })();

/** np.gradient-style central differences, one-sided at the edges. */
function shadeFactor(z, w, h, cell) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = w < 2 ? 0 : x === 0 ? (z[i + 1] - z[i]) / cell : x === w - 1 ? (z[i] - z[i - 1]) / cell
        : (z[i + 1] - z[i - 1]) / (2 * cell);
      const gy = h < 2 ? 0 : y === 0 ? (z[i + w] - z[i]) / cell : y === h - 1 ? (z[i] - z[i - w]) / cell
        : (z[i + w] - z[i - w]) / (2 * cell);
      const norm = Math.sqrt(gx * gx + gy * gy + 1);
      const s = (-gx * LIGHT[0] - gy * LIGHT[1] + LIGHT[2]) / norm;
      out[i] = 0.55 + 0.85 * Math.min(1, Math.max(0, s));
    }
  }
  return out;
}

const BG = [17, 17, 16];

/** Top-down simulated print as ImageData. */
export function renderTop({ heights, w, h, lut, mask, layerH, baseMm, cellMm, shaded = true }) {
  const img = new ImageData(w, h);
  const d = img.data;
  const z = new Float32Array(w * h);
  for (let i = 0; i < z.length; i++) z[i] = mask && !mask[i] ? 0 : baseMm + heights[i] * layerH;
  const f = shaded ? shadeFactor(z, w, h, Math.max(cellMm, 1e-6)) : null;
  const top = lut.length - 1;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (mask && !mask[i]) { d[o] = BG[0]; d[o + 1] = BG[1]; d[o + 2] = BG[2]; d[o + 3] = 255; continue; }
    const c = lut[Math.min(top, heights[i])];
    const k = f ? f[i] : 1;
    d[o] = c[0] * k; d[o + 1] = c[1] * k; d[o + 2] = c[2] * k; d[o + 3] = 255;
  }
  return img;
}

/** Raw height as greyscale. */
export function renderHeight({ heights, w, h, mask }) {
  let max = 1;
  for (let i = 0; i < heights.length; i++) if (heights[i] > max) max = heights[i];
  const img = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const out = mask && !mask[i];
    const g = (heights[i] / max) * 255;
    img.data[o] = out ? BG[0] : g; img.data[o + 1] = out ? BG[1] : g;
    img.data[o + 2] = out ? BG[2] : g; img.data[o + 3] = 255;
  }
  return img;
}

/** ~30 degree view with real occlusion, as a canvas. */
export function renderOblique({ heights, w, h, lut, mask, baseHex, layerH, baseMm, physicalW,
                                targetWidth = 600, elevationDeg = 30, depthCompress = 0.65,
                                maxCols = 200 }) {
  const f = Math.max(1, Math.round(w / maxCols));
  const g = downsampleMax(heights, w, h, f);
  const m = downsampleMask(mask, w, h, f);
  const rows = g.h, cols = g.w;
  const baseRgb = hexToRgb(baseHex);
  let maxH = 0;
  for (let i = 0; i < g.a.length; i++) if (g.a[i] > maxH && (!m || m[i])) maxH = g.a[i];
  const z = new Float32Array(rows * cols);
  for (let i = 0; i < z.length; i++) z[i] = m && !m[i] ? 0 : baseMm + g.a[i] * layerH;
  const maxTotal = baseMm + maxH * layerH;
  const physicalH = physicalW * rows / cols;
  const mmPerCol = physicalW / cols, mmPerRow = physicalH / rows;
  const e = elevationDeg * Math.PI / 180;
  const pxPerMm = targetWidth / physicalW;
  const canvasH = Math.round(maxTotal * Math.sin(e) * Z_EXAGGERATION * pxPerMm
                             + rows * mmPerRow * Math.cos(e) * pxPerMm * depthCompress) + 24;
  const baseline = canvasH - 12;
  const shade = shadeFactor(z, cols, rows, mmPerCol);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `rgb(${BG.join(",")})`;
  ctx.fillRect(0, 0, targetWidth, canvasH);
  const colW = targetWidth / cols;
  const top = lut.length - 1;
  for (let c = 0; c < cols; c++) {
    const xa = Math.round(c * colW);
    const xb = Math.max(xa + 1, Math.round((c + 1) * colW));
    let runningMin = baseline;
    for (let r = rows - 1; r >= 0; r--) {   // near (bottom of photo) to far
      const i = r * cols + c;
      if (m && !m[i]) continue;
      const zPx = z[i] * Math.sin(e) * Z_EXAGGERATION * pxPerMm;
      const depthPx = (rows - 1 - r) * mmPerRow * Math.cos(e) * pxPerMm * depthCompress;
      const y = Math.round(baseline - zPx - depthPx);
      if (y < runningMin) {
        const yc = Math.max(0, y);
        const col = z[i] < baseMm ? baseRgb : lut[Math.min(top, Math.round(g.a[i]))];
        const k = shade[i];
        ctx.fillStyle = `rgb(${Math.min(255, col[0] * k) | 0},${Math.min(255, col[1] * k) | 0},${Math.min(255, col[2] * k) | 0})`;
        ctx.fillRect(xa, yc, xb - xa, runningMin - yc);
        runningMin = yc;
      }
    }
  }
  return canvas;
}

/** Ballpark cost, purge waste and colour switches - same box model. */
export function estimates({ heights, w, h, mask, filaments, layerH, baseLayers, physicalW,
                            pricePerKg = 25, bandMode = "solid" }) {
  const baseMm = baseLayers * layerH;
  const cell = physicalW / w, area = cell * cell;
  const perSlot = {};
  for (const band of bandBounds(filaments)) {
    let vol = 0;
    for (let i = 0; i < heights.length; i++) {
      if (mask && !mask[i]) continue;
      const v = heights[i];
      if (band.start_h < 0) vol += area * (baseMm + Math.min(v, band.end_h) * layerH);
      else if (v > band.start_h) vol += area * (Math.min(v, band.end_h) - band.start_h) * layerH;
    }
    perSlot[band.slot] = (perSlot[band.slot] || 0) + vol;
  }
  let grams = 0, cost = 0;
  const rows = filaments.map((f) => {
    const g = (perSlot[f.slot] || 0) / 1000 * DENSITY_G_CM3;
    const c = g / 1000 * pricePerKg;
    grams += g; cost += c;
    return { slot: f.slot, hex: f.hex, grams: g, cost: c };
  });

  const { lut, owner } = buildLut(filaments, layerH, bandMode);
  const maxH = lut.length - 1;
  let tallest = 0;
  for (let i = 0; i < heights.length; i++) {
    if ((!mask || mask[i]) && heights[i] > tallest) tallest = heights[i];
  }
  // a colour layer is printed if some column reaches above it
  let switches = 0;
  for (let k = 1; k < Math.min(maxH, tallest); k++) if (owner[k] !== owner[k - 1]) switches++;

  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  if (mask) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const footprint = mask && x1 >= 0 ? [(x1 - x0 + 1) * cell, (y1 - y0 + 1) * cell] : [physicalW, h * cell];
  return {
    filaments: rows, total_grams: grams, total_cost: cost, switches,
    purge_g: switches * PURGE_G_PER_SWITCH,
    max_height_mm: baseMm + tallest * layerH, footprint_mm: footprint,
    base_hex: filaments[0]?.hex || "#000000",
  };
}
