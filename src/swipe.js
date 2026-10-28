// Swipe between stages. The screen follows the finger, then either flies off
// and the next stage slides in, or springs back.
//
// It only starts from a touch on plain screen. Anything that already means
// something to a horizontal drag (sliders, the crop and lasso, the 3D view,
// the scroll rail, the colour sheet) is left alone, and a mostly-vertical
// drag is just a scroll and never becomes a swipe.

const IGNORE = "input, textarea, select, canvas, .slider, .crop-wrap, .gl-wrap, .lasso-layer, " +
               ".rail, .sheet, .sheet-backdrop, .eye-box, .sv-box, [data-noswipe]";

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** host: element that receives the touches. drag: element that moves.
 *  canGo(dir) -> bool, dir +1 = forward (swipe left), -1 = back (swipe right).
 *  onGo(dir) runs once the screen has left; onBlocked(dir) when a swipe that
 *  can't go anywhere was clearly meant. Returns a function that detaches. */
export function attachSwipe(host, { drag, canGo, onGo, onBlocked }) {
  let s = null;

  const settle = (ms, ease) => { drag.style.transition = `transform ${ms}ms ${ease}, opacity ${ms}ms ease`; };
  const clear = () => {
    drag.classList.remove("dragging");
    drag.style.transition = "";
    drag.style.transform = "";
    drag.style.opacity = "";
  };
  const springBack = () => {
    settle(420, "cubic-bezier(.2, 1.3, .4, 1)");
    drag.style.transform = "translate3d(0, 0, 0)";
    drag.style.opacity = "1";
    setTimeout(clear, 440);
  };

  const down = (e) => {
    if (e.pointerType === "mouse" || !e.isPrimary || e.target.closest(IGNORE)) return;
    if (document.querySelector(".sheet-backdrop, .veil")) return;
    s = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), locked: false, dx: 0, dir: 0, ok: false };
  };
  const move = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }   // a scroll
      if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      s.locked = true;
      s.dir = dx < 0 ? 1 : -1;
      s.ok = canGo(s.dir);
      try { host.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      drag.classList.add("dragging");
      drag.style.transition = "none";
    }
    s.dx = dx;
    // where a stage can't be opened the screen resists, like a rubber band
    const toward = Math.sign(dx) === -s.dir;                  // still heading the way it started
    const shown = s.ok ? dx * (toward ? 1 : 0.25) : Math.sign(dx) * Math.sqrt(Math.abs(dx)) * 3.2;
    const w = Math.max(1, host.clientWidth);
    drag.style.transform = `translate3d(${shown}px, 0, 0)`;
    drag.style.opacity = String(Math.max(0.35, 1 - Math.abs(shown) / (w * 1.1)));
  };
  const up = (e, cancelled) => {
    if (!s || e.pointerId !== s.id) return;
    const st = s;
    s = null;
    if (!st.locked) return;
    const w = Math.max(1, host.clientWidth);
    const dx = st.dx, dt = Math.max(1, performance.now() - st.t);
    const fast = Math.abs(dx) / dt > 0.55 && Math.abs(dx) > 40;
    const far = Math.abs(dx) > Math.min(120, w * 0.26);
    if (!cancelled && st.ok && Math.sign(dx) === -st.dir && (far || fast)) {
      if (reduced()) { clear(); onGo(st.dir); return; }
      settle(240, "cubic-bezier(.5, 0, 1, 1)");
      drag.style.transform = `translate3d(${st.dir > 0 ? "-100%" : "100%"}, 0, 0)`;
      drag.style.opacity = "0";
      setTimeout(() => { clear(); onGo(st.dir); }, 240);
      return;
    }
    if (!cancelled && !st.ok && Math.abs(dx) > 50) onBlocked?.(st.dir);
    springBack();
  };

  host.addEventListener("pointerdown", down);
  host.addEventListener("pointermove", move);
  const onUp = (e) => up(e, false), onCancel = (e) => up(e, true);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", onCancel);
  return () => {
    host.removeEventListener("pointerdown", down);
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerup", onUp);
    host.removeEventListener("pointercancel", onCancel);
    clear();
  };
}
