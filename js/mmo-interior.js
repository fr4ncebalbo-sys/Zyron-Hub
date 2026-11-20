/* MILESDEPIRATAS (online) - EDIFICIOS POR DENTRO en el cliente (estilo RPG clásico de 16 bits):
   - Junto a la puerta de una taberna, clínica o casa: E para entrar. Fundido a negro y la escena cambia a la sala.
   - Dentro no se ve el mapa de fuera; solo los jugadores que están en la misma sala.
   - E junto a un personaje: hablar (cuadro de diálogo abajo). Para salir, anda por la puerta (o E junto a ella).
   El servidor (server/interiors.js) valida todo; las salas y sus NPC están en js/interiors.js. */
(function () {
  'use strict';
  const OP = window.OP, Net = OP.Net, UI = OP.UI, Main = OP.Main, IN = OP.Interiors;
  const $ = (q) => document.querySelector(q);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Fundido a negro ----------
  function fade(mid) {
    let f = $('#fade');
    if (!f) { f = document.createElement('div'); f.id = 'fade'; document.body.appendChild(f); }
    f.classList.add('on');
    setTimeout(() => { try { mid(); } finally { setTimeout(() => f.classList.remove('on'), 60); } }, 260);
  }

  Net.on('room', (m) => {
    if (OP.Audio) OP.Audio.sfx('door');
    fade(() => {
      if (m.k === 'enter') {
        Main.room = { door: m.door, kind: m.door.kind, npcs: m.npcs };
        Main.setPred(m.x, m.y);
      } else {
        Main.room = null;
        closeDialog();
        if (m.x != null) { Main.setPred(m.x, m.y); OP.Render.centerOn(m.x, m.y); }
      }
      UI.renderPanel(true);
    });
  });

  // ---------- E: entrar, hablar, salir ----------
  const nearNpc = () => {
    if (!Main.room) return null;
    const [x, y] = Main.myPos();
    let best = null, bd = 1.9;
    for (const n of Main.room.npcs) { const d = Math.hypot(n.x + 0.5 - x, n.y + 0.5 - y); if (d < bd) { bd = d; best = n; } }
    return best;
  };
  const nearExit = () => {
    if (!Main.room) return false;
    const R = IN.ROOMS[Main.room.kind], [x, y] = Main.myPos();
    return y > R.h - 2.4 && Math.abs(x - (R.map[R.h - 1].indexOf('D') + 0.5)) < 1.3;
  };
  Main.doorKey = function () {
    if (dlg) { advance(); return true; }
    if (Main.room) {
      const n = nearNpc();
      if (n) { Net.send('talk', { npc: n.id }); return true; }
      if (nearExit()) { Net.send('door', { op: 'exit' }); return true; }
      return true;   // dentro, E no explora
    }
    if (!Net.me || Net.me.boat) return false;
    const [x, y] = Main.myPos();
    const d = IN.nearDoor(x, y, 1.6);
    if (d) { Net.send('door', { op: 'enter', id: d.id }); return true; }
    return false;
  };
  Main.doorHint = function () {
    if (Main.room) {
      const n = nearNpc();
      if (n) return '💬 E: hablar con ' + n.name;
      if (nearExit()) return '🚪 Sal por la puerta (o pulsa E)';
      return '🏠 ' + Main.room.door.name + ' · anda hasta la puerta para salir';
    }
    if (!Net.me || Net.me.boat) return '';
    const [x, y] = Main.myPos();
    const d = IN.nearDoor(x, y, 1.6);
    return d ? (d.kind === 'tavern' ? '🍺' : d.kind === 'clinic' ? '⚕️' : '🏠') + ' E: entrar en ' + d.name : '';
  };

  // ---------- Diálogo estilo RPG (abajo de la pantalla) ----------
  let dlg = null;
  Net.on('dialog', (m) => { dlg = { m, i: 0 }; renderDialog(); if (OP.Audio) OP.Audio.sfx('talk'); });
  function closeDialog() { dlg = null; const b = $('#rpg-dialog'); if (b) b.remove(); }
  function advance() {
    if (!dlg) return;
    if (dlg.i < dlg.m.lines.length - 1) { dlg.i++; renderDialog(); if (OP.Audio) OP.Audio.sfx('blip'); }
    else if (!dlg.m.options.length) closeDialog();
  }
  function renderDialog() {
    let b = $('#rpg-dialog');
    if (!b) {
      b = document.createElement('div'); b.id = 'rpg-dialog';
      document.body.appendChild(b);
      b.addEventListener('click', (e) => {
        const o = e.target.closest('[data-dopt]');
        if (o) { Net.send('talk', { npc: dlg.m.npc, opt: o.dataset.dopt }); return; }
        if (e.target.closest('[data-dclose]')) return closeDialog();
        advance();
      });
    }
    const m = dlg.m, last = dlg.i >= m.lines.length - 1;
    const face = m.app ? OP.Sprites.chibi(m.app, 'pirate', 0, 'down', 0, false).toDataURL() : '';
    b.innerHTML = `<div class="rd-face">${face ? `<img src="${face}" alt="">` : ''}</div>
      <div class="rd-body"><div class="rd-name">${esc(m.name)}</div><div class="rd-text">${esc(m.lines[dlg.i])}</div>
        ${last && m.options.length ? `<div class="rd-opts">${m.options.map((o) => `<button data-dopt="${esc(o.opt)}">${esc(o.label)}</button>`).join('')}<button data-dclose="1">Adiós</button></div>`
          : `<div class="rd-more">${last ? '✖ Cerrar' : '▼ Siguiente (E o clic)'}</div>`}</div>`;
  }
  document.addEventListener('keydown', (e) => { if (dlg && e.key === 'Escape') closeDialog(); });

  // ---------- Dibujo de la sala ----------
  const prevDraw = OP.Render.draw;
  OP.Render.draw = function (now) {
    if (!Main.room) return prevDraw.apply(this, arguments);
    return drawRoom(now / 1000);
  };
  const FLOOR = { tavern: ['#8a5a32', '#7a4e2a'], house: ['#a8784a', '#98683e'], clinic: ['#e8e4dc', '#d8d2c6'] };
  const WALL = { tavern: '#5a3a24', house: '#c8a878', clinic: '#b8c8d8' };
  function drawRoom(t) {
    const cv = document.getElementById('map');
    const ctx = cv.getContext('2d');
    const Wc = cv.clientWidth, Hc = cv.clientHeight, dpr = cv.width / Math.max(1, Wc);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, Wc, Hc);
    const kind = Main.room.kind, R = IN.ROOMS[kind];
    const TOP = 58;   // debajo de la barra superior
    const ts = Math.max(22, Math.min(72, Math.floor(Math.min(Wc / (R.w + 1), (Hc - TOP) / (R.h + 1.4)))));
    const ox = Math.round((Wc - R.w * ts) / 2), oy = Math.round(TOP + (Hc - TOP - R.h * ts) / 2 + ts * 0.45);
    const T = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(ox + x * ts), Math.round(oy + y * ts), Math.ceil(w * ts), Math.ceil(h * ts)); };
    const [f1, f2] = FLOOR[kind], wall = WALL[kind];
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
      const c = R.map[y][x];
      // suelo debajo de todo
      if (kind === 'clinic') T(x, y, 1, 1, (x + y) % 2 ? f1 : f2);
      else { T(x, y, 1, 1, f1); T(x, y + 0.48, 1, 0.04, f2); if ((x + y) % 2) T(x + 0.5, y, 0.04, 0.5, f2); }
      if (c === '#') {
        if (y === 0) { T(x, y - 0.4, 1, 1.4, OP.shade(wall, -0.35)); T(x, y + 0.75, 1, 0.25, OP.shade(wall, -0.15)); }
        else if (y === R.h - 1) T(x, y, 1, 1, OP.shade(wall, -0.4));
        else T(x, y, 1, 1, OP.shade(wall, -0.3));
      } else if (y === 1 && 'SWFMK'.indexOf(c) >= 0 || (y === 1 && c === 'b')) T(x, y - 0.2, 1, 0.8, wall);   // pared del fondo
      switch (c) {
        case 'S': T(x + 0.05, y - 0.1, 0.9, 0.75, '#6a4424'); for (let k = 0; k < 3; k++) T(x + 0.12 + k * 0.28, y + 0.05, 0.16, 0.25, ['#3fa65a', '#c0392b', '#e8c050'][(x + k) % 3]); T(x + 0.05, y + 0.32, 0.9, 0.06, '#4a2e18'); break;
        case 'M': T(x + 0.05, y - 0.1, 0.9, 0.75, '#e8e8f0'); for (let k = 0; k < 3; k++) T(x + 0.12 + k * 0.28, y + 0.05, 0.16, 0.3, ['#4ab0ff', '#ff6a8a', '#7fd07f'][(x + k) % 3]); break;
        case 'W': T(x + 0.15, y - 0.1, 0.7, 0.55, '#3a2a1a'); T(x + 0.2, y - 0.05, 0.6, 0.45, '#9fd8ff'); T(x + 0.48, y - 0.05, 0.04, 0.45, '#3a2a1a'); break;
        case 'F': T(x + 0.1, y - 0.1, 0.8, 0.8, '#5a524a'); T(x + 0.25, y + 0.25, 0.5, 0.4, '#1a1010'); T(x + 0.3 + Math.sin(t * 8) * 0.03, y + 0.35, 0.4, 0.25, '#ff8a2a'); T(x + 0.4, y + 0.3, 0.2, 0.15, '#ffd23f'); break;
        case 'K': T(x + 0.05, y + 0.05, 0.9, 0.9, '#f4f0e8'); T(x + 0.05, y + 0.05, 0.9, 0.3, '#ffffff'); T(x + 0.05, y + 0.45, 0.9, 0.5, '#c84a4a'); break;
        case 'b': T(x + 0.15, y + 0.1, 0.7, 0.8, '#8a5a2a'); T(x + 0.15, y + 0.25, 0.7, 0.06, '#4a2e18'); T(x + 0.15, y + 0.7, 0.7, 0.06, '#4a2e18'); break;
        case 'B': T(x, y + 0.15, 1, 0.85, '#6a3e1e'); T(x, y + 0.15, 1, 0.18, '#a8743a'); if (x % 2) T(x + 0.35, y - 0.05, 0.3, 0.25, '#e8c050'); break;
        case 'C': T(x, y + 0.15, 1, 0.85, '#d8dce4'); T(x, y + 0.15, 1, 0.18, '#ffffff'); if (x % 2) T(x + 0.3, y - 0.05, 0.25, 0.25, '#7fd07f'); break;
        case 'T': T(x + 0.08, y + 0.15, 0.84, 0.7, '#a8743a'); T(x + 0.08, y + 0.15, 0.84, 0.15, '#c8945a'); T(x + 0.4, y + 0.3, 0.2, 0.2, '#f4f0e8'); break;
        case 'c': T(x + 0.25, y + 0.3, 0.5, 0.5, '#7a4e2a'); T(x + 0.25, y + 0.3, 0.5, 0.12, '#9a6a3a'); break;
        case 'P': T(x + 0.3, y + 0.55, 0.4, 0.4, '#a8743a'); T(x + 0.15, y + 0.1, 0.7, 0.5, '#3fa65a'); T(x + 0.3, y, 0.4, 0.3, '#5fc66a'); break;
        case 'R': T(x + 0.04, y + 0.04, 0.92, 0.92, kind === 'clinic' ? '#7aa8d8' : '#b8323a'); T(x + 0.18, y + 0.18, 0.64, 0.64, kind === 'clinic' ? '#9ac0e8' : '#d8a040'); break;
        case 'O': T(x + 0.1, y + 0.3, 0.8, 0.6, '#2a2a30'); T(x + 0.15, y + 0.3, 0.7, 0.2, '#5fd07f'); if (Math.sin(t * 5 + x) > 0) T(x + 0.4, y + 0.1, 0.15, 0.15, '#9ff0a8'); break;
        case 'D': T(x + 0.1, y, 0.8, 1, '#1a1208'); T(x + 0.15, y - 0.15, 0.7, 0.3, '#c8a050'); T(x + 0.42, y + 0.2 + (Math.sin(t * 4) * 0.08), 0.16, 0.35, '#ffe14a'); break;
      }
    }
    // personajes (de arriba abajo): NPC, otros jugadores de esta sala y tú
    const s = ts / 16;
    const list = [];
    for (const n of Main.room.npcs) list.push({ x: n.x + 0.5, y: n.y + 0.85, app: n.app, faction: 'pirate', rank: 0, face: 'down', name: n.name, npc: n });
    for (const p of Net.players.values()) if (p.sid !== Net.sid && p.inside === Main.room.door.id) list.push({ x: p.rx, y: p.ry, app: p.app, faction: p.faction, rank: p.rank, face: p.dir < 0 ? 'left' : 'right', walk: p.moving, name: p.name, zoan: '' });
    const [mx, my] = Main.myPos();
    const self = Net.players.get(Net.sid);
    if (self) list.push({ x: mx, y: my, app: self.app, faction: self.faction, rank: self.rank, face: Main.faceNow ? Main.faceNow() : 'down', walk: Main.walkingNow ? Main.walkingNow() : false, name: self.name, me: true });
    list.sort((a, b) => a.y - b.y);
    const near = nearNpc();
    for (const e of list) {
      const img = OP.Sprites.chibi(e.app, e.faction, e.rank, e.face, e.walk ? 1 + (Math.floor(t * 7) % 2) : 0, false);
      const w = img.width * s * 1.15, h = img.height * s * 1.15;
      const sx = ox + e.x * ts, sy = oy + e.y * ts;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.3, s * 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h + s * 2), w, h);
      ctx.font = '700 ' + Math.max(11, Math.round(ts * 0.26)) + 'px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,8,14,0.85)';
      const label = e.npc ? (e.npc.story ? '⭐ ' : e.npc.secret ? '❔ ' : '') + e.name : e.name;
      ctx.strokeText(label, sx, sy - h - 2); ctx.fillStyle = e.npc ? (e.npc.story ? '#ffd23f' : '#ffffff') : e.me ? '#7fe0a0' : '#9fd8ff'; ctx.fillText(label, sx, sy - h - 2);
      if (e.npc && near === e.npc) { ctx.font = Math.round(ts * 0.45) + 'px sans-serif'; ctx.fillText('💬', sx + w * 0.45, sy - h + Math.sin(t * 5) * 3); }
    }
    // nombre del sitio
    ctx.font = '800 ' + Math.max(14, Math.round(ts * 0.32)) + 'px "Pirata One", Georgia, serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(Main.room.door.name, Wc / 2, oy - ts * 0.45); ctx.fillStyle = '#ffd23f'; ctx.fillText(Main.room.door.name, Wc / 2, oy - ts * 0.45);
  }

  // ---------- Fuera: carteles sobre las puertas cercanas ----------
  const prevOverlay = OP.Render.hooks.overlay;
  OP.Render.hooks.overlay = function (ctx, w2s, z) {
    const r = prevOverlay.apply(this, arguments);
    if (Main.room || z < 5 || !Net.me) return r;
    const [mx, my] = Main.myPos();
    const t = performance.now() / 1000;
    for (const d of IN.doors()) {
      if (Math.abs(d.x - mx) > 14 || Math.abs(d.y - my) > 10) continue;
      const [sx, sy] = w2s(d.x, d.y);
      const close = Math.hypot(d.x - mx, d.y + 0.3 - my) < 1.6;
      ctx.save();
      ctx.font = Math.max(12, Math.round(z * 0.7)) + 'px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(d.kind === 'tavern' ? '🍺' : d.kind === 'clinic' ? '⚕️' : '🚪', sx, sy - z * 1.9 + Math.sin(t * 3 + d.x) * 2);
      if (close) {
        ctx.font = '800 ' + Math.max(11, Math.round(z * 0.5)) + 'px Inter, sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText('E · Entrar', sx, sy - z * 2.6); ctx.fillStyle = '#ffe14a'; ctx.fillText('E · Entrar', sx, sy - z * 2.6);
      }
      ctx.restore();
    }
    return r;
  };
})();
