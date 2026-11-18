/* El mundo compartido: ejecuta en el servidor los MISMOS archivos del juego original
   (data, map, nav, sim-core, sim-ai, sim-combat) dentro de un contexto vm que imita a window.
   Así el mapa, las islas, los mares, la Red Line, el Calm Belt y toda la vida de los NPC
   son exactamente los de siempre, pero ahora hay una sola copia para todos los jugadores. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['util', 'data', 'nav', 'map', 'sim-core', 'sim-ai', 'sim-combat', 'mmo-rules', 'interiors'];
const SKIP = { A: 1, U: 1, SH: 1, _occ: 1 };

let OP = null;
let db = null;
let acc = 0;
let errors = 0;

function loadOP() {
  const ctx = { console, setTimeout, clearTimeout };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of FILES) {
    const file = path.join(ROOT, 'public', 'miles-de-piratas', 'js', f + '.js');   // los mismos archivos que usa el navegador
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return ctx.OP;
}

function serialize() {
  const S = OP.S;
  const out = {};
  for (const k in S) if (!SKIP[k]) out[k] = S[k];
  out.rng = OP.R.s;
  out.savedAt = Date.now();
  return JSON.stringify(out);
}

// Da vida a las islas nuevas: una tripulación local y algún pirata solitario (los bandidos los pone la sala)
function populateNewIslands(list) {
  const Sim = OP.Sim, R = OP.R;
  for (const I of list) {
    if (I.pop >= 1500) Sim.spawnCrewQuiet(I, [4, 9], [2, 6], R.i(1, 3), 'carabela');
    const a = Sim.createAgent({ faction: 'pirate', isl: I.idx, lvl: R.i(2, 7) });
    const u = Sim.createUnit({ faction: 'pirate', solo: true, isl: I.idx });
    Sim.addMember(u, a);
    Sim.createShip('bote', u, I.idx);
  }
}

// Noticias a un ritmo creíble: la vida de los NPC genera muchísimos sucesos, así que al periódico solo llega
// lo importante y con calma. Las noticias de jugadores (player: true) y las grandes (importancia 4-5) siempre salen.
// Huecos mínimos entre noticias de NPC: importancia 2 cada 3 min, 3 cada 90 s, 4 cada 2 min; y nunca dos de NPC en menos de 40 s.
// Solo las de importancia 5 (el One Piece y poco más) y las de jugadores salen siempre.
const NEWS_GAP = { 2: 180000, 3: 90000, 4: 120000 };
function limitNews() {
  const Sim = OP.Sim;
  if (Sim._newsLimited) return;
  const orig = Sim.news;
  const last = { 2: 0, 3: 0, 4: 0, any: 0 };
  Sim.news = function (cat, text, o) {
    o = o || {};
    const imp = o.imp || 1;
    if (!o.player && imp < 5) {
      const now = Date.now();
      // lo poco importante no se publica; de lo demás, solo si ha pasado un rato desde la última
      if (imp <= 1 || now - last[imp] < NEWS_GAP[imp] || now - last.any < 40000) return { id: -1, t: OP.S.time, cat, text, a: o.a || [], isl: -1, imp, skipped: true };
      last[imp] = now; last.any = now;
    }
    return orig.call(Sim, cat, text, o);
  };
  Sim._newsLimited = true;
}

function init(database, onNews) {
  db = database;
  const t0 = Date.now();
  OP = loadOP();
  OP.Map.build();
  OP.Sim.attachMap();
  let loaded = false;
  const saved = db.getWorld('sim');
  if (saved) {
    try {
      const st = JSON.parse(saved);
      if (st && st.isl && st.isl.length <= OP.M.islands.length && st.agents && st.units) {
        // islas añadidas después de guardar el mundo: se suman sin perder nada de lo que ya existía
        const added = [];
        for (let i = st.isl.length; i < OP.M.islands.length; i++) { added.push(OP.M.islands[i]); }
        OP.Sim.loadState(st);
        for (const I of added) {
          const d = OP.Sim.makeIslandState(I);
          if (I.richTreasure) d.treasure = true;
          st.isl.push(d);
        }
        loaded = true;
        if (added.length) {
          populateNewIslands(added);
          console.log('[mundo] Islas nuevas añadidas al mundo guardado: ' + added.map((I) => I.name).join(', '));
        }
      } else {
        console.warn('[mundo] La partida guardada no encaja con el mapa actual: se crea un mundo nuevo.');
      }
    } catch (e) {
      console.warn('[mundo] No se pudo leer el mundo guardado:', e.message);
    }
  }
  if (!loaded) {
    OP.Sim.newWorld((Date.now() & 0x7fffffff) || 1, null);
    populateNewIslands(OP.M.islands.filter((I) => I.isNew));
    for (const I of OP.M.islands) if (I.richTreasure) OP.S.isl[I.idx].treasure = true;
  }
  OP.S.playerId = 0;
  // recompensas de los NPC: modo (full / reduced / off) y tope de 700 millones, también en mundos ya guardados
  const mode = String(process.env.OPW_NPC_BOUNTY || '').toLowerCase();
  if (mode === 'full' || mode === 'reduced' || mode === 'off') OP.NPC_BOUNTY.mode = mode;
  const before = OP.S.agents.reduce((m, a) => Math.max(m, a.bounty || 0), 0);
  // el Rey de los Piratas solo puede ser un jugador: se retira el título a cualquier NPC que lo tuviera
  if (OP.S.pirateKing) {
    const k = OP.S.A[OP.S.pirateKing];
    if (k && k.epithet === 'Rey de los Piratas') k.epithet = 'El que halló el One Piece';
    OP.S.onePieceFound = OP.S.onePieceFound || OP.S.pirateKing;
    OP.S.pirateKing = 0;
  }
  if (OP.S.playerKing === undefined) OP.S.playerKing = null;
  if ((OP.S.bountyFix || 0) < 3) {   // una vez por mundo: quitar las cifras redondas repetidas
    const n = OP.Sim.spreadRoundBounties();
    OP.S.bountyFix = 3;
    if (n) console.log('[mundo] Recompensas redondas repartidas en cifras variadas: ' + n + ' NPC');
  }
  // menos NPC y nivel 100 solo para unos pocos (también en mundos ya guardados)
  const trimmed = OP.Sim.trimPopulation(OP.NPC_MAX);
  const demoted = OP.Sim.enforceLevelCaps();
  if (trimmed || demoted) console.log('[mundo] NPC: ' + trimmed + ' retirados (tope ' + OP.NPC_MAX + ') · ' + demoted + ' bajados de nivel (nivel alto solo para los mejores)');
  OP.Sim.rebuildOccupants();
  // cada día de juego se revisan los cupos de nivel y el tope de población
  if (!OP.Sim._dailyCaps) {
    const daily = OP.Sim.dailyWorld;
    OP.Sim.dailyWorld = function () { daily.apply(this, arguments); OP.Sim.enforceLevelCaps(); OP.Sim.trimPopulation(Math.round(OP.NPC_MAX * 1.1)); };
    OP.Sim._dailyCaps = true;
  }
  OP.Sim.enforceBountyCaps();
  const after = OP.S.agents.reduce((m, a) => Math.max(m, a.bounty || 0), 0);
  // frutas: en mundos guardados antes, sobran frutas escondidas → se quedan solo las permitidas
  const hiddenF = OP.S.fruits.filter((f) => f.state === 'hidden');
  for (const f of hiddenF.slice(OP.FRUIT_MAX_HIDDEN)) {
    if (OP.S.isl[f.isl] && OP.S.isl[f.isl].fruit === f.id) { OP.S.isl[f.isl].fruit = -1; OP.S.isl[f.isl].fruitRumor = false; }
    f.state = 'none'; f.isl = -1;
  }
  if (hiddenF.length > OP.FRUIT_MAX_HIDDEN) console.log('[mundo] Frutas escondidas reducidas: ' + hiddenF.length + ' → ' + OP.FRUIT_MAX_HIDDEN);
  if (before !== after) console.log('[mundo] Recompensas de NPC ajustadas (modo ' + OP.NPC_BOUNTY.mode + '): máxima ' + OP.fmtB(before) + ' → ' + OP.fmtB(after));
  OP.onNews = onNews || null;
  limitNews();
  console.log('[mundo] ' + (loaded ? 'Mundo cargado' : 'Mundo nuevo creado') + ' en ' + (Date.now() - t0) + ' ms · ' +
    OP.M.islands.length + ' islas · ' + OP.S.agents.length + ' NPC · ' + OP.S.ships.length + ' barcos');
  return OP;
}

// Avanza la simulación de los NPC al mismo ritmo que el juego original a velocidad x1
function advance(dtSec) {
  const Sim = OP.Sim;
  acc += dtSec * Sim.HOURS_PER_SEC;
  let steps = Math.floor(acc / Sim.STEP);
  acc -= steps * Sim.STEP;
  if (steps > 10) { steps = 10; acc = 0; }
  for (let i = 0; i < steps; i++) {
    try {
      Sim.step();
    } catch (e) {
      errors++;
      if (errors < 20 || errors % 100 === 0) console.error('[mundo] Error en la simulación (#' + errors + '):', e && e.stack || e);
    }
  }
}

function save() {
  if (!OP || !OP.S) return;
  const t0 = Date.now();
  const data = serialize();
  db.setWorld('sim', data);
  return { ms: Date.now() - t0, kb: Math.round(data.length / 1024) };
}

module.exports = { init, advance, save, get OP() { return OP; } };
