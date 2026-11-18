/* EJECUCIÓN PÚBLICA y órdenes del administrador para eventos.
   - Un pirata con 500 millones o más derrotado por un marine (jugador o NPC) no va a Impel Down: lo llevan a la
     plataforma de ejecución de Marineford, inmovilizado, con una cuenta atrás de 60 segundos que ve todo el servidor.
   - Durante ese tiempo puede decir sus ÚLTIMAS PALABRAS (se muestran en grande a todos).
   - Otro pirata puede RESCATARLO manteniendo E (o el botón) 3 segundos junto a la plataforma.
   - Si nadie lo rescata, se le ejecuta: recompensa a 0, pierde el título de Rey si lo tenía y despierta en su isla.
   - Órdenes de administrador (chat con sesión de administrador en este PC, o consola del servidor):
       /forzar_ejecucion <nombre>   /cancelar_ejecucion <nombre>   /reiniciar_era  (pide /reiniciar_era CONFIRMAR) */
'use strict';
const ctx = require('./context');

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function install(Room) {
  const P = Room.prototype;

  // ---------- Dónde está la plataforma ----------
  P.execSpot = function () {
    if (this._execSpot) return this._execSpot;
    const { M, MMO, OP } = this;
    const E = MMO.EXECUTION;
    const land = (x, y) => { const i = Math.floor(y) * M.W + Math.floor(x); return i >= 0 && i < M.N && OP.isLand(M.t[i]) && M.isl[i] >= 0 ? M.isl[i] : -1; };
    const ex = Number(process.env.OPW_EXEC_X), ey = Number(process.env.OPW_EXEC_Y);
    if (Number.isFinite(ex) && Number.isFinite(ey) && land(ex, ey) >= 0) return (this._execSpot = { x: ex, y: ey, isl: land(ex, ey) });
    const I = M.byId[E.island] || M.byId.marineford;
    const cx = I.x + (E.dx || 0), cy = I.y + (E.dy || 0);
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = Math.floor(cx) + dx + 0.5, y = Math.floor(cy) + dy + 0.5;
      if (land(x, y) === I.idx) return (this._execSpot = { x, y, isl: I.idx });
    }
    const pos = this.game.portPos(I);
    return (this._execSpot = { x: pos.x, y: pos.y, isl: I.idx });
  };

  // datos de una ejecución para los clientes (tiempo restante en ms: así no importa la hora de cada PC)
  P.execInfo = function (e) {
    const sp = this.execSpot();
    return { cid: e.cid, sid: this.byCid.get(e.cid) || '', name: e.name, bounty: e.bounty, by: e.by, left: Math.max(0, e.until - Date.now()),
      x: sp.x, y: sp.y, words: e.words || '', rescuer: e.rescue ? e.rescue.name : '', holdLeft: e.rescue ? Math.max(0, e.rescue.start + this.MMO.EXECUTION.holdMs - Date.now()) : 0 };
  };
  P.execList = function () { return [...this.executions.values()].map((e) => this.execInfo(e)); };

  // al abrir el mundo: las ejecuciones que quedaron a medias (servidor reiniciado o jugador desconectado) siguen su cuenta atrás
  P.initExecutions = function () {
    this.executions = new Map();
    for (const row of this.db.allCharacters()) {
      let d;
      try { d = JSON.parse(row.data); } catch (e) { continue; }
      if (d.execution && d.execution.until) this.executions.set(Number(row.id), { cid: Number(row.id), name: d.name, bounty: d.execution.bounty || d.bounty || 0, by: d.execution.by || 'la Marina', until: d.execution.until, words: d.execution.words || '' });
    }
    if (this.executions.size) console.log('[ejecución] ' + this.executions.size + ' ejecución(es) pendiente(s) recuperada(s)');
  };

  // ---------- Empezar ----------
  // s = sesión del jugador conectado; forced = la ha ordenado el administrador (sin importar su estado)
  P.startExecution = function (s, byName, forced) {
    const { MMO, OP, game } = this;
    const E = MMO.EXECUTION;
    const p = s.data, now = Date.now();
    if (this.executions.has(s.cid)) return false;
    // se cancela cualquier otra cosa: Impel Down, ir de pasajero, peleas en curso
    if (p.prison) { for (const a of this.prisonGuards(s.cid)) { a.prisonGuard = 0; this.Sim.retire(a, 'Volvió a su puesto'); } p.prison = null; }
    if (s.ride) this.leaveRide(s, 'land');
    if (p.inside) this.exitInterior(s, true);   // aunque esté dentro de un edificio, lo sacan
    for (const [id, en] of this.engage) if (en.sid === s.sid) this.engage.delete(id);
    s.st.dead = false; s.respawnAt = 0;
    p.hp = Math.max(1, Math.round(MMO.stats(p).maxHp * 0.25));
    const sp = this.execSpot();
    p.x = sp.x; p.y = sp.y; p.boat = ''; p.wcls = 1; s.lastIsl = sp.isl;
    s.input.dx = 0; s.input.dy = 0;
    const e = { cid: s.cid, name: p.name, bounty: p.bounty || 0, by: byName || 'la Marina', until: now + E.ms, words: '' };
    p.execution = { since: now, until: e.until, by: e.by, bounty: e.bounty, words: '' };
    this.executions.set(s.cid, e);
    game.moment(p, 'Fue llevado a la plataforma de ejecución de ' + this.M.islands[sp.isl].name, 60);
    s.client.send('teleport', { x: p.x, y: p.y });
    this.toast(s, '⛓️ Te han encadenado en la plataforma de ejecución. Tienes 60 segundos: di tus últimas palabras... o espera a que te rescaten.');
    this.announceExecution(e, forced);
    s.dirty = true; s.saveDirty = true;
    this.saveChar(s);
    this.syncPublic(s);
    return true;
  };
  // el jugador no está conectado (solo por orden del administrador): la cuenta atrás corre igual
  P.startExecutionOffline = function (row, byName) {
    const d = this.game.migrate(JSON.parse(row.data));
    const cid = Number(row.id);
    if (this.executions.has(cid)) return false;
    const now = Date.now();
    const e = { cid, name: d.name, bounty: d.bounty || 0, by: byName || 'la Marina', until: now + this.MMO.EXECUTION.ms, words: '' };
    if (d.prison) d.prison = null;
    const sp = this.execSpot();
    d.x = sp.x; d.y = sp.y; d.boat = ''; d.wcls = 1;
    d.execution = { since: now, until: e.until, by: e.by, bounty: e.bounty, words: '' };
    this.db.saveCharacter(cid, d);
    this.executions.set(cid, e);
    this.announceExecution(e, true);
    return true;
  };
  P.announceExecution = function (e, forced) {
    const { OP } = this;
    const where = this.M.islands[this.execSpot().isl].name;
    this.broadcast('exec', Object.assign({ k: 'start', forced: !!forced }, this.execInfo(e)));
    this.news('capture', '⚔️ ¡EJECUCIÓN PÚBLICA en ' + where + '! ' + e.name + ' (' + OP.fmtB(e.bounty) + ') será ejecutado en 60 segundos' + (forced ? ' por orden del Gobierno Mundial' : ', capturado por ' + e.by) + '.', 5);
    this.system('⚔️ EJECUCIÓN PÚBLICA: ' + e.name + ' (' + OP.fmtB(e.bounty) + ') en ' + where + '. ¡60 segundos para rescatarlo!', 'exec');
    console.log('[ejecución] Empieza la de ' + e.name + (forced ? ' (orden del administrador)' : ' (capturado por ' + e.by + ')'));
  };

  // ---------- Últimas palabras (solo una vez) ----------
  P.onLastWords = function (s, m) {
    const e = this.executions.get(s.cid);
    if (!e || !s.data.execution) return this.toast(s, 'No estás en la plataforma de ejecución.');
    if (e.words) return this.toast(s, 'Ya dijiste tus últimas palabras.');
    const text = String(m.text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, this.MMO.EXECUTION.wordsMax);
    if (text.length < 2) return this.toast(s, 'Escribe algo para decir.');
    e.words = text; s.data.execution.words = text;
    s.saveDirty = true;
    this.broadcast('exec', { k: 'words', cid: e.cid, name: e.name, text });
    this.system('🗣️ Últimas palabras de ' + e.name + ': «' + text + '»', 'exec');
    this.news('capture', 'Las últimas palabras de ' + e.name + ' en la plataforma: «' + text + '»', 4);
  };

  // ---------- Rescate: mantener E (o el botón) 3 segundos junto a la plataforma ----------
  P.onRescue = function (s, m) {
    const { MMO } = this;
    const E = MMO.EXECUTION;
    const p = s.data, now = Date.now();
    if (m.op === 'stop') {
      for (const e of this.executions.values()) if (e.rescue && e.rescue.sid === s.sid) this.cancelRescue(e, '');
      return;
    }
    if (s.st.dead || p.boat || p.prison || p.execution) return;
    const sp = this.execSpot();
    if (Math.hypot(p.x - sp.x, p.y - sp.y) > E.range + 0.4) return this.toast(s, 'Acércate más a la plataforma de ejecución.');
    const e = [...this.executions.values()].find((x) => x.cid !== s.cid);
    if (!e) return;
    if (p.faction !== 'pirate') return this.toast(s, '⚓ Un marine no libera a un pirata condenado.');
    if (!this.byCid.get(e.cid)) return this.toast(s, e.name + ' no está aquí en persona: solo se puede rescatar a quien está en la plataforma.');
    if (e.rescue && e.rescue.sid !== s.sid) return this.toast(s, e.rescue.name + ' ya está rompiendo sus cadenas.');
    if (e.rescue) return;
    e.rescue = { sid: s.sid, cid: s.cid, name: p.name, start: now, hit: s.lastCombat };
    this.broadcast('exec', { k: 'rescue', cid: e.cid, name: e.name, by: p.name, ms: E.holdMs });
  };
  P.cancelRescue = function (e, why) {
    const r = e.rescue;
    if (!r) return;
    e.rescue = null;
    this.broadcast('exec', { k: 'rescuestop', cid: e.cid, by: r.name });
    const o = this.ps.get(r.sid);
    if (o && why) this.toast(o, why);
  };

  // ---------- Cada tick: inmovilizado, rescates y fin de la cuenta atrás ----------
  P.tickExecutions = function (now) {
    if (!this.executions.size) return;
    const E = this.MMO.EXECUTION;
    const sp = this.execSpot();
    for (const e of [...this.executions.values()]) {
      const r = e.rescue;
      if (r) {
        const o = this.ps.get(r.sid);
        if (!o || o.st.dead || o.data.boat) this.cancelRescue(e, '');
        else if (Math.hypot(o.data.x - sp.x, o.data.y - sp.y) > E.range + 0.6) this.cancelRescue(e, 'Te has alejado de la plataforma: el rescate se interrumpe.');
        else if (o.lastCombat > r.hit) this.cancelRescue(e, '⚔ ¡Te han atacado! El rescate se interrumpe.');
        else if (!this.byCid.get(e.cid)) this.cancelRescue(e, '');
        else if (now - r.start >= E.holdMs) { this.rescueExecution(e, o); continue; }
      }
      if (now >= e.until) this.finishExecution(e);
    }
  };

  P.rescueExecution = function (e, rescuer) {
    const { OP, game } = this;
    this.executions.delete(e.cid);
    const sid = this.byCid.get(e.cid);
    const s = sid && this.ps.get(sid);
    if (s) {
      s.data.execution = null;
      // 20 segundos para huir: los marines NPC de la isla no le atacan nada más soltarlo (si no, lo volverían a capturar al instante)
      s.execGrace = Date.now() + 20000;
      s.data.hp = Math.max(s.data.hp, Math.round(this.MMO.stats(s.data).maxHp * 0.6));
      for (const [id, en] of this.engage) if (en.sid === s.sid) this.engage.delete(id);
      game.moment(s.data, 'Fue rescatado de la plataforma de ejecución por ' + rescuer.data.name, 70);
      this.toast(s, '🔓 ¡' + rescuer.data.name + ' rompe tus cadenas! Eres libre: tienes 20 segundos antes de que la Marina reaccione. ¡Huye!');
      s.dirty = true; s.saveDirty = true; this.saveChar(s); this.syncPublic(s);
    }
    const q = rescuer.data;
    game.moment(q, 'Rescató a ' + e.name + ' de la plataforma de ejecución', 70);
    if (q.faction === 'pirate') {
      const up = game.raiseBounty(q, Math.max(2e7, e.bounty * 0.05), true);
      if (up) this.onBounty(rescuer, up, 'por rescatar a ' + e.name + ' de su ejecución pública', true);
    }
    this.toast(rescuer, '🔓 ¡Rescatas a ' + e.name + '!');
    rescuer.dirty = true; rescuer.saveDirty = true;
    this.broadcast('exec', { k: 'rescued', cid: e.cid, name: e.name, by: q.name });
    this.news('capture', '🔓 ¡' + q.name + ' rescata a ' + e.name + ' en plena ejecución pública! El Gobierno Mundial queda en ridículo.', 5);
    this.system('🔓 ¡' + q.name + ' ha rescatado a ' + e.name + ' de la ejecución!', 'exec');
    console.log('[ejecución] ' + e.name + ' rescatado por ' + q.name);
  };

  // la ejecución: misma lógica que una derrota, pero la recompensa vuelve a 0 y se pierde el título de Rey
  P.applyExecution = function (p, cid) {
    const S = this.OP.S;
    const lost = Math.floor((p.money || 0) * 0.08);
    p.money -= lost;
    p.bountyLog = p.bountyLog || [];
    p.bountyLog.unshift({ at: Date.now(), up: -(p.bounty || 0), total: 0, why: 'ejecutado en público: su recompensa se cancela' });
    if (p.bountyLog.length > 30) p.bountyLog.length = 30;
    p.bounty = 0;
    p.execution = null;
    p.stats = p.stats || {};
    p.stats.deaths = (p.stats.deaths || 0) + 1;
    p.stats.executed = (p.stats.executed || 0) + 1;
    if (S.playerKing && S.playerKing.cid === cid) { S.playerKing = null; p.king = false; if (p.epithet === 'Rey de los Piratas') p.epithet = p.prevEpithet || ''; }
    this.game.moment(p, 'Fue ejecutado en público', 100);
    this.wantedCache = null;
    return lost;
  };
  P.finishExecution = function (e) {
    const { OP } = this;
    this.executions.delete(e.cid);
    if (e.rescue) this.cancelRescue(e, '');
    const sid = this.byCid.get(e.cid);
    const s = sid && this.ps.get(sid);
    if (s) {
      const p = s.data;
      const lost = this.applyExecution(p, s.cid);
      p.hp = 0;
      s.st.dead = true;
      s.respawnHome = true;
      s.respawnAt = Date.now() + this.MMO.RESPAWN_MS + 3000;
      this.toast(s, '⚔️ Has sido ejecutado. Tu recompensa vuelve a 0' + (lost ? ' y pierdes ' + OP.fmtB(lost) : '') + '. Despertarás en tu isla.');
      s.dirty = true; s.saveDirty = true; this.saveChar(s); this.syncPublic(s);
    } else {
      const row = this.db.characterById(e.cid);
      if (row) {
        const d = this.game.migrate(JSON.parse(row.data));
        this.applyExecution(d, e.cid);
        const I = this.M.islands[d.home] || this.M.islands[0];
        const pos = this.game.portPos(I);
        d.x = pos.x; d.y = pos.y; d.boat = ''; d.hp = Math.round(this.MMO.stats(d).maxHp * 0.6);
        this.db.saveCharacter(e.cid, d);
      }
    }
    const sp = this.execSpot();
    this.broadcast('exec', { k: 'executed', cid: e.cid, name: e.name, bounty: e.bounty, x: sp.x, y: sp.y });
    this.news('capture', '⚔️ ' + e.name + ' ha sido EJECUTADO en público. Su recompensa de ' + OP.fmtB(e.bounty) + ' queda cancelada.' + (e.words ? ' Sus últimas palabras: «' + e.words + '».' : ''), 5);
    this.system('⚔️ ' + e.name + ' ha sido ejecutado.', 'exec');
    console.log('[ejecución] ' + e.name + ' ejecutado');
  };
  // cancelar sin castigo (orden del administrador)
  P.cancelExecution = function (cid) {
    const e = this.executions.get(cid);
    if (!e) return false;
    this.executions.delete(cid);
    if (e.rescue) this.cancelRescue(e, '');
    const sid = this.byCid.get(cid);
    const s = sid && this.ps.get(sid);
    if (s) { s.data.execution = null; this.toast(s, '📜 El Gobierno Mundial suspende tu ejecución. Eres libre.'); s.dirty = true; s.saveDirty = true; this.saveChar(s); this.syncPublic(s); }
    else { const row = this.db.characterById(cid); if (row) { const d = JSON.parse(row.data); d.execution = null; this.db.saveCharacter(cid, d); } }
    this.broadcast('exec', { k: 'cancel', cid, name: e.name });
    this.system('📜 Se suspende la ejecución de ' + e.name + '.', 'exec');
    return true;
  };
  // al conectarse: si le tocaba ejecución, vuelve a la plataforma (o, si ya pasó la hora, se aplica)
  P.execOnJoin = function (s) {
    const p = s.data;
    const spot = this.execSpot();
    s.client.send('exec', { k: 'list', items: this.execList(), spot: { x: spot.x, y: spot.y } });
    if (!p.execution) return;
    const e = this.executions.get(s.cid);
    if (!e || Date.now() >= p.execution.until) {
      if (e) this.executions.delete(s.cid);
      const lost = this.applyExecution(p, s.cid);
      const I = this.M.islands[p.home] || this.game.respawnIsland(p);
      const pos = this.game.portPos(I);
      p.x = pos.x; p.y = pos.y; p.boat = '';
      s.client.send('teleport', { x: p.x, y: p.y });
      this.toast(s, '⚔️ Fuiste ejecutado mientras no estabas. Tu recompensa vuelve a 0' + (lost ? ' (pierdes ' + this.OP.fmtB(lost) + ')' : '') + '.');
      s.dirty = true; s.saveDirty = true;
      return;
    }
    const sp = this.execSpot();
    p.x = sp.x; p.y = sp.y; p.boat = '';
    s.client.send('teleport', { x: p.x, y: p.y });
    this.broadcast('exec', Object.assign({ k: 'update' }, this.execInfo(e)));
    this.toast(s, '⛓️ Sigues encadenado en la plataforma de ejecución.');
  };

  // ======================================================================
  //  ÓRDENES DEL ADMINISTRADOR (chat con sesión de administrador desde este PC, o consola del servidor)
  // ======================================================================
  P.adminCommand = function (text, reply) {
    const [cmd, ...rest] = String(text || '').trim().split(/\s+/);
    const arg = rest.join(' ').trim();
    const c = cmd.toLowerCase().replace(/^\//, '');
    if (c === 'ayuda' || c === 'help') return reply('Órdenes: /forzar_ejecucion <nombre> · /cancelar_ejecucion <nombre> · /ejecuciones · /cambiar_clave <usuario> [nueva] · /reiniciar_era CONFIRMAR');
    if (c === 'cambiar_clave') {
      const [user, ...pw] = rest;
      if (!user) return reply('Uso: /cambiar_clave <usuario> [contraseña nueva]  (sin contraseña, se genera una temporal)');
      return reply(this.resetPassword(user, 0, pw.join(' ')).msg);
    }
    if (c === 'ejecuciones') { const L = this.execList(); return reply(L.length ? L.map((e) => e.name + ' (' + Math.ceil(e.left / 1000) + ' s' + (e.sid ? '' : ', desconectado') + ')').join(' · ') : 'No hay ninguna ejecución en marcha.'); }
    if (c === 'forzar_ejecucion' || c === 'cancelar_ejecucion') {
      if (!arg) return reply('Uso: /' + c + ' <nombre del personaje>');
      const want = slug(arg);
      const online = [...this.ps.values()].find((o) => slug(o.data.name) === want);
      const row = online ? null : this.db.allCharacters().find((r) => slug(r.name) === want);
      const cid = online ? online.cid : row ? Number(row.id) : 0;
      if (!cid) return reply('No hay ningún personaje llamado "' + arg + '".');
      if (c === 'cancelar_ejecucion') return reply(this.cancelExecution(cid) ? 'Ejecución suspendida.' : 'Ese personaje no está en ninguna ejecución.');
      return reply(this.forceExecutionCid(cid).msg);
    }
    if (c === 'reiniciar_era') {
      // la palabra CONFIRMAR es la confirmación: sin ella solo se avisa de lo que hace
      if (arg.toUpperCase() !== 'CONFIRMAR') {
        return reply('⚠️ /reiniciar_era BORRA TODOS los personajes y tripulaciones (las cuentas se quedan para crear personaje nuevo). Antes se hace una copia de seguridad. Para hacerlo de verdad escribe: /reiniciar_era CONFIRMAR');
      }
      try { return reply(this.newEra()); } catch (e) { console.error('[era] Error:', e); return reply('❌ Error al reiniciar la era: ' + e.message); }
    }
    return reply('Orden desconocida. Escribe /ayuda');
  };

  // forzar la ejecución de un personaje por su id (orden del administrador: chat, consola o panel)
  P.forceExecutionCid = function (cid) {
    if (this.executions.has(cid)) return { ok: false, msg: 'Ya está en la plataforma de ejecución.' };
    const sid = this.byCid.get(cid);
    const online = sid && this.ps.get(sid);
    const row = online ? null : this.db.characterById(cid);
    if (!online && !row) return { ok: false, msg: 'Ese personaje no existe.' };
    const ok = online ? this.startExecution(online, 'el Gobierno Mundial', true) : this.startExecutionOffline(row, 'el Gobierno Mundial');
    const name = online ? online.data.name : row.name;
    return { ok, msg: ok ? '⚔️ Empieza la ejecución pública de ' + name + (online ? '' : ' (no está conectado: si entra en 60 s aparecerá en la plataforma)') + '.' : 'No se pudo empezar.' };
  };

  // ---------- Nueva Era: copia de seguridad y todas las cuentas a cero ----------
  P.newEra = function () {
    const { OP } = this;
    const S = OP.S;
    this.saveAll();
    ctx.world.save();
    const file = this.db.backup('antes-nueva-era');
    console.log('[era] Copia de seguridad: ' + file);
    // fuera todos: primero se olvidan sus sesiones (así nada vuelve a guardar sus personajes) y luego se cierran
    const sessions = [...this.ps.values()];
    this.broadcast('era', { text: '🌅 ¡Comienza una NUEVA ERA! Todos los personajes se han reiniciado. Recarga para crear tu nuevo personaje.' });
    for (const s of sessions) { this.ps.delete(s.sid); this.state.players.delete(s.sid); }
    this.byCid.clear();
    this.engage.clear();
    setTimeout(() => { for (const s of sessions) { try { s.client.leave(4005); } catch (e) { /* ya cerrada */ } } }, 1500);
    // base de datos: fuera personajes y tripulaciones (las cuentas y sus sesiones se quedan)
    const n = this.db.wipePlayers();
    // mundo: nada que apunte a personajes que ya no existen
    this.crews.clear();
    this.executions.clear();
    this.pvpLog.clear();
    S.playerKing = null;
    S.playerYonkou = [];
    for (const d of S.isl) if (d.owner) d.owner = null;
    for (const fr of S.fruits) if ((fr.state === 'owned' || fr.state === 'carried') && !fr.owner) { fr.state = 'none'; fr.isl = -1; fr.x = null; fr.y = null; fr.ownerName = ''; }
    for (const a of S.agents) {
      if (a.pcCrew) this.releaseNpc(a);
      if ((a.prisonGuard || a.hunter) && a.loc === 'island') { a.prisonGuard = 0; a.hunter = 0; this.Sim.retire(a, 'Terminó la era'); }
    }
    this.honorCache = null; this.wantedCache = null;
    this.chatLog = [];
    this.news('world', '🌅 ¡Comienza una NUEVA ERA de la piratería! Todos los nombres del pasado han sido olvidados.', 5);
    ctx.world.save();
    console.log('[era] Nueva era: ' + n.characters + ' personajes y ' + n.crews + ' tripulaciones borrados');
    return '🌅 Nueva Era iniciada: ' + n.characters + ' personajes y ' + n.crews + ' tripulaciones borrados. Copia de seguridad en ' + file;
  };
}

module.exports = { install };
