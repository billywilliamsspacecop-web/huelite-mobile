// The projects shelf: every print standing on edge in a sideways row, front
// and back, as you swipe past. The one in the middle comes forward and turns
// slowly; tap it to flip, hold it for more. Swipe speed leans the row and
// brightens the light behind it, which takes the focused print's colours.
// A scrubber under the info jumps through a long collection with one drag.

import { h } from "./dom.js";
import * as sfx from "./sfx.js";
import { hexToRgb } from "./colour.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * items: [{ id, name, sub, size, pips: [[label, done]], hexes, aspect, front: () => Promise<Blob|null>,
 *           back: () => Promise<Blob|null> }]
 * on: { open(id), more(id) }
 * Returns { el, focus(id), destroy() }.
 */
export function createShelf(items, on, { start = 0 } = {}) {
  const track = h("div", { class: "shelf-track", role: "listbox", "aria-label": "projects" });
  const glow = h("div", { class: "shelf-glow" });
  const stage = h("div", { class: "shelf-stage" }, glow, track);
  const info = h("div", { class: "shelf-info" });
  const scrub = h("div", { class: "shelf-scrub", role: "slider", "aria-label": "scroll through projects",
    "aria-valuemin": "1", "aria-valuemax": String(items.length) });
  const scrubThumb = h("i", { class: "scrub-thumb" });
  scrub.append(...items.map(() => h("b")), scrubThumb);
  const el = h("div", { class: "shelf" }, stage, info, scrub);

  const urls = [];
  const slabs = items.map((it, i) => {
    const front = h("div", { class: "face front" });
    const back = h("div", { class: "face back" }, h("span", { class: "face-note" }, "back not made yet"));
    const edge = h("div", { class: "edge", style: `background:linear-gradient(90deg, ${[...it.hexes].reverse().join(", ")})` });
    const edgeL = h("div", { class: "edge left", style: `background:linear-gradient(90deg, ${it.hexes.join(", ")})` });
    const slab = h("div", { class: "slab", style: `--ar:${it.aspect}` }, front, back, edge, edgeL);
    const cell = h("div", { class: "shelf-item", role: "option", "data-i": String(i) }, h("div", { class: "spin" }, h("div", { class: "turn" }, slab)));
    cell.addEventListener("click", () => (i === cur ? flip() : goTo(i)));
    return { cell, slab, front, back, loaded: false, it };
  });
  track.append(...slabs.map((s) => s.cell));

  // ---- images, loaded as they come near the middle
  const load = (k) => {
    const s = slabs[k];
    if (!s || s.loaded) return;
    s.loaded = true;
    const put = (face, blob, cls) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      face.replaceChildren(h("img", { src: url, alt: "", class: cls || "", draggable: "false" }));
    };
    s.it.front().then((b) => put(s.front, b)).catch(() => {});
    s.it.back().then((b) => put(s.back, b)).catch(() => {});
  };

  // ---- position: each frame, lay the row out round the middle
  let cur = -1, raf = 0, lastX = 0, lastT = 0, vel = 0, flipped = false, settleTimer = 0, lastTick = -1;
  const width = () => slabs[0]?.cell.offsetWidth || 1;
  const layout = () => {
    raf = 0;
    const mid = track.scrollLeft + track.clientWidth / 2;
    const now = performance.now(), x = track.scrollLeft;
    const dt = Math.max(1, now - lastT);
    vel = vel * 0.6 + ((x - lastX) / dt) * 0.4;          // px per ms, smoothed
    lastX = x; lastT = now;
    const lean = clamp(-vel * 9, -16, 16);
    el.style.setProperty("--speed", clamp(Math.abs(vel) / 2.5, 0, 1).toFixed(3));
    let best = 0, bestD = Infinity;
    slabs.forEach((s, i) => {
      const c = s.cell.offsetLeft + s.cell.offsetWidth / 2;
      const d = (c - mid) / width();
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = i; }
      const a = Math.abs(d);
      if (a > 3.5) { s.cell.style.visibility = "hidden"; return; }
      s.cell.style.visibility = "";
      if (a < 2.5) load(i);
      s.cell.style.setProperty("--d", d.toFixed(3));
      s.slab.style.transform = `translateZ(${(-a * 90).toFixed(1)}px) rotateY(${(clamp(-d * 38, -60, 60) + lean).toFixed(1)}deg)` +
        ` scale(${(1 - Math.min(a, 2) * 0.12).toFixed(3)})`;
      s.cell.style.opacity = String(clamp(1.15 - a * 0.42, 0, 1).toFixed(2));
      s.cell.style.zIndex = String(100 - Math.round(a * 10));
    });
    if (best !== lastTick) {
      if (lastTick !== -1) sfx.play("shelfTick", { i: best, speed: Math.abs(vel) / 2 });
      lastTick = best;
    }
    if (best !== cur) setFocus(best);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      slabs.forEach((s, i) => s.cell.classList.toggle("focus", i === cur));
      if (Math.abs(vel) > 0.02) { vel = 0; schedule(); }
      sfx.play("shelfSettle", cur);
    }, 140);
    slabs.forEach((s, i) => { if (i !== cur) s.cell.classList.remove("focus"); });
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(layout); };

  /** Each slab's size from its print's shape: as tall as the stage allows,
   *  no wider than most of the screen. The cells are narrower than the slabs,
   *  so the neighbours tuck in behind the middle one. */
  const size = () => {
    const H = track.clientHeight * 0.74, maxW = Math.min(track.clientWidth * 0.64, 300);
    slabs.forEach((s) => {
      const ar = +s.it.aspect || 1;
      let w = H * ar, hh = H;
      if (w > maxW) { w = maxW; hh = w / ar; }
      s.slab.style.width = `${w.toFixed(0)}px`;
      s.slab.style.height = `${hh.toFixed(0)}px`;
    });
    schedule();
  };

  // ---- the focused print: its info, its colour in the light, the scrubber
  function setFocus(i) {
    cur = i;
    if (flipped) { flipped = false; slabs.forEach((s) => s.cell.classList.remove("flipped")); }
    const it = items[i];
    const [a, b] = [it.hexes[it.hexes.length - 1] || "#888", it.hexes[Math.floor(it.hexes.length / 2)] || "#444"];
    el.style.setProperty("--glow-a", softHex(a));
    el.style.setProperty("--glow-b", softHex(b));
    info.replaceChildren(
      h("div", { class: "shelf-name" }, it.name),
      h("div", { class: "shelf-sub meta" }, it.size, h("span", { class: "dotsep" }, "·"), it.sub),
      h("div", { class: "shelf-row" },
        h("span", { class: "pips" }, it.pips.map(([label, done]) => h("i", { class: done ? "on" : "" }, label))),
        h("span", { class: "shelf-dots" }, it.hexes.map((x) => h("i", { style: `background:${x}` })))),
      h("div", { class: "shelf-actions" },
        h("button", { class: "btn primary", type: "button", onclick: () => on.open(it.id) }, "open"),
        h("button", { class: "btn", type: "button", onclick: flip }, "flip ⟲"),
        h("button", { class: "btn ghost", type: "button", "aria-label": "more", onclick: () => on.more(it.id) }, "⋯")));
    scrub.setAttribute("aria-valuenow", String(i + 1));
    scrubThumb.style.left = `${items.length > 1 ? (i / (items.length - 1)) * 100 : 50}%`;
  }

  function flip() {
    const s = slabs[cur];
    if (!s) return;
    flipped = !flipped;
    s.cell.classList.toggle("flipped", flipped);
    sfx.play("shelfFlip");
    schedule();
  }

  function goTo(i, smooth = true) {
    const s = slabs[clamp(i, 0, slabs.length - 1)];
    if (!s) return;
    track.scrollTo({ left: s.cell.offsetLeft + s.cell.offsetWidth / 2 - track.clientWidth / 2, behavior: smooth ? "smooth" : "auto" });
  }

  // ---- hold the focused print for more
  let holdTimer = 0;
  track.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".shelf-item");
    if (!cell || +cell.dataset.i !== cur) return;
    holdTimer = setTimeout(() => { holdTimer = 0; navigator.vibrate?.(12); on.more(items[cur].id); }, 520);
  });
  const cancelHold = () => { clearTimeout(holdTimer); holdTimer = 0; };
  track.addEventListener("pointerup", cancelHold);
  track.addEventListener("pointercancel", cancelHold);
  track.addEventListener("pointermove", (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) cancelHold(); });
  track.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---- scrubber: drag along it to fly through a long shelf
  const scrubAt = (e) => {
    const r = scrub.getBoundingClientRect();
    const k = Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * (items.length - 1));
    if (k !== cur) goTo(k, false);
  };
  scrub.addEventListener("pointerdown", (e) => {
    try { scrub.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    scrub.classList.add("held");
    scrubAt(e);
  });
  scrub.addEventListener("pointermove", (e) => { if (scrub.classList.contains("held")) scrubAt(e); });
  const release = () => scrub.classList.remove("held");
  scrub.addEventListener("pointerup", release);
  scrub.addEventListener("pointercancel", release);

  const onKey = (e) => {
    if (e.key === "ArrowRight") goTo(cur + 1);
    else if (e.key === "ArrowLeft") goTo(cur - 1);
    else if (e.key === "Enter" && items[cur]) on.open(items[cur].id);
  };
  document.addEventListener("keydown", onKey);
  track.addEventListener("scroll", schedule, { passive: true });
  const ro = new ResizeObserver(size);
  ro.observe(track);

  requestAnimationFrame(() => { size(); goTo(start, false); lastX = track.scrollLeft; lastT = performance.now(); layout(); });

  return {
    el,
    focus: (id) => goTo(items.findIndex((x) => x.id === id)),
    destroy() {
      document.removeEventListener("keydown", onKey);
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}

/** A filament colour made into light: lifted, so a black spool still glows. */
function softHex(hex) {
  const [r, g, b] = hexToRgb(hex);
  const lift = (v) => Math.round(60 + v * 0.75);
  return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
}
