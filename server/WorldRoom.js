/* La sala única del mundo: todos los jugadores comparten esta instancia.
   El servidor es 100% autoritativo: el cliente solo envía intenciones (dirección, "atacar a X",
   "explorar", "comprar Y") y aquí se comprueba y se decide todo. */
'use strict';
const { Room } = require('colyseus');
const { WorldState, PlayerState } = require('./schema');
const ctx = require('./context');

const SPEED = Math.max(0.25, Math.min(20, Number(process.env.OPW_SPEED) || 1));
const INPUT_MAX_PER_SEC = 40;     // mensajes por segundo antes de ignorar
const KICK_MAX_PER_SEC = 150;     // mensajes por segundo antes de expulsar
const SNAP_EVERY = 2;             // ticks entre instantáneas de NPC (10 por segundo)
const SHIP_TYPES = ['bote', 'carabela', 'bergantin', 'galeon', 'legendario', 'marine', 'almirante'];
const MMO_NEWBIE_LVL = 8;         // hasta este nivel ningún NPC te ataca por iniciativa propia

class WorldRoom extends Room {
  onCreate() {
    const { OP } = ctx;
    this.OP = OP; this.Sim = OP.Sim; this.MMO = OP.MMO; this.M = OP.M;
    this.game = ctx.game; this.db = ctx.db;
    ctx.room = this;
    this.autoDispose = false;
    this.maxClients = 500;
    this.setState(new WorldState());
    this.setPatchRate(100);

    this.ps = new Map();          // sessionId -> sesión del jugador
    this.byCid = new Map();       // id de personaje -> sessionId
    this.engage = new Map();      // id de NPC -> { sid, next, last }
    this.pvpLog = new Map();      // "asesino:víctima" -> hora (anti-granjeo)
    this.chatLog = [];
    this.tickN = 0;
    this.crews = new Map();
    for (const c of this.db.allCrews()) this.crews.set(c.id, c);
    this.initExecutions();   // ejecuciones públicas que quedaron a medias (server/execution.js)
    this.wantedCache = null; this.wantedAt = 0;
    this.event = null; this.nextEventAt = Date.now() + 4 * 60000;

    ctx.onNews = (n) => { if (n.imp >= 2) this.broadcast('news', this.newsItem(n)); };

    const on = (type, fn) => this.onMessage(type, (client, msg) => {
      const s = this.ps.get(client.sessionId);
      if (!s || !this.rate(s)) return;
      try { fn.call(this, s, msg || {}); } catch (e) { console.error('[sala] Error en mensaje ' + type + ':', e); }
    });
    on('input', this.onInput);
    on('attack', this.onAttack);
    on('action', this.onAction);
    on('use', this.onUse);
    on('buy', this.onBuy);
    on('pickup', this.onPickup);
    on('eat', this.onEat);
    on('ability', this.onAbility);
    on('chat', this.onChat);
    on('crew', this.onCrew);
    on('req', this.onReq);
    on('ping', (s, m) => s.client.send('pong', { t: m.t }));
    on('code', this.onCode);     // códigos de recompensa (cualquier jugador)
    on('sword', this.onSword);   // espadas: equipar, guardar, vender
    on('shiplook', this.onShipLook);   // personalizar el navío legendario
    on('bribe', (s, m) => this.bribe(s, m));   // sobornar a los guardias de Impel Down
    on('admin', this.onAdmin);   // panel de administrador: solo desde este PC y con clave (server/admin.js)
    on('lastwords', (s, m) => this.onLastWords(s, m));   // ejecución pública: últimas palabras del condenado
    on('rescue', (s, m) => this.onRescue(s, m));         // ejecución pública: mantener E junto a la plataforma
    on('trainhold', (s, m) => this.onTrainHold(s, m));   // entrenamiento continuo manteniendo T (server/training.js)
    on('haki', (s, m) => this.onHaki(s, m));             // activar Haki de Armadura / Observación / Rey (server/haki.js)
    on('zoan', (s) => this.onZoan(s));                   // transformación Zoan con la tecla C (server/zoan.js)
    on('door', (s, m) => this.onDoor(s, m));             // entrar / salir de edificios (server/interiors.js)
    on('talk', (s, m) => this.onTalk(s, m));             // hablar con NPC de los interiores y sus servicios
    // Órdenes de prueba: SOLO existen si el servidor arranca con OPW_DEV=1 (nunca en el juego normal)
    if (process.env.OPW_DEV === '1') on('dev', this.onDev);
    // Cualquier otro tipo de mensaje se ignora y se cuenta (sin esto, Colyseus 0.15 deja de procesar esa conexión)
    this.onMessage('*', (client, type) => {
      const s = this.ps.get(client.sessionId);
      if (!s) return;
      this.strike(s, 'mensaje no permitido "' + String(type).slice(0, 20) + '"');
    });

    this.setSimulationInterval((dt) => this.tick(dt), this.MMO.TICK_MS);
    this.clock.setInterval(() => this.saveAll(), 30000);
    this.clock.setInterval(() => ctx.world.save(), 120000);
    console.log('[sala] Mundo compartido abierto' + (SPEED !== 1 ? ' (simulación x' + SPEED + ')' : ''));
  }

  // ======================================================================
  //  CONEXIÓN
  // ======================================================================
  onAuth(client, options, request) {
    const acc = ctx.auth.accountFromToken(options && options.token);
    if (!acc) throw new Error('Sesión no válida');
    const row = this.db.characterByAccount(acc.id);
    if (!row) throw new Error('Esta cuenta aún no tiene personaje');
    // dirección real de la conexión (el panel de administrador solo funciona desde este PC)
    // (si llega a través de un túnel o proxy, la cabecera de reenvío manda: así nadie de fuera pasa por "localhost")
    const fwd = request && request.headers && (request.headers['cf-connecting-ip'] || request.headers['x-forwarded-for'] || request.headers['x-real-ip'] || request.headers.forwarded);
    const ip = fwd ? String(fwd).split(',')[0].trim() : request && request.socket ? request.socket.remoteAddress : '';
    return { accountId: acc.id, username: acc.username, cid: Number(row.id), ip };
  }

  onJoin(client, options, auth) {
    const { game } = this;
    // ¿ya estaba conectado en otra pestaña? se cierra la vieja y se usa su estado (más reciente que la base de datos)
    let data = null;
    const oldSid = this.byCid.get(auth.cid);
    if (oldSid && this.ps.has(oldSid)) {
      const old = this.ps.get(oldSid);
      data = old.data;
      old.replaced = true;
      this.removeSession(old, false);
      try { old.client.leave(4001); } catch (e) { /* ya cerrada */ }
    }
    if (!data) data = game.migrate(JSON.parse(this.db.characterById(auth.cid).data));
    this.fixPosition(data);
    // el título de Rey se guarda en el mundo: aquí se decide si este personaje lo tiene
    const K = this.OP.S.playerKing;
    data.king = !!(K && K.cid === auth.cid);
    if (!data.king && data.epithet === 'Rey de los Piratas') data.epithet = data.prevEpithet || '';

    const st = new PlayerState();
    const s = {
      sid: client.sessionId, client, cid: auth.cid, accountId: auth.accountId, ip: auth.ip || '', admin: false, data, st,
      input: { dx: 0, dy: 0 }, nextAttack: 0, nextUse: 0, cds: {}, knownN: new Map(), knownU: new Set(),
      msgSec: 0, msgCount: 0, strikes: 0, lastIsl: -1, lastCombat: 0, dirty: true, saveDirty: true,
      chatTimes: [], invite: null, respawnAt: 0, lastBlockMsg: 0, joinedAt: Date.now()
    };
    this.ps.set(client.sessionId, s);
    this.byCid.set(auth.cid, client.sessionId);
    this.syncPublic(s);
    this.state.players.set(client.sessionId, st);
    const I = this.MMO.islandAt(data.x, data.y);
    s.lastIsl = I ? I.idx : -1;

    client.send('welcome', {
      sid: client.sessionId, cid: auth.cid,
      discovered: this.OP.S.isl.map((d) => (d.discovered ? 1 : 0)),
      chat: this.chatLog.slice(-40),
      news: this.newsList(80),
      event: this.event ? this.event.text : '',
      firstLogin: !data.lastSeen || data.lastSeen === data.created
    });
    // si sigue preso, vuelve a su celda con sus guardias
    if (data.prison) { const PI = this.prisonIsland(); const J = this.MMO.islandAt(data.x, data.y); if (!J || J.idx !== PI.idx) this.enterPrison(s); else this.spawnPrisonGuards(s); }
    this.execOnJoin(s);   // ejecuciones en marcha (y si este jugador estaba en la plataforma, vuelve a ella)
    if (data.conqNew) {   // acaba de "nacer" con el Haki del Rey (10%)
      data.conqNew = false;
      setTimeout(() => { if (this.ps.has(s.sid)) this.toast(s, '⚡ ¡Naciste con el HAKI DEL REY! Solo 1 de cada 10 lo tiene. Púlsalo con la tecla V.'); }, 2500);
      this.game.moment(data, 'Descubrió que había nacido con el Haki del Rey', 60);
    }
    this.sendMe(s);
    this.sendCrew(s);
    this.system(data.name + ' se ha conectado.', 'join');
    data.lastSeen = Date.now();
  }

  onLeave(client) {
    const s = this.ps.get(client.sessionId);
    if (!s || s.replaced) return;
    this.removeSession(s, true);
    this.system(s.data.name + ' se ha desconectado.', 'join');
  }

  removeSession(s, save) {
    s.data.lastSeen = Date.now();
    for (const o of this.ps.values()) if (o.ride === s.sid) this.leaveRide(o, 'boat');   // sus pasajeros siguen con su barco
    s.ride = null;
    for (const [id, e] of this.engage) if (e.sid === s.sid) this.engage.delete(id);
    if (save) this.saveChar(s);
    this.ps.delete(s.sid);
    if (this.byCid.get(s.cid) === s.sid) this.byCid.delete(s.cid);
    this.state.players.delete(s.sid);
  }

  onDispose() { this.saveAll(); ctx.world.save(); console.log('[sala] Mundo cerrado y guardado'); }

  // Si la posición guardada no es válida, vuelve al puerto de su isla
  fixPosition(p) {
    const { M, OP } = this;
    const i = Math.floor(p.y) * M.W + Math.floor(p.x);
    const t = M.t[i];
    let ok = Number.isFinite(p.x) && Number.isFinite(p.y) && i >= 0 && i < M.N && !OP.isRed(t);
    if (ok && OP.isLand(t)) p.boat = '';
    else if (ok) { ok = M.clsM[i] > 0; if (ok) { p.wcls = M.clsM[i]; if (!p.boat) p.boat = this.MMO.shipOf(p, this.crewShip(p)); } }
    if (!ok) {
      const I = M.islands[p.home] || M.islands[0];
      const pos = this.game.portPos(I);
      p.x = pos.x; p.y = pos.y; p.boat = ''; p.wcls = I.sky ? 2 : I.deep ? 3 : 1;
    }
  }

  rate(s) {
    const sec = Math.floor(Date.now() / 1000);
    if (sec !== s.msgSec) { s.msgSec = sec; s.msgCount = 0; }
    s.msgCount++;
    if (s.msgCount > KICK_MAX_PER_SEC) { console.warn('[anticheat] Expulsado por flood:', s.data.name); s.client.leave(4002); return false; }
    return s.msgCount <= INPUT_MAX_PER_SEC;
  }
  strike(s, why) {
    s.strikes++;
    if (s.strikes % 10 === 1) console.warn('[anticheat] ' + s.data.name + ': ' + why + ' (' + s.strikes + ')');
    if (s.strikes > 60) s.client.leave(4003);
  }

  // ======================================================================
  //  BUCLE PRINCIPAL (20 veces por segundo)
  // ======================================================================
  tick(dtMs) {
    const dt = Math.min(0.25, Math.max(0, dtMs / 1000));
    const now = Date.now();
    this.tickN++;
    ctx.world.advance(dt * SPEED);
    this.state.time = Math.round(this.OP.S.time * 10) / 10;
    for (const s of this.ps.values()) this.tickPlayer(s, dt, now);
    this.tickExecutions(now);
    this.tickEngagements(dt, now);
    if (this.tickN % 20 === 0) this.aggroScan(now);
    if (this.tickN % 4 === 0) this.tickCompanions(dt * 4, now);
    if (this.tickN % SNAP_EVERY === 0) for (const s of this.ps.values()) this.sendSnapshot(s, now);
    if (this.tickN % 5 === 0) for (const s of this.ps.values()) if (s.dirty) this.sendMe(s);
    if (this.tickN % 20 === 0) { this.tickEvents(now); this.ensureFruitSpots(); }
    if (this.tickN % 300 === 1) this.tickBandits();
    if (this.tickN % 1200 === 5 || (this.hierarchyDue && this.tickN % 100 === 0)) { this.hierarchyDue = false; try { this.updateMarineHierarchy(); } catch (e) { console.error('[marina] Error en los altos mandos:', e.message); } }
    if (this.tickN % 20 === 7) this.checkNewFruits();
    if (this.tickN % 1200 === 600) { try { this.tickFruitPity(now); } catch (e) { console.error('[frutas] Error:', e.message); } }   // frutas cerca de los jugadores (server/fruits.js)
    if (this.tickN % 100 === 13) this.tickTraitors(now);
    if (this.tickN % 1200 === 30) { try { this.updateYonkou(); this.tickTerritories(now); } catch (e) { console.error('[territorios] Error:', e.message); } }
  }

  // ======================================================================
  //  BANDIDOS PARA NOVATOS: enemigos de nivel 1-3 que se quedan en las islas de los cuatro mares
  // ======================================================================
  tickBandits() {
    const { OP, Sim } = this;
    const S = OP.S;
    const R = OP.R;
    const per = {}, perC = {};
    const BANDITS_PER_ISLAND = 3;   // antes 1: casi nunca había a quién pegar
    // enemigos comunes de la Grand Line: también se reponen solos, del nivel de su isla
    for (const a of S.agents) {
      if (!a.common) continue;
      const u = S.U[a.unit];
      if (!u || !u.camp) { a.common = false; continue; }
      if (a.loc !== 'island') continue;
      if ((perC[a.isl] || 0) >= 2) { Sim.retire(a, 'Se marchó de la isla'); continue; }
      perC[a.isl] = (perC[a.isl] || 0) + 1;
    }
    for (const I of this.M.islands) {
      if (OP.BLUES.indexOf(I.sea) >= 0 || I.hidden || I.prison || I.land.length < 20 || I.calm) continue;
      const k0 = this.MMO.routeIndex[I.id];
      const baseLvl = k0 != null ? this.MMO.LOG_ROUTE[k0].lvl : Math.max(12, (I.danger || 3) * 6);
      for (let k = perC[I.idx] || 0; k < 2; k++) {
        const a = Sim.createAgent({ faction: 'pirate', isl: I.idx, lvl: Math.max(5, baseLvl + R.i(-3, 2)), money: R.i(2, 20) * 5000 });
        a.common = true;
        a.name = R.pick(['Pirata errante', 'Matón del puerto', 'Mercenario', 'Cazador furtivo', 'Corsario sin bandera']) + ' ' + a.name.split(' ')[0];
        a.pers.agg = 0.6; a.pers.amb = 0.2;
        const u = Sim.createUnit({ faction: 'pirate', solo: true, isl: I.idx }); u.camp = true; Sim.addMember(u, a);
        const pos = this.game.portPos(I);
        for (let t = 0; t < 20; t++) {
          const x = pos.x + (R.next() - 0.5) * 12, y = pos.y + (R.next() - 0.5) * 12, j = Math.floor(y) * this.M.W + Math.floor(x);
          if (this.M.isl[j] === I.idx && OP.isLand(this.M.t[j]) && Math.hypot(x - pos.x, y - pos.y) > 3) { a.x = x; a.y = y; break; }
        }
      }
    }
    for (const a of S.agents) {
      if (!a.bandit) continue;
      const u = S.U[a.unit];
      if (!u || !u.camp) { a.bandit = false; continue; }                       // se unió a una tripulación: ahora es un pirata normal
      if (a.loc !== 'island') continue;
      // siempre rivales de novato: nivel 1-3 y tan flojos como un bandido recién salido (si había crecido, vuelve a empezar)
      if (a.lvl > 3 || !a.banditWeak) {
        Sim.setLevel(a, a.lvl > 3 ? R.weighted([1, 2, 3], (l) => [0, 5, 4, 2][l]) : a.lvl);
        a.str = Math.max(4, Math.round(a.str * 0.65)); a.spd = Math.max(4, Math.round(a.spd * 0.7));
        a.maxHp = Math.max(25, Math.round(a.maxHp * 0.6)); a.hp = a.maxHp;
        a.banditWeak = true;
      }
      const I0 = this.M.islands[a.isl];
      // como mucho uno por isla (ya no participan en las batallas del mundo, así que no molestan a las bases)
      if ((per[a.isl] || 0) >= BANDITS_PER_ISLAND || !I0) { Sim.retire(a, 'Dejó la vida de bandido'); continue; }
      per[a.isl] = (per[a.isl] || 0) + 1;
    }
    let made = 0;
    for (const I of this.M.islands) {
      if (OP.BLUES.indexOf(I.sea) < 0 || I.hidden || I.prison || I.land.length < 20) continue;
      const want = BANDITS_PER_ISLAND;   // rivales para novatos en cada isla de los cuatro mares
      for (let k = per[I.idx] || 0; k < want && made < 120; k++) {
        const a = Sim.createAgent({ faction: 'pirate', isl: I.idx, lvl: R.weighted([1, 2, 3], (l) => [0, 5, 4, 2][l]), money: R.i(1, 8) * 1000 });
        a.bandit = true;
        // más flojos que un NPC normal de su nivel: rivales justos para un personaje recién creado
        a.str = Math.max(4, Math.round(a.str * 0.65)); a.spd = Math.max(4, Math.round(a.spd * 0.7));
        a.maxHp = Math.max(25, Math.round(a.maxHp * 0.6)); a.hp = a.maxHp;
        a.banditWeak = true;
        a.name = R.pick(['Bandido', 'Ratero', 'Matón', 'Saqueador', 'Bravucón']) + ' ' + a.name.split(' ')[0];
        a.pers.agg = 0.3; a.pers.amb = 0.1; a.pers.soc = 0.2;
        a.dream = 'dinero'; a.quote = 'Dame todo lo que lleves encima.';
        const u = Sim.createUnit({ faction: 'pirate', solo: true, isl: I.idx });
        u.camp = true;
        Sim.addMember(u, a);
        // cerca del puerto, que es donde aparecen los jugadores nuevos
        const pos = this.game.portPos(I);
        for (let k = 0; k < 20; k++) {
          const x = pos.x + (R.next() - 0.5) * 8, y = pos.y + (R.next() - 0.5) * 8;
          const j = Math.floor(y) * this.M.W + Math.floor(x);
          if (this.M.isl[j] === I.idx && OP.isLand(this.M.t[j]) && Math.hypot(x - pos.x, y - pos.y) > 2) { a.x = x; a.y = y; break; }
        }
        made++;
      }
    }
    if (made && process.env.OPW_VERBOSE) console.log('[mundo] ' + made + ' bandidos nuevos');
  }

  tickPlayer(s, dt, now) {
    const { MMO } = this;
    const p = s.data;
    if (s.st.dead) { if (now >= s.respawnAt) this.respawn(s); return; }
    // en la plataforma de ejecución: encadenado (no se mueve ni se cura)
    if (p.execution) {
      const sp = this.execSpot();
      if (p.x !== sp.x || p.y !== sp.y || p.boat) { p.x = sp.x; p.y = sp.y; p.boat = ''; }
      s.input.dx = 0; s.input.dy = 0; s.st.moving = false; s.st.fighting = false;
      this.syncPublic(s);
      return;
    }
    this.tickHaki(s, now);                          // Haki activos: duración, aturdimiento (server/haki.js)
    this.tickZoan(s, now);                          // fin de la transformación Zoan (server/zoan.js)
    if (p.inside) { this.tickInside(s, dt); return; }   // dentro de un edificio: se mueve por la habitación (server/interiors.js)
    this.tickStay(s);                               // misiones de supervivencia: tiempo de juego en islas extremas
    if (this.tickTraining(s, dt, now)) return;      // manteniendo T: entrena sin moverse (server/training.js)
    if (s.stunUntil > now) { s.input.dx = 0; s.input.dy = 0; s.st.moving = false; this.syncPublic(s); return; }   // aturdido por un Haki del Rey
    // datos para la ruta del Log Pose (poder, tamaño de tripulación, Yonkou): se refrescan una vez por segundo
    if (this.tickN % 20 === 0 || p.powerNow == null) {
      p.powerNow = Math.round(MMO.power(p));
      p.crewSize = this.crewSizeOf(p);
      p.yonkou = this.isYonkou(p);
    }
    // movimiento: el servidor integra la dirección pedida con la velocidad real del personaje
    const { dx, dy } = s.input;
    let moved = false;
    if (s.ride) {
      // de pasajero: va donde va el barco del compañero (sus teclas no mueven nada)
      moved = this.followRide(s);
    } else if (dx || dy) {
      const bx = p.x, by = p.y;
      moved = MMO.step(p, dx, dy, dt, MMO.shipOf(p, this.crewShip(p)));
      // preso en Impel Down: los muros no dejan salir al mar (hay que vencer a los guardias o sobornarlos)
      if (p.prison && p.boat) { p.x = bx; p.y = by; p.boat = ''; moved = false; if (now - s.lastBlockMsg > 2500) { s.lastBlockMsg = now; this.toast(s, '⛓️ Los muros de Impel Down te lo impiden: derrota a los guardias o sobórnalos.'); } }
      const maxStep = (maxSpeed(this.OP, MMO) + 0.5) * dt + 0.05;
      if (Math.hypot(p.x - bx, p.y - by) > maxStep) { p.x = bx; p.y = by; this.strike(s, 'paso demasiado largo'); moved = false; }
      if (!moved && now - s.lastBlockMsg > 2500) {
        const L = Math.hypot(dx, dy);
        const why = MMO.blockReason(p, p.x + dx / L * 0.8, p.y + dy / L * 0.8);
        if (why) { s.lastBlockMsg = now; this.toast(s, why); }
      }
      if (moved) { s.saveDirty = true; if (Math.abs(dx) > 0.2) s.st.dir = dx < 0 ? -1 : 1; }
    }
    s.st.moving = moved;
    if (moved) this.afterMove(s);
    // bonus de EXP de la isla de aparición (cuenta tiempo conectado)
    if (p.buffs.length) {
      for (const b of p.buffs) b.msLeft -= dt * 1000;
      const before = p.buffs.length;
      p.buffs = p.buffs.filter((b) => b.msLeft > 0);
      if (p.buffs.length !== before) { this.toast(s, '⏳ Se acabó tu bonus de EXP.'); s.dirty = true; }
      if (this.tickN % 20 === 0) s.dirty = true;
    }
    // curación lenta fuera de combate
    const st = MMO.stats(p);
    if (p.hp < st.maxHp && now - s.lastCombat > 8000 && this.tickN % 10 === 0) {
      const I = !p.boat && MMO.islandAt(p.x, p.y);
      const rate = 0.012 * (I && I.hospital ? 2 : 1) * (p.talent === 'Médico' ? 1.6 : 1);
      p.hp = Math.min(st.maxHp, p.hp + Math.max(1, st.maxHp * rate * 0.5));
      s.dirty = true;
    }
    s.st.fighting = now - s.lastCombat < 4000;
    this.syncPublic(s);
  }

  // ---------- Supervivencia: días de juego seguidos en Drum, Alabasta, Punk Hazard o Wano (entrenar allí cuenta el doble) ----------
  tickStay(s) {
    if (this.tickN % 20 !== 3) return;
    const { MMO } = this;
    const p = s.data, T = this.OP.S.time;
    const last = s.stayT;
    s.stayT = T;
    if (last == null || p.boat || p.inside) return;
    const I = MMO.islandAt(p.x, p.y);
    if (!I || MMO.STAY_ISLANDS.indexOf(I.id) < 0) return;
    p.stays = p.stays || {};
    p.stays[I.id] = (p.stays[I.id] || 0) + Math.max(0, T - last) / MMO.SIM_PER_DAY * (s.training ? 2 : 1);
    s.dirty = true;
    if (this.tickN % 200 === 3) this.checkQuests(s);
  }

  // ---------- Tamaño de la tripulación y Yonkou (para el Log Pose y los territorios) ----------
  crewSizeOf(p) {
    const c = p.crewId && this.crews.get(p.crewId);
    if (c) return c.members.length + this.crewNpcs(c).length + (c.fleets || []).reduce((t, f) => t + f.members.length, 0);
    const u = p.npcCrew && this.OP.S.U[p.npcCrew];   // miembro de una tripulación NPC
    if (u) return 1 + u.members.length;
    return 1;
  }
  isYonkou(p) {
    const Y = this.OP.S.playerYonkou || [];
    return !!(p.crewId && Y.indexOf(p.crewId) >= 0);
  }

  // ---------- Viajar en el barco de un compañero de tripulación ----------
  boardShip(s, sid) {
    const p = s.data;
    const t = this.ps.get(String(sid));
    if (!t || t === s) return this.toast(s, 'Ese jugador no está conectado.');
    const q = t.data;
    if (p.prison) return this.toast(s, '⛓️ Estás preso en Impel Down.');
    if (p.execution) return this.toast(s, '⛓️ Estás encadenado en la plataforma de ejecución.');
    if (!p.crewId || p.crewId !== q.crewId) return this.toast(s, 'Solo puedes subir al barco de alguien de tu tripulación.');
    if (s.st.dead || t.st.dead) return;
    if (t.ride) return this.toast(s, q.name + ' también va de pasajero en otro barco.');
    if (!q.boat) return this.toast(s, q.name + ' no está en su barco: espera a que zarpe (que entre en el agua).');
    if (Math.hypot(p.x - q.x, p.y - q.y) > this.MMO.BOARD_RANGE) return this.toast(s, 'Acércate más al barco de ' + q.name + ' (como mucho ' + this.MMO.BOARD_RANGE + ' casillas).');
    let n = 0; for (const o of this.ps.values()) if (o.ride === t.sid) n++;
    const cap = (this.OP.SHIPS[q.boat] || {}).cap || 4;
    if (n >= Math.max(2, Math.min(cap, 12))) return this.toast(s, 'El barco de ' + q.name + ' va lleno.');
    for (const o of this.ps.values()) if (o.ride === s.sid) this.leaveRide(o, 'boat');   // si alguien iba en TU barco, se queda con el suyo
    s.ride = t.sid; s.st.ride = t.sid;
    s.input.dx = 0; s.input.dy = 0;
    this.followRide(s);
    this.toast(s, '⛵ Subes al barco de ' + q.name + '. Iréis juntos; bajas cuando llegue a tierra o con "Bajar del barco".');
    this.toast(t, '⛵ ' + p.name + ' sube a tu barco.');
    s.dirty = true;
  }
  followRide(s) {
    const p = s.data;
    const t = this.ps.get(s.ride);
    if (!t || t.st.dead || !t.data.crewId || t.data.crewId !== p.crewId) { this.leaveRide(s, 'boat'); return false; }
    const q = t.data;
    const moved = Math.abs(p.x - q.x) > 1e-3 || Math.abs(p.y - q.y) > 1e-3;
    p.x = q.x; p.y = q.y; p.wcls = q.wcls;
    if (!q.boat) { this.leaveRide(s, 'land'); return true; }   // el barco ha llegado a tierra: bajan todos
    p.boat = q.boat;
    s.st.dir = t.st.dir;
    if (moved) s.saveDirty = true;
    return moved;
  }
  // how: 'land' = desembarca donde está el barco (en tierra o en la orilla más cercana); 'boat' = sigue con su propio barco
  leaveRide(s, how) {
    const { M, OP, MMO } = this;
    const p = s.data;
    const host = this.ps.get(s.ride);
    s.ride = null; s.st.ride = '';
    if (how === 'land') {
      const i = Math.floor(p.y) * M.W + Math.floor(p.x);
      if (!OP.isLand(M.t[i])) {
        // buscar la casilla de tierra más cercana (hasta 3 casillas)
        let best = null, bd = 99;
        for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
          const x = Math.floor(p.x) + ox, y = Math.floor(p.y) + oy, j = y * M.W + x;
          if (OP.isLand(M.t[j]) && M.isl[j] >= 0) { const d = Math.hypot(ox, oy); if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; } }
        }
        if (!best) { how = 'boat'; this.toast(s, 'No hay tierra cerca: sigues navegando con tu propio barco.'); }
        else { p.x = best[0]; p.y = best[1]; }
      }
      if (how === 'land') { p.boat = ''; this.toast(s, '🏝 Desembarcas' + (host ? ' del barco de ' + host.data.name : '') + '.'); }
    }
    if (how === 'boat') { p.boat = MMO.shipOf(p, this.crewShip(p)); if (host) this.toast(s, '⛵ Dejas el barco de ' + host.data.name + ' y sigues con el tuyo.'); }
    s.client.send('teleport', { x: p.x, y: p.y });
    s.dirty = true; s.saveDirty = true;
    this.syncPublic(s);
    this.afterMove(s);
  }

  afterMove(s) {
    const { MMO, OP, game } = this;
    const p = s.data;
    const zone = MMO.zoneOf(p.x, p.y);
    if (zone !== 'calm' && p.zones.indexOf(zone) < 0) {
      p.zones.push(zone);
      const nm = OP.SEAS[zone] ? OP.SEAS[zone].name : zone;
      this.toast(s, '🌊 Has llegado a ' + nm + ' por primera vez.');
      if (zone === 'paradise' || zone === 'newworld' || zone === 'sky' || zone === 'deep') game.moment(p, 'Llegó a ' + nm, zone === 'newworld' ? 50 : 30);
      if (zone === 'paradise' || zone === 'newworld') this.news('world', '¡' + p.name + ' ha llegado a ' + nm + '!', 2);
      this.checkQuests(s);
    }
    if (p.boat) { s.lastIsl = -1; return; }
    const I = MMO.islandAt(p.x, p.y);
    if (!I || I.idx === s.lastIsl) return;
    s.lastIsl = I.idx;
    if (p.visited.indexOf(I.idx) < 0) {
      p.visited.push(I.idx);
      const zm = OP.ZONE_MULT[I.sea] || 1;
      const r = game.gainXp(p, (40 + I.danger * 15) * zm);
      this.toast(s, '🏝 Descubres ' + I.name + ' (+' + r.gained + ' EXP)');
      game.addLog(p, 'Desembarcó por primera vez en ' + I.name + '.');
      this.onLevels(s, r);
      if (I.hidden && !this.OP.S.isl[I.idx].discovered) {
        this.news('laughtale', '¡' + p.name + ' ha pisado LAUGH TALE, la isla del tesoro del Rey de los Piratas!', 4);
        game.gainXp(p, 100000, { raw: true });
        game.moment(p, 'Pisó Laugh Tale', 100);
      }
      this.checkQuests(s);
    } else this.toast(s, '📍 ' + I.name);
    s.dirty = true;
  }

  respawn(s) {
    const p = s.data;
    if (p.prison) {   // capturado: despierta en su celda de Impel Down
      p.hp = Math.round(this.MMO.stats(p).maxHp * 0.6);
      s.st.dead = false;
      this.enterPrison(s);
      this.syncPublic(s);
      return;
    }
    // tras una ejecución pública se despierta en su isla de origen (no en el puerto de Marineford)
    const I = (s.respawnHome && this.M.islands[p.home]) || this.game.respawnIsland(p);
    s.respawnHome = false;
    const pos = this.game.portPos(I);
    s.ride = null; s.st.ride = '';   // si iba de pasajero, despierta en tierra y ya no sigue al barco
    p.x = pos.x; p.y = pos.y; p.boat = ''; p.wcls = I.sky ? 2 : I.deep ? 3 : 1;
    p.hp = Math.round(this.MMO.stats(p).maxHp * 0.6);
    s.st.dead = false;
    s.lastIsl = I.idx;
    s.dirty = true; s.saveDirty = true;
    this.toast(s, '💫 Despiertas en ' + I.name + '.');
    s.client.send('teleport', { x: p.x, y: p.y });
    this.syncPublic(s);
  }

  syncPublic(s) {
    const p = s.data, st = s.st;
    const stats = this.MMO.stats(p);
    const crew = p.crewId ? this.crews.get(p.crewId) : null;
    st.cid = s.cid; st.name = p.name; st.faction = p.faction; st.lvl = p.lvl;
    st.hp = Math.max(0, Math.round(p.hp)); st.maxHp = stats.maxHp;
    st.x = Math.round(p.x * 100) / 100; st.y = Math.round(p.y * 100) / 100;
    if (p.inside) { st.x = Math.round((s.ix || 0) * 100) / 100; st.y = Math.round((s.iy || 0) * 100) / 100; }   // dentro de un edificio: posición en la sala
    st.boat = p.boat || ''; st.bounty = p.bounty; st.rank = p.rank;
    const fleet = crew ? this.fleetOf(crew, s.cid) : null;
    const npcU = !crew && p.npcCrew ? this.OP.S.U[p.npcCrew] : null;   // miembro de una tripulación NPC
    const cname = crew ? crew.name + (fleet ? ' · ' + fleet.name + (fleet.captain === s.cid ? ' (Almirante de Flota)' : '') : '') : npcU ? npcU.name : '';
    st.crewId = crew ? crew.id : 0; if (st.crewName !== cname) st.crewName = cname; st.captain = !!crew && crew.captain === s.cid;
    const L0 = p.shipLook;
    const look = L0 && p.ships.indexOf('legendario') >= 0 ? [L0.hull, L0.sail, L0.flagBg, L0.fg, L0.sym].join('|') : '';
    if (st.shipLook !== look) st.shipLook = look;
    const a = p.app, L = st.look;
    if (L.skin !== a.skin) L.skin = a.skin; if (L.hair !== a.hair) L.hair = a.hair; if (L.hairColor !== a.hairColor) L.hairColor = a.hairColor;
    if (L.cloth !== a.cloth) L.cloth = a.cloth; if (L.acc !== a.acc) L.acc = a.acc; if (L.build !== a.build) L.build = a.build;
  }

  // Datos privados: solo los recibe el propio jugador
  sendMe(s) {
    const { MMO } = this;
    const p = s.data;
    const st = MMO.stats(p);
    const q = MMO.currentQuest(p);
    s.dirty = false;
    s.client.send('me', {
      cid: s.cid, name: p.name, faction: p.faction, lvl: p.lvl, xp: p.xp, xpNeed: MMO.xpNeed(p.lvl), age: p.age, epithet: p.epithet || '',
      hp: Math.round(p.hp), maxHp: st.maxHp, str: st.str, spd: st.spd, power: Math.round(MMO.power(p)),
      money: p.money, bounty: p.bounty, rank: p.rank, merit: Math.round(p.merit),
      talent: p.talent, traits: p.traits, dream: p.dream, quote: p.quote, perk: p.perk, spawnIsland: p.spawnIsland, spawnSea: p.spawnSea, home: p.home,
      buffs: p.buffs.map((b) => ({ mult: b.mult, msLeft: Math.round(b.msLeft), src: b.src })), xpMult: this.game.xpMult(p),
      inv: p.inv, ships: p.ships, ship: MMO.shipOf(p, this.crewShip(p)), logpose: p.logpose, coated: p.coated, fruit: p.fruit,
      visited: p.visited, zones: p.zones, stats: p.stats, questsDone: p.questsDone, trainedAt: p.trainedAt,
      quest: q ? { id: q.id, kind: q.kind || 'dream', text: q.text, hint: this.questHint(p, q), cur: Math.min(q.goal, MMO.statValue(p, q.stat)), goal: q.goal, xp: q.xp, money: q.money } : null,
      cds: { explore: Math.max(0, (s.cds.explore || 0) - Date.now()), train: Math.max(0, (s.cds.train || 0) - Date.now()), ability: Math.max(0, (s.cds.ability || 0) - Date.now()), job: Math.max(0, (s.cds.job || 0) - Date.now()) },
      sword: p.sword || '',
      buffLeft: s.abBuff ? Math.max(0, s.abBuff.until - Date.now()) : 0,
      x: p.x, y: p.y, boat: p.boat, wcls: p.wcls, crewId: p.crewId, log: p.log.slice(0, 12), moments: p.moments, honor: p.honor || null,
      king: !!p.king, empBeaten: (p.empBeaten || []).length, bountyLog: p.bountyLog || [],
      crewSize: p.crewSize || 1, yonkou: !!p.yonkou, powerNow: p.powerNow || 0,
      prison: p.prison || null,
      execution: p.execution ? { left: Math.max(0, p.execution.until - Date.now()), by: p.execution.by, words: p.execution.words || '' } : null,
      traitor: p.traitor ? { name: p.traitor.name, left: Math.max(0, p.traitor.until - Date.now()) } : null, infamy: p.infamy || 0,
      npcCrew: p.npcCrew || 0, npcCrewName: p.npcCrew && this.OP.S.U[p.npcCrew] ? this.OP.S.U[p.npcCrew].name : '',
      territoryKind: this.territoryKind(s, p.crewId && this.crews.get(p.crewId)),
      shipLook: p.shipLook || null, notifier: !!p.notifier, fruitNotes: (p.notifier && this.OP.S.fruitNotes) || [],
      haki: p.haki || [false, false, false], powerTrain: p.powerTrain || 0, trainFocus: p.trainFocus || 'str', codesUsed: p.codesUsed || [],
      // entrenamiento continuo (decimales para verlo subir en tiempo real) y Haki activo
      training: !!s.training, trained: p.trained || { str: 0, spd: 0, hp: 0, power: 0 }, trainCap: MMO.trainCap(p),
      baseStr: Math.round(p.baseStr * 100) / 100, baseSpd: Math.round(p.baseSpd * 100) / 100, baseHp: Math.round(p.baseHp * 100) / 100,
      hakiXp: p.hakiXp || { arm: 0, obs: 0, conq: 0 }, conqBorn: !!p.conqBorn,
      hakiCds: { arm: Math.max(0, (s.cds.harm || 0) - Date.now()), obs: Math.max(0, (s.cds.hobs || 0) - Date.now()), conq: Math.max(0, (s.cds.hconq || 0) - Date.now()) },
      hakiOn: { arm: s.st.armor ? Math.max(0, (s.armorUntil || 0) - Date.now()) : 0, obs: s.st.obs ? Math.max(0, (s.obsUntil || 0) - Date.now()) : 0 },
      zoanOn: p.zoanOn || null, zoanLeft: p.zoanOn ? Math.max(0, (s.zoanUntil || 0) - Date.now()) : 0, zoanCd: Math.max(0, (s.cds.zoan || 0) - Date.now()),
      carrying: !!p.carrying, prop: s.st.prop || '', stays: p.stays || {},
      inside: p.inside ? { room: p.inside.room, kind: p.inside.kind, isl: p.inside.isl, name: p.inside.name } : null, coatTalk: !!p.coatTalk,
      hakiCd: Math.max(0, (s.cds.haki || 0) - Date.now()), local: require('./admin').isLocal(s.ip)
    });
  }

  // ======================================================================
  //  INSTANTÁNEAS DE NPC (solo lo que está cerca de cada jugador)
  // ======================================================================
  sendSnapshot(s, now) {
    const { OP, MMO } = this;
    const S = OP.S;
    const px = s.data.x, py = s.data.y;
    const VX = MMO.VIEW_X, VY = MMO.VIEW_Y;
    const n = [], ni = [], sh = [], ui = [], b = [];
    for (const a of S.agents) {
      if (a.loc !== 'island' || Math.abs(a.x - px) > VX || Math.abs(a.y - py) > VY) continue;
      const flags = (a.faction === 'marine' ? 1 : 0) | (a.tx != null ? 2 : 0) | (a.battle ? 4 : 0) | (a._ko > now ? 8 : 0) | (this.engage.has(a.id) ? 16 : 0);
      n.push([a.id, Math.round(a.x * 100), Math.round(a.y * 100), flags, Math.round(100 * a.hp / a.maxHp)]);
      if (s.knownN.get(a.id) !== a.lvl + ':' + a.bounty) {
        s.knownN.set(a.id, a.lvl + ':' + a.bounty);
        ni.push({ id: a.id, n: a.name, f: a.faction, l: a.lvl, app: a.app, b: a.bounty, r: a.rank, e: a.epithet, u: a.unit });
      }
    }
    for (const x of S.ships) {
      if (Math.abs(x.x - px) > VX + 4 || Math.abs(x.y - py) > VY + 4) continue;
      sh.push([x.id, Math.round(x.x * 100), Math.round(x.y * 100), SHIP_TYPES.indexOf(x.type), x.dir, x.state === 'sailing' ? 1 : x.state === 'battle' ? 2 : 0, x.gate || '', x.unit, x.faction === 'marine' ? 1 : 0]);
      if (!s.knownU.has(x.unit)) { const u = S.U[x.unit]; s.knownU.add(x.unit); if (u) ui.push({ id: u.id, n: u.name, f: u.faction, flag: u.flag, solo: u.solo }); }
    }
    for (const bt of S.battles) if (Math.abs(bt.x - px) < VX && Math.abs(bt.y - py) < VY) b.push([Math.round(bt.x * 10), Math.round(bt.y * 10), bt.sides[0].f.length + bt.sides[1].f.length]);
    // frutas escondidas: solo se ven estando muy cerca (hay que explorar la isla)
    const f = [];
    for (const fr of S.fruits) if (fr.state === 'hidden' && fr.x != null && Math.hypot(fr.x - px, fr.y - py) < this.FRUIT_PITY.seeRange) f.push([fr.id, fr.x, fr.y]);
    if (s.knownN.size > 3000) s.knownN.clear();
    s.client.send('snap', { t: S.time, n, ni, s: sh, ui, b, f });
  }

  // ======================================================================
  //  MENSAJES DEL CLIENTE
  // ======================================================================
  onInput(s, m) {
    let dx = Number(m.dx), dy = Number(m.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) { dx = 0; dy = 0; }
    dx = Math.max(-1, Math.min(1, dx)); dy = Math.max(-1, Math.min(1, dy));
    const L = Math.hypot(dx, dy);
    if (L > 1) { dx /= L; dy /= L; }
    s.input.dx = dx; s.input.dy = dy;
  }

  // ---------- Combate ----------
  onAttack(s, m) {
    const { MMO, OP, game } = this;
    const now = Date.now();
    const p = s.data;
    if (s.st.dead || now < s.nextAttack - 40) return;
    if (p.execution) return this.toast(s, '⛓️ Estás encadenado: no puedes luchar.');
    if (p.inside) return this.toast(s, '🏠 Aquí dentro no se pelea.');
    if (s.training) return this.toast(s, '🥋 Estás entrenando: suelta T para luchar.');
    if (s.stunUntil > now) return this.toast(s, '💫 Estás aturdido.');
    const pst = MMO.stats(p);
    const pp = this.attackPower(s, now);
    if (m.t === 'p') {
      const t = this.ps.get(String(m.id));
      if (!t || t === s || t.st.dead) return;
      const q = t.data;
      const why = this.pvpBlocked(s, t);
      if (why) return this.toast(s, why);
      const range = this.rangeBetween(p, q);
      if (range < 0) return this.toast(s, 'No puedes atacar a alguien en tierra desde el agua (ni al revés).');
      if (Math.hypot(p.x - q.x, p.y - q.y) > range + 0.35) { this.strike(s, 'ataque fuera de alcance (PvP)'); return this.toast(s, 'Está demasiado lejos.'); }
      s.nextAttack = now + MMO.attackCooldown(p);
      const r = game.damage({ power: pp }, { power: MMO.power(q), dodge: MMO.dodge(q, pst.spd) + this.hakiDodge(t) }, p.boat ? 0.34 : 0.42);
      if (!r.miss) r.dmg = Math.max(1, Math.round(r.dmg * this.hakiDefMul(t)));
      s.lastCombat = now; t.lastCombat = now;
      this.fx(q.x, q.y, r, false, 'p:' + s.sid);
      if (!r.miss) { q.hp -= r.dmg; t.dirty = true; t.saveDirty = true; if (q.hp <= 0) this.defeatPlayer(t, s); }
      this.syncPublic(t);
      return;
    }
    if (m.t === 'n') {
      const npc = OP.S.A[Number(m.id)];
      if (!npc || npc.loc !== 'island') return this.toast(s, 'Ese personaje ya no está ahí.');
      if (p.boat) return this.toast(s, 'Desembarca para pelear en tierra.');
      if (npc._ko > now) return this.toast(s, npc.name + ' está fuera de combate.');
      if (npc.battle) return this.toast(s, npc.name + ' está en plena batalla con otros.');
      if (p.faction === 'marine' && npc.faction === 'marine') return this.toast(s, 'No puedes atacar a un compañero de la Marina.');
      if (npc.pcCrew && npc.pcCrew === p.crewId) return this.toast(s, npc.name + ' es de tu tripulación.');
      if (p.npcCrew && npc.unit === p.npcCrew) return this.toast(s, npc.name + ' es de tu tripulación (NPC).');
      s.lastTarget = { id: npc.id, at: now };
      if (Math.hypot(p.x - npc.x, p.y - npc.y) > MMO.MELEE_RANGE + 0.35) { this.strike(s, 'ataque fuera de alcance (NPC)'); return this.toast(s, 'Está demasiado lejos.'); }
      s.nextAttack = now + MMO.attackCooldown(p);
      s.lastCombat = now;
      const r = game.damage({ power: pp }, { power: this.Sim.basePower(npc), dodge: game.npcDodge(npc, pst.spd) }, 0.42);
      this.fx(npc.x, npc.y, r, false, 'p:' + s.sid);
      this.engageNpc(npc, s, now, true);
      if (!r.miss) { npc.hp -= r.dmg; if (npc.hp <= 0) this.defeatNpc(s, npc, now); }
    }
  }
  // poder de un golpe del jugador: rasgos y potenciador de fruta (Zoan) incluidos
  attackPower(s, now) {
    const { MMO } = this;
    const p = s.data, pst = MMO.stats(p);
    return MMO.power(p) * (MMO.has(p, 'valiente') && p.hp < pst.maxHp * 0.5 ? 1.12 : 1) * (MMO.has(p, 'leal') && this.crewmateNear(s, 8) ? 1.1 : 1) *
      (s.abBuff && s.abBuff.until > now ? s.abBuff.mult : 1) * this.hakiDmgMul(s);   // Haki de Armadura activo
  }
  // golpe validado contra un NPC / contra otro jugador (los usan los ataques normales y las habilidades)
  hitNpc(s, npc, mult, now) {
    const { MMO, game } = this;
    const p = s.data;
    s.lastTarget = { id: npc.id, at: now };
    const r = game.damage({ power: this.attackPower(s, now) * mult }, { power: this.Sim.basePower(npc), dodge: game.npcDodge(npc, MMO.stats(p).spd) }, 0.42);
    this.fx(npc.x, npc.y, r, false, 'p:' + s.sid);
    this.engageNpc(npc, s, now, true);
    if (!r.miss) { npc.hp -= r.dmg; if (npc.hp <= 0) this.defeatNpc(s, npc, now); }
    return r;
  }
  hitPlayer(s, t, mult, now) {
    const { MMO, game } = this;
    const p = s.data, q = t.data;
    if (q.execution || p.execution) return { miss: true, dmg: 0 };   // el condenado de la plataforma no recibe golpes
    const r = game.damage({ power: this.attackPower(s, now) * mult }, { power: MMO.power(q), dodge: MMO.dodge(q, MMO.stats(p).spd) + this.hakiDodge(t) }, p.boat ? 0.34 : 0.42);
    if (!r.miss) r.dmg = Math.max(1, Math.round(r.dmg * this.hakiDefMul(t)));
    s.lastCombat = now; t.lastCombat = now;
    this.fx(q.x, q.y, r, false, 'p:' + s.sid);
    if (!r.miss) { q.hp -= r.dmg; t.dirty = true; t.saveDirty = true; if (q.hp <= 0) this.defeatPlayer(t, s); }
    this.syncPublic(t);
    return r;
  }
  rangeBetween(a, b) {
    if (!a.boat && !b.boat) return this.MMO.MELEE_RANGE;
    if (a.boat && b.boat) return this.MMO.NAVAL_RANGE;
    return -1;
  }
  pvpBlocked(s, t) {
    const a = s.data, b = t.data, MMO = this.MMO;
    if (a.execution) return '⛓️ Estás encadenado en la plataforma de ejecución.';
    if (a.inside || b.inside) return '🏠 No se puede luchar con alguien que está dentro de un edificio.';
    if (b.execution) return '⛓️ ' + b.name + ' está encadenado en la plataforma de ejecución: nadie puede tocarle.';
    if (a.lvl < MMO.PVP_MIN_LVL) return 'Hasta el nivel ' + MMO.PVP_MIN_LVL + ' no puedes luchar contra otros jugadores.';
    if (b.lvl < MMO.PVP_MIN_LVL) return b.name + ' es novato (nivel < ' + MMO.PVP_MIN_LVL + ') y está protegido.';
    if (a.crewId && a.crewId === b.crewId) return 'Es de tu tripulación.';
    if (a.faction === 'marine' && b.faction === 'marine') return 'No puedes atacar a otro marine.';
    return '';
  }
  crewmateNear(s, r) {
    if (!s.data.crewId) return false;
    for (const o of this.ps.values()) if (o !== s && o.data.crewId === s.data.crewId && !o.st.dead && Math.hypot(o.data.x - s.data.x, o.data.y - s.data.y) < r) return true;
    return false;
  }
  engageNpc(npc, s, now, alsoAllies) {
    const e = this.engage.get(npc.id);
    if (e && e.sid === s.sid) { e.last = now; return; }
    if (!e) this.engage.set(npc.id, { sid: s.sid, next: now + 700, last: now });
    if (!alsoAllies) return;
    const u = this.Sim.U(npc.unit);
    if (!u) return;
    let n = 0;
    for (const id of u.members) {
      if (n >= 2) break;
      const m = this.Sim.A(id);
      if (!m || m === npc || m.loc !== 'island' || m.isl !== npc.isl || m.battle || m._ko > now || this.engage.has(m.id)) continue;
      if (Math.hypot(m.x - npc.x, m.y - npc.y) > 6) continue;
      this.engage.set(m.id, { sid: s.sid, next: now + 1200 + n * 300, last: now });
      n++;
    }
  }
  tickEngagements(dt, now) {
    const { OP, MMO, M, game } = this;
    for (const [id, e] of this.engage) {
      const npc = OP.S.A[id];
      const s = this.ps.get(e.sid);
      if (!npc || npc.loc !== 'island' || npc.battle || npc._ko > now || !s || s.st.dead || s.data.boat || s.data.execution || s.data.inside || now - e.last > 20000) { this.engage.delete(id); continue; }
      const p = s.data;
      const d = Math.hypot(p.x - npc.x, p.y - npc.y);
      if (d > 10) { this.engage.delete(id); continue; }
      npc.wait = Math.max(npc.wait || 0, 0.5); npc.tx = null;
      if (d > 1.3) {
        const sp = 2.6 * dt;
        const nx = npc.x + (p.x - npc.x) / d * sp, ny = npc.y + (p.y - npc.y) / d * sp;
        if (M.isl[Math.floor(ny) * M.W + Math.floor(nx)] === npc.isl) { npc.x = nx; npc.y = ny; }
      }
      if (d <= MMO.MELEE_RANGE && now >= e.next) {
        e.next = now + 1100 + game.rnd() * 400;
        e.last = now;
        s.lastCombat = now;
        if (npc.stunUntil > now) continue;   // aturdido por un Haki del Rey: no ataca
        const r = game.damage({ power: this.Sim.basePower(npc) }, { power: MMO.power(p), dodge: MMO.dodge(p, npc.spd) + this.hakiDodge(s) }, 0.3);
        if (!r.miss) r.dmg = Math.max(1, Math.round(r.dmg * this.hakiDefMul(s)));   // Haki de Armadura
        this.fx(p.x, p.y, r, true, 'n:' + id);
        if (!s.lastTarget || now - s.lastTarget.at > 3000) s.lastTarget = { id: npc.id, at: now };   // tus NPC te defienden
        if (!r.miss) { p.hp -= r.dmg; s.dirty = true; s.saveDirty = true; if (p.hp <= 0) this.defeatPlayer(s, null, npc); }
      }
    }
  }
  aggroScan(now) {
    const { Sim } = this;
    for (const s of this.ps.values()) {
      const p = s.data;
      if (s.st.dead || p.boat || p.execution || p.inside || (s.execGrace || 0) > now) continue;   // recién rescatado: margen para huir · dentro de un edificio: a salvo
      let count = 0;
      for (const e of this.engage.values()) if (e.sid === s.sid) count++;
      const maxEng = p.prison ? 1 : 3;   // en Impel Down los carceleros van de uno en uno: se puede escapar luchando
      if (count >= maxEng) continue;
      const I = this.MMO.islandAt(p.x, p.y);
      if (!I) continue;
      const vengeful = p.traitor && p.traitor.unit;   // la tripulación NPC traicionada busca venganza
      for (const npc of Sim.occupants(I.idx)) {
        if (count >= maxEng) break;
        if (npc.loc !== 'island' || npc.battle || npc._ko > now || npc.pcCrew || this.engage.has(npc.id)) continue;
        if (p.npcCrew && npc.unit === p.npcCrew) continue;   // tu propia tripulación NPC no te ataca
        if (Math.hypot(npc.x - p.x, npc.y - p.y) > 3.5) continue;
        // carceleros de Impel Down y la tripulación traicionada atacan siempre, sin importar el nivel
        const always = (npc.prisonGuard && npc.prisonGuard === s.cid) || (vengeful && npc.unit === vengeful);
        if (p.prison && !always) continue;   // un preso solo pelea con SUS carceleros, no con toda la prisión
        if (!always) {
          if (p.lvl < MMO_NEWBIE_LVL) continue;   // a los novatos nadie les ataca por iniciativa propia
          // en los cuatro mares, los NPC mucho más fuertes no van a por jugadores débiles
          if (this.OP.BLUES.indexOf(I.sea) >= 0 && npc.lvl > p.lvl + 4) continue;
        }
        let hostile = always;
        if (hostile) { /* ya decidido */ } else if (npc.faction === 'marine' && p.faction === 'pirate') hostile = p.bounty > 0 && npc.lvl >= p.lvl - 6;
        else if (npc.faction === 'pirate' && p.faction === 'marine') hostile = npc.pers.agg > 0.55;
        else if (npc.faction === 'pirate' && p.faction === 'pirate') hostile = npc.pers.agg > 0.8 && npc.lvl >= p.lvl;
        if (!hostile || (!always && this.game.rnd() > 0.5)) continue;
        this.engage.set(npc.id, { sid: s.sid, next: now + 900, last: now });
        this.toast(s, (npc.faction === 'marine' ? '⚓ ' : '☠ ') + npc.name + ' te ataca.');
        count++;
      }
    }
  }

  defeatNpc(s, npc, now) {
    const { OP, MMO, game } = this;
    const p = s.data;
    npc.hp = Math.max(1, Math.round(npc.maxHp * 0.25));
    npc._ko = now + 45000;
    npc.wait = 4; npc.tx = null;
    this.engage.delete(npc.id);
    const zm = OP.ZONE_MULT[MMO.zoneOf(p.x, p.y)] || 1;
    let xp = (20 + npc.lvl * 8) * zm * game.clamp(1 + (npc.lvl - p.lvl) * 0.12, 0.1, 2);
    if (npc.lvl < p.lvl - 10) xp *= 0.2;
    let money = Math.round((500 + npc.lvl * 320) * zm * (0.7 + game.rnd() * 0.6) * game.lootMult(p));
    // te quedas parte de lo que llevaba encima
    const purse = Math.round(Math.min(3e6, Math.max(0, npc.money || 0) * (0.2 + game.rnd() * 0.15)));
    if (purse > 0) { npc.money -= purse; money += purse; }
    // los piratas que derrotan a otro pirata con recompensa se quedan su botín
    if (p.faction === 'pirate' && npc.faction === 'pirate' && npc.bounty >= 1e6) money += Math.round(Math.min(2e6, npc.bounty * 0.006));
    // a veces suelta una espada (más probable y mejor si es fuerte)
    let swordTxt = '';
    if (game.rnd() < 0.05 + Math.min(0.12, npc.lvl / 600) + (npc.rank >= 4 ? 0.05 : 0)) {
      const r = game.rollRarity(1, npc.lvl >= 60 ? 5 : npc.lvl >= 35 ? 4 : 3, npc.lvl / 80);
      const g = game.giveSword(p, r);
      swordTxt = ' · 🗡️ ' + MMO.SWORD_RARITY[r].name + ': «' + g.sw.n + '»' + (g.sold ? ' (no te cabe: vendida por ' + OP.fmtB(g.sold) + ')' : '');
    }
    p.stats.npcKills++;
    if (npc.lvl <= p.lvl + 2 && npc.lvl >= p.lvl - 4) p.stats.fairKills = (p.stats.fairKills || 0) + 1;   // enemigo adecuado a tu nivel
    if (npc.lvl > p.lvl) p.stats.strongKills = (p.stats.strongKills || 0) + 1;
    // dificultad: más EXP cuanto más difícil, y cuenta para las misiones de esa dificultad
    const dk = MMO.difficultyOf(npc, p), DF = MMO.DIFFS[dk];
    xp *= DF.xp;
    if (dk > 0 || npc.lvl - p.lvl >= MMO.EASY_MIN_GAP) p.stats[DF.stat] = (p.stats[DF.stat] || 0) + 1;
    const diffTxt = DF.icon + ' ' + DF.name;
    const I = MMO.islandAt(p.x, p.y);
    let extra = '';
    if (npc.faction === 'pirate') {
      p.stats.piratesBeaten++;
      if (p.faction === 'marine') {
        p.merit += 1 + npc.lvl / 10 + npc.bounty / 2e6;
        if (npc.bounty > 0) {
          const r = Math.round(Math.min(npc.bounty * 0.02, 2e6)); money += r; extra = ' · recompensa ' + OP.fmtB(r) + ' · ⛓ capturado';
          // captura real: el pirata va a prisión en la simulación y queda en tu cuadro de honor
          game.recordCapture(p, npc.name, npc.bounty, false);
          this.Sim.captureAgent(npc, null, null);
          this.honorCache = null;
        }
        if (I && I.base) p.stats.baseDefends++;
      }
    }
    if (npc.faction === 'marine' && p.faction === 'pirate') {
      const big = npc.rank >= 4;
      const up = game.raiseBounty(p, game.marineDeed(npc), big);
      if (up) this.onBounty(s, up, 'por derrotar al ' + OP.RANKS[npc.rank] + ' ' + npc.name + ' (Marina, nivel ' + npc.lvl + ')', big);
      if (big) { p.lastDeed = { kind: 'marine', t: 'Derrotó al ' + OP.RANKS[npc.rank] + ' ' + npc.name, at: Date.now() }; game.moment(p, p.lastDeed.t, 20 + npc.rank * 6); }
    }
    // ¿era uno de los Cuatro Emperadores? (cuenta para el trono del Rey de los Piratas)
    const eu = npc.faction === 'pirate' && OP.S.U[npc.unit];
    if (eu && p.faction === 'pirate' && OP.S.emperors.indexOf(eu.id) >= 0 && eu.leader === npc.id) {
      p.empBeaten = p.empBeaten || [];
      if (p.empBeaten.indexOf(eu.id) < 0) p.empBeaten.push(eu.id);
      const n = p.empBeaten.length;
      game.moment(p, 'Derrotó al Emperador ' + npc.name, 60 + n * 10);
      this.news('world', '¡' + p.name + ' ha derrotado al Emperador ' + npc.name + ' (' + eu.name + ')! (' + Math.min(n, 4) + '/4)', 4);
      if (!OP.S.playerKing && n >= 4) this.crownKing(s, 'Derrotó a los Cuatro Emperadores del Mar');
      else if (!OP.S.playerKing) this.toast(s, '👑 Emperadores derrotados: ' + n + '/4. Derrota a los cuatro para reclamar el trono.');
    }
    // pirata contra pirata famoso: te quedas parte de su fama
    if (npc.faction === 'pirate' && p.faction === 'pirate' && npc.bounty >= 1e7) {
      const up = game.raiseBounty(p, npc.bounty * (0.08 + game.rnd() * 0.07), npc.bounty >= 5e7);
      if (up) this.onBounty(s, up, 'por derrotar a ' + npc.name + ', que tenía una recompensa de ' + OP.fmtB(npc.bounty), true);
      p.lastDeed = { kind: 'pirate', t: 'Derrotó a ' + npc.name, at: Date.now() };
    }
    p.money += money;
    const r = game.gainXp(p, xp);
    this.Sim.log(npc, 'Fue derrotado por ' + p.name + '.');
    if (npc.bounty >= 1e7 || npc.lvl > p.lvl + 3) game.addLog(p, 'Derrotó a ' + npc.name + (npc.bounty ? ' (' + OP.fmtB(npc.bounty) + ')' : ' (nivel ' + npc.lvl + ')') + '.');
    this.toast(s, '🏆 Derrotas a ' + npc.name + ' · ' + diffTxt + ' (+' + r.gained + ' EXP, +' + OP.fmtB(money) + extra + swordTxt + ')');
    this.contractKill(s, npc);   // ¿era el objetivo de un contrato? (server/contracts.js)
    if (npc.bounty >= 5e7 || npc.rank >= 5) { this.news('battle', p.name + ' ha derrotado a ' + npc.name + (npc.bounty ? ' (' + OP.fmtB(npc.bounty) + ')' : ' (' + OP.RANKS[npc.rank] + ')') + '.', 2); game.moment(p, 'Derrotó a ' + npc.name, 25); }
    this.onLevels(s, r);
    this.afterMerit(s);
    this.checkQuests(s);
    if (npc.prisonGuard && npc.prisonGuard === s.cid) this.prisonGuardDown(s, npc);   // Impel Down: un carcelero menos
    if (npc.hunter && npc.hunter === s.cid) { npc.hunter = 0; this.Sim.retire(npc, 'Dejó la caza'); }
    s.dirty = true; s.saveDirty = true;
  }

  defeatPlayer(victim, killer, npc) {
    const { OP, game } = this;
    const v = victim.data;
    let execBy = '';   // si acaba en ejecución pública, quién lo capturó
    // misión de supervivencia: caer en esa isla pone su contador a 0
    const dI = !v.boat && this.MMO.islandAt(v.x, v.y);
    if (dI && v.stays && v.stays[dI.id] > 0.05) { v.stays[dI.id] = 0; this.toast(victim, '⏳ Has caído en ' + dI.name + ': tu tiempo de supervivencia allí vuelve a 0.'); }
    v.hp = 0;
    victim.st.dead = true;
    victim.respawnAt = Date.now() + this.MMO.RESPAWN_MS;
    victim.input.dx = 0; victim.input.dy = 0;
    v.stats.deaths++;
    const lost = Math.floor(v.money * 0.08);
    v.money -= lost;
    for (const [id, e] of this.engage) if (e.sid === victim.sid) this.engage.delete(id);
    if (killer) {
      const k = killer.data;
      k.stats.pvpWins++; v.stats.pvpLosses++;
      const key = killer.cid + ':' + victim.cid;
      const fresh = Date.now() - (this.pvpLog.get(key) || 0) > 10 * 60000;
      this.pvpLog.set(key, Date.now());
      let txt;
      if (fresh) {
        const r = game.gainXp(k, (40 + v.lvl * 15) * game.clamp(1 + (v.lvl - k.lvl) * 0.1, 0.2, 2));
        txt = '+' + r.gained + ' EXP';
        if (k.faction === 'pirate') {
          k.money += lost; txt += ', le robas ' + OP.fmtB(lost);
          const deed = (v.faction === 'marine' && v.rank >= 4) || v.bounty >= 5e7;
          const up = game.raiseBounty(k, v.lvl * v.lvl * 1e4 + v.bounty * 0.1 + (v.faction === 'marine' ? game.marineDeed(v) * 0.5 : 0), deed);
          if (up) this.onBounty(killer, up, 'por derrotar al jugador ' + v.name + (v.faction === 'marine' ? ' (' + OP.RANKS[v.rank] + ' de la Marina, nivel ' + v.lvl + ')' : v.bounty ? ', que tenía una recompensa de ' + OP.fmtB(v.bounty) : ' (nivel ' + v.lvl + ')'), deed);
          k.lastDeed = { kind: 'pvp', t: 'Derrotó a ' + v.name, at: Date.now() };
        } else if (v.faction === 'pirate') {
          k.stats.piratesBeaten++;
          if (v.king && game.rnd() < this.MMO.KING.escape) {
            // el Rey de los Piratas casi nunca se deja capturar
            txt += ', pero el Rey de los Piratas escapa antes de que puedas apresarlo';
            this.news('world', k.name + ' derrota al Rey de los Piratas ' + v.name + ', pero consigue escapar.', 3);
          } else if (v.bounty > 0) {
            k.stats.wantedPlayersBeaten++;
            game.recordCapture(k, v.name, v.bounty, true);
            this.honorCache = null;
            const pay = Math.round(Math.min(v.bounty * 0.05, 5e7));
            k.money += pay; txt += ', la Marina te paga ' + OP.fmtB(pay);
            k.merit += 5 + v.bounty / 1e6;
            // los más buscados de todos (500 M o más) van a la ejecución pública; los demás muy buscados, a Impel Down
            if (v.bounty >= this.MMO.EXECUTION.bounty && !v.execution) { execBy = k.name; txt += ' · ⚔️ llevado a la ejecución pública'; }
            else if (v.bounty > this.MMO.PRISON_BOUNTY && !v.prison) { this.imprison(victim, k.name); txt += ' · ⛓️ enviado a Impel Down'; }
          }
        }
        game.addLog(k, 'Derrotó al jugador ' + v.name + '.');
        this.onLevels(killer, r);
        this.afterMerit(killer);
      } else txt = 'sin recompensa: ya lo derrotaste hace poco';
      // derrotar al Rey de los Piratas siendo pirata: el título pasa al vencedor
      if (v.king && k.faction === 'pirate') this.crownKing(killer, 'Derrotó al anterior Rey de los Piratas, ' + v.name);
      game.addLog(v, 'Fue derrotado por el jugador ' + k.name + '.');
      this.toast(killer, '⚔ Derrotas a ' + v.name + ' (' + txt + ')');
      this.toast(victim, '💀 ' + k.name + ' te ha derrotado. Pierdes ' + OP.fmtB(lost) + '.');
      this.system('⚔ ' + k.name + ' ha derrotado a ' + v.name + '.', 'pvp');
      this.checkQuests(killer);
      killer.dirty = true; killer.saveDirty = true;
    } else {
      game.addLog(v, 'Fue derrotado por ' + (npc ? npc.name : 'alguien') + '.');
      this.toast(victim, '💀 ' + (npc ? npc.name : 'Alguien') + ' te ha derrotado. Pierdes ' + OP.fmtB(lost) + '.');
      // derrotado por un marine NPC siendo un pirata muy buscado: a Impel Down (el Rey casi siempre escapa)
      if (npc && npc.faction === 'marine' && v.faction === 'pirate' && v.bounty > this.MMO.PRISON_BOUNTY && !v.prison && !v.execution && !(v.king && game.rnd() < this.MMO.KING.escape)) {
        if (v.bounty >= this.MMO.EXECUTION.bounty) execBy = npc.name;   // 500 M o más: ejecución pública
        else {
          this.imprison(victim, npc.name);
          this.toast(victim, '⛓️ ¡Te capturan! Despertarás en IMPEL DOWN.');
        }
      }
      if (npc) this.Sim.log(npc, 'Derrotó al jugador ' + v.name + '.');
    }
    victim.dirty = true; victim.saveDirty = true;
    this.syncPublic(victim);
    if (execBy) this.startExecution(victim, execBy, false);
  }

  // why = motivo (se guarda siempre en el historial); big = hazaña importante (sale en el periódico)
  onBounty(s, up, why, big) {
    const p = s.data, OP = this.OP;
    const tail = why ? ' (' + why + ')' : '';
    // historial de la recompensa: cada subida con su motivo (se ve en tu panel → "¿Por qué?")
    p.bountyLog = p.bountyLog || [];
    p.bountyLog.unshift({ at: Date.now(), up, total: p.bounty, why: why || 'por sus hazañas' });
    if (p.bountyLog.length > 30) p.bountyLog.length = 30;
    if (p.bounty === up) {
      this.news('bounty', 'Nuevo cartel de SE BUSCA: ' + p.name + ' — ' + OP.fmtB(p.bounty) + tail + '.', 2);
      this.toast(s, '📜 ¡Tienes tu primer cartel de SE BUSCA! ' + OP.fmtB(p.bounty) + tail);
    } else {
      if (big || up >= Math.max(5e6, (p.bounty - up) * 0.2)) this.news('bounty', 'La recompensa de ' + p.name + ' sube a ' + OP.fmtB(p.bounty) + tail + '.', up >= 1e8 ? 3 : 2);
      this.toast(s, '📜 Tu recompensa sube a ' + OP.fmtB(p.bounty) + ' (+' + OP.fmtB(up) + ')' + tail);
    }
    s.dirty = true; s.saveDirty = true;
    if (!p.epithet && p.bounty >= 4e7) { p.epithet = this.Sim.genEpithet(p); this.toast(s, '✒️ Te apodan «' + p.epithet + '»'); }
    this.wantedCache = null;
  }
  afterMerit(s) {
    const ups = this.game.rankUps(s.data);
    if (s.data.faction === 'marine' && s.data.rank >= this.MMO.AUTO_RANK_MAX) this.hierarchyDue = true;   // puede optar a un alto mando
    for (const r of ups) { this.toast(s, '🎖️ ¡Ascenso! Ahora eres ' + r + ' de la Marina.'); this.news('marine', s.data.name + ' asciende a ' + r + ' de la Marina.', 2); }
    if (ups.length) this.checkQuests(s);
  }
  onLevels(s, r) {
    if (!r || !r.ups) return;
    const p = s.data;
    this.toast(s, '⭐ ¡Subes al nivel ' + p.lvl + '!');
    s.client.send('levelup', { lvl: p.lvl });
    if (p.lvl % 10 === 0) this.system('⭐ ' + p.name + ' ha alcanzado el nivel ' + p.lvl + '.', 'level');
    this.checkQuests(s);
  }

  // Pista para la misión actual: a qué isla ir (entrenamiento especial, base de la Marina...)
  questHint(p, q) {
    const { MMO, OP, M } = this;
    const zone = MMO.zoneOf(p.x, p.y);
    const sea = OP.SEAS[zone] && zone !== 'calm' ? zone : p.spawnSea;
    const near = (list) => list.map((I) => ({ I, d: Math.hypot(I.dockX - p.x, I.dockY - p.y) })).sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.I);
    if (q.stat === 'specialTrains' || q.stat === 'trainedAt') {
      let list = MMO.trainIslands(sea).filter((I) => q.stat !== 'trainedAt' || p.trainedAt.indexOf(I.id) < 0);
      if (!list.length) list = M.islands.filter((I) => I.train && !I.hidden && (q.stat !== 'trainedAt' || p.trainedAt.indexOf(I.id) < 0));
      return near(list).map((I) => '🥋 ' + I.name + ' (' + OP.SEAS[I.sea].name + '): ' + I.train.label).join(' · ');
    }
    if (q.stat === 'visitBase') return near(M.islands.filter((I) => I.base && I.sea === sea)).map((I) => '⚓ ' + I.name).join(' · ');
    const m = /^train_(\w+)$/.exec(q.stat);
    if (m && M.byId[m[1]]) return '🥋 ' + M.byId[m[1]].name + ' (' + OP.SEAS[M.byId[m[1]].sea].name + ')';
    return '';
  }

  // ---------- Objetivos del Sueño ----------
  checkQuests(s) {
    const { MMO, game } = this;
    const p = s.data;
    for (let k = 0; k < 6; k++) {
      const q = MMO.currentQuest(p);
      if (!q || MMO.statValue(p, q.stat) < q.goal) break;
      p.questsDone.push(q.id);
      p.money += q.money;
      const r = game.gainXp(p, q.xp, { raw: true });
      game.moment(p, 'Cumplió un objetivo de su sueño: ' + q.text, 12 + p.questsDone.length * 3);
      this.toast(s, '🎯 Objetivo cumplido: ' + q.text + ' (+' + r.gained + ' EXP' + (q.money ? ', +' + this.OP.fmtB(q.money) : '') + ')');
      s.client.send('quest', { id: q.id, text: q.text });
      if (r.ups) { this.toast(s, '⭐ ¡Subes al nivel ' + p.lvl + '!'); s.client.send('levelup', { lvl: p.lvl }); }
    }
    s.dirty = true; s.saveDirty = true;
  }

  // ---------- Acciones: explorar, entrenar, usar un paso especial ----------
  onAction(s, m) {
    const { MMO, OP, game } = this;
    const p = s.data;
    const now = Date.now();
    if (s.st.dead) return;
    if (p.execution) return this.toast(s, '⛓️ Estás encadenado en la plataforma de ejecución.');
    if (s.stunUntil > now) return this.toast(s, '💫 Estás aturdido.');
    if (p.inside) return this.toast(s, '🏠 Estás dentro de un edificio: sal por la puerta para hacer eso.');
    const a = m.a;
    if (a === 'train') { if (s.training) return this.stopTraining(s, ''); return this.onTrainHold(s, { on: true, focus: m.focus }); }   // entrenar = mantener T (o tocar el botón)
    if (a === 'haki' && Number(m.type) === 2) return this.toast(s, '⚡ El Haki del Rey no se entrena: se nace con él (el ' + Math.round(this.MMO.CONQ_BORN * 100) + '% de los personajes).');
    if (a === 'gate') return this.useGate(s, m);
    if (a === 'haki') return this.awakenHaki(s, Number(m.type));
    if (a === 'job') return this.onJob(s);
    if (a !== 'explore' && a !== 'train') return;
    if (p.boat) return this.toast(s, 'Tienes que estar en tierra.');
    const I = MMO.islandAt(p.x, p.y);
    if (!I) return;
    if ((s.cds[a] || 0) > now) return this.toast(s, 'Aún no puedes (' + Math.ceil((s.cds[a] - now) / 1000) + ' s).');
    if (now - s.lastCombat < 3000) return this.toast(s, 'No puedes hacer eso en mitad de un combate.');
    const zm = OP.ZONE_MULT[I.sea] || 1;
    const ev = this.event && this.event.isl === I.idx ? 3 : 1;
    if (a === 'explore') {
      s.cds.explore = now + MMO.EXPLORE_CD;
      p.stats.explores++;
      let xp = (12 + p.lvl * 1.2) * zm * ev;
      if (MMO.has(p, 'curioso')) xp *= 1.2;
      if (MMO.has(p, 'tonto')) xp *= 0.85;
      const smart = p.talent === 'Inteligente' ? 1.5 : 1;
      const d = OP.S.isl[I.idx];
      const roll = game.rnd();
      let msg;
      if (d.fruit >= 0 && game.rnd() < 0.35 * smart) {
        // la fruta no se come al explorar: hay que encontrar el sitio y recogerla con un clic
        msg = '🍎 Notas algo extraño en el aire... en algún lugar de ' + I.name + ' hay una Fruta del Diablo.';
      } else if (roll < 0.06 * smart * ev) {
        const money = Math.round((100000 + game.rnd() * 500000) * (1 + p.lvl / 25) * zm * (1 + d.wealth) * game.lootMult(p) * ev);
        p.money += money; p.stats.treasures++; p.stats.finds = (p.stats.finds || 0) + 1;
        msg = '💎 ¡Un tesoro escondido en ' + I.name + '! +' + OP.fmtB(money);
        if (game.rnd() < 0.35) { const rr = game.rollRarity(1, 4, 0.5); const g = game.giveSword(p, rr); msg += ' y una espada ' + MMO.SWORD_RARITY[rr].name.toLowerCase() + ': «' + g.sw.n + '»'; }
        game.addLog(p, 'Encontró un tesoro de ' + OP.fmtB(money) + ' en ' + I.name + '.');
        xp += 40 * zm;
        if (money >= 1e6) this.news('world', p.name + ' ha encontrado un tesoro de ' + OP.fmtB(money) + ' en ' + I.name + '.', 2);
      } else if (roll < 0.4) {
        const money = Math.round((2000 + game.rnd() * 10000) * (1 + p.lvl / 15) * zm * game.lootMult(p) * ev);
        p.money += money; p.stats.finds = (p.stats.finds || 0) + 1;
        msg = '💰 Encuentras ' + OP.fmtB(money) + ' entre unas rocas.';
      } else if (roll < 0.5) {
        const it = game.rnd() < 0.5 ? 'carne' : 'vendas';
        p.inv[it] = (p.inv[it] || 0) + 1; p.stats.finds = (p.stats.finds || 0) + 1;
        msg = '🎒 Encuentras ' + (it === 'carne' ? 'un trozo de carne' : 'unas vendas') + '.';
      } else msg = '🔎 Exploras ' + I.name + ' pero no encuentras nada especial.';
      const r = game.gainXp(p, xp);
      this.toast(s, msg + ' (+' + r.gained + ' EXP)');
      this.onLevels(s, r);
    } else {
      s.cds.train = now + MMO.TRAIN_CD;
      p.stats.trains++;
      const bonus = I.train ? I.train.bonus * (I.train.talent && I.train.talent === p.talent ? 1.25 : 1) : 1;
      if (I.train) p.stats.specialTrains = (p.stats.specialTrains || 0) + 1;
      if (I.train && p.trainedAt.indexOf(I.id) < 0) { p.trainedAt.push(I.id); game.moment(p, 'Entrenó en ' + I.name + ': ' + I.train.label, 15 + I.danger * 2); }
      const r = game.gainXp(p, (14 + p.lvl * 3.5) * zm * bonus * ev);
      // lo que has elegido priorizar mejora con más probabilidad (y más en islas de entrenamiento especial)
      const focus = MMO.TRAIN_FOCUS[m.focus] ? m.focus : 'str';
      p.trainFocus = focus;
      let gain = '';
      if (game.rnd() < 0.3 * (I.train ? 1.6 : 1) * ev) {
        if (focus === 'str') { p.baseStr += 1; gain = '+1 fuerza'; }
        else if (focus === 'spd') { p.baseSpd += 1; gain = '+1 velocidad'; }
        else if (focus === 'hp') { p.baseHp += 4; gain = '+4 vida máxima'; }
        else if ((p.powerTrain || 0) < MMO.TRAIN_POWER_MAX) { p.powerTrain = Math.round(((p.powerTrain || 0) + 0.005) * 1000) / 1000; gain = '+0,5% de poder'; }
        else gain = 'ya no puedes subir más el poder entrenando';
      }
      const F = MMO.TRAIN_FOCUS[focus];
      this.toast(s, '🥋 Entrenas ' + F.icon + ' ' + F.name.toLowerCase() + (I.train ? ' (' + I.train.label + ')' : '') + ' (+' + r.gained + ' EXP' + (gain ? ' · ' + gain : '') + ')');
      this.syncPublic(s);
      this.onLevels(s, r);
    }
    this.checkQuests(s);
    s.dirty = true; s.saveDirty = true;
  }

  // Despertar Haki: nivel 65+, en una isla de entrenamiento especial; cada intento puede salir bien o no
  awakenHaki(s, type) {
    const { MMO, OP, game } = this;
    const p = s.data, now = Date.now();
    const H = MMO.HAKI[type];
    if (!H) return;
    if (p.lvl < MMO.HAKI_LVL) return this.toast(s, 'Para despertar el Haki necesitas nivel ' + MMO.HAKI_LVL + '.');
    if (p.boat) return this.toast(s, 'Tienes que estar en tierra.');
    const I = MMO.islandAt(p.x, p.y);
    if (!I || !I.train) return this.toast(s, 'Solo puedes despertar el Haki en una isla con entrenamiento especial (🥋).');
    p.haki = p.haki || [false, false, false];
    if (p.haki[type]) return this.toast(s, 'Ya dominas el ' + H.name + '.');
    if ((s.cds.haki || 0) > now) return this.toast(s, 'Necesitas descansar antes de volver a intentarlo (' + Math.ceil((s.cds.haki - now) / 1000) + ' s).');
    if (now - s.lastCombat < 3000) return this.toast(s, 'No puedes concentrarte en mitad de un combate.');
    s.cds.haki = now + MMO.HAKI_CD;
    const ch = H.chance * (I.train.bonus || 1) / 1.5;
    if (game.rnd() < ch) {
      p.haki[type] = true;
      game.moment(p, 'Despertó el ' + H.name + ' en ' + I.name, type === 2 ? 70 : 40);
      this.news('world', '⚡ ' + p.name + ' ha despertado el ' + H.name + ' en ' + I.name + '.', type === 2 ? 4 : 3);
      this.toast(s, H.icon + ' ¡Has despertado el ' + H.name + '! ' + H.desc + '.');
    } else {
      game.gainXp(p, 30 + p.lvl * 2);
      this.toast(s, H.icon + ' Meditas y entrenas... pero el ' + H.name + ' aún no despierta (probabilidad ' + Math.round(ch * 100) + '%). Inténtalo de nuevo.');
    }
    s.dirty = true; s.saveDirty = true;
    this.syncPublic(s);
  }

  useGate(s, m) {
    const { MMO, M, game } = this;
    const p = s.data;
    if (s.ride) return this.toast(s, 'Vas de pasajero: el paso lo usa quien lleva el barco.');
    const ng = MMO.nearGate(p);
    if (!ng) return this.toast(s, 'No hay ningún paso especial cerca. Acércate en barco a Reverse Mountain, la corriente Knock Up o la Isla Gyojin.');
    const why = MMO.gateCheck(p, ng.g, ng.fwd);
    if (why) return this.toast(s, '⛔ ' + ng.g.name + ': ' + why);
    let g = ng.g;
    // bajar Reverse Mountain: al mar elegido (o al de su isla de origen)
    if (ng.back) {
      const homeSea = (M.islands[p.home] || {}).sea;
      const want = MMO.DESCEND.find((d) => d[0] === String((m && m.sea) || '')) || MMO.DESCEND.find((d) => d[0] === homeSea) || MMO.DESCEND[0];
      g = M.gateById[want[1]] || g;
      p.x = g.fx; p.y = g.fy;
      p.wcls = M.clsM[Math.floor(g.fy) * M.W + Math.floor(g.fx)] || 1;
      p.boat = MMO.shipOf(p, this.crewShip(p));
      this.toast(s, '⛰ Bajas por la corriente de Reverse Mountain hasta el ' + want[2] + '.');
      game.moment(p, 'Volvió al ' + want[2] + ' bajando Reverse Mountain', 10);
      s.client.send('teleport', { x: p.x, y: p.y });
      this.afterMove(s);
      s.dirty = true; s.saveDirty = true;
      return this.syncPublic(s);
    }
    const tx = ng.fwd ? g.tx : g.fx, ty = ng.fwd ? g.ty : g.fy;
    p.x = tx; p.y = ty;
    p.wcls = M.clsM[Math.floor(ty) * M.W + Math.floor(tx)] || 1;
    p.boat = MMO.shipOf(p, this.crewShip(p));
    const flavor = { climb: '⛰ Subes la corriente de Reverse Mountain y caes en la Grand Line.', sky: '☁ ¡La corriente Knock Up lanza tu barco hasta el mar de nubes!', dive: '🫧 Tu barco recubierto baja 10.000 metros bajo el mar.', tunnel: '🌊 Cruzas el túnel bajo la Red Line.' };
    this.toast(s, ng.fwd || g.kind !== 'sky' ? flavor[g.kind] : '☁ Bajas del cielo de vuelta al mar.');
    if (g.kind === 'climb') { this.news('pirate', p.name + ' ha subido Reverse Mountain y entra en la Grand Line.', 2); game.moment(p, 'Cruzó Reverse Mountain y entró en la Grand Line', 28); }
    s.client.send('teleport', { x: p.x, y: p.y });
    this.afterMove(s);
    s.dirty = true; s.saveDirty = true;
    this.syncPublic(s);
  }

  // ---------- Fruit Notifier: avisa a sus dueños cuando APARECE una fruta (nunca antes) ----------
  checkNewFruits() {
    const S = this.OP.S;
    const hidden = new Set();
    for (const fr of S.fruits) if (fr.state === 'hidden' && fr.isl >= 0) hidden.add(fr.id);
    if (!this.knownFruits) { this.knownFruits = hidden; return; }   // al arrancar no se anuncia lo que ya estaba
    for (const id of hidden) if (!this.knownFruits.has(id)) this.announceFruit(S.fruits[id]);
    this.knownFruits = hidden;
  }
  announceFruit(fr) {
    const { OP, M } = this;
    const I = M.islands[fr.isl];
    if (!I) return;
    const F = OP.FRUITS[fr.id];
    const note = { fid: fr.id, name: F.name, type: F.type, rarity: F.rarity, sea: OP.SEAS[I.sea] ? OP.SEAS[I.sea].name : I.sea, isl: I.name, islIdx: I.idx, at: Date.now() };
    OP.S.fruitNotes = [note].concat(OP.S.fruitNotes || []).slice(0, 15);
    for (const o of this.ps.values()) if (o.data.notifier) { o.client.send('fruitnote', note); o.dirty = true; }
  }

  // ---------- Navío legendario personalizado: casco, velas y bandera ----------
  onShipLook(s, m) {
    const { MMO } = this;
    const p = s.data;
    if (p.ships.indexOf('legendario') < 0) return this.toast(s, 'Solo el Navío legendario se puede personalizar.');
    const ok = (list, v) => list.indexOf(String(v)) >= 0;
    if (!ok(MMO.SHIP_COLORS, m.hull) || !ok(MMO.SAIL_COLORS, m.sail) || !ok(MMO.SAIL_COLORS, m.flagBg) || !ok(MMO.FLAG_FG, m.fg)) return this.toast(s, 'Colores no válidos.');
    const sym = Math.max(0, Math.min(MMO.FLAG_SYMS - 1, Math.floor(Number(m.sym) || 0)));
    p.shipLook = { hull: m.hull, sail: m.sail, flagBg: m.flagBg, fg: m.fg, sym };
    this.toast(s, '🎨 Tu Navío legendario luce sus nuevos colores y tu bandera.');
    s.dirty = true; s.saveDirty = true;
    this.syncPublic(s);
  }

  // ---------- Espadas: equipar, guardar y vender ----------
  onSword(s, m) {
    const { MMO, OP } = this;
    const p = s.data;
    const list = (p.inv.swords = p.inv.swords || []);
    const sw = list.find((x) => x.id === String(m.id));
    if (m.op === 'unequip') { p.sword = ''; s.dirty = true; s.saveDirty = true; this.syncPublic(s); return this.toast(s, 'Guardas la espada.'); }
    if (!sw) return;
    if (m.op === 'equip') { p.sword = sw.id; this.toast(s, '🗡️ Empuñas «' + sw.n + '» (' + MMO.SWORD_RARITY[sw.r].name + ').'); }
    if (m.op === 'sell') {
      if (p.boat) return this.toast(s, 'Para vender tienes que estar en tierra, en un pueblo.');
      const I = MMO.islandAt(p.x, p.y);
      if (!I || I.pop < 50) return this.toast(s, 'Aquí no hay nadie a quien venderla.');
      const v = MMO.SWORD_RARITY[sw.r].sell;
      list.splice(list.indexOf(sw), 1);
      if (p.sword === sw.id) p.sword = '';
      p.money += v;
      this.toast(s, '💰 Vendes «' + sw.n + '» por ' + OP.fmtB(v) + '.');
    }
    s.dirty = true; s.saveDirty = true;
    this.syncPublic(s);
  }

  // ---------- Trabajo (tecla J): los piratas saquean el pueblo, los marines patrullan ----------
  onJob(s) {
    const { MMO, OP, game, Sim } = this;
    const p = s.data, now = Date.now();
    if (p.boat) return this.toast(s, 'Tienes que estar en tierra.');
    const I = MMO.islandAt(p.x, p.y);
    if (!I) return;
    if ((s.cds.job || 0) > now) return this.toast(s, 'Aún no puedes (' + Math.ceil((s.cds.job - now) / 1000) + ' s).');
    if (now - s.lastCombat < 3000) return this.toast(s, 'No puedes en mitad de un combate.');
    const st = OP.S.isl[I.idx];
    if (I.pop < 50 || (st && st.pop < 50)) return this.toast(s, 'Aquí no vive casi nadie.');
    const zm = OP.ZONE_MULT[I.sea] || 1;
    const ev = this.event && this.event.isl === I.idx ? 2 : 1;
    if (p.faction === 'pirate' && I.base) return this.toast(s, '⚓ Saquear una base de la Marina sería un suicidio. Prueba en otro pueblo.');
    s.cds.job = now + MMO.JOB_CD;
    if (p.faction === 'pirate') {
      const money = Math.round(Math.min(800000, 8000 + I.pop * 10) * zm * (0.6 + game.rnd() * 0.6) * game.lootMult(p) * (1 + p.lvl / 40) * ev);
      p.money += money;
      p.stats.raids = (p.stats.raids || 0) + 1;
      const up = game.raiseBounty(p, 3e4 + money * 0.4);
      if (up) this.onBounty(s, up, 'por saquear ' + I.name);
      // los marines de la isla vienen a por ti
      let n = 0;
      for (const npc of Sim.occupants(I.idx)) {
        if (n >= 3) break;
        if (npc.faction !== 'marine' || npc.loc !== 'island' || npc.battle || npc._ko > now || this.engage.has(npc.id)) continue;
        if (Math.hypot(npc.x - p.x, npc.y - p.y) > 12) continue;
        this.engage.set(npc.id, { sid: s.sid, next: now + 1500 + n * 500, last: now }); n++;
      }
      this.toast(s, '💰 Saqueas ' + I.name + ': +' + OP.fmtB(money) + (n ? ' · ⚓ ¡' + n + ' marine' + (n > 1 ? 's vienen' : ' viene') + ' a por ti!' : ''));
      if (money >= 200000) this.news('attack', p.name + ' ha saqueado ' + I.name + ' y se ha llevado ' + OP.fmtB(money) + '.', 2);
      game.gainXp(p, 20 + p.lvl * 2);
    } else {
      const money = Math.round((15000 + 9000 * (p.rank + 1) * (p.rank + 1)) * zm * (0.8 + game.rnd() * 0.4) * (1 + p.lvl / 40) * ev);
      p.money += money;
      p.merit += 1 + p.rank * 0.5;
      this.toast(s, '⚓ Patrullas ' + I.name + ' y cobras tu paga de ' + OP.RANKS[p.rank] + ': +' + OP.fmtB(money));
      game.gainXp(p, 20 + p.lvl * 2);
      this.afterMerit(s);
    }
    s.lastCombat = p.faction === 'pirate' ? now : s.lastCombat;
    s.dirty = true; s.saveDirty = true;
    this.checkQuests(s);
  }

  // ---------- Objetos y tienda ----------
  onUse(s, m) {
    const { MMO } = this;
    const p = s.data;
    const now = Date.now();
    if (s.st.dead || now < s.nextUse) return;
    const it = m.item === 'carne' || m.item === 'vendas' ? m.item : null;
    if (!it || !(p.inv[it] > 0)) return this.toast(s, 'No te queda.');
    const max = MMO.stats(p).maxHp;
    if (p.hp >= max) return this.toast(s, 'Ya estás bien de salud.');
    s.nextUse = now + 1500;
    p.inv[it]--;
    let heal = max * (it === 'carne' ? 0.35 : 0.15);
    if (MMO.has(p, 'gloton')) heal *= 1.5;
    if (p.talent === 'Médico') heal *= 1.2;
    p.hp = Math.min(max, p.hp + heal);
    if (it === 'carne') p.stats.meals++;
    this.toast(s, (it === 'carne' ? '🍖 Te comes la carne' : '🩹 Te pones las vendas') + ' (+' + Math.round(heal) + ' vida)');
    this.checkQuests(s);
    s.dirty = true; s.saveDirty = true;
  }
  onBuy(s, m) {
    const { MMO, OP, game } = this;
    const p = s.data;
    const key = String(m.item || '');
    const it = Object.prototype.hasOwnProperty.call(MMO.SHOP, key) ? MMO.SHOP[key] : null;
    if (!it || s.st.dead) return;
    if (p.boat) return this.toast(s, 'Las tiendas están en tierra.');
    const I = MMO.islandAt(p.x, p.y);
    if (!I || !it.where(I)) return this.toast(s, 'Aquí no venden ' + it.name + '.');
    if (it.ship && p.ships.indexOf(it.ship) >= 0) return this.toast(s, 'Ya tienes un ' + it.name + '.');
    if (key === 'logpose' && p.logpose) return this.toast(s, 'Ya tienes un Log Pose.');
    if (key === 'notifier' && p.notifier) return this.toast(s, 'Ya tienes un Fruit Notifier.');
    if (key === 'coating' && p.coated) return this.toast(s, 'Tu barco ya está recubierto.');
    if (key === 'coating' && !p.coatTalk) return this.toast(s, '🫧 Nadie te venderá el recubrimiento sin saber usarlo: busca al viejo timonel en la Taberna La Burbuja Rota de Sabaody (E junto a la puerta).');
    if (key === 'coating' && MMO.shipOf(p, this.crewShip(p)) === 'bote') return this.toast(s, 'No se puede recubrir un bote.');
    const qty = it.ship || it.once || it.sword ? 1 : Math.max(1, Math.min(10, Math.floor(Number(m.qty) || 1)));
    const cost = it.price * qty;
    if (p.money < cost) return this.toast(s, 'No tienes suficiente dinero (' + OP.fmtB(cost) + ').');
    p.money -= cost;
    if (it.sword) {
      if ((p.inv.swords || []).length >= MMO.SWORD_MAX) { p.money += cost; return this.toast(s, 'Ya llevas ' + MMO.SWORD_MAX + ' espadas. Vende alguna en el inventario (I).'); }
      const g = game.giveSword(p, it.sword);
      this.toast(s, '🗡️ Compras «' + g.sw.n + '» (' + MMO.SWORD_RARITY[it.sword].name + ') por ' + OP.fmtB(cost) + '. Equípala en el inventario (I).');
      s.dirty = true; s.saveDirty = true;
      return;
    }
    if (it.ship) { p.ships.push(it.ship); game.moment(p, 'Compró un ' + it.name.toLowerCase(), 15); }
    else if (key === 'logpose') { p.logpose = true; game.addLog(p, 'Consiguió un Log Pose en ' + I.name + '.'); }
    else if (key === 'coating') { p.coated = true; game.addLog(p, 'Recubrió su barco en ' + I.name + '.'); }
    else if (key === 'notifier') {
      p.notifier = true;
      game.moment(p, 'Compró un Fruit Notifier por ' + OP.fmtB(cost), 45);
      this.news('world', '🔔 ' + p.name + ' ha comprado un Fruit Notifier por ' + OP.fmtB(cost) + '. Ahora sabrá dónde aparece cada Fruta del Diablo.', 3);
      this.toast(s, '🔔 ¡Fruit Notifier activado! Te avisará cuando aparezca una fruta. En la ventana de Frutas verás las que siguen escondidas.');
    }
    else p.inv[key] = (p.inv[key] || 0) + qty;
    this.toast(s, '🛒 Compras ' + (qty > 1 ? qty + ' x ' : '') + it.name + ' por ' + OP.fmtB(cost) + '.');
    this.checkQuests(s);
    s.dirty = true; s.saveDirty = true;
  }

  // ======================================================================
  //  FRUTAS DEL DIABLO: recoger, comer y usar su habilidad (tecla Q)
  // ======================================================================
  // Cada fruta escondida tiene un punto concreto en su isla donde se ve al acercarse
  ensureFruitSpots() {
    for (const fr of this.OP.S.fruits) {
      if (fr.state !== 'hidden' || fr.isl < 0) continue;
      if (fr.spotIsl === fr.isl && fr.x != null) continue;
      const I = this.M.islands[fr.isl];
      if (!I || !I.land.length) continue;
      const c = this.game.pick(I.land);
      fr.x = (c % this.M.W) + 0.5; fr.y = ((c / this.M.W) | 0) + 0.5; fr.spotIsl = fr.isl;
    }
  }
  onPickup(s, m) {
    const { OP, MMO, game } = this;
    const p = s.data;
    const fr = OP.S.fruits[Number(m.fid)];
    if (s.st.dead || !fr) return;
    if (fr.state !== 'hidden' || fr.x == null) return this.toast(s, 'Alguien se te ha adelantado: la fruta ya no está.');
    if (p.boat) return this.toast(s, 'Desembarca para recogerla.');
    if (Math.hypot(p.x - fr.x, p.y - fr.y) > MMO.FRUIT_PICKUP_RANGE + 0.3) { this.strike(s, 'recoger fruta desde lejos'); return this.toast(s, 'Acércate más para recogerla.'); }
    p.inv.fruits = p.inv.fruits || [];
    if (p.inv.fruits.length >= MMO.FRUIT_BAG_MAX) return this.toast(s, 'No te caben más frutas en la bolsa (máximo ' + MMO.FRUIT_BAG_MAX + ').');
    const F = OP.FRUITS[fr.id], isl = fr.isl;
    const d = OP.S.isl[isl];
    if (d && d.fruit === fr.id) { d.fruit = -1; d.fruitRumor = false; }
    fr.state = 'carried'; fr.isl = -1; fr.x = null; fr.spotIsl = -1; fr.ownerName = p.name; fr.owner = 0; fr.since = OP.S.time;
    this.onFruitFound(fr, Date.now());   // la "lástima" vuelve a empezar
    p.inv.fruits.push(fr.id);
    game.moment(p, 'Encontró la ' + F.name + ' en ' + this.M.islands[isl].name, 34);
    this.toast(s, '🍎 ¡Has encontrado la ' + F.name + '! Está en tu inventario (I) → COMER.');
    this.news('fruit', p.name + ' ha encontrado una Fruta del Diablo en ' + this.M.islands[isl].name + '.', 3);
    s.dirty = true; s.saveDirty = true;
    this.saveChar(s);
  }
  onEat(s, m) {
    const { OP, MMO, game } = this;
    const p = s.data;
    const fid = Number(m.fid);
    p.inv.fruits = p.inv.fruits || [];
    const i = p.inv.fruits.indexOf(fid);
    if (s.st.dead || i < 0) return this.toast(s, 'No tienes esa fruta.');
    if (p.fruit >= 0) return this.toast(s, 'Ya comiste una Fruta del Diablo: comer otra te mataría.');
    const F = OP.FRUITS[fid], fr = OP.S.fruits[fid];
    p.inv.fruits.splice(i, 1);
    p.fruit = fid;
    fr.state = 'owned'; fr.owner = 0; fr.ownerName = p.name; fr.isl = -1; fr.since = OP.S.time;
    const ab = MMO.abilityOf(fid);
    game.moment(p, 'Se comió la ' + F.name, 40);
    this.toast(s, '🍎 Te comes la ' + F.name + ' (' + F.type + '). Nuevo poder: ' + ab.name + ' (tecla Q). Ya nunca podrás nadar.');
    this.news('fruit', p.name + ' ha comido la ' + F.name + ' (' + F.type + ', ' + OP.RARITY[F.rarity] + '): ' + F.ability.toLowerCase() + '.', 3);
    s.dirty = true; s.saveDirty = true;
    this.saveChar(s);
  }
  onAbility(s, m) {
    const { OP, MMO } = this;
    const p = s.data;
    const now = Date.now();
    if (s.st.dead || p.fruit < 0) return;
    if (p.execution) return this.toast(s, '⛓️ Las cadenas de kairoseki anulan tu fruta.');
    if (p.inside) return this.toast(s, '🏠 Aquí dentro no se pelea.');
    if (s.training) return this.toast(s, '🥋 Estás entrenando: suelta T para luchar.');
    if (s.stunUntil > now) return this.toast(s, '💫 Estás aturdido.');
    const ab = MMO.abilityOf(p.fruit);
    if ((s.cds.ability || 0) > now + 40) return this.toast(s, ab.name + ': aún no (' + Math.ceil((s.cds.ability - now) / 1000) + ' s).');
    if (ab.kind === 'buff') {
      s.cds.ability = now + ab.cd;
      s.abBuff = { mult: ab.mult, until: now + ab.dur };
      if (ab.heal) p.hp = Math.min(MMO.stats(p).maxHp, p.hp + MMO.stats(p).maxHp * ab.heal);
      this.broadcast('afx', { k: 'buff', who: s.sid, x: p.x, y: p.y, c: ab.color, d: ab.dur, n: ab.name });
      s.dirty = true;
      return this.toast(s, '✨ ' + ab.name + ': tus golpes son más fuertes durante ' + Math.round(ab.dur / 1000) + ' s.');
    }
    if (ab.kind === 'ranged') {
      let tx, ty, hit = null;
      if (m.t === 'n') {
        const npc = OP.S.A[Number(m.id)];
        if (!npc || npc.loc !== 'island' || npc._ko > now || npc.battle) return this.toast(s, 'Objetivo no válido.');
        if (p.boat) return this.toast(s, 'Desembarca para usarla contra alguien en tierra.');
        if (p.faction === 'marine' && npc.faction === 'marine') return this.toast(s, 'No puedes atacar a un compañero de la Marina.');
        if (npc.pcCrew && npc.pcCrew === p.crewId) return this.toast(s, npc.name + ' es de tu tripulación.');
        if (Math.hypot(p.x - npc.x, p.y - npc.y) > ab.range + 0.35) return this.toast(s, 'Fuera de alcance (' + ab.range + ' casillas).');
        tx = npc.x; ty = npc.y; hit = () => this.hitNpc(s, npc, ab.mult * MMO.fruitMul(p), now);
      } else if (m.t === 'p') {
        const t = this.ps.get(String(m.id));
        if (!t || t === s || t.st.dead) return;
        const why = this.pvpBlocked(s, t);
        if (why) return this.toast(s, why);
        if (!!p.boat !== !!t.data.boat) return this.toast(s, 'No puedes alcanzar a alguien en tierra desde el agua (ni al revés).');
        if (Math.hypot(p.x - t.data.x, p.y - t.data.y) > ab.range + 0.35) return this.toast(s, 'Fuera de alcance (' + ab.range + ' casillas).');
        tx = t.data.x; ty = t.data.y; hit = () => this.hitPlayer(s, t, ab.mult * MMO.fruitMul(p), now);
      } else return this.toast(s, 'Elige un objetivo para ' + ab.name + '.');
      s.cds.ability = now + ab.cd; s.lastCombat = now;
      this.broadcast('afx', { k: 'ranged', who: s.sid, x: p.x, y: p.y, tx, ty, c: ab.color, n: ab.name });
      hit();
      s.dirty = true;
      return;
    }
    // área: todos los enemigos alrededor (NPC en tierra y jugadores con los que se puede luchar)
    s.cds.ability = now + ab.cd; s.lastCombat = now;
    this.broadcast('afx', { k: 'aoe', who: s.sid, x: p.x, y: p.y, r: ab.radius, c: ab.color, n: ab.name });
    let n = 0;
    if (!p.boat) for (const npc of OP.S.agents) {
      if (n >= 8) break;
      if (npc.loc !== 'island' || npc._ko > now || npc.battle) continue;
      if (p.faction === 'marine' && npc.faction === 'marine') continue;
      if (npc.pcCrew && npc.pcCrew === p.crewId) continue;
      if (Math.hypot(p.x - npc.x, p.y - npc.y) > ab.radius) continue;
      this.hitNpc(s, npc, ab.mult * MMO.fruitMul(p), now); n++;
    }
    for (const t of this.ps.values()) {
      if (t === s || t.st.dead || this.pvpBlocked(s, t) || !!p.boat !== !!t.data.boat) continue;
      if (Math.hypot(p.x - t.data.x, p.y - t.data.y) > ab.radius) continue;
      this.hitPlayer(s, t, ab.mult * MMO.fruitMul(p), now); n++;
    }
    if (!n) this.toast(s, ab.name + ': no había enemigos alrededor.');
    s.dirty = true;
  }

  onDev(s, m) {
    const { OP, MMO } = this;
    const p = s.data;
    if (p.inside && (m.op === 'tp' || m.op === 'xy' || m.op === 'tpTo')) this.exitInterior(s, true);
    if (m.op === 'giveFruit') { const fr = OP.S.fruits.find((f) => f.state === 'none' && (m.key ? OP.FRUITS[f.id].key === m.key : true)); if (fr) { fr.state = 'owned'; fr.owner = 0; fr.ownerName = p.name; p.fruit = fr.id; s.dirty = true; s.client.send('toast', { text: '[prueba] fruta|' + fr.id + '|' + OP.FRUITS[fr.id].name }); } }
    if (m.op === 'tpTrain') { const I = this.M.islands.find((x) => x.train && x.train.label.toLowerCase().indexOf(String(m.kw)) >= 0); if (I) { let best = I.land[0], bd = 1e9; for (const c of I.land) { const d = Math.hypot((c % this.M.W) - I.x, ((c / this.M.W) | 0) - I.y); if (d < bd) { bd = d; best = c; } } p.x = (best % this.M.W) + 0.5; p.y = ((best / this.M.W) | 0) + 0.5; p.boat = ''; s.client.send('teleport', { x: p.x, y: p.y }); this.syncPublic(s); } }
    if (m.op === 'doorsHere') { const I = MMO.islandAt(p.x, p.y) || this.M.byId[String(m.id)]; const L = OP.Interiors.doors().filter((d) => !I || d.isl === I.idx); s.client.send('toast', { text: '[prueba] doors|' + JSON.stringify(L.map((d) => ({ id: d.id, kind: d.kind, x: d.x, y: d.y }))) }); }
    if (m.op === 'fruitHere') {
      const I = MMO.islandAt(p.x, p.y);
      if (!I) return;
      const fr = OP.S.fruits.find((f) => f.id === Number(m.fid) && f.state === 'none') || OP.S.fruits.find((f) => f.state === 'none');
      if (!fr) return;
      fr.state = 'hidden'; fr.isl = I.idx; fr.x = p.x + 3; fr.y = p.y; fr.spotIsl = I.idx;
      if (this.M.isl[Math.floor(fr.y) * this.M.W + Math.floor(fr.x)] !== I.idx) { fr.x = p.x; fr.y = p.y; }
      OP.S.isl[I.idx].fruit = fr.id;
      this.toast(s, '[prueba] Fruta ' + OP.FRUITS[fr.id].name + ' colocada cerca.');
    }
    if (m.op === 'empHere') {   // solo pruebas: trae al líder de un Emperador a tu lado, casi sin vida
      const u = OP.S.U[OP.S.emperors[Number(m.k) || 0]];
      const a = u && OP.S.A[u.leader];
      const I = MMO.islandAt(p.x, p.y);
      if (!a || !I) return;
      a.loc = 'island'; a.isl = I.idx; a.x = p.x + 0.8; a.y = p.y; a.hp = 1; a._ko = 0; a.battle = null; a.carriedBy = 0;
      this.Sim.rebuildOccupants();
      s.client.send('toast', { text: '[prueba] Emperador ' + a.name + '|' + a.id });
    }
    if (m.op === 'tpTo') {   // solo pruebas: ponerse al lado de otro jugador
      const t = this.ps.get(String(m.sid));
      if (!t) return;
      p.x = t.data.x + 0.6; p.y = t.data.y; p.boat = t.data.boat; s.dirty = true;
      s.client.send('teleport', { x: p.x, y: p.y });
      this.syncPublic(s);
    }
    if (m.op === 'money') { p.money += Math.max(0, Number(m.amount) || 0); s.dirty = true; }
    if (m.op === 'merit') { p.merit = Math.max(0, Number(m.amount) || 0); s.dirty = true; this.afterMerit(s); }
    if (m.op === 'setHp') { p.hp = Math.max(1, Number(m.hp) || 1); s.dirty = true; this.syncPublic(s); }
    if (m.op === 'tp') {   // solo pruebas: llevar al jugador al puerto de una isla
      const I = this.M.byId[String(m.id)];
      if (!I) return;
      const pos = this.game.portPos(I);
      p.x = pos.x; p.y = pos.y; p.boat = ''; p.wcls = I.sky ? 2 : I.deep ? 3 : 1;
      s.lastIsl = I.idx; s.dirty = true;
      s.client.send('teleport', { x: p.x, y: p.y });
      this.syncPublic(s);
    }
    // ---- solo pruebas de los sistemas del final del juego ----
    if (m.op === 'bounty') { p.bounty = Math.max(0, Number(m.amount) || 0); s.dirty = true; this.syncPublic(s); }
    if (m.op === 'visit') { p.visited = (m.ids || []).map((id) => this.M.byId[id] && this.M.byId[id].idx).filter((x) => x >= 0); s.dirty = true; }
    if (m.op === 'powerUp') { p.str += Number(m.n) || 100; p.spd += Number(m.n) || 100; s.dirty = true; }
    if (m.op === 'seaNear') {   // en barco, justo al lado del puerto de una isla
      const I = this.M.byId[String(m.id)];
      if (!I) return;
      const pos = this.game.portPos(I);
      let best = null;
      for (let r = 1; r < 6 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r && !best; dx++) {
        const x = Math.floor(pos.x) + dx, y = Math.floor(pos.y) + dy, t = this.M.t[y * this.M.W + x];
        if (!OP.isLand(t) && !OP.isRed(t) && (this.M.clsM[y * this.M.W + x] || 1) === 1) best = { x: x + 0.5, y: y + 0.5 };
      }
      if (!best) return;
      p.x = best.x; p.y = best.y; p.wcls = 1; p.boat = MMO.shipOf(p, this.crewShip(p));
      s.client.send('teleport', { x: p.x, y: p.y }); s.dirty = true; this.syncPublic(s);
      s.client.send('toast', { text: '[prueba] port|' + pos.x.toFixed(2) + '|' + pos.y.toFixed(2) });
    }
    if (m.op === 'xy') { p.x = Number(m.x); p.y = Number(m.y); const t = this.M.t[Math.floor(p.y) * this.M.W + Math.floor(p.x)]; if (OP.isLand(t)) p.boat = ''; else { p.boat = MMO.shipOf(p, this.crewShip(p)); p.wcls = this.M.clsM[Math.floor(p.y) * this.M.W + Math.floor(p.x)] || 1; } s.client.send('teleport', { x: p.x, y: p.y }); this.syncPublic(s); }
    if (m.op === 'hakiAll') { p.haki = [true, true, true]; p.hakiXp = { arm: Number(m.xp) || 0, obs: Number(m.xp) || 0, conq: Number(m.xp) || 0 }; s.dirty = true; }
    if (m.op === 'fruitAge') { this.fruitPity().lastFind = Date.now() - (Number(m.hours) || 0) * 3600000; this.fruitPity().lastSpawn = 0; this.tickFruitPity(Date.now()); }
    if (m.op === 'fruitSpawn') { const r = this.spawnFruitNearPlayers([s], Date.now(), 'prueba'); s.client.send('toast', { text: '[prueba] fruta|' + (r ? r.fr.id + '|' + r.I.name + '|' + r.fr.x + '|' + r.fr.y : 'ninguna') }); }
    if (m.op === 'admin') { this.adminCommand(String(m.text || ''), (msg) => s.client.send('toast', { text: '[admin] ' + msg })); }
    if (m.op === 'yonkouNow') { this.updateYonkou(); s.client.send('toast', { text: '[prueba] yonkou|' + (OP.S.playerYonkou || []).join(',') }); }
    if (m.op === 'tributeNow') { for (const d of OP.S.isl) if (d.owner) d.owner.lastTribute = 0; this.tickTerritories(Date.now()); }
    if (m.op === 'huntNow') { if (p.traitor) p.traitor.hunted = 0; this.tickTraitors(Date.now()); }
    if (m.op === 'imprisonMe') { this.imprison(s, 'Prueba'); this.enterPrison(s); }
    if (m.op === 'giveSword') { p.inv = p.inv || {}; p.inv.swords = p.inv.swords || []; p.inv.swords.push({ id: 'tst' + Date.now(), n: 'Espada de prueba', r: Number(m.r) || 3 }); s.dirty = true; }
    if (m.op === 'npcCrewHere') {   // tripulación NPC con algún miembro en tu isla
      const I = MMO.islandAt(p.x, p.y);
      const u = I && OP.S.units.find((u) => u.faction === 'pirate' && !u.solo && !u.camp && OP.S.A[u.leader] && OP.S.emperors.indexOf(u.id) < 0 && u.members.some((id) => OP.S.A[id] && OP.S.A[id].loc === 'island' && OP.S.A[id].isl === I.idx));
      if (u) { const L = OP.S.A[u.leader]; if (m.easy) L.lvl = 1; s.client.send('toast', { text: '[prueba] npccrew|' + u.id + '|' + u.name }); }
      else if (I && m.make) {   // si no hay ninguna, se trae una cualquiera a esta isla
        const v = OP.S.units.find((u) => u.faction === 'pirate' && !u.solo && !u.camp && OP.S.A[u.leader] && OP.S.emperors.indexOf(u.id) < 0 && OP.S.A[u.leader].loc === 'island');
        if (v) { const L = OP.S.A[v.leader]; L.isl = I.idx; L.x = p.x + 1.5; L.y = p.y; if (m.easy) L.lvl = 1; this.Sim.rebuildOccupants(); s.client.send('toast', { text: '[prueba] npccrew|' + v.id + '|' + v.name }); }
      }
    }
    if (m.op === 'level') { const to =Math.max(1, Math.min(100, Number(m.lvl) || 1)); while (p.lvl < to) this.game.gainXp(p, MMO.xpNeed(p.lvl) - p.xp, { raw: true }); s.dirty = true; }
    if (m.op === 'bountyNear') {
      let best = null, bd = 99;
      for (const a of OP.S.agents) { if (a.loc !== 'island' || a.faction !== 'pirate' || !a.bandit) continue; const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < bd) { bd = d; best = a; } }
      if (best) { best.bounty = Number(m.amount) || 5e6; s.client.send('toast', { text: '[prueba] ' + best.name + ' ahora vale ' + OP.fmtB(best.bounty) + '|' + best.id }); }
    }
  }

  // ======================================================================
  //  CHAT
  // ======================================================================
  onChat(s, m) {
    const now = Date.now();
    s.chatTimes = s.chatTimes.filter((t) => now - t < 10000);
    if (s.chatTimes.length >= 8 || (s.chatTimes.length && now - s.chatTimes[s.chatTimes.length - 1] < 600)) return this.toast(s, 'Vas demasiado rápido escribiendo.');
    const text = String(m.text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text) return;
    s.chatTimes.push(now);
    const p = s.data;
    // órdenes del administrador (/forzar_ejecucion, /reiniciar_era...): solo con sesión de administrador y desde este PC
    if (/^\/(forzar_ejecucion|cancelar_ejecucion|ejecuciones|reiniciar_era|cambiar_clave|ayuda)\b/i.test(text)) {
      if (!s.admin || !require('./admin').isLocal(s.ip)) return this.toast(s, 'Esa orden es solo para el administrador (inicia sesión en ⋯ → Administrador, desde el PC del servidor).');
      console.log('[admin] ' + p.name + ': ' + (/^\/cambiar_clave/i.test(text) ? text.split(/\s+/).slice(0, 2).join(' ') + ' ***' : text));   // la contraseña no se escribe en la consola
      return this.adminCommand(text, (msg) => s.client.send('chat', { ch: 'system', kind: 'admin', text: '🛠 ' + msg, t: Date.now() }));
    }
    // silenciado por un administrador
    if ((p.mutedUntil || 0) > now) return this.toast(s, '🔇 Estás silenciado en el chat ' + Math.ceil((p.mutedUntil - now) / 60000) + ' min más.');
    const msg = { ch: 'global', from: p.name, fac: p.faction, text, t: now };
    if (m.ch === 'crew') {
      if (!p.crewId) return this.toast(s, 'No estás en ninguna tripulación.');
      msg.ch = 'crew';
      for (const o of this.ps.values()) if (o.data.crewId === p.crewId) o.client.send('chat', msg);
      return;
    }
    if (m.ch === 'pm') {
      const to = String(m.to || '').trim().toLowerCase();
      const t = [...this.ps.values()].find((o) => o.data.name.toLowerCase() === to);
      if (!t) return this.toast(s, 'No hay nadie conectado con ese nombre.');
      if (t === s) return;
      msg.ch = 'pm'; msg.to = t.data.name;
      t.client.send('chat', msg); s.client.send('chat', msg);
      return;
    }
    this.chatLog.push(msg);
    if (this.chatLog.length > 60) this.chatLog.shift();
    this.broadcast('chat', msg);
  }
  system(text, kind) {
    const msg = { ch: 'system', text, kind: kind || '', t: Date.now() };
    this.chatLog.push(msg);
    if (this.chatLog.length > 60) this.chatLog.shift();
    this.broadcast('chat', msg);
  }
  toast(s, text) { s.client.send('toast', { text }); }
  // a: quién golpea ('p:sesión' o 'n:id de NPC') para que los clientes animen su brazo
  fx(x, y, r, onPlayer, att) { this.broadcast('fx', { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, v: r.miss ? 0 : r.dmg, c: r.crit ? 1 : 0, p: onPlayer ? 1 : 0, a: att || '' }); }

  // ======================================================================
  //  TRIPULACIONES DE JUGADORES
  // ======================================================================
  crewShip(p) { const c = p.crewId && this.crews.get(p.crewId); return c ? c.ship || '' : ''; }
  // datos de un miembro (conectado o no) para la ventana de tripulación, el ranking y la foto de grupo
  memberInfo(cid) {
    const sid = this.byCid.get(cid);
    const o = sid && this.ps.get(sid);
    if (o) return { cid, name: o.data.name, lvl: o.data.lvl, online: true, sid, app: o.data.app, bounty: o.data.bounty || 0, faction: o.data.faction, rank: o.data.rank };
    const row = this.db.characterById(cid);
    if (!row) return null;
    const d = JSON.parse(row.data);
    return { cid, name: d.name, lvl: d.lvl, online: false, app: d.app, bounty: d.bounty || 0, faction: d.faction, rank: d.rank };
  }
  crewPayload(c) {
    const fleets = (c.fleets || []).map((f) => ({ id: f.id, name: f.name, captain: f.captain, members: f.members.map((cid) => this.memberInfo(cid)).filter(Boolean) }));
    const members = c.members.map((cid) => this.memberInfo(cid)).filter(Boolean);
    const npcs = this.crewNpcs(c).map((a) => ({ id: a.id, name: a.name, lvl: a.lvl, bounty: a.bounty, faction: a.faction, rank: a.rank, app: a.app, isl: a.loc === 'island' ? this.M.islands[a.isl].name : '', order: a.pcOrder || 'follow', guard: a.pcGuardIsl != null && a.pcOrder === 'guard' ? this.M.islands[a.pcGuardIsl].name : '' }));
    const total = members.reduce((t, m) => t + m.bounty, 0) + npcs.reduce((t, a) => t + (a.bounty || 0), 0) + fleets.reduce((t, f) => t + f.members.reduce((u, m) => u + m.bounty, 0), 0);
    const S = this.OP.S;
    const territories = S.isl.map((d, i) => (d.owner && d.owner.crewId === c.id ? { idx: i, name: this.M.islands[i].name, guards: this.crewNpcs(c).filter((a) => a.pcOrder === 'guard' && a.pcGuardIsl === i).length } : null)).filter(Boolean);
    return { id: c.id, name: c.name, faction: c.faction, captain: c.captain, ship: c.ship || '', flag: c.flag, members, npcs, fleets, total,
      yonkou: (S.playerYonkou || []).indexOf(c.id) >= 0, territories };
  }
  // ---------- Flotas ----------
  // fleet_create {name, cid}: un miembro de la principal pasa a ser Almirante de Flota de una flota nueva
  // fleet_move {cid, to}: mover a alguien entre la principal y las flotas ('' = principal)
  // fleet_disband {fid}: sus miembros vuelven a la principal si hay sitio (si no, se quedan en otra flota o salen)
  fleetOp(s, c, isCap, op, m) {
    const { MMO } = this;
    if (!isCap) return this.toast(s, 'Solo el capitán de la tripulación manda sobre las flotas.');
    c.fleets = c.fleets || [];
    const cid = Number(m.cid);
    if (op === 'fleet_create') {
      if (c.fleets.length >= MMO.FLEET_MAX) return this.toast(s, 'Ya tienes ' + MMO.FLEET_MAX + ' flotas.');
      const name = String(m.name || '').replace(/\s+/g, ' ').trim();
      if (!/^[\p{L}\p{N} .'-]{3,24}$/u.test(name)) return this.toast(s, 'El nombre de la flota debe tener entre 3 y 24 letras.');
      if (cid === s.cid || c.members.indexOf(cid) < 0) return this.toast(s, 'Elige como Almirante de Flota a un miembro de la tripulación principal.');
      c.members = c.members.filter((x) => x !== cid);
      c.fleets.push({ id: 'f' + Date.now().toString(36), name, captain: cid, members: [cid] });
      const info = this.memberInfo(cid);
      this.news('crew', '⚓ "' + c.name + '" crea la flota "' + name + '" con ' + (info ? info.name : '?') + ' como Almirante de Flota.', 2);
    } else if (op === 'fleet_move') {
      const from = this.fleetOf(c, cid);
      const inMain = c.members.indexOf(cid) >= 0;
      if (!from && !inMain) return;
      if (cid === c.captain) return this.toast(s, 'El capitán siempre está en la tripulación principal.');
      const to = m.to ? c.fleets.find((f) => f.id === m.to) : null;
      if (m.to && !to) return;
      if (to ? to.members.length >= MMO.FLEET_SIZE : c.members.length >= MMO.CREW_MAX) return this.toast(s, 'No queda sitio ahí.');
      if (from) { from.members = from.members.filter((x) => x !== cid); if (from.captain === cid) from.captain = from.members[0] || 0; }
      else c.members = c.members.filter((x) => x !== cid);
      if (to) { to.members.push(cid); if (!to.captain) to.captain = cid; } else c.members.push(cid);
      c.fleets = c.fleets.filter((f) => f.members.length);
    } else if (op === 'fleet_disband') {
      const f = c.fleets.find((x) => x.id === m.fid);
      if (!f) return;
      c.fleets = c.fleets.filter((x) => x !== f);
      for (const x of f.members) {
        if (c.members.length < MMO.CREW_MAX) c.members.push(x);
        else { const g = c.fleets.find((y) => y.members.length < MMO.FLEET_SIZE); if (g) g.members.push(x); else this.setMemberCrew(x, 0); }
      }
    }
    this.db.saveCrew(c);
    this.notifyCrew(c);
  }
  fleetOf(c, cid) { return (c.fleets || []).find((f) => f.members.indexOf(cid) >= 0) || null; }
  crewHasRoom(c) { return c.members.length < this.MMO.CREW_MAX || (c.fleets || []).some((f) => f.members.length < this.MMO.FLEET_SIZE); }
  crewCount(c) { return c.members.length + (c.fleets || []).reduce((t, f) => t + f.members.length, 0); }
  sendCrew(s) {
    const c = s.data.crewId ? this.crews.get(s.data.crewId) : null;
    if (s.data.crewId && !c) s.data.crewId = 0;
    s.client.send('crew', c ? this.crewPayload(c) : null);
  }
  notifyCrew(c) {
    const payload = c ? this.crewPayload(c) : null;
    for (const o of this.ps.values()) if (c && o.data.crewId === c.id) { o.client.send('crew', payload); this.syncPublic(o); }
  }
  setMemberCrew(cid, crewId) {
    const sid = this.byCid.get(cid);
    const o = sid && this.ps.get(sid);
    if (o) { o.data.crewId = crewId; o.saveDirty = true; this.syncPublic(o); this.sendCrew(o); this.saveChar(o); return; }
    const row = this.db.characterById(cid);
    if (!row) return;
    const d = JSON.parse(row.data);
    d.crewId = crewId;
    this.db.saveCharacter(cid, d);
  }
  onCrew(s, m) {
    const p = s.data;
    const op = m.op;
    const c = p.crewId ? this.crews.get(p.crewId) : null;
    const isCap = c && c.captain === s.cid;
    if (op === 'create') {
      if (c) return this.toast(s, 'Ya estás en una tripulación.');
      const name = String(m.name || '').replace(/\s+/g, ' ').trim();
      if (!/^[\p{L}\p{N} .'-]{3,28}$/u.test(name)) return this.toast(s, 'El nombre de la tripulación debe tener entre 3 y 28 letras.');
      if (this.db.crewNameTaken(name)) return this.toast(s, 'Ya existe una tripulación con ese nombre.');
      const cost = 10000;
      if (p.money < cost) return this.toast(s, 'Fundar una tripulación cuesta ' + this.OP.fmtB(cost) + '.');
      p.money -= cost;
      const flag = { bg: this.game.pick(['#111', '#111', '#7a1010', '#10307a', '#3b1a5a', '#0f4d2a']), fg: this.game.pick(['#f4f4f4', '#f4d03f', '#e74c3c']), sym: this.game.randInt(0, 5) };
      const crew = { name, faction: p.faction, captain: s.cid, members: [s.cid], ship: '', flag };
      crew.id = this.db.addCrew(name, p.faction, s.cid, { members: crew.members, ship: '', flag });
      this.crews.set(crew.id, crew);
      p.crewId = crew.id;
      this.game.moment(p, 'Fundó ' + (p.faction === 'pirate' ? 'su tripulación' : 'su escuadrón') + ': ' + name, 30);
      this.toast(s, '🏴‍☠️ Fundas ' + (p.faction === 'pirate' ? 'la tripulación' : 'el escuadrón') + ' "' + name + '". Eres el capitán.');
      this.news('crew', 'Nace ' + (p.faction === 'pirate' ? 'una tripulación' : 'un escuadrón de la Marina') + ': "' + name + '", con ' + p.name + ' al mando.', 2);
      this.sendCrew(s); this.syncPublic(s);
      s.dirty = true; s.saveDirty = true;
      return;
    }
    if (op === 'invite') {
      if (!c) return this.toast(s, 'Primero funda una tripulación.');
      const myFleet = this.fleetOf(c, s.cid);
      const fleetCap = myFleet && myFleet.captain === s.cid;   // los Almirantes de Flota invitan a su flota
      if (!isCap && !fleetCap) return this.toast(s, 'Solo el capitán (o un Almirante de Flota) puede invitar.');
      const t = this.ps.get(String(m.sid));
      if (!t || t === s) return this.toast(s, 'Ese jugador no está conectado.');
      if (t.data.crewId || t.data.npcCrew) return this.toast(s, t.data.name + ' ya está en una tripulación.');
      if (t.data.faction !== c.faction) return this.toast(s, 'Solo puedes invitar a gente de tu facción.');
      if (fleetCap && !isCap ? myFleet.members.length >= this.MMO.FLEET_SIZE : !this.crewHasRoom(c)) return this.toast(s, 'No queda sitio (10 en la principal y 10 por flota).');
      t.invite = { crewId: c.id, fleetId: fleetCap && !isCap ? myFleet.id : '', from: p.name, until: Date.now() + 60000 };
      t.client.send('invite', { crewId: c.id, crew: c.name, from: p.name });
      return this.toast(s, '📨 Invitación enviada a ' + t.data.name + '.');
    }
    if (op === 'accept' || op === 'decline') {
      const inv = s.invite;
      s.invite = null;
      if (!inv || inv.until < Date.now()) return this.toast(s, 'La invitación ha caducado.');
      const crew = this.crews.get(inv.crewId);
      if (op === 'decline' || !crew) return;
      return this.joinCrew(s, crew, inv.fleetId);
    }
    // tripulaciones NPC: pedir unirse, dejarla o traicionar (también vale para tripulaciones de jugadores)
    if (op === 'npcjoin') return this.joinNpcCrew(s, Number(m.unitId));
    if (op === 'npcleave') { if (p.npcCrew) this.leaveNpcCrew(s); return; }
    if (op === 'betray') return this.betrayCrew(s);
    // pedir unirse a la tripulación de otro jugador (decide su capitán)
    if (op === 'request') {
      if (c) return this.toast(s, 'Ya estás en una tripulación.');
      const crew = this.crews.get(Number(m.crewId));
      if (!crew) return this.toast(s, 'Esa tripulación ya no existe.');
      if (crew.faction !== p.faction) return this.toast(s, 'Solo puedes unirte a gente de tu facción.');
      if (!this.crewHasRoom(crew)) return this.toast(s, 'La tripulación y sus flotas están llenas.');
      if (p.npcCrew) return this.toast(s, 'Primero deja tu tripulación NPC.');
      const capSid = this.byCid.get(crew.captain);
      const cap = capSid && this.ps.get(capSid);
      if (!cap) return this.toast(s, 'El capitán de "' + crew.name + '" no está conectado. Prueba más tarde.');
      if (s.joinReq && s.joinReq.until > Date.now()) return this.toast(s, 'Ya tienes una solicitud pendiente. Espera la respuesta.');
      s.joinReq = { crewId: crew.id, until: Date.now() + 90000 };
      cap.client.send('crewreq', { sid: s.sid, name: p.name, lvl: p.lvl, bounty: p.bounty, crew: crew.name });
      return this.toast(s, '📨 Solicitud enviada al capitán de "' + crew.name + '".');
    }
    if (!c) return this.toast(s, 'No estás en ninguna tripulación.');
    if (op === 'approve' || op === 'reject') {
      if (!isCap) return this.toast(s, 'Solo el capitán puede responder solicitudes.');
      const t = this.ps.get(String(m.sid));
      if (!t || !t.joinReq || t.joinReq.crewId !== c.id || t.joinReq.until < Date.now()) return this.toast(s, 'La solicitud ha caducado.');
      t.joinReq = null;
      if (op === 'reject') return this.toast(t, '✋ El capitán de "' + c.name + '" ha rechazado tu solicitud.');
      return this.joinCrew(t, c);
    }
    if (op === 'recruit') return this.recruitNpc(s, c, isCap, Number(m.id));
    if (op === 'order') return this.crewOrder(s, c, isCap, String(m.kind || ''), Number(m.id) || 0);
    if (op === 'fleet_create' || op === 'fleet_move' || op === 'fleet_disband') return this.fleetOp(s, c, isCap, op, m);
    if (op === 'betray') return this.betrayCrew(s);
    if (op === 'claim') return this.claimIsland(s, c, isCap);
    if (op === 'guard') return this.guardIsland(s, c, isCap, Number(m.id), Number(m.isl));
    if (op === 'unclaim') { if (!isCap) return; const d = this.OP.S.isl[Number(m.isl)]; if (d && d.owner && d.owner.crewId === c.id) { this.loseTerritory(Number(m.isl), 'lo abandonaste'); this.notifyCrew(c); } return; }
    if (op === 'board') return this.boardShip(s, m.sid);
    if (op === 'unboard') { if (s.ride) this.leaveRide(s, 'land'); return; }
    if (op === 'dismiss') {
      if (!isCap) return this.toast(s, 'Solo el capitán puede despedir a alguien.');
      const a = this.OP.S.A[Number(m.id)];
      if (!a || a.pcCrew !== c.id) return;
      this.releaseNpc(a);
      this.notifyCrew(c);
      return this.toast(s, '👋 ' + a.name + ' deja la tripulación y sigue su camino.');
    }
    if (op === 'leave') return this.removeFromCrew(c, s.cid, p.name + ' abandona la tripulación.');
    if (!isCap) return this.toast(s, 'Solo el capitán puede hacer eso.');
    const target = Number(m.cid);
    if (op === 'kick') { if (target === s.cid || (c.members.indexOf(target) < 0 && !this.fleetOf(c, target))) return; return this.removeFromCrew(c, target, 'El capitán ha expulsado a un miembro.'); }
    if (op === 'promote') {
      if (target === s.cid || c.members.indexOf(target) < 0) return;
      c.captain = target;
      this.db.saveCrew(c); this.notifyCrew(c);
      for (const o of this.ps.values()) if (o.data.crewId === c.id) this.toast(o, '👑 Hay nuevo capitán en "' + c.name + '".');
      return;
    }
    if (op === 'ship') {
      const type = String(m.type || '');
      if (type && p.ships.indexOf(type) < 0) return this.toast(s, 'No tienes ese barco.');
      c.ship = type;
      this.db.saveCrew(c); this.notifyCrew(c);
      for (const o of this.ps.values()) if (o.data.crewId === c.id) this.toast(o, '⛵ Barco compartido de la tripulación: ' + (type ? this.OP.SHIPS[type].name : 'ninguno') + '.');
      return;
    }
    if (op === 'disband') {
      for (const cid of c.members.slice()) this.setMemberCrew(cid, 0);
      for (const f of c.fleets || []) for (const cid of f.members) this.setMemberCrew(cid, 0);
      for (const a of this.crewNpcs(c)) this.releaseNpc(a);
      this.dropTerritories(c.id);
      this.crews.delete(c.id);
      this.db.deleteCrew(c.id);
      this.news('crew', 'La tripulación "' + c.name + '" se ha disuelto.', 1);
    }
  }
  joinCrew(s, crew, fleetId) {
    const p = s.data;
    if (p.crewId && this.crews.get(p.crewId)) return this.toast(s, 'Ya estás en una tripulación.');
    if (p.npcCrew) return this.toast(s, 'Primero deja tu tripulación NPC.');
    if (crew.faction !== p.faction) return;
    // a la tripulación principal; si está llena (o lo pide el capitán de una flota), a una flota con sitio
    let fleet = fleetId ? (crew.fleets || []).find((f) => f.id === fleetId && f.members.length < this.MMO.FLEET_SIZE) : null;
    if (!fleet && crew.members.length >= this.MMO.CREW_MAX) fleet = (crew.fleets || []).find((f) => f.members.length < this.MMO.FLEET_SIZE);
    if (!fleet && crew.members.length >= this.MMO.CREW_MAX) return this.toast(s, 'La tripulación y sus flotas están llenas.');
    if (fleet) fleet.members.push(s.cid); else crew.members.push(s.cid);
    p.crewId = crew.id;
    this.game.moment(p, 'Se unió a ' + crew.name + (fleet ? ' (' + fleet.name + ')' : ''), 18);
    this.db.saveCrew(crew);
    this.notifyCrew(crew);
    for (const o of this.ps.values()) if (o.data.crewId === crew.id) this.toast(o, '🤝 ' + p.name + ' se une a "' + crew.name + '".');
    s.saveDirty = true;
  }

  // ---------- NPC en tripulaciones de jugadores ----------
  // El NPC se queda en la simulación (con su nivel, recompensa y diario) pero en un grupo "quieto" que no zarpa solo:
  // sigue al capitán (o a otro miembro conectado), le acompaña a otras islas y pelea a su lado.
  crewNpcs(c) { return this.OP.S.agents.filter((a) => a.pcCrew === c.id && a.loc !== 'dead'); }
  recruitNpc(s, c, isCap, id) {
    const { OP, Sim, MMO, game } = this;
    const p = s.data, S = OP.S, now = Date.now();
    if (!isCap) return this.toast(s, 'Solo el capitán puede reclutar.');
    const a = S.A[id];
    if (!a || a.loc !== 'island') return this.toast(s, 'Ese personaje ya no está ahí.');
    if (a.pcCrew) return this.toast(s, a.pcCrew === c.id ? a.name + ' ya es de tu tripulación.' : a.name + ' ya sirve a otro capitán.');
    if (a.faction !== p.faction) return this.toast(s, a.faction === 'marine' ? 'Un marine nunca se uniría a piratas.' : 'Un pirata no se unirá a la Marina.');
    if (Math.hypot(a.x - p.x, a.y - p.y) > 4) return this.toast(s, 'Acércate más para hablar con ' + a.name + '.');
    if (a.battle || a._ko > now || this.engage.has(a.id)) return this.toast(s, 'Ahora mismo no está para hablar.');
    if (this.crewNpcs(c).length >= MMO.CREW_NPC_MAX) return this.toast(s, 'Ya llevas ' + MMO.CREW_NPC_MAX + ' NPC en la tripulación.');
    const u = S.U[a.unit];
    if (u && S.emperors.indexOf(u.id) >= 0) return this.toast(s, a.name + ' es fiel a su Emperador: ni lo piensa.');
    if (u && !u.solo && !u.camp && u.leader === a.id) return this.toast(s, a.name + ' es capitán de su propia tripulación.');
    if (a.faction === 'marine' && (a.rank >= 5 || (u && u.garrison && u.leader === a.id))) return this.toast(s, 'Un oficial de ese rango no se cambia de unidad.');
    s.recruitTried = s.recruitTried || {};
    if ((s.recruitTried[a.id] || 0) > now) return this.toast(s, a.name + ' ya te ha dicho que no. Inténtalo más tarde.');
    // probabilidad: tu nivel y tu fama frente a los suyos, y su lealtad a su grupo actual
    let ch = 0.4 + (p.lvl - a.lvl) * 0.05 + (p.faction === 'pirate' ? (p.bounty > a.bounty ? 0.12 : -0.08) : (p.rank > a.rank ? 0.12 : -0.08));
    if (u && !u.solo && !u.camp) ch -= (a.pers.loy || 0.5) * 0.35;
    if (a.lvl > p.lvl + 6) ch = Math.min(ch, 0.05);
    ch = game.clamp(ch, 0.03, 0.9);
    if (game.rnd() > ch) {
      s.recruitTried[a.id] = now + 120000;
      return this.toast(s, '🙅 ' + a.name + ' no quiere unirse (probabilidad ' + Math.round(ch * 100) + '%). Sube de nivel o gana fama.');
    }
    let cu = S.units.find((x) => x.pcCrew === c.id);
    if (!cu) { cu = Sim.createUnit({ faction: a.faction, solo: true, isl: a.isl, name: c.name }); cu.camp = true; cu.pcCrew = c.id; }
    Sim.addMember(cu, a);
    a.pcCrew = c.id; a.bandit = false; a.tx = null;
    Sim.log(a, 'Se unió a la tripulación de ' + p.name + ' (' + c.name + ').');
    game.addLog(p, 'Reclutó a ' + a.name + ' para "' + c.name + '".');
    this.toast(s, '🤝 ¡' + a.name + ' (nv ' + a.lvl + ') se une a "' + c.name + '"! Te seguirá y peleará a tu lado.');
    if (a.bounty >= 1e7) this.news('crew', a.name + ' (' + OP.fmtB(a.bounty) + ') se une a la tripulación de ' + p.name + '.', 2);
    this.notifyCrew(c);
  }
  // ---------- Órdenes del capitán ----------
  // A los NPC: seguir, quedarse, atacar, buscar tesoros (dan dinero) o entrenar (suben de nivel).
  // A los jugadores: reunirse con el capitán, atacar a su objetivo o libertad (les llega un aviso y una marca en el mapa).
  crewOrder(s, c, isCap, kind, id) {
    const { MMO, OP } = this;
    const p = s.data;
    if (!isCap) return this.toast(s, 'Solo el capitán puede dar órdenes.');
    const NO = MMO.NPC_ORDERS[kind], PO = MMO.PLAYER_ORDERS[kind];
    if (NO) {
      const list = this.crewNpcs(c).filter((a) => !id || a.id === id);
      if (!list.length) return this.toast(s, 'No tienes NPC en la tripulación' + (id ? ' con ese nombre' : '') + '.');
      for (const a of list) { a.pcOrder = kind; a.pcOrderAt = Date.now(); a.pcTick = Date.now(); this.Sim.log(a, 'Orden del capitán ' + p.name + ': ' + NO.name.toLowerCase() + '.'); }
      this.toast(s, NO.icon + ' ' + (list.length === 1 ? list[0].name : 'Tus ' + list.length + ' NPC') + ': «' + NO.name + '». ' + NO.desc);
      this.notifyCrew(c);
      return;
    }
    if (PO) {
      let target = '';
      if (kind === 'attack') {
        const t = s.lastTarget && Date.now() - s.lastTarget.at < 20000 && OP.S.A[s.lastTarget.id];
        if (!t) return this.toast(s, 'Primero ataca o selecciona a un enemigo para que tu tripulación vaya a por él.');
        target = t.name;
        for (const a of this.crewNpcs(c)) if ((a.pcOrder || 'follow') === 'follow' || a.pcOrder === 'attack') a.pcOrder = 'attack';
      }
      const text = PO.text(p.name, target);
      let n = 0;
      for (const o of this.ps.values()) {
        if (o === s || o.data.crewId !== c.id) continue;
        o.client.send('order', { kind, text, x: p.x, y: p.y, from: p.name, target });
        this.toast(o, '📣 ' + text); n++;
      }
      return this.toast(s, '📣 Orden enviada' + (n ? ' a ' + n + ' tripulante' + (n > 1 ? 's' : '') : ' (no hay tripulantes jugadores conectados)') + ': ' + text);
    }
  }
  releaseNpc(a) {
    const { Sim, OP } = this;
    a.pcCrew = 0;
    if (a.loc !== 'island') return;
    const u = Sim.createUnit({ faction: a.faction, solo: true, isl: a.isl });
    Sim.addMember(u, a);
    Sim.createShip(a.faction === 'marine' ? 'marine' : 'bote', u, a.isl);
    Sim.log(a, 'Dejó la tripulación de jugadores y siguió su camino.');
    if (!OP.S._occ) Sim.rebuildOccupants();
  }
  // Los NPC de la tripulación siguen a su capitán y le ayudan en los combates (5 veces por segundo)
  tickCompanions(dt, now) {
    const { OP, Sim, M, MMO, game } = this;
    const S = OP.S;
    let moved = false;
    for (const a of S.agents) {
      if (!a.pcCrew) continue;
      const c = this.crews.get(a.pcCrew);
      if (!c) { this.releaseNpc(a); continue; }
      if (a.loc !== 'island') { if (a.loc === 'dead' || a.loc === 'prison' || a.loc === 'retired') a.pcCrew = 0; continue; }
      if (a.battle) continue;
      // a quién sigue: al capitán si está conectado; si no, a cualquier miembro conectado
      let lead = null;
      const capSid = this.byCid.get(c.captain);
      if (capSid) lead = this.ps.get(capSid);
      if (!lead) for (const cid of c.members) { const sid = this.byCid.get(cid); if (sid && this.ps.get(sid)) { lead = this.ps.get(sid); break; } }
      // órdenes que los dejan en su isla: quedarse, buscar tesoros (dinero para el capitán) o entrenar (suben de nivel)
      const order = a.pcOrder || 'follow';
      if (order === 'stay' || order === 'gather' || order === 'train' || order === 'guard') {   // guard: custodia un territorio
        a.wait = Math.max(a.wait || 0, 0.5);
        if (!a.pcTick) a.pcTick = now;
        if (order === 'gather' && now - a.pcTick >= 60000) {
          a.pcTick = now;
          const capS = capSid && this.ps.get(capSid);
          if (capS) {
            const I = M.islands[a.isl];
            const zm = (I && OP.ZONE_MULT[I.sea]) || 1;
            const got = Math.round((3000 + a.lvl * 900) * zm * (0.5 + game.rnd()));
            capS.data.money += got; capS.dirty = true; capS.saveDirty = true;
            let extra = '';
            if (game.rnd() < 0.04) { const r = game.rollRarity(1, 3, 0); const g = game.giveSword(capS.data, r); extra = ' y una espada ' + MMO.SWORD_RARITY[r].name.toLowerCase() + ' («' + g.sw.n + '»)'; }
            this.toast(capS, '💰 ' + a.name + ' ha encontrado ' + OP.fmtB(got) + extra + ' en ' + (I ? I.name : 'su isla') + '.');
          }
        }
        if (order === 'train' && now - a.pcTick >= 30000) { a.pcTick = now; const before = a.lvl; Sim.gainXp(a, 60 + a.lvl * 8); const capS = capSid && this.ps.get(capSid); if (capS && a.lvl > before) this.toast(capS, '🥋 ' + a.name + ' sube al nivel ' + a.lvl + ' entrenando.'); }
        continue;
      }
      if (!lead || lead.st.dead || lead.data.boat) continue;
      const p = lead.data;
      const I = MMO.islandAt(p.x, p.y);
      if (!I) continue;
      a.wait = Math.max(a.wait || 0, 0.5); a.tx = null;
      if (a.isl !== I.idx) {
        // le acompaña a la nueva isla (viaja con él en el barco)
        const ox = p.x + (game.rnd() - 0.5) * 2, oy = p.y + (game.rnd() - 0.5) * 2;
        const ok = M.isl[Math.floor(oy) * M.W + Math.floor(ox)] === I.idx;
        a.isl = I.idx; a.x = ok ? ox : p.x; a.y = ok ? oy : p.y;
        const u = S.U[a.unit]; if (u) u.isl = I.idx;
        moved = true;
        continue;
      }
      // ¿está peleando el capitán? el NPC va a por el mismo enemigo
      let target = null;
      if (lead.lastTarget && now - lead.lastTarget.at < (order === 'attack' ? 20000 : 6000)) {
        const t = S.A[lead.lastTarget.id];
        if (t && t.loc === 'island' && t.isl === a.isl && !(t._ko > now) && !t.battle && !t.pcCrew && Math.hypot(t.x - p.x, t.y - p.y) < 9 && !(t.faction === 'marine' && p.faction === 'marine')) target = t;
      }
      // "Al ataque": sin esperar al capitán, van a por el enemigo más cercano
      if (!target && order === 'attack') {
        let bd = 6;
        for (const t of Sim.occupants(a.isl)) {
          if (t === a || t.loc !== 'island' || t.pcCrew || t._ko > now || t.battle) continue;
          if (p.faction === 'pirate' ? t.faction !== 'marine' : t.faction !== 'pirate') continue;
          const d = Math.hypot(t.x - p.x, t.y - p.y);
          if (d < bd) { bd = d; target = t; }
        }
      }
      const gx = target ? target.x : p.x, gy = target ? target.y : p.y;
      const d = Math.hypot(gx - a.x, gy - a.y);
      const keep = target ? 1.2 : 1.8;
      if (d > keep) {
        const sp = Math.min(d - keep * 0.8, (d > 8 ? 6 : 3.4) * dt);
        const nx = a.x + (gx - a.x) / d * sp, ny = a.y + (gy - a.y) / d * sp;
        if (M.isl[Math.floor(ny) * M.W + Math.floor(nx)] === a.isl) { a.x = nx; a.y = ny; }
        else if (d > 12) { a.x = p.x; a.y = p.y; }
      }
      if (target && d <= MMO.MELEE_RANGE && now >= (a._nextHit || 0)) {
        a._nextHit = now + 1200 + game.rnd() * 400;
        const r = game.damage({ power: Sim.basePower(a) }, { power: Sim.basePower(target), dodge: game.npcDodge(target, a.spd) }, 0.32);
        this.fx(target.x, target.y, r, false, 'n:' + a.id);
        this.engageNpc(target, lead, now, false);
        if (!r.miss) { target.hp -= r.dmg; if (target.hp <= 0) this.defeatNpc(lead, target, now); }
      }
    }
    if (moved) Sim.rebuildOccupants();
  }
  removeFromCrew(c, cid, text) {
    c.members = c.members.filter((x) => x !== cid);
    // también de su flota; si era su capitán, la flota elige otro (y si se queda vacía, desaparece)
    for (const f of c.fleets || []) {
      f.members = f.members.filter((x) => x !== cid);
      if (f.captain === cid) f.captain = f.members[0] || 0;
    }
    c.fleets = (c.fleets || []).filter((f) => f.members.length);
    this.setMemberCrew(cid, 0);
    if (!c.members.length) {
      // sin nadie en la principal: el capitán de la primera flota pasa a mandar, o la tripulación se disuelve
      const f = (c.fleets || [])[0];
      if (f) { c.members = f.members.slice(); c.fleets = c.fleets.slice(1); }
      else { for (const a of this.crewNpcs(c)) this.releaseNpc(a); this.dropTerritories(c.id); this.crews.delete(c.id); this.db.deleteCrew(c.id); return; }
    }
    if (c.captain === cid || c.members.indexOf(c.captain) < 0) c.captain = c.members[0];
    this.db.saveCrew(c); this.notifyCrew(c);
    for (const o of this.ps.values()) if (o.data.crewId === c.id) this.toast(o, text);
  }

  // ======================================================================
  //  CONSULTAS PARA LOS PANELES Y VENTANAS
  // ======================================================================
  onReq(s, m) {
    const { OP, MMO, Sim } = this;
    const S = OP.S;
    const what = m.what;
    const reply = (o) => s.client.send('res', Object.assign({ what }, o));
    if (what === 'wanted') return reply(this.wantedData());
    if (what === 'contracts') return this.onContracts(s, m);   // contratos contra NPC por dificultad (server/contracts.js)
    if (what === 'honor') return reply(this.honorList());
    if (what === 'news') return reply({ list: this.newsList(120) });
    if (what === 'crews') {
      const players = [...this.crews.values()].map((c) => {
        const pl = this.crewPayload(c);
        return { id: c.id, name: c.name, faction: c.faction, flag: c.flag, ship: c.ship, members: pl.members, npcs: pl.npcs.length, captain: (pl.members.find((x) => x.cid === c.captain) || {}).name || '?',
          total: pl.total, fleets: pl.fleets.map((f) => ({ name: f.name, n: f.members.length })), yonkou: pl.yonkou, territories: pl.territories.length,
          photo: pl.members.concat(pl.fleets.reduce((t, f) => t.concat(f.members), [])).slice(0, 12).map((m) => m.app).concat(pl.npcs.slice(0, 4).map((a) => a.app)) };
      }).sort((a, b) => b.total - a.total).slice(0, 60);
      const world = S.units.filter((u) => u.faction === 'pirate' && !u.solo && S.A[u.leader]).map((u) => {
        const sh = S.SH[u.ship];
        const ms = u.members.map((id) => S.A[id]).filter(Boolean);
        return { id: u.id, name: u.name, flag: u.flag, leader: u.leader, leaderName: S.A[u.leader].name, isl: u.isl >= 0 ? this.M.islands[u.isl].name : 'en el mar', emp: S.emperors.indexOf(u.id) >= 0,
          bounty: ms.reduce((t, a) => t + a.bounty, 0), fame: Math.round(u.fame), grunts: u.grunts, plan: u.plan ? u.plan.title : '',
          ship: sh ? { name: sh.name, type: sh.type, hp: Math.round(sh.hp / sh.maxHp * 100), coated: sh.coated } : null,
          members: ms.map((a) => ({ id: a.id, name: a.name, role: a.role, lvl: a.lvl, jail: a.loc === 'prison' })), photo: ms.slice(0, 12).map((a) => a.app),
          allies: u.allies.map((id) => S.U[id] && S.U[id].name).filter(Boolean), enemies: u.enemies.map((id) => S.U[id] && S.U[id].name).filter(Boolean) };
      }).sort((a, b) => b.bounty - a.bounty).slice(0, 60);
      // ranking global: jugadores y NPC juntos, solo desde 5.000.000 de recompensa total
      const ranking = players.filter((c) => c.total >= this.MMO.RANKING_MIN).map((c) => ({ kind: 'player', id: c.id, name: c.name, flag: c.flag, total: c.total, captain: c.captain, n: c.members.length + c.npcs + c.fleets.reduce((t, f) => t + f.n, 0), yonkou: c.yonkou, faction: c.faction, photo: c.photo }))
        .concat(world.filter((u) => u.bounty >= this.MMO.RANKING_MIN).map((u) => ({ kind: 'npc', id: u.id, name: u.name, flag: u.flag, total: u.bounty, captain: u.leaderName, n: u.members.length, yonkou: u.emp, faction: 'pirate', photo: u.photo, isl: u.isl })))
        .sort((a, b) => b.total - a.total).slice(0, 50);
      return reply({ players, world, ranking, myNpcCrew: s.data.npcCrew || 0 });
    }
    if (what === 'online') return reply({ list: [...this.ps.values()].map((o) => ({ sid: o.sid, name: o.data.name, lvl: o.data.lvl, faction: o.data.faction, crew: o.st.crewName })).sort((a, b) => b.lvl - a.lvl) });
    if (what === 'marine') {
      const ms = S.agents.filter((a) => a.faction === 'marine' && (a.loc === 'island' || a.loc === 'ship'));
      const counts = OP.RANKS.map((r, i) => ms.filter((a) => a.rank === i).length);
      const top = [9, 8, 7].map((i) => ({ rank: i, list: ms.filter((a) => a.rank === i).map((a) => ({ id: a.id, name: a.name, epithet: a.epithet })) }));
      const bases = this.M.islands.filter((I) => I.base).map((I) => {
        const st = S.isl[I.idx];
        const g = Sim.garrisonOf(I.idx);
        const cmd = g && S.A[g.leader];
        const squads = S.units.filter((u) => u.faction === 'marine' && !u.garrison && u.base === I.idx);
        return { name: I.base, isl: I.name, sea: I.sea, hp: st.baseHp, max: st.baseMax, cmd: cmd ? { id: cmd.id, name: OP.RANKS[cmd.rank] + ' ' + cmd.name } : null, garrison: g ? Sim.unitMembers(g).length : 0,
          squads: squads.map((u) => ({ leader: u.leader, name: u.name, plan: u.plan ? u.plan.title : '' })) };
      });
      const players = [...this.ps.values()].filter((o) => o.data.faction === 'marine').map((o) => ({ name: o.data.name, rank: o.data.rank, lvl: o.data.lvl }));
      return reply({ counts, top, bases, players });
    }
    if (what === 'fruits') {
      return reply({ list: OP.FRUITS.map((F) => {
        const fr = S.fruits[F.id];
        let state = 'none', who = '', isl = '';
        if (fr.state === 'owned') { state = 'owned'; who = fr.owner && S.A[fr.owner] ? S.A[fr.owner].name : fr.ownerName || '?'; }
        else if (fr.state === 'carried') { state = 'carried'; who = fr.ownerName || '?'; }
        else if (fr.state === 'hidden') {
          state = 'hidden';
          // con el Fruit Notifier sabes en qué isla está cada fruta que ya ha aparecido
          if ((S.isl[fr.isl] && S.isl[fr.isl].fruitRumor) || s.data.notifier) { const I = this.M.islands[fr.isl]; isl = I.name + (s.data.notifier ? ' (' + OP.SEAS[I.sea].name + ')' : ''); }
        }
        return { id: F.id, state, who, whoId: fr.owner || 0, isl };
      }), notifier: !!s.data.notifier });
    }
    if (what === 'island') {
      const I = this.M.islands[Number(m.id)];
      if (!I) return;
      const st = S.isl[I.idx];
      const occ = Sim.occupants(I.idx).filter((a) => a.loc === 'island');
      const g = S.U[st.guardian];
      const docked = S.ships.filter((x) => x.isl === I.idx && x.state === 'docked');
      const prisoners = S.agents.filter((a) => a.loc === 'prison' && a.isl === I.idx);
      const players = [...this.ps.values()].filter((o) => { const J = MMO.islandAt(o.data.x, o.data.y); return J && J.idx === I.idx && !o.data.boat; }).map((o) => ({ sid: o.sid, name: o.data.name, lvl: o.data.lvl, faction: o.data.faction }));
      return reply({ id: I.idx, info: {
        pop: st.pop, baseHp: st.baseHp, baseMax: st.baseMax, rumor: !!(st.fruitRumor && st.fruit >= 0), guardian: g ? { id: g.id, name: g.name } : null, attacked: S.time - st.attackedAt < 72,
        road4: I.id === S.road4 && S.road4Found, discovered: st.discovered, event: !!(this.event && this.event.isl === I.idx),
        occ: occ.slice(0, 40).map((a) => ({ id: a.id, name: a.name, faction: a.faction, lvl: a.lvl })), total: occ.length,
        docked: docked.map((x) => { const u = S.U[x.unit]; return { name: x.name, type: x.type, leader: u ? u.leader : 0 }; }),
        prisoners: prisoners.slice(0, 30).map((a) => ({ id: a.id, name: a.name, bounty: a.bounty })), nprisoners: prisoners.length, players,
        owner: st.owner ? { name: st.owner.name, kind: st.owner.kind, guards: this.guardsOn(I.idx).length, mine: st.owner.crewId === s.data.crewId } : null,
        claimable: !!this.territoryKind(s, s.data.crewId && this.crews.get(s.data.crewId)) && !I.base && !I.prison && !I.hidden && !I.sky && !I.deep,
        logLock: MMO.routeLock(s.data, I) || ''
      } });
    }
    if (what === 'inspect') {
      if (m.t === 'p') {
        const o = this.ps.get(String(m.id));
        if (!o) return;
        const d = o.data, stt = MMO.stats(d);
        return reply({ t: 'p', id: o.sid, info: {
          name: d.name, lvl: d.lvl, faction: d.faction, bounty: d.bounty, rank: d.rank, crew: o.st.crewName, app: d.app, epithet: d.epithet || '', age: d.age,
          dream: MMO.dreamsFor(d.faction)[d.dream], talent: d.talent, traits: d.traits, quote: d.quote, home: this.M.islands[d.home].name,
          str: stt.str, spd: stt.spd, maxHp: stt.maxHp, hp: Math.round(d.hp), power: Math.round(MMO.power(d)),
          stats: d.stats, visited: d.visited.length, fruit: d.fruit >= 0 ? OP.FRUITS[d.fruit].name : '', fruitId: d.fruit >= 0 ? d.fruit : -1, log: d.log.slice(0, 6).map((l) => l.t), moments: d.moments.slice(0, 1)
        } });
      }
      const a = S.A[Number(m.id)];
      if (!a) return;
      const u = S.U[a.unit];
      const sh = u && S.SH[u.ship];
      const friend = Sim.bestFriend(a), rival = Sim.rival(a);
      const person = (b) => (b ? { id: b.id, name: b.name, app: b.app, faction: b.faction, rank: b.rank, dead: b.loc === 'dead' } : null);
      let plan = null;
      if (u && u.plan) {
        const p = u.plan;
        const prog = p.phase === 'travel' ? (sh && sh.route ? Sim.routeProgress(sh) : 0) : Math.min(1, p.done / Math.max(1, p.work));
        const eta = p.phase === 'travel' ? (sh && sh.route ? Sim.routeEta(sh) + p.work : p.work) : Math.max(0, p.work - p.done);
        plan = { title: p.title, mission: !!p.mission, phase: p.phase, prog, eta, reward: p.reward || null, leader: u.leader === a.id ? '' : (S.A[u.leader] || {}).name || '' };
      }
      return reply({ t: 'n', id: a.id, info: {
        name: a.name, lvl: a.lvl, xp: Math.floor(a.xp), xpNeed: Sim.xpNeed(a.lvl), faction: a.faction, bounty: a.bounty, rank: a.rank, merit: Math.round(a.merit), epithet: a.epithet, app: a.app,
        str: a.str, spd: a.spd, hp: Math.round(a.hp), maxHp: a.maxHp, power: Math.round(Sim.basePower(a)), money: a.money, age: a.age, pers: a.pers, talent: a.talent,
        dream: (a.faction === 'pirate' ? OP.DREAMS_PIRATE : OP.DREAMS_MARINE)[a.dream] || '', quote: a.quote, loc: a.loc, isl: a.isl,
        crew: u && u.name ? u.name : '', crewId: u ? u.id : 0, solo: !!(u && u.solo && !u.pcCrew), pcCrew: a.pcCrew || 0, role: a.role, fruit: a.fruit >= 0 ? a.fruit : -1, haki: a.haki,
        log: a.log.slice(0, 8).map((l) => ({ d: l.d, t: l.t })), plan, homeSea: a.homeSea, badges: a.badges, best: a.best, st: a.st,
        visited: a.visited.map((i) => this.M.islands[i] && this.M.islands[i].name).filter(Boolean), friend: person(friend), rival: person(rival), ko: a._ko > Date.now()
      } });
    }
  }
  // Carteles: todos los piratas en libertad con recompensa (desde 10.000 ฿), con el mar donde están AHORA.
  // El cliente enseña en "Todos" a partir de 100.000 ฿ y en cada mar a partir de 10.000 ฿.
  seaTab(z, x, y) {
    if (z === 'east' || z === 'west' || z === 'north' || z === 'south' || z === 'paradise' || z === 'newworld') return z;
    if (z === 'sky' || z === 'deep') return 'paradise';
    if (x == null) return 'paradise';
    return y < this.OP.CY ? (x < this.OP.CX ? 'north' : 'east') : (x < this.OP.CX ? 'west' : 'south');   // Calm Belt: el Blue más cercano
  }
  wantedData() {
    const now = Date.now();
    if (this.wantedCache && now - this.wantedAt < 20000) return this.wantedCache;
    const { OP, MMO, Sim } = this;
    const S = OP.S;
    const out = [];
    const online = new Map();
    for (const o of this.ps.values()) online.set(o.cid, o);
    const king = S.playerKing;
    for (const row of this.db.allCharactersWithUser()) {
      const cid = Number(row.id);
      const o = online.get(cid);
      const d = o ? o.data : JSON.parse(row.data);
      if (d.faction !== 'pirate' || !(d.bounty >= MMO.WANTED_MIN_SEA)) continue;
      const c = d.crewId && this.crews.get(d.crewId);
      out.push({ name: d.name, user: row.username, bounty: d.bounty, app: d.app, isPlayer: true, status: 'free', crew: c ? c.name : '', online: !!o, epithet: d.epithet || '',
        fruit: d.fruit >= 0 ? d.fruit : -1, zone: this.seaTab(MMO.zoneOf(d.x, d.y), d.x, d.y), king: !!(king && king.cid === cid) });
    }
    const empLeaders = new Set();
    for (const uid of S.emperors) { const u = S.U[uid]; if (u && S.A[u.leader]) empLeaders.add(u.leader); }
    for (const a of S.agents) {
      if (a.faction !== 'pirate' || !(a.bounty >= MMO.WANTED_MIN_SEA) || (a.loc !== 'island' && a.loc !== 'ship') || a.carriedBy) continue;
      const u = S.U[a.unit];
      let x = null, y = null;
      if (a.loc === 'island') { x = a.x; y = a.y; } else if (u && S.SH[u.ship]) { x = S.SH[u.ship].x; y = S.SH[u.ship].y; }
      out.push({ id: a.id, name: a.name, bounty: a.bounty, app: a.app, isPlayer: false, epithet: a.epithet, fruit: a.fruit >= 0 ? a.fruit : -1, status: 'free',
        crew: u && !u.solo && !u.pcCrew ? u.name : '', zone: this.seaTab(Sim.agentZone(a), x, y), emp: empLeaders.has(a.id) });
    }
    out.sort((a, b) => b.bounty - a.bounty);
    const emperors = S.emperors.map((uid) => { const u = S.U[uid]; return u && S.A[u.leader] ? { id: u.leader, crew: u.name } : null; }).filter(Boolean);
    this.wantedCache = { list: out, emperors, king: king ? { cid: king.cid, name: king.name, since: king.since } : null };
    this.wantedAt = now;
    return this.wantedCache;
  }

  // ---------- El Rey de los Piratas ----------
  // Solo un jugador. Se consigue derrotando a los Cuatro Emperadores (si el trono está vacío) o al Rey actual.
  crownKing(s, how) {
    const { OP, game } = this;
    const S = OP.S, p = s.data;
    const old = S.playerKing;
    if (old && old.cid === s.cid) return;
    if (old) {
      const osid = this.byCid.get(old.cid);
      const o = osid && this.ps.get(osid);
      const fix = (d) => { d.king = false; if (d.epithet === 'Rey de los Piratas') d.epithet = d.prevEpithet || ''; };
      if (o) { fix(o.data); o.dirty = true; o.saveDirty = true; this.syncPublic(o); this.toast(o, '👑 Has perdido el título de Rey de los Piratas.'); }
      else { const row = this.db.characterById(old.cid); if (row) { const d = JSON.parse(row.data); fix(d); this.db.saveCharacter(old.cid, d); } }
    }
    S.playerKing = { cid: s.cid, name: p.name, since: Date.now() };
    p.king = true;
    if (p.epithet !== 'Rey de los Piratas') p.prevEpithet = p.epithet || '';
    p.epithet = 'Rey de los Piratas';
    // la recompensa más alta del mundo, con margen
    let top = 0;
    for (const a of S.agents) if (a.faction === 'pirate' && a.bounty > top) top = a.bounty;
    for (const o of this.ps.values()) if (o !== s && o.data.bounty > top) top = o.data.bounty;
    const target = Math.round((Math.max(top, p.bounty) + 2e8 + game.rnd() * 4e8) / 1e5) * 1e5;
    if (target > p.bounty) p.bounty = target;
    p.hp = this.MMO.stats(p).maxHp;
    p.bountyLog = p.bountyLog || [];
    p.bountyLog.unshift({ at: Date.now(), up: 0, total: p.bounty, why: 'coronado Rey de los Piratas (' + how + ')' });
    game.moment(p, 'Se convirtió en el REY DE LOS PIRATAS (' + how + ')', 150);
    this.news('world', '👑 ¡' + p.name + ' es el nuevo REY DE LOS PIRATAS! ' + how + '. Su recompensa: ' + OP.fmtB(p.bounty) + '.', 5);
    this.system('👑 ¡' + p.name + ' es el nuevo Rey de los Piratas!', 'event');
    this.toast(s, '👑 ¡Eres el REY DE LOS PIRATAS! Ahora eres mucho más duro de derrotar y casi imposible de capturar.');
    this.wantedCache = null;
    s.dirty = true; s.saveDirty = true;
    this.syncPublic(s);
    this.saveChar(s);
  }
  // ---------- Altos mandos de la Marina (solo jugadores) ----------
  // Cada minuto se revisan todos los marines jugadores: los mejores (por puntuación de desempeño) que cumplen los
  // requisitos ocupan los puestos de Almirante General (1), Almirante (3) y Vicealmirante (6). Nunca hay dos en un puesto único.
  updateMarineHierarchy() {
    const { MMO, OP, game } = this;
    const S = OP.S;
    const online = new Map();
    for (const o of this.ps.values()) online.set(o.cid, o);
    const all = [];
    for (const row of this.db.allCharacters()) {
      const cid = Number(row.id);
      const o = online.get(cid);
      const d = o ? o.data : JSON.parse(row.data);
      if (d.faction !== 'marine') continue;
      all.push({ cid, d, o, score: MMO.marineScore(d) });
    }
    all.sort((a, b) => b.score - a.score || b.d.lvl - a.d.lvl);
    const taken = new Set();
    const top = { 9: [], 8: [], 7: [] };
    for (const R of [9, 8, 7]) {
      const req = MMO.TOP_RANKS[R];
      for (const c of all) {
        if (top[R].length >= req.slots) break;
        if (taken.has(c.cid) || c.d.merit < req.merit || c.d.lvl < req.lvl) continue;
        top[R].push(c.cid); taken.add(c.cid);
      }
    }
    S.playerTopRanks = top;
    for (const c of all) {
      const want = top[9].indexOf(c.cid) >= 0 ? 9 : top[8].indexOf(c.cid) >= 0 ? 8 : top[7].indexOf(c.cid) >= 0 ? 7 : Math.min(c.d.rank, MMO.AUTO_RANK_MAX);
      if (want === c.d.rank) continue;
      const up = want > c.d.rank;
      c.d.rank = want;
      if (up) game.moment(c.d, 'Fue nombrado ' + OP.RANKS[want] + ' de la Marina', 40 + want * 8);
      else game.addLog(c.d, 'Perdió su puesto de alto mando: ahora es ' + OP.RANKS[want] + '.');
      if (c.o) {
        c.o.dirty = true; c.o.saveDirty = true; this.syncPublic(c.o);
        this.toast(c.o, up ? '🎖️ ¡Te nombran ' + OP.RANKS[want] + ' de la Marina!' : '⚓ Otro marine te supera en méritos: pasas a ser ' + OP.RANKS[want] + '.');
      } else this.db.saveCharacter(c.cid, c.d);
      if (up && want >= 7) this.news('marine', '🎖️ ' + c.d.name + ' es nombrado ' + OP.RANKS[want] + ' de la Marina.', want === 9 ? 4 : 3);
    }
    this.honorCache = null;
  }

  // Cuadro de honor de la Marina: marines jugadores ordenados por valor capturado (se actualiza solo)
  honorList() {
    const now = Date.now();
    if (this.honorCache && now - this.honorAt < 15000) return this.honorCache;
    const online = new Map();
    for (const o of this.ps.values()) online.set(o.cid, o);
    const out = [];
    for (const row of this.db.allCharacters()) {
      const cid = Number(row.id);
      const o = online.get(cid);
      const d = o ? o.data : JSON.parse(row.data);
      if (d.faction !== 'marine' || !d.honor || !d.honor.caps) continue;
      out.push({ name: d.name, rank: d.rank, lvl: d.lvl, app: d.app, caps: d.honor.caps, value: d.honor.value, players: d.honor.players || 0, best: d.honor.best, online: !!o, isPlayer: true });
    }
    // marinos NPC que han capturado piratas (los 25 mejores)
    const npcs = this.OP.S.agents.filter((a) => a.faction === 'marine' && a.loc !== 'dead' && a.st && a.st.caps > 0)
      .map((a) => ({ id: a.id, name: a.name, rank: a.rank, lvl: a.lvl, app: a.app, caps: a.st.caps, value: a.st.capVal || 0, players: 0, best: a.st.capBest || null, isPlayer: false }))
      .sort((a, b) => b.value - a.value || b.caps - a.caps).slice(0, 25);
    for (const n of npcs) out.push(n);
    out.sort((a, b) => b.value - a.value || b.caps - a.caps);
    // los altos mandos (jugadores) para las secciones de arriba, tengan o no capturas
    const tops = { 9: [], 8: [], 7: [] };
    const T = this.OP.S.playerTopRanks || { 9: [], 8: [], 7: [] };
    for (const R of [9, 8, 7]) for (const cid of T[R] || []) {
      const o = online.get(cid);
      const row = o ? null : this.db.characterById(cid);
      const d = o ? o.data : row ? JSON.parse(row.data) : null;
      if (!d) continue;
      const h = d.honor || {};
      tops[R].push({ name: d.name, rank: d.rank, lvl: d.lvl, app: d.app, caps: h.caps || 0, value: h.value || 0, best: h.best || null, online: !!o, score: this.MMO.marineScore(d) });
    }
    this.honorCache = { list: out.slice(0, 60), tops, req: this.MMO.TOP_RANKS };
    this.honorAt = now;
    return this.honorCache;
  }
  newsItem(x) { return { id: x.id, t: x.t, cat: x.cat, text: x.text, imp: x.imp, isl: x.isl, a: x.a }; }
  newsList(n) { return this.OP.S.news.slice(0, n).map((x) => this.newsItem(x)); }
  news(cat, text, imp) { const n = this.Sim.news(cat, text, { imp: imp || 1, player: true }); if ((imp || 1) < 2) this.broadcast('news', this.newsItem(n)); }

  // ======================================================================
  //  EVENTOS GLOBALES
  // ======================================================================
  tickEvents(now) {
    const { OP } = this;
    if (this.event && now >= this.event.until) {
      this.system('🌟 El evento de ' + OP.M.islands[this.event.isl].name + ' ha terminado.', 'event');
      this.event = null; this.state.event = '';
      this.nextEventAt = now + 8 * 60000;
    }
    if (!this.event && now >= this.nextEventAt && this.ps.size > 0) {
      const pool = OP.M.islands.filter((I) => !I.hidden && !I.prison && !I.calm && (OP.BLUES.indexOf(I.sea) >= 0 || I.sea === 'paradise'));
      const I = this.game.pick(pool);
      const text = '🌟 ¡Tesoro legendario en ' + I.name + ' (' + OP.SEAS[I.sea].name + ')! Durante 5 minutos, explorar y entrenar allí da x3.';
      this.event = { isl: I.idx, until: now + 5 * 60000, text };
      this.state.event = text;
      this.system(text, 'event');
    }
  }

  // ======================================================================
  //  GUARDADO
  // ======================================================================
  saveChar(s) { try { this.db.saveCharacter(s.cid, s.data); s.saveDirty = false; } catch (e) { console.error('[guardado] Error guardando a ' + s.data.name + ':', e.message); } }
  saveAll() { for (const s of this.ps.values()) if (s.saveDirty || s.dirty) this.saveChar(s); }
}

let maxSpeedCache = 0;
function maxSpeed(OP, MMO) {
  if (!maxSpeedCache) maxSpeedCache = Math.max(MMO.WALK_SPEED, ...Object.values(OP.SHIPS).map((s) => s.speed * MMO.SAIL_MULT * 1.15));
  return maxSpeedCache;
}

require('./admin').install(WorldRoom);   // códigos y panel de administrador
require('./execution').install(WorldRoom);
require('./fruits').install(WorldRoom);      // frutas cerca de los jugadores con sistema de "lástima"
require('./contracts').install(WorldRoom);   // contratos contra NPC por dificultad
require('./training').install(WorldRoom);    // entrenamiento continuo manteniendo T
require('./haki').install(WorldRoom);        // Haki activo: Armadura, Observación y Rey
require('./zoan').install(WorldRoom);        // transformación Zoan (tecla C)
require('./interiors').install(WorldRoom);   // edificios por dentro, NPC de historia, recubrimiento y alquimista   // ejecución pública y órdenes de evento (/forzar_ejecucion, /reiniciar_era)
require('./endgame').install(WorldRoom); // tripulaciones NPC, traiciones, territorios e Impel Down
module.exports = { WorldRoom, SHIP_TYPES, SPEED };
