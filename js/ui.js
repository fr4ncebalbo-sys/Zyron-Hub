/* MILESDEPIRATAS - interfaz: inicio, creación, paneles, Tarjeta Vivre, carteles, periódico */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const UI = (OP.UI = { settings: { night: true, newsFilter: 'all' }, sel: null, selIsland: null, follow: false, speed: 1, paused: false, started: false });
  const $ = (s) => document.querySelector(s);
  const esc = (s) => OP.esc(s == null ? '' : s);
  const Sim = OP.Sim;

  const NEWS_ICON = { pirate: '☠️', bounty: '💰', crew: '🏴‍☠️', capture: '⛓️', battle: '⚔️', attack: '🔥', fruit: '🍎', poneglyph: '🗿', laughtale: '👑', marine: '⚓', sea: '🌊', death: '✝️', world: '🌍' };
  const NEWS_FILTERS = [['all', 'Todo'], ['bounty', '💰'], ['battle', '⚔️'], ['capture', '⛓️'], ['crew', '🏴‍☠️'], ['fruit', '🍎'], ['poneglyph', '🗿'], ['marine', '⚓'], ['world', '🌍']];
  const BADGES = {
    first_win: ['⚔️', 'Primera victoria'], wanted: ['📜', 'Se busca'], bounty100: ['💰', 'Recompensa de 100 millones'], bounty1000: ['💎', 'Recompensa de 1.000 millones'],
    grandline: ['⛰️', 'Cruzó Monte Contracorriente'], newworld: ['🌊', 'Llegó al Mar Indómito'], sky: ['☁️', 'Subió a una isla del cielo'], deep: ['🫧', 'Bajó a la Isla Coralina'],
    fruit: ['🍎', 'Usuario de Fruta Maldita'], haki_obs: ['👁️', 'Aura de Observación'], haki_arm: ['🛡️', 'Aura de Armadura'], haki_conq: ['⚡', 'Aura del Rey'],
    captain: ['🏴‍☠️', 'Capitán'], explorer: ['🧭', '10 islas visitadas'], poneglyph: ['🗿', 'Vio un Monolito'], road: ['🗺️', 'Copió un Monolito de Ruta'],
    emperor: ['👑', 'Emperador del Mar'], king: ['🏆', 'Rey de los Mares'], onepiece: ['💎', 'Encontró el Tesoro Supremo'], shipwreck: ['⚓', 'Náufrago'],
    impeldown: ['⛓️', 'Preso en Prisión Abismo'], escape_id: ['🔓', 'Se fugó de Prisión Abismo'], basebreaker: ['💥', 'Destruyó una base'], war: ['🔥', 'Guerra de Bastión Central'],
    first_capture: ['🪢', 'Primera captura'], hunter10: ['🎯', '10 piratas capturados'],
    rank4: ['🎖️', 'Capitán de la Marina'], rank5: ['🎖️', 'Comodoro'], rank6: ['🎖️', 'Contraalmirante'], rank7: ['🎖️', 'Vicealmirante'], rank8: ['⭐', 'Almirante'], rank9: ['🌟', 'Almirante de Flota']
  };
  function badgeInfo(id) {
    if (BADGES[id]) return BADGES[id];
    if (id.indexOf('train_') === 0) { const I = OP.M.byId[id.slice(6)]; return ['🥋', 'Entrenó en ' + (I ? I.name : '?')]; }
    return ['⭐', id];
  }
  const seaName = (k) => (OP.SEAS[k] ? OP.SEAS[k].name : k);

  // ======================================================================
  //  PANTALLA DE INICIO Y CREACIÓN
  // ======================================================================
  const creator = { name: '', app: null, faction: 'pirate', sea: '', island: '' };

  UI.showStart = function () {
    const saves = OP.Save.list().filter((s) => s.meta);
    const el = $('#start');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="title-wrap">
        <div class="title-flag">☠</div>
        <h1 class="title">MILES DE<br><span>PIRATAS</span></h1>
        <p class="subtitle">Un mundo pirata que vive solo. Crea a tu personaje y mira cómo escribe su propia leyenda.</p>
        <div class="start-btns">
          <button class="big-btn" data-start="new">⚓ Nueva partida</button>
          ${saves.length ? `<button class="big-btn alt" data-start="load">📂 Cargar partida</button>` : ''}
        </div>
        ${saves.length ? `<div class="save-list">${saves.map((s) => `<button class="save-chip" data-loadslot="${s.slot}">${s.slot === 'auto' ? '🔄 Automático' : '💾 Ranura ' + s.slot}: <b>${esc(s.meta.player)}</b> · ${OP.fmtDay(s.meta.time)}</button>`).join('')}</div>` : ''}
        <p id="loading-msg" class="loading">${OP.M ? '' : '🌊 Preparando los mares...'}</p>
      </div>`;
  };

  UI.showCreator = function (respawn) {
    UI.respawn = !!respawn;
    if (!creator.app) {
      const R = OP.R;
      creator.app = { skin: OP.SKINS[1], hair: 'puntiagudo', hairColor: OP.HAIR_COLORS[0], cloth: OP.CLOTH_COLORS[1], acc: 'bandana', build: 'normal' };
      creator.name = OP.NAMES_M[Math.floor(Math.random() * OP.NAMES_M.length)] + ' ' + OP.SURNAMES[Math.floor(Math.random() * OP.SURNAMES.length)];
      void R;
    }
    const el = $('#start');
    el.classList.remove('hidden');
    const sw = (list, key) => list.map((c) => `<button class="swatch ${creator.app[key] === c ? 'on' : ''}" style="background:${c}" data-set="${key}" data-val="${c}" title="${c}"></button>`).join('');
    const opts = (list, key, names) => list.map((v) => `<button class="opt ${creator.app[key] === v ? 'on' : ''}" data-set="${key}" data-val="${v}">${esc(names ? names[v] : v.charAt(0).toUpperCase() + v.slice(1))}</button>`).join('');
    const isl = creator.sea ? OP.M.islands.filter((I) => I.sea === creator.sea) : [];
    el.innerHTML = `
      <div class="creator">
        <h2>${respawn ? 'Un nuevo personaje se hace a la mar' : 'Crea a tu personaje'}</h2>
        <div class="creator-grid">
          <div class="creator-form">
            <label class="field">Nombre<input id="c-name" maxlength="28" value="${esc(creator.name)}"></label>
            <div class="field"><span>Color de piel</span><div class="row-wrap">${sw(OP.SKINS, 'skin')}</div></div>
            <div class="field"><span>Peinado</span><div class="row-wrap">${opts(OP.HAIR_STYLES, 'hair', OP.HAIR_NAMES)}</div></div>
            <div class="field"><span>Color de pelo</span><div class="row-wrap">${sw(OP.HAIR_COLORS, 'hairColor')}</div></div>
            <div class="field"><span>Color de ropa</span><div class="row-wrap">${sw(OP.CLOTH_COLORS, 'cloth')}</div></div>
            <div class="field"><span>Complemento</span><div class="row-wrap">${opts(OP.ACCESSORIES, 'acc')}</div></div>
            <div class="field"><span>Complexión</span><div class="row-wrap">${opts(OP.BUILDS, 'build')}</div></div>
            <div class="field"><span>Facción</span><div class="row-wrap">
              <button class="fac ${creator.faction === 'pirate' ? 'on' : ''}" data-fac="pirate">☠ Pirata</button>
              <button class="fac ${creator.faction === 'marine' ? 'on' : ''}" data-fac="marine">⚓ Marine</button></div></div>
            <div class="field"><span>Mar inicial <em>(obligatorio)</em></span><div class="row-wrap">
              ${OP.BLUES.map((s) => `<button class="sea ${creator.sea === s ? 'on' : ''}" data-sea="${s}">${seaName(s)}</button>`).join('')}
              <button class="sea locked" disabled title="Se llega navegando">🔒 Mar Esmeralda</button><button class="sea locked" disabled title="Se llega navegando">🔒 Mar Indómito</button></div></div>
            <div class="field"><span>Isla inicial <em>(obligatorio)</em></span><div class="row-wrap">
              ${creator.sea ? isl.map((I) => `<button class="isl ${creator.island === I.id ? 'on' : ''}" data-isl="${I.id}">${I.base ? '⚓ ' : ''}${esc(I.name)}</button>`).join('') : '<em class="muted">Primero elige un mar</em>'}
            </div></div>
          </div>
          <div class="creator-preview">
            <div class="preview-frame"><img id="c-portrait" alt="Retrato"></div>
            <div class="preview-name" id="c-pname">${esc(creator.name)}</div>
            <div class="preview-meta">${creator.faction === 'pirate' ? '☠ Pirata' : '⚓ Recluta de la Marina'}${creator.island ? ' · ' + esc(OP.M.byId[creator.island].name) : ''}</div>
            <p class="muted small">🎲 El talento, la personalidad y el sueño se deciden al azar al zarpar. Tu personaje vivirá solo: tú solo miras.</p>
            <div class="creator-btns">
              <button class="opt" data-c="random">🎲 Aleatorio</button>
              <button class="big-btn" data-c="go" ${creator.sea && creator.island ? '' : 'disabled'}>¡Zarpar!</button>
            </div>
            ${respawn ? '' : '<button class="link-btn" data-c="back">← Volver</button>'}
          </div>
        </div>
      </div>`;
    updatePreview();
  };
  function updatePreview() {
    const img = $('#c-portrait');
    if (!img) return;
    const fake = { app: creator.app, faction: creator.faction, rank: 0, loc: 'island' };
    img.src = OP.Sprites.portraitURL(fake, creator.faction === 'marine' ? '#24476e' : '#5b2a22');
  }
  function randomizeCreator() {
    const pick = (l) => l[Math.floor(Math.random() * l.length)];
    creator.app = { skin: pick(OP.SKINS), hair: pick(OP.HAIR_STYLES), hairColor: pick(OP.HAIR_COLORS), cloth: pick(OP.CLOTH_COLORS), acc: pick(OP.ACCESSORIES), build: pick(OP.BUILDS) };
    creator.name = pick(OP.NAMES_M.concat(OP.NAMES_F)) + ' ' + pick(OP.SURNAMES);
    creator.faction = Math.random() < 0.5 ? 'pirate' : 'marine';
    creator.sea = pick(OP.BLUES);
    const isl = OP.M.islands.filter((I) => I.sea === creator.sea);
    creator.island = pick(isl).id;
  }
  function onStartClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.start === 'new') { if (!OP.M) return waitMap(() => UI.showCreator(false)); UI.showCreator(false); return; }
    if (b.dataset.start === 'load') { UI.openSaves(true); return; }
    if (b.dataset.loadslot) { waitMap(() => UI.loadSlot(b.dataset.loadslot)); return; }
    if (b.dataset.set) { creator.app[b.dataset.set] = b.dataset.val; UI.showCreator(UI.respawn); return; }
    if (b.dataset.fac) { creator.faction = b.dataset.fac; UI.showCreator(UI.respawn); return; }
    if (b.dataset.sea) { creator.sea = b.dataset.sea; creator.island = ''; UI.showCreator(UI.respawn); return; }
    if (b.dataset.isl) { creator.island = b.dataset.isl; UI.showCreator(UI.respawn); return; }
    if (b.dataset.c === 'random') { randomizeCreator(); UI.showCreator(UI.respawn); return; }
    if (b.dataset.c === 'back') { UI.showStart(); return; }
    if (b.dataset.c === 'go') {
      const name = ($('#c-name').value || '').trim() || creator.name;
      const spec = { name, app: Object.assign({}, creator.app), faction: creator.faction, island: creator.island, female: false };
      if (!creator.sea || !creator.island || OP.SEAS[OP.M.byId[creator.island].sea].kind !== 'blue') return;
      if (UI.respawn) {
        const a = Sim.createPlayer(spec);
        $('#start').classList.add('hidden');
        UI.select(a, true);
        UI.paused = false;
      } else {
        OP.Main.startNew(spec);
      }
    }
  }
  function waitMap(fn) {
    const m = $('#loading-msg');
    if (m) m.textContent = '🌊 Preparando los mares...';
    const t = setInterval(() => { if (OP.M && OP.Main.terrainReady) { clearInterval(t); fn(); } }, 100);
  }
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'c-name') { creator.name = e.target.value; const p = $('#c-pname'); if (p) p.textContent = e.target.value; }
  });

  // ======================================================================
  //  BARRA SUPERIOR
  // ======================================================================
  UI.buildTopbar = function () {
    $('#topbar').innerHTML = `
      <div class="logo">☠ MILES DE <span>PIRATAS</span></div>
      <div class="clock" id="clock"></div>
      <div class="speed" id="speed">
        <button data-speed="pause" title="Pausa (Espacio)">⏸</button>
        <button data-speed="1" title="Velocidad x1 (tecla 1)">x1</button>
        <button data-speed="2" title="Velocidad x2 (tecla 2)">x2</button>
        <button data-speed="5" title="Velocidad x5 (tecla 3)">x5</button>
        <button data-speed="10" title="Velocidad x10 (tecla 4)">x10</button>
      </div>
      <button class="me" id="me-btn" title="Ir a mi personaje (tecla M)"></button>
      <div class="menu">
        <button data-open="wanted" title="Carteles de SE BUSCA">📜 Se Busca</button>
        <button data-open="crews" title="Tripulaciones">🏴‍☠️ Tripulaciones</button>
        <button data-open="marine" title="La Marina">⚓ Marina</button>
        <button data-open="fruits" title="Frutas Malditas">🍎 Frutas</button>
        <button data-open="islands" title="Islas del mundo">🗺️ Islas</button>
        <button data-open="paper" title="Periódico">📰 Periódico</button>
        <button data-open="saves" title="Guardar y cargar">💾 Partidas</button>
        <button data-open="help" title="Ayuda">❓</button>
      </div>`;
  };
  UI.updateTopbar = function () {
    const S = OP.S;
    $('#clock').innerHTML = (OP.Render && OP.S ? '<span class="sun">' + ((S.time % 24) >= 6 && (S.time % 24) < 19 ? '☀️' : '🌙') + '</span> ' : '') + OP.fmtTime(S.time) + (UI.paused ? ' <b class="paused">PAUSA</b>' : '');
    for (const b of document.querySelectorAll('#speed button')) {
      const v = b.dataset.speed;
      b.classList.toggle('on', v === 'pause' ? UI.paused : (!UI.paused && +v === UI.speed));
    }
    const p = S.A[S.playerId];
    const me = $('#me-btn');
    if (p) {
      const html = `<img src="${OP.Sprites.portraitURL(p, '#203a5c')}" alt=""><span><b>${esc(p.name)}</b><br>Nv ${p.lvl} · ${p.loc === 'dead' ? 'Muerto' : statusShort(p)}</span>`;
      if (me.dataset.html !== html) { me.innerHTML = html; me.dataset.html = html; }
    }
  };
  function statusShort(a) {
    if (a.loc === 'prison') return '⛓ Preso';
    if (a.loc === 'ship') return '⛵ Navegando';
    if (a.battle) return '⚔ Peleando';
    return '📍 ' + OP.M.islands[a.isl].name;
  }

  // ======================================================================
  //  SELECCIÓN Y PANEL LATERAL
  // ======================================================================
  UI.select = function (a, center) {
    UI.sel = a; UI.selIsland = null;
    if (a && center) { const [x, y] = OP.Render.agentPos(a); OP.Render.centerOn(x, y, Math.max(OP.Render.cam.z, 8)); }
    $('#side').classList.remove('hidden');
    UI.renderPanel(true);
  };
  UI.selectIsland = function (I, center) {
    UI.selIsland = I; UI.sel = null; UI.follow = false;
    if (center) OP.Render.centerOn(I.x, I.y, Math.max(OP.Render.cam.z, 6));
    $('#side').classList.remove('hidden');
    UI.renderPanel(true);
  };

  let lastPanel = '';
  UI.renderPanel = function (force) {
    const el = $('#side-body');
    let html = '';
    if (UI.sel) html = charPanel(UI.sel);
    else if (UI.selIsland) html = islandPanel(UI.selIsland);
    else html = `<div class="empty-panel"><p>👆 Toca a un personaje, un barco o una isla del mapa para ver lo que está pasando.</p><p class="muted">El mundo sigue vivo aunque no mires a nadie.</p>${worldSummary()}</div>`;
    if (force || html !== lastPanel) { el.innerHTML = html; lastPanel = html; }
  };

  function worldSummary() {
    const S = OP.S;
    const free = S.agents.filter((a) => a.loc === 'island' || a.loc === 'ship');
    const pir = free.filter((a) => a.faction === 'pirate').length, mar = free.length - pir;
    const crews = S.units.filter((u) => u.faction === 'pirate' && !u.solo).length;
    const top = S.agents.filter((a) => a.faction === 'pirate' && a.loc !== 'dead').sort((a, b) => b.bounty - a.bounty)[0];
    const emps = S.emperors.map((id) => S.U[id]).filter(Boolean);
    return `<div class="world-sum">
      <h3>🌍 El mundo ahora</h3>
      <div class="kv">☠ Piratas libres: <b>${pir}</b> · 🏴‍☠️ Tripulaciones: <b>${crews}</b></div>
      <div class="kv">⚓ Marines: <b>${mar}</b> · ⛓ Presos: <b>${S.agents.filter((a) => a.loc === 'prison').length}</b></div>
      ${top ? `<div class="kv">💰 Mayor recompensa: <a data-sel="${top.id}">${esc(top.name)}</a> (${OP.fmtBShort(top.bounty)})</div>` : ''}
      ${emps.length ? `<div class="kv">👑 Emperadores: ${emps.map((u) => `<a data-sel="${u.leader}">${esc((S.A[u.leader] || {}).name || '?')}</a>`).join(', ')}</div>` : ''}
      ${S.pirateKing && S.A[S.pirateKing] ? `<div class="kv">🏆 Rey de los Mares: <a data-sel="${S.pirateKing}">${esc(S.A[S.pirateKing].name)}</a></div>` : ''}
    </div>`;
  }

  function bar(v, max, cls) {
    const p = Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100));
    return `<div class="bar ${cls || ''}"><i style="width:${p.toFixed(1)}%"></i></div>`;
  }
  function locText(a) {
    const S = OP.S;
    if (a.loc === 'dead') return `✝ Murió ${esc(a.deathCause || '')} (${OP.fmtDay(a.deathT || 0)})`;
    if (a.loc === 'retired') return '🏡 Retirado';
    if (a.loc === 'prison') return `⛓ Preso en ${esc(OP.M.islands[a.isl].name)}${S.execution && S.execution.agent === a.id ? ' — ¡condenado a muerte!' : ''}`;
    if (a.loc === 'ship') {
      if (a.carriedBy) return '⛓ Prisionero en un barco de la Marina';
      const u = S.U[a.unit]; const sh = u && S.SH[u.ship];
      if (sh && sh.route) {
        const d = OP.M.islands[sh.route.dest];
        const g = sh.gate === 'climb' ? ' (subiendo Monte Contracorriente)' : sh.gate === 'dive' ? ' (bajando al fondo del mar)' : sh.gate === 'tunnel' ? ' (bajo la Muralla Carmesí)' : sh.gate === 'sky' ? ' (corriente Ascendente)' : '';
        return `⛵ Navegando hacia ${esc(d.name)}${g}`;
      }
      if (sh && sh.state === 'battle') return '⚔ Batalla naval';
      return '⛵ En el barco';
    }
    const I = OP.M.islands[a.isl];
    const act = { train: 'entrenando', explore: 'explorando', social: 'charlando con la gente', rest: 'descansando', guard: 'de guardia', board: 'subiendo al barco', fight: 'peleando', idle: 'paseando' }[a.battle ? 'fight' : a.act] || 'paseando';
    return `📍 En ${esc(I.name)} (${esc(seaName(I.sea))}) · ${act}`;
  }
  function persText(p) {
    const W = OP.PERSONALITY_WORDS;
    const keys = { amb: 'ambition', agg: 'aggression', cou: 'courage', soc: 'sociability', gre: 'greed', loy: 'loyalty', cur: 'curiosity', hon: 'honor' };
    const list = Object.keys(keys).map((k) => [k, p[k]]).sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5)).slice(0, 3);
    return list.map(([k, v]) => W[keys[k]][v >= 0.5 ? 1 : 0]).join(', ');
  }
  function crewLine(a) {
    const S = OP.S;
    const u = S.U[a.unit];
    if (!u) return a.faction === 'pirate' ? 'Sin tripulación' : 'Sin unidad';
    if (u.solo) return 'Pirata solitario';
    const emp = S.emperors.indexOf(u.id) >= 0 ? ' 👑' : '';
    return `<a data-crew="${u.id}">${esc(u.name)}</a>${emp} <span class="muted">(${esc(a.role)})</span>`;
  }

  function missionBlock(a) {
    const S = OP.S;
    const u = S.U[a.unit];
    if (!u || (a.loc !== 'island' && a.loc !== 'ship')) return '';
    const p = u.plan;
    if (!p) return `<div class="mission"><div class="m-title">🧭 Pensando qué hacer...</div></div>`;
    const sh = S.SH[u.ship];
    let phase, prog, eta;
    if (p.phase === 'travel') {
      phase = 'Viaje';
      prog = sh && sh.route ? Sim.routeProgress(sh) : 0;
      eta = sh && sh.route ? Sim.routeEta(sh) + p.work : p.work;
    } else {
      phase = 'En marcha';
      prog = Math.min(1, p.done / Math.max(1, p.work));
      eta = Math.max(0, p.work - p.done);
    }
    const reward = p.reward ? [p.reward.xp ? '+' + p.reward.xp + ' EXP' : '', p.reward.money ? OP.fmtBShort(p.reward.money) : ''].filter(Boolean).join(' · ') : '';
    const lead = u.leader === a.id ? '' : `<div class="muted small">Decide: ${esc((S.A[u.leader] || {}).name || '')}</div>`;
    return `<div class="mission">
      <div class="m-title">${p.mission ? '📌 Misión' : '🧭 Plan'}: ${esc(p.title)}</div>
      <div class="m-row"><span>${phase}</span><span>${Math.round(prog * 100)}%</span></div>
      ${bar(prog, 1, 'gold')}
      <div class="m-row small"><span>⏳ Faltan ${OP.fmtHours(eta)}</span>${reward ? `<span>🎁 ${reward}</span>` : ''}</div>
      ${lead}
    </div>`;
  }

  function progressBlock(a) {
    const S = OP.S;
    if (a.faction !== 'pirate' || a.loc === 'dead') return '';
    const u = S.U[a.unit];
    const ok = (b) => (b ? '<b class="ok">✔</b>' : '<b class="no">✘</b>');
    let html = `<div class="prog"><div class="p-step done">🏝 ${esc(seaName(a.homeSea))} ${ok(true)}</div>`;
    if (a.prog.gl) html += `<div class="p-step done">⛰ Mar Esmeralda ${ok(true)}</div>`;
    else if (u) {
      const c = Sim.paradiseCheck(u);
      html += `<div class="p-step">⛰ Mar Esmeralda: nivel ${Sim.REQ.paradiseLvl} ${ok(c.lvl)} · barco de verdad ${ok(c.ship)} · Compás de Ruta ${ok(c.logpose)}</div>`;
    }
    if (a.prog.nw) html += `<div class="p-step done">🌊 Mar Indómito ${ok(true)}</div>`;
    else if (a.prog.gl && u) {
      const c = Sim.nwCheck(u);
      html += `<div class="p-step">🌊 Mar Indómito: nivel ${Sim.REQ.nwLvl} ${ok(c.lvl)} · ${Sim.REQ.nwIslands} islas del Mar Esmeralda (${u.glVisited.length}) ${ok(c.islands)} · barco recubierto ${ok(c.coated)} · navegante ${ok(c.navigator)} · tripulación nv 25+ ${ok(c.crew)}</div>`;
    } else html += `<div class="p-step muted">🌊 Mar Indómito: primero el Mar Esmeralda</div>`;
    if (u && u.know.road.length) html += `<div class="p-step">🗿 Monolitos de Ruta: ${u.know.road.length}/4${u.know.lt ? ' · 👑 ¡Saben llegar a Isla Postrera!' : ''}</div>`;
    return html + '</div>';
  }

  function charPanel(a) {
    const S = OP.S;
    const pw = Math.round(Sim.basePower(a));
    const F = a.fruit >= 0 ? OP.FRUITS[a.fruit] : null;
    const haki = ['Observación', 'Armadura', 'Rey'].filter((_, i) => a.haki[i]);
    const T = OP.TALENTS[a.talent];
    const fac = a.faction === 'pirate' ? `<span class="tag pirate">☠ Pirata</span>` : `<span class="tag marine">⚓ ${esc(OP.RANKS[a.rank])}</span>`;
    const statMax = Math.max(60, a.str, a.spd);
    return `<div class="pcard">
      <div class="phead">
        <img class="portrait" src="${OP.Sprites.portraitURL(a, a.faction === 'marine' ? '#24476e' : '#5b2a22')}" alt="">
        <div class="pinfo">
          <div class="pname">${a.isPlayer ? '⭐ ' : ''}${esc(a.name)}</div>
          ${a.epithet ? `<div class="pepi">«${esc(a.epithet)}»</div>` : ''}
          <div>${fac} ${a.isPlayer ? '<span class="tag me">Tu personaje</span>' : ''}</div>
          <div class="pstatus">${locText(a)}</div>
        </div>
      </div>
      <div class="lvl-row"><b>Nivel ${a.lvl}</b><span class="muted small">${Math.floor(a.xp)} / ${Sim.xpNeed(a.lvl)} EXP</span></div>
      ${bar(a.xp, Sim.xpNeed(a.lvl), 'xp')}
      <div class="stats">
        <div class="st"><span>💪 Fuerza</span><b>${a.str}</b>${bar(a.str, statMax, 'str')}</div>
        <div class="st"><span>💨 Velocidad</span><b>${a.spd}</b>${bar(a.spd, statMax, 'spd')}</div>
        <div class="st"><span>❤️ Salud</span><b>${Math.round(a.hp)}/${a.maxHp}</b>${bar(a.hp, a.maxHp, 'hp')}</div>
        <div class="st"><span>🔥 Poder</span><b>${OP.dots(pw)}</b></div>
      </div>
      <div class="kv"><span>Talento</span><b title="${esc(T.desc)}">${T.icon} ${esc(a.talent)}</b></div>
      ${a.faction === 'pirate' ? `<div class="kv"><span>Recompensa</span><b class="bounty">${a.bounty ? OP.fmtB(a.bounty) : 'Sin recompensa'}</b></div>` : `<div class="kv"><span>Rango</span><b>${esc(OP.RANKS[a.rank])}</b> <span class="muted small">(méritos ${Math.round(a.merit)})</span></div>`}
      <div class="kv"><span>${a.faction === 'pirate' ? 'Tripulación' : 'Unidad'}</span><b>${crewLine(a)}</b></div>
      <div class="kv"><span>Isla</span><b>${a.loc === 'island' || a.loc === 'prison' ? `<a data-isl="${a.isl}">${esc(OP.M.islands[a.isl].name)}</a>` : a.loc === 'ship' ? 'En el mar' : '—'}</b></div>
      ${F ? `<div class="kv"><span>Fruta</span><b title="${esc(F.ability)}">🍎 ${esc(F.name)} <span class="muted">(${F.type}, ${OP.RARITY[F.rarity]})</span></b></div>` : ''}
      ${haki.length ? `<div class="kv"><span>Aura</span><b>${haki.join(', ')}</b></div>` : ''}
      <div class="kv"><span>Edad</span><b>${a.age} años</b> · <span class="muted">${esc(persText(a.pers))}</span></div>
      <div class="kv"><span>Sueño</span><b>${esc((a.faction === 'pirate' ? OP.DREAMS_PIRATE : OP.DREAMS_MARINE)[a.dream] || a.dream)}</b></div>
      ${a.money ? `<div class="kv"><span>Dinero</span><b>${OP.fmtB(a.money)}</b></div>` : ''}
      ${missionBlock(a)}
      ${progressBlock(a)}
      <div class="btns">
        <button class="vivre-btn" data-act="vivre">TARJETA VIVRE</button>
        <button data-act="follow" class="${UI.follow ? 'on' : ''}">${UI.follow ? '📌 Siguiendo' : '🎥 Seguir'}</button>
        ${a.faction === 'pirate' && a.bounty ? '<button data-act="poster">📜 Cartel</button>' : ''}
      </div>
      <h4>📖 Diario</h4>
      <ul class="log">${a.log.slice(0, 8).map((l) => `<li><span class="muted">${OP.fmtDay(l.d)}</span> ${esc(l.t)}</li>`).join('') || '<li class="muted">Todavía no ha pasado nada.</li>'}</ul>
    </div>`;
  }

  function islandPanel(I) {
    const S = OP.S;
    const st = S.isl[I.idx];
    const hidden = I.hidden && !st.discovered;
    const occ = Sim.occupants(I.idx);
    const docked = S.ships.filter((s) => s.isl === I.idx && s.state === 'docked');
    const g = S.U[st.guardian];
    let pon = '';
    if (I.poneglyph === 'historic') pon = '🗿 Monolito histórico';
    if (I.poneglyph === 'road') pon = '🗿 Monolito de Ruta';
    if (I.id === S.road4 && S.road4Found) pon = '🗿 Monolito de Ruta (el cuarto, descubierto)';
    const stars = '★'.repeat(Math.ceil(I.danger / 2)) + '☆'.repeat(5 - Math.ceil(I.danger / 2));
    const prisoners = S.agents.filter((a) => a.loc === 'prison' && a.isl === I.idx);
    return `<div class="icard">
      <div class="iname">${I.base ? '⚓ ' : ''}${hidden ? 'Isla Postrera ???' : esc(I.name)}</div>
      <div class="muted">${esc(seaName(I.sea))} · ${biomeName(I.biome)}</div>
      <div class="kv"><span>Peligro</span><b class="danger">${stars}</b> <span class="muted small">(${I.danger}/10)</span></div>
      <div class="kv"><span>Población</span><b>${hidden ? '???' : OP.dots(st.pop)}</b></div>
      <div class="kv"><span>Asentamientos</span><b>${hidden ? '???' : I.towns.map(esc).join(', ')}</b></div>
      <div class="kv"><span>Rasgos</span><b>${I.traits.map(esc).join(' · ')}</b></div>
      ${I.base ? `<div class="kv"><span>Base</span><b>${esc(I.base)}</b> ${st.baseHp <= 0 ? '<b class="no">DESTRUIDA</b>' : bar(st.baseHp, st.baseMax, 'hp')}</div>` : ''}
      ${I.train ? `<div class="kv"><span>Entrenamiento</span><b>🥋 ${esc(I.train.label)}</b></div>` : ''}
      ${I.shipyard ? '<div class="kv"><span>Astillero</span><b>🔨 Venden el navío legendario</b></div>' : ''}
      ${I.coating ? '<div class="kv"><span>Recubrimiento</span><b>🫧 Para bajar a la Isla Coralina</b></div>' : ''}
      ${I.logpose ? '<div class="kv"><span>Tienda</span><b>🧭 Compás de Ruta</b></div>' : ''}
      ${I.hospital ? '<div class="kv"><span>Médicos</span><b>🩺 Curan el doble de rápido</b></div>' : ''}
      ${pon ? `<div class="kv"><span>Historia</span><b>${pon}</b></div>` : ''}
      ${st.fruitRumor && st.fruit >= 0 ? '<div class="kv"><span>Rumor</span><b>🍎 Dicen que aquí hay una Fruta Maldita</b></div>' : ''}
      ${g ? `<div class="kv"><span>Territorio de</span><b>👑 <a data-crew="${g.id}">${esc(g.name)}</a></b></div>` : ''}
      ${S.time - st.attackedAt < 72 ? '<div class="kv"><b class="no">🔥 Atacada hace poco</b></div>' : ''}
      <h4>👥 Aquí ahora (${occ.length})</h4>
      <div class="chips">${occ.slice(0, 40).map((a) => `<a class="chip ${a.faction}" data-sel="${a.id}">${a.faction === 'pirate' ? '☠' : '⚓'} ${esc(a.name)} <small>nv${a.lvl}</small></a>`).join('') || '<span class="muted">Nadie importante.</span>'}</div>
      ${docked.length ? `<h4>⛵ Barcos en el puerto</h4><div class="chips">${docked.map((s) => { const u = S.U[s.unit]; return `<a class="chip" ${u ? `data-sel="${u.leader}"` : ''}>${esc(s.name)} <small>${OP.SHIPS[s.type].name}</small></a>`; }).join('')}</div>` : ''}
      ${prisoners.length ? `<h4>⛓ Presos (${prisoners.length})</h4><div class="chips">${prisoners.slice(0, 30).map((a) => `<a class="chip pirate" data-sel="${a.id}">${esc(a.name)}${a.bounty ? ' <small>' + OP.fmtBShort(a.bounty) + '</small>' : ''}</a>`).join('')}</div>` : ''}
    </div>`;
  }
  function biomeName(b) {
    return ({ tropical: 'Isla tropical', forest: 'Bosques', winter: 'Invierno eterno', desert: 'Desierto', city: 'Ciudad', canals: 'Ciudad de canales', fortress: 'Fortaleza',
      prison: 'Prisión', volcanic: 'Fuego y hielo', prehistoric: 'Jungla prehistórica', sky: 'Isla del cielo', ghost: 'Isla fantasma', mangrove: 'Manglares gigantes',
      sakura: 'Cerezos y montañas', candy: 'Islas de dulce', future: 'Isla futurista', elephant: 'Sobre un elefante gigante', toy: 'Reino de juguetes', giants: 'Tierra de gigantes',
      ruins: 'Ruinas quemadas', whiteruins: 'Ciudad blanca en ruinas', wasteland: 'Vertedero', jungle: 'Selva', bubble: 'Burbuja bajo el mar', mountain: 'Montañosa',
      legend: 'Isla legendaria', wood: 'Restaurante flotante', cactus: 'Montañas cactus', rocky: 'Cabo rocoso' })[b] || b;
  }

  // ======================================================================
  //  VENTANAS (modales)
  // ======================================================================
  UI.openModal = function (html, cls) {
    const m = $('#modal');
    m.className = 'modal ' + (cls || '');
    m.innerHTML = `<div class="modal-box ${cls || ''}"><button class="close" data-close="1" title="Cerrar (Esc)">✕</button>${html}</div>`;
    m.classList.remove('hidden');
  };
  UI.closeModal = function () { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; UI.modalKind = null; };

  // ---------- Tarjeta Vivre ----------
  UI.openVivre = function (a) {
    const S = OP.S;
    const friend = Sim.bestFriend(a);
    const rival = Sim.rival(a);
    const burn = a.loc === 'dead' ? 1 : Math.max(0, 1 - a.hp / a.maxHp);
    const seed = a.id % 4;
    const isl = a.visited.map((i) => OP.M.islands[i]).filter(Boolean);
    const st = a.st;
    const fights = st.fights;
    const best = a.best;
    const u = S.U[a.unit];
    const where = (() => {
      if (a.loc === 'dead') return 'La tarjeta se ha consumido por completo.';
      const [x, y] = OP.Render.agentPos(a);
      const z = Sim.zoneOfPos(x, y);
      let near = null, bd = Infinity;
      for (const I of OP.M.islands) { if (I.hidden) continue; const d = Math.hypot(I.x - x, I.y - y); if (d < bd) { bd = d; near = I; } }
      return 'La tarjeta tira hacia ' + (near ? esc(near.name) : '???') + ' (' + esc(seaName(a.loc === 'island' ? OP.M.islands[a.isl].sea : z)) + ')';
    })();
    const mini = (b) => (b ? `<span class="vv-person"><img src="${OP.Sprites.portraitURL(b, b.faction === 'marine' ? '#24476e' : '#5b2a22')}" alt=""><a data-sel="${b.id}">${esc(b.name)}</a>${b.loc === 'dead' ? ' <small>(✝)</small>' : ''}</span>` : '<span class="muted">Nadie todavía</span>');
    const facLine = a.faction === 'pirate'
      ? '☠ Pirata' + (u && !u.solo ? ' — ' + esc(a.role) + ' de los ' + esc(u.name) : ' solitario')
      : '⚓ ' + esc(OP.RANKS[a.rank]) + ' de la Marina';
    const statRow = (label, v, max) => `<div class="vv-stat"><span>${label}</span><div class="vv-bar"><i style="width:${Math.min(100, v / max * 100).toFixed(0)}%"></i></div><b>${v}</b></div>`;
    const maxS = Math.max(80, a.str, a.spd);
    const html = `<div class="vivre v${seed}" style="--burn:${burn.toFixed(2)}">
      <div class="vv-paper">
        <i class="vv-orn tl"></i><i class="vv-orn tr"></i><i class="vv-orn bl"></i><i class="vv-orn br"></i>
        <div class="vv-top">~ TARJETA VIVRE ~</div>
        <div class="vv-main">
          <div class="vv-left">
            <div class="vv-frame"><img src="${OP.Sprites.portraitURL(a, '#e8d5a8')}" alt="Retrato de ${esc(a.name)}"></div>
            <div class="vv-level">NIVEL ${a.lvl}</div>
            <div class="vv-talent">${OP.TALENTS[a.talent].icon} ${esc(a.talent)}</div>
          </div>
          <div class="vv-right">
            <div class="vv-name">${esc(a.name)}</div>
            ${a.epithet ? `<div class="vv-epi">«${esc(a.epithet)}»</div>` : ''}
            <div class="vv-fac">${facLine}</div>
            ${statRow('Fuerza', a.str, maxS)}${statRow('Velocidad', a.spd, maxS)}${statRow('Salud', a.maxHp, Math.max(400, a.maxHp))}
            <div class="vv-money">${a.faction === 'pirate' ? (a.bounty ? 'Recompensa: <b>' + OP.fmtB(a.bounty) + '</b>' : 'Aún sin recompensa') : 'Méritos: <b>' + Math.round(a.merit) + '</b>'}</div>
            ${a.fruit >= 0 ? `<div class="vv-money">🍎 ${esc(OP.FRUITS[a.fruit].name)}</div>` : ''}
          </div>
        </div>
        <div class="vv-badges">${a.badges.length ? a.badges.map((b) => { const [ic, lb] = badgeInfo(b); return `<span class="vv-badge" title="${esc(lb)}">${ic}<small>${esc(lb)}</small></span>`; }).join('') : '<span class="muted">Sin insignias todavía</span>'}</div>
        <div class="vv-grid">
          <div><h4>Mejor amigo</h4>${mini(friend)}</div>
          <div><h4>Rival</h4>${mini(rival)}</div>
          <div class="wide"><h4>Mejor momento</h4>${best ? `${esc(best.t)} <small class="muted">(${OP.fmtDay(best.d)})</small>` : '<span class="muted">Su gran momento aún está por llegar</span>'}</div>
          <div class="wide"><h4>Islas visitadas (${isl.length})</h4><div class="vv-isl">${isl.map((I) => `<span>${esc(I.name)}</span>`).join('')}</div></div>
          <div><h4>Combates</h4><b>${fights}</b> <small>(${st.wins} ganados · ${st.losses} perdidos)</small></div>
          <div><h4>${a.faction === 'pirate' ? 'Tesoros y misiones' : 'Capturas y misiones'}</h4><b>${a.faction === 'pirate' ? st.treasures : st.caps}</b> · <b>${st.missions}</b> misiones</div>
          <div class="wide"><h4>Sueño</h4>${esc((a.faction === 'pirate' ? OP.DREAMS_PIRATE : OP.DREAMS_MARINE)[a.dream] || a.dream)}</div>
          <div class="wide vv-quote">“${esc(a.quote)}”</div>
        </div>
        <div class="vv-foot">${where} · Mar de origen: ${esc(seaName(a.homeSea))} · ${a.age} años</div>
        <div class="vv-burn"></div>
      </div>
    </div>`;
    UI.openModal(html, 'vivre-modal');
    UI.modalKind = 'vivre';
  };

  // ---------- Carteles ----------
  function posterHTML(a) {
    const S = OP.S;
    const u = S.U[a.unit];
    let stamp = '';
    if (a.loc === 'dead') stamp = '<div class="stamp dead">MUERTO</div>';
    else if (a.loc === 'prison' || a.carriedBy) stamp = '<div class="stamp caught">CAPTURADO</div>';
    else if (a.loc === 'retired') stamp = '<div class="stamp caught">RETIRADO</div>';
    return `<div class="poster" data-sel="${a.id}">
      <div class="po-title">SE BUSCA</div>
      <div class="po-img"><img src="${OP.Sprites.portraitURL(a, '#d9c08a')}" alt=""></div>
      <div class="po-dead">VIVO O MUERTO</div>
      <div class="po-name">${esc(a.name.toUpperCase())}</div>
      <div class="po-bounty">฿ ${OP.dots(a.bounty)}-</div>
      <div class="po-meta">☠ Pirata${u && !u.solo ? ' · ' + esc(u.name) : ''}</div>
      <div class="po-state">${a.loc === 'dead' ? 'Fallecido' : a.loc === 'prison' ? 'Preso en ' + esc(OP.M.islands[a.isl].name) : a.carriedBy ? 'Prisionero' : 'En libertad'}</div>
      <div class="po-foot">MARINE</div>
      ${stamp}
    </div>`;
  }
  UI.openWanted = function (filter) {
    UI.wantedFilter = filter || UI.wantedFilter || 'free';
    const S = OP.S;
    let list = S.agents.filter((a) => a.faction === 'pirate' && a.bounty > 0);
    if (UI.wantedFilter === 'free') list = list.filter((a) => a.loc === 'island' || a.loc === 'ship' && !a.carriedBy);
    if (UI.wantedFilter === 'caught') list = list.filter((a) => a.loc === 'prison' || a.carriedBy);
    if (UI.wantedFilter === 'dead') list = list.filter((a) => a.loc === 'dead');
    list.sort((a, b) => b.bounty - a.bounty);
    const tabs = [['free', 'En libertad'], ['caught', 'Capturados'], ['dead', 'Muertos'], ['all', 'Todos']].map(([k, l]) => `<button class="tab ${UI.wantedFilter === k ? 'on' : ''}" data-wanted="${k}">${l}</button>`).join('');
    UI.openModal(`<h2>📜 Carteles de SE BUSCA</h2><div class="tabs">${tabs}</div><p class="muted small">Las recompensas suben cuando derrotan marines, atacan islas, destruyen bases o vencen a piratas famosos. Toca un cartel para ver al pirata.</p>
      <div class="posters">${list.slice(0, 60).map(posterHTML).join('') || '<p class="muted">No hay carteles aquí.</p>'}</div>`, 'wide');
    UI.modalKind = 'wanted';
  };
  UI.openPoster = function (a) {
    UI.openModal(`<div class="single-poster">${posterHTML(a)}</div>`, 'poster-modal');
  };

  // ---------- Tripulaciones ----------
  UI.openCrews = function (focus) {
    const S = OP.S;
    const list = S.units.filter((u) => u.faction === 'pirate' && !u.solo && S.A[u.leader]);
    list.sort((a, b) => Sim.unitBounty(b) - Sim.unitBounty(a));
    const one = (u) => {
      const L = S.A[u.leader];
      const sh = S.SH[u.ship];
      const emp = S.emperors.indexOf(u.id) >= 0;
      const loc = u.isl >= 0 ? OP.M.islands[u.isl].name : 'en el mar';
      const ms = u.members.map((id) => S.A[id]).filter(Boolean);
      return `<div class="crew ${focus === u.id ? 'focus' : ''}" id="crew-${u.id}">
        <div class="crew-head"><img class="flag" src="${OP.Sprites.flagURL(u.flag)}" alt=""><div><b>${emp ? '👑 ' : ''}${esc(u.name)}</b><div class="muted small">Capitán: <a data-sel="${L.id}">${esc(L.name)}</a> · 📍 ${esc(loc)}</div></div>
        <div class="crew-b"><b class="bounty">${OP.fmtBShort(Sim.unitBounty(u))}</b><small>recompensa total</small></div></div>
        <div class="crew-body">
          <div class="small">⛵ ${sh ? esc(sh.name) + ' (' + OP.SHIPS[sh.type].name + ', ' + Math.round(sh.hp / sh.maxHp * 100) + '%' + (sh.coated ? ', recubierto' : '') + ')' : 'Sin barco'} · ⭐ Reputación ${Math.round(u.fame)}${u.grunts ? ' · 🗡 ' + u.grunts + ' soldados' : ''}</div>
          ${u.plan ? `<div class="small">📌 ${esc(u.plan.title)}</div>` : ''}
          <div class="chips">${ms.map((m) => `<a class="chip pirate ${m.loc === 'prison' ? 'jail' : ''}" data-sel="${m.id}">${esc(m.name)} <small>${esc(m.role)} · nv${m.lvl}${m.loc === 'prison' ? ' · ⛓' : ''}</small></a>`).join('')}</div>
          ${u.allies.length ? `<div class="small">🤝 Aliados: ${u.allies.map((id) => S.U[id] ? esc(S.U[id].name) : '').filter(Boolean).join(', ')}</div>` : ''}
          ${u.enemies.length ? `<div class="small">💢 Enemigos: ${u.enemies.map((id) => S.U[id] ? esc(S.U[id].name) : '').filter(Boolean).join(', ')}</div>` : ''}
        </div></div>`;
    };
    UI.openModal(`<h2>🏴‍☠️ Tripulaciones (${list.length})</h2><p class="muted small">Ordenadas por recompensa total. Los 👑 son los Cuatro Emperadores del Mar.</p><div class="crews">${list.slice(0, 80).map(one).join('')}</div>`, 'wide');
    UI.modalKind = 'crews';
    if (focus) setTimeout(() => { const el = document.getElementById('crew-' + focus); if (el) el.scrollIntoView({ block: 'center' }); }, 30);
  };

  // ---------- Marina ----------
  UI.openMarine = function () {
    const S = OP.S;
    const ms = S.agents.filter((a) => a.faction === 'marine' && (a.loc === 'island' || a.loc === 'ship'));
    const byRank = OP.RANKS.map((r, i) => ms.filter((a) => a.rank === i));
    const top = [9, 8, 7].map((i) => `<div class="rank-row"><b>${OP.RANKS[i]}</b> ${byRank[i].map((a) => `<a class="chip marine" data-sel="${a.id}">${esc(a.name)}${a.epithet ? ' <small>«' + esc(a.epithet) + '»</small>' : ''}</a>`).join('') || '<span class="muted">Vacante</span>'}</div>`).join('');
    const counts = OP.RANKS.map((r, i) => `<span class="pill">${r}: <b>${byRank[i].length}</b></span>`).join('');
    const bases = OP.M.islands.filter((I) => I.base).map((I) => {
      const st = S.isl[I.idx];
      const g = S.U[st.garrison];
      const cmd = g && S.A[g.leader];
      const squads = S.units.filter((u) => u.faction === 'marine' && !u.garrison && u.base === I.idx);
      return `<div class="base"><b>⚓ ${esc(I.base)}</b> <span class="muted small">(${esc(I.name)}, ${esc(seaName(I.sea))})</span> ${st.baseHp <= 0 ? '<b class="no">DESTRUIDA</b>' : bar(st.baseHp, st.baseMax, 'hp')}
        <div class="small">Al mando: ${cmd ? `<a data-sel="${cmd.id}">${esc(OP.RANKS[cmd.rank] + ' ' + cmd.name)}</a>` : '—'} · Guarnición: ${g ? Sim.unitMembers(g).length : 0} · Unidades con barco: ${squads.length}</div>
        ${squads.length ? `<div class="chips">${squads.map((u) => `<a class="chip marine" data-sel="${u.leader}">${esc(u.name)}${u.plan ? ' <small>' + esc(u.plan.title) + '</small>' : ''}</a>`).join('')}</div>` : ''}</div>`;
    }).join('');
    UI.openModal(`<h2>⚓ La Marina</h2><div class="pills">${counts}</div>${top}<h3>Bases</h3><div class="bases">${bases}</div>`, 'wide');
    UI.modalKind = 'marine';
  };

  // ---------- Frutas ----------
  UI.openFruits = function () {
    const S = OP.S;
    const rows = OP.FRUITS.map((F) => {
      const fr = S.fruits[F.id];
      let state = '<span class="muted">Nadie la ha visto</span>';
      if (fr.state === 'owned' && S.A[fr.owner]) state = `Comida por <a data-sel="${fr.owner}">${esc(S.A[fr.owner].name)}</a>`;
      else if (fr.state === 'hidden') state = S.isl[fr.isl] && S.isl[fr.isl].fruitRumor ? `🔎 Rumor: en ${esc(OP.M.islands[fr.isl].name)}` : '❓ Escondida en algún lugar';
      return `<div class="fruit r${F.rarity}"><div class="f-name">🍎 ${esc(F.name)}</div><div class="small"><b>${F.type}</b> · ${OP.RARITY[F.rarity]} · poder x${OP.RARITY_MULT[F.rarity]}</div><div class="small">${esc(F.ability)}</div><div class="small">${state}</div></div>`;
    }).join('');
    UI.openModal(`<h2>🍎 Frutas Malditas</h2><p class="muted small">Son muy raras. Quien come una gana un poder enorme pero ya no puede nadar: si su barco se hunde, puede ahogarse. Cuando su dueño muere, la fruta vuelve a aparecer en algún lugar del mundo.</p><div class="fruits">${rows}</div>`, 'wide');
    UI.modalKind = 'fruits';
  };

  // ---------- Islas ----------
  UI.openIslands = function () {
    const S = OP.S;
    const groups = ['east', 'west', 'north', 'south', 'paradise', 'sky', 'calm', 'deep', 'newworld'].map((sea) => {
      const list = OP.M.islands.filter((I) => I.sea === sea);
      if (!list.length) return '';
      return `<div class="isl-group"><h3>${esc(seaName(sea))}</h3>${list.map((I) => `<button class="isl-btn" data-goisl="${I.idx}">${I.base ? '⚓ ' : ''}${I.hidden && !S.isl[I.idx].discovered ? 'Isla Postrera ???' : esc(I.name)} <small>${'★'.repeat(Math.ceil(I.danger / 2))}</small></button>`).join('')}</div>`;
    }).join('');
    UI.openModal(`<h2>🗺️ Islas del mundo</h2><p class="muted small">Toca una isla para ir a verla. Las estrellas marcan el peligro.</p><div class="isl-groups">${groups}</div>`, 'wide');
    UI.modalKind = 'islands';
  };

  // ---------- Periódico ----------
  UI.openPaper = function () {
    const S = OP.S;
    const recent = S.news.filter((n) => S.time - n.t < 24 * 4);
    const pool = (recent.length > 5 ? recent : S.news.slice(0, 30)).slice();
    pool.sort((a, b) => b.imp - a.imp || b.t - a.t);
    const head = pool[0];
    const subs = pool.slice(1, 4);
    const col = (cats) => S.news.filter((n) => cats.indexOf(n.cat) >= 0).slice(0, 6).map((n) => `<li data-news="${n.id}">${NEWS_ICON[n.cat] || '•'} ${esc(n.text)}</li>`).join('') || '<li class="muted">Sin noticias.</li>';
    UI.openModal(`<div class="paper">
      <div class="paper-top"><span>Precio: 100 ฿</span><span>🐦 Repartido por las gaviotas</span><span>${OP.fmtDay(S.time)}</span></div>
      <div class="paper-name">EL PERIÓDICO DEL MUNDO</div>
      ${head ? `<div class="paper-head" data-news="${head.id}">${esc(head.text)}</div>` : ''}
      <div class="paper-subs">${subs.map((n) => `<div data-news="${n.id}">${NEWS_ICON[n.cat] || ''} ${esc(n.text)}</div>`).join('')}</div>
      <div class="paper-cols">
        <div><h4>💰 Recompensas</h4><ul>${col(['bounty'])}</ul></div>
        <div><h4>⚓ Marina y capturas</h4><ul>${col(['marine', 'capture'])}</ul></div>
        <div><h4>🌊 Mares y piratas</h4><ul>${col(['crew', 'attack', 'sea', 'pirate'])}</ul></div>
        <div><h4>🗿 Misterios</h4><ul>${col(['fruit', 'poneglyph', 'laughtale', 'world'])}</ul></div>
      </div></div>`, 'paper-modal');
    UI.modalKind = 'paper';
  };

  // ---------- Guardar y cargar ----------
  UI.openSaves = function (fromStart) {
    const list = OP.Save.list();
    const rows = list.map((s) => `<div class="slot">
      <div><b>${s.slot === 'auto' ? '🔄 Guardado automático' : '💾 Ranura ' + s.slot}</b><div class="small muted">${s.meta ? esc(s.meta.player) + ' · ' + OP.fmtTime(s.meta.time) + ' · guardado ' + new Date(s.meta.savedAt).toLocaleString('es-ES') : 'Vacía'}</div></div>
      <div class="slot-btns">
        ${!fromStart && s.slot !== 'auto' ? `<button data-save="${s.slot}">Guardar aquí</button>` : ''}
        ${s.meta ? `<button data-load="${s.slot}">Cargar</button>` : ''}
        ${s.meta && s.slot !== 'auto' && !fromStart ? `<button class="danger" data-del="${s.slot}">Borrar</button>` : ''}
      </div></div>`).join('');
    UI.openModal(`<h2>💾 Partidas</h2><p class="muted small">Las partidas se guardan en este navegador (Chrome). También se guarda sola cada 2 minutos.</p><div class="slots">${rows}</div><p id="save-msg" class="small"></p>`, 'saves-modal');
    UI.modalKind = 'saves';
  };
  UI.loadSlot = function (slot) {
    const r = OP.Save.load(slot);
    if (!r.ok) { UI.toast('⚠️ ' + r.msg); return false; }
    OP.Main.enterGame();
    UI.toast('📂 Partida cargada: ' + OP.fmtTime(OP.S.time));
    return true;
  };

  UI.openHelp = function () {
    UI.openModal(`<h2>❓ Cómo se juega</h2>
      <p>Esto es un <b>simulador</b>: los personajes viven solos. Tú no los controlas, solo miras cómo navegan, entrenan, pelean, forman tripulaciones y persiguen sus sueños.</p>
      <ul class="help">
        <li>🖱️ <b>Arrastra</b> el mapa para moverte y usa la <b>rueda</b> para acercarte o alejarte.</li>
        <li>👆 <b>Toca</b> un personaje, un barco o una isla para ver su información.</li>
        <li>⭐ El botón con tu retrato (arriba) te lleva a <b>tu personaje</b>. Tecla <b>M</b>.</li>
        <li>⏸ <b>Espacio</b> pausa. Teclas <b>1 2 3 4</b> = velocidad x1, x2, x5, x10.</li>
        <li>🎥 <b>Seguir</b> hace que la cámara vaya detrás del personaje elegido.</li>
        <li>💳 <b>TARJETA VIVRE</b>: la historia de cada personaje. Se quema cuando su dueño está herido.</li>
        <li>🧭 Para entrar en la Ruta Mayor hace falta nivel ${Sim.REQ.paradiseLvl}, un barco de verdad y un Compás de Ruta. Para el Mar Indómito: nivel ${Sim.REQ.nwLvl}, haber visto ${Sim.REQ.nwIslands} islas del Mar Esmeralda, barco recubierto en las Burbujas, navegante y tripulantes de nivel 25 o más.</li>
        <li>🗿 Quien copie los 4 Monolitos de Ruta y tenga un arqueólogo sabrá llegar a Isla Postrera.</li>
      </ul>
      <label class="check"><input type="checkbox" id="opt-night" ${UI.settings.night ? 'checked' : ''}> Mostrar el día y la noche</label>`, 'help-modal');
    UI.modalKind = 'help';
  };

  // ======================================================================
  //  NOTICIAS
  // ======================================================================
  let lastNewsId = -1;
  UI.renderNews = function (force) {
    const S = OP.S;
    const top = S.news[0];
    if (!force && top && top.id === lastNewsId) return;
    lastNewsId = top ? top.id : -1;
    const f = UI.settings.newsFilter;
    const list = S.news.filter((n) => f === 'all' || n.cat === f || (f === 'capture' && n.cat === 'death') || (f === 'world' && (n.cat === 'laughtale' || n.cat === 'attack'))).slice(0, 60);
    $('#news-list').innerHTML = list.map((n) => `<li class="imp${n.imp}" data-news="${n.id}"><span class="n-ic">${NEWS_ICON[n.cat] || '•'}</span><span class="n-t"><small>${OP.fmtDay(n.t)}</small> ${esc(n.text)}</span></li>`).join('');
  };
  UI.buildNews = function () {
    $('#news-filters').innerHTML = NEWS_FILTERS.map(([k, l]) => `<button data-nf="${k}" class="${UI.settings.newsFilter === k ? 'on' : ''}" title="${k}">${l}</button>`).join('');
  };
  OP.onNews = function (n) {
    if (!UI.started) return;
    const S = OP.S;
    const p = S.A[S.playerId];
    const mine = p && n.a.indexOf(p.id) >= 0;
    if (n.imp >= 3 || mine) {
      UI.toast((NEWS_ICON[n.cat] || '') + ' ' + n.text, n, mine);
      if (n.isl >= 0) { const I = OP.M.islands[n.isl]; OP.Render.ping(I.x, I.y); }
    }
  };
  UI.toast = function (text, n, mine) {
    const box = $('#toasts');
    while (box.children.length >= 3) box.removeChild(box.firstChild);
    const d = document.createElement('div');
    d.className = 'toast' + (mine ? ' mine' : '');
    d.textContent = text;
    if (n) d.dataset.news = n.id;
    box.appendChild(d);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 600); }, mine ? 7000 : 5500);
  };
  function focusNews(id) {
    const S = OP.S;
    const n = S.news.find((x) => x.id === +id);
    if (!n) return;
    const a = n.a.map((x) => S.A[x]).find(Boolean);
    UI.closeModal();
    if (a) UI.select(a, true);
    else if (n.isl >= 0) UI.selectIsland(OP.M.islands[n.isl], true);
  }

  OP.onPlayerDeath = function (a) {
    UI.toast('✝️ Tu personaje, ' + a.name + ', ha muerto.', null, true);
    setTimeout(() => {
      UI.openModal(`<h2>✝️ ${esc(a.name)} ha muerto</h2><p>${esc(a.name)} murió ${esc(a.deathCause || '')}. Su leyenda queda en su Tarjeta Vivre.</p>
        <div class="btns"><button data-act="vivre-of" data-id="${a.id}">Ver su Tarjeta Vivre</button><button data-act="respawn">⚓ Crear un personaje nuevo</button><button data-close="1">Seguir mirando el mundo</button></div>`);
    }, 300);
  };

  // ======================================================================
  //  CLICS
  // ======================================================================
  function onClick(e) {
    const t = e.target;
    if (t.closest('#start')) { onStartClick(e); return; }
    const b = t.closest('[data-close],[data-sel],[data-crew],[data-isl],[data-act],[data-open],[data-speed],[data-wanted],[data-news],[data-nf],[data-save],[data-load],[data-del],[data-goisl]');
    if (!b) return;
    const d = b.dataset;
    if (d.close) { UI.closeModal(); return; }
    if (d.speed) { if (d.speed === 'pause') UI.paused = !UI.paused; else { UI.speed = +d.speed; UI.paused = false; } UI.updateTopbar(); return; }
    if (d.open) {
      ({ wanted: () => UI.openWanted(), crews: () => UI.openCrews(), marine: UI.openMarine, fruits: UI.openFruits, islands: UI.openIslands, paper: UI.openPaper, saves: () => UI.openSaves(false), help: UI.openHelp })[d.open]();
      return;
    }
    if (d.wanted) { UI.openWanted(d.wanted); return; }
    if (d.sel) { const a = OP.S.A[d.sel]; if (a) { if (!b.closest('#side')) UI.closeModal(); UI.select(a, true); } return; }
    if (d.crew) { UI.openCrews(+d.crew); return; }
    if (d.isl != null && d.isl !== '') { UI.selectIsland(OP.M.islands[+d.isl], true); return; }
    if (d.goisl) { UI.closeModal(); UI.selectIsland(OP.M.islands[+d.goisl], true); return; }
    if (d.news) { focusNews(d.news); return; }
    if (d.nf) { UI.settings.newsFilter = d.nf; UI.buildNews(); UI.renderNews(true); return; }
    if (d.save) {
      const r = OP.Save.save(d.save);
      UI.openSaves(false);
      UI.toast(r.ok ? '💾 Partida guardada en la ranura ' + d.save : '⚠️ ' + r.msg);
      return;
    }
    if (d.load) { UI.closeModal(); UI.loadSlot(d.load); return; }
    if (d.del) { OP.Save.remove(d.del); UI.openSaves(false); return; }
    if (d.act) {
      const a = UI.sel;
      if (d.act === 'vivre' && a) UI.openVivre(a);
      if (d.act === 'vivre-of') { const x = OP.S.A[d.id]; if (x) UI.openVivre(x); }
      if (d.act === 'follow') { UI.follow = !UI.follow; UI.renderPanel(true); }
      if (d.act === 'poster' && a) UI.openPoster(a);
      if (d.act === 'respawn') { UI.closeModal(); creator.app = null; creator.sea = ''; creator.island = ''; UI.showCreator(true); }
    }
  }
  document.addEventListener('click', onClick);
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'opt-night') UI.settings.night = e.target.checked;
  });

  UI.goPlayer = function () {
    const S = OP.S;
    const p = S.A[S.playerId];
    if (p) UI.select(p, true);
  };
})();
