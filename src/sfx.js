// Sound effects, synthesized live with WebAudio: no audio files, so the app
// stays small and works offline. Every sound is a few oscillators and a burst
// of filtered noise, kept short and quiet.
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
// A small, uniform set. Each: gap = least ms between plays, fn(t, arg) =
// schedule the notes starting at t.
//
//   tap                      every ordinary button press, the same quiet tick
//   select                   picking a project on the main menu (the only
//                            sound the menu makes besides the sound toggle)
//   tab, pageFwd, pageBack,  moving between Prep / Solve / Export: the press,
//   arrive, blocked          the whoong that rises going forward and falls
//                            going back, a ping per control group as it lands,
//                            and a low buzz for a stage that isn't open yet
//   done, success, error     a quiet finish, a slightly warmer one for an
//                            export, and a low double buzz when something fails
//
// Sliders, the scroll bar, crop, lasso, 3D and sheets are silent on purpose.
const LIB = {
  tap: { gap: 40, fn(t) { tone(t, { f: 760, to: 620, dur: 0.05, vol: 0.08 }); } },
  select: { gap: 150, fn(t) { tone(t, { f: 880, to: 1046, dur: 0.075, vol: 0.11 }); } },
  on: { gap: 150, fn(t) {
    tone(t, { f: 660, dur: 0.07, vol: 0.09 });
    tone(t + 0.06, { f: 990, dur: 0.1, vol: 0.09 });
  } },

  // ---- between stages (as they were: these are the ones to keep)
  tab: { gap: 60, fn(t) {
    tone(t, { f: hz(base), dur: 0.07, vol: 0.13 });
    tone(t + 0.045, { f: hz(base + 5), dur: 0.1, vol: 0.12 });
  } },
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
  arrive: { gap: 200, fn(t, n = 3) {
    for (let i = 0; i < Math.min(6, n); i++) {
      tone(t + 0.2 + i * 0.075, { f: hz(base + 12 + [0, 2, 4, 7, 9, 12][i]), dur: 0.13, vol: 0.032 });
    }
  } },
  blocked: { gap: 250, fn(t) {
    tone(t, { f: 170, type: "square", dur: 0.07, vol: 0.065, lp: 700 });
    tone(t + 0.1, { f: 150, type: "square", dur: 0.09, vol: 0.065, lp: 700 });
  } },

  // ---- finishing
  done: { gap: 200, fn(t) {
    tone(t, { f: hz(base + 12), dur: 0.08, vol: 0.075 });
    tone(t + 0.075, { f: hz(base + 19), dur: 0.14, vol: 0.075 });
  } },
  success: { gap: 300, fn(t) {
    arp(t, [0, 4, 7], 0.08, (tt, m) => tone(tt, { f: hz(base + 12 + m), type: "triangle", dur: 0.2, vol: 0.085 }));
  } },
  error: { gap: 300, fn(t) {
    tone(t, { f: 240, to: 130, type: "sawtooth", dur: 0.18, vol: 0.06, lp: 900 });
    tone(t + 0.16, { f: 200, to: 100, type: "sawtooth", dur: 0.22, vol: 0.06, lp: 800 });
  } },
};

// ---------------------------------------------------------------- API
let menu = false;                        // on the main menu only SELECT_OK may sound
const MENU_OK = new Set(["select", "on"]);

/** Play a named sound. Cheap to call often: it rate-limits itself. `force`
 *  skips the menu rule (the demo). */
export function play(name, arg, force = false) {
  if (!enabled || !unlocked) return;
  if (menu && !force && !MENU_OK.has(name)) return;
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
  if (busyVoices() > 44) return;         // a pile-up of sounds is worse than a missing one
  def.fn(c.currentTime + 0.006, arg);
}

export const isEnabled = () => enabled;
export const getVolume = () => volume;

export function setEnabled(on) {
  enabled = !!on;
  write(KEY_ON, enabled ? "on" : "off");
  if (enabled) play("on");
}
/** The header button: turning sound on blips; turning it off is silent. */
export function toggle() {
  setEnabled(!enabled);
  return enabled;
}
export function setVolume(v) {
  volume = clamp01(v);
  write(KEY_VOL, String(volume));
  if (master) master.gain.value = volume * GAIN;
}

/** The stage a screen belongs to sets the key of its chimes. */
export function setStage(stage) { base = STAGE_BASE[stage] ?? 72; }
/** On the main menu nothing sounds but a project being picked. */
export function setMenu(on) { menu = !!on; }

/** Returns done(ok, quiet): a quiet finish for work that ends by changing
 *  page (the page sound is already the cue); a failure is always heard. */
export function loading() {
  return (ok = true, quiet = false) => { if (!ok) play("error"); else if (!quiet) play("done"); };
}

/** A short tour of the sounds, for the settings page. */
export function demo() {
  const tour = [["tap", 0], ["select", 400], ["tab", 900], ["pageFwd", 1300], ["pageBack", 2100], ["done", 2900], ["success", 3300]];
  for (const [name, at] of tour) setTimeout(() => play(name, undefined, true), at);
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
