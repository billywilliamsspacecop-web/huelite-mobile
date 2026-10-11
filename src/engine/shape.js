// The print's outline. Port of the desktop's core/shape.py.
//
// A mask is a Uint8Array (1 = print here) the size of the prepped image.
// null means the plain crop rectangle, exactly like a missing shape.png
// on the desktop.
//
//   rect      the whole crop
//   ellipse   circle / oval inscribed in the crop
//   alpha     the image's own transparency (PNG cut-outs, stickers)
//   knockout  remove the background colour: pixels close to the colour
//             around the edge of the crop, and connected to that edge

export const MODES = ["rect", "ellipse", "alpha", "knockout"];
export const MODE_LABELS = {
  rect: "rectangle",
  ellipse: "circle / oval",
  alpha: "transparent cut-out",
  knockout: "knock out background",
};
export const DEFAULT_SHAPE = { mode: "rect", tolerance: 0.25, min_feature_mm: 0.8 };

// ---------------------------------------------------------------- morphology
// Octagonal disc from alternating 3x3 cross and square steps. Outside the
// image counts as empty, so a shape touching the crop edge is eroded from
// that edge too (the rim wants exactly that).
function step(m, w, h, grow, square) {
  // Pad by one so every pixel has eight neighbours; the pad is empty.
  const pw = w + 2;
  const p = new Uint8Array(pw * (h + 2));
  for (let y = 0; y < h; y++) p.set(m.subarray(y * w, y * w + w), (y + 1) * pw + 1);
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    let j = (y + 1) * pw + 1;
    let i = y * w;
    for (let x = 0; x < w; x++, i++, j++) {
      let v;
      if (grow) {
        v = p[j] | p[j - 1] | p[j + 1] | p[j - pw] | p[j + pw];
        if (square) v |= p[j - pw - 1] | p[j - pw + 1] | p[j + pw - 1] | p[j + pw + 1];
      } else {
        v = p[j] & p[j - 1] & p[j + 1] & p[j - pw] & p[j + pw];
        if (square) v &= p[j - pw - 1] & p[j - pw + 1] & p[j + pw - 1] & p[j + pw + 1];
      }
      out[i] = v;
    }
  }
  return out;
}

export function erode(m, w, h, r) {
  let out = m;
  for (let i = 0; i < r; i++) out = step(out, w, h, false, i % 2 === 1);
  return out === m ? m.slice() : out;
}

export function dilate(m, w, h, r) {
  let out = m;
  for (let i = 0; i < r; i++) out = step(out, w, h, true, i % 2 === 1);
  return out === m ? m.slice() : out;
}

/** The band of the shape within widthPx of its outline. */
export function rim(m, w, h, widthPx) {
  const inner = erode(m, w, h, widthPx);
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = m[i] && !inner[i] ? 1 : 0;
  return out;
}

// ---------------------------------------------------------------- source
/** True if any pixel is meaningfully see-through. */
export function hasAlpha(data) {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

/** Fill transparent pixels with the mean opaque colour, in place, and make
 *  everything opaque. The colour under a transparent pixel is usually
 *  black or junk and would otherwise bleed into the edge and the colour
 *  import. */
export function flatten(imageData) {
  const d = imageData.data;
  let r = 0, g = 0, b = 0, wsum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    r += d[i] * a; g += d[i + 1] * a; b += d[i + 2] * a; wsum += a;
  }
  if (wsum < 1) { for (let i = 3; i < d.length; i += 4) d[i] = 255; return imageData; }
  r /= wsum; g /= wsum; b /= wsum;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    d[i] = d[i] * a + r * (1 - a);
    d[i + 1] = d[i + 1] * a + g * (1 - a);
    d[i + 2] = d[i + 2] * a + b * (1 - a);
    d[i + 3] = 255;
  }
  return imageData;
}

// ---------------------------------------------------------------- builders
export function ellipseMask(w, h) {
  // 4x4 supersampled so small previews don't get a jagged edge
  const m = new Uint8Array(w * h);
  const rx = w / 2, ry = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy++) {
        const dy = (y + (sy + 0.5) / 4 - ry) / ry;
        for (let sx = 0; sx < 4; sx++) {
          const dx = (x + (sx + 0.5) / 4 - rx) / rx;
          if (dx * dx + dy * dy <= 1) hits++;
        }
      }
      m[y * w + x] = hits >= 8 ? 1 : 0;
    }
  }
  return m;
}

/** 0..1, roughly perceptual (redmean), 1 = black vs white. */
function colourDistance(r, g, b, ref) {
  const rbar = (r + ref[0]) * 0.5;
  const dr = r - ref[0], dg = g - ref[1], db = b - ref[2];
  return Math.sqrt((2 + rbar / 256) * dr * dr + 4 * dg * dg
                   + (2 + (255 - rbar) / 256) * db * db) / 765;
}

function median(arr) {
  const s = Float32Array.from(arr).sort();
  return s[s.length >> 1];
}

export function backgroundColour(d, w, h) {
  const ch = [[], [], []];
  const take = (x, y) => { const i = (y * w + x) * 4; for (let c = 0; c < 3; c++) ch[c].push(d[i + c]); };
  for (let x = 0; x < w; x++) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y++) { take(0, y); take(w - 1, y); }
  return ch.map(median);
}

/** 1 where the subject is. Background = close to the frame colour AND
 *  connected to the frame, so a white eye inside a white-backed sticker
 *  is kept. A plain flood fill is fast enough at phone resolution. */
export function knockoutMask(imageData, tolerance) {
  const { data: d, width: w, height: h } = imageData;
  const ref = backgroundColour(d, w, h);
  const thresh = 0.04 + Math.min(1, Math.max(0, tolerance)) * 0.36;
  const bgLike = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    bgLike[p] = colourDistance(d[i], d[i + 1], d[i + 2], ref) < thresh ? 1 : 0;
  }
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const seed = (p) => { if (bgLike[p] && !bg[p]) { bg[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < w * (h - 1)) seed(p + w);
  }
  const m = new Uint8Array(w * h);
  for (let p = 0; p < m.length; p++) m[p] = bg[p] ? 0 : 1;
  return m;
}

/** Opening then closing: trims specks and hairline slivers too thin to
 *  print, and fills pinholes the same size. Never grows the shape. */
export function clean(m, w, h, pxPerMm, minFeatureMm) {
  const r = Math.round(Math.max(0, minFeatureMm) * pxPerMm / 2);
  if (r < 1) return m;
  const opened = dilate(erode(m, w, h, r), w, h, r);
  for (let i = 0; i < m.length; i++) opened[i] = opened[i] && m[i] ? 1 : 0;
  const closed = erode(dilate(opened, w, h, r), w, h, r);
  for (let i = 0; i < m.length; i++) closed[i] = closed[i] || opened[i] ? 1 : 0;
  return closed;
}

/** Mask for an RGBA ImageData (cropped, sized, before any flattening), or
 *  null for a plain rectangle. */
export function build(mode, imageData, { tolerance = DEFAULT_SHAPE.tolerance, pxPerMm = 6,
                                         minFeatureMm = DEFAULT_SHAPE.min_feature_mm } = {}) {
  const { width: w, height: h, data: d } = imageData;
  let m;
  if (mode === "ellipse") return ellipseMask(w, h);
  if (mode === "alpha") {
    if (!hasAlpha(d)) return null;
    m = new Uint8Array(w * h);
    for (let p = 0; p < m.length; p++) m[p] = d[p * 4 + 3] >= 128 ? 1 : 0;
  } else if (mode === "knockout") {
    m = knockoutMask(imageData, tolerance);
  } else {
    return null;
  }
  return clean(m, w, h, pxPerMm, minFeatureMm);
}

export function coverage(m) {
  if (!m) return 1;
  let n = 0;
  for (let i = 0; i < m.length; i++) n += m[i];
  return n / m.length;
}

/** Nearest-neighbour resample, for the live-solve proxy. */
export function resize(m, w, h, w2, h2) {
  if (!m) return null;
  const out = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    const sy = Math.min(h - 1, Math.floor((y + 0.5) * h / h2));
    for (let x = 0; x < w2; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) * w / w2));
      out[y * w2 + x] = m[sy * w + sx];
    }
  }
  return out;
}
