/* MILESDEPIRATAS (online) - EJECUCIÓN PÚBLICA en el cliente: anuncio mundial con cuenta atrás, últimas palabras,
   plataforma en la plaza de Bastión Central, rescate (mantener E o el botón) y el efecto de la ejecución.
   Todo lo decide el servidor (server/execution.js): aquí solo se muestra y se mandan las intenciones. */
(function () {
  'use strict';
  const OP = window.OP, Net = OP.Net, UI = OP.UI, Main = OP.Main, MMO = OP.MMO;
  const EX = MMO.EXECUTION;
  const $ = (q) => document.querySelector(q);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const X = (Main.exec = { list: new Map(), spot: null, holding: false, wordsSent: false });

  const put = (e) => {
    const o = X.list.get(e.cid) || {};
    for (const k of ['cid', 'sid', 'name', 'bounty', 'by', 'words', 'x', 'y']) if (e[k] != null) o[k] = e[k];
    if (e.left != null) o.end = Date.now() + e.left;
    if (e.rescuer != null) { o.rescuer = e.rescuer; o.rescueEnd = e.rescuer && e.holdLeft ? Date.now() + e.holdLeft : 0; }
    if (e.x != null) X.spot = { x: e.x, y: e.y };
    X.list.set(e.cid, o);
    return o;
  };
  const mine = (o) => Net.me && o.cid === Net.me.cid;
  const secs = (o) => Math.max(0, Math.ceil((o.end - Date.now()) / 1000));

  // ---------- Mensajes del servidor ----------
  Net.on('exec', (m) => {
    const now = Date.now();
    if (m.k === 'list') { X.list.clear(); for (const e of m.items || []) put(e); if (m.spot) X.spot = m.spot; return render(); }
    if (m.k === 'start' || m.k === 'update') {
      const o = put(m);
      if (m.k === 'start') {
        if (mine(o)) X.wordsSent = false;
        announce('⚔️ EJECUCIÓN PÚBLICA', o.name, OP.fmtB(o.bounty), mine(o) ? 'Te han encadenado. Di tus últimas palabras...' : (m.forced ? 'Por orden del Gobierno Mundial' : 'Capturado por ' + o.by) + ' · 60 segundos para rescatarlo en Bastión Central', 'red');
        if (OP.Render.ping) { OP.Render.ping(o.x, o.y); setTimeout(() => OP.Render.ping(o.x, o.y), 900); }
      }
      return render();
    }
    const o = X.list.get(m.cid);
    if (m.k === 'words') { if (o) o.words = m.text; showWords(m.name, m.text); return render(); }
    if (m.k === 'rescue') { if (o) { o.rescuer = m.by; o.rescueEnd = now + (m.ms || EX.holdMs); } return render(); }
    if (m.k === 'rescuestop') { if (o) { o.rescuer = ''; o.rescueEnd = 0; } if (Net.me && m.by === Net.me.name) X.holding = false; return render(); }
    if (m.k === 'rescued') { X.list.delete(m.cid); X.holding = false; announce('🔓 ¡RESCATADO!', m.name, '', '¡' + m.by + ' rompe sus cadenas en plena ejecución!', 'gold'); return render(); }
    if (m.k === 'executed') {
      X.list.delete(m.cid); X.holding = false; slash(m.name, m.bounty);
      const dd = $('#dead');
      if (dd && Net.me && m.cid === Net.me.cid) {   // tras la ejecución se despierta en la isla de origen
        const old = dd.innerHTML;
        dd.innerHTML = '<b>⚔️ Has sido ejecutado</b><span>Despertarás en tu isla de origen...</span>';
        setTimeout(() => { dd.innerHTML = old; }, 15000);
      }
      return render();
    }
    if (m.k === 'cancel') { X.list.delete(m.cid); X.holding = false; UI.toast('📜 Se suspende la ejecución de ' + m.name + '.', true, true); return render(); }
  });
  // Nueva Era: el administrador ha reiniciado todos los personajes
  Net.on('era', (m) => {
    Main.eraOver = true;
    const d = document.createElement('div');
    d.id = 'era-over';
    d.innerHTML = `<div class="era-box"><div class="era-sun">🌅</div><h1>NUEVA ERA</h1><p>${esc(m.text || 'Comienza una nueva era de la piratería.')}</p>
      <button class="gold" id="era-go">Crear mi nuevo personaje</button></div>`;
    document.body.appendChild(d);
    $('#era-go').addEventListener('click', () => location.reload());
  });

  // Anuncio mundial del administrador (en grande, como los de la ejecución) y aviso de expulsión
  Net.on('announce', (m) => announce('📢 ' + (m.title || 'ANUNCIO DEL GOBIERNO MUNDIAL'), '', '', m.text, 'gold big-text'));
  Net.on('kicked', (m) => { Main.kickReason = m.text || ''; });

  // ---------- Rescate: E junto a la plataforma (o mantener el botón) ----------
  function canRescue() {
    if (!Net.me || Net.me.execution || !X.spot || Net.me.faction !== 'pirate') return null;
    const [x, y] = Main.myPos();
    if (Math.hypot(x - X.spot.x, y - X.spot.y) > EX.range) return null;
    return [...X.list.values()].find((o) => !mine(o) && o.sid) || null;
  }
  Main.execKey = function (down) {
    if (down) {
      if (!canRescue()) return false;     // lejos de la plataforma: E vuelve a ser "explorar"
      if (!X.holding) { X.holding = true; Net.send('rescue', { op: 'start' }); }
      return true;
    }
    if (X.holding) { X.holding = false; Net.send('rescue', { op: 'stop' }); }
    return true;
  };

  // ---------- Barra superior: cuenta atrás, últimas palabras y botón de rescate ----------
  function bar() {
    let b = $('#exec-bar');
    if (!b) {
      b = document.createElement('div'); b.id = 'exec-bar';
      ($('#game') || document.body).appendChild(b);
      b.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-rescue]')) { e.preventDefault(); Main.execKey(true); } });
      const up = () => { if (X.holding) Main.execKey(false); };
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
      b.addEventListener('click', (e) => {
        const g = e.target.closest('[data-execgo]');
        if (g && X.spot) Main.lookAt(X.spot.x, X.spot.y);
        if (e.target.closest('[data-lastwords]')) sendWords();
      });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'lw-text') { e.preventDefault(); e.stopPropagation(); sendWords(); } });
    }
    return b;
  }
  function sendWords() {
    const i = $('#lw-text');
    const t = i ? i.value.trim() : '';
    if (t.length < 2) return UI.toast('Escribe tus últimas palabras.');
    Net.send('lastwords', { text: t });
    X.wordsSent = true;
    i.blur();
    render(true);
  }
  let lastHtml = '';
  function render(force) {
    const items = [...X.list.values()];
    const b = bar();
    if (!items.length) { b.innerHTML = ''; b.classList.add('hidden'); lastHtml = ''; return; }
    b.classList.remove('hidden');
    const near = canRescue();
    // la estructura solo se rehace si cambia algo de verdad; el reloj y la barra del rescate se actualizan aparte
    // (así el cuadro de las últimas palabras no se borra ni se mueve mientras lo usas)
    const html = items.map((o) => {
      const me = mine(o);
      return `<div class="exec-row ${me ? 'condemned' : ''}" data-cid="${o.cid}">
        <div class="exec-head"><span class="exec-tag">⚔️ EJECUCIÓN PÚBLICA</span><b class="exec-name">${esc(o.name)}</b><span class="exec-bounty">${esc(OP.fmtB(o.bounty))}</span>
          <span class="exec-clock"></span></div>
        ${o.words ? `<div class="exec-quote">«${esc(o.words)}»</div>` : ''}
        ${o.rescuer ? `<div class="exec-rescue"><span>🔓 ${esc(o.rescuer)} rompe sus cadenas...</span><i></i></div>` : ''}
        ${me ? (X.wordsSent || o.words ? '<div class="muted small">Tus palabras ya resuenan en todo el mundo. Solo queda esperar un milagro...</div>'
          : `<div class="lw"><input id="lw-text" maxlength="${EX.wordsMax}" placeholder="Tus últimas palabras..." autocomplete="off"><button class="red" data-lastwords="1">🗣️ Decirlas</button></div>`)
          : `<div class="exec-btns"><button data-execgo="1">🧭 Ver la plataforma</button>${near && near.cid === o.cid ? `<button class="gold" data-rescue="1">🔓 Mantén para rescatar (o E)</button>` : `<span class="muted small">${Net.me && Net.me.faction === 'pirate' ? 'Acércate a la plataforma de Bastión Central y mantén E 3 s para liberarlo' : 'Los piratas intentarán rescatarlo'}</span>`}</div>`}
      </div>`;
    }).join('');
    // no rehacer el cuadro de texto mientras escribes (perderías lo escrito)
    const typing = document.activeElement && document.activeElement.id === 'lw-text';
    if ((html !== lastHtml && !typing) || force) { b.innerHTML = html; lastHtml = html; }
    for (const row of b.querySelectorAll('.exec-row')) {
      const o = X.list.get(Number(row.dataset.cid));
      if (!o) continue;
      const s = secs(o);
      const c = row.querySelector('.exec-clock');
      if (c) c.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      row.classList.toggle('urgent', s <= 10);
      const bar = row.querySelector('.exec-rescue i');
      if (bar) bar.style.width = (o.rescueEnd ? Math.round(Math.min(1, Math.max(0, 1 - (o.rescueEnd - Date.now()) / EX.holdMs)) * 100) : 0) + '%';
    }
  }
  setInterval(() => { if (X.list.size || lastHtml) render(); }, 200);

  // ---------- Anuncios en grande ----------
  function announce(title, name, bounty, sub, tone) {
    const d = document.createElement('div');
    d.className = 'exec-announce ' + (tone || '');
    d.innerHTML = `<div class="ea-title">${esc(title)}</div><div class="ea-name">${esc(name)}</div>${bounty ? `<div class="ea-bounty">${esc(bounty)}</div>` : ''}<div class="ea-sub">${esc(sub)}</div>`;
    document.body.appendChild(d);
    const ms = 5200 + Math.min(6000, String(sub || '').length * 40);   // los textos largos se quedan más tiempo
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 1000);
  }
  function showWords(name, text) {
    const old = $('#exec-words'); if (old) old.remove();
    const d = document.createElement('div');
    d.id = 'exec-words';
    d.innerHTML = `<div class="ew-label">ÚLTIMAS PALABRAS DE</div><div class="ew-name">${esc(name)}</div><div class="ew-text">«${esc(text)}»</div>`;
    document.body.appendChild(d);
    setTimeout(() => d.classList.add('out'), 8000);
    setTimeout(() => d.remove(), 9000);
  }
  function slash(name, bounty) {
    const d = document.createElement('div');
    d.id = 'exec-slash';
    d.innerHTML = `<i class="s1"></i><i class="s2"></i><div class="es-text"><div class="es-big">EJECUTADO</div><div class="es-name">${esc(name)}</div><div class="es-sub">Su recompensa de ${esc(OP.fmtB(bounty || 0))} queda cancelada</div></div>`;
    document.body.appendChild(d);
    setTimeout(() => d.classList.add('out'), 4200);
    setTimeout(() => d.remove(), 5200);
    if (X.spot && OP.Render.ping) OP.Render.ping(X.spot.x, X.spot.y);
  }

  // ---------- Dibujo: la plataforma de ejecución en la plaza y el progreso del rescate ----------
  const prevWorld = OP.Render.hooks.world;
  OP.Render.hooks.world = function (ctx, w2s, z, t) {
    if (X.spot && z >= 3) drawPlatform(ctx, w2s, z, t);
    return prevWorld.apply(this, arguments);
  };
  function drawPlatform(ctx, w2s, z, t) {
    const sp = X.spot;
    const active = X.list.size > 0;
    const R = (wx, wy, ww, wh, col) => { const [a, b] = w2s(wx, wy); ctx.fillStyle = col; ctx.fillRect(Math.round(a), Math.round(b), Math.ceil(ww * z), Math.ceil(wh * z)); };
    ctx.save();
    if (active) {   // zona de rescate: un círculo rojo que late
      const [cx, cy] = w2s(sp.x, sp.y);
      ctx.strokeStyle = 'rgba(255,70,50,' + (0.45 + 0.3 * Math.sin(t * 5)) + ')';
      ctx.lineWidth = Math.max(2, z * 0.12);
      ctx.setLineDash([z * 0.4, z * 0.25]);
      ctx.beginPath(); ctx.ellipse(cx, cy, EX.range * z, EX.range * z * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // tablado de madera con su sombra, la cara delantera y la escalera
    R(sp.x - 1.7, sp.y - 0.45, 3.6, 1.5, 'rgba(0,0,0,0.25)');
    R(sp.x - 1.8, sp.y - 0.7, 3.6, 1.2, '#8a5a30');
    for (let k = 0; k < 4; k++) R(sp.x - 1.8, sp.y - 0.7 + k * 0.3, 3.6, 0.04, '#6a4424');
    R(sp.x - 1.8, sp.y + 0.5, 3.6, 0.45, '#5a3a1e');
    R(sp.x - 0.35, sp.y + 0.5, 0.7, 0.6, '#7a4e28');
    for (let k = 0; k < 3; k++) R(sp.x - 0.35, sp.y + 0.62 + k * 0.17, 0.7, 0.04, '#4a2e18');
    for (const dx of [-1.8, 1.65]) R(sp.x + dx, sp.y + 0.5, 0.15, 0.55, '#3a2412');
    // poste y travesaño detrás del condenado, con estandartes de la Marina
    R(sp.x - 0.12, sp.y - 2.6, 0.24, 2.0, '#4a2e18');
    R(sp.x - 0.9, sp.y - 2.6, 1.8, 0.2, '#4a2e18');
    for (const dx of [-1.6, 1.3]) { R(sp.x + dx, sp.y - 2.2, 0.08, 1.6, '#3a2412'); R(sp.x + dx + 0.08, sp.y - 2.2, 0.32, 0.55, active ? '#b3261e' : '#f4f6f8'); R(sp.x + dx + 0.14, sp.y - 2.05, 0.2, 0.2, active ? '#f4f4f4' : '#2a5aa8'); }
    if (active) {   // cadenas que brillan
      ctx.strokeStyle = 'rgba(200,210,230,' + (0.6 + 0.3 * Math.sin(t * 6)) + ')';
      ctx.lineWidth = Math.max(1, z * 0.06);
      const [a, b] = w2s(sp.x - 0.7, sp.y - 2.4), [c, d] = w2s(sp.x, sp.y - 1.0), [e2, f] = w2s(sp.x + 0.7, sp.y - 2.4);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineTo(e2, f); ctx.stroke();
    }
    ctx.restore();
  }
  const prevOverlay = OP.Render.hooks.overlay;
  OP.Render.hooks.overlay = function (ctx, w2s, z) {
    const r = prevOverlay.apply(this, arguments);
    const now = Date.now();
    for (const o of X.list.values()) {
      if (!o.rescueEnd || !o.rescuer) continue;
      let pos = null;
      if (Net.me && o.rescuer === Net.me.name) pos = Main.myPos();
      else for (const p of Net.players.values()) if (p.name === o.rescuer) pos = [p.rx, p.ry];
      if (!pos) continue;
      const [sx, sy] = w2s(pos[0], pos[1]);
      const prog = Math.min(1, 1 - (o.rescueEnd - now) / EX.holdMs);
      const rad = Math.max(12, z * 1.1);
      ctx.save();
      ctx.lineWidth = Math.max(3, z * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(sx, sy - z * 0.6, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(sx, sy - z * 0.6, rad, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // el condenado: cartel sobre la cabeza con su cuenta atrás
    for (const o of X.list.values()) {
      if (!X.spot) continue;
      const [sx, sy] = w2s(X.spot.x, X.spot.y - 2.9);
      ctx.save();
      ctx.font = '800 ' + Math.max(12, Math.round(z * 0.7)) + 'px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const txt = '⛓ ' + secs(o) + ' s';
      ctx.strokeText(txt, sx, sy); ctx.fillStyle = secs(o) <= 10 ? '#ff5a4a' : '#ffd23f'; ctx.fillText(txt, sx, sy);
      ctx.restore();
      break;
    }
    return r;
  };
})();
