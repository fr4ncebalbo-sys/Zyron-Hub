/* Lógica del jugador en el servidor: creación, tiradas de aparición, EXP, niveles, daño y recompensas.
   Todo lo que da o quita algo al jugador pasa por aquí y solo se ejecuta en el servidor. */
'use strict';
const crypto = require('crypto');

const rnd = () => crypto.randomInt(0, 1 << 30) / (1 << 30);
const randInt = (a, b) => crypto.randomInt(a, b + 1);
const pick = (arr) => arr[crypto.randomInt(0, arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const BLANK_STATS = () => ({ npcKills: 0, piratesBeaten: 0, pvpWins: 0, pvpLosses: 0, deaths: 0, explores: 0, trains: 0, treasures: 0, meals: 0, baseDefends: 0, wantedPlayersBeaten: 0,
  fairKills: 0, strongKills: 0, specialTrains: 0, finds: 0 });

function create(OP) {
  const MMO = OP.MMO;

  // ---------- Validación de la ficha de creación ----------
  function validateSpec(spec) {
    if (!spec || typeof spec !== 'object') return 'Datos vacíos';
    const name = String(spec.name || '').replace(/\s+/g, ' ').trim();
    if (!/^[\p{L}\p{N} .'-]{3,20}$/u.test(name)) return 'El nombre debe tener entre 3 y 20 letras (se permiten espacios, puntos, guiones y apóstrofos).';
    if (/^(admin|marina|marine|sistema|system|servidor)$/i.test(name)) return 'Ese nombre está reservado.';
    const faction = spec.faction === 'marine' ? 'marine' : spec.faction === 'pirate' ? 'pirate' : null;
    if (!faction) return 'Elige Pirata o Marine.';
    const dreams = MMO.dreamsFor(faction);
    if (!spec.dream || !Object.prototype.hasOwnProperty.call(dreams, spec.dream)) return 'Tienes que elegir tu Sueño.';
    const a = spec.app || {};
    const ok = (list, v) => list.indexOf(v) >= 0;
    if (!ok(OP.SKINS, a.skin) || !ok(OP.HAIR_STYLES, a.hair) || !ok(OP.HAIR_COLORS, a.hairColor) || !ok(OP.CLOTH_COLORS, a.cloth) ||
      !ok(OP.ACCESSORIES, a.acc) || !ok(OP.BUILDS, a.build)) return 'Apariencia no válida.';
    return { name, faction, dream: spec.dream, app: { skin: a.skin, hair: a.hair, hairColor: a.hairColor, cloth: a.cloth, acc: a.acc, build: a.build } };
  }

  // ---------- Tirada de aparición: mar e isla al azar (el jugador NO elige) ----------
  function rollSpawn() {
    const sea = pick(OP.BLUES);
    const list = OP.M.islands.filter((I) => I.sea === sea && !I.hidden && !I.prison && I.land.length > 10);
    return pick(list);
  }
  function rollTraits(guaranteed) {
    const out = guaranteed.slice();
    const pool = MMO.RANDOM_TRAITS.filter((t) => out.indexOf(t) < 0);
    let extra = 2;
    while (extra > 0 && pool.length) {
      const t = pool.splice(crypto.randomInt(0, pool.length), 1)[0];
      if ((t === 'impulsivo' && out.indexOf('indeciso') >= 0) || (t === 'indeciso' && out.indexOf('impulsivo') >= 0)) continue;
      out.push(t); extra--;
    }
    return out;
  }
  function portPos(I) {
    const W = OP.M.W;
    return { x: (I.portLand % W) + 0.5, y: ((I.portLand / W) | 0) + 0.5 };
  }

  function newCharacter(v) {
    const I = rollSpawn();
    const perkKey = I.spawnPerk || null;
    const perk = perkKey ? MMO.SPAWN_PERKS[perkKey] : null;
    const pos = portPos(I);
    const p = {
      v: 3,
      name: v.name, faction: v.faction, dream: v.dream, app: v.app,
      quote: pick(OP.QUOTES[v.dream] || ['El mar me espera.']),
      talent: pick(OP.TALENT_LIST),
      traits: rollTraits(perk ? perk.traits : []),
      perk: perkKey, spawnIsland: I.id, spawnSea: I.sea, home: I.idx,
      lvl: 1, xp: 0, age: 17,
      baseStr: randInt(7, 12), baseSpd: randInt(7, 12), baseHp: randInt(55, 75),
      mods: Object.assign({ hp: 1, str: 1, spd: 1, power: 1 }, perk ? perk.mods : {}),
      hp: 0,
      money: 50000, bounty: 0, rank: 0, merit: 0, fruit: -1, epithet: '',
      x: pos.x, y: pos.y, boat: '', wcls: I.sky ? 2 : I.deep ? 3 : 1,
      inv: { carne: 2, vendas: 3 }, ships: ['bote'], logpose: false, coated: false,
      buffs: perk && perk.buff ? [{ mult: perk.buff.mult, msLeft: perk.buff.ms, src: I.name }] : [],
      visited: [I.idx], zones: [I.sea], trainedAt: [], questsDone: [],
      stats: BLANK_STATS(), log: [], moments: [],
      crewId: 0,
      created: Date.now(), lastSeen: Date.now()
    };
    p.hp = MMO.stats(p).maxHp;
    addLog(p, 'Empezó su aventura en ' + I.name + ' (' + OP.SEAS[I.sea].name + ').');
    return { p, island: I, perk };
  }

  // Rellena campos que falten en personajes guardados con versiones anteriores
  function migrate(p) {
    p.mods = Object.assign({ hp: 1, str: 1, spd: 1, power: 1 }, p.mods || {});
    p.inv = p.inv || {}; p.ships = p.ships || ['bote']; p.buffs = p.buffs || [];
    p.visited = p.visited || []; p.zones = p.zones || []; p.trainedAt = p.trainedAt || []; p.questsDone = p.questsDone || [];
    p.stats = Object.assign(BLANK_STATS(), p.stats || {});
    p.log = p.log || []; p.moments = p.moments || [];
    if (p.fruit == null) p.fruit = -1;
    if (!p.wcls) p.wcls = 1;
    if (!p.age) p.age = 17;
    // misiones iniciales nuevas: quien ya pasó del nivel 12 no tiene que repetirlas
    if (p.lvl >= 12 && !p.questsDone.some((id) => /^e\d+$/.test(id))) for (const q of MMO.EARLY_QUESTS) p.questsDone.push(q.id);
    // historial de la recompensa: lo ganado antes de que existiera se muestra como una sola entrada
    if (p.bounty > 0 && !p.bountyLog) p.bountyLog = [{ at: p.lastSeen || Date.now(), up: p.bounty, total: p.bounty, why: 'recompensa acumulada antes de que existiera este historial', old: true }];
    // Haki del Rey: cada personaje tira UNA vez (al nacer, o al llegar esta versión): el 10% nace con él
    p.haki = p.haki || [false, false, false];
    if (!p.conqRolled) {
      p.conqRolled = true;
      if (!p.haki[2] && Math.random() < MMO.CONQ_BORN) { p.haki[2] = true; p.conqBorn = true; p.conqNew = true; }
      else if (p.haki[2]) p.conqBorn = true;
    }
    p.hakiXp = p.hakiXp || { arm: 0, obs: 0, conq: 0 };
    p.zoanOn = null; p.carrying = false; p.inside = null;   // estados de un momento: al entrar empiezas normal y fuera de los edificios
    p.trained = p.trained || { str: 0, spd: 0, hp: 0, power: 0 };
    // si la curva de EXP se suavizó, la EXP que ya tenía puede alcanzar para subir de nivel
    gainXp(p, 0, { raw: true });
    return p;
  }
  function addLog(p, text) {
    p.log = p.log || [];
    p.log.unshift({ at: Date.now(), t: text });
    if (p.log.length > 20) p.log.length = 20;
  }
  function moment(p, text, score) {
    p.moments = p.moments || [];
    p.moments.push({ at: Date.now(), t: text, s: score });
    p.moments.sort((a, b) => b.s - a.s);
    if (p.moments.length > 8) p.moments.length = 8;
    addLog(p, text);
  }

  // ---------- Experiencia ----------
  function xpMult(p) {
    let m = 1;
    for (const b of p.buffs) if (b.msLeft > 0 && b.mult > m) m = b.mult;
    return m;
  }
  function zoneFactor(p) {
    const zone = MMO.zoneOf(p.x, p.y);
    const cap = OP.ZONE_CAP[zone] || 22;
    if (p.lvl < cap) return 1;
    return Math.max(0.1, 1 - (p.lvl - cap) / 8);
  }
  function gainXp(p, amount, opts) {
    opts = opts || {};
    let a = amount;
    if (!opts.raw) {
      a *= xpMult(p);
      a *= zoneFactor(p);
      if (MMO.has(p, 'codicioso')) a *= 0.95;
    }
    a = Math.max(0, Math.round(a));
    p.xp += a;
    let ups = 0;
    while (p.lvl < MMO.MAX_LVL && p.xp >= MMO.xpNeed(p.lvl)) {
      p.xp -= MMO.xpNeed(p.lvl);
      p.lvl++; ups++;
      levelUpStats(p);
    }
    if (p.lvl >= MMO.MAX_LVL) p.xp = Math.min(p.xp, MMO.xpNeed(MMO.MAX_LVL));
    if (ups && p.lvl % 5 === 0) moment(p, 'Alcanzó el nivel ' + p.lvl, 5 + p.lvl / 2);
    return { gained: a, ups };
  }
  function levelUpStats(p) {
    const t = p.talent;
    p.baseStr += 1 + randInt(0, 2) + (t === 'Fuerte' ? 1 : 0) + (t === 'Luchador' ? randInt(0, 1) : 0);
    p.baseSpd += 1 + randInt(0, 2) + (t === 'Ladrón' || t === 'Asesino' || t === 'Tirador' ? 1 : 0);
    p.baseHp += 6 + randInt(0, 6) + (t === 'Fuerte' ? 3 : 0);
    p.hp = MMO.stats(p).maxHp; // subir de nivel cura del todo
  }

  // ---------- Daño ----------
  function damage(att, def, k) {
    if (rnd() < def.dodge) return { miss: true, dmg: 0 };
    const ratio = clamp(att.power / Math.max(1, def.power), 0.25, 4);
    let dmg = att.power * k * (0.85 + rnd() * 0.3) * Math.sqrt(ratio);
    const crit = rnd() < 0.08;
    if (crit) dmg *= 1.6;
    return { miss: false, crit, dmg: Math.max(1, Math.round(dmg)) };
  }
  function npcDodge(npc, attSpd) { return clamp(0.05 + (npc.spd - attSpd) / 220, 0.02, 0.25); }

  // ---------- Recompensas ----------
  function lootMult(p) {
    let m = 1;
    if (MMO.has(p, 'mentiroso')) m *= 1.15;
    if (MMO.has(p, 'codicioso')) m *= 1.25;
    if (p.talent === 'Ladrón') m *= 1.2;
    return m;
  }
  // Misma idea que Sim.raiseBounty: por encima de lo normal para su nivel sube mucho más despacio.
  // Las HAZAÑAS (derrotar a un oficial importante o a un pirata famoso) suben la recompensa de golpe y no se frenan.
  function raiseBounty(p, amount, deed) {
    if (p.faction !== 'pirate' || amount <= 0) return 0;
    const old = p.bounty;
    if (old === 0) amount = Math.max(amount, 3e4 * (1 + rnd() * 2));   // el primer cartel puede ser pequeño (30.000-90.000 ฿)
    if (!deed) {
      const soft = 3e5 * Math.pow(p.lvl, 2.1) + 2e6;
      if (old + amount > soft) amount = Math.max(0, soft - old) + (old + amount - Math.max(soft, old)) * 0.15;
    }
    amount *= 0.9 + rnd() * 0.25;   // nunca dos subidas iguales
    let nb = old + amount;
    const mag = nb >= 1e8 ? 1e5 : nb >= 1e7 ? 1e4 : nb >= 1e5 ? 1e3 : 1e2;   // cifras como 152.300.000, no siempre redondas
    nb = Math.round(nb / mag) * mag;
    if (nb <= old) return 0;
    p.bounty = nb;
    if (old === 0) moment(p, 'Recibió su primer cartel de SE BUSCA: ' + OP.fmtB(nb), 20);
    return nb - old;
  }
  // Cuánto vale derrotar a un marine según su rango (Vicealmirante ≈ +150 millones)
  const RANK_DEED = [2e5, 4e5, 8e5, 1.6e6, 4e6, 1.2e7, 4e7, 1.5e8, 3.5e8, 6e8];
  function marineDeed(npc) { return RANK_DEED[Math.max(0, Math.min(9, npc.rank || 0))] + npc.lvl * npc.lvl * 2500; }
  // ---------- Espadas ----------
  // rareza al azar: minR..maxR, las altas mucho menos probables; luck sube un poco las probabilidades de las buenas
  function rollRarity(minR, maxR, luck) {
    const w = [0, 60, 26, 10, 3.2, 0.8].map((x, r) => (r < minR || r > maxR ? 0 : x * (r >= 3 ? 1 + (luck || 0) : 1)));
    let t = w.reduce((a, b) => a + b, 0), k = rnd() * t;
    for (let r = 1; r <= 5; r++) { k -= w[r]; if (k <= 0) return r; }
    return minR;
  }
  function makeSword(r) {
    const N = MMO.SWORD_NAMES;
    return { id: crypto.randomBytes(5).toString('hex'), n: pick(N.first) + ' ' + pick(N.second), r };
  }
  // da una espada al jugador (si no le caben, se vende sola)
  function giveSword(p, r) {
    p.inv = p.inv || {};
    p.inv.swords = p.inv.swords || [];
    const sw = makeSword(r);
    if (p.inv.swords.length >= MMO.SWORD_MAX) { const v = MMO.SWORD_RARITY[r].sell; p.money += v; return { sw, sold: v }; }
    p.inv.swords.push(sw);
    if (!p.sword) p.sword = sw.id;   // la primera se equipa sola
    if (r >= 4) moment(p, 'Consiguió la espada ' + MMO.SWORD_RARITY[r].name.toLowerCase() + ' «' + sw.n + '»', 20 + r * 8);
    return { sw, sold: 0 };
  }
  // Cuadro de honor de la Marina: cada captura de un pirata con recompensa (NPC o jugador)
  function recordCapture(p, name, bounty, isPlayer) {
    const h = p.honor = p.honor || { caps: 0, value: 0, players: 0, best: null };
    h.caps++;
    h.value += bounty;
    if (isPlayer) h.players++;
    if (!h.best || bounty > h.best.bounty) h.best = { name, bounty, player: !!isPlayer, at: Date.now() };
    if (h.caps === 1 || bounty >= 1e8) moment(p, 'Capturó a ' + name + ' (' + OP.fmtB(bounty) + ')', 15 + Math.min(40, bounty / 2e7));
  }
  function rankUps(p) {
    const ups = [];
    if (p.faction !== 'marine') return ups;
    // solo hasta Contraalmirante: Vicealmirante, Almirante y Almirante General son puestos limitados (WorldRoom.updateMarineHierarchy)
    while (p.rank < MMO.AUTO_RANK_MAX && p.merit >= OP.RANK_MERIT[p.rank + 1] && p.lvl >= OP.RANK_LEVEL[p.rank + 1]) { p.rank++; ups.push(OP.RANKS[p.rank]); moment(p, 'Ascendió a ' + OP.RANKS[p.rank] + ' de la Marina', 10 + p.rank * 4); }
    return ups;
  }
  // Isla donde reaparecer: la más cercana del mismo mar
  function respawnIsland(p) {
    const zone = MMO.zoneOf(p.x, p.y);
    let best = null, bd = Infinity;
    for (const I of OP.M.islands) {
      if (I.hidden || I.prison || !I.land.length) continue;
      if (I.calm && p.faction === 'pirate') continue;
      const d = Math.hypot(I.dockX - p.x, I.dockY - p.y) + (I.sea === zone ? 0 : 1000);
      if (d < bd) { bd = d; best = I; }
    }
    return best || OP.M.islands[p.home];
  }

  return { validateSpec, newCharacter, migrate, gainXp, damage, npcDodge, lootMult, raiseBounty, marineDeed, rankUps, rollRarity, makeSword, giveSword, recordCapture, respawnIsland, portPos, xpMult, addLog, moment, rnd, randInt, pick, clamp };
}

module.exports = { create };
