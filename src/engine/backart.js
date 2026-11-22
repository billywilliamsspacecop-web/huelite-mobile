// Art on the back of a print: the plate side, printed in a second filament in
// the first layer or two, so it reads when the print is turned over (like
// turning a card). Same look as the Print-Brick business cards: an inset
// border that follows the outline, topographic lines over the whole back, and
// a title block in the bottom-right corner with the three-bar logo,
// PRINT-BRICK, the print's name, the maker and an email.
//
// renderBack() draws a coverage field (0..1, 1 = back-art filament) as the
// back is SEEN, i.e. after turning the print over left-to-right. backParts()
// mirrors it into model coordinates and extrudes it (outline.js).
//
// Sizes follow what the business-card test prints taught: nothing thinner
// than about 0.6 mm survives the first layer, text under ~3 mm em height
// turns to dots, so text is set large and thickened.

import fontUrl from "../assets/fonts/JetBrainsMono-ExtraBold.woff?url";
import { traceLoops, simplifyLoop, groupLoops, extrude } from "./outline.js";
import { FIRST_LAYER_MM } from "./mesh.js";
import { designCoverage } from "./lineart.js";

export const BACK_DEFAULTS = {
  maker: "Bryce Fimreite",
  email: "printbrick3d@gmail.com",
  brand: "PRINT-BRICK",
};

const LOOK = {
  edge: 1.6,            // outline to the border's outer edge (the first layer spreads; keep off the rim)
  border: 1.0,          // border line width; the title block's frame is the same, so they merge in a corner
  gap: 1.4,             // clear space between topo lines and the border / title block
  lineWidths: [0.6, 0.9, 0.6, 1.4],   // topo lines repeat these by level, like the cards
  spacing: 2.6,         // closest two topo lines may get, mm
  emb: 0.14,            // added round every letter (strokes 0.28 mm thicker)
  minPiece: 0.4,        // mm^2: specks smaller than this are dropped (a hyphen is about 1)
};

// title block, in mm at scale 1
const BLOCK = {
  pad: 2.4,             // frame to contents
  logo: { w: 9.0, barH: 1.7, gap: 0.6, ratios: [309, 273, 237] },
  brand: 3.4, title: 4.4, minTitle: 3.2, maker: 3.6, email: 3.2,   // em heights
  rowGap: 2.0,
  goodScale: 1.125,     // email at 3.6 mm: the smallest that comes out of a first layer cleanly
  minScale: 0.94,       // email at 3.0 mm: only on prints too small for more; smaller printed as dots on the cards
};
const FAMILY = "PB Mono";
const CAP = 0.73, DESC = 0.22;    // JetBrains Mono cap height / descender, in em

let fontReady = null;
/** Load the card font once; falls back to the system monospace. */
export function loadBackFont() {
  if (!fontReady) {
    fontReady = (async () => {
      try {
        const face = new FontFace(FAMILY, `url(${fontUrl})`, { weight: "800" });
        document.fonts.add(await face.load());
        return `800 {px}px "${FAMILY}", monospace`;
      } catch (err) {
        console.warn("back-art font failed, using monospace", err);
        return "bold {px}px monospace";
      }
    })();
  }
  return fontReady;
}

// ---------------------------------------------------------------- helpers
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exact Euclidean distance (in pixels) from every inside pixel to the
 *  nearest outside one; outside the grid counts as outside. */
function distanceInside(inside, w, h) {
  const INF = 1e20;
  const n = Math.max(w, h) + 2;
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const dt = (len) => {         // Felzenszwalb 1-D squared distance transform of f[0..len)
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  // padded by one pixel of "outside" on every side
  const W = w + 2, H = h + 2;
  const g = new Float32Array(W * H);   // squared pixel distances stay exact well past 4000 px
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inGrid = x > 0 && y > 0 && x <= w && y <= h;
    g[y * W + x] = inGrid && inside[(y - 1) * w + (x - 1)] ? INF : 0;
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    dt(H);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    dt(W);
    if (y === 0 || y > h) continue;
    for (let x = 1; x <= w; x++) out[(y - 1) * w + (x - 1)] = Math.sqrt(d[x]);
  }
  return out;
}

/** Topographic height field: a few long waves, a domain warp, and one hill
 *  (the concentric rings on the cards), all seeded from the print's name. */
function topoField(Wmm, Hmm, seed, avoid) {
  const r = rng(seed);
  const span = Math.max(Wmm, Hmm);
  const waves = [];
  for (let i = 0; i < 5; i++) {
    const len = (0.45 + r() * 0.75) * Math.max(60, span);
    const a = r() * Math.PI * 2, k = 2 * Math.PI / len;
    waves.push({ kx: Math.cos(a) * k, ky: Math.sin(a) * k, ph: r() * 6.283, amp: len / 60 });
  }
  const warpK = 2 * Math.PI / (30 + r() * 25), warpA = 4 + r() * 3, wph = r() * 6.283;
  // the hill sits away from the title block (avoid = its centre)
  let hx = Wmm * (0.25 + r() * 0.3), hy = Hmm * (0.3 + r() * 0.35);
  if (avoid && Math.hypot(hx - avoid[0], hy - avoid[1]) < span * 0.3) { hx = Wmm - hx; hy = Hmm - hy; }
  const hr = Math.max(8, span * (0.1 + r() * 0.08)), hamp = span / 9;
  return (x, y) => {
    const wx = x + warpA * Math.sin(y * warpK + wph), wy = y + warpA * Math.sin(x * warpK * 1.3 - wph);
    let s = 0;
    for (const q of waves) s += q.amp * Math.sin(q.kx * wx + q.ky * wy + q.ph);
    const dx = (wx - hx) / hr, dy = (wy - hy) / hr;
    return s + hamp * Math.exp(-(dx * dx + dy * dy) / 2);
  };
}

/** Lay out the title block at scale s; returns its size and a draw(ctx, ox, oy, px) function. */
function layoutBlock({ title, maker, email, brand }, s, measure) {
  const B = BLOCK, frame = LOOK.border;
  const sz = (em) => em * s;
  const L = B.logo, barH = sz(L.barH), barGap = sz(L.gap), logoW = sz(L.w);
  const logoH = 3 * barH + 2 * barGap;
  const brandW = measure(brand, sz(B.brand));
  const lines = [
    { text: maker, em: sz(B.maker) },
    { text: email, em: sz(B.email) },
  ].filter((l) => l.text);
  let innerW = Math.max(logoW + sz(2.2) + brandW, ...lines.map((l) => measure(l.text, l.em)));
  // the title fills the width it is given, shrinking down to minTitle, then is cut short
  let tEm = sz(B.title), tText = title || "";
  while (tText && measure(tText, tEm) > innerW && tEm > sz(B.minTitle)) tEm = Math.max(sz(B.minTitle), tEm - 0.1);
  if (tText && measure(tText, tEm) > innerW) {
    while (tText.length > 1 && measure(tText + "…", tEm) > innerW) tText = tText.slice(0, -1);
    tText = tText.trimEnd() + "…";
  }
  const rows = [{ kind: "head", h: Math.max(logoH, sz(B.brand) * CAP) }];
  if (tText) rows.push({ kind: "text", text: tText, em: tEm, h: tEm * CAP });
  for (const l of lines) rows.push({ kind: "text", ...l, h: l.em * CAP });
  const lastDesc = rows[rows.length - 1].em ? rows[rows.length - 1].em * DESC : 0;
  const pad = sz(B.pad) + frame;
  const innerH = rows.reduce((a, r) => a + r.h, 0) + (rows.length - 1) * sz(B.rowGap) + lastDesc;
  const w = innerW + 2 * pad, h = innerH + 2 * pad;
  return {
    w, h,
    draw(ctx, ox, oy, px, font) {
      const P = (mm) => mm / px;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff";
      ctx.lineJoin = "round"; ctx.lineWidth = P(2 * LOOK.emb);
      // frame
      const fw = P(frame);
      ctx.fillRect(P(ox), P(oy), P(w), fw);
      ctx.fillRect(P(ox), P(oy + h) - fw, P(w), fw);
      ctx.fillRect(P(ox), P(oy), fw, P(h));
      ctx.fillRect(P(ox + w) - fw, P(oy), fw, P(h));
      let y = oy + pad;
      const x = ox + pad;
      for (const r of rows) {
        if (r.kind === "head") {
          const by = y + (r.h - logoH) / 2;
          const maxR = Math.max(...L.ratios);
          L.ratios.forEach((ratio, i) => {
            const bw = logoW * ratio / maxR;
            ctx.fillRect(P(x + (logoW - bw) / 2), P(by + i * (barH + barGap)), P(bw), P(barH));
          });
          ctx.font = font.replace("{px}", P(sz(B.brand)).toFixed(2));
          const base = y + r.h / 2 + sz(B.brand) * CAP / 2;
          ctx.strokeText(brand, P(x + logoW + sz(2.2)), P(base));
          ctx.fillText(brand, P(x + logoW + sz(2.2)), P(base));
        } else {
          ctx.font = font.replace("{px}", P(r.em).toFixed(2));
          ctx.strokeText(r.text, P(x), P(y + r.h));
          ctx.fillText(r.text, P(x), P(y + r.h));
        }
        y += r.h + sz(B.rowGap);
      }
    },
  };
}

/** The back as seen after turning the print over left-to-right.
 *  grid = mesh.modelGrid(...): { cols, rows, cell, inside, widthMm, heightMm }. */
export async function renderBack(grid, { title, maker, email, brand, pattern = "topo", design = "", seed = 0, weight = 1,
                                         info = true, maxPixels = 3e6, minPx = 0.1 }) {
  const font = await loadBackFont();
  const { cols, rows, cell, inside, widthMm: W, heightMm: H } = grid;
  // pixels line up with the mesh cells (a whole number per cell, or cells per
  // pixel), so the carved-out base layers meet the columns above exactly
  const want = Math.max(minPx, Math.sqrt(W * H / maxPixels));
  const px = want < cell ? cell / Math.ceil(cell / want - 1e-9) : cell * Math.ceil(want / cell - 1e-9);
  const w = Math.round(W / px), h = Math.round(H / px);

  // footprint, mirrored: viewer column x is model x = W/2 - x
  const fp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = Math.min(rows - 1, Math.floor((y + 0.5) * px / cell));
    for (let x = 0; x < w; x++) {
      const mx = W - (x + 0.5) * px;
      if (mx < 0) continue;
      const col = Math.min(cols - 1, Math.floor(mx / cell));
      fp[y * w + x] = !inside || inside[row * cols + col] ? 1 : 0;
    }
  }
  const dist = distanceInside(fp, w, h);
  const dmm = (i) => (dist[i] - 0.5) * px;      // to the outline itself, not the nearest outside pixel centre

  // title block: as big as fits (down to minScale), as near the bottom-right corner as fits
  const cvs = document.createElement("canvas").getContext("2d");
  const measure = (text, em) => {
    cvs.font = font.replace("{px}", "100");
    return cvs.measureText(text).width / 100 * em + 2 * LOOK.emb;
  };
  const texts = { title: (title || "").trim(), maker: (maker || "").trim(), email: (email || "").trim(), brand: (brand || "").trim() };
  const region = (x, y) => x >= 0 && y >= 0 && x < w && y < h && dmm(y * w + x) >= LOOK.edge - 0.01;
  // summed-area table of pixels the block may not cover
  const sat = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      run += region(x, y) ? 0 : 1;
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + run;
    }
  }
  const fits = (x0, y0, bw, bh) => {
    const x1 = x0 + bw, y1 = y0 + bh;
    if (x0 < 0 || y0 < 0 || x1 > w || y1 > h) return false;
    const W1 = w + 1;
    return sat[y1 * W1 + x1] - sat[y0 * W1 + x1] - sat[y1 * W1 + x0] + sat[y0 * W1 + x0] === 0;
  };
  const place = (lay) => {
    const bw = Math.ceil(lay.w / px), bh = Math.ceil(lay.h / px);
    const step = Math.max(1, Math.round(0.5 / px));
    let best = null, bestD = Infinity;
    for (let y0 = h - bh; y0 >= 0; y0 -= step) {
      const dy = h - (y0 + bh);
      if (dy * dy >= bestD) break;
      for (let x0 = w - bw; x0 >= 0; x0 -= step) {
        const dx = w - (x0 + bw), d = dx * dx + dy * dy;
        if (d >= bestD) break;
        if (fits(x0, y0, bw, bh)) { best = [x0, y0]; bestD = d; break; }
      }
    }
    if (best) {          // the coarse search steps 0.5 mm: slide it the last pixels into the corner
      for (let moved = true; moved;) {
        moved = false;
        if (fits(best[0] + 1, best[1], bw, bh)) { best[0]++; moved = true; }
        if (fits(best[0], best[1] + 1, bw, bh)) { best[1]++; moved = true; }
      }
    }
    return best;
  };
  // about 56 x 32 mm on a 100 mm print, bigger on big prints; under goodScale only when nothing else fits
  const maxScale = Math.min(1.5, Math.max(BLOCK.goodScale, Math.min(W, H) / 90));
  let block = null, spot = null, scale = maxScale;
  for (; info && scale >= BLOCK.minScale - 1e-9; scale -= 0.04) {
    block = layoutBlock(texts, scale, measure);
    spot = place(block);
    if (spot) break;
  }
  const cramped = info && !spot;
  if (cramped) {           // too small: centre it at the smallest size and let the outline crop it
    scale = BLOCK.minScale;
    block = layoutBlock(texts, scale, measure);
    spot = [Math.round((w - block.w / px) / 2), Math.round((h - block.h / px) / 2)];
  }
  // in a rectangle's corner the block's frame lands on the border, so they read as one line
  // no info block: a keep-out box far off the print, so nothing is kept clear
  const blockRect = info ? [spot[0] * px, spot[1] * px, spot[0] * px + block.w, spot[1] * px + block.h] : [-1e9, -1e9, -1e9, -1e9];

  // field: border + topo, then the block on top
  const field = new Float32Array(w * h);
  const inner = LOOK.edge + LOOK.border + LOOK.gap;
  const keep = blockRect.map((v, i) => v + (i < 2 ? -LOOK.gap : LOOK.gap));
  let topo = null, step = 1, cov = null, thinnest = Infinity;
  if (pattern === "design") {
    // a line-art design (engine/lineart.js), seeded like the topo lines
    ({ cov, thinnest } = designCoverage(design, { w, h, px, widthMm: W, heightMm: H, weight,
      seed: (seed >>> 0) || hashString(texts.title || "print") }));
  } else if (pattern === "topo") {
    thinnest = Math.min(...LOOK.lineWidths) * weight;
    const avoid = [(blockRect[0] + blockRect[2]) / 2, (blockRect[1] + blockRect[3]) / 2];
    // seed 0: the pattern follows the print's name (how it started); otherwise the one picked with "new pattern"
    const fn = topoField(W, H, (seed >>> 0) || hashString(texts.title || "print"), avoid);
    topo = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) topo[y * w + x] = fn((x + 0.5) * px, (y + 0.5) * px);
    // spacing: the steepest 2% of the back sets the level step
    const gs = [];
    for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) {
      const i = y * w + x;
      if (dmm(i) < inner) continue;
      gs.push(Math.hypot(topo[i + 1] - topo[i - 1], topo[i + w] - topo[i - w]) / (2 * px));
    }
    gs.sort((a, b) => a - b);
    const g98 = gs.length ? gs[Math.floor(gs.length * 0.98)] : 1;
    step = LOOK.spacing * Math.max(1, weight) * g98;    // heavier lines need more room or they merge
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = dmm(i);
      if (d <= LOOK.edge - px) continue;
      let c = clamp01((Math.min(d - LOOK.edge, LOOK.edge + LOOK.border - d)) / px + 0.5);
      if (topo && d > inner - px && x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        const mx = (x + 0.5) * px, my = (y + 0.5) * px;
        const out = Math.max(keep[0] - mx, mx - keep[2], keep[1] - my, my - keep[3]);  // > 0 outside the keep-out box
        if (out > -px) {
          const gx = (topo[i + 1] - topo[i - 1]) / (2 * px), gy = (topo[i + w] - topo[i - w]) / (2 * px);
          const g = Math.hypot(gx, gy);
          if (g > 1e-9) {
            const t = topo[i] / step, n = Math.round(t);
            const lw = LOOK.lineWidths[((n % 4) + 4) % 4] * weight;
            const along = Math.abs(t - n) * step / g;       // mm to the nearest level line
            let tc = clamp01((lw / 2 - along) / px + 0.5);
            tc *= clamp01((d - inner) / px + 0.5) * clamp01(out / px + 0.5);
            if (tc > c) c = tc;
          }
        }
      }
      if (cov && cov[i] > 0 && d > inner - px) {
        const mx = (x + 0.5) * px, my = (y + 0.5) * px;
        const out = Math.max(keep[0] - mx, mx - keep[2], keep[1] - my, my - keep[3]);
        const tc = cov[i] * clamp01((d - inner) / px + 0.5) * clamp01(out / px + 0.5);
        if (tc > c) c = tc;
      }
      field[i] = c;
    }
  }
  if (!info) return { field, fp, w, h, px, widthMm: W, heightMm: H, scale: 1, cramped: false, small: false, thinnest };
  // the title block replaces whatever is under it
  const bwPx = Math.ceil(block.w / px) + 2, bhPx = Math.ceil(block.h / px) + 2;
  const canvas = document.createElement("canvas");
  canvas.width = bwPx; canvas.height = bhPx;
  const ctx = canvas.getContext("2d");
  block.draw(ctx, 0, 0, px, font);
  const img = ctx.getImageData(0, 0, bwPx, bhPx).data;
  const ox = spot[0], oy = spot[1];
  const bwIn = Math.round(block.w / px), bhIn = Math.round(block.h / px);
  for (let y = 0; y < bhIn; y++) for (let x = 0; x < bwIn; x++) {
    const X = ox + x, Y = oy + y;
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    const i = Y * w + X;
    const edgeFade = clamp01((dmm(i) - LOOK.edge) / px + 0.5);
    field[i] = (img[(y * bwPx + x) * 4 + 3] / 255) * edgeFade;
  }
  return { field, fp, w, h, px, widthMm: W, heightMm: H, scale, cramped, small: scale < BLOCK.goodScale - 1e-9, thinnest };
}

/** A fresh pattern number for "new pattern" (never 0, which means "from the name"). */
export function newBackSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] || 1;
}

/** Back art as seen when the print is turned over, in the two filament
 *  colours. bg = null leaves outside the outline transparent (3D view). */
export function backPreview(art, baseHex, artHex, bg = [17, 17, 16]) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = rgb(baseHex), a = rgb(artHex);
  const img = new ImageData(art.w, art.h);
  const d = img.data;
  for (let i = 0; i < art.field.length; i++) {
    const o = i * 4;
    if (!art.fp[i]) {
      if (bg) { d[o] = bg[0]; d[o + 1] = bg[1]; d[o + 2] = bg[2]; d[o + 3] = 255; }
      continue;
    }
    const t = art.field[i] >= 0.5 ? 1 : 0;        // what the slicer will see
    for (let k = 0; k < 3; k++) d[o + k] = b[k] + (a[k] - b[k]) * t;
    d[o + 3] = 255;
  }
  return img;
}

/** Layer count -> thickness: the 0.2 mm first layer plus (layers - 1) layers. */
export const backDepthMm = (layers, layerH) => FIRST_LAYER_MM + Math.max(0, layers - 1) * layerH;

/** The first depthMm of the print as two mesh parts that fit together: the
 *  base filament with the art cut out of it, and the art. Mirrored into
 *  model coordinates. buildModel({ bottomMm: depthMm }) starts the columns
 *  above them, so nothing overlaps and the same geometry works in a 3MF and
 *  in a one-colour STL. */
export function backParts(art, { depthMm, slot, baseSlot }) {
  const { px, widthMm: W, heightMm: H } = art;
  // traced points are in pixel-edge units (pixel i spans i..i+1), so x * px is mm from the left
  const { artMesh, restMesh } = splitParts(art, (x, y) => [W / 2 - x * px, H / 2 - y * px], 0, depthMm, true);
  return [
    { name: "Base, first layers", extruder: baseSlot, mesh: restMesh },
    { name: "Back art", extruder: slot, mesh: artMesh },
  ];
}

/** The art (field >= 0.5) and, with rest, the footprint (fp) minus the art,
 *  each extruded z0..z1. Specks are dropped from the art first, so the rest
 *  fills where they were. */
function splitParts(art, toModel, z0, z1, rest) {
  const { px, w, h, field, fp } = art;
  const loops = traceLoops(field, w, h).map((l) => simplifyLoop(l, 0.25));   // eps in pixels
  const artPolys = groupLoops(loops, LOOK.minPiece / (px * px));
  const artMesh = extrude(artPolys, z0, z1, toModel);
  if (!rest) return { artMesh, restMesh: null };
  const kept = rasterKeep(artPolys, field, w, h);
  const left = new Float32Array(w * h);
  for (let i = 0; i < left.length; i++) left[i] = fp[i] ? 1 - kept[i] : 0;
  const restLoops = traceLoops(left, w, h).map((l) => simplifyLoop(l, 0.25));
  return { artMesh, restMesh: extrude(groupLoops(restLoops, 0.01 / (px * px)), z0, z1, toModel) };
}

// ---------------------------------------------------------------- art border
// A band round the print (in place of the rim) with the back's design on its
// top face, seen from the front, so it is not mirrored.

/** A pattern's line coverage (0..1, 1 = ink) on a w x h grid of px-mm pixels
 *  covering widthMm x heightMm, as seen from the front. Returns { cov, thinnest }. */
export function patternCoverage(pattern, { w, h, px, widthMm: W, heightMm: H, design = "", seed = 0, weight = 1, title = "" }) {
  const s = (seed >>> 0) || hashString(title || "print");
  if (pattern === "design") return designCoverage(design, { w, h, px, widthMm: W, heightMm: H, weight, seed: s });
  const cov = new Float32Array(w * h);
  if (pattern !== "topo") return { cov, thinnest: Infinity };
  // the same contour lines as the back, without the title block to avoid
  const fn = topoField(W, H, s, null);
  const topo = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) topo[y * w + x] = fn((x + 0.5) * px, (y + 0.5) * px);
  const gs = [];
  for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) {
    const i = y * w + x;
    gs.push(Math.hypot(topo[i + 1] - topo[i - 1], topo[i + w] - topo[i - w]) / (2 * px));
  }
  gs.sort((a, b) => a - b);
  const g98 = gs.length ? gs[Math.floor(gs.length * 0.98)] : 1;
  const step = LOOK.spacing * Math.max(1, weight) * g98;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const g = Math.hypot((topo[i + 1] - topo[i - 1]) / (2 * px), (topo[i + w] - topo[i - w]) / (2 * px));
    if (g <= 1e-9) continue;
    const t = topo[i] / step, n = Math.round(t);
    const lw = LOOK.lineWidths[((n % 4) + 4) % 4] * weight;
    cov[i] = clamp01((lw / 2 - Math.abs(t - n) * step / g) / px + 0.5);
  }
  return { cov, thinnest: Math.min(...LOOK.lineWidths) * weight };
}

/** The art border's top face: the pattern clipped to the ring cells of
 *  grid = mesh.modelGrid({ ..., ring }). Pixels split the cells evenly so
 *  the parts meet the columns exactly. */
export function renderRingTop(grid, { pattern, design = "", seed = 0, weight = 1, title = "", maxPixels = 3e6, minPx = 0.1 }) {
  const { cols, rows, cell, ring, widthMm: W, heightMm: H } = grid;
  const want = Math.max(minPx, Math.sqrt(W * H / maxPixels));
  const px = cell / Math.max(1, Math.ceil(cell / want - 1e-9));
  const w = Math.round(W / px), h = Math.round(H / px);
  const fp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = Math.min(rows - 1, Math.floor((y + 0.5) * px / cell));
    for (let x = 0; x < w; x++) {
      const col = Math.min(cols - 1, Math.floor((x + 0.5) * px / cell));
      fp[y * w + x] = ring && ring[row * cols + col] ? 1 : 0;
    }
  }
  const { cov, thinnest } = patternCoverage(pattern, { w, h, px, widthMm: W, heightMm: H, design, seed, weight, title });
  const field = new Float32Array(w * h);
  for (let i = 0; i < field.length; i++) field[i] = fp[i] ? cov[i] : 0;
  return { field, fp, w, h, px, widthMm: W, heightMm: H, thinnest };
}

/** Mesh parts for the art border's pattern, z0..z1 in model mm. Inlaid
 *  (restSlot given): the pattern and the rest of the ring's top, which fit
 *  together. Raised: the pattern alone, standing on the ring. */
export function ringParts(art, { z0, z1, slot, restSlot = null }) {
  const { px, widthMm: W, heightMm: H } = art;
  const { artMesh, restMesh } = splitParts(art, (x, y) => [x * px - W / 2, H / 2 - y * px], z0, z1, restSlot != null);
  const parts = [{ name: "Art border pattern", extruder: slot, mesh: artMesh }];
  if (restMesh) parts.unshift({ name: "Art border top", extruder: restSlot, mesh: restMesh });
  return parts.filter((p) => p.mesh.triangles.length);
}

/** The art field with dropped specks zeroed: a pixel keeps its value only if
 *  it lies inside a kept polygon's outer loop (or is clear art far from any
 *  edge). Cheap: scanline-fill the kept outers. */
function rasterKeep(polys, field, w, h) {
  const inKept = new Uint8Array(w * h);
  for (const { outer } of polys) {
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of outer) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
        const [xi, yi] = outer[i], [xj, yj] = outer[j];
        if ((yi > yc) !== (yj > yc)) xs.push(xi + (yc - yi) * (xj - xi) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // widen by a pixel so the edge pixels (partial coverage) are kept too
        for (let x = Math.max(0, Math.floor(xs[k] - 1)); x <= Math.min(w - 1, Math.ceil(xs[k + 1])); x++) inKept[y * w + x] = 1;
      }
    }
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = inKept[i] ? field[i] : 0;
  return out;
}
