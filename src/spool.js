// Filament spools drawn the way a Bambu Lab user is used to seeing them in
// Studio's AMS panel: a side view, two white flanges with the filament wound
// between them, the material on it and a pencil to edit. Our own drawing
// (no Bambu artwork); the colour comes in through CSS variables, so the
// markup below is a fixed string and never carries user data.
import { h } from "./dom.js";
import { hexToRgb } from "./colour.js";

const SPOOL_SVG = `<svg class="spool-svg" viewBox="0 0 64 84" aria-hidden="true">
  <rect class="sp-core" x="9" y="7" width="46" height="70" rx="2"/>
  <rect class="sp-wind" x="9" y="7" width="46" height="70" rx="2"/>
  <ellipse class="sp-flange" cx="9" cy="42" rx="7.5" ry="40"/>
  <ellipse class="sp-rim" cx="9" cy="42" rx="3.6" ry="35"/>
  <circle class="sp-hole" cx="9" cy="42" r="2.4"/>
  <ellipse class="sp-flange" cx="55" cy="42" rx="7.5" ry="40"/>
  <ellipse class="sp-rim" cx="55" cy="42" rx="3.6" ry="35"/>
  <text class="sp-label" x="32" y="27">PLA</text>
  <g class="sp-edit"><path d="M27.5 55.5 L38 45 L41 48 L30.5 58.5 L26.5 59.5 Z"/><path class="sp-line" d="M25 64 H42"/></g>
</svg>`;

// the small one (lists, chips): narrow flanges so the colour fills it
const MINI_SVG = `<svg class="spool-svg" viewBox="0 0 40 48" aria-hidden="true">
  <rect class="sp-core" x="5" y="4" width="30" height="40" rx="2"/>
  <ellipse class="sp-flange" cx="5" cy="24" rx="4" ry="23"/>
  <ellipse class="sp-flange" cx="35" cy="24" rx="4" ry="23"/>
</svg>`;

/** Dark or light ink, whichever reads on this filament colour. */
export function inkFor(hex) {
  const [r, g, b] = hexToRgb(hex || "#808080");
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#141413" : "#f4f4ef";
}

/** Set (or change) the filament colour a spool element shows. */
export function paintSpool(el, hex) {
  el.style.setProperty("--fil", hex);
  el.style.setProperty("--fil-ink", inkFor(hex));
}

/** A spool picture as a <span>; mini drops the label and pencil. */
export function spool(hex, { mini = false } = {}) {
  const el = h("span", { class: `spool${mini ? " mini" : ""}` });
  el.innerHTML = mini ? MINI_SVG : SPOOL_SVG;   // fixed markup, see above
  paintSpool(el, hex);
  return el;
}

/** Studio's AMS names: A1-A4 for the first unit, B1-B4 for a second. */
export const amsName = (slot) => `${"ABCD"[Math.floor((slot - 1) / 4)] || "?"}${((slot - 1) % 4) + 1}`;

const ARROW_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M30 9.5 A14 14 0 1 0 33.5 24"/><path class="ar-head" d="M34 18.5 L33.6 25.4 L27.6 22"/></svg>`;

/** The slot badge: the AMS name inside a round arrow, as on the AMS panel. */
export function slotBadge(slot, side = "left") {
  const el = h("span", { class: `slot-badge ${side}` }, h("b", {}, amsName(slot)));
  el.insertAdjacentHTML("afterbegin", ARROW_SVG);
  return el;
}

/** The little AMS icon (a box of four spools in these colours). */
export function amsIcon(hexes) {
  return h("span", { class: "ams-icon" }, hexes.slice(0, 4).map((hex) => h("i", { style: `background:${hex}` })));
}
