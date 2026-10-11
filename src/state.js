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
