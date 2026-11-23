import { allFolders, app, canOpen, COMPLETE, DEFAULT_FILAMENTS, defaultData, folderLeaf, folderName, folderParent,
         joinFolder, MOBILE_OUTPUT_PX, PENDING, sanitizeProject, setStatus, STAGE_LABELS, STAGE_REQUIRES,
         STAGES } from "./state.js";
import { ASPECTS, createCropper, loadPhoto } from "./crop.js";
import * as shape from "./engine/shape.js";
import * as solve from "./engine/solve.js";
import * as mesh from "./engine/mesh.js";
import * as bambu3mf from "./engine/bambu3mf.js";
import * as backart from "./engine/backart.js";
import * as lineart from "./engine/lineart.js";
import * as imaging from "./engine/imaging.js";
import { createView3D, renderSideThumb } from "./engine/view3d.js";
import { attachSwipe } from "./swipe.js";
import * as sfx from "./sfx.js";
import * as store from "./store.js";
import * as projectzip from "./engine/projectzip.js";
import { makeZip, readZip } from "./engine/zip.js";
import { uuid } from "./state.js";
import { h } from "./dom.js";
import { actionSheet, attachRail, colourSheet, folderSheet, slider } from "./ui.js";
import { hexToRgb, toHex } from "./colour.js";
import { amsIcon, amsName, paintSpool, slotBadge, spool } from "./spool.js";

const root = document.getElementById("app");
const SOLVE_PROXY = 360;      // live solve resolution (long edge)
const PREP_OVERLAY_PX = 320;  // shape preview resolution (long edge)
const PREP_RESULT_PX = 420;   // adjusted-result preview resolution (long edge)
let cropper = null;
let aspectKey = "free";
let solveView = "sim";
let solveTimer = 0;
let exportOpts = { detail: "fine", formats: { "3mf": true, stl: false } };   // fine: barely bigger files, more detail
const BED_MM = bambu3mf.BUILD_VOLUME_MM;   // the Bambu Lab A1 plate: 256 x 256 x 256 mm
// the most a print can be and still fit with its 5 mm brim, 3 mm from each edge
const PRINT_MAX_MM = BED_MM - 2 * (5 + 3);
let lastFiles = [];           // [{ name, url }] from the last export
let prepView = "crop";        // crop | result
let preSuggest = null;        // adjustments before the last "suggest", for undo
let lassoTool = "cut";        // cut | back | only
let solveShaded = false;      // relief lighting on the top-down print (off = flat, exact colours)
let exportView = "top";       // top | angle | back, when the preview pane is too small for all
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
  back: "line art for the plate side",
  export: "mesh, package, and send to the printer",
};

let toastTimer;
function toast(msg, ms = 1800) {
  if (/couldn't|can't|failed|too big|missing|damaged|unsupported/i.test(msg)) sfx.play("error");
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
async function busy(label, fn, { quiet = false } = {}) {
  const veil = h("div", { class: "veil" }, loader(label));
  document.body.append(veil);
  const done = sfx.loading();
  await nextFrame();
  try {
    const result = await fn();
    done(true, quiet);                 // quiet where the work ends by changing page
    return result;
  } catch (err) {
    done(false);
    throw err;
  } finally { veil.remove(); }
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

/** Start a new project from a picked photo (gallery, camera or files). */
async function startFromFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (/\.zip$/i.test(file.name) || /zip/.test(file.type)) {
      await importProjectZip(file);
      menuGo("projects");
      return;
    }
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
}
// Three ways in. "image/*" opens the phone's photo gallery (Android's photo
// picker, iOS's library); capture opens the camera; no accept at all opens the
// file browser (Android only uses the photo picker when every accepted type
// is an image, so this is how to reach Files / Downloads / Drive).
const picker = h("input", { type: "file", accept: "image/*", hidden: true, onchange: startFromFile });
const cameraPicker = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onchange: startFromFile });
const filePicker = h("input", { type: "file", hidden: true, onchange: startFromFile });
document.body.append(picker, cameraPicker, filePicker);

/** New project: the "new" page, with the gallery opened straight away (still
 *  inside the tap, which a browser requires before it opens a picker). */
function newProject() {
  menuGo("new");
  picker.click();
}

// ---------------------------------------------------------------- saving
let persistTimer = 0;
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistNow(), 700);
}

/** Save project.json now (and a fresh thumbnail, if given). */
let lastSaved = null;              // { at: Date, ok: bool } for the "saved" line on Export
const saveWatchers = new Set();
async function persistNow(thumb = undefined) {
  clearTimeout(persistTimer);
  if (!app.project) return false;
  app.project.modified = new Date().toISOString().slice(0, 19);
  try {
    await store.saveProject(app.project, thumb);
    lastSaved = { at: new Date(), ok: true };
    return true;
  } catch (err) {
    console.error(err);
    lastSaved = { at: new Date(), ok: false };
    toast("couldn't save - is the phone's storage full?", 3000);
    return false;
  } finally {
    saveWatchers.forEach((f) => f());
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
    go(st.back === COMPLETE ? "export" : st.solve === COMPLETE ? "back" : st.prep === COMPLETE ? "solve" : "prep");
  }, { quiet: true });
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

async function packProject(id) {
  const rec = await store.getProject(id);
  const [source, prepped, solved] = await Promise.all(
    ["source", "prepped", "solved"].map((n) => store.getFile(id, n)));
  const st = rec.data.status;
  return projectzip.pack({ data: rec.data, source,
    prepped: st.prep === COMPLETE ? prepped : null,
    solved: st.prep === COMPLETE && st.solve === COMPLETE ? solved : null });
}

/** Every project on this phone in one .zip (a project .zip each, inside).
 *  "import" on Projects takes it back whole. */
async function backupAllProjects() {
  if (app.project) await persistNow();
  const result = await busy("backing up every project…", async () => {
    const recs = await store.listProjects();
    if (!recs.length) throw new Error("there are no projects to back up");
    const entries = [], skipped = [];
    for (const [i, rec] of recs.entries()) {
      try {
        const { blob, filename } = await packProject(rec.id);
        entries.push({ name: `${String(i + 1).padStart(3, "0")}-${filename}`, chunks: [new Uint8Array(await blob.arrayBuffer())] });
      } catch (err) { console.error(err); skipped.push(rec.data?.name || rec.id); }
    }
    const day = new Date().toISOString().slice(0, 10);
    return { blob: await makeZip(entries), filename: `huelite-backup-${day}-${entries.length}-projects.zip`, count: entries.length, skipped };
  }).catch((err) => { console.error(err); toast(`couldn't back up: ${err.message}`, 3600); return null; });
  if (!result) return;
  if (result.skipped.length) toast(`${result.skipped.length} couldn't be packed: ${result.skipped.join(", ")}`, 5000);
  await saveBlob(result.blob, result.filename);
}

/** The whole project as a desktop project folder, zipped. */
async function exportProjectZip(id) {
  if (app.project?.id === id) await persistNow();
  const result = await busy("packing project…", () => packProject(id)).catch((err) => { console.error(err); toast(`couldn't pack it: ${err.message}`, 3000); return null; });
  if (result) await saveBlob(result.blob, result.filename);
}

async function importProjectZip(file) {
  await busy("importing…", async () => {
    if (file.size > 2048 * 1024 * 1024) throw new Error("that file is too big to be a HueLite project");
    const bytes = new Uint8Array(await file.arrayBuffer());
    // a "back up all projects" file: one project .zip per entry
    const inner = [...readZip(bytes)].filter(([n]) => /\.zip$/i.test(n) && !n.startsWith("__MACOSX/"));
    if (inner.length) {
      let ok = 0;
      const failed = [];
      for (const [n, read] of inner) {
        try { await importProjectBytes(await read()); ok++; } catch (err) { console.error(err); failed.push(n); }
      }
      toast(`restored ${ok} project${ok === 1 ? "" : "s"}${failed.length ? ` · ${failed.length} failed` : ""}`, 3600);
      return;
    }
    const data = await importProjectBytes(bytes);
    toast(`imported "${data.name}"`, 2400);
  }).catch((err) => { console.error(err); toast(`couldn't import: ${err.message}`, 3600); });
  render();
}

async function importProjectBytes(bytes) {
  {
    const { data, source, prepped, solved } = await projectzip.unpack(bytes);
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
    return data;
  }
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
  menuPage = "main";
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
  sfx.setStage(app.stage);

  const home = !app.project;
  root.dataset.home = home ? "1" : "";
  const name = app.project?.name || "menu";
  sfx.setMenu(home);
  document.documentElement.dataset.menu = home && menuPage === "main" ? "1" : "";
  const n = STAGES.indexOf(app.stage) + 1;
  const header = h("header", { class: "top" },
    h("div", { class: "top-row" },
      h("h1", { class: "stage-title" }, home ? MENU_HEAD[menuPage][0] : `0${n} ${STAGE_LABELS[app.stage]}`),
      h("div", { class: "top-right" },
        soundButton(),
        app.project
          ? h("button", { class: "brand link", onclick: closeProject }, "☰ menu")
          : menuPage !== "main"
            ? h("button", { class: "brand link", onclick: () => menuGo("main") }, "‹ menu")
            : null)),
    home
      ? h("div", { class: "top-sub" }, MENU_HEAD[menuPage][1])
      : h("div", { class: "top-sub" },
          h("span", { class: "proj", onclick: rename }, name),
          h("span", { class: "dotsep" }, "·"),
          STAGE_SUB[app.stage]));

  const screen = h("main", { class: "screen" });
  const action = h("div", { class: "action" });
  ({ prep: renderPrep, solve: renderSolve, back: renderBackStage, export: renderExport })[app.stage](screen, action);
  const dock = h("div", { class: "dock" }, action.childElementCount ? action : null,
    home ? null : renderStepper());
  const body = h("div", { class: "body" }, screen);
  root.append(header, body, dock);

  const ctrl = screen.querySelector(".pane.ctrl");
  if (ctrl) rail = attachRail(ctrl, screen);
  const groups = screen.querySelectorAll(".ctrl-inner > .group");
  groups.forEach((g, i) => g.style.setProperty("--i", String(Math.min(i, 9))));
  // the page arrives: a whoong that rises going forward and falls going back,
  // then a soft ping for each control group as it lands
  const how = root.dataset.enter;
  if (app.project && (how === "fwd" || how === "back")) {
    sfx.play(how === "fwd" ? "pageFwd" : "pageBack");
    sfx.play("arrive", groups.length);
  }

  // swipe left / right between stages
  if (app.project && pref("swipe", "on") !== "off") {
    const at = STAGES.indexOf(app.stage);
    disposers.push(attachSwipe(body, {
      drag: screen,
      canGo: (dir) => !!STAGES[at + dir] && canOpen(STAGES[at + dir]),
      onGo: (dir) => go(STAGES[at + dir]),
      onBlocked: (dir) => {
        const to = STAGES[at + dir];
        if (to && !canOpen(to)) { sfx.play("blocked"); toast(`Finish ${STAGE_LABELS[STAGE_REQUIRES[to]]} first`); }
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
      if (locked) { sfx.play("blocked"); return toast(`Finish ${STAGE_LABELS[STAGE_REQUIRES[s]]} first`); }
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
  let widthField = null;
  /** The widest print of this crop that still fits the A1 plate (256 mm each way). */
  const fitToBed = (mm) => {
    const [, , w, hgt] = p.crop || cropper?.getCrop() || [0, 0, 1, 1];
    return Math.max(20, Math.min(mm, Math.floor(PRINT_MAX_MM / Math.max(1, hgt / w))));
  };
  const updateReadout = (crop) => {
    const [, , w, hgt] = crop;
    const k = Math.min(1, MOBILE_OUTPUT_PX / Math.max(w, hgt));
    const mmH = p.physical_width_mm * (hgt / w);
    const over = p.physical_width_mm > PRINT_MAX_MM + 0.5 || mmH > PRINT_MAX_MM + 0.5;
    readout.replaceChildren(kv([
      ["crop", `${w} × ${hgt} px`],
      ["solve", `${Math.round(w * k)} × ${Math.round(hgt * k)} px`],
      ["print", `${p.physical_width_mm.toFixed(0)} × ${mmH.toFixed(0)} mm${over ? `  ⚠ over ${PRINT_MAX_MM} mm: won't fit the A1 plate with its brim` : ""}`],
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
  const paintNote = h("p", { class: "meta hint" },
    "decimate flattens the photo to this many colours: the fewer, the cleaner the print. suggest picks a starting point.");
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
      setAdjustments(imaging.PRESETS[k], `preset: ${k} - ${PRESET_NOTES[k]}`) }, k)));
  const suggestRow = h("div", { class: "suggest-row" },
    h("button", { class: "btn accent-btn", type: "button", onclick: () => {
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
  // decimate is the one that matters: first, biggest; sharpen rides along
  const buildKeySliders = () => h("div", { class: "decimate-box" },
    rangeField("decimate", p.adjustments.decimate || 1, { min: 1, max: 32, key: true,
      fmt: (v) => (v >= 2 ? `${v} colours` : "off"),
      oninput: (v) => { p.adjustments.decimate = v >= 2 ? v : 0; adjusted(); } }),
    adjSlider("sharpen", "sharpen", 0, 100, (v) => (v ? `${v}%` : "off")));
  // the rest live in "more adjustments", closed: suggest still sets them
  const buildFineSliders = () => h("div", {},
    adjSlider("saturation", "saturation", -100, 100, pct),
    adjSlider("brightness", "brightness", -60, 60, pct),
    adjSlider("contrast", "contrast", -60, 60, pct),
    adjSlider("denoise", "denoise", 0, 100, (v) => (v ? `${v}%` : "off")),
    adjSlider("pixelize", "pixelize", 0, 100, (v) => (v ? `${Math.round(1 + v / 100 * 23)} px blocks` : "off")),
    h("div", { class: "gap-top" }, presets),
    h("button", { class: "btn wide", style: "margin-top:8px",
      onclick: () => setAdjustments(imaging.DEFAULT_ADJUSTMENTS, "adjustments reset") }, "reset adjustments"));
  let keySliders = buildKeySliders();
  let fineSliders = buildFineSliders();
  const moreBox = h("details", { class: "more-box" },
    h("summary", {}, "saturation, brightness, contrast, denoise, pixelize, presets"),
    fineSliders);

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
      keySliders,
      suggestRow,
      paintNote,

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
      widthField = numField("print width (mm)", p.physical_width_mm, { step: "1", min: 20, max: PRINT_MAX_MM,
        onchange: (v) => { v = fitToBed(v); widthField.querySelector("input").value = String(v); p.physical_width_mm = v; updateReadout(p.crop); invalidate(); cropper?.refreshOverlay(); } }),

      head("shape"),
      shapeChips,
      h("div", { class: "gap-top" }, tolerance),
      shapeNote,
      !app.sourceHasAlpha && h("p", { class: "meta hint" },
        "tip: a PNG with a transparent background prints as exactly that outline."),

      head("lasso cut"),
      lassoBtn,
      lassoNote,

      head("more adjustments"),
      moreBox),
  );

  action.append(
    h("button", { class: "btn ghost", onclick: () => picker.click() }, "new photo"),
    h("button", { class: "btn primary", onclick: commitPrep }, "next: solve  →"),
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

/** Route the home screen to whichever menu page is open. */
function renderHome(screen) {
  ({ main: menuMain, new: menuNew, projects: menuProjects, settings: menuSettings, help: menuHelp, about: menuAbout }[menuPage]
    || menuMain)(screen);
}

function menuProjects(screen) {
  const album = pref("view", "list") === "album";
  const holder = h("div", { class: "home-list" }, loader("loading projects", true));
  const collapsed = new Set((() => { try { return JSON.parse(pref("collapsed", "[]")); } catch { return []; } })());
  const keepCollapsed = () => setPref("collapsed", JSON.stringify([...collapsed]));

  const viewChips = chipGroup([{ key: "list", label: "list" }, { key: "album", label: "album" }],
    album ? "album" : "list", (k) => { setPref("view", k); render(); });
  const newBtn = h("button", { class: "btn wide", type: "button", onclick: newProject }, "+ new project");

  screen.append(pane("ctrl",
    h("div", { class: "home-bar" }, head("saved prints"), viewChips),
    newBtn,
    holder,
    head("files"),
    h("button", { class: "btn wide", onclick: () => backupAllProjects() }, "back up all projects (.zip)"),
    h("button", { class: "btn wide gap-top", onclick: () => zipPicker.click() }, "import a project or a backup (.zip)"),
    h("p", { class: "meta" }, "zip a project folder on the Mac (Finder › Compress) and open it here, " +
      "or save one from here and unzip it into Documents/HueLite/projects on the Mac.")));

  const load = () => store.listProjects().then((raw) => {
    const recs = raw.map((r) => ({ ...r, data: sanitizeProject(r.data) }));
    if (!recs.length) {
      holder.replaceChildren(h("p", { class: "meta" }, "nothing saved yet - projects you start are kept on this phone."));
      return;
    }
    const folders = allFolders(recs.map((r) => r.data.group).filter(Boolean));
    const reload = () => load();

    const move = (rec) => folderSheet({ title: rec.data.name, folders, current: rec.data.group,
      onPick: async (g) => { await store.setGroup(rec.id, g); reload(); } });
    // a whole folder, with everything in it, into another folder (or to the top)
    const moveFolder = (path) => folderSheet({ title: `move "${folderLeaf(path)}"`, folders, exclude: path,
      current: folderParent(path), noneLabel: "top level",
      onPick: async (into) => {
        const to = joinFolder(into, folderLeaf(path));
        if (to !== path) { await store.renameGroup(path, to); reload(); }
      } });
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

    // the folder tree: path -> { kids: [paths], items: [projects] }
    const tree = new Map([["", { kids: [], items: [] }]]);
    for (const f of folders) tree.set(f, { kids: [], items: [] });
    for (const f of folders) tree.get(folderParent(f)).kids.push(f);
    for (const r of recs) tree.get(r.data.group || "").items.push(r);
    const total = (p) => tree.get(p).items.length + tree.get(p).kids.reduce((s, k) => s + total(k), 0);

    // "g" is the full path; the head shows the folder's own name, indented by depth
    const groupHead = (g, n, depth = 0) => h("div", { class: "group-head", style: `--depth:${depth}` },
      h("button", { class: "group-toggle", type: "button", onclick: () => {
        if (collapsed.has(g)) collapsed.delete(g); else collapsed.add(g);
        keepCollapsed();
        reload();
      } }, `${collapsed.has(g) ? "▸" : "▾"}  ${g ? folderLeaf(g) : "no folder"}  (${n})`),
      // one button, so a nested folder's name keeps the width on a phone
      g ? h("button", { class: "chip group-more", type: "button", "aria-label": `${folderLeaf(g)} options`,
        onclick: () => folderActions(g) }, "⋯") : null);

    const folderActions = (g) => {
      const up = folderParent(g);
      actionSheet({ title: g.replaceAll("/", " › "), actions: [
        ["move", "into another folder, or to the top", () => moveFolder(g)],
        ["rename", null, async () => {
          const next = prompt("Folder name", folderLeaf(g));
          if (next === null || !folderName(next)) return;
          await store.renameGroup(g, joinFolder(up, folderName(next)));
          reload();
        }],
        ["ungroup", `its prints and folders move up into ${up ? folderLeaf(up) : "the top level"}`, async () => {
          if (!confirm(`Take everything out of "${folderLeaf(g)}"? Only the folder goes.`)) return;
          await store.renameGroup(g, up);
          reload();
        }],
      ] });
    };

    const list = (items) => h("div", { class: album ? "album-grid" : "projects" }, items.map(album ? card : row));
    /** One folder's contents: its sub-folders (each a head plus, when open, its own contents), then its prints. */
    const contents = (p, depth) => {
      const out = [];
      for (const k of tree.get(p).kids) {
        out.push(groupHead(k, total(k), depth));
        if (!collapsed.has(k)) {
          const inner = contents(k, depth + 1);
          if (inner.length) out.push(h("div", { class: "folder-body" }, inner));
        }
      }
      if (p && tree.get(p).items.length) out.push(list(tree.get(p).items));
      return out;
    };

    const nodes = [];
    if (!folders.length) nodes.push(list(recs));                      // no folders yet: a flat list
    else {
      nodes.push(...contents("", 0));
      const loose = tree.get("").items;
      if (loose.length) {
        nodes.push(groupHead("", loose.length));
        if (!collapsed.has("")) nodes.push(list(loose));
      }
    }
    holder.replaceChildren(...nodes);
  }).catch((err) => {
    console.error(err);
    holder.replaceChildren(h("p", { class: "meta" }, "couldn't read saved projects on this browser."));
  });
  load();
}

// ---------------------------------------------------------------- main menu
let menuPage = "main";    // main | new | projects | settings | help | about

const MENU_HEAD = {
  main: ["Main menu", "photo → layered print"],
  new: ["New project", "pick a photo to start from"],
  projects: ["Projects", "your saved prints"],
  settings: ["Settings", "sound, motion and gestures"],
  help: ["Help", "how HueLite works"],
  about: ["About", "version and privacy"],
};

function menuGo(page) {
  enter = page === "main" ? "back" : "fwd";
  menuPage = page;
  render();
}

// small line icons, fixed strings (never user data)
const ICONS = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h6.5l2 2.5H21v10H3z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3z"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9" r="1.5"/></svg>',
};
const icon = (name) => { const s = h("span", { class: "ico" }); s.innerHTML = ICONS[name]; return s; };

const menuItem = (n, title, hint, onclick, cls = "") =>
  h("button", { class: `menu-item ${cls}`, type: "button", onclick },
    h("span", { class: "mi-n" }, typeof n === "string" ? n : n),
    h("span", { class: "mi-t" }, h("b", {}, title), h("span", { class: "meta" }, hint)),
    h("span", { class: "mi-go" }, "›"));
/** The smaller menu entries, as tiles in a grid under the big three. */
const menuTile = (title, onclick) => h("button", { class: "menu-tile", type: "button", onclick }, title);

function menuMain(screen) {
  let latest = null;
  const cont = menuItem(icon("play"), "Continue", "", () => latest && openProject(latest.id), "menu-continue lead");
  cont.hidden = true;
  const projects = menuItem(icon("folder"), "Projects", "saved prints and folders", () => menuGo("projects"), "lead");
  const list = h("div", { class: "menu-list" },
    menuItem(icon("plus"), "New project", "start from a photo", newProject, "lead first"),
    cont,
    projects,
    h("div", { class: "menu-tiles" },
      menuTile("Import .zip", () => zipPicker.click()),
      menuTile("Settings", () => menuGo("settings")),
      menuTile("Help", () => menuGo("help")),
      menuTile("About", () => menuGo("about"))));
  list.querySelectorAll(".menu-item, .menu-tiles").forEach((el, i) => el.style.setProperty("--i", String(i)));

  screen.append(
    pane("view", frame(null, h("div", { class: "hero" },
      h("div", { class: "hero-mark" }, h("i"), h("i"), h("i"), h("i"), h("i")),
      h("div", { class: "hero-word" }, "HUELITE"),
      h("div", { class: "hero-sub" }, "multi-colour relief prints for the Bambu Lab A1")))),
    pane("ctrl", list, h("p", { class: "stamp" }, `build ${__BUILD__}`)));

  store.listProjects().then((raw) => {
    if (!raw.length) return;
    const rec = raw[0];
    const d = sanitizeProject(rec.data);
    latest = rec;
    const next = STAGES.find((st) => d.status[st] !== COMPLETE);
    cont.querySelector(".meta").textContent = `${d.name} · ${next ? `next: ${STAGE_LABELS[next].toLowerCase()}` : "complete"}`;
    cont.hidden = false;
    projects.querySelector(".meta").textContent = `${raw.length} saved · prints and folders`;
  }).catch((err) => console.error(err));
}

function menuNew(screen) {
  screen.append(pane("ctrl",
    h("div", { class: "new-bar" }, head("new project"),
      h("div", { class: "new-alt" },
        h("button", { class: "chip new-src", type: "button", onclick: () => cameraPicker.click() }, icon("camera"), "camera"),
        h("button", { class: "chip new-src", type: "button", onclick: () => filePicker.click() }, icon("file"), "files"))),
    h("button", { class: "new-drop", type: "button", onclick: () => picker.click() },
      icon("image"), h("b", {}, "choose a photo"), h("span", { class: "meta" }, "from your gallery")),
    h("p", { class: "meta hint" }, "the gallery opens on its own. camera takes a new photo; files browses Downloads, Drive and other folders. " +
      "a PNG with a transparent background prints as exactly that outline.")));
}

function menuSettings(screen) {
  const on = (key, fb) => pref(key, fb);
  const storage = h("p", { class: "meta" }, "checking…");
  navigator.storage?.estimate?.().then(({ usage = 0, quota = 0 }) => {
    const mb = (n) => (n / 1048576 >= 1024 ? `${(n / 1073741824).toFixed(1)} GB` : `${(n / 1048576).toFixed(1)} MB`);
    storage.textContent = `projects use ${mb(usage)} of ${mb(quota)} this browser allows`;
  }).catch(() => { storage.textContent = "storage size isn't available in this browser"; });
  if (!navigator.storage?.estimate) storage.textContent = "storage size isn't available in this browser";

  screen.append(pane("ctrl",
    head("sound"),
    chipGroup([{ key: "on", label: "sound on" }, { key: "off", label: "sound off" }], sfx.isEnabled() ? "on" : "off",
      (k) => sfx.setEnabled(k === "on")),
    rangeField("volume", Math.round(sfx.getVolume() * 100), { min: 0, max: 100, fmt: (v) => `${v}%`,
      oninput: (v) => sfx.setVolume(v / 100) }),
    h("button", { class: "btn wide gap-top", type: "button", onclick: () => sfx.demo() }, "play a demo"),
    h("p", { class: "meta" }, "sounds are for moving between stages, a quiet tick on buttons, and finishing jobs. " +
      "the main menu, sliders and scroll bar are always silent. the ♪ button in the corner mutes everything."),

    head("explanations"),
    chipGroup([{ key: "off", label: "hide" }, { key: "on", label: "show" }], on("hints", "off"),
      (k) => { setPref("hints", k); applyHints(); }),
    h("p", { class: "meta" }, "the how-it-works notes under the controls on Prep, Solve and New project."),

    head("motion"),
    chipGroup([{ key: "full", label: "full" }, { key: "calm", label: "calm" }], on("motion", "full"),
      (k) => { setPref("motion", k); applyMotion(); }),
    h("p", { class: "meta" }, "calm turns off the slides, fades and loaders (also followed automatically if the phone asks for reduced motion)."),

    head("gestures"),
    chipGroup([{ key: "on", label: "swipe between stages" }, { key: "off", label: "swipe off" }], on("swipe", "on"),
      (k) => setPref("swipe", k)),
    h("p", { class: "meta" }, "swipe left or right on blank screen to go to the next or previous stage. takes effect on the next screen."),

    head("storage"),
    storage,
    h("p", { class: "meta" }, "projects live in this browser on this phone only. zip a project to keep a copy elsewhere."),

    head("reset"),
    h("button", { class: "btn wide", type: "button", onclick: () => {
      if (!confirm("Reset sound, motion, gesture and view settings? Your projects are not touched.")) return;
      for (const k of ["sfx", "vol", "motion", "swipe", "view", "collapsed", "hints"]) { try { localStorage.removeItem(`huelite.${k}`); } catch { /* private window */ } }
      applyMotion();
      location.reload();
    } }, "reset settings")));
}

function menuHelp(screen) {
  const para = (title, text) => [h("p", { class: "note" }, h("b", {}, title + "  "), text)];
  screen.append(pane("ctrl",
    head("the four steps"),
    para("01 Prep", "crop the photo, choose its shape (rectangle, oval, cut-out, or lasso your own), set the print width, and shape the picture. decimate (how many colours) and saturation matter most."),
    para("02 Solve", "choose up to four filaments. \"fit colours to photo\" picks the colours that make the printed stack look most like your photo. layers per filament set the thickness; print, angle, height and photo views show the result."),
    para("03 Back", "line art printed on the plate side, in a second filament: pick one of 40 designs (or topo lines), reseed it, set the line weight, and choose the info block, colour and thickness. it reads when the print is turned over."),
    para("04 Export", "check cost and size, pick the mesh detail, and save a Bambu .3mf (or STL) for the A1. open it in Bambu Studio."),

    head("moving around"),
    h("ul", { class: "tips" },
      h("li", {}, "tap the stage tabs at the bottom, or swipe left and right on blank screen."),
      h("li", {}, "a stage unlocks when the one before it is finished."),
      h("li", {}, "☰ menu (top right) saves and returns here; projects are kept automatically."),
      h("li", {}, "the grip on the right edge slides the scroll bar out; scrolling does too."),
      h("li", {}, "sliders: drag the handle, or use − and +. hold − or + to repeat.")),

    head("on the picture"),
    h("ul", { class: "tips" },
      h("li", {}, "crop: drag the box and its corners."),
      h("li", {}, "lasso cut: draw a loop. cut away, put back, or keep only what's inside. undo steps back."),
      h("li", {}, "3D angle view: drag to turn, pinch to zoom, double-tap to reset.")),

    head("tips"),
    h("ul", { class: "tips" },
      h("li", {}, "the flatter the photo looks (try the presets), the cleaner the print."),
      h("li", {}, "translucent blend mixes colours like layered filament; solid bands keep each colour pure."),
      h("li", {}, "a thin print can curl: add base depth or layers if Solve says so."),
      h("li", {}, "the A1 plate is 256 × 256 mm; a print wider or taller than that is flagged."),
      h("li", {}, "add to home screen for a full-screen app that works offline."))));
}

function menuAbout(screen) {
  screen.append(pane("ctrl",
    head("HueLite"),
    h("p", { class: "note" }, "turns a photo into a layered, multi-colour relief print for the Bambu Lab A1, entirely on this phone."),
    kv([["version", `build ${__BUILD__}`], ["runs", "offline, in this browser"], ["exports", ".3mf (Bambu) and .stl"]]),

    head("privacy"),
    h("p", { class: "note" }, "photos and projects never leave this phone: there is no account, no server and no tracking. " +
      "files are only shared when you export or zip a project."),

    head("source"),
    h("a", { class: "btn wide", href: "https://github.com/billywilliamsspacecop-web/huelite-mobile", target: "_blank", rel: "noopener noreferrer" },
      "github.com/billywilliamsspacecop-web/huelite-mobile")));
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
  }, { quiet: true });
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
        paintSpool(btn.querySelector(".spool") || btn, hex);
        btn.setAttribute("aria-label", `slot ${f.slot} colour ${hex}`);
        filEl.querySelector(".ams-icon")?.replaceWith(amsIcon(s.filaments.map((x) => x.hex)));
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
  /** The slots as a 2 x 2 grid of small cards: swatch, TD and layers each. */
  // the filaments as Studio's AMS panel shows them: A1 and A2 down the left,
  // A4 and A3 down the right, a spool each; tap a spool for its colour
  const filTable = () => {
    strips = [];
    const n = s.filaments.length, half = Math.ceil(n / 2);
    const cell = (f, i, side) => {
      const strip = h("i", { class: "pr", hidden: true });
      strips[i] = strip;
      const btn = h("button", { class: "spool-btn", type: "button", "aria-label": `slot ${f.slot} colour ${f.hex}`,
        onclick: (e) => openColour(f, i, e.currentTarget) }, spool(f.hex), strip);
      const edge = i === 0 ? "lowest" : i === n - 1 ? "top" : "";
      const field = (label, input) => h("label", { class: "ams-field" }, h("span", {}, label), input);
      return h("div", { class: `ams-slot ${side}` },
        h("div", { class: "ams-spool-row" }, side === "left" ? [slotBadge(f.slot, "left"), btn] : [btn, slotBadge(f.slot, "right")]),
        h("div", { class: "ams-edge" }, `slot ${f.slot}${edge ? ` · ${edge}` : ""}`),
        h("div", { class: "ams-fields" },
          field("TD mm", h("input", { class: "val", type: "number", inputmode: "decimal", step: "0.05", min: "0.05", max: "6",
            value: Number(f.td_mm).toFixed(2), onchange: (e) => {
              const v = Math.min(6, Math.max(0.05, parseFloat(e.target.value) || f.td_mm));
              f.td_mm = v; e.target.value = v.toFixed(2); refit(); queue();
            } })),
          field("layers", h("input", { class: "val", type: "number", inputmode: "numeric", step: "1", min: "0", max: "120",
            value: String(f.band_layers), onchange: (e) => {
              const v = Math.min(120, Math.max(0, parseInt(e.target.value, 10) || 0));
              f.band_layers = v; e.target.value = String(v); refit(); queue();
            } }))));
    };
    const left = s.filaments.slice(0, half).map((f, k) => cell(f, k, "left"));
    const right = s.filaments.slice(half).map((f, k) => cell(f, half + k, "right")).reverse();
    return h("div", { class: "ams" },
      h("div", { class: "ams-head" }, amsIcon(s.filaments.map((f) => f.hex)),
        h("span", {}, "AMS"), h("span", { class: "meta" }, "slot 1 = A1, prints first")),
      h("div", { class: "ams-body" }, h("div", { class: "ams-col" }, left), h("div", { class: "ams-hub" }), h("div", { class: "ams-col" }, right)));
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
      head("foundations"),
      rangeField("foundations", Math.min(25, Math.round((s.slope_mm_per_layer ?? 0) * 100)), { min: 0, max: 25, key: true,
        fmt: (v) => (v ? `${(v / 100).toFixed(2)} mm run / layer` : "off"),
        oninput: (v) => { s.slope_mm_per_layer = v / 100; queue(); } }),
      (s.slope_mm_per_layer ?? 0) > 0.25 && h("p", { class: "meta" },
        `this project is at ${s.slope_mm_per_layer.toFixed(2)}, past the slider's 0.25 end; moving it sets a new value.`),

      head("filaments"),
      h("p", { class: "meta hint" }, "slot 1 prints lowest · tap a spool to choose its colour"),
      filEl,
      h("button", { class: "btn wide gap-top", onclick: () => {
        fitColours(); refitTable(); queue();
      } }, "fit colours to photo"),
      h("p", { class: "meta hint" }, "picks the filament colours that make the printed stack look most like your prepped photo. " +
        "the strip under a swatch is what that band really prints as."),

      head("colour"),
      chipGroup([{ key: "blend", label: "translucent blend" }, { key: "solid", label: "solid bands" }],
        s.band_mode || "blend", (k) => { s.band_mode = k; refit(); queue(); }),
      h("div", { class: "gap-top" },
        chipGroup([{ key: "bayer8", label: "dither on" }, { key: "none", label: "dither off" }],
          s.dither === "none" ? "none" : "bayer8", (k) => { s.dither = k; queue(); })),
      rangeField("dither amount", Math.round((s.dither_amount ?? 1) * 100), { min: 0, max: 200,
        fmt: (v) => `${v}%`, oninput: (v) => { s.dither_amount = v / 100; queue(); } }),

      head("border"),
      chipGroup([{ key: "raised", label: "raised rim" }, { key: "flush", label: "flush" }, { key: "none", label: "none" }],
        s.border.mode || "raised", (k) => { s.border.mode = k; s.border.enabled = k !== "none"; queue(); }),
      app.prepped.mask && h("p", { class: "meta hint" }, "the rim follows the outline"),
      borderWidth, frameSlot,

      readoutBeside ? null : [head("summary"), readout],

      head("layers"),
      numField("layer height (mm)", s.layer_height_mm, { step: "0.02", min: 0.04, max: 0.3, fmt: (v) => v.toFixed(2),
        onchange: (v) => { s.layer_height_mm = v; queue(); } }),
      numField("base depth (mm)", +(s.base_layers * s.layer_height_mm).toFixed(2), { step: "0.2", min: 0.4, max: 8,
        fmt: (v) => v.toFixed(2),
        onchange: (v) => { s.base_layers = Math.max(2, solve.layersForMm(v, s.layer_height_mm)); queue(); } })),
  );

  action.append(
    h("button", { class: "btn ghost", onclick: () => go("prep") }, "back to prep"),
    h("button", { class: "btn primary", onclick: commitSolve }, "next: back  →"),
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
    go("back");
  }, { quiet: true });
}

// ---------------------------------------------------------------- back
// Line art for the plate side: a gallery of the 40 designs (engine/lineart.js)
// plus the built-in topo lines, then seed, line weight, info block, colour
// and thickness. Export shows the result and builds it.
let artFilter = "All";        // gallery tab on the Back stage
const seedHistory = [];       // "↶ previous" steps back through this visit's picks

function renderBackStage(screen, action) {
  if (!app.solved) {
    screen.append(h("div", { class: "todo" }, h("b", {}, "nothing solved"),
      "Go back to Solve and continue from there."));
    return;
  }
  const { s, lh } = solveSettings();
  const back = backSettings();
  seedHistory.length = 0;

  // a change here makes the last export out of date
  const touched = () => {
    if (app.project.status.export === COMPLETE) { app.project.status.export = PENDING; refreshStepper(); }
  };

  // ---- the back as it will print, turned over
  const canvas = h("canvas", { class: "preview-out" });
  const note = h("p", { class: "meta" });
  const lineCheck = h("p", { class: "line-check", hidden: true });
  let timer = 0, seq = 0;
  const redraw = (delay = 120) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const my = ++seq;
      const plan = backPlan(back);
      const art = await backart.renderBack(mesh.modelGrid(modelArgs()),
        { ...backArtOpts(back), maxPixels: 1_000_000, minPx: 0.12 });
      if (my !== seq || !canvas.isConnected) return;
      const shown = back.enabled && plan.usable ? art : { ...art, field: new Float32Array(art.field.length) };
      const img = backart.backPreview(shown, s.filaments[0].hex, plan.hex);
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext("2d").putImageData(img, 0, 0);
      const lined = back.enabled && back.pattern !== "plain" && art.thinnest < Infinity;
      const v = lineart.thinnestVerdict(art.thinnest);
      lineCheck.hidden = !lined;
      lineCheck.className = `line-check ${v.level}`;
      lineCheck.textContent = lined ? `thinnest line ${art.thinnest.toFixed(2)} mm · ${v.text}` : "";
      note.textContent = backNotes(back, plan, art).join(" ");
    }, delay);
  };
  // ---- the front, when there is an art border: its band carries the same design
  const ab = artBorderSettings();
  const frontCanvas = h("canvas", { class: "preview-out", hidden: true });
  const frontNote = h("p", { class: "meta", hidden: true });
  let frontTimer = 0;
  const redrawFront = (delay = 120) => {
    clearTimeout(frontTimer);
    if (!ab.enabled) return;
    frontTimer = setTimeout(() => {
      if (!frontCanvas.isConnected) return;
      const img = frontPreview(back);
      frontCanvas.width = img.width; frontCanvas.height = img.height;
      frontCanvas.getContext("2d").putImageData(img, 0, 0);
      frontNote.textContent = artBorderNotes(back, artBorderPlan()).join(" ");
    }, delay);
  };
  const changed = (delay) => { touched(); redraw(delay); redrawFront(delay); };

  // ---- gallery: "border only", then every design (the generator's topo tile is the built-in topo lines)
  const tiles = [
    { key: "plain", name: "Border only", group: null, note: "No pattern: just the border and the info block." },
    ...lineart.DESIGNS.map((d) => d.id === "topo"
      ? { key: "topo", name: d.name, group: d.group, note: "The original look: contour lines that follow the print's outline and keep clear of the info block." }
      : { key: d.id, design: d.id, name: d.name, group: d.group, note: d.note }),
  ];
  const keyOf = () => (back.pattern === "design" ? back.design : back.pattern);
  const seedNow = () => (back.seed >>> 0) || backart.hashString(app.project.name || "print");
  const thumbPx = Math.round(120 * Math.min(2, window.devicePixelRatio || 1));
  const pickName = h("b", {});
  const pickGroup = h("span", { class: "art-group" });
  const pickNote = h("p", { class: "meta" });
  const paintPick = () => {
    const t = tiles.find((x) => x.key === keyOf()) || tiles[1];
    pickName.textContent = t.name;
    pickGroup.textContent = t.group ? `· ${t.group}` : "";
    pickNote.textContent = t.note;
    tileEls.forEach((el, i) => el.classList.toggle("on", tiles[i].key === t.key));
  };
  const tileEls = tiles.map((t) => {
    const cv = h("canvas", { width: thumbPx, height: thumbPx });
    return h("button", { class: "art-tile", type: "button", title: t.name, "aria-label": t.name, onclick: () => {
      if (t.key === "plain" || t.key === "topo") back.pattern = t.key;
      else { back.pattern = "design"; back.design = t.design; }
      paintPick(); paintSeed(); changed(0);
    } }, cv, h("span", {}, t.name));
  });
  const showTab = () => tileEls.forEach((el, i) => {
    el.hidden = artFilter !== "All" && tiles[i].group !== artFilter;
  });
  // thumbnails: in the filament colours, a couple per tick so the page stays responsive
  let thumbGen = 0, thumbTimer = 0;
  const drawPlainThumb = (cv, ink, bg) => {
    const c = cv.getContext("2d"), u = cv.width / 200;
    c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = ink; c.lineWidth = 2.2 * u; c.strokeRect(12 * u, 12 * u, 176 * u, 176 * u);
    c.fillStyle = ink;
    c.fillRect(112 * u, 150 * u, 64 * u, 26 * u);
  };
  const drawThumbs = (delay = 0) => {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => {
      const gen = ++thumbGen;
      const ink = backPlan(back).hex, bg = s.filaments[0].hex, seed = seedNow(), weight = back.weight ?? 1;
      // the tab on show first, then the rest
      const order = tiles.map((_, i) => i).sort((a, b) => tileEls[a].hidden - tileEls[b].hidden);
      let k = 0;
      const step = () => {
        if (gen !== thumbGen || !canvas.isConnected) return;
        for (let n = 0; n < 2 && k < order.length; n++, k++) {
          const i = order[k], cv = tileEls[i].firstChild;
          if (tiles[i].key === "plain") drawPlainThumb(cv, ink, bg);
          else lineart.drawThumb(cv, tiles[i].design || "topo", { seed, weight, ink, bg });
        }
        if (k < order.length) setTimeout(step, 0);
      };
      step();
    }, delay);
  };
  const tabs = chipGroup([{ key: "All", label: `all ${lineart.DESIGNS.length}` },
    ...lineart.GROUPS.map((g) => ({ key: g, label: g.toLowerCase() }))], artFilter,
  (k) => { artFilter = k; showTab(); });
  tabs.classList.add("art-tabs");

  // ---- pattern number: from the name until "new pattern" picks a random one
  const seedInfo = h("span", { class: "meta" });
  const prevBtn = h("button", { class: "chip", type: "button", onclick: () => {
    if (!seedHistory.length) return;
    back.seed = seedHistory.pop(); paintSeed(); changed(0); drawThumbs(); } }, "↶ previous");
  const nameBtn = h("button", { class: "chip", type: "button", onclick: () => {
    if (!back.seed) return;
    seedHistory.push(back.seed); back.seed = 0; paintSeed(); changed(0); drawThumbs(); } }, "from name");
  const seedRow = h("div", { class: "pattern-row" },
    h("div", { class: "opt-grid", style: "--cols:3" },
      h("button", { class: "chip accent", type: "button", onclick: () => {
        seedHistory.push(back.seed); back.seed = backart.newBackSeed(); paintSeed(); changed(0); drawThumbs();
      } }, "↻ new pattern"), prevBtn, nameBtn),
    seedInfo);
  const paintSeed = () => {
    prevBtn.disabled = !seedHistory.length;
    nameBtn.disabled = !back.seed;
    seedInfo.textContent = back.pattern === "plain" ? "border only has no pattern to vary"
      : back.seed ? `pattern #${back.seed.toString(36).toUpperCase()}` : "from the print's name";
  };

  // ---- the rest of the settings
  const optGrid = (opts, current, onPick, cols) => {
    const g = chipGroup(opts, current, onPick);
    g.className = "opt-grid";
    g.style.setProperty("--cols", String(cols));
    return g;
  };
  const weight = rangeField("line weight", Math.round((back.weight ?? 1) * 100), {
    min: lineart.WEIGHT_MIN * 100, max: lineart.WEIGHT_MAX * 100, step: 5, fmt: (v) => `${(v / 100).toFixed(2)}×`,
    oninput: (v) => { back.weight = v / 100; changed(150); drawThumbs(300); } });
  const textField = (label, key) => h("label", { class: "field stacked" }, label,
    h("input", { class: "val wide-val", value: backTexts()[key], oninput: (e) => {
      setPref(`back.${key}`, e.target.value);
      changed(300);
    } }));
  const fields = h("div", { class: "back-fields" }, textField("your name", "maker"), textField("email", "email"), textField("brand", "brand"));
  fields.hidden = back.info === false;
  const fil = s.filaments;
  const slotOpts = [{ key: 0, label: "auto" }, ...fil.slice(1).map((f) => ({ key: f.slot,
    label: h("span", { class: "chip-sw" }, spool(f.hex, { mini: true }), `slot ${f.slot}`) }))];
  // the design gallery stays live while the art border uses it, even with a plain back
  const setOff = () => screen.classList.toggle("art-off", !back.enabled && !ab.enabled);

  // ---- art border
  const VIEWS = ["back", "front"];
  let side = "back";
  const viewFrame = frame("back, turned over", canvas, frontCanvas);
  const caption = viewFrame.querySelector(".frame-caption");
  const viewChips = chipGroup([{ key: "back", label: "back" }, { key: "front", label: "front · art border" }], side,
    (k) => { side = k; showSide(); });
  viewChips.classList.add("side-chips");
  const showSide = () => {
    if (!ab.enabled) side = "back";
    viewChips.hidden = !ab.enabled;
    viewChips.querySelectorAll(".chip").forEach((c, i) => c.classList.toggle("on", VIEWS[i] === side));
    canvas.hidden = side !== "back"; note.hidden = side !== "back";
    frontCanvas.hidden = side !== "front"; frontNote.hidden = side !== "front";
    if (caption) caption.textContent = side === "front" ? "front, art border" : "back, turned over";
  };
  const rimMm = rimWidthMm();
  const widthMin = Math.max(1.5, Math.ceil(rimMm * 2) / 2);
  ab.width_mm = Math.max(widthMin, ab.width_mm);
  const abCtrls = h("div", { class: "ab-ctrls" },
    optGrid([{ key: "inlay", label: h("span", { class: "two-line" }, h("b", {}, "inlaid"), h("span", {}, "flush, two colours")) },
      { key: "raised", label: h("span", { class: "two-line" }, h("b", {}, "raised"), h("span", {}, "the lines stand up")) }],
    ab.style, (k) => { ab.style = k; changed(0); }, 2),
    rangeField("width", ab.width_mm, { min: widthMin, max: 12, step: 0.5, fmt: (v) => `${(+v).toFixed(1)} mm`,
      oninput: (v) => { ab.width_mm = v; changed(150); } }),
    rangeField("height", Math.round(ab.height * 100), { min: 20, max: 100, step: 5, fmt: (v) => `${v}% of the print`,
      oninput: (v) => { ab.height = v / 100; changed(150); } }),
    h("p", { class: "meta hint" }, rimMm
      ? `takes the place of the ${rimMm} mm rim, so it is at least that wide. the pattern is the design and colour picked above.`
      : "the pattern is the design and colour picked above."));
  abCtrls.hidden = !ab.enabled;
  const abCheck = h("label", { class: "check-row" },
    h("input", { type: "checkbox", checked: ab.enabled, onchange: (e) => {
      ab.enabled = e.target.checked;
      abCtrls.hidden = !ab.enabled;
      side = ab.enabled ? "front" : "back";
      showSide(); setOff(); changed(0);
    } }),
    h("span", {}, "Include Art Border"));

  screen.append(
    pane("view", viewChips, viewFrame, h("div", { class: "below-view" }, lineCheck, note, frontNote)),
    pane("ctrl",
      head("art on the back"),
      optGrid([{ key: "on", label: "line art" }, { key: "off", label: "plain back" }], back.enabled ? "on" : "off",
        (k) => { back.enabled = k === "on"; setOff(); changed(0); }, 2),
      head("design"),
      tabs,
      h("div", { class: "art-grid" }, tileEls),
      h("div", { class: "art-pick" }, h("div", {}, pickName, " ", pickGroup), pickNote),
      head("pattern"),
      seedRow,
      weight,
      h("p", { class: "meta hint" }, "line widths are real millimetres. a design keeps its size on prints up to 200 mm and grows to cover bigger ones."),
      head("info block"),
      optGrid([{ key: "on", label: "border + info block" }, { key: "off", label: "border only" }], back.info === false ? "off" : "on",
        (k) => { back.info = k === "on"; fields.hidden = !back.info; changed(0); }, 2),
      fields,
      head("colour"),
      optGrid(slotOpts, backPlan(back).auto ? 0 : backPlan(back).slot,
        (k) => { back.slot = k; changed(0); drawThumbs(); }, Math.min(4, slotOpts.length)),
      head("thickness"),
      optGrid([1, 2, 3].map((n) => ({ key: n, label: h("span", { class: "two-line" },
        h("b", {}, `${n} layer${n > 1 ? "s" : ""}`), h("span", {}, `${backart.backDepthMm(n, lh).toFixed(2)} mm`)) })),
      back.layers, (k) => { back.layers = k; changed(0); }, 3),
      head("art border"),
      abCheck,
      abCtrls),
  );
  abCheck.closest(".group")?.classList.add("keep");
  showSide();
  setOff();
  showTab();
  paintPick();
  paintSeed();

  action.append(
    h("button", { class: "btn ghost", onclick: () => go("solve") }, "back to solve"),
    h("button", { class: "btn primary", onclick: async () => {
      setStatus("back", COMPLETE);
      await persistNow();
      go("export");
    } }, "next: export  →"),
  );
  requestAnimationFrame(() => {
    redraw(0);
    redrawFront(0);
    drawThumbs(60);
    // bring the picked design into view in the gallery strip (sideways only; the page stays put)
    const on = root.querySelector(".art-tile.on:not([hidden])"), strip = on?.parentElement;
    if (on && strip) strip.scrollLeft = on.offsetLeft - strip.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
  });
}

// ---------------------------------------------------------------- export
function modelArgs() {
  const { s, lh, baseLayers, mm } = solveSettings();
  const { heights, w, h: hh } = app.solved;
  const ab = artBorderPlan();
  return { heights, w, h: hh, mask: app.prepped.mask, physicalW: mm, layerH: lh, baseLayers,
           filaments: s.filaments, detail: exportOpts.detail, name: app.project.name,
           ring: ab ? { widthMm: ab.widthMm, layers: ab.bodyLayers } : null };
}

// ---- art border: a band round the print in place of the rim, about half its height, with the
// back's design on its top face: inlaid flush in the back-art filament, or standing up from it
const ART_RELIEF_MM = 0.4;      // how deep the inlay goes / how far raised lines stand up

/** The project's art border settings, with defaults filled in for older projects. */
function artBorderSettings() {
  const ex = app.project.export;
  ex.art_border = withDefaults(ex.art_border, { enabled: false, style: "inlay", width_mm: 4, height: 0.5 });
  return ex.art_border;
}

/** The rim the art border replaces: its width in mm (0 when there is none). */
const rimWidthMm = () => {
  const b = app.project.solve.border || {};
  return (b.mode || "raised") !== "none" ? (b.width_mm ?? 3) : 0;
};

const tallestCache = new WeakMap();
/** The tallest column of the solved print, in colour layers above the base. */
function tallestLayer() {
  const sv = app.solved;
  let t = tallestCache.get(sv);
  if (t === undefined) {
    t = 0;
    const { heights } = sv, mask = app.prepped?.mask;
    for (let i = 0; i < heights.length; i++) if ((!mask || mask[i]) && heights[i] > t) t = heights[i];
    tallestCache.set(sv, t);
  }
  return t;
}

/** How the art border is built, or null when it is off. Heights are in
 *  colour layers above the base, like the solved heights. */
function artBorderPlan() {
  const ab = artBorderSettings();
  if (!ab.enabled || !app.solved) return null;
  const { s, lh, baseLayers } = solveSettings();
  const back = backSettings(), bp = backPlan(back);
  const patterned = back.pattern !== "plain" && bp.usable;
  const inlay = ab.style !== "raised";
  const baseMm = mesh.snappedBaseMm(baseLayers, lh);
  const relief = Math.max(2, Math.round(ART_RELIEF_MM / lh));
  const tallest = tallestLayer();
  const printMm = baseMm + tallest * lh;
  // an inlay needs room for its depth above the base
  const minTop = inlay && patterned ? relief : 0;
  const want = Math.round((ab.height * printMm - baseMm) / lh);
  const top = Math.max(minTop, Math.min(want, Math.max(minTop, tallest)));
  const topMm = baseMm + top * lh, reliefMm = relief * lh;
  const bands = mesh.bandBounds(s.filaments);
  const topBand = bands.find((b) => top > b.start_h && top <= b.end_h) || bands[0];
  return {
    inlay, patterned, top, topMm, printMm, relief, reliefMm,
    widthMm: Math.max(ab.width_mm, rimWidthMm()),
    // the columns stop under an inlay; the pattern and the rest of the top fill in above them
    bodyLayers: inlay && patterned ? top - relief : top,
    z0: inlay ? topMm - reliefMm : topMm, z1: inlay ? topMm : topMm + reliefMm,
    slot: patterned ? bp.slot : null, hex: bp.hex,
    restSlot: topBand?.slot ?? s.filaments[0].slot,
    low: want < minTop,
  };
}

const ringHeights = { src: null, key: "", heights: null };
/** The solved heights with the art border's band in place (for previews and
 *  estimates; the export builds the band on the mesh grid instead). */
function previewHeights() {
  const ab = artBorderPlan();
  const { heights, w, h: hh, lut } = app.solved;
  if (!ab) return heights;
  const mm = app.project.prep.physical_width_mm, mask = app.prepped.mask;
  const widthPx = Math.max(1, Math.round(ab.widthMm * w / mm));
  const key = `${widthPx}|${ab.top}`;
  if (ringHeights.src !== app.solved || ringHeights.key !== key) {
    const out = solve.applyBorder(heights, w, hh, { widthPx, mode: "raised", rimLayers: ab.top, maxLayers: lut.length - 1, mask });
    Object.assign(ringHeights, { src: app.solved, key, heights: solve.applyMask(out, mask) });
  }
  return ringHeights.heights;
}

/** The print from the front, flat colours, with the art border's pattern painted on its band. */
function frontPreview(back) {
  const { lh, baseLayers, mm } = solveSettings();
  const { w, h: hh, lut } = app.solved;
  const mask = app.prepped.mask;
  const img = mesh.renderTop({ heights: previewHeights(), w, h: hh, lut, mask, layerH: lh,
    baseMm: baseLayers * lh, cellMm: mm / w, shaded: false });
  const ab = artBorderPlan();
  if (!ab?.patterned) return img;
  // the pattern at no more than about a megapixel, sampled back up
  const k = Math.max(1, Math.ceil(Math.sqrt(w * hh / 1e6))), px = mm / w;
  const cw = Math.ceil(w / k), ch = Math.ceil(hh / k);
  const { cov } = backart.patternCoverage(back.pattern, { w: cw, h: ch, px: px * k, widthMm: cw * k * px, heightMm: ch * k * px,
    design: back.design, seed: back.seed, weight: back.weight ?? 1, title: app.project.name });
  const all = mask || new Uint8Array(w * hh).fill(1);
  const band = shape.rim(all, w, hh, Math.max(1, Math.round(ab.widthMm / px)));
  const ink = hexToRgb(ab.hex), d = img.data;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!band[i] || cov[Math.floor(y / k) * cw + Math.floor(x / k)] < 0.5) continue;
    d[i * 4] = ink[0]; d[i * 4 + 1] = ink[1]; d[i * 4 + 2] = ink[2];
  }
  return img;
}

/** What to tell the user about the art border (Back and Export share it). */
function artBorderNotes(back, ab) {
  if (!ab) return [];
  const notes = [`${ab.widthMm.toFixed(1)} mm wide, ${ab.topMm.toFixed(2)} mm tall (the print is ${ab.printMm.toFixed(2)} mm), in place of the rim.`];
  if (back.pattern === "plain") notes.push("\"Border only\" has no pattern, so the art border prints plain: pick a design for it.");
  else if (!ab.patterned) notes.push("the pattern needs a second filament: add one in Solve.");
  else notes.push(ab.inlay
    ? `pattern inlaid flush in slot ${ab.slot}, ${ab.reliefMm.toFixed(2)} mm deep.`
    : `pattern raised ${ab.reliefMm.toFixed(2)} mm in slot ${ab.slot}.`);
  if (ab.low) notes.push(`raised to ${ab.topMm.toFixed(2)} mm, the least that holds the inlay.`);
  return notes;
}

/** The maker's details on the back art; kept per phone, not per project. */
const backTexts = () => ({
  title: app.project.name,
  maker: pref("back.maker", backart.BACK_DEFAULTS.maker),
  email: pref("back.email", backart.BACK_DEFAULTS.email),
  brand: pref("back.brand", backart.BACK_DEFAULTS.brand),
});

/** Which filament the back art uses and how deep it goes. Slot 0 means
 *  "pick for me": the filament that stands out most against slot 1, which
 *  is what the rest of the plate side is. It never eats the whole base:
 *  at least one layer of the base stays above it. */
function backPlan(back) {
  const { s, lh, baseLayers } = solveSettings();
  const fil = s.filaments;
  const baseRgb = hexToRgb(fil[0].hex);
  const dist = (f) => { const c = hexToRgb(f.hex); return Math.hypot(...c.map((v, i) => (v - baseRgb[i]) * [0.3, 0.59, 0.11][i] * 3)); };
  let pickSlot = fil.slice(1).reduce((best, f) => (!best || dist(f) > dist(best) ? f : best), null)?.slot ?? fil[0].slot;
  const chosen = fil.find((f) => f.slot === back.slot);
  const slot = chosen ? chosen.slot : pickSlot;
  const baseMm = mesh.snappedBaseMm(baseLayers, lh);
  let layers = back.layers;
  while (layers > 1 && backart.backDepthMm(layers, lh) > baseMm - lh + 1e-6) layers--;
  const depthMm = backart.backDepthMm(layers, lh);
  return { slot, auto: !chosen, layers, depthMm, baseMm, reduced: layers < back.layers,
           hex: fil.find((f) => f.slot === slot).hex, usable: slot !== fil[0].slot,
           thin: depthMm > baseMm - lh + 1e-6 };
}

/** obj (made if missing) with any absent keys taken from defaults, keeping its identity. */
function withDefaults(obj, defaults) {
  const o = obj && typeof obj === "object" ? obj : {};
  for (const [k, v] of Object.entries(defaults)) if (!(k in o)) o[k] = v;
  return o;
}

/** The project's back settings, with defaults filled in for older projects. */
function backSettings() {
  const ex = app.project.export;
  // filled in place: the stages hold on to this object and change it as you go
  ex.back = withDefaults(ex.back, { enabled: true, slot: 0, layers: 2, pattern: "topo", design: "", seed: 0, weight: 1, info: true });
  if (ex.back.pattern === "design" && !lineart.designById(ex.back.design)) ex.back.pattern = "topo";
  return ex.back;
}

/** backart.renderBack options for these settings. */
const backArtOpts = (back) => ({ ...backTexts(), pattern: back.pattern, design: back.design, seed: back.seed,
                                 weight: back.weight ?? 1, info: back.info !== false });

const backArtName = (back) => back.pattern === "design" ? (lineart.designById(back.design)?.name || "design")
  : back.pattern === "topo" ? "Topographic" : "border only";

/** What to tell the user about a rendered back (Back and Export share it). */
function backNotes(back, plan, art) {
  const notes = [];
  if (!back.enabled) notes.push("back art is off: the plate side prints plain.");
  else if (!plan.usable) notes.push("needs a second filament: add one in Solve.");
  else {
    notes.push(`slot ${plan.slot} · ${plan.layers} layer${plan.layers > 1 ? "s" : ""} (${plan.depthMm.toFixed(2)} mm) · mirrored to read when turned over.`);
    if (plan.reduced) notes.push(`the base is only ${plan.baseMm.toFixed(2)} mm, so the art is ${plan.layers} layer${plan.layers > 1 ? "s" : ""} deep; raise base layers in Solve for more.`);
    if (plan.thin) notes.push("the base is so thin the art may show through the front: raise base layers in Solve.");
    if (art.cramped) notes.push("the print is small for the info block: it is set at its smallest and may be cropped.");
    else if (art.small) notes.push("the info block's text is shrunk to fit this print and may print rough; a shorter name or email helps.");
  }
  return notes;
}

function renderExport(screen, action) {
  if (!app.solved) {
    screen.append(h("div", { class: "todo" }, h("b", {}, "nothing solved"),
      "Go back to Solve and continue from there."));
    return;
  }
  const { s, lh, baseLayers, mm } = solveSettings();
  const { w, h: hh, lut } = app.solved;
  const heights = previewHeights();      // with the art border's band, when there is one
  const mask = app.prepped.mask;
  const ex = app.project.export;
  const back = backSettings();

  // flat colours: a top-down view should show exactly what each tone is (and the art border's pattern)
  const top = canvasOf(frontPreview(back));
  top.className = "preview-out";
  let oblique;
  const gl3 = createView3D({ fullscreen: true });   // full screen only here, at the end
  if (gl3) {
    disposers.push(() => gl3.destroy());
    gl3.set({ heights, w, h: hh, mask, lut, layerH: lh, baseMm: baseLayers * lh, physicalW: mm, maxCols: 800 });
    oblique = gl3.el;
  } else {
    oblique = mesh.renderOblique({ heights, w, h: hh, lut, mask, baseHex: s.filaments[0].hex,
      layerH: lh, baseMm: baseLayers * lh, physicalW: mm, targetWidth: 640 });
    oblique.className = "preview-out";
  }

  const stats = h("p", { class: "meta" }, "…");
  const warn = h("div", { class: "warn-box", hidden: true });

  // problems that ruin a print or a phone: shown big, under the preview
  const restat = () => {
    const model = mesh.buildModel(modelArgs());
    const { widthMm, heightMm } = mesh.modelGrid(modelArgs());
    const warns = [];
    if (Math.max(widthMm, heightMm) > PRINT_MAX_MM + 0.5) {
      warns.push(`${widthMm.toFixed(0)} × ${heightMm.toFixed(0)} mm won't fit the A1 plate with its brim. Go back to Prep and make it ${PRINT_MAX_MM} mm or less.`);
    } else if (model.parts.length > 1 && !bambu3mf.placement(model).towerFits) {
      warns.push("No room on the plate for the prime tower: Studio will put it on top of the print. Make it a little smaller in Prep, or drag the tower to a free spot in Studio before printing.");
    }
    const stlMb = (model.stats.triangles * 50) / 1e6;
    if (exportOpts.formats.stl && stlMb > 60) {
      warns.push(`The STL will be about ${stlMb.toFixed(0)} MB, enough to crash a phone. Pick standard or draft detail, or export the 3MF only.`);
    }
    warn.replaceChildren(...warns.map((t) => h("p", {}, `⚠ ${t}`)));
    warn.hidden = !warns.length;
  };

  // the back, as seen after turning the print over (a quick, coarse render)
  const backCanvas = h("canvas", { class: "preview-out" });
  const backNote = h("p", { class: "meta" });
  let backTimer = 0, backSeq = 0;
  const redrawBack = (delay = 150) => {
    clearTimeout(backTimer);
    backTimer = setTimeout(async () => {
      const seq = ++backSeq;
      const plan = backPlan(back);
      const grid = mesh.modelGrid(modelArgs());
      // fine enough to read the email when you zoom in (about 0.12 mm a pixel), still well under 0.1 s
      const art = await backart.renderBack(grid, { ...backArtOpts(back), maxPixels: 1_000_000, minPx: 0.12 });
      if (seq !== backSeq || !backCanvas.isConnected) return;
      const shown = back.enabled && plan.usable ? art : { ...art, field: new Float32Array(art.field.length) };
      const img = backart.backPreview(shown, s.filaments[0].hex, plan.hex);
      backCanvas.width = img.width; backCanvas.height = img.height;
      backCanvas.getContext("2d").putImageData(img, 0, 0);
      // the 3D view's underside: tap "⇅ back" there to turn the print over
      gl3?.setBack({ image: backart.backPreview(shown, s.filaments[0].hex, plan.hex, null),
                     widthMm: art.widthMm, heightMm: art.heightMm });
      const notes = backNotes(back, plan, art);
      backNote.textContent = notes.join(" ");
    }, delay);
  };

  const info = h("div");
  const reinfo = () => {
    const plan = backPlan(back);
    const ab = artBorderPlan();
    const est = mesh.estimates({ heights, w, h: hh, mask, filaments: s.filaments, layerH: lh,
      baseLayers, physicalW: mm, pricePerKg: ex.price_per_kg ?? 25, bandMode: s.band_mode,
      back: back.enabled && plan.usable ? { slot: plan.slot, layers: plan.layers } : null,
      // the art border's pattern: its own layers swap to the art filament and back
      extraSwitches: ab?.patterned ? ab.relief + 1 : 0 });
    const [fw, fd] = est.footprint_mm;
    stats.textContent = `${fw.toFixed(0)} × ${fd.toFixed(0)} mm · ${est.max_height_mm.toFixed(1)} mm tall · ` +
      `${est.total_grams.toFixed(0)} g · $${est.total_cost.toFixed(2)}`;
    const tips = [];
    if (est.max_height_mm / Math.max(fw, fd) > 0.35) tips.push("tall for its footprint: add a brim in Studio");
    if (s.colours_auto) tips.push("these slot colours were fitted to the photo, not taken from your spools. The layers are planned for these exact colours: load spools close to them, or set each slot to your real spool's colour in Solve (that stops the fitting). Studio's \"Sync info\" swaps in your AMS colours without re-planning.");
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
    redrawBack();
  }, oninput: (e) => {
    const v = e.target.value.trim();
    if (v) { app.project.name = v; redrawBack(300); }
  } });

  // the back art is set on the Back stage; here it is a summary and a way back
  const plan0 = backPlan(back);
  const ab0 = artBorderPlan();
  const backCard = h("div", { class: `back-card${back.enabled ? "" : " off"}` },
    h("p", { class: "back-sum" }, back.enabled
      ? [backArtName(back), back.pattern !== "plain" && `${(back.weight ?? 1).toFixed(2)}× lines`,
         back.info !== false ? "info block" : "no info block", `slot ${plan0.slot}`,
         `${plan0.layers} layer${plan0.layers > 1 ? "s" : ""}`].filter(Boolean).join(" · ")
      : "plain: no art on the plate side"),
    backNote,
    ab0 && h("p", { class: "back-sum" }, `art border · ${ab0.inlay ? "inlaid" : "raised"} · ${ab0.widthMm.toFixed(1)} mm wide · ` +
      `${ab0.topMm.toFixed(2)} mm tall${ab0.patterned ? ` · slot ${ab0.slot}` : " · plain"}`),
    h("button", { class: "btn wide gap-top", type: "button", onclick: () => go("back") }, "‹ change the back art"));

  // both previews when there is height for them, otherwise one at a time
  const showExport = () => {
    top.hidden = !layout.dual && exportView !== "top";
    oblique.hidden = !layout.dual && exportView !== "angle";
    backCanvas.hidden = !layout.dual && exportView !== "back";
  };
  const viewEls = { top, angle: oblique, back: backCanvas };
  const exportChips = chipGroup([{ key: "top", label: "top down" }, { key: "angle", label: "angle" }, { key: "back", label: "back" }],
    exportView, (k) => { exportView = k; showExport(); pulse(viewEls[k]); });
  const refreshChips = () => exportChips.querySelectorAll(".chip").forEach((c, i) =>
    c.classList.toggle("on", ["top", "angle", "back"][i] === exportView));
  showExport();
  screen.append(
    layout.dual
      ? pane("view", frame("top down", top), frame("~30° from the plate", oblique),
          frame("back, turned over", backCanvas), h("div", { class: "below-view" }, stats, warn))
      : pane("view", h("div", { class: "view-bar" }, exportChips, bigButton()),
          frame(null, top, oblique, backCanvas), h("div", { class: "below-view" }, stats, warn)),
    // the things to set first; the read-outs (slots, cost, size) at the bottom
    pane("ctrl",
      head("name"),
      name,
      head("back of the print"),
      backCard,
      head("mesh detail"),
      chipGroup([{ key: "draft", label: "draft" }, { key: "standard", label: "standard" }, { key: "fine", label: "fine" }],
        exportOpts.detail, (k) => { exportOpts.detail = k; restat(); }),
      head("formats"),
      h("div", { class: "chips" }, [["3mf", "3MF (Bambu)"], ["stl", "STL"]].map(([k, label]) =>
        h("button", { class: `chip${exportOpts.formats[k] ? " on" : ""}`, onclick: (e) => {
          exportOpts.formats[k] = !exportOpts.formats[k];
          e.currentTarget.classList.toggle("on", exportOpts.formats[k]);
          restat();
        } }, label))),
      filesBox,
      head("filament slots"),
      h("div", { class: "slots" }, s.filaments.map((f, i) =>
        h("div", { class: "slot" }, spool(f.hex, { mini: true }),
          `slot ${f.slot} (${amsName(f.slot)})  ${f.hex}${i === 0 ? " · lowest" : i === s.filaments.length - 1 ? " · top" : ""}`))),
      head("filament & print info"),
      info,
      numField("price ($ / kg)", ex.price_per_kg ?? 25, { step: "1", min: 0, max: 500, fmt: (v) => v.toFixed(2),
        onchange: (v) => { ex.price_per_kg = v; reinfo(); } }),
      head("project"),
      h("button", { class: "btn wide", onclick: () => exportProjectZip(app.project.id) },
        "save whole project (.zip) for the Mac")),
  );

  // everything already saves as you go; this says so, and "save now" is there for peace of mind
  const saveText = h("span", {});
  const paintSaved = () => {
    const t = lastSaved?.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    saveText.textContent = !lastSaved ? "✓ saved on this phone as you go"
      : lastSaved.ok ? `✓ saved on this phone as you go · last ${t}` : `✕ last save failed (${t}) - is storage full?`;
    saveLine.classList.toggle("bad", !!lastSaved && !lastSaved.ok);
  };
  const saveLine = h("div", { class: "save-line" }, saveText,
    h("button", { class: "link save-now", type: "button", onclick: async () => {
      if (await persistNow()) toast("saved");
    } }, "save now"));
  saveWatchers.add(paintSaved);
  disposers.push(() => saveWatchers.delete(paintSaved));
  paintSaved();
  action.append(
    saveLine,
    h("button", { class: "btn ghost", onclick: () => go("back") }, "back to back art"),
    h("button", { class: "btn primary", onclick: () => commitExport() }, "export  ⬇"),
  );
  requestAnimationFrame(() => { restat(); reinfo(); showFiles(); redrawBack(0); });

  async function commitExport() {
    const formats = Object.keys(exportOpts.formats).filter((k) => exportOpts.formats[k]);
    if (!formats.length) return toast("Choose 3MF, STL, or both");
    const stem = (app.project.name || "huelite").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "huelite";
    const plan = backPlan(back);
    const withBack = back.enabled && plan.usable;
    const ring = artBorderPlan();
    const files = await busy("building files…", async () => {
      // with back art the columns start above it, and two parts fill the first layers:
      // the base with the art cut out, and the art (the same parts go in the 3MF and the STL)
      const model = mesh.buildModel({ ...modelArgs(), bottomMm: withBack ? plan.depthMm : 0 });
      if (!model.parts.length) throw new Error("every filament band came out empty");
      if (withBack) {
        const art = await backart.renderBack(mesh.modelGrid(modelArgs()), backArtOpts(back));
        for (const part of backart.backParts(art, { depthMm: plan.depthMm, slot: plan.slot, baseSlot: s.filaments[0].slot })) {
          mesh.addMeshPart(model, part);
        }
      }
      if (ring?.patterned) {
        // the pattern on the band's top face, over the columns modelArgs() stopped short (inlay) or under it (raised)
        const art = backart.renderRingTop(mesh.modelGrid(modelArgs()), { pattern: back.pattern, design: back.design,
          seed: back.seed, weight: back.weight ?? 1, title: app.project.name });
        for (const part of backart.ringParts(art, { z0: ring.z0, z1: ring.z1, slot: ring.slot,
          restSlot: ring.inlay ? ring.restSlot : null })) mesh.addMeshPart(model, part);
      }
      const out = [];
      if (formats.includes("3mf")) {
        out.push(new File([await bambu3mf.make3mf(model,
          { colours: s.filaments.map((f) => f.hex), layerHeight: lh })], `${stem}.3mf`, { type: "model/3mf" }));
      }
      if (formats.includes("stl")) out.push(new File([bambu3mf.makeStl(model)], `${stem}.stl`, { type: "model/stl" }));
      out.push(new File([bambu3mf.slotNote(s.filaments, { layerHeight: lh, back: withBack ? plan : null, ring })],
        `${stem}-filament-slots.txt`, { type: "text/plain" }));
      return out;
    }, { quiet: true }).catch((err) => { toast(`Export failed: ${err.message}`, 3000); return null; });
    if (!files) return;

    lastFiles.forEach((f) => URL.revokeObjectURL(f.url));
    lastFiles = files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    ex.formats = formats;
    ex.last_export = { time: new Date().toISOString().slice(0, 19), detail: exportOpts.detail,
                       plate: "A1", name: app.project.name, files: files.map((f) => f.name),
                       back: withBack ? { slot: plan.slot, layers: plan.layers } : null,
                       art_border: ring ? { style: ring.inlay ? "inlay" : "raised", width_mm: ring.widthMm, top_mm: ring.topMm } : null };
    setStatus("export", COMPLETE);
    await persistNow();               // the click's own save ran before the export finished
    refreshStepper();
    showFiles();
    sfx.play("success");
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

// ---------------------------------------------------------------- sound
/** Speaker button in the header: tap to mute / unmute. */
function soundButton() {
  const label = () => (sfx.isEnabled() ? "♪" : "♪ ✕");
  const b = h("button", { class: "brand link snd-btn", type: "button", "aria-label": "sound on or off",
    onclick: () => { sfx.toggle(); b.textContent = label(); b.classList.toggle("off", !sfx.isEnabled()); } }, label());
  b.classList.toggle("off", !sfx.isEnabled());
  return b;
}

/** What a press on this element should sound like, or null where something
 *  else already makes the sound (sliders, swatch sheets) or it is silent. */
function soundFor(el) {
  const b = el.closest("button");
  if (!b || b.disabled || b.closest(".loader, .toast")) return null;
  // the main menu is silent: only picking a project blips
  if (!app.project) return b.matches(".project-open, .card-open, .menu-continue") ? "select" : null;
  // sliders and the scroll bar never sound; the stage buttons have their own page sound
  if (b.matches(".slider-step, .pal-sw, .spool-btn, .rail-btn, .action .btn.primary")) return null;
  if (b.matches(".step")) return b.classList.contains("locked") ? null : "tab";   // locked: "blocked" plays
  return "tap";
}
// On the click, not the press: a finger that lands on a button to start a
// scroll pressed it too, which made a stray "boop" while scrolling. The
// browser sends no click after a scroll. On the document, so sheets and the
// update bar (which live outside the app root) are covered too.
document.addEventListener("click", (e) => {
  const name = soundFor(e.target);
  if (name) sfx.play(name);
}, true);

/** "calm" switches the slides, fades and loaders off (Settings > motion). */
function applyMotion() { document.documentElement.dataset.motion = pref("motion", "full"); }
applyMotion();
function applyHints() { document.documentElement.dataset.hints = pref("hints", "off"); }
applyHints();

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
