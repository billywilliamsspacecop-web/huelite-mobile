import { app, canOpen, COMPLETE, DEFAULT_FILAMENTS, defaultData, MOBILE_OUTPUT_PX, PENDING,
         setStatus, STAGE_LABELS, STAGE_REQUIRES, STAGES } from "./state.js";
import { ASPECTS, createCropper, loadPhoto } from "./crop.js";
import * as shape from "./engine/shape.js";
import * as solve from "./engine/solve.js";
import * as mesh from "./engine/mesh.js";
import * as bambu3mf from "./engine/bambu3mf.js";
import * as imaging from "./engine/imaging.js";
import * as store from "./store.js";
import * as projectzip from "./engine/projectzip.js";
import { uuid } from "./state.js";

const root = document.getElementById("app");
const SOLVE_PROXY = 360;      // live solve resolution (long edge)
const PREP_OVERLAY_PX = 320;  // shape preview resolution (long edge)
const PREP_RESULT_PX = 420;   // adjusted-result preview resolution (long edge)
let cropper = null;
let aspectKey = "free";
let solveView = "sim";
let solveTimer = 0;
let exportOpts = { detail: "standard", plate: "A1", formats: { "3mf": true, stl: false } };
let lastFiles = [];           // [{ name, url }] from the last export
let prepView = "crop";        // crop | result
let preSuggest = null;        // adjustments before the last "suggest", for undo

// ---------------------------------------------------------------- helpers
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
};
const head = (text) => h("div", { class: "section-head" }, `[ ${text} ]`);
// Desktop view panel: corner marks + optional caption.
const frame = (caption, ...kids) => h("div", { class: "frame" },
  h("i"), h("i"), h("i"), h("i"),
  caption ? h("div", { class: "frame-caption" }, caption) : null, ...kids);
const kv = (pairs) => h("dl", { class: "kv" },
  pairs.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
const pane = (cls, ...kids) => h("div", { class: `pane ${cls}` }, ...kids);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function canvasOf(imageData) {
  const c = document.createElement("canvas");
  c.width = imageData.width;
  c.height = imageData.height;
  c.getContext("2d").putImageData(imageData, 0, 0);
  return c;
}

/** Checker out pixels outside mask m. Over an image (composited) when
 *  `under` is given, else on a transparent layer for the crop overlay. */
function checkered(m, w, hh, under = null) {
  const out = under ? new ImageData(new Uint8ClampedArray(under.data), w, hh) : new ImageData(w, hh);
  const cell = Math.max(3, Math.round(w / 40));
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m[i]) continue;
      const v = ((Math.floor(x / cell) + Math.floor(y / cell)) & 1) ? 44 : 28;
      out.data.set([v, v, v - 3, under ? 255 : 240], i * 4);
    }
  }
  return out;
}

/** The crop, small, as plain RGBA ImageData (before any flattening). */
function cropSample(oriented, [x, y, w, hh], longEdge) {
  const k = Math.min(1, longEdge / Math.max(w, hh));
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(hh * k));
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(oriented, x, y, w, hh, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}

/** Chip row where exactly one is on. */
function chipGroup(options, current, onPick) {
  const row = h("div", { class: "chips" });
  for (const o of options) {
    const b = h("button", { class: `chip${o.key === current ? " on" : ""}`,
      disabled: o.disabled || false, title: o.tip || null, onclick: () => {
        row.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
        b.classList.add("on");
        onPick(o.key);
      } }, o.label);
    row.append(b);
  }
  return row;
}

function numField(labelText, value, { step, min, max, fmt = (v) => String(v), onchange }) {
  return h("label", { class: "field" }, labelText,
    h("input", { class: "val", type: "number", inputmode: "decimal", step, min, max,
      value: fmt(value), onchange: (e) => {
        const v = Math.min(max, Math.max(min, parseFloat(e.target.value)));
        const ok = Number.isFinite(v) ? v : value;
        e.target.value = fmt(ok);
        onchange(ok);
      } }));
}

function rangeField(labelText, value, { min, max, step = 1, fmt, oninput }) {
  const out = h("span", { class: "range-val" }, fmt(value));
  return h("label", { class: "range" },
    h("span", { class: "range-head" }, h("span", {}, labelText), out),
    h("input", { type: "range", min, max, step, value: String(value), oninput: (e) => {
      const v = parseFloat(e.target.value);
      out.textContent = fmt(v);
      oninput(v);
    } }));
}

const STAGE_SUB = {
  prep: "crop, orient, size and shape the source",
  solve: "filament stack and depth",
  export: "mesh, package, and send to the printer",
};

let toastTimer;
function toast(msg, ms = 1800) {
  let t = document.querySelector(".toast");
  if (!t) { t = h("div", { class: "toast" }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/** Run something heavy with a "working" veil, after the veil has painted. */
async function busy(label, fn) {
  const veil = h("div", { class: "veil" }, h("div", {}, label));
  document.body.append(veil);
  await nextFrame();
  try { return await fn(); } finally { veil.remove(); }
}

async function sourceHasAlpha(bmp) {
  const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return shape.hasAlpha(ctx.getImageData(0, 0, c.width, c.height).data);
}

const picker = h("input", { type: "file", accept: "image/*", hidden: true,
  onchange: async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const bmp = await loadPhoto(file);
      app.sourceBitmap?.close?.();
      app.sourceBitmap = bmp;
      app.sourceHasAlpha = await sourceHasAlpha(bmp);
      const name = (file.name || "photo").replace(/\.[^.]+$/, "");
      app.project = defaultData(name);
      app.project.source = { filename: file.name, width_px: bmp.width, height_px: bmp.height };
      // a transparent PNG almost always means "cut it out"
      if (app.sourceHasAlpha) app.project.prep.shape.mode = "alpha";
      app.prepped = app.proxy = app.solved = null;
      app.sourceFile = file;
      lastFiles = [];
      aspectKey = "free";
      prepView = "crop";
      preSuggest = null;
      go("prep");
      await store.putFile(app.project.id, "source", file);
      await persistNow(await thumbBlob(bmp));
    } catch (err) {
      console.error(err);
      toast("Couldn't open that photo");
    }
  } });
document.body.append(picker);

// ---------------------------------------------------------------- saving
let persistTimer = 0;
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistNow(), 700);
}

/** Save project.json now (and a fresh thumbnail, if given). */
async function persistNow(thumb = undefined) {
  clearTimeout(persistTimer);
  if (!app.project) return;
  app.project.modified = new Date().toISOString().slice(0, 19);
  try {
    await store.saveProject(app.project, thumb);
  } catch (err) {
    console.error(err);
    toast("couldn't save - is the phone's storage full?", 3000);
  }
}

// Any edit anywhere in the app schedules a save; leaving the app saves now.
for (const ev of ["input", "change", "click"]) root.addEventListener(ev, persistSoon);
document.addEventListener("visibilitychange", () => { if (document.hidden) persistNow(); });

/** 256px square PNG for the project list. */
function thumbBlob(source) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const side = Math.min(source.width, source.height);
  c.getContext("2d").drawImage(source, (source.width - side) / 2, (source.height - side) / 2,
    side, side, 0, 0, 256, 256);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

/** The small copy of the prepped image the live solve runs on. */
function makeProxy(canvas, mask) {
  const w = canvas.width, hh = canvas.height;
  const k = Math.min(1, SOLVE_PROXY / Math.max(w, hh));
  const pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(hh * k));
  const pc = document.createElement("canvas");
  pc.width = pw; pc.height = ph;
  const pctx = pc.getContext("2d", { willReadFrequently: true });
  pctx.imageSmoothingQuality = "high";
  pctx.drawImage(canvas, 0, 0, pw, ph);
  return { data: pctx.getImageData(0, 0, pw, ph), mask: shape.resize(mask, w, hh, pw, ph), w: pw, h: ph };
}

async function openProject(id) {
  await busy("opening…", async () => {
    const rec = await store.getProject(id);
    const file = await store.getFile(id, "source");
    if (!rec || !file) { toast("That project is missing its photo", 2600); return; }
    const bmp = await loadPhoto(file);
    app.sourceBitmap?.close?.();
    app.sourceBitmap = bmp;
    app.sourceFile = file;
    app.sourceHasAlpha = await sourceHasAlpha(bmp);
    app.project = rec.data;
    app.prepped = app.proxy = app.solved = null;
    const prepped = app.project.status.prep === COMPLETE ? await store.getFile(id, "prepped") : null;
    if (prepped) {
      const canvas = document.createElement("canvas");
      canvas.width = prepped.w; canvas.height = prepped.h;
      const data = new ImageData(new Uint8ClampedArray(prepped.rgba), prepped.w, prepped.h);
      canvas.getContext("2d").putImageData(data, 0, 0);
      app.prepped = { canvas, data, mask: prepped.mask || null, w: prepped.w, h: prepped.h };
      app.proxy = makeProxy(canvas, app.prepped.mask);
    } else if (app.project.status.prep === COMPLETE) {
      setStatus("prep", PENDING);
    }
    const solved = app.prepped && app.project.status.solve === COMPLETE ? await store.getFile(id, "solved") : null;
    if (solved) {
      const { s, lh, mode } = solveSettings();
      app.solved = { heights: solved.heights, w: solved.w, h: solved.h,
                     lut: solve.buildLut(s.filaments, lh, mode).lut };
    } else if (app.project.status.solve === COMPLETE) {
      setStatus("solve", PENDING);
    }
    lastFiles = [];
    prepView = "crop";
    preSuggest = null;
    aspectKey = "free";
    const st = app.project.status;
    go(st.solve === COMPLETE ? "export" : st.prep === COMPLETE ? "solve" : "prep");
  });
}

/** Share sheet if the browser can share this file, else a download. */
async function saveBlob(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
  }
  const url = URL.createObjectURL(file);
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`saved ${filename} to downloads`, 2600);
}

/** The whole project as a desktop project folder, zipped. */
async function exportProjectZip(id) {
  if (app.project?.id === id) await persistNow();
  const result = await busy("packing project…", async () => {
    const rec = await store.getProject(id);
    const [source, prepped, solved] = await Promise.all(
      ["source", "prepped", "solved"].map((n) => store.getFile(id, n)));
    const st = rec.data.status;
    return projectzip.pack({ data: rec.data, source,
      prepped: st.prep === COMPLETE ? prepped : null,
      solved: st.prep === COMPLETE && st.solve === COMPLETE ? solved : null });
  }).catch((err) => { console.error(err); toast(`couldn't pack it: ${err.message}`, 3000); return null; });
  if (result) await saveBlob(result.blob, result.filename);
}

async function importProjectZip(file) {
  await busy("importing…", async () => {
    const { data, source, prepped, solved } = await projectzip.unpack(await file.arrayBuffer());
    if (!data.id || await store.getProject(data.id)) {
      // already on this phone: keep both
      if (data.id) data.name = `${data.name} (copy)`;
      data.id = uuid();
    }
    if (!prepped) data.status = { prep: PENDING, solve: PENDING, export: PENDING };
    else if (!solved) data.status = { ...data.status, solve: PENDING, export: PENDING };
    await store.putFile(data.id, "source", source);
    if (prepped) await store.putFile(data.id, "prepped", prepped);
    if (solved) await store.putFile(data.id, "solved", solved);
    let thumb = null;
    if (prepped) {
      const img = new ImageData(new Uint8ClampedArray(prepped.rgba), prepped.w, prepped.h);
      thumb = await thumbBlob(canvasOf(prepped.mask ? checkered(prepped.mask, prepped.w, prepped.h, img) : img));
    } else {
      thumb = await thumbBlob(await createImageBitmap(source));
    }
    await store.saveProject(data, thumb);
    toast(`imported "${data.name}"`, 2400);
  }).catch((err) => { console.error(err); toast(`couldn't import: ${err.message}`, 3600); });
  render();
}

const zipPicker = h("input", { type: "file", accept: ".zip,application/zip", hidden: true,
  onchange: (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) importProjectZip(file);
  } });
document.body.append(zipPicker);

async function closeProject() {
  await persistNow();
  app.sourceBitmap?.close?.();
  app.sourceBitmap = null;
  app.sourceFile = null;
  app.project = app.prepped = app.proxy = app.solved = null;
  lastFiles.forEach((f) => URL.revokeObjectURL(f.url));
  lastFiles = [];
  go("prep");
}

// ---------------------------------------------------------------- shell
function render() {
  cropper?.destroy();
  cropper = null;
  root.innerHTML = "";
  root.dataset.stage = app.stage;

  const home = !app.project;
  root.dataset.home = home ? "1" : "";
  const name = app.project?.name || "projects";
  const n = STAGES.indexOf(app.stage) + 1;
  root.append(
    h("header", { class: "top" },
      h("div", { class: "top-row" },
        h("h1", { class: "stage-title" }, home ? "HueLite" : `0${n} ${STAGE_LABELS[app.stage]}`),
        app.project
          ? h("button", { class: "brand link", onclick: closeProject }, "☰ projects")
          : h("div", { class: "brand" }, "photo → layered print")),
      home
        ? h("div", { class: "top-sub" }, "saved on this phone")
        : h("div", { class: "top-sub" },
            h("span", { class: "proj", onclick: rename }, name),
            h("span", { class: "dotsep" }, "·"),
            STAGE_SUB[app.stage])),
  );

  const screen = h("main", { class: "screen" });
  const action = h("div", { class: "action" });
  ({ prep: renderPrep, solve: renderSolve, export: renderExport })[app.stage](screen, action);
  root.append(screen);
  if (action.childElementCount) root.append(action);
  if (!home) root.append(renderStepper());
}

function renderStepper() {
  return h("nav", { class: "stepper" }, STAGES.map((s, i) => {
    const done = app.project?.status[s] === COMPLETE;
    const locked = !canOpen(s);
    const cls = ["step", s === app.stage && "active", done && "done", locked && "locked"]
      .filter(Boolean).join(" ");
    return h("button", { class: cls, onclick: () => {
      if (locked) return toast(`Finish ${STAGE_LABELS[STAGE_REQUIRES[s]]} first`);
      go(s);
    } }, h("span", { class: "num" }, `0${i + 1}`), STAGE_LABELS[s]);
  }));
}

function refreshStepper() {
  root.querySelector(".stepper")?.replaceWith(renderStepper());
}

function go(stage) {
  app.stage = stage;
  render();
  root.querySelector(".screen")?.scrollTo(0, 0);
}

function rename() {
  if (!app.project) return;
  const next = prompt("Project name", app.project.name);
  if (next && next.trim()) { app.project.name = next.trim(); render(); }
}

// ---------------------------------------------------------------- prep
function renderPrep(screen, action) {
  if (!app.sourceBitmap) {
    renderHome(screen);
    return;
  }

  const p = app.project.prep;
  p.shape = { ...shape.DEFAULT_SHAPE, ...(p.shape || {}) };
  const invalidate = () => {
    if (app.project.status.prep === COMPLETE) { setStatus("prep", PENDING); refreshStepper(); }
  };

  const cropHost = h("div");
  const readout = h("div");
  const shapeNote = h("p", { class: "meta shape-note" }, "");
  const updateReadout = (crop) => {
    const [, , w, hgt] = crop;
    const k = Math.min(1, MOBILE_OUTPUT_PX / Math.max(w, hgt));
    const mmH = p.physical_width_mm * (hgt / w);
    readout.replaceChildren(kv([
      ["crop", `${w} × ${hgt} px`],
      ["solve", `${Math.round(w * k)} × ${Math.round(hgt * k)} px`],
      ["print", `${p.physical_width_mm.toFixed(0)} × ${mmH.toFixed(0)} mm`],
    ]));
  };

  // live shape preview, painted over the crop box by the cropper
  const painter = (oriented, [x, y, w, hgt]) => {
    queueResult();
    if (p.shape.mode === "rect") { shapeNote.textContent = "prints the whole crop"; return null; }
    const id = cropSample(oriented, [x, y, w, hgt], PREP_OVERLAY_PX);
    const m = shape.build(p.shape.mode, id, { tolerance: p.shape.tolerance,
      pxPerMm: id.width / p.physical_width_mm, minFeatureMm: p.shape.min_feature_mm });
    shapeNote.textContent = shapeVerdict(p.shape.mode, m);
    if (!m) return null;
    return canvasOf(checkered(m, id.width, id.height));
  };

  // what Prep will actually hand to Solve: adjusted, with the shape cut
  const resultHost = h("div", { class: "result-view" });
  let resultTimer = 0;
  const renderResult = () => {
    if (!cropper || prepView !== "result") return;
    const crop = cropper.getCrop();
    const id = cropSample(cropper.oriented(), crop, PREP_RESULT_PX);
    const m = shape.build(p.shape.mode, id, { tolerance: p.shape.tolerance,
      pxPerMm: id.width / p.physical_width_mm, minFeatureMm: p.shape.min_feature_mm });
    shape.flatten(id);
    // pixel blocks are defined at output resolution; scale them for the
    // preview the same way the desktop does
    const adj = { ...imaging.DEFAULT_ADJUSTMENTS, ...p.adjustments };
    if (adj.pixelize > 0) {
      const outW = Math.round(crop[2] * Math.min(1, MOBILE_OUTPUT_PX / Math.max(crop[2], crop[3])));
      const blockPreview = (1 + adj.pixelize * 23) * id.width / Math.max(1, outW);
      adj.pixelize = Math.max(0, Math.min(1, (blockPreview - 1) / 23));
    }
    const done = imaging.finish(id, adj);
    const img = new ImageData(done.data, done.width, done.height);
    const c = canvasOf(m ? checkered(m, img.width, img.height, img) : img);
    c.className = "preview-out";
    resultHost.replaceChildren(c);
  };
  const queueResult = () => { clearTimeout(resultTimer); resultTimer = setTimeout(renderResult, 120); };

  // mount after it's in the DOM so it can measure its width
  let ready = false; // don't treat the initial layout as a user edit
  requestAnimationFrame(() => {
    cropper = createCropper(cropHost, app.sourceBitmap, {
      rotateDeg: p.rotate_deg, flipH: p.flip_h, crop: p.crop,
      onChange: (crop) => {
        p.crop = crop;
        updateReadout(crop);
        if (ready) invalidate();
      },
    });
    const a = ASPECTS.find((x) => x.key === aspectKey);
    if (a?.ratio) cropper.setAspect(a.ratio);
    cropper.setOverlay(painter);
    p.crop = cropper.getCrop();
    updateReadout(p.crop);
    ready = true;
    showView(prepView);
  });

  const viewChips = chipGroup([{ key: "crop", label: "crop" }, { key: "result", label: "result" }],
    prepView, (k) => showView(k));
  const cropControls = h("div");
  function showView(k) {
    prepView = k;
    cropHost.hidden = k !== "crop";
    cropControls.hidden = k !== "crop";
    resultHost.hidden = k !== "result";
    viewChips.querySelectorAll(".chip").forEach((c, i) => c.classList.toggle("on", (i === 0) === (k === "crop")));
    if (k === "result") renderResult();
  }
  /** an adjustment moved: show its effect */
  const adjusted = () => {
    invalidate();
    if (prepView !== "result") showView("result"); else queueResult();
  };

  const aspectChips = () => chipGroup(ASPECTS.map((a) => ({ key: a.key, label: a.label })), aspectKey,
    (key) => { aspectKey = key; cropper?.setAspect(ASPECTS.find((a) => a.key === key).ratio); });
  let aspectRow = aspectChips();

  const tolerance = rangeField("background tolerance", Math.round(p.shape.tolerance * 100), {
    min: 0, max: 100, fmt: (v) => `${v}%`,
    oninput: (v) => { p.shape.tolerance = v / 100; invalidate(); cropper?.refreshOverlay(); } });
  tolerance.hidden = p.shape.mode !== "knockout";

  const shapeChips = chipGroup([
    { key: "rect", label: "rectangle", tip: "The whole crop prints, edge to edge." },
    { key: "ellipse", label: "circle / oval", tip: "A circle or oval filling the crop. 1:1 for a true circle." },
    { key: "alpha", label: "cut-out", disabled: !app.sourceHasAlpha,
      tip: app.sourceHasAlpha ? "Cut to the image's own transparency."
                              : "Needs a PNG with a transparent background." },
    { key: "knockout", label: "knock out bg", tip: "Remove a plain background around the subject." },
  ], p.shape.mode, (key) => {
    p.shape.mode = key;
    tolerance.hidden = key !== "knockout";
    if (key === "ellipse" && aspectKey === "free") {
      aspectKey = "1:1";
      cropper?.setAspect(1);
      const fresh = aspectChips();
      aspectRow.replaceWith(fresh);
      aspectRow = fresh;
    }
    invalidate();
    cropper?.refreshOverlay();
  });

  // ---- painting: presets, suggest, image sliders, tools
  p.adjustments = { ...imaging.DEFAULT_ADJUSTMENTS, ...(p.adjustments || {}) };
  const paintNote = h("p", { class: "meta" },
    "the closer the source looks to a flat painting, the cleaner the 3D solve. try a preset or let it suggest.");
  const setAdjustments = (adj, note) => {
    p.adjustments = { ...imaging.DEFAULT_ADJUSTMENTS, ...adj };
    const fresh = buildSliders();
    sliders.replaceWith(fresh);
    sliders = fresh;
    if (note) paintNote.textContent = note;
    adjusted();
  };
  const undoBtn = h("button", { class: "chip", disabled: !preSuggest, onclick: () => {
    if (!preSuggest) return;
    setAdjustments(preSuggest, "back to what you had before suggest");
    preSuggest = null;
    undoBtn.disabled = true;
  } }, "↺ undo suggest");
  const PRESET_NOTES = {
    poster: "smoothed, a little punchier, 12 colours",
    painterly: "soft with edges kept, 18 colours",
    flat: "bold shapes only, 6 colours",
    pixel: "mosaic blocks, 8 colours",
  };
  const presets = h("div", { class: "chips" },
    Object.keys(imaging.PRESETS).map((k) => h("button", { class: "chip", onclick: () =>
      setAdjustments(imaging.PRESETS[k], `preset: ${k} - ${PRESET_NOTES[k]}`) }, k)),
    h("button", { class: "chip accent", onclick: () => {
      if (!cropper) return;
      preSuggest = { ...p.adjustments };
      undoBtn.disabled = false;
      const sample = cropSample(cropper.oriented(), cropper.getCrop(), 400);
      shape.flatten(sample);
      const { adjustments, reasons } = imaging.suggest(sample);
      setAdjustments(adjustments, `suggested - ${reasons.join("; ")}`);
    } }, "suggest for print"),
    undoBtn);

  const pct = (v) => (v ? `${v > 0 ? "+" : ""}${v}` : "0");
  const buildSliders = () => {
    const a = p.adjustments;
    const slider = (label, key, min, max, fmt, scale = 100) =>
      rangeField(label, Math.round(a[key] * scale), { min, max, fmt,
        oninput: (v) => { a[key] = v / scale; adjusted(); } });
    return h("div", {},
      slider("brightness", "brightness", -60, 60, pct),
      slider("contrast", "contrast", -60, 60, pct),
      slider("saturation", "saturation", -100, 100, pct),
      slider("denoise", "denoise", 0, 100, (v) => (v ? `${v}%` : "off")),
      slider("sharpen", "sharpen", 0, 100, (v) => (v ? `${v}%` : "off")),
      slider("pixelize", "pixelize", 0, 100,
        (v) => (v ? `${Math.round(1 + v / 100 * 23)} px blocks` : "off")),
      rangeField("decimate", a.decimate || 1, { min: 1, max: 32,
        fmt: (v) => (v >= 2 ? `${v} colours` : "off"),
        oninput: (v) => { a.decimate = v >= 2 ? v : 0; adjusted(); } }),
      h("button", { class: "btn wide", style: "margin-top:8px",
        onclick: () => setAdjustments(imaging.DEFAULT_ADJUSTMENTS, "adjustments reset") }, "reset adjustments"));
  };
  let sliders = buildSliders();
  const adjustBlock = h("div", {},
    head("painting"), presets, paintNote,
    head("image"), sliders);

  screen.append(
    pane("view", viewChips, h("div", { style: "margin-top:10px" }, frame(null, cropHost, resultHost)),
      h("div", { class: "row", style: "margin-top:12px" },
        h("button", { class: "btn grow", onclick: () => {
          p.rotate_deg = (p.rotate_deg + 270) % 360; // counter-clockwise
          cropper?.setOrientation(p.rotate_deg, p.flip_h);
        } }, "↺ rotate"),
        h("button", { class: "btn grow", onclick: () => {
          p.flip_h = !p.flip_h;
          cropper?.setOrientation(p.rotate_deg, p.flip_h);
        } }, "⇋ flip"),
        h("button", { class: "btn grow", onclick: () => cropper?.reset() }, "reset")),
      cropControls,
      readout),
    pane("ctrl",
      head("shape"),
      shapeChips,
      h("div", { style: "margin-top:10px" }, tolerance),
      shapeNote,
      !app.sourceHasAlpha && h("p", { class: "meta" },
        "tip: a PNG with a transparent background prints as exactly that outline."),

      head("print size"),
      numField("width (mm)", p.physical_width_mm, { step: "1", min: 20, max: 256,
        onchange: (v) => { p.physical_width_mm = v; updateReadout(p.crop); invalidate(); cropper?.refreshOverlay(); } }),
      h("p", { class: "meta" }, "A1 bed is 256 mm · A1 mini is 180 mm"),

      adjustBlock),
  );
  cropControls.append(h("div", { style: "margin-top:12px" }, aspectRow));

  action.append(
    h("button", { class: "btn ghost", onclick: () => picker.click() }, "new photo"),
    h("button", { class: "btn primary", onclick: commitPrep }, "prep  &  continue  →"),
  );
}

function renderHome(screen) {
  const list = h("div", { class: "projects" }, h("p", { class: "meta" }, "loading projects…"));
  screen.append(
    pane("view", h("div", { class: "pick" },
      frame(null, h("button", { class: "drop drop-home", onclick: () => picker.click() },
        h("b", {}, "+ new from a photo"),
        h("span", {}, "library or camera · PNG cut-outs keep their shape"))),
      h("p", { class: "meta" }, "turns it into a layered, multi-filament print for the A1."))),
    pane("ctrl", head("projects"), list,
      h("button", { class: "btn wide", style: "margin-top:12px", onclick: () => zipPicker.click() },
        "import a project (.zip)"),
      h("p", { class: "meta" }, "zip a project folder on the Mac (Finder › Compress) and open it here, " +
        "or save one from here and unzip it into Documents/HueLite/projects on the Mac.")));

  store.listProjects().then((recs) => {
    if (!recs.length) {
      list.replaceChildren(h("p", { class: "meta" }, "nothing saved yet - projects you start are kept on this phone."));
      return;
    }
    list.replaceChildren(...recs.map((rec) => {
      const d = rec.data;
      const img = h("img", { class: "thumb", alt: "" });
      if (rec.thumb) img.src = URL.createObjectURL(rec.thumb);
      const next = STAGES.find((st) => d.status[st] !== COMPLETE);
      const when = (rec.modified || "").replace("T", "  ").slice(0, 17);
      return h("div", { class: "project" },
        h("button", { class: "project-open", onclick: () => openProject(rec.id) },
          img,
          h("span", { class: "project-text" },
            h("b", {}, d.name),
            h("span", { class: "meta" }, `${when} · ${next ? `next: ${STAGE_LABELS[next].toLowerCase()}` : "complete"}`),
            h("span", { class: "pips" }, STAGES.map((st) =>
              h("i", { class: d.status[st] === COMPLETE ? "on" : "" }, STAGE_LABELS[st]))))),
        h("button", { class: "project-del", title: "save as .zip", onclick: () => exportProjectZip(rec.id) }, "zip"),
        h("button", { class: "project-del", title: "delete", onclick: async () => {
          if (!confirm(`Delete "${d.name}" from this phone? This can't be undone.`)) return;
          await store.deleteProject(rec.id);
          render();
        } }, "✕"));
    }));
  }).catch((err) => {
    console.error(err);
    list.replaceChildren(h("p", { class: "meta" }, "couldn't read saved projects on this browser."));
  });
}

function shapeVerdict(mode, m) {
  if (!m) return "prints the whole crop";
  const cover = shape.coverage(m);
  if (cover < 0.01) return "nothing left to print - lower the tolerance";
  if (mode === "knockout" && cover > 0.985) return "no background found - raise the tolerance, or crop tighter";
  return `prints ${(cover * 100).toFixed(0)}% of the crop · checkered = no plate`;
}

async function commitPrep() {
  if (!cropper) return;
  const p = app.project.prep;
  await busy("prepping…", async () => {
    const out = cropper.output(MOBILE_OUTPUT_PX);  // keeps transparency if the source had it
    const w = out.width, hh = out.height;
    const ctx = out.getContext("2d", { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, w, hh);
    const mask = shape.build(p.shape.mode, data, { tolerance: p.shape.tolerance,
      pxPerMm: w / p.physical_width_mm, minFeatureMm: p.shape.min_feature_mm });
    if (mask && shape.coverage(mask) < 0.01) {
      toast("The shape left nothing to print", 2600);
      return;
    }
    shape.flatten(data);
    // same order as the desktop: the outline is cut from the plain crop,
    // then the painting adjustments run on the flattened image
    const done = imaging.finish(data, p.adjustments);
    const prepped = new ImageData(done.data, w, hh);
    ctx.putImageData(prepped, 0, 0);
    app.prepped = { canvas: out, data: prepped, mask, w, h: hh };
    app.proxy = makeProxy(out, mask);
    app.solved = null;
    p.output_px = [w, hh];
    setStatus("prep", COMPLETE);
    const id = app.project.id;
    await store.putFile(id, "prepped", { w, h: hh, rgba: prepped.data, mask });
    await store.deleteFile(id, "solved");
    const shown = mask ? canvasOf(checkered(mask, w, hh, prepped)) : out;
    await persistNow(await thumbBlob(shown));
    go("solve");
  });
}

// ---------------------------------------------------------------- solve
function solveSettings() {
  const s = app.project.solve;
  const lh = s.layer_height_mm;
  return {
    s, lh,
    baseLayers: Math.max(2, s.base_layers | 0),
    mode: s.band_mode || "solid",
    mm: app.project.prep.physical_width_mm,
  };
}

/** heights for one image at its own resolution, the same steps as the
 *  desktop's SolveWindow.recompute / _save */
function solveImage({ data, mask, w, h }) {
  const { s, lh, mode, mm } = solveSettings();
  const { lut } = solve.buildLut(s.filaments, lh, mode);
  let heights = solve.solveHeights(data.data, w, h, lut,
    { dither: s.dither !== "none", amount: s.dither_amount ?? 1 });
  heights = solve.applyMask(heights, mask);
  heights = solve.applySlope(heights, w, h, mm / Math.max(1, w), s.slope_mm_per_layer ?? 0);
  const border = s.border || {};
  if ((border.mode || "raised") !== "none") {
    heights = solve.applyBorder(heights, w, h, {
      widthPx: Math.round((border.width_mm ?? 3) * w / Math.max(1e-6, mm)),
      mode: border.mode || "raised",
      rimLayers: solve.bandEndLayer(s.filaments, border.frame_slot ?? 1),
      maxLayers: lut.length - 1,
      mask,
    });
  }
  heights = solve.applyMask(heights, mask);
  return { heights, lut, w, h };
}

function renderSolve(screen, action) {
  if (!app.prepped) {
    screen.append(h("div", { class: "todo" }, h("b", {}, "nothing prepped"),
      "Go back to Prep and continue from there."));
    return;
  }
  const { s } = solveSettings();
  const stock = DEFAULT_FILAMENTS.map((f) => f.hex.toUpperCase());
  if (!s.colours_seeded && s.filaments.every((f, i) => f.hex.toUpperCase() === stock[i])) {
    importColours();
  }
  s.colours_seeded = true;

  const view = h("div", { class: "solve-view" });
  const ramp = h("div", { class: "ramp" });
  const readout = h("div");
  let live = null;

  const invalidate = () => {
    if (app.project.status.solve === COMPLETE) { setStatus("solve", PENDING); refreshStepper(); }
  };

  const draw = () => {
    if (!live) return;
    const { lh, baseLayers, mm } = solveSettings();
    const { proxy } = app;
    const baseMm = baseLayers * lh;
    let el;
    if (solveView === "source") {
      const id = new ImageData(new Uint8ClampedArray(proxy.data.data), proxy.w, proxy.h);
      if (proxy.mask) for (let i = 0; i < proxy.mask.length; i++) if (!proxy.mask[i]) id.data.set([17, 17, 16, 255], i * 4);
      el = canvasOf(id);
    } else if (solveView === "height") {
      el = canvasOf(mesh.renderHeight({ heights: live.heights, w: proxy.w, h: proxy.h, mask: proxy.mask }));
    } else if (solveView === "oblique") {
      el = mesh.renderOblique({ heights: live.heights, w: proxy.w, h: proxy.h, lut: live.lut, mask: proxy.mask,
        baseHex: s.filaments[0].hex, layerH: lh, baseMm, physicalW: mm, targetWidth: 640, maxCols: 180 });
    } else {
      el = canvasOf(mesh.renderTop({ heights: live.heights, w: proxy.w, h: proxy.h, lut: live.lut,
        mask: proxy.mask, layerH: lh, baseMm, cellMm: mm / proxy.w }));
    }
    el.className = "preview-out";
    view.replaceChildren(el);
  };

  const recompute = () => {
    live = solveImage(app.proxy);
    const { lh, baseLayers, mm } = solveSettings();
    const t = solve.totals(s.filaments, lh, baseLayers);
    const distinct = solve.distinctColours(live.lut);
    const border = s.border.mode || "raised";
    const rimMm = t.base_mm + solve.bandEndLayer(s.filaments, s.border.frame_slot ?? 1) * lh;
    const edge = border === "raised" ? `rim ${rimMm.toFixed(2)} mm` : border === "flush" ? "flush edge" : "no border";
    const waste = t.colour_layers - distinct + 1;
    const mode = app.project.prep.shape?.mode || "rect";
    readout.replaceChildren(kv([
      ["total", `${t.total_layers} layers · ${t.total_mm.toFixed(2)} mm`],
      ["base", `${t.base_mm.toFixed(2)} mm (${baseLayers} layers)`],
      ["outline", app.prepped.mask ? `${shape.MODE_LABELS[mode]} (${(shape.coverage(app.prepped.mask) * 100).toFixed(0)}% of crop)` : "rectangle"],
      ["edge", edge],
      ["rigidity", solve.rigidityNote(t.base_mm, t.base_mm, mm)],
      ["distinct", `${distinct} of ${t.colour_layers + 1} tones${waste > 6 ? ` · ${waste} duplicated, trim a band` : ""}`],
    ]));
    ramp.replaceChildren(...live.lut.map((c) => h("i", { style: `background:${solve.rgbToHex(c)}` })));
    draw();
  };
  const queue = () => { invalidate(); clearTimeout(solveTimer); solveTimer = setTimeout(recompute, 150); };

  const viewChips = chipGroup([
    { key: "sim", label: "simulated print" }, { key: "oblique", label: "~30° angle" },
    { key: "height", label: "height" }, { key: "source", label: "source" },
  ], solveView, (k) => { solveView = k; draw(); });

  // filaments
  const filTable = () => h("div", { class: "fil-table" },
    h("span"), h("span", { class: "th" }, "colour"), h("span", { class: "th" }, "TD mm"),
    h("span", { class: "th" }, "layers"),
    s.filaments.flatMap((f) => [
      h("span", { class: "idx" }, String(f.slot)),
      h("input", { class: "sw", type: "color", value: f.hex.toLowerCase(), oninput: (e) => {
        f.hex = e.target.value.toUpperCase(); f.name = ""; queue();
      } }),
      h("input", { class: "val", type: "number", inputmode: "decimal", step: "0.05", min: "0.05", max: "6",
        value: Number(f.td_mm).toFixed(2), onchange: (e) => {
          const v = Math.min(6, Math.max(0.05, parseFloat(e.target.value) || f.td_mm));
          f.td_mm = v; e.target.value = v.toFixed(2); queue();
        } }),
      h("input", { class: "val", type: "number", inputmode: "numeric", step: "1", min: "0", max: "120",
        value: String(f.band_layers), onchange: (e) => {
          const v = Math.min(120, Math.max(0, parseInt(e.target.value, 10) || 0));
          f.band_layers = v; e.target.value = String(v); queue();
        } }),
    ]));
  let filEl = filTable();

  const borderWidth = numField("rim width (mm)", s.border.width_mm ?? 3, { step: "0.5", min: 0.4, max: 15,
    onchange: (v) => { s.border.width_mm = v; queue(); } });
  const frameSlot = numField("frame colour (slot)", s.border.frame_slot ?? 1, { step: "1", min: 1, max: s.filaments.length,
    onchange: (v) => { s.border.frame_slot = Math.round(v); queue(); } });

  screen.append(
    pane("view",
      h("div", { style: "margin-top:8px" }, viewChips),
      h("div", { style: "margin-top:10px" }, frame(null, view)),
      ramp,
      h("p", { class: "meta", style: "margin-top:4px" }, "reachable tones, bottom layer to top"),
      readout),
    pane("ctrl",
      head("filaments"),
      h("p", { class: "meta", style: "margin:-4px 0 8px" }, "slot 1 prints lowest · tap a swatch to change it"),
      filEl,
      h("button", { class: "btn wide", style: "margin-top:10px", onclick: () => {
        importColours(); const fresh = filTable(); filEl.replaceWith(fresh); filEl = fresh; queue();
      } }, "import colours from prep"),

      head("layers"),
      numField("layer height (mm)", s.layer_height_mm, { step: "0.02", min: 0.04, max: 0.3, fmt: (v) => v.toFixed(2),
        onchange: (v) => { s.layer_height_mm = v; queue(); } }),
      numField("base depth (mm)", +(s.base_layers * s.layer_height_mm).toFixed(2), { step: "0.2", min: 0.4, max: 8,
        fmt: (v) => v.toFixed(2),
        onchange: (v) => { s.base_layers = Math.max(2, solve.layersForMm(v, s.layer_height_mm)); queue(); } }),

      head("colour"),
      chipGroup([{ key: "solid", label: "solid bands" }, { key: "blend", label: "translucent blend" }],
        s.band_mode || "solid", (k) => { s.band_mode = k; queue(); }),
      h("div", { style: "margin-top:10px" },
        chipGroup([{ key: "bayer8", label: "dither on" }, { key: "none", label: "dither off" }],
          s.dither === "none" ? "none" : "bayer8", (k) => { s.dither = k; queue(); })),
      rangeField("dither amount", Math.round((s.dither_amount ?? 1) * 100), { min: 0, max: 200,
        fmt: (v) => `${v}%`, oninput: (v) => { s.dither_amount = v / 100; queue(); } }),
      rangeField("foundations", Math.round((s.slope_mm_per_layer ?? 0) * 100), { min: 0, max: 100,
        fmt: (v) => (v ? `${(v / 100).toFixed(2)} mm run / layer` : "off"),
        oninput: (v) => { s.slope_mm_per_layer = v / 100; queue(); } }),

      head("border"),
      chipGroup([{ key: "raised", label: "raised rim" }, { key: "flush", label: "flush" }, { key: "none", label: "none" }],
        s.border.mode || "raised", (k) => { s.border.mode = k; s.border.enabled = k !== "none"; queue(); }),
      app.prepped.mask && h("p", { class: "meta", style: "margin-top:6px" }, "the rim follows the outline"),
      borderWidth, frameSlot),
  );

  action.append(
    h("button", { class: "btn ghost", onclick: () => go("prep") }, "back to prep"),
    h("button", { class: "btn primary", onclick: commitSolve }, "solve  &  continue  →"),
  );
  requestAnimationFrame(recompute);
}

function importColours() {
  const { s } = solveSettings();
  const cols = solve.importColours(app.prepped.data.data, app.prepped.mask, s.filaments.length);
  cols.forEach((hex, i) => { if (s.filaments[i]) { s.filaments[i].hex = hex; s.filaments[i].name = ""; } });
}

async function commitSolve() {
  const { s, lh, baseLayers, mode } = solveSettings();
  if (s.filaments.reduce((n, f) => n + (f.band_layers | 0), 0) < 2) {
    toast("Give at least one filament some layers", 2400);
    return;
  }
  await busy("solving at full size…", async () => {
    app.solved = solveImage(app.prepped);
    s.base_layers = baseLayers;
    s.base_mm = +(baseLayers * lh).toFixed(3);
    s.max_layers = app.solved.lut.length - 1;
    s.band_mode = mode;
    s.border.rim_layers = solve.bandEndLayer(s.filaments, s.border.frame_slot ?? 1);
    s.swap_plan = solve.swapPlan(s.filaments, lh, baseLayers);
    setStatus("solve", COMPLETE);
    lastFiles = [];
    const { heights, w, h: hh, lut } = app.solved;
    await store.putFile(app.project.id, "solved", { w, h: hh, heights });
    const top = canvasOf(mesh.renderTop({ heights, w, h: hh, lut, mask: app.prepped.mask, layerH: lh,
      baseMm: baseLayers * lh, cellMm: app.project.prep.physical_width_mm / w }));
    await persistNow(await thumbBlob(top));
    go("export");
  });
}

// ---------------------------------------------------------------- export
function modelArgs() {
  const { s, lh, baseLayers, mm } = solveSettings();
  const { heights, w, h: hh } = app.solved;
  return { heights, w, h: hh, mask: app.prepped.mask, physicalW: mm, layerH: lh, baseLayers,
           filaments: s.filaments, detail: exportOpts.detail, name: app.project.name };
}

function renderExport(screen, action) {
  if (!app.solved) {
    screen.append(h("div", { class: "todo" }, h("b", {}, "nothing solved"),
      "Go back to Solve and continue from there."));
    return;
  }
  const { s, lh, baseLayers, mm } = solveSettings();
  const { heights, w, h: hh, lut } = app.solved;
  const mask = app.prepped.mask;
  const ex = app.project.export;

  const top = canvasOf(mesh.renderTop({ heights, w, h: hh, lut, mask, layerH: lh,
    baseMm: baseLayers * lh, cellMm: mm / w }));
  top.className = "preview-out";
  const oblique = mesh.renderOblique({ heights, w, h: hh, lut, mask, baseHex: s.filaments[0].hex,
    layerH: lh, baseMm: baseLayers * lh, physicalW: mm, targetWidth: 640 });
  oblique.className = "preview-out";

  const stats = h("p", { class: "meta" }, "building mesh…");
  const restat = () => {
    const model = mesh.buildModel(modelArgs());
    const mode = app.project.prep.shape?.mode || "rect";
    stats.textContent = `${model.stats.parts} parts · ${model.stats.triangles.toLocaleString()} triangles · ` +
      `plate ${exportOpts.plate} · outline ${mask ? shape.MODE_LABELS[mode] : "rectangle"}`;
  };

  const info = h("div");
  const reinfo = () => {
    const est = mesh.estimates({ heights, w, h: hh, mask, filaments: s.filaments, layerH: lh,
      baseLayers, physicalW: mm, pricePerKg: ex.price_per_kg ?? 25, bandMode: s.band_mode });
    const [fw, fd] = est.footprint_mm;
    const tips = [];
    if (est.max_height_mm / Math.max(fw, fd) > 0.35) tips.push("tall for its footprint: add a brim in Studio");
    if (est.switches >= 6) tips.push(`${est.switches} colour changes is a lot of AMS time; keep spools dry`);
    tips.push(`slot 1 (${est.base_hex}) touches the plate: set bed temp and adhesion for that filament`);
    tips.push("wipe the plate with IPA before printing");
    info.replaceChildren(
      kv([
        ["cost", `$${est.total_cost.toFixed(2)} · ${est.total_grams.toFixed(1)} g`],
        ["purge", `${est.purge_g.toFixed(1)} g · ${est.switches} colour switch${est.switches === 1 ? "" : "es"}`],
        ["size", `${fw.toFixed(0)} × ${fd.toFixed(0)} mm · ${est.max_height_mm.toFixed(2)} mm tall`],
      ]),
      h("ul", { class: "tips" }, tips.map((t) => h("li", {}, t))));
  };

  const filesBox = h("div");
  const showFiles = () => {
    filesBox.replaceChildren(...(lastFiles.length ? [head("files"),
      h("div", { class: "files" }, lastFiles.map((f) =>
        h("a", { class: "btn wide", href: f.url, download: f.name }, `⬇  ${f.name}`))),
      h("p", { class: "meta" }, "tap to save again. open the .3mf in Bambu Studio.")] : []));
  };

  const name = h("input", { class: "val wide-val", value: app.project.name, onchange: (e) => {
    const v = e.target.value.trim();
    if (v) app.project.name = v;
  } });

  screen.append(
    pane("view",
      head("views"),
      frame("top down", top),
      h("div", { style: "margin-top:10px" }, frame("~30° from the plate", oblique)),
      stats),
    pane("ctrl",
      head("filament slots"),
      h("div", { class: "slots" }, s.filaments.map((f, i) =>
        h("div", { class: "slot" }, h("span", { class: "sw", style: `background:${f.hex}` }),
          `slot ${f.slot}  ${f.hex}${i === 0 ? " · lowest" : i === s.filaments.length - 1 ? " · top" : ""}`))),
      head("filament & print info"),
      info,
      numField("price ($ / kg)", ex.price_per_kg ?? 25, { step: "1", min: 0, max: 500, fmt: (v) => v.toFixed(2),
        onchange: (v) => { ex.price_per_kg = v; reinfo(); } }),
      head("plate"),
      chipGroup([{ key: "A1", label: "A1" }, { key: "A1 mini", label: "A1 mini" }], exportOpts.plate,
        (k) => { exportOpts.plate = k; restat(); }),
      head("mesh detail"),
      chipGroup([{ key: "draft", label: "draft" }, { key: "standard", label: "standard" }, { key: "fine", label: "fine" }],
        exportOpts.detail, (k) => { exportOpts.detail = k; restat(); }),
      head("formats"),
      h("div", { class: "chips" }, [["3mf", "3MF (Bambu)"], ["stl", "STL"]].map(([k, label]) =>
        h("button", { class: `chip${exportOpts.formats[k] ? " on" : ""}`, onclick: (e) => {
          exportOpts.formats[k] = !exportOpts.formats[k];
          e.currentTarget.classList.toggle("on", exportOpts.formats[k]);
        } }, label))),
      head("name"),
      name,
      filesBox,
      head("project"),
      h("button", { class: "btn wide", onclick: () => exportProjectZip(app.project.id) },
        "save whole project (.zip) for the Mac")),
  );

  action.append(
    h("button", { class: "btn ghost", onclick: () => go("solve") }, "back to solve"),
    h("button", { class: "btn primary", onclick: () => commitExport() }, "commit  &  export  →"),
  );
  requestAnimationFrame(() => { restat(); reinfo(); showFiles(); });

  async function commitExport() {
    const formats = Object.keys(exportOpts.formats).filter((k) => exportOpts.formats[k]);
    if (!formats.length) return toast("Choose 3MF, STL, or both");
    const stem = (app.project.name || "huelite").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "huelite";
    const files = await busy("building files…", async () => {
      const model = mesh.buildModel(modelArgs());
      if (!model.parts.length) throw new Error("every filament band came out empty");
      const out = [];
      if (formats.includes("3mf")) {
        out.push(new File([await bambu3mf.make3mf({ ...model, plate: exportOpts.plate },
          { colours: s.filaments.map((f) => f.hex), layerHeight: lh })], `${stem}.3mf`, { type: "model/3mf" }));
      }
      if (formats.includes("stl")) out.push(new File([bambu3mf.makeStl(model)], `${stem}.stl`, { type: "model/stl" }));
      out.push(new File([bambu3mf.slotNote(s.filaments)], `${stem}-filament-slots.txt`, { type: "text/plain" }));
      return out;
    }).catch((err) => { toast(`Export failed: ${err.message}`, 3000); return null; });
    if (!files) return;

    lastFiles.forEach((f) => URL.revokeObjectURL(f.url));
    lastFiles = files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    ex.formats = formats;
    ex.last_export = { time: new Date().toISOString().slice(0, 19), detail: exportOpts.detail,
                       plate: exportOpts.plate, name: app.project.name, files: files.map((f) => f.name) };
    setStatus("export", COMPLETE);
    refreshStepper();
    showFiles();
    await deliver(files);
  }
}

/** Share sheet when the browser can share files (https), otherwise a
 *  plain download of the main file; the list below the rail has the rest. */
async function deliver(files) {
  const main = files[0];
  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files, title: main.name });
      return toast("shared");
    }
    if (navigator.canShare?.({ files: [main] })) {
      await navigator.share({ files: [main], title: main.name });
      return toast("shared");
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
  }
  const a = h("a", { href: lastFiles[0].url, download: main.name });
  document.body.append(a);
  a.click();
  a.remove();
  toast(`saved ${main.name} to downloads`, 2600);
}

render();
