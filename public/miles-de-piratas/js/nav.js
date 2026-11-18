/* MILESDEPIRATAS - navegación: regiones de agua, rutas por mar (nunca por tierra) y pasos especiales */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const T = OP.T;
  let M = null;

  // Clase navegable de cada casilla: 0 bloqueado, 1 mar, 2 mar de nubes, 3 fondo marino
  function prepare(map) {
    M = map;
    const { N, W, H, t } = M;
    M.clsP = new Uint8Array(N);
    M.clsM = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const v = t[i];
      const x = i % W, y = (i / W) | 0;
      const border = x < 1 || y < 1 || x >= W - 1 || y >= H - 1;
      if (border) continue;
      if (v === T.SEA) { M.clsP[i] = 1; M.clsM[i] = 1; }
      else if (v === T.CALM) { M.clsM[i] = 1; }
      else if (v === T.CLOUDSEA) { M.clsP[i] = 2; M.clsM[i] = 2; }
      else if (v === T.DEEP) { M.clsP[i] = 3; M.clsM[i] = 3; }
    }
    const a = regions(M.clsP); M.regP = a.reg; M.regSizeP = a.sizes;
    const b = regions(M.clsM); M.regM = b.reg; M.regSizeM = b.sizes;
    // memoria para A*
    M._g = new Float32Array(N);
    M._came = new Int32Array(N);
    M._stamp = new Uint32Array(N);
    M._closed = new Uint32Array(N);
    M._gen = 0;
    M._cache = new Map();
  }

  function regions(cls) {
    const { N, W } = M;
    const reg = new Int32Array(N);
    const sizes = [0];
    const q = new Int32Array(N);
    let id = 0;
    for (let s = 0; s < N; s++) {
      if (!cls[s] || reg[s]) continue;
      id++;
      const c0 = cls[s];
      let qh = 0, qt = 0; q[qt++] = s; reg[s] = id;
      let size = 0;
      while (qh < qt) {
        const c = q[qh++]; size++;
        const nb0 = c - 1, nb1 = c + 1, nb2 = c - W, nb3 = c + W;
        if (cls[nb0] === c0 && !reg[nb0]) { reg[nb0] = id; q[qt++] = nb0; }
        if (cls[nb1] === c0 && !reg[nb1]) { reg[nb1] = id; q[qt++] = nb1; }
        if (cls[nb2] === c0 && !reg[nb2]) { reg[nb2] = id; q[qt++] = nb2; }
        if (cls[nb3] === c0 && !reg[nb3]) { reg[nb3] = id; q[qt++] = nb3; }
      }
      sizes[id] = size;
    }
    return { reg, sizes };
  }

  function nearestOfClass(x, y, clsArr, wanted, maxR) {
    const { W } = M;
    let best = -1, bd = Infinity;
    for (let r = 0; r <= maxR; r++) {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        const i = (y + oy) * W + (x + ox);
        if (clsArr[i] !== wanted) continue;
        if (M.isl[i] >= 0) continue;
        let open = 0;
        for (let k = -1; k <= 1; k++) for (let l = -1; l <= 1; l++) if (clsArr[i + k * W + l] === wanted) open++;
        if (open < 7) continue;
        const d = Math.hypot(ox, oy);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) return best;
    }
    return best;
  }

  // Ajusta los pasos especiales a casillas válidas
  function prepareGates(map) {
    M = map;
    const W = M.W;
    M.gates = OP.GATES.map((g) => {
      const fromCls = g.kind === 'tunnel' ? 3 : g.kind === 'dive' ? 1 : g.kind === 'sky' ? 1 : 1;
      const toCls = g.kind === 'dive' ? 3 : g.kind === 'sky' ? 2 : 1;
      const f = nearestOfClass(g.from[0], g.from[1], M.clsP, fromCls, 8);
      const to = nearestOfClass(g.to[0], g.to[1], M.clsP, toCls, 8);
      const G = Object.assign({}, g);
      G.fromIdx = f; G.toIdx = to;
      G.fx = (f % W) + 0.5; G.fy = ((f / W) | 0) + 0.5;
      G.tx = (to % W) + 0.5; G.ty = ((to / W) | 0) + 0.5;
      const pts = (g.path || [g.from, g.to]).map((p) => [p[0] + 0.5, p[1] + 0.5]);
      pts[0] = [G.fx, G.fy]; pts[pts.length - 1] = [G.tx, G.ty];
      G.pts = pts;
      G.len = polyLen(pts);
      G.regFromP = M.regP[f]; G.regToP = M.regP[to];
      G.regFromM = M.regM[f]; G.regToM = M.regM[to];
      return G;
    });
    M.gateById = {};
    M.gates.forEach((g) => { M.gateById[g.id] = g; });
  }

  function polyLen(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }

  // ---------- A* sobre la cuadrícula (8 direcciones, sin cortar esquinas de tierra) ----------
  const heapIdx = [], heapF = [];
  function hpush(i, f) {
    heapIdx.push(i); heapF.push(f);
    let n = heapIdx.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (heapF[p] <= heapF[n]) break;
      [heapIdx[p], heapIdx[n]] = [heapIdx[n], heapIdx[p]];
      [heapF[p], heapF[n]] = [heapF[n], heapF[p]];
      n = p;
    }
  }
  function hpop() {
    const top = heapIdx[0];
    const li = heapIdx.pop(), lf = heapF.pop();
    if (heapIdx.length) {
      heapIdx[0] = li; heapF[0] = lf;
      let n = 0;
      const L = heapIdx.length;
      for (;;) {
        const a = 2 * n + 1, b = a + 1;
        let m = n;
        if (a < L && heapF[a] < heapF[m]) m = a;
        if (b < L && heapF[b] < heapF[m]) m = b;
        if (m === n) break;
        [heapIdx[m], heapIdx[n]] = [heapIdx[n], heapIdx[m]];
        [heapF[m], heapF[n]] = [heapF[n], heapF[m]];
        n = m;
      }
    }
    return top;
  }

  const COAST_COST = [0, 1.6, 0.7, 0.25, 0];
  function astar(start, goal, cls) {
    const { W } = M;
    const c0 = cls[start];
    if (!c0 || cls[goal] !== c0) return null;
    if (start === goal) return [start];
    const g = M._g, came = M._came, stamp = M._stamp, closed = M._closed;
    const gen = ++M._gen;
    heapIdx.length = 0; heapF.length = 0;
    const gx = goal % W, gy = (goal / W) | 0;
    const hfun = (i) => {
      const dx = Math.abs((i % W) - gx), dy = Math.abs(((i / W) | 0) - gy);
      return (dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx);
    };
    stamp[start] = gen; g[start] = 0; came[start] = -1;
    hpush(start, hfun(start));
    const ld = M.landDist;
    let expanded = 0;
    while (heapIdx.length) {
      const c = hpop();
      if (closed[c] === gen) continue;
      closed[c] = gen;
      if (c === goal) break;
      if (++expanded > 400000) return null;
      const cg = g[c];
      for (let k = 0; k < 8; k++) {
        const ox = DX[k], oy = DY[k];
        const n = c + ox + oy * W;
        if (cls[n] !== c0 || closed[n] === gen) continue;
        if (ox && oy) {
          if (cls[c + ox] !== c0 || cls[c + oy * W] !== c0) continue; // sin cortar esquinas
        }
        const dl = ld[n];
        const step = (ox && oy ? 1.41421 : 1) + (dl < 4 ? COAST_COST[dl] : 0);
        const ng = cg + step;
        if (stamp[n] !== gen || ng < g[n]) {
          stamp[n] = gen; g[n] = ng; came[n] = c;
          hpush(n, ng + hfun(n));
        }
      }
    }
    if (closed[goal] !== gen) return null;
    const path = [];
    for (let c = goal; c !== -1; c = came[c]) path.push(c);
    path.reverse();
    return path;
  }
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];

  // Línea "gruesa": comprueba que el segmento pasa solo por agua de su clase con margen
  function clearLine(ax, ay, bx, by, cls, c0) {
    const { W } = M;
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 0.001) return true;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    const px = -uy * 0.32, py = ux * 0.32;
    const steps = Math.ceil(L / 0.2);
    for (let s = 0; s <= steps; s++) {
      const x = ax + (bx - ax) * s / steps, y = ay + (by - ay) * s / steps;
      if (cls[Math.floor(y) * W + Math.floor(x)] !== c0) return false;
      if (cls[Math.floor(y + py) * W + Math.floor(x + px)] !== c0) return false;
      if (cls[Math.floor(y - py) * W + Math.floor(x - px)] !== c0) return false;
    }
    return true;
  }
  OP.clearLine = (ax, ay, bx, by, cls, c0) => clearLine(ax, ay, bx, by, cls, c0);

  function smoothPath(path, cls) {
    const { W } = M;
    const c0 = cls[path[0]];
    const pts = path.map((i) => [(i % W) + 0.5, ((i / W) | 0) + 0.5]);
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 60);
      while (j > i + 1 && !clearLine(pts[i][0], pts[i][1], pts[j][0], pts[j][1], cls, c0)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  // Ruta por agua entre dos casillas de la misma región (con memoria)
  function seaPath(fromIdx, toIdx, prof, useCache) {
    const cls = prof === 'm' ? M.clsM : M.clsP;
    const key = prof + ':' + fromIdx + ':' + toIdx;
    if (useCache && M._cache.has(key)) return M._cache.get(key);
    const raw = astar(fromIdx, toIdx, cls);
    const res = raw ? smoothPath(raw, cls) : null;
    if (useCache) {
      if (M._cache.size > 3000) M._cache.clear();
      M._cache.set(key, res);
    }
    return res;
  }

  // ---------- Planificar un viaje completo ----------
  // opts: { prof:'p'|'m', canGate(gate, forward) -> bool, fromIdx, fromIsDock }
  function planRoute(opts, destIsland) {
    const prof = opts.prof;
    const reg = prof === 'm' ? M.regM : M.regP;
    const cls = prof === 'm' ? M.clsM : M.clsP;
    let from = opts.fromIdx;
    if (!cls[from]) {
      // si estamos en una casilla rara, buscamos agua cercana
      const fx = from % M.W, fy = (from / M.W) | 0;
      let found = -1;
      for (let r = 1; r < 5 && found < 0; r++) {
        for (let oy = -r; oy <= r && found < 0; oy++) for (let ox = -r; ox <= r; ox++) {
          const i = (fy + oy) * M.W + fx + ox;
          if (cls[i]) { found = i; break; }
        }
      }
      if (found < 0) return null;
      from = found;
    }
    const to = destIsland.dock;
    const rFrom = reg[from], rTo = reg[to];
    if (!rFrom || !rTo) return null;
    // BFS sobre regiones a través de los pasos especiales
    const prev = new Map();
    prev.set(rFrom, null);
    const q = [rFrom];
    while (q.length && !prev.has(rTo)) {
      const r = q.shift();
      for (const g of M.gates) {
        const gf = prof === 'm' ? g.regFromM : g.regFromP;
        const gt = prof === 'm' ? g.regToM : g.regToP;
        if (gf === r && !prev.has(gt) && opts.canGate(g, true)) { prev.set(gt, { g, fwd: true, from: r }); q.push(gt); }
        if (!g.oneWay && gt === r && !prev.has(gf) && opts.canGate(g, false)) { prev.set(gf, { g, fwd: false, from: r }); q.push(gf); }
      }
    }
    if (!prev.has(rTo)) return null;
    const hops = [];
    for (let r = rTo; prev.get(r); r = prev.get(r).from) hops.push(prev.get(r));
    hops.reverse();
    const legs = [];
    let cur = from;
    const useCache = !!opts.fromIsDock;
    for (const h of hops) {
      const gIn = h.fwd ? h.g.fromIdx : h.g.toIdx;
      const gOut = h.fwd ? h.g.toIdx : h.g.fromIdx;
      const sp = seaPath(cur, gIn, prof, useCache || cur !== from);
      if (!sp) return null;
      if (sp.length > 1) legs.push({ type: 'sea', pts: sp, len: polyLen(sp) });
      const gp = h.fwd ? h.g.pts.slice() : h.g.pts.slice().reverse();
      legs.push({ type: 'gate', gate: h.g.id, kind: h.g.kind, pts: gp, len: polyLen(gp), hours: h.g.hours, fwd: h.fwd });
      cur = gOut;
    }
    const sp = seaPath(cur, to, prof, useCache || cur !== from);
    if (!sp) return null;
    if (sp.length > 1) legs.push({ type: 'sea', pts: sp, len: polyLen(sp) });
    let total = 0;
    for (const l of legs) total += l.len;
    return { legs, total, dest: destIsland.id, gates: hops.map((h) => h.g.id + (h.fwd ? '>' : '<')) };
  }

  OP.Nav = { prepare, prepareGates, planRoute, seaPath, polyLen, astar };
})();
