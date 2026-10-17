// Touch-first controls: a slider that only moves when you grab its knob,
// a scroll rail you can drag or tap, and an in-app colour picker.
//
// Why not the browser's own: a native <input type=range> takes any finger
// drag that starts on it, so scrolling a page of sliders with a thumb
// changed values all over the place. These controls only react to a
// deliberate grab, and everything else on the page scrolls normally.

import { h } from "./dom.js";
import { COMMON, hexToRgb, hsvToRgb, isHex, rgbToHsv, toHex } from "./colour.js";

// ---------------------------------------------------------------- slider
/** Returns a row: [-] track with knob [+]. Only the knob drags; the -/+
 *  buttons step (hold to repeat); a finger swiping across the track just
 *  scrolls the page. row.get() / row.set(v, emit = false) for code. */
export function slider({ min, max, step = 1, value, onInput, track = "" }) {
  const range = max - min;
  const stepBtn = Math.max(step, Math.round(range / 40));
  let v = Math.min(max, Math.max(min, value));

  const fill = h("div", { class: "slider-fill" });
  const knob = h("div", { class: "slider-knob", role: "slider", tabindex: "0",
    "aria-valuemin": String(min), "aria-valuemax": String(max) }, h("i"));
  const bar = h("div", { class: `slider-track${track ? " plain" : ""}`, style: track ? `background:${track}` : null }, fill);
  const el = h("div", { class: "slider" }, bar, knob);

  const snap = (x) => Math.min(max, Math.max(min, Math.round((x - min) / step) * step + min));
  const paint = () => {
    const pct = range ? ((v - min) / range) * 100 : 0;
    fill.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    knob.setAttribute("aria-valuenow", String(v));
  };
  const set = (nv, emit = true) => {
    nv = snap(nv);
    if (nv === v) return;
    v = nv;
    paint();
    if (emit) onInput?.(v);
  };

  let drag = null;
  knob.addEventListener("pointerdown", (e) => {
    knob.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, v };
    knob.classList.add("held");
    e.preventDefault();
  });
  knob.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    set(drag.v + ((e.clientX - drag.x) / Math.max(1, el.clientWidth)) * range);
  });
  const end = (e) => {
    if (drag && e.pointerId === drag.id) { drag = null; knob.classList.remove("held"); }
  };
  knob.addEventListener("pointerup", end);
  knob.addEventListener("pointercancel", end);
  knob.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step,
                PageDown: -stepBtn, PageUp: stepBtn }[e.key];
    if (k) { set(v + k); e.preventDefault(); }
    else if (e.key === "Home") { set(min); e.preventDefault(); }
    else if (e.key === "End") { set(max); e.preventDefault(); }
  });

  /** - / + : a step on tap, and repeating if held still for a moment. */
  const stepper = (dir, label) => {
    let hold = 0, rep = 0, repeated = false;
    const stop = () => { clearTimeout(hold); clearInterval(rep); };
    const b = h("button", { class: "slider-step", "aria-label": label, type: "button",
      onpointerdown: () => {
        repeated = false;
        hold = setTimeout(() => { repeated = true; rep = setInterval(() => set(v + dir * stepBtn), 70); }, 450);
      },
      onpointerup: stop, onpointercancel: stop, onpointerleave: stop,
      onclick: () => { if (!repeated) set(v + dir * stepBtn); repeated = false; } }, dir < 0 ? "−" : "+");
    return b;
  };

  const row = h("div", { class: "slider-row" }, stepper(-1, "decrease"), el, stepper(1, "increase"));
  row.get = () => v;
  row.set = (nv, emit = false) => set(nv, emit);
  paint();
  return row;
}

// ---------------------------------------------------------------- scroll rail
/** A scroll bar made for thumbs, down the right-hand edge of `scroller`:
 *  drag the thumb, tap the track to page, or tap the arrows. `host` must be
 *  position:relative and contain the scroller. */
export function attachRail(scroller, host) {
  const thumb = h("div", { class: "rail-thumb" });
  const track = h("div", { class: "rail-track" }, thumb);
  const up = h("button", { class: "rail-btn", type: "button", "aria-label": "scroll up",
    onclick: () => scroller.scrollBy({ top: -scroller.clientHeight * 0.6, behavior: "smooth" }) }, "▲");
  const down = h("button", { class: "rail-btn", type: "button", "aria-label": "scroll down",
    onclick: () => scroller.scrollBy({ top: scroller.clientHeight * 0.6, behavior: "smooth" }) }, "▼");
  const rail = h("div", { class: "rail", hidden: true }, up, track, down);
  host.append(rail);

  const geometry = () => {
    const sh = scroller.scrollHeight, ch = scroller.clientHeight;
    const th = track.clientHeight;
    const tH = Math.min(th, Math.max(48, th * ch / Math.max(1, sh)));
    return { sh, ch, th, tH, travel: Math.max(1, th - tH), span: Math.max(1, sh - ch) };
  };

  const update = () => {
    const sh = scroller.scrollHeight, ch = scroller.clientHeight;
    const over = sh > ch + 2;
    rail.hidden = !over;
    if (!over) return;
    rail.style.top = `${scroller.offsetTop}px`;
    rail.style.height = `${ch}px`;
    const g = geometry();
    thumb.style.height = `${g.tH}px`;
    thumb.style.transform = `translateY(${(scroller.scrollTop / g.span) * g.travel}px)`;
  };

  let drag = null;
  thumb.addEventListener("pointerdown", (e) => {
    thumb.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, y: e.clientY, top: scroller.scrollTop, g: geometry() };
    thumb.classList.add("held");
    e.preventDefault();
  });
  thumb.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    scroller.scrollTop = drag.top + ((e.clientY - drag.y) / drag.g.travel) * drag.g.span;
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) { drag = null; thumb.classList.remove("held"); } };
  thumb.addEventListener("pointerup", end);
  thumb.addEventListener("pointercancel", end);
  track.addEventListener("pointerdown", (e) => {
    if (e.target !== track) return;
    const r = thumb.getBoundingClientRect();
    scroller.scrollBy({ top: (e.clientY < r.top ? -1 : 1) * scroller.clientHeight * 0.9, behavior: "smooth" });
  });

  scroller.addEventListener("scroll", update, { passive: true });
  const ro = new ResizeObserver(update);
  ro.observe(scroller);
  if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
  window.addEventListener("resize", update);
  requestAnimationFrame(update);

  return {
    update,
    destroy() {
      ro.disconnect();
      window.removeEventListener("resize", update);
      scroller.removeEventListener("scroll", update);
      rail.remove();
    },
  };
}

// ---------------------------------------------------------------- colour sheet
/** In-app colour picker. Slides up from the bottom on a phone and docks to
 *  the right on a wide screen, leaving the preview visible and live.
 *
 *    hex         starting colour
 *    printedAs   (hex) -> the colour that band really prints as, or null if
 *                the band has no layers (shown beside the chosen colour)
 *    palette     [hex] colours found in the photo
 *    photo       { canvas, sample(nx, ny) -> hex | null } tap-to-pick
 *    onChange    (hex) called live as the colour moves
 */
export function colourSheet({ title, hex, printedAs, palette = [], photo = null, onChange, onClose }) {
  let cur = hex.toUpperCase();
  let [hue, sat, val] = rgbToHsv(...hexToRgb(cur));

  const swatch = (label) => {
    const b = h("b", {}, "");
    const box = h("div", { class: "big-sw" }, h("span", {}, label), b);
    return { box, b };
  };
  const chosen = swatch("filament · exported");
  const printed = swatch("prints as");

  // saturation / value square
  const sv = h("canvas", { class: "sv" });
  const knob = h("div", { class: "sv-knob" });
  const svBox = h("div", { class: "sv-box" }, sv, knob);
  const drawSv = () => {
    const w = sv.clientWidth, hh = sv.clientHeight;
    if (!w || !hh) return;
    const dpr = window.devicePixelRatio || 1;
    sv.width = Math.round(w * dpr);
    sv.height = Math.round(hh * dpr);
    const ctx = sv.getContext("2d");
    const g1 = ctx.createLinearGradient(0, 0, sv.width, 0);
    g1.addColorStop(0, "#fff");
    g1.addColorStop(1, toHex(hsvToRgb(hue, 1, 1)));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, sv.width, sv.height);
    const g2 = ctx.createLinearGradient(0, 0, 0, sv.height);
    g2.addColorStop(0, "rgba(0,0,0,0)");
    g2.addColorStop(1, "#000");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, sv.width, sv.height);
    knob.style.left = `${sat * 100}%`;
    knob.style.top = `${(1 - val) * 100}%`;
  };

  const hexIn = h("input", { class: "val hex-in", value: cur, maxlength: "7", autocapitalize: "characters",
    autocomplete: "off", spellcheck: "false", "aria-label": "hex colour" });
  const hueSlider = slider({ min: 0, max: 360, value: Math.round(hue),
    track: "linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
    onInput: (x) => { hue = x; fromHsv(); } });

  const refresh = (skipHex = false) => {
    chosen.box.style.background = cur;
    chosen.box.style.color = lum(cur) > 140 ? "#111" : "#f2f2ea";
    chosen.b.textContent = cur;
    const pr = printedAs ? printedAs(cur) : cur;
    if (pr) {
      printed.box.style.background = pr;
      printed.box.style.color = lum(pr) > 140 ? "#111" : "#f2f2ea";
      printed.b.textContent = pr === cur ? "same" : pr;
    } else {
      printed.box.style.background = "transparent";
      printed.box.style.color = "var(--muted)";
      printed.b.textContent = "no layers";
    }
    if (!skipHex) hexIn.value = cur;
  };

  function fromHsv() {
    cur = toHex(hsvToRgb(hue, sat, val));
    drawSv();
    refresh();
    onChange?.(cur);
  }

  function setHex(next, source) {
    cur = next.toUpperCase();
    const [nh, ns, nv] = rgbToHsv(...hexToRgb(cur));
    if (ns > 0.02 && nv > 0.02) hue = nh;   // greys and blacks keep the hue you were on
    sat = ns; val = nv;
    hueSlider.set(Math.round(hue), false);
    drawSv();
    refresh(source === "hex");
    onChange?.(cur);
  }

  hexIn.addEventListener("input", () => {
    const t = hexIn.value.trim();
    if (isHex(t)) setHex("#" + t.replace("#", ""), "hex");
  });
  hexIn.addEventListener("blur", () => { hexIn.value = cur; });

  let dragging = false;
  const pickSv = (e) => {
    const r = sv.getBoundingClientRect();
    sat = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    val = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    fromHsv();
  };
  svBox.addEventListener("pointerdown", (e) => { svBox.setPointerCapture(e.pointerId); dragging = true; pickSv(e); e.preventDefault(); });
  svBox.addEventListener("pointermove", (e) => { if (dragging) pickSv(e); });
  svBox.addEventListener("pointerup", () => { dragging = false; });
  svBox.addEventListener("pointercancel", () => { dragging = false; });

  const swatches = (list) => h("div", { class: "pal" }, list.map(([name, c]) =>
    h("button", { class: "pal-sw", type: "button", title: name || c, "aria-label": name || c,
      style: `background:${c}`, onclick: () => setHex(c, "pal") })));

  // tap the photo to pick what's there
  let eyeBlock = null;
  if (photo) {
    const eye = h("canvas", { class: "eye" });
    const ring = h("div", { class: "eye-ring" });
    const box = h("div", { class: "eye-box" }, eye, ring);
    eye.width = photo.canvas.width;
    eye.height = photo.canvas.height;
    eye.getContext("2d").drawImage(photo.canvas, 0, 0);
    box.style.aspectRatio = `${photo.canvas.width} / ${photo.canvas.height}`;
    let down = false;
    const pickEye = (e) => {
      const r = eye.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      const c = photo.sample(nx, ny);
      ring.style.left = `${nx * 100}%`;
      ring.style.top = `${ny * 100}%`;
      ring.hidden = false;
      if (c) setHex(c, "eye");
    };
    ring.hidden = true;
    box.addEventListener("pointerdown", (e) => { box.setPointerCapture(e.pointerId); down = true; pickEye(e); e.preventDefault(); });
    box.addEventListener("pointermove", (e) => { if (down) pickEye(e); });
    box.addEventListener("pointerup", () => { down = false; });
    box.addEventListener("pointercancel", () => { down = false; });
    eyeBlock = [h("div", { class: "sheet-head" }, "[ tap your photo to pick ]"), box];
  }

  const close = () => {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    onClose?.();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);

  const sheet = h("div", { class: "sheet", role: "dialog", "aria-label": title },
    h("div", { class: "sheet-bar" },
      h("b", {}, title),
      h("button", { class: "sheet-x", type: "button", "aria-label": "close", onclick: close }, "✕")),
    h("div", { class: "sheet-swatches" }, chosen.box, printed.box),
    svBox,
    h("div", { class: "sheet-row" }, hueSlider),
    h("label", { class: "field" }, "hex", hexIn),
    palette.length ? [h("div", { class: "sheet-head" }, "[ from your photo ]"),
      swatches(palette.map((c) => ["", c]))] : null,
    eyeBlock,
    h("div", { class: "sheet-head" }, "[ common ]"),
    swatches(COMMON),
    h("button", { class: "btn primary sheet-done", type: "button", onclick: close }, "done"));

  const backdrop = h("div", { class: "sheet-backdrop", onpointerdown: (e) => { if (e.target === backdrop) close(); } }, sheet);
  document.body.append(backdrop);
  requestAnimationFrame(() => { drawSv(); refresh(); });
  new ResizeObserver(drawSv).observe(sv);
  return { close };
}

function lum(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
