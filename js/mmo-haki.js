/* MILESDEPIRATAS (online) - Efectos del HAKI y del ENTRENAMIENTO en el cliente (el servidor decide todo):
   - Observación activa: ves las siluetas de enemigos y jugadores cercanos por encima de todo (edificios, árboles...).
   - Aura del Rey: onda expansiva, rayos rojos y negros, aura, temblor y distorsión de pantalla y un golpe de sonido.
     Más nivel de maestría = más radio, más rayos y más intensidad.
   - Entrenando (T): aura dorada y partículas que suben · Aturdido: estrellas sobre la cabeza.
   La Armadura (negro metálico por niveles) la dibuja sprites.js en el propio personaje. */
(function () {
  'use strict';
  const OP = window.OP, Net = OP.Net, Main = OP.Main, MMO = OP.MMO;
  const conq = [];   // ondas del Aura del Rey en curso
  const zfx = [];    // humo de las transformaciones Bestia
  const ZOAN_COL = { wolf: '#9aa8b8', leopard: '#f0c040', bison: '#7a5232', elephant: '#a8a0b0', phoenix: '#4ab0ff', dragon: '#3a7ad8', dino: '#6a9a3a', ptera: '#b8c060', snake: '#5a8a3a', human: '#ffe14a' };
  Net.on('zoanfx', (m) => {
    zfx.push(Object.assign({ t0: performance.now(), seed: Math.random() * 6, col: ZOAN_COL[m.kind] || '#cccccc' }, m));
    if (zfx.length > 10) zfx.shift();
    if (OP.Audio) OP.Audio.sfx(m.on ? 'transform' : 'poof');
  });

  // silueta de un sprite pintada de un color (con caché)
  const tintCache = new Map();
  function tinted(img, col) {
    const k = col;
    let m = tintCache.get(img);
    if (!m) { m = new Map(); tintCache.set(img, m); }
    if (m.has(k)) return m.get(k);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    m.set(k, c);
    return c;
  }

  // ---------- Aura del Rey: llega la onda ----------
  Net.on('hakifx', (m) => {
    if (m.k !== 'conq') return;
    conq.push(Object.assign({ t0: performance.now(), seed: Math.random() * 1000 }, m));
    if (conq.length > 8) conq.shift();
    const [mx, my] = Main.myPos();
    const d = Math.hypot(mx - m.x, my - m.y);
    if (d < m.r * 2.2) { shake(m.lvl, d < m.r); boom(m.lvl, d / (m.r * 2.2)); }
  });
  function shake(lvl, inside) {
    const map = document.getElementById('map');
    if (!map) return;
    map.classList.remove('conq-shake'); void map.offsetWidth;
    map.style.setProperty('--shk', (3 + lvl * 2) + 'px');
    map.classList.add('conq-shake');
    setTimeout(() => map.classList.remove('conq-shake'), 700);
    const v = document.createElement('div');
    v.className = 'conq-vignette' + (inside ? ' in' : '');
    document.body.appendChild(v);
    setTimeout(() => v.remove(), 1300);
  }
  // sonido de impacto sintetizado (sin archivos): golpe grave + crujido eléctrico
  let actx = null;
  function boom(lvl, far) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, vol = Math.max(0.08, 0.5 * (1 - far)) * (0.7 + lvl * 0.1);
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 1.2);
      const len = Math.floor(actx.sampleRate * 0.6), buf = actx.createBuffer(1, len, actx.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2) * (Math.random() < 0.08 ? 1 : 0.35);
      const n = actx.createBufferSource(), f = actx.createBiquadFilter(), ng = actx.createGain();
      n.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; ng.gain.value = vol * 0.6;
      n.connect(f).connect(ng).connect(actx.destination); n.start(t + 0.05);
    } catch (e) { /* sin audio */ }
  }

  // rayo quebrado entre dos puntos
  function bolt(ctx, x0, y0, x1, y1, col, w, jag) {
    const n = 7;
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) { const k = i / n; ctx.lineTo(x0 + (x1 - x0) * k + (Math.random() - 0.5) * jag, y0 + (y1 - y0) * k + (Math.random() - 0.5) * jag); }
    ctx.lineTo(x1, y1); ctx.stroke();
  }

  // ---------- Objetos de los entrenamientos especiales (pixel art, con caché) ----------
  const propCache = new Map();
  function propSprite(kind) {
    if (propCache.has(kind)) return propCache.get(kind);
    const c = document.createElement('canvas'); c.width = 24; c.height = 24;
    const g = c.getContext('2d');
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    if (kind === 'shell') {   // caparazón de tortuga gigante (a la espalda)
      g.fillStyle = '#2f6a3a'; g.beginPath(); g.ellipse(12, 13, 11, 10, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4f9a4a'; g.beginPath(); g.ellipse(12, 12, 9, 8, 0, 0, Math.PI * 2); g.fill();
      for (const [x, y] of [[12, 8], [7, 12], [17, 12], [9, 17], [15, 17], [12, 13]]) { g.fillStyle = '#7fc86a'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.lineTo(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6); } g.fill(); }
      R(4, 20, 16, 2, '#7a5232'); R(3, 6, 2, 12, '#7a5232'); R(19, 6, 2, 12, '#7a5232');   // correas
    } else if (kind === 'logs') {   // troncos atados a la espalda
      for (let k = 0; k < 3; k++) { R(2, 6 + k * 5, 20, 4, '#8a5a2a'); R(2, 6 + k * 5, 20, 1, '#b07a3a'); R(1, 6 + k * 5, 2, 4, '#d8b87a'); R(21, 6 + k * 5, 2, 4, '#d8b87a'); }
      R(6, 4, 2, 18, '#5a3a1a'); R(16, 4, 2, 18, '#5a3a1a');
    } else if (kind === 'boulder') {   // roca enorme sobre la cabeza
      g.fillStyle = '#7a7268'; g.beginPath(); g.ellipse(12, 12, 11, 9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9a9288'; g.beginPath(); g.ellipse(9, 9, 5, 3, 0, 0, Math.PI * 2); g.fill();
      R(14, 14, 3, 2, '#5a524a'); R(6, 15, 2, 2, '#5a524a');
    } else if (kind === 'weights') {   // pesas
      R(1, 11, 22, 2, '#8a8a92'); R(0, 6, 4, 12, '#2a2a30'); R(20, 6, 4, 12, '#2a2a30'); R(4, 8, 2, 8, '#3a3a40'); R(18, 8, 2, 8, '#3a3a40');
    } else if (kind === 'sword') {   // espada de madera de entrenamiento
      R(11, 1, 3, 16, '#c8a060'); R(12, 1, 1, 15, '#e8c890'); R(8, 16, 9, 2, '#5a3a1a'); R(11, 18, 3, 5, '#3a2410');
    } else if (kind === 'spear') {   // lanza de práctica
      R(11, 3, 2, 21, '#8a5a2a'); R(10, 0, 4, 4, '#c8ccd8'); R(11, 0, 2, 1, '#ffffff');
    }
    propCache.set(kind, c);
    return c;
  }
  // dónde va cada objeto respecto al personaje (detrás = antes de dibujarle; delante = después)
  const PROP_BACK = { shell: 1, logs: 1 };
  function drawProp(ctx, w2s, z, t, p, front) {
    const kind = p.prop;
    if (!kind || (!!PROP_BACK[kind]) === front) return;
    const [x, y] = p.sid === Net.sid ? Main.myPos() : [p.rx, p.ry];
    const [sx, sy] = w2s(x, y);
    const s = Math.max(1, Math.round(z / 14));
    if (kind === 'waterfall') {   // cascada termal cayendo sobre él
      ctx.save();
      for (let k = 0; k < 7; k++) { const ph = (t * 3 + k / 7) % 1; ctx.fillStyle = k % 2 ? 'rgba(170,220,255,0.75)' : 'rgba(255,255,255,0.8)'; ctx.fillRect(sx - 6 * s + k * 2 * s, sy - 30 * s + ph * 26 * s, s * 1.5, 6 * s); }
      ctx.fillStyle = 'rgba(200,235,255,0.5)'; ctx.beginPath(); ctx.ellipse(sx, sy, 10 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (kind === 'meditate') return;   // solo el aura dorada
    const img = propSprite(kind);
    const bob = Math.sin(t * 6 + (p.cid || 0)) * s;
    let w = 24 * s, h = 24 * s, dx = 0, dy = -16 * s;
    if (kind === 'shell') { w = 20 * s; h = 20 * s; dx = -(p.dir || 1) * 2 * s; dy = -15 * s; }
    else if (kind === 'logs') { w = 18 * s; h = 18 * s; dx = -(p.dir || 1) * 2 * s; dy = -15 * s; }
    else if (kind === 'boulder') { dy = -34 * s + bob; }
    else if (kind === 'weights') { dy = (Math.sin(t * 3) > 0 ? -30 : -24) * s; }
    else if (kind === 'sword' || kind === 'spear') {   // la blande arriba y abajo
      ctx.save(); ctx.translate(sx + (p.dir || 1) * 7 * s, sy - 10 * s); ctx.rotate((p.dir || 1) * (0.4 + 0.9 * Math.abs(Math.sin(t * 4)))); ctx.drawImage(img, -12 * s, -20 * s, 24 * s, 24 * s); ctx.restore();
      return;
    }
    ctx.drawImage(img, Math.round(sx - w / 2 + dx), Math.round(sy + dy), w, h);
  }

  // ---------- Debajo de los personajes: auras (Rey y entrenamiento) ----------
  const prevWorld = OP.Render.hooks.world;
  OP.Render.hooks.world = function (ctx, w2s, z, t) {
    const now = performance.now();
    if (z >= 3.5) for (const p of Net.players.values()) if (p.training && p.prop && !p.boat && !p.inside) drawProp(ctx, w2s, z, t, p, false);   // caparazón y troncos, detrás del personaje
    if (z >= 3.5) {
      for (const p of Net.players.values()) {
        if (!p.training || p.boat) continue;
        const [x, y] = p.sid === Net.sid ? Main.myPos() : [p.rx, p.ry];
        const [sx, sy] = w2s(x, y);
        const pulse = 0.5 + 0.5 * Math.sin(t * 4 + (p.cid || 0));
        const gr = ctx.createRadialGradient(sx, sy - z * 0.5, 2, sx, sy - z * 0.5, z * (1.3 + pulse * 0.3));
        gr.addColorStop(0, 'rgba(255,220,110,0.45)'); gr.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy - z * 0.5, z * 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,214,90,' + (0.35 + pulse * 0.35) + ')'; ctx.lineWidth = Math.max(1, z * 0.08);
        ctx.beginPath(); ctx.ellipse(sx, sy, z * (0.7 + pulse * 0.2), z * (0.3 + pulse * 0.08), 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const e of conq) {   // aura oscura del que libera el Aura del Rey
      const age = (now - e.t0) / 1000;
      if (age > 2.2) continue;
      const [sx, sy] = w2s(e.x, e.y);
      const a = Math.max(0, 1 - age / 2.2) * (0.5 + e.lvl * 0.1);
      const gr = ctx.createRadialGradient(sx, sy - z * 0.5, 2, sx, sy - z * 0.5, z * (2 + e.lvl * 0.6));
      gr.addColorStop(0, 'rgba(120,0,10,' + a + ')'); gr.addColorStop(0.5, 'rgba(30,0,10,' + a * 0.7 + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy - z * 0.5, z * (2 + e.lvl * 0.6), 0, Math.PI * 2); ctx.fill();
    }
    return prevWorld.apply(this, arguments);
  };

  // ---------- Encima de todo: Observación, ondas y rayos del Rey, aturdidos, partículas ----------
  const prevOverlay = OP.Render.hooks.overlay;
  OP.Render.hooks.overlay = function (ctx, w2s, z) {
    const r = prevOverlay.apply(this, arguments);
    const now = performance.now(), t = now / 1000;
    const self = Net.players.get(Net.sid);
    // Observación: siluetas de todos los que hay cerca, por encima de edificios y árboles
    if (self && self.obs && z >= 2.5) {
      const [mx, my] = Main.myPos();
      const R = MMO.HAKI_ACTIVE.obs.range;
      const s = Math.max(1, Math.round(z / 14));
      ctx.save();
      const draw = (x, y, img, col) => {
        const [sx, sy] = w2s(x, y);
        const k = 0.55 + 0.25 * Math.sin(t * 5 + x);
        ctx.globalAlpha = k;
        const sil = tinted(img, col), w = sil.width * s, h = sil.height * s;
        ctx.drawImage(sil, Math.round(sx - w / 2), Math.round(sy - h + s * 2), w, h);
        ctx.globalAlpha = k * 0.6; ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.45, Math.max(2, s * 2.5), 0, 0, Math.PI * 2); ctx.stroke();
      };
      for (const a of OP.S.agents || []) {
        if (!a.app || Math.hypot(a.x - mx, a.y - my) > R) continue;
        const hostile = a.engaged || a.faction !== Net.me.faction;
        draw(a.x, a.y, OP.Sprites.chibi(a.app, a.faction, a.rank || 0, 'down', 0, false), hostile ? '#ff4a4a' : '#7fd7ff');
      }
      for (const p of Net.players.values()) {
        if (p.sid === Net.sid || p.boat) continue;
        if (Math.hypot(p.rx - mx, p.ry - my) > R) continue;
        const friend = p.crewId && p.crewId === Net.me.crewId;
        draw(p.rx, p.ry, OP.Sprites.chibi(p.app, p.faction, p.rank, 'down', 0, false), friend ? '#5ef08a' : p.faction !== Net.me.faction ? '#ff8a3a' : '#c9a7ff');
      }
      ctx.restore();
      // anillo de percepción alrededor de ti
      const [cx, cy] = w2s(mx, my);
      ctx.save();
      ctx.strokeStyle = 'rgba(190,140,255,' + (0.25 + 0.15 * Math.sin(t * 3)) + ')'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(cx, cy, R * z * ((t * 0.4) % 1), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // Aura del Rey: onda expansiva y rayos rojos y negros
    for (let i = conq.length - 1; i >= 0; i--) {
      const e = conq[i];
      const age = (now - e.t0) / 1000;
      if (age > 1.8) { conq.splice(i, 1); continue; }
      const [sx, sy] = w2s(e.x, e.y);
      const grow = Math.min(1, age / 0.55);
      const rad = e.r * z * (0.15 + 0.85 * grow);
      const fade = Math.max(0, 1 - age / 1.8);
      ctx.save();
      // anillos (negro grueso con borde rojo) y distorsión
      ctx.globalAlpha = fade;
      ctx.lineWidth = Math.max(4, z * (0.5 + e.lvl * 0.12)) * (1 - grow * 0.5);
      ctx.strokeStyle = 'rgba(8,0,6,0.9)'; ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = Math.max(2, z * 0.12); ctx.strokeStyle = '#ff2a2a'; ctx.beginPath(); ctx.ellipse(sx, sy, rad * 1.02, rad * 0.64, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = fade * 0.25; ctx.fillStyle = '#300008'; ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      // rayos: más y más largos con más nivel
      if (age < 1.4) {
        ctx.globalAlpha = fade;
        const nb = 5 + e.lvl * 3;
        for (let k = 0; k < nb; k++) {
          const ang = (k / nb) * Math.PI * 2 + e.seed + age * 2;
          const L = z * (1.2 + e.lvl * 0.55) * (0.6 + Math.random() * 0.6) + rad * 0.35;
          const x1 = sx + Math.cos(ang) * L, y1 = sy - z * 0.6 + Math.sin(ang) * L * 0.7;
          const red = k % 2 === 0;
          bolt(ctx, sx, sy - z * 0.6, x1, y1, red ? '#ff1a1a' : '#0a0006', Math.max(2, z * (red ? 0.16 : 0.22)), z * 0.7);
          if (red) bolt(ctx, sx, sy - z * 0.6, x1, y1, 'rgba(255,220,220,0.8)', 1, z * 0.3);
        }
      }
      ctx.restore();
    }
    // objetos de entrenamiento que van delante (pesas, roca, espada, lanza, cascada)
    if (z >= 3.5) for (const p of Net.players.values()) if (p.training && p.prop && !p.boat && !p.inside) drawProp(ctx, w2s, z, t, p, true);
    // nubes de humo/energía de las transformaciones Bestia
    for (let i = zfx.length - 1; i >= 0; i--) {
      const e = zfx[i], age = (now - e.t0) / 1000;
      if (age > 1) { zfx.splice(i, 1); continue; }
      const [sx, sy] = w2s(e.x, e.y);
      ctx.save();
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * Math.PI * 2 + e.seed, r = z * (0.4 + age * 1.6);
        ctx.globalAlpha = Math.max(0, 0.85 - age);
        ctx.fillStyle = k % 3 === 0 ? e.col : k % 3 === 1 ? 'rgba(230,230,230,0.9)' : 'rgba(150,150,160,0.9)';
        ctx.beginPath(); ctx.arc(sx + Math.cos(a) * r, sy - z * 0.6 + Math.sin(a) * r * 0.7, z * (0.35 + age * 0.4), 0, Math.PI * 2); ctx.fill();
      }
      if (e.on && age < 0.5) { ctx.globalAlpha = 1 - age * 2; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(sx, sy - z * 0.6, z * (0.6 + age * 2), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // aturdidos: estrellas girando · entrenando: chispas doradas que suben
    if (z >= 3.5) {
      for (const p of Net.players.values()) {
        if (!(p.stun || p.training) || p.boat) continue;
        const [x, y] = p.sid === Net.sid ? Main.myPos() : [p.rx, p.ry];
        const [sx, sy] = w2s(x, y);
        ctx.save();
        if (p.stun) {
          for (let k = 0; k < 3; k++) {
            const a = t * 4 + k * 2.09;
            ctx.fillStyle = '#ffe14a'; ctx.font = '700 ' + Math.max(10, z * 0.55) + 'px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('★', sx + Math.cos(a) * z * 0.6, sy - z * 1.55 + Math.sin(a) * z * 0.2);
          }
        }
        if (p.training) {
          for (let k = 0; k < 6; k++) {
            const ph = (t * 0.8 + k / 6) % 1;
            ctx.globalAlpha = 1 - ph;
            ctx.fillStyle = k % 2 ? '#ffd24a' : '#fff4c0';
            const s = Math.max(2, z * 0.12);
            ctx.fillRect(sx + Math.sin(k * 2.3 + t) * z * 0.6, sy - ph * z * 2, s, s);
          }
        }
        ctx.restore();
      }
    }
    // Observación activa: borde morado en tu pantalla
    const ov = document.getElementById('obs-vignette');
    const on = !!(self && self.obs);
    if (on && !ov) { const d = document.createElement('div'); d.id = 'obs-vignette'; document.body.appendChild(d); }
    else if (!on && ov) ov.remove();
    return r;
  };
})();
