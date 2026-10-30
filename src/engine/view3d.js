// A real 3D preview of the print, in WebGL2.
//
// The old angle view painted columns onto a 2D canvas at 180 columns with
// the height stretched 6x, which is why it looked blocky and nothing like
// Bambu Studio. This draws the same geometry the 3MF holds - one flat-topped
// column per pixel, standing on the plate at true scale - and lets you turn
// it with a finger.
//
// How it stays cheap: nothing is meshed on the CPU. The heights go up as a
// texture and ONE instanced draw puts a column at every cell. A cell's side
// wall is only emitted where its neighbour is lower (everything else is
// culled in the vertex shader), so the work is proportional to what can
// actually be seen. Colours are looked up per layer in a 1-wide LUT texture
// from the fragment's height, so a wall shows its filament bands stacked
// exactly as they print, and the tops show the tone the solve picked.
//
// Colour accuracy: a column's top face is never shaded - flat areas show
// exactly the LUT colour. Only the walls are darkened a little so the
// relief reads.

import { downsampleMask, downsampleMax } from "./mesh.js";
import { play } from "../sfx.js";

const EMPTY = 65535;          // height-texture value for "no print here"
const RELIEFS = [1, 3, 6];    // z stretch: true scale, then easier to read
const MIN_EL = 0.12, MAX_EL = 1.5;
const DEFAULT_EL = (30 * Math.PI) / 180;
const FOV = (32 * Math.PI) / 180;
const PLATE_MARGIN_MM = 4;

// Camera state outlives any one view, so going Solve -> Export -> Solve
// keeps the angle you turned to.
const camera = { az: 0, el: DEFAULT_EL, zoom: 1, relief: 1 };

// ---------------------------------------------------------------- matrices
const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
};

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return Float32Array.from([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function lookAt(eye, target) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const z = norm(sub(eye, target));
  const x = norm(cross([0, 0, 1], z));
  const y = cross(z, x);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Float32Array.from([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
                            -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}

// ---------------------------------------------------------------- shaders
const COLUMN_VS = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
layout(location = 0) in vec3 aVert;     // a, b along the face; face id
uniform usampler2D uHeights;
uniform mat4 uViewProj;
uniform ivec2 uGrid;                    // columns, rows
uniform vec2 uCell;                     // cell size in mm
uniform vec2 uOrigin;                   // world x of the left edge, y of the front edge
uniform vec2 uZ;                        // layer height mm, base mm
uniform float uRelief;
out float vZL;                          // height in layers (can be below 0: the base)
flat out int vFace;
void main() {
  int id = gl_InstanceID;
  int c = id % uGrid.x;
  int r = id / uGrid.x;
  uint hv = texelFetch(uHeights, ivec2(c, r), 0).r;
  int face = int(aVert.z + 0.5);
  vFace = face;
  vZL = 0.0;
  if (hv == ${EMPTY}u) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float top = float(hv);
  float bottom = -uZ.y / uZ.x;          // down to the plate
  if (face > 0) {
    ivec2 nb = ivec2(c, r) + (face == 1 ? ivec2(1, 0) : face == 2 ? ivec2(-1, 0)
                            : face == 3 ? ivec2(0, -1) : ivec2(0, 1));
    if (nb.x >= 0 && nb.y >= 0 && nb.x < uGrid.x && nb.y < uGrid.y) {
      uint nh = texelFetch(uHeights, nb, 0).r;
      if (nh != ${EMPTY}u) {
        if (float(nh) >= top) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        bottom = float(nh);
      }
    }
  }
  float dx = face == 0 ? aVert.x : face == 1 ? 1.0 : face == 2 ? 0.0 : aVert.x;
  float dy = face == 0 ? aVert.y : face == 3 ? 1.0 : face == 4 ? 0.0 : aVert.x;
  float zl = face == 0 ? top : mix(bottom, top, aVert.y);
  vZL = zl;
  vec3 p = vec3(uOrigin.x + (float(c) + dx) * uCell.x,
                uOrigin.y + (float(uGrid.y - 1 - r) + dy) * uCell.y,
                (uZ.y + zl * uZ.x) * uRelief);
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

const COLUMN_FS = `#version 300 es
precision highp float;
precision highp int;
in float vZL;
flat in int vFace;
uniform sampler2D uLut;
uniform int uLutN;
uniform mat3 uViewRot;
out vec4 outColour;
void main() {
  int idx = clamp(int(ceil(vZL - 0.002)), 0, uLutN - 1);
  vec3 col = texelFetch(uLut, ivec2(idx, 0), 0).rgb;
  float f = 1.0;                         // tops are never shaded
  if (vFace != 0) {
    vec3 n = vFace == 1 ? vec3(1.0, 0.0, 0.0) : vFace == 2 ? vec3(-1.0, 0.0, 0.0)
           : vFace == 3 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, -1.0, 0.0);
    vec3 l = normalize(vec3(-0.35, 0.40, 0.85));
    f = 0.46 + 0.54 * clamp(dot(uViewRot * n, l), 0.0, 1.0);
  }
  outColour = vec4(col * f, 1.0);
}`;

const PLATE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform mat4 uViewProj;
uniform vec4 uRect;                      // x0, y0, x1, y1
uniform float uZ;
void main() {
  vec2 p = mix(uRect.xy, uRect.zw, aPos);
  gl_Position = uViewProj * vec4(p, uZ, 1.0);
}`;
const PLATE_FS = `#version 300 es
precision highp float;
uniform vec3 uColour;
out vec4 outColour;
void main() { outColour = vec4(uColour, 1.0); }`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader failed");
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link failed");
  return p;
}

// One column: the top (face 0) and four walls (1 right, 2 left, 3 back, 4 front),
// each its own quad so a face id travels with its vertices.
const QUADS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const VERTS = Float32Array.from([0, 1, 2, 3, 4].flatMap((face) => QUADS.flatMap(([a, b]) => [a, b, face])));
const INDICES = Uint8Array.from([0, 1, 2, 3, 4].flatMap((q) => [0, 1, 2, 0, 2, 3].map((i) => q * 4 + i)));

export function supportsView3D() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch { return false; }
}

/** -> { el, set(scene), resetCamera(), destroy() } or null if WebGL2 isn't there.
 *
 *  scene: { heights, w, h, mask, lut, layerH, baseMm, physicalW, maxCols }
 *  heights is the solved layer count per pixel (Uint16Array, w*h). */
export function createView3D({ onHint = true, pose = null, offscreen = false } = {}) {
  // a fixed pose (thumbnails) keeps its own camera; the on-screen view shares one
  const cam = pose ? { az: 0, el: DEFAULT_EL, zoom: 1, relief: 1, ...pose } : camera;
  const canvas = document.createElement("canvas");
  canvas.className = "gl-canvas";
  let gl;
  try {
    gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true,
                                       powerPreference: "high-performance" });
  } catch { gl = null; }
  if (!gl) return null;

  const wrap = document.createElement("div");
  wrap.className = "gl-wrap";
  const hint = document.createElement("span");
  hint.className = "gl-hint";
  hint.textContent = "drag to turn · pinch to zoom";
  const reliefBtn = document.createElement("button");
  reliefBtn.type = "button";
  reliefBtn.className = "gl-btn";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "gl-btn";
  resetBtn.textContent = "⟲ view";
  const tools = document.createElement("div");
  tools.className = "gl-tools";
  tools.append(reliefBtn, resetBtn);
  wrap.append(canvas, ...(onHint && !pose ? [hint] : []), ...(pose ? [] : [tools]));

  let res = null;         // gl objects, rebuilt after a context loss
  let scene = null;       // last scene given to set()
  let levels = [];        // height textures: [full, coarse?]
  let raf = 0;
  let interacting = 0;
  let timer = 0;
  let destroyed = false;

  function init() {
    const col = program(gl, COLUMN_VS, COLUMN_FS);
    const plate = program(gl, PLATE_VS, PLATE_FS);
    const loc = (p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, VERTS, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, INDICES, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    const pvao = gl.createVertexArray();
    gl.bindVertexArray(pvao);
    const pb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    res = {
      col, plate, vao, pvao,
      cu: loc(col, ["uHeights", "uViewProj", "uGrid", "uCell", "uOrigin", "uZ", "uRelief", "uLut", "uLutN", "uViewRot"]),
      pu: loc(plate, ["uViewProj", "uRect", "uZ", "uColour"]),
      lutTex: null,
    };
  }

  function texture(internal, format, type, w, h, data, align) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, align);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function freeLevels() {
    for (const l of levels) gl.deleteTexture(l.tex);
    levels = [];
  }

  /** One grid of heights (EMPTY outside the outline) as a texture. */
  function level(a, mask, cols, rows, cell) {
    const data = new Uint16Array(cols * rows);
    let top = 0;
    for (let i = 0; i < data.length; i++) {
      if (mask && !mask[i]) { data[i] = EMPTY; continue; }
      const v = Math.min(EMPTY - 1, a[i]);
      data[i] = v;
      if (v > top) top = v;
    }
    return { tex: texture(gl.R16UI, gl.RED_INTEGER, gl.UNSIGNED_SHORT, cols, rows, data, 1),
             cols, rows, cell, top };
  }

  function build() {
    if (!scene || !res) return;
    const { heights, w, h, mask, lut, layerH, baseMm, physicalW, maxCols = 640 } = scene;
    freeLevels();
    const f = Math.max(1, Math.ceil(Math.max(w, h) / maxCols));
    const g = downsampleMax(heights, w, h, f);
    const m = downsampleMask(mask, w, h, f);
    const cell = (physicalW / w) * f;
    const full = level(g.a, m, g.w, g.h, cell);
    levels = [full];
    // Many cells: a coarser copy to draw while a finger is turning the model.
    if (g.w * g.h > 150000) {
      const g2 = downsampleMax(g.a, g.w, g.h, 2);
      levels.push(level(g2.a, downsampleMask(m, g.w, g.h, 2), g2.w, g2.h, cell * 2));
    }
    const n = lut.length;
    const px = new Uint8Array(n * 4);
    lut.forEach((c, i) => { px[i * 4] = Math.round(c[0]); px[i * 4 + 1] = Math.round(c[1]); px[i * 4 + 2] = Math.round(c[2]); px[i * 4 + 3] = 255; });
    if (res.lutTex) gl.deleteTexture(res.lutTex);
    res.lutTex = texture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, n, 1, px, 1);
    res.lutN = n;
    res.geo = { layerH, baseMm, widthMm: full.cols * cell, depthMm: full.rows * cell,
                topMm: baseMm + full.top * layerH };
    res.fit = null;
  }

  // ---- camera
  /** Distance at which the whole plate fits at the default pose. */
  function fitDistance(aspect) {
    const { widthMm: W, depthMm: D, topMm } = res.geo;
    const hw = W / 2 + PLATE_MARGIN_MM, hd = D / 2 + PLATE_MARGIN_MM;
    const T = topMm * cam.relief;
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [0, T]) corners.push([sx * hw, sy * hd, z]);
    const centre = [0, 0, T / 2];
    let d = Math.max(W, D) * 2;
    for (let i = 0; i < 8; i++) {
      const { vp } = matrices(aspect, d, pose ? cam.el : DEFAULT_EL, pose ? cam.az : 0, centre);
      let worst = 0;
      for (const c of corners) {
        const x = vp[0] * c[0] + vp[4] * c[1] + vp[8] * c[2] + vp[12];
        const y = vp[1] * c[0] + vp[5] * c[1] + vp[9] * c[2] + vp[13];
        const ww = vp[3] * c[0] + vp[7] * c[1] + vp[11] * c[2] + vp[15];
        worst = Math.max(worst, Math.abs(x / ww), Math.abs(y / ww));
      }
      d *= Math.max(0.2, worst / 0.97);
    }
    return d;
  }

  function matrices(aspect, dist, el, az, centre) {
    const eye = [centre[0] + dist * Math.sin(az) * Math.cos(el),
                 centre[1] - dist * Math.cos(az) * Math.cos(el),
                 centre[2] + dist * Math.sin(el)];
    const view = lookAt(eye, centre);
    const proj = perspective(FOV, aspect, dist * 0.04, dist * 5);
    return { vp: mul(proj, view), view };
  }

  function draw() {
    raf = 0;
    if (destroyed || !res || !levels.length || !res.geo || gl.isContextLost()) return;
    const cw = canvas.width, ch = canvas.height;
    if (!cw || !ch) return;
    const aspect = cw / ch;
    if (!res.fit || res.fit.aspect !== aspect) res.fit = { aspect, dist: fitDistance(aspect) };
    const { widthMm: W, depthMm: D, topMm, layerH, baseMm } = res.geo;
    const T = topMm * cam.relief;
    const centre = [0, 0, T / 2];
    const { vp, view } = matrices(aspect, res.fit.dist * cam.zoom, cam.el, cam.az, centre);

    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0.098, 0.098, 0.09, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // the plate
    gl.useProgram(res.plate);
    gl.uniformMatrix4fv(res.pu.uViewProj, false, vp);
    gl.uniform4f(res.pu.uRect, -W / 2 - PLATE_MARGIN_MM, -D / 2 - PLATE_MARGIN_MM,
                 W / 2 + PLATE_MARGIN_MM, D / 2 + PLATE_MARGIN_MM);
    gl.uniform1f(res.pu.uZ, -0.05);
    gl.uniform3f(res.pu.uColour, 0.165, 0.165, 0.15);
    gl.bindVertexArray(res.pvao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // the print
    const lv = interacting && levels.length > 1 ? levels[1] : levels[0];
    gl.useProgram(res.col);
    gl.uniformMatrix4fv(res.cu.uViewProj, false, vp);
    gl.uniformMatrix3fv(res.cu.uViewRot, false, Float32Array.from([
      view[0], view[1], view[2], view[4], view[5], view[6], view[8], view[9], view[10]]));
    gl.uniform2i(res.cu.uGrid, lv.cols, lv.rows);
    gl.uniform2f(res.cu.uCell, lv.cell, lv.cell);
    gl.uniform2f(res.cu.uOrigin, -(lv.cols * lv.cell) / 2, -(lv.rows * lv.cell) / 2);
    gl.uniform2f(res.cu.uZ, layerH, baseMm);
    gl.uniform1f(res.cu.uRelief, cam.relief);
    gl.uniform1i(res.cu.uLutN, res.lutN);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lv.tex);
    gl.uniform1i(res.cu.uHeights, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, res.lutTex);
    gl.uniform1i(res.cu.uLut, 1);
    gl.bindVertexArray(res.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, INDICES.length, gl.UNSIGNED_BYTE, 0, lv.cols * lv.rows);
    gl.bindVertexArray(null);
  }

  const queue = () => { if (!raf && !destroyed) raf = requestAnimationFrame(draw); };

  function settle() {
    clearTimeout(timer);
    timer = setTimeout(() => { interacting = 0; queue(); }, 160);
  }
  const touched = () => { interacting = 1; settle(); queue(); };

  // ---- size
  const ro = new ResizeObserver(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    queue();
  });
  if (!offscreen) ro.observe(canvas);

  // ---- gestures
  const pointers = new Map();
  let lastTap = 0, tapMoved = false, pinch = 0;
  canvas.addEventListener("pointerdown", (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or lost pointer */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tapMoved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 1) tapMoved = true;
    if (pointers.size === 1) {
      if (!pose) play("orbit", ((cam.az % 6.2832) + 6.2832) % 6.2832 / 6.2832);
      cam.az -= dx * 0.008;
      cam.el = Math.min(MAX_EL, Math.max(MIN_EL, cam.el + dy * 0.006));
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!pose) play("zoom", (cam.zoom - 0.25) / 2.75);
      if (pinch > 0 && d > 0) cam.zoom = Math.min(3, Math.max(0.25, cam.zoom * (pinch / d)));
      pinch = d;
    }
    touched();
  });
  const up = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    pinch = 0;
    if (e.type === "pointerup" && !tapMoved && pointers.size === 0) {
      const now = performance.now();
      if (now - lastTap < 320) { api.resetCamera(); lastTap = 0; } else lastTap = now;
    }
    settle();
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    cam.zoom = Math.min(3, Math.max(0.25, cam.zoom * Math.exp(e.deltaY * 0.0012)));
    touched();
  }, { passive: false });

  const paintRelief = () => { reliefBtn.textContent = `relief ×${cam.relief}`; };
  reliefBtn.addEventListener("click", () => {
    cam.relief = RELIEFS[(RELIEFS.indexOf(cam.relief) + 1) % RELIEFS.length];
    if (res) res.fit = null;
    paintRelief();
    queue();
  });
  resetBtn.addEventListener("click", () => api.resetCamera());
  paintRelief();

  // a phone can take the GL context away when the app is backgrounded
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); res = null; levels = []; });
  canvas.addEventListener("webglcontextrestored", () => {
    try { init(); build(); queue(); } catch (err) { console.error(err); }
  });

  try { init(); } catch (err) { console.error("3D view unavailable", err); return null; }

  const api = {
    el: wrap,
    set(next) {
      scene = next;
      if (res) { build(); queue(); }
    },
    resetCamera() {
      cam.az = 0; cam.el = DEFAULT_EL; cam.zoom = 1;
      queue();
    },
    redraw: queue,
    /** Draw once at an explicit size and return a PNG blob (for thumbnails). */
    snapshot(w, h) {
      canvas.width = w; canvas.height = h;
      if (res) res.fit = null;
      draw();
      return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      ro.disconnect();
      wrap.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
  return api;
}

/** The print seen from the side, as a PNG blob, for the album: low and turned
 *  so the slab's thickness shows, height stretched so the relief reads at
 *  thumbnail size. null if WebGL2 isn't there. */
export const SIDE_POSE = { az: -1.0, el: 0.2, zoom: 1, relief: 4 };
export async function renderSideThumb(scene, { w = 480, h = 300 } = {}) {
  const v = createView3D({ pose: SIDE_POSE, offscreen: true });
  if (!v) return null;
  try {
    v.set(scene);
    return await v.snapshot(w, h);
  } finally {
    v.destroy();
  }
}
