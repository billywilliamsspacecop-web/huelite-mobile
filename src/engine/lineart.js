// Line-art designs for the back of a print (the Back stage).
//
// The designs live in backplate-art/backplate-art.js (the Print-Brick
// back-plate generator, dropped in as-is so a newer copy can replace it): 40
// procedural drawings in millimetres on a 200 x 200 mm canvas, stroked on any
// 2D canvas. That file sets `PBArt` on the global object; this module is the
// only place the app touches it.
//
// Fitting: a design keeps its real line widths (they are printable mm) and
// is centred on the print and clipped to its outline. A print bigger than
// 200 mm scales the design up just enough to cover it, so lines only ever
// get thicker, never thinner.

import "../../backplate-art/backplate-art.js";

const P = globalThis.PBArt;
const CANVAS_MM = P.W;           // 200

/** [{ id, name, note, group }] in the generator's order. */
export const DESIGNS = P.designs.map(({ id, name, note, group }) => ({ id, name, note, group }));
export const GROUPS = ["Original", "Printer", "Faith"];
export const WEIGHT_MIN = 0.6, WEIGHT_MAX = 2.2;

const indexOf = (id) => P.designs.findIndex((d) => d.id === id);
export const designById = (id) => DESIGNS[indexOf(id)] || null;

/** How printable the thinnest line is on a 0.4 mm nozzle. 0.6 mm is what the
 *  business-card test prints showed survives the first layer (backart.js). */
export function thinnestVerdict(mm) {
  if (!(mm < Infinity)) return { level: "ok", text: "prints clean" };
  if (mm < 0.4) return { level: "bad", text: "below the nozzle: the thinnest lines won't print" };
  if (mm < 0.6) return { level: "warn", text: "under 0.6 mm: may break up in the first layer, raise the line weight" };
  return { level: "ok", text: "prints clean" };
}

/** A whole design, square, for a gallery tile. Returns the thinnest line in mm. */
export function drawThumb(canvas, id, { seed, weight = 1, ink, bg }) {
  const idx = indexOf(id);
  const ctx = canvas.getContext("2d");
  if (idx < 0) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); return Infinity; }
  ctx.setTransform(canvas.width / CANVAS_MM, 0, 0, canvas.height / CANVAS_MM, 0, 0);
  const min = P.render(ctx, idx, { seed: seed | 0, ls: weight, ink, bg, step: 1.6, margin: 5 });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return min;
}

/** The design as coverage (0..1 per pixel, 1 = ink) on a w x h grid of px-mm
 *  pixels covering widthMm x heightMm, as the back is seen (not mirrored).
 *  Returns { cov, thinnest } with thinnest in real mm after scaling. */
export function designCoverage(id, { w, h, px, widthMm, heightMm, seed, weight = 1 }) {
  const idx = indexOf(id);
  const cov = new Float32Array(w * h);
  if (idx < 0) return { cov, thinnest: Infinity };
  const k = Math.max(1, widthMm / CANVAS_MM, heightMm / CANVAS_MM);
  const ox = (widthMm - CANVAS_MM * k) / 2, oy = (heightMm - CANVAS_MM * k) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(k / px, 0, 0, k / px, ox / px, oy / px);
  // contour designs sample a grid: about two pixels a cell, 0.25 mm at the finest (the generator's export setting)
  const step = Math.min(1.6, Math.max(0.25, (2 * px) / k));
  const min = P.render(ctx, idx, { seed: seed | 0, ls: weight, ink: "#fff", bg: "#000", step, margin: 0 });
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < cov.length; i++) cov[i] = data[i * 4] / 255;
  return { cov, thinnest: min * k };
}
