// Sound effects, synthesized live with WebAudio: no audio files, so the app
// stays small and works offline. Every sound is a few oscillators and a burst
// of filtered noise, kept short and quiet enough to repeat all day.
//
// Layout of the sound: the three stages share a rising triad (Prep C5, Solve
// E5, Export G5) and most chimes are built on the current stage's note, so
// the app sounds a little different - and a little higher - as a print
// moves toward the printer.
//
// play(name, arg) is the whole API. Browsers only allow audio after a touch,
// so the context is made and resumed on the first pointer-down.

const KEY_ON = "huelite.sfx", KEY_VOL = "huelite.vol";
const read = (k, fb) => { try { return localStorage.getItem(k) ?? fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

let ctx = null, master = null, noiseBuf = null;
let enabled = read(KEY_ON, "on") !== "off";
let volume = Math.min(1, Math.max(0, parseFloat(read(KEY_VOL, "0.7")) || 0.7));
const GAIN = 2.6;               // make-up gain: the sounds are written quiet so they can stack
let base = 72;                  // midi note of the current stage
const live = [];                // wall-clock times at which started sounds finish
let unlocked = false;           // true once the person has touched the page
const last = {};

const STAGE_BASE = { prep: 72, solve: 76, export: 79 };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (x) => Math.min(1, Math.max(0, +x || 0));

// ---------------------------------------------------------------- plumbing
function buildGraph(c) {
  master = c.createGain();
  master.gain.value = volume * GAIN;
  const comp = c.createDynamicsCompressor();      // many sounds at once never clip
  comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 6;
  comp.attack.value = 0.003; comp.release.value = 0.14;
  master.connect(comp);
  comp.connect(c.destination);
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 1234567;                              // fixed noise: the same whoosh every time
  for (let i = 0; i < d.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
}

/** Remember a sound that will run until `dur` s after audio time t. Wall-clock
 *  based on purpose: counting onended events would stick if the context were
 *  ever suspended, and then block every sound after it. */
function track(t, dur) {
  const now = performance.now();
  while (live.length && live[0] < now) live.shift();
  live.push(now + (Math.max(0, t - (ctx?.currentTime ?? t)) + dur + 0.05) * 1000);
  live.sort((x, y) => x - y);
}
const busyVoices = () => { const now = performance.now(); return live.filter((x) => x > now).length; };

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { ctx = new AC({ latencyHint: "interactive" }); } catch { return null; }
  buildGraph(ctx);
  return ctx;
}

/** One oscillator with an attack/decay envelope, optionally gliding to `to`. */
function tone(t, { f = 440, to = 0, type = "sine", dur = 0.1, vol = 0.15, a = 0.004, lp = 0, q = 0.7, det = 0 }) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.detune.value = det;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (lp) {
    const b = ctx.createBiquadFilter();
    b.type = "lowpass"; b.frequency.value = lp; b.Q.value = q;
    o.connect(b); b.connect(g);
  } else o.connect(g);
  g.connect(master);
  track(t, dur);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** Filtered noise: whooshes, clicks, shutters. `f` sweeps to `to` if given. */
function noise(t, { dur = 0.08, vol = 0.08, type = "bandpass", f = 1000, to = 0, q = 1, a = 0.003 }) {
  if (!ctx) return;
  const s = ctx.createBufferSource(), b = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  s.loop = true;
  b.type = type; b.Q.value = q;
  b.frequency.setValueAtTime(f, t);
  if (to) b.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(b); b.connect(g); g.connect(master);
  track(t, dur);
  s.start(t);
  s.stop(t + dur + 0.03);
}

const click = (t, vol = 0.05) => noise(t, { dur: 0.012, vol, type: "highpass", f: 3200, a: 0.001 });
const arp = (t, steps, step, mk) => steps.forEach((m, i) => mk(t + i * step, m, i));

// ---------------------------------------------------------------- the sounds
// Each: gap = least ms between plays (so a fast thumb never machine-guns),
// fn(t, arg) = schedule the notes starting at t.
const LIB = {
  // ---- taps and clicks
  tap: { gap: 25, fn(t) { tone(t, { f: 900, to: 620, dur: 0.05, vol: 0.15 }); click(t); } },
  primary: { gap: 60, fn(t) {
    tone(t, { f: hz(base), type: "triangle", dur: 0.11, vol: 0.15 });
    tone(t + 0.06, { f: hz(base + 7), type: "triangle", dur: 0.18, vol: 0.15 });
    tone(t + 0.1, { f: hz(base + 19), dur: 0.14, vol: 0.045 });
    click(t);
  } },
  chip: { gap: 30, fn(t) {
    tone(t, { f: 1500, to: 1100, type: "square", dur: 0.03, vol: 0.035, lp: 3500 });
    tone(t, { f: 720, to: 760, dur: 0.055, vol: 0.1 });
  } },
  tab: { gap: 60, fn(t) {
    tone(t, { f: hz(base), dur: 0.07, vol: 0.13 });
    tone(t + 0.045, { f: hz(base + 5), dur: 0.1, vol: 0.12 });
  } },
  warn: { gap: 60, fn(t) { tone(t, { f: 300, to: 190, type: "square", dur: 0.07, vol: 0.09, lp: 1100 }); } },
  on: { gap: 80, fn(t) {
    tone(t, { f: hz(base), dur: 0.08, vol: 0.13 });
    tone(t + 0.07, { f: hz(base + 7), dur: 0.14, vol: 0.13 });
  } },
  off: { gap: 80, fn(t) {
    tone(t, { f: hz(base + 7), dur: 0.08, vol: 0.12 });
    tone(t + 0.07, { f: hz(base), dur: 0.14, vol: 0.12 });
  } },

  // ---- sliders: a tick that climbs with the value, a pop on grab and let go
  tick: { gap: 26, fn(t, a) {
    tone(t, { f: hz(60 + clamp01(a) * 24), type: "triangle", dur: 0.04, vol: 0.085, lp: 5200 });
  } },
  grab: { gap: 50, fn(t) { tone(t, { f: 380, to: 640, dur: 0.075, vol: 0.12 }); click(t, 0.03); } },
  release: { gap: 50, fn(t) { tone(t, { f: 640, to: 400, dur: 0.1, vol: 0.1 }); } },
  bump: { gap: 140, fn(t) {
    tone(t, { f: 150, to: 80, dur: 0.11, vol: 0.2 });
    noise(t, { dur: 0.06, vol: 0.08, type: "lowpass", f: 420 });
  } },

  // ---- pages: a whoong that rises going forward, falls going back
  pageFwd: { gap: 200, fn(t) {
    noise(t, { dur: 0.5, vol: 0.085, f: 350, to: 2600, q: 2.5, a: 0.07 });
    tone(t, { f: 160, to: 430, type: "triangle", dur: 0.55, vol: 0.1, lp: 1500, a: 0.06 });
    tone(t + 0.3, { f: hz(base + 12), dur: 0.26, vol: 0.085 });
    tone(t + 0.38, { f: hz(base + 19), dur: 0.22, vol: 0.05 });
  } },
  pageBack: { gap: 200, fn(t) {
    noise(t, { dur: 0.5, vol: 0.085, f: 2600, to: 350, q: 2.5, a: 0.07 });
    tone(t, { f: 430, to: 160, type: "triangle", dur: 0.55, vol: 0.1, lp: 1500, a: 0.06 });
    tone(t + 0.28, { f: hz(base + 12), dur: 0.26, vol: 0.08 });
    tone(t + 0.36, { f: hz(base + 5), dur: 0.22, vol: 0.05 });
  } },
  pageRise: { gap: 200, fn(t) {
    noise(t, { dur: 0.45, vol: 0.06, f: 300, to: 1500, q: 1.5, a: 0.08 });
    tone(t, { f: 260, to: 520, dur: 0.45, vol: 0.075, a: 0.07 });
    tone(t + 0.3, { f: hz(base + 12), dur: 0.24, vol: 0.075 });
  } },
  arrive: { gap: 200, fn(t, n = 3) {     // soft pings as the control groups land
    for (let i = 0; i < Math.min(6, n); i++) {
      tone(t + 0.2 + i * 0.075, { f: hz(base + 12 + [0, 2, 4, 7, 9, 12][i]), dur: 0.13, vol: 0.032 });
    }
  } },
  swap: { gap: 120, fn(t) {
    noise(t, { dur: 0.12, vol: 0.05, f: 900, to: 2400, q: 2 });
    tone(t + 0.05, { f: hz(base + 12), dur: 0.1, vol: 0.055 });
  } },
  drag: { gap: 220, fn(t) { tone(t, { f: 340, to: 300, dur: 0.04, vol: 0.1 }); } },
  blocked: { gap: 250, fn(t) {
    tone(t, { f: 170, type: "square", dur: 0.07, vol: 0.065, lp: 700 });
    tone(t + 0.1, { f: 150, type: "square", dur: 0.09, vol: 0.065, lp: 700 });
  } },
  railOut: { gap: 150, fn(t) {
    noise(t, { dur: 0.2, vol: 0.075, f: 600, to: 2200, q: 2 });
    tone(t, { f: 300, to: 520, dur: 0.18, vol: 0.09 });
  } },
  railIn: { gap: 150, fn(t) {
    noise(t, { dur: 0.2, vol: 0.075, f: 2200, to: 600, q: 2 });
    tone(t, { f: 520, to: 300, dur: 0.18, vol: 0.09 });
  } },
  sheetOpen: { gap: 150, fn(t) {
    tone(t, { f: 420, to: 840, dur: 0.15, vol: 0.095 });
    noise(t, { dur: 0.17, vol: 0.04, f: 500, to: 2000, q: 1.5 });
  } },
  sheetClose: { gap: 150, fn(t) {
    tone(t, { f: 840, to: 420, dur: 0.14, vol: 0.085 });
    noise(t, { dur: 0.15, vol: 0.035, f: 2000, to: 500, q: 1.5 });
  } },

  // ---- loading: boot blip, then layers stacking up in time with the loader
  loadStart: { gap: 100, fn(t) {
    tone(t, { f: 220, to: 440, type: "triangle", dur: 0.17, vol: 0.11, lp: 1800 });
    tone(t + 0.09, { f: hz(base), dur: 0.11, vol: 0.075 });
  } },
  loadCycle: { fn(t) {
    [0, 4, 7, 12].forEach((m, i) => tone(t + 0.4 + i * 0.25, { f: hz(base + m), dur: 0.15, vol: 0.055 }));
    tone(t + 2.2, { f: hz(base - 12), dur: 0.22, vol: 0.03 });
  } },
  loadDone: { gap: 100, fn(t) {
    for (let i = 0; i < 8; i++) tone(t + i * 0.04, { f: hz(base + (i % 2 ? 16 : 12)), dur: 0.07, vol: 0.075 });
    tone(t + 0.34, { f: hz(base + 24), dur: 0.32, vol: 0.095 });
  } },
  success: { gap: 150, fn(t) {
    arp(t, [0, 4, 7, 12, 16], 0.07, (tt, m) => tone(tt, { f: hz(base + m), type: "triangle", dur: 0.2, vol: 0.11 }));
    tone(t + 0.3, { f: hz(base + 28), dur: 0.2, vol: 0.04 });
  } },
  fanfare: { gap: 400, fn(t) {
    arp(t, [0, 4, 7, 12], 0.085, (tt, m) => tone(tt, { f: hz(base + m), type: "triangle", dur: 0.24, vol: 0.13 }));
    [0, 4, 7, 12, 16].forEach((m) => tone(t + 0.4, { f: hz(base + m), dur: 0.7, vol: 0.07, a: 0.01 }));
    noise(t + 0.4, { dur: 0.6, vol: 0.03, type: "highpass", f: 6000, a: 0.15 });
    tone(t + 0.5, { f: hz(base + 31), dur: 0.5, vol: 0.04 });
  } },
  error: { gap: 300, fn(t) {
    tone(t, { f: 240, to: 120, type: "sawtooth", dur: 0.2, vol: 0.09, lp: 900 });
    tone(t + 0.17, { f: 200, to: 90, type: "sawtooth", dur: 0.26, vol: 0.09, lp: 800 });
  } },
  toast: { gap: 120, fn(t) {
    tone(t, { f: hz(base + 12), dur: 0.06, vol: 0.085 });
    tone(t + 0.055, { f: hz(base + 16), dur: 0.1, vol: 0.085 });
  } },
  chime: { gap: 500, fn(t) {      // a new version is ready
    for (const [dt, m] of [[0, 12], [0.14, 19]]) {
      tone(t + dt, { f: hz(base + m), dur: 0.7, vol: 0.09, a: 0.002 });
      tone(t + dt, { f: hz(base + m) * 2.76, dur: 0.3, vol: 0.025, a: 0.002 });
    }
  } },

  // ---- crop, lasso, 3D
  crop: { gap: 80, fn(t, a) { tone(t, { f: hz(66 + clamp01(a) * 14), type: "triangle", dur: 0.03, vol: 0.06 }); } },
  lassoOn: { gap: 150, fn(t) {
    tone(t, { f: 700, to: 1400, dur: 0.06, vol: 0.09 });
    tone(t + 0.075, { f: 900, to: 1800, dur: 0.07, vol: 0.09 });
  } },
  lassoOff: { gap: 150, fn(t) {
    tone(t, { f: 1500, to: 800, dur: 0.06, vol: 0.08 });
    tone(t + 0.075, { f: 1100, to: 600, dur: 0.08, vol: 0.08 });
  } },
  lassoDraw: { gap: 60, fn(t, a) { tone(t, { f: hz(70 + clamp01(a) * 18), dur: 0.026, vol: 0.05 }); } },
  snip: { gap: 120, fn(t) {      // scissors: two blades closing
    for (const [dt, f] of [[0, 2200], [0.075, 1800]]) {
      noise(t + dt, { dur: 0.022, vol: 0.11, type: "highpass", f: 5000, a: 0.001 });
      tone(t + dt, { f, to: f * 0.62, type: "square", dur: 0.045, vol: 0.05, lp: 4000 });
    }
  } },
  restore: { gap: 120, fn(t) {
    tone(t, { f: hz(base), to: hz(base + 7), type: "triangle", dur: 0.2, vol: 0.11 });
    tone(t + 0.15, { f: hz(base + 19), dur: 0.14, vol: 0.05 });
  } },
  keep: { gap: 120, fn(t) {
    tone(t, { f: hz(base + 12), dur: 0.16, vol: 0.11 });
    tone(t + 0.08, { f: hz(base + 19), dur: 0.2, vol: 0.1 });
    noise(t, { dur: 0.18, vol: 0.04, f: 500, to: 2500, q: 1.5 });
  } },
  undo: { gap: 100, fn(t) {
    tone(t, { f: hz(base + 7), to: hz(base), dur: 0.12, vol: 0.1 });
    click(t, 0.04);
  } },
  clear: { gap: 150, fn(t) {
    noise(t, { dur: 0.32, vol: 0.09, type: "lowpass", f: 3000, to: 200 });
    tone(t, { f: 200, to: 80, dur: 0.26, vol: 0.11 });
  } },
  orbit: { gap: 55, fn(t, a) { tone(t, { f: hz(62 + clamp01(a) * 14), dur: 0.026, vol: 0.06 }); } },
  zoom: { gap: 65, fn(t, a) { tone(t, { f: hz(58 + clamp01(a) * 24), dur: 0.034, vol: 0.07 }); } },

  // ---- projects, files, colour
  open: { gap: 200, fn(t) {
    arp(t, [0, 4, 7], 0.05, (tt, m) => tone(tt, { f: hz(base + m), type: "triangle", dur: 0.14, vol: 0.11 }));
    noise(t, { dur: 0.26, vol: 0.05, f: 400, to: 1800, q: 1.5 });
  } },
  move: { gap: 120, fn(t) {
    tone(t, { f: hz(base + 7), type: "triangle", dur: 0.07, vol: 0.11 });
    tone(t + 0.075, { f: hz(base), type: "triangle", dur: 0.12, vol: 0.13 });
    click(t + 0.075, 0.04);
  } },
  delete: { gap: 200, fn(t) {
    tone(t, { f: 420, to: 70, type: "sawtooth", dur: 0.3, vol: 0.09, lp: 1200 });
    noise(t, { dur: 0.32, vol: 0.07, type: "lowpass", f: 1200, to: 150 });
  } },
  photo: { gap: 300, fn(t) {      // a shutter, then a ping
    noise(t, { dur: 0.035, vol: 0.13, f: 2500, q: 1.2, a: 0.001 });
    noise(t + 0.06, { dur: 0.04, vol: 0.1, f: 1800, q: 1.2, a: 0.001 });
    tone(t + 0.13, { f: hz(base + 12), dur: 0.22, vol: 0.08 });
  } },
  pick: { gap: 40, fn(t, a) {
    const f = hz(64 + clamp01(a) * 20);
    tone(t, { f, dur: 0.09, vol: 0.11 });
    tone(t, { f: f * 2, type: "triangle", dur: 0.06, vol: 0.035 });
  } },
  zip: { gap: 200, fn(t) {
    for (let i = 0; i < 3; i++) tone(t + i * 0.07, { f: 600 + i * 120, to: 900 + i * 160, dur: 0.07, vol: 0.09 });
  } },
};

// ---------------------------------------------------------------- API
/** Play a named sound. Cheap to call often: it rate-limits itself. */
export function play(name, arg) {
  if (!enabled || !unlocked) return;
  const def = LIB[name];
  if (!def) return;
  const c = ensure();
  if (!c) return;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  if (def.gap && now - (last[name] || 0) < def.gap) return;
  last[name] = now;
  if (c.state !== "running") {
    // the first touch is what wakes the audio: play that touch's sound as it
    // wakes, but never a stale one that was asked for long before
    c.resume().then(() => {
      if (c.state === "running" && performance.now() - now < 500) def.fn(c.currentTime + 0.006, arg);
    }).catch(() => {});
    return;
  }
  if (busyVoices() > 44) return;                 // a pile-up of sounds is worse than a missing one
  def.fn(c.currentTime + 0.006, arg);
}

export const isEnabled = () => enabled;
export const getVolume = () => volume;

export function setEnabled(on) {
  enabled = !!on;
  write(KEY_ON, enabled ? "on" : "off");
  if (enabled) play("on");
}
export function toggle() {
  if (enabled) { play("off"); enabled = false; write(KEY_ON, "off"); return false; }
  setEnabled(true);
  return true;
}
export function setVolume(v) {
  volume = clamp01(v);
  write(KEY_VOL, String(volume));
  if (master) master.gain.value = volume * GAIN;
}

/** The stage a screen belongs to sets the key of its chimes. */
export function setStage(stage) { base = STAGE_BASE[stage] ?? 72; }

/** Layers stacking, in time with the loader animation. Returns done(ok). */
export function loading() {
  play("loadStart");
  const cycle = () => {
    if (!enabled || !ctx || ctx.state !== "running") return;
    LIB.loadCycle.fn(ctx.currentTime + 0.006);
  };
  cycle();
  const id = setInterval(cycle, 2500);
  return (ok = true) => { clearInterval(id); play(ok ? "loadDone" : "error"); };
}

/** A short tour of the sounds, for the settings panel. */
export function demo() {
  const tour = [["tap", 0], ["primary", 220], ["chip", 560], ["tick", 760, 0.2], ["tick", 800, 0.5], ["tick", 840, 0.8],
    ["grab", 1000], ["release", 1160], ["pageFwd", 1350], ["snip", 2000], ["restore", 2250], ["success", 2650], ["fanfare", 3250]];
  for (const [name, at, arg] of tour) setTimeout(() => play(name, arg), at);
}

// Browsers keep audio locked until a touch: make and resume it on the first one.
if (typeof window !== "undefined") {
  const unlock = () => {
    unlocked = true;
    const c = ensure();
    if (c?.state === "suspended") c.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true, passive: true });
}

// For tests: render sounds into an OfflineAudioContext.
export const _LIB = LIB;
export function _useContext(c) { ctx = c; enabled = true; unlocked = true; buildGraph(c); }
