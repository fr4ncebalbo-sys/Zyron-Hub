/* Sistemas del final del juego, todos validados en el servidor y guardados (personaje en SQLite, mundo en el estado de la simulación):
   - Unirse a tripulaciones NPC y TRAICIONAR a tu tripulación (infamia, recompensa, venganza y cazarrecompensas).
   - Yonkou entre jugadores y TERRITORIOS para Yonkou y el Rey de los Piratas (custodios, tributo e invasiones).
   - IMPEL DOWN: piratas de más de 80 millones derrotados por un marine van presos; salen venciendo a los guardias o sobornándolos. */
'use strict';

function install(Room) {
  const P = Room.prototype;

  // ======================================================================
  //  TRIPULACIONES NPC Y TRAICIONES
  // ======================================================================
  // Pedir unirse a una tripulación NPC: tienes que estar en la misma isla que alguno de sus miembros.
  P.joinNpcCrew = function (s, unitId) {
    const { OP, MMO, game, Sim } = this;
    const p = s.data, S = OP.S;
    if (p.crewId || p.npcCrew) return this.toast(s, 'Ya estás en una tripulación.');
    if (p.faction !== 'pirate') return this.toast(s, 'Las tripulaciones NPC son de piratas.');
    const u = S.U[unitId];
    if (!u || u.faction !== 'pirate' || u.solo || u.camp || !S.A[u.leader]) return this.toast(s, 'Esa tripulación ya no existe.');
    if (p.traitor && p.traitor.unit === u.id) return this.toast(s, '🗡️ No olvidan tu traición: jamás te aceptarán.');
    const I = MMO.islandAt(p.x, p.y);
    if (!I || p.boat || !u.members.some((id) => S.A[id] && S.A[id].loc === 'island' && S.A[id].isl === I.idx)) return this.toast(s, 'Tienes que estar en tierra, en la misma isla que algún miembro de "' + u.name + '".');
    if ((s.npcJoinTry || 0) > Date.now()) return this.toast(s, 'Ya te han dicho que no. Vuelve a intentarlo más tarde.');
    const L = S.A[u.leader];
    const emp = S.emperors.indexOf(u.id) >= 0;
    let ch = 0.35 + (p.lvl - L.lvl) * 0.04 + (p.bounty > 0 ? Math.min(0.2, p.bounty / Math.max(1, L.bounty) * 0.2) : -0.1) - (p.infamy || 0) * 0.08;
    if (emp) { if (p.lvl < 50 || p.bounty < 2e8) ch = 0; else ch *= 0.5; }
    ch = game.clamp(ch, 0, 0.85);
    if (game.rnd() > ch) { s.npcJoinTry = Date.now() + 120000; return this.toast(s, '🙅 ' + L.name + ' no te acepta en "' + u.name + '" (probabilidad ' + Math.round(ch * 100) + '%).'); }
    p.npcCrew = u.id;
    game.moment(p, 'Se unió a la tripulación NPC "' + u.name + '"', 20);
    Sim.log(L, 'Aceptó al jugador ' + p.name + ' en ' + u.name + '.');
    this.news('crew', p.name + ' se une a "' + u.name + '", la tripulación de ' + L.name + '.', 2);
    this.toast(s, '🏴‍☠️ ¡Ahora eres de "' + u.name + '"! Sus miembros te tratan como a uno de los suyos.');
    s.dirty = true; s.saveDirty = true; this.syncPublic(s);
  };
  P.leaveNpcCrew = function (s) {
    const p = s.data;
    const u = this.OP.S.U[p.npcCrew];
    p.npcCrew = 0;
    this.toast(s, 'Dejas ' + (u ? '"' + u.name + '"' : 'tu tripulación NPC') + ' en buenos términos.');
    s.dirty = true; s.saveDirty = true; this.syncPublic(s);
  };
  // Traicionar: sales de la tripulación (de jugadores o NPC) de mala manera
  P.betrayCrew = function (s) {
    const { OP, MMO, game } = this;
    const p = s.data, now = Date.now();
    const c = p.crewId && this.crews.get(p.crewId);
    const u = !c && p.npcCrew ? OP.S.U[p.npcCrew] : null;
    if (!c && !u) return this.toast(s, 'No estás en ninguna tripulación a la que traicionar.');
    const name = c ? c.name : u.name;
    p.infamy = (p.infamy || 0) + 1;
    p.traitor = { name, unit: u ? u.id : 0, crewId: c ? c.id : 0, until: now + MMO.TRAITOR_MS, hunted: 0 };
    if (c) this.removeFromCrew(c, s.cid, '🗡️ ¡' + p.name + ' ha traicionado a la tripulación!');
    else p.npcCrew = 0;
    if (p.faction === 'pirate') {
      const up = game.raiseBounty(p, Math.max(5e6, p.bounty * 0.15), true);
      if (up) this.onBounty(s, up, 'por traicionar a "' + name + '"', true);
    } else p.merit = Math.round((p.merit || 0) * 0.7);
    game.moment(p, 'Traicionó a "' + name + '"', 35);
    this.news('crew', '🗡️ ¡' + p.name + ' ha traicionado a "' + name + '"! Ya hay cazarrecompensas tras su pista.', 3);
    this.toast(s, '🗡️ Traicionas a "' + name + '". Tu infamia crece' + (u ? ', sus miembros juran venganza' : '') + ' y los cazarrecompensas te buscarán durante 30 minutos.');
    s.dirty = true; s.saveDirty = true; this.syncPublic(s);
  };
  // Cazarrecompensas para los traidores (cada 3 minutos, en tierra) y limpieza cuando termina la persecución
  P.tickTraitors = function (now) {
    const { OP, Sim, MMO, game, M } = this;
    const S = OP.S, R = OP.R;
    for (const a of S.agents) {
      if (!a.hunter) continue;
      const o = this.ps.get(this.byCid.get(a.hunter));
      if (!o || !o.data.traitor || o.data.traitor.until < now || a.loc !== 'island') { if (a.loc === 'island') Sim.retire(a, 'Abandonó la caza'); a.hunter = 0; }
    }
    for (const s of this.ps.values()) {
      const p = s.data, T = p.traitor;
      if (!T) continue;
      if (T.until < now) { p.traitor = null; this.toast(s, '😮‍💨 Los cazarrecompensas han perdido tu pista.'); s.dirty = true; continue; }
      if (s.st.dead || p.boat || p.prison || now - (T.hunted || 0) < 180000) continue;
      const I = MMO.islandAt(p.x, p.y);
      if (!I) continue;
      T.hunted = now;
      const n = 1 + (game.rnd() < 0.4 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const a = Sim.createAgent({ faction: 'pirate', isl: I.idx, lvl: Math.max(1, p.lvl + R.i(-2, 2)) });
        a.name = 'Cazarrecompensas ' + a.name.split(' ')[0];
        a.hunter = s.cid; a.pers.agg = 1;
        const cu = Sim.createUnit({ faction: 'pirate', solo: true, isl: I.idx }); cu.camp = true; Sim.addMember(cu, a);
        a.x = p.x + (game.rnd() - 0.5) * 5; a.y = p.y + (game.rnd() - 0.5) * 5;
        if (M.isl[Math.floor(a.y) * M.W + Math.floor(a.x)] !== I.idx) { a.x = p.x + 1; a.y = p.y; }
        this.engage.set(a.id, { sid: s.sid, next: now + 1500 + k * 400, last: now });
      }
      Sim.rebuildOccupants();
      this.toast(s, '🎯 ¡' + (n > 1 ? 'Unos cazarrecompensas te han' : 'Un cazarrecompensas te ha') + ' encontrado por tu traición!');
    }
  };

  // ======================================================================
  //  YONKOU Y TERRITORIOS
  // ======================================================================
  // Yonkou jugadores: tripulaciones con al menos una flota y 1.000 millones de recompensa total (las 4 mejores)
  P.updateYonkou = function () {
    const { MMO, OP } = this;
    const list = [...this.crews.values()].filter((c) => c.faction === 'pirate' && (c.fleets || []).length >= 1)
      .map((c) => ({ c, total: this.crewPayload(c).total })).filter((x) => x.total >= MMO.YONKOU_MIN)
      .sort((a, b) => b.total - a.total).slice(0, 4);
    const before = OP.S.playerYonkou || [];
    OP.S.playerYonkou = list.map((x) => x.c.id);
    for (const x of list) if (before.indexOf(x.c.id) < 0) { this.news('world', '👑 ¡"' + x.c.name + '" es reconocida como tripulación de un YONKOU, Emperador del Mar!', 4); this.notifyCrew(x.c); }
    for (const id of before) if (OP.S.playerYonkou.indexOf(id) < 0) { const c = this.crews.get(id); if (c) { this.news('world', '"' + c.name + '" pierde el título de Yonkou.', 3); this.notifyCrew(c); } }
  };
  P.territoryKind = function (s, c) {
    const K = this.OP.S.playerKing;
    if (K && K.cid === s.cid) return 'king';
    if (c && c.captain === s.cid && (this.OP.S.playerYonkou || []).indexOf(c.id) >= 0) return 'yonkou';
    return '';
  };
  P.claimIsland = function (s, c, isCap) {
    const { OP, MMO, M, game } = this;
    const p = s.data, S = OP.S;
    const kind = this.territoryKind(s, c);
    if (!kind) return this.toast(s, 'Solo el capitán de una tripulación Yonkou o el Rey de los Piratas pueden reclamar islas.');
    if (!c || !isCap) return this.toast(s, 'Necesitas ser el capitán de tu tripulación.');
    if (p.boat) return this.toast(s, 'Desembarca en la isla que quieres reclamar.');
    const I = MMO.islandAt(p.x, p.y);
    if (!I || I.base || I.prison || I.hidden || I.sky || I.deep) return this.toast(s, 'Esta isla no se puede reclamar (bases de la Marina, prisiones e islas especiales no).');
    const d = S.isl[I.idx];
    if (d.owner && d.owner.crewId === c.id) return this.toast(s, I.name + ' ya es tuya.');
    if (d.owner) {
      const guards = this.guardsOn(I.idx);
      if (guards.length) return this.toast(s, I.name + ' es de "' + d.owner.name + '" y la custodian ' + guards.length + ' guardia(s): derrótalos primero.');
    }
    const mine = S.isl.filter((x) => x.owner && x.owner.crewId === c.id).length;
    if (mine >= MMO.TERRITORY_MAX[kind]) return this.toast(s, 'Ya controlas ' + mine + ' islas (máximo ' + MMO.TERRITORY_MAX[kind] + ').');
    const prev = d.owner;
    d.owner = { crewId: c.id, name: c.name, cid: s.cid, kind, since: Date.now(), lastTribute: Date.now() };
    game.moment(p, 'Reclamó ' + I.name + ' como territorio', 40);
    this.news('world', '🏴 ' + p.name + ' reclama ' + I.name + ' como territorio de "' + c.name + '"' + (prev ? ', arrebatándosela a "' + prev.name + '"' : '') + '.', 4);
    this.toast(s, '🏴 ¡' + I.name + ' es ahora territorio tuyo! Manda a tus NPC a custodiarla (Tripulación → Territorios).');
    this.notifyCrew(c);
  };
  P.guardsOn = function (idx) { return this.OP.S.agents.filter((a) => a.pcCrew && a.pcOrder === 'guard' && a.pcGuardIsl === idx && a.loc !== 'dead'); };
  // mandar un NPC de tu tripulación a custodiar uno de tus territorios (viaja hasta allí y se queda)
  P.guardIsland = function (s, c, isCap, npcId, idx) {
    const { OP, M } = this;
    const S = OP.S;
    if (!isCap) return this.toast(s, 'Solo el capitán reparte a los custodios.');
    const a = S.A[npcId];
    if (!a || a.pcCrew !== c.id) return;
    if (!(idx >= 0)) { a.pcOrder = 'follow'; a.pcGuardIsl = null; this.notifyCrew(c); return this.toast(s, a.name + ' vuelve contigo.'); }
    const d = S.isl[idx], I = M.islands[idx];
    if (!d || !d.owner || d.owner.crewId !== c.id) return this.toast(s, 'Esa isla no es tuya.');
    a.pcOrder = 'guard'; a.pcGuardIsl = idx; a.pcTick = Date.now();
    const pos = this.game.portPos(I);
    a.loc = 'island'; a.isl = idx; a.x = pos.x + 0.6; a.y = pos.y;
    const u = S.U[a.unit]; if (u) u.isl = idx;
    this.Sim.rebuildOccupants();
    this.Sim.log(a, 'Custodia ' + I.name + ' para "' + c.name + '".');
    this.toast(s, '🛡️ ' + a.name + ' custodia ahora ' + I.name + '.');
    this.notifyCrew(c);
  };
  P.loseTerritory = function (idx, why) {
    const S = this.OP.S, d = S.isl[idx];
    if (!d || !d.owner) return;
    const own = d.owner, I = this.M.islands[idx];
    d.owner = null;
    for (const a of this.guardsOn(idx)) { a.pcOrder = 'follow'; a.pcGuardIsl = null; }
    const capSid = this.byCid.get(own.cid);
    const cap = capSid && this.ps.get(capSid);
    if (cap) this.toast(cap, '🏳️ Pierdes ' + I.name + ': ' + why + '.');
    const c = this.crews.get(own.crewId); if (c) this.notifyCrew(c);
  };
  P.dropTerritories = function (crewId) {
    this.OP.S.isl.forEach((d, i) => { if (d.owner && d.owner.crewId === crewId) this.loseTerritory(i, 'la tripulación ya no existe'); });
  };
  // cada minuto: tributo (cada 10 min por isla) e invasiones (las defienden los custodios)
  P.tickTerritories = function (now) {
    const { OP, MMO, Sim, game, M } = this;
    const S = OP.S;
    S.isl.forEach((d, i) => {
      if (!d.owner) return;
      const own = d.owner, I = M.islands[i];
      const c = this.crews.get(own.crewId);
      if (!c) return this.loseTerritory(i, 'la tripulación ya no existe');
      // si ya no es Yonkou ni Rey, el territorio se pierde
      const stillKing = S.playerKing && S.playerKing.cid === own.cid;
      const stillYonkou = (S.playerYonkou || []).indexOf(c.id) >= 0;
      if (!stillKing && !stillYonkou) return this.loseTerritory(i, 'ya no eres Yonkou ni Rey de los Piratas');
      if (now - (own.lastTribute || 0) < MMO.TRIBUTE_MS) return;
      own.lastTribute = now;
      const guards = this.guardsOn(i);
      // invasión: piratas rivales o la Marina intentan quitarte la isla
      if (game.rnd() < 0.25) {
        const attack = 300 + I.danger * 180 + game.rnd() * 900;
        const defense = 150 + guards.reduce((t, a) => t + Sim.basePower(a), 0);
        if (defense >= attack) {
          for (const a of guards) Sim.gainXp(a, 200);
          this.notifyOwner(own, '🛡️ Tus custodios rechazan una invasión en ' + I.name + '.');
        } else {
          this.news('attack', '⚔ ' + I.name + ' cae en una invasión: "' + own.name + '" pierde el territorio.', 3);
          return this.loseTerritory(i, 'una invasión superó a tus custodios (' + guards.length + ')');
        }
      }
      // tributo para el capitán
      const zm = OP.ZONE_MULT[I.sea] || 1;
      const money = Math.round(Math.min(3e6, 20000 + (d.pop || I.pop) * 4) * zm * (1 + guards.length * 0.1));
      this.payCid(own.cid, money, '💰 Tributo de ' + I.name + ': +' + OP.fmtB(money));
    });
  };
  P.notifyOwner = function (own, text) { const sid = this.byCid.get(own.cid); const o = sid && this.ps.get(sid); if (o) this.toast(o, text); };
  P.payCid = function (cid, money, text) {
    const sid = this.byCid.get(cid);
    const o = sid && this.ps.get(sid);
    if (o) { o.data.money += money; o.dirty = true; o.saveDirty = true; this.toast(o, text); return; }
    const row = this.db.characterById(cid);
    if (!row) return;
    const d = JSON.parse(row.data); d.money += money; this.db.saveCharacter(cid, d);
  };

  // ======================================================================
  //  IMPEL DOWN
  // ======================================================================
  P.prisonIsland = function () { return this.M.byId.impeldown; };
  // un pirata de más de 80 millones derrotado por un marine (jugador o NPC) queda preso
  P.imprison = function (victim, byName) {
    const { OP, MMO, game } = this;
    const v = victim.data;
    v.prison = { since: Date.now(), guards: MMO.PRISON_GUARDS, bribe: Math.round(Math.max(5e6, v.bounty * 0.05) / 1e5) * 1e5, by: byName || 'la Marina' };
    game.moment(v, 'Fue encerrado en Impel Down por ' + (byName || 'la Marina'), 30);
    this.news('capture', '⛓️ ' + v.name + ' (' + OP.fmtB(v.bounty) + ') ha sido encerrado en IMPEL DOWN por ' + (byName || 'la Marina') + '.', 3);
  };
  // al despertar estando preso: a la celda, con sus guardias
  P.enterPrison = function (s) {
    const I = this.prisonIsland();
    const p = s.data;
    if (p.inside) this.exitInterior(s, true);
    const pos = this.game.portPos(I);
    p.x = pos.x; p.y = pos.y; p.boat = ''; p.wcls = 1;
    s.lastIsl = I.idx; s.ride = null; s.st.ride = '';
    this.spawnPrisonGuards(s);
    s.client.send('teleport', { x: p.x, y: p.y });
    this.toast(s, '⛓️ Estás en IMPEL DOWN. Para escapar: derrota a los ' + p.prison.guards + ' guardias o sobórnalos (' + this.OP.fmtB(p.prison.bribe) + ' o una espada épica o mejor) desde tu tarjeta.');
    s.dirty = true; s.saveDirty = true;
  };
  P.prisonGuards = function (cid) { return this.OP.S.agents.filter((a) => a.prisonGuard === cid && a.loc === 'island'); };
  P.spawnPrisonGuards = function (s) {
    const { Sim, OP, M, game } = this;
    const p = s.data, I = this.prisonIsland();
    const have = this.prisonGuards(s.cid).length;
    for (let k = have; k < p.prison.guards; k++) {
      const a = Sim.createAgent({ faction: 'marine', isl: I.idx, lvl: Math.max(5, p.lvl + OP.R.i(-1, 3)), rank: 3 });
      a.name = 'Carcelero ' + a.name.split(' ')[0];
      a.prisonGuard = s.cid;
      const cu = Sim.createUnit({ faction: 'marine', solo: true, isl: I.idx }); cu.camp = true; Sim.addMember(cu, a);
      a.x = p.x + (game.rnd() - 0.5) * 4; a.y = p.y + (game.rnd() - 0.5) * 4;
      if (M.isl[Math.floor(a.y) * M.W + Math.floor(a.x)] !== I.idx) { a.x = p.x + 0.8; a.y = p.y; }
    }
    Sim.rebuildOccupants();
  };
  // un guardia menos (al derrotarlo); con 0, libre
  P.prisonGuardDown = function (s, npc) {
    const p = s.data;
    if (!p.prison || npc.prisonGuard !== s.cid) return;
    npc.prisonGuard = 0;
    this.Sim.retire(npc, 'Fue derrotado por un preso');
    p.prison.guards = Math.max(0, p.prison.guards - 1);
    if (p.prison.guards <= 0) return this.escapePrison(s, 'derrotando a sus guardias');
    this.toast(s, '⛓️ Guardia derrotado: quedan ' + p.prison.guards + '.');
    s.dirty = true;
  };
  P.bribe = function (s, m) {
    const { OP, MMO } = this;
    const p = s.data;
    if (!p.prison) return this.toast(s, 'No estás preso.');
    if (m.mode === 'sword') {
      const list = (p.inv && p.inv.swords) || [];
      const sw = list.find((x) => x.id === String(m.id) && x.r >= 3);
      if (!sw) return this.toast(s, 'Los guardias solo aceptan una espada épica o mejor.');
      list.splice(list.indexOf(sw), 1);
      if (p.sword === sw.id) p.sword = '';
      return this.escapePrison(s, 'sobornando a los guardias con la espada «' + sw.n + '»');
    }
    if (p.money < p.prison.bribe) return this.toast(s, 'El soborno cuesta ' + OP.fmtB(p.prison.bribe) + ' y no tienes tanto.');
    p.money -= p.prison.bribe;
    this.escapePrison(s, 'sobornando a los guardias con ' + OP.fmtB(p.prison.bribe));
  };
  P.escapePrison = function (s, how) {
    const { OP, game, Sim } = this;
    const p = s.data;
    for (const a of this.prisonGuards(s.cid)) { a.prisonGuard = 0; Sim.retire(a, 'Volvió a su puesto'); }
    p.prison = null;
    // fuera del Calm Belt: en Sabaody, el lugar más cercano al que llegan los fugados
    const I = this.M.byId.sabaody;
    const pos = game.portPos(I);
    p.x = pos.x; p.y = pos.y; p.boat = ''; p.wcls = 1; s.lastIsl = I.idx;
    const up = game.raiseBounty(p, Math.max(1e7, p.bounty * 0.1), true);
    if (up) this.onBounty(s, up, 'por fugarse de Impel Down', true);
    game.moment(p, 'Se fugó de Impel Down ' + how, 60);
    this.news('capture', '¡' + p.name + ' se ha fugado de IMPEL DOWN ' + how + '!', 4);
    s.client.send('teleport', { x: p.x, y: p.y });
    this.toast(s, '🔓 ¡Escapas de Impel Down ' + how + '! Apareces en ' + I.name + '.');
    s.dirty = true; s.saveDirty = true; this.syncPublic(s);
  };
}

module.exports = { install };
