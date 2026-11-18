/* MILESDEPIRATAS - creación del mapa (mares, Red Line, islas, puertos y pueblos) */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const T = OP.T;

  const MAP_SEED = 1997;

  function bumpCenter(y) { const k = (y - OP.CY) / 62; return k * k < 1 ? Math.sqrt(1 - k * k) : 0; }
  function bumpEdge(y) { const k = (y - OP.CY) / 16; return k * k < 1 ? Math.sqrt(1 - k * k) : 0; }
  OP.redHalfWidth = (y) => 4 + 9 * bumpCenter(y);
  OP.edgeWidth = (y) => 5 + 6 * bumpEdge(y);

  function build() {
    const W = OP.W, H = OP.H, N = W * H;
    const t = new Uint8Array(N);
    const isl = new Int16Array(N).fill(-1);
    const dnv = new Uint8Array(N); // distancia normalizada al centro de la isla (0..255), para dibujar

    // 1) Agua según la zona y Red Line
    for (let y = 0; y < H; y++) {
      const hw = OP.redHalfWidth(y);
      const ew = OP.edgeWidth(y);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const jit = (OP.fbm(x * 0.21, y * 0.21, MAP_SEED + 5, 3) - 0.5) * 2.4;
        const dc = Math.abs(x + 0.5 - OP.CX);
        if (dc < hw + jit) { t[i] = dc < hw + jit - 2.5 ? T.REDTOP : T.REDLINE; continue; }
        if (x + 0.5 < ew + jit || x + 0.5 > W - ew - jit) {
          const inner = x + 0.5 < ew + jit - 2.5 || x + 0.5 > W - ew - jit + 2.5;
          t[i] = inner ? T.REDTOP : T.REDLINE; continue;
        }
        t[i] = OP.zoneAt(x + 0.5, y + 0.5) === 'calm' ? T.CALM : T.SEA;
      }
    }
    // Ríos de Reverse Mountain (decorativos) y Mariejois
    for (const g of OP.GATES) {
      if (g.kind !== 'climb') continue;
      for (let k = 0; k < g.path.length - 1; k++) {
        const [ax, ay] = g.path[k], [bx, by] = g.path[k + 1];
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
        for (let s = 0; s <= steps; s++) {
          const x = Math.floor(ax + (bx - ax) * s / steps), y = Math.floor(ay + (by - ay) * s / steps);
          const i = y * W + x;
          if (OP.isRed(t[i])) t[i] = T.RMRIVER;
        }
      }
    }
    for (let y = OP.CY - 5; y <= OP.CY + 5; y++) {
      for (let x = W - 9; x < W; x++) {
        const i = y * W + x;
        if (OP.isRed(t[i]) && Math.hypot(x - 762, (y - OP.CY) * 0.9) < 5) t[i] = T.HOLY;
      }
    }

    // 2) Mar de nubes (Skypiea) y fondo marino (Isla Gyojin)
    function patch(p, type, seed) {
      for (let y = Math.floor(p.y - p.r - 3); y <= p.y + p.r + 3; y++) {
        for (let x = Math.floor(p.x - p.r - 3); x <= p.x + p.r + 3; x++) {
          const i = y * W + x;
          if (t[i] !== T.SEA) continue;
          const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) + (OP.fbm(x * 0.3, y * 0.3, seed, 3) - 0.5) * 3;
          if (d < p.r) t[i] = type;
        }
      }
    }
    patch(OP.CLOUD_PATCH, T.CLOUDSEA, MAP_SEED + 11);
    patch(OP.DEEP_PATCH, T.DEEP, MAP_SEED + 12);

    // 3) Islas
    const islands = OP.ISLANDS.map((d, idx) => Object.assign({ idx }, d));
    islands.forEach((I) => paintIsland(I, t, isl, dnv, W, H));

    const M = (OP.M = { W, H, N, t, isl, dnv, islands, byId: {} });
    islands.forEach((I) => { M.byId[I.id] = I; });

    // 4) Bloque principal de cada isla (para caminar)
    islands.forEach((I) => mainBlob(I, M));

    // 5) Distancia a tierra (para rutas y agua poco profunda)
    computeLandDist(M);

    // 6) Clases navegables, regiones, puertos, pasos especiales
    OP.Nav.prepare(M);
    islands.forEach((I) => chooseDock(I, M));
    OP.Nav.prepareGates(M);

    // 7) Pueblos
    islands.forEach((I) => placeTowns(I, M));
    return M;
  }

  // ---------- Pintar una isla ----------
  function paintIsland(I, t, isl, dnv, W, H) {
    const rng = OP.makeRng(MAP_SEED * 31 + I.idx * 7919);
    const ph = [rng.f(0, 6.28), rng.f(0, 6.28), rng.f(0, 6.28), rng.f(0, 6.28)];
    const amp = I.r <= 3 ? [0.04, 0.02, 0, 0] : [0.13, 0.08, 0.05, 0.035];
    const ex = I.ex || 1, ey = I.ey || 1;
    const seed = MAP_SEED + I.idx * 101;
    const noiseAmp = I.r <= 3 ? 0.3 : 1.0;
    const blobs = [{ x: I.x, y: I.y, r: I.r, ex, ey, main: true }];
    if (I.arch) {
      for (let k = 0; k < I.arch; k++) {
        const a = rng.f(0, Math.PI * 2);
        const dd = I.r * rng.f(1.45, 1.8);
        blobs.push({ x: I.x + Math.cos(a) * dd * ex, y: I.y + Math.sin(a) * dd * 0.7, r: Math.max(2, I.r * rng.f(0.28, 0.42)), ex: 1, ey: 1 });
      }
    }
    const allowed = I.sky ? T.CLOUDSEA : I.deep ? T.DEEP : I.calm ? T.CALM : T.SEA;
    for (const b of blobs) {
      const R = b.r * 1.5 + 3;
      for (let y = Math.floor(b.y - R * b.ey); y <= Math.ceil(b.y + R * b.ey); y++) {
        if (y < 2 || y >= H - 2) continue;
        for (let x = Math.floor(b.x - R * b.ex); x <= Math.ceil(b.x + R * b.ex); x++) {
          if (x < 2 || x >= W - 2) continue;
          const i = y * W + x;
          const cur = t[i];
          if (!(cur === allowed || cur === T.SEA || cur === T.CALM) || (isl[i] >= 0 && isl[i] !== I.idx)) continue;
          if (!OP.isWater(cur) && isl[i] !== I.idx) continue;
          const dx = (x + 0.5 - b.x) / b.ex, dy = (y + 0.5 - b.y) / b.ey;
          const d = Math.hypot(dx, dy);
          const th = Math.atan2(dy, dx);
          let rr = b.r * (1 + amp[0] * Math.sin(2 * th + ph[0]) + amp[1] * Math.sin(3 * th + ph[1]) + amp[2] * Math.sin(5 * th + ph[2]) + amp[3] * Math.sin(7 * th + ph[3]));
          const n = (OP.fbm(x * 0.33, y * 0.33, seed, 3) - 0.5) * 2.2 * noiseAmp;
          const dn = (d + n) / rr;
          if (dn >= 1) continue;
          // no tocar islas vecinas: deja un canal de agua de 2 casillas
          let clash = false;
          for (let oy = -2; oy <= 2 && !clash; oy++) for (let ox = -2; ox <= 2; ox++) {
            const j = (y + oy) * W + (x + ox);
            if (isl[j] >= 0 && isl[j] !== I.idx) { clash = true; break; }
          }
          if (clash) continue;
          const dnMain = b.main ? dn : 0.55 + dn * 0.45;
          t[i] = biomeTile(I, x, y, dnMain, seed);
          isl[i] = I.idx;
          dnv[i] = Math.min(255, Math.floor(dnMain * 255));
        }
      }
    }
  }

  function biomeTile(I, x, y, dn, seed) {
    const n1 = OP.fbm(x * 0.17, y * 0.17, seed + 1, 3);
    const n2 = OP.fbm(x * 0.33, y * 0.33, seed + 2, 3);
    const h = OP.hash2(x, y, seed + 3);
    switch (I.biome) {
      case 'tropical':
        if (dn > 0.8) return T.SAND;
        if (dn < 0.16 && I.r >= 8) return T.MOUNTAIN;
        if (dn < 0.38 && n2 > 0.56) return T.HILL;
        if (n1 > 0.56 || h < 0.04) return T.FOREST;
        return T.GRASS;
      case 'forest':
        if (dn > 0.86) return T.SAND;
        if (dn < 0.25 && n2 > 0.6) return T.HILL;
        if (n1 > 0.44) return T.FOREST;
        return T.GRASS;
      case 'winter':
        if (dn > 0.85) return T.ICE;
        if (dn < 0.4 && n2 > 0.42) return T.SNOWPEAK;
        if (n1 > 0.52) return T.PINE;
        return T.SNOW;
      case 'desert': {
        if (dn > 0.9) return T.SAND;
        if (I.id === 'alabasta') {
          const ld = Math.abs((y - I.y) - (x - I.x) * 0.35 - (n2 - 0.5) * 4);
          if (ld < 0.9) return T.RIVER;
          if (ld < 2.2) return T.GRASS;
        }
        if (n2 > 0.63) return T.ROCK;
        if (h < 0.008) return T.GRASS;
        if (n1 > 0.55) return T.DUNE;
        return T.DESERT;
      }
      case 'city':
        if (dn > 0.88) return T.SAND;
        if (n1 > 0.66) return T.GRASS;
        if (x % 4 === 0 || y % 4 === 0) return T.ROAD;
        return T.TOWN;
      case 'canals':
        if (dn > 0.9) return T.STONE;
        if (dn < 0.16) return T.CASTLE;
        if (x % 5 === 0 || y % 5 === 0) return T.CANAL;
        return T.TOWN;
      case 'fortress':
        if (dn > 0.9) return T.ROCK;
        if (dn > 0.78) return T.WALL;
        if (dn < 0.26) return T.MBASE;
        if (h < 0.28) return T.MBASE;
        if (n1 > 0.62) return T.GRASS;
        return T.STONE;
      case 'prison':
        if (dn > 0.82) return T.ROCK;
        if (dn < 0.5) return T.PRISON;
        return T.STONE;
      case 'volcanic':
        if (x < I.x) {
          if (dn < 0.3 || (n2 > 0.66 && dn < 0.8)) return T.LAVA;
          return n1 > 0.5 ? T.ASH : T.ROCK;
        }
        if (dn > 0.84) return T.ICE;
        if (dn < 0.18) return T.LAB;
        return n1 > 0.5 ? T.SNOWPEAK : T.SNOW;
      case 'prehistoric':
        if (dn > 0.88) return T.SAND;
        if (dn < 0.12) return T.LAVA;
        if (dn < 0.26) return T.MOUNTAIN;
        return n1 > 0.42 ? T.JUNGLE : T.FOREST;
      case 'sky':
        if (dn > 0.62) return T.CLOUD;
        if (dn < 0.2 && n2 > 0.45) return T.GOLD;
        if (n1 > 0.4) return T.JUNGLE;
        return T.FOREST;
      case 'ghost':
        if (dn > 0.88) return T.ROCK;
        if (dn < 0.2) return T.CASTLE;
        return n1 > 0.48 ? T.DEADTREE : T.SWAMP;
      case 'mangrove':
        if (dn > 0.9) return T.SAND;
        if (n1 > 0.5 || h < 0.06) return T.MANGROVE;
        return T.GRASS;
      case 'sakura':
        if (dn > 0.86) return T.ROCK;
        if (dn < 0.13) return T.CASTLE;
        if (n2 > 0.6) return T.MOUNTAIN;
        if (n1 > 0.5) return T.SAKURA;
        return T.GRASS;
      case 'candy':
        if (dn > 0.86) return T.CREAM;
        if (dn < 0.14) return T.CASTLE;
        if (n1 > 0.55) return T.CHOCO;
        return n2 > 0.4 ? T.CANDY : T.CREAM;
      case 'future':
        if (dn > 0.9) return T.METAL;
        if (dn < 0.3 || h < 0.1) return T.LAB;
        if (n1 > 0.6) return T.GRASS;
        return T.METAL;
      case 'elephant':
        if (dn > 0.62) return T.ELEPHANT;
        if (dn > 0.55) return T.ROCK;
        return n1 > 0.45 ? T.JUNGLE : T.FOREST;
      case 'toy':
        if (dn > 0.88) return T.SAND;
        if (dn < 0.14) return T.CASTLE;
        if (dn > 0.36 && dn < 0.44 && x > I.x) return T.STONE;
        if (n1 > 0.58) return T.FLOWER;
        if (n2 > 0.56) return T.TOWN;
        return T.GRASS;
      case 'giants':
        if (dn > 0.86) return T.SAND;
        if (dn < 0.17) return T.JUNGLE;
        if (n2 > 0.64) return T.MOUNTAIN;
        return n1 > 0.42 ? T.JUNGLE : T.GRASS;
      case 'ruins':
        if (dn > 0.85) return T.SAND;
        if (dn < 0.15) return T.DEADTREE;
        if (h < 0.14) return T.RUIN;
        return n1 > 0.48 ? T.ASH : T.GRASS;
      case 'whiteruins':
        if (dn > 0.85) return T.SAND;
        if (n1 > 0.48 || h < 0.1) return T.WHITERUIN;
        return T.SNOW;
      case 'wasteland':
        if (dn > 0.88) return T.SAND;
        if (n1 > 0.5) return T.RUIN;
        return T.ROCK;
      case 'jungle':
        if (dn > 0.86) return T.ROCK;
        if (n2 > 0.62) return T.MOUNTAIN;
        return T.JUNGLE;
      case 'bubble':
        if (dn > 0.78) return T.BUBBLE;
        if (dn < 0.22) return T.CASTLE;
        return n1 > 0.52 ? T.CORAL : T.BUBBLE;
      case 'mountain':
        if (dn > 0.86) return T.SAND;
        if (dn < 0.42) return T.MOUNTAIN;
        return n1 > 0.5 ? T.FOREST : T.GRASS;
      case 'legend':
        if (dn > 0.82) return T.GOLD;
        if (dn < 0.2) return T.MOUNTAIN;
        return n1 > 0.45 ? T.JUNGLE : T.GRASS;
      case 'wood':
        return dn < 0.45 ? T.TOWN : T.WOOD;
      case 'cactus':
        if (dn > 0.88) return T.SAND;
        if (n1 > 0.5) return T.CACTUS;
        return T.DESERT;
      case 'rocky':
        if (dn < 0.22) return T.LIGHTHOUSE;
        if (dn > 0.78) return T.ROCK;
        return T.GRASS;
      default:
        return dn > 0.85 ? T.SAND : T.GRASS;
    }
  }

  // ---------- Bloque principal (zona caminable) ----------
  function mainBlob(I, M) {
    const { W, t, isl } = M;
    const seen = new Uint8Array(M.N);
    let best = [];
    const R = Math.ceil(I.r * 3 + 6);
    for (let y = Math.max(1, Math.floor(I.y - R)); y < Math.min(M.H - 1, I.y + R); y++) {
      for (let x = Math.max(1, Math.floor(I.x - R)); x < Math.min(W - 1, I.x + R); x++) {
        const s = y * W + x;
        if (isl[s] !== I.idx || seen[s]) continue;
        const comp = [];
        const q = [s]; seen[s] = 1;
        while (q.length) {
          const c = q.pop(); comp.push(c);
          const cx = c % W, cy = (c / W) | 0;
          const nb = [c - 1, c + 1, c - W, c + W];
          for (const n of nb) {
            if (isl[n] === I.idx && !seen[n]) { seen[n] = 1; q.push(n); }
          }
          void cx; void cy;
        }
        if (comp.length > best.length) best = comp;
      }
    }
    I.land = best;
    I.area = best.length;
    I.landSet = new Set(best);
    void t;
  }

  // ---------- Distancia a tierra ----------
  function computeLandDist(M) {
    const { W, H, N, t } = M;
    const d = new Uint8Array(N).fill(255);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (!OP.isWater(t[i])) { d[i] = 0; q[qt++] = i; }
    while (qh < qt) {
      const c = q[qh++];
      const cd = d[c];
      if (cd >= 12) continue;
      const x = c % W, y = (c / W) | 0;
      if (x > 0 && d[c - 1] > cd + 1) { d[c - 1] = cd + 1; q[qt++] = c - 1; }
      if (x < W - 1 && d[c + 1] > cd + 1) { d[c + 1] = cd + 1; q[qt++] = c + 1; }
      if (y > 0 && d[c - W] > cd + 1) { d[c - W] = cd + 1; q[qt++] = c - W; }
      if (y < H - 1 && d[c + W] > cd + 1) { d[c + W] = cd + 1; q[qt++] = c + W; }
    }
    M.landDist = d;
  }

  // ---------- Puerto de cada isla ----------
  function chooseDock(I, M) {
    const { W, t, isl } = M;
    const needCls = I.sky ? 2 : I.deep ? 3 : 1;
    const prof = I.calm ? 'm' : 'p';
    const cls = prof === 'm' ? M.clsM : M.clsP;
    const reg = prof === 'm' ? M.regM : M.regP;
    const sizes = prof === 'm' ? M.regSizeM : M.regSizeP;
    // punto hacia el que mira el puerto
    let hx = I.x, hy = OP.CY;
    if (OP.SEAS[I.sea] && OP.SEAS[I.sea].kind === 'blue') {
      hx = OP.CX + (I.x < OP.CX ? -14 : 14); hy = I.y < OP.CY ? 166 : 266;
    } else if (I.sky) { hx = 589; hy = 210; }
    else if (I.deep) { hx = 735; hy = 222; }
    else if (I.calm) { hy = OP.CY; }
    else { hy = I.y < OP.CY ? I.y + 30 : I.y - 30; hx = I.x - 20; }
    let best = -1, bestScore = Infinity;
    for (const c of I.land) {
      const x = c % W, y = (c / W) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const n = (y + oy) * W + (x + ox);
        if (cls[n] !== needCls) continue;
        if (isl[n] >= 0) continue;
        const regSize = sizes[reg[n]] || 0;
        if (regSize < 400 && needCls === 1) continue; // lagunas cerradas no sirven
        // el puerto debe poder navegarse alrededor (no encerrado entre rocas)
        let open = 0;
        for (let k = -1; k <= 1; k++) for (let l = -1; l <= 1; l++) if (cls[n + k * W + l] === needCls) open++;
        if (open < 5) continue;
        const nx = n % W, ny = (n / W) | 0;
        const score = Math.hypot(nx - hx, ny - hy) - open * 0.3;
        if (score < bestScore) { bestScore = score; best = n; I.portLand = c; }
      }
    }
    if (best < 0) {
      console.warn('Sin puerto para', I.name);
      best = I.y * W + I.x; I.portLand = best;
    }
    I.dock = best;
    I.dockX = (best % W) + 0.5;
    I.dockY = ((best / W) | 0) + 0.5;
    I.dockRegP = M.regP[best];
    I.dockRegM = M.regM[best];
    void t;
  }

  // ---------- Pueblos ----------
  function placeTowns(I, M) {
    const { W, t } = M;
    I.townPos = [];
    if (!I.land.length) return;
    const px = I.portLand % W, py = (I.portLand / W) | 0;
    const portAng = Math.atan2(py - I.y, px - I.x);
    const n = I.towns.length;
    const noBuild = ['wood', 'fortress', 'prison', 'canals', 'city', 'rocky', 'prehistoric', 'legend'];
    for (let k = 0; k < n; k++) {
      let tx, ty;
      if (k === 0) {
        // un poco hacia dentro desde el puerto
        tx = px - Math.cos(portAng) * 1.5; ty = py - Math.sin(portAng) * 1.5;
      } else {
        const a = portAng + (k * Math.PI * 2) / n;
        tx = I.x + Math.cos(a) * I.r * 0.5 * (I.ex || 1); ty = I.y + Math.sin(a) * I.r * 0.5 * (I.ey || 1);
      }
      // ajustar a la casilla de tierra más cercana
      let bi = I.land[0], bd = Infinity;
      for (const c of I.land) {
        const d = Math.hypot((c % W) + 0.5 - tx, ((c / W) | 0) + 0.5 - ty);
        if (d < bd) { bd = d; bi = c; }
      }
      const cx = bi % W, cy = (bi / W) | 0;
      I.townPos.push({ name: I.towns[k], x: cx + 0.5, y: cy + 0.5 });
      if (noBuild.indexOf(I.biome) >= 0 || I.pop < 50) continue;
      const rad = I.pop > 60000 ? 2.6 : I.pop > 4000 ? 1.9 : 1.2;
      for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
        if (Math.hypot(ox, oy) > rad) continue;
        const c = (cy + oy) * W + (cx + ox);
        if (!I.landSet.has(c)) continue;
        const tt = t[c];
        if (tt === T.CASTLE || tt === T.MBASE || tt === T.LIGHTHOUSE || tt === T.RIVER || tt === T.CANAL) continue;
        t[c] = (ox + oy) % 3 === 0 && Math.abs(ox) + Math.abs(oy) > 0 ? T.ROAD : T.TOWN;
      }
    }
  }

  OP.Map = { build };
})();
