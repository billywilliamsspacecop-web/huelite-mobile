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

export function defaultData(name) {
  return {
    schema_version: 1,
    id: crypto.randomUUID(),
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
    },
    solve: {
      layer_height_mm: 0.08,
      base_layers: 7,
      max_layers: 45,
      filaments: DEFAULT_FILAMENTS.map((f) => ({ ...f })),
      dither: "bayer8",
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

// In-memory for the shell. Persistence (IndexedDB) comes with the engine
// port, since that's when there are heightmaps worth keeping.
export const app = {
  project: null,
  sourceBitmap: null, // ImageBitmap of the picked photo
  preppedCanvas: null, // cropped/rotated output, feeds Solve
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
