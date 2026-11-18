/* MILESDEPIRATAS (online) - arranque, bucle principal, movimiento (WASD), controles y dibujo de jugadores */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const Net = OP.Net, UI = OP.UI, MMO = OP.MMO;
  const $ = (s) => document.querySelector(s);
  const Main = (OP.Main = { terrainReady: false });
  let running = false, last = 0, uiT = 0, renderInit = false;
  const keys = new Set();
  let sentDx = 0, sentDy = 0, nextAtk = 0, lastSend = 0;
  const pred = { x: 0, y: 0, boat: '', wcls: 1, faction: 'pirate', lvl: 1, talent: '', ships: ['bote'], ready: false };
  const fx = [];

  // ======================================================================
  //  ARRANQUE
  // ======================================================================
  function boot() {
    if (Net.token) UI.showConnecting('Preparando los mares...'); else UI.showLogin('login');
    setTimeout(() => {
      try {
        OP.Map.build();
        Main.terrainReady = true;
        const m = $('#loading-msg'); if (m) m.textContent = '';
        if (Net.token) Main.afterAuth().catch(() => UI.showLogin('login'));
      } catch (e) { console.error(e); UI.showConnecting('⚠️ No se pudo crear el mundo: ' + e.message); }
    }, 30);
  }
  const waitTerrain = () => new Promise((res) => { const t = setInterval(() => { if (Main.terrainReady) { clearInterval(t); res(); } }, 60); });

  Main.afterAuth = async function () {
    await waitTerrain();
    let info;
    try { info = await Net.meInfo(); } catch (e) {
      if (e.status === 401) { Net.forget(); UI.showLogin('login', 'Tu sesión ha caducado. Vuelve a entrar.'); return; }
      UI.showConnecting('⚠️ No hay conexión con el servidor. ¿Está encendido? (' + e.message + ')');
      setTimeout(() => Main.afterAuth().catch(() => {}), 4000);
      return;
    }
    if (!info.character) { UI.showCreator(); return; }
    UI.showConnecting('Entrando en el mundo...');
    try { await Net.connect(); } catch (e) {
      const msg = String((e && e.message) || e);
      if (/sesi|personaje/i.test(msg)) { Net.forget(); UI.showLogin('login', 'Vuelve a entrar con tu cuenta.'); return; }
      UI.showConnecting('⚠️ No se pudo entrar en el mundo: ' + msg);
      setTimeout(() => Main.afterAuth().catch(() => {}), 4000);
      return;
    }
    await new Promise((res) => { const t = setInterval(() => { if (Net.me) { clearInterval(t); res(); } }, 40); });
    enterGame();
  };

  function enterGame() {
    $('#start').classList.add('hidden');
    $('#game').classList.remove('hidden');
    if (!renderInit) {
      UI.buildTopbar();
      OP.Render.init($('#map'), $('#minimap'));
      OP.Render.buildTerrain();
      setupInput();
      UI.setupNews(); UI.setupClicks();
      renderInit = true;
    }
    UI.buildNews();
    UI.renderNews(true);
    OP.Render.resize();
    syncPred(true);
    OP.Render.centerOn(pred.x, pred.y, 16);
    UI.follow = true;
    UI.started = true;
    UI.updateTopbar();
    UI.renderPanel(true);
    UI.showChangelog();
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  }

  // ======================================================================
  //  MENSAJES DEL SERVIDOR
  // ======================================================================
  Net.on('welcome', (m) => {
    for (const c of m.chat) UI.addChat(c);
    if (UI.started) UI.renderNews(true);
    // personaje nuevo: la ayuda ya lo explica todo, así que las novedades de esta versión se dan por vistas
    if (m.firstLogin) { try { localStorage.setItem('opw_version_seen', UI.VERSION); } catch (e) { /* sin almacenamiento */ } setTimeout(() => UI.open('help'), 700); }
  });
  Net.on('me', (m) => { m._cdAt = Date.now(); syncPred(false); if (UI.started) UI.refreshModal(); });
  Net.on('chat', (m) => UI.addChat(m));
  Net.on('toast', (m) => UI.toast(m.text, false, true));
  Net.on('levelup', (m) => UI.toast('⭐ ¡NIVEL ' + m.lvl + '!', true, true));
  Net.on('quest', (m) => UI.toast('🎯 Objetivo cumplido: ' + m.text, true, true));
  let lastNewsToast = 0;
  Net.on('news', (n) => {
    UI.renderNews(false);
    const mine = Net.me && n.text.indexOf(Net.me.name) >= 0;
    if ((n.imp >= 4 && Date.now() - lastNewsToast > 15000) || mine) {
      lastNewsToast = Date.now();
      UI.toast(n.text, false, mine);
      if (n.isl >= 0) { const I = OP.M.islands[n.isl]; OP.Render.ping(I.x, I.y); }
    }
  });
  Net.on('fruitping', (m) => { if (OP.Render.ping) { OP.Render.ping(m.x, m.y); setTimeout(() => OP.Render.ping(m.x, m.y), 1200); } });
  Net.on('teleport', (m) => { pred.x = m.x; pred.y = m.y; if (UI.follow) OP.Render.centerOn(m.x, m.y); });
  Net.on('fx', (m) => {
    fx.push({ x: m.x, y: m.y, v: m.v, c: m.c, p: m.p, t0: performance.now() });
    if (fx.length > 60) fx.shift();
    // animación del golpe: el atacante mueve el brazo hacia su objetivo
    if (m.a) {
      const who = m.a.charAt(0) === 'p' ? Net.players.get(m.a.slice(2)) : OP.S.A[Number(m.a.slice(2))];
      if (who) {
        const wx = who.sid === Net.sid ? pred.x : who.rx != null ? who.rx : who.x;
        who.swingUntil = performance.now() + 240;
        who.swingDir = m.x < wx ? 'left' : 'right';
      }
    }
  });
  // efectos de habilidades de fruta (rayo, onda expansiva, aura)
  const afx = [];
  Net.on('afx', (m) => { afx.push(Object.assign({ t0: performance.now() }, m)); if (afx.length > 30) afx.shift(); });
  Main.afx = afx;
  Net.on('leave', (code) => {
    if (code === 4001) { UI.showConnecting('Tu personaje se ha conectado desde otra ventana. Cierra esta.'); return; }
    if (code === 4005 || Main.eraOver) return;   // Nueva Era: la ventana del aviso se encarga (js/mmo-exec.js)
    if (code === 4006) { UI.showConnecting('👢 Un administrador te ha expulsado del servidor' + (Main.kickReason ? ': ' + Main.kickReason : '') + '. Recarga la página para volver a entrar.'); return; }
    if (!Net.token) return;
    $('#net').classList.remove('hidden');
    const retry = async () => {
      try { await Net.connect(); $('#net').classList.add('hidden'); }
      catch (e) {
        if (/sesi|personaje/i.test(String((e && e.message) || e))) { Net.forget(); location.reload(); return; }
        setTimeout(retry, 3000);
      }
    };
    setTimeout(retry, 1500);
  });
  function syncPred(force) {
    const me = Net.me;
    if (!me) return;
    pred.faction = me.faction; pred.lvl = me.lvl; pred.talent = me.talent; pred.ships = me.ships;
    // datos de la ruta del Log Pose (el servidor manda; aquí solo para no "atracar" donde no se puede)
    pred.bounty = me.bounty; pred.merit = me.merit; pred.visited = me.visited; pred.powerNow = me.powerNow;
    pred.crewSize = me.crewSize; pred.king = me.king; pred.yonkou = me.yonkou;
    // lo que cambia la velocidad al andar (igual que en el servidor): velocidad entrenada, forma Zoan y cargar peso
    pred.trained = me.trained; pred.zoanOn = me.zoanOn; pred.carrying = me.carrying;
    if (force || !pred.ready) { pred.x = me.x; pred.y = me.y; pred.boat = me.boat; pred.wcls = me.wcls; pred.ready = true; }
  }

  // ======================================================================
  //  BUCLE
  // ======================================================================
  function loop(ts) {
    const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000));
    last = ts;
    if (UI.started && Net.me) {
      Net.pullPlayers();
      Net.smooth(dt);
      moveSelf(dt);
      if (keys.has(' ') && performance.now() >= nextAtk) Main.attack(true);
      if (UI.follow) {
        const c = OP.Render.cam;
        c.x += (pred.x - c.x) * Math.min(1, dt * 8); c.y += (pred.y - c.y) * Math.min(1, dt * 8);
        OP.Render.clampCam();
      }
      OP.Render.draw(ts, UI.selObj());
      updateCooldowns();
      uiT += dt;
      if (uiT > 0.25) {
        uiT = 0;
        UI.updateTopbar();
        UI.renderPanel(false);
        OP.Render.drawMini(null);
        updateHint();
        const self = Net.players.get(Net.sid);
        $('#dead').classList.toggle('hidden', !(self && self.dead));
      }
    }
    requestAnimationFrame(loop);
  }
  function updateCooldowns() {
    const me = Net.me;
    if (!me || !me._cdAt) return;
    const el = Date.now() - me._cdAt;
    for (const k of ['explore', 'train', 'ability', 'job']) {
      const n = document.getElementById('cd-' + k);
      if (!n) continue;
      const left = Math.max(0, (me.cds[k] || 0) - el);
      const tot = k === 'explore' ? MMO.EXPLORE_CD : k === 'train' ? MMO.TRAIN_CD : k === 'job' ? MMO.JOB_CD : ((MMO.abilityOf(me.fruit) || {}).cd || 1);
      n.style.height = Math.min(100, left / tot * 100) + '%';
    }
    for (const k of ['arm', 'obs', 'conq']) {   // recarga del Haki activo
      const n = document.getElementById('cd-h' + k);
      if (!n || !me.hakiCds) continue;
      n.style.height = Math.min(100, Math.max(0, (me.hakiCds[k] || 0) - el) / MMO.HAKI_ACTIVE[k].cd * 100) + '%';
    }
  }

  // ---------- Movimiento propio: predicción local + corrección con lo que dice el servidor ----------
  function typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }
  function inputDir() {
    if (UI.isModal() || typing() || (Net.me && Net.me.execution)) return [0, 0];   // encadenado en la plataforma: no te mueves
    const selfSt = Net.players.get(Net.sid);
    if (selfSt && ((selfSt.training && MMO.CARRY_PROPS.indexOf(selfSt.prop) < 0) || selfSt.stun)) return [0, 0];   // entrenando (T) quieto o aturdido (cargando peso sí se camina)
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    return [dx, dy];
  }
  let selfFace = 'down', selfWalking = false;
  Main.faceNow = () => selfFace; Main.walkingNow = () => selfWalking;   // para dibujarte dentro de los edificios
  function moveSelf(dt) {
    const self = Net.players.get(Net.sid);
    const [dx, dy] = inputDir();
    selfWalking = !!(dx || dy);
    if (selfWalking) selfFace = Math.abs(dx) > Math.abs(dy) * 0.8 ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    const now = performance.now();
    if (dx !== sentDx || dy !== sentDy || ((dx || dy) && now - lastSend > 1000)) {
      Net.send('input', { dx, dy });
      sentDx = dx; sentDy = dy; lastSend = now;
      if (dx || dy) UI.follow = true;
    }
    if (!self) return;
    if (self.dead) { pred.x = self.sx; pred.y = self.sy; pred.boat = self.boat; return; }
    if (self.ride) {   // de pasajero en el barco de un compañero: tu posición es la del barco
      pred.x = self.sx; pred.y = self.sy; pred.boat = self.boat; pred.wcls = Net.me.wcls;
      self.rx = pred.x; self.ry = pred.y; Net.me.x = pred.x; Net.me.y = pred.y; Net.me.boat = pred.boat;
      selfWalking = false;
      return;
    }
    if (dx || dy) {
      if (Main.room) OP.Interiors.step(pred, dx, dy, dt, Main.room.kind, Main.room.npcs);   // dentro de un edificio: la sala
      else MMO.step(pred, dx, dy, dt, Net.me.ship);
    }
    const err = Math.hypot(pred.x - self.sx, pred.y - self.sy);
    if (dx || dy) {
      if (err > 1.6) { pred.x = self.sx; pred.y = self.sy; pred.boat = self.boat; }
    } else {
      const k = Math.min(1, dt * 10);
      pred.x += (self.sx - pred.x) * k; pred.y += (self.sy - pred.y) * k;
      if (err < 0.03) { pred.x = self.sx; pred.y = self.sy; }
      pred.boat = self.boat;
      pred.wcls = Net.me.wcls;
    }
    self.rx = pred.x; self.ry = pred.y;
    if (Main.room) return;   // dentro de un edificio la posición es de la sala: tu sitio en el mundo sigue siendo la puerta
    Net.me.x = pred.x; Net.me.y = pred.y; Net.me.boat = pred.boat;
  }
  Main.myPos = () => [pred.x, pred.y];
  Main.setPred = (x, y) => { pred.x = x; pred.y = y; pred.boat = ''; };   // al entrar en un edificio: posición dentro de la sala
  Main.room = null;   // edificio en el que estás (js/mmo-interior.js)
  // entrenar manteniendo T: al pulsar empieza, al soltar para (el servidor sube la prioridad 0,25 pts/s)
  Main.tHeld = false;
  Main.trainKey = function (down) {
    if (down) { if (!Main.tHeld) { Main.tHeld = true; Net.send('trainhold', { on: true, focus: UI.trainFocus() }); } }
    else if (Main.tHeld) { Main.tHeld = false; Net.send('trainhold', { on: false }); }
  };
  Main.goMe = function () { UI.follow = true; OP.Render.centerOn(pred.x, pred.y, Math.max(OP.Render.cam.z, 12)); };
  Main.lookAt = function (x, y) { UI.follow = false; OP.Render.centerOn(x, y, Math.max(OP.Render.cam.z, 6)); };

  // ======================================================================
  //  COMBATE Y ACCIONES
  // ======================================================================
  function attackable() {
    const out = [];
    if (!pred.boat) for (const a of OP.S.agents) {
      if (a.ko || a.battle) continue;
      if (Net.me.faction === 'marine' && a.faction === 'marine') continue;
      if (Net.crew && (Net.crew.npcs || []).some((n) => n.id === a.id)) continue;   // tus NPC de tripulación
      out.push({ t: 'n', id: a.id, x: a.x, y: a.y, d: Math.hypot(a.x - pred.x, a.y - pred.y), hostile: a.engaged || a.faction !== Net.me.faction });
    }
    for (const p of Net.players.values()) {
      if (p.sid === Net.sid || p.dead || !!p.boat !== !!pred.boat) continue;
      if (Net.me.faction === 'marine' && p.faction === 'marine') continue;
      if (p.crewId && p.crewId === Net.me.crewId) continue;
      out.push({ t: 'p', id: p.sid, x: p.rx, y: p.ry, d: Math.hypot(p.rx - pred.x, p.ry - pred.y), hostile: p.faction !== Net.me.faction });
    }
    return out;
  }
  Main.attack = function (auto) {
    const me = Net.me;
    if (!me) return;
    let sel = UI.sel;
    const range = pred.boat ? MMO.NAVAL_RANGE : MMO.MELEE_RANGE;
    if (!sel || sel.t === 'i' || (sel.t === 'p' && sel.id === Net.sid)) {
      const near = attackable().filter((c) => c.d <= range).sort((a, b) => (b.hostile - a.hostile) || a.d - b.d)[0];
      if (!near) { if (!auto) UI.toast('No hay nadie a tu alcance. Selecciona un objetivo con clic o Tab.'); nextAtk = performance.now() + 400; return; }
      UI.select({ t: near.t, id: near.id });
      sel = UI.sel;
    }
    const o = UI.selObj();
    if (!o) return;
    if (Math.hypot(o.x - pred.x, o.y - pred.y) > range + 0.2) { if (!auto) UI.toast('Está demasiado lejos: acércate.'); nextAtk = performance.now() + 300; return; }
    Net.send('attack', { t: sel.t, id: sel.id });
    nextAtk = performance.now() + MMO.attackCooldown({ baseSpd: me.spd, baseStr: me.str, baseHp: me.maxHp, mods: {}, traits: me.traits });
  };
  function targetNearest() {
    const list = attackable().filter((c) => c.d < 14).sort((a, b) => a.d - b.d);
    if (!list.length) return UI.toast('No hay nadie cerca.');
    const cur = UI.sel ? list.findIndex((c) => c.t === UI.sel.t && String(c.id) === String(UI.sel.id)) : -1;
    const n = list[(cur + 1) % list.length];
    UI.select({ t: n.t, id: n.id });
  }
  // Modo combate (tecla R): cada clic en el mapa es un golpe. No hace falta seleccionar a nadie:
  // va al objetivo válido A TU ALCANCE más cercano al punto donde hiciste clic (el servidor valida tiempo, alcance y daño).
  Main.attackMode = false;
  Main.setAttackMode = function (on) {
    Main.attackMode = on;
    $('#game').classList.toggle('attack-mode', on);
    let b = document.getElementById('atk-banner');
    if (on && !b) { b = document.createElement('div'); b.id = 'atk-banner'; b.innerHTML = '⚔ <b>MODO COMBATE</b> · clic para golpear · <a data-act="attackmode">R para salir</a>'; $('#game').appendChild(b); }
    if (!on && b) b.remove();
    if (UI.started) UI.renderPanel(true);
  };
  // dirección hacia la que mira el personaje según el objetivo
  const faceTo = (dx, dy) => (Math.abs(dx) > Math.abs(dy) * 0.8 ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
  Main.combatClick = function (wx, wy) {
    const me = Net.me, self = Net.players.get(Net.sid);
    if (!me || !self || self.dead) return;
    const now = performance.now();
    if (now < nextAtk) return;                                    // tiempo entre golpes (sin spam)
    const range = pred.boat ? MMO.NAVAL_RANGE : MMO.MELEE_RANGE;
    const inRange = attackable().filter((c) => c.d <= range + 0.15);
    // el objetivo válido más cercano al punto del clic
    let best = null, bd = Infinity;
    for (const c of inRange) { const d = Math.hypot(c.x - wx, c.y - wy); if (d < bd) { bd = d; best = c; } }
    const tx = best ? best.x : wx, ty = best ? best.y : wy;
    // animación propia inmediata: gira hacia el objetivo (o hacia el clic) y lanza el brazo
    selfFace = faceTo(tx - pred.x, ty - pred.y);
    self.swingUntil = now + 260; self.swingDir = selfFace;
    nextAtk = now + MMO.attackCooldown({ baseSpd: me.spd, baseStr: me.str, baseHp: me.maxHp, mods: {}, traits: me.traits });
    if (!best) return;                                            // golpe al aire: no impacta a nadie
    UI.sel = { t: best.t, id: best.id };                          // queda seleccionado para ver su vida
    Net.send('attack', { t: best.t, id: best.id });
  };
  // Habilidad de la fruta (tecla Q): a distancia necesita objetivo; en área o potenciador, no
  Main.ability = function () {
    const me = Net.me;
    if (!me) return;
    if (me.fruit < 0) return UI.toast('No has comido ninguna Fruta del Diablo. Encuéntrala explorando las islas.');
    const ab = MMO.abilityOf(me.fruit);
    if (ab.kind !== 'ranged') return Net.send('ability', {});
    let sel = UI.sel;
    let o = sel && sel.t !== 'i' && !(sel.t === 'p' && sel.id === Net.sid) ? UI.selObj() : null;
    if (!o || Math.hypot(o.x - pred.x, o.y - pred.y) > ab.range + 0.2) {
      const near = attackable().filter((c) => c.d <= ab.range).sort((a, b) => (b.hostile - a.hostile) || a.d - b.d)[0];
      if (!near) return UI.toast(ab.name + ': no hay nadie a ' + ab.range + ' casillas.');
      UI.select({ t: near.t, id: near.id });
      sel = UI.sel;
    }
    Net.send('ability', { t: sel.t, id: sel.id });
  };
  // Recoger una fruta del suelo (el servidor comprueba que estás al lado)
  Main.pickup = function (f) {
    if (Math.hypot(f.x - pred.x, f.y - pred.y) > MMO.FRUIT_PICKUP_RANGE) { UI.toast('🍎 Acércate a la fruta para recogerla.'); return; }
    Net.send('pickup', { fid: f.id });
  };
  Main.act = function (a) {
    // bajar Reverse Mountain: elegir a qué mar
    if (a === 'gate') {
      const ng = pred.boat && MMO.nearGate(pred);
      if (ng && ng.back) {
        UI.openModal(`<h2>⛰ Bajar Reverse Mountain</h2><p>¿A qué mar quieres volver?</p>
          <div class="btns descend">${MMO.DESCEND.map(([k, , n]) => `<button class="gold" data-descend="${k}">🌊 ${n}</button>`).join('')}</div>`, 'narrow');
        document.querySelectorAll('[data-descend]').forEach((b) => b.addEventListener('click', () => { UI.closeModal(); Net.send('action', { a: 'gate', sea: b.dataset.descend }); }));
        return;
      }
    }
    if (a === 'heal') {
      const me = Net.me;
      const item = (me.inv.carne || 0) > 0 && (me.maxHp - me.hp > me.maxHp * 0.2 || !(me.inv.vendas > 0)) ? 'carne' : (me.inv.vendas || 0) > 0 ? 'vendas' : null;
      if (!item) return UI.toast('No tienes carne ni vendas. Cómpralas en cualquier pueblo (I).');
      return Net.send('use', { item });
    }
    // al entrenar se manda también qué quieres mejorar (fuerza, velocidad, poder o vida)
    Net.send('action', a === 'train' ? { a, focus: UI.trainFocus() } : { a });
  };
  // barco de un compañero de tripulación cerca (para subir con la tecla U)
  function crewBoatNear() {
    const me = Net.me;
    if (!me || !me.crewId) return null;
    let best = null, bd = MMO.BOARD_RANGE;
    for (const p of Net.players.values()) {
      if (p.sid === Net.sid || p.crewId !== me.crewId || !p.boat || p.ride || p.dead) continue;
      const d = Math.hypot(p.rx - pred.x, p.ry - pred.y);
      if (d <= bd) { bd = d; best = p; }
    }
    return best;
  }
  Main.boardKey = function () {
    const self = Net.players.get(Net.sid);
    if (self && self.ride) return Net.send('crew', { op: 'unboard' });
    const b = crewBoatNear();
    if (b) Net.send('crew', { op: 'board', sid: b.sid });
    else UI.toast('No hay ningún barco de tu tripulación cerca (' + MMO.BOARD_RANGE + ' casillas).');
  };
  function updateHint() {
    const el = $('#hint');
    let h = '';
    const self = Net.players.get(Net.sid);
    const nearBoat = !(self && self.ride) && crewBoatNear();
    if (Main.doorHint && Main.doorHint()) {
      h = Main.doorHint();   // puertas, salida y NPC de los edificios
    } else if (self && self.ride) {
      const host = Net.players.get(self.ride);
      h = '⛵ A bordo del barco de ' + (host ? host.name : 'tu compañero') + ' · Pulsa U para bajar';
    } else if (nearBoat) {
      h = '⛵ Pulsa U para subir al barco de ' + nearBoat.name;
    } else if (pred.boat) {
      const g = MMO.nearGate(pred);
      if (g) h = '⛰ Pulsa G: ' + (g.back ? 'bajar Reverse Mountain a los cuatro mares' : g.g.name + (g.fwd ? '' : ' (volver)'));
    } else {
      const I = MMO.islandAt(pred.x, pred.y);
      if (I) {
        const parts = [];
        const ev = Net.room && Net.room.state && Net.room.state.event;
        if (ev && ev.indexOf(I.name) >= 0) parts.push('🌟 ¡Evento aquí!');
        if (I.train) parts.push('🥋 ' + I.train.label + ' (T)');
        if (Object.keys(MMO.SHOP).some((k) => MMO.SHOP[k].where(I))) parts.push('🛒 Tienda (I)');
        h = parts.join(' · ');
      }
    }
    el.textContent = h;
    el.classList.toggle('hidden', !h);
  }

  // ======================================================================
  //  DIBUJO DE JUGADORES (ganchos de render.js)
  // ======================================================================
  const outlineCache = new Map();
  function outlined(img, color) {
    if (!img._k) img._k = Math.random().toString(36).slice(2);
    const key = img._k + color;
    let c = outlineCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.width + 2; c.height = img.height + 2;
    const g = c.getContext('2d');
    for (const [ox, oy] of [[0, 1], [2, 1], [1, 0], [1, 2], [0, 0], [2, 2], [0, 2], [2, 0]]) g.drawImage(img, ox, oy);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(img, 1, 1);
    outlineCache.set(key, c);
    return c;
  }
  function relColor(p) {
    if (p.sid === Net.sid) return '#ffd23f';
    if (Net.me && p.crewId && p.crewId === Net.me.crewId) return '#5ef08a';
    return p.faction === 'marine' ? '#6ab8ff' : '#ff6a5a';
  }
  const playerFlag = (p) => (Net.crew && p.crewId === Net.crew.id ? Net.crew.flag : { bg: p.faction === 'marine' ? '#f4f6f8' : '#111', fg: '#f4f4f4', sym: (p.cid || 0) % 5 });
  const playerPos = (p) => (p.sid === Net.sid ? [pred.x, pred.y] : [p.rx, p.ry]);

  OP.Render.hooks.world = function (ctx, w2s, z, t, x0, y0, Wc, Hc) {
    // frutas escondidas que tienes cerca (cada una con su dibujo)
    for (const f of OP.S.fruitItems || []) {
      const [sx, sy] = w2s(f.x, f.y);
      const s = Math.max(1, Math.round(z / 8));
      const bob = Math.sin(t * 3 + f.id) * s;
      const glow = 0.35 + 0.25 * Math.sin(t * 4);
      ctx.fillStyle = 'rgba(255,240,150,' + glow + ')';
      ctx.beginPath(); ctx.arc(sx, sy - 6 * s + bob, 9 * s, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(OP.Sprites.fruit(f.id), Math.round(sx - 9 * s), Math.round(sy - 17 * s + bob), 18 * s, 18 * s);   // dibujo de 36x36
      if (Math.floor(t * 3 + f.id) % 3 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(sx + 5 * s, sy - 12 * s + bob, s, s); }
    }
    for (const p of Net.players.values()) {
      if (p.ride && Net.players.has(p.ride)) continue;   // los pasajeros van dentro del barco del compañero
      if (p.inside) continue;                             // dentro de un edificio: desde fuera no se le ve
      const [x, y] = playerPos(p);
      if (x < x0 - 3 || y < y0 - 3 || x > x0 + Wc / z + 3 || y > y0 + Hc / z + 3) continue;
      const [sx, sy] = w2s(x, y);
      const col = relColor(p);
      ctx.save();
      if (p.dead) ctx.globalAlpha = 0.35;
      if (z < 3.5) { ctx.fillStyle = col; ctx.fillRect(sx - 2, sy - 2, 4, 4); ctx.restore(); continue; }
      if (p.boat) {
        // el navío legendario personalizado usa sus propios colores y su bandera
        const L = p.boat === 'legendario' && p.shipLook ? p.shipLook.split('|') : null;
        const img = outlined(L ? OP.Sprites.ship('legendario', p.faction, { bg: L[1], fg: L[3], sym: +L[4] }, { hull: L[0], flag: { bg: L[2], fg: L[3], sym: +L[4] } })
          : OP.Sprites.ship(p.boat, p.faction, playerFlag(p)), col);
        const s = Math.max(1, Math.round(z / 5));
        const w = img.width * s, h = img.height * s;
        const bob = p.moving ? Math.round(Math.sin(t * 3 + (p.cid || 0)) * s * 0.5) : 0;
        if (p.moving) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          for (let k = 1; k <= 3; k++) ctx.fillRect(sx - p.dir * (w / 2 + k * s * 2), sy + h * 0.2 - s * 2 + ((k + Math.floor(t * 4)) % 2) * s, s * 2, s);
        }
        ctx.translate(Math.round(sx), Math.round(sy + bob));
        if (p.dir < 0) ctx.scale(-1, 1);
        ctx.drawImage(img, -Math.round(w / 2), -Math.round(h * 0.8), w, h);
      } else {
        // sprite estilo Esmeralda con contorno del color del jugador
        const self = p.sid === Net.sid;
        const swing = p.swingUntil && performance.now() < p.swingUntil;
        const face = swing ? p.swingDir : self ? selfFace : (p.face || (p.dir < 0 ? 'left' : 'down'));
        const walking = self ? selfWalking : p.moving;
        // entrenando: de frente y quieto · Haki de Armadura: brazos / piernas / torso / todo en negro metálico según el nivel
        const still = p.training && MMO.CARRY_PROPS.indexOf(p.prop) < 0;   // entrenando quieto: de frente (cargando peso sí camina)
        const img = outlined(OP.Sprites.chibi(p.app, p.faction, p.rank, still ? 'down' : face, still ? 0 : walking ? 1 + (Math.floor(t * 7) % 2) : 0, swing, p.armor || 0, p.zoan || ''), col);
        const s = Math.max(1, Math.round(z / 14)) * (p.zoan ? 1.25 : 1);   // la forma híbrida es más grande
        const w = img.width * s, h = img.height * s;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.32, Math.max(1.5, s * 2), 0, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h + s * 2), w, h);
      }
      ctx.restore();
    }
  };
  OP.Render.hooks.overlay = function (ctx, w2s, z) {
    if (z >= 3.5) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const aboard = new Map();   // sid del barco -> nombres de sus pasajeros
      for (const p of Net.players.values()) if (p.ride && Net.players.has(p.ride)) { if (!aboard.has(p.ride)) aboard.set(p.ride, []); aboard.get(p.ride).push(p.name); }
      for (const p of Net.players.values()) {
        if (p.ride && Net.players.has(p.ride)) continue;
        if (p.inside) continue;
        const [x, y] = playerPos(p);
        const [sx, sy0] = w2s(x, y);
        if (sx < -80 || sy0 < -40 || sx > ctx.canvas.clientWidth + 80 || sy0 > ctx.canvas.clientHeight + 40) continue;
        const s = Math.max(2, Math.round(z / 5));
        const top = sy0 - (p.boat ? 14 : 8) * s - 4;
        if (aboard.has(p.sid)) {   // quién va a bordo, encima del nombre del capitán del barco
          ctx.font = '600 10px Inter, system-ui, sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,10,20,0.85)';
          const txt = '⛵ a bordo: ' + aboard.get(p.sid).join(', ');
          ctx.strokeText(txt, sx, top - 13); ctx.fillStyle = '#9fe0a8'; ctx.fillText(txt, sx, top - 13);
        }
        // los marines llevan su rango delante del nombre (los altos mandos con estrella)
        const name = p.faction === 'pirate' ? '☠ ' + p.name : (p.rank >= 7 ? '⭐ ' : '⚓ ') + (p.rank >= 4 ? OP.RANKS[p.rank] + ' ' : '') + p.name;
        ctx.font = '700 12px Inter, system-ui, sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,10,20,0.85)';
        ctx.strokeText(name, sx, top); ctx.fillStyle = relColor(p); ctx.fillText(name, sx, top);
        ctx.font = '600 10px Inter, system-ui, sans-serif';
        const sub = 'Nv ' + p.lvl + (p.crewName ? ' · ' + p.crewName : '');
        ctx.strokeText(sub, sx, top + 11); ctx.fillStyle = '#d8e2ee'; ctx.fillText(sub, sx, top + 11);
        if (p.hp < p.maxHp || p.fighting) {
          const bw = 36;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - bw / 2 - 1, top + 14, bw + 2, 5);
          ctx.fillStyle = p.hp / p.maxHp > 0.3 ? '#4cc38a' : '#e2574c'; ctx.fillRect(sx - bw / 2, top + 15, bw * Math.max(0, p.hp / p.maxHp), 3);
        }
      }
    }
    const now = performance.now();
    // habilidades de fruta
    for (let i = afx.length - 1; i >= 0; i--) {
      const e = afx[i];
      const age = (now - e.t0) / 1000;
      const life = e.k === 'buff' ? (e.d || 8000) / 1000 : 0.7;
      if (age > life) { afx.splice(i, 1); continue; }
      const src = Net.players.get(e.who);
      const [ox, oy] = src ? playerPos(src) : [e.x, e.y];
      const [sx, sy] = w2s(ox, oy);
      ctx.save();
      ctx.strokeStyle = e.c; ctx.fillStyle = e.c;
      if (e.k === 'ranged') {
        const [tx, ty] = w2s(e.tx, e.ty);
        ctx.globalAlpha = 1 - age / life;
        ctx.lineWidth = Math.max(3, z * 0.35); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy - z * 0.6); ctx.lineTo(tx, ty - z * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(tx, ty - z * 0.6, Math.max(6, z * 0.6) * (1 + age), 0, Math.PI * 2); ctx.globalAlpha *= 0.5; ctx.fill();
      } else if (e.k === 'aoe') {
        ctx.globalAlpha = 0.8 * (1 - age / life);
        ctx.lineWidth = Math.max(3, z * 0.3);
        ctx.beginPath(); ctx.arc(sx, sy, e.r * z * Math.min(1, age / 0.35), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha *= 0.3; ctx.fill();
      } else {
        ctx.globalAlpha = 0.35 + 0.2 * Math.sin(age * 8);
        ctx.lineWidth = Math.max(2, z * 0.18);
        ctx.beginPath(); ctx.ellipse(sx, sy - z * 0.5, z * 0.9, z * 1.2, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      const age = (now - f.t0) / 1000;
      if (age > 1.1) { fx.splice(i, 1); continue; }
      const [sx, sy] = w2s(f.x, f.y);
      const txt = f.v ? (f.c ? '¡' + f.v + '!' : String(f.v)) : 'Fallo';
      ctx.globalAlpha = Math.min(1, 1.6 - age * 1.4);
      ctx.font = (f.c ? '800 17px ' : '700 13px ') + 'Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      const yy = sy - Math.max(18, z * 1.6) - age * 28;
      ctx.strokeText(txt, sx, yy);
      ctx.fillStyle = !f.v ? '#cfd8e3' : f.p ? '#ff6a5a' : f.c ? '#ffd23f' : '#ffffff';
      ctx.fillText(txt, sx, yy);
      ctx.globalAlpha = 1;
    }
  };
  OP.Render.hooks.mini = function (mctx, sx, sy) {
    for (const p of Net.players.values()) {
      if (p.inside && p.sid !== Net.sid) continue;
      if (p.inside && !Main.room) continue;
      const [x, y] = p.inside ? [Main.room.door.x, Main.room.door.y] : playerPos(p);   // dentro: en el minimapa, en la puerta
      const self = p.sid === Net.sid;
      mctx.fillStyle = relColor(p);
      const r = self ? 4 : 3;
      mctx.fillRect(x * sx - r / 2, y * sy - r / 2, r, r);
      if (self) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.strokeRect(x * sx - 3.5, y * sy - 3.5, 7, 7); }
    }
  };
  OP.Render.hooks.pick = function (sx, sy) {
    const z = OP.Render.cam.z;
    for (const f of OP.S.fruitItems || []) {
      const [fx2, fy2] = OP.Render.w2s(f.x, f.y);
      if (Math.hypot(fx2 - sx, fy2 - Math.max(6, z * 0.5) - sy) < Math.max(14, z * 0.9)) return { type: 'fruit', obj: f };
    }
    let best = null, bd = Math.max(12, z * 1.1);
    for (const p of Net.players.values()) {
      if (p.inside) continue;
      const [x, y] = playerPos(p);
      const [px, py] = OP.Render.w2s(x, y - (p.boat ? 0.8 : 0.6));
      const d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = { type: 'player', obj: p }; }
    }
    return best;
  };

  // ======================================================================
  //  RATÓN Y TECLADO
  // ======================================================================
  function setupInput() {
    const cv = $('#map');
    let down = null, dragging = false, lastHover = 0;
    cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY }; dragging = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (down) {
        const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
        if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { dragging = true; UI.follow = false; }
        if (dragging) { OP.Render.pan(dx, dy); down.lx = e.clientX; down.ly = e.clientY; }
        $('#tooltip').classList.add('hidden');
        return;
      }
      const now = performance.now();
      if (now - lastHover < 80) return;
      lastHover = now;
      const r = cv.getBoundingClientRect();
      const p = OP.Render.pick(e.clientX - r.left, e.clientY - r.top);
      const tip = $('#tooltip');
      if (!p) { tip.classList.add('hidden'); cv.style.cursor = 'grab'; return; }
      cv.style.cursor = 'pointer';
      let txt = '';
      if (p.type === 'fruit') txt = '🍎 ¡Una Fruta del Diablo! Haz clic para recogerla';
      else if (p.type === 'player') txt =(p.obj.faction === 'pirate' ? '☠ ' : '⚓ ') + p.obj.name + ' · nv ' + p.obj.lvl + ' · JUGADOR';
      else if (p.type === 'agent') txt = (p.obj.faction === 'pirate' ? '☠ ' : '⚓ ') + p.obj.name + ' · nv ' + p.obj.lvl + ' · NPC' + (p.obj.ko ? ' · KO' : '');
      else if (p.type === 'ship') { const u = OP.S.U[p.obj.unit]; txt = '⛵ ' + ((OP.SHIPS[p.obj.type] || {}).name || '') + (u && u.name ? ' — ' + u.name : ''); }
      else if (p.type === 'island') txt = (p.obj.hidden && !(OP.S.isl[p.obj.idx] || {}).discovered) ? '🏝 Laugh Tale ???' : '🏝 ' + p.obj.name;
      else if (p.type === 'landmark') txt = '⛰ ' + p.obj.name;
      tip.textContent = txt;
      tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 10) + 'px';
      tip.classList.remove('hidden');
    });
    cv.addEventListener('pointerup', (e) => {
      if (down && !dragging) {
        const r = cv.getBoundingClientRect();
        const p = OP.Render.pick(e.clientX - r.left, e.clientY - r.top);
        if (p && p.type === 'fruit') Main.pickup(p.obj);
        else if (Main.attackMode) { const [wx, wy] = OP.Render.s2w(e.clientX - r.left, e.clientY - r.top); Main.combatClick(wx, wy); }   // modo combate: cada clic es un golpe
        else if (p && p.type === 'player') UI.select({ t: 'p', id: p.obj.sid });
        else if (p && p.type === 'agent') UI.select({ t: 'n', id: p.obj.id });
        else if (p && p.type === 'ship') { const u = OP.S.U[p.obj.unit]; UI.toast('⛵ ' + ((OP.SHIPS[p.obj.type] || {}).name || '') + (u && u.name ? ' de los ' + u.name : '') + (p.obj.state === 'sailing' ? ', navegando' : ', en puerto')); }
        else if (p && p.type === 'island') UI.select({ t: 'i', id: p.obj.idx });
        else if (p && p.type === 'landmark') UI.toast('⛰ ' + p.obj.name + ': ' + p.obj.text);
      }
      down = null; dragging = false;
    });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); OP.Render.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    cv.addEventListener('dblclick', (e) => { const r = cv.getBoundingClientRect(); OP.Render.zoomAt(e.clientX - r.left, e.clientY - r.top, 2); });
    cv.addEventListener('pointerleave', () => $('#tooltip').classList.add('hidden'));
    const mm = $('#minimap');
    let mmDown = false;
    const goMini = (e) => { const r = mm.getBoundingClientRect(); Main.lookAt((e.clientX - r.left) / r.width * OP.W, (e.clientY - r.top) / r.height * OP.H); };
    mm.addEventListener('pointerdown', (e) => { mmDown = true; goMini(e); });
    mm.addEventListener('pointermove', (e) => { if (mmDown) goMini(e); });
    window.addEventListener('pointerup', () => { mmDown = false; });
    document.addEventListener('click', (e) => { if (e.target.closest('#me-btn')) { UI.select(null); Main.goMe(); } });

    window.addEventListener('keydown', (e) => {
      if (!UI.started) return;
      if (typing()) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) {
        if (UI.isModal() && k !== ' ') return;
        e.preventDefault();
        if (k === ' ' && !keys.has(' ') && !UI.isModal()) Main.attack(false);
        keys.add(k);
        return;
      }
      if (e.repeat) return;
      if (k === 'escape') { if (UI.isModal()) UI.closeModal(); else if (Main.attackMode) Main.setAttackMode(false); else UI.select(null); return; }
      if (k === 'r' && !UI.isModal()) { Main.setAttackMode(!Main.attackMode); return; }   // R: modo combate
      if (k === 'enter') { e.preventDefault(); UI.openChat(); return; }
      if (UI.isModal() && k !== 'f1') return;
      if (k === 'tab') { e.preventDefault(); targetNearest(); }
      else if (k === 'e') { if (!(Main.execKey && Main.execKey(true)) && !(Main.doorKey && Main.doorKey())) Main.act('explore'); }   // E: rescatar · entrar / hablar / salir · explorar
      else if (k === 't') Main.trainKey(true);       // mantener T: entrenar sin moverse
      else if (k === 'z') Net.send('haki', { type: 'arm' });    // Haki de Armadura
      else if (k === 'x') Net.send('haki', { type: 'obs' });    // Haki de Observación
      else if (k === 'v') Net.send('haki', { type: 'conq' });   // Haki del Rey
      else if (k === 'h') Main.act('heal');
      else if (k === 'g') Main.act('gate');
      else if (k === 'q') Main.ability();
      else if (k === 'u') Main.boardKey();   // subir / bajar del barco de un compañero
      else if (k === 'j') Main.act('job');    // saquear (piratas) / patrullar (marines)
      else if (k === 'm') { UI.select(null); Main.goMe(); }
      else if (k === 'i') UI.open('inventory');
      else if (k === 'o') UI.open('dream');
      else if (k === 'b') UI.open('wanted');
      else if (k === 'c') { if (Net.me && MMO.zoanFormOf(Net.me.fruit)) Net.send('zoan'); else UI.open('crews'); }   // con fruta Zoan: transformarse
      else if (k === 'l') UI.open('islands');
      else if (k === 'n') UI.open('paper');
      else if (k === 'f1') { e.preventDefault(); UI.open('help'); }
      else if (k === '+' || k === '=') OP.Render.zoomAt(innerWidth / 2, innerHeight / 2, 1.2);
      else if (k === '-') OP.Render.zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.2);
    });
    window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); keys.delete(k); if (k === 'e' && Main.execKey) Main.execKey(false); if (k === 't') Main.trainKey(false); });
    window.addEventListener('blur', () => { keys.clear(); Main.trainKey(false); });
  }

  boot();
})();
