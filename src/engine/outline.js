// Coverage field -> smooth outlines -> a thin extruded solid. Used for the
// art on the back of a print, which is far too fine for the box mesh
// (text strokes, 0.6 mm contour lines): a 0.1 mm grid of boxes would be
// millions of triangles. Tracing the anti-aliased field at 0.5 gives
// sub-pixel outlines with vertices only along the edges.
//
// No DOM here, so it runs in plain node for tests.

import earcut, { deviation } from "earcut";

/** Marching squares on field f (w x h, 0..1) at level 0.5. The field is
 *  treated as 0 outside, so every loop closes. Returns loops of [x, y]
 *  points in pixel units (pixel centres at i + 0.5), solid on the same side
 *  of every loop. */
export function traceLoops(f, w, h, level = 0.5) {
  const W = w + 2, H = h + 2;                 // padded grid of samples
  const v = (x, y) => (x <= 0 || y <= 0 || x > w || y > h ? 0 : f[(y - 1) * w + (x - 1)]);
  // edge ids: horizontal edge (x,y)-(x+1,y) = 2*(y*W+x); vertical (x,y)-(x,y+1) = 2*(y*W+x)+1
  const pt = new Map();
  const edgePoint = (id) => {
    let p = pt.get(id);
    if (p) return p;
    const k = id >> 1, x = k % W, y = (k - x) / W;
    const a = v(x, y), b = id & 1 ? v(x, y + 1) : v(x + 1, y);
    const t = Math.min(1, Math.max(0, (level - a) / (b - a)));
    p = id & 1 ? [x + 0.5 - 1, y + t + 0.5 - 1] : [x + t + 0.5 - 1, y + 0.5 - 1];
    pt.set(id, p);
    return p;
  };
  const next = new Map();                     // segment start edge -> end edge
  const add = (a, b) => next.set(a, b);
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = v(x, y) >= level, tr = v(x + 1, y) >= level;
      const br = v(x + 1, y + 1) >= level, bl = v(x, y + 1) >= level;
      const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = 2 * (y * W + x), B = 2 * ((y + 1) * W + x);
      const L = 2 * (y * W + x) + 1, R = 2 * (y * W + x + 1) + 1;
      // segments run with the solid on their left (image coords, y down)
      switch (c) {
        case 1: add(B, L); break;
        case 2: add(R, B); break;
        case 3: add(R, L); break;
        case 4: add(T, R); break;
        case 5: {                             // saddle: tr + bl solid
          const mid = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 >= level;
          if (mid) { add(T, L); add(B, R); } else { add(T, R); add(B, L); }
          break;
        }
        case 6: add(T, B); break;
        case 7: add(T, L); break;
        case 8: add(L, T); break;
        case 9: add(B, T); break;
        case 10: {                            // saddle: tl + br solid
          const mid = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 >= level;
          if (mid) { add(L, B); add(R, T); } else { add(L, T); add(R, B); }
          break;
        }
        case 11: add(R, T); break;
        case 12: add(L, R); break;
        case 13: add(B, R); break;
        case 14: add(L, B); break;
      }
    }
  }
  const loops = [];
  for (const start of next.keys()) {
    if (!next.has(start)) continue;
    const loop = [];
    let e = start;
    while (next.has(e)) {
      const n = next.get(e);
      next.delete(e);
      loop.push(edgePoint(e));
      e = n;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

export function signedArea(loop) {
  let a = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    a += (loop[j][0] - loop[i][0]) * (loop[j][1] + loop[i][1]);
  }
  return a / 2;
}

/** Ramer-Douglas-Peucker on a closed loop. */
export function simplifyLoop(loop, eps) {
  if (loop.length < 8) return loop.length > 3 ? dropCollinear(loop) : loop;
  // split at the point farthest from the first, so both halves are open paths
  let far = 0, best = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > best) { best = d; far = i; }
  }
  const keep = new Uint8Array(loop.length);
  const rdp = (i0, i1) => {
    const stack = [[i0, i1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const pa = loop[a], pb = loop[b % loop.length];
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], len = Math.hypot(dx, dy) || 1e-12;
      let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((loop[i][0] - pa[0]) * dy - (loop[i][1] - pa[1]) * dx) / len;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
  };
  keep[0] = 1; keep[far] = 1;
  rdp(0, far);
  rdp(far, loop.length);
  const out = dropCollinear(loop.filter((_, i) => keep[i]));
  return out.length >= 3 ? out : loop;
}

/** The split points (and any point of a short loop) can sit in the middle of
 *  a straight run; earcut skips such points, which leaves T-junctions where
 *  the walls still use them. */
function dropCollinear(loop) {
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const a = out.length ? out[out.length - 1] : loop[loop.length - 1];
    const b = loop[i], c = loop[(i + 1) % loop.length];
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) !== 0) out.push(b);
  }
  return out;
}

function inside(pt, loop) {
  let c = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i], [xj, yj] = loop[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const bbox = (l) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of l) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};

/** Loops (any units, any orientation as long as solid is on one consistent
 *  side) -> polygons [{ outer, holes }]. The biggest loop is always an
 *  outer, which fixes which orientation means "outer". Specks under
 *  minArea are dropped (outers) or filled (holes). */
export function groupLoops(loops, minArea = 0) {
  if (!loops.length) return [];
  const areas = loops.map(signedArea);
  let big = 0;
  areas.forEach((a, i) => { if (Math.abs(a) > Math.abs(areas[big])) big = i; });
  const outerSign = Math.sign(areas[big]);
  const outers = [], holes = [];
  loops.forEach((l, i) => {
    if (Math.abs(areas[i]) < minArea) return;
    const rec = { loop: l, area: Math.abs(areas[i]), box: bbox(l) };
    (Math.sign(areas[i]) === outerSign ? outers : holes).push(rec);
  });
  const polys = outers.map((o) => ({ outer: o.loop, holes: [], area: o.area, box: o.box }));
  for (const hl of holes) {
    let owner = null;
    const p = hl.loop[0];
    for (const o of polys) {
      const b = o.box;
      if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) continue;
      if (o.area <= hl.area) continue;
      if ((!owner || o.area < owner.area) && inside(p, o.outer)) owner = o;
    }
    if (owner) owner.holes.push(hl.loop);
  }
  return polys.map(({ outer, holes }) => ({ outer, holes }));
}

/** earcut, checked. On some valid simple polygons earcut leaves part of the
 *  area uncovered (6% on one topo line here) depending only on where the
 *  ring starts and which way it runs - which left holes in the art's top
 *  face. So: check its own coverage measure, and on a miss retry with the
 *  outer ring started elsewhere, then reversed (with the walls following
 *  the new order), keeping the best. */
function triangulate(rings) {
  let best = null;
  const n0 = rings[0].length;
  const starts = [0, n0 >> 1, n0 >> 2, (3 * n0) >> 2, n0 >> 3];
  for (const rev of [false, true]) {
    for (const st of starts) {
      const rr = rings.map((r, k) => {
        let q = k === 0 ? [...r.slice(st), ...r.slice(0, st)] : r;
        return rev ? [...q].reverse() : q;
      });
      const flat = [], holeIdx = [];
      for (const r of rr) {
        if (flat.length) holeIdx.push(flat.length / 2);
        for (const [x, y] of r) flat.push(x, y);
      }
      const tris = earcut(flat, holeIdx, 2);
      const dev = deviation(flat, holeIdx, 2, tris);
      if (!best || dev < best.dev) best = { flat, holeIdx, tris, dev, rr };
      if (dev < 1e-9) return finish(best);
    }
  }
  return finish(best);
  function finish(b) {
    // the walls walk the rings in this order; keep solid-on-the-left by
    // restoring each ring's direction if it was reversed
    if (b.rr[0] !== rings[0] && signedArea(b.rr[0]) * signedArea(rings[0]) < 0) {
      // reversed: flip back so outers stay counter-clockwise and holes clockwise
      const flat = [], holeIdx = [], map = [];
      let o = 0;
      for (const r of b.rr) {
        if (flat.length) holeIdx.push(flat.length / 2);
        const m = r.length;
        for (let i = m - 1; i >= 0; i--) { flat.push(r[i][0], r[i][1]); map[o + i] = o + (m - 1 - i); }
        o += m;
      }
      return { flat, holeIdx, tris: b.tris.map((t) => map[t]), dev: b.dev };
    }
    return b;
  }
}

/** Polygons -> closed triangle mesh from z0 to z1. `toModel(x, y)` maps a
 *  loop point to model millimetres. Returns { vertices: Float32Array(3n),
 *  triangles: Uint32Array(3m) }, wound outward. */
export function extrude(polys, z0, z1, toModel) {
  const V = [], T = [];
  for (const { outer, holes } of polys) {
    const rings = [outer, ...holes].map((r) => r.map(([x, y]) => toModel(x, y)));
    // model coords are y-up: outers counter-clockwise, holes clockwise
    rings.forEach((r, k) => {
      const ccw = signedArea(r) > 0;           // signedArea() is positive for counter-clockwise in y-up
      if ((k === 0) !== ccw) r.reverse();
    });
    const { flat, holeIdx, tris } = triangulate(rings);
    const n = flat.length / 2;
    const base = V.length / 3;
    for (let i = 0; i < n; i++) V.push(flat[2 * i], flat[2 * i + 1], z0);
    for (let i = 0; i < n; i++) V.push(flat[2 * i], flat[2 * i + 1], z1);
    for (let t = 0; t < tris.length; t += 3) {
      let a = tris[t], b = tris[t + 1], c = tris[t + 2];
      const cross = (flat[2 * b] - flat[2 * a]) * (flat[2 * c + 1] - flat[2 * a + 1])
                  - (flat[2 * b + 1] - flat[2 * a + 1]) * (flat[2 * c] - flat[2 * a]);
      if (cross < 0) [b, c] = [c, b];          // now counter-clockwise = facing up
      T.push(base + n + a, base + n + b, base + n + c);   // top
      T.push(base + a, base + c, base + b);               // bottom, facing down
    }
    // walls: ccw outer / cw holes keep the solid on the left of each edge
    let o = 0;
    for (const r of rings) {
      const m = r.length;
      for (let i = 0; i < m; i++) {
        const a = o + i, b = o + (i + 1) % m;
        T.push(base + a, base + b, base + n + b, base + a, base + n + b, base + n + a);
      }
      o += m;
    }
  }
  return { vertices: Float32Array.from(V), triangles: Uint32Array.from(T) };
}
