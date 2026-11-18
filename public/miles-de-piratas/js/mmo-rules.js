/* MILESDEPIRATAS - reglas compartidas entre el cliente y el servidor.
   El servidor ejecuta este mismo archivo (vm) y es el único que decide: el cliente solo lo usa
   para predecir su propio movimiento y para mostrar textos, precios y progreso. */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const T = OP.T;
  const MMO = (OP.MMO = {});

  // ---------- Constantes de juego ----------
  MMO.TICK_MS = 50;                 // 20 ticks por segundo en el servidor
  MMO.WALK_SPEED = 3.0;             // casillas por segundo a pie
  MMO.SAIL_MULT = 1.6;              // velocidad en barco = velocidad del barco (data.js) x esto
  MMO.MELEE_RANGE = 2.0;            // alcance cuerpo a cuerpo (casillas)
  MMO.NAVAL_RANGE = 3.2;            // alcance de cañón entre barcos
  MMO.VIEW_X = 72; MMO.VIEW_Y = 44; // radio de interés (lo que el servidor te manda)
  MMO.GATE_RADIUS = 4.5;            // distancia para usar Reverse Mountain, Knock Up, etc.
  MMO.EXPLORE_CD = 15000;
  MMO.TRAIN_CD = 20000;
  MMO.PVP_MIN_LVL = 5;              // protección de novatos
  MMO.MAX_LVL = 100;
  MMO.RESPAWN_MS = 6000;
  MMO.CREW_MAX = 10;

  // ---------- Curva de experiencia (jugadores) ----------
  // NPC (original): 10·nv^1.3 + 10 → nivel 10 con ~210 EXP. Jugador: 80·nv^1.9 + 20 → nivel 10 pide ~6.400 EXP.
  // Los NPC siguen con su curva original para no romper el equilibrio de la simulación.
  // Curva más suave (antes 80·nv^1,9): nivel 5 ≈ 850 EXP, nivel 10 ≈ 2.800, nivel 20 ≈ 9.500
  MMO.xpNeed = (lvl) => Math.round(50 * Math.pow(lvl, 1.75) + 30);
  MMO.CREW_NPC_MAX = 4;
  // Flotas: con la tripulación principal llena (10), el capitán puede tener hasta 3 flotas de 10 bajo su mando.
  // Cada flota tiene su propio capitán, con el título de "Almirante de Flota".
  MMO.FLEET_MAX = 3;
  MMO.FLEET_SIZE = 10;
  MMO.RANKING_MIN = 5e6;      // recompensa total mínima para salir en el ranking de tripulaciones
  // Yonkou entre los jugadores: tripulaciones con flota y al menos esta recompensa total (las 4 mejores)
  MMO.YONKOU_MIN = 1e9;
  // Territorios: islas que pueden controlar un Yonkou o el Rey de los Piratas
  MMO.TERRITORY_MAX = { yonkou: 4, king: 8 };
  MMO.TRIBUTE_MS = 10 * 60000;
  // Impel Down: un pirata con más de esta recompensa derrotado por un marine va preso
  MMO.PRISON_BOUNTY = 8e7;
  MMO.PRISON_GUARDS = 3;
  // Ejecución pública: un pirata con esta recompensa o más derrotado por un marine va a la plataforma de ejecución.
  // Dónde está la plataforma: en la plaza de esta isla (dx/dy = desplazamiento desde su centro, en casillas).
  // También se puede fijar a mano al arrancar el servidor con OPW_EXEC_X y OPW_EXEC_Y (coordenadas del mapa).
  MMO.EXECUTION = { bounty: 5e8, ms: 60000, holdMs: 3000, range: 2.6, island: 'marineford', dx: 0, dy: 3, wordsMax: 140 };
  // Traición: dura este tiempo (los cazarrecompensas te persiguen)
  MMO.TRAITOR_MS = 30 * 60000;
  MMO.BOARD_RANGE = 3;
  // Altos mandos de la Marina para JUGADORES: puestos únicos y limitados que reparte el servidor según el desempeño
  MMO.TOP_RANKS = {
    9: { slots: 1, merit: 5000, lvl: 70 },   // Almirante General
    8: { slots: 3, merit: 3000, lvl: 55 },   // Almirantes
    7: { slots: 6, merit: 1500, lvl: 40 }    // Vicealmirantes
  };
  MMO.AUTO_RANK_MAX = 6;   // hasta Contraalmirante se asciende solo; por encima hace falta un puesto libre
  // puntuación de desempeño: méritos, capturas (cuántas y cuánto valían), nivel y actividad
  MMO.marineScore = function (p) {
    const h = p.honor || {};
    const st = p.stats || {};
    return Math.round((p.merit || 0) + (h.caps || 0) * 4 + (h.value || 0) / 2e6 + (h.players || 0) * 15 + (p.lvl || 1) * 3 + (st.piratesBeaten || 0) / 5);
  };
  // Personalización del navío legendario (colores permitidos; el servidor solo acepta estos)
  MMO.SHIP_COLORS = ['#a0632e', '#5a3a1e', '#2a2a30', '#f2f0ea', '#b8282a', '#2a5ab8', '#2a8a4a', '#d8a020', '#7a3aa8', '#e07a2a', '#1a7a8a', '#d85a9a'];
  MMO.SAIL_COLORS = ['#111111', '#f4f4f4', '#b8282a', '#2a4a9a', '#2a7a3a', '#3b1a5a', '#d8a020', '#e8d8b0', '#7a1010', '#1a5a6a', '#d85a9a', '#5a5a62'];
  MMO.FLAG_FG = ['#f4f4f4', '#f4d03f', '#e74c3c', '#7fd0ff', '#9be07a', '#111111'];
  MMO.FLAG_SYMS = 6;
  // Órdenes del capitán
  MMO.NPC_ORDERS = {
    follow: { icon: '🚶', name: 'Seguidme', desc: 'Te siguen de isla en isla y pelean a tu lado.' },
    attack: { icon: '⚔️', name: 'Al ataque', desc: 'Te siguen y atacan a cualquier enemigo cercano sin esperar.' },
    stay: { icon: '🛑', name: 'Quedaos aquí', desc: 'Se quedan en esta isla hasta nueva orden.' },
    gather: { icon: '💰', name: 'Buscad tesoros', desc: 'Se quedan en la isla buscando dinero (te lo dan cada minuto, aunque estés lejos).' },
    train: { icon: '🥋', name: 'Entrenad', desc: 'Se quedan en la isla entrenando y suben de nivel.' }
  };
  MMO.PLAYER_ORDERS = {
    regroup: { icon: '📍', name: 'Reuníos conmigo', text: (cap) => 'El capitán ' + cap + ' ordena: ¡reuníos conmigo! (marca en el mapa)' },
    attack: { icon: '⚔️', name: 'Atacad a mi objetivo', text: (cap, t) => 'El capitán ' + cap + ' ordena: ¡atacad a ' + t + '!' },
    free: { icon: '🕊️', name: 'Libertad', text: (cap) => 'El capitán ' + cap + ' os da libertad: haced lo que queráis.' }
  };        // distancia máxima para subir al barco de un compañero
  MMO.WANTED_MIN_ALL = 1e5;   // recompensa mínima para salir en "Todos" del tablón de SE BUSCA
  MMO.WANTED_MIN_SEA = 1e4;   // mínima para salir en la pestaña de un mar   // NPC reclutados como máximo en una tripulación de jugadores
  // Islas con entrenamiento especial de un mar (para las misiones)
  MMO.trainIslands = (sea) => OP.M.islands.filter((I) => I.train && I.sea === sea && !I.hidden);

  // ---------- Misiones iniciales (nivel 1 a 12) ----------
  // 20 misiones: 9 de viaje y exploración (45%), 6 de combate (30%) y 5 de entrenamiento (25%).
  // Las de combate solo cuentan enemigos adecuados a tu nivel (fairKills: hasta 2 niveles por encima y no más de 4 por debajo).
  MMO.QUEST_KINDS = { explore: '🧭', combat: '⚔️', train: '🥋', dream: '⭐', survive: '⏳' };
  // islas de las misiones de supervivencia: se cuenta el tiempo de juego que pasas en ellas sin caer (1 día = 24 min reales)
  MMO.STAY_ISLANDS = ['drum', 'alabasta', 'punkhazard', 'wano'];
  MMO.SIM_PER_DAY = 2880;   // unidades de tiempo de la simulación por día del calendario
  // Dificultad de un NPC frente a ti (por diferencia de nivel; los jefes y los muy buscados siempre son épicos).
  // Cuanto más difícil, más EXP al derrotarlo; las misiones y los contratos piden una dificultad concreta.
  MMO.DIFFS = [
    { key: 'easy', name: 'Fácil', icon: '🟢', color: '#5cc46b', xp: 0.6, stat: 'killsEasy' },
    { key: 'med', name: 'Media', icon: '🟡', color: '#e6c34a', xp: 1, stat: 'killsMed' },
    { key: 'hard', name: 'Difícil', icon: '🟠', color: '#f08a3c', xp: 1.7, stat: 'killsHard' },
    { key: 'epic', name: 'Épica', icon: '🔴', color: '#e2463a', xp: 2.8, stat: 'killsEpic' }
  ];
  MMO.difficultyOf = function (npc, p) {
    const d = (npc.lvl || 1) - (p.lvl || 1);
    if (d >= 5 || npc.rank >= 6 || (npc.bounty || 0) >= 1e8) return 3;
    if (d >= 2) return 2;
    if (d >= -1) return 1;
    return 0;
  };
  MMO.EASY_MIN_GAP = -8;   // un enemigo 9 niveles o más por debajo ya no cuenta ni como "fácil" (para no granjear)
  const EARLY = [
    { id: 'e1', kind: 'explore', text: 'Explora tu isla de origen (tecla E)', stat: 'explores', goal: 1, xp: 40, money: 1500 },
    { id: 'e2', kind: 'train', text: 'Entrena manteniendo T unos segundos', stat: 'trains', goal: 1, xp: 40, money: 1500 },
    { id: 'e3', kind: 'combat', text: 'Derrota a tu primer enemigo (cualquier dificultad)', stat: 'npcKills', goal: 1, xp: 60, money: 2500 },
    { id: 'e4', kind: 'explore', text: 'Navega y desembarca en otra isla', stat: 'visited', goal: 2, xp: 150, money: 4000 },
    { id: 'e5', kind: 'explore', text: 'Explora 5 veces', stat: 'explores', goal: 5, xp: 120, money: 4000 },
    { id: 'e6', kind: 'combat', text: 'Derrota a 4 enemigos en total (de cualquier dificultad)', stat: 'npcKills', goal: 4, xp: 200, money: 6000 },
    { id: 'e7', kind: 'train', text: 'Entrena 5 veces (mantén T: cada 5 s cuenta como una)', stat: 'trains', goal: 5, xp: 200, money: 6000 },
    { id: 'e8', kind: 'explore', text: 'Visita 3 islas distintas', stat: 'visited', goal: 3, xp: 300, money: 8000 },
    { id: 'e9', kind: 'explore', text: 'Encuentra algo explorando (dinero, objetos o un tesoro)', stat: 'finds', goal: 1, xp: 250, money: 5000 },
    { id: 'e10', kind: 'combat', text: 'Derrota a 3 enemigos 🟡 de tu nivel o más fuertes', stat: 'killsMedPlus', goal: 3, xp: 650, money: 14000 },
    { id: 'e11', kind: 'train', text: 'Alcanza el nivel 5', stat: 'lvl', goal: 5, xp: 400, money: 15000 },
    { id: 'e12', kind: 'explore', text: 'Visita 4 islas distintas', stat: 'visited', goal: 4, xp: 600, money: 15000 },
    { id: 'e13', kind: 'explore', text: 'Visita una isla con base de la Marina', stat: 'visitBase', goal: 1, xp: 500, money: 12000 },
    { id: 'e14', kind: 'combat', text: 'Derrota a 10 enemigos en total', stat: 'npcKills', goal: 10, xp: 1200, money: 25000 },
    { id: 'e15', kind: 'train', text: 'Entrena en una isla con entrenamiento especial 🥋', stat: 'specialTrains', goal: 1, xp: 900, money: 20000 },
    { id: 'e16', kind: 'explore', text: 'Explora 25 veces', stat: 'explores', goal: 25, xp: 1000, money: 30000 },
    { id: 'e17', kind: 'combat', text: 'Cumple un contrato (Misiones → 📜 Contratos)', stat: 'contracts', goal: 1, xp: 2500, money: 50000 },
    { id: 'e18', kind: 'explore', text: 'Visita 6 islas distintas', stat: 'visited', goal: 6, xp: 1500, money: 40000 },
    { id: 'e19', kind: 'combat', text: 'Derrota a 3 enemigos 🟠 Difíciles o 🔴 Épicos (los contratos te dicen dónde)', stat: 'killsHardPlus', goal: 3, xp: 4500, money: 80000 },
    { id: 'e20', kind: 'train', text: 'Alcanza el nivel 12', stat: 'lvl', goal: 12, xp: 3000, money: 80000 }
  ];
  MMO.EARLY_QUESTS = EARLY;
  // Después del Sueño: misiones variadas y más duras (a partir de nivel 12)
  const VARIED = [
    { id: 'v1', kind: 'combat', text: 'Cumple 3 contratos', stat: 'contracts', goal: 3, xp: 12000, money: 200000 },
    { id: 's1', kind: 'survive', text: 'Sobrevive 1 día de juego en la nieve de Isla Drum (si caes allí, vuelve a 0)', stat: 'stay_drum', goal: 1, xp: 10000, money: 250000 },
    { id: 'v2', kind: 'explore', text: 'Encuentra 5 tesoros', stat: 'treasures', goal: 5, xp: 8000, money: 300000 },
    { id: 'v3', kind: 'train', text: 'Entrena en 2 islas con entrenamiento especial', stat: 'trainedAt', goal: 2, xp: 9000, money: 250000 },
    { id: 's2', kind: 'survive', text: 'Aguanta 1 día de juego en el desierto de Alabasta', stat: 'stay_alabasta', goal: 1, xp: 14000, money: 400000 },
    { id: 'v4', kind: 'explore', text: 'Visita 15 islas distintas', stat: 'visited', goal: 15, xp: 12000, money: 500000 },
    { id: 'v5', kind: 'combat', text: 'Derrota a 2 enemigos 🔴 ÉPICOS', stat: 'killsEpic', goal: 2, xp: 30000, money: 900000 },
    { id: 'v6', kind: 'explore', text: 'Llega al Nuevo Mundo', stat: 'zone_newworld', goal: 1, xp: 30000, money: 3000000 },
    { id: 's3', kind: 'survive', text: 'Sobrevive y entrena 2 días de juego en Punk Hazard (entrenar allí cuenta el doble)', stat: 'stay_punkhazard', goal: 2, xp: 60000, money: 2500000 },
    { id: 'v7', kind: 'combat', text: 'Cumple 6 contratos difíciles o épicos', stat: 'contractsHard', goal: 6, xp: 80000, money: 3000000 },
    { id: 'v8', kind: 'train', text: 'Alcanza el nivel 40', stat: 'lvl', goal: 40, xp: 50000, money: 5000000 },
    { id: 's4', kind: 'survive', text: 'Sobrevive 2 días de juego en el país de Wano', stat: 'stay_wano', goal: 2, xp: 150000, money: 8000000 }
  ];

  // ---------- Sueños (obligatorio elegir uno) y sus objetivos ----------
  MMO.DREAM_QUESTS = {
    onepiece: [
      { id: 'op1', text: 'Visita 5 islas distintas', stat: 'visited', goal: 5, xp: 600, money: 20000 },
      { id: 'op2', text: 'Consigue un Log Pose', stat: 'logpose', goal: 1, xp: 500, money: 0 },
      { id: 'op3', text: 'Cruza Reverse Mountain y entra en Paraíso', stat: 'zone_paradise', goal: 1, xp: 4000, money: 200000 },
      { id: 'op4', text: 'Llega al Nuevo Mundo', stat: 'zone_newworld', goal: 1, xp: 30000, money: 5000000 }
    ],
    fama: [
      { id: 'fa1', text: 'Gana tu primer cartel de SE BUSCA', stat: 'bounty', goal: 1, xp: 500, money: 15000 },
      { id: 'fa2', text: 'Alcanza una recompensa de 10.000.000 ฿', stat: 'bounty', goal: 1e7, xp: 3000, money: 100000 },
      { id: 'fa3', text: 'Gana 5 combates contra otros jugadores', stat: 'pvpWins', goal: 5, xp: 6000, money: 300000 },
      { id: 'fa4', text: 'Alcanza una recompensa de 100.000.000 ฿', stat: 'bounty', goal: 1e8, xp: 25000, money: 2000000 }
    ],
    dinero: [
      { id: 'di1', text: 'Encuentra 3 tesoros explorando', stat: 'treasures', goal: 3, xp: 800, money: 30000 },
      { id: 'di2', text: 'Reúne 500.000 ฿', stat: 'money', goal: 5e5, xp: 2500, money: 0 },
      { id: 'di3', text: 'Cómprate una carabela', stat: 'shipTier', goal: 1, xp: 3000, money: 100000 },
      { id: 'di4', text: 'Reúne 20.000.000 ฿', stat: 'money', goal: 2e7, xp: 20000, money: 0 }
    ],
    aventura: [
      { id: 'av1', text: 'Visita 6 islas distintas', stat: 'visited', goal: 6, xp: 900, money: 20000 },
      { id: 'av2', text: 'Explora 40 veces', stat: 'explores', goal: 40, xp: 2500, money: 60000 },
      { id: 'av3', text: 'Sube a la isla del cielo (Skypiea)', stat: 'zone_sky', goal: 1, xp: 9000, money: 400000 },
      { id: 'av4', text: 'Baja a la Isla Gyojin', stat: 'zone_deep', goal: 1, xp: 15000, money: 800000 }
    ],
    espadachin: [
      { id: 'es1', text: 'Entrena 10 veces (tecla T)', stat: 'trains', goal: 10, xp: 700, money: 15000 },
      { id: 'es2', text: 'Entrena en el dojo de Villa Shimotsuki', stat: 'train_shimotsuki', goal: 1, xp: 2000, money: 50000 },
      { id: 'es3', text: 'Derrota a 40 enemigos', stat: 'npcKills', goal: 40, xp: 5000, money: 150000 },
      { id: 'es4', text: 'Gana 10 duelos contra jugadores', stat: 'pvpWins', goal: 10, xp: 20000, money: 1000000 }
    ],
    allblue: [
      { id: 'ab1', text: 'Visita el Baratie', stat: 'visit_baratie', goal: 1, xp: 800, money: 20000 },
      { id: 'ab2', text: 'Come 10 platos de carne', stat: 'meals', goal: 10, xp: 1500, money: 30000 },
      { id: 'ab3', text: 'Visita islas de 2 mares distintos', stat: 'blues', goal: 2, xp: 12000, money: 500000 },
      { id: 'ab4', text: 'Llega al Nuevo Mundo', stat: 'zone_newworld', goal: 1, xp: 30000, money: 3000000 }
    ],
    mapa: [
      { id: 'ma1', text: 'Visita 4 islas distintas', stat: 'visited', goal: 4, xp: 500, money: 15000 },
      { id: 'ma2', text: 'Visita 12 islas distintas', stat: 'visited', goal: 12, xp: 5000, money: 150000 },
      { id: 'ma3', text: 'Cruza Reverse Mountain y entra en Paraíso', stat: 'zone_paradise', goal: 1, xp: 12000, money: 500000 },
      { id: 'ma4', text: 'Visita 30 islas distintas', stat: 'visited', goal: 30, xp: 40000, money: 4000000 }
    ],
    justicia: [
      { id: 'ju1', text: 'Derrota a 5 piratas', stat: 'piratesBeaten', goal: 5, xp: 700, money: 20000 },
      { id: 'ju2', text: 'Derrota a 25 piratas', stat: 'piratesBeaten', goal: 25, xp: 4000, money: 120000 },
      { id: 'ju3', text: 'Derrota a un jugador pirata con recompensa', stat: 'wantedPlayersBeaten', goal: 1, xp: 6000, money: 300000 },
      { id: 'ju4', text: 'Derrota a 100 piratas', stat: 'piratesBeaten', goal: 100, xp: 25000, money: 2000000 }
    ],
    ascender: [
      { id: 'as1', text: 'Asciende a Marinero', stat: 'rank', goal: 1, xp: 500, money: 15000 },
      { id: 'as2', text: 'Asciende a Sargento', stat: 'rank', goal: 2, xp: 2500, money: 60000 },
      { id: 'as3', text: 'Asciende a Teniente', stat: 'rank', goal: 3, xp: 8000, money: 250000 },
      { id: 'as4', text: 'Asciende a Capitán', stat: 'rank', goal: 4, xp: 25000, money: 1000000 }
    ],
    proteger: [
      { id: 'pr1', text: 'Derrota a 5 enemigos en islas con base de la Marina', stat: 'baseDefends', goal: 5, xp: 900, money: 25000 },
      { id: 'pr2', text: 'Visita 5 islas distintas', stat: 'visited', goal: 5, xp: 1200, money: 30000 },
      { id: 'pr3', text: 'Derrota a 30 enemigos en islas con base', stat: 'baseDefends', goal: 30, xp: 7000, money: 250000 },
      { id: 'pr4', text: 'Llega a Marineford', stat: 'visit_marineford', goal: 1, xp: 20000, money: 1500000 }
    ],
    poder: [
      { id: 'po1', text: 'Alcanza el nivel 5', stat: 'lvl', goal: 5, xp: 400, money: 15000 },
      { id: 'po2', text: 'Alcanza el nivel 12', stat: 'lvl', goal: 12, xp: 3000, money: 100000 },
      { id: 'po3', text: 'Gana 5 combates contra jugadores', stat: 'pvpWins', goal: 5, xp: 6000, money: 250000 },
      { id: 'po4', text: 'Alcanza el nivel 30', stat: 'lvl', goal: 30, xp: 30000, money: 2000000 }
    ]
  };
  MMO.questsFor = (dream) => EARLY.concat((MMO.DREAM_QUESTS[dream] || []).map((q) => Object.assign({ kind: 'dream' }, q)), VARIED.filter((v) => !(MMO.DREAM_QUESTS[dream] || []).some((d) => d.stat === v.stat && d.goal === v.goal)));
  MMO.dreamsFor = (faction) => (faction === 'marine' ? OP.DREAMS_MARINE : OP.DREAMS_PIRATE);
  MMO.statValue = function (p, stat) {
    const st = p.stats || {};
    if (stat === 'visited') return (p.visited || []).length;
    if (stat === 'lvl') return p.lvl;
    if (stat === 'money') return p.money;
    if (stat === 'bounty') return p.bounty;
    if (stat === 'rank') return p.rank;
    if (stat === 'logpose') return p.logpose ? 1 : 0;
    if (stat === 'shipTier') return Math.max(0, ...(p.ships || ['bote']).map((s) => OP.SHIP_ORDER.indexOf(s)));
    if (stat === 'blues') {
      const seas = new Set();
      for (const idx of p.visited || []) { const I = OP.M && OP.M.islands[idx]; if (I && OP.BLUES.indexOf(I.sea) >= 0) seas.add(I.sea); }
      return seas.size;
    }
    if (stat === 'visitBase') return (p.visited || []).filter((i) => OP.M && OP.M.islands[i] && OP.M.islands[i].base).length;
    if (stat === 'trainedAt') return (p.trainedAt || []).length;
    if (stat === 'killsMedPlus') return (st.killsMed || 0) + (st.killsHard || 0) + (st.killsEpic || 0);
    if (stat === 'killsHardPlus') return (st.killsHard || 0) + (st.killsEpic || 0);
    if (stat.indexOf('stay_') === 0) return Math.floor(((p.stays || {})[stat.slice(5)] || 0) * 10) / 10;   // días (con un decimal)
    if (stat.indexOf('zone_') === 0) return (p.zones || []).indexOf(stat.slice(5)) >= 0 ? 1 : 0;
    if (stat.indexOf('visit_') === 0) { const I = OP.M && OP.M.byId[stat.slice(6)]; return I && (p.visited || []).indexOf(I.idx) >= 0 ? 1 : 0; }
    if (stat.indexOf('train_') === 0) return (p.trainedAt || []).indexOf(stat.slice(6)) >= 0 ? 1 : 0;
    return st[stat] || 0;
  };
  MMO.currentQuest = function (p) {
    const done = p.questsDone || [];
    for (const q of MMO.questsFor(p.dream)) if (done.indexOf(q.id) < 0) return q;
    return null;
  };

  // ---------- Rasgos de personalidad ----------
  MMO.TRAITS = {
    valiente: { name: 'Valiente', icon: '🦁', desc: '+12% de daño cuando le queda menos de la mitad de la vida.' },
    mentiroso: { name: 'Mentiroso', icon: '🤥', desc: '+15% de berries en los botines.' },
    tonto: { name: 'Tonto', icon: '🌀', desc: '-15% de EXP al explorar, pero +8% de vida máxima.' },
    indeciso: { name: 'Indeciso', icon: '❔', desc: '+10% de tiempo entre ataques, pero +6% de esquiva.' },
    curioso: { name: 'Curioso', icon: '🔍', desc: '+20% de EXP al explorar.' },
    gloton: { name: 'Glotón', icon: '🍖', desc: 'La comida le cura un 50% más.' },
    leal: { name: 'Leal', icon: '🤝', desc: '+10% de daño con un compañero de tripulación cerca.' },
    codicioso: { name: 'Codicioso', icon: '💰', desc: '+25% de berries en los botines, -5% de EXP.' },
    cauteloso: { name: 'Cauteloso', icon: '🛡️', desc: '+8% de esquiva.' },
    impulsivo: { name: 'Impulsivo', icon: '⚡', desc: '-10% de tiempo entre ataques, -4% de esquiva.' }
  };
  MMO.RANDOM_TRAITS = ['valiente', 'mentiroso', 'curioso', 'gloton', 'leal', 'codicioso', 'cauteloso', 'impulsivo', 'tonto', 'indeciso'];
  MMO.has = (p, t) => (p.traits || []).indexOf(t) >= 0;

  // ---------- Islas de aparición especiales ----------
  MMO.SPAWN_PERKS = {
    chaos: { text: 'x2 EXP durante 8 minutos y +10% de salud base', buff: { mult: 2, ms: 8 * 60000 }, mods: { hp: 1.10 }, traits: [] },
    poche: { text: 'x2 EXP durante 20 minutos, +20% de fuerza base y rasgo Valiente', buff: { mult: 2, ms: 20 * 60000 }, mods: { str: 1.20 }, traits: ['valiente'] },
    fetu: { text: 'x2 EXP durante 15 minutos y +15% de velocidad base', buff: { mult: 2, ms: 15 * 60000 }, mods: { spd: 1.15 }, traits: [] },
    tomas: { text: 'x20 EXP durante 1 minuto y rasgo Mentiroso', buff: { mult: 20, ms: 60000 }, mods: {}, traits: ['mentiroso'] },
    perkin: { text: 'Rasgos Tonto e Indeciso y +30% de poder base', buff: null, mods: { power: 1.30 }, traits: ['tonto', 'indeciso'] }
  };

  // ---------- Tienda ----------
  MMO.SHOP = {
    vendas: { name: 'Vendas', icon: '🩹', price: 250, desc: 'Cura un 15% de la vida.', where: (I) => I.pop >= 50 },
    carne: { name: 'Carne asada', icon: '🍖', price: 600, desc: 'Cura un 35% de la vida.', where: (I) => I.pop >= 50 },
    logpose: { name: 'Log Pose', icon: '🧭', price: 150000, desc: 'Imprescindible para entrar en la Grand Line.', where: (I) => !!I.logpose, once: true },
    carabela: { name: 'Carabela', icon: '⛵', price: 1500000, ship: 'carabela', desc: 'Barco para 6. Necesario para cruzar Reverse Mountain.', where: (I) => I.pop >= 2000 },
    sword1: { name: 'Espada común', icon: '🗡️', price: 60000, sword: 1, desc: 'Una espada sencilla de herrero (+5% de poder).', where: (I) => I.pop >= 1500 },
    sword2: { name: 'Espada rara', icon: '🗡️', price: 450000, sword: 2, desc: 'Forjada por un buen herrero (+12% de poder).', where: (I) => I.pop >= 5000 || !!I.shipyard },
    sword3: { name: 'Espada épica', icon: '⚔️', price: 3500000, sword: 3, desc: 'Una hoja famosa (+22% de poder).', where: (I) => !!I.shipyard || !!I.train },
    bergantin: { name: 'Bergantín', icon: '⛵', price: 8000000, ship: 'bergantin', desc: 'Rápido y resistente (para 10).', where: (I) => !!(I.logpose || I.shipyard) },
    galeon: { name: 'Galeón', icon: '🚢', price: 30000000, ship: 'galeon', desc: 'Gran barco de guerra (para 24).', where: (I) => !!I.shipyard },
    legendario: { name: 'Navío legendario', icon: '🚢', price: 120000000, ship: 'legendario', desc: 'El barco más rápido del mar. PERSONALIZABLE: color del casco, de las velas y tu propia bandera pirata.', where: (I) => !!I.shipyard },
    notifier: { name: 'Fruit Notifier', icon: '🔔', price: 300000000, desc: 'Objeto de lujo: te avisa al instante cuando aparece una Fruta del Diablo en el mundo, con su nombre, el mar y la isla. Muy pocos pueden pagarlo.', where: (I) => !!I.shipyard || I.pop >= 20000, once: true },
    coating: { name: 'Recubrimiento del barco', icon: '🫧', price: 5000000, desc: 'Permite bajar a la Isla Gyojin y cruzar al Nuevo Mundo.', where: (I) => !!I.coating, once: true }
  };

  // ---------- Frutas del Diablo: habilidades (tecla Q) ----------
  // Cada tipo de fruta tiene una habilidad base; las frutas conocidas tienen la suya propia.
  // Para añadir una fruta nueva: añádela a OP.FRUITS (data.js) y, si quieres, su habilidad aquí abajo.
  //   kind 'ranged': golpe a distancia a un objetivo · 'aoe': golpea a todos los enemigos alrededor · 'buff': potencia tus golpes un tiempo
  MMO.FRUIT_PICKUP_RANGE = 2.2;
  MMO.FRUIT_BAG_MAX = 3;
  MMO.ABILITY_BASE = {
    Paramecia: { name: 'Técnica de fruta', kind: 'ranged', range: 5, mult: 1.7, cd: 6000, color: '#ffd23f' },
    Zoan: { name: 'Forma bestia', kind: 'buff', mult: 1.35, dur: 10000, cd: 25000, color: '#ff9a3c' },
    Logia: { name: 'Estallido elemental', kind: 'aoe', radius: 3, mult: 1.25, cd: 10000, color: '#7fdcff' }
  };
  MMO.ABILITY_BY_FRUIT = {   // por clave fija de la fruta (OP.FRUITS[i].key)
    gomu: { name: 'Pistolón de Goma', kind: 'ranged', range: 6, mult: 2.0, cd: 5000, color: '#ffd23f' },
    bara: { name: 'Cañón Troceado', kind: 'ranged', range: 5, mult: 1.6, cd: 5500, color: '#e0b0ff' },
    bomu: { name: 'Cañón Explosivo', kind: 'ranged', range: 6, mult: 1.8, cd: 6500, color: '#ff8a3c' },
    ope: { name: 'Sala: Intercambio', kind: 'ranged', range: 7, mult: 1.9, cd: 6000, color: '#7fe0ff' },
    ito: { name: 'Hilos al Rojo', kind: 'ranged', range: 7, mult: 2.0, cd: 7000, color: '#ff5ab0' },
    gura: { name: 'Gran Terremoto', kind: 'aoe', radius: 4.5, mult: 2.0, cd: 12000, color: '#f4f4f4' },
    mera: { name: 'Puño Llameante', kind: 'aoe', radius: 3.5, mult: 1.6, cd: 9000, color: '#ff6a2a' },
    hie: { name: 'Era Glacial', kind: 'aoe', radius: 3.5, mult: 1.5, cd: 9000, color: '#bfe8ff' },
    pika: { name: 'Lluvia de Luz', kind: 'ranged', range: 8, mult: 2.2, cd: 7000, color: '#fff27a' },
    magu: { name: 'Gran Erupción', kind: 'aoe', radius: 3.5, mult: 2.0, cd: 11000, color: '#ff3a1a' },
    goro: { name: 'Martillo del Trueno', kind: 'aoe', radius: 4, mult: 1.8, cd: 10000, color: '#9fd0ff' },
    yami: { name: 'Agujero Negro', kind: 'aoe', radius: 3, mult: 1.7, cd: 10000, color: '#6a3aa0' },
    suna: { name: 'Tormenta de Arena', kind: 'aoe', radius: 3.5, mult: 1.4, cd: 9000, color: '#e8c87a' },
    tori: { name: 'Llamas del Fénix', kind: 'buff', mult: 1.3, dur: 10000, heal: 0.3, cd: 25000, color: '#5ab0ff' },
    uo: { name: 'Aliento de Dragón', kind: 'aoe', radius: 4, mult: 1.9, cd: 11000, color: '#ff7a3a' }
  };
  MMO.abilityOf = function (fid) {
    const F = fid >= 0 ? OP.FRUITS[fid] : null;
    if (!F) return null;
    // sin técnica propia: la genérica de su tipo, pero con el COLOR de la fruta (una fruta morada lanza un destello morado)
    const own = F.look && F.look[0] ? { color: F.look[0] } : {};
    return Object.assign({}, MMO.ABILITY_BASE[F.type] || MMO.ABILITY_BASE.Paramecia, own, MMO.ABILITY_BY_FRUIT[F.key] || {});
  };

  // ---------- Estadísticas del jugador ----------
  const TALENT_MULT = { 'Espadachín': 1.12, 'Luchador': 1.08, 'Fuerte': 1.05, 'Asesino': 1.06 };
  MMO.stats = function (p) {
    const m = p.mods || {};
    const z = p.zoanOn ? MMO.ZOAN : null;   // transformado (Zoan): más fuerza, velocidad y vida
    return {
      str: Math.round(p.baseStr * (m.str || 1) * (z ? z.str : 1)),
      spd: Math.round(p.baseSpd * (m.spd || 1) * (z ? z.spd : 1)),
      maxHp: Math.round(p.baseHp * (m.hp || 1) * (MMO.has(p, 'tonto') ? 1.08 : 1) * (p.king ? MMO.KING.hp : 1) * (z ? z.hp : 1))
    };
  };
  // El Rey de los Piratas (solo un jugador; nunca un NPC): mucho más duro de derrotar y casi imposible de capturar
  MMO.KING = { hp: 2.2, power: 1.5, dodge: 0.08, escape: 0.7 };
  // Entrenamiento con prioridad: qué mejora cada vez que el entrenamiento sale bien
  MMO.TRAIN_FOCUS = {
    str: { icon: '💪', name: 'Fuerza' }, spd: { icon: '💨', name: 'Velocidad' },
    power: { icon: '🔥', name: 'Poder' }, hp: { icon: '❤️', name: 'Vida' }
  };
  MMO.TRAIN_POWER_MAX = 0.6;   // como mucho +60% de poder por entrenar "Poder"
  // Entrenamiento continuo (mantener T): la prioridad sube 0,25 puntos por segundo; las otras tres, 0,01.
  // Un punto de Vida = 4 PV. En islas de entrenamiento especial 🥋, x1,5. Hay un tope de puntos entrenados según tu nivel.
  MMO.TRAIN_HOLD = { rate: 0.25, other: 0.01, hpPerPt: 4, islandBonus: 1.5, capBase: 20, capPerLvl: 6, xpEveryMs: 2000, countEveryMs: 5000 };
  MMO.trainCap = (p) => MMO.TRAIN_HOLD.capBase + (p.lvl || 1) * MMO.TRAIN_HOLD.capPerLvl;
  // Entrenamiento especial visible: qué objeto lleva el personaje según la isla (los de "carga" dejan caminar despacio)
  MMO.CARRY_PROPS = ['shell', 'logs'];
  MMO.trainPropOf = function (I) {
    if (!I || !I.train) return '';
    const l = I.train.label.toLowerCase();
    if (l.indexOf('tortuga') >= 0) return 'shell';
    if (l.indexOf('nieve') >= 0) return 'logs';
    if (l.indexOf('espada') >= 0) return 'sword';
    if (l.indexOf('lanza') >= 0) return 'spear';
    if (l.indexOf('gigante') >= 0) return 'boulder';
    if (l.indexOf('cascada') >= 0) return 'waterfall';
    if (l.indexOf('cielo') >= 0) return 'meditate';
    return 'weights';   // artes marciales, Coliseo...
  };
  const trained = (p, k) => (p.trained && p.trained[k]) || 0;
  // Poder: multiplica el daño de las técnicas de la fruta · Velocidad: más rápido andando (y atacando, por la velocidad)
  MMO.fruitMul = (p) => 1 + trained(p, 'power') * 0.005;
  MMO.walkMul = (p) => (1 + Math.min(0.5, trained(p, 'spd') * 0.004)) * (p.zoanOn ? MMO.ZOAN.walk : 1) * (p.carrying ? 0.55 : 1);   // transformado: más rápido · cargando peso: más lento
  // Haki: se despierta en islas de entrenamiento especial a partir del nivel 65
  MMO.HAKI_LVL = 30;   // antes 65: casi nadie llegaba a verlo
  MMO.HAKI = [
    { key: 'obs', icon: '👁️', name: 'Haki de Observación', chance: 0.25, power: 1.08, dodge: 0.06, desc: 'Ves venir los golpes: esquivas más' },
    { key: 'arm', icon: '🛡️', name: 'Haki de Armadura', chance: 0.2, power: 1.15, desc: 'Endureces el cuerpo: golpeas más fuerte' },
    { key: 'conq', icon: '⚡', name: 'Haki del Rey', chance: 0.05, power: 1.2, desc: 'Muy pocos nacen con él: impones tu voluntad' }
  ];
  MMO.HAKI_CD = 45000;
  // Haki ACTIVO (teclas Z, X y V). La maestría sube usándolo; con más nivel, más cuerpo cubre la Armadura y más grande es la onda del Rey.
  //   Armadura nv1: brazos · nv2: brazos y piernas · nv3: + torso · nv4: todo el cuerpo
  MMO.HAKI_ACTIVE = {
    arm: { idx: 1, key: 'z', dur: 25000, cd: 45000, dmg: 0.08, def: 0.06 },     // por nivel: +8% de daño y -6% de daño recibido
    obs: { idx: 0, key: 'x', dur: 20000, cd: 40000, dodge: 0.03, range: 18 },  // ves siluetas a través de todo; esquivas más
    conq: { idx: 2, key: 'v', cd: 60000, radius: 4, radiusPerLvl: 1.6, stunMs: 1500, stunPerLvl: 500 }
  };
  MMO.HAKI_MASTERY = [0, 0, 300, 1000, 3000];   // puntos para cada nivel (1-4)
  MMO.hakiLevel = (p, k) => { const xp = (p.hakiXp && p.hakiXp[k]) || 0; let l = 1; for (let i = 2; i <= 4; i++) if (xp >= MMO.HAKI_MASTERY[i]) l = i; return l; };
  MMO.CONQ_BORN = 0.10;   // 10% de los personajes nacen con el Haki del Rey (no se puede entrenar)
  // Transformación Zoan (tecla C): forma híbrida con más fuerza, velocidad y vida mientras dura
  MMO.ZOAN = { dur: 60000, cd: 30000, str: 1.35, spd: 1.2, hp: 1.3, walk: 1.15 };
  MMO.ZOAN_FORMS = {
    inu: { kind: 'wolf', name: 'Lobo' }, neko: { kind: 'leopard', name: 'Leopardo' }, ushi: { kind: 'bison', name: 'Bisonte' },
    zou: { kind: 'elephant', name: 'Elefante' }, tori: { kind: 'phoenix', name: 'Fénix' }, uo: { kind: 'dragon', name: 'Dragón Azul' },
    ryu_alo: { kind: 'dino', name: 'Alosaurio' }, ryu_ptera: { kind: 'ptera', name: 'Pteranodon' }, hebi: { kind: 'snake', name: 'Serpiente' },
    hito: { kind: 'human', name: 'Iluminado' }
  };
  MMO.zoanFormOf = (fid) => { const F = fid >= 0 && OP.FRUITS[fid]; return F && F.type === 'Zoan' ? (MMO.ZOAN_FORMS[F.key] || { kind: 'wolf', name: 'Bestia' }) : null; };

  // ---------- Espadas con rareza ----------
  // Se consiguen al derrotar enemigos, en tesoros, buscando con tu tripulación o en tiendas (solo hasta épica).
  // Una equipada multiplica tu poder; los Espadachines sacan un 10% más. Se pueden vender.
  MMO.SWORD_RARITY = [null,
    { name: 'Común', color: '#b8b8b8', power: 1.05, sell: 20000 },
    { name: 'Rara', color: '#4aa3ff', power: 1.12, sell: 150000 },
    { name: 'Épica', color: '#b06aff', power: 1.22, sell: 1000000 },
    { name: 'Legendaria', color: '#ffb02e', power: 1.35, sell: 4000000 },
    { name: 'Mítica', color: '#ff4a4a', power: 1.5, sell: 12000000 }];
  MMO.SWORD_MAX = 10;
  MMO.SWORD_NAMES = {
    first: ['Katana', 'Sable', 'Hoja', 'Tachi', 'Espada', 'Nodachi', 'Cimitarra', 'Wakizashi', 'Mandoble', 'Florete'],
    second: ['del Viento Gris', 'Marea Roja', 'Lunar', 'del Trueno Lejano', 'Sombra de Coral', 'del Último Faro', 'Escarcha Negra', 'del Kraken', 'Rosa de Hierro', 'del Ocaso',
      'Colmillo de Tiburón', 'del Halcón Blanco', 'Ceniza Ardiente', 'de la Bruma', 'del Rey Marino', 'Perla Oscura', 'Llama Azul', 'del Gigante Dormido', 'Filo de Tormenta', 'del Alba']
  };
  MMO.swordPower = function (p) {
    const sw = p.inv && p.inv.swords && p.inv.swords.find((x) => x.id === p.sword);
    if (!sw) return 1;
    const R = MMO.SWORD_RARITY[sw.r] || MMO.SWORD_RARITY[1];
    return 1 + (R.power - 1) * (p.talent === 'Espadachín' ? 1.1 : 1);
  };
  // Formas de ganar dinero con la tecla J: los piratas saquean el pueblo, los marines patrullan
  MMO.JOB_CD = 6 * 60000;
  // Misma fórmula de poder que la simulación original (Sim.basePower) + multiplicadores del jugador
  MMO.power = function (p) {
    const s = MMO.stats(p);
    let pw = (s.str * 1.2 + s.spd + s.maxHp * 0.12) * (1 + p.lvl * 0.04);
    pw *= TALENT_MULT[p.talent] || 1;
    pw *= (p.mods && p.mods.power) || 1;
    if (p.fruit >= 0 && OP.FRUITS[p.fruit]) pw *= OP.RARITY_MULT[OP.FRUITS[p.fruit].rarity];
    if (p.king) pw *= MMO.KING.power;
    pw *= 1 + Math.min(MMO.TRAIN_POWER_MAX, p.powerTrain || 0);   // entrenamientos de "Poder"
    pw *= MMO.swordPower(p);                                        // espada equipada
    if (p.haki) for (let k = 0; k < 3; k++) if (p.haki[k]) pw *= MMO.HAKI[k].power;
    return pw;
  };
  MMO.attackCooldown = function (p) {
    const s = MMO.stats(p);
    let cd = OP.clamp(950 - s.spd * 3, 450, 950);
    if (MMO.has(p, 'indeciso')) cd *= 1.10;
    if (MMO.has(p, 'impulsivo')) cd *= 0.90;
    return Math.round(cd);
  };
  MMO.dodge = function (p, attackerSpd) {
    const s = MMO.stats(p);
    let d = 0.05 + (s.spd - attackerSpd) / 220;
    if (MMO.has(p, 'indeciso')) d += 0.06;
    if (MMO.has(p, 'cauteloso')) d += 0.08;
    if (MMO.has(p, 'impulsivo')) d -= 0.04;
    if (p.haki && p.haki[0]) d += MMO.HAKI[0].dodge;   // Haki de Observación: ves venir los golpes
    if (p.king) return OP.clamp(d + MMO.KING.dodge, 0.1, 0.38);
    return OP.clamp(d, 0.02, 0.3);
  };
  MMO.shipOf = function (p, crewShip) {
    let best = 'bote';
    for (const s of p.ships || []) if (OP.SHIP_ORDER.indexOf(s) > OP.SHIP_ORDER.indexOf(best)) best = s;
    if (crewShip && OP.SHIP_ORDER.indexOf(crewShip) > OP.SHIP_ORDER.indexOf(best)) best = crewShip;
    if (p.faction === 'marine' && best === 'bote' && p.rank >= 2) best = 'marine';
    return best;
  };
  MMO.sailSpeed = function (p, ship) {
    let sp = (OP.SHIPS[ship] || OP.SHIPS.bote).speed * MMO.SAIL_MULT;
    if (p.talent === 'Navegante') sp *= 1.15;
    return sp;
  };

  // ---------- Ruta del Log Pose (Paraíso → Nuevo Mundo → Laugh Tale) ----------
  // Cada isla pide haber pasado por la anterior y unos mínimos: nivel, fama (recompensa para piratas,
  // méritos x100.000 para marines), poder y tamaño de tripulación (jugadores + NPC + flotas).
  // El Rey de los Piratas no tiene límites; un Yonkou se salta el orden, pero no el resto.
  MMO.LOG_ROUTE = [
    { id: 'twincapes', lvl: 14 }, { id: 'whiskey', lvl: 15 }, { id: 'littlegarden', lvl: 16, power: 150 },
    { id: 'drum', lvl: 18, power: 180 }, { id: 'alabasta', lvl: 20, fame: 5e6, power: 220 }, { id: 'jaya', lvl: 22, fame: 8e6, power: 250 },
    { id: 'skypiea', lvl: 24, fame: 1e7, power: 280, optional: true }, { id: 'water7', lvl: 25, fame: 1.5e7, power: 300, crew: 2 },
    { id: 'thriller', lvl: 28, fame: 2e7, power: 350, crew: 2 }, { id: 'sabaody', lvl: 30, fame: 3e7, power: 400, crew: 3 },
    { id: 'gyojin', lvl: 33, fame: 5e7, power: 450, crew: 3 }, { id: 'punkhazard', lvl: 36, fame: 8e7, power: 520, crew: 3 },
    { id: 'dressrosa', lvl: 40, fame: 1.2e8, power: 600, crew: 4 }, { id: 'zou', lvl: 45, fame: 1.6e8, power: 700, crew: 4 },
    { id: 'wholecake', lvl: 50, fame: 2.2e8, power: 820, crew: 5 }, { id: 'elbaf', lvl: 55, fame: 3e8, power: 950, crew: 5 },
    { id: 'wano', lvl: 60, fame: 4e8, power: 1100, crew: 6 }, { id: 'egghead', lvl: 65, fame: 5e8, power: 1250, crew: 6 },
    { id: 'laughtale', lvl: 80, fame: 1e9, power: 1600, crew: 8, final: true }
  ];
  MMO.routeIndex = {};
  MMO.LOG_ROUTE.forEach((r, k) => { MMO.routeIndex[r.id] = k; });
  // fama para la ruta: recompensa (piratas) o méritos (marines)
  MMO.fameOf = (p) => (p.faction === 'marine' ? (p.merit || 0) * 1e5 : p.bounty || 0);
  // ¿por qué no puede atracar aquí? ('' = puede). p necesita: lvl, faction, bounty/merit, visited, crewSize, king, yonkou
  MMO.routeLock = function (p, I) {
    if (!I || p.king) return '';
    const k = MMO.routeIndex[I.id];
    if (k == null) return '';
    const R = MMO.LOG_ROUTE[k];
    const visited = p.visited || [];
    const miss = [];
    if (p.lvl < R.lvl) miss.push('nivel ' + R.lvl);
    if (R.fame && MMO.fameOf(p) < R.fame) miss.push(p.faction === 'marine' ? OP.dots(Math.ceil(R.fame / 1e5)) + ' méritos' : 'recompensa de ' + OP.fmtBShort(R.fame));
    if (R.power && (p.powerNow || 0) < R.power) miss.push('poder ' + R.power);
    if (R.crew && (p.crewSize || 1) < R.crew) miss.push('tripulación de ' + R.crew);
    // orden del Log Pose: hay que venir de la isla anterior de la ruta (las opcionales no cuentan)
    if (!(p.yonkou && !R.final) && k > 0 && visited.indexOf(I.idx) < 0) {
      let prev = k - 1;
      while (prev > 0 && MMO.LOG_ROUTE[prev].optional) prev--;
      const P = OP.M.byId[MMO.LOG_ROUTE[prev].id];
      if (P && visited.indexOf(P.idx) < 0) miss.unshift('antes pasa por ' + P.name);
    }
    if (R.final && !p.yonkou) {   // Laugh Tale: haber recorrido toda la ruta
      const left = MMO.LOG_ROUTE.filter((r) => !r.optional && !r.final && visited.indexOf((OP.M.byId[r.id] || {}).idx) < 0).length;
      if (left) miss.push('te faltan ' + left + ' islas de la ruta');
    }
    return miss.length ? 'el Log Pose no te deja atracar: necesitas ' + miss.join(', ') + '.' : '';
  };
  // siguiente isla que marca tu Log Pose
  MMO.nextLog = function (p) {
    const visited = p.visited || [];
    for (const r of MMO.LOG_ROUTE) {
      if (r.optional) continue;
      const I = OP.M.byId[r.id];
      if (I && visited.indexOf(I.idx) < 0) return { I, R: r, why: MMO.routeLock(p, I) };
    }
    return null;
  };

  // ---------- Movimiento: ¿se puede pisar esta casilla? ----------
  // p necesita: x, y, boat ('' en tierra), wcls (1 mar, 2 nubes, 3 fondo marino), faction, lvl
  MMO.enter = function (p, nx, ny, ship) {
    const M = OP.M;
    const xi = Math.floor(nx), yi = Math.floor(ny);
    if (xi < 1 || yi < 1 || xi >= M.W - 1 || yi >= M.H - 1) return null;
    const i = yi * M.W + xi;
    const t = M.t[i];
    if (OP.isRed(t)) return null;                      // Red Line: infranqueable
    if (OP.isLand(t)) {
      // desde el barco no se puede atracar en una isla de la ruta del Log Pose sin cumplir sus requisitos
      if (p.boat && M.isl[i] >= 0 && MMO.routeLock(p, M.islands[M.isl[i]])) return null;
      return { boat: '', wcls: p.wcls || 1, land: true };
    }
    const cls = M.clsM[i];
    if (!cls) return null;
    if (p.boat) {
      if (cls !== p.wcls) return null;                 // nubes / fondo marino solo por sus pasos especiales
    } else {
      const from = Math.floor(p.y) * M.W + Math.floor(p.x);
      const fromIsl = M.isl[from];
      if (fromIsl >= 0) {
        const I = M.islands[fromIsl];
        const need = I.sky ? 2 : I.deep ? 3 : 1;
        if (cls !== need) return null;
      }
    }
    if (t === T.CALM) {
      if (p.faction === 'pirate') return null;          // los Reyes Marinos no dejan pasar a los piratas
      if (p.lvl < 14) return null;                       // la Marina necesita nivel 14 para cruzar
    }
    return { boat: p.boat || ship || 'bote', wcls: cls, land: false };
  };
  MMO.blockReason = function (p, nx, ny) {
    const M = OP.M;
    const t = M.t[Math.floor(ny) * M.W + Math.floor(nx)];
    if (p.boat && OP.isLand(t)) {   // ¿isla cerrada por la ruta del Log Pose?
      const Ii = M.isl[Math.floor(ny) * M.W + Math.floor(nx)];
      const why = Ii >= 0 ? MMO.routeLock(p, M.islands[Ii]) : '';
      if (why) return '🧭 ' + M.islands[Ii].name + ': ' + why;
    }
    if (OP.isRed(t)) return 'La Red Line es infranqueable. Busca Reverse Mountain o el túnel de la Isla Gyojin.';
    if (t === T.CALM) return p.faction === 'pirate' ? 'Calm Belt: los Reyes Marinos no dejan pasar a los piratas.' : 'Calm Belt: la Marina necesita nivel 14 para cruzarlo.';
    if (t === T.CLOUDSEA) return 'Al mar de nubes solo se sube con la corriente Knock Up.';
    if (t === T.DEEP) return 'Al fondo del mar solo se baja con un barco recubierto (Sabaody).';
    return '';
  };
  // Un paso de movimiento con deslizamiento por los bordes. dx,dy normalizados.
  MMO.step = function (p, dx, dy, dt, ship) {
    const sp = p.boat ? MMO.sailSpeed(p, p.boat) : MMO.WALK_SPEED * MMO.walkMul(p);
    const L = Math.hypot(dx, dy);
    if (L < 0.01) return false;
    const vx = dx / L * sp * dt, vy = dy / L * sp * dt;
    const tryAt = (nx, ny) => {
      const r = MMO.enter(p, nx, ny, ship);
      if (!r) return false;
      p.x = nx; p.y = ny; p.boat = r.boat; p.wcls = r.wcls;
      return true;
    };
    if (tryAt(p.x + vx, p.y + vy)) return true;
    if (Math.abs(vx) > 1e-4 && tryAt(p.x + vx, p.y)) return true;
    if (Math.abs(vy) > 1e-4 && tryAt(p.x, p.y + vy)) return true;
    return false;
  };

  // ---------- Pasos especiales (Reverse Mountain, Knock Up, Gyojin) ----------
  MMO.GATE_REQ = {
    climb: { lvl: 14, text: 'Nivel 14, un barco mejor que un bote y un Log Pose' },
    sky: { lvl: 16, text: 'Nivel 16' },
    dive: { lvl: 30, text: 'Nivel 30 y un barco recubierto' },
    tunnel: { lvl: 35, text: 'Nivel 35 y un barco recubierto' }
  };
  MMO.nearGate = function (p) {
    const M = OP.M;
    if (!M || !M.gates || !p.boat) return null;
    let best = null;
    for (const g of M.gates) {
      const df = Math.hypot(p.x - g.fx, p.y - g.fy);
      if (df < MMO.GATE_RADIUS && (!best || df < best.d)) best = { g, fwd: true, d: df };
      if (!g.oneWay || g.kind === 'climb') {
        // Reverse Mountain también se baja: desde su salida en el Paraíso se vuelve a cualquiera de los cuatro mares
        const dt = Math.hypot(p.x - g.tx, p.y - g.ty);
        if (dt < MMO.GATE_RADIUS && (!best || dt < best.d)) best = { g, fwd: false, d: dt, back: g.kind === 'climb' };
      }
    }
    return best;
  };
  // los cuatro mares a los que se puede bajar por Reverse Mountain (id del paso → mar)
  MMO.DESCEND = [['east', 'rm_east', 'East Blue'], ['west', 'rm_west', 'West Blue'], ['north', 'rm_north', 'North Blue'], ['south', 'rm_south', 'South Blue']];
  MMO.gateCheck = function (p, g, fwd) {
    const req = MMO.GATE_REQ[g.kind];
    if (!req) return 'Paso desconocido';
    if (!fwd) return '';
    if (p.lvl < req.lvl) return 'Necesitas: ' + req.text + '.';
    if (g.kind === 'climb') {
      if (MMO.shipOf(p) === 'bote') return 'Con un bote no se sube Reverse Mountain: compra una carabela.';
      if (!p.logpose) return 'Necesitas un Log Pose (se vende en Loguetown y otras islas).';
    }
    if ((g.kind === 'dive' || g.kind === 'tunnel') && !p.coated) return 'Tu barco necesita el recubrimiento de Sabaody.';
    return '';
  };

  // ---------- Formatos ----------
  MMO.commas = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  MMO.posterName = (name) => String(name || '').toUpperCase().replace(/\.\s*/g, ' ').trim().split(/\s+/).join('-');
  MMO.zoneOf = function (x, y) {
    const M = OP.M;
    const i = Math.floor(y) * M.W + Math.floor(x);
    const t = M.t[i];
    if (t === T.CLOUDSEA) return 'sky';
    if (t === T.DEEP) return 'deep';
    if (M.isl[i] >= 0) return M.islands[M.isl[i]].sea;
    return OP.zoneAt(x, y);
  };
  MMO.islandAt = function (x, y) {
    const M = OP.M;
    const i = Math.floor(y) * M.W + Math.floor(x);
    return M.isl[i] >= 0 ? M.islands[M.isl[i]] : null;
  };
})();
