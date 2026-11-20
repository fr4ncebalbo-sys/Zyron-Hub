/* MILESDEPIRATAS - dibujo del mapa (Canvas 2D, pixel art) */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const T = OP.T;
  const TS = 4; // píxeles de detalle por casilla

  const PAL = {};
  const P = (t, r, g, b) => { PAL[t] = [r, g, b]; };
  P(T.SAND, 226, 205, 140); P(T.GRASS, 98, 170, 72); P(T.FOREST, 60, 132, 56); P(T.HILL, 124, 156, 82); P(T.MOUNTAIN, 128, 116, 100);
  P(T.SNOW, 236, 240, 246); P(T.ICE, 186, 220, 240); P(T.PINE, 214, 226, 232); P(T.SNOWPEAK, 206, 212, 224); P(T.DESERT, 232, 198, 122);
  P(T.DUNE, 214, 172, 98); P(T.ROCK, 122, 114, 106); P(T.LAVA, 226, 84, 34); P(T.TOWN, 200, 120, 80); P(T.ROAD, 176, 156, 124);
  P(T.RIVER, 62, 134, 204); P(T.JUNGLE, 34, 104, 44); P(T.SAKURA, 104, 168, 84); P(T.CANDY, 246, 172, 206); P(T.CHOCO, 122, 72, 42);
  P(T.CREAM, 250, 236, 212); P(T.METAL, 202, 214, 228); P(T.LAB, 150, 184, 224); P(T.STONE, 162, 162, 170); P(T.WALL, 106, 106, 118);
  P(T.MBASE, 230, 236, 244); P(T.CLOUD, 246, 248, 252); P(T.WOOD, 152, 102, 60); P(T.MANGROVE, 84, 150, 70); P(T.DEADTREE, 70, 74, 66);
  P(T.SWAMP, 66, 78, 82); P(T.GOLD, 238, 198, 82); P(T.CACTUS, 214, 182, 112); P(T.ELEPHANT, 142, 142, 152); P(T.FLOWER, 104, 170, 70);
  P(T.RUIN, 150, 140, 130); P(T.WHITERUIN, 236, 236, 232); P(T.BUBBLE, 172, 228, 238); P(T.CORAL, 236, 122, 142); P(T.PRISON, 72, 70, 84);
  P(T.CASTLE, 204, 184, 162); P(T.ASH, 88, 86, 90); P(T.LIGHTHOUSE, 120, 170, 90); P(T.CANAL, 74, 152, 212);
  P(T.REDLINE, 146, 50, 40); P(T.REDTOP, 176, 74, 54); P(T.RMRIVER, 84, 150, 222); P(T.HOLY, 240, 222, 150);

  const ROOF = { tropical: [196, 92, 60], forest: [150, 80, 50], winter: [120, 60, 60], desert: [214, 170, 110], city: [180, 70, 60], canals: [210, 110, 70],
    mangrove: [220, 120, 150], sakura: [80, 70, 90], candy: [250, 120, 170], toy: [240, 90, 120], cactus: [200, 120, 70], wasteland: [110, 90, 70],
    jungle: [190, 140, 70], bubble: [250, 170, 200], ruins: [90, 80, 70], whiteruins: [220, 220, 220], mountain: [150, 80, 50], future: [90, 140, 220],
    giants: [150, 90, 50], elephant: [160, 110, 70], wood: [170, 60, 50], ghost: [80, 60, 100], volcanic: [90, 90, 100] };

  let M = null;
  let base = null, detail = null, miniBase = null;
  let cv = null, ctx = null, mini = null, mctx = null;
  const cam = { x: 575, y: 90, z: 3 };
  const effects = [];
  let dpr = 1;
  // Calidad automática: en móvil se limita la resolución y a 30 FPS; si el equipo va justo, baja un escalón más
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const Perf = (OP.Perf = { touch, tier: touch ? 1 : 0, last: 0, avg: 16, slow: 0 });
  function shouldDraw(ts) {
    const gap = ts - Perf.last;
    if (Perf.tier >= 1 && gap < 30) return false;
    Perf.last = ts;
    Perf.avg += (Math.min(250, gap) - Perf.avg) * 0.05;
    Perf.slow = Perf.avg > (Perf.tier ? 48 : 30) ? Perf.slow + 1 : 0;
    if (Perf.slow > 90 && Perf.tier < 2) { Perf.tier++; Perf.slow = 0; Perf.avg = 33; resize(); }
    return true;
  }

  function waterColor(t, x, y, ld) {
    const z = OP.zoneAt(x + 0.5, y + 0.5);
    let c;
    if (t === T.CLOUDSEA) c = [226, 234, 246];
    else if (t === T.DEEP) c = [16, 34, 78];
    else if (t === T.CALM) c = [84, 134, 152];
    else if (z === 'paradise' || z === 'newworld') c = [26, 96, 156];
    else c = [28, 76, 142];
    if (t !== T.DEEP && t !== T.CLOUDSEA) {
      const k = ld <= 1 ? 0.42 : ld === 2 ? 0.28 : ld === 3 ? 0.17 : ld <= 5 ? 0.07 : 0;
      c = [c[0] + (120 - c[0]) * k, c[1] + (200 - c[1]) * k, c[2] + (230 - c[2]) * k];
    }
    if (z === 'newworld' && t === T.SEA) c = [c[0] * 0.92, c[1] * 0.95, c[2] * 1.0];
    return c;
  }

  function tileColor(i) {
    const t = M.t[i];
    const x = i % M.W, y = (i / M.W) | 0;
    if (t < 10) return waterColor(t, x, y, M.landDist[i]);
    if (t === T.TOWN && M.isl[i] >= 0) return ROOF[M.islands[M.isl[i]].biome] || PAL[T.TOWN];
    return PAL[t] || [255, 0, 255];
  }

  // ---------- Construir los dibujos del terreno ----------
  function buildTerrain() {
    M = OP.M;
    const W = M.W, H = M.H;
    base = document.createElement('canvas');
    base.width = W; base.height = H;
    const bctx = base.getContext('2d');
    const bimg = bctx.createImageData(W, H);
    const b32 = new Uint32Array(bimg.data.buffer);
    detail = document.createElement('canvas');
    detail.width = W * TS; detail.height = H * TS;
    const dctx = detail.getContext('2d');
    const dimg = dctx.createImageData(W * TS, H * TS);
    const d32 = new Uint32Array(dimg.data.buffer);
    const DW = W * TS;
    const pack = (r, g, b) => (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
    const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const t = M.t[i];
        const c = tileColor(i);
        const h = OP.hash2(x, y, 77);
        const v = (h - 0.5) * (t < 10 ? 6 : 14);
        b32[i] = pack(cl(c[0] + v), cl(c[1] + v), cl(c[2] + v));
        // detalle 4x4
        const px = (ox, oy, col) => { d32[(y * TS + oy) * DW + x * TS + ox] = col; };
        const fill = (col) => { for (let oy = 0; oy < TS; oy++) for (let ox = 0; ox < TS; ox++) px(ox, oy, col); };
        const sh = (k) => pack(cl(c[0] * k), cl(c[1] * k), cl(c[2] * k));
        const tint = (k) => pack(cl(c[0] + (255 - c[0]) * k), cl(c[1] + (255 - c[1]) * k), cl(c[2] + (255 - c[2]) * k));
        const baseCol = pack(cl(c[0] + v * 0.5), cl(c[1] + v * 0.5), cl(c[2] + v * 0.5));
        fill(baseCol);
        detailTile(t, x, y, i, h, px, fill, sh, tint, pack, c, baseCol);
        // sombra en la costa de abajo
        if (t >= 10 && t < 60 && y < H - 1 && M.t[i + W] < 10) {
          for (let ox = 0; ox < TS; ox++) px(ox, TS - 1, sh(0.72));
        }
      }
    }
    // costas suavizadas: las esquinas de tierra que dan al mar se recortan en diagonal y las esquinas interiores
    // del agua se rellenan con la tierra de al lado (así la costa no se ve como una escalera de cuadrados)
    {
      const isL = (x, y) => x >= 0 && y >= 0 && x < W && y < H && M.t[y * W + x] >= 10;
      const colOf = (x, y) => { const c = tileColor(y * W + x); return pack(cl(c[0]), cl(c[1]), cl(c[2])); };
      const set = (x, y, ox, oy, col) => { d32[(y * TS + oy) * DW + x * TS + ox] = col; };
      // [dx, dy, píxeles de la esquina]
      const CORNERS = [[-1, -1, [[0, 0], [1, 0], [0, 1]]], [1, -1, [[3, 0], [2, 0], [3, 1]]], [-1, 1, [[0, 3], [1, 3], [0, 2]]], [1, 1, [[3, 3], [2, 3], [3, 2]]]];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const land = isL(x, y);
        for (const [dx, dy, pts] of CORNERS) {
          const sx = isL(x + dx, y), sy = isL(x, y + dy), dg = isL(x + dx, y + dy);
          if (land && !sx && !sy && !dg) { const col = colOf(x, y + dy); for (const [ox, oy] of pts) set(x, y, ox, oy, col); }          // esquina de tierra que sobresale
          else if (!land && sx && sy) { const col = colOf(x + dx, y); for (const [ox, oy] of pts) set(x, y, ox, oy, col); }           // esquina interior del agua
        }
      }
    }
    bctx.putImageData(bimg, 0, 0);
    dctx.putImageData(dimg, 0, 0);
    // mini mapa
    miniBase = document.createElement('canvas');
    miniBase.width = W; miniBase.height = H;
    miniBase.getContext('2d').drawImage(base, 0, 0);
    // construcciones y decorado (se generan una vez a partir del mapa)
    if (OP.Decor) { try { OP.Decor.build(); } catch (e) { console.warn('Decorado no disponible:', e); } }
  }

  function detailTile(t, x, y, i, h, px, fill, sh, tint, pack, c, baseCol) {
    const W = M.W;
    const h2 = OP.hash2(x, y, 191);
    const tree = (canopy, dark, light, trunk) => {
      px(1, 0, light); px(2, 0, canopy);
      px(0, 1, canopy); px(1, 1, light); px(2, 1, canopy); px(3, 1, dark);
      px(0, 2, dark); px(1, 2, canopy); px(2, 2, dark); px(3, 2, dark);
      px(1, 3, trunk); px(2, 3, sh(0.8));
    };
    switch (t) {
      case T.SEA: case T.CALM: {
        if (t === T.SEA && h < 0.07) { px(1, 1, tint(0.25)); px(2, 1, tint(0.25)); }
        if (t === T.CALM && h < 0.03) { px(1, 2, tint(0.15)); }
        // espuma en la orilla
        if (M.landDist[i] === 1) {
          const foam = tint(0.55);
          if (M.t[i - 1] >= 10 && M.t[i - 1] < 60) { px(0, 1, foam); px(0, 2, foam); }
          if (M.t[i + 1] >= 10 && M.t[i + 1] < 60) { px(3, 1, foam); px(3, 2, foam); }
          if (M.t[i - W] >= 10 && M.t[i - W] < 60) { px(1, 0, foam); px(2, 0, foam); }
          if (M.t[i + W] >= 10 && M.t[i + W] < 60) { px(1, 3, foam); px(2, 3, foam); }
        }
        break;
      }
      case T.CLOUDSEA: if (h < 0.3) { px(1, 1, pack(255, 255, 255)); px(2, 1, pack(255, 255, 255)); px(1, 2, pack(210, 220, 236)); } break;
      case T.DEEP: if (h < 0.06) px(2, 2, pack(70, 110, 170)); break;
      case T.FOREST: tree(sh(0.95), sh(0.7), tint(0.2), pack(90, 60, 30)); break;
      case T.JUNGLE: tree(sh(1), sh(0.65), tint(0.15), pack(70, 50, 25)); if (h < 0.3) px(3, 3, sh(0.6)); break;
      case T.PINE: { const g = pack(40, 96, 72), gd = pack(26, 66, 50); px(1, 0, g); px(2, 0, g); px(0, 1, g); px(1, 1, pack(70, 130, 100)); px(2, 1, g); px(3, 1, gd); px(0, 2, gd); px(1, 2, g); px(2, 2, gd); px(3, 2, gd); px(1, 3, pack(90, 60, 30)); break; }
      case T.SAKURA: tree(pack(240, 168, 200), pack(208, 120, 160), pack(252, 214, 230), pack(90, 60, 40)); break;
      case T.MANGROVE: tree(pack(70, 140, 70), pack(44, 96, 50), pack(110, 180, 90), pack(120, 90, 60)); if (h < 0.2) px(3, 0, pack(200, 240, 255)); break;
      case T.DEADTREE: px(1, 0, pack(60, 50, 50)); px(2, 1, pack(60, 50, 50)); px(1, 1, pack(60, 50, 50)); px(1, 2, pack(70, 60, 55)); px(1, 3, pack(70, 60, 55)); px(0, 1, pack(60, 50, 50)); break;
      case T.CACTUS: if (h < 0.6) { const g = pack(80, 150, 80); px(1, 0, g); px(1, 1, g); px(1, 2, g); px(1, 3, g); px(0, 1, g); px(2, 2, g); px(3, 1, g); px(3, 2, g); px(2, 0, pack(120, 190, 110)); } break;
      case T.MOUNTAIN: case T.SNOWPEAK: case T.HILL: {
        const peak = t === T.SNOWPEAK ? pack(250, 252, 255) : t === T.HILL ? tint(0.2) : tint(0.25);
        px(1, 0, peak); px(2, 0, peak); px(0, 1, tint(0.1)); px(1, 1, peak); px(2, 1, sh(0.9)); px(3, 1, sh(0.8));
        px(0, 2, sh(0.95)); px(1, 2, sh(0.9)); px(2, 2, sh(0.8)); px(3, 2, sh(0.7));
        px(0, 3, sh(0.85)); px(1, 3, sh(0.8)); px(2, 3, sh(0.72)); px(3, 3, sh(0.65));
        break;
      }
      case T.TOWN: case T.MBASE: {
        const roof = t === T.MBASE ? pack(60, 110, 200) : baseCol;
        const wall = t === T.MBASE ? pack(240, 244, 250) : pack(236, 222, 196);
        const gnd = M.isl[i] >= 0 && M.islands[M.isl[i]].biome === 'desert' ? pack(232, 198, 122) : pack(176, 156, 124);
        px(0, 0, gnd); px(3, 0, gnd);
        px(1, 0, roof); px(2, 0, roof);
        px(0, 1, roof); px(1, 1, roof); px(2, 1, roof); px(3, 1, sh(0.75));
        px(0, 2, wall); px(1, 2, wall); px(2, 2, wall); px(3, 2, sh(0.8) === roof ? wall : pack(200, 186, 160));
        px(0, 3, wall); px(1, 3, pack(90, 60, 40)); px(2, 3, wall); px(3, 3, pack(200, 186, 160));
        if (h < 0.3) px(2, 2, pack(250, 230, 140));
        break;
      }
      case T.CASTLE: {
        const w = tint(0.2), d = sh(0.75);
        px(0, 0, w); px(3, 0, w); px(0, 1, w); px(1, 1, w); px(2, 1, w); px(3, 1, d); px(0, 2, w); px(1, 2, pack(60, 50, 60)); px(2, 2, w); px(3, 2, d); px(0, 3, d); px(1, 3, d); px(2, 3, d); px(3, 3, d);
        if (h < 0.5) { px(1, 0, pack(200, 60, 60)); }
        break;
      }
      case T.PRISON: px(1, 1, pack(255, 220, 120)); px(1, 0, pack(40, 40, 50)); px(2, 0, pack(40, 40, 50)); px(3, 2, pack(40, 40, 50)); break;
      case T.LAB: case T.METAL: px(0, 0, tint(0.3)); px(3, 3, sh(0.8)); if (t === T.LAB) { px(1, 1, pack(120, 220, 255)); px(2, 1, pack(120, 220, 255)); } break;
      case T.WALL: px(0, 0, sh(0.7)); px(2, 0, sh(0.7)); px(0, 3, sh(0.8)); px(1, 3, sh(0.8)); px(2, 3, sh(0.8)); px(3, 3, sh(0.8)); break;
      case T.SAND: case T.DESERT: case T.CREAM: case T.GOLD: if (h < 0.5) px((h * 8) & 3, (h2 * 4) & 3, sh(0.88)); if (h2 < 0.25) px(2, 2, tint(0.25)); break;
      case T.DUNE: px(0, 1, sh(0.85)); px(1, 1, sh(0.85)); px(2, 2, tint(0.15)); px(3, 2, tint(0.15)); break;
      case T.SNOW: case T.ICE: case T.CLOUD: case T.WHITERUIN: if (h < 0.35) px((h * 9) & 3, (h2 * 4) & 3, t === T.ICE ? pack(255, 255, 255) : pack(200, 210, 228)); break;
      case T.LAVA: px((h * 4) & 3, (h2 * 4) & 3, pack(255, 200, 60)); px(((h * 4) + 2) & 3, ((h2 * 4) + 1) & 3, pack(160, 40, 20)); break;
      case T.FLOWER: px(0, 0, pack(250, 214, 50)); px(2, 1, pack(250, 214, 50)); px(1, 3, pack(250, 214, 50)); px(3, 2, pack(240, 120, 40)); break;
      case T.CANDY: px((h * 4) & 3, 1, pack(255, 255, 255)); px(((h2 * 4) & 3), 3, pack(120, 200, 255)); break;
      case T.CHOCO: px(1, 1, sh(0.8)); px(2, 2, tint(0.15)); break;
      case T.CORAL: px(1, 1, tint(0.3)); px(2, 2, sh(0.8)); break;
      case T.BUBBLE: if (h < 0.3) { px(1, 1, pack(255, 255, 255)); } break;
      case T.RUIN: px(0, 0, sh(0.7)); px(1, 0, sh(0.7)); px(3, 2, sh(0.7)); px(2, 3, tint(0.2)); break;
      case T.ASH: if (h < 0.4) px(1, 2, sh(0.7)); break;
      case T.ELEPHANT: px(0, (h * 4) & 3, sh(0.85)); px(2, (h2 * 4) & 3, sh(0.85)); break;
      case T.ROCK: px(1, 1, tint(0.2)); px(2, 2, sh(0.75)); px(3, 1, sh(0.85)); break;
      case T.SWAMP: if (h < 0.4) { px(1, 1, pack(90, 110, 90)); px(2, 1, pack(90, 110, 90)); } break;
      case T.WOOD: px(0, 1, sh(0.8)); px(1, 1, sh(0.8)); px(2, 1, sh(0.8)); px(3, 1, sh(0.8)); px(0, 3, sh(0.8)); px(1, 3, sh(0.8)); px(2, 3, sh(0.8)); px(3, 3, sh(0.8)); break;
      case T.LIGHTHOUSE: px(1, 0, pack(250, 250, 250)); px(2, 0, pack(250, 250, 250)); px(1, 1, pack(220, 50, 50)); px(2, 1, pack(220, 50, 50)); px(1, 2, pack(250, 250, 250)); px(2, 2, pack(250, 250, 250)); px(1, 3, pack(220, 50, 50)); px(2, 3, pack(220, 50, 50)); break;
      case T.RIVER: case T.CANAL: if (h < 0.3) px(1, 1, tint(0.3)); break;
      case T.REDLINE: case T.REDTOP: px((h * 4) & 3, (h2 * 4) & 3, sh(0.78)); if (h < 0.25) px(((h * 7) | 0) & 3, ((h2 * 5) | 0) & 3, tint(0.18)); break;
      case T.RMRIVER: px(0, 0, pack(150, 200, 240)); px(3, 2, pack(150, 200, 240)); break;
      case T.HOLY: px(1, 1, pack(255, 250, 220)); px(2, 2, pack(200, 170, 90)); px(0, 3, pack(200, 170, 90)); break;
      case T.STONE: if (h < 0.3) px(1, 1, sh(0.85)); break;
      default: break;
    }
  }

  // ---------- Cámara ----------
  function init(canvas, minimap) {
    cv = canvas; ctx = cv.getContext('2d');
    mini = minimap; mctx = mini.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    dpr = Math.min(Perf.tier >= 2 ? 1 : Perf.tier === 1 ? 1.5 : 2, window.devicePixelRatio || 1);
    cv.width = Math.round(cv.clientWidth * dpr);
    cv.height = Math.round(cv.clientHeight * dpr);
    clampCam();
  }
  function minZoom() { return Math.min(cv.clientWidth / OP.W, cv.clientHeight / OP.H) * 0.98; }
  function clampCam() {
    if (!cv) return;
    cam.z = OP.clamp(cam.z, minZoom(), 28);
    const hw = cv.clientWidth / 2 / cam.z, hh = cv.clientHeight / 2 / cam.z;
    cam.x = OP.clamp(cam.x, Math.min(hw, OP.W / 2), Math.max(OP.W - hw, OP.W / 2));
    cam.y = OP.clamp(cam.y, Math.min(hh, OP.H / 2), Math.max(OP.H - hh, OP.H / 2));
  }
  function w2s(x, y) { return [(x - cam.x) * cam.z + cv.clientWidth / 2, (y - cam.y) * cam.z + cv.clientHeight / 2]; }
  function s2w(sx, sy) { return [(sx - cv.clientWidth / 2) / cam.z + cam.x, (sy - cv.clientHeight / 2) / cam.z + cam.y]; }
  function zoomAt(sx, sy, factor) {
    const [wx, wy] = s2w(sx, sy);
    cam.z *= factor;
    clampCam();
    const [nx, ny] = s2w(sx, sy);
    cam.x += wx - nx; cam.y += wy - ny;
    clampCam();
  }
  function centerOn(x, y, z) { cam.x = x; cam.y = y; if (z) cam.z = z; clampCam(); }
  function pan(dx, dy) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }

  // posición de un personaje en el mapa
  function agentPos(a) {
    const S = OP.S;
    if (a.loc === 'island') return [a.x, a.y];
    if (a.loc === 'ship') {
      const u = a.carriedBy ? S.U[a.carriedBy] : S.U[a.unit];
      const sh = u && S.SH[u.ship];
      if (sh) return [sh.x, sh.y];
    }
    if (a.loc === 'prison' || a.loc === 'dead') { const I = M.islands[a.isl] || M.islands[a.home]; return [I.x, I.y]; }
    const I = M.islands[a.home];
    return [I.x, I.y];
  }

  // ---------- Dibujar todo ----------
  function draw(now, sel) {
    const S = OP.S;
    if (!S || !base) return;
    const Wc = cv.clientWidth, Hc = cv.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b1c33';
    ctx.fillRect(0, 0, Wc, Hc);
    const z = cam.z;
    const x0 = cam.x - Wc / 2 / z, y0 = cam.y - Hc / 2 / z;
    // terreno
    if (z >= 3) {
      const sx = Math.max(0, x0 * TS), sy = Math.max(0, y0 * TS);
      const sw = Math.min(detail.width - sx, Wc / z * TS + TS), shh = Math.min(detail.height - sy, Hc / z * TS + TS);
      const [dx, dy] = w2s(sx / TS, sy / TS);
      ctx.drawImage(detail, sx, sy, sw, shh, dx, dy, sw / TS * z, shh / TS * z);
    } else {
      const [dx, dy] = w2s(0, 0);
      ctx.drawImage(base, dx, dy, OP.W * z, OP.H * z);
    }
    const t = now / 1000;
    // destellos del mar
    if (z >= 4 && Perf.tier < 2) drawGlints(x0, y0, Wc, Hc, t);
    // construcciones y decorado de las islas (solo visual)
    if (OP.Decor) OP.Decor.draw(ctx, w2s, z, x0, y0, Wc, Hc);
    // niebla de Isla Postrera
    const lt = M.byId.laughtale;
    const [lx, ly] = w2s(lt.x, lt.y), r = (lt.r + 6) * z;
    if (!S.isl[lt.idx].discovered && lx > -r && ly > -r && lx < Wc + r && ly < Hc + r) {
      const gr = ctx.createRadialGradient(lx, ly, r * 0.2, lx, ly, r);
      gr.addColorStop(0, 'rgba(200,210,230,0.92)'); gr.addColorStop(0.7, 'rgba(180,190,215,0.6)'); gr.addColorStop(1, 'rgba(180,190,215,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();
    }
    // ruta del seleccionado
    if (sel) drawRoute(sel);
    // barcos
    for (const sh of S.ships) {
      if (sh.x < x0 - 3 || sh.y < y0 - 3 || sh.x > x0 + Wc / z + 3 || sh.y > y0 + Hc / z + 3) continue;
      drawShip(sh, t, sel);
    }
    // personas en tierra
    for (const a of S.agents) {
      if (a.loc !== 'island' || a.pc) continue;   // los personajes de jugadores los dibuja el gancho del modo online
      if (a.x < x0 - 1 || a.y < y0 - 1 || a.x > x0 + Wc / z + 1 || a.y > y0 + Hc / z + 1) continue;
      drawPerson(a, t, sel);
    }
    // MMO: jugadores reales (se dibujan encima de los NPC)
    if (hooks.world) hooks.world(ctx, w2s, z, t, x0, y0, Wc, Hc);
    // combates
    for (const b of S.battles) {
      const [bx, by] = w2s(b.x, b.y);
      if (bx < -40 || by < -40 || bx > Wc + 40 || by > Hc + 40) continue;
      drawClash(bx, by, t, b);
    }
    // efectos de noticias
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      const age = (now - e.t0) / 1000;
      if (age > 2.5) { effects.splice(i, 1); continue; }
      const [ex, ey] = w2s(e.x, e.y);
      ctx.strokeStyle = 'rgba(255,220,90,' + (1 - age / 2.5) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ex, ey, 8 + age * 40, 0, Math.PI * 2); ctx.stroke();
    }
    // noche
    const hour = (OP.calTime ? OP.calTime(S.time) : S.time) % 24;
    let dark = 0;
    if (hour >= 20 || hour < 5) dark = 0.24;
    else if (hour >= 18) dark = (hour - 18) / 2 * 0.24;
    else if (hour < 7) dark = (7 - hour) / 2 * 0.24;
    if (dark > 0 && OP.UI && OP.UI.settings.night) { ctx.fillStyle = 'rgba(8,16,48,' + dark + ')'; ctx.fillRect(0, 0, Wc, Hc); }
    drawLabels(x0, y0, Wc, Hc);
    if (sel) drawSelection(sel, t);
    // MMO: nombres de jugadores, números de daño...
    if (hooks.overlay) hooks.overlay(ctx, w2s, z, t, x0, y0, Wc, Hc);
  }

  function drawGlints(x0, y0, Wc, Hc, t) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const z = cam.z;
    const cols = Math.ceil(Wc / z / 6) + 2, rows = Math.ceil(Hc / z / 6) + 2;
    const gx0 = Math.floor(x0 / 6), gy0 = Math.floor(y0 / 6);
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const cx = gx0 + gx, cy = gy0 + gy;
      const h = OP.hash2(cx, cy, 5);
      const phase = (t * 0.6 + h * 10) % 6;
      if (phase > 1) continue;
      const wx = cx * 6 + h * 6, wy = cy * 6 + OP.hash2(cx, cy, 9) * 6;
      const ti = Math.floor(wy) * M.W + Math.floor(wx);
      if (M.t[ti] !== T.SEA || M.landDist[ti] < 2) continue;
      const [sx, sy] = w2s(wx, wy);
      const len = Math.max(2, z * 0.6) * (1 - Math.abs(phase - 0.5) * 2);
      ctx.fillRect(sx, sy, len, Math.max(1, z / 8));
    }
  }

  function drawShip(sh, t, sel) {
    const z = cam.z;
    const [sx, sy] = w2s(sh.x, sh.y);
    const u = OP.S.U[sh.unit];
    const isSel = sel && sel.loc === 'ship' && ((sel.unit === sh.unit) || sel.carriedBy === sh.unit);
    const sub = sh.gate === 'dive' || sh.gate === 'tunnel' || OP.M.t[Math.floor(sh.y) * M.W + Math.floor(sh.x)] === T.DEEP;
    ctx.save();
    if (sub) ctx.globalAlpha = sh.gate === 'tunnel' ? 0.25 : 0.55;
    if (z < 3) {
      ctx.fillStyle = sh.faction === 'marine' ? '#e8eef6' : (u && u.flag ? u.flag.bg : '#222');
      ctx.fillRect(sx - 1.5, sy - 2.5, 3, 2.5);
      ctx.fillStyle = sh.faction === 'marine' ? '#2f6fd6' : '#8a5a2b';
      ctx.fillRect(sx - 2, sy, 4, 1.5);
    } else {
      const img = OP.Sprites.ship(sh.type, sh.faction, u && u.flag);
      const s = Math.max(1, Math.round(z / 5));
      const w = img.width * s, h = img.height * s;
      const bob = sh.state === 'sailing' ? Math.round(Math.sin(t * 3 + sh.id) * s * 0.5) : 0;
      // estela
      if (sh.state === 'sailing' && !sh.gate) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let k = 1; k <= 3; k++) ctx.fillRect(sx - sh.dir * (w / 2 + k * s * 2), sy + h / 2 - s * 2 + ((k + Math.floor(t * 4)) % 2) * s, s * 2, s);
      }
      ctx.translate(Math.round(sx), Math.round(sy + bob));
      if (sh.dir < 0) ctx.scale(-1, 1);
      ctx.drawImage(img, -Math.round(w / 2), -Math.round(h * 0.8), w, h);
      if (sh.state === 'battle') {
        ctx.fillStyle = 'rgba(80,80,80,0.6)';
        ctx.beginPath(); ctx.arc(w * 0.3, -h, s * (2 + Math.sin(t * 5) * 1.5), 0, Math.PI * 2); ctx.fill();
      }
      if (sub) { ctx.strokeStyle = 'rgba(180,240,255,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -h * 0.3, w * 0.7, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.restore();
    if (isSel) {
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy - 2, Math.max(8, z * 1.6), 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawPerson(a, t, sel) {
    const z = cam.z;
    let [sx, sy] = w2s(a.x, a.y);
    if (a.battle) { sx += Math.sin(t * 25 + a.id) * Math.max(1, z * 0.12); }
    if (z < 3.5) {
      ctx.fillStyle = a.isPlayer ? '#ffd23f' : a.faction === 'marine' ? '#dfe9ff' : '#ff5a4a';
      const s = z < 2 ? 1.5 : 2;
      ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      return;
    }
    // personaje estilo Esmeralda: dirección según hacia dónde camina, dos pasos al andar y golpe al atacar
    const walking = (a.walking || a.tx != null) && !a.battle && !a.ko;
    const swing = a.swingUntil && performance.now() < a.swingUntil;
    const img = OP.Sprites.chibi(a.app, a.faction, a.rank, swing ? (a.swingDir || 'right') : (a.face || 'down'), walking ? 1 + (Math.floor(t * 6 + a.id) % 2) : 0, swing);
    const s = Math.max(1, Math.round(z / 14));
    const w = img.width * s, h = img.height * s;
    const bob = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.32, Math.max(1.5, s * 2), 0, 0, Math.PI * 2); ctx.fill();
    if (a.isPlayer) {
      ctx.fillStyle = 'rgba(255,210,63,0.45)';
      ctx.fillRect(Math.round(sx - w / 2 - s), Math.round(sy - h - s - bob), w + s * 2, h + s * 2);
    }
    // MMO: los NPC (IA) se distinguen de los jugadores: sombra, sin nombre y un rombo gris encima
    if (a.npc) {
      if (a.engaged) { ctx.fillStyle = 'rgba(230,60,50,0.55)'; ctx.fillRect(Math.round(sx - w / 2 - s), Math.round(sy - h - s - bob), w + s * 2, h + s * 2); }
      if (a.ko) ctx.globalAlpha = 0.45;
    }
    ctx.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h + s * 2 - bob), w, h);
    ctx.globalAlpha = 1;
    if (a.npc && z >= 8) {
      const my = Math.round(sy - h - bob - s * 1.2), ds = Math.max(2, s * 2);
      ctx.fillStyle = a.ko ? '#777' : a.faction === 'marine' ? 'rgba(170,200,235,0.85)' : 'rgba(230,170,150,0.85)';
      ctx.beginPath(); ctx.moveTo(sx, my - ds); ctx.lineTo(sx + ds, my); ctx.lineTo(sx, my + ds); ctx.lineTo(sx - ds, my); ctx.closePath(); ctx.fill();
      if (a.ko) { ctx.font = '600 ' + Math.max(9, Math.round(s * 2.4)) + 'px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ddd'; ctx.fillText('KO', sx, my - ds * 2); }
    }
    if ((a.hp < a.maxHp * 0.35 || a.engaged) && z >= 6) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - w / 2, sy - h - 2, w, 3); ctx.fillStyle = '#e74c3c'; ctx.fillRect(sx - w / 2, sy - h - 2, w * a.hp / a.maxHp, 3); }
  }

  function drawClash(x, y, t, b) {
    const n = b.sides[0].f.length + b.sides[1].f.length;
    const r = Math.max(6, Math.min(26, cam.z * 0.8 + n));
    const k = (Math.sin(t * 12) + 1) / 2;
    ctx.save();
    ctx.translate(x, y - r * 0.5);
    ctx.fillStyle = 'rgba(255,' + (160 + k * 80 | 0) + ',40,0.9)';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + t * 2;
      const rr = i % 2 ? r * 0.45 : r * (0.8 + k * 0.3);
      ctx.fillRect(Math.cos(a) * rr - 1.5, Math.sin(a) * rr - 1.5, 3, 3);
    }
    ctx.font = 'bold ' + Math.round(r * 0.9) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚔', 0, 0);
    ctx.restore();
  }

  function routePoints(sh) {
    const r = sh.route;
    const pts = [[sh.x, sh.y, false]];
    if (!r) return pts;
    for (let li = r.li; li < r.legs.length; li++) {
      const L = r.legs[li];
      const start = li === r.li ? r.pi + 1 : 1;
      for (let k = start; k < L.pts.length; k++) pts.push([L.pts[k][0], L.pts[k][1], L.type === 'gate']);
    }
    return pts;
  }
  function drawRoute(a) {
    const S = OP.S;
    let u = a.carriedBy ? S.U[a.carriedBy] : S.U[a.unit];
    if (!u) return;
    const sh = S.SH[u.ship];
    if (!sh || !sh.route) return;
    const pts = routePoints(sh);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = w2s(pts[i - 1][0], pts[i - 1][1]);
      const [bx, by] = w2s(pts[i][0], pts[i][1]);
      if (pts[i][2] && Math.abs(pts[i][0] - pts[i - 1][0]) > 100) continue; // el túnel bajo la Muralla Carmesí no se dibuja
      ctx.strokeStyle = pts[i][2] ? 'rgba(255,214,90,0.95)' : 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.setLineDash([]);
    const d = M.islands[sh.route.dest];
    if (d) {
      const [dx, dy] = w2s(d.dockX, d.dockY);
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.moveTo(dx, dy - 10); ctx.lineTo(dx + 6, dy - 2); ctx.lineTo(dx - 6, dy - 2); ctx.closePath(); ctx.fill();
    }
  }

  function drawSelection(a, t) {
    const [x, y] = agentPos(a);
    const [sx, sy] = w2s(x, y);
    const r = Math.max(10, cam.z * 1.2) + Math.sin(t * 5) * 2;
    ctx.strokeStyle = a.isPlayer ? '#ffd23f' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy - (a.loc === 'island' ? cam.z * 0.5 : 2), r, 0, Math.PI * 2); ctx.stroke();
  }

  function label(text, x, y, size, color, alpha, align) {
    ctx.font = '600 ' + size + 'px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineWidth = Math.max(3, size / 4);
    ctx.strokeStyle = 'rgba(10,15,30,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  function drawLabels(x0, y0, Wc, Hc) {
    const z = cam.z;
    const S = OP.S;
    // nombres de los mares
    if (z < 5) {
      const a = OP.clamp((5 - z) / 2.5, 0.25, 0.85);
      for (const k in OP.SEAS) {
        const s = OP.SEAS[k];
        if (!s.label) continue;
        const [sx, sy] = w2s(s.label[0], s.label[1]);
        label(s.name.toUpperCase(), sx, sy, Math.round(Math.max(16, z * 9)), k === 'paradise' || k === 'newworld' ? '#ffe9a8' : '#bfe0ff', a);
      }
      const [gx, gy] = w2s(OP.CX + 190, OP.CY - 25);
      label('RUTA MAYOR →', gx, gy, Math.round(Math.max(12, z * 6)), '#ffd88a', a * 0.8);
      const [gx2, gy2] = w2s(OP.CX - 190, OP.CY - 25);
      label('RUTA MAYOR (2ª mitad) →', gx2, gy2, Math.round(Math.max(12, z * 6)), '#ffd88a', a * 0.8);
      const [cx1, cy1] = w2s(60, OP.calmTop(60) + 7);
      label('CINTURÓN QUIETO', cx1, cy1, Math.round(Math.max(10, z * 4)), '#d6eef5', a * 0.7);
      const [cx2, cy2] = w2s(300, OP.calmBot(300) - 7);
      label('CINTURÓN QUIETO', cx2, cy2, Math.round(Math.max(10, z * 4)), '#d6eef5', a * 0.7);
      const [rx, ry] = w2s(OP.CX, 80);
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(-Math.PI / 2);
      label('MURALLA CARMESÍ', 0, 0, Math.round(Math.max(10, z * 5)), '#ffb4a0', a * 0.8);
      ctx.restore();
    }
    // islas
    if (z >= 1.6) {
      const size = z >= 8 ? 14 : z >= 4 ? 12 : 10;
      for (const I of M.islands) {
        if (I.x < x0 - 20 || I.x > x0 + Wc / z + 20 || I.y < y0 - 20 || I.y > y0 + Hc / z + 20) continue;
        const hidden = I.hidden && !S.isl[I.idx].discovered;
        const [sx, sy] = w2s(I.x, I.y - I.r * (I.ey || 1) - 1.5);
        const base = I.base ? '⚓ ' : '';
        let col = '#ffffff';
        if (I.base) col = '#cfe3ff';
        if (I.hidden) col = '#ffd23f';
        if (z < 2.6 && !I.base && I.danger < 3 && I.pop < 3000 && OP.SEAS[I.sea].kind === 'blue') continue;
        label(hidden ? 'Isla Postrera ???' : base + I.name, sx, sy, size, col, 1);
        if (z >= 9) {
          for (const tp of I.townPos) {
            const [tx, ty] = w2s(tp.x, tp.y + 1.2);
            label(tp.name, tx, ty, 10, '#ffeccc', 0.9);
          }
        }
      }
      for (const L of OP.LANDMARKS) {
        if (z < 2.2 && L.id === 'redline_w') continue;
        const [sx, sy] = w2s(L.x, L.y - 8);
        label(L.name, sx, sy, size, '#ffb4a0', 0.95);
      }
    }
  }

  // ---------- Minimapa ----------
  function drawMini(sel) {
    if (!miniBase || !mctx) return;
    const w = mini.width, h = mini.height;
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(miniBase, 0, 0, w, h);
    const sx = w / OP.W, sy = h / OP.H;
    const S = OP.S;
    // barcos en combate y jugador
    for (const b of S.battles) { mctx.fillStyle = '#ffb000'; mctx.fillRect(b.x * sx - 1, b.y * sy - 1, 3, 3); }
    const p = S.A[S.playerId];
    if (p && p.loc !== 'dead') { const [px, py] = agentPos(p); mctx.fillStyle = '#ffd23f'; mctx.fillRect(px * sx - 2, py * sy - 2, 4, 4); }
    if (hooks.mini) hooks.mini(mctx, sx, sy);
    if (sel) { const [px, py] = agentPos(sel); mctx.strokeStyle = '#fff'; mctx.strokeRect(px * sx - 3, py * sy - 3, 6, 6); }
    const Wc = cv.clientWidth, Hc = cv.clientHeight;
    mctx.strokeStyle = '#ffffff';
    mctx.lineWidth = 1;
    mctx.strokeRect((cam.x - Wc / 2 / cam.z) * sx, (cam.y - Hc / 2 / cam.z) * sy, Wc / cam.z * sx, Hc / cam.z * sy);
  }

  // ---------- Elegir con el ratón ----------
  function pick(sx, sy) {
    const S = OP.S;
    const [wx, wy] = s2w(sx, sy);
    const z = cam.z;
    if (hooks.pick) { const hp = hooks.pick(sx, sy, wx, wy); if (hp) return hp; }
    let best = null, bd = Math.max(10, z * 0.9);
    for (const a of S.agents) {
      if (a.loc !== 'island') continue;
      const [ax, ay] = w2s(a.x, a.y - 0.5);
      const d = Math.hypot(ax - sx, ay - sy);
      if (d < bd) { bd = d; best = { type: 'agent', obj: a }; }
    }
    if (best) return best;
    bd = Math.max(12, z * 1.8);
    for (const sh of S.ships) {
      const [ax, ay] = w2s(sh.x, sh.y - 0.6);
      const d = Math.hypot(ax - sx, ay - sy);
      if (d < bd) { bd = d; best = { type: 'ship', obj: sh }; }
    }
    if (best) return best;
    const ti = Math.floor(wy) * M.W + Math.floor(wx);
    if (ti >= 0 && ti < M.N && M.isl[ti] >= 0) return { type: 'island', obj: M.islands[M.isl[ti]] };
    let bi = null; bd = Infinity;
    for (const I of M.islands) {
      const d = Math.hypot(I.x - wx, I.y - wy);
      if (d < I.r + 4 && d < bd) { bd = d; bi = I; }
    }
    if (bi) return { type: 'island', obj: bi };
    for (const L of OP.LANDMARKS) if (Math.hypot(L.x - wx, L.y - wy) < 10) return { type: 'landmark', obj: L };
    return null;
  }

  function ping(x, y) { effects.push({ x, y, t0: performance.now() }); }

  // Ganchos del modo MMO (jugadores reales, minimapa, selección)
  const hooks = {};
  OP.Render = { init, buildTerrain, shouldDraw, draw, drawMini, cam, zoomAt, centerOn, pan, s2w, w2s, pick, ping, agentPos, resize, minZoom, clampCam, hooks };
})();
