// Touch crop tool. Works in "oriented" pixel space: the source photo after
// rotate/flip, which is the same space the desktop's prep.crop uses.

const MIN_CROP_PX = 64;
const CROP_PAD_PX = 18;        // keep in sync with .crop-wrap padding
const MAX_HEIGHT_FRAC = 0.4;   // fallback when the host has no height of its own yet

export const ASPECTS = [
  { key: "free", label: "free", ratio: null },
  { key: "1:1", label: "1:1", ratio: 1 },
  { key: "4:5", label: "4:5", ratio: 4 / 5 },
  { key: "3:2", label: "3:2", ratio: 3 / 2 },
];

/** Rotate (multiples of 90) and optionally mirror a bitmap into a canvas. */
export function orient(bitmap, rotateDeg, flipH) {
  const rot = ((rotateDeg % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const w = swap ? bitmap.height : bitmap.width;
  const h = swap ? bitmap.width : bitmap.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  if (flipH) ctx.scale(-1, 1);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return c;
}

/** Largest centred rect of the given ratio (w/h) inside w x h. */
function fitRect(w, h, ratio) {
  if (!ratio) return { x: 0, y: 0, w, h };
  let cw = w, ch = w / ratio;
  if (ch > h) { ch = h; cw = h * ratio; }
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}

export function createCropper(container, bitmap, { rotateDeg = 0, flipH = false,
                                                    crop = null, onChange = () => {} } = {}) {
  let rotate = rotateDeg, flip = flipH, aspect = null;
  let oriented = orient(bitmap, rotate, flip);
  let rect = crop ? { x: crop[0], y: crop[1], w: crop[2], h: crop[3] }
                  : fitRect(oriented.width, oriented.height, null);

  container.innerHTML = "";
  // wrap = padded black frame (room for the corner handles);
  // stage = exactly the size of the drawn image, holds the crop box.
  const wrap = document.createElement("div");
  wrap.className = "crop-wrap";
  const stage = document.createElement("div");
  stage.className = "crop-stage";
  const canvas = document.createElement("canvas");
  const box = document.createElement("div");
  box.className = "crop-box";
  // Shape preview: whatever won't print is checkered out, inside the crop.
  const overlay = document.createElement("canvas");
  overlay.className = "crop-overlay";
  box.appendChild(overlay);
  let painter = null;
  let paintTimer = 0;
  for (const k of ["nw", "ne", "sw", "se"]) {
    const hnd = document.createElement("div");
    hnd.className = `handle ${k}`;
    hnd.dataset.corner = k;
    box.appendChild(hnd);
  }
  stage.append(canvas, box);
  wrap.append(stage);
  container.appendChild(wrap);

  const scale = () => canvas.clientWidth / oriented.width; // css px per image px

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const pad = 2 * CROP_PAD_PX;
    // the pane the crop lives in decides how much room there is
    const availW = Math.max(80, (wrap.clientWidth || 300) - pad);
    const availH = Math.max(80, (wrap.clientHeight || window.innerHeight * MAX_HEIGHT_FRAC) - pad);
    const ratio = oriented.height / oriented.width;
    let cssW = availW, cssH = cssW * ratio;
    if (cssH > availH) { cssH = availH; cssW = cssH / ratio; } // tall photos: fit height
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(oriented, 0, 0, canvas.width, canvas.height);
    place();
    repaint();
  }

  function place() {
    const s = scale();
    box.style.left = `${rect.x * s}px`;
    box.style.top = `${rect.y * s}px`;
    box.style.width = `${rect.w * s}px`;
    box.style.height = `${rect.h * s}px`;
  }

  function clampRect(r) {
    const W = oriented.width, H = oriented.height;
    r.w = Math.min(Math.max(r.w, MIN_CROP_PX), W);
    r.h = Math.min(Math.max(r.h, MIN_CROP_PX), H);
    r.x = Math.min(Math.max(r.x, 0), W - r.w);
    r.y = Math.min(Math.max(r.y, 0), H - r.h);
    return r;
  }

  function repaint() {
    clearTimeout(paintTimer);
    paintTimer = setTimeout(() => {
      const img = painter ? painter(oriented, api.getCrop()) : null;
      overlay.hidden = !img;
      if (!img) return;
      overlay.width = img.width;
      overlay.height = img.height;
      overlay.getContext("2d").drawImage(img, 0, 0);
    }, 60);
  }

  function changed() {
    place();
    onChange(api.getCrop());
    repaint();
  }

  // ---- gestures ----
  let drag = null;
  wrap.addEventListener("pointerdown", (e) => {
    const corner = e.target.dataset?.corner;
    const onBox = e.target === box || corner;
    if (!onBox) return;
    e.preventDefault();
    wrap.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, corner, sx: e.clientX, sy: e.clientY, start: { ...rect } };
  });

  wrap.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const s = scale();
    const dx = (e.clientX - drag.sx) / s;
    const dy = (e.clientY - drag.sy) / s;
    const st = drag.start;
    if (!drag.corner) {
      rect = clampRect({ ...st, x: st.x + dx, y: st.y + dy });
      return changed();
    }
    // Resize from a corner, keeping the opposite corner pinned.
    const W = oriented.width, H = oriented.height;
    const left = drag.corner.includes("w"), top = drag.corner.includes("n");
    const ax = left ? st.x + st.w : st.x; // anchor (fixed corner)
    const ay = top ? st.y + st.h : st.y;
    let px = (left ? st.x : st.x + st.w) + dx;
    let py = (top ? st.y : st.y + st.h) + dy;
    px = Math.min(Math.max(px, 0), W);
    py = Math.min(Math.max(py, 0), H);
    let w = Math.max(MIN_CROP_PX, Math.abs(px - ax));
    let h = Math.max(MIN_CROP_PX, Math.abs(py - ay));
    if (aspect) {
      // Follow whichever axis the finger moved further along, then fit
      // inside the room available on the anchor's side.
      if (w / h > aspect) h = w / aspect; else w = h * aspect;
      const maxW = left ? ax : W - ax;
      const maxH = top ? ay : H - ay;
      if (w > maxW) { w = maxW; h = w / aspect; }
      if (h > maxH) { h = maxH; w = h * aspect; }
    }
    rect = clampRect({ x: left ? ax - w : ax, y: top ? ay - h : ay, w, h });
    changed();
  });

  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  wrap.addEventListener("pointerup", end);
  wrap.addEventListener("pointercancel", end);

  const ro = new ResizeObserver(() => draw());
  ro.observe(wrap);
  const onWindow = () => draw();
  window.addEventListener("resize", onWindow);

  const api = {
    setAspect(ratio) {
      aspect = ratio;
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      const fit = fitRect(oriented.width, oriented.height, ratio);
      if (ratio) {
        // Keep roughly the current size and centre, at the new ratio.
        let w = Math.min(rect.w, fit.w), h = w / ratio;
        if (h > fit.h) { h = fit.h; w = h * ratio; }
        rect = clampRect({ x: cx - w / 2, y: cy - h / 2, w, h });
      }
      changed();
    },
    setOrientation(rotateDeg, flipH) {
      rotate = rotateDeg; flip = flipH;
      oriented = orient(bitmap, rotate, flip);
      rect = fitRect(oriented.width, oriented.height, aspect);
      draw();
      onChange(api.getCrop());
    },
    reset() {
      rect = fitRect(oriented.width, oriented.height, aspect);
      changed();
    },
    /** painter(orientedCanvas, [x, y, w, h]) -> canvas to stretch over the
     *  crop box, or null for no overlay. */
    setOverlay(fn) { painter = fn; repaint(); },
    refreshOverlay() { repaint(); },
    /** The rotated/flipped source the crop is measured against. */
    oriented() { return oriented; },
    getCrop() {
      return [rect.x, rect.y, rect.w, rect.h].map(Math.round);
    },
    /** Cropped result scaled so its long edge is `longEdge` px. */
    output(longEdge) {
      const [x, y, w, h] = api.getCrop();
      const k = longEdge / Math.max(w, h);
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(w * Math.min(k, 1)));
      out.height = Math.max(1, Math.round(h * Math.min(k, 1)));
      const ctx = out.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(oriented, x, y, w, h, 0, 0, out.width, out.height);
      return out;
    },
    /** Re-measure after the layout around the crop changed. */
    relayout() { draw(); },
    destroy() {
      clearTimeout(paintTimer);
      ro.disconnect();
      window.removeEventListener("resize", onWindow);
      container.innerHTML = "";
    },
  };
  draw();
  return api;
}

/** Decode a picked file, honouring EXIF orientation, and cap its size so
 *  iOS's canvas area limit (~16.7 MP) is never hit by 48 MP photos. */
export async function loadPhoto(file, maxEdge = 4096) {
  const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
  const long = Math.max(probe.width, probe.height);
  if (long <= maxEdge) return probe;
  const k = maxEdge / long;
  const bmp = await createImageBitmap(file, {
    imageOrientation: "from-image",
    resizeWidth: Math.round(probe.width * k),
    resizeHeight: Math.round(probe.height * k),
    resizeQuality: "high",
  });
  probe.close();
  return bmp;
}
