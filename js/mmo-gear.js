/* MILESDEPIRATAS (online) - Cliente del EQUIPO: panel del Dojo (K), técnicas 1-2-3, tajos visibles y controles táctiles. */
(function () {
  'use strict';
  const OP = window.OP, Net = OP.Net, UI = OP.UI, Main = OP.Main, G = OP.Gear;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
  let tab = 'tech';

  // ---------- Panel del Dojo ----------
  function techTab(me) {
    const st = G.stance(me);
    return `<p class="muted small">Mantén <b>T</b> con una espada equipada para ganar maestría. Cada golpe con espada también suma.</p>
      <div class="gear-pts">🎯 Maestría: <b>${Math.floor(me.arts.pts)}</b> puntos · Postura actual: <b>${st ? st + (st > 1 ? ' espadas' : ' espada') : 'sin espada'}</b></div>
      <div class="gear-list">${Object.keys(G.TECH).map((id) => {
        const T = G.TECH[id], known = G.knows(me, id), why = known ? '' : G.techLock(me, id);
        return `<div class="gear-row ${known ? 'on' : ''}"><span class="gi">${T.icon}</span><div><b>${esc(T.name)}</b>${T.key ? ` <small>tecla ${T.key}</small>` : ''}<div class="muted small">${esc(T.desc)}</div>${known ? '' : `<div class="muted small">Nivel ${T.lvl} · ${T.pts} puntos${why ? ' · ' + esc(why) : ''}</div>`}</div>
          ${known ? (T.stance ? `<button data-g="stance" data-n="${me.arts.stance === T.stance ? T.stance - 1 : T.stance}">${me.arts.stance === T.stance ? 'Guardar' : 'Usar'}</button>` : '<span class="gear-ok">✔</span>') : `<button class="gold" data-g="unlock" data-id="${id}" ${why ? 'disabled' : ''}>Aprender</button>`}</div>`;
      }).join('')}</div>`;
  }
  function accTab(me) {
    if (!me.accs.length) return '<p class="muted">Aún no tienes accesorios. Busca a los vecinos marcados con ❔ dentro de las casas.</p>';
    return `<div class="gear-list">${me.accs.map((id) => {
      const A = G.ACCS[id], on = me.accEq[A.slot] === id;
      return `<div class="gear-row ${on ? 'on' : ''}"><span class="gi">${A.icon}</span><div><b>${esc(A.name)}</b> <small>${G.SLOTS[A.slot]}</small><div class="muted small">${esc(G.bonusText(A))}</div></div>
        <button data-g="${on ? 'unequip' : 'equip'}" data-id="${id}" data-slot="${A.slot}">${on ? 'Quitar' : 'Equipar'}</button></div>`;
    }).join('')}</div>`;
  }
  function lookTab(me) {
    const L = OP.splitLook(me.app);
    const pick = (label, list, key, cur) => `<div class="field"><span>${label}</span><div class="row-wrap">${list.map((v) => `<button class="opt ${v === cur ? 'on' : ''}" data-l="${key}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div></div>`;
    return pick('Sombrero o bandana', OP.HATS, 'hat', L.hat) + pick('Cicatriz', OP.SCARS, 'scar', L.scar) + pick('Complemento', OP.ACC_ONLY, 'acc', L.acc);
  }
  function secretTab(me) {
    const ids = Object.keys(me.secrets);
    if (!ids.length) return '<p class="muted">Todavía no has descubierto ninguna misión secreta. Entra en las casas y busca a los vecinos marcados con ❔.</p>';
    return `<div class="gear-list">${ids.map((id) => {
      const q = G.secretById[id], st = me.secrets[id], cur = st.done ? q.goal : Math.max(0, Math.min(q.goal, OP.MMO.statValue(Object.assign({}, me, { stats: me.stats }), q.stat) - (st.base || 0)));
      return `<div class="gear-row ${st.done ? 'on' : ''}"><span class="gi">${st.done ? '✅' : '🤫'}</span><div><b>${esc(q.task)}</b><div class="muted small">${esc(q.npc)} · ${esc((OP.M.byId[q.isl] || {}).name || '')} · ${cur}/${q.goal}</div><div class="muted small">Recompensa: ${esc(G.rewardName(q))}</div></div></div>`;
    }).join('')}</div>`;
  }
  const TABS = { tech: ['⚔️ Técnicas', techTab], acc: ['📿 Accesorios', accTab], look: ['🎨 Aspecto', lookTab], sec: ['🤫 Secretas', secretTab] };
  function openDojo() {
    const me = Net.me;
    if (!me) return;
    UI.openModal(`<h2>🗡️ Dojo</h2><div class="gear-tabs">${Object.keys(TABS).map((k) => `<button class="${k === tab ? 'on' : ''}" data-gt="${k}">${TABS[k][0]}</button>`).join('')}</div>
      <div id="gear-body">${TABS[tab][1](me)}</div><div class="btns"><button data-close="1">Cerrar</button></div>`, 'gear-modal');
    UI.modalKind = 'gear';
  }
  Main.openDojo = openDojo;
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-gt]');
    if (t) { tab = t.dataset.gt; return openDojo(); }
    const b = e.target.closest('[data-g]');
    if (b) {
      const op = b.dataset.g;
      Net.send('gear', op === 'stance' ? { op, n: Number(b.dataset.n) } : op === 'unequip' ? { op, slot: b.dataset.slot } : { op, id: b.dataset.id });
      return setTimeout(openDojo, 260);
    }
    const l = e.target.closest('[data-l]');
    if (l) {
      const L = OP.splitLook(Net.me.app);
      L[l.dataset.l] = l.dataset.v;
      Net.me.app = Object.assign({}, Net.me.app, L);
      Net.send('gear', { op: 'look', hat: L.hat, scar: L.scar, acc: L.acc });
      openDojo();
    }
  });

  // ---------- Técnicas especiales ----------
  function useTech(id) {
    const me = Net.me;
    if (!me) return;
    if (!G.knows(me, id)) return UI.toast('🗡️ Aún no dominas ' + G.TECH[id].name + '. Abre el Dojo (K).');
    Net.send('tech', { id });
  }
  window.addEventListener('keydown', (e) => {
    if (!UI.started || typing() || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'k') { if (UI.isModal() && UI.modalKind === 'gear') UI.closeModal(); else if (!UI.isModal()) openDojo(); return; }
    if (UI.isModal()) return;
    const i = ['1', '2', '3'].indexOf(k);
    if (i >= 0) useTech(G.SPECIALS[i]);
  });

  // ---------- Tajo visible al golpear con espada ----------
  const prevWorld = OP.Render.hooks.world;
  OP.Render.hooks.world = function (ctx, w2s, z, t, x0, y0, Wc, Hc) {
    const r = prevWorld.apply(this, arguments);
    if (Main.room || z < 5) return r;
    const now = performance.now();
    for (const p of Net.players.values()) {
      if (!p.gear || p.boat || p.inside || !p.swingUntil || now >= p.swingUntil) continue;
      const g = G.parseCode(p.gear);
      if (!g || !g.r) continue;
      const [x, y] = p.sid === Net.sid ? Main.myPos() : [p.rx, p.ry];
      const [sx, sy] = w2s(x, y), s = Math.max(1, Math.round(z / 14)), k = 1 - (p.swingUntil - now) / 260;
      const a = { right: 0, left: Math.PI, up: -Math.PI / 2, down: Math.PI / 2 }[p.swingDir] || 0;
      ctx.strokeStyle = (g.sp && G.SWORDS[g.sp].color) || G.BLADE[g.r] || '#fff';
      ctx.globalAlpha = Math.max(0, 0.9 - k * 0.7); ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.arc(sx, sy - 9 * s, 14 * s, a - 1 + k * 0.8, a + 0.2 + k * 0.8); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    return r;
  };

  // ---------- Controles táctiles ----------
  if (!OP.Perf.touch) return;
  document.body.classList.add('touch');
  if (innerWidth < 900) document.getElementById('side').classList.add('collapsed');   // en el teléfono, el mapa primero (la tarjeta se abre con su botón)
  const bar = document.createElement('div');
  bar.id = 'touch-ui';
  bar.innerHTML = `<div id="joy"><i id="joy-k"></i></div>
    <div id="tbtns">
      <button data-t="atk" class="big">⚔️</button><button data-t="e">E</button><button data-t="q">🍎</button><button data-t="train">🥋</button>
      <button data-t="1">🌙</button><button data-t="2">🌀</button><button data-t="3">🌪️</button><button data-t="dojo">🗡️</button>
      <button data-t="heal">🍖</button><button data-t="gate">⛰</button><button data-t="news">📰</button>
    </div>`;
  document.body.appendChild(bar);
  const joy = bar.querySelector('#joy'), knob = bar.querySelector('#joy-k');
  let jid = null;
  const joyMove = (e) => {
    const r = joy.getBoundingClientRect(), R = r.width / 2;
    let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
    const L = Math.hypot(dx, dy);
    if (L > 1) { dx /= L; dy /= L; }
    knob.style.transform = 'translate(' + dx * R * 0.55 + 'px,' + dy * R * 0.55 + 'px)';
    Main.joy = L < 0.18 ? null : [Math.round(dx * 20) / 20, Math.round(dy * 20) / 20];
  };
  const joyEnd = () => { jid = null; Main.joy = null; knob.style.transform = ''; };
  joy.addEventListener('pointerdown', (e) => { jid = e.pointerId; joy.setPointerCapture(jid); joyMove(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) joyMove(e); });
  joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);

  let atkTimer = null, training = false;
  const stopAtk = () => { clearInterval(atkTimer); atkTimer = null; };
  bar.querySelector('#tbtns').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    e.preventDefault();
    const t = b.dataset.t;
    if (t === 'atk') { Main.attack(false); stopAtk(); atkTimer = setInterval(() => Main.attack(true), 220); }
    else if (t === 'e') Main.pressE();
    else if (t === 'q') Main.ability();
    else if (t === 'train') { training = !training; Main.trainKey(training); b.classList.toggle('on', training); }
    else if (t === 'dojo') openDojo();
    else if (t === 'heal' || t === 'gate') Main.act(t);
    else if (t === 'news') document.body.classList.toggle('show-news');
    else useTech(G.SPECIALS[Number(t) - 1]);
  });
  window.addEventListener('pointerup', stopAtk); window.addEventListener('pointercancel', stopAtk);

  // zoom con dos dedos sobre el mapa
  const map = document.getElementById('map'), touches = new Map();
  let pinch = 0;
  map.addEventListener('pointerdown', (e) => touches.set(e.pointerId, [e.clientX, e.clientY]));
  map.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size !== 2) { pinch = 0; return; }
    const [a, b] = [...touches.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) OP.Render.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch);
    pinch = d;
  });
  for (const ev of ['pointerup', 'pointercancel']) map.addEventListener(ev, (e) => { touches.delete(e.pointerId); pinch = 0; });
})();
