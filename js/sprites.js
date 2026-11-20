/* MILESDEPIRATAS - pixel art: retratos, personitas, barcos y banderas */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const cache = new Map();
  const urlCache = new Map();

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  OP.shade = shade;

  // ---------- Retrato 24x24 ----------
  function portrait(a, opts) {
    opts = opts || {};
    const app = a.app;
    const marine = a.faction === 'marine';
    const expr = opts.expr || '';   // gesto para los carteles: guiño, sonrisa, enfado, media sonrisa, carcajada
    const LK = OP.splitLook(app);
    const key = 'p|' + app.skin + app.hair + app.hairColor + app.cloth + LK.acc + LK.hat + LK.scar + app.build + '|' + a.faction + '|' + (a.rank || 0) + '|' + (opts.bg || '') + '|' + (a.loc === 'dead' ? 'd' : '') + '|' + expr;
    if (cache.has(key)) return cache.get(key);
    const c = canvas(24, 24);
    const g = c.getContext('2d');
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    if (opts.bg) px(0, 0, 24, 24, opts.bg);
    const wide = app.build === 'fornido' ? 1 : 0;
    const thin = app.build === 'delgado' ? 1 : 0;
    const skin = app.skin, skinD = shade(app.skin, -0.18), skinL = shade(app.skin, 0.15);
    const hair = app.hairColor, hairD = shade(app.hairColor, -0.3), hairL = shade(app.hairColor, 0.25);
    const cloth = marine ? '#f2f4f7' : app.cloth;
    const clothD = marine ? '#c9d1db' : shade(app.cloth, -0.3);
    const out = 'rgba(20,14,10,0.85)';
    // pelo largo por detrás
    if (app.hair === 'largo') { px(5, 8, 3, 11, hairD); px(16, 8, 3, 11, hairD); }
    if (app.hair === 'coleta') { px(17, 7, 3, 3, hairD); px(18, 10, 2, 5, hair); px(18, 15, 1, 2, hairD); }
    if (app.hair === 'afro') { px(3, 2, 18, 11, hairD); px(4, 1, 16, 2, hair); }
    // hombros y ropa
    const sx = 3 - wide + thin, sw = 18 + wide * 2 - thin * 2;
    px(sx, 19, sw, 5, cloth);
    px(sx, 19, sw, 1, shade(cloth === '#f2f4f7' ? '#9aa7b6' : cloth, -0.15));
    px(sx, 22, sw, 2, clothD);
    if (marine) {
      px(10, 19, 4, 5, '#2f6fd6'); // camisa azul
      px(11, 19, 2, 2, '#f2f4f7');
      if ((a.rank || 0) >= 4) { px(sx, 19, 2, 5, '#ffffff'); px(sx + sw - 2, 19, 2, 5, '#ffffff'); px(sx + 2, 20, 1, 4, '#d6b84a'); px(sx + sw - 3, 20, 1, 4, '#d6b84a'); }
    } else {
      px(10, 19, 4, 3, skin); // cuello abierto
      px(11, 21, 2, 1, skinD);
    }
    // cuello
    px(10, 16, 4, 3, skinD);
    // cabeza
    const hx = 7 - wide + thin, hw = 10 + wide * 2 - thin * 2;
    px(hx + 1, 5, hw - 2, 1, skin);
    px(hx, 6, hw, 9, skin);
    px(hx + 1, 15, hw - 2, 1, skin);
    px(hx + hw - 1, 7, 1, 8, skinD);
    px(hx + 1, 15, hw - 2, 1, skinD);
    px(hx + 1, 6, 1, 3, skinL);
    // orejas
    px(hx - 1, 9, 1, 3, skinD); px(hx + hw, 9, 1, 3, skinD);
    // ojos
    const ey = 10;
    if (a.loc === 'dead') {
      px(9, ey, 1, 1, out); px(10, ey + 1, 1, 1, out); px(10, ey, 1, 1, out); px(9, ey + 1, 1, 1, out);
      px(14, ey, 1, 1, out); px(13, ey + 1, 1, 1, out); px(13, ey, 1, 1, out); px(14, ey + 1, 1, 1, out);
    } else if (expr === 'laugh') {   // ojos cerrados de risa ^^
      px(9, ey + 1, 1, 1, out); px(10, ey, 1, 1, out); px(13, ey, 1, 1, out); px(14, ey + 1, 1, 1, out);
    } else {
      px(9, ey, 2, 2, '#ffffff'); px(10, ey, 1, 2, '#1c1410');
      if (expr === 'wink') { px(13, ey + 1, 2, 1, out); px(15, ey, 1, 1, out); }   // guiño
      else { px(13, ey, 2, 2, '#ffffff'); px(13, ey, 1, 2, '#1c1410'); }
      if (expr === 'angry') { px(9, ey, 2, 1, skin); px(13, ey, 2, 1, skin); }    // ojos entornados
    }
    // cejas
    if (expr === 'angry') { px(9, ey - 2, 1, 1, hairD); px(10, ey - 1, 1, 1, hairD); px(14, ey - 2, 1, 1, hairD); px(13, ey - 1, 1, 1, hairD); px(11, ey - 1, 1, 1, skinD); }
    else if (expr === 'smirk') { px(9, ey - 2, 2, 1, hairD); px(13, ey - 3, 2, 1, hairD); }
    else px(9, ey - 2, 2, 1, hairD), px(13, ey - 2, 2, 1, hairD);
    // nariz y boca
    px(12, 12, 1, 1, skinD);
    const lip = '#7a2a20';
    if (expr === 'grin' || expr === 'wink') { px(10, 13, 4, 2, lip); px(10, 13, 4, 1, '#ffffff'); px(9, 13, 1, 1, lip); px(14, 13, 1, 1, lip); }
    else if (expr === 'laugh') { px(10, 13, 4, 2, '#3a1010'); px(11, 14, 2, 1, '#c84a4a'); px(10, 13, 4, 1, '#ffffff'); }
    else if (expr === 'angry') { px(10, 14, 4, 1, lip); px(11, 13, 2, 1, lip); px(10, 14, 4, 1, '#ffffff'); px(10, 13, 1, 1, lip); px(13, 13, 1, 1, lip); }
    else if (expr === 'smirk') { px(10, 14, 3, 1, lip); px(13, 13, 1, 1, lip); }
    else if (a.faction === 'pirate') { px(10, 14, 4, 1, lip); px(10, 13, 1, 1, lip); px(13, 13, 1, 1, lip); }
    else px(10, 14, 4, 1, '#7a3a2a');
    // pelo
    const st = app.hair;
    if (st === 'corto' || st === 'coleta' || st === 'moño' || st === 'largo') {
      px(hx, 4, hw, 3, hair); px(hx + 1, 3, hw - 2, 1, hair); px(hx, 7, 1, 3, hair); px(hx + hw - 1, 7, 1, 2, hair);
      px(hx + 2, 3, 3, 1, hairL);
      if (st === 'largo') { px(hx - 1, 6, 2, 10, hair); px(hx + hw - 1, 6, 2, 10, hair); }
      if (st === 'moño') { px(10, 0, 4, 3, hair); px(11, 0, 2, 1, hairL); }
    } else if (st === 'puntiagudo') {
      px(hx, 4, hw, 3, hair);
      for (let k = 0; k < 5; k++) { px(hx + k * 2, 2 - (k % 2), 2, 3, hair); }
      px(hx + hw - 1, 3, 2, 2, hair); px(hx - 1, 4, 2, 2, hair);
      px(hx, 7, 1, 2, hair); px(hx + hw - 1, 7, 1, 2, hair);
      px(hx + 2, 2, 1, 2, hairL);
    } else if (st === 'afro') {
      px(4, 2, 16, 6, hair); px(5, 1, 14, 1, hair); px(3, 4, 1, 6, hair); px(20, 4, 1, 6, hair);
      px(6, 2, 4, 1, hairL);
    } else if (st === 'cresta') {
      px(11, 0, 2, 7, hair); px(11, 0, 1, 2, hairL);
      px(hx, 5, hw, 1, hairD);
    } else if (st === 'calvo') {
      px(hx + 2, 5, 2, 1, skinL);
    }
    // accesorios
    for (const acc of [LK.acc, LK.scar === 'ninguna' ? '' : 'cicatriz', LK.hat]) {
    if (acc === 'barba') { px(hx + 1, 13, hw - 2, 3, hair); px(hx + 2, 16, hw - 4, 1, hairD); px(10, 14, 4, 1, '#5a2018'); }
    if (acc === 'cicatriz') { const c = '#9b3b2e'; if (LK.scar === 'ojo') px(14, 7, 1, 7, c); else if (LK.scar === 'cruz') { px(10, 6, 5, 1, c); px(12, 5, 1, 3, c); } else if (LK.scar === 'frente') px(9, 7, 6, 1, c); else { px(9, 9, 1, 1, c); px(10, 11, 1, 1, c); px(9, 12, 1, 1, c); px(8, 13, 1, 1, c); } }
    if (acc === 'parche') { px(12, 9, 4, 3, '#121212'); px(hx, 8, hw, 1, '#121212'); }
    if (acc === 'gafas') { px(8, 9, 4, 1, '#222'); px(12, 9, 4, 1, '#222'); px(8, 9, 1, 3, '#222'); px(11, 9, 1, 3, '#222'); px(12, 9, 1, 3, '#222'); px(15, 9, 1, 3, '#222'); px(8, 12, 4, 1, '#222'); px(12, 12, 4, 1, '#222'); }
    if (acc === 'bandana') { px(hx, 5, hw, 2, app.cloth); px(hx + hw, 6, 2, 1, app.cloth); px(hx + hw + 1, 7, 1, 2, app.cloth); px(hx + 2, 5, 1, 1, '#fff'); }
    if (acc === 'gorro') { px(hx - 1, 2, hw + 2, 5, app.cloth); px(hx - 1, 6, hw + 2, 1, shade(app.cloth, -0.3)); px(11, 0, 2, 2, '#f4f4f4'); }
    if (acc === 'tricornio') { px(hx - 3, 5, hw + 6, 2, '#1d1d22'); px(hx, 1, hw, 4, '#1d1d22'); px(hx + 3, 3, 4, 1, '#e8e8e8'); px(hx - 3, 4, 2, 1, '#1d1d22'); px(hx + hw + 1, 4, 2, 1, '#1d1d22'); }
    if (acc === 'sombrero de paja') { px(hx - 4, 5, hw + 8, 2, '#e9c34f'); px(hx, 1, hw, 4, '#f0d060'); px(hx, 4, hw, 1, '#c0392b'); px(hx - 4, 6, hw + 8, 1, '#b8932e'); px(hx + 1, 1, 3, 1, '#fbe58a'); }
    if (acc === 'gafas de sol') { px(8, 9, 4, 3, '#111'); px(12, 9, 4, 3, '#111'); px(11, 10, 2, 1, '#111'); px(9, 9, 1, 1, '#5a5a66'); px(13, 9, 1, 1, '#5a5a66'); }
    if (acc === 'bigote') { px(9, 13, 6, 1, hair); px(8, 14, 2, 1, hair); px(14, 14, 2, 1, hair); }
    if (acc === 'pendientes') { px(hx - 1, 12, 1, 2, '#f0c040'); px(hx + hw, 12, 1, 2, '#f0c040'); }
    if (acc === 'capa') { px(sx - 1, 18, 3, 6, '#7a1a1a'); px(sx + sw - 2, 18, 3, 6, '#7a1a1a'); px(sx + 1, 18, sw - 2, 1, '#a02a2a'); px(sx, 19, 1, 5, '#5a1010'); }
    if (acc === 'turbante') { px(hx - 1, 2, hw + 2, 4, '#f0e6d0'); px(hx - 1, 4, hw + 2, 1, '#d8c8a8'); px(hx + 2, 2, 3, 1, '#ffffff'); px(11, 3, 2, 2, '#c0392b'); }
    if (acc === 'flor') { px(hx + hw - 3, 3, 3, 3, '#ff6a9a'); px(hx + hw - 2, 4, 1, 1, '#ffe066'); px(hx + hw - 4, 5, 1, 1, '#3fa65a'); }
    if (acc === 'cigarro') { px(13, 14, 4, 1, '#f0e6d0'); px(17, 14, 1, 1, '#ff6a2a'); px(18, 12, 1, 1, 'rgba(210,210,210,0.8)'); px(19, 10, 1, 1, 'rgba(210,210,210,0.6)'); }
    if (acc === 'casco vikingo') { px(hx - 1, 2, hw + 2, 4, '#8a8a92'); px(hx - 1, 5, hw + 2, 1, '#5a5a62'); px(11, 2, 2, 4, '#6a6a72'); px(hx - 3, 0, 2, 4, '#f0e6d0'); px(hx + hw + 1, 0, 2, 4, '#f0e6d0'); }
    }
    if (marine && (a.rank || 0) <= 3 && LK.hat !== 'gorro' && LK.hat !== 'turbante' && LK.hat !== 'casco vikingo') {
      px(hx - 1, 2, hw + 2, 4, '#f4f6f8'); px(hx - 1, 5, hw + 2, 1, '#2f6fd6'); px(hx + 3, 3, 4, 1, '#2f6fd6'); px(hx - 2, 6, 4, 1, '#d9dee5');
    }
    // contorno suave
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(0,0,0,0)';
    g.globalCompositeOperation = 'source-over';
    cache.set(key, c);
    return c;
  }
  function portraitURL(a, bg) {
    const c = portrait(a, { bg });
    const key = 'u' + c.width + '|' + (bg || '') + '|' + a.app.skin + a.app.hair + a.app.hairColor + a.app.cloth + a.app.acc + (a.app.hat || '') + (a.app.scar || '') + a.app.build + a.faction + (a.rank || 0) + (a.loc === 'dead' ? 'd' : '');
    if (urlCache.has(key)) return urlCache.get(key);
    const u = c.toDataURL();
    urlCache.set(key, u);
    return u;
  }

  // ---------- Personita del mapa 5x7 ----------
  function person(a) {
    const app = a.app;
    const marine = a.faction === 'marine';
    const key = 'm|' + app.skin + app.hairColor + app.cloth + app.acc + a.faction + (a.isPlayer ? 'P' : '');
    if (cache.has(key)) return cache.get(key);
    const c = canvas(5, 7);
    const g = c.getContext('2d');
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const hatCol = app.acc === 'sombrero de paja' ? '#f0d060' : app.acc === 'tricornio' ? '#1d1d22' : marine ? '#f4f6f8' : app.acc === 'bandana' || app.acc === 'gorro' ? app.cloth : app.hairColor;
    px(1, 0, 3, 1, hatCol);
    if (app.acc === 'sombrero de paja') { px(0, 1, 5, 1, '#e0b84a'); }
    px(1, 1, 3, 2, app.skin);
    px(app.acc === 'sombrero de paja' ? 1 : 1, 1, 3, app.acc === 'sombrero de paja' ? 0 : 0, app.skin);
    const body = marine ? '#eef2f6' : app.cloth;
    px(0, 3, 5, 2, body);
    if (marine) px(2, 3, 1, 2, '#2f6fd6');
    px(0, 4, 1, 1, app.skin); px(4, 4, 1, 1, app.skin);
    px(1, 5, 1, 2, marine ? '#2a3c5a' : '#3a2a20'); px(3, 5, 1, 2, marine ? '#2a3c5a' : '#3a2a20');
    cache.set(key, c);
    return c;
  }

  // ---------- Personaje del mundo, estilo Pokémon Esmeralda (16x20 + contorno = 18x22) ----------
  // dir: 'down' | 'up' | 'left' | 'right'   frame: 0 quieto, 1 y 2 pasos   attack: brazo lanzando un golpe
  const OUT = '#1a1220';
  // colores de cada forma Bestia · beast: el torso también es pelaje · big: más ancho · mane: color de la melena
  const ZOAN_LOOK = {
    wolf: { fur: '#9aa8b8', mane: '#5a6878', beast: true },
    leopard: { fur: '#f0c040', mane: '#c08a20', beast: true },
    bison: { fur: '#7a5232', mane: '#3a2010', beast: true, big: true },
    elephant: { fur: '#a8a0b0', beast: true, big: true },
    phoenix: { fur: '#7fc8ff', mane: '#ffd23f', beast: false },
    dragon: { fur: '#3a7ad8', mane: '#1a3a8a', beast: true },
    dino: { fur: '#6a9a3a', beast: true, big: true },
    ptera: { fur: '#b8c060', beast: false },
    snake: { fur: '#5a8a3a', mane: '#2a4a10', beast: true },
    human: { fur: '#f0d0a0', mane: '#ffe14a', beast: false }
  };
  // armor (0-4): Aura de Armadura → nv1 brazos, nv2 + piernas, nv3 + torso, nv4 todo el cuerpo en negro metálico
  // zoan: forma híbrida de una fruta Bestia ('wolf', 'leopard', 'bison', 'elephant', 'phoenix', 'dragon', 'dino', 'ptera', 'snake', 'human')
  function chibi(app, faction, rank, dir, frame, attack, armor, zoan, code) {
    dir = dir || 'down'; frame = frame || 0; armor = armor | 0; zoan = ZOAN_LOOK[zoan] ? zoan : ''; code = code || '';
    const side = dir === 'left' || dir === 'right';
    const key = 'c|' + app.skin + app.hair + app.hairColor + app.cloth + app.acc + app.build + (app.hat || '') + (app.scar || '') + '|' + faction + (rank >= 4 ? 'o' : rank <= 3 ? 'r' : '') + '|' + (side ? 'side' : dir) + frame + (attack ? 'A' : '') + (armor ? 'H' + armor : '') + (zoan ? 'Z' + zoan : '') + '|' + code;
    let c = cache.get(key);
    if (!c) {
      c = drawChibi(app, faction, rank || 0, side ? 'side' : dir, frame, attack, armor, zoan, code);
      if (cache.size > 2400) { let n = 0; for (const k of cache.keys()) { if (k.charCodeAt(0) === 99 && k.charCodeAt(1) === 124) { cache.delete(k); if (++n >= 300) break; } } }   // móviles: la caché no crece sin límite
      cache.set(key, c);
    }
    if (dir !== 'left') return c;
    // la izquierda es el perfil derecho reflejado
    const k2 = key + 'L';
    let m = cache.get(k2);
    if (!m) { m = canvas(c.width, c.height); const g = m.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); cache.set(k2, m); }
    return m;
  }
  // Capas independientes, de atrás hacia delante. Cada una se pinta una vez, se guarda y se reutiliza:
  //   back (capa de tela) · base (cuerpo y pelo) · scar (cicatrices) · acc (complementos y accesorios) · hat (sombreros) · weapon (espadas)
  const LW = 30, LH = 25, OX = 7, OY = 4;   // lienzo de trabajo: deja sitio a las espadas alrededor del cuerpo
  const layerCache = new Map();
  function layer(name, key, paint) {
    const k = name + '|' + key;
    let c = layerCache.get(k);
    if (c !== undefined) return c;
    c = canvas(LW, LH);
    const g = c.getContext('2d');
    let used = false;
    paint((x, y, w, h, col) => { if (w > 0 && h > 0) { used = true; g.fillStyle = col; g.fillRect(x + OX, y + OY, w, h); } });
    if (!used) c = null;
    if (layerCache.size > 1600) layerCache.delete(layerCache.keys().next().value);
    layerCache.set(k, c);
    return c;
  }
  function paintLayer(name, px, app, look, faction, rank, dir, frame, attack, armor, zoan, gear) {
    const marine = faction === 'marine';
    // forma Bestia: la piel pasa a pelaje/escamas; en las bestias completas también el torso
    const Z = zoan ? ZOAN_LOOK[zoan] : null;
    // Aura de Armadura: negro metálico con brillo (las partes cubiertas dependen del nivel)
    const A = armor | 0, MT = '#1b1b26', MTD = '#0a0a10', MTL = '#5c5c78';
    const armArms = A >= 1, armLegs = A >= 2, armBody = A >= 3, armHead = A >= 4;
    const skin0 = Z ? Z.fur : app.skin;
    const skin = armHead ? MT : skin0, skinD = armHead ? MTD : shade(skin0, -0.2), skinL = armHead ? MTL : shade(skin0, 0.18);
    const hand = armArms ? MT : skin0, handD = armArms ? MTD : shade(skin0, -0.2);
    const chest = armBody ? MT : skin0, chestD = armBody ? MTD : shade(skin0, -0.2);
    const hair = Z && Z.mane ? Z.mane : app.hairColor, hairD = shade(hair, -0.32), hairL = shade(hair, 0.28);
    const cloth0 = Z && Z.beast ? Z.fur : marine ? '#f2f4f7' : app.cloth;
    const clothBase = Z && Z.beast ? Z.fur : app.cloth;
    const cloth = armBody ? MT : cloth0, clothD = armBody ? MTD : marine && !(Z && Z.beast) ? '#c4ccd8' : shade(clothBase, -0.3), clothL = armBody ? MTL : marine && !(Z && Z.beast) ? '#ffffff' : shade(clothBase, 0.2);
    const sleeve = armArms ? MT : cloth0, sleeveD = armArms ? MTD : marine && !(Z && Z.beast) ? '#c4ccd8' : shade(clothBase, -0.3);
    const pants = armLegs ? MT : marine ? '#2a3c5a' : '#3a2f4a', pantsD = armLegs ? MTD : marine ? '#1c2a42' : '#271f33';
    const shoe = armLegs ? MTD : Z && Z.beast ? shade(skin0, -0.35) : '#2a1a12';
    const wide = app.build === 'fornido' || (Z && Z.big) ? 1 : 0, thin = app.build === 'delgado' && !Z ? 1 : 0;
    const st = Z ? (Z.mane ? 'puntiagudo' : 'calvo') : app.hair;
    const acc = Z ? 'ninguno' : look.acc, hat = Z ? 'ninguno' : look.hat, scar = Z ? 'ninguna' : look.scar;
    const bx = 4 - wide + thin, bw = 8 + wide * 2 - thin * 2;
    if (name === 'back') {
      if (acc === 'capa' && dir !== 'up') { if (dir === 'side') px(3, 11, 3, 7, '#7a1a1a'); else px(bx - 1, 11, bw + 2, 7, '#7a1a1a'); }
      return;
    }
    if (name === 'base') {
      const lUp = frame === 1 ? 1 : 0, rUp = frame === 2 ? 1 : 0;
    if (dir === 'side') {
      px(6, 16 - lUp, 2, 3, pantsD); px(6, 19 - lUp, 3, 1, shoe);
      px(8, 16 - rUp, 2, 3, pants); px(8, 19 - rUp, 3, 1, shoe);
    } else {
      px(5, 16 - lUp, 3, 3, pants); px(5, 19 - lUp, 3, 1, shoe);
      px(8, 16 - rUp, 3, 3, pantsD); px(8, 19 - rUp, 3, 1, shoe);
    }
    if (dir === 'side') {
      px(5 - wide, 11, 6 + wide * 2 - thin, 5, cloth); px(10 + wide - thin, 11, 1, 5, clothD); px(5 - wide, 15, 6 + wide * 2 - thin, 1, clothD);
      if (marine && !armBody) px(9, 11, 1, 4, '#2f6fd6');
    } else {
      px(bx, 11, bw, 5, cloth); px(bx + bw - 1, 11, 1, 5, clothD); px(bx, 15, bw, 1, clothD); px(bx + 1, 11, 2, 1, clothL);
      if (marine && !armBody) { px(7, 11, 2, 4, dir === 'down' ? '#2f6fd6' : cloth); if (rank >= 4 && !armArms) { px(bx - 1, 11, 1, 6, '#ffffff'); px(bx + bw, 11, 1, 6, '#e4e8ee'); } }
      else if (!marine && dir === 'down') { px(7, 11, 2, 2, chest); px(7, 13, 2, 1, chestD); }
    }
    // ---- brazos ----
    if (dir === 'side') {
      if (attack) { px(9, 12, 5, 2, sleeve); px(14, 11, 2, 3, hand); px(14, 13, 2, 1, handD); }
      else { const sw = frame === 1 ? 1 : frame === 2 ? -1 : 0; px(7 + sw, 11, 2, 4, sleeveD); px(7 + sw, 15, 2, 1, hand); }
    } else if (attack) {
      px(bx - 1, 11, 1, 3, sleeveD); px(bx - 1, 14, 1, 1, hand);
      px(bx + bw, 9, 2, 3, sleeve); px(bx + bw, 7, 2, 2, hand);       // brazo arriba lanzando el golpe
    } else {
      const sw = frame === 1 ? 1 : frame === 2 ? -1 : 0;
      px(bx - 1, 11 + Math.max(0, sw), 1, 3, sleeveD); px(bx - 1, 14 + Math.max(0, sw), 1, 1, hand);
      px(bx + bw, 11 + Math.max(0, -sw), 1, 3, sleeveD); px(bx + bw, 14 + Math.max(0, -sw), 1, 1, handD);
    }
    // brillo metálico del Aura de Armadura
    if (armArms) { if (dir === 'side') px(attack ? 14 : 7, attack ? 11 : 11, 1, 1, MTL); else { px(bx - 1, 11, 1, 1, MTL); px(attack ? bx + bw : bx + bw, attack ? 7 : 11, 1, 1, MTL); } }
    if (armLegs) { px(dir === 'side' ? 8 : 5, 16, 1, 1, MTL); if (dir !== 'side') px(8, 16, 1, 1, MTL); }
    if (armBody) { px(dir === 'side' ? 6 : bx + 1, 12, 2, 1, MTL); }
    // ---- pelo de detrás (largo / coleta) ----
    if (st === 'largo') { if (dir === 'side') px(3, 5, 3, 7, hairD); else { px(2, 5, 2, 7, hairD); px(12, 5, 2, 7, hairD); } }
    if (st === 'coleta') { if (dir === 'side') { px(2, 4, 2, 3, hair); px(2, 7, 2, 4, hairD); } else if (dir === 'up') { px(7, 9, 2, 4, hairD); } else px(12, 5, 2, 5, hairD); }
    // ---- cabeza ----
    if (dir === 'side') {
      px(4, 2, 9, 8, skin); px(5, 1, 7, 1, skin); px(5, 10, 7, 1, skinD); px(12, 3, 1, 6, skinD);
      px(9, 6, 1, 2, '#1c1410'); px(12, 7, 1, 1, skinD);   // ojo y nariz
      px(6, 6, 1, 2, skinD);                                  // oreja
    } else {
      px(3, 2, 10, 8, skin); px(4, 1, 8, 1, skin); px(4, 10, 8, 1, skinD); px(12, 3, 1, 7, skinD); px(4, 3, 1, 2, skinL);
      if (dir === 'down') {
        px(5, 6, 1, 2, '#1c1410'); px(10, 6, 1, 2, '#1c1410');   // ojos
        px(5, 5, 1, 1, '#ffffff'); px(10, 5, 1, 1, '#ffffff');
        px(7, 9, 2, 1, skinD);                                  // boca
      }
    }
    // ---- pelo ----
    const H1 = (x, y, w, h) => px(x, y, w, h, hair);
    if (dir === 'up') {
      if (st !== 'calvo') { H1(3, 1, 10, 8); px(3, 8, 10, 1, hairD); px(4, 1, 3, 1, hairL); }
      if (st === 'cresta') { px(3, 1, 10, 8, skin); px(7, 0, 2, 8, hair); }
      if (st === 'moño') { H1(6, 0, 4, 2); }
      if (st === 'afro') { H1(1, 0, 14, 9); px(2, 0, 4, 1, hairL); }
      if (st === 'puntiagudo') { H1(4, 0, 2, 1); H1(8, 0, 2, 1); H1(11, 0, 2, 1); }
    } else if (dir === 'side') {
      if (st === 'afro') { H1(2, 0, 11, 6); px(3, 0, 4, 1, hairL); }
      else if (st === 'cresta') { H1(6, 0, 3, 3); }
      else if (st !== 'calvo') {
        H1(4, 1, 8, 3); H1(4, 4, 3, 4); px(5, 1, 3, 1, hairL); px(4, 7, 2, 1, hairD);
        if (st === 'puntiagudo') { H1(3, 0, 2, 2); H1(6, 0, 2, 1); H1(9, 0, 2, 1); H1(12, 2, 1, 2); }
        if (st === 'moño') H1(6, 0, 3, 2);
      }
    } else {
      if (st === 'afro') { H1(1, 0, 14, 6); px(1, 6, 2, 3, hair); px(13, 6, 2, 3, hair); px(3, 0, 4, 1, hairL); }
      else if (st === 'cresta') { H1(7, 0, 2, 4); }
      else if (st !== 'calvo') {
        H1(3, 1, 10, 3); H1(3, 4, 2, 3); H1(11, 4, 2, 3); px(4, 1, 3, 1, hairL); px(3, 3, 10, 1, hairD); H1(5, 4, 2, 1); H1(9, 4, 2, 1);
        if (st === 'puntiagudo') { H1(3, 0, 2, 1); H1(6, 0, 2, 1); H1(9, 0, 2, 1); H1(12, 0, 1, 2); H1(2, 2, 1, 2); H1(13, 2, 1, 2); }
        if (st === 'moño') H1(6, 0, 4, 2);
        if (st === 'largo' || st === 'coleta') { H1(3, 7, 1, 3); if (st === 'largo') H1(12, 7, 1, 3); }
      }
    }
    if (Z) {
      const f = skin0, fD = shade(skin0, -0.3), fL = shade(skin0, 0.25), dark = '#1a1010', ivory = '#f0e6d0';
      const front = dir !== 'side', down = dir === 'down';
      const ears = (round) => { if (front) { px(3, round ? 0 : -1, 2, round ? 2 : 3, f); px(11, round ? 0 : -1, 2, round ? 2 : 3, f); px(4, round ? 1 : 0, 1, 1, fL); px(11, round ? 1 : 0, 1, 1, fL); } else { px(6, round ? 0 : -1, 2, round ? 2 : 3, f); px(6, round ? 1 : 0, 1, 1, fL); } };
      const snout = (col) => { if (down) { px(6, 7, 4, 3, col); px(7, 7, 2, 1, dark); } else if (!front) { px(12, 6, 3, 3, col); px(14, 6, 1, 1, dark); } };
      const tail = (col, len) => { if (dir === 'side') { px(1, 12, 3, 2, col); px(0, 11 - Math.min(2, len), 2, 2, col); } else if (dir === 'up') px(7, 15, 2, 3 + len, col); };
      const eyesCol = (col) => { if (down) { px(5, 6, 1, 2, col); px(10, 6, 1, 2, col); } else if (!front) px(9, 6, 1, 2, col); };
      switch (zoan) {
        case 'wolf': ears(false); snout(fL); tail(fD, 2); eyesCol('#ffd23f'); break;
        case 'leopard': ears(true); snout(fL); tail(f, 2); for (const [x, y] of [[4, 4], [10, 3], [6, 12], [9, 13], [5, 14], [11, 12], [7, 2]]) px(x, y, 1, 1, '#4a2a0a'); eyesCol('#7fd03f'); break;
        case 'bison':
          if (front) { px(1, 2, 2, 1, ivory); px(1, 1, 1, 1, ivory); px(13, 2, 2, 1, ivory); px(14, 1, 1, 1, ivory); px(3, 1, 10, 2, hairD); } else { px(10, 0, 3, 1, ivory); px(12, -1, 1, 1, ivory); px(4, 1, 6, 2, hairD); }
          snout(fL); break;
        case 'elephant':
          if (front) { px(0, 3, 3, 6, fD); px(13, 3, 3, 6, fD); px(1, 4, 1, 4, fL); if (down) { px(7, 8, 2, 5, f); px(7, 12, 2, 1, fD); } }
          else { px(5, 3, 3, 6, fD); px(12, 7, 2, 5, f); px(13, 11, 2, 1, fD); }
          break;
        case 'phoenix': {
          const w1 = '#4ab0ff', w2 = '#bff0ff', w3 = '#ffd23f';
          if (front) { px(0, 9, 3, 6, w1); px(0, 8, 2, 1, w2); px(13, 9, 3, 6, w1); px(14, 8, 2, 1, w2); px(0, 15, 1, 1, w3); px(15, 15, 1, 1, w3); }
          else { px(2, 8, 5, 5, w1); px(1, 7, 3, 1, w2); px(2, 13, 2, 1, w3); }
          px(front ? 7 : 7, -1, 2, 2, w2); px(front ? 8 : 8, -2, 1, 1, w3); tail(w1, 3); eyesCol('#ffd23f'); break;
        }
        case 'dragon':
          if (front) { px(4, -1, 1, 2, ivory); px(11, -1, 1, 2, ivory); if (down) { px(2, 8, 2, 1, '#ffd23f'); px(12, 8, 2, 1, '#ffd23f'); } }
          else { px(7, -1, 1, 2, ivory); px(13, 8, 2, 1, '#ffd23f'); }
          snout(fL); tail(f, 3); eyesCol('#ffd23f');
          for (const [x, y] of [[5, 12], [8, 13], [10, 12]]) px(x, y, 1, 1, fL);
          break;
        case 'dino':
          px(front ? 5 : 5, 0, 1, 1, fD); px(front ? 8 : 8, 0, 1, 1, fD); px(front ? 11 : 10, 0, 1, 1, fD);
          if (down) { px(5, 8, 6, 2, fL); px(5, 8, 6, 1, '#ffffff'); } else if (!front) { px(12, 7, 4, 3, fL); px(12, 8, 4, 1, '#ffffff'); }
          tail(f, 3); eyesCol('#ff8a2a'); break;
        case 'ptera': {
          const m1 = '#a8b84a', m2 = '#6a7a20';
          if (front) { px(0, 9, 3, 5, m1); px(0, 9, 3, 1, m2); px(13, 9, 3, 5, m1); px(13, 9, 3, 1, m2); }
          else { px(2, 8, 5, 4, m1); px(2, 8, 5, 1, m2); }
          if (front) px(7, -1, 2, 2, m2); else { px(3, 1, 3, 2, m2); px(12, 6, 3, 2, ivory); }
          eyesCol('#ffd23f'); break;
        }
        case 'snake':
          for (let y = 11; y < 16; y++) for (let x = 5; x < 11; x += 2) px(x + (y % 2), y, 1, 1, fL);
          if (down) { px(6, 9, 1, 1, '#ffffff'); px(9, 9, 1, 1, '#ffffff'); px(2, 3, 1, 6, fD); px(13, 3, 1, 6, fD); }
          tail(f, 3); eyesCol('#ffd23f'); break;
        case 'human':
          if (down) { px(4, 6, 3, 2, '#2a2a30'); px(9, 6, 3, 2, '#2a2a30'); px(7, 6, 2, 1, '#2a2a30'); px(5, 6, 1, 1, '#ffe14a'); px(10, 6, 1, 1, '#ffe14a'); }
          px(front ? 6 : 6, -1, 4, 1, '#ffe14a');
          break;
      }
    }
      return;
    }
    if (name === 'scar') {
      const c = '#9b3b2e';
      if (scar === 'mejilla') { if (dir === 'down') { px(10, 8, 1, 1, c); px(11, 7, 1, 1, c); } else if (dir === 'side') { px(10, 8, 1, 1, c); px(11, 7, 1, 1, c); } }
      if (scar === 'ojo') { if (dir === 'down') { px(10, 4, 1, 5, c); } else if (dir === 'side') px(9, 4, 1, 5, c); }
      if (scar === 'cruz') { if (dir === 'down') { px(7, 5, 3, 1, c); px(8, 4, 1, 3, c); } else if (dir === 'side') { px(8, 5, 3, 1, c); px(9, 4, 1, 3, c); } }
      if (scar === 'frente' && dir !== 'up') px(dir === 'side' ? 7 : 5, 4, 5, 1, c);
      return;
    }
    if (name === 'acc') {
      if (acc === 'capa' && dir === 'up') { px(bx, 11, bw, 7, '#8a2020'); px(bx, 11, bw, 1, '#a02a2a'); }
    if (acc === 'flor' && dir !== 'up') { const fx = dir === 'side' ? 4 : 11; px(fx, 2, 3, 3, '#ff6a9a'); px(fx + 1, 3, 1, 1, '#ffe066'); }
    if (dir === 'down') {
      if (acc === 'gafas') { px(4, 6, 3, 2, '#2a2a30'); px(9, 6, 3, 2, '#2a2a30'); px(7, 6, 2, 1, '#2a2a30'); px(5, 6, 1, 1, '#8ab0d0'); px(10, 6, 1, 1, '#8ab0d0'); }
      if (acc === 'parche') { px(4, 5, 3, 3, '#121212'); px(3, 4, 10, 1, '#121212'); }
      if (acc === 'barba') { px(4, 8, 8, 3, hair); px(7, 9, 2, 1, '#5a2018'); }
      if (acc === 'gafas de sol') { px(4, 6, 3, 2, '#111'); px(9, 6, 3, 2, '#111'); px(7, 6, 2, 1, '#111'); px(4, 6, 1, 1, '#5a5a66'); }
      if (acc === 'bigote') { px(5, 8, 6, 1, hair); }
      if (acc === 'pendientes') { px(2, 7, 1, 2, '#f0c040'); px(13, 7, 1, 2, '#f0c040'); }
      if (acc === 'cigarro') { px(9, 9, 3, 1, '#f0e6d0'); px(12, 9, 1, 1, '#ff6a2a'); }
    } else if (dir === 'side') {
      if (acc === 'gafas') { px(8, 6, 3, 2, '#2a2a30'); }
      if (acc === 'barba') { px(8, 8, 5, 3, hair); }
      if (acc === 'gafas de sol') { px(8, 6, 4, 2, '#111'); }
      if (acc === 'bigote') { px(10, 8, 3, 1, hair); }
      if (acc === 'pendientes') { px(6, 8, 1, 2, '#f0c040'); }
      if (acc === 'cigarro') { px(12, 9, 3, 1, '#f0e6d0'); px(15, 9, 1, 1, '#ff6a2a'); }
    }
      const E = gear ? OP.Gear.ACCS : null, sw = frame === 1 ? 1 : frame === 2 ? -1 : 0;
      if (E && E[gear.cuello]) { const c = E[gear.cuello].color; if (dir === 'side') px(8, 11, 3, 1, c); else { px(6, 11, 4, 1, c); if (dir === 'down') px(7, 12, 2, 1, c); } }
      if (E && E[gear.brazo]) { const c = E[gear.brazo].color; if (dir === 'side') px(attack ? 11 : 7 + sw, attack ? 12 : 13, 2, attack ? 2 : 1, c); else px(bx - 1, 13, 1, 1, c); }
      if (E && E[gear.cintura]) { const c = E[gear.cintura].color; if (dir === 'side') px(5 - wide, 15, 6 + wide * 2 - thin, 1, c); else { px(bx, 15, bw, 1, c); if (dir === 'down') px(9, 16, 2, 2, c); } }
      return;
    }
    if (name === 'hat') {
    if (hat === 'sombrero de paja') {
      if (dir === 'side') { px(2, 3, 13, 1, '#e9c34f'); px(2, 4, 12, 1, '#b8932e'); px(5, 0, 7, 3, '#f0d060'); px(5, 2, 7, 1, '#c0392b'); }
      else { px(1, 3, 14, 2, '#e9c34f'); px(1, 4, 14, 1, '#b8932e'); px(4, 0, 8, 3, '#f0d060'); px(4, 2, 8, 1, '#c0392b'); px(5, 0, 3, 1, '#fbe58a'); }
    } else if (hat === 'tricornio') {
      px(2, 2, 12, 2, '#1d1d22'); px(4, 0, 8, 2, '#26262c'); if (dir === 'down') px(7, 1, 2, 1, '#e8e8e8');
    } else if (hat === 'gorro') {
      px(3, 0, 10, 4, app.cloth); px(3, 3, 10, 1, shade(app.cloth, -0.3)); px(7, -0, 2, 1, '#f4f4f4');
    } else if (hat === 'bandana') {
      px(3, 2, 10, 2, app.cloth); px(3, 3, 10, 1, shade(app.cloth, -0.25));
      if (dir !== 'down') px(dir === 'side' ? 3 : 12, 3, 2, 2, app.cloth);
    } else if (hat === 'turbante') {
      px(3, 0, 10, 4, '#f0e6d0'); px(3, 3, 10, 1, '#d8c8a8'); px(4, 0, 3, 1, '#ffffff'); if (dir === 'down') px(7, 1, 2, 2, '#c0392b');
    } else if (hat === 'casco vikingo') {
      px(3, 0, 10, 4, '#8a8a92'); px(3, 3, 10, 1, '#5a5a62');
      if (dir === 'side') px(12, -1, 2, 3, '#f0e6d0'); else { px(1, -1, 2, 3, '#f0e6d0'); px(13, -1, 2, 3, '#f0e6d0'); }
    } else if (marine && rank <= 3 && !Z) {
      px(3, 0, 10, 3, '#f4f6f8'); px(3, 2, 10, 1, '#2f6fd6'); px(2, 3, 12, 1, '#d9dee5');
    }
      return;
    }
    if (name === 'weapon' && gear && gear.r) {
      const sp = gear.sp && OP.Gear.SWORDS[gear.sp], blade = sp ? sp.color : OP.Gear.BLADE[gear.r] || '#d8dde6', edge = '#ffffff', steel = shade(blade.length === 7 ? blade : '#d8dde6', -0.32), gold = gear.r >= 4 ? '#ffd23f' : '#b8923a', grip = '#2a1a12';
      const up = (x, top, len) => { px(x, top, 1, len, blade); px(x, top, 1, 1, edge); px(x + 1, top + 1, 1, len - 1, steel); px(x - 1, top + len, 3, 1, gold); px(x, top + len + 1, 1, 2, grip); };
      const fwd = (x, y, len) => { px(x + 2, y, len, 1, blade); px(x + 2 + len - 1, y, 1, 1, edge); px(x + 2, y + 1, len - 1, 1, steel); px(x + 1, y - 1, 1, 3, gold); px(x - 1, y, 2, 1, grip); };
      if (dir === 'side') {
        if (attack) fwd(14, 12, 6); else fwd(8 + (frame === 1 ? 1 : frame === 2 ? -1 : 0), 15, 7);
        if (gear.stance >= 2) fwd(7, 13, 8);
        if (gear.stance >= 3) { px(11, 9, 9, 1, blade); px(19, 9, 1, 1, edge); px(10, 9, 1, 1, gold); }
      } else {
        const rx = bx + bw + 1, lx = bx - 2;
        if (attack) up(rx - 1, -3, 9); else up(rx, 4, 9);
        if (gear.stance >= 2) up(lx, attack ? 1 : 4, 9);
        if (gear.stance >= 3 && dir === 'down') { px(1, 9, 14, 1, blade); px(1, 9, 1, 1, edge); px(14, 9, 1, 1, gold); px(15, 9, 2, 1, grip); }
      }
    }
  }
  // silueta oscura de una capa: marca su borde sobre lo que tiene debajo (trazo definido)
  const inkCache = new WeakMap();
  function ink(c) {
    let m = inkCache.get(c);
    if (!m) { m = canvas(LW, LH); const g = m.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = OUT; g.fillRect(0, 0, LW, LH); inkCache.set(c, m); }
    return m;
  }
  function drawChibi(app, faction, rank, dir, frame, attack, armor, zoan, code) {
    const look = OP.splitLook(app), gear = OP.Gear.parseCode(code), rc = faction + (rank >= 4 ? 'o' : rank <= 3 ? 'r' : '');
    const pose = dir + frame + (attack ? 'A' : '');
    const stack = [
      ['back', look.acc + app.build + dir + (zoan ? 'Z' : ''), false],
      ['base', [app.skin, app.hair, app.hairColor, app.cloth, app.build, rc, pose, armor, zoan].join('|'), false],
      ['scar', look.scar + dir + (zoan ? 'Z' : ''), false],
      ['acc', [look.acc, app.hairColor, app.build, pose, zoan ? 'Z' : '', gear ? gear.cuello + gear.brazo + gear.cintura : ''].join('|'), true],
      ['hat', [look.hat, app.cloth, rc, dir, zoan ? 'Z' : ''].join('|'), true],
      ['weapon', gear && gear.r ? [gear.r, gear.stance, gear.sp, app.build, pose].join('|') : 'x', true]
    ];
    const work = canvas(LW, LH), g = work.getContext('2d');
    for (const [name, key, inked] of stack) {
      const c = layer(name, key, (px) => paintLayer(name, px, app, look, faction, rank, dir, frame, attack, armor, zoan, gear));
      if (!c) continue;
      if (inked) {
        g.globalCompositeOperation = 'source-atop';
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.drawImage(ink(c), ox, oy);
        g.globalCompositeOperation = 'source-over';
      }
      g.drawImage(c, 0, 0);
    }
    // contorno exterior oscuro
    const img = g.getImageData(0, 0, LW, LH), d = img.data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < LW && y < LH && d[(y * LW + x) * 4 + 3] > 0;
    const out = [];
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) out.push(x, y);
    for (let k = 0; k < out.length; k += 2) { const i = (out[k + 1] * LW + out[k]) * 4; d[i] = 0x1a; d[i + 1] = 0x12; d[i + 2] = 0x20; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    if (gear && gear.r) return work;      // con espada se usa el lienzo entero (centrado igual que el cuerpo)
    const c = canvas(18, 22);             // sin espada, el tamaño de siempre
    c.getContext('2d').drawImage(work, OX - 1, OY - 1, 18, 22, 0, 0, 18, 22);
    return c;
  }

  // ---------- Bandera pirata 10x7 ----------
  function flag(f) {
    const key = 'f|' + f.bg + f.fg + f.sym;
    if (cache.has(key)) return cache.get(key);
    const c = canvas(10, 7);
    const g = c.getContext('2d');
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    px(0, 0, 10, 7, f.bg);
    const w = '#f4f4f4';
    // calavera
    px(4, 1, 3, 2, w); px(4, 3, 1, 1, w); px(6, 3, 1, 1, w);
    px(4, 2, 1, 1, f.bg); px(6, 2, 1, 1, f.bg);
    switch (f.sym) {
      case 1: px(1, 1, 1, 1, f.fg); px(2, 2, 1, 1, f.fg); px(8, 1, 1, 1, f.fg); px(7, 2, 1, 1, f.fg); px(2, 4, 1, 1, f.fg); px(1, 5, 1, 1, f.fg); px(7, 4, 1, 1, f.fg); px(8, 5, 1, 1, f.fg); break; // espadas
      case 2: px(3, 0, 5, 1, '#f0d060'); px(2, 1, 1, 1, '#f0d060'); px(8, 1, 1, 1, '#f0d060'); break; // sombrero
      case 3: px(3, 0, 1, 1, f.fg); px(7, 0, 1, 1, f.fg); px(3, 1, 1, 1, f.fg); px(7, 1, 1, 1, f.fg); break; // cuernos
      case 4: px(4, 2, 1, 1, '#000'); px(3, 1, 5, 1, f.bg); px(4, 1, 3, 1, w); break;
      default: px(2, 4, 1, 1, w); px(3, 5, 1, 1, w); px(7, 4, 1, 1, w); px(6, 5, 1, 1, w); px(2, 6, 1, 1, w); px(8, 4, 1, 1, w); px(8, 6, 1, 1, w); px(2, 4, 1, 1, w); break;
    }
    cache.set(key, c);
    return c;
  }
  function flagURL(f) {
    const key = 'fu|' + f.bg + f.fg + f.sym;
    if (urlCache.has(key)) return urlCache.get(key);
    const u = flag(f).toDataURL();
    urlCache.set(key, u);
    return u;
  }

  // ---------- Barcos ----------
  const SHIP_DIM = { bote: [7, 5], carabela: [12, 10], bergantin: [14, 11], galeon: [16, 12], legendario: [17, 13], marine: [15, 12], almirante: [18, 13] };
  // look (opcional, solo el navío legendario): { hull: color del casco } — las velas y el emblema van en f (bg / fg)
  function ship(type, faction, f, look) {
    const key = 's|' + type + faction + (f ? f.bg + f.fg + f.sym : '') + (look ? '|' + look.hull + (look.flag ? look.flag.bg + look.flag.fg + look.flag.sym : '') : '');
    if (cache.has(key)) return cache.get(key);
    const [W, H] = SHIP_DIM[type] || [12, 10];
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const marine = faction === 'marine';
    const hull = look && look.hull ? look.hull : marine ? '#d7dde5' : type === 'legendario' ? '#a0632e' : '#7a4a26';
    const hullD = look && look.hull ? shade(look.hull, -0.38) : marine ? '#7d8ba0' : '#4e2e16';
    const sail = marine && !look ? '#f7f8fa' : (f ? f.bg : '#111');
    if (type === 'bote') {
      px(1, 3, 5, 1, hull); px(2, 4, 3, 1, hullD); px(0, 2, 1, 1, hull); px(6, 2, 1, 1, hull);
      px(3, 1, 1, 2, '#e8d2b0');
      cache.set(key, c); return c;
    }
    const hullTop = H - 4;
    // casco
    px(1, hullTop, W - 2, 2, hull);
    px(2, hullTop + 2, W - 4, 1, hull);
    px(3, hullTop + 3, W - 6, 1, hullD);
    px(0, hullTop - 1, 2, 1, hull); px(W - 3, hullTop - 1, 3, 2, hull);
    px(1, hullTop + 1, W - 2, 1, hullD);
    if (marine) px(1, hullTop, W - 2, 1, '#2f6fd6');
    // portillas
    for (let x = 3; x < W - 3; x += 2) px(x, hullTop + 1, 1, 1, marine ? '#2a3c5a' : '#2a180c');
    // mástiles y velas
    const masts = type === 'carabela' ? [W / 2] : type === 'bergantin' || type === 'marine' ? [W * 0.35, W * 0.68] : [W * 0.25, W * 0.5, W * 0.75];
    for (const m of masts) {
      const mx = Math.round(m);
      px(mx, 0, 1, hullTop, '#3b2614');
      const sw = Math.max(3, Math.round(W / (masts.length + 1)));
      px(mx - Math.floor(sw / 2), 1, sw, hullTop - 3, sail);
      px(mx - Math.floor(sw / 2), hullTop - 2, sw, 1, marine && !look ? '#c9d1db' : shade(sail.length === 7 ? sail : '#111111', 0.15));
      if (marine && !look) { px(mx - 1, 2, 3, 1, '#2f6fd6'); px(mx, 3, 1, 1, '#2f6fd6'); }
      else if (f) { const e = look ? f.fg : '#f4f4f4'; px(mx - 1, 2, 3, 2, e); px(mx - 1, 3, 1, 1, sail); px(mx + 1, 3, 1, 1, sail); px(mx - 1, 5, 1, 1, e); px(mx + 1, 5, 1, 1, e); }
    }
    // bandera en lo alto
    px(Math.round(masts[masts.length - 1]) + 1, 0, 2, 1, marine && !look ? '#2f6fd6' : (f ? f.fg : '#fff'));
    if (look && f) {   // bandera personalizada ondeando en lo alto del mástil mayor
      const fl = flag(look.flag || f), mx = Math.round(masts[masts.length - 1]) + 1;
      g.drawImage(fl, 0, 0, fl.width, fl.height, mx, 0, 5, 4);
    }
    if (type === 'legendario') { px(W - 2, hullTop - 3, 2, 2, '#f0c040'); px(W - 1, hullTop - 4, 1, 1, '#f0c040'); }
    cache.set(key, c);
    return c;
  }

  // ---------- Fruta Maldita: dibujo de cada fruta (forma, color y remolinos propios) ----------
  const fruitCache = new Map();
  function hexMix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }
  function fruitInside(shape, x, y) {
    const inC = (cx, cy, r) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
    switch (shape) {
      case 'oval': return ((x - 12) / 7.2) ** 2 + ((y - 14.5) / 9.3) ** 2 <= 1;
      case 'pear': return inC(12, 17, 7.4) || inC(12, 10.5, 5);
      case 'heart': return inC(8.6, 12.5, 5.2) || inC(15.4, 12.5, 5.2) || (y >= 12.5 && y <= 22.5 && Math.abs(x - 12) <= (22.5 - y) * 0.95);
      case 'twin': return inC(8.2, 15, 6) || inC(15.8, 15, 6);
      case 'spiky': { const dx = x - 12, dy = y - 15, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx); return r <= 7 + 2.6 * Math.pow(Math.max(0, Math.cos(a * 8)), 4); }
      default: return inC(12, 15, 8.4);
    }
  }
  // Dibujo de alta calidad (36x36): sombreado esférico por tonos, remolinos "de cuerda" en relieve (borde claro y oscuro),
  // tallo rizado grueso con brillo, hoja con nervio, brillo especular, contorno y, en las frutas conocidas, el aura de su elemento.
  const FRUIT_AURA = { mera: 'fire', magu: 'fire', uo: 'fire', tori: 'bluefire', hie: 'ice', goro: 'spark', pika: 'spark', yami: 'smoke', suna: 'sand', gura: 'spark', bomu: 'fire', ito: 'spark' };
  function fruit(fid) {
    if (fruitCache.has(fid)) return fruitCache.get(fid);
    const F = OP.FRUITS[fid] || OP.FRUITS[0];
    const [col, swirl, shape] = F.look || ['#8a5ad8', '#3a1f7a', 'round'];
    const W = 36, H = 36, SC = 24 / 30, OX = 3, OY = 3;   // el cuerpo se dibuja en 30x30 dentro del lienzo
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const px = (x, y, cc) => { g.fillStyle = cc; g.fillRect(x, y, 1, 1); };
    const seed = (fid * 7919) % 97;
    const aura = FRUIT_AURA[F.key] || (F.rarity >= 3 ? 'glow' : '');
    // sombra en el suelo
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(18, 33, 9, 2.2, 0, 0, Math.PI * 2); g.fill();
    // aura del elemento (detrás de la fruta)
    if (aura === 'fire' || aura === 'bluefire') {
      // lenguas de fuego (rojo → naranja → amarillo) dibujadas aparte y "pixeladas" (sin bordes suaves)
      const pal = aura === 'fire' ? ['#d8200f', '#ff7a1a', '#ffd23f'] : ['#1550d8', '#3ab0ff', '#d8f6ff'];
      const fc = document.createElement('canvas'); fc.width = W; fc.height = H;
      const fg = fc.getContext('2d');
      const tongue = (a, len, wid, col) => {
        const bx = 18 + Math.cos(a) * 9, by = 19 + Math.sin(a) * 9;
        const tx = 18 + Math.cos(a) * (9 + len) + Math.cos(a + 1.6) * 2.5, ty = 19 + Math.sin(a) * (9 + len) - 2;
        const nx = Math.cos(a + Math.PI / 2) * wid, ny = Math.sin(a + Math.PI / 2) * wid;
        fg.fillStyle = col; fg.beginPath();
        fg.moveTo(bx + nx, by + ny);
        fg.quadraticCurveTo(bx + nx * 1.4 + (tx - bx) * 0.5, by + ny * 1.4 + (ty - by) * 0.5, tx, ty);
        fg.quadraticCurveTo(bx - nx * 1.2 + (tx - bx) * 0.45, by - ny * 1.2 + (ty - by) * 0.45, bx - nx, by - ny);
        fg.closePath(); fg.fill();
      };
      const flames = [];
      for (let k = 0; k < 8; k++) flames.push([-Math.PI / 2 + (k - 3.5) * 0.5 + ((seed + k) % 3 - 1) * 0.07, 7 + ((seed * (k + 3)) % 5)]);
      for (const [layer, col] of [[1, pal[0]], [0.66, pal[1]], [0.36, pal[2]]]) for (const [a, len] of flames) tongue(a, len * layer + 1, 3.2 * layer + 0.6, col);
      const fd = fg.getImageData(0, 0, W, H);
      for (let i = 3; i < fd.data.length; i += 4) fd.data[i] = fd.data[i] > 110 ? 255 : 0;
      fg.putImageData(fd, 0, 0);
      g.drawImage(fc, 0, 0);
      for (let k = 0; k < 6; k++) { g.fillStyle = pal[2 - (k % 2)]; g.fillRect(4 + ((seed * (k + 5)) % 28), 2 + ((seed * (k + 2)) % 10), 1, 1); }   // chispas
    } else if (aura === 'ice') {
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + seed, r = 13 + (k % 2) * 2; const x = Math.round(18 + Math.cos(a) * r), y = Math.round(18 + Math.sin(a) * r); g.fillStyle = '#e8f8ff'; g.fillRect(x, y - 1, 1, 3); g.fillRect(x - 1, y, 3, 1); g.fillStyle = '#9fd8ff'; g.fillRect(x, y, 1, 1); }
    } else if (aura === 'spark') {
      g.strokeStyle = F.key === 'ito' ? '#ff5ab0' : '#fff27a'; g.lineWidth = 1;
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + seed * 0.3; let x = 18 + Math.cos(a) * 12, y = 18 + Math.sin(a) * 12; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 3; j++) { x += Math.cos(a) * 1.8 + ((j + k) % 2 ? 1.2 : -1.2); y += Math.sin(a) * 1.8; g.lineTo(x, y); } g.stroke(); }
    } else if (aura === 'smoke') {
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, r = 12 + (k % 3); g.fillStyle = k % 2 ? 'rgba(30,10,50,0.55)' : 'rgba(90,40,140,0.45)'; g.beginPath(); g.arc(18 + Math.cos(a) * r, 18 + Math.sin(a) * r, 2.2, 0, Math.PI * 2); g.fill(); }
    } else if (aura === 'sand') {
      for (let k = 0; k < 16; k++) { const a = k * 0.8 + seed, r = 12 + (k % 4); g.fillStyle = k % 2 ? '#e8c87a' : '#b8954a'; g.fillRect(Math.round(18 + Math.cos(a) * r), Math.round(18 + Math.sin(a) * r), 1, 1); }
    } else if (aura === 'glow') {
      const gr = g.createRadialGradient(18, 18, 6, 18, 18, 17); gr.addColorStop(0, hexMix(col, '#ffffff', 0.4).replace('rgb', 'rgba').replace(')', ',0.5)')); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    // cuerpo: tonos por iluminación esférica (luz arriba a la izquierda) + remolinos con relieve
    const tones = (base) => [hexMix(base, '#000000', 0.55), hexMix(base, '#000000', 0.3), hexMix(base, '#000000', 0.08), hexMix(base, '#ffffff', 0.12), hexMix(base, '#ffffff', 0.38)];
    const T1 = tones(col), T2 = tones(swirl), EDGE_L = hexMix(swirl, '#ffffff', 0.45), EDGE_D = hexMix(swirl, '#000000', 0.6);
    const centers = [[12, 15], [7, 11], [17, 11], [7, 19], [17, 19], [12, 8]].map(([cx, cy], k) => [cx + ((seed + k * 13) % 3) - 1, cy + ((seed + k * 7) % 3) - 1]);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
      const u = (x + 0.5) * SC, v = (y + 0.5) * SC;
      if (!fruitInside(shape, u, v)) continue;
      // normal aproximada de una esfera centrada en la fruta
      const nx = (u - 12) / 9.4, ny = (v - 15) / 9.4, nz = Math.sqrt(Math.max(0.02, 1 - nx * nx - ny * ny));
      const lam = Math.max(0, -0.55 * nx - 0.6 * ny + 0.58 * nz);
      let lv = lam > 0.82 ? 4 : lam > 0.62 ? 3 : lam > 0.4 ? 2 : lam > 0.2 ? 1 : 0;
      if (nz < 0.35 && nx > 0.1 && ny > 0.1) lv = Math.min(4, lv + 1);   // luz rebotada en el borde de abajo
      let best = 0, bd = 1e9;
      for (let k = 0; k < centers.length; k++) { const d = (u - centers[k][0]) ** 2 + (v - centers[k][1]) ** 2; if (d < bd) { bd = d; best = k; } }
      const dx = u - centers[best][0], dy = v - centers[best][1];
      const r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * (best % 2 ? -1 : 1);
      const ph = ((ang / (Math.PI * 2) + r / 3.3) % 1 + 1) % 1;
      let cc;
      if (r < 0.6) cc = T2[Math.max(0, lv - 1)];
      else if (ph < 0.05) cc = EDGE_D;                       // sombra del remolino
      else if (ph < 0.3) cc = T2[lv];                        // la "cuerda" del remolino
      else if (ph < 0.36) cc = lv >= 2 ? EDGE_L : T2[lv];    // borde iluminado del remolino
      else cc = T1[lv];
      px(OX + x, OY + y, cc);
    }
    // brillo especular
    const hl = (x, y, a) => px(OX + Math.round(x / SC), OY + Math.round(y / SC), 'rgba(255,255,255,' + a + ')');
    hl(7, 9.5, 1); hl(8, 9, 1); hl(7.4, 10.4, 0.85); hl(8.6, 8.4, 0.7); hl(6.6, 11.4, 0.55); hl(16.5, 19.5, 0.35);
    // tallo rizado grueso y hoja con nervio
    const top = Math.round((shape === 'pear' ? 5 : shape === 'heart' ? 8 : shape === 'oval' ? 5 : 6) / SC) + OY;
    const stem = '#4a2c12', stemL = '#8a5a2a';
    const stemPts = [[18, top + 1], [18, top], [18, top - 1], [17, top - 2], [16, top - 3], [16, top - 4], [17, top - 5], [18, top - 6], [19, top - 6], [20, top - 5], [20, top - 4]];
    for (const [x, y] of stemPts) { px(x, y, stem); px(x + 1, y, stem); }
    px(17, top - 2, stemL); px(16, top - 4, stemL); px(18, top - 6, stemL);
    const leaf = '#2f8a46', leafL = '#6fcf7f', leafD = '#1f5f30';
    const leafPts = [[20, top], [21, top - 1], [22, top - 1], [23, top - 2], [24, top - 2], [25, top - 3], [21, top], [22, top], [23, top - 1], [24, top - 1], [25, top - 2], [26, top - 3]];
    for (const [x, y] of leafPts) px(x, y, leaf);
    px(22, top - 2, leafL); px(23, top - 3, leafL); px(24, top - 3, leafL);
    for (let k = 0; k < 5; k++) px(21 + k, top - (k >> 1), leafD);   // nervio
    // contorno oscuro (no sobre el aura ni la sombra: solo alrededor de cuerpo, tallo y hoja)
    const img = g.getImageData(0, 0, W, H), d = img.data;
    const body = new Uint8Array(W * H);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (fruitInside(shape, (x + 0.5) * SC, (y + 0.5) * SC)) body[(OY + y) * W + OX + x] = 1;
    for (const [x, y] of stemPts) { body[y * W + x] = 1; body[y * W + x + 1] = 1; }
    for (const [x, y] of leafPts) body[y * W + x] = 1;
    const isB = (x, y) => x >= 0 && y >= 0 && x < W && y < H && body[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (isB(x, y) || !(isB(x - 1, y) || isB(x + 1, y) || isB(x, y - 1) || isB(x, y + 1))) continue;
      const i = (y * W + x) * 4; d[i] = 22; d[i + 1] = 14; d[i + 2] = 26; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    fruitCache.set(fid, c);
    return c;
  }
  const fruitUrlCache = new Map();
  function fruitURL(fid) {
    if (!fruitUrlCache.has(fid)) fruitUrlCache.set(fid, fruit(fid).toDataURL());
    return fruitUrlCache.get(fid);
  }

  // ---------- Foto de acción para los carteles de SE BUSCA ----------
  // El personaje en plena pelea: golpe con líneas de velocidad o, si tiene fruta, lanzando su técnica (rayo, onda o aura del color de la fruta).
  const shotCache = new Map();
  function actionShot(o) {
    const app = o.app;
    const fid = o.fruit >= 0 ? o.fruit : -1;
    let seed = 0;
    for (const ch of String(o.name || '')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    // qué acción sale en la foto: técnica de su fruta, puñetazo, espadazo o patada voladora
    const acts = fid >= 0 ? ['fruit', 'fruit', 'punch', 'slash', 'leap'] : ['punch', 'slash', 'leap'];
    const act = acts[(seed >>> 3) % acts.length];
    const ab = act === 'fruit' && OP.MMO ? OP.MMO.abilityOf(fid) : null;
    const key = [app.skin, app.hair, app.hairColor, app.cloth, app.acc, app.build, o.faction, o.rank || 0, fid, o.dead ? 1 : 0, seed % 3, act].join('|');
    if (shotCache.has(key)) return shotCache.get(key);
    const W = 80, H = 64;
    const c = canvas(W, H), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const scene = seed % 3;
    // fondo: playa, puerto o cubierta de un barco
    const sky = g.createLinearGradient(0, 0, 0, 44);
    sky.addColorStop(0, '#f2c98a'); sky.addColorStop(1, '#f7ead0');
    g.fillStyle = sky; g.fillRect(0, 0, W, 46);
    if (scene === 0) { rect(0, 38, W, 8, '#8fc0d0'); rect(0, 38, W, 1, '#c8e4ec'); rect(0, 46, W, 18, '#e2c88e'); for (let x = 0; x < W; x += 7) rect(x + (seed % 5), 50 + (x % 3), 2, 1, '#c8aa6a'); }
    else if (scene === 1) { for (let x = 0; x < W; x += 13) { const h = 10 + ((x * 7 + seed) % 9); rect(x, 44 - h, 11, h, '#d8b890'); rect(x, 44 - h, 11, 2, '#b4553a'); rect(x + 4, 44 - h + 5, 2, 2, '#7a5a3a'); } rect(0, 44, W, 20, '#c8b08a'); for (let x = 0; x < W; x += 6) rect(x, 52 + (x % 2) * 5, 4, 1, '#a89068'); }
    else { rect(62, 0, 3, 46, '#7a5228'); rect(48, 6, 30, 16, '#efe6d0'); rect(48, 6, 30, 1, '#c8bca0'); rect(0, 44, W, 20, '#a8743a'); for (let y = 47; y < H; y += 4) rect(0, y, W, 1, '#7a5228'); }
    // líneas de velocidad hacia el punto del golpe
    const by = act === 'leap' ? -7 : 0;   // en la patada voladora el personaje está en el aire
    const ix = 54, iy = 31 + by;
    g.save();
    for (let k = 0; k < 28; k++) {
      const a = k / 28 * Math.PI * 2 + (seed % 7) * 0.05;
      const r0 = 12 + ((k * 13 + seed) % 7), r1 = 70;
      g.strokeStyle = k % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(60,40,20,0.22)';
      g.lineWidth = k % 3 ? 1 : 2;
      g.beginPath(); g.moveTo(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0); g.lineTo(ix + Math.cos(a) * r1, iy + Math.sin(a) * r1); g.stroke();
    }
    g.restore();
    // sombra y estela de movimiento detrás del personaje
    g.fillStyle = act === 'leap' ? 'rgba(40,25,10,0.2)' : 'rgba(40,25,10,0.35)'; g.beginPath(); g.ellipse(24, 58, act === 'leap' ? 9 : 15, act === 'leap' ? 2 : 3, 0, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 4; k++) rect(0, 24 + by + k * 7, 8 + ((seed + k * 5) % 8), 1, 'rgba(255,255,255,0.8)');
    if (act === 'leap') {   // estela del salto y polvo donde despegó
      for (let k = 0; k < 6; k++) rect(10 + k * 6, 52 + (k % 2) * 3, 1, 8 - (k % 3) * 2, 'rgba(255,255,255,0.85)');
      for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(225,205,170,0.9)'; g.beginPath(); g.arc(8 + k * 9, 59, 4 - (k % 2), 0, Math.PI * 2); g.fill(); }
    }
    // aura (fruta de mejora): silueta ampliada del color de la fruta detrás del cuerpo
    const body = chibi(app, o.faction, o.rank || 0, 'right', 1, true);
    if (ab && ab.kind === 'buff') {
      g.globalAlpha = 0.55;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -3], [0, 2], [-2, -2], [2, -2]]) g.drawImage(tint(body, ab.color), 2 + dx, 4 + by + dy, body.width * 2.5, body.height * 2.5);
      g.globalAlpha = 1;
      for (let k = 0; k < 10; k++) rect(8 + ((seed + k * 11) % 36), 6 + ((k * 17) % 44), 2, 2, k % 2 ? '#ffffff' : ab.color);
    }
    // el personaje (perfil derecho, brazo extendido)
    g.drawImage(body, 2, 4 + by, body.width * 2.5, body.height * 2.5);
    // el efecto del golpe
    const fx = 44, fy = 32 + by;   // donde queda el puño
    if (act === 'slash') {
      // espadazo: hoja en la mano y un gran tajo en media luna
      g.strokeStyle = '#5a3a20'; g.lineWidth = 3; g.beginPath(); g.moveTo(fx - 2, fy + 2); g.lineTo(fx + 2, fy - 2); g.stroke();
      g.strokeStyle = '#c8ccd8'; g.lineWidth = 3; g.beginPath(); g.moveTo(fx + 2, fy - 2); g.lineTo(fx + 17, fy - 18); g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.beginPath(); g.moveTo(fx + 3, fy - 4); g.lineTo(fx + 17, fy - 18); g.stroke();
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 6; g.beginPath(); g.arc(fx + 2, fy + 2, 24, -1.35, 0.95); g.stroke();
      g.strokeStyle = '#9fd8ff'; g.lineWidth = 2; g.beginPath(); g.arc(fx + 2, fy + 2, 21, -1.2, 0.85); g.stroke();
      g.lineCap = 'butt';
      for (let k = 0; k < 7; k++) { const a = -1.2 + k * 0.33, r = 28 + (k % 3) * 3; rect(fx + 2 + Math.cos(a) * r, fy + 2 + Math.sin(a) * r, 2, 2, k % 2 ? '#ffffff' : '#9fd8ff'); }
    } else if (ab && ab.kind === 'ranged') {
      rect(fx, fy - 4, W - fx, 9, ab.color); rect(fx, fy - 2, W - fx, 5, '#ffffff');
      g.fillStyle = ab.color; g.beginPath(); g.arc(fx + 2, fy, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(fx + 2, fy, 4, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 8; k++) rect(fx + 6 + k * 4, fy - 8 + ((k * 5 + seed) % 16), 2, 2, k % 2 ? '#ffffff' : ab.color);
    } else if (ab && ab.kind === 'aoe') {
      g.lineWidth = 3;
      for (let r = 8; r <= 30; r += 8) { g.strokeStyle = r === 16 ? '#ffffff' : ab.color; g.beginPath(); g.arc(ix, iy + 4, r, 0, Math.PI * 2); g.stroke(); }
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, r = 20 + ((k * 7) % 12); rect(ix + Math.cos(a) * r, iy + 4 + Math.sin(a) * r, 3, 3, k % 2 ? '#5a4a3a' : ab.color); }
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 1; g.beginPath(); g.moveTo(ix - 14, 52); g.lineTo(ix - 6, 49); g.lineTo(ix + 2, 53); g.lineTo(ix + 12, 49); g.lineTo(ix + 20, 54); g.stroke();
    } else if (!ab || ab.kind !== 'buff') {
      // golpe sin fruta: estrella de impacto
      g.fillStyle = '#ffffff'; g.beginPath();
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, r = k % 2 ? 6 : 15; g.lineTo(ix + Math.cos(a) * r, iy + Math.sin(a) * r); }
      g.closePath(); g.fill();
      g.fillStyle = '#ffd23f'; g.beginPath();
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + 0.2, r = k % 2 ? 4 : 9; g.lineTo(ix + Math.cos(a) * r, iy + Math.sin(a) * r); }
      g.closePath(); g.fill();
      if (act !== 'leap') for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(230,215,190,0.85)'; g.beginPath(); g.arc(4 + k * 6, 57 - (k % 2), 4 - k, 0, Math.PI * 2); g.fill(); }
    }
    // viñeta y tono de papel viejo
    const v = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 52);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(70,40,10,0.35)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    if (o.dead) {
      const img = g.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; d[i] = l; d[i + 1] = l * 0.95; d[i + 2] = l * 0.85; }
      g.putImageData(img, 0, 0);
    }
    const url = c.toDataURL();
    shotCache.set(key, url);
    return url;
  }
  // ---------- Fotos de élite (carteles de 350 M o más): 4 tipos de escena ----------
  // 0 PODER: lanza su técnica entre rayos · 1 AURA: silueta dentro de un remolino · 2 ESTALLIDO: salta entre una explosión
  // 3 RETRATO: primer plano con su barco detrás. El color del ataque es el de su fruta; sin fruta pelea con espadas (tajos de acero).
  const ELITE_KINDS = ['Poder', 'Aura', 'Estallido', 'Retrato'];
  function eliteShot(o, type) {
    const app = o.app;
    const fid = o.fruit >= 0 ? o.fruit : -1;
    const ab = fid >= 0 && OP.MMO ? OP.MMO.abilityOf(fid) : null;
    const sword = !ab;
    const col = ab ? ab.color : '#a8dcff';   // sin fruta: brillo del acero
    let seed = 0;
    for (const ch of String(o.name || '')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    type = (((type | 0) % 4) + 4) % 4;
    const key = 'e|' + [app.skin, app.hair, app.hairColor, app.cloth, app.acc, app.build, o.faction, o.rank || 0, fid, o.dead ? 1 : 0, type, seed % 7].join('|');
    if (shotCache.has(key)) return shotCache.get(key);
    const W = 128, H = 80;
    const c = canvas(W, H), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    let st = seed || 7;
    const rnd = () => (st = (Math.imul(st, 1103515245) + 12345) >>> 0) / 4294967296;
    const rect = (x, y, w, h, cl) => { g.fillStyle = cl; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const glow = (x, y, r, cl, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, cl); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; };
    const bolt = (x, y, ang, len, cl) => {   // rayo quebrado: color por fuera, blanco por dentro
      const pts = [[x, y]];
      let px = x, py = y;
      for (let k = 0; k < 6; k++) { px += Math.cos(ang) * len / 6 + (rnd() - 0.5) * 7; py += Math.sin(ang) * len / 6 + (rnd() - 0.5) * 7; pts.push([px, py]); }
      for (const [lw, s] of [[3, cl], [1, '#ffffff']]) { g.strokeStyle = s; g.lineWidth = lw; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke(); }
    };
    const slash = (x, y, r, a0, a1, cl) => {   // tajo de espada en media luna
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 6; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke();
      g.strokeStyle = cl; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r - 3, a0 + 0.1, a1 - 0.1); g.stroke();
      g.lineCap = 'butt';
    };
    const blade = (x, y, ang, len) => {
      g.strokeStyle = '#4a2e18'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - Math.cos(ang) * 4, y - Math.sin(ang) * 4); g.lineTo(x, y); g.stroke();
      g.strokeStyle = '#d6dbe6'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
    };
    const sparks = (x, y, n, r, cl) => { for (let k = 0; k < n; k++) { const a = rnd() * Math.PI * 2, d = r * (0.4 + rnd() * 0.8); rect(x + Math.cos(a) * d, y + Math.sin(a) * d, 2, 2, k % 3 ? cl : '#ffffff'); } };
    const body = chibi(app, o.faction, o.rank || 0, 'right', 1, true);

    if (type === 0) {
      // PODER: cielo de tormenta, rocas por el aire y la técnica saliendo de la mano
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#161c34'); sky.addColorStop(0.6, '#3b4262'); sky.addColorStop(1, '#5a5f78');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (let k = 0; k < 9; k++) { g.fillStyle = k % 2 ? 'rgba(90,96,128,0.55)' : 'rgba(25,30,52,0.6)'; g.beginPath(); g.ellipse(rnd() * W, rnd() * 40, 14 + rnd() * 16, 5 + rnd() * 5, 0, 0, Math.PI * 2); g.fill(); }
      for (let k = 0; k < 10; k++) { const x = rnd() * W, y = 6 + rnd() * 66, s = 2 + rnd() * 4; rect(x, y, s, s * 0.8, '#2a1d18'); rect(x, y, s, 1, '#5a4a40'); }
      const s = 2.7, bw = body.width * s, bh = body.height * s, bx = 10, by = H - bh + 4;
      const hx = bx + bw * 0.92, hy = by + bh * 0.42;
      glow(hx + 18, hy, 46, col, 0.55);
      g.drawImage(body, bx, by, bw, bh);
      if (sword) {
        blade(hx - 2, hy + 2, -0.75, 20);
        slash(hx + 4, hy + 4, 30, -1.4, 1.0, col); slash(hx + 10, hy + 2, 20, -1.1, 0.8, col);
        sparks(hx + 26, hy, 16, 22, col);
      } else {
        for (let k = 0; k < 9; k++) bolt(hx + 14, hy, -2.6 + k * 0.62 + rnd() * 0.3, 26 + rnd() * 26, col);
        glow(hx + 14, hy, 18, '#ffffff', 0.9);
        g.fillStyle = col; g.beginPath(); g.arc(hx + 14, hy, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(hx + 14, hy, 5, 0, Math.PI * 2); g.fill();
      }
    } else if (type === 1) {
      // AURA: remolino del color de su poder y el personaje casi en silueta
      const bg = g.createRadialGradient(W * 0.55, H * 0.45, 4, W * 0.55, H * 0.45, 80);
      bg.addColorStop(0, shade(col, 0.25)); bg.addColorStop(0.35, shade(col, -0.55)); bg.addColorStop(1, '#07040c');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (let arm = 0; arm < 6; arm++) {
        g.beginPath();
        for (let t = 0; t <= 1; t += 0.02) { const r = 3 + t * 75, a = t * 7 + arm * 1.047; const x = W * 0.55 + Math.cos(a) * r, y = H * 0.45 + Math.sin(a) * r * 0.62; t ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.strokeStyle = arm % 2 ? col : 'rgba(255,255,255,0.55)'; g.globalAlpha = 0.65; g.lineWidth = arm % 2 ? 3 : 1; g.stroke(); g.globalAlpha = 1;
      }
      sparks(W * 0.55, H * 0.45, 26, 50, col);
      rect(0, H - 10, W, 10, '#120a14');
      for (let x = 0; x < W; x += 9) rect(x, H - 13 + rnd() * 4, 7, 6, '#1c1020');
      const s = 2.2, bw = body.width * s, bh = body.height * s, bx = W * 0.55 - bw / 2, by = H - 8 - bh;
      glow(bx + bw / 2, by + bh / 2, 30, col, 0.7);
      const rim = tint(body, col), rimW = tint(body, '#ffffff');
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [-2, -2], [2, -2]]) g.drawImage(rim, bx + dx, by + dy, bw, bh);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) g.drawImage(rimW, bx + dx, by + dy, bw, bh);
      g.drawImage(tint(body, '#140a1c'), bx, by, bw, bh);
      if (sword) { blade(bx + bw * 0.9, by + bh * 0.5, 0.9, 16); sparks(bx + bw + 6, by + bh * 0.75, 8, 6, col); }
      // ojos que brillan
      rect(bx + bw * 0.62, by + bh * 0.27, 2, 1, '#ffffff');
    } else if (type === 2) {
      // ESTALLIDO: salta entre una explosión del color de su fruta, con una ciudad detrás (sin fruta: gran tajo en cruz)
      const fire = sword ? '#ff9a3c' : col;
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, shade(fire, -0.7)); sky.addColorStop(1, shade(fire, -0.25));
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // edificios con tejados de pagoda a la derecha
      for (let k = 0; k < 3; k++) {
        const x = 84 + k * 15 - (k === 1 ? 4 : 0), base = H - 4, hgt = 26 + (k === 1 ? 16 : rnd() * 10);
        rect(x, base - hgt, 14, hgt, '#2a1610');
        for (let f = 0; f < 3; f++) { const ry = base - hgt + f * 10; rect(x - 3, ry, 20, 2, '#120806'); rect(x - 4, ry - 1, 2, 2, '#120806'); rect(x + 16, ry - 1, 2, 2, '#120806'); rect(x + 4, ry + 4, 2, 3, shade(fire, 0.3)); rect(x + 9, ry + 4, 2, 3, shade(fire, 0.3)); }
      }
      rect(0, H - 4, W, 4, '#1a0e08');
      // la explosión
      const ex = 60, ey = 44;
      glow(ex, ey, 60, fire, 0.8);
      for (let k = 0; k < 18; k++) { const a = rnd() * Math.PI * 2, d = 6 + rnd() * 26; g.fillStyle = k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? shade(fire, 0.35) : fire; g.globalAlpha = 0.85; g.beginPath(); g.arc(ex + Math.cos(a) * d, ey + Math.sin(a) * d * 0.7, 5 + rnd() * 9, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      for (let k = 0; k < 12; k++) { const x = 6 + rnd() * 110, y = H - 6; g.fillStyle = k % 2 ? fire : shade(fire, 0.4); g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 1, y - 10 - rnd() * 16); g.lineTo(x + 5, y); g.fill(); }
      // el personaje en el aire, inclinado hacia delante, con estela
      const s = 2.5, bw = body.width * s, bh = body.height * s;
      for (let k = 0; k < 5; k++) rect(2, 18 + k * 7, 14 + rnd() * 12, 1, 'rgba(255,255,255,0.75)');
      g.save(); g.translate(30, 14); g.rotate(-0.18); g.drawImage(body, 0, 0, bw, bh); g.restore();
      const hx = 30 + bw * 0.92, hy = 14 + bh * 0.36;
      if (sword) {
        blade(hx - 2, hy, -0.6, 18);
        g.lineCap = 'round';
        for (const [x0, y0, x1, y1] of [[hx + 4, hy - 18, hx + 40, hy + 24], [hx + 4, hy + 24, hx + 40, hy - 18]]) {
          g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
          g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        }
        g.lineCap = 'butt';
        sparks(hx + 22, hy + 3, 18, 18, '#ffd23f');
      } else {
        glow(hx + 4, hy, 14, '#ffffff', 0.9);
        sparks(hx + 6, hy, 14, 12, col);
      }
    } else {
      // RETRATO: primer plano tranquilo, cielo azul y su barco detrás
      const sky = g.createLinearGradient(0, 0, 0, 56); sky.addColorStop(0, '#3d8fe0'); sky.addColorStop(1, '#bfe4fb');
      g.fillStyle = sky; g.fillRect(0, 0, W, 58);
      for (let k = 0; k < 6; k++) { const x = rnd() * W, y = 6 + rnd() * 26; g.fillStyle = '#ffffff'; for (let j = 0; j < 3; j++) { g.beginPath(); g.ellipse(x + j * 7, y - (j === 1 ? 3 : 0), 7, 4, 0, 0, Math.PI * 2); g.fill(); } }
      rect(0, 56, W, 24, '#2f7fc0'); rect(0, 56, W, 1, '#cfeaf8');
      for (let x = 0; x < W; x += 10) rect(x + rnd() * 6, 62 + rnd() * 14, 5, 1, '#8fc8ee');
      // barco: casco, mástil y gran vela con la bandera pirata (o de la Marina)
      const sx = 78;
      rect(sx, 50, 44, 8, '#6a4424'); rect(sx + 3, 58, 38, 4, '#4a2e18'); rect(sx, 50, 44, 2, '#8a5a30');
      rect(sx + 21, 8, 3, 42, '#5a3a1e');
      rect(sx + 8, 12, 30, 24, '#f2ead8'); rect(sx + 8, 12, 30, 2, '#d8ccb0'); rect(sx + 8, 34, 30, 2, '#d8ccb0');
      const fl = flag(o.faction === 'marine' ? { bg: '#f4f6f8', fg: '#2a5aa8', sym: 0 } : { bg: '#111', fg: '#f4f4f4', sym: seed % 6 });
      g.drawImage(fl, 0, 0, fl.width, fl.height, sx + 13, 15, 20, 15);
      rect(sx + 20, 4, 6, 4, o.faction === 'marine' ? '#2a5aa8' : '#111');
      // la cara grande a la izquierda, con viento
      const face = portrait({ app, faction: o.faction, rank: o.rank || 0, loc: o.dead ? 'dead' : 'island' }, { expr: o.dead ? '' : 'smirk' });
      const fs2 = 2.6, fw = face.width * fs2, fh = face.height * fs2;
      g.drawImage(face, 6, H - fh + 6, fw, fh);
      for (let k = 0; k < 6; k++) rect(fw + 4 + rnd() * 20, 10 + k * 9, 10 + rnd() * 10, 1, 'rgba(255,255,255,0.8)');
    }
    // viñeta de papel viejo
    const v = g.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 78);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,35,10,0.35)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    if (o.dead) {
      const img = g.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; d[i] = l; d[i + 1] = l * 0.95; d[i + 2] = l * 0.85; }
      g.putImageData(img, 0, 0);
    }
    const url = c.toDataURL();
    shotCache.set(key, url);
    return url;
  }
  // Foto de cara para carteles de menos de 100 millones: primer plano con un gesto (guiño, sonrisa, enfado...)
  const FACES = ['wink', 'grin', 'angry', 'smirk', 'laugh', ''];
  function faceShot(o) {
    const app = o.app;
    let seed = 0;
    for (const ch of String(o.name || '')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const expr = o.dead ? '' : FACES[(seed >>> 2) % FACES.length];
    const key = 'f|' + [app.skin, app.hair, app.hairColor, app.cloth, app.acc, app.build, o.faction, o.rank || 0, o.dead ? 1 : 0, expr, seed % 4].join('|');
    if (shotCache.has(key)) return shotCache.get(key);
    const W = 80, H = 64;
    const c = canvas(W, H), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    // fondo liso de papel con un tono distinto según la persona
    const tones = [['#efe0bf', '#d9c294'], ['#e8dcc8', '#cdbb98'], ['#f1e2c4', '#dcc69c'], ['#e9d9b6', '#cfb889']][seed % 4];
    const bg = g.createRadialGradient(W / 2, H / 2 - 6, 6, W / 2, H / 2, 50);
    bg.addColorStop(0, tones[0]); bg.addColorStop(1, tones[1]);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const face = portrait({ app, faction: o.faction, rank: o.rank || 0, loc: o.dead ? 'dead' : 'island' }, { expr });
    const s = 2.2, fw = face.width * s, fh = face.height * s;
    // pequeña inclinación de cabeza según el gesto
    g.save();
    g.translate(W / 2, H / 2 + 6);
    g.rotate(expr === 'smirk' ? -0.06 : expr === 'laugh' ? 0.05 : 0);
    g.drawImage(face, -fw / 2, -fh / 2, fw, fh);
    g.restore();
    // detalles del gesto: brillo del guiño, venita de enfado, gotas de risa
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    if (expr === 'wink') { rect(62, 14, 2, 6, '#ffffff'); rect(60, 16, 6, 2, '#ffffff'); }
    if (expr === 'angry') { const r = '#d02a2a'; rect(58, 10, 2, 5, r); rect(63, 10, 2, 5, r); rect(56, 12, 5, 2, r); rect(62, 12, 5, 2, r); }
    if (expr === 'laugh') { rect(14, 18, 3, 3, '#9fd8ff'); rect(63, 20, 3, 3, '#9fd8ff'); }
    const v = g.createRadialGradient(W / 2, H / 2, 22, W / 2, H / 2, 52);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(70,40,10,0.3)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    if (o.dead) {
      const img = g.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; d[i] = l; d[i + 1] = l * 0.95; d[i + 2] = l * 0.85; }
      g.putImageData(img, 0, 0);
    }
    const url = c.toDataURL();
    shotCache.set(key, url);
    return url;
  }
  // ---------- Foto de grupo de una tripulación: todos juntos en la cubierta de su barco ----------
  const groupCache = new Map();
  function groupPhoto(apps, faction, f, seedName) {
    apps = (apps || []).filter(Boolean).slice(0, 16);
    const key = 'g|' + faction + '|' + (f ? f.bg + f.fg + f.sym : '') + '|' + apps.map((a) => a.skin + a.hair + a.hairColor + a.cloth + a.acc + a.build).join(',');
    if (groupCache.has(key)) return groupCache.get(key);
    const W = 160, H = 96;
    const c = canvas(W, H), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    // cielo, mar y una isla al fondo
    const sky = g.createLinearGradient(0, 0, 0, 50); sky.addColorStop(0, '#7fc4f0'); sky.addColorStop(1, '#cfeaf8');
    g.fillStyle = sky; g.fillRect(0, 0, W, 52);
    rect(0, 44, W, 14, '#3f8ac8'); rect(0, 44, W, 1, '#a8d8f0');
    rect(118, 36, 30, 8, '#e2c88e'); rect(124, 30, 4, 8, '#7a5a2a'); rect(119, 26, 13, 5, '#3fa65a');
    // mástil y vela con la bandera
    rect(70, 2, 3, 52, '#5a3a1e');
    rect(48, 6, 48, 30, f ? f.bg : (faction === 'marine' ? '#f4f6f8' : '#111'));
    const fl = flag(f || { bg: '#111', fg: '#f4f4f4', sym: 0 });
    g.drawImage(fl, 0, 0, fl.width, fl.height, 60, 10, 25, 18);
    // cubierta de madera
    rect(0, 54, W, 42, '#a8743a');
    for (let y = 58; y < H; y += 6) rect(0, y, W, 1, '#7a5228');
    rect(0, 54, W, 3, '#6a4424'); rect(0, H - 6, W, 6, '#6a4424');
    // la tripulación: dos filas (la de atrás un poco más pequeña)
    const n = apps.length;
    const back = apps.slice(0, Math.floor(n / 2)), front = apps.slice(Math.floor(n / 2));
    const row = (list, y, s) => {
      const step = Math.min(22, (W - 16) / Math.max(1, list.length));
      const x0 = W / 2 - (step * (list.length - 1)) / 2;
      list.forEach((app, k) => { const b = chibi(app, faction, 0, 'down', 0, false); g.drawImage(b, Math.round(x0 + k * step - (b.width * s) / 2), y, b.width * s, b.height * s); });
    };
    row(back, 44, 1.5); row(front, 58, 1.7);
    const url = c.toDataURL();
    groupCache.set(key, url);
    return url;
  }
  // silueta de un sprite pintada de un color (para el aura)
  function tint(src, col) {
    const c = canvas(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  OP.Sprites = { portrait, portraitURL, person, chibi, flag, flagURL, ship, shade, fruit, fruitURL, actionShot, faceShot, groupPhoto, eliteShot, ELITE_KINDS };
})();
