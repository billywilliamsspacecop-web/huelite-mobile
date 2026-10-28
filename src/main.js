import { app, canOpen, COMPLETE, DEFAULT_FILAMENTS, defaultData, MOBILE_OUTPUT_PX, PENDING,
         sanitizeProject, setStatus, STAGE_LABELS, STAGE_REQUIRES, STAGES } from "./state.js";
import { ASPECTS, createCropper, loadPhoto } from "./crop.js";
import * as shape from "./engine/shape.js";
import * as solve from "./engine/solve.js";
import * as mesh from "./engine/mesh.js";
import * as bambu3mf from "./engine/bambu3mf.js";
import * as imaging from "./engine/imaging.js";
import { createView3D, renderSideThumb } from "./engine/view3d.js";
import { attachSwipe } from "./swipe.js";
import * as store from "./store.js";
import * as projectzip from "./engine/projectzip.js";
import { uuid } from "./state.js";
import { h } from "./dom.js";
import { attachRail, colourSheet, folderSheet, slider } from "./ui.js";
import { hexToRgb, toHex } from "./colour.js";

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
let lassoTool = "cut";        // cut | back | only
let solveShaded = false;      // relief lighting on the top-down print (off = flat, exact colours)
let exportView = "top";       // top | angle, when the preview pane is too small for both
let rail = null;              // scroll rail on the controls pane
let currentSheet = null;      // open colour sheet, if any
let enter = "rise";             // how the next render comes in: fwd | back | rise (reset after use)
const disposers = [];         // things a screen must release before the next one draws (GL contexts)

// ---------------------------------------------------------------- helpers
const head = (text) => h("div", { class: "section-head" }, `[ ${text} ]`);
// Desktop view panel: corner marks + optional caption.
const frame = (caption, ...kids) => h("div", { class: "frame" },
  h("i"), h("i"), h("i"), h("i"),
  caption ? h("div", { class: "frame-caption" }, caption) : null, ...kids);
const kv = (pairs) => h("dl", { class: "kv" },
  pairs.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
/** A screen is a preview pane plus a controls pane. Controls are split at
 *  each [ heading ] into groups, so a wide pane can lay them out in columns
 *  without tearing a heading away from its controls. */
function pane(cls, ...kids) {
  const flat = kids.flat(Infinity).filter((k) => k != null && k !== false);
  if (!cls.split(" ").includes("ctrl")) return h("div", { class: `pane ${cls}` }, ...flat);
  const inner = h("div", { class: "ctrl-inner" });
  let group = null;
  for (const k of flat) {
    if (!group || (k instanceof Element && k.classList.contains("section-head"))) {
      group = h("div", { class: "group" });
      inner.append(group);
    }
    group.append(k);
  }
  return h("div", { class: `pane ${cls}` }, inner);
}
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

function rangeField(labelText, value, { min, max, step = 1, fmt, oninput, key = false }) {
  const out = h("span", { class: "range-val" }, fmt(value));
  return h("div", { class: `range${key ? " key" : ""}` },
    h("div", { class: "range-head" }, h("span", {}, labelText), out),
    slider({ min, max, step, value, fmt, onInput: (v) => { out.textContent = fmt(v); oninput(v); } }));
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

/** HueLite's loading mark: filament layers stacking up under a print head. */
function loader(label, mini = false) {
  return h("div", { class: `loader${mini ? " mini" : ""}`, role: "status" },
    h("div", { class: "stack" }, h("i"), h("i"), h("i"), h("i"), h("b", { class: "nozzle" })),
    h("div", { class: "loader-label" }, label.replace(/[….]+$/, ""),
      h("span", { class: "dots" }, h("i", {}, "."), h("i", {}, "."), h("i", {}, "."))));
}

/** Re-run a one-shot CSS animation (view swaps) by restarting its class. */
function pulse(el, cls = "swap") {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Run something heavy with a "working" veil, after the veil has painted. */
async function busy(label, fn) {
  const veil = h("div", { class: "veil" }, loader(label));
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
for (const ev of ["input", "change", "click", "pointerup"]) root.addEventListener(ev, persistSoon);
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
    app.project = sanitizeProject(rec.data);
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
    if (file.size > 400 * 1024 * 1024) throw new Error("that file is too big to be a HueLite project");
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

// ---------------------------------------------------------------- layout
/** Stacked (preview over controls) on narrow/tall screens; side by side when
 *  the screen is square-ish or landscape; two previews at once when there is
 *  height to spare; a slim frame when the screen is short (phone on its side). */
const layout = { side: false, dual: false, short: false };

function measureLayout() {
  const w = window.innerWidth, hh = window.innerHeight, ratio = w / Math.max(1, hh);
  const side = w >= 560 && ratio >= 0.85;
  return { side, dual: side && hh >= 780, short: hh < 520 };
}

function applyLayout(next) {
  Object.assign(layout, next);
  const el = document.documentElement;
  el.dataset.side = layout.side ? "1" : "";
  el.dataset.dual = layout.dual ? "1" : "";
  el.dataset.short = layout.short ? "1" : "";
}

let layoutTimer = 0;
function onResize() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    // a soft keyboard can shrink the window; never rebuild a screen mid-typing
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return;
    const next = measureLayout();
    const rebuild = next.side !== layout.side || next.dual !== layout.dual || next.short !== layout.short;
    const keep = root.querySelector(".pane.ctrl")?.scrollTop || 0;
    applyLayout(next);
    if (rebuild) {
      render();
      const c = root.querySelector(".pane.ctrl");
      if (c) c.scrollTop = keep;
    }
    cropper?.relayout();
    rail?.update();
  }, 150);
}
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", onResize);
applyLayout(measureLayout());

// ---------------------------------------------------------------- shell
function render() {
  disposers.splice(0).forEach((fn) => fn());
  currentSheet?.close();
  currentSheet = null;
  cropper?.destroy();
  cropper = null;
  rail?.destroy();
  rail = null;
  root.innerHTML = "";
  // one-shot: resizes and rebuilds that follow don't replay the entrance
  if (enter) root.dataset.enter = enter; else delete root.dataset.enter;
  enter = null;
  root.dataset.stage = app.stage;
  document.documentElement.dataset.stage = app.stage;

  const home = !app.project;
  root.dataset.home = home ? "1" : "";
  const name = app.project?.name || "projects";
  const n = STAGES.indexOf(app.stage) + 1;
  const header = h("header", { class: "top" },
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
          STAGE_SUB[app.stage]));

  const screen = h("main", { class: "screen" });
  const action = h("div", { class: "action" });
  ({ prep: renderPrep, solve: renderSolve, export: renderExport })[app.stage](screen, action);
  const dock = h("div", { class: "dock" }, action.childElementCount ? action : null,
    home ? null : renderStepper());
  const body = h("div", { class: "body" }, screen);
  root.append(header, body, dock);

  const ctrl = screen.querySelector(".pane.ctrl");
  if (ctrl) rail = attachRail(ctrl, screen);
  screen.querySelectorAll(".ctrl-inner > .group").forEach((g, i) => g.style.setProperty("--i", String(Math.min(i, 9))));

  // swipe left / right between stages
  if (app.project) {
    const at = STAGES.indexOf(app.stage);
    disposers.push(attachSwipe(body, {
      drag: screen,
      canGo: (dir) => !!STAGES[at + dir] && canOpen(STAGES[at + dir]),
      onGo: (dir) => go(STAGES[at + dir]),
      onBlocked: (dir) => {
        const to = STAGES[at + dir];
        if (to && !canOpen(to)) toast(`Finish ${STAGE_LABELS[STAGE_REQUIRES[to]]} first`);
      },
    }));
  }
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
  const from = STAGES.indexOf(app.stage), to = STAGES.indexOf(stage);
  enter = app.project && from !== to ? (to > from ? "fwd" : "back") : "rise";
  app.stage = stage;
  render();
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
  if (!Array.isArray(p.shape.cuts)) p.shape.cuts = [];   // lasso loops, in photo coordinates
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
    if (p.shape.mode === "rect" && !p.shape.cuts.length) {
      shapeNote.textContent = "prints the whole crop";
      return null;
    }
    const id = cropSample(oriented, [x, y, w, hgt], PREP_OVERLAY_PX);
    const m = buildMask(id, [x, y, w, hgt]);
    shapeNote.textContent = shapeVerdict(p.shape.mode, m);
    if (!m) return null;
    return canvasOf(checkered(m, id.width, id.height));
  };

  // what Prep will actually hand to Solve: adjusted, with the shape cut
  const resultHost = h("div", { class: "result-view" });
  let resultTimer = 0;
  const renderResult = () => {
    if (!cropper || resultHost.hidden) return;
    const crop = cropper.getCrop();
    const id = cropSample(cropper.oriented(), crop, PREP_RESULT_PX);
    const m = buildMask(id, crop);
    shape.flatten(id);
    // Pixel blocks and the denoise window are measured in pixels at output
    // resolution, and this preview is smaller than that. Scale both to the
    // preview, or it would show a smoother picture than Prep commits.
    const adj = { ...imaging.DEFAULT_ADJUSTMENTS, ...p.adjustments };
    const outW = Math.round(crop[2] * Math.min(1, MOBILE_OUTPUT_PX / Math.max(crop[2], crop[3])));
    const shrink = id.width / Math.max(1, outW);
    if (adj.pixelize > 0) {
      const blockPreview = (1 + adj.pixelize * 23) * shrink;
      adj.pixelize = Math.max(0, Math.min(1, (blockPreview - 1) / 23));
    }
    if (adj.denoise > 0.01 && shrink < 1) {
      const radiusOut = Math.max(1, Math.round(adj.denoise * 4));
      adj.denoise = Math.max(1, Math.round(radiusOut * shrink)) / 4;
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
  function showView(k) {
    if (k !== "crop" && lassoOn) setLassoOn(false);   // nothing to draw on in the result view
    const was = prepView;
    prepView = k;
    cropHost.hidden = !layout.dual && k !== "crop";
    resultHost.hidden = !layout.dual && k !== "result";
    viewChips.querySelectorAll(".chip").forEach((c, i) => c.classList.toggle("on", (i === 0) === (k === "crop")));
    if (!resultHost.hidden) renderResult();
    if (!layout.dual && was !== k) pulse(k === "crop" ? cropHost : resultHost);
  }
  /** an adjustment moved: show its effect */
  const adjusted = () => {
    invalidate();
    if (!layout.dual && prepView !== "result") showView("result"); else queueResult();
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
    const [freshKey, freshFine] = [buildKeySliders(), buildFineSliders()];
    keySliders.replaceWith(freshKey);
    fineSliders.replaceWith(freshFine);
    keySliders = freshKey;
    fineSliders = freshFine;
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
  const adjSlider = (label, key, min, max, fmt, { scale = 100, key: big = false } = {}) =>
    rangeField(label, Math.round(p.adjustments[key] * scale), { min, max, fmt, key: big,
      oninput: (v) => { p.adjustments[key] = v / scale; adjusted(); } });
  // the two that matter most sit first, and a little bigger
  const buildKeySliders = () => h("div", {},
    rangeField("decimate", p.adjustments.decimate || 1, { min: 1, max: 32, key: true,
      fmt: (v) => (v >= 2 ? `${v} colours` : "off"),
      oninput: (v) => { p.adjustments.decimate = v >= 2 ? v : 0; adjusted(); } }),
    adjSlider("saturation", "saturation", -100, 100, pct, { key: true }));
  const buildFineSliders = () => h("div", {},
    adjSlider("brightness", "brightness", -60, 60, pct),
    adjSlider("contrast", "contrast", -60, 60, pct),
    adjSlider("denoise", "denoise", 0, 100, (v) => (v ? `${v}%` : "off")),
    adjSlider("sharpen", "sharpen", 0, 100, (v) => (v ? `${v}%` : "off")),
    adjSlider("pixelize", "pixelize", 0, 100, (v) => (v ? `${Math.round(1 + v / 100 * 23)} px blocks` : "off")),
    h("button", { class: "btn wide", style: "margin-top:8px",
      onclick: () => setAdjustments(imaging.DEFAULT_ADJUSTMENTS, "adjustments reset") }, "reset adjustments"));
  let keySliders = buildKeySliders();
  let fineSliders = buildFineSliders();

  // ---- lasso: draw a loop around what you don't want; each loop chips more away
  let lassoOn = false;
  let bigBefore = null;           // preview size to go back to when the lasso closes
  const TOOLS = [
    { key: "cut", label: "cut away", tip: "Remove what's inside the loop." },
    { key: "back", label: "put back", tip: "Restore what a cut took away." },
    { key: "only", label: "keep only", tip: "Keep what's inside the loop, remove everything else." },
  ];
  const lassoNote = h("p", { class: "meta" }, "");
  const lassoBtn = h("button", { class: "btn wide lasso-btn", type: "button", onclick: () => setLassoOn(!lassoOn) }, "");
  const undoCut = h("button", { class: "chip", type: "button", onclick: () => {
    if (!p.shape.cuts.length) return;
    p.shape.cuts.pop();
    cutsChanged();
  } }, "↶ undo");
  const clearCuts = h("button", { class: "chip", type: "button", onclick: () => {
    if (!p.shape.cuts.length) return;
    if (p.shape.cuts.length > 1 && !confirm(`Remove all ${p.shape.cuts.length} cuts?`)) return;
    p.shape.cuts = [];
    cutsChanged();
  } }, "clear");
  const toolChips = chipGroup(TOOLS, lassoTool, (k) => { lassoTool = k; cropper?.setLassoTool(k); });
  const lassoBar = h("div", { class: "lasso-bar", hidden: true },
    toolChips, h("div", { class: "chips" }, undoCut, clearCuts,
      h("button", { class: "chip accent", type: "button", onclick: () => setLassoOn(false) }, "done")));

  function updateLassoUi() {
    const n = p.shape.cuts.length;
    lassoBtn.textContent = lassoOn ? "✓ done lassoing" : "✂ lasso cut";
    lassoBtn.classList.toggle("on", lassoOn);
    undoCut.disabled = !n;
    clearCuts.disabled = !n;
    lassoNote.textContent = lassoOn
      ? "draw a loop around the part to change with your finger. it works on top of the shape above."
      : n ? `${n} cut${n === 1 ? "" : "s"} so far. start the lasso to chip away more.`
          : "draw around anything you don't want printed. each loop chips a bit more away - undo steps back.";
  }
  function cutsChanged() {
    invalidate();
    cropper?.refreshOverlay();
    updateLassoUi();
  }
  function setLassoOn(on) {
    if (on && !cropper) return;
    lassoOn = on;
    const el = document.documentElement;
    if (on) {
      if (!layout.dual && prepView !== "crop") showView("crop");
      // a bigger photo to draw on (stacked layouts only)
      if (!layout.side) { bigBefore = el.dataset.big || ""; el.dataset.big = "1"; }
      cropper.setLasso({ tool: lassoTool, onStroke: (loop) => {
        p.shape.cuts.push({ tool: lassoTool, pts: loop });
        cutsChanged();
      } });
    } else {
      cropper?.setLasso(null);
      if (bigBefore !== null) { el.dataset.big = bigBefore; bigBefore = null; }
    }
    lassoBar.hidden = !on;
    updateLassoUi();
    requestAnimationFrame(() => { cropper?.relayout(); rail?.update(); });
  }
  updateLassoUi();
  disposers.push(() => {
    if (bigBefore !== null) document.documentElement.dataset.big = bigBefore;   // leaving mid-lasso
  });

  screen.append(
    layout.dual
      ? pane("view", frame("crop", cropHost), frame("result", resultHost), lassoBar)
      : pane("view", h("div", { class: "view-bar" }, viewChips, bigButton()),
          frame(null, cropHost, resultHost), lassoBar),
    pane("ctrl",
      head("colour & detail"),
      keySliders,
      presets,
      paintNote,
      head("fine tune"),
      fineSliders,

      head("crop"),
      h("div", { class: "row" },
        h("button", { class: "btn grow", onclick: () => {
          p.rotate_deg = (p.rotate_deg + 270) % 360; // counter-clockwise
          cropper?.setOrientation(p.rotate_deg, p.flip_h);
        } }, "↺ rotate"),
        h("button", { class: "btn grow", onclick: () => {
          p.flip_h = !p.flip_h;
          cropper?.setOrientation(p.rotate_deg, p.flip_h);
        } }, "⇋ flip"),
        h("button", { class: "btn grow", onclick: () => cropper?.reset() }, "reset")),
      h("div", { class: "gap-top" }, aspectRow),
      readout,

      head("shape"),
      shapeChips,
      h("div", { class: "gap-top" }, tolerance),
      shapeNote,
      !app.sourceHasAlpha && h("p", { class: "meta" },
        "tip: a PNG with a transparent background prints as exactly that outline."),

      head("lasso cut"),
      lassoBtn,
      lassoNote,

      head("print size"),
      numField("width (mm)", p.physical_width_mm, { step: "1", min: 20, max: 256,
        onchange: (v) => { p.physical_width_mm = v; updateReadout(p.crop); invalidate(); cropper?.refreshOverlay(); } }),
      h("p", { class: "meta" }, "A1 bed is 256 mm · A1 mini is 180 mm")),
  );

  action.append(
    h("button", { class: "btn ghost", onclick: () => picker.click() }, "new photo"),
    h("button", { class: "btn primary", onclick: commitPrep }, "prep  &  continue  →"),
  );
}

/** Stacked layouts give the preview 40% of the screen; this stretches it. */
function bigButton() {
  const el = document.documentElement;
  return h("button", { class: "big-btn", type: "button", "aria-label": "bigger or smaller preview",
    title: "bigger / smaller preview", onclick: () => {
      el.dataset.big = el.dataset.big === "1" ? "" : "1";
      requestAnimationFrame(() => { cropper?.relayout(); rail?.update(); });
    } }, "⤢");
}

// ---------------------------------------------------------------- home
const pref = (k, fb) => { try { return localStorage.getItem(`huelite.${k}`) ?? fb; } catch { return fb; } };
const setPref = (k, v) => { try { localStorage.setItem(`huelite.${k}`, v); } catch { /* private window */ } };

// A greyed-out slab, for a project that hasn't been solved yet.
const PLACEHOLDER_ART = `<svg viewBox="0 0 160 100" aria-hidden="true">
  <polygon points="22,56 100,38 142,52 64,74" fill="#2b2b28" stroke="#55554d" stroke-width="1.2" stroke-dasharray="4 3"/>
  <polygon points="22,56 64,74 64,83 22,65" fill="#222220" stroke="#55554d" stroke-width="1.2" stroke-dasharray="4 3"/>
  <polygon points="64,74 142,52 142,61 64,83" fill="#1b1b19" stroke="#55554d" stroke-width="1.2" stroke-dasharray="4 3"/>
</svg>`;

/** The solved print seen from the side, for the album. */
async function sideThumbFor(rec) {
  const [prepped, solved] = await Promise.all([store.getFile(rec.id, "prepped"), store.getFile(rec.id, "solved")]);
  if (!prepped || !solved) return null;
  const d = rec.data, lh = d.solve.layer_height_mm;
  const { lut } = solve.buildLut(d.solve.filaments, lh, d.solve.band_mode || "solid");
  return renderSideThumb({ heights: solved.heights, w: solved.w, h: solved.h, mask: prepped.mask || null, lut,
    layerH: lh, baseMm: d.solve.base_layers * lh, physicalW: d.prep.physical_width_mm, maxCols: 320 });
}
let sideQueue = Promise.resolve();   // one GL context at a time

function renderHome(screen) {
  const album = pref("view", "list") === "album";
  const holder = h("div", { class: "home-list" }, loader("loading projects", true));
  const collapsed = new Set((() => { try { return JSON.parse(pref("collapsed", "[]")); } catch { return []; } })());
  const keepCollapsed = () => setPref("collapsed", JSON.stringify([...collapsed]));

  const viewChips = chipGroup([{ key: "list", label: "list" }, { key: "album", label: "album" }],
    album ? "album" : "list", (k) => { setPref("view", k); render(); });
  const newBtn = h("button", { class: "btn wide", type: "button", onclick: () => picker.click() }, "+ new from a photo");

  const ctrl = pane("ctrl",
    h("div", { class: "home-bar" }, head("projects"), viewChips),
    album ? newBtn : null,
    holder,
    h("button", { class: "btn wide gap-top", onclick: () => zipPicker.click() }, "import a project (.zip)"),
    h("p", { class: "meta" }, "zip a project folder on the Mac (Finder › Compress) and open it here, " +
      "or save one from here and unzip it into Documents/HueLite/projects on the Mac."),
    h("p", { class: "stamp" }, `build ${__BUILD__}`));
  // the album is the whole screen; the list keeps the big "new" button beside it
  screen.append(...(album ? [ctrl] : [
    pane("view", frame(null, h("button", { class: "drop", onclick: () => picker.click() },
      h("b", {}, "+ new from a photo"),
      h("span", {}, "library or camera · PNG cut-outs keep their shape"),
      h("span", {}, "turns it into a layered, multi-filament print for the A1")))),
    ctrl]));

  const load = () => store.listProjects().then((raw) => {
    const recs = raw.map((r) => ({ ...r, data: sanitizeProject(r.data) }));
    if (!recs.length) {
      holder.replaceChildren(h("p", { class: "meta" }, "nothing saved yet - projects you start are kept on this phone."));
      return;
    }
    const folders = [...new Set(recs.map((r) => r.data.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const reload = () => load();

    const move = (rec) => folderSheet({ title: rec.data.name, folders, current: rec.data.group,
      onPick: async (g) => { await store.setGroup(rec.id, g); reload(); } });
    const remove = async (rec) => {
      if (!confirm(`Delete "${rec.data.name}" from this phone? This can't be undone.`)) return;
      await store.deleteProject(rec.id);
      render();
    };
    const meta = (rec) => {
      const next = STAGES.find((st) => rec.data.status[st] !== COMPLETE);
      const when = (rec.modified || "").replace("T", "  ").slice(0, 17);
      return `${when} · ${next ? `next: ${STAGE_LABELS[next].toLowerCase()}` : "complete"}`;
    };
    const pips = (rec) => h("span", { class: "pips" }, STAGES.map((st) =>
      h("i", { class: rec.data.status[st] === COMPLETE ? "on" : "" }, STAGE_LABELS[st])));

    const row = (rec) => {
      const img = h("img", { class: "thumb", alt: "" });
      if (rec.thumb) img.src = URL.createObjectURL(rec.thumb);
      return h("div", { class: "project" },
        h("button", { class: "project-open", onclick: () => openProject(rec.id) }, img,
          h("span", { class: "project-text" }, h("b", {}, rec.data.name), h("span", { class: "meta" }, meta(rec)), pips(rec))),
        h("button", { class: "project-del", title: "move to a folder", onclick: () => move(rec) }, "move"),
        h("button", { class: "project-del", title: "save as .zip", onclick: () => exportProjectZip(rec.id) }, "zip"),
        h("button", { class: "project-del", title: "delete", onclick: () => remove(rec) }, "✕"));
    };

    const card = (rec) => {
      const img = h("img", { alt: "", class: "side-img" });
      const ph = h("div", { class: "ph" });
      ph.innerHTML = PLACEHOLDER_ART;             // a fixed string above, never user data
      const art = h("div", { class: "card-art" }, ph, img,
        h("span", { class: "ph-cap" }, rec.data.status.solve === COMPLETE ? "" : "not solved yet"));
      if (rec.data.status.solve === COMPLETE) {
        sideQueue = sideQueue.then(async () => {
          let blob = await store.getFile(rec.id, "side");
          if (!blob) {
            blob = await sideThumbFor(rec);
            if (blob) await store.putFile(rec.id, "side", blob);
          }
          if (blob) {
            const url = URL.createObjectURL(blob);
            img.onload = () => { art.classList.add("has-art"); URL.revokeObjectURL(url); };
            img.src = url;
          }
        }).catch((err) => console.warn("no side view for", rec.data.name, err));
      }
      return h("div", { class: "card" },
        h("button", { class: "card-open", onclick: () => openProject(rec.id) }, art,
          h("span", { class: "card-text" }, h("b", {}, rec.data.name), h("span", { class: "meta" }, meta(rec)), pips(rec))),
        h("div", { class: "card-tools" },
          h("button", { type: "button", onclick: () => move(rec) }, "move"),
          h("button", { type: "button", onclick: () => exportProjectZip(rec.id) }, "zip"),
          h("button", { type: "button", onclick: () => remove(rec) }, "delete")));
    };

    const groupHead = (g, n) => h("div", { class: "group-head" },
      h("button", { class: "group-toggle", type: "button", onclick: () => {
        if (collapsed.has(g)) collapsed.delete(g); else collapsed.add(g);
        keepCollapsed();
        reload();
      } }, `${collapsed.has(g) ? "▸" : "▾"}  ${g || "no folder"}  (${n})`),
      g ? h("button", { class: "chip", type: "button", onclick: async () => {
        const next = prompt("Folder name", g);
        if (next === null) return;
        await store.renameGroup(g, next.trim().slice(0, 60));
        reload();
      } }, "rename") : null,
      g ? h("button", { class: "chip", type: "button", onclick: async () => {
        if (!confirm(`Take everything out of "${g}"? The projects stay; only the folder goes.`)) return;
        await store.renameGroup(g, "");
        reload();
      } }, "ungroup") : null);

    const nodes = [];
    for (const g of [...folders, ""]) {
      const items = recs.filter((r) => r.data.group === g);
      if (!items.length) continue;
      if (folders.length) nodes.push(groupHead(g, items.length));      // no folders yet: a flat list
      if (!collapsed.has(g)) nodes.push(h("div", { class: album ? "album-grid" : "projects" }, items.map(album ? card : row)));
    }
    holder.replaceChildren(...nodes);
  }).catch((err) => {
    console.error(err);
    holder.replaceChildren(h("p", { class: "meta" }, "couldn't read saved projects on this browser."));
  });
  load();
}

/** The print outline for an RGBA sample of the crop: the base shape the chips
 *  chose, then the hand cuts on top of it. null = print the whole crop. */
function buildMask(sample, crop) {
  const p = app.project.prep;
  const opts = { tolerance: p.shape.tolerance, pxPerMm: sample.width / p.physical_width_mm,
                 minFeatureMm: p.shape.min_feature_mm };
  let m = shape.build(p.shape.mode, sample, opts);
  const cuts = p.shape.cuts;
  if (cuts?.length && cropper) {
    const [cx, cy, cw, ch] = crop, { width: w, height: hh } = sample;
    m = shape.applyCuts(m, w, hh, cuts, (u, v) => {
      const [ox, oy] = cropper.toOriented(u, v);
      return [(ox - cx) * w / cw, (oy - cy) * hh / ch];
    });
    m = shape.clean(m, w, hh, opts.pxPerMm, opts.minFeatureMm);
  }
  return m;
}

function shapeVerdict(mode, m) {
  if (!m) return "prints the whole crop";
  const cover = shape.coverage(m);
  if (cover < 0.01) return "nothing left to print - lower the tolerance, or undo a cut";
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
    const mask = buildMask(data, cropper.getCrop());
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
    await store.deleteFile(id, "side");
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
    fitColours();
  }
  s.colours_seeded = true;

  const view = h("div", { class: "solve-view" });
  // one 3D view for the whole screen: made on first use, rebuilt in place as
  // the settings change, released when the screen goes
  let angle = null;
  const angleView = () => {
    if (angle === null) {
      angle = createView3D() || false;
      if (angle) disposers.push(() => angle.destroy());
    }
    return angle;
  };
  const ramp = h("div", { class: "ramp" });
  const readout = h("div");
  let live = null;

  const invalidate = () => {
    if (app.project.status.solve === COMPLETE) { setStatus("solve", PENDING); refreshStepper(); }
  };

  /** One preview canvas for the current settings. */
  const renderView = (kind) => {
    const { lh, baseLayers, mm } = solveSettings();
    const { proxy } = app;
    const baseMm = baseLayers * lh;
    let el;
    if (kind === "source") {
      const id = new ImageData(new Uint8ClampedArray(proxy.data.data), proxy.w, proxy.h);
      if (proxy.mask) for (let i = 0; i < proxy.mask.length; i++) if (!proxy.mask[i]) id.data.set([17, 17, 16, 255], i * 4);
      el = canvasOf(id);
    } else if (kind === "height") {
      el = canvasOf(mesh.renderHeight({ heights: live.heights, w: proxy.w, h: proxy.h, mask: proxy.mask }));
    } else if (kind === "oblique") {
      const gl = angleView();
      if (gl) {
        gl.set({ heights: live.heights, w: proxy.w, h: proxy.h, mask: proxy.mask, lut: live.lut,
                 layerH: lh, baseMm, physicalW: mm, maxCols: SOLVE_PROXY });
        return gl.el;
      }
      el = mesh.renderOblique({ heights: live.heights, w: proxy.w, h: proxy.h, lut: live.lut, mask: proxy.mask,
        baseHex: s.filaments[0].hex, layerH: lh, baseMm, physicalW: mm, targetWidth: 640, maxCols: 180,
        shaded: solveShaded });
    } else {
      el = canvasOf(mesh.renderTop({ heights: live.heights, w: proxy.w, h: proxy.h, lut: live.lut,
        mask: proxy.mask, layerH: lh, baseMm, cellMm: mm / proxy.w, shaded: solveShaded }));
    }
    el.className = "preview-out";
    return el;
  };
  const draw = () => {
    if (!live) return;
    // with room to spare, show the angle view beside whatever is selected
    const els = [renderView(solveView)];
    if (layout.dual) els.push(renderView(solveView === "oblique" ? "sim" : "oblique"));
    view.replaceChildren(...els);
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
    updateStrips();
    draw();
  };
  const queue = () => { invalidate(); clearTimeout(solveTimer); solveTimer = setTimeout(recompute, 150); };

  const viewChips = chipGroup([
    { key: "sim", label: "print" }, { key: "oblique", label: "angle" },
    { key: "height", label: "height" }, { key: "source", label: "photo" },
  ], solveView, (k) => { solveView = k; draw(); pulse(view); });
  const lightChip = h("button", { class: `chip${solveShaded ? " on" : ""}`, type: "button",
    title: "Relief lighting on the top-down print. Off shows every tone flat, exactly as it prints.",
    onclick: () => { solveShaded = !solveShaded; lightChip.classList.toggle("on", solveShaded); draw(); } },
    "light");

  /** What band i really prints as if it were `hex`: the colour at the top of
   *  its layers in the solved stack, or null if it has none. */
  const printedAs = (i, hex) => {
    const fils = s.filaments.map((f, k) => (k === i ? { ...f, hex } : f));
    if (!(fils[i].band_layers | 0)) return null;
    const { lut } = solve.buildLut(fils, s.layer_height_mm, s.band_mode || "solid");
    const top = fils.slice(0, i + 1).reduce((n, f) => n + (f.band_layers | 0), 0);
    return solve.rgbToHex(lut[Math.min(lut.length - 1, top)].map(Math.round));
  };

  /** The prepped photo as a tap-to-pick surface for the colour sheet. */
  const photoPicker = () => {
    const { w, h: hh, data, mask } = app.prepped;
    const k = Math.min(1, 640 / Math.max(w, hh));
    const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(hh * k));
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const src = canvasOf(data);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, cw, ch);
    if (mask) {
      const shown = ctx.getImageData(0, 0, cw, ch);
      const small = shape.resize(mask, w, hh, cw, ch);
      ctx.putImageData(checkered(small, cw, ch, shown), 0, 0);
    }
    return {
      canvas: c,
      // average a small neighbourhood so one noisy pixel doesn't pick the colour
      sample(nx, ny) {
        const cx = Math.min(w - 1, Math.floor(nx * w)), cy = Math.min(hh - 1, Math.floor(ny * hh));
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= w || y >= hh) continue;
          const pi = y * w + x;
          if (mask && !mask[pi]) continue;
          r += data.data[pi * 4]; g += data.data[pi * 4 + 1]; b += data.data[pi * 4 + 2]; n++;
        }
        return n ? toHex([r / n, g / n, b / n]) : null;
      },
    };
  };

  const openColour = (f, i, btn) => {
    currentSheet?.close();
    currentSheet = colourSheet({
      title: `slot ${f.slot} colour`,
      hex: f.hex,
      printedAs: (hex) => printedAs(i, hex),
      palette: solve.importColours(app.prepped.data.data, app.prepped.mask, 12),
      photo: photoPicker(),
      onChange: (hex) => {
        f.hex = hex; f.name = "";
        s.colours_auto = false;   // picked by hand: leave it alone from here on
        btn.style.background = hex;
        btn.setAttribute("aria-label", `slot ${f.slot} colour ${hex}`);
        queue();
      },
      onClose: () => { currentSheet = null; },
    });
  };

  // filaments
  let strips = [];
  /** the strip under each swatch: what that band really prints as, when that
   *  isn't simply the swatch */
  const updateStrips = () => {
    strips.forEach((el, i) => {
      const f = s.filaments[i];
      const pr = f && printedAs(i, f.hex);
      const was = f && hexToRgb(f.hex);
      el.hidden = !pr || hexToRgb(pr).every((c, k) => Math.abs(c - was[k]) <= 3);
      if (pr) el.style.background = pr;
    });
  };
  /** colours that were picked by the fit follow the stack when it changes */
  const refit = () => { if (s.colours_auto) { fitColours(); refitTable(); } };
  const filTable = () => {
    strips = [];
    const table = h("div", { class: "fil-table" },
      h("span"), h("span", { class: "th" }, "colour"), h("span", { class: "th" }, "TD mm"),
      h("span", { class: "th" }, "layers"),
      s.filaments.flatMap((f, i) => {
        const strip = h("i", { class: "pr", hidden: true });
        strips.push(strip);
        return [
          h("span", { class: "idx" }, String(f.slot)),
          h("button", { class: "sw", type: "button", style: `background:${f.hex}`,
            "aria-label": `slot ${f.slot} colour ${f.hex}`, onclick: (e) => openColour(f, i, e.currentTarget) }, strip),
          h("input", { class: "val", type: "number", inputmode: "decimal", step: "0.05", min: "0.05", max: "6",
            value: Number(f.td_mm).toFixed(2), onchange: (e) => {
              const v = Math.min(6, Math.max(0.05, parseFloat(e.target.value) || f.td_mm));
              f.td_mm = v; e.target.value = v.toFixed(2); refit(); queue();
            } }),
          h("input", { class: "val", type: "number", inputmode: "numeric", step: "1", min: "0", max: "120",
            value: String(f.band_layers), onchange: (e) => {
              const v = Math.min(120, Math.max(0, parseInt(e.target.value, 10) || 0));
              f.band_layers = v; e.target.value = String(v); refit(); queue();
            } }),
        ];
      }));
    return table;
  };
  let filEl = filTable();
  const refitTable = () => { const fresh = filTable(); filEl.replaceWith(fresh); filEl = fresh; };

  const borderWidth = numField("rim width (mm)", s.border.width_mm ?? 3, { step: "0.5", min: 0.4, max: 15,
    onchange: (v) => { s.border.width_mm = v; queue(); } });
  const frameSlot = numField("frame colour (slot)", s.border.frame_slot ?? 1, { step: "1", min: 1, max: s.filaments.length,
    onchange: (v) => { s.border.frame_slot = Math.round(v); queue(); } });

  // with room beside the preview the summary sits under it; otherwise it
  // leads the controls
  const readoutBeside = layout.side && !layout.short;   // a short screen needs every pixel for the preview
  const summary = [ramp, h("p", { class: "meta" }, "reachable tones, bottom layer to top")];
  screen.append(
    pane("view",
      h("div", { class: "view-bar" }, viewChips, lightChip, layout.side ? null : bigButton()),
      frame(null, view),
      h("div", { class: "below-view" }, summary, readoutBeside ? readout : null)),
    pane("ctrl",
      readoutBeside ? null : [head("summary"), readout],
      head("filaments"),
      h("p", { class: "meta" }, "slot 1 prints lowest · tap a swatch to choose its colour"),
      filEl,
      h("button", { class: "btn wide gap-top", onclick: () => {
        fitColours(); refitTable(); queue();
      } }, "fit colours to photo"),
      h("p", { class: "meta" }, "picks the filament colours that make the printed stack look most like your prepped photo. " +
        "the strip under a swatch is what that band really prints as."),

      head("layers"),
      numField("layer height (mm)", s.layer_height_mm, { step: "0.02", min: 0.04, max: 0.3, fmt: (v) => v.toFixed(2),
        onchange: (v) => { s.layer_height_mm = v; queue(); } }),
      numField("base depth (mm)", +(s.base_layers * s.layer_height_mm).toFixed(2), { step: "0.2", min: 0.4, max: 8,
        fmt: (v) => v.toFixed(2),
        onchange: (v) => { s.base_layers = Math.max(2, solve.layersForMm(v, s.layer_height_mm)); queue(); } }),

      head("colour"),
      chipGroup([{ key: "solid", label: "solid bands" }, { key: "blend", label: "translucent blend" }],
        s.band_mode || "solid", (k) => { s.band_mode = k; refit(); queue(); }),
      h("div", { class: "gap-top" },
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
      app.prepped.mask && h("p", { class: "meta" }, "the rim follows the outline"),
      borderWidth, frameSlot),
  );

  action.append(
    h("button", { class: "btn ghost", onclick: () => go("prep") }, "back to prep"),
    h("button", { class: "btn primary", onclick: commitSolve }, "solve  &  continue  →"),
  );
  requestAnimationFrame(recompute);
}

/** Set every slot's colour to what makes the printed stack match the photo
 *  (see solve.fitFilaments), not just the photo's own colours - a stack
 *  doesn't print its swatches, and translucent bands in particular never
 *  reach theirs. */
function fitColours() {
  const { s, lh, mode } = solveSettings();
  const { data, mask } = app.prepped;
  const seeds = solve.importColours(data.data, mask, s.filaments.length);
  const start = s.filaments.map((f, i) => seeds[i] ?? f.hex);
  const fitted = solve.fitFilaments(data.data, mask, s.filaments.map((f, i) => ({ ...f, hex: start[i] })),
    lh, mode, { start });
  fitted.forEach((hex, i) => { s.filaments[i].hex = hex; s.filaments[i].name = ""; });
  s.colours_auto = true;
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
    // the album's side view; a missing one is made later, so never block on it
    renderSideThumb({ heights, w, h: hh, mask: app.prepped.mask, lut, layerH: lh, baseMm: baseLayers * lh,
      physicalW: app.project.prep.physical_width_mm, maxCols: 320 })
      .then((blob) => blob && store.putFile(app.project.id, "side", blob)).catch(() => {});
    const top = canvasOf(mesh.renderTop({ heights, w, h: hh, lut, mask: app.prepped.mask, layerH: lh,
      baseMm: baseLayers * lh, cellMm: app.project.prep.physical_width_mm / w, shaded: false }));
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

  // flat colours: a top-down view should show exactly what each tone is
  const top = canvasOf(mesh.renderTop({ heights, w, h: hh, lut, mask, layerH: lh,
    baseMm: baseLayers * lh, cellMm: mm / w, shaded: false }));
  top.className = "preview-out";
  let oblique;
  const gl3 = createView3D();
  if (gl3) {
    disposers.push(() => gl3.destroy());
    gl3.set({ heights, w, h: hh, mask, lut, layerH: lh, baseMm: baseLayers * lh, physicalW: mm, maxCols: 800 });
    oblique = gl3.el;
  } else {
    oblique = mesh.renderOblique({ heights, w, h: hh, lut, mask, baseHex: s.filaments[0].hex,
      layerH: lh, baseMm: baseLayers * lh, physicalW: mm, targetWidth: 640 });
    oblique.className = "preview-out";
  }

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

  // both previews when there is height for them, otherwise one at a time
  const showExport = () => {
    top.hidden = !layout.dual && exportView !== "top";
    oblique.hidden = !layout.dual && exportView !== "angle";
  };
  const exportChips = chipGroup([{ key: "top", label: "top down" }, { key: "angle", label: "angle" }],
    exportView, (k) => { exportView = k; showExport(); pulse(k === "top" ? top : oblique); });
  showExport();
  screen.append(
    layout.dual
      ? pane("view", frame("top down", top), frame("~30° from the plate", oblique), h("div", { class: "below-view" }, stats))
      : pane("view", h("div", { class: "view-bar" }, exportChips, bigButton()),
          frame(null, top, oblique), h("div", { class: "below-view" }, stats)),
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

// ---------------------------------------------------------------- updates
// Offline support keeps the app's files on the phone. When a newer build has
// been published, the service worker fetches it in the background and this
// bar offers the switch, so a deploy reaches an open app without hunting for
// a refresh. Production builds only.
function showUpdateBar() {
  if (document.querySelector(".update-bar")) return;
  document.body.append(h("div", { class: "update-bar" },
    h("span", {}, "a new version of HueLite is ready"),
    h("button", { type: "button", onclick: () => location.reload() }, "reload")));
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // The first time a worker takes over (first install) is not an update; any
  // change of worker after that is.
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controlled) showUpdateBar();
    controlled = true;
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
      setInterval(check, 30 * 60 * 1000);
    }).catch((err) => console.warn("offline mode unavailable", err));
  });
}
