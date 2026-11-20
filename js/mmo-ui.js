/* MILESDEPIRATAS (online) - interfaz con el diseño original:
   barra superior, panel lateral de información, panel de noticias/chat, ventanas de pergamino,
   Tarjeta Vivre, carteles y periódico. Más compacta y con letra legible. */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const Net = OP.Net, MMO = OP.MMO;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => OP.esc(s == null ? '' : s);
  const UI = (OP.UI = { settings: { night: true, newsFilter: 'all' }, sel: null, follow: true, started: false, modalKind: '', newsTab: 'news', chatCh: 'all' });
  const seaName = (k) => (OP.SEAS[k] ? OP.SEAS[k].name : k);
  const face = (app, faction, rank, bg, dead) => (app ? OP.Sprites.portraitURL({ app, faction, rank: rank || 0, loc: dead ? 'dead' : 'island' }, bg || (faction === 'marine' ? '#24476e' : '#5b2a22')) : '');
  const fmtB = (n) => OP.fmtB(n);
  const NEWS_ICON = { pirate: '☠️', bounty: '💰', crew: '🏴‍☠️', capture: '⛓️', battle: '⚔️', attack: '🔥', fruit: '🍎', poneglyph: '🗿', laughtale: '👑', marine: '⚓', sea: '🌊', death: '✝️', world: '🌍' };
  const NEWS_FILTERS = [['all', 'Todo'], ['bounty', '💰'], ['battle', '⚔️'], ['capture', '⛓️'], ['crew', '🏴‍☠️'], ['fruit', '🍎'], ['marine', '⚓'], ['world', '🌍']];
  const CHAT_CH = [['all', 'Todo'], ['global', 'Global'], ['crew', 'Tripulación'], ['pm', 'Privado']];
  const BADGES = {
    first_win: ['⚔️', 'Primera victoria'], wanted: ['📜', 'Se busca'], bounty100: ['💰', 'Recompensa de 100 millones'], bounty1000: ['💎', 'Recompensa de 1.000 millones'],
    grandline: ['⛰️', 'Cruzó Monte Contracorriente'], newworld: ['🌊', 'Llegó al Mar Indómito'], sky: ['☁️', 'Subió a una isla del cielo'], deep: ['🫧', 'Bajó a la Isla Coralina'],
    fruit: ['🍎', 'Usuario de Fruta Maldita'], haki_obs: ['👁️', 'Aura de Observación'], haki_arm: ['🛡️', 'Aura de Armadura'], haki_conq: ['⚡', 'Aura del Rey'],
    captain: ['🏴‍☠️', 'Capitán'], explorer: ['🧭', '10 islas visitadas'], poneglyph: ['🗿', 'Vio un Monolito'], road: ['🗺️', 'Copió un Monolito de Ruta'],
    emperor: ['👑', 'Emperador del Mar'], king: ['🏆', 'Rey de los Mares'], onepiece: ['💎', 'Encontró el Tesoro Supremo'], shipwreck: ['⚓', 'Náufrago'],
    impeldown: ['⛓️', 'Preso en Prisión Abismo'], escape_id: ['🔓', 'Se fugó de Prisión Abismo'], basebreaker: ['💥', 'Destruyó una base'], war: ['🔥', 'Guerra de Bastión Central'],
    first_capture: ['🪢', 'Primera captura'], hunter10: ['🎯', '10 piratas capturados']
  };
  const badgeInfo = (id) => BADGES[id] || (id.indexOf('train_') === 0 ? ['🥋', 'Entrenó en ' + ((OP.M.byId[id.slice(6)] || {}).name || '?')] : ['⭐', id]);
  function bar(v, max, cls) { const p = Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100)); return `<div class="bar ${cls || ''}"><i style="width:${p.toFixed(1)}%"></i></div>`; }
  function fmtMs(ms) { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function lvlColor(l) { const d = l - (Net.me ? Net.me.lvl : 1); return d >= 6 ? '#ff6a5a' : d >= 3 ? '#ffa24a' : d >= -2 ? '#ffe066' : '#7ee08f'; }

  // ======================================================================
  //  PANTALLA DE INICIO, CUENTA Y CREACIÓN
  // ======================================================================
  function titleBlock(sub) {
    return `<div class="title-flag">☠</div><h1 class="title">MILES <span>DE</span><br>PIRATAS</h1><p class="subtitle">${sub}</p>`;
  }
  UI.showLogin = function (mode, msg) {
    const el = $('#start');
    el.classList.remove('hidden');
    const reg = mode === 'register';
    el.innerHTML = `<div class="title-wrap">${titleBlock('Un mundo pirata compartido. Navega, pelea y escribe tu leyenda junto a otros jugadores.')}
      <form class="auth-box" id="auth-form" autocomplete="on">
        <label>Usuario<input name="username" maxlength="16" autocomplete="username" required></label>
        <label>Contraseña<input name="password" type="password" maxlength="64" autocomplete="${reg ? 'new-password' : 'current-password'}" required></label>
        ${reg ? '<label>Repite la contraseña<input name="password2" type="password" maxlength="64" autocomplete="new-password" required></label>' : ''}
        <div class="err" id="auth-err">${esc(msg || '')}</div>
        <button class="big-btn" type="submit">${reg ? '⚓ Crear cuenta' : '⚓ Entrar'}</button>
        <div class="switch">${reg ? '¿Ya tienes cuenta? <a data-auth="login">Entra</a>' : '¿Primera vez? <a data-auth="register">Crea una cuenta</a>'}</div>
      </form>
      <p id="loading-msg" class="loading">${OP.Main && OP.Main.terrainReady ? '' : '🌊 Preparando los mares...'}</p></div>`;
    const f = $('#auth-form');
    f.username.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#auth-err');
      err.textContent = '';
      const u = f.username.value.trim(), p = f.password.value;
      if (reg && p !== f.password2.value) { err.textContent = 'Las contraseñas no coinciden.'; return; }
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      try { if (reg) await Net.register(u, p); else await Net.login(u, p); await OP.Main.afterAuth(); }
      catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    });
    el.onclick = (e) => { const a = e.target.closest('[data-auth]'); if (a) UI.showLogin(a.dataset.auth); };
  };
  UI.showConnecting = function (text) {
    const el = $('#start');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="title-wrap">${titleBlock(esc(text || 'Conectando con el mundo...'))}</div>`;
    el.onclick = null;
  };

  const cr = { name: '', app: null, faction: 'pirate', dream: '' };
  UI.showCreator = function () {
    if (!cr.app) {
      cr.app = { skin: OP.SKINS[1], hair: 'puntiagudo', hairColor: OP.HAIR_COLORS[0], cloth: OP.CLOTH_COLORS[1], acc: 'ninguno', build: 'normal', hat: 'bandana', scar: 'ninguna' };
      cr.name = OP.NAMES_M[Math.floor(Math.random() * OP.NAMES_M.length)] + ' ' + OP.SURNAMES[Math.floor(Math.random() * OP.SURNAMES.length)];
    }
    const el = $('#start');
    el.classList.remove('hidden');
    const sw = (list, key) => list.map((c) => `<button class="swatch ${cr.app[key] === c ? 'on' : ''}" style="background:${c}" data-set="${key}" data-val="${c}" title="${c}"></button>`).join('');
    const opts = (list, key, names) => list.map((v) => `<button class="opt ${cr.app[key] === v ? 'on' : ''}" data-set="${key}" data-val="${v}">${esc(names ? names[v] : v.charAt(0).toUpperCase() + v.slice(1))}</button>`).join('');
    const dreams = MMO.dreamsFor(cr.faction);
    if (cr.dream && !dreams[cr.dream]) cr.dream = '';
    el.innerHTML = `<div class="creator">
      <h2>Crea a tu personaje</h2>
      <div class="creator-grid">
        <div class="creator-form">
          <label class="field">Nombre<input id="c-name" maxlength="20" value="${esc(cr.name)}"></label>
          <div class="field"><span>Facción</span><div class="row-wrap">
            <button class="fac ${cr.faction === 'pirate' ? 'on' : ''}" data-fac="pirate">☠ Pirata</button>
            <button class="fac ${cr.faction === 'marine' ? 'on' : ''}" data-fac="marine">⚓ Marine</button></div></div>
          <div class="field"><span>Tu Sueño <em>(obligatorio: guía tus objetivos)</em></span><div class="dreams">
            ${Object.keys(dreams).map((k) => `<button class="dream ${cr.dream === k ? 'on' : ''}" data-dream="${k}">${esc(dreams[k])}</button>`).join('')}</div></div>
          <div class="field"><span>Color de piel</span><div class="row-wrap">${sw(OP.SKINS, 'skin')}</div></div>
          <div class="field"><span>Peinado</span><div class="row-wrap">${opts(OP.HAIR_STYLES, 'hair', OP.HAIR_NAMES)}</div></div>
          <div class="field"><span>Color de pelo</span><div class="row-wrap">${sw(OP.HAIR_COLORS, 'hairColor')}</div></div>
          <div class="field"><span>Color de ropa</span><div class="row-wrap">${sw(OP.CLOTH_COLORS, 'cloth')}</div></div>
          <div class="field"><span>Sombrero o bandana</span><div class="row-wrap">${opts(OP.HATS, 'hat')}</div></div>
          <div class="field"><span>Cicatriz</span><div class="row-wrap">${opts(OP.SCARS, 'scar')}</div></div>
          <div class="field"><span>Complemento</span><div class="row-wrap">${opts(OP.ACC_ONLY, 'acc')}</div></div>
          <div class="field"><span>Complexión</span><div class="row-wrap">${opts(OP.BUILDS, 'build')}</div></div>
        </div>
        <div class="creator-preview">
          <div class="preview-frame"><img id="c-portrait" alt="Retrato"></div>
          <div class="preview-name" id="c-pname">${esc(cr.name)}</div>
          <div class="preview-meta">${cr.faction === 'pirate' ? '☠ Pirata' : '⚓ Recluta de la Marina'}</div>
          <div class="note">🎲 <b>Aparecerás en un mar al azar</b> (del Este, del Oeste, del Norte o del Sur). Con suerte, en una isla especial con bonus: Isla Chaos, Reino Poche, Villa Fetu, Isla Tomas o Isla Perkin. El talento y los rasgos también se sortean.</div>
          <div class="creator-btns">
            <button class="opt" data-c="random">🎲 Aleatorio</button>
            <button class="big-btn" data-c="go" ${cr.dream ? '' : 'disabled title="Elige tu Sueño"'}>¡Zarpar!</button>
          </div>
          <div id="c-err" style="color:#ff9a8f;margin-top:8px;font-size:12px"></div>
          <button class="link-btn" data-c="logout">← Cambiar de cuenta (${esc(Net.username)})</button>
        </div>
      </div></div>`;
    $('#c-portrait').src = face(cr.app, cr.faction);
    $('#c-name').addEventListener('input', (e) => { cr.name = e.target.value; $('#c-pname').textContent = cr.name; });
    el.onclick = onCreatorClick;
  };
  async function onCreatorClick(e) {
    const b = e.target.closest('button, a');
    if (!b) return;
    if (b.dataset.set) { cr.app[b.dataset.set] = b.dataset.val; return UI.showCreator(); }
    if (b.dataset.fac) { cr.faction = b.dataset.fac; return UI.showCreator(); }
    if (b.dataset.dream) { cr.dream = b.dataset.dream; return UI.showCreator(); }
    if (b.dataset.c === 'logout') { await Net.logout(); return UI.showLogin('login'); }
    if (b.dataset.c === 'random') {
      const pick = (l) => l[Math.floor(Math.random() * l.length)];
      cr.app = { skin: pick(OP.SKINS), hair: pick(OP.HAIR_STYLES), hairColor: pick(OP.HAIR_COLORS), cloth: pick(OP.CLOTH_COLORS), acc: pick(OP.ACC_ONLY), build: pick(OP.BUILDS), hat: pick(OP.HATS), scar: pick(OP.SCARS) };
      cr.name = pick(OP.NAMES_M.concat(OP.NAMES_F)) + ' ' + pick(OP.SURNAMES);
      return UI.showCreator();
    }
    if (b.dataset.c === 'go') {
      b.disabled = true;
      try { UI.showReveal(await Net.createCharacter({ name: (cr.name || '').trim(), faction: cr.faction, dream: cr.dream, app: cr.app })); }
      catch (ex) { $('#c-err').textContent = ex.message; b.disabled = false; }
    }
  }
  UI.showReveal = function (res) {
    const sp = res.spawn;
    $('#start').innerHTML = `<div class="reveal">
      <div class="muted">🎲 El mar ha decidido...</div>
      <div class="isle">${esc(sp.island)}</div><div>en <b>${esc(sp.sea)}</b></div>
      ${sp.perk ? `<div class="perk">✨ ¡Isla especial! ${esc(sp.perk.text)}</div>` : '<p class="muted small">Una isla normal: tu leyenda empieza desde cero.</p>'}
      <div class="kv"><span>Talento</span><b>${esc((OP.TALENTS[res.talent] || {}).icon || '')} ${esc(res.talent)}</b></div>
      <div class="kv"><span>Rasgos</span><b>${res.traits.map((t) => esc(MMO.TRAITS[t].icon + ' ' + MMO.TRAITS[t].name)).join(', ')}</b></div>
      <button class="big-btn" style="margin-top:12px" id="sail">⚓ ¡A la mar!</button></div>`;
    $('#start').onclick = null;
    $('#sail').onclick = () => OP.Main.afterAuth();
  };

  // ======================================================================
  //  BARRA SUPERIOR
  // ======================================================================
  UI.buildTopbar = function () {
    // Barra superior limpia: marca y reloj a la izquierda, menú en una píldora centrada, tu personaje a la derecha.
    // Lo que se repetía va agrupado: "Tablones" (Se Busca + Honor) y "Mundo" (Islas, Frutas, Marina, Periódico).
    $('#topbar').innerHTML = `
      <div class="brand"><div class="logo">☠ MILES <small>DE</small> PIRATAS</div><div class="clock" id="clock"></div></div>
      <nav class="menu">
        <button data-open="wanted" title="Tablones: Se Busca y Honor de la Marina (B)">📜 <span class="lb">Tablones</span></button>
        <button data-open="crews" title="Tripulación (C)">🏴‍☠️ <span class="lb">Tripulación</span></button>
        <button data-open="islands" title="Mundo: islas, frutas, Marina y periódico (L)">🌍 <span class="lb">Mundo</span></button>
        <button data-open="inventory" title="Cofre: inventario y tienda (I)">🎒 <span class="lb">Cofre</span></button>
        <button data-open="dream" title="Misiones y sueño (O)">⭐ <span class="lb">Misiones</span></button>
        <span class="more-wrap"><button data-more="1" title="Más">⋯</button>
          <div class="more-menu hidden" id="more-menu">
            <button data-open="codes">🎁 Códigos</button>
            <button data-open="admin" id="admin-btn" class="hidden">🛠 Administrador</button>
            <button data-open="help">❓ Ayuda</button>
            <button data-open="news">📣 Novedades</button>
            <button data-open="logout">⏻ Salir</button>
          </div></span>
      </nav>
      <button class="me" id="me-btn" title="Ir a tu personaje (M)"></button>`;
  };
  // pestañas de los apartados agrupados (se ponen arriba de cada ventana del grupo)
  const HUBS = {
    boards: [['wanted', '📜 Se Busca'], ['honor', '🎖️ Honor de la Marina']],
    world: [['islands', '🗺️ Islas'], ['fruits', '🍎 Frutas'], ['marine', '⚓ Marina'], ['paper', '📰 Periódico']]
  };
  function hubTabs(group, active) {
    return `<div class="hub-tabs">${HUBS[group].map(([k, l]) => `<button class="${k === active ? 'on' : ''}" data-open="${k}">${l}</button>`).join('')}</div>`;
  }
  UI.hubTabs = hubTabs;
  // Entrenamiento: qué prioriza el jugador (se recuerda en este navegador)
  UI.trainFocus = function () {
    if (!UI._focus) { try { UI._focus = localStorage.getItem('opw_focus'); } catch (e) { /* sin almacenamiento */ } }
    return MMO.TRAIN_FOCUS[UI._focus] ? UI._focus : ((Net.me && Net.me.trainFocus) || 'str');
  };
  UI.setTrainFocus = function (f) {
    UI._focus = f;
    try { localStorage.setItem('opw_focus', f); } catch (e) { /* sin almacenamiento */ }
    if (Net.me && Net.me.training) Net.send('trainhold', { on: true, focus: f });   // si está entrenando, cambia la prioridad sobre la marcha
    UI.renderPanel(true);
  };
  UI.updateTopbar = function () {
    const S = OP.S, me = Net.me;
    if (!me) return;
    const h = OP.calTime(S.time) % 24;
    const zone = MMO.zoneOf(me.x, me.y);
    $('#clock').innerHTML = (h >= 6 && h < 19 ? '☀️ ' : '🌙 ') + esc(OP.fmtTime(S.time)) + ' · <span class="zone">' + esc(seaName(zone)) + '</span> · 👥 ' + Net.players.size + ' · ' + Net.ping + ' ms';
    const ab = $('#admin-btn');
    if (ab) ab.classList.toggle('hidden', !me.local);   // el botón de administrador solo aparece jugando desde el PC del servidor
    const p = Net.players.get(Net.sid);
    const btn = $('#me-btn');
    const html = `<img src="${p ? face(p.app, me.faction, me.rank, '#203a5c') : ''}" alt=""><span><b>${esc(me.name)}</b><br>Nv ${me.lvl} · ${p && p.dead ? '💀 KO' : me.boat ? '⛵ Navegando' : '📍 ' + esc((MMO.islandAt(me.x, me.y) || {}).name || seaName(zone))}</span>`;
    if (btn.dataset.html !== html) { btn.innerHTML = html; btn.dataset.html = html; }
    const ev = Net.room && Net.room.state ? Net.room.state.event : '';
    if (ev !== UI.lastEvent) { UI.lastEvent = ev; if (ev) UI.toast(ev, true, true); }
  };

  // ======================================================================
  //  SELECCIÓN Y PANEL LATERAL
  // ======================================================================
  const info = { key: '', data: null, at: 0 };
  UI.select = function (sel) {
    const same = sel && UI.sel && sel.t === UI.sel.t && String(sel.id) === String(UI.sel.id);
    if (!same) UI.pTab = '';   // al cambiar de personaje, las secciones empiezan cerradas
    UI.sel = sel;
    info.key = ''; info.data = null;
    if (sel) UI.requestInfo();
    $('#side').classList.remove('collapsed');
    UI.renderPanel(true);
  };
  UI.requestInfo = function () {
    const s = UI.sel;
    if (!s) return;
    info.at = Date.now();
    if (s.t === 'i') Net.send('req', { what: 'island', id: s.id });
    else Net.send('req', { what: 'inspect', t: s.t, id: s.id });
  };
  UI.selObj = function () {
    const s = UI.sel;
    if (!s) return null;
    if (s.t === 'p') { const p = Net.players.get(s.id); return p ? { loc: 'island', x: p.sid === Net.sid ? Net.me.x : p.rx, y: p.sid === Net.sid ? Net.me.y : p.ry, isPlayer: p.sid === Net.sid } : null; }
    if (s.t === 'n') return OP.S.A[s.id] || null;
    return null;
  };

  let lastPanel = '';
  UI.renderPanel = function (force) {
    const el = $('#side-body');
    const me = Net.me;
    if (!me) return;
    if (UI.sel && Date.now() - info.at > 2000) UI.requestInfo();
    const s = UI.sel;
    const mine = !s || (s.t === 'p' && s.id === Net.sid);
    let html = mine ? '' : myStrip(me);   // tu barra de vida/EXP solo cuando estás mirando a otro
    if (mine) html += myPanel(me);
    else if (s.t === 'p') html += playerPanel(s.id);
    else if (s.t === 'n') html += npcPanel(s.id);
    else if (s.t === 'i') html += islandPanel(OP.M.islands[s.id]);
    if (force || html !== lastPanel) {
      const st = el.scrollTop;
      el.innerHTML = html; lastPanel = html;
      el.scrollTop = st;
    }
  };
  function myStrip(me) {
    const p = Net.players.get(Net.sid);
    const b = me.buffs[0];
    return `<div class="mystat" data-me="1" title="Tu personaje (M)"><img src="${p ? face(p.app, me.faction, me.rank, '#203a5c') : ''}" alt="">
      <div class="g"><div><b>${esc(me.name)}</b> · Nv ${me.lvl}${b ? ` · <span class="bounty">✨ x${me.xpMult} ${fmtMs(b.msLeft)}</span>` : ''}</div>
      ${bar(me.hp, me.maxHp, 'hp')}<div style="display:flex;justify-content:space-between"><span>❤️ ${me.hp}/${me.maxHp}</span><span>${fmtB(me.money)}</span></div>
      ${bar(me.xp, me.xpNeed, 'xp')}</div></div>`;
  }
  function locText(me) {
    if (me.boat) return '⛵ Navegando en ' + esc(OP.SHIPS[me.boat] ? OP.SHIPS[me.boat].name.toLowerCase() : 'bote') + ' · ' + esc(seaName(MMO.zoneOf(me.x, me.y)));
    const I = MMO.islandAt(me.x, me.y);
    return I ? '📍 En ' + esc(I.name) + ' (' + esc(seaName(I.sea)) + ')' : '📍 ' + esc(seaName(MMO.zoneOf(me.x, me.y)));
  }
  // Compás de Ruta: la siguiente isla de la ruta y lo que falta para poder atracar (desde que entras en la Ruta Mayor)
  function logPoseBox(me) {
    if (me.lvl < 14 && me.zones.indexOf('paradise') < 0) return '';
    const pd = { lvl: me.lvl, faction: me.faction, bounty: me.bounty, merit: me.merit, visited: me.visited, powerNow: me.powerNow, crewSize: me.crewSize, king: me.king, yonkou: me.yonkou };
    const n = MMO.nextLog(pd);
    if (!n) return `<div class="logpose done">🧭 <b>Has recorrido toda la ruta del Compás de Ruta</b></div>`;
    return `<div class="logpose ${n.why ? 'locked' : ''}" data-goisl="${n.I.idx}" title="Toca para ver la isla">🧭 <b>Compás de Ruta → ${esc(n.I.name)}</b>
      <div class="small">${n.why ? '🔒 ' + esc(n.why.replace('el Compás de Ruta no te deja atracar: ', 'Te falta: ')) : '✅ Puedes atracar'}${me.king ? ' · 👑 sin límites' : me.yonkou ? ' · Señor del Mar: sin orden' : ''}</div></div>`;
  }
  // ---------- Piezas comunes de la tarjeta compacta ----------
  // Arriba solo lo importante; el resto va en secciones que se abren con botones (UI.pTab).
  function secTabs(list) {
    return `<div class="ptabs">${list.map(([k, l]) => `<button data-ptab="${k}" class="${UI.pTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }
  function secBody(k, html) { return UI.pTab === k ? `<div class="psec">${html}</div>` : ''; }
  function bountyStrip(faction, bounty, rank, extra) {
    if (faction === 'pirate') return `<div class="bstrip ${bounty ? '' : 'none'}"><span>SE BUSCA</span><b>${bounty ? fmtB(bounty) : 'Sin recompensa'}</b>${extra || ''}</div>`;
    return `<div class="bstrip marine"><span>${rank >= 7 ? '⭐ ' : ''}MARINA</span><b>${esc(OP.RANKS[rank])}</b>${extra || ''}</div>`;
  }
  function miniStats(list) { return `<div class="mstats">${list.map(([l, v, c]) => `<div><span>${l}</span><b>${v}</b>${c ? `<i style="width:${Math.min(100, c)}%"></i>` : ''}</div>`).join('')}</div>`; }

  function myPanel(me) {
    const T = OP.TALENTS[me.talent] || {};
    const p = Net.players.get(Net.sid);
    const crew = Net.crew;
    const q = me.quest;
    const ok = (b) => (b ? '<b class="ok">✔</b>' : '<b class="no">✘</b>');
    const dreamTxt = MMO.dreamsFor(me.faction)[me.dream] || me.dream;
    const statMax = Math.max(60, me.str, me.spd);
    const role = me.faction === 'pirate' ? '☠ Pirata' + (crew && crew.captain === me.cid ? ' · Capitán' : '') : '⚓ ' + esc(OP.RANKS[me.rank]);
    const host = p && p.ride && Net.players.get(p.ride);
    const b = me.buffs[0];
    let prog = '';
    if (me.zones.indexOf('paradise') >= 0) prog += '<div class="p-step done">⛰ Mar Esmeralda ✔</div>';
    else prog += `<div class="p-step">⛰ Mar Esmeralda: nivel 14 ${ok(me.lvl >= 14)} · carabela ${ok(me.ships.some((x) => x !== 'bote'))} · Compás de Ruta ${ok(me.logpose)}</div>`;
    if (me.zones.indexOf('newworld') >= 0) prog += '<div class="p-step done">🌊 Mar Indómito ✔</div>';
    else if (me.zones.indexOf('paradise') >= 0) prog += `<div class="p-step">🌊 Mar Indómito: nivel 35 ${ok(me.lvl >= 35)} · barco recubierto ${ok(me.coated)}</div>`;
    const sw = (me.inv.swords || []).find((x) => x.id === me.sword);
    const SR = sw ? MMO.SWORD_RARITY[sw.r] : null;
    const st = me.stats || {};
    return `<div class="pcard">
      <div class="chead"><img class="cport" src="${p ? face(p.app, me.faction, me.rank) : ''}" alt="">
        <div class="cinfo"><div class="cname">${esc(me.name)}</div>${me.epithet ? `<div class="pepi">«${esc(me.epithet)}»</div>` : ''}
          <div class="crole ${me.faction}">${role}</div><div class="csub">${crew ? `<a data-open="crews">${esc(crew.name)}</a>` : '<a data-open="crews">Sin tripulación</a>'}</div></div>
        <button class="cx" data-act="follow" title="${UI.follow ? 'La cámara te sigue' : 'Seguir a tu personaje'}">${UI.follow ? '📌' : '🎥'}</button></div>
      <div class="cstatus">${locText(me)}${b ? ` · <span class="bounty">✨ x${me.xpMult} ${fmtMs(b.msLeft)}</span>` : ''}</div>
      ${host ? `<div class="ridebar">⛵ A bordo del barco de <b>${esc(host.name)}</b><button data-act="unboard">Bajar (U)</button></div>` : ''}
      ${me.prison ? (() => { const good = (me.inv.swords || []).filter((x) => x.r >= 3).sort((a, b) => a.r - b.r)[0]; return `<div class="prisonbox"><b>⛓️ PRESO EN IMPEL DOWN</b><div class="small">Capturado por ${esc(me.prison.by)}. Para escapar, derrota a los <b>${me.prison.guards}</b> carcelero(s) que te vigilan o sobórnalos.</div>
        <div class="qbtns"><button class="gold" data-bribe="money" ${me.money < me.prison.bribe ? 'disabled' : ''}>💰 Soborno: ${OP.fmtBShort(me.prison.bribe)}</button>${good ? `<button class="gold" data-bribe="sword" data-id="${good.id}">🗡️ Dar «${esc(good.n)}»</button>` : ''}</div></div>`; })() : ''}
      ${me.traitor ? `<div class="ridebar order">🗡️ Traicionaste a "${esc(me.traitor.name)}": te persiguen cazarrecompensas (${Math.ceil(me.traitor.left / 60000)} min)</div>` : ''}
      ${UI.order ? `<div class="ridebar order">📣 ${esc(UI.order.text)}</div>` : ''}
      <div class="actbar">
        <button data-act="attackmode" class="${OP.Main && OP.Main.attackMode ? 'on' : ''}" title="Modo combate (R): cada clic en el mapa es un golpe al enemigo más cercano a donde hagas clic">⚔<small>${OP.Main && OP.Main.attackMode ? 'ON' : 'R'}</small></button>
        <button data-act="explore" title="Explorar la isla (E)">🔎<small>E</small><i class="cd" id="cd-explore"></i></button>
        <button data-act="train" class="${me.training ? 'on' : ''}" title="Entrenar ${MMO.TRAIN_FOCUS[UI.trainFocus()].name.toLowerCase()}: mantén T (o toca para empezar / parar) · la prioridad se cambia en Perfil">🥋<small>${me.training ? 'ON' : 'T'}</small></button>
        <button data-act="heal" title="Comer carne o ponerse vendas (H)">🍖<small>H</small></button>
        <button data-act="job" title="${me.faction === 'pirate' ? 'Saquear el pueblo (J)' : 'Patrullar la isla (J)'}">${me.faction === 'pirate' ? '💰' : '🪙'}<small>J</small><i class="cd" id="cd-job"></i></button>
        <button data-act="gate" title="Usar Monte Contracorriente, Corriente Ascendente o el paso a la Isla Coralina (G)">⛰<small>G</small></button>
        <button data-open="inventory" title="Cofre (I)">🎒<small>I</small></button>
      </div>
      ${me.training ? trainingBox(me) : ''}
      ${hakiBar(me)}
      ${me.fruit >= 0 ? (() => { const ab = MMO.abilityOf(me.fruit); return `<div class="actbar one"><button data-act="ability" title="${esc(ab.name)} · enfriamiento ${Math.round(ab.cd / 1000)} s">🍎 <b>${esc(ab.name)}</b> <small>Q</small>${me.buffLeft ? ' <small>✨ activo</small>' : ''}<i class="cd" id="cd-ability"></i></button></div>`; })() : ''}
      ${q ? `<div class="mission" data-open="dream"><div class="m-title">${MMO.QUEST_KINDS[q.kind] || '⭐'} ${esc(q.text)}</div>
        ${q.hint ? `<div class="m-hint small">📍 ${esc(q.hint)}</div>` : ''}${bar(q.cur, q.goal, 'gold')}
        <div class="m-row small"><span>${q.goal >= 1e5 ? OP.fmtBShort(q.cur) + ' / ' + OP.fmtBShort(q.goal) : q.cur + ' / ' + q.goal + (q.kind === 'survive' ? ' días' : '')}</span><span>🎁 +${OP.dots(q.xp)} EXP</span></div></div>` : ''}
      ${logPoseBox(me)}
      <div class="clevel"><b>NIVEL ${me.lvl}</b>${bar(me.xp, me.xpNeed, 'xp')}<span>${OP.dots(me.xp)} / ${OP.dots(me.xpNeed)}</span></div>
      ${miniStats([['Fuerza', me.str, me.str / statMax * 100], ['Velocidad', me.spd, me.spd / statMax * 100], ['Vida', me.hp + '/' + me.maxHp, me.hp / me.maxHp * 100], ['Poder', OP.dots(me.power)]])}
      ${bountyStrip(me.faction, me.bounty, me.rank, me.faction === 'pirate' && me.bounty ? '<a data-ptab="bounty" title="Por qué">¿por qué?</a>' : '')}
      <div class="cmoney">💰 ${fmtB(me.money)}</div>
      ${secTabs([['profile', 'PERFIL'], ['bounty', me.faction === 'pirate' ? 'RECOMPENSA' : 'MARINA'], ['stats', 'ESTADÍSTICAS'], ['info', 'INFO']])}
      ${secBody('profile', `
        <div class="kv"><span>Talento</span><b title="${esc(T.desc || '')}">${T.icon || ''} ${esc(me.talent)}</b></div>
        <div class="kv"><span>Rasgos</span><b>${me.traits.map((t) => `<span title="${esc(MMO.TRAITS[t].desc)}">${MMO.TRAITS[t].icon} ${esc(MMO.TRAITS[t].name)}</span>`).join(', ')}</b></div>
        <div class="kv"><span>Sueño</span><b>${esc(dreamTxt)}</b></div>
        ${me.fruit >= 0 ? `<div class="kv"><span>Fruta</span><b title="${esc(OP.FRUITS[me.fruit].ability)}">🍎 ${esc(OP.FRUITS[me.fruit].name)}</b></div>` : ''}
        ${sw ? `<div class="kv"><span>Espada</span><b><a data-open="inventory" style="color:${SR.color}">🗡️ ${esc(sw.n)}</a> <span class="muted small">(${esc(SR.name)})</span></b></div>` : ''}
        ${me.powerTrain ? `<div class="kv"><span>Poder entrenado</span><b>+${Math.round(me.powerTrain * 1000) / 10}%</b></div>` : ''}
        <div class="focusbar" title="Prioridad de entrenamiento: sube 0,25 pts/s mientras mantienes T (las demás, 0,01)"><span>🥋 Prioridad:</span>${Object.keys(MMO.TRAIN_FOCUS).map((k) => `<button data-focus="${k}" class="${UI.trainFocus() === k ? 'on' : ''}">${MMO.TRAIN_FOCUS[k].icon} ${MMO.TRAIN_FOCUS[k].name}</button>`).join('')}</div>
        ${trainedTable(me)}
        ${hakiBlock(me)}`)}
      ${secBody('bounty', me.faction === 'pirate' ? `
        <div class="kv"><span>Recompensa</span><b class="bounty">${me.bounty ? fmtB(me.bounty) : 'Sin recompensa'}</b></div>
        ${(me.bountyLog || []).slice(0, 5).map((e) => `<div class="blog"><b class="bounty">${e.up ? '+' + OP.fmtBShort(e.up) : '👑'}</b> ${esc(e.why)}</div>`).join('') || '<p class="muted small">Todavía no te han puesto precio. Derrota marines o saquea pueblos (J).</p>'}
        <div class="btns">${me.bounty ? '<button data-open="bountylog">📜 Historial completo</button><button data-act="poster-me">🖼 Tu cartel</button>' : ''}</div>` : `
        <div class="kv"><span>Rango</span><b>${esc(OP.RANKS[me.rank])}</b></div>
        <div class="kv"><span>Méritos</span><b>${OP.dots(me.merit)}${me.rank < 9 ? ' / ' + OP.dots(OP.RANK_MERIT[me.rank + 1]) : ''}</b></div>
        <div class="kv"><span>Capturas</span><b>${me.honor ? me.honor.caps + ' · ' + OP.fmtBShort(me.honor.value) : 'Ninguna todavía'}</b></div>
        ${me.honor && me.honor.best ? `<div class="kv"><span>Mayor captura</span><b>${esc(me.honor.best.name)} (${OP.fmtBShort(me.honor.best.bounty)})</b></div>` : ''}
        <div class="btns"><button data-open="honor">🎖️ Cuadro de honor</button></div>`)}
      ${secBody('stats', `
        ${miniStats([['Enemigos derrotados', st.npcKills || 0], ['PvP', (st.pvpWins || 0) + ' / ' + (st.pvpLosses || 0)], ['Exploraciones', st.explores || 0], ['Entrenamientos', st.trains || 0], ['Tesoros', st.treasures || 0], ['Islas', me.visited.length]])}
        <div class="prog">${prog}</div>`)}
      ${secBody('info', `
        <div class="kv"><span>Barco</span><b>⛵ ${esc((OP.SHIPS[me.ship] || {}).name || me.ship)}${me.coated ? ' 🫧' : ''}${me.logpose ? ' · 🧭' : ''}</b></div>
        <div class="kv"><span>Edad</span><b>${me.age} años</b></div>
        <div class="btns"><button class="vivre-btn" data-act="vivre-me">TARJETA VIVRE</button></div>
        <h4>📖 Diario</h4><ul class="log">${me.log.slice(0, 8).map((l) => `<li><span class="muted">${new Date(l.at).toLocaleDateString('es-ES')}</span> ${esc(l.t)}</li>`).join('') || '<li class="muted">Todavía no ha pasado nada.</li>'}</ul>`)}
    </div>`;
  }
  // ---- Entrenamiento continuo: lo que sube mientras mantienes T ----
  const TRAIN_KEYS = [['str', 'baseStr'], ['spd', 'baseSpd'], ['hp', 'baseHp'], ['power', null]];
  function trainingBox(me) {
    const f = UI.trainFocus(), F = MMO.TRAIN_FOCUS[f];
    const tr = me.trained || {}, cap = me.trainCap || MMO.trainCap(me);
    const val = f === 'power' ? '×' + MMO.fruitMul(me).toFixed(2) + ' técnicas de fruta' : f === 'hp' ? Math.round(me.baseHp) + ' PV base' : (me[f === 'str' ? 'baseStr' : 'baseSpd'] || 0).toFixed(2);
    return `<div class="trainbox"><div><b>🥋 ENTRENANDO ${F.icon} ${esc(F.name.toUpperCase())}</b> <span class="muted small">+${MMO.TRAIN_HOLD.rate} pts/s · suelta T para parar</span></div>
      <div class="small">${esc(F.name)}: <b>${val}</b> · entrenado <b>${(tr[f] || 0).toFixed(2)}</b> / ${cap}</div>${bar(tr[f] || 0, cap, 'gold')}</div>`;
  }
  function trainedTable(me) {
    const tr = me.trained || {}, cap = me.trainCap || MMO.trainCap(me);
    const desc = { str: 'daño de los golpes', spd: 'andar y atacar más rápido (×' + MMO.walkMul(me).toFixed(2) + ' al andar)', hp: 'PV máximos', power: 'daño de técnicas de fruta (×' + MMO.fruitMul(me).toFixed(2) + ')' };
    return `<div class="trained small"><div class="muted">Puntos entrenados (tope ${cap} por estadística a tu nivel):</div>
      ${TRAIN_KEYS.map(([k]) => `<div class="kv"><span>${MMO.TRAIN_FOCUS[k].icon} ${MMO.TRAIN_FOCUS[k].name}</span><b title="${esc(desc[k])}">${(tr[k] || 0).toFixed(2)} <span class="muted">· ${esc(desc[k])}</span></b></div>`).join('')}</div>`;
  }
  // ---- Aura activa: botones Z / X / V con su recarga ----
  const HAKI_KEYS = [['obs', 0, 'X'], ['arm', 1, 'Z'], ['conq', 2, 'V']];
  function hakiBar(me) {
    const has = me.haki || [false, false, false];
    if (!has.some(Boolean)) return '';
    return `<div class="actbar haki">${HAKI_KEYS.filter(([, i]) => has[i]).map(([k, i, key]) => {
      const H = MMO.HAKI[i], lvl = MMO.hakiLevel(me, k), on = me.hakiOn && me.hakiOn[k];
      return `<button data-act="haki-${k}" class="${on ? 'on' : ''}" title="${esc(H.name)} nivel ${lvl} (${key})">${H.icon}<small>${key}</small><b class="hk-lvl">${lvl}</b><i class="cd" id="cd-h${k}"></i></button>`;
    }).join('')}</div>`;
  }
  // Aura: lo que ya dominas (con su nivel de maestría) y, en islas de entrenamiento especial, despertar Observación o Armadura
  function hakiBlock(me) {
    const has = me.haki || [false, false, false];
    const owned = HAKI_KEYS.filter(([, i]) => has[i]);
    const I = !me.boat && MMO.islandAt(me.x, me.y);
    const missing = [0, 1].filter((i) => !has[i]);
    let h = owned.map(([k, i, key]) => {
      const H = MMO.HAKI[i], lvl = MMO.hakiLevel(me, k), xp = (me.hakiXp && me.hakiXp[k]) || 0, next = MMO.HAKI_MASTERY[lvl + 1];
      return `<div class="kv"><span>${H.icon} ${esc(H.name.replace('Aura de ', '').replace('Aura del ', ''))} (${key})</span><b>Nivel ${lvl}${next ? ` <span class="muted">· ${OP.dots(xp)} / ${OP.dots(next)}</span>` : ' <span class="muted">· máximo</span>'}</b></div>`;
    }).join('');
    if (!has[2]) h += `<div class="muted small">⚡ Aura del Rey: no naciste con él (solo el ${Math.round(MMO.CONQ_BORN * 100)}% lo tiene).</div>`;
    if (me.lvl >= MMO.HAKI_LVL && missing.length && I && I.train) {
      h += `<div class="hakibar"><div class="small"><b>⚡ Despertar Aura</b> <span class="muted">(isla de entrenamiento especial · nivel ${MMO.HAKI_LVL}+)</span></div>
        <div class="hk-btns">${missing.map((k) => { const H = MMO.HAKI[k]; return `<button data-haki="${k}" title="${esc(H.desc)} · probabilidad base ${Math.round(H.chance * 100)}%">${H.icon} ${esc(H.name.replace('Aura de ', ''))}</button>`; }).join('')}</div></div>`;
    } else if (me.lvl >= MMO.HAKI_LVL && missing.length) {
      h += `<div class="muted small" style="margin:2px 0 6px">⚡ Ya puedes despertar el Aura de Observación o de Armadura: ve a una isla con entrenamiento especial (🥋 en Islas).</div>`;
    } else if (missing.length) h += `<div class="muted small">Observación y Armadura se despiertan desde el nivel ${MMO.HAKI_LVL} en islas de entrenamiento especial.</div>`;
    return h;
  }
  function playerPanel(sid) {
    const p = Net.players.get(sid);
    if (!p) { UI.sel = null; return myPanel(Net.me); }
    const d = info.key === 'p:' + sid ? info.data : null;
    const me = Net.me;
    const canInvite = Net.crew && Net.crew.captain === me.cid && !p.crewId && p.faction === me.faction;
    const dist = Math.hypot(p.rx - me.x, p.ry - me.y);
    const role = p.faction === 'pirate' ? '☠ Pirata' + (p.captain ? ' · Capitán' : '') : '⚓ ' + esc(OP.RANKS[p.rank]);
    return `<div class="pcard">
      <div class="chead"><img class="cport" src="${face(p.app, p.faction, p.rank, null, p.dead)}" alt="">
        <div class="cinfo"><div class="cname">${esc(p.name)}</div>${d && d.epithet ? `<div class="pepi">«${esc(d.epithet)}»</div>` : ''}
          <div class="crole ${p.faction}">${role} <span class="tag player">Jugador</span></div><div class="csub">${p.crewName ? esc(p.crewName) : 'Sin tripulación'}</div></div>
        <button class="cx" data-act="desel" title="Cerrar">✕</button></div>
      <div class="cstatus">${p.dead ? '💀 Fuera de combate' : p.boat ? '⛵ Navegando' : '📍 En tierra'} · a ${dist.toFixed(1)} casillas</div>
      <div class="clevel"><b style="color:${lvlColor(p.lvl)}">NIVEL ${p.lvl}</b>${bar(p.hp, p.maxHp, 'hp')}<span>❤️ ${p.hp}/${p.maxHp}</span></div>
      ${bountyStrip(p.faction, p.bounty, p.rank)}
      <div class="qbtns">
        <button data-act="pm" data-name="${esc(p.name)}">💬 Susurrar</button>
        ${canInvite ? '<button class="gold" data-act="invite" data-sid="' + sid + '">🤝 Invitar</button>' : ''}
        ${!Net.crew && p.crewId && p.faction === me.faction ? '<button class="gold" data-act="joinreq" data-crew="' + p.crewId + '">📨 Pedir unirme</button>' : ''}
        ${p.crewId && p.crewId === me.crewId && p.boat && !p.ride && !(Net.players.get(Net.sid) || {}).ride ? `<button class="gold" data-act="board" data-sid="${sid}">⛵ Subir a su barco</button>` : ''}
      </div>
      ${secTabs([['profile', 'PERFIL'], ['bounty', p.faction === 'pirate' ? 'RECOMPENSA' : 'MARINA'], ['stats', 'ESTADÍSTICAS'], ['info', 'INFO']])}
      ${secBody('profile', d ? `
        ${miniStats([['Fuerza', d.str], ['Velocidad', d.spd], ['Poder', OP.dots(d.power)], ['Islas', d.visited]])}
        <div class="kv"><span>Talento</span><b>${esc(d.talent)}</b></div>
        <div class="kv"><span>Rasgos</span><b>${d.traits.map((t) => MMO.TRAITS[t] ? MMO.TRAITS[t].icon + ' ' + esc(MMO.TRAITS[t].name) : '').join(', ')}</b></div>
        ${d.fruit ? `<div class="kv"><span>Fruta</span><b>🍎 ${esc(d.fruit)}</b></div>` : ''}` : '<p class="muted small">Cargando...</p>')}
      ${secBody('bounty', p.faction === 'pirate' ? `
        <div class="kv"><span>Recompensa</span><b class="bounty">${p.bounty ? fmtB(p.bounty) : 'Sin recompensa'}</b></div>
        <div class="kv"><span>Estado</span><b>${p.bounty ? (p.dead ? 'Fuera de combate' : '🔎 Se busca, vivo o muerto') : 'Nadie le busca todavía'}</b></div>
        <div class="btns">${p.bounty ? '<button data-act="poster-p">🖼 Ver su cartel</button>' : ''}</div>` : `
        <div class="kv"><span>Rango</span><b>${esc(OP.RANKS[p.rank])}</b></div>
        <div class="btns"><button data-open="honor">🎖️ Cuadro de honor</button></div>`)}
      ${secBody('stats', d ? miniStats([['Victorias PvP', d.stats.pvpWins], ['Derrotas PvP', d.stats.pvpLosses], ['Enemigos derrotados', d.stats.npcKills || 0], ['Exploraciones', d.stats.explores || 0]]) : '<p class="muted small">Cargando...</p>')}
      ${secBody('info', d ? `
        <div class="kv"><span>Sueño</span><b>${esc(d.dream || '')}</b></div>
        <div class="kv"><span>Origen</span><b>${esc(d.home)}</b></div>
        <div class="kv"><span>Edad</span><b>${d.age} años</b></div>
        ${d.log.length ? `<h4>📖 Diario</h4><ul class="log">${d.log.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}` : '<p class="muted small">Cargando...</p>')}
    </div>`;
  }
  function persText(p) {
    const W = OP.PERSONALITY_WORDS;
    const keys = { amb: 'ambition', agg: 'aggression', cou: 'courage', soc: 'sociability', gre: 'greed', loy: 'loyalty', cur: 'curiosity', hon: 'honor' };
    return Object.keys(keys).map((k) => [k, p[k]]).sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5)).slice(0, 3).map(([k, v]) => W[keys[k]][v >= 0.5 ? 1 : 0]).join(', ');
  }
  function npcPanel(id) {
    const a = OP.S.A[id];
    const d = info.key === 'n:' + id ? info.data : null;
    if (!a && !d) return '<p class="muted">Cargando...</p>';
    const name = d ? d.name : a.name, faction = d ? d.faction : a.faction, lvl = d ? d.lvl : a.lvl, rank = d ? d.rank : a.rank, app = d ? d.app : a.app;
    let loc = '';
    if (d) {
      if (d.loc === 'prison') loc = '⛓ Preso en ' + esc(OP.M.islands[d.isl].name);
      else if (d.loc === 'ship') loc = '⛵ En el mar';
      else if (d.loc === 'island') loc = '📍 En ' + esc(OP.M.islands[d.isl].name);
      else loc = d.loc === 'dead' ? '✝ Muerto' : '';
    }
    const plan = d && d.plan;
    const myCrewNpc = !!(Net.crew && (Net.crew.npcs || []).some((n) => n.id === id));
    const isCap = Net.crew && Net.crew.captain === Net.me.cid;
    const canRecruit = !!(d && isCap && !myCrewNpc && !d.pcCrew && faction === Net.me.faction && d.loc === 'island');
    const role = faction === 'pirate' ? '☠ Pirata' + (d && d.role ? ' · ' + esc(d.role) : '') : '⚓ ' + esc(OP.RANKS[rank]);
    const epi = d ? d.epithet : a.epithet;
    return `<div class="pcard">
      <div class="chead"><img class="cport" src="${face(app, faction, rank)}" alt="">
        <div class="cinfo"><div class="cname">${esc(name)}</div>${epi ? `<div class="pepi">«${esc(epi)}»</div>` : ''}
          <div class="crole ${faction}">${role} <span class="tag npc">NPC</span>${myCrewNpc ? ' <span class="tag player">🤝 Tuyo</span>' : ''}</div>
          <div class="csub">${d ? (d.solo ? 'Pirata solitario' : esc(d.crew || '—')) : ''}</div></div>
        <button class="cx" data-act="desel" title="Cerrar">✕</button></div>
      <div class="cstatus">${loc}${a && a.ko ? ' · 😵 KO' : ''}</div>
      <div class="clevel"><b style="color:${lvlColor(lvl)}">NIVEL ${lvl}</b>${d ? bar(d.hp, d.maxHp, 'hp') + `<span>❤️ ${d.hp}/${d.maxHp}</span>` : ''}</div>
      ${bountyStrip(faction, d ? d.bounty : a.bounty, rank)}
      ${canRecruit || (myCrewNpc && isCap) ? `<div class="qbtns">${canRecruit ? `<button class="gold" data-act="recruit" data-id="${id}">🤝 Reclutar</button>` : ''}${myCrewNpc && isCap ? `<button data-act="dismiss" data-id="${id}">👋 Despedir</button>` : ''}</div>` : ''}
      ${myCrewNpc && isCap ? (() => { const n = Net.crew.npcs.find((x) => x.id === id); const O = MMO.NPC_ORDERS[n && n.order] || MMO.NPC_ORDERS.follow; return `<div class="small">Orden: <b>${O.icon} ${esc(O.name)}</b></div>` + ordersBlock(Net.crew, id); })() : ''}
      ${secTabs([['profile', 'PERFIL'], ['bounty', faction === 'pirate' ? 'RECOMPENSA' : 'MARINA'], ['info', 'INFO']])}
      ${secBody('profile', d ? `
        ${miniStats([['Fuerza', d.str], ['Velocidad', d.spd], ['Poder', OP.dots(d.power)], ['Edad', d.age + ' años']])}
        <div class="kv"><span>Talento</span><b>${(OP.TALENTS[d.talent] || {}).icon || ''} ${esc(d.talent)}</b></div>
        <div class="kv"><span>Carácter</span><b>${esc(persText(d.pers))}</b></div>
        ${d.fruit >= 0 ? `<div class="kv"><span>Fruta</span><b>🍎 ${esc(OP.FRUITS[d.fruit].name)}</b></div>` : ''}
        ${d.haki && d.haki.some(Boolean) ? `<div class="kv"><span>Aura</span><b>${['Observación', 'Armadura', 'Rey'].filter((x, i) => d.haki[i]).join(', ')}</b></div>` : ''}
        <div class="kv"><span>Sueño</span><b>${esc(d.dream)}</b></div>` : '<p class="muted small">Cargando...</p>')}
      ${secBody('bounty', d ? (faction === 'pirate' ? `
        <div class="kv"><span>Recompensa</span><b class="bounty">${d.bounty ? fmtB(d.bounty) : 'Sin recompensa'}</b></div>
        <div class="kv"><span>Estado</span><b>${d.loc === 'prison' ? '⛓ Capturado' : d.loc === 'dead' ? '✝ Muerto' : d.bounty ? '🔎 Se busca' : 'Nadie le busca'}</b></div>
        <div class="btns">${d.bounty ? '<button data-act="poster-npc">🖼 Ver su cartel</button>' : ''}</div>` : `
        <div class="kv"><span>Rango</span><b>${esc(OP.RANKS[rank])}</b></div><div class="kv"><span>Méritos</span><b>${OP.dots(d.merit)}</b></div>`) : '<p class="muted small">Cargando...</p>')}
      ${secBody('info', d ? `
        ${plan ? `<div class="mission"><div class="m-title">${plan.mission ? '📌 Misión' : '🧭 Plan'}: ${esc(plan.title)}</div>${bar(plan.prog, 1, 'gold')}
          <div class="m-row small"><span>${plan.phase === 'travel' ? 'De viaje' : 'En marcha'} · ${Math.round(plan.prog * 100)}%</span><span>⏳ ${OP.fmtHours(plan.eta / OP.SIM_PER_CAL)}</span></div></div>` : ''}
        <div class="btns"><button class="vivre-btn" data-act="vivre-npc">TARJETA VIVRE</button></div>
        <h4>📖 Diario</h4><ul class="log">${d.log.map((l) => `<li><span class="muted">${OP.fmtDay(l.d)}</span> ${esc(l.t)}</li>`).join('') || '<li class="muted">Todavía no ha pasado nada.</li>'}</ul>` : '<p class="muted small">Cargando...</p>')}
    </div>`;
  }
  function biomeName(b) {
    return ({ tropical: 'Isla tropical', forest: 'Bosques', winter: 'Invierno eterno', desert: 'Desierto', city: 'Ciudad', canals: 'Ciudad de canales', fortress: 'Fortaleza',
      prison: 'Prisión', volcanic: 'Fuego y hielo', prehistoric: 'Jungla prehistórica', sky: 'Isla del cielo', ghost: 'Isla fantasma', mangrove: 'Manglares gigantes',
      sakura: 'Cerezos y montañas', candy: 'Islas de dulce', future: 'Isla futurista', elephant: 'Sobre un elefante gigante', toy: 'Reino de juguetes', giants: 'Tierra de gigantes',
      ruins: 'Ruinas quemadas', whiteruins: 'Ciudad blanca en ruinas', wasteland: 'Vertedero', jungle: 'Selva', bubble: 'Burbuja bajo el mar', mountain: 'Montañosa',
      legend: 'Isla legendaria', wood: 'Restaurante flotante', cactus: 'Montañas cactus', rocky: 'Cabo rocoso' })[b] || b;
  }
  function islandPanel(I) {
    const d = info.key === 'i:' + I.idx ? info.data : null;
    const hidden = I.hidden && !(OP.S.isl[I.idx] || {}).discovered;
    const stars = '★'.repeat(Math.ceil(I.danger / 2)) + '☆'.repeat(5 - Math.ceil(I.danger / 2));
    const shop = Object.keys(MMO.SHOP).filter((k) => MMO.SHOP[k].where(I)).map((k) => MMO.SHOP[k].icon + ' ' + MMO.SHOP[k].name);
    const perk = I.spawnPerk ? MMO.SPAWN_PERKS[I.spawnPerk] : null;
    let pon = I.poneglyph === 'historic' ? '🗿 Monolito histórico' : I.poneglyph === 'road' ? '🗿 Monolito de Ruta' : '';
    if (d && d.road4) pon = '🗿 Monolito de Ruta (el cuarto, descubierto)';
    return `<div class="icard">
      <div class="iname">${I.base ? '⚓ ' : ''}${hidden ? 'Isla Postrera ???' : esc(I.name)}</div>
      <div class="muted">${esc(seaName(I.sea))} · ${biomeName(I.biome)}${Net.me.visited.indexOf(I.idx) >= 0 ? ' · <span class="ok">✓ visitada</span>' : ''}</div>
      <div class="kv"><span>Peligro</span><b class="danger">${stars}</b> <span class="muted small">(${I.danger}/10)</span></div>
      <div class="kv"><span>Población</span><b>${hidden || !d ? '???' : OP.dots(d.pop)}</b></div>
      <div class="kv"><span>Asentamientos</span><b>${hidden ? '???' : I.towns.map(esc).join(', ')}</b></div>
      <div class="kv"><span>Rasgos</span><b>${I.traits.map(esc).join(' · ')}</b></div>
      ${perk ? `<div class="kv"><span>Aparición</span><b>✨ ${esc(perk.text)}</b></div>` : ''}
      ${I.base ? `<div class="kv"><span>Base</span><b>${esc(I.base)}</b> ${d ? (d.baseHp <= 0 ? '<b class="no">DESTRUIDA</b>' : bar(d.baseHp, d.baseMax, 'hp')) : ''}</div>` : ''}
      ${I.train ? `<div class="kv"><span>Entrenamiento</span><b>🥋 ${esc(I.train.label)}</b></div>` : ''}
      ${shop.length && !hidden ? `<div class="kv"><span>Tienda</span><b>${shop.map(esc).join(' · ')}</b></div>` : ''}
      ${I.hospital ? '<div class="kv"><span>Médicos</span><b>🩺 Curan el doble de rápido</b></div>' : ''}
      ${pon ? `<div class="kv"><span>Historia</span><b>${pon}</b></div>` : ''}
      ${d && d.rumor ? '<div class="kv"><span>Rumor</span><b>🍎 Dicen que aquí hay una Fruta Maldita</b></div>' : ''}
      ${d && d.logLock ? `<div class="logpose locked">🧭 <b>Ruta del Compás de Ruta</b><div class="small">🔒 ${esc(d.logLock)}</div></div>` : ''}
      ${d && d.owner ? `<div class="kv"><span>Territorio</span><b>🏴 ${esc(d.owner.name)} (${d.owner.kind === 'king' ? 'Rey de los Mares' : 'Señor del Mar'}) · 🛡️ ${d.owner.guards} custodio(s)</b></div>` : ''}
      ${d && d.claimable && !(d.owner && d.owner.mine) ? `<div class="btns"><button class="gold" data-claim="1" title="Desembarca aquí y reclámala para tu tripulación">🏴 Reclamar esta isla</button></div>` : ''}
      ${d && d.guardian ? `<div class="kv"><span>Territorio de</span><b>👑 ${esc(d.guardian.name)}</b></div>` : ''}
      ${d && d.event ? '<div class="kv"><b class="bounty">🌟 ¡Evento del tesoro legendario aquí!</b></div>' : ''}
      ${d && d.attacked ? '<div class="kv"><b class="no">🔥 Atacada hace poco</b></div>' : ''}
      ${d ? `${d.players.length ? `<h4>🧑 Jugadores aquí (${d.players.length})</h4><div class="chips">${d.players.map((p) => `<a class="chip player" data-psel="${p.sid}">${p.faction === 'pirate' ? '☠' : '⚓'} ${esc(p.name)} <small>nv${p.lvl}</small></a>`).join('')}</div>` : ''}
        <h4>👥 Aquí ahora (${d.total})</h4>
        <div class="chips">${d.occ.map((a) => `<a class="chip ${a.faction}" data-nsel="${a.id}">${a.faction === 'pirate' ? '☠' : '⚓'} ${esc(a.name)} <small>nv${a.lvl}</small></a>`).join('') || '<span class="muted">Nadie importante.</span>'}</div>
        ${d.docked.length ? `<h4>⛵ Barcos en el puerto</h4><div class="chips">${d.docked.map((x) => `<a class="chip" ${x.leader ? `data-nsel="${x.leader}"` : ''}>${esc(x.name)} <small>${esc(OP.SHIPS[x.type].name)}</small></a>`).join('')}</div>` : ''}
        ${d.nprisoners ? `<h4>⛓ Presos (${d.nprisoners})</h4><div class="chips">${d.prisoners.map((a) => `<a class="chip pirate" data-nsel="${a.id}">${esc(a.name)}${a.bounty ? ' <small>' + OP.fmtBShort(a.bounty) + '</small>' : ''}</a>`).join('')}</div>` : ''}` : '<p class="muted small">Cargando...</p>'}
      <div class="btns"><button data-act="look" data-x="${I.x}" data-y="${I.y}">👁 Ver en el mapa</button><button data-act="desel">✕</button></div>
    </div>`;
  }

  Net.on('res', (m) => {
    if (m.what === 'inspect' && UI.sel && ((m.t === 'p' && UI.sel.t === 'p' && UI.sel.id === m.id) || (m.t === 'n' && UI.sel.t === 'n' && UI.sel.id === m.id))) { info.key = m.t + ':' + m.id; info.data = m.info; UI.renderPanel(false); }
    if (m.what === 'island' && UI.sel && UI.sel.t === 'i' && UI.sel.id === m.id) { info.key = 'i:' + m.id; info.data = m.info; UI.renderPanel(false); }
    if (m.what === 'inspect' && UI.pendingVivre === m.t + ':' + m.id) { UI.pendingVivre = null; UI.openVivre(m.info, m.t === 'n'); }
    if (UI.onRes) UI.onRes(m);
  });

  // ======================================================================
  //  NOTICIAS Y CHAT
  // ======================================================================
  UI.buildNews = function () {
    const f = $('#news-filters');
    if (UI.newsTab === 'news') f.innerHTML = NEWS_FILTERS.map(([k, l]) => `<button data-nf="${k}" class="${UI.settings.newsFilter === k ? 'on' : ''}">${l}</button>`).join('');
    else f.innerHTML = CHAT_CH.map(([k, l]) => `<button data-cf="${k}" class="${UI.chatCh === k ? 'on' : ''}">${l}</button>`).join('');
    for (const b of document.querySelectorAll('.news-tabs button')) b.classList.toggle('on', b.dataset.ntab === UI.newsTab);
    $('#news-list').classList.toggle('hidden', UI.newsTab !== 'news');
    $('#chat-log').classList.toggle('hidden', UI.newsTab !== 'chat');
    $('#chat-form').classList.toggle('hidden', UI.newsTab !== 'chat');
    if (UI.newsTab === 'chat') { $('#chat-dot').classList.add('hidden'); const l = $('#chat-log'); l.scrollTop = l.scrollHeight; }
  };
  let lastNewsKey = '';
  UI.renderNews = function (force) {
    const S = OP.S;
    const key = (S.news[0] ? S.news[0].id : 0) + UI.settings.newsFilter;
    if (!force && key === lastNewsKey) return;
    lastNewsKey = key;
    const f = UI.settings.newsFilter;
    const list = S.news.filter((n) => f === 'all' || n.cat === f || (f === 'capture' && n.cat === 'death') || (f === 'world' && (n.cat === 'laughtale' || n.cat === 'attack'))).slice(0, 60);
    $('#news-list').innerHTML = list.map((n) => `<li class="imp${n.imp}" data-news="${n.id}"><span class="n-ic">${NEWS_ICON[n.cat] || '•'}</span><span class="n-t"><small>${OP.fmtDay(n.t)}</small> ${esc(n.text)}</span></li>`).join('') || '<li class="muted">Sin noticias todavía.</li>';
  };
  const chatMsgs = [];
  UI.addChat = function (m) {
    chatMsgs.push(m);
    if (chatMsgs.length > 150) chatMsgs.shift();
    if (showInCh(m)) appendChat(m);
    if (UI.newsTab !== 'chat' && m.ch !== 'system') $('#chat-dot').classList.remove('hidden');
  };
  function showInCh(m) { const c = UI.chatCh; if (c === 'all') return true; if (c === 'global') return m.ch === 'global' || m.ch === 'system'; return m.ch === c; }
  function appendChat(m) {
    const log = $('#chat-log');
    const li = document.createElement('li');
    const t = new Date(m.t || Date.now());
    const hh = '<span class="t">' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + '</span>';
    if (m.ch === 'system') li.innerHTML = hh + `<span class="sys ${m.kind === 'event' ? 'ev' : ''}">${esc(m.text)}</span>`;
    else {
      const pre = m.ch === 'crew' ? '<span class="crew">[Trip.] </span>' : m.ch === 'pm' ? `<span class="pm">[${m.from === (Net.me && Net.me.name) ? 'a ' + esc(m.to) : 'de ' + esc(m.from)}] </span>` : '';
      li.innerHTML = hh + pre + `<span class="who ${m.fac === 'marine' ? 'marine' : 'pirate'}" data-pmname="${esc(m.from)}">${esc(m.from)}</span>: <span class="${m.ch === 'pm' ? 'pm' : m.ch === 'crew' ? 'crew' : ''}">${esc(m.text)}</span>`;
    }
    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
    log.appendChild(li);
    while (log.children.length > 150) log.firstChild.remove();
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  function rerenderChat() { $('#chat-log').innerHTML = ''; for (const m of chatMsgs) if (showInCh(m)) appendChat(m); }
  function sendChat(text) {
    text = text.trim();
    if (!text) return;
    let m = /^\/(w|p|msg)\s+"([^"]+)"\s+(.+)$/i.exec(text) || /^\/(w|p|msg)\s+(\S+)\s+(.+)$/i.exec(text);
    if (m) return Net.send('chat', { ch: 'pm', to: m[2].replace(/_/g, ' '), text: m[3] });
    m = /^\/(c|t|crew)\s+(.+)$/i.exec(text);
    if (m) return Net.send('chat', { ch: 'crew', text: m[2] });
    if (UI.chatCh === 'crew') return Net.send('chat', { ch: 'crew', text });
    Net.send('chat', { ch: 'global', text });
  }
  UI.setupNews = function () {
    $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); const inp = $('#chat-input'); sendChat(inp.value); inp.value = ''; inp.blur(); });
    $('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); } e.stopPropagation(); });
    $('#side-toggle').addEventListener('click', () => $('#side').classList.toggle('collapsed'));
    $('#news-toggle').addEventListener('click', () => $('#news').classList.toggle('collapsed'));
  };
  UI.openChat = function (prefill) {
    UI.newsTab = 'chat';
    $('#news').classList.remove('collapsed');
    UI.buildNews();
    const inp = $('#chat-input');
    if (prefill != null) inp.value = prefill;
    inp.focus();
  };
  UI.whisper = function (name) { UI.openChat('/w ' + (name.indexOf(' ') >= 0 ? '"' + name + '"' : name) + ' '); };

  UI.toast = function (text, big, mine) {
    const box = $('#toasts');
    while (box.children.length >= 3) box.removeChild(box.firstChild);
    const d = document.createElement('div');
    d.className = 'toast' + (mine ? ' mine' : '') + (big ? ' big' : '');
    d.textContent = text;
    box.appendChild(d);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 600); }, big ? 6000 : 4200);
  };

  // ======================================================================
  //  VENTANAS (pergamino)
  // ======================================================================
  UI.openModal = function (html, cls) {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-box ${cls || ''}"><button class="close" data-close="1" title="Cerrar (Esc)">✕</button>${html}</div>`;
    m.classList.remove('hidden');
  };
  UI.closeModal = function () {
    if (UI.modalKind === 'changelog') { try { localStorage.setItem('opw_version_seen', UI.VERSION); } catch (e) { /* sin almacenamiento */ } }
    $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; UI.modalKind = '';
  };
  // ---------- Novedades de la versión (se muestra una vez por versión) ----------
  UI.VERSION = '1.05';
  UI.CHANGELOG = [
    ['🗡️', 'NUEVO · Espadas a la vista', 'Tu espada se ve en la mano y pega más fuerte que un puñetazo. Abre el Dojo con K para ver tus técnicas, accesorios y aspecto.'],
    ['⚔️', 'NUEVO · Técnicas de espada', 'Mantén T con una espada equipada para ganar maestría y desbloquea Doble Espada, Triple Espada y los ataques especiales (teclas 1, 2 y 3).'],
    ['🤫', 'NUEVO · Misiones secretas', 'Algunos vecinos (❔) esperan dentro de las casas. Sus encargos dan espadas especiales y accesorios con más fuerza, vida o velocidad.'],
    ['🎨', 'NUEVO · Personaje por capas', 'Sombrero, cicatriz y complemento ahora son independientes. Combínalos cuando quieras desde el Dojo.'],
    ['🏝️', 'Islas más grandes y con nombres nuevos', 'Las islas han crecido, y las islas, mares, frutas y poderes del mundo tienen ahora nombre propio.'],
    ['📱', 'Juego en móvil', 'Joystick, botones táctiles, zoom con dos dedos y mejor rendimiento en teléfonos.'],
    ['🏠', 'NUEVO · Edificios por dentro', 'Tabernas (🍺), clínicas (⚕️) y casas se pueden visitar: acércate a la puerta y pulsa E. Dentro no se ve el mapa de fuera y solo ves a quien está en la misma sala. Habla con sus personajes (E): cuentan la historia del mundo y te dicen a dónde ir.'],
    ['🫧', 'NUEVO · El Viejo Timonel de las Burbujas', 'En la Taberna La Burbuja Rota de las Burbujas, Aldric Velasombra te enseña el recubrimiento del barco para bajar a la Isla Coralina y al Mar Indómito. Sin hablar con él, nadie te lo vende.'],
    ['🧪', 'NUEVO · Alquimistas', 'En las clínicas (Invernia, las Burbujas, Puerto Umbral, Puerto Canales...) puedes purgar tu Fruta Maldita para comer otra, o comprar frutas libres del mundo (cambian cada hora). Cuesta muchos doblones.'],
    ['🐾', 'NUEVO · Transformación Bestia (C)', 'Con una fruta Bestia, pulsa C para pasar a tu forma híbrida (lobo, leopardo, fénix, dragón, dinosaurio...) durante 60 s: +35% fuerza, +20% velocidad, +30% vida.'],
    ['🎵', 'NUEVO · Música y sonidos', 'Música de aventura, golpes, técnicas, puertas, el mar al navegar... Ajusta el volumen o silencia con el botón 🔊 de arriba a la derecha.'],
    ['🐢', 'Entrenamientos especiales a la vista', 'En las islas de entrenamiento se ve lo que haces: caparazón de tortuga gigante a la espalda (¡y puedes caminar con él!), troncos en la nieve, espada de madera, pesas, rocas, cascadas...'],
    ['⏳', 'Misiones más justas', 'Fuera las misiones casi imposibles de "enemigos 2 niveles más fuertes". Hay más enemigos en todas las islas y llegan misiones de supervivencia al avanzar: aguantar días de juego en Invernia, Arenara, Isla Dualia o Kagero.'],
    ['🍎', 'NUEVO · Muchas más Frutas Malditas', 'Ahora aparecen cerca de los jugadores conectados, con aviso y marca en el mapa, y se ven desde más lejos. Si pasa tiempo sin que nadie encuentre una, la suerte sube (sistema de lástima) hasta que aparece seguro. Y tienen un dibujo nuevo, con su elemento (las de fuego, ¡arden!).'],
    ['⛰', 'NUEVO · Volver por Monte Contracorriente', 'Desde la salida de Monte Contracorriente en el Mar Esmeralda, pulsa G en barco y elige a qué mar bajar: del Este, del Oeste, del Norte o del Sur.'],
    ['📜', 'NUEVO · Contratos y dificultades', 'Cada enemigo tiene dificultad: 🟢 Fácil, 🟡 Media, 🟠 Difícil o 🔴 Épica, y da mucha más EXP cuanto más difícil. En Misiones (O) tienes 4 contratos contra NPC reales del mundo, uno por dificultad.'],
    ['🥋', 'NUEVO · Entrenamiento manteniendo T', 'Elige tu prioridad (Fuerza, Velocidad, Poder o Vida) en tu Perfil y mantén T: sube 0,25 puntos por segundo (las otras, 0,01). Poder = daño de tu fruta, Velocidad = andar y atacar más rápido, Fuerza = golpes, Vida = PV.'],
    ['🛡️', 'NUEVO · Aura activa', 'Z: Armadura (por niveles cubre brazos, piernas, torso y todo el cuerpo de negro metálico). X: Observación (ves las siluetas de todos a través de edificios y árboles). Se despiertan desde el nivel 30 en islas de entrenamiento especial.'],
    ['⚡', 'NUEVO · Aura del Rey', 'Solo el 10% de los personajes nace con él. Tecla V: onda expansiva con rayos rojos y negros; los enemigos débiles caen inconscientes y los fuertes y los jugadores quedan aturdidos. Con más maestría, más radio e intensidad.'],
    ['🏝️', 'Costas más suaves', 'Las orillas de las islas ya no se ven como escaleras de cuadrados.'],
    ['⚔️', 'NUEVO · Ejecución pública', 'Un pirata de 500.000.000 o más derrotado por la Marina es llevado a la plataforma de ejecución de Bastión Central. Todo el mundo lo ve con una cuenta atrás de 60 segundos; el condenado puede decir sus últimas palabras y otro pirata puede rescatarlo manteniendo E junto a la plataforma. Si nadie llega, su recompensa vuelve a 0.'],
    ['🧭', 'Ruta del Compás de Ruta', 'Desde el Mar Esmeralda hay que seguir las islas en orden. Cada una pide nivel, fama (recompensa o méritos), poder y tamaño de tripulación. Los Señores del Mar pueden saltarse el orden y el Rey de los Mares va libre.'],
    ['🏴‍☠️', 'Tripulaciones y flotas', 'Máximo 10 por tripulación. El capitán puede tener hasta 3 tripulaciones secundarias, cada una con su «Almirante de Flota».'],
    ['🏆', 'Ranking de tripulaciones', 'Las que suman 5.000.000 o más de recompensa entran al directorio. Cada tripulación tiene su foto de grupo.'],
    ['🤝', 'Unirse a tripulaciones NPC', 'Puedes pedir entrar en tripulaciones de NPC. Si las traicionas, ganarás infamia y recompensa… y te perseguirán cazarrecompensas.'],
    ['👑', 'Territorios de los Señores del Mar', 'Los Señores del Mar y el Rey de los Mares pueden reclamar islas, dejar guardias, defenderlas de invasiones y cobrar tributos.'],
    ['⛓️', 'Prisión Abismo', 'Un pirata de más de 80.000.000 derrotado por la Marina acaba en Prisión Abismo. Sal venciendo a los carceleros o sobornando con Doblones u objetos valiosos.'],
    ['🖼️', 'Carteles de élite', 'Desde 350.000.000 el cartel de SE BUSCA tiene marco dorado e imagen personalizada.'],
  ];
  UI.showChangelog = function (force) {
    let seen = '';
    try { seen = localStorage.getItem('opw_version_seen') || ''; } catch (e) { /* sin almacenamiento */ }
    if (!force && seen === UI.VERSION) return;
    UI.openModal(`<h2>📣 Novedades · Versión ${UI.VERSION}</h2>
      <ul class="changelog">${UI.CHANGELOG.map(([i, t, d]) => `<li><span class="cl-i">${i}</span><div><b>${t}</b><div class="muted small">${d}</div></div></li>`).join('')}</ul>
      <div class="btns"><button class="gold" data-close="1">Entendido</button></div>`, 'changelog-modal');
    UI.modalKind = 'changelog';
  };
  UI.isModal = () => !$('#modal').classList.contains('hidden');
  UI.open = function (kind) {
    if (kind === 'news') return UI.showChangelog(true);
    if (!Net.me && kind !== 'help') return;
    UI.modalKind = kind;
    const loading = (t, cls, hub) => UI.openModal(`${hub ? hubTabs(hub, kind) : ''}<h2>${t}</h2><p class="muted">Cargando...</p>`, cls);
    if (kind === 'wanted') { loading('📜 Carteles de SE BUSCA', 'wide board', 'boards'); return Net.send('req', { what: 'wanted' }); }
    if (kind === 'honor') { loading('🎖️ Cuadro de honor - Marina', 'wide board', 'boards'); return Net.send('req', { what: 'honor' }); }
    if (kind === 'crews') { loading('🏴‍☠️ Tripulaciones', 'wide'); return Net.send('req', { what: 'crews' }); }
    if (kind === 'marine') { loading('⚓ La Marina', 'wide', 'world'); return Net.send('req', { what: 'marine' }); }
    if (kind === 'fruits') { loading('🍎 Frutas Malditas', 'wide', 'world'); return Net.send('req', { what: 'fruits' }); }
    if (kind === 'islands') return openIslands();
    if (kind === 'paper') return openPaper();
    if (kind === 'inventory') return openInventory();
    if (kind === 'dream') return openDream();
    if (kind === 'help') return openHelp();
    if (kind === 'codes') return openCodes();
    if (kind === 'bountylog') return openBountyLog();
    if (kind === 'shipcustom') { UI.shipEdit = Object.assign({ hull: MMO.SHIP_COLORS[0], sail: MMO.SAIL_COLORS[0], flagBg: MMO.SAIL_COLORS[0], fg: MMO.FLAG_FG[0], sym: 0 }, Net.me.shipLook || {}); return openShipCustom(); }
    if (kind === 'admin') { if (!Net.me.local) return; UI.openModal('<h2>🛠 Administrador</h2><p class="muted">Cargando...</p>', 'wide'); UI.modalKind = 'admin'; return Net.send('admin', { op: 'status' }); }
    if (kind === 'logout') UI.openModal(`<h2>⏻ Salir</h2><p>Tu personaje se guarda justo donde está.</p><div class="btns"><button data-close="1">Cancelar</button><button class="red" data-do="logout">Cerrar sesión</button></div>`, 'narrow');
  };
  UI.refreshModal = function () {
    if (!UI.isModal()) return;
    const box = document.querySelector('.modal-box');
    const st = box ? box.scrollTop : 0;
    if (UI.modalKind === 'inventory') openInventory(); else if (UI.modalKind === 'dream') openDream(); else return;
    const nb = document.querySelector('.modal-box');
    if (nb) nb.scrollTop = st;
  };

  UI.onRes = function (m) {
    if (m.what === 'wanted' && UI.modalKind === 'wanted') { UI.wanted = m; UI.wantedShown = 40; renderWanted(UI.wantedTab || 'all'); }
    if (m.what === 'honor' && UI.modalKind === 'honor') renderHonor(m.list, m.tops, m.req);
    if (m.what === 'contracts') { UI.contracts = m; if (UI.modalKind === 'dream') { const box = document.querySelector('.modal-box'); const st = box ? box.scrollTop : 0; openDream(); const nb2 = document.querySelector('.modal-box'); if (nb2) nb2.scrollTop = st; } }
    if (m.what === 'crews' && UI.modalKind === 'crews') { UI.crewData = m; renderCrews(); }
    if (m.what === 'online' && UI.modalKind === 'crews') { UI.onlineList = m.list; renderCrews(); }
    if (m.what === 'marine' && UI.modalKind === 'marine') renderMarine(m);
    if (m.what === 'fruits' && UI.modalKind === 'fruits') renderFruits(m.list);
  };

  // ---------- Carteles ----------
  // Carteles personalizados (350 M o más): imágenes de assets/posters, por nombre ("monkey-d-pedro.png") o _default.*
  UI.POSTER_ELITE = 3.5e8;
  UI.posterFiles = null;
  UI.posterSlug = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  // Varias fotos por personaje: "nombre.png", "nombre-2.png", "nombre-3.png"... (el cartel va rotando entre ellas)
  UI.loadPosters = function () {
    if (UI.posterFiles) return;
    UI.posterFiles = {};
    fetch('/api/posters').then((r) => r.json()).then((d) => {
      const list = ((d && d.files) || []).map((f) => {
        const base = f.replace(/\.[^.]+$/, '').toLowerCase();
        const m = base.match(/^(.*?)-(\d{1,2})$/);
        return { slug: m ? m[1] : base, n: m ? +m[2] : 1, url: 'assets/posters/' + encodeURIComponent(f) };
      }).sort((a, b) => a.n - b.n);
      for (const x of list) (UI.posterFiles[x.slug] = UI.posterFiles[x.slug] || []).push(x.url);
    }).catch(() => { /* sin carteles personalizados */ });
  };
  UI.customPosters = function (name) {
    const F = UI.posterFiles || {};
    return F[UI.posterSlug(name)] || F._default || [];
  };
  // qué foto sale: va cambiando cada 5 minutos (en el cartel grande se cambia tocando la foto)
  UI.posterVariant = function (name, n) {
    let h = 0;
    for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return (h + Math.floor(Date.now() / 300000)) % n;
  };
  UI.posterHTML = function (w) {
    UI.loadPosters();
    const stamp = w.status === 'dead' ? 'MUERTO' : w.status === 'caught' ? 'CAPTURADO' : w.status === 'retired' ? 'RETIRADO' : '';
    // foto: desde 350 millones, foto de élite (imágenes propias de assets/posters o 4 tipos de escena: poder, aura, estallido y retrato,
    // con el color de la técnica de su fruta o tajos de espada si no tiene); desde 100 millones, en plena acción; por debajo, su cara con un gesto
    const shot = { app: w.app, faction: 'pirate', rank: 0, fruit: w.fruit != null ? w.fruit : -1, name: w.name, dead: w.status === 'dead' };
    const elite = (w.bounty || 0) >= UI.POSTER_ELITE;
    const customs = elite ? UI.customPosters(w.name) : [];
    const nV = customs.length || (w.app ? OP.Sprites.ELITE_KINDS.length : 1);
    const vi = elite ? (w.variant != null ? w.variant % nV : UI.posterVariant(w.name, nV)) : 0;
    w.variant = vi; w.nV = nV;
    const custom = customs.length ? customs[vi] : '';
    const img = custom || (w.app ? (elite ? OP.Sprites.eliteShot(shot, vi) : w.bounty >= 1e8 ? OP.Sprites.actionShot(shot) : OP.Sprites.faceShot(shot)) : '');
    const label = elite && nV > 1 && w.single ? `<div class="wp-cycle">📷 ${customs.length ? 'Foto' : OP.Sprites.ELITE_KINDS[vi]} ${vi + 1}/${nV} · toca para cambiar</div>` : '';
    const pn = MMO.posterName(w.name);
    return `<div class="wposter ${elite ? 'elite' : ''}" title="${esc(w.name)}${w.epithet ? ' «' + esc(w.epithet) + '»' : ''}">
      <div class="wp-title">WANTED</div>
      <div class="wp-photo ${custom ? 'custom' : ''}" ${elite && nV > 1 && w.single ? 'data-pcycle="1"' : ''}>${img ? `<img src="${img}" alt="">` : ''}${label}</div>
      <div class="wp-doa">DEAD OR ALIVE</div>
      <div class="wp-name ${pn.length > 18 ? 'xlong' : pn.length > 13 ? 'long' : ''}">${esc(pn)}</div>
      <div class="wp-bounty"><span class="doblón">฿</span><span>${MMO.commas(w.bounty)}</span><span class="dash">-</span></div>
      <div class="wp-foot"><div class="wp-fine">Este cartel lo emite el Gobierno Mundial. Cualquier información sobre el paradero de este pirata debe comunicarse de inmediato a la base de la Marina más cercana. La recompensa se paga vivo o muerto.</div><div class="wp-marine">MARINE</div></div>
      ${stamp ? `<div class="wp-stamp ${w.status === 'caught' ? 'caught' : ''}">${stamp}</div>` : ''}
    </div>`;
  };
  // cartel grande en una ventana; en los de élite, tocar la foto pasa a la siguiente
  UI.openPoster = function (w) {
    w.single = true;
    UI.posterCur = w;
    UI.openModal(`<div class="single-poster">${UI.posterHTML(w)}</div>`, 'poster-modal');
    UI.modalKind = 'poster';
  };
  UI.loadPosters();
  // ---------- Tablón de SE BUSCA ----------
  // Pestañas según el mar donde está cada pirata AHORA. "Todos" desde 100.000 ฿; cada Blue desde 10.000 ฿.
  const SEA_TABS = [['all', 'Todos'], ['east', 'Mar del Este'], ['west', 'Mar del Oeste'], ['north', 'Mar del Norte'], ['south', 'Mar del Sur'], ['paradise', 'Mar Esmeralda'], ['newworld', 'Mar Indómito']];
  const SEA_LABEL = { east: 'Mar del Este', west: 'Mar del Oeste', north: 'Mar del Norte', south: 'Mar del Sur', paradise: 'Mar Esmeralda', newworld: 'Mar Indómito' };
  function wantedCard(w, cls) {
    return `<div class="poster-wrap ${cls || ''}" ${w.id ? `data-nsel="${w.id}"` : ''}>${UI.posterHTML(w)}<div class="poster-cap"><span class="wp-badge ${w.isPlayer ? '' : 'npc'}">${w.isPlayer ? 'JUGADOR' : 'NPC'}</span>${w.crew ? esc(w.crew) : 'Pirata solitario'}${w.isPlayer && w.online ? ' · <b class="ok">●</b>' : ''}<div class="wp-where">📍 ${esc(SEA_LABEL[w.zone] || '?')}${w.user ? ' · @' + esc(w.user) : ''}</div></div></div>`;
  }
  function renderWanted(tab) {
    UI.wantedTab = tab;
    const tabs = SEA_TABS.map(([k, l]) => `<button class="wb-tab ${tab === k ? 'on' : ''}" data-wtab="${k}"><i></i>${l}</button>`).join('');
    UI.openModal(`${hubTabs('boards', 'wanted')}<div class="wanted-board">
      <div class="wb-head"><div class="wb-title">SE BUSCA</div><div class="wb-sub">Carteles del Gobierno Mundial · se actualizan solos</div></div>
      <div class="wb-search"><span>🔍</span><input id="wanted-q" type="search" placeholder="Buscar por nombre, apodo o @usuario" value="${esc(UI.wantedQuery || '')}" autocomplete="off"></div>
      <div class="wb-tabs">${tabs}</div>
      <div id="wanted-body"></div></div>`, 'wide board');
    UI.modalKind = 'wanted';
    const q = $('#wanted-q');
    if (q) q.addEventListener('input', () => { UI.wantedQuery = q.value; UI.wantedShown = 40; fillWanted(); });
    fillWanted();
  }
  function fillWanted() {
    const box = $('#wanted-body');
    if (!box) return;
    const W = UI.wanted || { list: [], emperors: [], king: null };
    const tab = UI.wantedTab || 'all';
    const raw = (UI.wantedQuery || '').trim().toLowerCase();
    const onlyUser = raw.charAt(0) === '@';
    const q = onlyUser ? raw.slice(1) : raw;
    const minFor = (t) => (t === 'all' || t === 'paradise' || t === 'newworld' ? MMO.WANTED_MIN_ALL : MMO.WANTED_MIN_SEA);
    let list = W.list.filter((w) => (tab === 'all' || w.zone === tab) && w.bounty >= minFor(tab));
    if (q) list = list.filter((w) => onlyUser ? (w.user || '').toLowerCase().indexOf(q) >= 0
      : (w.name.toLowerCase().indexOf(q) >= 0 || (w.epithet || '').toLowerCase().indexOf(q) >= 0 || (w.user || '').toLowerCase().indexOf(q) >= 0));
    let html = '';
    const skip = new Set();
    if (tab === 'all' && !q) {
      // El Rey de los Mares (solo jugadores)
      const king = W.list.find((w) => w.king);
      const me = Net.me;
      html += `<div class="wb-sec king"><h3>👑 EL REY DE LOS PIRATAS</h3><span class="muted small">el pirata más temido del mundo</span></div>`;
      if (king) { skip.add(king); html += `<div class="posters king-row">${wantedCard(king, 'king')}</div>`; }
      else html += `<div class="throne-empty">👑 <b>El trono está vacío.</b> Solo un jugador puede ocuparlo: derrota a los <b>Cuatro Emperadores del Mar</b> para reclamarlo. Después, la única forma de ser Rey será derrotar al Rey actual.${me && me.faction === 'pirate' ? `<div class="small">Tus Emperadores derrotados: <b>${me.empBeaten || 0}/4</b></div>` : ''}</div>`;
      // Los Cuatro Emperadores
      const emps = W.emperors.map((e) => W.list.find((w) => w.id === e.id)).filter(Boolean);
      if (emps.length) {
        html += `<div class="wb-sec"><h3>LOS CUATRO EMPERADORES</h3><span class="muted small">los más buscados del mar</span></div><div class="posters emp-row">${emps.map((w) => { skip.add(w); return wantedCard(w, 'emperor'); }).join('')}</div>`;
      }
      html += `<div class="wb-sec"><h3>TODOS LOS BUSCADOS</h3><span class="muted small">desde ${OP.fmtB(MMO.WANTED_MIN_ALL)}</span></div>`;
    } else {
      html += `<div class="wb-sec"><h3>${q ? 'RESULTADOS' : esc((SEA_LABEL[tab] || 'Todos').toUpperCase())}</h3><span class="muted small">${q ? list.length + ' encontrados' : 'piratas que están ahora en este mar · desde ' + OP.fmtB(minFor(tab))}</span></div>`;
    }
    const rest = list.filter((w) => !skip.has(w));
    const n = UI.wantedShown || 40;
    html += `<div class="posters">${rest.slice(0, n).map((w) => wantedCard(w, w.emp ? 'emperor' : '')).join('') || '<p class="muted">No hay carteles aquí.</p>'}</div>`;
    if (rest.length > n) html += `<div class="btns center"><button data-wmore="1">Mostrar más (${rest.length - n} restantes)</button></div>`;
    box.innerHTML = html;
  }

  // ---------- Cuadro de honor de la Marina ----------
  function renderHonor(list, tops, req) {
    tops = tops || { 9: [], 8: [], 7: [] }; req = req || MMO.TOP_RANKS;
    const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1));
    // tarjetas de los altos mandos (jugadores) y huecos vacantes
    const stars = (R) => '★'.repeat(R === 9 ? 6 : R === 8 ? 5 : 4);
    // tarjeta horizontal: retrato, nombre, rango · nivel, estrellas y, abajo, arrestos y mayor captura
    const card = (h, R) => h ? `<div class="hq-card r${R}"><div class="hq-top"><img src="${face(h.app, 'marine', R)}" alt=""><div><div class="hq-name">${esc(h.name)}${h.online ? ' <b class="ok">●</b>' : ''}</div>
        <div class="hq-rank">${esc(OP.RANKS[R])} · nivel ${h.lvl}</div><div class="hq-stars">${stars(R)}</div></div></div>
        <div class="hq-foot"><span>Arrestos <b>${h.caps}</b></span><span>Mayor captura <b>${h.best ? OP.fmtBShort(h.best.bounty) : '—'}</b></span></div></div>`
      : `<div class="hq-card vacant r${R}"><div class="hq-top"><div class="hq-ph">?</div><div><div class="hq-name">Puesto vacante</div><div class="hq-rank">${esc(OP.RANKS[R])}</div><div class="hq-stars">${stars(R)}</div></div></div>
        <div class="hq-foot small">Nivel ${req[R].lvl} y ${OP.dots(req[R].merit)} méritos · lo gana el mejor marine</div></div>`;
    const sec = (R, title, sub) => `<div class="wb-sec"><h3>${title}</h3><span class="muted small">${sub}</span></div><div class="hq-row n${req[R].slots}">${Array.from({ length: req[R].slots }, (_, i) => card(tops[R][i], R)).join('')}</div>`;
    const hq = sec(9, 'ALMIRANTE GENERAL', 'el mando supremo · 1 plaza') + sec(8, 'LOS TRES ALMIRANTES', 'lo más alto de la Marina · solo 3 plazas: quien les supere en méritos, les quita el puesto') + sec(7, 'VICEALMIRANTES', 'los altos oficiales · 6 plazas');
    // marine destacado: el primero del ranking de capturas
    const star = list[0];
    const featured = star ? `<div class="hq-featured" ${star.id ? `data-nsel="${star.id}"` : ''}><img src="${face(star.app, 'marine', star.rank)}" alt=""><div><div class="hq-f-t">MARINE DESTACADO</div><div class="hq-f-n">${esc(star.name)}</div>
      <div class="small">${esc(OP.RANKS[star.rank])} · ${star.caps} arrestos${star.best ? ' · su mayor captura: ' + esc(star.best.name) + ' (' + fmtB(star.best.bounty) + ')' : ''}</div></div></div>` : '';
    UI.openModal(`${hubTabs('boards', 'honor')}${hq}${featured}<div class="wb-sec"><h3>LOS MEJORES</h3><span class="muted small">por recompensa capturada: jugadores y NPC</span></div>
      ${list.length ? `<div class="items">${list.map((h, i) => `<div class="item" ${h.id ? `data-nsel="${h.id}" style="cursor:pointer"` : ''}>
        <span class="ic" style="width:34px;font-weight:800">${medal(i)}</span>
        <img src="${face(h.app, 'marine', h.rank)}" style="width:40px;height:40px;image-rendering:pixelated;border:1px solid #b08850;border-radius:6px" alt="">
        <div class="grow"><b>Marino: ${esc(h.name)}</b> <span class="wp-badge ${h.isPlayer ? '' : 'npc'}">${h.isPlayer ? 'JUGADOR' : 'NPC'}</span> <span class="muted small">${esc(OP.RANKS[h.rank])} · nv ${h.lvl}${h.online ? ' · <b class="ok">●</b>' : ''}</span>
          <div class="small">Capturados: <b>${h.caps}</b>${h.players ? ' (' + h.players + ' jugadores)' : ''}${h.value ? ` · Recompensa total capturada: <b class="bounty">${fmtB(h.value)}</b>` : ''}</div>
          <div class="small">Mayor captura: ${h.best ? `<b>${esc(h.best.name)}</b> (${fmtB(h.best.bounty)})${h.best.player ? ' · jugador' : ''}` : '<span class="muted">sin datos todavía</span>'}</div></div></div>`).join('')}</div>`
        : '<p class="muted">Todavía ningún marine ha capturado a un pirata con recompensa. ¡Sé el primero!</p>'}`, 'wide board');
    UI.modalKind = 'honor';
  }

  // ---------- Tripulaciones (jugadores y del mundo) ----------
  function renderCrews() {
    const d = UI.crewData;
    if (!d) return;
    const me = Net.me, mine = Net.crew;
    const isCap = mine && mine.captain === me.cid;
    const tab = UI.crewTab || 'mine';
    const tabs = [['mine', 'La mía'], ['ranking', '🏆 Ranking'], ['players', 'De jugadores (' + d.players.length + ')'], ['world', 'Del mundo (' + d.world.length + ')']]
      .map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-ctab="${k}">${l}</button>`).join('');
    const photo = (apps, faction, flag) => `<img class="crew-photo" src="${OP.Sprites.groupPhoto(apps, faction, flag)}" alt="Foto de la tripulación">`;
    const memberRow = (m, fleet) => `<div class="item"><span class="ic">${m.cid === mine.captain ? '👑' : fleet && fleet.captain === m.cid ? '⚓' : '·'}</span><div class="grow"><b>${esc(m.name)}</b> <span class="muted small">nv ${m.lvl}${m.bounty ? ' · ' + OP.fmtBShort(m.bounty) : ''} · ${m.online ? '<b class="ok">● conectado</b>' : 'desconectado'}${fleet && fleet.captain === m.cid ? ' · <b>Almirante de Flota</b>' : ''}</span></div>
      ${m.online && m.cid !== me.cid ? `<button data-pmname="${esc(m.name)}">💬</button>` : ''}${m.online && m.cid !== me.cid && m.sid && (Net.players.get(m.sid) || {}).boat && !(Net.players.get(m.sid) || {}).ride ? `<button data-act="board" data-sid="${esc(m.sid)}">⛵ Subir</button>` : ''}
      ${isCap && m.cid !== me.cid ? `<select class="field mini" data-fleetmove="${m.cid}" title="Mover a la principal o a una flota"><option value="">${fleet ? 'Mover a…' : 'Principal'}</option>${fleet ? '<option value="main">Principal</option>' : ''}${(mine.fleets || []).filter((f) => f !== fleet).map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select>
        ${!fleet ? `<button data-crewop="promote" data-cid="${m.cid}">Hacer capitán</button>` : ''}<button data-crewop="kick" data-cid="${m.cid}">Expulsar</button>` : ''}</div>`;
    let body = '';
    if (tab === 'mine') {
      if (!mine) {
        const npcC = me.npcCrew ? `<div class="crew mine"><div class="crew-head"><div><b>🏴‍☠️ ${esc(me.npcCrewName || 'Tripulación NPC')}</b><div class="muted small">Eres miembro de una tripulación NPC: sus miembros no te atacan.</div></div></div>
          <div class="btns"><button data-crewop="npcleave">Dejarla</button><button class="red" data-crewop="betray">🗡️ Traicionar</button></div></div>` : '';
        body = npcC + `<p>No perteneces a ninguna ${me.faction === 'pirate' ? 'tripulación de jugadores' : 'unidad'}. Funda la tuya (10.000 ฿), espera a que te inviten o pide unirte a una (también a las del mundo, de NPC).</p>
          ${me.npcCrew ? '' : `<form id="crew-create" class="btns"><input class="field" name="name" maxlength="28" placeholder="${me.faction === 'pirate' ? 'Piratas de ...' : 'Escuadrón ...'}" style="flex:1"><button>Fundar</button></form>`}`;
      } else {
        const online = (UI.onlineList || []).filter((o) => o.sid !== Net.sid && !o.crew && o.faction === me.faction);
        const allApps = mine.members.map((m) => m.app).concat((mine.fleets || []).reduce((t, f) => t.concat(f.members.map((m) => m.app)), [])).concat((mine.npcs || []).map((n) => n.app));
        const nTotal = mine.members.length + (mine.fleets || []).reduce((t, f) => t + f.members.length, 0);
        body = `<div class="crew mine">${photo(allApps, mine.faction, mine.flag)}
          <div class="crew-head"><img class="flag" src="${OP.Sprites.flagURL(mine.flag)}" alt=""><div style="flex:1"><b>${mine.yonkou ? '👑 ' : ''}${esc(mine.name)}</b>${mine.yonkou ? ' <span class="tag pirate">YONKOU</span>' : ''}
            <div class="muted small">${nTotal} jugadores · ${(mine.npcs || []).length} NPC · ${(mine.fleets || []).length}/${MMO.FLEET_MAX} flotas · recompensa total ${OP.fmtBShort(mine.total)}</div></div></div>
          <h3>Tripulación principal <span class="muted small">${mine.members.length}/${MMO.CREW_MAX}</span></h3>
          <div class="items">${mine.members.map((m) => memberRow(m, null)).join('')}
            ${(mine.npcs || []).map((n) => `<div class="item"><span class="ic">🤖</span><div class="grow"><a data-nsel="${n.id}"><b>${esc(n.name)}</b></a> <span class="muted small">NPC · nv ${n.lvl}${n.bounty ? ' · ' + OP.fmtBShort(n.bounty) : ''}${n.guard ? ' · 🛡️ custodia ' + esc(n.guard) : n.isl ? ' · 📍 ' + esc(n.isl) : ''}</span></div>
              ${isCap && (mine.territories || []).length ? `<select class="field mini" data-guard="${n.id}"><option value="">🛡️ Custodiar…</option><option value="-1">Volver conmigo</option>${mine.territories.map((t) => `<option value="${t.idx}">${esc(t.name)}</option>`).join('')}</select>` : ''}
              ${isCap ? `<button data-crewop="dismiss" data-cid="${n.id}">Despedir</button>` : ''}</div>`).join('')}</div>
          ${(mine.fleets || []).map((f) => `<h3>⚓ ${esc(f.name)} <span class="muted small">${f.members.length}/${MMO.FLEET_SIZE} · Almirante de Flota: ${esc((f.members.find((m) => m.cid === f.captain) || {}).name || '—')}</span>${isCap ? ` <button class="mini-btn" data-fleetdisband="${f.id}">Disolver flota</button>` : ''}</h3>
            <div class="items">${f.members.map((m) => memberRow(m, f)).join('')}</div>`).join('')}
          ${isCap && (mine.fleets || []).length < MMO.FLEET_MAX && mine.members.length > 1 ? `<form id="fleet-create" class="btns"><input class="field" name="name" maxlength="24" placeholder="Nombre de la flota nueva" style="flex:1">
            <select class="field" name="cid">${mine.members.filter((m) => m.cid !== mine.captain).map((m) => `<option value="${m.cid}">${esc(m.name)} (Almirante de Flota)</option>`).join('')}</select><button>⚓ Crear flota</button></form>
            <p class="muted small">Con la principal llena (${MMO.CREW_MAX}), los nuevos entran en tus flotas (hasta ${MMO.FLEET_MAX} de ${MMO.FLEET_SIZE}). Con al menos una flota y ${OP.fmtBShort(MMO.YONKOU_MIN)} de recompensa total, tu tripulación puede ser Señor del Mar.</p>` : ''}
          ${(mine.territories || []).length || mine.yonkou ? `<h3>🏴 Territorios</h3><div class="items">${(mine.territories || []).map((t) => `<div class="item"><span class="ic">🏝</span><div class="grow"><b>${esc(t.name)}</b> <span class="muted small">🛡️ ${t.guards} custodio(s) · tributo cada 10 min</span></div>${isCap ? `<button data-unclaim="${t.idx}">Abandonar</button>` : ''}</div>`).join('') || '<p class="muted small">Aún no tienes islas. Desembarca en una y pulsa "Reclamar" en su ficha.</p>'}</div>` : ''}
          </div>
          ${isCap ? ordersBlock(mine) : ''}
          ${isCap ? `<h3>Invitar a jugadores conectados</h3><div class="items">${online.map((o) => `<div class="item"><div class="grow"><b>${esc(o.name)}</b> <span class="muted small">nv ${o.lvl}</span></div><button data-invite="${o.sid}">🤝 Invitar</button></div>`).join('') || '<p class="muted small">No hay nadie de tu facción sin tripulación conectado ahora.</p>'}</div>` : ''}
          <div class="btns"><button class="red" data-crewop="leave">Abandonar</button><button class="red" data-crewop="betray" title="Sales de mala manera: más infamia y recompensa, y cazarrecompensas tras de ti">🗡️ Traicionar</button>${isCap ? '<button class="red" data-crewop="disband">Disolver la tripulación</button>' : ''}</div>`;
      }
    } else if (tab === 'ranking') {
      body = `<p class="muted small">Todas las tripulaciones (jugadores y NPC) con al menos ${OP.fmtB(MMO.RANKING_MIN)} de recompensa total, de mayor a menor.</p>
        <div class="crank">${d.ranking.map((c, i) => `<div class="crank-row ${mine && c.kind === 'player' && mine.id === c.id ? 'mine' : ''}"><b class="crank-n">#${i + 1}</b>
          <img class="crew-photo sm" src="${OP.Sprites.groupPhoto(c.photo, c.faction, c.flag)}" alt="">
          <div class="grow"><b>${c.yonkou ? '👑 ' : ''}${esc(c.name)}</b> <span class="wp-badge ${c.kind === 'npc' ? 'npc' : ''}">${c.kind === 'npc' ? 'NPC' : 'JUGADORES'}</span>
            <div class="muted small">Capitán: ${esc(c.captain)} · ${c.n} ${c.n === 1 ? 'miembro' : 'miembros'}${c.isl ? ' · 📍 ' + esc(c.isl) : ''}</div></div>
          <b class="bounty">${OP.fmtBShort(c.total)}</b></div>`).join('') || '<p class="muted">Ninguna tripulación llega todavía a ' + OP.fmtB(MMO.RANKING_MIN) + '.</p>'}</div>`;
    } else if (tab === 'players') {
      body = `<div class="crews">${d.players.map((c) => `<div class="crew ${mine && mine.id === c.id ? 'mine' : ''}"><div class="crew-head"><img class="flag" src="${OP.Sprites.flagURL(c.flag)}" alt=""><div style="flex:1"><b>${c.yonkou ? '👑 ' : ''}${esc(c.name)}</b><div class="muted small">${c.faction === 'pirate' ? '☠' : '⚓'} Capitán: ${esc(c.captain)} · ${c.members.length} miembros${c.npcs ? ' · ' + c.npcs + ' NPC' : ''}${c.fleets.length ? ' · ' + c.fleets.length + ' flotas' : ''} · ${OP.fmtBShort(c.total)}</div></div>${!mine && !me.npcCrew && c.faction === me.faction ? `<button class="gold" data-joinreq="${c.id}">📨 Pedir unirme</button>` : ''}</div>
        <div class="chips">${c.members.map((m) => `<span class="chip">${esc(m.name)} <small>nv${m.lvl}${m.online ? ' · ●' : ''}</small></span>`).join('')}</div></div>`).join('') || '<p class="muted">Aún no hay tripulaciones de jugadores. ¡Funda la primera!</p>'}</div>`;
    } else {
      const canAsk = !mine && !me.npcCrew && me.faction === 'pirate';
      body = `<p class="muted small">Ordenadas por recompensa total. Los 👑 son los Cuatro Emperadores del Mar.${canAsk ? ' Para pedir unirte a una tripulación NPC tienes que estar en la misma isla que alguno de sus miembros.' : ''}</p><div class="crews">${d.world.map((u) => `<div class="crew"><div class="crew-head"><img class="flag" src="${OP.Sprites.flagURL(u.flag)}" alt=""><div style="flex:1"><b>${u.emp ? '👑 ' : ''}${esc(u.name)}</b><div class="muted small">Capitán: <a data-nsel="${u.leader}">${esc(u.leaderName)}</a> · 📍 ${esc(u.isl)}</div></div>
        <div class="crew-b"><b class="bounty">${OP.fmtBShort(u.bounty)}</b><small>recompensa total</small></div>${canAsk ? `<button class="gold" data-npcjoin="${u.id}">📨 Pedir unirme</button>` : ''}</div>
        <div class="crew-body"><div class="small">⛵ ${u.ship ? esc(u.ship.name) + ' (' + esc(OP.SHIPS[u.ship.type].name) + ', ' + u.ship.hp + '%' + (u.ship.coated ? ', recubierto' : '') + ')' : 'Sin barco'} · ⭐ Reputación ${u.fame}${u.grunts ? ' · 🗡 ' + u.grunts + ' soldados' : ''}</div>
        ${u.plan ? `<div class="small">📌 ${esc(u.plan)}</div>` : ''}
        <div class="chips">${u.members.map((m) => `<a class="chip pirate ${m.jail ? 'jail' : ''}" data-nsel="${m.id}">${esc(m.name)} <small>${esc(m.role)} · nv${m.lvl}${m.jail ? ' · ⛓' : ''}</small></a>`).join('')}</div>
        ${u.allies.length ? `<div class="small">🤝 Aliados: ${u.allies.map(esc).join(', ')}</div>` : ''}${u.enemies.length ? `<div class="small">💢 Enemigos: ${u.enemies.map(esc).join(', ')}</div>` : ''}</div></div>`).join('')}</div>`;
    }
    UI.openModal(`<h2>🏴‍☠️ Tripulaciones</h2><div class="tabs">${tabs}</div>${body}`, 'wide');
    UI.modalKind = 'crews';
    const f = $('#crew-create');
    if (f) f.addEventListener('submit', (e) => { e.preventDefault(); Net.send('crew', { op: 'create', name: f.name.value }); setTimeout(() => Net.send('req', { what: 'crews' }), 400); });
    const ff = $('#fleet-create');
    if (ff) ff.addEventListener('submit', (e) => { e.preventDefault(); Net.send('crew', { op: 'fleet_create', name: ff.name.value, cid: +ff.cid.value }); });
    // mover a alguien entre la principal y las flotas / mandar NPC a custodiar un territorio
    document.querySelectorAll('[data-fleetmove]').forEach((sel) => sel.addEventListener('change', () => { if (sel.value) Net.send('crew', { op: 'fleet_move', cid: +sel.dataset.fleetmove, to: sel.value === 'main' ? '' : sel.value }); }));
    document.querySelectorAll('[data-guard]').forEach((sel) => sel.addEventListener('change', () => { if (sel.value !== '') Net.send('crew', { op: 'guard', id: +sel.dataset.guard, isl: +sel.value }); }));
  }

  // ---------- Marina ----------
  function renderMarine(m) {
    const top = m.top.map((r) => `<div class="rank-row"><b>${esc(OP.RANKS[r.rank])}</b> ${r.list.map((a) => `<a class="chip marine" data-nsel="${a.id}">${esc(a.name)}${a.epithet ? ' <small>«' + esc(a.epithet) + '»</small>' : ''}</a>`).join('') || '<span class="muted">Vacante</span>'}</div>`).join('');
    const counts = OP.RANKS.map((r, i) => `<span class="pill">${esc(r)}: <b>${m.counts[i]}</b></span>`).join('');
    const bases = m.bases.map((b) => `<div class="base"><b>⚓ ${esc(b.name)}</b> <span class="muted small">(${esc(b.isl)}, ${esc(seaName(b.sea))})</span> ${b.hp <= 0 ? '<b class="no">DESTRUIDA</b>' : bar(b.hp, b.max, 'hp')}
      <div class="small">Al mando: ${b.cmd ? `<a data-nsel="${b.cmd.id}">${esc(b.cmd.name)}</a>` : '—'} · Guarnición: ${b.garrison} · Unidades con barco: ${b.squads.length}</div>
      ${b.squads.length ? `<div class="chips">${b.squads.map((u) => `<a class="chip marine" data-nsel="${u.leader}">${esc(u.name)}${u.plan ? ' <small>' + esc(u.plan) + '</small>' : ''}</a>`).join('')}</div>` : ''}</div>`).join('');
    UI.openModal(`${hubTabs('world', 'marine')}<h2>⚓ La Marina</h2><div class="pills">${counts}</div>${top}
      ${m.players.length ? `<h3>Jugadores en la Marina</h3><div class="chips">${m.players.map((p) => `<span class="chip marine">${esc(OP.RANKS[p.rank])} ${esc(p.name)} <small>nv${p.lvl}</small></span>`).join('')}</div>` : ''}
      <h3>Bases</h3><div class="bases">${bases}</div>`, 'wide');
    UI.modalKind = 'marine';
  }
  // ---------- Frutas ----------
  function renderFruits(list) {
    const rows = OP.FRUITS.map((F) => {
      const fr = list[F.id] || {};
      let state = '<span class="muted">Nadie la ha visto</span>';
      if (fr.state === 'owned') state = 'Comida por ' + (fr.whoId ? `<a data-nsel="${fr.whoId}">${esc(fr.who)}</a>` : '<b>' + esc(fr.who) + '</b>');
      else if (fr.state === 'carried') state = '🎒 La lleva encima <b>' + esc(fr.who) + '</b>';
      else if (fr.state === 'hidden') state = fr.isl ? '🔎 Rumor: en ' + esc(fr.isl) : '❓ Escondida en algún lugar';
      const ab = MMO.abilityOf(F.id);
      return `<div class="fruit r${F.rarity}"><img class="f-img" src="${OP.Sprites.fruitURL(F.id)}" alt=""><div class="f-body"><div class="f-name">${esc(F.name)}</div><div class="small"><b>${F.type}</b> · ${OP.RARITY[F.rarity]} · poder x${OP.RARITY_MULT[F.rarity]}</div><div class="small">${esc(F.ability)}</div><div class="small">Técnica (Q): <b>${esc(ab.name)}</b></div><div class="small">${state}</div></div></div>`;
    }).join('');
    const me = Net.me;
    const notes = (me && me.fruitNotes) || [];
    const notifier = list.notifier !== undefined ? list.notifier : me && me.notifier;
    const nBox = notifier ? `<div class="notifier-box"><b>🔔 Fruit Notifier activo</b> — te avisa al instante cuando aparece una fruta. Arriba de cada fruta escondida verás su isla.
      ${notes.length ? `<div class="small">Últimos avisos: ${notes.slice(0, 5).map((n) => `<a data-goisl="${n.islIdx}">${esc(n.name)} en ${esc(n.isl)}</a>`).join(' · ')}</div>` : ''}</div>`
      : `<div class="notifier-box off">🔔 <b>Fruit Notifier</b>: objeto de lujo que avisa de cada fruta que aparece (nombre, mar e isla). Se vende en las grandes ciudades por ${fmtB(MMO.SHOP.notifier.price)}.</div>`;
    UI.openModal(`${hubTabs('world', 'fruits')}<h2>🍎 Frutas Malditas</h2>${nBox}<p class="muted small">Rarísimas: en todo el mundo hay como mucho dos escondidas a la vez. Si al explorar notas algo extraño, recorre la isla: la fruta brilla cuando estás cerca. Recógela con un clic, cómela desde el inventario y usa su poder con la tecla Q.</p><div class="fruits">${rows}</div>`, 'wide');
    UI.modalKind = 'fruits';
  }
  // ---------- Islas ----------
  function openIslands() {
    const me = Net.me;
    const groups = ['east', 'west', 'north', 'south', 'paradise', 'sky', 'calm', 'deep', 'newworld'].map((sea) => {
      const list = OP.M.islands.filter((I) => I.sea === sea);
      if (!list.length) return '';
      return `<div class="isl-group"><h3>${esc(seaName(sea))}</h3>${list.map((I) => `<button class="isl-btn ${me.visited.indexOf(I.idx) >= 0 ? 'seen' : ''}" data-goisl="${I.idx}">${me.visited.indexOf(I.idx) >= 0 ? '✓ ' : ''}${I.base ? '⚓ ' : ''}${I.spawnPerk ? '✨ ' : ''}${I.train ? '🥋 ' : ''}${I.hidden && !(OP.S.isl[I.idx] || {}).discovered ? 'Isla Postrera ???' : esc(I.name)} <small>${'★'.repeat(Math.ceil(I.danger / 2))}</small></button>`).join('')}</div>`;
    }).join('');
    UI.openModal(`${hubTabs('world', 'islands')}<h2>🗺️ Islas del mundo</h2><p class="muted small">Toca una isla para verla. ✓ visitada · ⚓ base de la Marina · ✨ isla de aparición especial · 🥋 entrenamiento especial · las estrellas marcan el peligro.</p><div class="isl-groups">${groups}</div>`, 'wide');
  }
  // ---------- Periódico ----------
  function openPaper() {
    const S = OP.S;
    const recent = S.news.filter((n) => S.time - n.t < 24 * OP.SIM_PER_CAL);
    const pool = (recent.length > 5 ? recent : S.news.slice(0, 30)).slice().sort((a, b) => b.imp - a.imp || b.t - a.t);
    const head = pool[0], subs = pool.slice(1, 4);
    const col = (cats) => S.news.filter((n) => cats.indexOf(n.cat) >= 0).slice(0, 6).map((n) => `<li data-news="${n.id}">${NEWS_ICON[n.cat] || '•'} ${esc(n.text)}</li>`).join('') || '<li class="muted">Sin noticias.</li>';
    UI.openModal(`${hubTabs('world', 'paper')}<div class="paper">
      <div class="paper-top"><span>Precio: 100 ฿</span><span>🐦 Repartido por las gaviotas</span><span>${OP.fmtDay(S.time)}</span></div>
      <div class="paper-name">EL PERIÓDICO DEL MUNDO</div>
      ${head ? `<div class="paper-head" data-news="${head.id}">${esc(head.text)}</div>` : ''}
      <div class="paper-subs">${subs.map((n) => `<div data-news="${n.id}">${NEWS_ICON[n.cat] || ''} ${esc(n.text)}</div>`).join('')}</div>
      <div class="paper-cols">
        <div><h4>💰 Recompensas</h4><ul>${col(['bounty'])}</ul></div>
        <div><h4>⚓ Marina y capturas</h4><ul>${col(['marine', 'capture'])}</ul></div>
        <div><h4>🌊 Mares y piratas</h4><ul>${col(['crew', 'attack', 'sea', 'pirate', 'battle'])}</ul></div>
        <div><h4>🗿 Misterios</h4><ul>${col(['fruit', 'poneglyph', 'laughtale', 'world'])}</ul></div>
      </div></div>`, 'paper-modal');
  }
  // ---------- Inventario y tienda ----------
  function openInventory() {
    const me = Net.me;
    const I = !me.boat ? MMO.islandAt(me.x, me.y) : null;
    const shop = I ? Object.keys(MMO.SHOP).filter((k) => MMO.SHOP[k].where(I)) : [];
    const isCap = Net.crew && Net.crew.captain === me.cid;
    UI.openModal(`<h2>🎒 Inventario</h2>
      <div class="grid2"><div>
        <h3>Objetos</h3>
        <div class="items">${[['carne', '🍖', 'Carne asada', 'Cura un 35% de la vida (H)'], ['vendas', '🩹', 'Vendas', 'Cura un 15% de la vida']].map(([k, ic, n, ds]) => `<div class="item"><span class="ic">${ic}</span><div class="grow"><b>${n}</b> x${me.inv[k] || 0}<div class="muted small">${ds}</div></div><button data-use="${k}" ${(me.inv[k] || 0) > 0 ? '' : 'disabled'}>Usar</button></div>`).join('')}</div>
        <h3>🗡️ Espadas <span class="muted small">(${(me.inv.swords || []).length}/${MMO.SWORD_MAX})</span></h3>
        <div class="items">${(me.inv.swords || []).slice().sort((a, b) => b.r - a.r).map((sw) => { const R = MMO.SWORD_RARITY[sw.r]; const on = me.sword === sw.id; return `<div class="item sword ${on ? 'on' : ''}"><span class="ic sword-ic" style="color:${R.color}">${sw.r >= 3 ? '⚔️' : '🗡️'}</span><div class="grow"><b style="color:${R.color}">${esc(sw.n)}</b><div class="muted small">${esc(R.name)} · +${Math.round((R.power - 1) * (me.talent === 'Espadachín' ? 110 : 100))}% de poder${me.talent === 'Espadachín' ? ' (Espadachín)' : ''} · se vende por ${fmtB(R.sell)}</div></div>${on ? '<button data-sword="unequip" data-id="">Guardar</button>' : `<button class="gold" data-sword="equip" data-id="${sw.id}">Empuñar</button>`}<button data-sword="sell" data-id="${sw.id}" title="Vender (en un pueblo)">Vender</button></div>`; }).join('') || '<p class="muted small">No tienes espadas. Caen a veces al derrotar enemigos (mejores cuanto más fuertes), aparecen en tesoros y se compran en algunas tiendas.</p>'}</div>
        <h3>🍎 Frutas Malditas</h3>
        ${me.fruit >= 0 ? (() => { const F = OP.FRUITS[me.fruit], ab = MMO.abilityOf(me.fruit); return `<div class="item"><img class="ic-fruit" src="${OP.Sprites.fruitURL(me.fruit)}" alt=""><div class="grow"><b>Has comido la ${esc(F.name)}</b><div class="muted small">${esc(F.type)} · ${esc(OP.RARITY[F.rarity])} · ${esc(F.ability)}</div><div class="small">Habilidad (Q): <b>${esc(ab.name)}</b></div></div></div>`; })() : ''}
        <div class="items">${(me.inv.fruits || []).map((fid) => { const F = OP.FRUITS[fid]; return `<div class="item"><img class="ic-fruit" src="${OP.Sprites.fruitURL(fid)}" alt=""><div class="grow"><b>${esc(F.name)}</b><div class="muted small">${esc(F.type)} · ${esc(OP.RARITY[F.rarity])} · ${esc(F.ability)}</div><div class="small">Habilidad: ${esc(MMO.abilityOf(fid).name)}</div></div><button data-eat="${fid}" ${me.fruit >= 0 ? 'disabled title="Ya comiste una: otra te mataría"' : ''}>COMER</button></div>`; }).join('') || '<p class="muted small">No llevas ninguna. Son muy raras: explora las islas y, si notas algo extraño, búscala por la isla. Al verla brillar, haz clic para recogerla.</p>'}</div>
        <h3>Navegación</h3>
        <div class="kv"><span>Compás de Ruta</span><b>${me.logpose ? '🧭 Sí' : '—'}</b></div>
        <div class="kv"><span>Recubrimiento</span><b>${me.coated ? '🫧 Sí' : '—'}</b></div>
        <div class="kv"><span>Navegas en</span><b>⛵ ${esc((OP.SHIPS[me.ship] || {}).name || me.ship)}</b></div>
        <h3>Tus barcos</h3>
        <div class="items">${me.ships.map((s) => `<div class="item"><span class="ic">⛵</span><div class="grow"><b>${esc(OP.SHIPS[s].name)}</b><div class="muted small">Velocidad ${OP.SHIPS[s].speed} · capacidad ${OP.SHIPS[s].cap}</div></div>${s === 'legendario' ? '<button class="gold" data-open="shipcustom">🎨 Personalizar</button>' : ''}${isCap && s !== 'bote' ? `<button data-crewship="${s}">${Net.crew.ship === s ? '✔ Compartido' : 'Compartir con la tripulación'}</button>` : ''}</div>`).join('')}</div>
      </div><div>
        <h3>🛒 Tienda ${I ? 'de ' + esc(I.name) : ''}</h3>
        ${!I ? '<p class="muted">Desembarca en una isla para comprar.</p>' : !shop.length ? '<p class="muted">En esta isla no hay tienda.</p>' : `<div class="items">${shop.map((k) => {
          const it = MMO.SHOP[k];
          const owned = (it.ship && me.ships.indexOf(it.ship) >= 0) || (k === 'logpose' && me.logpose) || (k === 'coating' && me.coated);
          return `<div class="item"><span class="ic">${it.icon}</span><div class="grow"><b>${esc(it.name)}</b><div class="muted small">${esc(it.desc)}</div><div class="price">${fmtB(it.price)}</div></div><button data-buy="${k}" ${owned || me.money < it.price ? 'disabled' : ''}>${owned ? 'Ya lo tienes' : 'Comprar'}</button></div>`;
        }).join('')}</div>`}
        <p class="muted small">Tienes ${fmtB(me.money)}. Para ganar dinero: derrota enemigos (te quedas parte de lo que llevan), explora (E), ${me.faction === 'pirate' ? 'saquea pueblos (J)' : 'patrulla las islas (J)'}, vende espadas y cumple misiones. Carabelas en islas grandes, bergantines donde venden Compás de Ruta, galeones y navíos legendarios en Puerto Canales, recubrimiento en las Burbujas.</p>
      </div></div>`, 'wide');
    UI.modalKind = 'inventory';
  }
  // ---------- Sueño ----------
  function openDream() {
    const me = Net.me;
    const list = MMO.questsFor(me.dream);
    const cur = MMO.currentQuest(me);
    const perk = me.perk ? MMO.SPAWN_PERKS[me.perk] : null;
    // contratos contra NPC concretos (uno por dificultad); se piden al servidor al abrir
    if (!UI.contracts || Date.now() - (UI.contractsReqAt || 0) > 15000) { UI.contractsReqAt = Date.now(); Net.send('req', { what: 'contracts' }); }
    const CL = (UI.contracts && UI.contracts.list) || [];
    const contracts = `<h3>📜 Contratos <span class="muted small">objetivos reales del mundo · cuanto más difícil, mucha más EXP</span></h3>
      <div class="contracts">${CL.map((c) => {
        const D = MMO.DIFFS[c.diff];
        return `<div class="contract" style="border-color:${D.color}"><span class="ct-diff" style="background:${D.color}">${D.icon} ${D.name}</span>
          <div><b>${c.faction === 'marine' ? '⚓' : '☠'} ${esc(c.name)}</b> <span class="small muted">nv ${c.lvl}${c.bounty ? ' · ' + OP.fmtBShort(c.bounty) : ''}</span></div>
          <div class="small">${c.gone ? '❔ Ya no está en ninguna isla' : '📍 ' + esc(c.isl)}</div>
          <div class="small ct-rew">+${OP.dots(c.xp)} EXP · +${OP.fmtBShort(c.money)}</div>
          ${c.x != null ? `<button class="mini-btn" data-ctgo="${c.x},${c.y}">🧭 Ver en el mapa</button>` : ''}</div>`;
      }).join('') || '<p class="muted small">Buscando objetivos...</p>'}</div>
      <div class="btns"><button data-ctnew="1">🔄 Contratos nuevos</button></div>`;
    UI.openModal(`<h2>⭐ Misiones · Sueño: ${esc(MMO.dreamsFor(me.faction)[me.dream])}</h2>
      ${contracts}
      <h3>⭐ Misiones</h3>
      <p class="muted small">Del nivel 1 al 12: misiones de viaje 🧭, combate ⚔️ y entrenamiento 🥋. Las de combate piden enemigos de una dificultad: 🟢 Fácil (por debajo de tu nivel), 🟡 Media (de tu nivel), 🟠 Difícil (2-4 niveles más) y 🔴 Épica (5+ niveles más, jefes o muy buscados). Después llegan las de tu Sueño ⭐.</p>
      <div>${list.map((q) => {
        const done = me.questsDone.indexOf(q.id) >= 0, isCur = cur && cur.id === q.id;
        const v = Math.min(q.goal, MMO.statValue(me, q.stat));
        return `<div class="quest-row ${done ? 'done' : ''} ${isCur ? 'cur' : ''}"><span>${done ? '✅' : isCur ? '▶️' : '🔒'}</span><span title="${esc(q.kind || 'dream')}">${MMO.QUEST_KINDS[q.kind || 'dream'] || '⭐'}</span><span style="flex:1">${esc(q.text)}</span><span class="small">${done ? 'Hecho' : q.goal >= 1e5 ? OP.fmtBShort(v) + ' / ' + OP.fmtBShort(q.goal) : v + ' / ' + q.goal}</span><span class="small" style="width:140px;text-align:right">+${OP.dots(q.xp)} EXP${q.money ? ' · ' + OP.fmtBShort(q.money) : ''}</span></div>`;
      }).join('')}</div>
      <h3>Tu origen</h3>
      <div class="kv"><span>Isla de aparición</span><b>${esc((OP.M.byId[me.spawnIsland] || {}).name || '?')} (${esc(seaName(me.spawnSea))})</b></div>
      ${perk ? `<div class="kv"><span>Bonus</span><b>✨ ${esc(perk.text)}</b></div>` : ''}
      ${me.buffs.length ? `<div class="kv"><span>Activo</span><b>⏳ x${me.buffs[0].mult} EXP durante ${fmtMs(me.buffs[0].msLeft)} (cuenta el tiempo conectado)</b></div>` : ''}`);
    UI.modalKind = 'dream';
    document.querySelectorAll('[data-ctgo]').forEach((b) => b.addEventListener('click', () => { const [x, y] = b.dataset.ctgo.split(',').map(Number); UI.closeModal(); OP.Main.lookAt(x, y); if (OP.Render.ping) OP.Render.ping(x, y); }));
    const nb = document.querySelector('[data-ctnew]');
    if (nb) nb.addEventListener('click', () => { UI.contractsReqAt = Date.now(); Net.send('req', { what: 'contracts', refresh: true }); });
  }
  // ---------- Ayuda ----------
  function openHelp() {
    UI.openModal(`<h2>❓ Cómo se juega</h2>
      <ul class="help">
        <li>🕹️ <b>WASD o flechas</b>: mueve a tu personaje. Al llegar al agua subes a tu barco; al tocar tierra desembarcas.</li>
        <li>👆 <b>Toca</b> un personaje, un barco o una isla para ver su información en el panel de la derecha. <b>Tab</b> elige al enemigo más cercano.</li>
        <li>⚔ <b>Espacio</b> ataca. <b>E</b> explora la isla, <b>T</b> entrena, <b>H</b> te curas, <b>G</b> usa Monte Contracorriente, la corriente Ascendente o el paso a la Isla Coralina.</li>
        <li>⚔ <b>R</b> activa el modo combate: cada clic en el mapa es un golpe al enemigo a tu alcance más cercano a donde hagas clic (no hace falta seleccionarlo). <b>R</b> otra vez o <b>Esc</b> para salir.</li>
        <li>🗂️ Arriba: <b>Tablones</b> (Se Busca y Honor de la Marina), <b>Mundo</b> (islas, frutas, Marina y periódico), Cofre, Misiones y <b>⋯</b> (códigos, ayuda, salir). En tu tarjeta, los botones PERFIL / RECOMPENSA / ESTADÍSTICAS / INFO abren cada sección.</li>
        <li>🧭 <b>Compás de Ruta</b>: desde el Mar Esmeralda las islas van en orden. Tu tarjeta muestra la siguiente y qué te falta (nivel, fama, poder, tripulación). Los Señores del Mar pueden saltarse el orden; el Rey de los Mares va libre.</li>
        <li>🏴‍☠️ Tripulación de hasta ${MMO.CREW_MAX}. El capitán puede crear hasta ${MMO.FLEET_MAX} flotas, cada una con su Almirante de Flota. Desde ${OP.fmtB(MMO.RANKING_MIN)} en total entráis al ranking. También puedes unirte a tripulaciones NPC (traicionarlas trae cazarrecompensas).</li>
        <li>👑 Los Señores del Mar y el Rey de los Mares reclaman islas (ficha de la isla), dejan guardias y cobran tributos. ⛓ Si eres pirata de más de ${OP.fmtB(MMO.PRISON_BOUNTY)} y te derrota la Marina, vas a Prisión Abismo: vence a los carceleros o soborna.</li>
        <li>⚔️ Con ${OP.fmtB(MMO.EXECUTION.bounty)} o más, la Marina te lleva a la <b>ejecución pública</b> de Bastión Central: 60 segundos para decir tus últimas palabras... o para que otro pirata te rescate manteniendo <b>E</b> junto a la plataforma.</li>
        <li>🍎 Las frutas malditas son muy raras: si ves una brillando, haz clic para recogerla. Va al inventario (<b>I</b>) y allí puedes <b>COMERLA</b>. Su poder se usa con <b>Q</b>.</li>
        <li>⛵ <b>U</b>: sube al barco de un compañero de tripulación que esté cerca (o pulsa "Subir a su barco" en su ficha). Vas donde vaya él y desembarcas al llegar a tierra; <b>U</b> otra vez para bajar.</li>
        <li>🥋 <b>Mantén T</b> para entrenar tu prioridad (💪 Fuerza, 💨 Velocidad, 🔥 Poder o ❤️ Vida, se elige en tu Perfil): sube ${MMO.TRAIN_HOLD.rate} pts/s y las otras ${MMO.TRAIN_HOLD.other}. Mientras entrenas no te mueves ni luchas. En islas de entrenamiento especial va x${MMO.TRAIN_HOLD.islandBonus}.</li>
        <li>⚡ <b>Aura</b>: Z Armadura · X Observación (se despiertan desde el nivel ${MMO.HAKI_LVL} en islas de entrenamiento especial) · V Aura del Rey (solo el ${Math.round(MMO.CONQ_BORN * 100)}% nace con él). Con el uso suben de nivel (1-4).</li>
        <li>🏠 <b>E junto a una puerta</b> (🍺 taberna, ⚕️ clínica, 🚪 casa): entras. Dentro, E junto a alguien para hablar; sal andando por la puerta. 🐾 <b>C</b>: transformación Bestia (si tienes una fruta Bestia; si no, abre Tripulaciones). 🔊 arriba a la derecha: música y sonidos.</li>
        <li>📜 En <b>Misiones (O)</b> tienes contratos contra NPC reales: 🟢 Fácil, 🟡 Media, 🟠 Difícil y 🔴 Épica (mucha más EXP cuanto más difícil). ⛰ Para volver a los cuatro mares, pulsa G en barco en la salida de Monte Contracorriente.</li>
        <li>🎁 <b>Códigos</b> (arriba): canjea códigos de recompensa, como x2 de EXP.</li>
        <li>🤝 Tripulaciones: el capitán invita a jugadores y puede <b>reclutar NPC</b> de su facción (selecciónalos y pulsa Reclutar). Si no tienes tripulación, pulsa <b>Pedir unirme</b> en la de otro jugador y su capitán decide.</li>
        <li>🎖️ Los marines que capturan piratas (NPC o jugadores) suben en el <b>Cuadro de honor</b> del menú.</li>
        <li>💬 <b>Enter</b> abre el chat (pestaña junto a Noticias). <b>/w Nombre mensaje</b> = privado, <b>/c mensaje</b> = tripulación.</li>
        <li>🖱️ Arrastra el mapa para mirar y usa la rueda para acercar. <b>M</b> vuelve a tu personaje.</li>
        <li>🧭 Para entrar en la Ruta Mayor: nivel 14, una carabela y un Compás de Ruta. Los piratas no pueden cruzar el Cinturón Quieto.</li>
        <li>🧑 Los jugadores llevan nombre y contorno de color (tú en dorado, tu tripulación en verde). Los NPC no llevan nombre y tienen un rombo gris encima.</li>
        <li>🛡️ Hasta el nivel 5 estás protegido del PvP. Si caes, despiertas en el puerto más cercano y pierdes un 8% de tus doblones.</li>
        <li>💾 Todo se guarda solo en el servidor: posición, dinero, EXP, inventario y estadísticas.</li>
      </ul>
      <label class="check"><input type="checkbox" id="opt-night" ${UI.settings.night ? 'checked' : ''}> Mostrar el día y la noche</label>`);
    UI.modalKind = 'help';
  }

  // ---------- Personalizar el Navío legendario ----------
  function openShipCustom() {
    const e = UI.shipEdit;
    const flagObj = { bg: e.flagBg, fg: e.fg, sym: e.sym };
    const img = OP.Sprites.ship('legendario', Net.me.faction, { bg: e.sail, fg: e.fg, sym: e.sym }, { hull: e.hull, flag: flagObj });
    const sw = (field, list) => `<div class="sw-row">${list.map((c) => `<button class="sw ${e[field] === c ? 'on' : ''}" data-sl="${field}" data-v="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>`;
    UI.openModal(`<h2>🎨 Tu Navío legendario</h2>
      <div class="ship-prev"><img src="${img.toDataURL()}" alt=""><img class="flag-big" src="${OP.Sprites.flagURL(flagObj)}" alt=""></div>
      <h3>Casco</h3>${sw('hull', MMO.SHIP_COLORS)}
      <h3>Velas</h3>${sw('sail', MMO.SAIL_COLORS)}
      <h3>Bandera pirata</h3>
      <div class="small muted">Fondo</div>${sw('flagBg', MMO.SAIL_COLORS)}
      <div class="small muted">Emblema (también se pinta en las velas)</div>${sw('fg', MMO.FLAG_FG)}
      <div class="small muted">Símbolo</div><div class="sw-row">${Array.from({ length: MMO.FLAG_SYMS }, (_, k) => `<button class="sym ${e.sym === k ? 'on' : ''}" data-sl="sym" data-v="${k}"><img src="${OP.Sprites.flagURL({ bg: e.flagBg, fg: e.fg, sym: k })}" alt=""></button>`).join('')}</div>
      <div class="btns"><button data-open="inventory">Volver</button><button class="gold" data-slsave="1">Guardar</button></div>`, 'narrow');
    UI.modalKind = 'shipcustom';
  }

  // ---------- Historial de tu recompensa: por qué ha subido cada vez ----------
  function openBountyLog() {
    const me = Net.me, log = me.bountyLog || [];
    const when = (t) => new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    UI.openModal(`<h2>📜 ¿Por qué tienes esta recompensa?</h2>
      <div class="kv"><span>Recompensa actual</span><b class="bounty">${fmtB(me.bounty)}</b></div>
      <p class="muted small">Cada vez que la Marina sube tu recompensa queda apuntado aquí, con el motivo. Sube al derrotar marines (más cuanto más alto su rango), piratas con recompensa y otros jugadores.</p>
      ${log.length ? `<div class="items">${log.map((e) => `<div class="item"><span class="ic">${e.old ? '📦' : e.up >= 1e8 ? '🔥' : '📈'}</span>
        <div class="grow"><div><b class="bounty">${e.up ? '+' + fmtB(e.up) : '👑'}</b> <span class="muted small">${esc(when(e.at))}</span></div>
          <div class="small">${esc(e.why.charAt(0).toUpperCase() + e.why.slice(1))}</div>
          <div class="muted small">Recompensa tras esto: ${fmtB(e.total)}</div></div></div>`).join('')}</div>`
        : '<p class="muted">Todavía no hay nada apuntado.</p>'}`, 'narrow');
    UI.modalKind = 'bountylog';
  }

  // ---------- Códigos de recompensa ----------
  function openCodes() {
    UI.openModal(`<h2>🎁 Códigos</h2><p class="muted small">Escribe un código para conseguir una recompensa. Cada código solo se puede canjear una vez por personaje.</p>
      <form id="code-form" class="btns"><input class="field" name="code" maxlength="24" placeholder="Escribe el código" style="flex:1;text-transform:uppercase" autocomplete="off"><button class="gold">Canjear</button></form>
      <div id="code-msg" class="small" style="margin-top:6px"></div>
      ${(Net.me.codesUsed || []).length ? `<p class="muted small">Ya canjeados: ${Net.me.codesUsed.map(esc).join(', ')}</p>` : ''}`, 'narrow');
    UI.modalKind = 'codes';
    const f = $('#code-form');
    if (f) { f.code.focus(); f.addEventListener('submit', (e) => { e.preventDefault(); Net.send('code', { code: f.code.value }); }); }
  }
  Net.on('code', (m) => { const el = $('#code-msg'); if (el) { el.innerHTML = (m.ok ? '✅ ' : '❌ ') + esc(m.msg); el.style.color = m.ok ? '#2c7a3a' : '#a02a1a'; } else UI.toast(m.msg); });

  // ---------- Panel de administrador (solo desde el PC del servidor; el servidor lo comprueba siempre) ----------
  function adminPanel(st) {
    if (!st.configured) {
      return `<h2>🛠 Administrador</h2><p>Crea tu clave de administrador. Solo funciona jugando desde este PC (el del servidor).</p>
        <form id="adm-form" class="btns"><input class="field" type="password" name="pass" placeholder="Nueva clave (mínimo 6)" style="flex:1" autocomplete="new-password">
        <input class="field" type="password" name="pass2" placeholder="Repite la clave" style="flex:1" autocomplete="new-password"><button class="gold">Crear clave</button></form><div id="adm-msg" class="small"></div>`;
    }
    if (!st.logged) {
      return `<h2>🛠 Administrador</h2><form id="adm-form" class="btns"><input class="field" type="password" name="pass" placeholder="Clave de administrador" style="flex:1" autocomplete="current-password"><button class="gold">Entrar</button></form><div id="adm-msg" class="small"></div>`;
    }
    UI.admLogged = true;
    const groups = islandOptions();
    const tab = UI.admTab || 'world';
    const tabs = [['world', '🌍 Mundo'], ['players', '👥 Jugadores'], ['exec', '⚔️ Ejecución'], ['server', '🗄️ Servidor']]
      .map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-adm="tab" data-tab="${k}">${l}</button>`).join('');
    const head = `<h2>🛠 Administrador</h2><div class="tabs">${tabs}</div><div id="adm-msg" class="small adm-msg"></div>`;
    if (tab === 'players') return head + adminPlayersTab();
    if (tab === 'exec') return head + adminExecTab();
    if (tab === 'server') return head + adminServerTab();
    return head + `
      <div class="adm-box"><h3>📢 Anuncio mundial</h3>
        <p class="muted small">Sale en grande en la pantalla de todos los jugadores conectados (y en el chat).</p>
        <div class="btns"><input class="field" id="adm-ann-title" placeholder="Título (opcional): ANUNCIO DEL GOBIERNO MUNDIAL" maxlength="40" style="flex:1" autocomplete="off"></div>
        <div class="btns"><input class="field" id="adm-ann" placeholder="Texto del anuncio" maxlength="200" style="flex:1" autocomplete="off"></div>
        <label class="check"><input type="checkbox" id="adm-ann-news"> Publicarlo también en el periódico</label>
        <div class="btns"><button class="gold" data-adm="announce">📢 Anunciar a todos</button></div></div>
      <div class="adm-box"><h3>🍎 Aparecer una fruta</h3>
        <div class="btns"><select class="field" id="adm-isl" style="flex:1">${groups}</select>
        <select class="field" id="adm-fruit" style="flex:1"><option value="-1">Al azar (una libre)</option>${OP.FRUITS.map((F) => `<option value="${F.id}">${esc(F.name)} · ${esc(OP.RARITY[F.rarity])}</option>`).join('')}</select></div>
        <label class="check"><input type="checkbox" id="adm-rumor"> Publicar el rumor en el periódico</label>
        <div class="btns"><button class="gold" data-adm="fruit">Esconder la fruta en esa isla</button></div></div>
      <div class="adm-box"><h3>⭐ Dar EXP</h3>
        <div class="btns"><label class="check"><input type="radio" name="adm-t" value="p" checked> Jugador</label><label class="check"><input type="radio" name="adm-t" value="n"> NPC</label>
        <input class="field" id="adm-amount" type="number" min="1" value="1000" style="width:110px" title="Cantidad de EXP"></div>
        <div class="btns"><input class="field" id="adm-name" placeholder="Nombre del jugador o del NPC" style="flex:1" autocomplete="off"><button data-adm="find">Buscar NPC</button><button class="gold" data-adm="xp">Dar EXP</button></div>
        <div id="adm-npcs" class="items"></div></div>`;
  }
  function islandOptions() {
    return ['east', 'west', 'north', 'south', 'paradise', 'sky', 'deep', 'newworld', 'calm'].map((sea) => {
      const l = OP.M.islands.filter((I) => I.sea === sea && I.land.length);
      return l.length ? `<optgroup label="${esc(seaName(sea))}">${l.map((I) => `<option value="${I.idx}">${esc(I.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');
  }
  // ---- Jugadores: buscar, ver su estado y actuar sobre él ----
  function adminPlayersTab() {
    return `<div class="adm-box"><div class="btns"><input class="field" id="adm-pq" placeholder="🔍 Buscar por nombre o @usuario" style="flex:1" autocomplete="off" value="${esc(UI.admPq || '')}">
        <button data-adm="reload">🔄 Actualizar</button></div>
        <div id="adm-plist" class="adm-plist"><p class="muted small">Cargando...</p></div></div>
      <div id="adm-pdetail"></div>
      <div class="adm-box"><h3>🔑 Contraseña olvidada</h3>
        <p class="muted small">Pon una contraseña nueva a una cuenta (también sirve para cuentas sin personaje). Déjala vacía para generar una temporal. Se cierran sus sesiones abiertas; la contraseña antigua deja de valer.</p>
        <div class="btns"><input class="field" id="adm-pw-user" placeholder="@usuario" style="flex:1" autocomplete="off"><input class="field" id="adm-pw-new" placeholder="Nueva (vacía = generar)" style="flex:1" autocomplete="new-password">
        <button class="gold" data-adm="resetpass">🔑 Cambiar</button></div>
        <div id="adm-pw-out" class="small"></div></div>`;
  }
  function admBadges(p) {
    return [p.online ? '<span class="adm-b on">● conectado</span>' : '<span class="adm-b">desconectado</span>', p.king ? '<span class="adm-b gold">👑 Rey</span>' : '',
      p.execution ? '<span class="adm-b red">⚔️ en ejecución</span>' : '', p.prison ? '<span class="adm-b red">⛓ Prisión Abismo</span>' : '', p.muted ? '<span class="adm-b">🔇 silenciado</span>' : '', p.dead ? '<span class="adm-b">💀 caído</span>' : ''].join('');
  }
  function fillAdminPlayers() {
    const box = $('#adm-plist');
    if (!box) return;
    const q = (UI.admPq || '').trim().toLowerCase();
    const L = (UI.admPlayers || []).filter((p) => !q || p.name.toLowerCase().indexOf(q) >= 0 || String(p.user || '').toLowerCase().indexOf(q) >= 0);
    box.innerHTML = L.slice(0, 80).map((p) => `<div class="adm-prow ${UI.admSel === p.cid ? 'on' : ''}" data-adm="psel" data-cid="${p.cid}">
        <span class="adm-pn">${p.faction === 'marine' ? '⚓' : '☠'} <b>${esc(p.name)}</b> <span class="muted small">@${esc(p.user || '')} · nv ${p.lvl}</span></span>
        <span class="small">${p.faction === 'pirate' ? OP.fmtB(p.bounty) : OP.dots(Math.round(p.merit)) + ' méritos'}</span>
        <span class="muted small">📍 ${esc(p.where)}</span><span>${admBadges(p)}</span></div>`).join('') || '<p class="muted small">No hay ningún personaje con ese nombre.</p>';
    fillAdminDetail();
  }
  function fillAdminDetail() {
    const box = $('#adm-pdetail');
    if (!box) return;
    const p = (UI.admPlayers || []).find((x) => x.cid === UI.admSel);
    if (!p) { box.innerHTML = '<p class="muted small">Elige un jugador de la lista para ver qué puedes hacer.</p>'; return; }
    box.innerHTML = `<div class="adm-box"><h3>${p.faction === 'marine' ? '⚓' : '☠'} ${esc(p.name)} <span class="muted small">@${esc(p.user || '')} · nivel ${p.lvl}${p.crew ? ' · ' + esc(p.crew) : ''}</span></h3>
      <div class="small">${admBadges(p)} · 💰 ${OP.fmtB(p.money)} · 📍 ${esc(p.where)}</div>
      <div class="adm-grid">
        <div><label class="small muted">💰 Dinero (negativo para quitar)</label><div class="btns"><input class="field" id="adm-money" type="number" value="100000" style="flex:1"><button data-adm="pact" data-act="money">Dar</button></div></div>
        ${p.faction === 'pirate' ? `<div><label class="small muted">📜 Fijar recompensa</label><div class="btns"><input class="field" id="adm-bounty" type="number" min="0" value="${p.bounty}" style="flex:1"><button data-adm="pact" data-act="bounty">Fijar</button></div>
          <label class="check small"><input type="checkbox" id="adm-bounty-news"> Anunciarlo en el periódico</label></div>` : ''}
        <div><label class="small muted">✨ Llevar a una isla</label><div class="btns"><select class="field" id="adm-tp" style="flex:1">${islandOptions()}</select><button data-adm="pact" data-act="tp">Llevar</button></div></div>
        <div><label class="small muted">🔇 Silenciar en el chat (minutos, 0 = quitar)</label><div class="btns"><input class="field" id="adm-mute" type="number" min="0" value="${p.muted ? 0 : 10}" style="flex:1"><button data-adm="pact" data-act="mute">Aplicar</button></div></div>
      </div>
      <div class="btns">
        <button data-adm="pact" data-act="goto">🧭 Ir junto a él</button>
        ${p.online ? '<button data-adm="pact" data-act="heal">❤️ Curar / levantar</button>' : ''}
        ${p.prison ? '<button data-adm="pact" data-act="free">🔓 Sacar de Prisión Abismo</button>' : ''}
        ${p.execution ? '<button data-adm="pact" data-act="execCancel">📜 Cancelar su ejecución</button>' : '<button class="red" data-adm="pact" data-act="exec">⚔️ Ejecución pública</button>'}
        ${p.online ? '<button class="red" data-adm="pact" data-act="kick">👢 Expulsar</button>' : ''}
        <button data-adm="pwfor" data-user="${esc(p.user || '')}">🔑 Contraseña nueva</button>
      </div></div>`;
    const pt = $('#adm-tp');
    if (pt && UI.admTpIsl != null) pt.value = UI.admTpIsl;
  }
  // ---- Ejecución pública: las que están en marcha y forzar una ----
  function execOptions() {
    const pirates = (UI.admPlayers || []).filter((p) => p.faction === 'pirate' && !p.execution).sort((a, b) => b.bounty - a.bounty);
    return pirates.map((p) => `<option value="${p.cid}">${esc(p.name)} · ${OP.fmtB(p.bounty)}${p.online ? ' · ● conectado' : ''}</option>`).join('') || '<option value="">(cargando o sin piratas)</option>';
  }
  function adminExecTab() {
    return `<div class="adm-box"><h3>⚔️ Ejecuciones en marcha</h3><div id="adm-execs"></div></div>
      <div class="adm-box"><h3>🔥 Forzar una ejecución pública</h3>
        <p class="muted small">Lo lleva encadenado a la plataforma de Bastión Central ahora mismo, esté donde esté (preso, caído o desconectado). Todo el servidor ve la cuenta atrás de ${Math.round(MMO.EXECUTION.ms / 1000)} s; otro pirata puede rescatarlo.</p>
        <div class="btns"><select class="field" id="adm-exec-who" style="flex:1">${execOptions()}</select>
        <button class="red" data-adm="execforce">⚔️ Empezar la ejecución</button></div></div>
      <div class="adm-box"><h3>📋 Reglas</h3><ul class="small muted">
        <li>Un pirata con ${OP.fmtB(MMO.EXECUTION.bounty)} o más derrotado por un marine va solo a la ejecución.</li>
        <li>Rescate: otro pirata mantiene E ${MMO.EXECUTION.holdMs / 1000} s junto a la plataforma. Si nadie llega: recompensa a 0.</li>
        <li>También por consola o chat: <code>/forzar_ejecucion nombre</code>, <code>/cancelar_ejecucion nombre</code>.</li></ul></div>`;
  }
  function fillAdminExecs() {
    const box = $('#adm-execs');
    if (!box) return;
    const L = [...((OP.Main.exec && OP.Main.exec.list) || new Map()).values()];
    box.innerHTML = L.map((o) => `<div class="adm-prow"><span class="adm-pn">⛓ <b>${esc(o.name)}</b> <span class="small">${OP.fmtB(o.bounty)}</span></span>
        <span class="small">quedan <b class="adm-exec-clock" data-cid="${o.cid}">${Math.max(0, Math.ceil((o.end - Date.now()) / 1000))}</b> s${o.sid ? '' : ' · desconectado'}</span>
        <span class="muted small">${o.words ? '«' + esc(o.words) + '»' : ''}${o.rescuer ? ' · 🔓 ' + esc(o.rescuer) + ' le está rescatando' : ''}</span>
        <button data-adm="execcancel" data-cid="${o.cid}">📜 Cancelar</button></div>`).join('') || '<p class="muted small">No hay ninguna ejecución en marcha.</p>';
  }
  setInterval(() => { if (UI.modalKind === 'admin' && UI.admTab === 'exec') fillAdminExecs(); }, 1000);
  // ---- Servidor: guardar, copias de seguridad y Nueva Era ----
  function adminServerTab() {
    return `<div class="adm-box"><h3>💾 Guardar y copias de seguridad</h3>
        <p class="muted small">El juego guarda solo cada pocos minutos. La copia de seguridad es un archivo completo en data\\copias\\ que puedes restaurar si algo sale mal.</p>
        <div class="btns"><button data-adm="save">💾 Guardar ahora</button><button class="gold" data-adm="backup">🗄️ Hacer copia de seguridad</button></div></div>
      <div class="adm-box danger"><h3>🌅 Nueva Era (reiniciar todas las cuentas)</h3>
        <p class="small">Borra <b>TODOS</b> los personajes y tripulaciones. Las cuentas se quedan: cada jugador crea un personaje nuevo al volver a entrar. Antes se hace una copia de seguridad automática. Se echa a todos los conectados (también a ti).</p>
        <div class="btns"><input class="field" id="adm-era" placeholder="Escribe NUEVA ERA para confirmar" style="flex:1" autocomplete="off"><button class="red" data-adm="era" id="adm-era-btn" disabled>🌅 Empezar la Nueva Era</button></div></div>`;
  }
  function bindAdminTab() {
    const q = $('#adm-pq');
    if (q) q.addEventListener('input', () => { UI.admPq = q.value; fillAdminPlayers(); });
    const era = $('#adm-era');
    if (era) era.addEventListener('input', () => { $('#adm-era-btn').disabled = era.value.trim().toUpperCase() !== 'NUEVA ERA'; });
    if (UI.admTab === 'players' || UI.admTab === 'exec') { Net.send('admin', { op: 'players' }); if (UI.admTab === 'exec') fillAdminExecs(); }
  }
  function openAdminTab(tab) {
    UI.admTab = tab;
    UI.openModal(adminPanel({ configured: true, logged: true }), 'wide admin-modal');
    UI.modalKind = 'admin';
    bindAdminTab();
  }
  function bindAdminForm() {
    const f = $('#adm-form');
    if (!f) return;
    f.pass.focus();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      if (f.pass2) { if (f.pass.value !== f.pass2.value) { $('#adm-msg').textContent = 'Las claves no coinciden.'; return; } Net.send('admin', { op: 'setup', pass: f.pass.value }); }
      else Net.send('admin', { op: 'login', pass: f.pass.value });
    });
  }
  function adminAction(what, b) {
    const msg = (t) => { const el = $('#adm-msg'); if (el) { el.textContent = t; el.style.color = '#a02a1a'; } };
    if (what === 'tab') return openAdminTab(b.dataset.tab);
    if (what === 'reload') return Net.send('admin', { op: 'players' });
    if (what === 'psel') { UI.admSel = +b.dataset.cid; document.querySelectorAll('.adm-prow').forEach((x) => x.classList.toggle('on', x === b)); return fillAdminDetail(); }
    if (what === 'pact') {
      const act = b.dataset.act;
      const p = (UI.admPlayers || []).find((x) => x.cid === UI.admSel);
      if (!p) return msg('Elige un jugador.');
      const o = { op: 'pact', cid: p.cid, act };
      if (act === 'money') o.value = +$('#adm-money').value;
      if (act === 'bounty') { o.value = +$('#adm-bounty').value; o.news = $('#adm-bounty-news').checked; }
      if (act === 'tp') { o.isl = +$('#adm-tp').value; UI.admTpIsl = o.isl; }
      if (act === 'mute') o.value = +$('#adm-mute').value;
      if (act === 'kick') { const r = prompt('¿Expulsar a ' + p.name + '? Motivo (opcional):', ''); if (r === null) return; o.reason = r; }
      if (act === 'exec' && !confirm('¿Empezar la EJECUCIÓN PÚBLICA de ' + p.name + '? Todo el servidor lo verá.')) return;
      return Net.send('admin', o);
    }
    if (what === 'execforce') {
      const cid = +$('#adm-exec-who').value;
      if (!cid) return msg('Elige un pirata.');
      const p = (UI.admPlayers || []).find((x) => x.cid === cid);
      if (!confirm('¿Empezar la EJECUCIÓN PÚBLICA de ' + (p ? p.name : 'ese pirata') + '?')) return;
      return Net.send('admin', { op: 'pact', cid, act: 'exec' });
    }
    if (what === 'execcancel') return Net.send('admin', { op: 'pact', cid: +b.dataset.cid, act: 'execCancel' });
    if (what === 'copypass') { try { navigator.clipboard.writeText(b.dataset.pass); b.textContent = '✅ Copiada'; } catch (e) { /* sin portapapeles */ } return; }
    if (what === 'pwfor') { const u = $('#adm-pw-user'); if (u) { u.value = b.dataset.user || ''; u.scrollIntoView({ block: 'center' }); $('#adm-pw-new').focus(); } return; }
    if (what === 'resetpass') {
      const user = $('#adm-pw-user').value.trim().replace(/^@/, '');
      const pass = $('#adm-pw-new').value;
      if (!user) return msg('Escribe el @usuario de la cuenta.');
      if (pass && (pass.length < 6 || pass.length > 64)) return msg('La contraseña debe tener entre 6 y 64 caracteres.');
      if (!confirm('¿Poner una contraseña nueva a @' + user + '? La antigua dejará de funcionar.')) return;
      $('#adm-pw-new').value = '';
      return Net.send('admin', { op: 'resetPass', user, pass });
    }
    if (what === 'announce') {
      const text = $('#adm-ann').value.trim();
      if (text.length < 3) return msg('Escribe el anuncio.');
      return Net.send('admin', { op: 'announce', text, title: $('#adm-ann-title').value.trim(), news: $('#adm-ann-news').checked });
    }
    if (what === 'save') return Net.send('admin', { op: 'save' });
    if (what === 'backup') return Net.send('admin', { op: 'backup' });
    if (what === 'era') {
      const c = $('#adm-era').value.trim();
      if (c.toUpperCase() !== 'NUEVA ERA') return msg('Escribe NUEVA ERA para confirmar.');
      if (!confirm('ÚLTIMO AVISO: se borran TODOS los personajes y tripulaciones (con copia de seguridad antes). ¿Seguro?')) return;
      if (!Net.connected) return msg('No hay conexión con el servidor. Recarga la página y vuelve a intentarlo.');
      const el = $('#adm-msg'); if (el) { el.textContent = '⏳ Enviando la orden de Nueva Era al servidor...'; el.style.color = '#7a5a10'; }
      b.disabled = true;
      return Net.send('admin', { op: 'era', confirm: c });
    }
    if (what === 'fruit') return Net.send('admin', { op: 'fruit', isl: +$('#adm-isl').value, fid: +$('#adm-fruit').value, rumor: $('#adm-rumor').checked });
    if (what === 'find') { const q = $('#adm-name').value.trim(); if (q.length < 2) return msg('Escribe al menos 2 letras del nombre.'); return Net.send('admin', { op: 'findNpc', q }); }
    if (what === 'pick') { UI.admNpc = +b.dataset.id; $('#adm-name').value = b.dataset.name; document.querySelector('input[name="adm-t"][value="n"]').checked = true; document.querySelectorAll('[data-adm="pick"]').forEach((x) => x.classList.toggle('on', x === b)); return; }
    if (what === 'xp') {
      const t = document.querySelector('input[name="adm-t"]:checked').value;
      const amount = +$('#adm-amount').value;
      if (!(amount > 0)) return msg('Pon una cantidad de EXP.');
      if (t === 'n') { if (!UI.admNpc) return msg('Busca el NPC y elígelo de la lista.'); return Net.send('admin', { op: 'xp', t: 'n', id: UI.admNpc, amount }); }
      const name = $('#adm-name').value.trim();
      if (!name) return msg('Escribe el nombre exacto del jugador.');
      return Net.send('admin', { op: 'xp', t: 'p', name, amount });
    }
  }
  Net.on('admin', (m) => {
    if (UI.modalKind !== 'admin') { if (m.msg) UI.toast(m.msg); return; }
    if (m.op === 'status' || ((m.op === 'login' || m.op === 'setup') && m.ok)) {
      UI.openModal(adminPanel({ configured: m.op === 'status' ? m.configured : true, logged: m.op === 'status' ? m.logged : true }), 'wide admin-modal');
      UI.modalKind = 'admin'; UI.admNpc = 0;
      bindAdminForm();
      bindAdminTab();
      if (m.msg) { const el = $('#adm-msg'); if (el) el.textContent = m.msg; }
      return;
    }
    if (m.op === 'players') {
      UI.admPlayers = m.list || [];
      if (UI.admTab === 'exec') { const sel = $('#adm-exec-who'); if (sel) sel.innerHTML = execOptions(); return fillAdminExecs(); }
      return fillAdminPlayers();
    }
    if (m.refresh) Net.send('admin', { op: 'players' });
    if (m.op === 'resetPass') {   // la contraseña nueva se queda a la vista (solo en este panel) para dictársela a tu amigo
      const out = $('#adm-pw-out');
      if (out) out.innerHTML = m.ok ? `✅ Nueva contraseña: <b class="adm-pass">${esc(m.pass)}</b> <button class="mini-btn" data-adm="copypass" data-pass="${esc(m.pass)}">📋 Copiar</button>` : '❌ ' + esc(m.msg);
    }
    if (m.op === 'findNpc') {
      const box = $('#adm-npcs');
      if (box) box.innerHTML = m.list.map((a) => `<div class="item"><div class="grow"><b>${esc(a.name)}</b> <span class="muted small">${a.faction === 'pirate' ? '☠' : '⚓'} nv ${a.lvl} · ${esc(a.where)}</span></div><button data-adm="pick" data-id="${a.id}" data-name="${esc(a.name)}">Elegir</button></div>`).join('') || '<p class="muted small">No hay ningún NPC con ese nombre.</p>';
      return;
    }
    const el = $('#adm-msg');
    if (el) { el.textContent = (m.ok === false ? '❌ ' : '✅ ') + (m.msg || ''); el.style.color = m.ok === false ? '#a02a1a' : '#2c7a3a'; }
  });

  // ---------- Tarjeta Vivre (tuya o de un NPC) ----------
  UI.openVivre = function (d, npc) {
    const me = Net.me;
    if (!npc && !d) {
      const p = Net.players.get(Net.sid);
      const badges = [];
      if (me.zones.indexOf('paradise') >= 0) badges.push('grandline');
      if (me.zones.indexOf('newworld') >= 0) badges.push('newworld');
      if (me.zones.indexOf('sky') >= 0) badges.push('sky');
      if (me.zones.indexOf('deep') >= 0) badges.push('deep');
      if (me.bounty) badges.push('wanted');
      if (me.bounty >= 1e8) badges.push('bounty100');
      if (me.fruit >= 0) badges.push('fruit');
      if (Net.crew && Net.crew.captain === me.cid) badges.push('captain');
      if (me.visited.length >= 10) badges.push('explorer');
      if (me.stats.npcKills > 0) badges.push('first_win');
      for (const t of me.trainedAt) badges.push('train_' + t);
      const best = me.moments[0];
      d = { name: me.name, epithet: me.epithet, lvl: me.lvl, talent: me.talent, faction: me.faction, rank: me.rank, app: p ? p.app : null, str: me.str, spd: me.spd, maxHp: me.maxHp, hp: me.hp,
        bounty: me.bounty, merit: me.merit, fruit: me.fruit, badges, visited: me.visited.map((i) => OP.M.islands[i].name), age: me.age, quote: me.quote,
        dream: MMO.dreamsFor(me.faction)[me.dream], homeSea: me.spawnSea, crew: Net.crew ? Net.crew.name : '', role: Net.crew && Net.crew.captain === me.cid ? 'capitán' : 'tripulante',
        fights: me.stats.npcKills + me.stats.pvpWins + me.stats.pvpLosses + me.stats.deaths, wins: me.stats.npcKills + me.stats.pvpWins, losses: me.stats.pvpLosses + me.stats.deaths,
        treasures: me.stats.treasures, missions: me.questsDone.length, best: best ? { t: best.t, when: new Date(best.at).toLocaleDateString('es-ES') } : null, friend: null, rival: null, mine: true };
    } else if (npc) {
      d = Object.assign({}, d, { fights: d.st.fights, wins: d.st.wins, losses: d.st.losses, treasures: d.faction === 'pirate' ? d.st.treasures : d.st.caps, missions: d.st.missions,
        best: d.best ? { t: d.best.t, when: OP.fmtDay(d.best.d) } : null, fruit: d.fruit });
    }
    const burn = Math.max(0, 1 - d.hp / d.maxHp);
    const seed = (d.name.length + d.lvl) % 4;
    const maxS = Math.max(80, d.str, d.spd);
    const statRow = (label, v, max) => `<div class="vv-stat"><span>${label}</span><div class="vv-bar"><i style="width:${Math.min(100, v / max * 100).toFixed(0)}%"></i></div><b>${v}</b></div>`;
    const mini = (b) => (b ? `<span class="vv-person"><img src="${face(b.app, b.faction, b.rank, null, b.dead)}" alt=""><a data-nsel="${b.id}">${esc(b.name)}</a>${b.dead ? ' <small>(✝)</small>' : ''}</span>` : '<span class="muted">Nadie todavía</span>');
    const facLine = d.faction === 'pirate' ? '☠ Pirata' + (d.crew ? ' — ' + esc(d.role || 'tripulante') + ' de ' + esc(d.crew) : ' solitario') : '⚓ ' + esc(OP.RANKS[d.rank]) + ' de la Marina';
    UI.openModal(`<div class="vivre v${seed}" style="--burn:${burn.toFixed(2)}">
      <div class="vv-paper">
        <i class="vv-orn tl"></i><i class="vv-orn tr"></i><i class="vv-orn bl"></i><i class="vv-orn br"></i>
        <div class="vv-top">~ TARJETA VIVRE ~</div>
        <div class="vv-main">
          <div class="vv-left"><div class="vv-frame"><img src="${face(d.app, d.faction, d.rank, '#e8d5a8')}" alt=""></div>
            <div class="vv-level">NIVEL ${d.lvl}</div><div class="vv-talent">${(OP.TALENTS[d.talent] || {}).icon || ''} ${esc(d.talent)}</div></div>
          <div class="vv-right">
            <div class="vv-name">${esc(d.name)}</div>${d.epithet ? `<div class="vv-epi">«${esc(d.epithet)}»</div>` : ''}
            <div class="vv-fac">${facLine}${npc ? ' · <small>NPC</small>' : ''}</div>
            ${statRow('Fuerza', d.str, maxS)}${statRow('Velocidad', d.spd, maxS)}${statRow('Salud', d.maxHp, Math.max(400, d.maxHp))}
            <div class="vv-money">${d.faction === 'pirate' ? (d.bounty ? 'Recompensa: <b>' + fmtB(d.bounty) + '</b>' : 'Aún sin recompensa') : 'Méritos: <b>' + Math.round(d.merit) + '</b>'}</div>
            ${d.fruit >= 0 ? `<div class="vv-money">🍎 ${esc(OP.FRUITS[d.fruit].name)}</div>` : ''}
          </div>
        </div>
        <div class="vv-badges">${d.badges.length ? d.badges.map((b) => { const [ic, lb] = badgeInfo(b); return `<span class="vv-badge" title="${esc(lb)}">${ic}<small>${esc(lb)}</small></span>`; }).join('') : '<span class="muted">Sin insignias todavía</span>'}</div>
        <div class="vv-grid">
          ${npc ? `<div><h4>Mejor amigo</h4>${mini(d.friend)}</div><div><h4>Rival</h4>${mini(d.rival)}</div>` : ''}
          <div class="wide"><h4>Mejor momento</h4>${d.best ? `${esc(d.best.t)} <small class="muted">(${esc(d.best.when)})</small>` : '<span class="muted">Su gran momento aún está por llegar</span>'}</div>
          <div class="wide"><h4>Islas visitadas (${d.visited.length})</h4><div class="vv-isl">${d.visited.map((n) => `<span>${esc(n)}</span>`).join('')}</div></div>
          <div><h4>Combates</h4><b>${d.fights}</b> <small>(${d.wins} ganados · ${d.losses} perdidos)</small></div>
          <div><h4>${d.faction === 'pirate' ? 'Tesoros y misiones' : 'Capturas y misiones'}</h4><b>${d.treasures}</b> · <b>${d.missions}</b> ${npc ? 'misiones' : 'objetivos'}</div>
          <div class="wide"><h4>Sueño</h4>${esc(d.dream)}</div>
          <div class="wide vv-quote">“${esc(d.quote)}”</div>
        </div>
        <div class="vv-foot">Mar de origen: ${esc(seaName(d.homeSea))} · ${d.age} años</div>
        <div class="vv-burn"></div>
      </div></div>`, 'vivre-modal');
    UI.modalKind = 'vivre';
  };

  // ---------- Invitación a una tripulación ----------
  Net.on('invite', (m) => {
    UI.openModal(`<h2>🤝 Invitación</h2><p><b>${esc(m.from)}</b> te invita a unirte a <b>${esc(m.crew)}</b>.</p>
      <div class="btns"><button data-inv="no">Rechazar</button><button class="gold" data-inv="yes">Unirme</button></div>`, 'narrow');
    UI.modalKind = 'invite';
  });
  // Fruit Notifier: aviso grande cuando aparece una fruta (solo lo reciben quienes lo han comprado)
  Net.on('fruitnote', (m) => {
    let el = document.getElementById('fruit-alert');
    if (!el) { el = document.createElement('div'); el.id = 'fruit-alert'; document.body.appendChild(el); }
    el.innerHTML = `<img src="${OP.Sprites.fruitURL(m.fid)}" alt=""><div><div class="fa-t">🔔 FRUIT NOTIFIER</div><b>¡Ha aparecido la ${esc(m.name)}!</b><div>${esc(m.type)} · ${esc(OP.RARITY[m.rarity] || '')}</div><div>📍 ${esc(m.isl)} · ${esc(m.sea)}</div><div class="small">Toca para ver la isla</div></div>`;
    el.dataset.goisl = m.islIdx;
    el.classList.remove('hidden'); el.classList.add('show');
    clearTimeout(UI._faT); UI._faT = setTimeout(() => el.classList.remove('show'), 15000);
    UI.toast('🔔 Fruit Notifier: ' + m.name + ' en ' + m.isl + ' (' + m.sea + ')');
  });
  // Orden del capitán (la reciben los tripulantes jugadores)
  Net.on('order', (m) => {
    UI.order = m.kind === 'free' ? null : { text: m.text, at: Date.now(), x: m.x, y: m.y };
    if (m.kind === 'regroup' && OP.Render.ping) { OP.Render.ping(m.x, m.y); setTimeout(() => OP.Render.ping(m.x, m.y), 900); }
    UI.renderPanel(true);
  });
  setInterval(() => { if (UI.order && Date.now() - UI.order.at > 5 * 60000) { UI.order = null; UI.renderPanel(true); } }, 15000);
  // botones de órdenes (para el capitán)
  function ordersBlock(crew, npcId) {
    const npcs = crew.npcs || [];
    const npcBtns = (id) => Object.keys(MMO.NPC_ORDERS).map((k) => `<button data-order="${k}" ${id ? `data-id="${id}"` : ''} title="${esc(MMO.NPC_ORDERS[k].desc)}">${MMO.NPC_ORDERS[k].icon} ${esc(MMO.NPC_ORDERS[k].name)}</button>`).join('');
    if (npcId) return `<div class="orders"><div class="small"><b>📣 Órdenes</b></div><div class="order-btns">${npcBtns(npcId)}</div></div>`;
    return `<div class="orders"><h3>📣 Órdenes del capitán</h3>
      ${npcs.length ? `<div class="small muted">A tus NPC (todos a la vez; para uno solo, selecciónalo en el mapa):</div><div class="order-btns">${npcBtns(0)}</div>` : ''}
      <div class="small muted">A tus tripulantes jugadores:</div><div class="order-btns">${Object.keys(MMO.PLAYER_ORDERS).map((k) => `<button data-order="${k}">${MMO.PLAYER_ORDERS[k].icon} ${esc(MMO.PLAYER_ORDERS[k].name)}</button>`).join('')}</div></div>`;
  }
  // Solicitud para unirse a tu tripulación (solo la recibe el capitán)
  Net.on('crewreq', (m) => {
    UI.openModal(`<h2>📨 Solicitud</h2><p><b>${esc(m.name)}</b> (nivel ${m.lvl}${m.bounty ? ', ' + OP.fmtB(m.bounty) : ''}) quiere unirse a <b>${esc(m.crew)}</b>.</p>
      <div class="btns"><button data-req-ans="reject" data-sid="${esc(m.sid)}">Rechazar</button><button class="gold" data-req-ans="approve" data-sid="${esc(m.sid)}">Aceptar</button></div>`, 'narrow');
    UI.modalKind = 'crewreq';
  });
  Net.on('crew', () => { if (UI.modalKind === 'crews') Net.send('req', { what: 'crews' }); UI.renderPanel(true); });

  // ======================================================================
  //  CLICS
  // ======================================================================
  function focusNews(id) {
    const n = OP.S.news.find((x) => x.id === +id);
    if (!n) return;
    UI.closeModal();
    const a = (n.a || []).find((x) => OP.S.A[x]);
    if (a) { UI.select({ t: 'n', id: a }); return; }
    if (n.isl >= 0) { const I = OP.M.islands[n.isl]; OP.Main.lookAt(I.x, I.y); UI.select({ t: 'i', id: I.idx }); }
  }
  UI.setupClicks = function () {
    document.addEventListener('click', async (e) => {
      if (!UI.started) return;
      const t = e.target;
      if (t.closest('[data-pcycle]') && UI.posterCur) { const w = UI.posterCur; w.variant = (w.variant + 1) % (w.nV || 1); return UI.openPoster(w); }
      if (t.id === 'modal') return UI.closeModal();
      const b = t.closest('[data-close],[data-open],[data-act],[data-eat],[data-nsel],[data-psel],[data-goisl],[data-news],[data-nf],[data-cf],[data-ntab],[data-wtab],[data-ctab],[data-use],[data-buy],[data-crewop],[data-crewship],[data-invite],[data-inv],[data-pmname],[data-do],[data-me],[data-joinreq],[data-req-ans],[data-wmore],[data-focus],[data-haki],[data-adm],[data-sword],[data-order],[data-sl],[data-slsave],[data-more],[data-ptab],[data-npcjoin],[data-fleetdisband],[data-unclaim],[data-claim],[data-bribe]');
      if (!t.closest('.more-wrap')) { const mm = $('#more-menu'); if (mm) mm.classList.add('hidden'); }   // cerrar el menú "⋯" al tocar fuera
      if (!b) return;
      const d = b.dataset;
      if (d.more) { $('#more-menu').classList.toggle('hidden'); return; }
      if (d.npcjoin) { Net.send('crew', { op: 'npcjoin', unitId: +d.npcjoin }); setTimeout(() => Net.send('req', { what: 'crews' }), 500); return; }
      if (d.fleetdisband) { if (confirm('¿Disolver esta flota? Sus miembros vuelven a la tripulación principal si hay sitio.')) Net.send('crew', { op: 'fleet_disband', fid: d.fleetdisband }); return; }
      if (d.unclaim) { if (confirm('¿Abandonar este territorio?')) Net.send('crew', { op: 'unclaim', isl: +d.unclaim }); return; }
      if (d.claim) { Net.send('crew', { op: 'claim' }); setTimeout(() => UI.requestInfo(), 500); return; }
      if (d.bribe) { if (confirm(d.bribe === 'money' ? '¿Pagar el soborno a los guardias?' : '¿Entregar esta espada a los guardias?')) Net.send('bribe', { mode: d.bribe, id: d.id }); return; }
      if (d.ptab) { UI.pTab = UI.pTab === d.ptab ? '' : d.ptab; return UI.renderPanel(true); }   // secciones de la tarjeta: abrir / cerrar
      if (d.close) return UI.closeModal();
      if (d.open) { const mm = $('#more-menu'); if (mm) mm.classList.add('hidden'); return UI.open(d.open); }
      if (d.me) { UI.select(null); OP.Main.goMe(); return; }
      if (d.ntab) { UI.newsTab = d.ntab; UI.buildNews(); return; }
      if (d.nf) { UI.settings.newsFilter = d.nf; UI.buildNews(); UI.renderNews(true); return; }
      if (d.cf) { UI.chatCh = d.cf; UI.buildNews(); rerenderChat(); return; }
      if (d.news) return focusNews(d.news);
      if (d.nsel) { if (!b.closest('#side')) UI.closeModal(); UI.select({ t: 'n', id: +d.nsel }); const a = OP.S.A[+d.nsel]; if (a) OP.Main.lookAt(a.x, a.y); return; }
      if (d.psel) { UI.select({ t: 'p', id: d.psel }); return; }
      if (d.goisl) { UI.closeModal(); const I = OP.M.islands[+d.goisl]; OP.Main.lookAt(I.x, I.y); UI.select({ t: 'i', id: I.idx }); return; }
      if (d.wtab) { UI.wantedShown = 40; return renderWanted(d.wtab); }
      if (d.wmore) { UI.wantedShown = (UI.wantedShown || 40) + 40; return fillWanted(); }
      if (d.focus) return UI.setTrainFocus(d.focus);
      if (d.sl) { UI.shipEdit[d.sl] = d.sl === 'sym' ? +d.v : d.v; return openShipCustom(); }
      if (d.slsave) { Net.send('shiplook', UI.shipEdit); return; }
      if (d.sword) { if (d.sword === 'sell' && !confirm('¿Vender esta espada?')) return; Net.send('sword', { op: d.sword, id: d.id }); return; }
      if (d.order) { Net.send('crew', { op: 'order', kind: d.order, id: d.id ? +d.id : 0 }); return; }
      if (d.haki) return Net.send('action', { a: 'haki', type: +d.haki });
      if (d.adm) return adminAction(d.adm, b);
      if (d.ctab) { UI.crewTab = d.ctab; if (d.ctab === 'mine') Net.send('req', { what: 'online' }); return renderCrews(); }
      if (d.use) return Net.send('use', { item: d.use });
      if (d.eat) { const F = OP.FRUITS[+d.eat]; if (confirm('¿Comer la ' + F.name + '? Ganarás su poder para siempre, pero ya nunca podrás comer otra.')) Net.send('eat', { fid: +d.eat }); return; }
      if (d.buy) return Net.send('buy', { item: d.buy });
      if (d.crewship) return Net.send('crew', { op: 'ship', type: Net.crew && Net.crew.ship === d.crewship ? '' : d.crewship });
      if (d.invite) { Net.send('crew', { op: 'invite', sid: d.invite }); b.disabled = true; b.textContent = 'Enviada'; return; }
      if (d.inv) { Net.send('crew', { op: d.inv === 'yes' ? 'accept' : 'decline' }); return UI.closeModal(); }
      if (d.joinreq) { Net.send('crew', { op: 'request', crewId: +d.joinreq }); b.disabled = true; b.textContent = 'Enviada'; return; }
      if (d.reqAns) { Net.send('crew', { op: d.reqAns, sid: d.sid }); return UI.closeModal(); }
      if (d.pmname) { UI.closeModal(); if (!Net.me || d.pmname !== Net.me.name) UI.whisper(d.pmname); return; }
      if (d.crewop) {
        const op = d.crewop;
        if ((op === 'disband' || op === 'leave' || op === 'kick' || op === 'dismiss' || op === 'betray') && !confirm(op === 'disband' ? '¿Disolver la tripulación para siempre?' : op === 'leave' ? '¿Abandonar la tripulación?' : op === 'dismiss' ? '¿Despedir a este NPC de la tripulación?' : op === 'betray' ? '🗡️ ¿TRAICIONAR a tu tripulación? Subirá tu infamia y tu recompensa, la tripulación traicionada buscará venganza y te perseguirán cazarrecompensas durante 30 minutos.' : '¿Expulsar a este miembro?')) return;
        Net.send('crew', op === 'dismiss' ? { op, id: +d.cid } : { op, cid: +d.cid || 0 });
        setTimeout(() => Net.send('req', { what: 'crews' }), 400);
        return;
      }
      if (d.do === 'logout') { await Net.logout(); location.reload(); return; }
      if (d.act) {
        const a = d.act;
        if (a === 'attack') { if (!OP.Main.attackMode) OP.Main.setAttackMode(true); return OP.Main.attack(false); }
        if (a === 'attackmode') return OP.Main.setAttackMode(!OP.Main.attackMode);
        if (a === 'ability') return OP.Main.ability();
        if (a.indexOf('haki-') === 0) return Net.send('haki', { type: a.slice(5) });   // Aura activa (Z / X / V)
        if (a === 'explore' || a === 'train' || a === 'gate' || a === 'heal') return OP.Main.act(a);
        if (a === 'follow') { UI.follow = !UI.follow; UI.renderPanel(true); return; }
        if (a === 'desel') return UI.select(null);
        if (a === 'look') return OP.Main.lookAt(+d.x, +d.y);
        if (a === 'pm') return UI.whisper(d.name);
        if (a === 'invite') { Net.send('crew', { op: 'invite', sid: d.sid }); return; }
        if (a === 'board') { Net.send('crew', { op: 'board', sid: d.sid }); return; }
        if (a === 'unboard') { Net.send('crew', { op: 'unboard' }); return; }
        if (a === 'joinreq') { Net.send('crew', { op: 'request', crewId: +d.crew }); return; }
        if (a === 'recruit') { Net.send('crew', { op: 'recruit', id: +d.id }); setTimeout(() => { info.key = ''; UI.renderPanel(true); }, 500); return; }
        if (a === 'dismiss') { if (confirm('¿Despedir a este NPC de la tripulación?')) Net.send('crew', { op: 'dismiss', id: +d.id }); return; }
        if (a === 'vivre-me') return UI.openVivre(null, false);
        if (a === 'vivre-npc' && info.data && UI.sel && UI.sel.t === 'n') return UI.openVivre(info.data, true);
        if (a === 'poster-me') { const p = Net.players.get(Net.sid); return UI.openPoster({ name: Net.me.name, bounty: Net.me.bounty, app: p && p.app, isPlayer: true, status: 'free', epithet: Net.me.epithet, fruit: Net.me.fruit }); }
        if (a === 'poster-p' && UI.sel) { const p = Net.players.get(UI.sel.id); if (p) UI.openPoster({ name: p.name, bounty: p.bounty, app: p.app, isPlayer: true, status: 'free', fruit: info.key === 'p:' + UI.sel.id && info.data ? info.data.fruitId : -1 }); return; }
        if (a === 'poster-npc' && info.data) { const x = info.data; return UI.openPoster({ name: x.name, bounty: x.bounty, app: x.app, status: x.loc === 'prison' ? 'caught' : x.loc === 'dead' ? 'dead' : 'free', epithet: x.epithet, fruit: x.fruit }); }
      }
    });
    document.addEventListener('change', (e) => { if (e.target && e.target.id === 'opt-night') UI.settings.night = e.target.checked; });
  };
})();
