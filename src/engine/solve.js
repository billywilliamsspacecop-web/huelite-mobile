// The depth solve. Port of the desktop's core/solve.py - see that file for
// the reasoning. In short: filament order is fixed, every pixel gets one
// integer height, and the colour at height h is determined by the stack
// below it. So we precompute one colour per height (the LUT) and map
// every pixel to its nearest entry. No blurring happens after this.

import * as shape from "./shape.js";

const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
].map((row) => row.map((v) => v / 64 - 0.5));

export function hexToRgb(value) {
  const v = value.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

export function rgbToHex(rgb) {
  return "#" + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c)))
    .toString(16).padStart(2, "0").toUpperCase()).join("");
}

// Python's round() is round-half-to-even; match it so band tints agree
// with the desktop at exact .5 boundaries.
function roundHalfEven(x) {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Colour of the print at every possible height, and the slot that owns
 *  each layer. lut is an array of [r, g, b]. */
export function buildLut(filaments, layerHeight, mode = "solid") {
  let current = hexToRgb(filaments[0].hex);
  const lut = [current.slice()];
  const owner = [filaments[0].slot];
  for (const fil of filaments) {
    const colour = hexToRgb(fil.hex);
    const td = Math.max(1e-4, Number(fil.td_mm ?? 1));
    const alpha = Math.min(1, Math.max(0, layerHeight / td));
    const nT = Math.min(3, Math.max(1, roundHalfEven(td / layerHeight * 0.25)));
    for (let k = 0; k < (fil.band_layers | 0); k++) {
      const wgt = mode === "solid" ? (k >= nT ? 1 : 0.6 + 0.4 * k / nT) : alpha;
      current = current.map((c, i) => colour[i] * wgt + c * (1 - wgt));
      lut.push(current.slice());
      owner.push(fil.slot);
    }
  }
  return { lut, owner };
}

/** The same stack as buildLut, but as weights: lut[k] = sum over slots of
 *  weights[k][slot] * colour[slot]. Every row is a convex mix of the
 *  filament colours, which is what lets fitFilaments solve for the colours
 *  directly instead of guessing. */
export function lutWeights(filaments, layerHeight, mode = "solid") {
  const n = filaments.length;
  let cur = new Float64Array(n);
  cur[0] = 1;
  const rows = [cur.slice()];
  filaments.forEach((fil, i) => {
    const td = Math.max(1e-4, Number(fil.td_mm ?? 1));
    const alpha = Math.min(1, Math.max(0, layerHeight / td));
    const nT = Math.min(3, Math.max(1, roundHalfEven(td / layerHeight * 0.25)));
    for (let k = 0; k < (fil.band_layers | 0); k++) {
      const wgt = mode === "solid" ? (k >= nT ? 1 : 0.6 + 0.4 * k / nT) : alpha;
      cur = cur.map((c) => c * (1 - wgt));
      cur[i] += wgt;
      rows.push(cur.slice());
    }
  });
  return rows;
}

/** Map every pixel to the height whose colour is closest (redmean).
 *  rgba is ImageData.data; returns a Uint16Array of heights. */
export function solveHeights(rgba, w, h, lut, { dither = true, amount = 1 } = {}) {
  const n = lut.length;
  const L = new Float32Array(n * 3);
  lut.forEach((c, i) => { L[i * 3] = c[0]; L[i * 3 + 1] = c[1]; L[i * 3 + 2] = c[2]; });
  let amp = 0;
  if (dither && amount > 0 && n > 1) {
    const steps = [];
    for (let i = 1; i < n; i++) {
      steps.push(Math.hypot(L[i * 3] - L[i * 3 - 3], L[i * 3 + 1] - L[i * 3 - 2], L[i * 3 + 2] - L[i * 3 - 1]));
    }
    steps.sort((a, b) => a - b);
    // numpy's median averages the middle pair on an even count
    const m = steps.length;
    amp = m % 2 ? steps[m >> 1] : (steps[m / 2 - 1] + steps[m / 2]) / 2;
    amp *= amount;
  }
  const out = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    const brow = BAYER8[y % 8];
    for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4;
      const t = amp ? brow[x % 8] * amp : 0;
      const r = rgba[i] + t, g = rgba[i + 1] + t, b = rgba[i + 2] + t;
      let best = 0, bestD = Infinity;
      for (let k = 0; k < n; k++) {
        const lr = L[k * 3], lg = L[k * 3 + 1], lb = L[k * 3 + 2];
        const rbar = (r + lr) * 0.5;
        const dr = r - lr, dg = g - lg, db = b - lb;
        const d = (2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db;
        if (d < bestD) { bestD = d; best = k; }
      }
      out[p] = best;
    }
  }
  return out;
}

/** Tall features get a sloped foundation instead of a sheer wall. */
export function applySlope(heights, w, h, pxMm, runMmPerLayer, maxIter = 600) {
  if (runMmPerLayer <= 0) return heights;
  const step = pxMm / runMmPerLayer;
  const diag = step * 1.4142;
  let cur = Float32Array.from(heights);
  const dirs = [[1, 0, step], [-1, 0, step], [0, 1, step], [0, -1, step],
                [1, 1, diag], [1, -1, diag], [-1, 1, diag], [-1, -1, diag]];
  for (let it = 0; it < maxIter; it++) {
    const prev = cur;
    cur = prev.slice();
    for (const [dy, dx, cost] of dirs) {
      const y0 = Math.max(0, -dy), y1 = h - Math.max(0, dy);
      const x0 = Math.max(0, -dx), x1 = w - Math.max(0, dx);
      for (let y = y0; y < y1; y++) {
        let s = y * w + x0, d = (y + dy) * w + x0 + dx;
        for (let x = x0; x < x1; x++, s++, d++) {
          const v = prev[s] - cost;
          if (v > cur[d]) cur[d] = v;
        }
      }
    }
    let same = true;
    for (let i = 0; i < cur.length; i++) if (cur[i] !== prev[i]) { same = false; break; }
    if (same) break;
  }
  const out = new Uint16Array(heights.length);
  for (let i = 0; i < out.length; i++) out[i] = roundHalfEven(cur[i]);
  return out;
}

/** Zero everything outside the outline. */
export function applyMask(heights, mask) {
  if (!mask) return heights;
  const out = heights.slice();
  for (let i = 0; i < out.length; i++) if (!mask[i]) out[i] = 0;
  return out;
}

/** A frame around the plate - or around the outline, when there is one. */
export function applyBorder(heights, w, h, { widthPx, mode, rimLayers, maxLayers, mask = null }) {
  if (widthPx <= 0 || mode === "none") return heights;
  const value = mode === "raised" ? Math.min(maxLayers, Math.max(0, rimLayers)) : 0;
  const out = heights.slice();
  if (mask) {
    const r = shape.rim(mask, w, h, widthPx);
    for (let i = 0; i < out.length; i++) if (r[i]) out[i] = value;
    return out;
  }
  const b = widthPx;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < b || y >= h - b || x < b || x >= w - b) out[y * w + x] = value;
    }
  }
  return out;
}

export const layersForMm = (mm, lh) => Math.max(0, roundHalfEven(mm / Math.max(1e-6, lh)));

export function bandEndLayer(filaments, slot) {
  let total = 0;
  for (const f of filaments) {
    total += f.band_layers | 0;
    if (f.slot === slot) return total;
  }
  return total;
}

export function swapPlan(filaments, layerHeight, baseLayers) {
  const plan = [];
  let layer = baseLayers;
  filaments.forEach((fil, i) => {
    let bands = fil.band_layers | 0;
    if (i === 0) { bands += baseLayers; layer = 0; }
    if (bands <= 0) return;
    plan.push({
      slot: fil.slot, name: fil.name || `Slot ${fil.slot}`, hex: fil.hex,
      start_layer: layer, layers: bands,
      start_z_mm: +(layer * layerHeight).toFixed(3),
      end_z_mm: +((layer + bands) * layerHeight).toFixed(3),
    });
    layer += bands;
  });
  return plan;
}

export function totals(filaments, layerHeight, baseLayers) {
  const colour = filaments.reduce((s, f) => s + (f.band_layers | 0), 0);
  const total = colour + baseLayers;
  return {
    colour_layers: colour, total_layers: total,
    base_mm: +(baseLayers * layerHeight).toFixed(3),
    total_mm: +(total * layerHeight).toFixed(3),
  };
}

export function rigidityNote(baseMm, thinnestMm, widthMm) {
  const span = Math.max(1, widthMm);
  if (thinnestMm < 1.0) return "thin - likely to curl or warp";
  if (thinnestMm < 1.6 && span > 120) return "thin for this size - consider a deeper base";
  if (thinnestMm < 1.6) return "workable, a deeper base prints flatter";
  if (thinnestMm >= 2.4) return "rigid";
  return "good";
}

export function distinctColours(lut, threshold = 2) {
  if (lut.length < 2) return lut.length;
  let keep = 1, last = lut[0];
  for (const c of lut.slice(1)) {
    if (Math.hypot(c[0] - last[0], c[1] - last[1], c[2] - last[2]) > threshold) { keep++; last = c; }
  }
  return keep;
}

/** n representative colours from the pixels inside the outline, darkest
 *  first.
 *
 *  Pixels are binned coarsely and bins too small to matter (JPEG noise,
 *  anti-aliased edges) are dropped. Seeds are then picked farthest-first
 *  among the bins that are left, so a small but real area - black lettering
 *  on a red badge - still gets a slot instead of the big colour taking
 *  three. A few k-means passes then settle each seed on its cluster's
 *  true average. Deterministic: the same photo always gives the same
 *  colours. */
export function importColours(rgba, mask, n) {
  const total = rgba.length / 4;
  const stride = Math.max(1, Math.floor(total / 80000));
  const px = [];
  for (let p = 0; p < total; p += stride) {
    if (mask && !mask[p]) continue;
    px.push(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]);
  }
  const count = px.length / 3;
  if (!count) return [];

  // 4 bits per channel: 4096 bins
  const bins = new Map();
  for (let i = 0; i < count; i++) {
    const key = ((px[i * 3] >> 4) << 8) | ((px[i * 3 + 1] >> 4) << 4) | (px[i * 3 + 2] >> 4);
    let b = bins.get(key);
    if (!b) bins.set(key, (b = [0, 0, 0, 0]));
    b[0] += px[i * 3]; b[1] += px[i * 3 + 1]; b[2] += px[i * 3 + 2]; b[3]++;
  }
  const all = [...bins.values()].map((b) => [b[0] / b[3], b[1] / b[3], b[2] / b[3], b[3]])
    .sort((a, b) => b[3] - a[3]);
  const keep = all.filter((c) => c[3] >= count * 0.01);

  const dist = (a, b) => {
    const rbar = (a[0] + b[0]) * 0.5, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return (2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db;
  };
  const seeds = [(keep[0] || all[0]).slice(0, 3)];
  // significant colours first; if the picture has fewer than n of them,
  // fill the remaining slots from everything, so no slot is left on a
  // stock colour that isn't in the picture at all
  for (const cand of [keep, all]) {
    while (seeds.length < n) {
      let best = null, bestD = -1;
      for (const c of cand) {
        let d = Infinity;
        for (const s of seeds) d = Math.min(d, dist(c, s));
        if (d > bestD) { bestD = d; best = c; }
      }
      if (!best || bestD < 1) break;
      seeds.push(best.slice(0, 3));
    }
  }

  for (let iter = 0; iter < 8; iter++) {
    const acc = seeds.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < count; i++) {
      const q = [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
      let k = 0, kd = Infinity;
      seeds.forEach((s, j) => { const d = dist(q, s); if (d < kd) { kd = d; k = j; } });
      acc[k][0] += q[0]; acc[k][1] += q[1]; acc[k][2] += q[2]; acc[k][3]++;
    }
    acc.forEach((a, j) => { if (a[3]) seeds[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return seeds.sort((a, b) => lum(a) - lum(b)).map(rgbToHex);
}

/** Choose the filament colours that make the *printed* stack look most like
 *  the photo.
 *
 *  importColours finds the photo's own colours, but a stack does not print
 *  its swatches: in translucent mode a light, high-TD filament never gets
 *  opaque within its band, so the top of the stack comes out darker and
 *  greyer than the colour that was picked (a #8DA573 green topped out at a
 *  muddy #6F6F61). Because every tone in the stack is a fixed mix of the
 *  filament colours (lutWeights), the best colours are a small linear
 *  least-squares problem: assign each pixel to its nearest tone, solve for
 *  the colours that bring those tones closest to their pixels, repeat.
 *  Colours are kept inside 0..255, so where the stack simply cannot reach a
 *  tone it gets as close as it can. Solid bands reduce to plain averaging.
 *
 *  Returns hex colours, one per filament (unchanged for a slot with no
 *  layers), starting from `start` (hex list; defaults to the filaments'). */
export function fitFilaments(rgba, mask, filaments, layerHeight, mode = "solid",
                             { start = null, rounds = 8 } = {}) {
  const N = filaments.length;
  const total = rgba.length / 4;
  const stride = Math.max(1, Math.floor(total / 24000));
  const px = [];
  for (let p = 0; p < total; p += stride) {
    if (mask && !mask[p]) continue;
    px.push(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]);
  }
  const count = px.length / 3;
  const colours = (start || filaments.map((f) => f.hex)).map(hexToRgb);
  if (!count || !N) return colours.map(rgbToHex);

  const W = lutWeights(filaments, layerHeight, mode);
  const K = W.length;
  const used = filaments.map((f) => (f.band_layers | 0) > 0);

  for (let round = 0; round < rounds; round++) {
    // the stack's tones for the colours as they stand
    const L = W.map((row) => [0, 1, 2].map((c) => row.reduce((s, wt, i) => s + wt * colours[i][c], 0)));
    // nearest tone per pixel, same metric the solve uses
    const cnt = new Float64Array(K);
    const sum = new Float64Array(K * 3);
    for (let i = 0; i < count; i++) {
      const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2];
      let best = 0, bestD = Infinity;
      for (let k = 0; k < K; k++) {
        const lr = L[k][0], lg = L[k][1], lb = L[k][2];
        const rbar = (r + lr) * 0.5, dr = r - lr, dg = g - lg, db = b - lb;
        const d = (2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db;
        if (d < bestD) { bestD = d; best = k; }
      }
      cnt[best]++; sum[best * 3] += r; sum[best * 3 + 1] += g; sum[best * 3 + 2] += b;
    }
    // normal equations: A = sum cnt[k] w w^T, rhs = sum w * (sum of pixels at k)
    const A = Array.from({ length: N }, () => new Float64Array(N));
    const rhs = [0, 1, 2].map(() => new Float64Array(N));
    for (let k = 0; k < K; k++) {
      if (!cnt[k]) continue;
      const w = W[k];
      for (let i = 0; i < N; i++) {
        if (!w[i]) continue;
        for (let j = 0; j < N; j++) A[i][j] += cnt[k] * w[i] * w[j];
        for (let c = 0; c < 3; c++) rhs[c][i] += w[i] * sum[k * 3 + c];
      }
    }
    // a whisper of pull toward where each colour already is, so a slot the
    // photo barely uses doesn't swing to an extreme
    const ridge = count * 1e-3;
    for (let i = 0; i < N; i++) {
      A[i][i] += ridge;
      for (let c = 0; c < 3; c++) rhs[c][i] += ridge * colours[i][c];
    }
    // box-constrained least squares by projected Gauss-Seidel
    for (let c = 0; c < 3; c++) {
      const x = colours.map((col) => col[c]);
      for (let sweep = 0; sweep < 60; sweep++) {
        for (let i = 0; i < N; i++) {
          if (!used[i]) continue;
          let v = rhs[c][i];
          for (let j = 0; j < N; j++) if (j !== i) v -= A[i][j] * x[j];
          x[i] = Math.min(255, Math.max(0, v / A[i][i]));
        }
      }
      colours.forEach((col, i) => { col[c] = x[i]; });
    }
  }
  return colours.map(rgbToHex);
}
