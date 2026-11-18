/* MILESDEPIRATAS - combates, capturas, recompensas, naufragios y guerras */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const R = OP.R;
  const Sim = OP.Sim;
  const S = () => OP.S;
  const I = (idx) => OP.M.islands[idx];
  const D = (idx) => OP.S.isl[idx];

  // ======================================================================
  //  ¿QUIÉN PELEA CON QUIÉN?
  // ======================================================================
  Sim.hostile = function (ua, ub) {
    if (ua === ub) return false;
    if (ua.faction !== ub.faction) return true;
    if (ua.faction === 'marine') return false;
    if (ua.allies.indexOf(ub.id) >= 0) return false;
    return true;
  };
  function presentOn(u, isl) {
    return u.members.map(Sim.A).filter((m) => m && m.loc === 'island' && m.isl === isl && !m.battle);
  }
  function aboard(u) {
    return u.members.map(Sim.A).filter((m) => m && m.loc === 'ship' && !m.battle && !m.carriedBy);
  }
  function powerOf(list, u, zone) {
    let p = 0;
    for (const a of list) p += Sim.effPower(a);
    if (u) p += Math.sqrt(u.grunts || 0) * (OP.ZONE_GRUNT[zone] || 2) * 3;
    return p;
  }
  function wanted(u, list) {
    if (list.some((m) => m.bounty >= 1e6)) return true;
    const p = u.plan;
    return !!(p && p.phase === 'work' && ['plunder', 'attackbase', 'rescue'].indexOf(p.type) >= 0);
  }

  // probabilidad de que el grupo A ataque al grupo B en esta hora
  Sim.willFight = function (ua, ub, la, lb, zone) {
    const LA = Sim.leaderOf(ua) || la[0];
    if (!LA || !la.length || !lb.length) return 0;
    const pa = powerOf(la, ua, zone), pb = powerOf(lb, ub, zone);
    const ratio = pa / Math.max(1, pb);
    const P = LA.pers;
    if (ua.faction === 'marine' && ub.faction === 'pirate') {
      if (!wanted(ub, lb)) return 0;
      const target = ua.plan && ua.plan.type === 'capture' && lb.some((m) => m.id === ua.plan.target);
      const big = lb.some((m) => m.bounty >= 1e9);
      const need = big ? 1.0 : target ? 0.45 : ua.garrison ? 0.55 : 0.8 - P.cou * 0.25;
      if (ratio < need) return 0;
      if (target) return 0.95;
      return ua.garrison ? 0.22 : 0.1 + P.agg * 0.18 + (LA.dream === 'justicia' ? 0.08 : 0);
    }
    if (ua.faction === 'pirate' && ub.faction === 'marine') {
      const pl = ua.plan;
      if (pl && pl.phase === 'work' && (pl.type === 'attackbase' || pl.type === 'rescue')) return ratio > 0.7 ? 0.9 : 0.25;
      if (ratio < 1.3) return 0;
      return P.agg * 0.22 * (P.hon < 0.3 ? 1.5 : 1);
    }
    // pirata contra pirata
    if (ua.allies.indexOf(ub.id) >= 0) return 0;
    const hunt = ua.plan && ua.plan.type === 'hunt' && lb.some((m) => m.id === ua.plan.target);
    const revenge = LA.revenge && lb.some((m) => m.id === LA.revenge);
    if (hunt || revenge) return ratio > 0.6 ? 0.9 : 0.15;
    let ch = 0;
    if (ua.enemies.indexOf(ub.id) >= 0) ch = ratio > 0.9 ? 0.18 + P.agg * 0.2 : 0.02;
    else if (ratio >= 1.5) ch = P.agg * P.gre * 0.05 + (lb.some((m) => m.bounty > 0) && P.gre > 0.65 ? 0.02 : 0);
    if (LA.talent === 'Diplomático') ch *= 0.3;
    return ch;
  };

  Sim.islandEncounters = function () {
    const occAll = S()._occ;
    if (!occAll) return;
    for (let idx = 0; idx < occAll.length; idx++) {
      const occ = occAll[idx];
      if (occ.length < 2) continue;
      const groups = new Map();
      for (const a of occ) {
        if (a.battle || !a.unit) continue;
        if (!groups.has(a.unit)) groups.set(a.unit, []);
        groups.get(a.unit).push(a);
      }
      if (groups.size < 2) continue;
      const zone = I(idx).sea;
      const ids = [...groups.keys()];
      let fought = false;
      for (let i = 0; i < ids.length && !fought; i++) {
        const ua = Sim.U(ids[i]);
        if (!ua || ua.cooldown > S().time) continue;
        for (let j = 0; j < ids.length; j++) {
          if (i === j) continue;
          const ub = Sim.U(ids[j]);
          if (!ub || ub.cooldown > S().time || !Sim.hostile(ua, ub)) continue;
          const p = Sim.willFight(ua, ub, groups.get(ids[i]), groups.get(ids[j]), zone);
          if (p > 0 && R.chance(p)) { Sim.startIslandBattle(idx, ua, ub, 'island'); fought = true; break; }
        }
      }
    }
  };

  Sim.seaEncounters = function () {
    const ships = S().ships.filter((s) => s.state === 'sailing' && !s.gate);
    for (let i = 0; i < ships.length; i++) {
      const a = ships[i];
      if (a.state !== 'sailing') continue;
      for (let j = i + 1; j < ships.length; j++) {
        const b = ships[j];
        if (b.state !== 'sailing') continue;
        if (Math.abs(a.x - b.x) > 2.5 || Math.abs(a.y - b.y) > 2.5) continue;
        const ua = Sim.U(a.unit), ub = Sim.U(b.unit);
        if (!ua || !ub || !Sim.hostile(ua, ub)) continue;
        if (ua.cooldown > S().time || ub.cooldown > S().time) continue;
        const la = aboard(ua), lb = aboard(ub);
        const zone = Sim.zoneOfPos(a.x, a.y);
        let first = null;
        if (R.chance(Sim.willFight(ua, ub, la, lb, zone))) first = [ua, ub];
        else if (R.chance(Sim.willFight(ub, ua, lb, la, zone))) first = [ub, ua];
        if (first) { Sim.startNavalBattle(first[0], first[1]); break; }
      }
    }
  };

  // ======================================================================
  //  EMPEZAR UN COMBATE
  // ======================================================================
  function newBattle(kind, isl, x, y) {
    const b = { id: Sim.newId(), kind, isl, x, y, sides: [{ u: [], f: [], g: 0 }, { u: [], f: [], g: 0 }], round: 0, next: S().time + 0.25, t0: S().time, hits: [], ships: [] };
    S().battles.push(b);
    S().stats.battles++;
    return b;
  }
  function joinSide(b, side, u, fighters) {
    if (b.sides[0].u.indexOf(u.id) >= 0 || b.sides[1].u.indexOf(u.id) >= 0) return;
    b.sides[side].u.push(u.id);
    for (const a of fighters) {
      b.sides[side].f.push(a.id);
      a.battle = b.id; a.act = 'fight'; a.tx = null;
    }
    b.sides[side].g += u.grunts || 0;
  }

  Sim.startIslandBattle = function (isl, ua, ub, kind) {
    // los bandidos para novatos y los NPC de tripulaciones de jugadores (grupos "camp") no entran en las batallas
    // de la simulación: así un bandido de nivel 2 nunca "destruye" una base de la Marina
    if (!ua || !ub || ua.camp || ub.camp) return null;
    const la = presentOn(ua, isl), lb = presentOn(ub, isl);
    if (!la.length || !lb.length) return null;
    let x = 0, y = 0;
    for (const a of la.concat(lb)) { x += a.x; y += a.y; }
    x /= la.length + lb.length; y /= la.length + lb.length;
    const b = newBattle(kind || 'island', isl, x, y);
    joinSide(b, 0, ua, la);
    joinSide(b, 1, ub, lb);
    // aliados y compañeros de bando que están en la isla
    const groups = new Map();
    for (const a of Sim.occupants(isl)) {
      if (a.battle || !a.unit || a.unit === ua.id || a.unit === ub.id) continue;
      if ((Sim.U(a.unit) || {}).camp) continue;
      groups.set(a.unit, true);
    }
    for (const uid of groups.keys()) {
      const u = Sim.U(uid);
      if (!u) continue;
      for (let s = 0; s < 2; s++) {
        const own = s === 0 ? ua : ub, other = s === 0 ? ub : ua;
        const friend = (u.faction === 'marine' && own.faction === 'marine' && other.faction === 'pirate') ||
          (u.faction === 'pirate' && own.faction === 'pirate' && own.allies.indexOf(u.id) >= 0 && Sim.hostile(u, other));
        if (friend) { joinSide(b, s, u, presentOn(u, isl)); break; }
      }
    }
    // los soldados de las bases luchan
    for (let s = 0; s < 2; s++) {
      if (b.sides[s].u.some((id) => (Sim.U(id) || {}).faction === 'marine') && I(isl).base) {
        const g = Sim.garrisonOf(isl);
        if (g && b.sides[s].u.indexOf(g.id) < 0) joinSide(b, s, g, presentOn(g, isl));
      }
    }
    noteBattleStart(b);
    return b;
  };

  Sim.startNavalBattle = function (ua, ub) {
    const sa = Sim.SH(ua.ship), sb = Sim.SH(ub.ship);
    const b = newBattle('naval', -1, (sa.x + sb.x) / 2, (sa.y + sb.y) / 2);
    b.ships = [sa.id, sb.id];
    sa.state = 'battle'; sb.state = 'battle';
    joinSide(b, 0, ua, aboard(ua));
    joinSide(b, 1, ub, aboard(ub));
    noteBattleStart(b);
    return b;
  };

  Sim.startWar = function (isl, prisoner) {
    const occ = Sim.occupants(isl);
    const mar = new Set(), pir = new Set();
    for (const a of occ) {
      if (!a.unit || a.battle) continue;
      if (a.faction === 'marine') mar.add(a.unit); else pir.add(a.unit);
    }
    const b = newBattle('war', isl, I(isl).x, I(isl).y);
    b.prisoner = prisoner.id;
    for (const id of mar) joinSide(b, 0, Sim.U(id), presentOn(Sim.U(id), isl));
    for (const id of pir) joinSide(b, 1, Sim.U(id), presentOn(Sim.U(id), isl));
    S().war = { battle: b.id, isl };
    return b;
  };

  function noteBattleStart(b) {
    for (const s of b.sides) for (const uid of s.u) { const u = Sim.U(uid); if (u) u.cooldown = S().time + 16; }
  }

  // ======================================================================
  //  RONDAS DEL COMBATE
  // ======================================================================
  Sim.updateBattles = function () {
    const list = S().battles;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      while (!b.over && S().time >= b.next) {
        round(b);
        b.next += 0.25;
      }
      if (b.over) list.splice(i, 1);
    }
  };

  function active(b, s) {
    const out = [];
    for (const id of b.sides[s].f) {
      const a = Sim.A(id);
      if (a && a.battle === b.id && a.hp > 0 && a.loc !== 'dead') out.push(a);
    }
    return out;
  }
  function zoneOf(b) { return b.isl >= 0 ? I(b.isl).sea : Sim.zoneOfPos(b.x, b.y); }

  function round(b) {
    b.round++;
    const zone = zoneOf(b);
    const gp = OP.ZONE_GRUNT[zone] || 2;
    const act = [active(b, 0), active(b, 1)];
    b.hits = [];
    // cañonazos en el mar
    if (b.kind === 'naval' && b.round <= 3) {
      for (let s = 0; s < 2; s++) {
        const mine = Sim.SH(b.ships[s]), theirs = Sim.SH(b.ships[1 - s]);
        if (!mine || !theirs) continue;
        const snipers = act[s].filter((a) => a.talent === 'Tirador').length;
        const dmg = (OP.SHIPS[mine.type].guns * 5 + act[s].length * 2) * (1 + snipers * 0.3) * R.f(0.6, 1.4);
        theirs.hp -= dmg;
      }
      for (let s = 0; s < 2; s++) {
        const sh = Sim.SH(b.ships[s]);
        if (sh && sh.hp <= 0) { sh.hp = 0; endBattle(b, 1 - s, false, s); return; }
      }
    }
    for (let s = 0; s < 2; s++) {
      const enemies = act[1 - s];
      if (!enemies.length) continue;
      const strat = act[s].some((a) => a.talent === 'Estratega' && Sim.U(a.unit) && Sim.U(a.unit).leader === a.id) ? 1.1 : 1;
      for (const atk of act[s]) {
        if (atk.hp <= 0) continue;
        const alive = enemies.filter((e) => e.hp > 0);
        if (!alive.length) break;
        const def = alive[Math.floor(R.next() * alive.length)];
        const pa = Sim.effPower(atk) * strat, pd = Math.max(1, Sim.effPower(def));
        let dmg = def.maxHp * 0.11 * Math.pow(pa / pd, 1.2) * R.f(0.6, 1.4);
        if (atk.talent === 'Tirador' && b.round <= 2) dmg *= 1.5;
        if (atk.talent === 'Asesino' && b.round === 1) dmg *= 1.8;
        if (def.talent === 'Fuerte') dmg *= 0.9;
        if (def.fruit >= 0 && OP.FRUITS[def.fruit].type === 'Logia' && !atk.haki[1]) dmg *= 0.3;
        if (def.haki[0] && R.chance(0.15)) dmg *= 0.4; // lo ve venir
        dmg = Math.min(dmg, def.maxHp * 1.1);
        def.hp -= dmg;
        b.hits.push([atk.id, def.id]);
        if (def.hp <= 0) { def.hp = 0; Sim.log(def, 'Cayó derrotado ante ' + atk.name + '.'); }
        // los soldados rasos caen a montones
        if (b.sides[1 - s].g > 0) b.sides[1 - s].g = Math.max(0, b.sides[1 - s].g - Math.floor(pa / (gp * 18) * R.f(0.5, 1.5)));
      }
      // ataque de los soldados rasos
      const g = b.sides[s].g;
      if (g > 0) {
        const total = Math.sqrt(g) * gp * 0.8 * R.f(0.6, 1.4);
        const alive = enemies.filter((e) => e.hp > 0);
        for (let k = 0; k < Math.min(3, alive.length); k++) {
          const e = alive[Math.floor(R.next() * alive.length)];
          e.hp -= total / 3;
          if (e.hp <= 0) e.hp = 0;
        }
      }
    }
    const a0 = active(b, 0), a1 = active(b, 1);
    if (!a0.length || !a1.length) { endBattle(b, a0.length ? 0 : 1, false); return; }
    const p0 = powerOf(a0, null, zone) + Math.sqrt(b.sides[0].g) * gp * 3;
    const p1 = powerOf(a1, null, zone) + Math.sqrt(b.sides[1].g) * gp * 3;
    // huir si va muy mal
    for (let s = 0; s < 2; s++) {
      const mine = s === 0 ? p0 : p1, theirs = s === 0 ? p1 : p0;
      if (b.kind === 'war') break;
      const vsMarine = b.sides[1 - s].u.some((id) => (Sim.U(id) || {}).faction === 'marine') && b.sides[s].u.some((id) => (Sim.U(id) || {}).faction === 'pirate');
      if (mine < theirs * (vsMarine ? 0.45 : 0.3) && b.round >= 2) {
        const L = Sim.A(b.sides[s].f[0]);
        const cou = L ? L.pers.cou : 0.5;
        if (R.chance(0.6 - cou * 0.4)) { endBattle(b, 1 - s, true); return; }
      }
    }
    if (b.round >= (b.kind === 'war' ? 40 : 16)) endBattle(b, p0 >= p1 ? 0 : 1, true);
  }

  // ======================================================================
  //  FIN DEL COMBATE Y CONSECUENCIAS
  // ======================================================================
  function endBattle(b, win, fled, sunkSide) {
    b.over = true;
    const s = S();
    const zone = zoneOf(b);
    const zm = OP.ZONE_MULT[zone] || 1;
    const W = b.sides[win], L = b.sides[1 - win];
    const winners = W.f.map(Sim.A).filter((a) => a && a.loc !== 'dead');
    const losers = L.f.map(Sim.A).filter((a) => a && a.loc !== 'dead');
    const winU = W.u.map(Sim.U).filter(Boolean);
    const loseU = L.u.map(Sim.U).filter(Boolean);
    const winFaction = winU[0] ? winU[0].faction : (winners[0] || {}).faction;
    const loseFaction = loseU[0] ? loseU[0].faction : (losers[0] || {}).faction;
    const defeated = losers.filter((a) => a.hp <= 0);
    const where = b.isl >= 0 ? I(b.isl).name : 'alta mar';
    for (const a of winners.concat(losers)) {
      a.battle = 0; a.act = 'idle'; a.actUntil = 0; a.lastFight = s.time;
      a.st.fights++;
      if (a.hp <= 0) a.hp = 1;
    }
    for (const a of winners) a.st.wins++;
    for (const a of losers) a.st.losses++;
    // experiencia
    let pool = 0;
    for (const d of losers) pool += Math.pow(d.lvl, 1.15) * 4 * zm * (d.hp <= 1 ? 1 : 0.5);
    for (const a of winners) {
      Sim.gainXp(a, pool / Math.max(1, winners.length) * (a.talent === 'Luchador' ? 1.25 : 1) + 5);
      if (Sim.badge(a, 'first_win')) Sim.log(a, 'Ganó su primer combate en ' + where + '.');
    }
    let pool2 = 0;
    for (const d of winners) pool2 += Math.pow(d.lvl, 1.15) * 1.2 * zm;
    for (const a of losers) Sim.gainXp(a, pool2 / Math.max(1, losers.length) + 3);
    // relaciones
    for (const side of [winners, losers]) {
      for (const a of side) for (const c of side) if (a !== c && R.chance(0.5)) Sim.rel(a, c, R.f(2, 6));
    }
    for (const a of winners) for (const d of losers) { Sim.rel(d, a, -R.f(8, 18)); if (R.chance(0.5)) Sim.rel(a, d, -R.f(2, 8)); }
    if (winFaction === 'pirate' && loseFaction === 'pirate') {
      for (const wu of winU) for (const lu of loseU) {
        if (lu.enemies.indexOf(wu.id) < 0) lu.enemies.push(wu.id);
        if (lu.enemies.length > 6) lu.enemies.shift();
      }
    }
    // momentos: vencer a alguien mucho más fuerte
    const strongestLoser = losers.reduce((m, a) => (Sim.basePower(a) > (m ? Sim.basePower(m) : 0) ? a : m), null);
    for (const a of winners) {
      if (strongestLoser && Sim.basePower(strongestLoser) > Sim.basePower(a) * 1.35 && defeated.indexOf(strongestLoser) >= 0) {
        Sim.moment(a, 'Venció a ' + strongestLoser.name + ', mucho más fuerte, en ' + where, 30 + Math.min(30, strongestLoser.lvl / 3));
      }
    }
    // --- consecuencias por bandos ---
    let capturedNames = [];
    if (winFaction === 'marine' && loseFaction === 'pirate') {
      const capU = winU.find((u) => u.ship && !u.garrison) || winU[0];
      for (const p of defeated) {
        if (p.loc === 'dead') continue;
        if (R.chance((fled ? 0.25 : 0.5) * (p.isPlayer ? 0.5 : 1))) { Sim.captureAgent(p, capU, winners); capturedNames.push(p); }
      }
      for (const m of winners) {
        for (const d of defeated) m.merit += Math.min(120, 2 + d.bounty / 5e6) / Math.max(1, winners.length);
        m.merit += 1;
      }
      for (const u of winU) {
        if (u.plan && u.plan.type === 'capture' && capturedNames.some((p) => p.id === u.plan.target)) {
          const L = Sim.leaderOf(u);
          for (const m of Sim.unitMembers(u)) { m.merit += 15; m.st.missions++; }
          s.stats.missions.capture = (s.stats.missions.capture || 0) + 1;
          if (L) Sim.log(L, 'Misión cumplida: ' + u.plan.title + '.');
          u.plan = null; u.nextThink = s.time + 1;
        }
      }
    } else if (winFaction === 'pirate' && loseFaction === 'marine') {
      let value = 0;
      for (const d of defeated) {
        value += OP.RANK_VALUE[d.rank] * 1e6 * R.f(0.7, 1.3);
        d.merit = Math.max(0, d.merit - 5);
      }
      for (const a of winners) Sim.raiseBounty(a, Math.min(value / Math.max(1, winners.length) * (a.id === (winU[0] || {}).leader ? 1.5 : 1), a.bounty * 0.12 + 2e7 * zm), 'derrotó a marines');
      maybeKill(winners, defeated, zone);
      // asalto a una base
      if (b.isl >= 0 && I(b.isl).base && !fled) baseDamage(b, winU, winners);
    } else if (winFaction === 'pirate' && loseFaction === 'pirate') {
      let loot = 0, bounty = 0;
      for (const d of defeated) {
        const take = Math.round(d.money * 0.4);
        d.money -= take; loot += take;
        bounty += d.bounty * 0.12;
      }
      for (const a of winners) {
        a.money += Math.round(loot / Math.max(1, winners.length));
        if (bounty > 0) Sim.raiseBounty(a, Math.min(bounty / Math.max(1, winners.length), Math.max(3e6, a.bounty * 0.08) + 8e6 * zm), 'venció a piratas buscados');
      }
      // los ladrones roban mapas y copias de Poneglyph
      if (winners.some((a) => a.talent === 'Ladrón') && winU[0] && loseU[0]) {
        const wu = winU[0], lu = loseU[0];
        if (lu.know.treasures.length) wu.know.treasures.push(lu.know.treasures.pop());
        const road = lu.know.road.find((r) => wu.know.road.indexOf(r) < 0);
        if (road != null && R.chance(0.15)) {
          wu.know.road.push(road);
          Sim.news('poneglyph', 'Los ' + wu.name + ' han robado una copia de un Road Poneglyph a los ' + lu.name + '.', { a: [wu.leader], imp: 3 });
        }
      }
      maybeKill(winners, defeated, zone);
      // reclutar al vencido
      const wu = winU[0];
      for (const d of defeated) {
        const du = Sim.U(d.unit);
        if (wu && !wu.solo && du && du.solo && d.loc !== 'dead' && R.chance(0.15 + (d.pers.loy < 0.4 ? 0.1 : 0))) {
          if (wu.members.length < Sim.desiredSize(wu) && b.isl >= 0) Sim.joinCrew(d, wu);
        }
      }
    }
    // naufragio
    if (b.kind === 'naval') {
      for (let k = 0; k < 2; k++) {
        const sh = Sim.SH(b.ships[k]);
        if (!sh) continue;
        if (sh.hp <= 0 || sunkSide === k) Sim.sinkShip(sh, k === win ? null : winU);
        else sh.state = 'sailing';
      }
      // usuarios de frutas que caen al mar
      for (const d of defeated) {
        if (d.loc === 'dead' || d.fruit < 0 || d.loc !== 'ship' || d.isPlayer) continue;
        if (R.chance(0.08)) {
          const mates = Sim.unitMembers(Sim.U(d.unit) || { members: [] }).filter((m) => m.fruit < 0 && m.hp > 0);
          if (!mates.length || R.chance(0.3)) Sim.kill(d, 'se ahogó en el mar (usuario de fruta)', null);
          else { Sim.rel(d, mates[0], 30); Sim.moment(mates[0], 'Saltó al mar para salvar a ' + d.name, 24); }
        }
      }
    }
    // guerra de Marineford
    if (b.kind === 'war') Sim.endWar(b, win);
    // los perdedores huyen y cambian de planes
    for (const u of loseU) {
      if (u.garrison || !S().U[u.id]) continue;
      if (u.plan && u.plan.type !== 'prison') { u.plan = null; }
      u.nextThink = s.time + R.f(0.5, 2);
      u.cooldown = s.time + 24;
    }
    for (const u of winU) u.cooldown = s.time + 12;
    // noticia
    const notable = winners.concat(losers).some((a) => a.bounty >= 3e8 || a.rank >= 7 || a.isPlayer) || winU.concat(loseU).some((u) => s.emperors.indexOf(u.id) >= 0) || b.kind === 'war';
    if (notable) {
      const nameOf = (side, units) => {
        const u = units.find((x) => !x.solo && !x.garrison);
        if (u) return (u.faction === 'marine' ? 'la ' : 'los ') + u.name;
        const a = side[0];
        if (!a) return 'alguien';
        return a.faction === 'marine' ? 'la Marina (' + OP.RANKS[a.rank] + ' ' + a.name + ')' : a.name;
      };
      const ws = nameOf(winners, winU), ls = nameOf(losers, loseU);
      let txt = (b.kind === 'naval' ? 'Batalla naval' : 'Batalla') + ' en ' + where + ': victoria de ' + ws + ' frente a ' + ls + (fled ? ', que escapan como pueden' : '') + '.';
      if (capturedNames.length) txt += ' Capturados: ' + capturedNames.slice(0, 3).map((p) => p.name).join(', ') + (capturedNames.length > 3 ? '...' : '') + '.';
      const imp = winners.concat(losers).some((a) => a.bounty >= 3e8 || a.rank >= 7) ? 3 : 2;
      Sim.news('battle', txt, { a: winners.slice(0, 2).map((a) => a.id).concat(losers.slice(0, 2).map((a) => a.id)), isl: b.isl, imp });
    }
    for (const a of winners.concat(losers)) if (a.loc === 'island' || a.loc === 'ship') Sim.log(a, (winners.indexOf(a) >= 0 ? 'Ganó' : 'Perdió') + ' una pelea en ' + where + '.');
  }

  function maybeKill(winners, defeated, zone) {
    if (!winners.length) return;
    let cruel = 0, killer = null;
    for (const a of winners) {
      const c = (1 - a.pers.hon) * a.pers.agg * (a.talent === 'Asesino' ? 2.2 : 1);
      if (c > cruel) { cruel = c; killer = a; }
    }
    const zf = zone === 'newworld' ? 1.6 : zone === 'paradise' ? 1.2 : 0.7;
    for (const d of defeated) {
      if (d.loc === 'dead' || d.isPlayer) continue;
      if (R.chance(0.07 * cruel * zf)) {
        if (d.fruit >= 0 && OP.FRUITS[d.fruit].name.indexOf('Yomi') === 0 && !d.revived) {
          d.revived = true; d.hp = d.maxHp * 0.3;
          Sim.moment(d, 'Murió... y volvió a la vida gracias a su fruta', 50);
          continue;
        }
        Sim.kill(d, 'a manos de ' + killer.name, killer);
      }
    }
  }

  function baseDamage(b, winU, winners) {
    const st = D(b.isl);
    const T = I(b.isl);
    if (st.baseHp <= 0) return;
    let dmg = 0;
    for (const a of winners) dmg += Sim.effPower(a) * 1.5;
    st.baseHp -= dmg;
    st.attackedAt = S().time;
    // liberar presos
    for (const a of S().agents) {
      if (a.loc !== 'prison' || a.isl !== b.isl) continue;
      if (S().execution && S().execution.agent === a.id) continue;
      const mine = winU.some((u) => u.members.indexOf(a.id) >= 0);
      if (mine || (T.prison ? R.chance(0.05) : R.chance(0.4))) {
        Sim.freePrisoner(a, mine ? 'Su tripulación le rescató' : 'Aprovechó el asalto para escapar');
        if (mine) { Sim.moment(a, 'Fue rescatado por sus compañeros en ' + T.name, 35); for (const w of winners) Sim.rel(a, w, 30); }
        Sim.news('capture', a.name + ' ha escapado de ' + T.name + ' durante el asalto.', { a: [a.id], isl: b.isl, imp: 2 });
      }
    }
    if (st.baseHp <= 0) {
      st.baseHp = 0;
      st.destroyedFor = 0;
      for (const a of winners) {
        Sim.raiseBounty(a, Math.min(4e7 * (OP.ZONE_MULT[T.sea] || 1) * (T.hq ? 5 : 1), a.bounty * 0.2 + 5e7), 'destruyó la ' + T.base);
        if (Sim.badge(a, 'basebreaker')) Sim.moment(a, 'Destruyó la ' + T.base, 55);
      }
      const u = winU[0];
      Sim.news('attack', '¡La ' + T.base + ' ha sido destruida por ' + (u && !u.solo ? 'los ' + u.name : winners[0].name) + '!', { a: winners.slice(0, 3).map((a) => a.id), isl: b.isl, imp: 4 });
    }
    for (const u of winU) if (u.plan && (u.plan.type === 'attackbase' || u.plan.type === 'rescue')) { u.plan.work = u.plan.done + 1; }
  }

  // ======================================================================
  //  CAPTURA, MUERTE, NAUFRAGIO
  // ======================================================================
  Sim.captureAgent = function (p, byU, captors) {
    const pu = Sim.U(p.unit);
    p.st.captured++;
    S().stats.captures++;
    const L = byU ? Sim.leaderOf(byU) : (captors && captors[0]);
    if (L) {
      L.st.caps++;
      // para el cuadro de honor: recompensa total capturada y la mayor captura
      L.st.capVal = (L.st.capVal || 0) + (p.bounty || 0);
      if (p.bounty > 0 && (!L.st.capBest || p.bounty > L.st.capBest.bounty)) L.st.capBest = { name: p.name, bounty: p.bounty };
    }
    if (L && L.st.caps === 10) Sim.badge(L, 'hunter10');
    if (captors) for (const c of captors) if (Sim.badge(c, 'first_capture')) Sim.moment(c, 'Capturó a su primer pirata: ' + p.name, 18 + Math.min(30, p.bounty / 1e7));
    if (L && p.bounty >= 1e8) Sim.moment(L, 'Capturó a ' + p.name + ' (' + OP.fmtB(p.bounty) + ')', 30 + Math.min(40, p.bounty / 5e7));
    Sim.moment(p, 'Fue capturado por la Marina en ' + (p.loc === 'island' ? I(p.isl).name : 'alta mar'), 12);
    // si era el capitán, la tripulación elige otro
    if (pu && pu.leader === p.id) { pu.leader = 0; Sim.chooseNewLeader(pu, false); }
    p.battle = 0;
    if (byU && byU.ship && Sim.SH(byU.ship) && !byU.garrison) {
      p.loc = 'ship'; p.carriedBy = byU.id;
      if (byU.prisoners.indexOf(p.id) < 0) byU.prisoners.push(p.id);
    } else {
      const isl = p.loc === 'island' ? p.isl : (byU && byU.isl >= 0 ? byU.isl : p.home);
      p.loc = 'prison'; p.isl = isl; p.carriedBy = 0;
      p.prisonUntil = I(isl).prison ? (p.bounty >= 1e9 ? 0 : S().time + 24 * R.i(50, 110)) : S().time + 24 * (p.bounty < 2e7 ? R.i(5, 12) : R.i(10, 30));
    }
    if (p.bounty >= 8e7 || p.isPlayer || (pu && pu.fame > 120)) {
      Sim.news('capture', p.name + (p.bounty ? ' (' + OP.fmtB(p.bounty) + ')' : '') + ' ha sido capturado por ' + (L ? L.name : 'la Marina') + '.', { a: [p.id].concat(L ? [L.id] : []), isl: p.isl, imp: p.bounty >= 2e8 ? 3 : 2 });
    }
    // si en su grupo ya no queda nadie libre, el grupo se deshace
    if (pu && !Sim.unitMembers(pu).length && pu.solo) Sim.disbandUnit(pu);
  };

  Sim.kill = function (a, cause, killer) {
    if (a.loc === 'dead') return;
    const s = S();
    const u = Sim.U(a.unit);
    if (a.carriedBy) {
      const cu = Sim.U(a.carriedBy);
      if (cu) cu.prisoners = cu.prisoners.filter((x) => x !== a.id);
      a.carriedBy = 0;
    }
    a.loc = 'dead'; a.deathT = s.time; a.deathCause = cause; a.hp = 0; a.battle = 0;
    a.deathIsl = a.isl;
    if (u) Sim.removeMember(u, a, false);
    if (a.fruit >= 0) { const fr = s.fruits[a.fruit]; fr.state = 'none'; fr.owner = 0; }
    s.stats.deaths++;
    // amigos que juran venganza
    for (const o of s.agents) {
      if (o === a || (o.loc !== 'island' && o.loc !== 'ship')) continue;
      const r = o.rel[a.id] || 0;
      if (r >= 45) {
        Sim.moment(o, 'Perdió a su amigo ' + a.name, 20);
        if (killer && killer !== o) {
          o.revenge = killer.id;
          o.quote = 'Vengaré a ' + a.name.split(' ')[0] + '. Lo juro.';
        } else {
          o.quote = 'Llevo a ' + a.name.split(' ')[0] + ' en el corazón. Por él seguiré adelante.';
        }
      }
    }
    if (killer) { killer.st.kos++; Sim.rel(killer, a, -30); }
    if (a.bounty >= 2e7 || a.rank >= 3 || a.isPlayer || a.lvl >= 30) {
      Sim.news('death', a.name + (a.epithet ? ' "' + a.epithet + '"' : '') + ' ha muerto ' + cause + '.', { a: [a.id], isl: a.isl, imp: a.bounty >= 5e8 || a.rank >= 7 || a.isPlayer ? 3 : 2 });
    }
    if (a.isPlayer && OP.onPlayerDeath) OP.onPlayerDeath(a);
  };

  function crewHasPlayer(u) { return !!u && u.members.some((id) => (Sim.A(id) || {}).isPlayer); }
  Sim.sinkShip = function (sh, attackers) {
    const u = Sim.U(sh.unit);
    const s = S();
    s.stats.shipwrecks++;
    const near = Sim.nearestIsland(sh.x, sh.y);
    const marinesWon = attackers && attackers.some((x) => x.faction === 'marine');
    const capU = marinesWon ? attackers.find((x) => x.ship && Sim.SH(x.ship) && x.faction === 'marine') : null;
    if (u) {
      const L = Sim.leaderOf(u);
      if (sh.type !== 'bote' || crewHasPlayer(u)) Sim.news('sea', 'El barco "' + sh.name + '"' + (u.solo ? '' : ' de ' + (u.faction === 'marine' ? 'la ' : 'los ') + u.name) + ' se ha hundido cerca de ' + I(near).name + '.', { a: L ? [L.id] : [], isl: near, imp: 2 });
      // prisioneros que llevaban
      for (const pid of u.prisoners.slice()) { const p = Sim.A(pid); if (p) Sim.jailNearest(p, u); }
      u.prisoners = [];
      const crew = u.members.map(Sim.A).filter((m) => m && m.loc === 'ship');
      const swimmers = crew.filter((m) => m.fruit < 0);
      for (const m of crew) {
        if (m.fruit >= 0 && !m.isPlayer && (!swimmers.length || R.chance(0.25))) { Sim.kill(m, 'ahogado en el naufragio (usuario de fruta)', null); continue; }
        if (capU && m.faction === 'pirate') { Sim.captureAgent(m, capU, null); continue; }
        m.loc = 'island';
        Sim.placeOnIsland(m, near, false);
        m.hp = Math.max(1, m.hp * 0.7);
        m.st.shipwrecks++;
        if (Sim.badge(m, 'shipwreck')) Sim.moment(m, 'Sobrevivió a un naufragio cerca de ' + I(near).name, 25);
      }
      Sim.removeShip(sh);
      u.ship = 0;
      if (S().U[u.id] && u.members.length) {
        u.status = 'docked'; u.isl = near; u.plan = null; u.nextThink = s.time + 2;
        // un bote para salir del paso
        Sim.createShip(u.faction === 'marine' ? 'marine' : 'bote', u, near);
      }
    } else Sim.removeShip(sh);
  };

  // tormentas y monstruos marinos
  Sim.seaHazards = function (sh) {
    if (sh.gate) return;
    const u = Sim.U(sh.unit);
    const zone = Sim.zoneOfPos(sh.x, sh.y);
    let p = { paradise: 0.01, newworld: 0.018, sky: 0.003, deep: 0.003, calm: 0.004 }[zone] || 0.0015;
    if (u && Sim.hasNavigator(u)) p *= 0.5;
    if (!R.chance(p)) return;
    const dmg = sh.maxHp * R.f(0.05, 0.18) * (zone === 'newworld' ? 1.4 : 1);
    sh.hp -= dmg;
    const L = u && Sim.leaderOf(u);
    const what = zone === 'calm' ? 'Un rey marino atacó el barco' : R.pick(['Una tormenta terrible dañó el barco', 'Una ola gigante golpeó el barco', 'Un rey marino atacó el barco']);
    if (L) Sim.log(L, what + '.');
    if (sh.hp <= 0) { sh.hp = 0; Sim.sinkShip(sh, null); }
  };

  // ======================================================================
  //  GUERRA
  // ======================================================================
  Sim.endWar = function (b, win) {
    const s = S();
    const p = Sim.A(b.prisoner);
    s.war = null;
    if (!p) { s.execution = null; return; }
    if (win === 1) {
      Sim.freePrisoner(p, 'Fue salvado en la Guerra de Marineford');
      Sim.moment(p, 'Fue rescatado de su ejecución en la Guerra de Marineford', 70);
      const rescuers = b.sides[1].f.map(Sim.A).filter(Boolean);
      for (const a of rescuers) { Sim.rel(p, a, 40); if (Sim.badge(a, 'war')) Sim.moment(a, 'Luchó en la Guerra de Marineford y ganó', 60); Sim.raiseBounty(a, 1e8, 'Guerra de Marineford'); }
      Sim.news('world', '¡Los piratas ganan la Guerra de Marineford y salvan a ' + p.name + '! La Marina queda humillada.', { a: [p.id], isl: b.isl, imp: 5 });
    } else {
      Sim.kill(p, 'ejecutado tras la Guerra de Marineford', null);
      for (const a of b.sides[0].f.map(Sim.A).filter(Boolean)) { a.merit += 40; if (Sim.badge(a, 'war')) Sim.moment(a, 'Defendió Marineford en la gran guerra', 55); }
      Sim.news('world', 'La Marina gana la Guerra de Marineford. ' + p.name + ' ha sido ejecutado.', { a: [p.id], isl: b.isl, imp: 5 });
    }
    s.execution = null;
    for (const u of s.units) if (u.plan && (u.plan.type === 'war' || (u.plan.type === 'rescue' && u.plan.target === p.id))) { u.plan = null; u.nextThink = s.time + 2; }
  };
})();
