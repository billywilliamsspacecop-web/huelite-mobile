// Updates, made a little fun: a card when a new build is ready, and after it
// installs, a print stacks itself layer by layer while filament bits fall and
// a different congratulation comes up each time.

import { h } from "./dom.js";
import { spool } from "./spool.js";
import * as sfx from "./sfx.js";

const KEY_BUILD = "huelite.lastBuild", KEY_COUNT = "huelite.updates", KEY_MSG = "huelite.lastCheer";
const read = (k, fb) => { try { return localStorage.getItem(k) ?? fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

const PALETTE = ["#1b1b19", "#b8322a", "#e8b923", "#3e7cb1", "#3f9a62", "#f4f4ef", "#c06c9a", "#ff8a3d"];

const CHEERS = [
  ["Fresh off the plate!", "Another update printed without a single layer shift."],
  ["Zero stringing.", "This update went down clean, first layer to last."],
  ["Nailed the first layer.", "Update installed and sticking to the bed."],
  ["AMS reloaded.", "New colours, new tricks, same four slots."],
  ["No spaghetti here.", "Update finished without a single failed print."],
  ["Hot off the nozzle!", "The newest HueLite is warmed up and ready."],
  ["Purge complete.", "The old version flushed out, the new one is loaded."],
  ["Layer 1 of many.", "Another successful update in the books."],
  ["Bed leveled, vibes calibrated.", "Update done. Go make something."],
  ["Print-Brick approved.", "This one passed inspection on the first try."],
  ["Filament change: success.", "Swapped in a brand new HueLite."],
  ["That's a clean peel.", "Update came off the plate in one piece."],
  ["Another one for the shelf!", "Update installed. Your prints are waiting."],
  ["Prime tower: not needed.", "This update went straight to the good part."],
];

/** Has this app just been updated? Remembers the build it last ran. Returns
 *  the update number (1, 2, ...) or 0. The first run ever is not an update. */
export function checkUpdated(build) {
  const last = read(KEY_BUILD, "");
  write(KEY_BUILD, build);
  if (!last || last === build) return 0;
  const n = (parseInt(read(KEY_COUNT, "0"), 10) || 0) + 1;
  write(KEY_COUNT, String(n));
  return n;
}

/** A different cheer from last time. */
function pickCheer() {
  const lastI = parseInt(read(KEY_MSG, "-1"), 10);
  let i = Math.floor(Math.random() * CHEERS.length);
  if (i === lastI) i = (i + 1 + Math.floor(Math.random() * (CHEERS.length - 1))) % CHEERS.length;
  write(KEY_MSG, String(i));
  return CHEERS[i];
}

/** The ready-to-update card: a spinning spool and one big button. */
export function showUpdateReady(onWait = null) {
  if (document.querySelector(".update-card")) return;
  const sp = spool(PALETTE[2], { mini: true });
  const card = h("div", { class: "update-card", role: "dialog", "aria-label": "update ready" },
    h("div", { class: "uc-spool" }, sp),
    h("div", { class: "uc-text" }, h("b", {}, "A new HueLite is ready"), h("span", {}, "install now, or wait: it switches over next time you open HueLite.")),
    h("div", { class: "uc-btns" },
      h("button", { type: "button", class: "uc-go", onclick: () => { card.classList.add("going"); setTimeout(() => location.reload(), 380); } }, "install"),
      h("button", { type: "button", class: "uc-later", onclick: () => {
        card.classList.add("going");
        setTimeout(() => card.remove(), 380);
        onWait?.();
      } }, "wait")));
  document.body.append(card);
}

/** The celebration after an update: n = which update this is. */
export function celebrate(n, { version = "", name = "", changes = [] } = {}) {
  const reduced = matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [title, line] = pickCheer();
  const layers = h("div", { class: "cb-print" },
    Array.from({ length: 9 }, (_, i) => h("i", { style: `--k:${i};--c:${PALETTE[(i + n) % PALETTE.length]}` })),
    h("b", { class: "cb-nozzle" }));
  const bits = reduced ? null : h("div", { class: "cb-bits", "aria-hidden": "true" },
    Array.from({ length: 42 }, () => h("i", { style:
      `--x:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 1.6).toFixed(2)}s;--t:${(2.2 + Math.random() * 1.8).toFixed(2)}s;` +
      `--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${PALETTE[Math.floor(Math.random() * PALETTE.length)]};--w:${(4 + Math.random() * 6).toFixed(0)}px` })));
  const close = () => { veil.classList.add("bye"); setTimeout(() => veil.remove(), 420); };
  const veil = h("div", { class: "cb-veil", role: "dialog", "aria-label": "update installed" },
    bits,
    h("div", { class: "cb-card" },
      layers,
      h("div", { class: "cb-count" }, `update #${n}${version ? ` · v${version}` : ""}${name ? ` · ${name}` : ""}`),
      h("h2", { class: "cb-title" }, title),
      h("p", { class: "cb-line" }, line),
      changes.length ? h("ul", { class: "cb-new" }, changes.slice(0, 3).map((c) => h("li", {}, c))) : null,
      h("button", { type: "button", class: "btn primary cb-go", onclick: () => { sfx.play("success", undefined, true); close(); } }, "let's print")));
  veil.addEventListener("pointerdown", (e) => { if (e.target === veil) close(); });
  document.body.append(veil);
}
