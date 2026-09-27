import { app, canOpen, COMPLETE, defaultData, MOBILE_OUTPUT_PX, setStatus,
         STAGE_LABELS, STAGE_REQUIRES, STAGES } from "./state.js";
import { ASPECTS, createCropper, loadPhoto } from "./crop.js";

const root = document.getElementById("app");
let cropper = null;
let aspectKey = "free";

// ---------------------------------------------------------------- helpers
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
};
const head = (text) => h("div", { class: "section-head" }, `[ ${text} ]`);
// Desktop view panel: corner marks + optional caption.
const frame = (caption, ...kids) => h("div", { class: "frame" },
  h("i"), h("i"), h("i"), h("i"),
  caption ? h("div", { class: "frame-caption" }, caption) : null, ...kids);
const kv = (pairs) => h("dl", { class: "kv" },
  pairs.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));

const STAGE_SUB = {
  prep: "crop, orient, size and simplify the source",
  solve: "filament stack and depth",
  export: "mesh, package, and send to the printer",
};

let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = h("div", { class: "toast" }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
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
      const name = (file.name || "photo").replace(/\.[^.]+$/, "");
      app.project = defaultData(name);
      app.project.source = { filename: file.name, width_px: bmp.width, height_px: bmp.height };
      app.preppedCanvas = null;
      aspectKey = "free";
      go("prep");
    } catch (err) {
      console.error(err);
      toast("Couldn't open that photo");
    }
  } });
document.body.append(picker);

// ---------------------------------------------------------------- shell
function render() {
  cropper?.destroy();
  cropper = null;
  root.innerHTML = "";
  root.dataset.stage = app.stage;

  const name = app.project?.name || "no project";
  const n = STAGES.indexOf(app.stage) + 1;
  root.append(
    h("header", { class: "top" },
      h("div", { class: "top-row" },
        h("h1", { class: "stage-title" }, `0${n} ${STAGE_LABELS[app.stage]}`),
        h("div", { class: "brand" }, "HueLite")),
      h("div", { class: "top-sub" },
        h("span", { class: "proj", onclick: rename }, name),
        h("span", { class: "dotsep" }, "·"),
        STAGE_SUB[app.stage])),
  );

  const screen = h("main", { class: "screen" });
  const action = h("div", { class: "action" });
  ({ prep: renderPrep, solve: renderSolve, export: renderExport })[app.stage](screen, action);
  root.append(screen);
  if (action.childElementCount) root.append(action);
  root.append(renderStepper());
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
    screen.append(h("div", { class: "pick" },
      frame(null, h("button", { class: "drop", onclick: () => picker.click() },
        h("b", {}, "+ choose a photo"),
        h("span", {}, "library or camera"))),
      h("p", { class: "meta" },
        "turns it into a layered, multi-filament print for the A1.")));
    return;
  }

  const p = app.project.prep;
  screen.append(head("crop"));
  const cropHost = h("div");
  screen.append(frame(null, cropHost));
  const readout = h("div");
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

  // mount after it's in the DOM so it can measure its width
  let ready = false; // don't treat the initial layout as a user edit
  requestAnimationFrame(() => {
    cropper = createCropper(cropHost, app.sourceBitmap, {
      rotateDeg: p.rotate_deg, flipH: p.flip_h, crop: p.crop,
      onChange: (crop) => {
        p.crop = crop;
        updateReadout(crop);
        if (ready && app.project.status.prep === COMPLETE) { setStatus("prep", "pending"); refreshStepper(); }
      },
    });
    const a = ASPECTS.find((x) => x.key === aspectKey);
    if (a?.ratio) cropper.setAspect(a.ratio);
    p.crop = cropper.getCrop();
    updateReadout(p.crop);
    ready = true;
  });

  const aspectChips = h("div", { class: "chips" }, ASPECTS.map((a) =>
    h("button", { class: `chip${a.key === aspectKey ? " on" : ""}`, onclick: (e) => {
      aspectKey = a.key;
      aspectChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
      e.currentTarget.classList.add("on");
      cropper?.setAspect(a.ratio);
    } }, a.label)));

  screen.append(
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
    h("div", { style: "margin-top:12px" }, aspectChips),
    readout,

    head("print size"),
    h("label", { class: "field" }, "width (mm)",
      h("input", { class: "val", type: "number", inputmode: "decimal", min: "20", max: "256", step: "1",
        value: String(p.physical_width_mm), onchange: (e) => {
          const v = Math.min(256, Math.max(20, parseFloat(e.target.value) || 120));
          p.physical_width_mm = v;
          e.target.value = String(v);
          updateReadout(p.crop);
        } })),
    h("p", { class: "meta" }, "A1 bed is 256 mm · A1 mini is 180 mm"),

    head("adjustments"),
    h("div", { class: "todo" },
      h("b", {}, "brightness · contrast · saturation · denoise · sharpen"),
      "These come across with the engine port so they match the desktop exactly, " +
      "instead of looking similar and solving differently."),
  );

  action.append(
    h("button", { class: "btn ghost", onclick: () => picker.click() }, "new photo"),
    h("button", { class: "btn primary", onclick: commitPrep }, "prep  &  continue  →"),
  );
}

function refreshStepper() {
  root.querySelector(".stepper")?.replaceWith(renderStepper());
}

function commitPrep() {
  if (!cropper) return;
  app.preppedCanvas = cropper.output(MOBILE_OUTPUT_PX);
  app.project.prep.output_px = [app.preppedCanvas.width, app.preppedCanvas.height];
  setStatus("prep", COMPLETE);
  go("solve");
}

// ---------------------------------------------------------------- solve
function renderSolve(screen, action) {
  const s = app.project.solve;
  const tabs = h("div", { class: "chips" },
    ["simulated print", "side", "~30° angle", "height", "source"].map((t) =>
      h("button", { class: `chip${t === "source" ? " on" : ""}`, onclick: () =>
        t === "source" ? null : toast("previews arrive with the engine port") }, t)));
  screen.append(h("div", { style: "margin-top:8px" }, tabs));
  if (app.preppedCanvas) {
    const img = h("img", { class: "preview-out", alt: "prepped" });
    img.src = app.preppedCanvas.toDataURL("image/jpeg", 0.9);
    screen.append(h("div", { style: "margin-top:10px" }, frame(null, img)));
  }

  const numIn = (obj, key, step, min, max, fmt = (v) => String(v)) =>
    h("input", { class: "val", type: "number", inputmode: "decimal", step, min, max,
      value: fmt(obj[key]), onchange: (e) => {
        const v = Math.min(max, Math.max(min, parseFloat(e.target.value) || obj[key]));
        obj[key] = v;
        e.target.value = fmt(v);
      } });

  screen.append(head("filaments"),
    h("p", { class: "meta", style: "margin:-4px 0 8px" }, "slot 1 prints lowest"),
    h("div", { class: "fil-table" },
      h("span"), h("span", { class: "th" }, "colour"), h("span", { class: "th" }, "TD mm"),
      h("span", { class: "th" }, "layers"),
      s.filaments.flatMap((f) => [
        h("span", { class: "idx" }, String(f.slot)),
        h("span", { class: "sw", style: `background:${f.hex}` }),
        numIn(f, "td_mm", "0.01", 0.05, 10, (v) => v.toFixed(2)),
        numIn(f, "band_layers", "1", 0, 60),
      ])));

  const num = (labelText, key, step, min, max) =>
    h("label", { class: "field" }, labelText,
      h("input", { class: "val", type: "number", inputmode: "decimal", step, min, max, value: String(s[key]),
        onchange: (e) => {
          const v = Math.min(max, Math.max(min, parseFloat(e.target.value) || s[key]));
          s[key] = v;
          e.target.value = String(v);
        } }));

  screen.append(head("layers"),
    num("layer height (mm)", "layer_height_mm", "0.01", 0.04, 0.2),
    num("base layers", "base_layers", "1", 1, 40),
    num("max colour layers", "max_layers", "1", 5, 120),

    head("depth solve"),
    h("div", { class: "todo" },
      h("b", {}, "waiting on the engine port"),
      "The LUT, dithering and heightmap solve get ported from the desktop's core/ " +
      "and checked against its output before this button goes live."));

  action.append(
    h("button", { class: "btn ghost", onclick: () => go("prep") }, "return without saving"),
    h("button", { class: "btn primary", disabled: true }, "solve  &  continue  →"),
  );
}

// ---------------------------------------------------------------- export
function renderExport(screen, action) {
  screen.append(head("views"),
    h("div", { class: "todo" },
      h("b", {}, "coming after solve"),
      "Mesh build, Bambu 3MF, filament cost / purge / colour-switch estimate, " +
      "bed tips, and sending the file out through the iOS share sheet."));
  action.append(
    h("button", { class: "btn ghost", onclick: () => go("solve") }, "return without exporting"),
    h("button", { class: "btn primary", disabled: true }, "commit  &  export  →"));
}

render();
