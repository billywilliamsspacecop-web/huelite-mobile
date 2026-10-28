// Project state. Mirrors the desktop project.json schema (core/project.py)
// so a project can move between the phone and the Mac later without a
// translation layer. Fields the phone doesn't use yet are kept anyway.

export const STAGES = ["prep", "solve", "export"];
export const STAGE_LABELS = { prep: "Prep", solve: "Solve", export: "Export" };
export const STAGE_REQUIRES = { prep: null, solve: "prep", export: "solve" };
export const PENDING = "pending";
export const COMPLETE = "complete";

// Phone default. Desktop solves at 1800px; that's too heavy for a phone
// and far more detail than a 100-180 mm print can show anyway.
export const MOBILE_OUTPUT_PX = 800;

export const DEFAULT_FILAMENTS = [
  { slot: 1, name: "Black", hex: "#101010", td_mm: 0.4, band_layers: 12 },
  { slot: 2, name: "Blue", hex: "#0B39B5", td_mm: 0.8, band_layers: 12 },
  { slot: 3, name: "Green", hex: "#2C7A2E", td_mm: 0.9, band_layers: 12 },
  { slot: 4, name: "White", hex: "#F2F4F0", td_mm: 1.6, band_layers: 12 },
];

const now = () => new Date().toISOString().slice(0, 19);

// crypto.randomUUID only exists in a secure context (https or localhost).
// Opening the dev server from a phone over Wi-Fi is plain http, so fall
// back to a v4 UUID built from getRandomValues, which works everywhere.
export function uuid() {
  if (globalThis.crypto?.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* not a secure context */ }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function defaultData(name) {
  return {
    schema_version: 1,
    id: uuid(),
    name,
    created: now(),
    modified: now(),
    folder: "",
    status: { prep: PENDING, solve: PENDING, export: PENDING },
    source: { filename: "", width_px: 0, height_px: 0 },
    prep: {
      crop: null, // [x, y, w, h] in source pixels (after rotate/flip)
      rotate_deg: 0,
      flip_h: false,
      output_px: [MOBILE_OUTPUT_PX, MOBILE_OUTPUT_PX],
      physical_width_mm: 120.0,
      adjustments: {
        brightness: 0, contrast: 0, saturation: 0,
        denoise: 0, sharpen: 0, pixelize: 0, decimate: 0,
      },
      focal_regions: [],
      // Print outline: rect | ellipse | alpha | knockout (engine/shape.js)
      shape: { mode: "rect", tolerance: 0.25, min_feature_mm: 0.8 },
    },
    solve: {
      layer_height_mm: 0.08,
      base_layers: 7,
      max_layers: 45,
      filaments: DEFAULT_FILAMENTS.map((f) => ({ ...f })),
      dither: "bayer8",
      dither_amount: 1.0,
      band_mode: "solid",
      slope_mm_per_layer: 0.3,
      colours_seeded: false,
      colours_auto: false,   // colours were picked by the fit, so they follow the stack
      border: { enabled: true, width_mm: 3.0, mode: "raised", frame_slot: 1 },
    },
    export: {
      mesh_mode: "banded_slabs",
      formats: ["3mf"],
      last_export: null,
      price_per_kg: 25.0,
    },
  };
}

/** Make a loaded project.json safe to use. Projects arrive from IndexedDB, a
 *  .zip someone sent, or a hand edit, and the UI trusts their fields: colours
 *  go into style attributes, cut loops into polygon fills, sizes into canvas
 *  allocations. Anything missing or out of range falls back to the default. */
export function sanitizeProject(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const base = defaultData(typeof d.name === "string" ? d.name : "project");
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const num = (v, fb, lo, hi) => (Number.isFinite(+v) && v !== null && v !== "" ? Math.min(hi, Math.max(lo, +v)) : fb);
  const pick = (v, list, fb) => (list.includes(v) ? v : fb);
  const hex = (v, fb) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toUpperCase() : fb);
  const text = (v, fb, max) => (typeof v === "string" ? v.slice(0, max) : fb);

  const out = { ...d };
  out.schema_version = 1;
  out.id = typeof d.id === "string" && /^[0-9a-f-]{8,64}$/i.test(d.id) ? d.id : base.id;
  out.name = text(d.name, base.name, 120) || base.name;
  out.created = text(d.created, base.created, 40);
  out.modified = text(d.modified, base.modified, 40);
  out.folder = text(d.folder, "", 200);
  out.group = text(d.group, "", 60).trim();   // phone-only: the folder it is filed under on the home screen
  const st = obj(d.status);
  out.status = Object.fromEntries(STAGES.map((k) => [k, st[k] === COMPLETE ? COMPLETE : PENDING]));
  out.source = { ...base.source, ...obj(d.source) };
  out.source.filename = text(out.source.filename, "", 200);

  const p = obj(d.prep), bp = base.prep;
  const crop = Array.isArray(p.crop) && p.crop.length === 4 && p.crop.every((v) => Number.isFinite(+v)) ? p.crop.map(Number) : null;
  const sh = obj(p.shape);
  const cuts = (Array.isArray(sh.cuts) ? sh.cuts : []).slice(0, 500).flatMap((c) => {
    const pts = Array.isArray(c?.pts) ? c.pts.slice(0, 4000) : [];
    if (!["cut", "back", "only"].includes(c?.tool) || pts.length < 3) return [];
    if (!pts.every((q) => Array.isArray(q) && q.length === 2 && q.every((v) => typeof v === "number" && Math.abs(v) < 100))) return [];
    return [{ tool: c.tool, pts: pts.map(([u, v]) => [u, v]) }];
  });
  const adj = obj(p.adjustments);
  out.prep = {
    ...p,
    crop,
    rotate_deg: pick(+p.rotate_deg, [0, 90, 180, 270], 0),
    flip_h: p.flip_h === true,
    output_px: Array.isArray(p.output_px) && p.output_px.length === 2
      ? p.output_px.map((v) => num(v, MOBILE_OUTPUT_PX, 1, 4096)) : bp.output_px,
    physical_width_mm: num(p.physical_width_mm, bp.physical_width_mm, 5, 2000),
    adjustments: Object.fromEntries(Object.entries(bp.adjustments).map(([k, v]) => [k, num(adj[k], v, -1, k === "decimate" ? 256 : 1)])),
    focal_regions: Array.isArray(p.focal_regions) ? p.focal_regions : [],
    shape: { mode: pick(sh.mode, ["rect", "ellipse", "alpha", "knockout"], "rect"),
             tolerance: num(sh.tolerance, 0.25, 0, 1), min_feature_mm: num(sh.min_feature_mm, 0.8, 0, 20), cuts },
  };

  const so = obj(d.solve), bs = base.solve;
  const fils = (Array.isArray(so.filaments) ? so.filaments : []).slice(0, 8).map((f, i) => ({
    ...obj(f),
    slot: i + 1,
    name: text(f?.name, "", 40),
    hex: hex(f?.hex, (DEFAULT_FILAMENTS[i] || DEFAULT_FILAMENTS[0]).hex),
    td_mm: num(f?.td_mm, 1, 0.05, 6),
    band_layers: Math.round(num(f?.band_layers, 12, 0, 120)),
  }));
  const bo = obj(so.border);
  out.solve = {
    ...so,
    layer_height_mm: num(so.layer_height_mm, bs.layer_height_mm, 0.02, 1),
    base_layers: Math.round(num(so.base_layers, bs.base_layers, 1, 400)),
    max_layers: Math.round(num(so.max_layers, bs.max_layers, 1, 2000)),
    filaments: fils.length ? fils : bs.filaments,
    dither: pick(so.dither, ["bayer8", "none"], "bayer8"),
    dither_amount: num(so.dither_amount, 1, 0, 4),
    band_mode: pick(so.band_mode, ["solid", "blend"], "solid"),
    slope_mm_per_layer: num(so.slope_mm_per_layer, 0.3, 0, 5),
    colours_seeded: so.colours_seeded === true,
    colours_auto: so.colours_auto === true,
    border: { ...bs.border, ...bo,
      enabled: bo.enabled !== false,
      width_mm: num(bo.width_mm, 3, 0, 100),
      mode: pick(bo.mode, ["raised", "flush", "none"], "raised"),
      frame_slot: Math.round(num(bo.frame_slot, 1, 1, 8)) },
  };
  const ex = obj(d.export);
  out.export = { ...base.export, ...ex, price_per_kg: num(ex.price_per_kg, 25, 0, 100000),
                 formats: Array.isArray(ex.formats) ? ex.formats.filter((f) => f === "3mf" || f === "stl") : ["3mf"] };
  return out;
}

// In memory for now; saving projects between launches (IndexedDB) is next.
export const app = {
  project: null,
  sourceBitmap: null,   // ImageBitmap of the picked photo
  sourceHasAlpha: false,
  prepped: null,        // { canvas, data: ImageData (flattened), mask, w, h }
  proxy: null,          // same, small, for the live solve
  solved: null,         // { heights, w, h, lut } at full prepped size
  stage: "prep",
};

export function canOpen(stage) {
  const req = STAGE_REQUIRES[stage];
  if (!req) return true;
  return !!app.project && app.project.status[req] === COMPLETE;
}

export function setStatus(stage, value) {
  app.project.status[stage] = value;
  app.project.modified = now();
  // Changing an earlier stage invalidates everything after it.
  if (value !== COMPLETE) {
    const i = STAGES.indexOf(stage);
    for (const s of STAGES.slice(i + 1)) app.project.status[s] = PENDING;
  }
}
