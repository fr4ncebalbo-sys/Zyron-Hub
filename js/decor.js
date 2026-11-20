/* MILESDEPIRATAS - decorado y construcciones de las islas (solo visual, en el cliente).
   Estilo Pokémon Esmeralda: 16 píxeles de sprite por casilla, contorno oscuro y tejados de colores.
   No toca el mapa ni la simulación: se genera a partir del mapa ya construido y se dibuja solo lo que se ve. */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const T = OP.T;
  const cache = new Map();
  const shade = (hex, f) => OP.shade(hex, f);

  // ---------- Pintor de sprites con contorno automático ----------
  let PAD = 0;   // margen superior (los edificios emblemáticos tienen banderas y torres que sobresalen)
  function painter(w, h) {
    const c = document.createElement('canvas');
    const pad = PAD;
    c.width = w + 2; c.height = h + 2 + pad;
    const g = c.getContext('2d');
    const P = {
      c, g, w, h,
      px(x, y, ww, hh, col) { if (ww > 0 && hh > 0) { g.fillStyle = col; g.fillRect(Math.round(x) + 1, Math.round(y) + 1 + pad, Math.round(ww), Math.round(hh)); } },
      done(outline) {
        if (outline === false) return c;
        const img = g.getImageData(0, 0, c.width, c.height), d = img.data, CW = c.width, CH = c.height;
        const solid = (x, y) => x >= 0 && y >= 0 && x < CW && y < CH && d[(y * CW + x) * 4 + 3] > 0;
        const out = [];
        for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) out.push(x, y);
        for (let k = 0; k < out.length; k += 2) { const i = (out[k + 1] * CW + out[k]) * 4; d[i] = 26; d[i + 1] = 18; d[i + 2] = 32; d[i + 3] = 255; }
        g.putImageData(img, 0, 0);
        return c;
      }
    };
    return P;
  }

  // ---------- Piezas reutilizables ----------
  // Casa Esmeralda: tejado arriba, paredes crema, puerta y ventanas
  function house(P, x, y, w, h, roof, wall, o) {
    o = o || {};
    const rh = Math.round(h * 0.48);
    P.px(x, y + 2, w, rh - 2, roof); P.px(x + 1, y, w - 2, 2, roof); P.px(x, y + rh - 2, w, 2, shade(roof, -0.25));
    for (let k = 3; k < w - 2; k += 4) P.px(x + k, y + 2, 1, rh - 4, shade(roof, -0.12));
    P.px(x + 1, y + 1, Math.round(w * 0.4), 1, shade(roof, 0.25));
    P.px(x + 1, y + rh, w - 2, h - rh, wall); P.px(x + w - 2, y + rh, 1, h - rh, shade(wall, -0.18));
    const dw = Math.max(3, Math.round(w / 6));
    P.px(x + Math.round(w / 2 - dw / 2), y + h - 6, dw, 6, o.door || '#7a4a26');
    if (w >= 14) { P.px(x + 3, y + rh + 3, 3, 3, '#7fc4f0'); P.px(x + w - 6, y + rh + 3, 3, 3, '#7fc4f0'); }
    if (o.chimney) P.px(x + w - 5, y - 3, 3, 4, '#8a6a5a');
    if (o.sign) P.px(x + 2, y + h - 5, 4, 3, o.sign);
  }
  function tower(P, x, y, w, h, wall, roof, o) {
    o = o || {};
    P.px(x, y + 4, w, h - 4, wall); P.px(x + w - 2, y + 4, 2, h - 4, shade(wall, -0.2));
    P.px(x - 1, y + 2, w + 2, 3, roof); P.px(x + 1, y, w - 2, 2, roof);
    for (let k = y + 8; k < y + h - 4; k += 6) P.px(x + Math.round(w / 2) - 1, k, 2, 3, o.win || '#1f2a3a');
  }
  function flag(P, x, y, col, pole) {
    P.px(x, y, 1, 9, pole || '#5a3a20'); P.px(x + 1, y, 5, 3, col); P.px(x + 1, y + 3, 3, 1, shade(col, -0.2));
  }
  function roundTree(P, x, y, size, canopy, trunk) {
    const r = size;
    P.px(x + r - 1, y + r * 2 - 2, 3, Math.max(3, Math.round(r * 0.7)), trunk || '#6a4424');
    P.px(x + 1, y + 2, r * 2 - 2, r * 2 - 4, canopy); P.px(x, y + 4, r * 2, r * 2 - 8, canopy); P.px(x + 3, y, r * 2 - 6, 2, canopy);
    P.px(x + 3, y + 2, Math.round(r * 0.8), 2, shade(canopy, 0.25)); P.px(x + 2, y + r * 2 - 4, r * 2 - 4, 2, shade(canopy, -0.25));
    P.px(x + r + 1, y + r, 2, 2, shade(canopy, -0.18));
  }
  function wallLine(P, x, y, w, h, col) {
    P.px(x, y, w, h, col); P.px(x, y + h - 1, w, 1, shade(col, -0.3));
    for (let k = x; k < x + w; k += 4) P.px(k, y - 1, 2, 1, col);
  }

  // ---------- Sprites genéricos ----------
  const ROOF = { tropical: '#d9692f', forest: '#b4472c', winter: '#7a3a4a', desert: '#d8a25a', city: '#c4452c', canals: '#e07a3a', mangrove: '#e07aa8',
    sakura: '#4a3a5a', candy: '#ff7ab4', toy: '#f05a7a', cactus: '#c27a3a', wasteland: '#6e5a48', jungle: '#b47a3a', bubble: '#ff9ac8', ruins: '#5a4a3a',
    whiteruins: '#d8d8d8', mountain: '#a64a2c', future: '#4a8ad8', giants: '#8a5a2a', elephant: '#9a6a3a', wood: '#a4382c', ghost: '#4a3a6a', volcanic: '#5a5a66', rocky: '#c24a2c' };
  function sHouse(roof, variant) {
    return get('house' + roof + variant, () => { const P = painter(26, 24); house(P, 1, 1, 24, 22, roof, variant ? '#f4e2c4' : '#f0dcc0', { chimney: variant === 1, sign: variant === 2 ? '#3fa65a' : null }); return P.done(); });
  }
  function sTree(kind) {
    return get('tree' + kind, () => {
      const P = painter(18, 22);
      if (kind === 'palm') {
        P.px(8, 8, 2, 14, '#8a6a3a'); P.px(9, 8, 1, 14, '#6a4a24');
        P.px(2, 4, 14, 3, '#3fa65a'); P.px(0, 6, 5, 2, '#3fa65a'); P.px(13, 6, 5, 2, '#3fa65a'); P.px(5, 2, 8, 2, '#5fc06a'); P.px(7, 7, 4, 2, '#7a5a2a');
      } else if (kind === 'pine') {
        P.px(8, 17, 2, 5, '#5a3a20'); P.px(6, 1, 6, 4, '#2f6a4a'); P.px(4, 5, 10, 5, '#2a5e42'); P.px(2, 10, 14, 7, '#245238'); P.px(4, 11, 4, 2, '#3f8a5e');
        P.px(6, 1, 4, 1, '#e8f0f6'); P.px(3, 10, 4, 1, '#e8f0f6');
      } else if (kind === 'sakura') roundTree(P, 1, 0, 8, '#f2a8c8', '#5a3a2a');
      else if (kind === 'orange') { roundTree(P, 1, 0, 8, '#3f9a4a'); P.px(4, 4, 2, 2, '#ff9a2a'); P.px(10, 6, 2, 2, '#ff9a2a'); P.px(7, 10, 2, 2, '#ff9a2a'); }
      else if (kind === 'dead') { P.px(8, 6, 2, 16, '#4a3a30'); P.px(4, 6, 4, 1, '#4a3a30'); P.px(10, 3, 1, 5, '#4a3a30'); P.px(11, 3, 4, 1, '#4a3a30'); P.px(3, 4, 1, 3, '#4a3a30'); }
      else if (kind === 'mangrove') { roundTree(P, 1, 0, 8, '#4f9a4a'); P.px(4, 18, 1, 4, '#7a5a3a'); P.px(13, 18, 1, 4, '#7a5a3a'); }
      else if (kind === 'jungle') roundTree(P, 1, 0, 8, '#2a7a3a', '#4a3020');
      else roundTree(P, 1, 0, 8, '#3f9a4a');
      return P.done();
    });
  }
  function sSmall(kind) {
    return get('sm' + kind, () => {
      const P = painter(10, 10);
      if (kind === 'rock') { P.px(1, 4, 8, 5, '#8a8a92'); P.px(2, 3, 5, 2, '#9a9aa4'); P.px(2, 4, 3, 1, '#b8b8c2'); P.px(6, 7, 3, 2, '#6a6a72'); }
      else if (kind === 'flower') { P.px(4, 5, 1, 4, '#3f8a4a'); P.px(3, 3, 3, 3, '#ff6a8a'); P.px(4, 4, 1, 1, '#ffe066'); return P.done(false); }
      else if (kind === 'cactus') { P.px(4, 1, 2, 9, '#3f9a4a'); P.px(1, 3, 2, 4, '#3f9a4a'); P.px(7, 2, 2, 4, '#3f9a4a'); P.px(2, 6, 2, 1, '#3f9a4a'); P.px(6, 5, 1, 1, '#3f9a4a'); P.px(4, 1, 1, 8, '#5fba6a'); }
      else if (kind === 'barrel') { P.px(2, 2, 6, 7, '#9a6a3a'); P.px(2, 3, 6, 1, '#5a3a20'); P.px(2, 7, 6, 1, '#5a3a20'); P.px(3, 2, 1, 7, '#b4844a'); }
      else if (kind === 'lamp') { P.px(4, 2, 1, 8, '#3a3a40'); P.px(3, 0, 3, 3, '#ffe27a'); }
      else if (kind === 'crystal') { P.px(4, 0, 2, 9, '#c07aff'); P.px(2, 3, 2, 5, '#9a5ae0'); P.px(6, 4, 2, 4, '#e0b0ff'); }
      else if (kind === 'mushroom') { P.px(4, 5, 2, 4, '#f4e2c4'); P.px(1, 2, 8, 4, '#e04a4a'); P.px(3, 3, 1, 1, '#fff'); P.px(6, 2, 1, 1, '#fff'); }
      else if (kind === 'turtle') { P.px(1, 3, 7, 5, '#3f7a4a'); P.px(2, 4, 2, 2, '#5fa06a'); P.px(5, 5, 2, 2, '#5fa06a'); P.px(8, 4, 2, 2, '#8ac07a'); }
      else if (kind === 'bubble') { P.px(2, 1, 6, 8, 'rgba(180,230,255,0.55)'); P.px(1, 2, 8, 6, 'rgba(180,230,255,0.55)'); P.px(3, 2, 2, 2, '#ffffff'); return P.done(false); }
      return P.done();
    });
  }
  function sPier(len, horiz) {
    return get('pier' + len + horiz, () => {
      const w = horiz ? len : 10, h = horiz ? 10 : len;
      const P = painter(w, h);
      P.px(0, 0, w, h, '#a8783e');
      if (horiz) for (let k = 0; k < w; k += 3) P.px(k, 0, 1, h, '#7a5428'); else for (let k = 0; k < h; k += 3) P.px(0, k, w, 1, '#7a5428');
      return P.done();
    });
  }
  function get(key, fn) { let c = cache.get(key); if (!c) { c = fn(); cache.set(key, c); } return c; }

  // ---------- Edificios emblemáticos (Tesoro Supremo) ----------
  const LANDMARKS = {
    arlongpark: () => { const P = painter(72, 50);
      wallLine(P, 0, 30, 72, 18, '#5a6a7a');                                  // muralla de piedra
      tower(P, 4, 10, 14, 28, '#6a7a8a', '#2a8a8a'); tower(P, 54, 10, 14, 28, '#6a7a8a', '#2a8a8a');
      P.px(20, 14, 32, 22, '#7a8a9a'); P.px(18, 8, 36, 7, '#2a9a9a'); P.px(22, 4, 28, 5, '#3ab0b0'); P.px(30, 0, 12, 5, '#2a9a9a');   // edificio central y tejados verdes
      P.px(30, 20, 12, 10, '#e8e8e8'); P.px(32, 22, 2, 2, '#1a1a1a'); P.px(38, 22, 2, 2, '#1a1a1a'); P.px(31, 26, 10, 2, '#1a1a1a'); for (let k = 32; k < 41; k += 2) P.px(k, 26, 1, 1, '#ffffff');  // cara de tiburón
      P.px(30, 38, 12, 10, '#3a2a1a'); flag(P, 35, -8, '#2a9a9a');
      return P.done(); },
    baratie: () => { const P = painter(64, 34);
      P.px(4, 18, 56, 12, '#e8e2d0'); P.px(0, 22, 8, 6, '#e8e2d0'); P.px(56, 20, 8, 8, '#3a8ad8'); P.px(58, 22, 4, 2, '#ffffff');   // casco con forma de pez
      P.px(4, 28, 56, 2, '#a83a2a'); house(P, 14, 2, 34, 18, '#c4452c', '#f4e8d0', { sign: '#ffe066' });
      P.px(26, 0, 10, 3, '#7a2a1a'); return P.done(); },
    scaffold: () => { const P = painter(36, 38);
      P.px(4, 18, 28, 4, '#8a5a2a'); for (const x of [5, 15, 25]) P.px(x, 22, 3, 16, '#6a4424');
      P.px(16, 2, 3, 17, '#5a3a20'); P.px(16, 2, 12, 2, '#5a3a20'); P.px(26, 4, 1, 6, '#c8b88a'); P.px(0, 32, 36, 6, '#9a9a9a'); return P.done(); },
    windmill: () => { const P = painter(30, 40);
      tower(P, 9, 14, 12, 26, '#f0dcc0', '#c4452c'); P.px(14, 12, 2, 2, '#5a3a20');
      P.px(2, 5, 12, 3, '#d8c8a8'); P.px(16, 18, 12, 3, '#d8c8a8'); P.px(13, 0, 3, 12, '#d8c8a8'); P.px(14, 14, 3, 12, '#d8c8a8'); return P.done(); },
    dojo: () => { const P = painter(52, 34);
      P.px(4, 14, 44, 18, '#f0e6d0'); for (let k = 8; k < 46; k += 8) P.px(k, 16, 1, 16, '#8a6a4a');
      P.px(0, 8, 52, 7, '#3a3a4a'); P.px(4, 4, 44, 5, '#4a4a5a'); P.px(12, 0, 28, 5, '#3a3a4a'); P.px(0, 14, 52, 2, '#2a2a3a');
      P.px(22, 22, 8, 10, '#7a4a26'); P.px(20, 17, 12, 3, '#e8d8a0'); return P.done(); },
    marinebase: () => { const P = painter(68, 52);
      wallLine(P, 0, 34, 68, 16, '#e8ecf2');
      P.px(10, 14, 48, 24, '#f4f6fa'); P.px(8, 10, 52, 5, '#2f6fd6'); P.px(12, 6, 44, 5, '#3a7ae0');
      tower(P, 26, -4, 16, 22, '#f4f6fa', '#2f6fd6'); P.px(30, 2, 8, 6, '#2f6fd6'); P.px(32, 3, 4, 2, '#ffffff');  // emblema de la gaviota
      for (let k = 14; k < 56; k += 8) P.px(k, 20, 4, 5, '#7fb0e8');
      P.px(29, 28, 10, 10, '#4a5a7a'); flag(P, 46, -12, '#2f6fd6', '#d8d8d8'); flag(P, 16, -10, '#ffffff', '#d8d8d8');
      return P.done(); },
    fountain: () => { const P = painter(40, 30);
      P.px(2, 16, 36, 12, '#c8c8d0'); P.px(4, 18, 32, 7, '#5ab0e8'); P.px(16, 4, 8, 14, '#d8d8e0'); P.px(18, 0, 4, 5, '#7fd0ff'); P.px(10, 6, 4, 10, '#7fd0ff'); P.px(26, 6, 4, 10, '#7fd0ff');
      return P.done(); },
    galleyla: () => { const P = painter(60, 40); house(P, 0, 6, 60, 34, '#e07a3a', '#f0dcc0', { sign: '#2a6ad8' }); P.px(18, 0, 24, 8, '#c45a2a'); P.px(24, 2, 12, 3, '#ffffff'); return P.done(); },
    palace: () => { const P = painter(76, 56);
      P.px(4, 26, 68, 28, '#e8d4a0'); P.px(0, 50, 76, 6, '#d4b880');
      for (const x of [6, 60]) { tower(P, x, 6, 10, 46, '#e8d4a0', '#d4a040'); P.px(x + 1, 0, 8, 7, '#e0b050'); }
      P.px(24, 8, 28, 20, '#f0dcae'); P.px(26, 0, 24, 10, '#d4a040'); P.px(32, -4, 12, 6, '#e0b050');
      for (let k = 10; k < 66; k += 9) P.px(k, 34, 4, 8, '#7a5a3a'); P.px(32, 40, 12, 14, '#5a3a20'); return P.done(); },
    snowcastle: () => { const P = painter(56, 48);
      P.px(6, 20, 44, 26, '#d8dce8'); for (const x of [2, 42]) tower(P, x, 4, 12, 42, '#e4e8f2', '#a83a4a');
      tower(P, 22, 0, 12, 30, '#e4e8f2', '#a83a4a'); P.px(22, 34, 12, 12, '#5a4a5a'); P.px(0, 20, 56, 2, '#ffffff'); return P.done(); },
    goldbell: () => { const P = painter(40, 50);
      P.px(18, 20, 4, 30, '#3f8a3a'); P.px(14, 30, 4, 4, '#5fb05a'); P.px(22, 38, 4, 4, '#5fb05a');
      P.px(10, 6, 20, 14, '#f0c040'); P.px(8, 16, 24, 6, '#f0c040'); P.px(12, 4, 16, 3, '#ffd860'); P.px(18, 0, 4, 5, '#c89a20'); P.px(12, 8, 4, 8, '#ffe8a0'); P.px(18, 20, 4, 3, '#a87a10');
      return P.done(); },
    justicetower: () => { const P = painter(40, 64);
      tower(P, 10, 4, 20, 60, '#f0e8d8', '#2a3a6a'); P.px(12, 16, 16, 10, '#2a3a6a'); P.px(14, 18, 12, 6, '#f0e8d8'); P.px(19, 18, 2, 6, '#2a3a6a');
      P.px(0, 54, 40, 10, '#d8d0c0'); flag(P, 19, -8, '#2a3a6a', '#c8c8c8'); return P.done(); },
    hq: () => { const P = painter(84, 64);
      wallLine(P, 0, 46, 84, 16, '#e8ecf2');
      P.px(8, 14, 68, 36, '#f4f6fa'); P.px(4, 8, 76, 8, '#2f6fd6'); P.px(26, 0, 32, 10, '#3a7ae0');
      P.px(30, 18, 24, 16, '#2f6fd6'); P.px(34, 21, 16, 10, '#ffffff'); P.px(41, 21, 2, 10, '#2f6fd6');     // emblema
      for (let k = 12; k < 76; k += 10) P.px(k, 38, 5, 6, '#7fb0e8'); flag(P, 41, -12, '#2f6fd6', '#d8d8d8'); return P.done(); },
    prisontower: () => { const P = painter(40, 56);
      tower(P, 8, 0, 24, 56, '#4a4a5a', '#2a2a36', { win: '#ffd060' }); P.px(4, 40, 32, 16, '#3a3a48'); for (let k = 6; k < 34; k += 4) P.px(k, 44, 1, 10, '#1a1a22'); return P.done(); },
    mansion: () => { const P = painter(60, 48);
      house(P, 0, 12, 60, 36, '#4a3a6a', '#8a8098'); tower(P, 4, 0, 12, 30, '#7a7088', '#3a2a5a', { win: '#ffe060' }); tower(P, 44, 2, 12, 28, '#7a7088', '#3a2a5a', { win: '#ffe060' });
      return P.done(); },
    japcastle: () => { const P = painter(60, 60);
      P.px(4, 44, 52, 16, '#7a7a82');
      P.px(10, 34, 40, 12, '#f4f0e6'); P.px(6, 30, 48, 5, '#3a3a4a');
      P.px(14, 20, 32, 11, '#f4f0e6'); P.px(10, 16, 40, 5, '#3a3a4a');
      P.px(20, 8, 20, 9, '#f4f0e6'); P.px(16, 4, 28, 5, '#3a3a4a'); P.px(26, 0, 8, 5, '#d4a040');
      P.px(26, 38, 8, 8, '#5a3a20'); return P.done(); },
    torii: () => { const P = painter(30, 28); P.px(0, 2, 30, 3, '#d43a2a'); P.px(2, 8, 26, 2, '#d43a2a'); P.px(5, 4, 3, 24, '#c42a1a'); P.px(22, 4, 3, 24, '#c42a1a'); P.px(0, 0, 30, 2, '#2a2a2a'); return P.done(); },
    cakecastle: () => { const P = painter(64, 60);
      P.px(4, 40, 56, 18, '#f8e0c8'); P.px(4, 40, 56, 3, '#ff8ac0'); P.px(10, 24, 44, 17, '#fff0e0'); P.px(10, 24, 44, 3, '#ff6aa8'); P.px(18, 10, 28, 15, '#f8e0c8'); P.px(18, 10, 28, 3, '#ff8ac0');
      for (const x of [22, 30, 38]) { P.px(x, 2, 3, 8, '#ffffff'); P.px(x, 0, 3, 3, '#ffd060'); } for (let k = 8; k < 58; k += 7) P.px(k, 46, 3, 3, '#e03a5a'); return P.done(); },
    colosseum: () => { const P = painter(68, 44);
      P.px(0, 10, 68, 32, '#c8a878'); P.px(4, 4, 60, 8, '#d8b888'); for (let k = 4; k < 64; k += 7) { P.px(k, 16, 4, 8, '#5a4a3a'); P.px(k, 28, 4, 8, '#5a4a3a'); }
      P.px(0, 10, 68, 2, '#e8c898'); flag(P, 10, -6, '#f05a7a'); flag(P, 54, -6, '#f05a7a'); return P.done(); },
    lab: () => { const P = painter(52, 40);
      P.px(2, 14, 48, 24, '#c8d8e8'); P.px(10, 2, 32, 14, '#d8e8f8'); P.px(18, 0, 16, 4, '#4a8ad8'); for (let k = 6; k < 48; k += 8) P.px(k, 20, 5, 4, '#7fe0ff');
      P.px(22, 28, 8, 10, '#4a5a6a'); return P.done(); },
    labtower: () => { const P = painter(40, 60); P.px(8, 20, 24, 40, '#e8f0f8'); P.px(4, 8, 32, 16, '#f4f8ff'); P.px(10, 0, 20, 10, '#ffd860'); P.px(12, 2, 16, 6, '#fff0a0'); for (let k = 26; k < 56; k += 6) P.px(18, k, 4, 3, '#7fe0ff'); return P.done(); },
    bigtree: () => { const P = painter(52, 60);
      P.px(20, 30, 12, 30, '#6a4424'); P.px(14, 52, 24, 8, '#5a3a20');
      roundTree(P, 2, 0, 24, '#3f8a3a', '#6a4424'); return P.done(); },
    burnttree: () => { const P = painter(48, 56); P.px(18, 18, 12, 38, '#3a2a22'); P.px(8, 14, 32, 6, '#3a2a22'); P.px(4, 8, 8, 8, '#2a2020'); P.px(36, 6, 8, 10, '#2a2020'); P.px(20, 30, 8, 10, '#5a4a3a'); return P.done(); },
    mocktown: () => { const P = painter(40, 32); house(P, 0, 4, 22, 28, '#8a5a3a', '#c8b098', { sign: '#c4452c' }); house(P, 20, 0, 20, 32, '#6a4a3a', '#b8a088'); return P.done(); },
    saloon: () => { const P = painter(40, 30); house(P, 0, 4, 40, 26, '#c27a3a', '#e8c890', { sign: '#7a3a1a' }); P.px(4, 0, 32, 6, '#a85a2a'); return P.done(); },
    volcano: () => { const P = painter(60, 40); P.px(10, 14, 40, 26, '#6a5a52'); P.px(20, 6, 20, 10, '#7a6a62'); P.px(0, 28, 60, 12, '#5a4a44'); P.px(24, 4, 12, 4, '#e2541a'); P.px(27, 0, 6, 5, '#ffb030'); P.px(26, 10, 3, 10, '#e2541a'); return P.done(); },
    dino: () => { const P = painter(40, 26); P.px(4, 8, 22, 12, '#7a9a4a'); P.px(24, 2, 10, 10, '#7a9a4a'); P.px(30, 4, 2, 2, '#1a1a1a'); P.px(0, 12, 6, 3, '#7a9a4a'); for (const x of [8, 18]) P.px(x, 18, 4, 8, '#6a8a3a'); return P.done(); },
    snakepalace: () => { const P = painter(56, 44); house(P, 4, 10, 48, 34, '#8a3aa0', '#f0dcc0'); P.px(10, 0, 36, 12, '#a04ab8'); P.px(24, 2, 8, 6, '#3fa65a'); return P.done(); },
    ryugu: () => { const P = painter(60, 50); P.px(8, 20, 44, 28, '#ffc8d8'); P.px(4, 16, 52, 6, '#ff8ab0'); P.px(20, 4, 20, 16, '#ffd8e4'); P.px(16, 0, 28, 6, '#ff8ab0');
      P.px(0, 10, 10, 40, 'rgba(180,230,255,0.5)'); P.px(50, 10, 10, 40, 'rgba(180,230,255,0.5)'); return P.done(); },
    laboon: () => { const P = painter(56, 24); P.px(4, 4, 46, 16, '#4a6aa0'); P.px(0, 8, 8, 8, '#4a6aa0'); P.px(48, 6, 8, 12, '#3a5a90'); P.px(10, 14, 36, 6, '#b8c8e0'); P.px(14, 8, 2, 2, '#ffffff'); P.px(40, 2, 8, 4, '#e8e8e8'); return P.done(); },
    treehouse: () => { const P = painter(48, 54); P.px(20, 26, 8, 28, '#6a4424'); roundTree(P, 2, 0, 22, '#2f7a3a'); house(P, 10, 18, 28, 18, '#c27a3a', '#e8d0a8'); return P.done(); },
    longhouse: () => { const P = painter(64, 34); house(P, 0, 4, 64, 30, '#8a5a2a', '#c8a878'); P.px(0, 0, 6, 8, '#6a4424'); P.px(58, 0, 6, 8, '#6a4424'); return P.done(); },
    tavern: () => { const P = painter(46, 34); house(P, 0, 4, 46, 30, '#d9692f', '#f4e2c4', { sign: '#ffe066', chimney: true }); P.px(30, 0, 6, 6, '#9a6a3a'); return P.done(); },
    forge: () => { const P = painter(44, 36); house(P, 0, 6, 44, 30, '#5a4a40', '#8a7a6a'); P.px(32, 0, 6, 10, '#4a3a34'); P.px(33, -2, 4, 3, 'rgba(120,120,120,0.7)'); P.px(14, 26, 10, 6, '#ff8a2a'); return P.done(); },
    wreck: () => { const P = painter(48, 26); P.px(2, 12, 40, 10, '#6a4a2a'); P.px(0, 14, 6, 6, '#5a3a20'); P.px(18, 0, 2, 14, '#4a3420'); P.px(20, 2, 12, 6, '#d8d0b8'); P.px(30, 16, 8, 4, '#3a2a18'); return P.done(); },
    cabin: () => { const P = painter(34, 30); house(P, 0, 4, 34, 26, '#7a3a4a', '#9a6a4a', { chimney: true }); P.px(0, 4, 34, 2, '#ffffff'); return P.done(); },
    market: () => { const P = painter(56, 26); for (const [x, col] of [[0, '#e04a4a'], [19, '#f0c040'], [38, '#3a8ad8']]) { P.px(x, 0, 18, 8, col); for (let k = x; k < x + 18; k += 4) P.px(k, 0, 2, 8, '#ffffff'); P.px(x + 1, 8, 16, 14, '#c8a878'); P.px(x + 1, 8, 1, 18, '#6a4424'); P.px(x + 16, 8, 1, 18, '#6a4424'); } return P.done(); },
    skullrock: () => { const P = painter(52, 46); P.px(6, 4, 40, 34, '#b8b0a0'); P.px(2, 12, 48, 22, '#b8b0a0'); P.px(12, 14, 10, 10, '#1a1a1a'); P.px(30, 14, 10, 10, '#1a1a1a'); P.px(24, 26, 4, 5, '#1a1a1a'); for (let k = 14; k < 40; k += 5) P.px(k, 34, 3, 8, '#d8d0c0'); return P.done(); },
    temple: () => { const P = painter(48, 34); P.px(2, 10, 44, 22, '#9a8a6a'); P.px(0, 4, 48, 8, '#7a6a4a'); P.px(12, 0, 24, 6, '#7a6a4a'); for (let k = 6; k < 44; k += 8) P.px(k, 14, 3, 18, '#b8a888'); P.px(20, 20, 8, 12, '#2a2018'); return P.done(); },
    oasis: () => { const P = painter(48, 30); P.px(4, 10, 40, 16, '#3a9ad8'); P.px(8, 8, 32, 20, '#3a9ad8'); P.px(10, 12, 12, 3, '#8ad0ff'); return P.done(); },
    tent: () => { const P = painter(30, 24); P.px(2, 10, 26, 14, '#e8d0a0'); P.px(6, 4, 18, 8, '#e8d0a0'); P.px(12, 0, 6, 6, '#c4452c'); P.px(12, 14, 6, 10, '#6a4424'); for (let k = 4; k < 28; k += 6) P.px(k, 10, 2, 14, '#c4452c'); return P.done(); },
    hotspring: () => { const P = painter(44, 26); P.px(0, 6, 44, 18, '#9a9aa4'); P.px(4, 8, 36, 14, '#7fd0e8'); P.px(10, 0, 3, 7, 'rgba(255,255,255,0.7)'); P.px(22, 1, 3, 6, 'rgba(255,255,255,0.7)'); P.px(32, 0, 3, 7, 'rgba(255,255,255,0.7)'); return P.done(); },
    nest: () => { const P = painter(20, 12); P.px(2, 5, 16, 6, '#9a7a4a'); P.px(5, 2, 4, 4, '#f4f4f4'); P.px(11, 2, 4, 4, '#f4f4f4'); P.px(8, 1, 2, 1, '#f0a020'); return P.done(); },
    bridge: () => { const P = painter(36, 14); P.px(0, 4, 36, 6, '#b4472c'); P.px(0, 2, 36, 2, '#d4572c'); for (let k = 2; k < 36; k += 8) P.px(k, 0, 2, 12, '#8a3020'); return P.done(); },
    storytent: () => { const P = painter(34, 28); P.px(2, 12, 30, 16, '#8a3aa0'); P.px(8, 4, 18, 10, '#a04ab8'); P.px(15, 0, 4, 6, '#ffd060'); P.px(13, 18, 8, 10, '#3a2018'); return P.done(); },
    smallcastle: () => { const P = painter(52, 44); P.px(6, 18, 40, 24, '#c8b898'); for (const x of [2, 40]) tower(P, x, 4, 10, 38, '#d8c8a8', '#2a5ad8'); tower(P, 20, 0, 12, 26, '#d8c8a8', '#2a5ad8'); P.px(21, 32, 10, 10, '#5a3a20'); flag(P, 25, -9, '#2a5ad8'); return P.done(); },
    lighthouse: () => { const P = painter(20, 44); for (let k = 0; k < 4; k++) P.px(5, 10 + k * 8, 10, 4, k % 2 ? '#ffffff' : '#d43a2a'); for (let k = 0; k < 4; k++) P.px(5, 14 + k * 8, 10, 4, k % 2 ? '#d43a2a' : '#ffffff'); P.px(3, 4, 14, 6, '#3a3a40'); P.px(6, 5, 8, 4, '#ffe060'); P.px(4, 0, 12, 4, '#d43a2a'); return P.done(); }
  };
  // Qué hay en cada isla: [sprite, dx, dy] en radios de isla desde el centro (se ajusta a la tierra más cercana)
  const ISLAND_SPOTS = {
    dawn: [['windmill', 0.15, 0.35], ['bigtree', -0.45, -0.4]],
    shells: [['marinebase', 0, -0.1], ['scaffold', 0.5, 0.45]],
    orange: [['saloon', 0, 0.1]],
    syrup: [['mansion', 0.1, -0.45]],
    baratie: [['baratie', 0, 0]],
    arlong: [['arlongpark', 0.15, -0.1], ['orange', -0.6, 0.4], ['orange', -0.4, 0.6]],
    logue: [['scaffold', 0, 0], ['marinebase', -0.5, -0.4]],
    shimotsuki: [['dojo', 0, 0]],
    lvneel: [['smallcastle', 0, -0.2]], flevance: [['burnttree', 0, 0]], spidermiles: [['wreck', 0.2, 0.1]], minion: [['cabin', -0.2, 0]],
    rubeck: [['marinebase', 0, 0]], swallow: [['snowcastle', 0, 0]],
    ohara: [['burnttree', 0, -0.1]], toroa: [['marinebase', 0.1, 0]], ilusia: [['smallcastle', 0, 0]], kano: [['mocktown', 0.2, 0.1]], lascamp: [['forge', 0, 0]], calabaza: [['tent', 0, 0]],
    baterilla: [['tavern', 0, 0.2]], briss: [['treehouse', 0, -0.2]], sorbet: [['smallcastle', 0, 0]], karate: [['dojo', 0, -0.2]], centaurea: [['marinebase', 0, 0]], samba: [['tent', 0.1, 0]],
    twincapes: [['lighthouse', 0, -0.3], ['laboon', 0, 2.4, 'water']],
    whiskey: [['saloon', 0, 0.1]], littlegarden: [['volcano', 0, -0.3], ['dino', 0.4, 0.4]], drum: [['snowcastle', 0, -0.35]],
    alabasta: [['palace', 0, -0.2], ['oasis', 0.5, 0.4]], jaya: [['mocktown', -0.2, 0], ['treehouse', 0.5, -0.2]], skypiea: [['goldbell', 0, -0.2]],
    water7: [['fountain', 0, 0], ['galleyla', 0.5, 0.3]], enieslobby: [['justicetower', 0, -0.1]], navarone: [['marinebase', 0, 0]], thriller: [['mansion', 0, -0.1]],
    sabaody: [['bigtree', -0.3, -0.2], ['bigtree', 0.4, 0.1], ['bubble', 0.1, 0.5], ['bubble', -0.5, 0.3]],
    marineford: [['hq', 0, -0.1]], amazonlily: [['snakepalace', 0, 0]], impeldown: [['prisontower', 0, 0]], gyojin: [['ryugu', 0, 0]],
    punkhazard: [['lab', 0.3, 0]], g5: [['marinebase', 0, 0]], dressrosa: [['colosseum', 0.3, 0.2], ['smallcastle', -0.3, -0.3]], zou: [['treehouse', 0, -0.2]],
    wholecake: [['cakecastle', 0, -0.1]], elbaf: [['bigtree', 0, -0.3], ['longhouse', 0.3, 0.4]], wano: [['japcastle', 0, -0.2], ['torii', 0.5, 0.4]], egghead: [['labtower', 0, 0]],
    chaos: [['crystal', 0, 0], ['crystal', 0.3, 0.3], ['crystal', -0.3, 0.2]], poche: [['smallcastle', 0, -0.1]], fetu: [['windmill', 0, 0]], tomas: [['storytent', 0, 0]], perkin: [['mushroom', 0, 0], ['mushroom', 0.3, 0.2], ['mushroom', -0.2, 0.3]],
    kanpai: [['tavern', 0, 0], ['barrel', 0.3, 0.3], ['barrel', 0.35, 0.4], ['barrel', -0.3, 0.35]], gaviota: [['lighthouse', 0, -0.2], ['nest', 0.4, 0.2], ['nest', -0.4, 0.3]],
    tsubaki: [['dojo', 0, -0.1], ['bridge', 0.3, 0.45]], grimvik: [['cabin', 0, 0], ['cabin', 0.4, 0.3]], herrumbre: [['forge', -0.1, 0], ['wreck', 0.45, 0.4]],
    murmullo: [['bigtree', 0, -0.1]], lumbra: [['market', 0, 0], ['lamp', 0.35, 0.3], ['lamp', -0.35, 0.3]], tortuga: [['turtle', 0.2, 0.4], ['turtle', -0.3, 0.45], ['turtle', 0.45, 0.1]],
    calavera: [['skullrock', 0, -0.1], ['temple', 0.4, 0.35]], mango: [['orange', 0.2, -0.2], ['orange', -0.3, 0], ['orange', 0.1, 0.3]], sahrim: [['oasis', 0, 0], ['tent', 0.45, 0.3]], kazan: [['volcano', 0, -0.35], ['hotspring', 0.2, 0.4]]
  };
  const SMALL = { rock: 1, flower: 1, cactus: 1, barrel: 1, lamp: 1, crystal: 1, mushroom: 1, turtle: 1, bubble: 1 };
  const TREES = { palm: 1, pine: 1, sakura: 1, orange: 1, dead: 1, mangrove: 1, jungle: 1, round: 1 };

  // ---------- Generación (una vez, a partir del mapa) ----------
  let items = [], grid = null;
  const CELL = 16;
  function add(o) { items.push(o); }
  function build() {
    const M = OP.M;
    items = [];
    const H = OP.hash2;
    const nearestLand = (I, tx, ty) => {
      let best = I.land[0], bd = Infinity;
      for (const c of I.land) { const d = Math.hypot((c % M.W) + 0.5 - tx, ((c / M.W) | 0) + 0.5 - ty); if (d < bd) { bd = d; best = c; } }
      return [(best % M.W) + 0.5, ((best / M.W) | 0) + 0.5];
    };
    const busy = new Set();   // casillas ocupadas por construcciones (sin árboles encima)
    for (const I of M.islands) {
      if (!I.land.length) continue;
      // edificios emblemáticos
      for (const [type, dx, dy, where] of ISLAND_SPOTS[I.id] || []) {
        let x, y;
        if (where === 'water') { x = I.dockX + dx; y = I.dockY + dy; }
        else[x, y] = nearestLand(I, I.x + dx * I.r * (I.ex || 1), I.y + dy * I.r * (I.ey || 1));
        add({ x, y, type, big: !SMALL[type], isl: I.idx });
        for (let oy = -2; oy <= 1; oy++) for (let ox = -2; ox <= 2; ox++) busy.add(Math.floor(y + oy) * M.W + Math.floor(x + ox));
      }
      // muelle del puerto
      const px = (I.portLand % M.W) + 0.5, py = ((I.portLand / M.W) | 0) + 0.5;
      const dxp = I.dockX - px, dyp = I.dockY - py;
      const len = Math.max(1, Math.round(Math.hypot(dxp, dyp) * 16));
      add({ x: (px + I.dockX) / 2, y: (py + I.dockY) / 2 + (Math.abs(dxp) > Math.abs(dyp) ? 0.3 : 0.5), type: 'pier', horiz: Math.abs(dxp) > Math.abs(dyp), len: Math.min(64, len + 8), flat: true });
    }
    // edificios con puerta (taberna, clínica y casas en las que se puede entrar): siempre se dibujan
    if (OP.Interiors) for (const d of OP.Interiors.doors()) {
      const I = M.islands[d.isl];
      add({ x: d.x, y: d.y, type: d.kind === 'tavern' ? 'doorTavern' : d.kind === 'clinic' ? 'doorClinic' : 'house', roof: ROOF[I.biome] || '#c4452c', v: 1, isl: d.isl });
      busy.add(d.ty * M.W + d.tx);
    }
    // detalles por casilla
    for (let i = 0; i < M.N; i++) {
      const t = M.t[i];
      if (t < 10 || t >= 60 || busy.has(i)) continue;
      const x = i % M.W, y = (i / M.W) | 0;
      const h = H(x, y, 4242), h2 = H(x, y, 777);
      const I = M.isl[i] >= 0 ? M.islands[M.isl[i]] : null;
      if (!I) continue;
      const cx = x + 0.2 + h2 * 0.6, cy = y + 0.6 + h * 0.3;
      if (t === T.TOWN && x % 2 === 0 && y % 2 === 0 && h < 0.8) add({ x: x + 1, y: y + 1.6, type: 'house', roof: ROOF[I.biome] || '#c4452c', v: Math.floor(h2 * 3), isl: I.idx });
      else if ((t === T.FOREST || t === T.JUNGLE || t === T.MANGROVE) && h < 0.42) add({ x: cx, y: cy, type: 'tree', kind: t === T.JUNGLE ? 'jungle' : t === T.MANGROVE ? 'mangrove' : 'round' });
      else if (t === T.SAKURA && h < 0.4) add({ x: cx, y: cy, type: 'tree', kind: 'sakura' });
      else if ((t === T.PINE || (t === T.SNOW && h < 0.08)) && h < 0.45) add({ x: cx, y: cy, type: 'tree', kind: 'pine' });
      else if (t === T.DEADTREE && h < 0.4) add({ x: cx, y: cy, type: 'tree', kind: 'dead' });
      else if (t === T.SAND && (I.biome === 'tropical' || I.biome === 'mangrove' || I.biome === 'jungle') && h < 0.1) add({ x: cx, y: cy, type: 'tree', kind: 'palm' });
      else if ((t === T.CACTUS && h < 0.25) || (t === T.DESERT && h < 0.025)) add({ x: cx, y: cy, type: 'cactus' });
      else if ((t === T.ROCK || t === T.MOUNTAIN || t === T.ASH) && h < 0.07) add({ x: cx, y: cy, type: 'rock' });
      else if ((t === T.GRASS || t === T.FLOWER) && h < (t === T.FLOWER ? 0.3 : 0.04)) add({ x: cx, y: cy, type: 'flower' });
    }
    // índice espacial
    grid = new Map();
    for (const o of items) { const k = Math.floor(o.x / CELL) * 4096 + Math.floor(o.y / CELL); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o); }
    for (const list of grid.values()) list.sort((a, b) => a.y - b.y);
    return items.length;
  }
  function spriteOf(o) {
    if (o.type === 'house') return sHouse(o.roof, o.v);
    if (o.type === 'doorTavern') return get('dtavern', () => { const P = painter(30, 26); house(P, 1, 1, 28, 24, '#d9692f', '#f4e2c4', { sign: '#ffe066', chimney: true }); P.px(21, 15, 5, 5, '#e8c050'); P.px(22, 16, 3, 3, '#fff4c0'); P.px(26, 16, 1, 3, '#e8c050'); return P.done(); });
    if (o.type === 'doorClinic') return get('dclinic', () => { const P = painter(28, 26); house(P, 1, 1, 26, 24, '#4a7ad8', '#f8f8fc', {}); P.px(4, 14, 5, 1, '#d02a2a'); P.px(6, 12, 1, 5, '#d02a2a'); return P.done(); });
    if (o.type === 'tree') return sTree(o.kind);
    if (o.type === 'pier') return sPier(o.len, o.horiz);
    if (TREES[o.type]) return sTree(o.type);
    if (SMALL[o.type] || o.type === 'cactus' || o.type === 'rock' || o.type === 'flower') return sSmall(o.type);
    const fn = LANDMARKS[o.type];
    return fn ? get('lm' + o.type, () => { PAD = 14; try { return fn(); } finally { PAD = 0; } }) : null;
  }

  // ---------- Dibujo (solo lo visible, desde zoom 5) ----------
  const vis = [];
  let visKey = '';
  function draw(ctx, w2s, z, x0, y0, Wc, Hc) {
    if (!grid || z < 5) return;
    const s = z / 16;
    const gx0 = Math.floor((x0 - 4) / CELL), gy0 = Math.floor((y0 - 4) / CELL);
    const gx1 = Math.floor((x0 + Wc / z + 4) / CELL), gy1 = Math.floor((y0 + Hc / z + 6) / CELL);
    // la lista visible solo se recalcula cuando la cámara se ha movido de verdad
    const vk = Math.round(x0 * 2) + '|' + Math.round(y0 * 2) + '|' + Math.round(z * 8) + '|' + Wc + '|' + Hc;
    if (vk !== visKey) {
      visKey = vk; vis.length = 0;
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        const list = grid.get(gx * 4096 + gy);
        if (!list) continue;
        for (const o of list) if (o.x > x0 - 4 && o.x < x0 + Wc / z + 4 && o.y > y0 - 2 && o.y < y0 + Hc / z + 6) vis.push(o);
      }
      vis.sort((a, b) => (a.flat ? -1 : 0) - (b.flat ? -1 : 0) || a.y - b.y);
    }
    const small = z < 9 || (OP.Perf && OP.Perf.tier >= 2);
    for (const o of vis) {
      if (small && (o.type === 'flower' || o.type === 'rock')) continue;
      const img = spriteOf(o);
      if (!img) continue;
      const [sx, sy] = w2s(o.x, o.y);
      const k = o.big && LANDMARKS[o.type] ? s * 1.5 : s;   // los edificios emblemáticos, algo más grandes
      const w = img.width * k, h = img.height * k;
      if (o.flat) ctx.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h / 2), Math.round(w), Math.round(h));
      else ctx.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h), Math.round(w), Math.round(h));
    }
  }
  OP.Decor = { build, draw, sprite: (type) => spriteOf({ type, big: true }), landmarks: Object.keys(LANDMARKS), get count() { return items.length; } };
})();
