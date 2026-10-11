// The Prep image pipeline. Port of the desktop's core/imaging.py, which is
// built on Pillow - so each step here reproduces the Pillow operation it
// replaces, down to its fixed-point rounding, and is checked against it.
// Decimate is the exception: Pillow's median cut is approximated.
//
// Order is fixed, as on the desktop:
//   (crop -> resize) -> denoise -> tone -> sharpen -> pixelize -> decimate
//
// Every function takes and returns an ImageData-like { width, height, data }
// with RGBA bytes; alpha is passed through untouched.

export const DEFAULT_ADJUSTMENTS = {
  brightness: 0, contrast: 0, saturation: 0, denoise: 0,
  sharpen: 0,     // 0..1
  pixelize: 0,    // 0..1 -> block size 1..24 px at output resolution
  decimate: 0,    // 0 = off, else number of colours to keep
};

export const PRESETS = {
  poster:    { denoise: 0.45, contrast: 0.12, saturation: 0.08, decimate: 12 },
  painterly: { denoise: 0.70, sharpen: 0.30, saturation: 0.10, decimate: 18 },
  flat:      { denoise: 0.55, contrast: 0.20, decimate: 6 },
  pixel:     { denoise: 0.30, pixelize: 0.35, decimate: 8 },
};

const f32 = Math.fround;

function roundHalfEven(x) {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

const blank = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
const copy = (img) => ({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) });

/** Pillow's RGB -> L: ITU-R 601-2 luma in 16-bit fixed point. */
const luma = (r, g, b) => (r * 19595 + g * 38470 + b * 7471 + 0x8000) >> 16;

// ---------------------------------------------------------------- blend
/** Image.blend(degenerate, img, alpha), per Pillow's Blend.c: truncate
 *  inside 0..1, clip when extrapolating. alpha is a C float, and the
 *  compiler fuses the multiply-add (one rounding, not two) - matching that
 *  is what makes contrast agree to the last pixel. */
function blend(deg, img, alpha) {
  const a = f32(alpha);
  const out = copy(img);
  const d = out.data, s = img.data, g = deg.data;
  const inside = a >= 0 && a <= 1;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const in1 = g[i + c], in2 = s[i + c];
      const t = f32(in1 + a * (in2 - in1));
      d[i + c] = inside ? Math.trunc(t) : t <= 0 ? 0 : t >= 255 ? 255 : Math.trunc(t);
    }
  }
  return out;
}

function solidLike(img, r, g, b) {
  const out = copy(img);
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; }
  return out;
}

function greyLike(img) {
  const out = copy(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = luma(d[i], d[i + 1], d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  return out;
}

/** Each argument is -1..1, where 0 is untouched (ImageEnhance). */
export function tone(img, brightness, contrast, saturation) {
  if (Math.abs(brightness) > 0.001) img = blend(solidLike(img, 0, 0, 0), img, 1 + brightness);
  if (Math.abs(contrast) > 0.001) {
    let sum = 0;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) sum += luma(d[i], d[i + 1], d[i + 2]);
    const mean = Math.trunc(sum / (d.length / 4) + 0.5);
    img = blend(solidLike(img, mean, mean, mean), img, 1 + contrast);
  }
  if (Math.abs(saturation) > 0.001) img = blend(greyLike(img), img, 1 + saturation);
  return img;
}

// ---------------------------------------------------------------- denoise
/** Pillow MedianFilter(size): per channel, edges replicated. A sliding
 *  histogram (Huang) keeps a 9x9 window fast at phone resolution. */
function median(img, size) {
  const { width: w, height: h, data: s } = img;
  const r = size >> 1, rank = (size * size) >> 1;
  const out = copy(img);
  const d = out.data;
  const hist = new Uint16Array(256);
  const cx = (x) => (x < 0 ? 0 : x >= w ? w - 1 : x);
  const cy = (y) => (y < 0 ? 0 : y >= h ? h - 1 : y);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++) {
      hist.fill(0);
      for (let dy = -r; dy <= r; dy++) {
        const row = cy(y + dy) * w;
        for (let dx = -r; dx <= r; dx++) hist[s[(row + cx(dx)) * 4 + c]]++;
      }
      // m = median value, below = count of window values < m
      let m = 0, below = 0;
      while (below + hist[m] <= rank) { below += hist[m]; m++; }
      d[(y * w) * 4 + c] = m;
      for (let x = 1; x < w; x++) {
        const xo = cx(x - r - 1), xi = cx(x + r);
        for (let dy = -r; dy <= r; dy++) {
          const row = cy(y + dy) * w;
          const vo = s[(row + xo) * 4 + c], vi = s[(row + xi) * 4 + c];
          hist[vo]--; if (vo < m) below--;
          hist[vi]++; if (vi < m) below++;
        }
        while (below > rank) { m--; below -= hist[m]; }
        while (below + hist[m] <= rank) { below += hist[m]; m++; }
        d[(y * w + x) * 4 + c] = m;
      }
    }
  }
  return out;
}

/** amount 0..1 -> median radius 0..4, as imaging.denoise (save path). */
export function denoise(img, amount) {
  if (amount <= 0.01) return img;
  const radius = Math.max(1, roundHalfEven(amount * 4));
  return median(img, radius * 2 + 1);
}

// ---------------------------------------------------------------- sharpen
/** Pillow's Gaussian blur: three extended box blurs (BoxBlur.c). */
function gaussianBoxRadius(radius, passes) {
  const sigma2 = f32(f32(radius * radius) / passes);
  const L = f32(Math.sqrt(12.0 * sigma2 + 1.0));
  const l = f32(Math.floor((L - 1.0) / 2.0));
  let a = f32(f32(2 * l + 1) * f32(f32(l * f32(l + 1)) - f32(3 * sigma2)));
  a = f32(a / f32(6 * f32(sigma2 - f32(f32(l + 1) * f32(l + 1)))));
  return f32(l + a);
}

function boxBlurLine(src, dst, n, get, set, floatRadius) {
  const radius = Math.trunc(floatRadius);
  const ww = Math.trunc(f32(16777216 / f32(f32(floatRadius * 2) + 1)));
  const fw = Math.trunc((16777216 - (radius * 2 + 1) * ww) / 2);
  const last = n - 1;
  const edgeA = Math.min(radius + 1, n), edgeB = Math.max(n - radius - 1, 0);
  const at = (i) => src[get(i < 0 ? 0 : i > last ? last : i)];
  let acc = at(0) * (radius + 1);
  for (let x = 0; x < edgeA - 1; x++) acc += at(x);
  acc += at(last) * (radius - edgeA + 1);
  for (let x = 0; x <= last; x++) {
    const sub = x < edgeA ? 0 : x - radius - 1;
    const add = x < edgeB ? x + radius : last;
    acc += at(add) - at(sub);
    const left = x < edgeA ? 0 : x - radius - 1;
    const right = x < edgeB ? x + radius + 1 : last;
    const bulk = acc * ww + (at(left) + at(right)) * fw;
    dst[set(x)] = Math.floor((bulk + 8388608) / 16777216);
  }
}

function gaussianBlur(img, radius) {
  const { width: w, height: h } = img;
  const r = gaussianBoxRadius(radius, 3);
  let cur = new Uint8ClampedArray(img.data);
  const line = new Uint8ClampedArray(Math.max(w, h));
  for (let c = 0; c < 3; c++) {
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) {
        boxBlurLine(cur, line, w, (x) => (y * w + x) * 4 + c, (x) => x, r);
        for (let x = 0; x < w; x++) cur[(y * w + x) * 4 + c] = line[x];
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let x = 0; x < w; x++) {
        boxBlurLine(cur, line, h, (y) => (y * w + x) * 4 + c, (y) => y, r);
        for (let y = 0; y < h; y++) cur[(y * w + x) * 4 + c] = line[y];
      }
    }
  }
  return { width: w, height: h, data: cur };
}

/** UnsharpMask(radius=2, percent=amount*250, threshold=2), as Pillow. */
export function sharpen(img, amount) {
  if (amount <= 0.01) return img;
  const percent = Math.trunc(amount * 250);
  const blurred = gaussianBlur(img, 2);
  const out = copy(img);
  const s = img.data, b = blurred.data, d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = s[i + c] - b[i + c];
      d[i + c] = Math.abs(diff) > 2 ? s[i + c] + Math.trunc(diff * percent / 100) : s[i + c];
    }
  }
  return out;
}

// ---------------------------------------------------------------- pixelize
const PRECISION_BITS = 22;

/** Pillow resample coefficients for the BOX filter (Resample.c). */
function boxCoeffs(inSize, outSize) {
  const scale = inSize / outSize;
  const filterscale = Math.max(1, scale);
  const support = 0.5 * filterscale;
  const out = [];
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    const ss = 1 / filterscale;
    const xmin = Math.max(0, Math.trunc(center - support + 0.5));
    const xmax = Math.min(inSize, Math.trunc(center + support + 0.5)) - xmin;
    const k = [];
    let ww = 0;
    for (let x = 0; x < xmax; x++) {
      const t = (x + xmin - center + 0.5) * ss;
      const wv = t > -0.5 && t <= 0.5 ? 1 : 0;
      k.push(wv); ww += wv;
    }
    const ik = k.map((v) => {
      const p = ww ? v / ww : v;
      return p < 0 ? Math.trunc(-0.5 + p * (1 << PRECISION_BITS)) : Math.trunc(0.5 + p * (1 << PRECISION_BITS));
    });
    out.push({ xmin, k: ik });
  }
  return out;
}

function clip8(v) {
  const s = v >> PRECISION_BITS;
  return s < 0 ? 0 : s > 255 ? 255 : s;
}

function resizeBox(img, w2, h2) {
  const { width: w, height: h, data: s } = img;
  let mid = img;
  if (w2 !== w) {
    const cs = boxCoeffs(w, w2);
    mid = blank(w2, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w2; x++) {
        const { xmin, k } = cs[x];
        for (let c = 0; c < 4; c++) {
          let ss = 1 << (PRECISION_BITS - 1);
          for (let i = 0; i < k.length; i++) ss += s[(y * w + xmin + i) * 4 + c] * k[i];
          mid.data[(y * w2 + x) * 4 + c] = clip8(ss);
        }
      }
    }
  }
  if (h2 === h) return mid;
  const cs = boxCoeffs(h, h2);
  const out = blank(w2, h2);
  for (let y = 0; y < h2; y++) {
    const { xmin, k } = cs[y];
    for (let x = 0; x < w2; x++) {
      for (let c = 0; c < 4; c++) {
        let ss = 1 << (PRECISION_BITS - 1);
        for (let i = 0; i < k.length; i++) ss += mid.data[((xmin + i) * w2 + x) * 4 + c] * k[i];
        out.data[(y * w2 + x) * 4 + c] = clip8(ss);
      }
    }
  }
  return out;
}

/** Pillow NEAREST resize (ImagingScaleAffine): accumulated float steps. */
function nearestTable(inSize, outSize) {
  const a = inSize / outSize;
  const t = new Int32Array(outSize);
  let o = a * 0.5;
  for (let x = 0; x < outSize; x++) {
    t[x] = o < 0 ? -1 : Math.trunc(o);
    o += a;
  }
  return t;
}

function resizeNearest(img, w2, h2) {
  const xt = nearestTable(img.width, w2), yt = nearestTable(img.height, h2);
  const out = blank(w2, h2);
  const s = img.data, d = out.data;
  for (let y = 0; y < h2; y++) {
    const row = yt[y] * img.width;
    for (let x = 0; x < w2; x++) {
      const si = (row + xt[x]) * 4, di = (y * w2 + x) * 4;
      d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
    }
  }
  return out;
}

/** Hard blocks: amount 0..1 -> block 1..24 px. BOX down, NEAREST up. */
export function pixelize(img, amount) {
  const block = roundHalfEven(1 + amount * 23);
  if (block <= 1) return img;
  const w = Math.max(1, Math.floor(img.width / block));
  const h = Math.max(1, Math.floor(img.height / block));
  const small = resizeBox(img, w, h);
  return resizeNearest(resizeNearest(small, w * block, h * block), img.width, img.height);
}

// ---------------------------------------------------------------- decimate
/** Keep `colours` flat tones, no dithering: Pillow's
 *  quantize(MEDIANCUT, kmeans=0), ported from libImaging/Quant.c.
 *
 *  1. Count colours. Past 65536 distinct colours Pillow drops low bits
 *     ("scale") until they fit, and the cut works on those coarse colours.
 *  2. Median cut: a max-heap on pixel count; split along the channel with
 *     the widest luma-weighted range (77/150/29). The high side of the
 *     median goes left. Single-colour boxes leave the heap unsplit.
 *  3. Palette = each box's rounded average over the real pixels.
 *  4. Each colour starts at its box's entry and moves to a strictly closer
 *     entry among those Pillow's distance table lets it consider. */
export function decimate(img, colours) {
  const n = Math.trunc(colours);
  if (n < 2) return img;
  const d = img.data;

  const counts = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let scale = 0;
  const coarseKey = (k, sc) => ((((k >> 16) & 255) >> sc) << 16) | ((((k >> 8) & 255) >> sc) << 8) | ((k & 255) >> sc);
  while (true) {
    if (scale === 0 && counts.size <= 65536) break;
    const seen = new Set();
    for (const k of counts.keys()) seen.add(coarseKey(k, scale));
    if (seen.size <= 65536) break;
    scale++;
  }
  // entries: [r, g, b, count] in coarse units
  const coarse = new Map();
  for (const [k, c] of counts) {
    const ck = coarseKey(k, scale);
    const e = coarse.get(ck);
    if (e) e[3] += c;
    else coarse.set(ck, [(ck >> 16) & 255, (ck >> 8) & 255, ck & 255, c]);
  }

  // ---- median cut
  const box = (list, pixelCount) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const e of list) {
      for (let c = 0; c < 3; c++) { if (e[c] < lo[c]) lo[c] = e[c]; if (e[c] > hi[c]) hi[c] = e[c]; }
    }
    const volume = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
    return { list, pixelCount, lo, hi, volume, l: null, r: null };
  };
  const root = box([...coarse.values()], d.length / 4);

  // QuantHeap.c, 1-based, compare on pixelCount
  const heap = [null];
  const cmp = (a, b) => a.pixelCount - b.pixelCount;
  const heapAdd = (v) => {
    let k = heap.length;
    heap.push(null);
    while (k !== 1) {
      if (cmp(v, heap[k >> 1]) <= 0) break;
      heap[k] = heap[k >> 1];
      k >>= 1;
    }
    heap[k] = v;
  };
  const heapRemove = () => {
    if (heap.length < 2) return null;
    const top = heap[1];
    const v = heap.pop();
    const count = heap.length - 1;
    if (count === 0) return top;
    let k = 1, l;
    for (; k * 2 <= count; k = l) {
      l = k * 2;
      if (l < count && cmp(heap[l], heap[l + 1]) < 0) l++;
      if (cmp(v, heap[l]) > 0) break;
      heap[k] = heap[l];
    }
    heap[k] = v;
    return top;
  };

  const W = [77, 150, 29];
  heapAdd(root);
  let todo = n;
  outer: while (--todo) {
    let node;
    do {
      node = heapRemove();
      if (!node) break outer;
    } while (node.volume === 1);
    let axis = 0, best = (node.hi[0] - node.lo[0]) * W[0];
    for (let c = 1; c < 3; c++) {
      const f = (node.hi[c] - node.lo[c]) * W[c];
      if (best < f) { best = f; axis = c; }
    }
    // high side first; the value where the running count passes half
    const vals = new Map();
    for (const e of node.list) vals.set(e[axis], (vals.get(e[axis]) || 0) + e[3]);
    const desc = [...vals.keys()].sort((a, b) => b - a);
    let run = 0, split = null;
    for (const v of desc) { run += vals.get(v); if (run * 2 > node.pixelCount) { split = v; break; } }
    let leftList = split === null ? node.list.slice() : node.list.filter((e) => e[axis] >= split);
    let rightList = split === null ? [] : node.list.filter((e) => e[axis] < split);
    if (!rightList.length) {
      const tail = desc[desc.length - 1];
      rightList = node.list.filter((e) => e[axis] === tail);
      leftList = node.list.filter((e) => e[axis] !== tail);
    }
    const sum = (list) => list.reduce((t, e) => t + e[3], 0);
    node.l = box(leftList, sum(leftList));
    node.r = box(rightList, sum(rightList));
    node.list = null;
    heapAdd(node.l);
    heapAdd(node.r);
  }

  // ---- leaves -> palette index, left before right
  const boxOf = new Map();   // coarse key -> index
  let nPal = 0;
  (function annotate(node) {
    if (node.l && node.r) { annotate(node.l); annotate(node.r); return; }
    if (!node.list.length) return;
    for (const e of node.list) boxOf.set((e[0] << 16) | (e[1] << 8) | e[2], nPal);
    nPal++;
  })(root);

  const sums = Array.from({ length: nPal }, () => [0, 0, 0, 0]);
  for (const [k, c] of counts) {
    const s = sums[boxOf.get(coarseKey(k, scale))];
    s[0] += ((k >> 16) & 255) * c; s[1] += ((k >> 8) & 255) * c; s[2] += (k & 255) * c; s[3] += c;
  }
  const pal = sums.map((s) => [0, 1, 2].map((c) => Math.trunc(0.5 + s[c] / s[3])));

  // ---- distance tables and nearest-entry mapping
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const avgDist = pal.map((a) => pal.map((b) => dist(a, b)));
  const order = avgDist.map((row) => row.map((v, j) => j)
    .sort((a, b) => (row[a] === row[b] ? a - b : row[a] - row[b])));
  const mapped = new Map();
  for (const k of counts.keys()) {
    const px = [(k >> 16) & 255, (k >> 8) & 255, k & 255];
    const start = boxOf.get(coarseKey(k, scale));
    let bestdist = dist(pal[start], px), bestmatch = start;
    const limit = bestdist * 4;
    for (const idx of order[start]) {
      if (avgDist[start][idx] > limit) break;
      const dd = dist(pal[idx], px);
      if (dd < bestdist) { bestdist = dd; bestmatch = idx; }
    }
    mapped.set(k, pal[bestmatch]);
  }

  const out = copy(img);
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    const col = mapped.get((o[i] << 16) | (o[i + 1] << 8) | o[i + 2]);
    o[i] = col[0]; o[i + 1] = col[1]; o[i + 2] = col[2];
  }
  return out;
}

// ---------------------------------------------------------------- pipeline
/** The post-resize half of imaging.process, i.e. imaging.finish. */
export function finish(img, adjustments) {
  const a = { ...DEFAULT_ADJUSTMENTS, ...(adjustments || {}) };
  img = denoise(img, +a.denoise);
  img = tone(img, +a.brightness, +a.contrast, +a.saturation);
  img = sharpen(img, +a.sharpen);
  img = pixelize(img, +a.pixelize);
  img = decimate(img, +a.decimate);
  return img;
}

export function isIdentity(adjustments) {
  const a = { ...DEFAULT_ADJUSTMENTS, ...(adjustments || {}) };
  return Object.keys(DEFAULT_ADJUSTMENTS).every((k) => !+a[k]);
}

// ---------------------------------------------------------------- suggest
function percentile(sorted, q) {
  const pos = (sorted.length - 1) * q / 100;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Propose adjustments for the painting phase - the same heuristic as the
 *  desktop's imaging.suggest. Expects an image of ~400 px. Returns
 *  { adjustments, reasons }. */
export function suggest(img) {
  const { width: w, height: h, data: d } = img;
  const n = w * h;
  const lum = new Float32Array(n), grey = new Uint8Array(n);
  let satSum = 0, lumSum = 0;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    lum[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += lum[p];
    grey[p] = luma(r, g, b);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    satSum += mx ? ((mx - mn) * 255) / mx : 0;
  }
  const sorted = Float32Array.from(lum).sort();
  const lo = percentile(sorted, 2), hi = percentile(sorted, 98);
  const spread = hi - lo;
  const sat = satSum / n / 255;
  const mean = lumSum / n / 255;

  const out = { ...PRESETS.painterly };
  const why = [];
  if (spread < 110) {
    out.contrast = 0.35;
    why.push(`tonal range is narrow (${Math.trunc(lo)}–${Math.trunc(hi)}); contrast up so bands separate`);
  } else if (spread < 160) {
    out.contrast = 0.18;
    why.push("tonal range is a little narrow; mild contrast");
  }
  if (mean < 0.35) { out.brightness = 0.15; why.push("image is dark; lifted so the light filament has work to do"); }
  else if (mean > 0.72) { out.brightness = -0.10; why.push("image is bright; pulled down a touch"); }
  if (sat < 0.22) { out.saturation = 0.25; why.push("colour is flat; saturation up so hues map to distinct filaments"); }

  // FIND_EDGES: 3x3 kernel, 8 in the middle, -1 around
  let busyCount = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      let v = 8 * grey[p];
      for (const o of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) v -= grey[p + o];
      if (Math.max(0, Math.min(255, v)) > 40) busyCount++;
    }
  }
  if (busyCount / n > 0.18) {
    out.denoise = 0.85;
    out.decimate = 12;
    why.push("lots of fine detail; heavier smoothing and fewer colours");
  } else {
    why.push("smoothed and reduced to a painter's palette");
  }
  return { adjustments: out, reasons: why };
}
