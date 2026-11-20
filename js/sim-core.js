/* MILESDEPIRATAS - núcleo de la simulación: estado, personajes, barcos, tiempo y noticias */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const R = OP.R;
  const Sim = (OP.Sim = OP.Sim || {});
  let S = null;
  let M = null;

  Sim.STEP = 0.1;           // horas de juego por paso
  Sim.HOURS_PER_SEC = 2;    // horas de juego por segundo real a velocidad x1

  // ---------- Accesos rápidos ----------
  Sim.state = () => S;
  Sim.A = (id) => S.A[id];
  Sim.U = (id) => S.U[id];
  Sim.SH = (id) => S.SH[id];
  Sim.I = (idx) => M.islands[idx];
  Sim.D = (idx) => S.isl[idx];
  Sim.idxOf = (id) => M.byId[id].idx;
  Sim.newId = () => S.nextId++;
  Sim.tileIdx = (x, y) => Math.floor(y) * M.W + Math.floor(x);

  function reindex() {
    S.A = {}; S.U = {}; S.SH = {};
    for (const a of S.agents) S.A[a.id] = a;
    for (const u of S.units) S.U[u.id] = u;
    for (const s of S.ships) S.SH[s.id] = s;
  }
  Sim.reindex = reindex;

  // ---------- Nombres y aspecto ----------
  Sim.genName = function (female) {
    const first = R.pick(female ? OP.NAMES_F : OP.NAMES_M);
    const last = R.pick(OP.SURNAMES);
    if (R.chance(0.025)) return first + ' D. ' + last;
    return first + ' ' + last;
  };
  Sim.genEpithet = function (a) {
    S.usedEpi = S.usedEpi || [];
    let e = '';
    for (let k = 0; k < 8; k++) {
      if (R.next() < 0.3) e = R.pick(OP.EPI_BODY);
      else {
        const [noun, g] = R.pick(OP.EPI_NOUN);
        const adj = R.pick(OP.EPI_ADJ);
        e = (g === 'f' ? 'la ' : 'el ') + noun + ' ' + (g === 'f' ? adj[1] : adj[0]);
      }
      if (S.usedEpi.indexOf(e) < 0) break;
    }
    S.usedEpi.push(e);
    void a;
    return e;
  };
  // Sujeto para las noticias: "los Piratas X" (plural) o el nombre del pirata (singular)
  Sim.who = function (u, cap) {
    const L = Sim.A(u.leader);
    let s = u.solo || !u.name ? (L ? L.name : 'Alguien') : (u.faction === 'marine' ? 'la ' : 'los ') + u.name;
    if (cap) s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  };
  Sim.hasPlayer = (u) => !!u && u.members.some((id) => (S.A[id] || {}).isPlayer);
  Sim.v = (u, sing, plur) => (u.solo || !u.name || u.faction === 'marine' ? sing : plur);
  Sim.genAppearance = function (female, faction) {
    const styles = female ? ['largo', 'coleta', 'moño', 'corto', 'afro', 'puntiagudo'] : OP.HAIR_STYLES;
    const accW = faction === 'marine' ? ['ninguno', 'ninguno', 'gorro', 'gafas', 'cicatriz', 'barba'] : ['ninguno', 'ninguno', 'bandana', 'tricornio', 'cicatriz', 'parche', 'gafas', 'barba', 'gorro', 'sombrero de paja'];
    let acc = R.pick(accW);
    if (female && acc === 'barba') acc = 'ninguno';
    return {
      skin: R.pick(OP.SKINS),
      hair: R.pick(styles),
      hairColor: R.chance(0.7) ? R.pick(OP.HAIR_COLORS.slice(0, 5)) : R.pick(OP.HAIR_COLORS),
      cloth: R.pick(OP.CLOTH_COLORS),
      acc,
      build: R.pick(OP.BUILDS)
    };
  };
  Sim.genPersonality = function (faction) {
    const p = {};
    for (const k of ['amb', 'agg', 'cou', 'soc', 'gre', 'loy', 'cur', 'hon']) p[k] = Math.round(R.next() * 100) / 100;
    if (faction === 'marine') { p.hon = Math.min(1, p.hon + 0.2); p.loy = Math.min(1, p.loy + 0.2); p.gre *= 0.7; }
    return p;
  };
  Sim.genDream = function (faction) {
    if (faction === 'marine') return R.weighted(['justicia', 'ascender', 'proteger', 'poder'], (d) => ({ justicia: 3, ascender: 3, proteger: 2.5, poder: 1.5 }[d]));
    return R.weighted(['onepiece', 'fama', 'dinero', 'aventura'], (d) => ({ onepiece: 3, fama: 2.5, dinero: 2.5, aventura: 2 }[d]));
  };

  // ---------- Estadísticas ----------
  // A partir del nivel 40 cada nivel cuesta muchísimo más: el nivel 100 queda para muy pocos
  Sim.xpNeed = (lvl) => Math.round((10 * Math.pow(lvl, 1.3) + 10) * (lvl > 40 ? 1 + Math.pow((lvl - 40) / 12, 2.2) : 1));
  Sim.levelUpStats = function (a) {
    const t = a.talent;
    a.str += 1 + R.i(0, 2) + (t === 'Fuerte' ? 1 : 0) + (t === 'Luchador' ? R.i(0, 1) : 0);
    a.spd += 1 + R.i(0, 2) + (t === 'Ladrón' || t === 'Asesino' || t === 'Tirador' ? 1 : 0);
    const hpGain = 6 + R.i(0, 6) + (t === 'Fuerte' ? 3 : 0);
    a.maxHp += hpGain;
    a.hp = Math.min(a.maxHp, a.hp + hpGain);
  };
  Sim.setLevel = function (a, lvl) {
    a.lvl = 1;
    a.str = R.i(7, 12); a.spd = R.i(7, 12); a.maxHp = R.i(55, 75); a.hp = a.maxHp;
    for (let l = 2; l <= lvl; l++) { a.lvl = l; Sim.levelUpStats(a); }
    a.hp = a.maxHp;
    a.xp = Math.floor(R.next() * Sim.xpNeed(a.lvl) * 0.6);
  };
  const TALENT_MULT = { 'Espadachín': 1.12, 'Luchador': 1.08, 'Fuerte': 1.05, 'Asesino': 1.06 };
  Sim.basePower = function (a) {
    let p = (a.str * 1.2 + a.spd + a.maxHp * 0.12) * (1 + a.lvl * 0.04);
    p *= TALENT_MULT[a.talent] || 1;
    if (a.fruit >= 0) p *= OP.RARITY_MULT[OP.FRUITS[a.fruit].rarity];
    if (a.haki[0]) p *= 1.08;
    if (a.haki[1]) p *= 1.12;
    if (a.haki[2]) p *= 1.15;
    return p;
  };
  Sim.effPower = (a) => Sim.basePower(a) * (0.55 + 0.45 * Math.max(0, a.hp) / a.maxHp);

  // ---------- Crear personajes ----------
  Sim.createAgent = function (o) {
    const female = o.female != null ? o.female : R.chance(0.42);
    const faction = o.faction;
    const a = {
      id: Sim.newId(),
      name: o.name || Sim.genName(female),
      epithet: '',
      female,
      age: o.age || R.i(16, 24) + Math.floor((o.lvl || 1) / 4),
      faction,
      lvl: 1, xp: 0, str: 10, spd: 10, maxHp: 70, hp: 70,
      talent: o.talent || R.pick(OP.TALENT_LIST),
      money: o.money != null ? o.money : R.i(1, 30) * 10000,
      bounty: 0, rank: 0, merit: 0,
      fruit: -1, haki: [false, false, false], conq: R.chance(0.012),
      unit: 0, role: '',
      loc: 'island', isl: o.isl, x: 0, y: 0, tx: null, ty: null, wait: 0,
      act: 'idle', actUntil: 0,
      pers: o.pers || Sim.genPersonality(faction),
      dream: o.dream || Sim.genDream(faction),
      quote: '',
      app: o.app || Sim.genAppearance(female, faction),
      home: o.isl, homeSea: Sim.I(o.isl).sea,
      prog: { gl: false, nw: false, logpose: false },
      visited: [o.isl],
      st: { fights: 0, wins: 0, losses: 0, kos: 0, caps: 0, captured: 0, missions: 0, treasures: 0, escapes: 0, shipwrecks: 0, maxBounty: 0 },
      moments: [], best: null, badges: [],
      rel: {}, log: [],
      battle: 0, prisonUntil: 0,
      born: S.time, lastFight: -999,
      isPlayer: !!o.isPlayer
    };
    if (a.conq && R.chance(0.5)) a.pers.amb = Math.max(a.pers.amb, 0.8);
    Sim.setLevel(a, o.lvl || 1);
    a.quote = R.pick(OP.QUOTES[a.dream]);
    if (o.rank != null) a.rank = o.rank;
    if (faction === 'marine') a.merit = OP.RANK_MERIT[a.rank] + R.i(0, 10);
    const I = Sim.I(o.isl);
    const sea = OP.SEAS[I.sea];
    if (sea && sea.kind !== 'blue') { a.prog.gl = true; a.prog.logpose = true; }
    if (I.sea === 'newworld') a.prog.nw = true;
    S.agents.push(a); S.A[a.id] = a;
    Sim.placeOnIsland(a, o.isl, true);
    return a;
  };

  Sim.placeOnIsland = function (a, idx, random) {
    const I = Sim.I(idx);
    a.loc = 'island'; a.isl = idx;
    let c = I.portLand;
    if (random && I.land.length) c = I.land[Math.floor(R.next() * I.land.length)];
    a.x = (c % M.W) + 0.2 + R.next() * 0.6;
    a.y = ((c / M.W) | 0) + 0.2 + R.next() * 0.6;
    a.tx = null; a.wait = R.f(0, 2);
    if (a.visited.indexOf(idx) < 0) a.visited.push(idx);
  };

  // ---------- Barcos ----------
  Sim.genShipName = function (faction) {
    if (faction === 'marine') return R.pick(['Justicia', 'Gaviota', 'Orden', 'Escudo', 'Bastión', 'Centinela']) + ' ' + R.i(2, 99);
    const r = R.next();
    if (r < 0.3) return R.pick(OP.JP_WORDS) + ' Maru';
    if (r < 0.65) return 'La ' + R.pick(OP.SHIP_WORDS) + ' ' + R.pick(OP.SHIP_ADJ);
    return R.pick(OP.SHIP_WORDS) + ' ' + R.pick(OP.SHIP_ADJ);
  };
  Sim.createShip = function (type, unit, islIdx) {
    const T = OP.SHIPS[type];
    const I = Sim.I(islIdx);
    const sh = {
      id: Sim.newId(), name: Sim.genShipName(unit.faction), type, faction: unit.faction, unit: unit.id,
      hp: T.hp, maxHp: T.hp, coated: false,
      x: I.dockX, y: I.dockY, isl: islIdx, state: 'docked', route: null, dir: R.chance(0.5) ? 1 : -1, gate: null
    };
    if (type === 'bote') sh.name = 'Bote de ' + (Sim.A(unit.leader) ? Sim.A(unit.leader).name.split(' ')[0] : 'pesca');
    S.ships.push(sh); S.SH[sh.id] = sh;
    unit.ship = sh.id;
    return sh;
  };
  Sim.removeShip = function (sh) {
    if (!sh) return;
    sh.state = 'sunk';
    const i = S.ships.indexOf(sh);
    if (i >= 0) S.ships.splice(i, 1);
    delete S.SH[sh.id];
  };
  Sim.shipSpeed = function (sh) {
    const T = OP.SHIPS[sh.type];
    let sp = T.speed;
    const u = Sim.U(sh.unit);
    if (u && Sim.hasNavigator(u)) sp *= 1.18;
    sp *= 0.65 + 0.35 * sh.hp / sh.maxHp;
    return sp;
  };

  // ---------- Grupos (tripulaciones, unidades de la Marina, piratas solitarios) ----------
  Sim.genCrewName = function (leader) {
    const r = R.next();
    const first = leader.name.split(' ')[0];
    if (r < 0.3) return 'Piratas de ' + first;
    const [noun, g] = R.pick(OP.EPI_NOUN);
    const adj = R.pick(OP.EPI_ADJ);
    if (r < 0.8) return 'Piratas ' + (g === 'f' ? 'de la ' : 'del ') + noun + ' ' + (g === 'f' ? adj[1] : adj[0]);
    return 'Piratas ' + (g === 'f' ? 'de la ' : 'del ') + noun;
  };
  Sim.createUnit = function (o) {
    const u = {
      id: Sim.newId(), faction: o.faction, name: o.name || '', solo: !!o.solo, garrison: !!o.garrison,
      leader: 0, members: [], ship: 0, base: o.base != null ? o.base : -1,
      plan: null, rep: 0, allies: [], enemies: [], grunts: o.grunts || 0,
      flag: o.flag || { bg: R.chance(0.8) ? '#111' : R.pick(['#7a1010', '#10307a', '#3b1a5a', '#0f4d2a']), fg: R.pick(['#f4f4f4', '#f4d03f', '#e74c3c']), sym: R.i(0, 5) },
      created: S.time, know: { treasures: [], road: [], lt: false, info: 0 }, prisoners: [],
      cooldown: 0, isl: o.isl, status: 'docked', boardUntil: 0, nextThink: S.time + R.f(0.5, 4), glVisited: [], fame: 0
    };
    S.units.push(u); S.U[u.id] = u;
    return u;
  };
  Sim.addMember = function (u, a, role) {
    if (a.unit && a.unit !== u.id) Sim.removeMember(Sim.U(a.unit), a, true);
    if (u.members.indexOf(a.id) < 0) u.members.push(a.id);
    a.unit = u.id;
    a.role = role || Sim.bestRole(u, a);
    if (!u.leader) { u.leader = a.id; a.role = u.faction === 'marine' ? 'comandante' : (u.solo ? 'pirata' : 'capitán'); }
  };
  Sim.removeMember = function (u, a, silent) {
    if (!u) return;
    const i = u.members.indexOf(a.id);
    if (i >= 0) u.members.splice(i, 1);
    a.unit = 0; a.role = '';
    if (u.leader === a.id) {
      u.leader = 0;
      Sim.chooseNewLeader(u, silent);
    }
    if (!u.members.length) Sim.disbandUnit(u);
  };
  Sim.chooseNewLeader = function (u, silent) {
    const cands = u.members.map(Sim.A).filter((m) => m && m.loc !== 'dead' && m.loc !== 'prison');
    if (!cands.length) return;
    cands.sort((p, q) => (q.lvl + q.pers.amb * 10 + q.rank * 5) - (p.lvl + p.pers.amb * 10 + p.rank * 5));
    const L = cands[0];
    u.leader = L.id;
    L.role = u.faction === 'marine' ? 'comandante' : (u.solo ? 'pirata' : 'capitán');
    if (u.faction === 'marine' && !u.garrison) u.name = 'Unidad ' + (L.rank >= 3 ? 'del ' + OP.RANKS[L.rank] + ' ' : 'de ') + L.name.split(' ')[0];
    if (!silent && !u.solo && u.faction === 'pirate' && (u.fame > 40 || L.isPlayer)) {
      Sim.news('crew', L.name + ' es el nuevo capitán de los ' + u.name + '.', { a: [L.id] });
      Sim.moment(L, 'Se convirtió en capitán de los ' + u.name, 22);
    }
  };
  Sim.disbandUnit = function (u) {
    const i = S.units.indexOf(u);
    if (i >= 0) S.units.splice(i, 1);
    delete S.U[u.id];
    for (const mid of u.members.slice()) { const m = Sim.A(mid); if (m) { m.unit = 0; } }
    for (const pid of u.prisoners) {
      const p = Sim.A(pid);
      if (p && p.loc === 'ship') Sim.jailNearest(p, u);
    }
    u.prisoners = [];
    const sh = Sim.SH(u.ship);
    if (sh) Sim.removeShip(sh);
    for (const o of S.units) {
      o.allies = o.allies.filter((x) => x !== u.id);
      o.enemies = o.enemies.filter((x) => x !== u.id);
    }
  };
  // Un preso que se queda sin barco que lo lleve: otro barco de la Marina lo lleva a la base más cercana
  Sim.jailNearest = function (a, u) {
    const sh = u && Sim.SH(u.ship);
    const x = sh ? sh.x : Sim.I(a.home).x, y = sh ? sh.y : Sim.I(a.home).y;
    const z = Sim.zoneOfPos(x, y);
    let best = -1, bd = Infinity;
    for (const I of M.islands) {
      if (!I.base || I.hq) continue;
      const d = Math.hypot(I.x - x, I.y - y) + (I.sea === z ? 0 : 300);
      if (d < bd) { bd = d; best = I.idx; }
    }
    a.carriedBy = 0;
    a.loc = 'prison'; a.isl = best;
    a.prisonUntil = Sim.I(best).prison ? S.time + 24 * R.i(50, 110) : S.time + 24 * R.i(8, 25);
    Sim.log(a, 'Lo encerraron en ' + Sim.I(best).name + '.');
  };
  Sim.bestRole = function (u, a) {
    if (u.faction === 'marine') {
      return R.pick(['soldado', 'artillero', 'navegante', 'médico', 'soldado']);
    }
    const taken = new Set(u.members.filter((x) => x !== a.id).map((x) => (Sim.A(x) || {}).role));
    const pref = OP.TALENTS[a.talent].role;
    if (!taken.has(pref)) return pref;
    for (const r of OP.CORE_ROLES) if (!taken.has(r)) return r;
    return R.pick(['combatiente', 'músico', 'combatiente', 'timonel']);
  };
  Sim.hasNavigator = function (u) {
    for (const id of u.members) {
      const m = Sim.A(id);
      if (m && (m.role === 'navegante' || m.talent === 'Navegante') && (m.loc === 'ship' || m.loc === 'island')) return true;
    }
    return false;
  };
  Sim.unitMembers = (u) => u.members.map(Sim.A).filter((m) => m && (m.loc === 'island' || m.loc === 'ship'));
  Sim.leaderOf = (u) => Sim.A(u.leader);
  Sim.unitBounty = (u) => u.members.reduce((s, id) => s + ((Sim.A(id) || {}).bounty || 0), 0);
  Sim.unitPower = function (u) {
    let p = 0;
    for (const m of Sim.unitMembers(u)) p += Sim.effPower(m);
    const zone = Sim.unitZone(u);
    p += Math.sqrt(u.grunts) * (OP.ZONE_GRUNT[zone] || 2) * 3;
    return p;
  };
  Sim.unitZone = function (u) {
    if (u.isl >= 0) return Sim.I(u.isl).sea;
    const sh = Sim.SH(u.ship);
    if (sh) return Sim.zoneOfPos(sh.x, sh.y);
    return 'east';
  };
  Sim.zoneOfPos = function (x, y) {
    const t = M.t[Sim.tileIdx(x, y)];
    if (t === OP.T.CLOUDSEA) return 'sky';
    if (t === OP.T.DEEP) return 'deep';
    return OP.zoneAt(x, y);
  };
  Sim.agentZone = function (a) {
    if (a.loc === 'island' || a.loc === 'prison') return Sim.I(a.isl).sea;
    if (a.loc === 'ship') {
      const u = a.carriedBy ? Sim.U(a.carriedBy) : Sim.U(a.unit);
      const sh = u && Sim.SH(u.ship);
      if (sh) return Sim.zoneOfPos(sh.x, sh.y);
    }
    return a.homeSea;
  };
  Sim.nearestIsland = function (x, y, a) {
    let best = 0, bd = Infinity;
    const z = Sim.zoneOfPos(x, y);
    for (const I of M.islands) {
      if (I.hidden) continue;
      const d = Math.hypot(I.dockX - x, I.dockY - y) + (I.sea === z ? 0 : 400);
      if (d < bd) { bd = d; best = I.idx; }
    }
    void a;
    return best;
  };

  // ---------- Noticias, diario y momentos ----------
  Sim.news = function (cat, text, o) {
    o = o || {};
    const n = { id: S.nextNews++, t: S.time, cat, text, a: o.a || [], isl: o.isl != null ? o.isl : -1, imp: o.imp || 1 };
    S.news.unshift(n);
    if (S.news.length > 400) S.news.length = 400;
    S.stats.news[cat] = (S.stats.news[cat] || 0) + 1;
    if (OP.onNews) OP.onNews(n);
    return n;
  };
  Sim.log = function (a, text) {
    if (!a) return;
    a.log.unshift({ d: S.time, t: text });
    if (a.log.length > 16) a.log.length = 16;
  };
  Sim.moment = function (a, text, score) {
    if (!a) return;
    const m = { d: S.time, t: text, s: score };
    a.moments.push(m);
    a.moments.sort((p, q) => q.s - p.s);
    if (a.moments.length > 8) a.moments.length = 8;
    if (!a.best || score >= a.best.s) a.best = m;
    Sim.log(a, text);
  };
  Sim.badge = function (a, id) {
    if (!a || a.badges.indexOf(id) >= 0) return false;
    a.badges.push(id);
    return true;
  };
  Sim.rel = function (a, b, delta) {
    if (!a || !b || a.id === b.id) return;
    a.rel[b.id] = OP.clamp((a.rel[b.id] || 0) + delta, -100, 100);
    const keys = Object.keys(a.rel);
    if (keys.length > 18) {
      keys.sort((p, q) => Math.abs(a.rel[p]) - Math.abs(a.rel[q]));
      delete a.rel[keys[0]];
    }
  };
  Sim.bestFriend = function (a) {
    let best = null, bv = 15;
    for (const k in a.rel) if (a.rel[k] > bv && S.A[k]) { bv = a.rel[k]; best = S.A[k]; }
    return best;
  };
  Sim.rival = function (a) {
    let best = null, bv = -15;
    for (const k in a.rel) if (a.rel[k] < bv && S.A[k]) { bv = a.rel[k]; best = S.A[k]; }
    return best;
  };

  // ---------- Experiencia y niveles ----------
  Sim.gainXp = function (a, amount) {
    if (!a || a.loc === 'dead') return;
    a.xp += amount;
    let ups = 0;
    while (a.xp >= Sim.xpNeed(a.lvl) && a.lvl < 100) {
      a.xp -= Sim.xpNeed(a.lvl);
      a.lvl++; ups++;
      Sim.levelUpStats(a);
      Sim.onLevelUp(a);
    }
    if (a.lvl >= 100) a.xp = Math.min(a.xp, Sim.xpNeed(100));
    if (ups) S.stats.levelUps += ups;
  };
  Sim.onLevelUp = function (a) {
    if (a.lvl % 10 === 0) Sim.log(a, 'Alcanzó el nivel ' + a.lvl + '.');
    const zone = Sim.agentZone(a);
    if (a.lvl >= 35 && !a.haki[0] && (zone === 'paradise' || zone === 'newworld' || zone === 'sky' || zone === 'calm') && R.chance(0.07)) {
      a.haki[0] = true; Sim.badge(a, 'haki_obs');
      Sim.moment(a, 'Despertó el Aura de Observación', 30);
    }
    if (a.lvl >= 40 && !a.haki[1] && (zone === 'paradise' || zone === 'newworld' || zone === 'calm') && R.chance(0.07)) {
      a.haki[1] = true; Sim.badge(a, 'haki_arm');
      Sim.moment(a, 'Despertó el Aura de Armadura', 32);
    }
    if (a.conq && !a.haki[2] && a.lvl >= 50 && R.chance(0.2)) {
      a.haki[2] = true; Sim.badge(a, 'haki_conq');
      Sim.moment(a, 'Despertó el Aura del Rey', 55);
      Sim.news('world', '¡' + a.name + ' ha mostrado el Aura del Rey! Muy pocos en el mundo lo poseen.', { a: [a.id], imp: 3 });
    }
  };

  // ---------- Recompensas ----------
  // Techo de recompensa de un NPC según su nivel (nunca más de OP.NPC_BOUNTY.cap = 700 millones)
  Sim.npcBountyCap = function (a) {
    const cfg = OP.NPC_BOUNTY;
    if (!cfg || a.isPlayer) return Infinity;
    if (cfg.mode === 'off') return 0;
    // cada NPC tiene su propio techo (±18%) para que no se amontonen todos en la misma cifra; los Emperadores, el máximo
    let cap = Sim.isEmperorLeader(a) ? cfg.cap : Math.min(cfg.cap * (0.88 + 0.12 * Sim.bountyHash(a.id, 5)), cfg.perLvl2 * a.lvl * a.lvl * (0.82 + 0.36 * Sim.bountyHash(a.id, 1)));
    if (cfg.mode === 'reduced') cap *= cfg.reducedMult;
    const mag = cap >= 1e8 ? 1e6 : cap >= 1e7 ? 1e5 : 1e4;
    return Math.floor(cap / mag) * mag;
  };
  // ---------- Población y niveles de los NPC ----------
  // NPC "normales" vivos (sin contar bandidos para novatos ni NPC de tripulaciones de jugadores)
  // (los bandidos y los enemigos comunes los gestiona el servidor online: no cuentan para el tope de población)
  Sim.liveNpcs = () => S.agents.filter((a) => (a.loc === 'island' || a.loc === 'ship') && !a.bandit && !a.common && !a.pcCrew && !a.isPlayer);
  // importancia de un NPC: los Emperadores, Almirantes y capitanes famosos son los últimos en desaparecer y los primeros en tener nivel alto
  Sim.npcImportance = function (a) {
    const u = S.U[a.unit];
    let v = a.lvl + Math.min(60, (a.bounty || 0) / 1e7);
    // los NPC flojos de los cuatro mares son los rivales de los novatos: se conservan
    if (a.lvl <= 12 && OP.BLUES.indexOf(Sim.agentZone(a)) >= 0) v += 80;
    if (Sim.isEmperorLeader(a)) v += 1000;
    else if (u && S.emperors.indexOf(u.id) >= 0) v += 300;
    if (a.faction === 'marine') v += [0, 0, 0, 0, 5, 10, 30, 200, 800, 900][a.rank || 0];
    if (u && u.leader === a.id && !u.solo) v += 40;
    if (u && u.garrison) v += 25;
    return v;
  };
  // Tope de población: si hay demasiados NPC, se retiran los menos importantes
  Sim.trimPopulation = function (max) {
    const live = Sim.liveNpcs().filter((a) => !a.battle && !a.carriedBy);
    if (live.length <= max) return 0;
    live.sort((p, q) => Sim.npcImportance(p) - Sim.npcImportance(q));
    let n = 0;
    for (const a of live.slice(0, live.length - max)) { Sim.retire(a, 'Dejó la vida en el mar'); n++; }
    return n;
  };
  // Cupos de nivel: solo unos pocos NPC (los más importantes) llegan a los niveles más altos.
  // Los que sobran bajan a la franja de debajo (con sus estadísticas ajustadas).
  Sim.enforceLevelCaps = function () {
    const tiers = OP.NPC_LEVEL_TIERS || [];
    const all = S.agents.filter((a) => a.loc !== 'dead' && a.loc !== 'retired' && !a.isPlayer && !a.pcCrew);
    let changed = 0;
    for (let t = 0; t < tiers.length; t++) {
      const [L, count] = tiers[t];
      const next = tiers[t + 1] ? tiers[t + 1][0] : L - 10;
      const over = all.filter((a) => a.lvl >= L).sort((p, q) => Sim.npcImportance(q) - Sim.npcImportance(p));
      for (const a of over.slice(count)) {
        const nl = Math.max(next, L - 1 - Math.floor(Sim.bountyHash(a.id, 6 + t) * (L - next)));
        Sim.demoteLevel(a, nl);
        changed++;
      }
    }
    return changed;
  };
  Sim.demoteLevel = function (a, nl) {
    if (nl >= a.lvl) return;
    const sr = (9.5 + 2 * (nl - 1)) / (9.5 + 2 * (a.lvl - 1)), hr = (65 + 9 * (nl - 1)) / (65 + 9 * (a.lvl - 1));
    a.str = Math.max(5, Math.round(a.str * sr)); a.spd = Math.max(5, Math.round(a.spd * sr));
    const frac = a.maxHp ? a.hp / a.maxHp : 1;
    a.maxHp = Math.max(30, Math.round(a.maxHp * hr)); a.hp = Math.max(1, Math.round(a.maxHp * frac));
    a.lvl = nl;
    a.xp = Math.min(a.xp || 0, Math.floor(Sim.xpNeed(nl) * 0.5));
  };
  // ¿es el capitán de una de las tripulaciones de los Cuatro Emperadores?
  Sim.isEmperorLeader = function (a) {
    if (!a || !S.emperors || !S.emperors.length) return false;
    const u = S.U && S.U[a.unit];
    return !!(u && u.leader === a.id && S.emperors.indexOf(u.id) >= 0);
  };
  // número fijo entre 0 y 1 para cada NPC (el mismo siempre)
  Sim.bountyHash = (id, k) => { let h = (id * 2654435761 + k * 40503) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return ((h >>> 0) % 10007) / 10007; };
  // reparte las recompensas redondas (300.000.000, 150.000.000...) en cifras variadas; se hace una vez por mundo
  Sim.spreadRoundBounties = function () {
    let n = 0;
    for (const a of S.agents) {
      if (a.isPlayer || !(a.bounty >= 3e7) || a.bounty % 1e7 !== 0) continue;
      const v = a.bounty * (0.88 + 0.3 * Sim.bountyHash(a.id, 2));
      const mg = v >= 3e8 ? 1e6 : 1e5;
      a.bounty = Math.round(v / mg) * mg;
      n++;
    }
    return n;
  };
  Sim.capBounty = function (a) {
    if (!a || !a.bounty) return;
    const cap = Sim.npcBountyCap(a);
    if (a.bounty > cap) { a.bounty = cap; a.st.maxBounty = Math.min(a.st.maxBounty || cap, cap); }
  };
  // Techo por nivel + cupo global: solo unos pocos NPC (los más fuertes) superan cada umbral
  Sim.enforceBountyCaps = function () {
    const live = [];
    const cfg = OP.NPC_BOUNTY || {};
    for (const a of S.agents) {
      Sim.capBounty(a);
      // los capitanes de los Cuatro Emperadores siempre están entre los más buscados (360-660 millones, cifras variadas)
      if (Sim.isEmperorLeader(a) && cfg.mode !== 'off' && a.loc !== 'dead') {
        let floor = 3.6e8 + 3e8 * Sim.bountyHash(a.id, 4);
        if (cfg.mode === 'reduced') floor *= cfg.reducedMult;
        floor = Math.round(floor / 1e6) * 1e6;
        if (a.bounty < floor) a.bounty = floor;
      }
      if (a.bounty > 0 && a.loc !== 'dead' && !a.isPlayer) live.push(a);
    }
    const tiers = cfg.tiers || [];
    if (!tiers.length) return;
    live.sort((p, q) => q.bounty - p.bounty || q.lvl - p.lvl);
    for (const [limit, count] of tiers) {
      let n = 0;
      for (const a of live) {
        if (a.bounty <= limit) break;
        if (Sim.isEmperorLeader(a)) continue;   // los Emperadores no cuentan para el cupo
        if (++n > count) { const v = limit * (0.68 + 0.3 * Sim.bountyHash(a.id, 3)); const mg = v >= 3e8 ? 1e6 : 1e5; a.bounty = Math.round(v / mg) * mg; }   // repartidos por debajo del umbral, sin cifras repetidas
      }
      live.sort((p, q) => q.bounty - p.bounty || q.lvl - p.lvl);
    }
  };
  Sim.raiseBounty = function (a, amount, reason, force) {
    if (!a || a.faction !== 'pirate' || amount <= 0) return;
    if (Sim.npcBountyCap(a) <= 0) return;
    const old = a.bounty;
    if (!force) {
      // ninguna hazaña sola dispara la recompensa: como mucho un 20% más una cantidad según el mar
      const zm = OP.ZONE_MULT[Sim.agentZone(a)] || 1;
      amount = Math.min(amount, Math.max(2e6, old * 0.2) + 1e7 * zm);
      if (old === 0) amount = Math.max(amount, 1e6 * (1 + Math.floor(R.next() * 3)));
      // la recompensa va acorde a la fuerza: por encima de lo normal para su nivel sube mucho más despacio
      const soft = 3e5 * Math.pow(a.lvl, 2.1);
      if (old + amount > soft) amount = Math.max(0, soft - old) + (old + amount - Math.max(soft, old)) * 0.15;
    }
    let nb = old + amount;
    // redondeo bonito
    const mag = nb >= 1e9 ? 1e7 : nb >= 1e8 ? 1e6 : nb >= 1e7 ? 1e5 : 1e4;
    nb = Math.round(nb / mag) * mag;
    nb = Math.min(nb, Sim.npcBountyCap(a));   // ningún NPC pasa de su techo (700 millones como máximo)
    if (nb <= old) return;
    a.bounty = nb;
    a.st.maxBounty = Math.max(a.st.maxBounty, nb);
    const u = Sim.U(a.unit);
    if (u) u.fame += amount / 1e6;
    if (!a.epithet && nb >= 40e6 && R.chance(0.7)) a.epithet = Sim.genEpithet(a);
    if (old === 0) {
      Sim.moment(a, 'Recibió su primer cartel de SE BUSCA: ' + OP.fmtB(nb), 20);
      Sim.badge(a, 'wanted');
      if (nb >= 2e7 || a.isPlayer) Sim.news('bounty', 'Nuevo cartel de SE BUSCA: ' + a.name + ' — ' + OP.fmtB(nb) + (reason ? ' (' + reason + ')' : '') + '.', { a: [a.id], imp: nb >= 1e8 ? 3 : 2 });
    } else if (nb - old >= Math.max(3e7, old * 0.2) || (a.isPlayer && nb - old >= 1e6)) {
      Sim.news('bounty', 'La recompensa de ' + a.name + (a.epithet ? ' "' + a.epithet + '"' : '') + ' sube a ' + OP.fmtB(nb) + (reason ? ' (' + reason + ')' : '') + '.', { a: [a.id], imp: nb >= 5e8 ? 3 : 2 });
    }
    if (nb >= 1e8 && old < 1e8) { Sim.badge(a, 'bounty100'); Sim.moment(a, 'Su recompensa superó los 100 millones', 40); }
    if (nb >= 1e9 && old < 1e9) { Sim.badge(a, 'bounty1000'); Sim.moment(a, 'Su recompensa superó los 1.000 millones', 70); }
    S.reports[a.id] = { isl: a.loc === 'island' ? a.isl : (Sim.U(a.unit) ? Sim.U(a.unit).isl : -1), t: S.time };
  };

  // ---------- Islas (estado que cambia) ----------
  function makeIslandState(I) {
    return {
      pop: I.pop, wealth: Math.min(1, 0.3 + Math.log10(I.pop + 10) / 8), fruit: -1, treasure: R.chance(0.3), info: R.i(0, 2),
      attackedAt: -999, baseHp: I.base ? (I.hq ? 3000 : I.prison ? 2500 : 800) : 0, baseMax: I.base ? (I.hq ? 3000 : I.prison ? 2500 : 800) : 0,
      guardian: 0, discovered: !I.hidden, lastVisit: -999
    };
  }

  Sim.makeIslandState = makeIslandState;

  // ---------- Crear el mundo ----------
  Sim.newWorld = function (seed, player) {
    M = OP.M;
    R.seed(seed || (Date.now() & 0x7fffffff));
    S = OP.S = {
      version: 1, seed, time: 8, nextId: 1, nextNews: 1,
      agents: [], units: [], ships: [], battles: [], news: [],
      isl: M.islands.map(makeIslandState),
      fruits: OP.FRUITS.map((f) => ({ id: f.id, state: 'none', isl: -1, owner: 0, since: 0 })),
      reports: {}, emperors: [], pirateKing: 0, execution: null, war: null,
      road4: '', playerId: 0,
      stats: { levelUps: 0, battles: 0, captures: 0, deaths: 0, crews: 0, fruitsEaten: 0, missions: {}, news: {}, gateCross: {}, violations: [], shipwrecks: 0, promotions: 0 }
    };
    S.A = {}; S.U = {}; S.SH = {};
    S.road4 = R.pick(['dressrosa', 'punkhazard', 'egghead', 'elbaf']);
    OP.Sim.populate();
    if (player) Sim.createPlayer(player);
    Sim.news('world', 'Comienza una nueva era. Los mares hierven de piratas y la Marina vigila.', { imp: 2 });
    return S;
  };

  Sim.loadState = function (state) {
    M = OP.M;
    S = OP.S = state;
    reindex();
    R.s = S.rng | 0 || 1;
    // las rutas guardan puntos completos, no hay nada que recalcular
    return S;
  };
  Sim.attachMap = function () { M = OP.M; };

  // ---------- Movimiento por tierra ----------
  function walk(a, dt) {
    const I = Sim.I(a.isl);
    if (a.wait > 0) { a.wait -= dt; return; }
    if (a.tx == null) Sim.pickWalkTarget(a, I);
    if (a.tx == null) { a.wait = 1; return; }
    const dx = a.tx - a.x, dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    const sp = (a.act === 'board' ? 3 : 1.6) * dt;
    if (d <= sp) {
      a.x = a.tx; a.y = a.ty; a.tx = null;
      a.wait = a.act === 'board' ? 0 : R.f(0.3, a.act === 'train' ? 1.2 : 3);
      return;
    }
    const nx = a.x + (dx / d) * sp, ny = a.y + (dy / d) * sp;
    const ti = Math.floor(ny) * M.W + Math.floor(nx);
    if (M.isl[ti] !== I.idx) { a.tx = null; a.wait = 0.2; return; }
    a.x = nx; a.y = ny;
  }
  Sim.pickWalkTarget = function (a, I) {
    if (!I.land.length) return;
    let c;
    if (a.act === 'board' || a.act === 'guard') c = I.portLand;
    else if (a.act === 'train') {
      // entrena cerca de donde está
      for (let k = 0; k < 6; k++) {
        const x = Math.floor(a.x + R.f(-2.5, 2.5)), y = Math.floor(a.y + R.f(-2.5, 2.5));
        const i = y * M.W + x;
        if (M.isl[i] === I.idx) { c = i; break; }
      }
    } else if (a.act === 'social' && I.townPos.length) {
      const tp = R.pick(I.townPos);
      c = Math.floor(tp.y) * M.W + Math.floor(tp.x);
    }
    if (c == null) c = I.land[Math.floor(R.next() * I.land.length)];
    a.tx = (c % M.W) + 0.2 + R.next() * 0.6;
    a.ty = ((c / M.W) | 0) + 0.2 + R.next() * 0.6;
  };

  // ---------- Movimiento de barcos ----------
  function moveShip(sh, dt) {
    const r = sh.route;
    if (!r) return;
    let tRem = dt;
    let guard = 0;
    while (tRem > 1e-6 && guard++ < 20) {
      const leg = r.legs[r.li];
      if (!leg) { Sim.arrive(sh); return; }
      const speed = leg.type === 'gate' ? leg.len / leg.hours : Sim.shipSpeed(sh);
      sh.gate = leg.type === 'gate' ? leg.kind : null;
      const p = leg.pts[r.pi + 1];
      if (!p) { nextLeg(sh, r, leg); if (sh.route !== r || sh.state !== 'sailing') return; continue; }
      const dx = p[0] - sh.x, dy = p[1] - sh.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.01 && leg.type === 'sea') sh.dir = dx < 0 ? -1 : 1;
      const can = speed * tRem;
      const pscale = leg.type === 'gate' ? (leg.hours * 6) / Math.max(1, leg.len) : 1;
      if (d <= can) {
        sh.x = p[0]; sh.y = p[1];
        tRem -= d / speed;
        r.pdone += d * pscale;
        r.pi++;
        if (r.pi >= leg.pts.length - 1) { nextLeg(sh, r, leg); if (sh.route !== r || sh.state !== 'sailing') return; }
      } else {
        sh.x += (dx / d) * can; sh.y += (dy / d) * can;
        r.pdone += can * pscale;
        tRem = 0;
      }
    }
  }
  function nextLeg(sh, r, leg) {
    if (leg.type === 'gate') Sim.onGateCrossed(sh, leg);
    r.li++; r.pi = 0;
    const nl = r.legs[r.li];
    if (!nl) { Sim.arrive(sh); return; }
    if (nl.type === 'gate') {
      const u = Sim.U(sh.unit);
      const g = M.gateById[nl.gate];
      if (u && g && !Sim.gateAllowed(u, g, nl.fwd)) { Sim.abortVoyage(sh); return; }
    }
    sh.x = nl.pts[0][0]; sh.y = nl.pts[0][1];
  }
  Sim.routeProgress = function (sh) {
    const r = sh && sh.route;
    if (!r) return 1;
    return OP.clamp(r.pdone / Math.max(1, r.ptotal), 0, 1);
  };
  Sim.routeEta = function (sh) {
    const r = sh && sh.route;
    if (!r) return 0;
    let h = 0;
    for (let i = r.li; i < r.legs.length; i++) {
      const L = r.legs[i];
      if (L.type === 'gate') h += L.hours * (i === r.li ? 0.5 : 1);
      else h += (i === r.li ? L.len * 0.5 : L.len) / Sim.shipSpeed(sh);
    }
    return h;
  };

  // ---------- Paso de simulación ----------
  Sim.step = function () {
    const dt = Sim.STEP;
    const prevT = S.time;
    S.time += dt;
    // barcos
    for (let i = S.ships.length - 1; i >= 0; i--) {
      const sh = S.ships[i];
      if (sh.state === 'sailing') moveShip(sh, dt);
    }
    // personajes en tierra
    for (const a of S.agents) {
      if (a.loc === 'island' && !a.battle) walk(a, dt);
    }
    // combates
    Sim.updateBattles();
    // encuentros en el mar cada media hora
    if (Math.floor(S.time * 2) !== Math.floor(prevT * 2)) Sim.seaEncounters();
    if (Math.floor(S.time) !== Math.floor(prevT)) Sim.hourly();
    if (Math.floor(S.time / 24) !== Math.floor(prevT / 24)) Sim.daily();
    S.rng = R.s;
  };

  Sim.occupants = function (idx) { return (S._occ && S._occ[idx]) || []; };
  Sim.rebuildOccupants = function () {
    const occ = M.islands.map(() => []);
    for (const a of S.agents) if (a.loc === 'island') occ[a.isl].push(a);
    S._occ = occ;
  };

  Sim.hourly = function () {
    Sim.rebuildOccupants();
    for (const a of S.agents) {
      if (a.loc === 'island' || a.loc === 'ship') Sim.agentHour(a);
      else if (a.loc === 'prison') Sim.prisonHour(a);
    }
    for (const u of S.units.slice()) {
      if (!S.U[u.id]) continue;
      Sim.unitHour(u);
    }
    for (const sh of S.ships.slice()) if (sh.state === 'sailing') Sim.seaHazards(sh);
    Sim.islandEncounters();
    Sim.eventsHour();
  };

  Sim.daily = function () {
    Sim.dailyWorld();
  };

  OP.Sim = Sim;
})();
