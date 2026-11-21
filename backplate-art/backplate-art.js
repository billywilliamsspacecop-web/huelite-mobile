/* Print-Brick back-plate line art. All coordinates in mm on a 200 x 200 canvas. */
(function (root) {
  const W = 200, TAU = Math.PI * 2;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeNoise(seed) {
    function h(i, j) {
      let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed | 0, 1274126177);
      n = Math.imul(n ^ n >>> 13, 1274126177);
      n ^= n >>> 16;
      return (n >>> 0) / 4294967296;
    }
    const sm = t => t * t * (3 - 2 * t);
    return function (x, y) {
      const i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
      const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }

  /* ---------- marching squares ---------- */
  function sampleField(f, step) {
    const n = Math.round(W / step) + 1, s = W / (n - 1), F = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) F[j * n + i] = f(i * s, j * s);
    return { F, n, s };
  }

  function contourPath(ctx, G, level) {
    const { F, n, s } = G;
    ctx.beginPath();
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = F[j * n + i] - level, b = F[j * n + i + 1] - level;
        const c = F[(j + 1) * n + i + 1] - level, d = F[(j + 1) * n + i] - level;
        const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const T = () => [(i + a / (a - b)) * s, j * s];
        const R = () => [(i + 1) * s, (j + b / (b - c)) * s];
        const B = () => [(i + d / (d - c)) * s, (j + 1) * s];
        const L = () => [i * s, (j + a / (a - d)) * s];
        let segs;
        switch (idx) {
          case 1: case 14: segs = [[L, T]]; break;
          case 2: case 13: segs = [[T, R]]; break;
          case 3: case 12: segs = [[L, R]]; break;
          case 4: case 11: segs = [[R, B]]; break;
          case 5: segs = [[L, T], [R, B]]; break;
          case 6: case 9: segs = [[T, B]]; break;
          case 7: case 8: segs = [[L, B]]; break;
          case 10: segs = [[T, R], [L, B]]; break;
        }
        for (const [p, q] of segs) {
          const P = p(), Q = q();
          ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]);
        }
      }
    }
    ctx.stroke();
  }

  const PAT = [0.5, 0.8, 0.5, 1.6];

  /* ---------- designs ---------- */
  const D = [];

  D.push({ id: 'topo', name: 'Topographic', note: 'The current look. Noise terrain cut into 24 contour levels with mixed line weights.',
    draw(A) {
      const { ctx, rng } = A, ox = rng() * 50, oy = rng() * 50;
      const G = sampleField((x, y) => A.fbm(x * 0.014 + ox, y * 0.014 + oy, 4), A.step);
      for (let k = 0; k < 24; k++) { ctx.lineWidth = A.lw(PAT[k % 4]); contourPath(ctx, G, 0.2 + k * 0.026); }
    } });

  D.push({ id: 'rings', name: 'Tree rings', note: 'Wobbly growth rings spreading from an off-center core, like a cross-cut log.',
    draw(A) {
      const { ctx, rng } = A, cx = 100 + (rng() - 0.5) * 60, cy = 100 + (rng() - 0.5) * 60, ox = rng() * 40;
      const G = sampleField((x, y) => Math.hypot(x - cx, y - cy) + 14 * (A.fbm(x * 0.02 + ox, y * 0.02, 3) - 0.5), A.step);
      let k = 0;
      for (let r = 5; r < 220; r += 3.6, k++) { ctx.lineWidth = A.lw([0.6, 1.0, 0.6, 1.7][k % 4]); contourPath(ctx, G, r); }
    } });

  D.push({ id: 'flow', name: 'Flow field', note: 'Evenly spaced streamlines that follow a drifting wind map. Lines never cross.',
    draw(A) {
      const { ctx, rng } = A, ox = rng() * 30, oy = rng() * 30;
      const ang = (x, y) => (A.fbm(x * 0.011 + ox, y * 0.011 + oy, 3) - 0.5) * Math.PI * 5.5;
      const dsep = 4.8, gn = Math.ceil(W / dsep) + 1, grid = Array.from({ length: gn * gn }, () => []);
      const free = (x, y, id) => {
        if (x < 3 || y < 3 || x > W - 3 || y > W - 3) return false;
        const cx = (x / dsep) | 0, cy = (y / dsep) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = cx + dx, Y = cy + dy; if (X < 0 || Y < 0 || X >= gn || Y >= gn) continue;
          for (const p of grid[Y * gn + X]) if (p[2] !== id && Math.hypot(p[0] - x, p[1] - y) < dsep) return false;
        }
        return true;
      };
      const add = (x, y, id) => grid[((y / dsep) | 0) * gn + ((x / dsep) | 0)].push([x, y, id]);
      const h = 0.8, lines = [];
      const seeds = [];
      for (let y = 4; y < W; y += 3.4) for (let x = 4; x < W; x += 3.4) seeds.push([x + rng() * 2, y + rng() * 2]);
      for (let i = seeds.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [seeds[i], seeds[j]] = [seeds[j], seeds[i]]; }
      let id = 0;
      for (const [x0, y0] of seeds) {
        if (!free(x0, y0, -1)) continue;
        const dirs = [];
        for (const dir of [1, -1]) {
          let x = x0, y = y0; const arr = [];
          for (let k = 0; k < 500; k++) {
            const a = ang(x, y), mx = x + dir * Math.cos(a) * h / 2, my = y + dir * Math.sin(a) * h / 2, a2 = ang(mx, my);
            x += dir * Math.cos(a2) * h; y += dir * Math.sin(a2) * h;
            if (!free(x, y, id)) break;
            arr.push([x, y]); add(x, y, id);
          }
          dirs.push(arr);
        }
        const pts = dirs[1].reverse().concat([[x0, y0]], dirs[0]);
        if (pts.length < 14) continue;
        add(x0, y0, id); lines.push([id, pts]); id++;
      }
      for (const [i, pts] of lines) {
        ctx.lineWidth = A.lw([0.6, 1.0, 1.6, 1.0][i % 4]); ctx.beginPath();
        pts.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      }
    } });

  D.push({ id: 'hex', name: 'Hex shrink', note: 'Honeycomb cells that shrink toward a focal point, leaving a gradient of gaps.',
    draw(A) {
      const { ctx, rng } = A, R = 9.4, fx = 40 + rng() * 120, fy = 40 + rng() * 120;
      ctx.lineWidth = A.lw(1.0);
      for (let row = -1; row < 24; row++) for (let col = -1; col < 24; col++) {
        const x = col * Math.sqrt(3) * R + (row & 1 ? Math.sqrt(3) * R / 2 : 0), y = row * 1.5 * R;
        const d = Math.hypot(x - fx, y - fy), s = Math.max(0.28, Math.min(0.94, 0.28 + d / 190));
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; const px = x + Math.cos(a) * R * s, py = y + Math.sin(a) * R * s; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.closePath(); ctx.stroke();
      }
    } });

  D.push({ id: 'voronoi', name: 'Cell nests', note: 'Voronoi cells drawn as nested rounded outlines, like cracked mud or foam.',
    draw(A) {
      const { ctx, rng } = A, N = 64, P = [];
      for (let i = 0; i < N; i++) P.push([rng() * W, rng() * W]);
      for (let it = 0; it < 2; it++) { // relax toward cell centroids
        const sx = new Float64Array(N), sy = new Float64Array(N), sc = new Float64Array(N);
        for (let y = 2; y < W; y += 4) for (let x = 2; x < W; x += 4) {
          let b = 0, bd = 1e9; for (let i = 0; i < N; i++) { const d = (P[i][0] - x) ** 2 + (P[i][1] - y) ** 2; if (d < bd) { bd = d; b = i; } }
          sx[b] += x; sy[b] += y; sc[b]++;
        }
        for (let i = 0; i < N; i++) if (sc[i]) { P[i][0] = (P[i][0] + sx[i] / sc[i]) / 2; P[i][1] = (P[i][1] + sy[i] / sc[i]) / 2; }
      }
      const G = sampleField((x, y) => {
        let d1 = 1e9, d2 = 1e9;
        for (let i = 0; i < N; i++) { const d = Math.hypot(P[i][0] - x, P[i][1] - y); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        return d2 - d1;
      }, Math.max(A.step, 0.8));
      [[1.7, 1.1], [6.5, 0.6], [11.5, 0.6]].forEach(([lv, w]) => { ctx.lineWidth = A.lw(w); contourPath(ctx, G, lv); });
    } });

  D.push({ id: 'halftone', name: 'Halftone dots', note: 'Diagonal dot grid that swells from corner to corner. Smallest dots are flagged by diameter.',
    draw(A) {
      const { ctx, rng } = A, pitch = 5.6, ox = rng() * 30, c = Math.SQRT1_2;
      ctx.fillStyle = A.ink;
      for (let u = -50; u < 50; u++) for (let v = -50; v < 50; v++) {
        const x = 100 + (u - v) * pitch * c, y = 100 + (u + v) * pitch * c;
        if (x < 0 || y < 0 || x > W || y > W) continue;
        const t = (x + (W - y)) / 400, g = Math.max(0, Math.min(1, 1.2 - 1.45 * t + (A.fbm(x * 0.02 + ox, y * 0.02, 3) - 0.5) * 0.6));
        const r = Math.min(0.5 * pitch * 0.92, 0.5 * pitch * Math.sqrt(g));
        if (r * 2 < 0.8) continue;
        A.lw(r * 2); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    } });

  D.push({ id: 'ridges', name: 'Ridge lines', note: 'Stacked signal lines with hidden-line fill, a pulsar plot with a central peak.',
    draw(A) {
      const { ctx, rng } = A, ox = rng() * 60, rows = 40;
      ctx.lineWidth = A.lw(1.0); ctx.fillStyle = A.bg;
      for (let r = 0; r < rows; r++) {
        const by = 22 + r * (170 / rows);
        ctx.beginPath();
        for (let x = 0; x <= W; x += 1) {
          const env = Math.exp(-(((x - 100) / 42) ** 2)), y = by - env * 26 * Math.pow(A.fbm(x * 0.07 + ox, r * 0.35, 3), 1.6) * 2.2;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke(); ctx.lineTo(W, W + 5); ctx.lineTo(0, W + 5); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        for (let x = 0; x <= W; x += 1) {
          const env = Math.exp(-(((x - 100) / 42) ** 2)), y = by - env * 26 * Math.pow(A.fbm(x * 0.07 + ox, r * 0.35, 3), 1.6) * 2.2;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    } });

  D.push({ id: 'circuit', name: 'Circuit traces', note: 'Routed 45 degree traces ending in via pads. Reads as electronics without any text.',
    draw(A) {
      const { ctx, rng } = A, P = 5, N = 40, occ = new Uint8Array(N * N);
      const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
      const pad = (x, y, solid) => {
        ctx.beginPath(); ctx.arc(x, y, 1.7, 0, TAU); ctx.fillStyle = solid ? A.ink : A.bg; ctx.fill();
        ctx.lineWidth = A.lw(0.9); ctx.stroke();
      };
      for (let att = 0; att < 420; att++) {
        let x = (rng() * N) | 0, y = (rng() * N) | 0; if (occ[y * N + x]) continue;
        let d = (rng() * 8) | 0; const path = [[x, y]], mark = [y * N + x]; occ[y * N + x] = 1;
        const len = 4 + ((rng() * 16) | 0);
        for (let s = 0; s < len; s++) {
          if (rng() < 0.3) d = (d + (rng() < 0.5 ? 1 : 7)) % 8;
          const nx = x + dirs[d][0], ny = y + dirs[d][1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N || occ[ny * N + nx]) break;
          if (dirs[d][0] && dirs[d][1] && occ[y * N + nx] && occ[ny * N + x]) break;
          x = nx; y = ny; occ[y * N + x] = 1; mark.push(y * N + x); path.push([x, y]);
        }
        if (path.length < 4) { mark.forEach(m => occ[m] = 0); continue; }
        ctx.lineWidth = A.lw(0.9); ctx.beginPath();
        path.forEach((p, k) => k ? ctx.lineTo((p[0] + 0.5) * P, (p[1] + 0.5) * P) : ctx.moveTo((p[0] + 0.5) * P, (p[1] + 0.5) * P)); ctx.stroke();
        const a = path[0], b = path[path.length - 1];
        pad((a[0] + 0.5) * P, (a[1] + 0.5) * P, false); pad((b[0] + 0.5) * P, (b[1] + 0.5) * P, rng() < 0.5);
      }
    } });

  D.push({ id: 'peaks', name: 'Mountain layers', note: 'Seven overlapping ridge silhouettes under a ringed sun. Front layers get heavier lines.',
    draw(A) {
      const { ctx, rng } = A, ox = rng() * 80, sx = 60 + rng() * 80;
      ctx.lineWidth = A.lw(0.8);
      for (let r = 9; r < 34; r += 4.4) { ctx.beginPath(); ctx.arc(sx, 58, r, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = A.bg;
      for (let i = 0; i < 7; i++) {
        const base = 88 + i * 16, amp = 44 - i * 2.5, f = 0.014 + i * 0.004;
        ctx.beginPath();
        for (let x = -2; x <= W + 2; x += 1) {
          const y = base - amp * 1.25 * Math.pow(1 - Math.abs(2 * A.fbm(x * f + ox + i * 9.1, i * 3.7, 4) - 1), 1.6);
          x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.save(); ctx.lineTo(W + 2, W + 5); ctx.lineTo(-2, W + 5); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.beginPath();
        for (let x = -2; x <= W + 2; x += 1) {
          const y = base - amp * 1.25 * Math.pow(1 - Math.abs(2 * A.fbm(x * f + ox + i * 9.1, i * 3.7, 4) - 1), 1.6);
          x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.lineWidth = A.lw(0.6 + i * 0.2); ctx.stroke();
      }
    } });

  D.push({ id: 'guilloche', name: 'Guilloche rosette', note: 'Banknote style engraving: three families of overlapping circles around a hub.',
    draw(A) {
      const { ctx, rng } = A, ph = rng() * TAU;
      ctx.save(); ctx.beginPath(); ctx.arc(100, 100, 97, 0, TAU); ctx.clip();
      ctx.lineWidth = A.lw(0.6);
      [[44, 46, 44, 0], [30, 62, 44, Math.PI / 44], [18, 76, 44, 0.5 * Math.PI / 44], [14, 0, 1, 0]].forEach(([r, off, N, rot]) => {
        for (let k = 0; k < N; k++) {
          const a = ph + rot + k * TAU / N; ctx.beginPath(); ctx.arc(100 + Math.cos(a) * off, 100 + Math.sin(a) * off, r, 0, TAU); ctx.stroke();
        }
      });
      ctx.restore();
      ctx.fillStyle = A.bg; ctx.beginPath(); ctx.arc(100, 100, 9, 0, TAU); ctx.fill();
      ctx.lineWidth = A.lw(1.2); ctx.beginPath(); ctx.arc(100, 100, 9, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(100, 100, 97, 0, TAU); ctx.stroke();
    } });

  D.push({ id: 'maze', name: 'Maze', note: 'A 29 by 29 recursive maze with one continuous solution path.',
    draw(A) {
      const { ctx, rng } = A, N = 29, C = 6.8, off = (W - N * C) / 2;
      const vis = new Uint8Array(N * N), wallR = new Uint8Array(N * N).fill(1), wallB = new Uint8Array(N * N).fill(1);
      const st = [[(rng() * N) | 0, (rng() * N) | 0]]; vis[st[0][1] * N + st[0][0]] = 1;
      while (st.length) {
        const [x, y] = st[st.length - 1], nb = [];
        if (x > 0 && !vis[y * N + x - 1]) nb.push([x - 1, y, 'L']);
        if (x < N - 1 && !vis[y * N + x + 1]) nb.push([x + 1, y, 'R']);
        if (y > 0 && !vis[(y - 1) * N + x]) nb.push([x, y - 1, 'U']);
        if (y < N - 1 && !vis[(y + 1) * N + x]) nb.push([x, y + 1, 'D']);
        if (!nb.length) { st.pop(); continue; }
        const [nx, ny, dir] = nb[(rng() * nb.length) | 0];
        if (dir === 'R') wallR[y * N + x] = 0; if (dir === 'L') wallR[y * N + nx] = 0;
        if (dir === 'D') wallB[y * N + x] = 0; if (dir === 'U') wallB[ny * N + x] = 0;
        vis[ny * N + nx] = 1; st.push([nx, ny]);
      }
      ctx.lineWidth = A.lw(1.4); ctx.beginPath();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const px = off + x * C, py = off + y * C;
        if (wallR[y * N + x]) { ctx.moveTo(px + C, py); ctx.lineTo(px + C, py + C); }
        if (wallB[y * N + x]) { ctx.moveTo(px, py + C); ctx.lineTo(px + C, py + C); }
        if (x === 0) { ctx.moveTo(px, py); ctx.lineTo(px, py + C); }
        if (y === 0) { ctx.moveTo(px, py); ctx.lineTo(px + C, py); }
      }
      ctx.stroke();
    } });

  D.push({ id: 'truchet', name: 'Truchet arcs', note: 'Quarter-circle tiles in random turns that knit into flowing loops.',
    draw(A) {
      const { ctx, rng } = A, T = 10; ctx.lineWidth = A.lw(1.4);
      for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) {
        const x = i * T, y = j * T, h = T / 2; ctx.beginPath();
        if (rng() < 0.5) { ctx.arc(x, y, h, 0, Math.PI / 2); ctx.moveTo(x + T + 0, y + T - h); ctx.arc(x + T, y + T, h, Math.PI, 1.5 * Math.PI); }
        else { ctx.arc(x + T, y, h, Math.PI / 2, Math.PI); ctx.moveTo(x + h, y + T); ctx.arc(x, y + T, h, 1.5 * Math.PI, TAU); }
        ctx.stroke();
      }
    } });

  D.push({ id: 'lowpoly', name: 'Low poly mesh', note: 'Jittered triangle mesh with a few solid facets and variable edge weight.',
    draw(A) {
      const { ctx, rng } = A, N = 15, S = W / (N - 1), P = [];
      for (let j = 0; j < N; j++) { P.push([]); for (let i = 0; i < N; i++) {
        const edge = i === 0 || j === 0 || i === N - 1 || j === N - 1;
        P[j].push([i * S + (edge ? 0 : (rng() - 0.5) * S * 0.62), j * S + (edge ? 0 : (rng() - 0.5) * S * 0.62)]);
      } }
      const E = [], tri = [];
      for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
        const a = P[j][i], b = P[j][i + 1], c = P[j + 1][i + 1], d = P[j + 1][i];
        if (rng() < 0.5) { tri.push([a, b, c], [a, c, d]); E.push([a, c]); } else { tri.push([a, b, d], [b, c, d]); E.push([b, d]); }
        E.push([a, b], [a, d]); if (i === N - 2) E.push([b, c]); if (j === N - 2) E.push([d, c]);
      }
      ctx.fillStyle = A.ink; for (const t of tri) if (rng() < 0.07) { ctx.beginPath(); ctx.moveTo(...t[0]); ctx.lineTo(...t[1]); ctx.lineTo(...t[2]); ctx.closePath(); ctx.fill(); }
      for (const [a, b] of E) {
        ctx.lineWidth = A.lw(0.6 + 1.0 * A.fbm((a[0] + b[0]) * 0.012, (a[1] + b[1]) * 0.012, 2));
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    } });

  D.push({ id: 'sunburst', name: 'Sunburst', note: 'Tapered rays around a ringed hub. Ray width at the hub is the number to watch.',
    draw(A) {
      const { ctx, rng } = A, N = 64, cx = 100 + (rng() - 0.5) * 50, cy = 100 + (rng() - 0.5) * 50;
      ctx.fillStyle = A.ink;
      for (let i = 0; i < N; i++) {
        const t = i * TAU / N + (rng() - 0.5) * 0.02, long = i % 2 === 0, r0 = long ? 22 : 32, R = long ? 200 : 120;
        const w0 = A.lw(long ? 0.9 : 0.7) / 2, w1 = A.lw(long ? 2.2 : 1.2) / 2, c = Math.cos(t), s = Math.sin(t), nx = -s, ny = c;
        ctx.beginPath();
        ctx.moveTo(cx + c * r0 + nx * w0, cy + s * r0 + ny * w0); ctx.lineTo(cx + c * R + nx * w1, cy + s * R + ny * w1);
        ctx.lineTo(cx + c * R - nx * w1, cy + s * R - ny * w1); ctx.lineTo(cx + c * r0 - nx * w0, cy + s * r0 - ny * w0);
        ctx.closePath(); ctx.fill();
      }
      [[18, 1.6], [13, 0.8], [8.5, 0.8]].forEach(([r, w]) => { ctx.lineWidth = A.lw(w); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); });
    } });

  D.push({ id: 'ripples', name: 'Ripple interference', note: 'Waves from three drops of water crossing each other.',
    draw(A) {
      const { ctx, rng } = A, S = [[rng() * 200, rng() * 200], [rng() * 200, rng() * 200], [rng() * 200, rng() * 200]], k = TAU / 15;
      const G = sampleField((x, y) => S.reduce((s, p) => s + Math.cos(k * Math.hypot(x - p[0], y - p[1])), 0), A.step);
      [-1.6, -0.4, 0.8, 2.0].forEach((lv, i) => { ctx.lineWidth = A.lw(PAT[i]); contourPath(ctx, G, lv); });
    } });

  D.push({ id: 'iso', name: 'Tumbling blocks', note: 'Isometric cube lattice with hatched faces. A classic quilt pattern in line form.',
    draw(A) {
      const { ctx, rng } = A, R = 13, sw = Math.sqrt(3) * R;
      ctx.lineWidth = A.lw(0.9);
      const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      for (let row = -1; row < 16; row++) for (let col = -1; col < 14; col++) {
        const cx = col * sw + (row & 1 ? sw / 2 : 0), cy = row * 1.5 * R, c = [cx, cy], v = [];
        for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; v.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
        ctx.beginPath(); v.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
        [1, 3, 5].forEach(k => { ctx.moveTo(cx, cy); ctx.lineTo(v[k][0], v[k][1]); }); ctx.stroke();
        const faces = [[c, v[5], v[0], v[1]], [c, v[1], v[2], v[3]], [c, v[3], v[4], v[5]]], pick = (rng() * 3) | 0;
        if (rng() < 0.7) {
          const [f0, fa, fb, fd] = faces[pick]; ctx.beginPath();
          for (const t of [0.25, 0.5, 0.75]) { const p = lerp(f0, fd, t), q = lerp(fa, fb, t); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
          ctx.stroke();
        }
      }
    } });

  D.push({ id: 'hilbert', name: 'Hilbert curve', note: 'One unbroken line that visits every cell of a 32 by 32 grid.',
    draw(A) {
      const { ctx } = A, n = 32, C = W / n;
      ctx.lineWidth = A.lw(1.6); ctx.beginPath();
      for (let d = 0; d < n * n; d++) {
        let x = 0, y = 0, t = d;
        for (let s = 1; s < n; s *= 2) {
          const rx = 1 & (t >> 1), ry = 1 & (t ^ rx);
          if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } const tmp = x; x = y; y = tmp; }
          x += s * rx; y += s * ry; t >>= 2;
        }
        const px = (x + 0.5) * C, py = (y + 0.5) * C; d ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    } });

  D.push({ id: 'whorl', name: 'Spiral whorl', note: 'One wandering spiral, thick and thin by turn, like a fingerprint or a vinyl groove.',
    draw(A) {
      const { ctx, rng } = A, cx = 100 + (rng() - 0.5) * 30, cy = 100 + (rng() - 0.5) * 30, ox = rng() * 40, pitch = 3.9, b = pitch / TAU;
      const aMax = TAU * Math.ceil(150 / pitch), da = 0.22;
      for (let a = 0; a < aMax; a += da) {
        ctx.lineWidth = A.lw(1.15 + 0.55 * Math.sin(a * 0.5)); ctx.beginPath();
        for (let q = a; q <= a + da + 0.001; q += da / 4) {
          const r = b * q, x0 = cx + Math.cos(q) * r * 1.08, y0 = cy + Math.sin(q) * r * 0.92;
          const x = x0 + 9 * (A.fbm(x0 * 0.02 + ox, y0 * 0.02, 3) - 0.5), y = y0 + 9 * (A.fbm(x0 * 0.02, y0 * 0.02 + ox, 3) - 0.5);
          q === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } });

  D.push({ id: 'waves', name: 'Seigaiha waves', note: 'Overlapping concentric scales, the Japanese wave motif.',
    draw(A) {
      const { ctx } = A, R = 12.5;
      ctx.fillStyle = A.bg;
      for (let row = 0; row < 40; row++) for (let col = -1; col < 10; col++) {
        const x = col * 2 * R + (row & 1 ? R : 0), y = row * R * 0.5 - 2;
        ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        [[1, 0.9], [0.68, 0.7], [0.36, 0.7]].forEach(([f, w]) => { ctx.lineWidth = A.lw(w); ctx.beginPath(); ctx.arc(x, y, R * f, 0, TAU); ctx.stroke(); });
      }
    } });

  D.push({ id: 'stars', name: 'Constellations', note: 'Scattered stars joined by hairline links. Link width is the number to watch.',
    draw(A) {
      const { ctx, rng } = A, P = [];
      for (let k = 0; k < 4000 && P.length < 95; k++) {
        const p = [8 + rng() * 184, 8 + rng() * 184]; if (P.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 13)) P.push(p);
      }
      const seen = new Set(); ctx.lineWidth = A.lw(0.7); ctx.beginPath();
      P.forEach((p, i) => {
        P.map((q, j) => [Math.hypot(q[0] - p[0], q[1] - p[1]), j]).filter(o => o[1] !== i && o[0] < 30).sort((a, b) => a[0] - b[0]).slice(0, 2).forEach(([, j]) => {
          const key = i < j ? i + '-' + j : j + '-' + i; if (seen.has(key)) return; seen.add(key);
          ctx.moveTo(p[0], p[1]); ctx.lineTo(P[j][0], P[j][1]);
        });
      });
      ctx.stroke();
      P.forEach((p, i) => {
        const r = 0.9 + rng() * 1.5; A.lw(r * 2);
        ctx.fillStyle = A.bg; ctx.beginPath(); ctx.arc(p[0], p[1], r + 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = A.ink; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
        if (i % 9 === 0) { ctx.lineWidth = A.lw(0.7); ctx.beginPath(); ctx.arc(p[0], p[1], r + 3.2, 0, TAU); ctx.stroke(); }
      });
    } });

  /* ---------- renderer ---------- */
  function render(ctx, idx, o) {
    const seed = o.seed | 0, rng = mulberry32(seed * 7919 + idx * 104729 + 1), nz = makeNoise(seed * 31 + idx * 17 + 5);
    const st = { min: Infinity };
    const A = {
      ctx, rng, ink: o.ink, bg: o.bg, step: o.step || 0.5, W,
      fbm(x, y, oct) { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < oct; i++) { s += a * nz(x * f, y * f); t += a; a *= 0.5; f *= 2; } return s / t; },
      lw(w) { const v = w * o.ls; if (v < st.min) st.min = v; return v; },
    };
    ctx.save();
    ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, W);
    const M = o.margin == null ? 5 : o.margin;
    ctx.beginPath(); ctx.rect(M, M, W - 2 * M, W - 2 * M); ctx.clip();
    ctx.strokeStyle = o.ink; ctx.fillStyle = o.ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    D[idx].draw(A);
    ctx.restore();
    return st.min;
  }

  D.forEach(d => d.group = 'Original');
  root.PBArt = { designs: D, render, W, sampleField, contourPath, PAT, TAU };
  if (typeof module !== 'undefined') module.exports = root.PBArt;
})(typeof window !== 'undefined' ? window : globalThis);

/* Printer and faith sets. Same conventions as art.js: mm on a 200 x 200 canvas. */
(function () {
  const P = PBArt, D = P.designs, { sampleField, contourPath, PAT, TAU } = P, W = 200;
  const add = (group, id, name, note, draw) => D.push({ group, id, name, note, draw });
  const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); };
  const poly = (c, pts) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); };

  /* ================= PRINTER SET ================= */
  add('Printer', 'bedmesh', 'Bed mesh', 'The auto-leveling map of a textured plate: warp contours with the probe points marked.',
    A => {
      const { ctx, rng } = A, ox = rng() * 40, tilt = (rng() - 0.5) * 0.5;
      const G = sampleField((x, y) => ((x - 100) ** 2 + (y - 100) ** 2) / 20000 + tilt * (x - y) / 200 + 0.5 * A.fbm(x * 0.012 + ox, y * 0.012, 3), A.step);
      for (let k = 0; k < 16; k++) { ctx.lineWidth = A.lw(PAT[k % 4]); contourPath(ctx, G, 0.12 + k * 0.07); }
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
        const x = (i + 0.5) * W / 6, y = (j + 0.5) * W / 6;
        ctx.fillStyle = A.bg; circ(ctx, x, y, 3.2); ctx.fill(); ctx.lineWidth = A.lw(0.9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 1.4, y); ctx.lineTo(x + 1.4, y); ctx.moveTo(x, y - 1.4); ctx.lineTo(x, y + 1.4); ctx.stroke();
      }
    });

  add('Printer', 'toolpath', 'Slicer layer', 'One sliced layer: three perimeters, 45 degree infill, and a dashed skirt.',
    A => {
      const { ctx, rng } = A, ph = rng() * TAU, ph2 = rng() * TAU;
      const R = (t, k) => 66 + 13 * Math.sin(3 * t + ph) + 7 * Math.sin(5 * t + ph2) - k;
      const loop = (k, dash) => { ctx.beginPath(); for (let i = 0; i <= 240; i++) { const t = i / 240 * TAU, r = R(t, k); const x = 100 + Math.cos(t) * r, y = 100 + Math.sin(t) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
      ctx.setLineDash([4, 3.5]); ctx.lineWidth = A.lw(0.7); loop(-14); ctx.stroke(); ctx.setLineDash([]);
      for (let k = 0; k < 3; k++) { ctx.lineWidth = A.lw(1.1); loop(k * 2.3); ctx.stroke(); }
      ctx.save(); loop(7.4); ctx.clip(); ctx.lineWidth = A.lw(0.9); ctx.beginPath();
      for (let d = -200; d < 200; d += 4.6) { ctx.moveTo(100 + d - 110, 100 - 110); ctx.lineTo(100 + d + 110, 100 + 110); }
      ctx.stroke(); ctx.restore();
    });

  add('Printer', 'gyroid', 'Gyroid infill', 'A slice through a gyroid, the wavy infill that fills prints from every direction.',
    A => {
      const { ctx, rng } = A, a = TAU / 44, z = 0.55 + rng() * 0.5, ox = rng() * 50, oy = rng() * 50;
      const G = sampleField((x, y) => { const X = (x + ox) * a, Y = (y + oy) * a; return Math.sin(X) * Math.cos(Y) + Math.sin(Y) * Math.cos(z) + Math.sin(z) * Math.cos(X); }, A.step);
      [[-0.85, 0.7], [0, 1.6], [0.85, 0.7]].forEach(([lv, w]) => { ctx.lineWidth = A.lw(w); contourPath(ctx, G, lv); });
    });

  add('Printer', 'rails', 'Linear rails', 'The X gantry: stacked aluminium rails with their row of screws and a carriage block.',
    A => {
      const { ctx, rng } = A;
      for (let i = 0; i < 5; i++) {
        const y = 12 + i * 38, h = 22;
        ctx.lineWidth = A.lw(1.2); ctx.strokeRect(-4, y, W + 8, h);
        ctx.lineWidth = A.lw(0.7); ctx.beginPath(); ctx.moveTo(-4, y + 5); ctx.lineTo(W + 4, y + 5); ctx.moveTo(-4, y + h - 5); ctx.lineTo(W + 4, y + h - 5); ctx.stroke();
        for (let x = 6; x < W; x += 12) { circ(ctx, x, y + h / 2, 2.1); ctx.lineWidth = A.lw(0.9); ctx.stroke(); }
        const cx = 25 + rng() * 150; ctx.fillStyle = A.bg;
        ctx.beginPath(); ctx.roundRect(cx - 20, y - 6, 40, h + 12, 4); ctx.fill(); ctx.lineWidth = A.lw(1.4); ctx.stroke();
        ctx.lineWidth = A.lw(0.8); ctx.beginPath(); ctx.moveTo(cx - 14, y - 6); ctx.lineTo(cx - 14, y + h + 6); ctx.moveTo(cx + 14, y - 6); ctx.lineTo(cx + 14, y + h + 6); ctx.stroke();
        circ(ctx, cx, y + h / 2, 3.2); ctx.stroke();
      }
    });

  add('Printer', 'tubes', 'PTFE tubes', 'Nine filament tubes sweeping from the spool side into three feed points, drawn as double lines.',
    A => {
      const { ctx, rng } = A, ends = [[58, 150], [100, 172], [142, 150]];
      for (let t = 0; t < 9; t++) {
        const sx = 14 + t * 21.5, e = ends[(t / 3) | 0], c1 = [sx + (rng() - 0.5) * 50, 70 + rng() * 40], c2 = [e[0] + (rng() - 0.5) * 70, e[1] - 50 - rng() * 30];
        const pts = []; for (let i = 0; i <= 80; i++) { const u = i / 80, v = 1 - u; pts.push([v ** 3 * sx + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u ** 3 * e[0], v ** 3 * -6 + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u ** 3 * e[1]]); }
        ctx.lineWidth = A.lw(0.9);
        for (const side of [-1, 1]) {
          ctx.beginPath(); pts.forEach((p, i) => { const q = pts[Math.min(i + 1, 80)], o = pts[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1;
            const x = p[0] - dy / l * 2.1 * side, y = p[1] + dx / l * 2.1 * side; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
        }
        circ(ctx, sx, -6, 0.1);
      }
      ends.forEach(e => { ctx.fillStyle = A.bg; ctx.beginPath(); ctx.roundRect(e[0] - 13, e[1] - 3, 26, 22, 4); ctx.fill(); ctx.lineWidth = A.lw(1.4); ctx.stroke();
        circ(ctx, e[0], e[1] + 8, 3.2); ctx.lineWidth = A.lw(0.9); ctx.stroke(); });
    });

  add('Printer', 'nozzle', 'Hotend cutaway', 'Heater block, heatbreak and 0.4 mm nozzle over a stack of fresh layers.',
    A => {
      const { ctx, rng } = A;
      ctx.lineWidth = A.lw(1.5);
      ctx.beginPath(); ctx.roundRect(58, 22, 84, 54, 5); ctx.stroke();
      circ(ctx, 80, 49, 8); ctx.stroke(); circ(ctx, 120, 49, 4); ctx.stroke(); circ(ctx, 120, 49, 1.2); ctx.stroke();
      ctx.lineWidth = A.lw(0.8); ctx.beginPath(); ctx.moveTo(100, 22); ctx.lineTo(100, 76); ctx.stroke();
      ctx.lineWidth = A.lw(1.5);
      ctx.strokeRect(89, 76, 22, 24); ctx.lineWidth = A.lw(0.8); for (let y = 82; y < 100; y += 4) { ctx.beginPath(); ctx.moveTo(89, y); ctx.lineTo(111, y); ctx.stroke(); }
      ctx.lineWidth = A.lw(1.5); poly(ctx, [[84, 100], [116, 100], [116, 110], [84, 110]]); ctx.stroke();
      poly(ctx, [[86, 110], [114, 110], [106, 142], [94, 142]]); ctx.stroke();
      ctx.lineWidth = A.lw(0.8); ctx.beginPath(); ctx.moveTo(100, 100); ctx.lineTo(100, 150); ctx.stroke();
      for (let k = 0; k < 11; k++) {
        const y = 158 + k * 3.4, w = 80 + (rng() - 0.5) * 6; ctx.lineWidth = A.lw(1.0);
        ctx.beginPath(); ctx.roundRect(100 - w / 2, y, w, 2.6, 1.3); ctx.stroke();
      }
      ctx.lineWidth = A.lw(0.7); ctx.beginPath();
      for (let y = 20; y <= 190; y += 5) { const L = y % 25 === 20 ? 9 : 4; ctx.moveTo(10, y); ctx.lineTo(10 + L, y); ctx.moveTo(190, y); ctx.lineTo(190 - L, y); }
      ctx.stroke();
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(100, 146, 12 + k * 7, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke(); }
    });

  add('Printer', 'vase', 'Layer-line vase', 'A vase built from 0.2 mm style layer lines, drawn at 3 mm pitch so they read.',
    A => {
      const { ctx, rng } = A, ph = rng() * TAU, r = y => 36 + 20 * Math.sin(y * 0.04 + ph) + 8 * Math.sin(y * 0.11 + ph * 2);
      ctx.lineWidth = A.lw(0.8);
      for (let y = 16, k = 0; y <= 184; y += 3, k++) { const rr = r(y); ctx.lineWidth = A.lw([0.6, 0.9, 0.6, 1.2][k % 4]); ctx.beginPath(); ctx.moveTo(100 - rr, y); ctx.lineTo(100 + rr, y); ctx.stroke(); }
      ctx.lineWidth = A.lw(1.8); ctx.beginPath();
      for (let y = 16; y <= 184; y += 1) { y > 16 ? ctx.lineTo(100 - r(y), y) : ctx.moveTo(100 - r(y), y); }
      ctx.stroke(); ctx.beginPath(); for (let y = 16; y <= 184; y += 1) { y > 16 ? ctx.lineTo(100 + r(y), y) : ctx.moveTo(100 + r(y), y); } ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, 188); ctx.lineTo(186, 188); ctx.stroke();
    });

  add('Printer', 'spools', 'Four spools', 'Four filament spools in a 2 by 2 grid, wound rings visible between the flange holes.',
    A => {
      const { ctx, rng } = A;
      [[50, 50], [150, 50], [50, 150], [150, 150]].forEach(([cx, cy]) => {
        const rot = rng() * TAU;
        ctx.lineWidth = A.lw(1.6); circ(ctx, cx, cy, 44); ctx.stroke();
        ctx.lineWidth = A.lw(0.9); circ(ctx, cx, cy, 40.5); ctx.stroke();
        for (let r = 17; r < 28; r += 2.6) { circ(ctx, cx, cy, r); ctx.stroke(); }
        ctx.lineWidth = A.lw(1.4); circ(ctx, cx, cy, 14); ctx.stroke(); circ(ctx, cx, cy, 7); ctx.stroke();
        for (let k = 0; k < 6; k++) { const a = rot + k * TAU / 6; circ(ctx, cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, 4.4); ctx.lineWidth = A.lw(0.9); ctx.stroke(); }
        for (let k = 0; k < 3; k++) { const a = rot + k * TAU / 3 + 0.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); ctx.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); ctx.stroke(); }
      });
    });

  add('Printer', 'plate', 'Build plate ruler', 'Millimetre ticks on every edge, a 25 mm dashed grid and corner brackets.',
    A => {
      const { ctx } = A;
      ctx.lineWidth = A.lw(0.6); ctx.setLineDash([3, 3]); ctx.beginPath();
      for (let v = 25; v < W; v += 25) { ctx.moveTo(v, 10); ctx.lineTo(v, 190); ctx.moveTo(10, v); ctx.lineTo(190, v); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = A.lw(0.8); ctx.beginPath();
      for (let v = 10; v <= 190; v += 5) { const L = (v - 10) % 25 === 0 ? 8 : 3.5; ctx.moveTo(v, 10); ctx.lineTo(v, 10 + L); ctx.moveTo(v, 190); ctx.lineTo(v, 190 - L); ctx.moveTo(10, v); ctx.lineTo(10 + L, v); ctx.moveTo(190, v); ctx.lineTo(190 - L, v); }
      ctx.stroke();
      ctx.lineWidth = A.lw(1.6); ctx.beginPath();
      [[10, 10, 1, 1], [190, 10, -1, 1], [10, 190, 1, -1], [190, 190, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.moveTo(x + sx * 18, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * 18); });
      ctx.stroke();
      ctx.fillStyle = A.bg; circ(ctx, 100, 100, 14); ctx.fill(); ctx.lineWidth = A.lw(1.2); ctx.stroke(); circ(ctx, 100, 100, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(100, 78); ctx.lineTo(100, 122); ctx.moveTo(78, 100); ctx.lineTo(122, 100); ctx.stroke();
    });

  add('Printer', 'fan', 'Part cooling fan', 'A blower wheel with eleven curved blades inside a slotted housing.',
    A => {
      const { ctx, rng } = A, N = 11, ph = rng() * TAU;
      ctx.lineWidth = A.lw(1.6); circ(ctx, 100, 100, 94); ctx.stroke(); ctx.lineWidth = A.lw(0.8); circ(ctx, 100, 100, 89); ctx.stroke();
      ctx.beginPath(); for (let k = 0; k < 48; k++) { const a = k * TAU / 48; ctx.moveTo(100 + Math.cos(a) * 80, 100 + Math.sin(a) * 80); ctx.lineTo(100 + Math.cos(a) * 85, 100 + Math.sin(a) * 85); } ctx.stroke();
      ctx.lineWidth = A.lw(1.1);
      for (let k = 0; k < N; k++) {
        const t0 = ph + k * TAU / N;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          for (let r = 20; r <= 76; r += 1.5) { const u = (r - 20) / 56, a = t0 + 0.0125 * (r - 20) ** 1.1 + side * 0.17 * Math.sin(Math.PI * Math.pow(u, 0.8)) * (1 - 0.25 * u); r > 20 ? ctx.lineTo(100 + Math.cos(a) * r, 100 + Math.sin(a) * r) : ctx.moveTo(100 + Math.cos(a) * r, 100 + Math.sin(a) * r); }
          ctx.stroke();
        }
      }
      ctx.fillStyle = A.bg; circ(ctx, 100, 100, 19); ctx.fill(); ctx.lineWidth = A.lw(1.4); ctx.stroke(); circ(ctx, 100, 100, 12); ctx.stroke(); circ(ctx, 100, 100, 4); ctx.stroke();
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6; circ(ctx, 100 + Math.cos(a) * 15.5, 100 + Math.sin(a) * 15.5, 1.3); ctx.lineWidth = A.lw(0.8); ctx.stroke(); }
    });

  /* ================= FAITH SET ================= */
  add('Faith', 'crossrays', 'Cross and light', 'A Latin cross with a double outline, a halo, and rays of light behind it.',
    A => {
      const { ctx } = A, cx = 100, cy = 84, cross = [[93, 36], [107, 36], [107, 66], [140, 66], [140, 80], [107, 80], [107, 166], [93, 166], [93, 80], [60, 80], [60, 66], [93, 66]];
      for (let k = 0; k < 96; k++) { const a = k * TAU / 96; ctx.lineWidth = A.lw(k % 2 ? 0.6 : 1.3); const r0 = k % 4 === 0 ? 50 : 66;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * 240, cy + Math.sin(a) * 240); ctx.stroke(); }
      ctx.fillStyle = A.bg; circ(ctx, cx, cy, 46); ctx.fill(); ctx.lineWidth = A.lw(1.2); ctx.stroke(); circ(ctx, cx, cy, 41); ctx.lineWidth = A.lw(0.6); ctx.stroke();
      ctx.lineWidth = A.lw(7); ctx.strokeStyle = A.bg; poly(ctx, cross.map(p => [p[0] + (p[0] < 100 ? -1 : 1) * 0, p[1]])); ctx.fill(); ctx.stroke(); ctx.strokeStyle = A.ink;
      ctx.lineWidth = A.lw(1.6); poly(ctx, cross); ctx.stroke();
      ctx.lineWidth = A.lw(0.8); ctx.beginPath(); ctx.moveTo(100, 42); ctx.lineTo(100, 160); ctx.moveTo(66, 73); ctx.lineTo(134, 73); ctx.stroke();
    });

  add('Faith', 'rose', 'Rose window', 'Cathedral rose window: twelve pointed petals, trefoil ring and a spoked center.',
    A => {
      const { ctx } = A, cx = 100, cy = 100;
      ctx.lineWidth = A.lw(1.6); circ(ctx, cx, cy, 95); ctx.stroke(); ctx.lineWidth = A.lw(0.8); circ(ctx, cx, cy, 90); ctx.stroke();
      for (let k = 0; k < 36; k++) { const a = k * TAU / 36; circ(ctx, cx + Math.cos(a) * 83.5, cy + Math.sin(a) * 83.5, 3.1); ctx.stroke(); }
      for (let k = 0; k < 12; k++) {
        const a = k * TAU / 12, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
        [[34, 76, 15, 1.2], [40, 66, 9, 0.8]].forEach(([r0, r1, w, lw]) => {
          ctx.lineWidth = A.lw(lw); ctx.beginPath(); ctx.moveTo(cx + ca * r0, cy + sa * r0);
          ctx.quadraticCurveTo(cx + ca * (r0 + 8) + px * w, cy + sa * (r0 + 8) + py * w, cx + ca * r1, cy + sa * r1);
          ctx.quadraticCurveTo(cx + ca * (r0 + 8) - px * w, cy + sa * (r0 + 8) - py * w, cx + ca * r0, cy + sa * r0); ctx.stroke();
        });
        circ(ctx, cx + ca * 72, cy + sa * 72, 2.6); ctx.lineWidth = A.lw(0.8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + ca * 14, cy + sa * 14); ctx.lineTo(cx + ca * 30, cy + sa * 30); ctx.stroke();
      }
      [30, 14].forEach((r, i) => { ctx.lineWidth = A.lw(i ? 1.2 : 1.4); circ(ctx, cx, cy, r); ctx.stroke(); }); ctx.lineWidth = A.lw(0.8); circ(ctx, cx, cy, 6); ctx.stroke();
    });

  add('Faith', 'ichthys', 'Fish tiles', 'A school of early-church fish symbols. One swims the other way.',
    A => {
      const { ctx, rng } = A, ox = 26, oy = 15, odd = [(rng() * 7) | 0, (rng() * 12) | 0];
      for (let row = 0; row < 14; row++) for (let col = -1; col < 8; col++) {
        const x = col * ox + (row & 1 ? ox / 2 : 0) + 14, y = row * oy + 10, flip = (row === odd[1] && col === odd[0]) ? -1 : 1;
        ctx.save(); ctx.translate(x, y); ctx.scale(flip, 1); ctx.lineWidth = A.lw(flip < 0 ? 1.8 : 1.0);
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(3, -13, 17, 6); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(3, 13, 17, -6); ctx.stroke();
        ctx.restore();
      }
    });

  add('Faith', 'still', 'Be still', 'Rough water at the top that settles to flat lines at the bottom.',
    A => {
      const { ctx, rng } = A, ph = rng() * TAU;
      for (let k = 0, y = 8; y < 196; y += 3.9, k++) {
        const amp = 15 * Math.pow(1 - y / 200, 1.6); ctx.lineWidth = A.lw([0.7, 1.0, 0.7, 1.5][k % 4]); ctx.beginPath();
        for (let x = 0; x <= W; x += 1) { const yy = y + amp * (Math.sin(x * 0.085 + y * 0.09 + ph) * 0.7 + (A.fbm(x * 0.05, y * 0.4, 2) - 0.5) * 1.2); x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
        ctx.stroke();
      }
    });

  add('Faith', 'golgotha', 'Three crosses', 'Three crosses on a hill over a ringed sun, with layered fields in front.',
    A => {
      const { ctx, rng } = A, ox = rng() * 60;
      for (let r = 9; r < 76; r += 5) { ctx.lineWidth = A.lw(r % 10 < 5 ? 0.8 : 1.2); circ(ctx, 100, 70, r); ctx.stroke(); }
      const ground = (x, i) => [120, 140, 156, 170, 184][i] - [14, 10, 12, 9, 7][i] * A.fbm(x * 0.012 + ox + i * 5, i * 2.3, 3) * 2;
      const hill = i => { ctx.fillStyle = A.bg; ctx.beginPath(); for (let x = -2; x <= W + 2; x += 1) { const y = ground(x, i); x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.lineTo(W + 2, W + 4); ctx.lineTo(-2, W + 4); ctx.closePath(); ctx.fill(); ctx.lineWidth = A.lw(0.8 + i * 0.25); ctx.beginPath();
        for (let x = -2; x <= W + 2; x += 1) { const y = ground(x, i); x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); };
      hill(0);
      [[66, 54], [100, 74], [134, 54]].forEach(([x, h]) => {
        const y = ground(x, 0) + 1, draw = () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.moveTo(x - h * 0.3, y - h * 0.72); ctx.lineTo(x + h * 0.3, y - h * 0.72); ctx.stroke(); };
        ctx.strokeStyle = A.bg; ctx.lineWidth = 7; draw(); ctx.strokeStyle = A.ink; ctx.lineWidth = A.lw(1.8); draw();
      });
      for (let i = 1; i < 5; i++) hill(i);
    });

  add('Faith', 'thorns', 'Crown of thorns', 'Two braided thorn wreaths around a small cross.',
    A => {
      const { ctx, rng } = A;
      [[70, 9, 0.05], [43, 7, 0.1]].forEach(([R, n, ph0], w) => {
        const ph = rng() * TAU;
        for (let s = 0; s < 3; s++) {
          ctx.lineWidth = A.lw(1.1); ctx.beginPath();
          for (let i = 0; i <= 480; i++) { const t = i / 480 * TAU, r = R + (R / 10) * Math.sin(n * t + ph + s * TAU / 3); const x = 100 + Math.cos(t) * r, y = 100 + Math.sin(t) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
        }
        ctx.fillStyle = A.ink;
        for (let k = 0; k < (w ? 20 : 30); k++) {
          const t = rng() * TAU, r = R + (R / 10) * 1.1, sgn = rng() < 0.5 ? 1 : -1, len = 6 + rng() * 5, base = [100 + Math.cos(t) * r * (1 + (sgn > 0 ? 0.08 : -0.08)), 100 + Math.sin(t) * r * (1 + (sgn > 0 ? 0.08 : -0.08))];
          const dir = t + sgn * 0.5 * Math.PI * 0.0 + (rng() - 0.5) * 0.9, ox = Math.cos(t) * sgn, oy = Math.sin(t) * sgn, tx = base[0] + ox * len + Math.cos(t + Math.PI / 2) * 3 * (rng() - 0.5), ty = base[1] + oy * len + Math.sin(t + Math.PI / 2) * 3 * (rng() - 0.5);
          A.lw(1.4); ctx.beginPath(); ctx.moveTo(base[0] + Math.cos(t + Math.PI / 2) * 1.1, base[1] + Math.sin(t + Math.PI / 2) * 1.1); ctx.lineTo(tx, ty); ctx.lineTo(base[0] - Math.cos(t + Math.PI / 2) * 1.1, base[1] - Math.sin(t + Math.PI / 2) * 1.1); ctx.closePath(); ctx.fill();
        }
      });
      ctx.lineWidth = A.lw(1.8); ctx.beginPath(); ctx.moveTo(100, 78); ctx.lineTo(100, 124); ctx.moveTo(86, 92); ctx.lineTo(114, 92); ctx.stroke();
      ctx.lineWidth = A.lw(0.8); circ(ctx, 100, 100, 94); ctx.stroke();
    });

  add('Faith', 'star', 'Star of Bethlehem', 'A long-pointed star in nested outlines over a field of small stars.',
    A => {
      const { ctx, rng } = A, cx = 100, cy = 100, shape = k => { const p = []; for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + i * Math.PI / 8, long = i % 4 === 0 ? 96 : i % 2 === 0 ? 52 : 15; p.push([cx + Math.cos(a) * long * k, cy + Math.sin(a) * long * k]); } return p; };
      ctx.fillStyle = A.ink;
      for (let n = 0, t = 0; n < 900 && t < 80; n++) {
        const x = 6 + rng() * 188, y = 6 + rng() * 188, dx = Math.abs(x - 100), dy = Math.abs(y - 100);
        if (Math.min(dx, dy) < 9 || Math.abs(dx - dy) < 8 || Math.hypot(dx, dy) < 30) continue;
        const r = 0.8 + rng() * 1.1; A.lw(r * 2); circ(ctx, x, y, r); ctx.fill(); t++;
      }
      [[1, 1.4], [0.76, 0.8], [0.52, 0.8]].forEach(([k, w], i) => { const pts = shape(k); if (!i) { ctx.fillStyle = A.bg; poly(ctx, pts); ctx.fill(); } ctx.lineWidth = A.lw(w); poly(ctx, pts); ctx.stroke(); });
      [[24, 1.2], [18, 0.8]].forEach(([r, w]) => { ctx.lineWidth = A.lw(w); circ(ctx, cx, cy, r); ctx.stroke(); });
      ctx.fillStyle = A.ink; circ(ctx, cx, cy, 4); ctx.fill();
    });

  add('Faith', 'wheat', 'Wheat field', 'Twenty-one stalks of wheat fanning up from the bottom edge.',
    A => {
      const { ctx, rng } = A;
      for (let s = 0; s < 21; s++) {
        const bx = 30 + rng() * 140, tx = bx + (rng() - 0.5) * 100, ty = 20 + rng() * 55, cxp = bx + (tx - bx) * 0.15 + (rng() - 0.5) * 30, cyp = 130;
        const at = u => { const v = 1 - u; return [v * v * bx + 2 * v * u * cxp + u * u * tx, v * v * 206 + 2 * v * u * cyp + u * u * ty]; };
        ctx.lineWidth = A.lw(1.0); ctx.beginPath(); for (let i = 0; i <= 40; i++) { const p = at(i / 40); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke();
        ctx.lineWidth = A.lw(0.8);
        for (let g = 0; g < 9; g++) {
          const u = 0.62 + g * 0.04, p = at(u), q = at(u + 0.01), ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
          for (const sd of [-1, 1]) { const a = ang + sd * 0.55, gx = p[0] + Math.cos(a) * 2.6, gy = p[1] + Math.sin(a) * 2.6; ctx.fillStyle = A.bg; ctx.beginPath(); ctx.ellipse(gx, gy, 3.5, 1.7, a, 0, TAU); ctx.fill(); ctx.stroke(); }
        }
        const e = at(1); ctx.beginPath(); ctx.ellipse(e[0], e[1], 3.5, 1.7, Math.atan2(at(1)[1] - at(0.98)[1], at(1)[0] - at(0.98)[0]), 0, TAU); ctx.stroke();
      }
    });

  add('Faith', 'flames', 'Tongues of fire', 'Eight nested flames, each one hiding the lines of the one behind it.',
    A => {
      const { ctx, rng } = A, fl = [];
      for (let i = 0; i < 8; i++) fl.push({ x: 12 + i * 25.1 + (rng() - 0.5) * 8, h: 90 + rng() * 95, w: 40 + rng() * 12, sw: (rng() - 0.5) * 26 });
      fl.sort((a, b) => b.h - a.h);
      fl.forEach(f => {
        for (let k = 0; k < 5; k++) {
          const s = 1 - k * 0.18, h = f.h * s, w = f.w * s, x = f.x, y = 198;
          ctx.beginPath(); ctx.moveTo(x - w / 2, y);
          ctx.bezierCurveTo(x - w * 0.75, y - h * 0.3, x - w * 0.1, y - h * 0.5, x + f.sw * s, y - h);
          ctx.bezierCurveTo(x + w * 0.12, y - h * 0.5, x + w * 0.8, y - h * 0.32, x + w / 2, y);
          ctx.quadraticCurveTo(x, y + 8 * s, x - w / 2, y); ctx.closePath();
          if (k === 0) { ctx.fillStyle = A.bg; ctx.fill(); } ctx.lineWidth = A.lw([1.4, 0.8, 1.0, 0.7, 0.9][k]); ctx.stroke();
        }
      });
    });

  add('Faith', 'trinity', 'Three in one', 'Three interlocking circles drawn as triple outlines, inside a notched ring.',
    A => {
      const { ctx } = A, cx = 100, cy = 104, Rr = 30;
      ctx.lineWidth = A.lw(1.6); circ(ctx, cx, cy - 4, 94); ctx.stroke(); ctx.lineWidth = A.lw(0.8); circ(ctx, cx, cy - 4, 89); ctx.stroke();
      ctx.beginPath(); for (let k = 0; k < 72; k++) { const a = k * TAU / 72; ctx.moveTo(cx + Math.cos(a) * 84, cy - 4 + Math.sin(a) * 84); ctx.lineTo(cx + Math.cos(a) * 87, cy - 4 + Math.sin(a) * 87); } ctx.stroke();
      [-90, 30, 150].forEach(d => {
        const a = d * Math.PI / 180, x = cx + Math.cos(a) * Rr, y = cy + Math.sin(a) * Rr;
        [[52, 0.8], [48, 1.5], [44, 0.8]].forEach(([r, w]) => { ctx.lineWidth = A.lw(w); circ(ctx, x, y, r); ctx.stroke(); });
      });
      ctx.fillStyle = A.bg; circ(ctx, cx, cy, 5); ctx.fill(); ctx.lineWidth = A.lw(1.2); ctx.stroke();
    });
})();
