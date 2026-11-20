/* MILESDEPIRATAS - inteligencia de los personajes: objetivos, misiones, viajes, Marina y eventos */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const R = OP.R;
  const Sim = OP.Sim;
  const S = () => OP.S;
  const M = () => OP.M;
  const I = (idx) => OP.M.islands[idx];
  const D = (idx) => OP.S.isl[idx];
  const byId = (id) => OP.M.byId[id];

  // ======================================================================
  //  REQUISITOS Y PELIGRO
  // ======================================================================
  Sim.allowedDanger = function (lvl) {
    if (lvl < 6) return 2; if (lvl < 12) return 3; if (lvl < 18) return 4; if (lvl < 24) return 5;
    if (lvl < 32) return 6; if (lvl < 42) return 7; if (lvl < 55) return 8; if (lvl < 70) return 9; return 10;
  };
  Sim.REQ = { paradiseLvl: 14, deepLvl: 30, nwLvl: 35, nwIslands: 5, skyLvl: 16 };
  Sim.hasLogpose = (u) => Sim.unitMembers(u).some((m) => m.prog.logpose);
  Sim.paradiseCheck = function (u) {
    const L = Sim.leaderOf(u), sh = Sim.SH(u.ship);
    return {
      lvl: !!L && L.lvl >= Sim.REQ.paradiseLvl,
      ship: !!sh && sh.type !== 'bote',
      logpose: Sim.hasLogpose(u),
      crew: Sim.unitMembers(u).every((m) => m.lvl >= 8)
    };
  };
  // Los tripulantes demasiado débiles se quedan en tierra antes de un viaje peligroso
  Sim.dropWeak = function (u, minLvl) {
    if (u.isl < 0) return;
    const T = I(u.isl);
    for (const m of Sim.unitMembers(u).slice()) {
      if (m.id === u.leader || m.lvl >= minLvl || m.loc !== 'island') continue;
      Sim.removeMember(u, m, true);
      const nu = Sim.createUnit({ faction: 'pirate', solo: true, isl: u.isl });
      Sim.addMember(nu, m);
      Sim.createShip('bote', nu, u.isl);
      Sim.rel(m, Sim.leaderOf(u), 5);
      Sim.moment(m, 'Se quedó en ' + T.name + ': aún era demasiado débil para seguir a los ' + u.name, 14);
      if (u.fame > 20) Sim.news('crew', m.name + ' se queda en ' + T.name + ': todavía es demasiado débil para seguir a los ' + u.name + '.', { a: [m.id, u.leader], isl: u.isl });
    }
  };
  Sim.nwCheck = function (u) {
    const L = Sim.leaderOf(u), sh = Sim.SH(u.ship);
    return {
      lvl: !!L && L.lvl >= Sim.REQ.nwLvl,
      islands: u.glVisited.length >= Sim.REQ.nwIslands,
      coated: !!sh && sh.coated,
      navigator: Sim.hasNavigator(u) || (!!L && L.lvl >= 50),
      crew: Sim.unitMembers(u).every((m) => m.lvl >= 25)
    };
  };
  const noCrew = (o) => Object.keys(o).every((k) => k === 'crew' || o[k]);
  const allTrue = (o) => Object.keys(o).every((k) => o[k]);
  Sim.gateAllowed = function (u, g, fwd, opts) {
    const ig = !!(opts && opts.ignoreGateCrew);
    if (!fwd) return true; // volver atrás siempre se puede (salvo Monte Contracorriente, que es de un solo sentido)
    const L = Sim.leaderOf(u);
    if (!L) return false;
    if (u.faction === 'marine') {
      if (g.req === 'paradise') return true;
      if (g.req === 'sky') return L.rank >= 3;
      if (g.req === 'deep') return L.rank >= 3;
      if (g.req === 'newworld') return L.rank >= 5;
      return true;
    }
    if (g.req === 'paradise') return ig ? noCrew(Sim.paradiseCheck(u)) : allTrue(Sim.paradiseCheck(u));
    if (g.req === 'sky') return L.lvl >= Sim.REQ.skyLvl;
    if (g.req === 'deep') { const sh = Sim.SH(u.ship); return !!sh && sh.coated && L.lvl >= Sim.REQ.deepLvl && (ig || Sim.unitMembers(u).every((m) => m.lvl >= 20)); }
    if (g.req === 'newworld') return ig ? noCrew(Sim.nwCheck(u)) : allTrue(Sim.nwCheck(u));
    return true;
  };

  // ¿Se puede llegar desde donde está el barco hasta la isla? (rápido, por regiones)
  Sim.reachable = function (u, isl, opts) {
    const sh = Sim.SH(u.ship);
    if (!sh) return false;
    const prof = u.faction === 'marine' ? 'm' : 'p';
    const reg = prof === 'm' ? M().regM : M().regP;
    const target = I(isl);
    const rTo = reg[target.dock];
    let start = reg[Sim.tileIdx(sh.x, sh.y)];
    if (!start && sh.isl >= 0) start = reg[I(sh.isl).dock];
    if (!rTo || !start) return false;
    if (start === rTo) return true;
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const r = q.shift();
      for (const g of M().gates) {
        const gf = prof === 'm' ? g.regFromM : g.regFromP;
        const gt = prof === 'm' ? g.regToM : g.regToP;
        if (gf === r && !seen.has(gt) && Sim.gateAllowed(u, g, true, opts)) { if (gt === rTo) return true; seen.add(gt); q.push(gt); }
        if (!g.oneWay && gt === r && !seen.has(gf) && Sim.gateAllowed(u, g, false)) { if (gf === rTo) return true; seen.add(gf); q.push(gf); }
      }
    }
    return false;
  };

  // ¿Puede este grupo ir a esa isla? (peligro, zona, si está oculta...)
  Sim.islandAllowed = function (u, idx, opts) {
    opts = opts || {};
    const T = I(idx);
    const L = Sim.leaderOf(u);
    if (!L) return false;
    if (T.hidden && !(u.know.lt && T.id === 'laughtale')) return false;
    if (u.faction === 'pirate') {
      if (!opts.ignoreDanger && T.id !== 'laughtale') {
        const crewBonus = u.members.length >= 5 ? 1 : 0;
        if (T.danger > Sim.allowedDanger(L.lvl) + crewBonus) return false;
      }
      if (!opts.allowMarine && (T.hq || T.prison)) return false;
    } else {
      const lim = Sim.allowedDanger(L.lvl) + (L.rank >= 4 ? 1 : 0);
      if (!opts.ignoreDanger && T.danger > lim && !T.base) return false;
      if (!Sim.marineJurisdiction(u, T)) return false;
    }
    if (idx === u.isl) return true;
    return Sim.reachable(u, idx, opts);
  };
  Sim.marineJurisdiction = function (u, T) {
    const L = Sim.leaderOf(u);
    if (!L) return false;
    if (L.rank >= 8) return true;
    const baseSea = u.base >= 0 ? I(u.base).sea : T.sea;
    const kind = OP.SEAS[T.sea] ? OP.SEAS[T.sea].kind : 'gl';
    if (OP.SEAS[baseSea] && OP.SEAS[baseSea].kind === 'blue') return T.sea === baseSea || (L.rank >= 4 && kind !== 'blue' && T.sea === 'paradise');
    if (baseSea === 'newworld') return T.sea === 'newworld' || (T.sea === 'paradise' && T.base);
    // Mar Esmeralda / Cinturón Quieto
    return T.sea === 'paradise' || T.sea === 'calm' || T.sea === 'sky' || T.sea === 'deep' || (L.rank >= 5 && T.sea === 'newworld');
  };

  function approxDist(u, idx) {
    const sh = Sim.SH(u.ship);
    const x = sh ? sh.x : I(u.isl).dockX, y = sh ? sh.y : I(u.isl).dockY;
    const T = I(idx);
    let d = Math.hypot(T.dockX - x, T.dockY - y);
    const za = Sim.zoneOfPos(x, y), zb = T.sea;
    if (za !== zb) d += 120;
    if ((za === 'newworld') !== (zb === 'newworld')) d += 300;
    return d;
  }
  // Elige una isla según filtro y gusto, prefiriendo las cercanas
  Sim.pickIsland = function (u, filter, weight, opts) {
    const list = [];
    for (const T of M().islands) {
      if (!filter(T)) continue;
      if (!Sim.islandAllowed(u, T.idx, opts)) continue;
      let aff = 1;
      if (!opts || !opts.anyZone) {
        const here = Sim.unitZone(u);
        if (T.sea !== here) aff = here === 'newworld' ? 0.06 : 0.35;
        if (S().emperors.indexOf(u.id) >= 0 && T.sea !== 'newworld') aff = 0.01;
      }
      const w = (weight ? weight(T) : 1) * aff / (1 + approxDist(u, T.idx) / 140);
      if (w > 0) list.push([T, w]);
    }
    const r = R.weighted(list, (x) => x[1]);
    return r ? r[0] : null;
  };

  // ======================================================================
  //  VIAJES
  // ======================================================================
  function installRoute(sh, route, destIdx) {
    let ptotal = 0;
    for (const L of route.legs) { L.plen = L.type === 'gate' ? L.hours * 6 : L.len; ptotal += L.plen; }
    sh.route = { legs: route.legs, li: 0, pi: 0, dest: destIdx, pdone: 0, ptotal, t0: S().time, gates: route.gates };
  }
  // Si al llegar a un paso especial ya no cumple los requisitos, se desvía a la isla más cercana
  Sim.abortVoyage = function (sh) {
    const u = Sim.U(sh.unit);
    const prof = sh.faction === 'marine' ? 'm' : 'p';
    const list = M().islands.filter((T) => !T.hidden).map((T) => [T, Math.hypot(T.dockX - sh.x, T.dockY - sh.y)]).sort((a, b) => a[1] - b[1]);
    for (const [T] of list.slice(0, 8)) {
      const route = OP.Nav.planRoute({ prof, canGate: (g, f) => (u ? Sim.gateAllowed(u, g, f) : false), fromIdx: Sim.tileIdx(sh.x, sh.y), fromIsDock: false }, T);
      if (route && !route.gates.length) { installRoute(sh, route, T.idx); if (u && Sim.leaderOf(u)) Sim.log(Sim.leaderOf(u), 'Ya no cumplía los requisitos para seguir: se desvió a ' + T.name + '.'); return; }
    }
    sh.route = { legs: [], li: 0, pi: 0, dest: list[0][0].idx, pdone: 0, ptotal: 1 };
    Sim.arrive(sh);
  };
  Sim.startVoyage = function (u, destIdx) {
    const sh = Sim.SH(u.ship);
    if (!sh) return false;
    if (destIdx === u.isl) return false;
    const opts = {
      prof: u.faction === 'marine' ? 'm' : 'p',
      canGate: (g, fwd) => Sim.gateAllowed(u, g, fwd),
      fromIdx: Sim.tileIdx(sh.x, sh.y),
      fromIsDock: sh.isl >= 0
    };
    const route = OP.Nav.planRoute(opts, I(destIdx));
    if (!route) return false;
    installRoute(sh, route, destIdx);
    u.status = 'boarding';
    u.boardUntil = S().time + 3;
    for (const m of Sim.unitMembers(u)) if (m.loc === 'island') { m.act = 'board'; m.tx = null; m.wait = 0; }
    return true;
  };

  function depart(u) {
    const sh = Sim.SH(u.ship);
    if (!sh || !sh.route) { u.status = 'docked'; return; }
    for (const m of Sim.unitMembers(u).slice()) {
      if (m.loc !== 'island' || m.battle) continue;
      if (m.isl !== u.isl) {
        // se quedó en otra isla: sigue su camino en solitario
        Sim.removeMember(u, m, true);
        const nu = Sim.createUnit({ faction: u.faction, solo: u.faction === 'pirate', isl: m.isl, base: u.base });
        Sim.addMember(nu, m);
        Sim.createShip(u.faction === 'marine' ? 'marine' : 'bote', nu, m.isl);
        continue;
      }
      m.loc = 'ship'; m.act = 'sail';
    }
    if (!S().U[u.id]) return;
    // los que siguen peleando en tierra se quedan: el barco espera
    if (Sim.unitMembers(u).some((m) => m.loc === 'island')) { u.boardUntil = S().time + 1; return; }
    u.status = 'sailing';
    u.isl = -1;
    sh.state = 'sailing';
    sh.isl = -1;
    sh.x = sh.route.legs[0].pts[0][0];
    sh.y = sh.route.legs[0].pts[0][1];
  }

  Sim.arrive = function (sh) {
    const u = Sim.U(sh.unit);
    const dest = sh.route ? sh.route.dest : Sim.nearestIsland(sh.x, sh.y);
    sh.route = null; sh.state = 'docked'; sh.gate = null;
    sh.isl = dest; sh.x = I(dest).dockX; sh.y = I(dest).dockY;
    if (!u) return;
    u.status = 'docked'; u.isl = dest;
    const T = I(dest);
    const L = Sim.leaderOf(u);
    if (T.sea === 'paradise' || T.sea === 'sky' || T.sea === 'deep') {
      if (u.glVisited.indexOf(dest) < 0) u.glVisited.push(dest);
    }
    for (const m of Sim.unitMembers(u)) {
      if (m.loc !== 'ship') continue;
      const first = m.visited.indexOf(dest) < 0;
      Sim.placeOnIsland(m, dest, false);
      m.act = 'idle'; m.actUntil = 0;
      if (first) {
        Sim.gainXp(m, 12 * (OP.ZONE_MULT[T.sea] || 1));
        if (m.visited.length === 10) Sim.badge(m, 'explorer');
      }
    }
    // prisioneros a bordo: si es una prisión, se quedan aquí
    if (u.prisoners.length && T.base) Sim.deliverPrisoners(u, dest);
    D(dest).lastVisit = S().time;
    if (u.plan) {
      if (u.plan.dest === dest) { u.plan.phase = 'work'; u.plan.done = 0; Sim.onWorkStart(u); }
      else if (u.plan.final === dest) { u.plan.phase = 'work'; }
    }
    if (u.faction === 'pirate' && !u.solo && L && (u.fame > 150 || Sim.hasPlayer(u)) && R.chance(Sim.hasPlayer(u) ? 1 : 0.3)) {
      Sim.news('crew', 'Los ' + u.name + ' (capitán ' + L.name + ') han llegado a ' + T.name + '.', { a: [L.id], isl: dest });
    }
    S().reports[u.leader] = { isl: dest, t: S().time };
    for (const m of u.members) { const a = Sim.A(m); if (a && a.bounty > 0) S().reports[a.id] = { isl: dest, t: S().time }; }
  };

  Sim.onGateCrossed = function (sh, leg) {
    const u = Sim.U(sh.unit);
    if (!u) return;
    const st = S().stats;
    st.gateCross[leg.gate] = (st.gateCross[leg.gate] || 0) + 1;
    const L = Sim.leaderOf(u);
    if (!leg.fwd) return;
    // comprobación de seguridad (para las pruebas): ¿cumplía los requisitos?
    const g = M().gateById[leg.gate];
    if (u.faction === 'pirate' && g && !Sim.gateAllowed(u, g, true)) {
      st.violations.push({ t: S().time, unit: u.id, gate: leg.gate, lvl: L ? L.lvl : 0, chk: JSON.stringify(g.req === 'paradise' ? Sim.paradiseCheck(u) : g.req === 'newworld' ? Sim.nwCheck(u) : {}), mem: Sim.unitMembers(u).map((m) => m.lvl + ':' + m.loc).join(',') });
    }
    if (leg.kind === 'climb') {
      for (const m of Sim.unitMembers(u)) {
        if (!m.prog.gl) {
          m.prog.gl = true; m.prog.logpose = true;
          Sim.badge(m, 'grandline');
          Sim.moment(m, 'Cruzó Monte Contracorriente y entró en la Ruta Mayor', 28);
        }
      }
      if (u.faction === 'pirate' && L && (u.fame > 40 || Sim.hasPlayer(u) || R.chance(0.25))) {
        Sim.news('crew', Sim.who(u, true) + ' ' + Sim.v(u, 'ha cruzado', 'han cruzado') + ' Monte Contracorriente y ' + Sim.v(u, 'entra', 'entran') + ' en el Mar Esmeralda.', { a: [L.id], imp: 2 });
      }
    } else if (leg.kind === 'tunnel') {
      for (const m of Sim.unitMembers(u)) {
        if (!m.prog.nw) {
          m.prog.nw = true;
          Sim.badge(m, 'newworld');
          Sim.moment(m, 'Llegó al Mar Indómito', 40);
        }
      }
      if (u.faction === 'pirate' && L && (u.fame > 40 || Sim.hasPlayer(u) || R.chance(0.25))) {
        Sim.news('crew', Sim.who(u, true) + ' ' + Sim.v(u, 'ha llegado', 'han llegado') + ' al Mar Indómito. ¡Empieza lo difícil!', { a: [L.id], imp: 3 });
      }
    } else if (leg.kind === 'sky') {
      for (const m of Sim.unitMembers(u)) if (Sim.badge(m, 'sky')) Sim.moment(m, 'Subió al cielo con la corriente Ascendente', 26);
    } else if (leg.kind === 'dive') {
      for (const m of Sim.unitMembers(u)) if (Sim.badge(m, 'deep')) Sim.moment(m, 'Bajó 10.000 metros hasta la Isla Coralina', 24);
    }
  };

  // ======================================================================
  //  CADA HORA: PERSONAJES
  // ======================================================================
  function trainFactor(a) {
    const zone = Sim.agentZone(a);
    const cap = OP.ZONE_CAP[zone] || 22;
    if (a.lvl < cap) return 1;
    return Math.max(0.06, 1 - (a.lvl - cap) / 8);
  }
  function hasMedicHere(a) {
    const u = Sim.U(a.unit);
    if (!u) return false;
    for (const id of u.members) {
      const m = Sim.A(id);
      if (m && (m.talent === 'Médico' || m.role === 'médico') && m.loc === a.loc && (a.loc === 'ship' || m.isl === a.isl)) return true;
    }
    return false;
  }

  Sim.agentHour = function (a) {
    if (a.battle || a.carriedBy) return;
    const zone = Sim.agentZone(a);
    const zm = OP.ZONE_MULT[zone] || 1;
    const u = Sim.U(a.unit);
    // curación
    if (a.hp < a.maxHp) {
      let rate = a.loc === 'ship' ? 0.008 : 0.014;
      if (hasMedicHere(a)) rate *= 2;
      if (a.loc === 'island' && I(a.isl).hospital) rate *= 2;
      if (a.act === 'rest') rate *= 1.6;
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * rate);
    }
    if (a.loc === 'ship') {
      Sim.gainXp(a, 0.25 * zm * trainFactor(a));
      return;
    }
    if (a.act === 'board') return;
    // elegir actividad
    if (S().time >= a.actUntil || a.act === 'idle' || a.act === 'sail') {
      a.act = chooseActivity(a, u);
      a.actUntil = S().time + R.f(2, 6);
      a.tx = null;
    }
    const T = I(a.isl);
    switch (a.act) {
      case 'train': {
        let bonus = T.train ? T.train.bonus * (T.train.talent && T.train.talent === a.talent ? 1.25 : 1) : 1;
        if (u && u.plan && u.plan.type === 'train' && u.plan.phase === 'work') bonus *= 1.3;
        Sim.gainXp(a, 2.2 * zm * bonus * trainFactor(a));
        break;
      }
      case 'explore':
        Sim.gainXp(a, 0.9 * zm * trainFactor(a));
        Sim.exploreRoll(a, u, 1);
        break;
      case 'guard':
        Sim.gainXp(a, 0.8 * zm * trainFactor(a));
        break;
      case 'social':
        Sim.socialize(a);
        break;
      default:
        break;
    }
  };

  function chooseActivity(a, u) {
    const p = a.pers;
    const plan = u && u.plan;
    if (a.hp < a.maxHp * 0.45) return 'rest';
    if (u && u.garrison) return R.chance(0.45) ? 'guard' : R.chance(0.6) ? 'train' : 'social';
    if (plan && plan.phase === 'work') {
      if (plan.type === 'train') return R.chance(0.85) ? 'train' : 'social';
      if (['explore', 'treasure', 'poneglyph', 'road', 'fruit'].indexOf(plan.type) >= 0) return R.chance(0.75) ? 'explore' : 'train';
      if (plan.type === 'recruit') return R.chance(0.6) ? 'social' : 'train';
      if (plan.type === 'rest') return 'rest';
      if (plan.type === 'protect' || plan.type === 'war') return R.chance(0.6) ? 'guard' : 'train';
    }
    return R.weighted(['train', 'explore', 'social', 'rest'], (k) => ({ train: 1 + p.amb * 2, explore: 0.6 + p.cur * 2, social: 0.4 + p.soc * 2, rest: 0.4 }[k]));
  }

  // Exploración: tesoros, mapas, información, frutas
  Sim.exploreRoll = function (a, u, mult) {
    const idx = a.isl;
    const st = D(idx);
    const T = I(idx);
    const zm = OP.ZONE_MULT[T.sea] || 1;
    const smart = a.talent === 'Inteligente' ? 1.5 : 1;
    const luck = (0.6 + a.pers.cur) * smart * (mult || 1) * (a.name.indexOf(' D. ') > 0 ? 1.4 : 1);
    // el cuarto Monolito de Ruta está escondido: alguien tiene que encontrarlo
    if (T.id === S().road4 && !S().road4Found && u && (a.talent === 'Inteligente' || u.know.info >= 6) && R.chance(0.004 * luck)) {
      S().road4Found = true;
      Sim.gainXp(a, 300 * zm);
      Sim.moment(a, 'Descubrió el cuarto Monolito de Ruta escondido en ' + T.name, 60);
      Sim.news('poneglyph', '¡' + a.name + ' ha descubierto un cuarto Monolito de Ruta escondido en ' + T.name + '! Era el que faltaba para llegar a Isla Postrera.', { a: [a.id], isl: idx, imp: 4 });
    }
    if (st.fruit >= 0 && R.chance(0.0035 * luck * (u && u.plan && u.plan.type === 'fruit' ? 5 : 1))) {
      Sim.foundFruit(a, idx);
      return;
    }
    if (R.chance(0.012 * luck)) {
      const r = R.next();
      if (r < 0.4 && st.treasure) {
        const money = Math.round(R.f(0.3, 3) * 1e6 * zm * (1 + st.wealth));
        a.money += money; st.treasure = false;
        a.st.treasures++;
        Sim.gainXp(a, 25 * zm);
        Sim.log(a, 'Encontró un pequeño tesoro en ' + T.name + ': ' + OP.fmtB(money) + '.');
        if (money > 2e7) Sim.moment(a, 'Encontró un tesoro de ' + OP.fmtB(money) + ' en ' + T.name, 18);
      } else if (r < 0.7 && u) {
        // un mapa del tesoro hacia otra isla de la zona
        const dest = R.pick(M().islands.filter((x) => x.sea === T.sea && x.idx !== idx && !x.hidden && !x.base));
        if (dest && u.know.treasures.indexOf(dest.idx) < 0) {
          u.know.treasures.push(dest.idx);
          D(dest.idx).treasure = true;
          Sim.gainXp(a, 18 * zm);
          Sim.log(a, 'Encontró un mapa del tesoro que señala ' + dest.name + '.');
        }
      } else if (u) {
        if (st.info > 0) st.info--;
        u.know.info++;
        Sim.gainXp(a, 14 * zm);
        Sim.log(a, 'Consiguió información sobre la historia perdida en ' + T.name + '.');
        if (u.know.info === 10) {
          Sim.news('laughtale', 'Rumores: ' + a.name + ' anda preguntando por el Siglo Vacío y por Isla Postrera.', { a: [a.id], imp: 1 });
        }
      }
    }
  };

  Sim.foundFruit = function (a, idx) {
    const st = D(idx);
    const fr = S().fruits[st.fruit];
    const F = OP.FRUITS[fr.id];
    st.fruit = -1; st.fruitRumor = false;
    fr.state = 'found'; fr.isl = -1;
    Sim.gainXp(a, 50 * (OP.ZONE_MULT[I(idx).sea] || 1));
    Sim.moment(a, 'Encontró la ' + F.name + ' en ' + I(idx).name, 34);
    const u = Sim.U(a.unit);
    const L = u && Sim.leaderOf(u);
    let eater = null;
    if (a.fruit < 0 && R.next() < (a.pers.amb + a.pers.cou) / 2 + 0.15) eater = a;
    else if (L && L !== a && L.fruit < 0 && a.pers.loy > 0.5) { eater = L; Sim.rel(L, a, 25); Sim.log(a, 'Le entregó la fruta a su capitán.'); }
    if (eater) {
      Sim.eatFruit(eater, fr.id);
    } else {
      const price = Math.round(OP.RARITY_MULT[F.rarity] * R.f(20, 60) * 1e6 * (OP.ZONE_MULT[I(idx).sea] || 1) / 2);
      a.money += price;
      fr.state = 'hidden';
      const sab = byId('sabaody').idx;
      fr.isl = sab; D(sab).fruit = fr.id; D(sab).fruitRumor = true;
      Sim.log(a, 'Vendió la ' + F.name + ' por ' + OP.fmtB(price) + '.');
      Sim.news('fruit', a.name + ' ha vendido la ' + F.name + '. Dicen que acabará en las subastas de las Burbujas.', { a: [a.id], isl: sab });
    }
  };
  Sim.eatFruit = function (a, fid) {
    const fr = S().fruits[fid];
    const F = OP.FRUITS[fid];
    a.fruit = fid;
    fr.state = 'owned'; fr.owner = a.id; fr.isl = -1; fr.since = S().time;
    S().stats.fruitsEaten++;
    Sim.badge(a, 'fruit');
    Sim.moment(a, 'Comió la ' + F.name + ' (' + F.type + '). Ya nunca podrá nadar', 36);
    Sim.news('fruit', a.name + ' ha comido la ' + F.name + ' (' + F.type + ', ' + OP.RARITY[F.rarity] + '): ' + F.ability.toLowerCase() + '.', { a: [a.id], imp: F.rarity >= 3 ? 3 : 2 });
  };

  // Hablar con otros: amistades, enemistades, reclutamiento y alianzas
  Sim.socialize = function (a) {
    const occ = Sim.occupants(a.isl);
    if (occ.length < 2) return;
    const b = occ[Math.floor(R.next() * occ.length)];
    if (!b || b === a || b.battle || b.faction !== a.faction) return;
    const p = a.pers, q = b.pers;
    if (R.chance(0.12 * (p.agg + q.agg) * (1.2 - (p.soc + q.soc) / 2)) && a.unit !== b.unit) {
      Sim.rel(a, b, -R.f(4, 10)); Sim.rel(b, a, -R.f(4, 10));
      if ((a.rel[b.id] || 0) < -45 && a.faction === 'pirate' && R.chance(0.3)) {
        const ua = Sim.U(a.unit), ub = Sim.U(b.unit);
        if (ua && ub && ua.enemies.indexOf(ub.id) < 0) { ua.enemies.push(ub.id); }
      }
      return;
    }
    const gain = R.f(1, 4) * (0.5 + (p.soc + q.soc) / 2) * (a.talent === 'Diplomático' ? 1.5 : 1);
    Sim.rel(a, b, gain); Sim.rel(b, a, gain * 0.9);
    const ua = Sim.U(a.unit), ub = Sim.U(b.unit);
    if (!ua || !ub || ua === ub) return;
    if (a.faction !== 'pirate') return;
    // reclutar a un pirata solitario
    if (ua.leader === a.id && !ua.solo && ub.solo && ub.members.length === 1 && b.lvl <= a.lvl + 4 && ua.members.length < Sim.desiredSize(ua)) {
      const sh = Sim.SH(ua.ship);
      if (sh && ua.members.length < OP.SHIPS[sh.type].cap) {
        const chance = 0.18 + (a.talent === 'Diplomático' ? 0.2 : 0) + (a.rel[b.id] || 0) / 120 + Math.min(0.2, ua.fame / 500) - q.amb * 0.35;
        if (R.chance(chance)) Sim.joinCrew(b, ua);
      }
    }
    // dos solitarios forman una tripulación juntos
    if (ua.solo && ub.solo && (a.rel[b.id] || 0) > 22 && (b.rel[a.id] || 0) > 15 && Math.max(p.amb, q.amb) > 0.55 && R.chance(0.25)) {
      const cap = p.amb >= q.amb ? a : b, mate = cap === a ? b : a;
      if (cap.lvl >= 3) {
        Sim.foundCrew(Sim.U(cap.unit));
        Sim.joinCrew(mate, Sim.U(cap.unit));
      }
    }
    // alianzas entre capitanes
    if (ua.leader === a.id && ub.leader === b.id && !ua.solo && !ub.solo && (a.rel[b.id] || 0) > 40 && (b.rel[a.id] || 0) > 30 && ua.allies.indexOf(ub.id) < 0) {
      ua.allies.push(ub.id); ub.allies.push(ua.id);
      ua.enemies = ua.enemies.filter((x) => x !== ub.id); ub.enemies = ub.enemies.filter((x) => x !== ua.id);
      Sim.moment(a, 'Formó una alianza con ' + b.name, 20);
      Sim.moment(b, 'Formó una alianza con ' + a.name, 20);
      Sim.news('crew', 'Alianza pirata: los ' + ua.name + ' y los ' + ub.name + ' unen fuerzas.', { a: [a.id, b.id], isl: a.isl, imp: 2 });
    }
  };

  Sim.desiredSize = function (u) {
    const L = Sim.leaderOf(u);
    if (!L) return 1;
    const sh = Sim.SH(u.ship);
    const cap = sh ? OP.SHIPS[sh.type].cap : 4;
    const want = 3 + Math.floor(L.pers.amb * 5 + L.pers.soc * 3) + (S().emperors.indexOf(u.id) >= 0 ? 3 : 0);
    return Math.min(cap, want, 11);
  };

  Sim.joinCrew = function (a, u) {
    const old = Sim.U(a.unit);
    if (old === u) return;
    if (a.loc === 'island' && u.isl !== a.isl) return; // solo se une quien está en la misma isla
    if (u.status === 'boarding') a.act = 'board';
    if (old && old.solo) { Sim.removeMember(old, a, true); }
    else if (old) Sim.removeMember(old, a, false);
    Sim.addMember(u, a);
    const L = Sim.leaderOf(u);
    Sim.rel(a, L, 15); Sim.rel(L, a, 12);
    Sim.moment(a, 'Se unió a los ' + u.name + ' como ' + a.role, 18);
    if (a.loc === 'island' && u.isl !== a.isl && u.status === 'docked' && u.isl >= 0) Sim.placeOnIsland(a, u.isl, false);
    if (u.fame > 60 || a.isPlayer || (L && L.isPlayer)) {
      Sim.news('crew', a.name + ' se une a los ' + u.name + ' como ' + a.role + '.', { a: [a.id, u.leader], isl: a.isl });
    }
  };

  Sim.foundCrew = function (u) {
    if (!u.solo) return;
    const L = Sim.leaderOf(u);
    u.solo = false;
    u.name = Sim.genCrewName(L);
    L.role = 'capitán';
    S().stats.crews++;
    let sh = Sim.SH(u.ship);
    if (!sh || sh.type === 'bote') {
      const cost = OP.SHIPS.carabela.cost;
      let how;
      if (L.money >= cost) { L.money -= cost; how = 'compró'; }
      else if (L.talent === 'Ladrón' || L.pers.agg > 0.7) { how = 'robó'; Sim.raiseBounty(L, 3e6, 'robo de un barco'); }
      else { L.money = Math.max(0, L.money - cost / 2); how = 'consiguió'; }
      const at = u.isl >= 0 ? u.isl : L.isl;
      if (sh) Sim.removeShip(sh);
      sh = Sim.createShip('carabela', u, at);
      Sim.log(L, 'Se ' + (how === 'robó' ? 'hizo con' : 'compró') + ' la carabela "' + sh.name + '".');
    }
    Sim.badge(L, 'captain');
    Sim.moment(L, 'Fundó su propia tripulación: los ' + u.name, 30);
    if (Sim.hasPlayer(u) || R.chance(0.3)) Sim.news('crew', 'Nace una tripulación: los ' + u.name + ', capitaneados por ' + L.name + ', zarpan de ' + I(u.isl >= 0 ? u.isl : L.isl).name + '.', { a: [L.id], isl: u.isl, imp: 2 });
  };

  // ======================================================================
  //  CADA HORA: GRUPOS
  // ======================================================================
  Sim.unitHour = function (u) {
    if (!u.members.length) { Sim.disbandUnit(u); return; }
    let L = Sim.leaderOf(u);
    if (!L || L.loc === 'dead' || L.loc === 'prison') { Sim.chooseNewLeader(u, false); L = Sim.leaderOf(u); }
    if (!L) {
      if (!Sim.unitMembers(u).length) { if (!u.prisoners.length) Sim.disbandUnit(u); return; }
      return;
    }
    if (u.status === 'boarding') {
      const left = Sim.unitMembers(u).filter((m) => m.loc === 'island');
      if (!left.length || S().time >= u.boardUntil) depart(u);
      return;
    }
    if (u.status === 'sailing' && !u.prisoners.length && !u.members.some((id) => { const m = Sim.A(id); return m && m.loc === 'ship' && !m.carriedBy; })) {
      // barco fantasma: no queda nadie a bordo
      const sh = Sim.SH(u.ship);
      if (sh) Sim.removeShip(sh);
      u.ship = 0;
      const free = Sim.unitMembers(u);
      if (!free.length) { Sim.disbandUnit(u); return; }
      u.status = 'docked'; u.isl = free[0].isl; u.plan = null; u.nextThink = S().time + 1;
      return;
    }
    if (u.status !== 'docked') return;
    if (u.members.some((id) => (Sim.A(id) || {}).battle)) return;
    if (u.plan && u.plan.phase === 'work') {
      u.plan.done += 1;
      Sim.workHour(u);
      if (u.plan && u.plan.done >= u.plan.work) Sim.finishPlan(u);
      return;
    }
    if (u.plan && u.plan.phase === 'travel' && u.isl !== u.plan.dest) {
      // el viaje se interrumpió (combate, naufragio...): volver a intentarlo
      if (!Sim.startVoyage(u, u.plan.dest)) { Sim.abandonPlan(u, 'No pudo seguir el viaje'); }
      return;
    }
    if (!u.plan && S().time >= u.nextThink) Sim.think(u);
  };

  Sim.abandonPlan = function (u, why) {
    if (u.plan) {
      const L = Sim.leaderOf(u);
      if (L && why) Sim.log(L, why + ': ' + u.plan.title + '.');
    }
    u.plan = null;
    u.nextThink = S().time + R.f(1, 4);
  };

  Sim.setPlan = function (u, p) {
    p.phase = 'travel'; p.done = 0; p.started = S().time;
    u.plan = p;
    const L = Sim.leaderOf(u);
    if (L && p.mission) Sim.log(L, 'Nueva misión: ' + p.title + '.');
    if (p.dest === u.isl || p.dest == null || p.dest < 0) {
      p.dest = u.isl; p.phase = 'work'; Sim.onWorkStart(u);
      return true;
    }
    if (!Sim.startVoyage(u, p.dest)) { u.plan = null; u.nextThink = S().time + 2; return false; }
    return true;
  };

  Sim.think = function (u) {
    const L = Sim.leaderOf(u);
    if (!L) return;
    if (u.garrison || u.camp) { u.nextThink = S().time + 12; return; }   // camp: bandidos que no salen de su isla
    if (!u.ship || !Sim.SH(u.ship)) {
      // un grupo sin barco: intenta conseguir uno
      if (u.isl >= 0) Sim.createShip(u.faction === 'marine' ? 'marine' : (u.solo ? 'bote' : 'carabela'), u, u.isl);
      u.nextThink = S().time + 2;
      return;
    }
    const p = u.faction === 'marine' ? chooseMarinePlan(u) : choosePiratePlan(u);
    if (p && p.type === 'advance' && u.faction === 'pirate') Sim.dropWeak(u, OP.SEAS[I(u.isl).sea].kind === 'blue' ? 8 : 25);
    if (!p || !Sim.setPlan(u, p)) {
      u.nextThink = S().time + R.f(2, 6);
    }
  };

  // ---------------- Planes de los piratas ----------------
  function choosePiratePlan(u) {
    const L = Sim.leaderOf(u);
    const here = I(u.isl);
    const zone = here.sea;
    const sh = Sim.SH(u.ship);
    const ms = Sim.unitMembers(u);
    const p = L.pers;
    const kind = OP.SEAS[zone] ? OP.SEAS[zone].kind : 'gl';
    const isEmp = S().emperors.indexOf(u.id) >= 0;
    const money = ms.reduce((s, m) => s + m.money, 0);
    const cands = [];
    const add = (o) => { if (o && o.w > 0 && o.dest != null) cands.push(o); };
    const hpR = ms.reduce((s, m) => s + m.hp / m.maxHp, 0) / Math.max(1, ms.length);
    const zm = OP.ZONE_MULT[zone] || 1;

    if (u.know.lt && L.lvl >= 60) {
      const lt = byId('laughtale');
      if (Sim.islandAllowed(u, lt.idx)) return mk('laughtale', lt.idx, 'Navegar hacia Isla Postrera y encontrar el Tesoro Supremo', 30, 100, { xp: 2000 });
    }
    if (hpR < 0.65) {
      const T = Sim.pickIsland(u, (x) => x.hospital || x.idx === u.isl, (x) => (x.hospital ? 3 : 1)) || here;
      add(mk('rest', T.idx, 'Curar las heridas en ' + T.name, 10 + (1 - hpR) * 30, (1 - hpR) * 9));
    }
    if (sh && sh.hp < sh.maxHp * 0.7) {
      const T = Sim.pickIsland(u, (x) => x.shipyard || x.idx === u.isl || x.pop > 5000, (x) => (x.shipyard ? 4 : 1)) || here;
      add(mk('repair', T.idx, 'Reparar el barco en ' + T.name, T.shipyard ? 10 : 24, 1 + 6 * (1 - sh.hp / sh.maxHp)));
    }
    if (u.solo) {
      if (p.amb > 0.45 && L.lvl >= 4) add(mk('found', u.isl, 'Fundar su propia tripulación', 6, 1 + p.amb * 5));
      else if (L.lvl >= 3) add(mk('seekcrew', (Sim.pickIsland(u, (x) => x.pop > 2000) || here).idx, 'Buscar una tripulación a la que unirse', 18, 1.5 + p.soc * 2));
    }
    // mejorar el barco
    if (sh) {
      const next = OP.SHIP_ORDER[OP.SHIP_ORDER.indexOf(sh.type) + 1];
      if (next && !u.solo && money >= OP.SHIPS[next].cost * 1.1) {
        const T = next === 'legendario' ? (Sim.islandAllowed(u, byId('water7').idx) ? byId('water7') : null) : (here.pop > 3000 || here.shipyard ? here : Sim.pickIsland(u, (x) => x.pop > 3000 || x.shipyard));
        if (T) add(mk('buyship', T.idx, 'Comprar un ' + OP.SHIPS[next].name.toLowerCase() + ' en ' + T.name, 8, 3, { data: { type: next } }));
      }
    }
    if (kind === 'blue') {
      if (!Sim.hasLogpose(u) && L.lvl >= 8) {
        const T = Sim.pickIsland(u, (x) => x.logpose && x.sea === zone);
        if (T) add(mk('logpose', T.idx, 'Conseguir un Compás de Ruta en ' + T.name, 6, 1.5 + p.amb * 3));
      }
      const chk = Sim.paradiseCheck(u);
      if (noCrew(chk)) {
        const dreamB = L.dream === 'onepiece' || L.dream === 'aventura' ? 3 : 1;
        add(mk('advance', byId('twincapes').idx, 'Cruzar Monte Contracorriente hacia la Ruta Mayor', 4, 2 + p.amb * 5 + dreamB, { xp: 200 }));
      }
    }
    if (zone === 'paradise' || zone === 'deep' || zone === 'sky') {
      if (sh && !sh.coated && L.lvl >= Sim.REQ.deepLvl - 2 && u.glVisited.length >= 3) add(mk('coating', byId('sabaody').idx, 'Recubrir el barco en las Burbujas', 24, 2 + p.amb * 4));
      if (noCrew(Sim.nwCheck(u)) && L.lvl >= Sim.REQ.nwLvl + 2 && Sim.unitMembers(u).filter((m) => m.lvl >= 25).length >= Math.min(2, u.members.length)) {
        const T = Sim.pickIsland(u, (x) => x.sea === 'newworld' && !x.base && !x.hidden && x.danger <= Sim.allowedDanger(L.lvl), null, { anyZone: true, ignoreGateCrew: true });
        if (T) add(mk('advance', T.idx, 'Llegar al Mar Indómito: ' + T.name, 6, 4 + p.amb * 6 + (L.dream === 'onepiece' ? 4 : 1), { xp: 500 }));
      }
    }
    // entrenar
    {
      const T = Sim.pickIsland(u, (x) => !x.base || x.idx === u.isl, (x) => (x.train ? 4 * x.train.bonus * (x.train.talent === L.talent ? 1.5 : 1) : 0.5) * (x.sea === zone ? 1 : 0.5));
      if (T) add(mk('train', T.idx, T.train ? T.train.label + ' (' + T.name + ')' : 'Entrenar en ' + T.name, R.i(24, 60), 1.5 + p.amb * 2 + (L.lvl < 10 ? 1 : 0), { xp: Math.round(60 * zm * (T.train ? T.train.bonus : 1)) }));
    }
    // explorar islas nuevas
    {
      const T = Sim.pickIsland(u, (x) => L.visited.indexOf(x.idx) < 0 && !x.base, (x) => (x.sea === zone ? 2 : 1));
      if (T) add(mk('explore', T.idx, 'Explorar ' + T.name, R.i(10, 26), 1.2 + p.cur * 4 + (L.dream === 'aventura' ? 2.5 : 0), { xp: Math.round(40 * zm) }));
    }
    // tesoros
    if (u.know.treasures.length) {
      const ti = u.know.treasures.find((x) => Sim.islandAllowed(u, x));
      if (ti != null) add(mk('treasure', ti, 'Buscar el tesoro del mapa en ' + I(ti).name, 16, 3 + p.gre * 4 + (L.dream === 'dinero' ? 3 : 0), { money: Math.round(15e6 * zm) }));
    } else {
      const T = Sim.pickIsland(u, (x) => !x.base && x.idx !== u.isl, (x) => (D(x.idx).treasure ? 2 : 0.5));
      if (T) add(mk('treasure', T.idx, 'Buscar un mapa del tesoro en ' + T.name, 20, 0.6 + p.gre * 2 + (L.dream === 'dinero' ? 2 : 0), { money: Math.round(3e6 * zm) }));
    }
    // Monolitos
    if (zone !== 'newworld' && kind !== 'blue' && (L.dream === 'onepiece' || ms.some((m) => m.talent === 'Inteligente'))) {
      const T = Sim.pickIsland(u, (x) => x.poneglyph === 'historic' && (u.know.ponHist || []).indexOf(x.idx) < 0);
      if (T) add(mk('poneglyph', T.idx, 'Conseguir información del Monolito de ' + T.name, 24, 1.5 + (L.dream === 'onepiece' ? 3 : 0), { xp: Math.round(120 * zm) }));
    }
    if (zone === 'newworld') {
      const T = Sim.pickIsland(u, (x) => (x.poneglyph === 'road' || (x.id === S().road4 && S().road4Found)) && u.know.road.indexOf(x.idx) < 0, null, { ignoreDanger: isEmp });
      if (T) add(mk('road', T.idx, 'Copiar el Monolito de Ruta de ' + T.name, 24, (L.dream === 'onepiece' ? 3.5 : 0.4) + (ms.some((m) => m.talent === 'Inteligente') ? 1 : 0), { xp: Math.round(300 * zm) }));
    }
    // perseguir rivales
    for (const eid of u.enemies.slice(0, 4)) {
      const e = Sim.U(eid);
      if (!e) continue;
      const rep = S().reports[e.leader];
      if (!rep || rep.isl < 0 || S().time - rep.t > 24 * 8) continue;
      if (!Sim.islandAllowed(u, rep.isl)) continue;
      const ratio = Sim.unitPower(u) / Math.max(1, Sim.unitPower(e));
      if (ratio < 0.7) continue;
      add(mk('hunt', rep.isl, 'Derrotar a su rival ' + (Sim.A(e.leader) || {}).name, 8, 1 + p.agg * 4 + (L.revenge ? 6 : 0), { target: e.leader }));
    }
    if (L.revenge && Sim.A(L.revenge) && Sim.A(L.revenge).loc !== 'dead') {
      const rep = S().reports[L.revenge];
      if (rep && rep.isl >= 0 && Sim.islandAllowed(u, rep.isl, { allowMarine: true })) add(mk('hunt', rep.isl, 'Vengarse de ' + Sim.A(L.revenge).name, 8, 6, { target: L.revenge }));
    }
    // saquear
    if (p.agg > 0.4 && !u.solo) {
      const T = Sim.pickIsland(u, (x) => x.pop > 800 && !x.base && x.idx !== u.isl && D(x.idx).wealth > 0.25, (x) => D(x.idx).wealth);
      if (T) add(mk('plunder', T.idx, 'Saquear ' + T.name, 6, p.agg * p.gre * 5 + (L.dream === 'dinero' ? 1 : 0) + (L.dream === 'fama' ? 1 : 0) - p.hon * 2, { money: Math.round(8e6 * zm) }));
    }
    // asaltar una base de la Marina
    if (p.agg > 0.72 && !u.solo && ms.length >= 3) {
      const T = Sim.pickIsland(u, (x) => x.base && !x.hq && !x.prison && D(x.idx).baseHp > 0, null, { allowMarine: true });
      if (T && Sim.unitPower(u) > Sim.baseDefense(T.idx) * 1.4) add(mk('attackbase', T.idx, 'Asaltar la ' + T.base, 4, p.agg * 2 + (L.dream === 'fama' ? 1.5 : 0)));
    }
    // rumores de frutas
    {
      const T = Sim.pickIsland(u, (x) => D(x.idx).fruit >= 0 && D(x.idx).fruitRumor);
      if (T) add(mk('fruit', T.idx, 'Seguir el rumor de una Fruta Maldita en ' + T.name, 30, 1.5 + p.amb * 3 + p.cur));
    }
    // rescatar compañeros presos
    for (const mid of u.members) {
      const m = Sim.A(mid);
      if (!m || m.loc !== 'prison') continue;
      if (Sim.unitPower(u) < Sim.baseDefense(m.isl) * 0.8) continue;
      if (!Sim.islandAllowed(u, m.isl, { ignoreDanger: true, allowMarine: true })) continue;
      add(mk('rescue', m.isl, 'Rescatar a ' + m.name + ' de ' + I(m.isl).name, 6, 2 + p.loy * 6, { target: m.id }));
    }
    // reclutar
    if (!u.solo && u.members.length < Sim.desiredSize(u)) {
      const T = here.pop > 500 ? here : Sim.pickIsland(u, (x) => x.pop > 1500 && !x.base);
      if (T) add(mk('recruit', T.idx, 'Reclutar tripulantes en ' + T.name, R.i(12, 24), 2.5 + p.soc * 2));
    }
    // los Emperadores pasan tiempo en su territorio
    if (isEmp && u.home != null && u.home >= 0) {
      add(mk('idle', u.home, 'Vigilar su territorio en ' + I(u.home).name, R.i(24, 72), 9));
    }
    add(mk('idle', u.isl, 'Descansar en ' + here.name, R.i(4, 10), 0.6));
    const pick = R.weighted(cands, (c) => c.w);
    return pick;
  }

  function mk(type, dest, title, work, w, extra) {
    const o = { type, dest, title, work: Math.max(1, Math.round(work)), w, mission: type !== 'idle' };
    if (extra) {
      if (extra.target) o.target = extra.target;
      if (extra.data) o.data = extra.data;
      o.reward = {};
      if (extra.xp) o.reward.xp = extra.xp;
      if (extra.money) o.reward.money = extra.money;
    }
    return o;
  }

  // ---------------- Planes de la Marina ----------------
  function chooseMarinePlan(u) {
    const L = Sim.leaderOf(u);
    const ms = Sim.unitMembers(u);
    const sh = Sim.SH(u.ship);
    const p = L.pers;
    const hpR = ms.reduce((s, m) => s + m.hp / m.maxHp, 0) / Math.max(1, ms.length);
    if (u.prisoners.length) {
      const dest = Sim.prisonFor(u);
      if (dest != null && dest !== u.isl) return mk('prison', dest, 'Trasladar presos a ' + I(dest).name, 2, 1);
      if (dest === u.isl) { Sim.deliverPrisoners(u, u.isl); }
    }
    if (u.assigned) {
      const a = u.assigned; u.assigned = null;
      if (a.dest === u.isl || Sim.islandAllowed(u, a.dest, { ignoreDanger: true, allowMarine: true })) return a;
    }
    if (u.joinBase != null && u.joinBase >= 0) {
      return mk('joinbase', u.joinBase, 'Presentarse en ' + I(u.joinBase).base, 1, 1);
    }
    if (u.transferTo != null && u.transferTo >= 0) {
      const t = u.transferTo; u.transferTo = -1;
      return mk('transfer', t, 'Traslado a ' + I(t).base, 4, 1);
    }
    const cands = [];
    const add = (o) => { if (o && o.w > 0 && o.dest != null) cands.push(o); };
    const zm = OP.ZONE_MULT[I(u.isl).sea] || 1;
    if (hpR < 0.6) add(mk('rest', u.base >= 0 ? u.base : u.isl, 'Recuperarse en ' + I(u.base >= 0 ? u.base : u.isl).name, 12 + (1 - hpR) * 30, 6));
    if (sh && sh.hp < sh.maxHp * 0.65) add(mk('repair', u.base >= 0 ? u.base : u.isl, 'Reparar el buque en la base', 12, 5));
    // capturar piratas buscados
    const power = Sim.unitPower(u);
    const targets = [];
    for (const id in S().reports) {
      const a = Sim.A(+id);
      if (!a || a.faction !== 'pirate' || a.bounty <= 0 || a.loc === 'dead' || a.loc === 'prison') continue;
      const rep = S().reports[id];
      if (rep.isl < 0 || S().time - rep.t > 24 * 6) continue;
      const au = Sim.U(a.unit);
      const ep = au ? Sim.unitPower(au) : Sim.effPower(a);
      if (ep > power * (a.bounty >= 1e9 ? 0.9 : 1.4)) continue;
      if (!Sim.islandAllowed(u, rep.isl, { allowMarine: true })) continue;
      targets.push([a, rep.isl, a.bounty / 1e6 + 5]);
    }
    const tg = R.weighted(targets, (x) => x[2] / (1 + approxDist(u, x[1]) / 150));
    if (tg) add(mk('capture', tg[1], 'Capturar al pirata ' + tg[0].name + ' (' + OP.fmtBShort(tg[0].bounty) + ')', 10, 3 + (L.dream === 'justicia' ? 3 : 1) + p.agg * 2, { target: tg[0].id, xp: Math.round(80 * zm) }));
    // proteger ciudades atacadas
    {
      const T = Sim.pickIsland(u, (x) => S().time - D(x.idx).attackedAt < 24 * 5 && x.pop > 100);
      if (T) add(mk('protect', T.idx, 'Proteger ' + T.name + ' de los piratas', 36, 3 + (L.dream === 'proteger' ? 4 : 1)));
    }
    // patrullar
    {
      const T = Sim.pickIsland(u, (x) => x.idx !== u.isl && x.pop > 50 && !x.hidden, (x) => (x.base ? 0.4 : 1) + x.pop / 1e6);
      if (T) add(mk('patrol', T.idx, 'Patrullar hasta ' + T.name, R.i(4, 10), 3, { xp: Math.round(25 * zm) }));
    }
    // escoltar
    {
      const T = Sim.pickIsland(u, (x) => x.pop > 3000 && x.idx !== u.isl);
      if (T) add(mk('escort', T.idx, 'Escoltar un barco de suministros hasta ' + T.name, 3, 1.2, { money: 1e6 }));
    }
    // investigar poneglyphs (órdenes del Gobierno Mundial)
    if (L.rank >= 4) {
      const T = Sim.pickIsland(u, (x) => x.poneglyph === 'historic' || x.lore);
      if (T) add(mk('investigate', T.idx, 'Vigilar el Monolito de ' + T.name + ' por orden del Gobierno', 18, 0.7));
    }
    if (u.base >= 0) {
      add(mk('train', u.base, 'Entrenar a los reclutas en ' + I(u.base).base, 24, 1.5 + (L.dream === 'poder' ? 3 : 0)));
      if (u.isl !== u.base) add(mk('return', u.base, 'Volver a ' + I(u.base).base, 4, 2.5));
    }
    return R.weighted(cands, (c) => c.w);
  }

  // ======================================================================
  //  TRABAJO DE LAS MISIONES
  // ======================================================================
  Sim.onWorkStart = function (u) {
    const p = u.plan;
    if (!p) return;
    const L = Sim.leaderOf(u);
    if (p.type === 'advance' || p.type === 'laughtale') {
      // llegar ya es la misión
    }
    if (p.type === 'joinbase') {
      const g = Sim.garrisonOf(u.isl);
      if (g) {
        for (const m of Sim.unitMembers(u).slice()) { Sim.removeMember(u, m, true); Sim.addMember(g, m); m.role = 'soldado'; }
        return;
      }
    }
    if (p.type === 'transfer') {
      u.base = u.isl;
      if (L) Sim.log(L, 'Trasladado a ' + I(u.isl).base + '.');
    }
    void L;
  };

  Sim.workHour = function (u) {
    const p = u.plan;
    if (!p) return;
    const T = I(u.isl);
    const st = D(u.isl);
    if (p.type === 'recruit' && R.chance(0.12 + (Sim.unitMembers(u).some((m) => m.talent === 'Diplomático') ? 0.08 : 0))) {
      if (u.members.length < Sim.desiredSize(u) && st.pop > 50 && (S()._free || 0) < (OP.NPC_MAX || 330)) {
        const zoneLvl = { paradise: [12, 26], newworld: [30, 55], sky: [15, 25], deep: [18, 30] }[T.sea] || [1, 6];
        const L = Sim.leaderOf(u);
        const lvl = Math.min(R.i(zoneLvl[0], zoneLvl[1]), L.lvl + 2);
        const a = Sim.createAgent({ faction: 'pirate', isl: u.isl, lvl });
        Sim.addMember(u, a);
        st.pop = Math.max(0, st.pop - 1);
        Sim.log(a, 'Se unió a los ' + u.name + ' en ' + T.name + '.');
        Sim.moment(a, 'Dejó ' + T.name + ' para unirse a los ' + u.name, 16);
        if (u.fame > 60 || L.isPlayer) Sim.news('crew', a.name + ' se une a los ' + u.name + ' como ' + a.role + ' en ' + T.name + '.', { a: [a.id, L.id], isl: u.isl });
      }
    }
    if (p.type === 'seekcrew' && R.chance(0.15)) {
      const L = Sim.leaderOf(u);
      const crews = Sim.occupants(u.isl).map((x) => Sim.U(x.unit)).filter((x) => x && x.faction === 'pirate' && !x.solo && x !== u && x.members.length < Sim.desiredSize(x));
      if (crews.length) Sim.joinCrew(L, R.pick(crews));
    }
    if (p.type === 'plunder' && p.done === 2) {
      // el saqueo empieza: la gente lo ve
      st.attackedAt = S().time;
    }
    if (p.type === 'protect' || p.type === 'war') {
      for (const m of Sim.unitMembers(u)) if (m.loc === 'island') m.merit += 0.05;
    }
  };

  Sim.finishPlan = function (u) {
    const p = u.plan;
    u.plan = null;
    u.nextThink = S().time + R.f(1, 5);
    if (!p) return;
    const L = Sim.leaderOf(u);
    if (!L) return;
    const T = I(u.isl);
    const st = D(u.isl);
    const ms = Sim.unitMembers(u).filter((m) => m.loc === 'island');
    const zm = OP.ZONE_MULT[T.sea] || 1;
    const stats = S().stats;
    stats.missions[p.type] = (stats.missions[p.type] || 0) + 1;
    const rewardXp = (x) => { for (const m of ms) Sim.gainXp(m, x); };
    const count = () => { for (const m of ms) m.st.missions++; };
    switch (p.type) {
      case 'repair': {
        const sh = Sim.SH(u.ship);
        if (sh) {
          const cost = Math.round((sh.maxHp - sh.hp) * 20000 * (T.shipyard ? 1.5 : 1));
          L.money = Math.max(0, L.money - cost);
          sh.hp = T.shipyard ? sh.maxHp : Math.min(sh.maxHp, sh.hp + sh.maxHp * 0.6);
        }
        break;
      }
      case 'found': Sim.foundCrew(u); break;
      case 'buyship': {
        const sh = Sim.SH(u.ship);
        const type = p.data && p.data.type;
        if (sh && type) {
          let cost = OP.SHIPS[type].cost;
          for (const m of ms) { const pay = Math.min(m.money, cost); m.money -= pay; cost -= pay; }
          const coated = false;
          Sim.removeShip(sh);
          const ns = Sim.createShip(type, u, u.isl);
          ns.coated = coated;
          Sim.moment(L, 'Compró un ' + OP.SHIPS[type].name.toLowerCase() + ': "' + ns.name + '"', 18);
          if (type === 'legendario' || type === 'galeon') Sim.news('crew', 'Los ' + u.name + ' estrenan barco en ' + T.name + ': el ' + OP.SHIPS[type].name.toLowerCase() + ' "' + ns.name + '".', { a: [L.id], isl: u.isl });
        }
        break;
      }
      case 'logpose':
        for (const m of ms) { m.prog.logpose = true; m.money = Math.max(0, m.money - 50000); }
        Sim.log(L, 'Consiguió un Compás de Ruta en ' + T.name + '. La Ruta Mayor le espera.');
        break;
      case 'advance':
        count(); rewardXp(40 * zm);
        break;
      case 'coating': {
        const sh = Sim.SH(u.ship);
        if (sh) { sh.coated = true; L.money = Math.max(0, L.money - 2e6); }
        Sim.log(L, 'El barco ya está recubierto: puede bajar a la Isla Coralina.');
        break;
      }
      case 'train':
        count(); rewardXp((p.reward && p.reward.xp) || 50);
        if (T.train) for (const m of ms) if (Sim.badge(m, 'train_' + T.id)) Sim.moment(m, 'Completó el entrenamiento: ' + T.train.label, 15 + T.danger * 2);
        break;
      case 'explore': {
        count(); rewardXp(30 * zm);
        const trait = R.pick(T.traits);
        Sim.log(L, 'Exploró ' + T.name + ': ' + trait.toLowerCase() + '.');
        for (const m of ms) Sim.exploreRoll(m, u, 6);
        break;
      }
      case 'treasure': {
        count();
        const ki = u.know.treasures.indexOf(u.isl);
        if (ki >= 0) {
          u.know.treasures.splice(ki, 1);
          if (R.chance(0.7)) {
            const money = Math.round(R.f(4, 30) * 1e6 * zm);
            L.money += money; L.st.treasures++;
            st.treasure = false;
            rewardXp(60 * zm);
            Sim.moment(L, 'Desenterró un tesoro de ' + OP.fmtB(money) + ' en ' + T.name, 22 + Math.min(20, money / 1e7));
            if (money >= 1e8 || Sim.hasPlayer(u)) Sim.news('world', Sim.who(u, true) + ' ' + Sim.v(u, 'ha', 'han') + ' desenterrado un tesoro de ' + OP.fmtB(money) + ' en ' + T.name + '.', { a: [L.id], isl: u.isl });
          } else Sim.log(L, 'El mapa del tesoro de ' + T.name + ' era falso.');
        } else {
          for (const m of ms) Sim.exploreRoll(m, u, 8);
          rewardXp(20 * zm);
        }
        break;
      }
      case 'poneglyph': {
        count(); rewardXp(110 * zm);
        u.know.ponHist = u.know.ponHist || [];
        if (u.know.ponHist.indexOf(u.isl) < 0) u.know.ponHist.push(u.isl);
        u.know.info += 2;
        for (const m of ms) if (Sim.badge(m, 'poneglyph')) Sim.moment(m, 'Vio con sus propios ojos el Monolito de ' + T.name, 32);
        if (u.fame > 30 || L.bounty >= 5e7 || L.isPlayer) Sim.news('poneglyph', Sim.who(u, true) + ' ' + Sim.v(u, 'ha llegado', 'han llegado') + ' al Monolito de ' + T.name + '. El Gobierno Mundial está inquieto.', { a: [L.id], isl: u.isl, imp: 2 });
        break;
      }
      case 'road': Sim.tryCopyRoad(u, ms); break;
      case 'laughtale': Sim.foundOnePiece(u, ms); break;
      case 'plunder': {
        if (!ms.length) break;
        const loot = Math.round(st.wealth * Math.log10(st.pop + 10) * 2e6 * zm * R.f(0.6, 1.4));
        L.money += Math.round(loot * 0.5);
        for (const m of ms) if (m !== L) m.money += Math.round(loot * 0.5 / Math.max(1, ms.length - 1));
        st.wealth = Math.max(0.05, st.wealth - 0.3);
        st.pop = Math.max(0, Math.round(st.pop * 0.98));
        st.attackedAt = S().time;
        count(); rewardXp(30 * zm);
        for (const m of ms) Sim.raiseBounty(m, (m === L ? 6e6 : 2e6) * zm * R.f(0.6, 1.4), 'ataque a ' + T.name);
        Sim.news('attack', Sim.who(u, true) + ' ' + Sim.v(u, 'ha saqueado ', 'han saqueado ') + T.name + ' y se ' + Sim.v(u, 'lleva ', 'llevan ') + '' + OP.fmtB(loot) + '.', { a: [L.id], isl: u.isl, imp: 2 });
        Sim.moment(L, 'Saqueó ' + T.name, 14);
        S().reports[L.id] = { isl: u.isl, t: S().time };
        break;
      }
      case 'fruit':
        // antes casi seguro (0,35-0,65 por miembro): las tripulaciones NPC se llevaban todas las frutas antes que los jugadores
        for (const m of ms) { if (D(u.isl).fruit < 0) break; if (R.chance(0.06 + m.pers.cur * 0.06)) { Sim.foundFruit(m, u.isl); break; } }
        count();
        break;
      case 'seekcrew': if (u.solo && L.pers.amb > 0.35 && R.chance(0.3)) Sim.foundCrew(u); break;
      // Marina
      case 'capture': count(); if (L) Sim.log(L, 'La búsqueda terminó en ' + T.name + '.'); break;
      case 'protect':
        count(); rewardXp(40 * zm);
        for (const m of ms) m.merit += 6;
        Sim.log(L, 'Protegió ' + T.name + '.');
        break;
      case 'patrol': count(); rewardXp(20 * zm); for (const m of ms) m.merit += 2; break;
      case 'escort': count(); rewardXp(15 * zm); for (const m of ms) { m.merit += 3; m.money += 300000; } break;
      case 'investigate': count(); rewardXp(30 * zm); for (const m of ms) m.merit += 4; break;
      case 'war': break;
      default: break;
    }
    if (p.type === 'train' && u.faction === 'marine') {
      const g = Sim.garrisonOf(u.isl);
      if (g) for (const m of Sim.unitMembers(g)) Sim.gainXp(m, 25 * zm);
    }
    if (p.mission && ['idle', 'rest', 'repair', 'return'].indexOf(p.type) < 0 && L) Sim.log(L, 'Misión terminada: ' + p.title + '.');
  };

  Sim.tryCopyRoad = function (u, ms) {
    const L = Sim.leaderOf(u);
    const T = I(u.isl);
    const g = Sim.U(D(u.isl).guardian);
    let ok = true;
    if (g && g !== u && u.allies.indexOf(g.id) < 0) {
      const sneak = 0.12 + (ms.some((m) => m.talent === 'Ladrón') ? 0.2 : 0) + (ms.some((m) => m.talent === 'Inteligente') ? 0.05 : 0);
      ok = R.chance(sneak);
      if (!ok) {
        Sim.log(L, 'Los guardianes de ' + T.name + ' les descubrieron intentando copiar el Monolito.');
        if (u.enemies.indexOf(g.id) < 0) u.enemies.push(g.id);
        if (g.enemies.indexOf(u.id) < 0) g.enemies.push(u.id);
        Sim.startIslandBattle(u.isl, g, u, 'guard');
        return;
      }
    }
    if (u.know.road.indexOf(u.isl) >= 0) return;
    const canRead = ms.some((m) => (m.talent === 'Inteligente' && m.lvl >= 30) || m.role === 'arqueólogo');
    if (!canRead) { Sim.log(L, 'Nadie a bordo sabe leer el Monolito de Ruta de ' + T.name + '. Hace falta un arqueólogo.'); return; }
    if (!R.chance(0.5)) { Sim.log(L, 'No consiguieron copiar el Monolito de Ruta de ' + T.name + ' esta vez.'); return; }
    u.know.road.push(u.isl);
    for (const m of ms) { Sim.gainXp(m, 250 * 5); if (Sim.badge(m, 'road')) Sim.moment(m, 'Copió el Monolito de Ruta de ' + T.name, 50); }
    for (const m of ms) Sim.raiseBounty(m, (m === L ? 8e7 : 2e7), 'Monolito de Ruta');
    Sim.news('poneglyph', Sim.who(u, true) + ' ' + Sim.v(u, 'ha copiado', 'han copiado') + ' el Monolito de Ruta de ' + T.name + '. ' + Sim.v(u, 'Ya tiene ', 'Ya tienen ') + '' + u.know.road.length + ' de 4.', { a: [L.id], isl: u.isl, imp: 3 });
    if (u.know.road.length >= 4) {
      const reader = u.know.info >= 16 ? ms.find((m) => (m.talent === 'Inteligente' && m.lvl >= 50) || (m.role === 'arqueólogo' && m.lvl >= 50)) : null;
      if (reader) {
        u.know.lt = true;
        D(byId('laughtale').idx).discovered = true;
        Sim.moment(reader, 'Descifró los 4 Monolitos de Ruta: ¡Isla Postrera existe!', 80);
        Sim.news('laughtale', '¡' + Sim.who(u, true) + ' ' + Sim.v(u, 'ha descifrado', 'han descifrado') + ' la ruta hacia Isla Postrera! El mundo entero contiene la respiración.', { a: [L.id, reader.id], imp: 4 });
      } else {
        Sim.news('laughtale', Sim.who(u, true) + ' ' + Sim.v(u, 'tiene', 'tienen') + ' los 4 Monolitos de Ruta, pero nadie a bordo sabe leerlos.', { a: [L.id], imp: 3 });
      }
    }
  };

  Sim.foundOnePiece = function (u, ms) {
    const L = Sim.leaderOf(u);
    // El título de Rey de los Mares es solo para jugadores: un NPC puede encontrar el tesoro, pero no ser coronado
    if (!L || S().onePieceFound) return;
    S().onePieceFound = L.id;
    for (const m of ms) { Sim.gainXp(m, 5000); Sim.badge(m, 'onepiece'); Sim.moment(m, 'Encontró el Tesoro Supremo en Isla Postrera', 100); m.money += 5e8; }
    Sim.raiseBounty(L, 3e9, 'encontró el Tesoro Supremo', true);
    L.dream = 'aventura';
    L.quote = '¡El Tesoro Supremo existe! Ahora el mar entero es nuestro hogar.';
    Sim.news('laughtale', '¡¡' + L.name + ' ha encontrado el ONE PIECE en Isla Postrera!! Pero el trono del Rey de los Mares sigue esperando a alguien digno.', { a: [L.id], imp: 5 });
    u.know.lt = false;
  };

  // ======================================================================
  //  MARINA: bases, guarniciones, ascensos
  // ======================================================================
  Sim.garrisonOf = function (idx) {
    const id = D(idx).garrison;
    const g = id && Sim.U(id);
    if (g) return g;
    if (!I(idx).base) return null;
    const u = Sim.createUnit({ faction: 'marine', garrison: true, isl: idx, base: idx, name: 'Guarnición de ' + I(idx).base });
    u.ship = 0;
    D(idx).garrison = u.id;
    return u;
  };
  Sim.baseDefense = function (idx) {
    const g = Sim.garrisonOf(idx);
    let p = 0;
    if (g) for (const m of Sim.unitMembers(g)) if (m.loc === 'island' && m.isl === idx) p += Sim.effPower(m);
    for (const a of Sim.occupants(idx)) if (a.faction === 'marine' && (!g || a.unit !== g.id)) p += Sim.effPower(a);
    p += Math.sqrt(g ? g.grunts : 0) * (OP.ZONE_GRUNT[I(idx).sea] || 2) * 3;
    return p;
  };
  Sim.prisonFor = function (u) {
    let maxB = 0;
    for (const pid of u.prisoners) { const p = Sim.A(pid); if (p) maxB = Math.max(maxB, p.bounty); }
    const L = Sim.leaderOf(u);
    if (maxB >= 8e7 || (L && L.rank >= 6 && maxB >= 3e7)) {
      const id = byId('impeldown').idx;
      if (u.isl === id || Sim.reachable(u, id)) return id;
    }
    if (u.base >= 0) return u.base;
    const T = Sim.pickIsland(u, (x) => x.base && !x.hq, null, { ignoreDanger: true, allowMarine: true });
    return T ? T.idx : null;
  };
  Sim.deliverPrisoners = function (u, idx) {
    const T = I(idx);
    for (const pid of u.prisoners.slice()) {
      const p = Sim.A(pid);
      if (!p) continue;
      if (p.bounty >= 1.5e9 && !S().execution && S().time - (S().lastExecution || -9999) > 24 * 60 && T.id !== 'marineford' && !p.isPlayer) {
        S().lastExecution = S().time;
        // gran pirata: ejecución pública en Bastión Central
        Sim.scheduleExecution(p);
        p.loc = 'prison'; p.isl = byId('marineford').idx; p.carriedBy = 0;
      } else {
        p.loc = 'prison'; p.isl = idx; p.carriedBy = 0;
        p.prisonUntil = T.prison ? (p.bounty >= 1e9 ? 0 : S().time + 24 * R.i(50, 110)) : S().time + 24 * (p.bounty < 2e7 ? R.i(5, 12) : R.i(10, 30));
        if (T.prison && Sim.badge(p, 'impeldown')) Sim.moment(p, 'Fue encerrado en Prisión Abismo', 20);
        Sim.log(p, 'Encerrado en ' + T.name + '.');
        if (p.bounty >= 2e8 || p.isPlayer) Sim.news('capture', p.name + ' (' + OP.fmtB(p.bounty) + ') ha sido encerrado en ' + T.name + '.', { a: [p.id], isl: idx, imp: 2 });
      }
    }
    u.prisoners = [];
    const L = Sim.leaderOf(u);
    if (L) for (const m of Sim.unitMembers(u)) m.merit += 4;
    void L;
  };

  Sim.scheduleExecution = function (p) {
    const mf = byId('marineford').idx;
    S().execution = { agent: p.id, isl: mf, t: S().time + 24 * 7, rescuers: [] };
    Sim.news('world', '¡La Marina anuncia la ejecución pública de ' + p.name + ' (' + OP.fmtB(p.bounty) + ') en Bastión Central dentro de 7 días!', { a: [p.id], isl: mf, imp: 4 });
    // la Marina llama a sus oficiales
    for (const u of S().units) {
      if (u.faction !== 'marine' || u.garrison || !u.ship) continue;
      const L = Sim.leaderOf(u);
      if (!L || L.rank < 5) continue;
      if (!Sim.reachable(u, mf) && u.isl !== mf) continue;
      u.assigned = mk('war', mf, 'Defender Bastión Central en la gran ejecución', 24 * 8, 1);
      if (!u.plan || u.plan.type !== 'prison') { u.plan = null; u.nextThink = S().time; }
    }
    // los amigos del preso preparan el rescate
    const pu = Sim.U(p.unit);
    for (const u of S().units) {
      if (u.faction !== 'pirate' || !u.ship) continue;
      const L = Sim.leaderOf(u);
      if (!L) continue;
      const friend = (L.rel[p.id] || 0) >= 35 || u === pu || (pu && u.allies.indexOf(pu.id) >= 0);
      if (!friend) continue;
      if (!Sim.islandAllowed(u, mf, { ignoreDanger: true, allowMarine: true })) continue;
      u.plan = null;
      Sim.setPlan(u, mk('rescue', mf, 'Rescatar a ' + p.name + ' de la ejecución en Bastión Central', 24 * 8, 1, { target: p.id }));
      S().execution.rescuers.push(u.id);
      Sim.news('world', Sim.who(u, true) + ' ' + Sim.v(u, 'zarpa', 'zarpan') + ' hacia Bastión Central para salvar a ' + p.name + '.', { a: [L.id, p.id], imp: 3 });
    }
  };

  Sim.eventsHour = function () {
    const ex = S().execution;
    if (!ex) return;
    const p = Sim.A(ex.agent);
    if (!p || p.loc !== 'prison') { S().execution = null; return; }
    if (S().time < ex.t) return;
    // ¡llega la hora!
    const occ = Sim.occupants(ex.isl);
    const pirates = occ.filter((a) => a.faction === 'pirate' && !a.battle);
    if (pirates.length) {
      Sim.news('world', '¡Estalla la guerra en Bastión Central! Piratas y Marina chocan para decidir el destino de ' + p.name + '.', { a: [p.id], isl: ex.isl, imp: 5 });
      Sim.startWar(ex.isl, p);
      ex.t = S().time + 1e9; // la guerra decide
    } else {
      Sim.kill(p, 'ejecutado en Bastión Central', null);
      Sim.news('death', p.name + ' ha sido ejecutado en Bastión Central. Nadie vino a salvarle.', { a: [p.id], isl: ex.isl, imp: 4 });
      S().execution = null;
      for (const u of S().units) if (u.plan && u.plan.type === 'war') u.plan.work = u.plan.done + 2;
    }
  };

  Sim.prisonHour = function (a) {
    if (a.prisonUntil && S().time >= a.prisonUntil) Sim.freePrisoner(a, 'Cumplió su condena');
  };
  Sim.freePrisoner = function (a, why) {
    let idx = a.isl;
    const zs = I(idx).sea, kind = OP.SEAS[zs] ? OP.SEAS[zs].kind : 'gl';
    if (a.faction === 'pirate' && ((kind !== 'blue' && !a.prog.gl) || (zs === 'newworld' && !a.prog.nw))) {
      idx = a.home;
      why += ' y lo devolvieron a su isla natal';
    }
    if (a.faction === 'pirate' && !I(idx).dockRegP) {
      // desde el Cinturón Quieto no se puede navegar: lo dejan en la isla del Mar Esmeralda más cercana
      let best = idx, bd = Infinity;
      for (const T of M().islands) {
        if (!T.dockRegP || T.hidden || T.base || T.sea !== 'paradise') continue;
        const d = Math.hypot(T.x - I(idx).x, T.y - I(idx).y);
        if (d < bd) { bd = d; best = T.idx; }
      }
      idx = best;
    }
    a.prisonUntil = 0;
    a.loc = 'island';
    Sim.placeOnIsland(a, idx, false);
    a.hp = Math.max(a.hp, a.maxHp * 0.5);
    a.act = 'idle';
    let u = Sim.U(a.unit);
    if (!u) {
      u = Sim.createUnit({ faction: 'pirate', solo: true, isl: idx });
      Sim.addMember(u, a);
      Sim.createShip('bote', u, idx);
    } else if (u.isl !== idx || u.status !== 'docked') {
      // su tripulación no está aquí: se busca la vida solo
      Sim.removeMember(u, a, true);
      const nu = Sim.createUnit({ faction: 'pirate', solo: true, isl: idx });
      Sim.addMember(nu, a);
      Sim.createShip('bote', nu, idx);
    }
    Sim.log(a, why + ' y salió de ' + I(idx).name + '.');
  };

  // Ascensos de la Marina
  function promotions() {
    const admirals = S().agents.filter((a) => a.faction === 'marine' && a.rank === 8 && a.loc !== 'dead' && a.loc !== 'retired').length;
    const fleet = S().agents.filter((a) => a.faction === 'marine' && a.rank === 9 && a.loc !== 'dead' && a.loc !== 'retired').length;
    let adm = admirals;
    for (const a of S().agents) {
      if (a.faction !== 'marine' || (a.loc !== 'island' && a.loc !== 'ship')) continue;
      const next = a.rank + 1;
      if (next > 9) continue;
      if (a.merit < OP.RANK_MERIT[next] || a.lvl < OP.RANK_LEVEL[next]) continue;
      if (next === 8 && adm >= 3) continue;
      if (next === 9 && (fleet >= 1 || a.rank !== 8)) continue;
      if (next >= 4 && next <= 7 && S().agents.filter((x) => x.faction === 'marine' && x.rank === next && (x.loc === 'island' || x.loc === 'ship' || x.loc === 'prison')).length >= OP.RANK_SLOTS[next]) continue;
      a.rank = next;
      if (next === 8) adm++;
      S().stats.promotions++;
      Sim.moment(a, 'Ascendió a ' + OP.RANKS[next], 10 + next * 6);
      if (next >= 4) {
        Sim.badge(a, 'rank' + next);
        Sim.news('marine', a.name + ' asciende a ' + OP.RANKS[next] + ' de la Marina.', { a: [a.id], imp: next >= 7 ? 3 : 2 });
      }
      if (next >= 6 && !a.epithet && R.chance(0.6)) a.epithet = Sim.genEpithet(a);
      const u = Sim.U(a.unit);
      if (u && !u.garrison && u.leader === a.id) Sim.chooseNewLeaderName(u);
      // traslados hacia la Ruta Mayor
      if (u && next >= 4 && OP.SEAS[I(u.base >= 0 ? u.base : a.isl).sea].kind === 'blue' && R.chance(0.15)) {
        const dest = byId(R.pick(['navarone', 'marineford'])).idx;
        if (u.garrison) Sim.makeSquad(u, a, dest);
        else if (u.leader === a.id) u.transferTo = dest;
      } else if (u && next === 7 && I(u.base >= 0 ? u.base : a.isl).sea === 'paradise' && R.chance(0.3)) {
        const dest = byId('g5').idx;
        if (u.garrison) Sim.makeSquad(u, a, dest);
        else if (u.leader === a.id) u.transferTo = dest;
      }
    }
  }
  Sim.chooseNewLeaderName = function (u) {
    const L = Sim.leaderOf(u);
    if (L && !u.garrison) u.name = 'Unidad ' + (L.rank >= 3 ? 'del ' + OP.RANKS[L.rank] + ' ' : 'de ') + L.name.split(' ')[0];
  };
  // Forma una unidad con barco a partir de la guarnición
  Sim.makeSquad = function (g, leaderA, transferTo) {
    const idx = g.base;
    const u = Sim.createUnit({ faction: 'marine', isl: idx, base: idx });
    Sim.removeMember(g, leaderA, true);
    if (!S().U[g.id]) { D(idx).garrison = 0; }
    Sim.addMember(u, leaderA);
    leaderA.role = 'comandante';
    const pool = Sim.unitMembers(g).filter((m) => m.id !== leaderA.id && m.loc === 'island');
    const n = Math.min(pool.length - 2, R.i(2, 4));
    for (let k = 0; k < n; k++) { const m = pool[k]; Sim.removeMember(g, m, true); Sim.addMember(u, m); }
    Sim.createShip(leaderA.rank >= 8 ? 'almirante' : 'marine', u, idx);
    u.grunts = R.i(10, 30) * (leaderA.rank + 1);
    Sim.chooseNewLeaderName(u);
    if (transferTo != null) u.transferTo = transferTo;
    return u;
  };

  function manageBases() {
    for (const T of M().islands) {
      if (!T.base) continue;
      const st = D(T.idx);
      if (st.baseHp <= 0) {
        st.destroyedFor = (st.destroyedFor || 0) + 1;
        if (st.destroyedFor > 30) { st.baseHp = st.baseMax * 0.5; st.destroyedFor = 0; Sim.news('marine', 'La Marina ha reconstruido la ' + T.base + '.', { isl: T.idx }); }
        continue;
      }
      st.baseHp = Math.min(st.baseMax, st.baseHp + st.baseMax * 0.02);
      const g = Sim.garrisonOf(T.idx);
      const kind = OP.SEAS[T.sea] ? OP.SEAS[T.sea].kind : 'gl';
      const target = T.hq ? 9 : T.prison ? 5 : kind === 'blue' ? 6 : 7;
      const size = Sim.unitMembers(g).length;
      if (size < target && R.chance(0.35) && ((S()._marines || 0) < 170 || size < 3)) {
        const lv = T.sea === 'newworld' ? [26, 40] : kind === 'blue' ? [1, 3] : [10, 20];
        const rank = kind === 'blue' ? 0 : T.sea === 'newworld' ? 2 : 1;
        const a = Sim.createAgent({ faction: 'marine', isl: T.idx, lvl: R.i(lv[0], lv[1]), rank });
        Sim.addMember(g, a, 'soldado');
        a.role = 'soldado';
      }
      g.grunts = Math.max(g.grunts, kind === 'blue' ? 40 : T.hq ? 800 : 200);
      // completar las unidades que están en la base (y mandar al jugador al mar)
      const homeSq = S().units.filter((u) => u.faction === 'marine' && !u.garrison && u.base === T.idx && u.isl === T.idx && u.status === 'docked' && S().U[u.id]);
      for (const sq of homeSq) {
        let guard = 0;
        while (sq.members.length < 5 && guard++ < 6) {
          const pool = Sim.unitMembers(g).filter((m) => m.loc === 'island' && m.isl === T.idx && m.id !== g.leader && !m.battle).sort((p, q) => (q.isPlayer ? 1000 : q.lvl) - (p.isPlayer ? 1000 : p.lvl));
          if (!pool.length || (Sim.unitMembers(g).length <= 3 && !pool[0].isPlayer)) break;
          const m = pool[0];
          Sim.removeMember(g, m, true); Sim.addMember(sq, m);
          if (m.isPlayer) Sim.moment(m, 'Le destinaron a la ' + sq.name, 12);
          if (!S().U[g.id]) break;
        }
      }
      if (S().U[g.id]) {
        const pl = Sim.unitMembers(g).find((m) => m.isPlayer && m.loc === 'island' && m.isl === T.idx);
        if (pl && pl.rank >= 2) Sim.makeSquad(g, pl);
      }
      if (!S().U[g.id]) continue;
      // formar unidades nuevas
      const squads = S().units.filter((u) => u.faction === 'marine' && !u.garrison && u.base === T.idx).length;
      const maxSq = T.hq ? 6 : T.prison ? 1 : kind === 'blue' ? 2 : 3;
      if (squads < maxSq && size >= 4) {
        const off = Sim.unitMembers(g).filter((m) => m.rank >= 2 && m.loc === 'island').sort((p, q) => q.rank - p.rank)[0];
        if (off && R.chance(0.4)) Sim.makeSquad(g, off);
      }
    }
  }

  // ======================================================================
  //  CADA DÍA
  // ======================================================================
  Sim.dailyWorld = function () {
    const s = S();
    const day = Math.floor(s.time / 24);
    s._free = s.agents.filter((a) => a.loc === 'island' || a.loc === 'ship').length;
    s._marines = s.agents.filter((a) => a.faction === 'marine' && (a.loc === 'island' || a.loc === 'ship')).length;
    // sueldo de la Marina
    for (const a of s.agents) if (a.faction === 'marine' && (a.loc === 'island' || a.loc === 'ship')) a.money += 3000 * (a.rank + 1) * (a.rank + 1);
    Sim.enforceBountyCaps();
    promotions();
    manageBases();
    spawns();
    fruits();
    if (day % 5 === 0) Sim.updateEmperors();
    // las islas se recuperan
    M().islands.forEach((T, i) => {
      const st = s.isl[i];
      st.wealth = Math.min(1, st.wealth + 0.01);
      if (st.pop < T.pop) st.pop = Math.min(T.pop, Math.round(st.pop * 1.004 + 1));
      if (!st.treasure && R.chance(0.02)) st.treasure = true;
      if (st.info < 3 && (T.poneglyph || T.lore) && R.chance(0.05)) st.info++;
    });
    // fugas
    for (const a of s.agents) {
      if (a.loc !== 'prison') continue;
      if (s.execution && s.execution.agent === a.id) continue;
      const T = I(a.isl);
      let ch = T.prison ? 0.0008 : 0.012;
      if (a.talent === 'Ladrón') ch *= 3;
      if (a.isPlayer) ch = T.prison ? 0.04 : 0.12;
      if (R.chance(ch)) {
        Sim.freePrisoner(a, 'Se fugó');
        a.st.escapes++;
        Sim.raiseBounty(a, Math.max(5e6, a.bounty * 0.12), 'fuga de ' + T.name);
        Sim.moment(a, 'Se fugó de ' + T.name, T.prison ? 60 : 25);
        if (T.prison) Sim.badge(a, 'escape_id');
        if (T.prison || a.bounty >= 5e7 || a.isPlayer) Sim.news('capture', '¡' + a.name + ' se ha fugado de ' + T.name + '!', { a: [a.id], isl: a.isl, imp: T.prison ? 4 : 2 });
      }
    }
    // las cárceles no se llenan sin fin
    const pris = s.agents.filter((a) => a.loc === 'prison' && !(s.execution && s.execution.agent === a.id));
    if (pris.length > 110) {
      pris.sort((p, q) => p.bounty - q.bounty);
      for (const a of pris.slice(0, pris.length - 110)) Sim.freePrisoner(a, 'Lo soltaron porque la cárcel estaba llena');
    }
    // cada año, todos cumplen años
    if (day % 360 === 0 && day > 0) {
      for (const a of s.agents) {
        if (a.loc === 'dead' || a.loc === 'retired') continue;
        a.age++;
        if (a.age > 68 && R.chance((a.age - 68) * 0.02)) {
          if (a.loc === 'prison' || R.chance(0.5)) Sim.kill(a, 'de viejo', null);
          else Sim.retire(a, 'Se retiró después de una larga vida en el mar');
        }
      }
    }
    // cambios de vida
    for (const a of s.agents) {
      if (a.loc !== 'island' && a.loc !== 'ship') continue;
      Sim.lifeChanges(a);
    }
    cleanup();
  };

  function spawns() {
    const s = S();
    const alive = s.agents.filter((a) => a.loc === 'island' || a.loc === 'ship');
    const pirZone = {};
    for (const a of alive) if (a.faction === 'pirate' && !a.bandit && !a.pcCrew) { const z = Sim.agentZone(a); pirZone[z] = (pirZone[z] || 0) + 1; }
    // tope de población: por encima no nace casi nadie (solo si una zona se queda casi vacía)
    const live = Sim.liveNpcs().length, MAX = OP.NPC_MAX || 330;
    if (live >= MAX) {
      if ((pirZone.paradise || 0) < 6 && R.chance(0.3)) Sim.spawnCrew('twincapes', [14, 20], [10, 16], R.i(2, 3), 'carabela', 'han cruzado Monte Contracorriente y llegan al Mar Esmeralda');
      if ((pirZone.newworld || 0) < 12 && R.chance(0.3)) Sim.spawnCrew(R.pick(['punkhazard', 'dressrosa', 'zou']), [38, 52], [28, 44], R.i(2, 4), R.pick(['bergantin', 'galeon']), 'han llegado al Mar Indómito');
      return;
    }
    // el Mar Esmeralda y el Mar Indómito nunca se quedan vacíos
    if ((pirZone.paradise || 0) < 14 && R.chance(0.35)) Sim.spawnCrew('twincapes', [14, 20], [10, 16], R.i(2, 4), 'carabela', 'han cruzado Monte Contracorriente y llegan al Mar Esmeralda');
    if ((pirZone.newworld || 0) < 30 && R.chance(0.5)) Sim.spawnCrew(R.pick(['punkhazard', 'dressrosa', 'zou']), [38, 52], [28, 44], R.i(3, 6), R.pick(['bergantin', 'galeon']), 'han llegado al Mar Indómito');
    const full = live > MAX * 0.85;
    for (const sea of OP.BLUES) {
      if ((pirZone[sea] || 0) < (full ? 12 : 24) && R.chance(0.6)) {
        const T = R.pick(M().islands.filter((x) => x.sea === sea && !x.base));
        const a = Sim.createAgent({ faction: 'pirate', isl: T.idx, lvl: R.i(1, 4) });
        const u = Sim.createUnit({ faction: 'pirate', solo: true, isl: T.idx });
        Sim.addMember(u, a);
        Sim.createShip('bote', u, T.idx);
        if (R.chance(0.35)) Sim.news('pirate', 'Un nuevo pirata zarpa de ' + T.name + ': ' + a.name + ' sueña con ' + OP.DREAMS_PIRATE[a.dream].toLowerCase() + '.', { a: [a.id], isl: T.idx });
      }
    }
    if ((pirZone.paradise || 0) < 22 && R.chance(0.3)) Sim.spawnCrew('twincapes', [14, 20], [10, 16], R.i(2, 4), 'carabela', 'han cruzado Monte Contracorriente y llegan al Mar Esmeralda');
  }

  Sim.spawnCrew = function (islId, capLv, memLv, n, shipType, verb) {
    const T = byId(islId);
    const cap = Sim.createAgent({ faction: 'pirate', isl: T.idx, lvl: R.i(capLv[0], capLv[1]) });
    cap.pers.amb = Math.max(cap.pers.amb, 0.5);
    const u = Sim.createUnit({ faction: 'pirate', isl: T.idx });
    Sim.addMember(u, cap);
    u.name = Sim.genCrewName(cap);
    cap.role = 'capitán';
    for (let k = 0; k < n; k++) Sim.addMember(u, Sim.createAgent({ faction: 'pirate', isl: T.idx, lvl: R.i(memLv[0], memLv[1]) }));
    const sh = Sim.createShip(shipType, u, T.idx);
    if (T.sea === 'newworld') sh.coated = true;
    for (const m of Sim.unitMembers(u)) {
      m.prog.gl = true; m.prog.logpose = true;
      if (T.sea === 'newworld') m.prog.nw = true;
      const zm = T.sea === 'newworld' ? 4 : 1.2;
      if (R.chance(0.6)) m.bounty = Math.round(m.lvl * m.lvl * 0.25 * zm * R.f(0.5, 1.5)) * 1e6;
      m.st.maxBounty = m.bounty;
      if (m.bounty) S().reports[m.id] = { isl: T.idx, t: S().time };
    }
    if (T.sea === 'newworld') u.glVisited = M().islands.filter((x) => x.sea === 'paradise').slice(0, 6).map((x) => x.idx);
    for (const m of Sim.unitMembers(u)) Sim.capBounty(m);
    S().stats.crews++;
    Sim.news('crew', 'Los ' + u.name + ' (capitán ' + cap.name + (cap.bounty ? ', ' + OP.fmtBShort(cap.bounty) : '') + ') ' + verb + '.', { a: [cap.id], isl: T.idx, imp: 2 });
    return u;
  };

  function fruits() {
    const s = S();
    // muy escasas: como mucho 2 escondidas en todo el mundo y una nueva solo de vez en cuando
    const hidden = s.fruits.filter((f) => f.state === 'hidden').length;
    if (hidden < (OP.FRUIT_MAX_HIDDEN || 2) && R.chance(OP.FRUIT_SPAWN_CHANCE || 0.04)) {
      const pool = s.fruits.filter((f) => f.state === 'none');
      if (!pool.length) return;
      const fr = R.weighted(pool, (f) => 5 - OP.FRUITS[f.id].rarity);
      const T = R.weighted(M().islands.filter((x) => !x.hidden && !x.base), (x) => ({ paradise: 3, newworld: 3, sky: 2, deep: 2, calm: 1 }[x.sea] || 1.2));
      fr.state = 'hidden'; fr.isl = T.idx; fr.since = s.time;
      s.isl[T.idx].fruit = fr.id;
      if (R.chance(0.65)) {
        s.isl[T.idx].fruitRumor = true;
        Sim.news('fruit', 'Rumores en las tabernas: ha aparecido una Fruta Maldita en ' + T.name + '.', { isl: T.idx, imp: 2 });
      }
    }
  }

  Sim.updateEmperors = function () {
    const s = S();
    const cands = s.units.filter((u) => u.faction === 'pirate' && !u.solo && Sim.leaderOf(u) && Sim.unitZone(u) === 'newworld');
    cands.sort((a, b) => Sim.unitBounty(b) - Sim.unitBounty(a));
    const top = cands.slice(0, 4).map((u) => u.id);
    for (const id of top) {
      if (s.emperors.indexOf(id) < 0) {
        const u = Sim.U(id); const L = Sim.leaderOf(u);
        if (Sim.badge(L, 'emperor')) Sim.moment(L, 'Fue reconocido como uno de los Cuatro Emperadores', 75);
        if (s.time > 30) Sim.news('world', L.name + ' y los ' + u.name + ' son reconocidos como uno de los Cuatro Emperadores del Mar.', { a: [L.id], imp: 4 });
        if (u.home == null || u.home < 0) u.home = u.isl;
      }
    }
    s.emperors = top;
    for (const id of top) {
      const u = Sim.U(id);
      if (u.home != null && u.home >= 0) s.isl[u.home].guardian = u.id;
    }
  };

  Sim.retire = function (a, why) {
    const u = Sim.U(a.unit);
    if (u) Sim.removeMember(u, a, false);
    a.loc = 'retired';
    Sim.log(a, why + '.');
    if (a.bounty >= 1e8 || a.rank >= 6) Sim.news('world', a.name + ' se retira. ' + why + '.', { a: [a.id] });
  };

  // Lo vivido cambia los sueños
  Sim.lifeChanges = function (a) {
    const u = Sim.U(a.unit);
    if (a.faction === 'pirate') {
      if (a.dream === 'dinero' && a.money > 3e8 && R.chance(0.05)) {
        a.dream = R.pick(['fama', 'aventura', 'onepiece']);
        a.quote = R.pick(OP.QUOTES[a.dream]);
        Sim.moment(a, 'Ya es rico. Ahora su sueño es ' + OP.DREAMS_PIRATE[a.dream].toLowerCase(), 15);
      }
      if (a.dream === 'fama' && a.bounty > 1e9 && R.chance(0.03)) {
        a.dream = 'onepiece';
        a.quote = R.pick(OP.QUOTES.onepiece);
        Sim.moment(a, 'Su fama ya es mundial. Ahora va a por el Tesoro Supremo', 20);
      }
      // dejar la tripulación por peleas internas
      if (u && !u.solo && u.leader !== a.id) {
        const L = Sim.leaderOf(u);
        if (L && (a.rel[L.id] || 0) < -35 && a.pers.loy < 0.5 && R.chance(0.15) && u.isl >= 0) {
          Sim.removeMember(u, a, false);
          const nu = Sim.createUnit({ faction: 'pirate', solo: true, isl: u.isl });
          Sim.addMember(nu, a);
          Sim.createShip('bote', nu, u.isl);
          Sim.moment(a, 'Abandonó a los ' + u.name + ' tras discutir con ' + L.name, 16);
          if (u.fame > 20) Sim.news('crew', a.name + ' abandona a los ' + u.name + ' tras pelearse con su capitán.', { a: [a.id, L.id] });
        }
      }
    } else {
      // deserción
      if (a.pers.hon < 0.2 && a.pers.gre > 0.75 && a.rank < 7 && R.chance(0.0015) && a.loc === 'island') {
        if (u) Sim.removeMember(u, a, false);
        a.faction = 'pirate';
        { const z = Sim.agentZone(a); if (OP.SEAS[z] && OP.SEAS[z].kind !== 'blue') { a.prog.gl = true; a.prog.logpose = true; } if (z === 'newworld') a.prog.nw = true; }
        a.dream = R.pick(['dinero', 'fama']);
        a.quote = 'La justicia de la Marina es una mentira. Ahora vivo a mi manera.';
        const nu = Sim.createUnit({ faction: 'pirate', solo: true, isl: a.isl });
        Sim.addMember(nu, a);
        Sim.createShip('bote', nu, a.isl);
        Sim.raiseBounty(a, OP.RANK_VALUE[a.rank] * 3e6 + 5e6, 'desertor de la Marina');
        Sim.moment(a, 'Desertó de la Marina y se hizo pirata', 40);
        Sim.news('marine', 'Escándalo: el ' + OP.RANKS[a.rank].toLowerCase() + ' ' + a.name + ' deserta de la Marina y se hace pirata.', { a: [a.id], imp: 3 });
        a.rank = 0;
      }
    }
  };

  function cleanup() {
    const s = S();
    const keep = [];
    for (const a of s.agents) {
      if ((a.loc === 'dead' || a.loc === 'retired') && !a.isPlayer) {
        const age = s.time - (a.deathT || a.born);
        const important = a.bounty >= 1e8 || a.rank >= 6 || s.pirateKing === a.id;
        if (age > 24 * (important ? 400 : 90)) { delete s.A[a.id]; delete s.reports[a.id]; continue; }
      }
      keep.push(a);
    }
    s.agents = keep;
    for (const id in s.reports) if (!s.A[id]) delete s.reports[id];
  }

  // ======================================================================
  //  POBLAR EL MUNDO AL EMPEZAR
  // ======================================================================
  Sim.populate = function () {
    const s = S();
    // --- Marina ---
    const marineBase = (islId, cmdRank, cmdLv, squads, squadSpec, garrisonN, garrisonLv) => {
      const T = byId(islId);
      const g = Sim.garrisonOf(T.idx);
      const cmd = Sim.createAgent({ faction: 'marine', isl: T.idx, lvl: R.i(cmdLv[0], cmdLv[1]), rank: cmdRank });
      Sim.addMember(g, cmd); cmd.role = 'comandante de la base';
      for (let k = 0; k < garrisonN; k++) {
        const lv = R.i(garrisonLv[0], garrisonLv[1]);
        const a = Sim.createAgent({ faction: 'marine', isl: T.idx, lvl: lv, rank: rankForLevel(lv, cmdRank - 1) });
        Sim.addMember(g, a); a.role = 'soldado';
      }
      for (let k = 0; k < squads; k++) {
        const sp = squadSpec[k % squadSpec.length];
        const u = Sim.createUnit({ faction: 'marine', isl: T.idx, base: T.idx });
        const L = Sim.createAgent({ faction: 'marine', isl: T.idx, lvl: R.i(sp.lv[0], sp.lv[1]), rank: sp.rank });
        Sim.addMember(u, L);
        for (let j = 0; j < sp.n; j++) {
          const lv = R.i(sp.mlv[0], sp.mlv[1]);
          Sim.addMember(u, Sim.createAgent({ faction: 'marine', isl: T.idx, lvl: lv, rank: rankForLevel(lv, sp.rank - 1) }));
        }
        Sim.createShip(sp.rank >= 8 ? 'almirante' : 'marine', u, T.idx);
        u.grunts = R.i(10, 30) * (sp.rank + 1);
        Sim.chooseNewLeaderName(u);
      }
      g.grunts = OP.SEAS[T.sea] && OP.SEAS[T.sea].kind === 'blue' ? 40 : 300;
    };
    const blueSquads = [{ rank: 3, lv: [12, 16], n: 3, mlv: [3, 9] }, { rank: 2, lv: [8, 12], n: 2, mlv: [2, 7] }];
    marineBase('shells', 4, [17, 20], 1, blueSquads, 4, [1, 6]);
    marineBase('logue', 5, [24, 28], 2, blueSquads, 4, [2, 8]);
    marineBase('rubeck', 4, [18, 21], 2, blueSquads, 4, [1, 6]);
    marineBase('toroa', 4, [18, 21], 2, blueSquads, 4, [1, 6]);
    marineBase('centaurea', 4, [18, 21], 2, blueSquads, 4, [1, 6]);
    marineBase('navarone', 5, [30, 34], 2, [{ rank: 4, lv: [20, 26], n: 3, mlv: [12, 20] }], 4, [10, 18]);
    marineBase('enieslobby', 6, [40, 46], 1, [{ rank: 5, lv: [28, 34], n: 3, mlv: [18, 26] }], 4, [16, 26]);
    marineBase('impeldown', 7, [62, 70], 0, [], 4, [20, 32]);
    marineBase('marineford', 9, [93, 96], 6, [
      { rank: 8, lv: [86, 90], n: 2, mlv: [40, 55] }, { rank: 8, lv: [85, 89], n: 2, mlv: [40, 55] }, { rank: 8, lv: [84, 88], n: 2, mlv: [40, 55] },
      { rank: 7, lv: [50, 58], n: 3, mlv: [26, 38] }, { rank: 7, lv: [48, 56], n: 3, mlv: [26, 38] }, { rank: 6, lv: [38, 44], n: 3, mlv: [20, 32] }
    ], 5, [18, 30]);
    marineBase('g5', 7, [52, 60], 2, [{ rank: 6, lv: [38, 46], n: 3, mlv: [28, 38] }, { rank: 5, lv: [32, 38], n: 3, mlv: [26, 34] }], 4, [26, 36]);
    // los almirantes tienen frutas legendarias
    const logias = ['pika', 'magu', 'hie', 'goro', 'yami'];
    const admirals = s.agents.filter((a) => a.rank >= 8);
    admirals.forEach((a, k) => {
      const f = OP.FRUIT_BY_KEY[logias[k]];
      if (f && a.rank === 8) giveFruit(a, f.id);
      a.haki = [true, true, a.conq];
      if (!a.epithet) a.epithet = Sim.genEpithet(a);
    });

    // --- Piratas de los cuatro mares ---
    for (const sea of OP.BLUES) {
      const isl = M().islands.filter((x) => x.sea === sea && !x.base);
      for (let k = 0; k < 4; k++) {
        const T = R.pick(isl);
        const cap = Sim.createAgent({ faction: 'pirate', isl: T.idx, lvl: R.i(5, 12) });
        cap.pers.amb = Math.max(cap.pers.amb, 0.45);
        const u = Sim.createUnit({ faction: 'pirate', isl: T.idx });
        Sim.addMember(u, cap);
        u.name = Sim.genCrewName(cap); cap.role = 'capitán';
        const n = R.i(1, 4);
        for (let j = 0; j < n; j++) Sim.addMember(u, Sim.createAgent({ faction: 'pirate', isl: T.idx, lvl: R.i(2, Math.max(3, cap.lvl - 1)) }));
        Sim.createShip('carabela', u, T.idx);
        for (const m of Sim.unitMembers(m0(u))) {
          if (m.lvl >= 6 && R.chance(0.55)) { m.bounty = Math.round(m.lvl * m.lvl * 0.2 * R.f(0.6, 1.4)) * 1e6; m.st.maxBounty = m.bounty; s.reports[m.id] = { isl: T.idx, t: 0 }; }
        }
        if (cap.lvl >= 10 && R.chance(0.5)) cap.prog.logpose = true;
        s.stats.crews++;
      }
      for (let k = 0; k < 8; k++) {
        const T = R.pick(isl);
        const a = Sim.createAgent({ faction: 'pirate', isl: T.idx, lvl: R.i(1, 6) });
        const u = Sim.createUnit({ faction: 'pirate', solo: true, isl: T.idx });
        Sim.addMember(u, a);
        Sim.createShip('bote', u, T.idx);
      }
    }
    // --- Mar Esmeralda ---
    const para = M().islands.filter((x) => x.sea === 'paradise' && !x.base && x.danger <= 6);
    for (let k = 0; k < 7; k++) {
      const T = R.pick(para);
      const u = Sim.spawnCrewQuiet(T, [18, 40], [12, 32], R.i(2, 5), R.pick(['bergantin', 'bergantin', 'galeon']));
      if (Sim.leaderOf(u).lvl >= 30 && R.chance(0.5)) Sim.SH(u.ship).coated = true;
    }
    for (let k = 0; k < 6; k++) {
      const T = R.pick(para);
      const a = Sim.createAgent({ faction: 'pirate', isl: T.idx, lvl: R.i(14, 26) });
      const u = Sim.createUnit({ faction: 'pirate', solo: true, isl: T.idx });
      Sim.addMember(u, a);
      Sim.createShip('carabela', u, T.idx);
      a.prog.gl = true; a.prog.logpose = true;
      if (R.chance(0.5)) { a.bounty = Math.round(a.lvl * a.lvl * 0.3) * 1e6; a.st.maxBounty = a.bounty; s.reports[a.id] = { isl: T.idx, t: 0 }; }
    }
    // --- Mar Indómito: cuatro Emperadores y otras tripulaciones ---
    const homes = ['wholecake', 'wano', 'elbaf', 'dressrosa'];
    homes.forEach((h) => {
      const T = byId(h);
      const u = Sim.spawnCrewQuiet(T, [88, 98], [55, 80], R.i(4, 6), R.chance(0.5) ? 'legendario' : 'galeon');
      const L = Sim.leaderOf(u);
      L.conq = true; L.haki = [true, true, true];
      L.bounty = R.i(50, 70) * 1e7; L.st.maxBounty = L.bounty;   // 500-700 millones: lo máximo del mundo
      L.epithet = Sim.genEpithet(L);
      L.age = R.i(38, 66);
      L.pers.agg = Math.max(L.pers.agg, 0.5); L.pers.amb = Math.max(L.pers.amb, 0.8);
      for (const m of Sim.unitMembers(u)) {
        if (m !== L) { m.bounty = R.i(8, 35) * 1e7; m.st.maxBounty = m.bounty; if (m.lvl >= 60) m.haki = [true, true, false]; }
      }
      u.grunts = R.i(300, 700);
      u.home = T.idx;
      s.isl[T.idx].guardian = u.id;
      const strong = OP.FRUITS.filter((f) => f.rarity >= 3 && s.fruits[f.id].state === 'none');
      if (R.chance(0.8) && strong.length) giveFruit(L, R.pick(strong).id);
      for (const m of Sim.unitMembers(u)) if (m !== L && R.chance(0.3)) {
        const pool = OP.FRUITS.filter((f) => f.rarity <= 2 && s.fruits[f.id].state === 'none');
        if (pool.length) giveFruit(m, R.pick(pool).id);
      }
      if (h === 'wholecake' || h === 'wano') u.know.road.push(T.idx);
    });
    const nw = M().islands.filter((x) => x.sea === 'newworld' && !x.base && !x.hidden && x.danger <= 8);
    for (let k = 0; k < 5; k++) {
      const T = R.pick(nw);
      const u = Sim.spawnCrewQuiet(T, [45, 70], [35, 58], R.i(2, 5), R.pick(['galeon', 'bergantin']));
      if (R.chance(0.3)) { const pool = OP.FRUITS.filter((f) => f.rarity <= 3 && s.fruits[f.id].state === 'none'); if (pool.length) giveFruit(Sim.leaderOf(u), R.pick(pool).id); }
    }
    for (let k = 0; k < 3; k++) {
      const T = R.pick(nw);
      const a = Sim.createAgent({ faction: 'pirate', isl: T.idx, lvl: R.i(40, 55) });
      const u = Sim.createUnit({ faction: 'pirate', solo: true, isl: T.idx });
      Sim.addMember(u, a);
      const sh = Sim.createShip('bergantin', u, T.idx); sh.coated = true;
      a.prog = { gl: true, nw: true, logpose: true };
      a.bounty = R.i(10, 30) * 1e7; a.st.maxBounty = a.bounty; s.reports[a.id] = { isl: T.idx, t: 0 };
      u.glVisited = M().islands.filter((x) => x.sea === 'paradise').slice(0, 6).map((x) => x.idx);
    }
    // --- Frutas escondidas por el mundo (muy pocas) ---
    for (let k = 0; k < (OP.FRUIT_MAX_HIDDEN || 2); k++) {
      const pool = s.fruits.filter((f) => f.state === 'none');
      const fr = R.weighted(pool, (f) => 5 - OP.FRUITS[f.id].rarity);
      const T = R.weighted(M().islands.filter((x) => !x.hidden && !x.base), (x) => ({ paradise: 3, newworld: 3, sky: 2, deep: 2, calm: 1 }[x.sea] || 1.5));
      fr.state = 'hidden'; fr.isl = T.idx;
      s.isl[T.idx].fruit = fr.id;
      s.isl[T.idx].fruitRumor = R.chance(0.5);
    }
    // algunos oficiales y capitanes del Mar Esmeralda con frutas
    const pa = s.agents.filter((a) => a.loc === 'island' && I(a.isl).sea === 'paradise' && a.lvl >= 25 && a.fruit < 0);
    for (let k = 0; k < 3 && pa.length; k++) {
      const a = pa.splice(Math.floor(R.next() * pa.length), 1)[0];
      const pool = OP.FRUITS.filter((f) => f.rarity <= 2 && s.fruits[f.id].state === 'none');
      if (pool.length) giveFruit(a, R.pick(pool).id);
    }
    Sim.updateEmperors();
    Sim.enforceBountyCaps();
  };
  function m0(u) { return u; }
  function rankForLevel(lv, max) {
    let r = 0;
    for (let k = 0; k <= Math.max(0, max); k++) if (lv >= OP.RANK_LEVEL[k]) r = k;
    return Math.min(r, Math.max(0, max));
  }
  function giveFruit(a, fid) {
    const fr = S().fruits[fid];
    a.fruit = fid; fr.state = 'owned'; fr.owner = a.id; fr.isl = -1;
    Sim.badge(a, 'fruit');
  }
  Sim.spawnCrewQuiet = function (T, capLv, memLv, n, shipType) {
    const cap = Sim.createAgent({ faction: 'pirate', isl: T.idx, lvl: R.i(capLv[0], capLv[1]) });
    cap.pers.amb = Math.max(cap.pers.amb, 0.5);
    const u = Sim.createUnit({ faction: 'pirate', isl: T.idx });
    Sim.addMember(u, cap);
    u.name = Sim.genCrewName(cap);
    cap.role = 'capitán';
    for (let k = 0; k < n; k++) Sim.addMember(u, Sim.createAgent({ faction: 'pirate', isl: T.idx, lvl: R.i(memLv[0], memLv[1]) }));
    const sh = Sim.createShip(shipType, u, T.idx);
    const zm = T.sea === 'newworld' ? 4 : 1.2;
    for (const m of Sim.unitMembers(u)) {
      if (R.chance(0.7)) { m.bounty = Math.round(m.lvl * m.lvl * 0.25 * zm * R.f(0.5, 1.5)) * 1e6; m.st.maxBounty = m.bounty; S().reports[m.id] = { isl: T.idx, t: 0 }; }
      if (m.lvl >= 45) m.haki[0] = R.chance(0.6);
      if (m.lvl >= 50) m.haki[1] = R.chance(0.6);
    }
    if (T.sea === 'newworld') { sh.coated = true; u.glVisited = M().islands.filter((x) => x.sea === 'paradise').slice(0, 6).map((x) => x.idx); }
    else u.glVisited = [T.idx];
    for (const m of Sim.unitMembers(u)) Sim.capBounty(m);
    S().stats.crews++;
    return u;
  };

  // ---------- El personaje del jugador ----------
  Sim.createPlayer = function (spec) {
    const T = byId(spec.island);
    const a = Sim.createAgent({
      faction: spec.faction, isl: T.idx, lvl: 1, name: spec.name, female: spec.female, app: spec.app,
      isPlayer: true, dream: spec.dream || null, rank: 0, money: 50000
    });
    a.pers.amb = Math.max(a.pers.amb, 0.65);
    a.pers.cou = Math.max(a.pers.cou, 0.5);
    a.age = spec.age || 17;
    if (spec.faction === 'pirate') {
      const u = Sim.createUnit({ faction: 'pirate', solo: true, isl: T.idx });
      Sim.addMember(u, a);
      Sim.createShip('bote', u, T.idx);
      Sim.news('pirate', a.name + ' se lanza al mar desde ' + T.name + '. Sueña con ' + OP.DREAMS_PIRATE[a.dream].toLowerCase() + '.', { a: [a.id], isl: T.idx, imp: 3 });
    } else {
      let base = T.base ? T.idx : null;
      if (base == null) {
        const bases = M().islands.filter((x) => x.base && x.sea === T.sea);
        bases.sort((p, q) => Math.hypot(p.x - T.x, p.y - T.y) - Math.hypot(q.x - T.x, q.y - T.y));
        base = bases[0].idx;
      }
      if (base === T.idx) {
        Sim.addMember(Sim.garrisonOf(base), a); a.role = 'soldado';
      } else {
        const u = Sim.createUnit({ faction: 'marine', isl: T.idx, base });
        Sim.addMember(u, a);
        Sim.createShip('bote', u, T.idx);
        u.joinBase = base;
        u.name = 'Recluta en camino';
      }
      Sim.news('marine', a.name + ' se alista en la Marina en ' + T.name + '. Sueña con ' + OP.DREAMS_MARINE[a.dream].toLowerCase() + '.', { a: [a.id], isl: T.idx, imp: 3 });
    }
    Sim.moment(a, 'Empezó su aventura en ' + T.name, 5);
    S().playerId = a.id;
    return a;
  };
})();
