/* MILESDEPIRATAS - EQUIPO (datos y reglas COMPARTIDOS entre el servidor y el cliente):
   capas de aspecto (sombrero, cicatriz, complemento), espadas especiales, técnicas de espada,
   accesorios con mejoras y misiones secretas de las casas. El servidor es el único que decide. */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const MMO = OP.MMO;
  const G = (OP.Gear = {});

  // ---------- Nombres antiguos → nombres propios del juego (también limpia noticias e historiales guardados) ----------
  OP.RENAMES = [
    ['Goma Goma no Mi', 'Fruta Goma'], ['Baro Baro no Mi', 'Fruta Trozos'], ['Suve Suve no Mi', 'Fruta Resbalosa'], ['Bomba Bomba no Mi', 'Fruta Bomba'], ['Kila Kila no Mi', 'Fruta Peso'],
    ['Hano Hano no Mi', 'Fruta Brazos'], ['Dora Dora no Mi', 'Fruta Cera'], ['Opa Opa no Mi', 'Fruta Quirófano'], ['Ita Ita no Mi', 'Fruta Hilos'], ['Gure Gure no Mi', 'Fruta Terremoto'],
    ['Barri Barri no Mi', 'Fruta Barrera'], ['Hora Hora no Mi', 'Fruta Fantasma'], ['Yoma Yoma no Mi', 'Fruta Resurrección'], ['Sora Sora no Mi', 'Fruta Almas'], ['Supe Supe no Mi', 'Fruta Cuchillas'],
    ['Kago Kago no Mi', 'Fruta Sombras'], ['Doka Doka no Mi', 'Fruta Veneno'], ['Nikya Nikya no Mi', 'Fruta Repulsión'], ['Mocha Mocha no Mi', 'Fruta Mochi'], ['Hita Hita no Mi', 'Fruta Sabiduría'],
    ['Usho Usho no Mi, Bisonte', 'Fruta Bisonte'], ['Neka Neka no Mi, Leopardo', 'Fruta Leopardo'], ['Ina Ina no Mi, Lobo', 'Fruta Lobo'], ['Toru Toru no Mi, Fénix', 'Fruta Fénix'],
    ['Ua Ua no Mi, Dragón Azul', 'Fruta Dragón Azul'], ['Ryo Ryo no Mi, Alosaurio', 'Fruta Trex'], ['Ryo Ryo no Mi, Pteranodon', 'Fruta Pteranodon'], ['Zoa Zoa no Mi', 'Fruta Elefante'],
    ['Hebo Hebo no Mi, Orochi', 'Fruta Hidra'], ['Mere Mere no Mi', 'Fruta Fuego Fuego'], ['Hia Hia no Mi', 'Fruta Hielo'], ['Piko Piko no Mi', 'Fruta Luz'], ['Mago Mago no Mi', 'Fruta Magma'],
    ['Gori Gori no Mi', 'Fruta Rayo'], ['Sune Sune no Mi', 'Fruta Arena'], ['Moka Moka no Mi', 'Fruta Humo'], ['Yamo Yamo no Mi', 'Fruta Oscuridad'], ['Gasa Gasa no Mi', 'Fruta Gas'],
    ['Yuka Yuka no Mi', 'Fruta Nieve'], ['Numo Numo no Mi', 'Fruta Pantano'],
    ['Isla Dawn', 'Isla Albor'], ['Villa Foosha', 'Villa Brisamar'], ['Reino de Goa', 'Reino de Aurea'], ['Gray Terminal', 'Vertedero Gris'], ['Monte Colubo', 'Monte Serpa'],
    ['Shells Town', 'Puerto Concha'], ['Orange Town', 'Villa Naranjal'], ['Villa Syrup', 'Villa Almíbar'], ['Islas Gecko', 'Islas Lagarto'], ['Baratie', 'Restaurante Olla Flotante'],
    ['Arlong Park', 'Bahía Mandarina'], ['Villa Cocoyashi', 'Villa Cocotal'], ['Islas Conomi', 'Islas Citrina'], ['Loguetown', 'Puerto Umbral'], ['Villa Shimotsuki', 'Villa Escarcha'], ['Shimotsuki', 'Escarcha'],
    ['Reino de Lvneel', 'Reino de Lunaria'], ['Ciudad Lvneel', 'Ciudad Lunaria'], ['Lvneel', 'Lunaria'], ['Flevance', 'Albaplomo'], ['Spider Miles', 'Millas Araña'], ['Isla Minion', 'Isla Cierzo'],
    ['Isla Rubeck', 'Isla Rubedo'], ['Puerto Rubeck', 'Puerto Rubedo'], ['Base Marine Rubeck', 'Base Marine Rubedo'], ['Isla Swallow', 'Isla Vencejo'], ['Ohara', 'Sapientia'],
    ['Base Marine Toroa', 'Base Marine Torreón'], ['Toroa', 'Torreón'], ['Reino de Ilusia', 'Reino de Espejismo'], ['Ciudad de Ilusia', 'Ciudad Espejismo'], ['País de Kano', 'País de Carmín'], ['Capital Kano', 'Capital Carmín'],
    ['Las Camp', 'Campo Cañón'], ['Pueblo Baterilla', 'Pueblo Bermejo'], ['Baterilla', 'Playa Bermeja'], ['Reino de Briss', 'Reino de Copas'], ['Ciudad de Briss', 'Ciudad de Copas'],
    ['Reino de Sorbet', 'Reino de Granizo'], ['Capital Sorbet', 'Capital Granizo'], ['Isla Karate', 'Isla del Puño'], ['Base Marine Centaurea', 'Base Marine Cardo Azul'], ['Centaurea', 'Cardo Azul'],
    ['Cabo Gemelos', 'Cabo del Faro'], ['Whiskey Peak', 'Pico Cardón'], ['Little Garden', 'Jardín Primigenio'], ['Isla Drum', 'Isla Invernia'], ['Montes Drum', 'Montes Invernia'], ['Pueblo Bighorn', 'Pueblo Cuernogrande'], ['Drum', 'Invernia'],
    ['Alabasta', 'Arenara'], ['Alubarna', 'Alcázar Dorado'], ['Nanohana', 'Puerto Azahar'], ['Rainbase', 'Oasis Lluvia'], ['Yuba', 'Pozo Viejo'], ['Erumalu', 'Ruinas Verdes'], ['Desierto Sandy', 'Desierto Ámbar'], ['Río Sandora', 'Río Ámbar'],
    ['Mock Town', 'Villa Burla'], ['Jaya', 'Isla Quimera'], ['Skypiea', 'Celesta'], ['Angel Beach', 'Playa Alba'], ['Upper Yard', 'Alto Bosque'], ['Ruinas de Shandora', 'Ruinas del Sol'],
    ['Water 7', 'Puerto Canales'], ['Astillero Galley-La', 'Astillero Mayor'], ['Aqua Laguna', 'Gran Marea'], ['Enies Lobby', 'Corte del Alba'], ['Base G-8 Navarone', 'Base Fuerte Ocho'], ['Navarone (G-8)', 'Fuerte Ocho'], ['Fortaleza G-8', 'Fortaleza Ocho'], ['Navarone', 'Fuerte Ocho'],
    ['Thriller Bark', 'Barca Espectral'], ['Triángulo Florian', 'Triángulo de Bruma'], ['Archipiélago Sabaody', 'Archipiélago de Burbujas'], ['Parque Sabaody', 'Parque de Burbujas'], ['Sabaody', 'las Burbujas'],
    ['Marineford', 'Bastión Central'], ['Plaza Oris', 'Plaza del Juicio'], ['Amazon Lily', 'Isla Orquídea'], ['Aldea Kuja', 'Aldea Guerrera'], ['Impel Down', 'Prisión Abismo'], ['Isla Gyojin', 'Isla Coralina'], ['Palacio Ryugu', 'Palacio de Perlas'], ['Gyojin', 'Coralina'],
    ['Punk Hazard', 'Isla Dualia'], ['Base G-5', 'Base Cinco'], ['Fortaleza G-5', 'Fortaleza Cinco'], ['Dressrosa', 'Rosaleda'], ['Coliseo Corrida', 'Coliseo Carmesí'], ['Ciudad Kurau', 'Ciudad Trompa'], ['Tribu Mink', 'Tribu Felpa'], ['Zou', 'Lomo del Coloso'],
    ['Whole Cake', 'Confitia'], ['Tottoland', 'Dulcelandia'], ['Elbaf', 'Titania'], ['Wano', 'Kagero'], ['Onigashima', 'Isla del Ogro'], ['Kuri', 'Castaño'], ['Egghead', 'Isla Prisma'], ['Laugh Tale', 'Isla Postrera'],
    // mares, lugares y términos
    ['East, West, North o South Blue', 'del Este, del Oeste, del Norte o del Sur'], ['East Blue', 'Mar del Este'], ['West Blue', 'Mar del Oeste'], ['North Blue', 'Mar del Norte'], ['South Blue', 'Mar del Sur'],
    ['Grand Line', 'Ruta Mayor'], ['GRAND LINE', 'RUTA MAYOR'], ['Red Line', 'Muralla Carmesí'], ['RED LINE', 'MURALLA CARMESÍ'], ['Calm Belt', 'Cinturón Quieto'], ['CALM BELT', 'CINTURÓN QUIETO'],
    ['en Paraíso', 'en el Mar Esmeralda'], ['Paraíso', 'Mar Esmeralda'], ['PARAÍSO', 'MAR ESMERALDA'], ['Nuevo Mundo', 'Mar Indómito'], ['NUEVO MUNDO', 'MAR INDÓMITO'],
    ['Reverse Mountain', 'Monte Contracorriente'], ['Mariejois', 'Ciudadela Sagrada'], ['Dragones Celestiales', 'Linajes Sagrados'], ['Log Pose', 'Compás de Ruta'],
    ['Road Poneglyphs', 'Monolitos de Ruta'], ['Road Poneglyph', 'Monolito de Ruta'], ['Poneglyphs', 'Monolitos'], ['Poneglyph', 'Monolito'], ['One Piece', 'Tesoro Supremo'], ['All Blue', 'Mar Legendario'],
    ['Haki activos', 'Auras activas'], ['Haki activo', 'Aura activa'], ['Haki ACTIVO', 'Aura ACTIVA'], ['HAKI DEL REY', 'AURA DEL REY'], ['Haki', 'Aura'],
    ['Frutas del Diablo', 'Frutas Malditas'], ['Fruta del Diablo', 'Fruta Maldita'], ['frutas del diablo', 'frutas malditas'], ['fruta del diablo', 'fruta maldita'],
    ['Territorios de Yonkou', 'Territorios de los Señores del Mar'], ['Los Yonkou', 'Los Señores del Mar'], ['los Yonkou', 'los Señores del Mar'], ['Yonkou', 'Señor del Mar'],
    ['Los Reyes Marinos', 'Las Bestias Abisales'], ['los Reyes Marinos', 'las Bestias Abisales'], ['Reyes Marinos', 'Bestias Abisales'], ['Reyes marinos', 'Bestias abisales'], ['del Rey Marino', 'de la Bestia Abisal'],
    ['kairoseki', 'hierro sellador'], ['Corriente Knock Up', 'Corriente Ascendente'], ['corriente Knock Up', 'corriente Ascendente'], ['Knock Up', 'Corriente Ascendente'],
    ['Paramecia', 'Arcana'], ['Zoan', 'Bestia'], ['Logia', 'Elemental'], ['Berries', 'Doblones'], ['berries', 'doblones'], ['Berry', 'Doblón'], ['berry', 'doblón'],
    ['Rey de los Piratas', 'Rey de los Mares'], ['Gran Era de la Piratería', 'Gran Era de los Corsarios'], ['Grove', 'Arboleda'], ['Nami-ko', 'Nagisa']
  ].sort((a, b) => b[0].length - a[0].length);
  let renameRx = null;
  const RENAME_MAP = new Map(OP.RENAMES);
  OP.renameText = function (s) {
    if (typeof s !== 'string' || !s) return s;
    if (!renameRx) renameRx = new RegExp('(?<![\\p{L}\\p{N}])(?:' + OP.RENAMES.map((r) => r[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\p{N}])', 'gu');
    return s.replace(renameRx, (m) => RENAME_MAP.get(m) || m);
  };

  // ---------- Capas de aspecto: sombrero, cicatriz y complemento son independientes ----------
  OP.HATS = ['ninguno', 'sombrero de paja', 'tricornio', 'bandana', 'gorro', 'turbante', 'casco vikingo'];
  OP.SCARS = ['ninguna', 'mejilla', 'ojo', 'cruz', 'frente'];
  OP.ACC_ONLY = (OP.ACCESSORIES || []).filter((a) => OP.HATS.indexOf(a) < 0 && a !== 'cicatriz');
  // los personajes antiguos guardan todo en "acc": aquí se reparte en su capa
  OP.splitLook = function (a) {
    const raw = (a && a.acc) || 'ninguno';
    const oldHat = raw !== 'ninguno' && OP.HATS.indexOf(raw) >= 0 ? raw : '', oldScar = raw === 'cicatriz' ? 'mejilla' : '';
    return { hat: (a && a.hat) || oldHat || 'ninguno', scar: (a && a.scar) || oldScar || 'ninguna', acc: oldHat || oldScar ? 'ninguno' : raw };
  };

  // ---------- Espadas especiales (solo por misión secreta; no se venden) ----------
  G.SWORDS = {
    brisa: { n: 'Brisa de Medianoche', r: 2, melee: 0.1, color: '#8fd8ff' },
    colmillo: { n: 'Colmillo de Marea', r: 3, melee: 0.14, color: '#5ae0c0' },
    ascua: { n: 'Ascua Carmesí', r: 3, melee: 0.18, color: '#ff7a4a' },
    aurora: { n: 'Aurora Silente', r: 4, melee: 0.22, color: '#c79aff' },
    eclipse: { n: 'Eclipse Errante', r: 4, melee: 0.28, color: '#5a6aff' },
    soberana: { n: 'Soberana del Horizonte', r: 5, melee: 0.36, color: '#ffd23f' }
  };
  G.BLADE = [null, '#d8dde6', '#a8d4ff', '#d8b8ff', '#ffd98a', '#ff9a9a'];

  // ---------- Técnicas: se pagan con puntos de maestría (T con espada equipada y golpes con espada) ----------
  G.TECH = {
    tajo: { name: 'Tajo Creciente', icon: '🌙', kind: 'ranged', key: '1', lvl: 5, pts: 60, range: 5.5, mult: 2.2, cd: 7000, color: '#bfe8ff', desc: 'Lanza un corte de aire a distancia.' },
    dual: { name: 'Doble Espada', icon: '⚔️', kind: 'stance', stance: 2, lvl: 8, pts: 120, swords: 2, desc: 'Luchas con dos espadas: +22% de daño y golpes un 8% más rápidos.' },
    remolino: { name: 'Remolino de Acero', icon: '🌀', kind: 'aoe', key: '2', lvl: 14, pts: 220, needs: 'dual', radius: 3.2, mult: 1.7, cd: 12000, color: '#e8eef8', desc: 'Giras y cortas a todos los que te rodean.' },
    triple: { name: 'Triple Espada', icon: '🗡️', kind: 'stance', stance: 3, lvl: 20, pts: 400, needs: 'dual', swords: 3, desc: 'Una espada en cada mano y otra en la boca: +45% de daño.' },
    tormenta: { name: 'Tormenta de Tres Filos', icon: '🌪️', kind: 'aoe', key: '3', lvl: 30, pts: 700, needs: 'triple', radius: 4.5, mult: 2.8, cd: 22000, color: '#ffd23f', desc: 'Tu ataque definitivo: un vendaval de cortes.' }
  };
  G.SPECIALS = ['tajo', 'remolino', 'tormenta'];
  G.STANCES = [{ dmg: 1, cd: 1 }, { dmg: 1, cd: 1 }, { dmg: 1.22, cd: 0.92 }, { dmg: 1.45, cd: 0.96 }];
  G.ART_RATE = 1.2;      // puntos por segundo entrenando con T (x1,5 en islas de entrenamiento)
  G.ART_HIT = 0.4;       // puntos por cada golpe con espada

  // ---------- Accesorios: uno por hueco (cuello, brazo y cintura) ----------
  G.SLOTS = { cuello: 'Cuello', brazo: 'Brazo', cintura: 'Cintura' };
  G.ACCS = {
    collar_coral: { name: 'Collar de Coral', icon: '📿', slot: 'cuello', bonus: { hp: 1.08 }, color: '#ff7a8a' },
    amuleto_faro: { name: 'Amuleto del Farero', icon: '🏮', slot: 'cuello', bonus: { hp: 1.15 }, color: '#ffd23f' },
    cadena_ancla: { name: 'Cadena del Ancla', icon: '⚓', slot: 'cuello', bonus: { str: 1.1 }, color: '#d8d8e0' },
    brazal_hierro: { name: 'Brazal de Hierro', icon: '🛡️', slot: 'brazo', bonus: { str: 1.08 }, color: '#9aa0b4' },
    brazal_titan: { name: 'Brazal del Titán', icon: '💪', slot: 'brazo', bonus: { str: 1.16 }, color: '#e8a030' },
    pulsera_viento: { name: 'Pulsera del Viento', icon: '🍃', slot: 'brazo', bonus: { spd: 1.1 }, color: '#7fe0c0' },
    faja_marinera: { name: 'Faja del Marinero', icon: '🎗️', slot: 'cintura', bonus: { spd: 1.08 }, color: '#3fa65a' },
    faja_gaviota: { name: 'Faja de la Gaviota', icon: '🕊️', slot: 'cintura', bonus: { spd: 1.16 }, color: '#f4f4f4' },
    cinturon_roble: { name: 'Cinturón de Roble', icon: '🌳', slot: 'cintura', bonus: { hp: 1.1, str: 1.04 }, color: '#8a5a2a' }
  };
  const BONUS_NAME = { hp: 'vida', str: 'fuerza', spd: 'velocidad' };
  G.bonusText = (A) => Object.keys(A.bonus).map((k) => '+' + Math.round((A.bonus[k] - 1) * 100) + '% ' + BONUS_NAME[k]).join(' · ');

  // ---------- Misiones secretas: un vecino en la primera casa de cada isla ----------
  const A = (skin, hair, hairColor, cloth, acc, build) => ({ skin, hair, hairColor, cloth, acc: acc || 'ninguno', build: build || 'normal' });
  const Q = (id, isl, npc, app, lvl, stat, goal, task, reward, hello) => ({ id, isl, npc, app, lvl, stat, goal, task, reward, hello });
  G.SECRETS = [
    Q('s_faja', 'orange', 'Marta la Remendona', A('#eebd94', 'moño', '#8f9aa6', '#3fa65a'), 1, 'explores', 6, 'Explora 6 veces', { acc: 'faja_marinera' }, 'Se me perdieron las telas por toda la isla. ¿Me ayudas a buscar?'),
    Q('s_collar', 'syrup', 'Tobías el Buzo', A('#d9a066', 'corto', '#1b1b1f', '#2e86de'), 2, 'npcKills', 8, 'Derrota a 8 enemigos', { acc: 'collar_coral' }, 'Unos matones me quitaron la barca. Dales una lección y te regalo mi mejor coral.'),
    Q('s_brisa', 'dawn', 'Maestra Sayuri', A('#f6d3b3', 'coleta', '#1b1b1f', '#ecf0f1', 'ninguno', 'delgado'), 4, 'trains', 12, 'Entrena 12 veces', { sword: 'brisa' }, 'Una espada no elige a quien la empuña, sino a quien entrena. Demuéstrame constancia.'),
    Q('s_brazal', 'lvneel', 'Herrero Olaf', A('#f6d3b3', 'calvo', '#c43b2b', '#7f8c8d', 'barba', 'fornido'), 5, 'npcKills', 15, 'Derrota a 15 enemigos', { acc: 'brazal_hierro' }, 'Forjo brazales para quien sabe pelear. Vuelve con quince victorias.'),
    Q('s_pulsera', 'kano', 'Lía la Mensajera', A('#b97a4a', 'largo', '#f08a24', '#f1c40f', 'ninguno', 'delgado'), 6, 'visited', 3, 'Visita 3 islas nuevas', { acc: 'pulsera_viento' }, 'Quien corre mundo entiende el viento. Tráeme noticias de tres islas nuevas.'),
    Q('s_colmillo', 'sorbet', 'Capitán retirado Nuño', A('#8d5a32', 'corto', '#f2f2f2', '#2c3e50', 'parche', 'fornido'), 10, 'killsMedPlus', 10, 'Derrota a 10 enemigos 🟡 o más fuertes', { sword: 'colmillo' }, 'Mi vieja espada duerme bajo esta cama. Solo la daré a alguien que busque rivales de verdad.'),
    Q('s_amuleto', 'jaya', 'Farera Ione', A('#eebd94', 'largo', '#f2f2f2', '#16a085'), 22, 'treasures', 3, 'Encuentra 3 tesoros', { acc: 'amuleto_faro' }, 'El faro guardaba tres cofres perdidos. Si los encuentras, su amuleto será tuyo.'),
    Q('s_ascua', 'alabasta', 'Forjadora Zaira', A('#8d5a32', 'coleta', '#c43b2b', '#d35400', 'ninguno', 'fornido'), 20, 'killsHardPlus', 8, 'Derrota a 8 enemigos 🟠 o 🔴', { sword: 'ascua' }, 'El fuego del desierto templa el acero. Trae el valor de ocho combates duros.'),
    Q('s_cadena', 'water7', 'Estibador Bruno', A('#d9a066', 'corto', '#4a2c17', '#e67e22', 'bigote', 'fornido'), 24, 'contracts', 4, 'Cumple 4 contratos', { acc: 'cadena_ancla' }, 'Esta cadena sujetó un galeón entero. Se la doy a quien cumpla su palabra cuatro veces.'),
    Q('s_faja2', 'sabaody', 'Costurera Nima', A('#f6d3b3', 'moño', '#e07ac2', '#ff6fa8', 'flor', 'delgado'), 30, 'specialTrains', 20, 'Entrena 20 veces en islas 🥋', { acc: 'faja_gaviota' }, 'Tejo con plumas de gaviota. Pesa tan poco que hay que tener buen cuerpo para notarla.'),
    Q('s_aurora', 'dressrosa', 'Duelista Valeria', A('#eebd94', 'largo', '#7a4bd1', '#8e44ad', 'cicatriz', 'delgado'), 40, 'pvpWins', 3, 'Gana 3 duelos contra jugadores', { sword: 'aurora' }, 'He vencido a todos los que han llamado a esta puerta. Gana tres duelos y hablamos.'),
    Q('s_roble', 'zou', 'Anciano Ferio', A('#b97a4a', 'calvo', '#f2f2f2', '#27ae60', 'barba', 'delgado'), 45, 'explores', 40, 'Explora 40 veces', { acc: 'cinturon_roble' }, 'Este bosque guarda secretos para quien no se cansa de buscar.'),
    Q('s_titan', 'wholecake', 'Repostero Gorm', A('#f6d3b3', 'afro', '#e8c45a', '#ff6fa8', 'ninguno', 'fornido'), 50, 'killsEpic', 10, 'Derrota a 10 enemigos 🔴 Épicos', { acc: 'brazal_titan' }, 'Amaso con este brazal desde hace cien años. Pesa como un titán: gánatelo.'),
    Q('s_eclipse', 'wano', 'Rōnin Akemi', A('#eebd94', 'coleta', '#1b1b1f', '#2c3e50', 'cicatriz'), 60, 'killsEpic', 25, 'Derrota a 25 enemigos 🔴 Épicos', { sword: 'eclipse' }, 'Esta hoja solo sale de su funda cuando el cielo se oscurece. Muéstrame tu filo.'),
    Q('s_soberana', 'skypiea', 'Doctora Kepler', A('#d9a066', 'corto', '#3d7be0', '#ecf0f1', 'gafas', 'delgado'), 70, 'contractsHard', 15, 'Cumple 15 contratos difíciles o épicos', { sword: 'soberana' }, 'Mi mejor aleación necesita datos reales de combate. Quince contratos duros bastarán.')
  ];
  G.secretById = {};
  for (const q of G.SECRETS) G.secretById[q.id] = q;
  G.rewardName = (q) => (q.reward.sword ? 'la espada «' + G.SWORDS[q.reward.sword].n + '»' : 'el accesorio «' + G.ACCS[q.reward.acc].name + '»');

  // ---------- Reglas ----------
  G.ensure = function (p) {
    p.arts = p.arts || { pts: 0, done: [], stance: 1 };
    p.accs = p.accs || []; p.accEq = p.accEq || {}; p.secrets = p.secrets || {};
    return p;
  };
  G.equipped = (p) => { const l = p && p.inv && p.inv.swords; return l && p.sword ? l.find((x) => x.id === p.sword) || null : null; };
  G.knows = (p, id) => !!(p.arts && p.arts.done.indexOf(id) >= 0);
  // postura real: la elegida, si la conoces y llevas espadas suficientes
  G.stance = function (p) {
    if (!G.equipped(p)) return 0;
    const n = (p.inv.swords || []).length, want = (p.arts && p.arts.stance) || 1;
    if (want >= 3 && G.knows(p, 'triple') && n >= 3) return 3;
    if (want >= 2 && G.knows(p, 'dual') && n >= 2) return 2;
    return 1;
  };
  // multiplicador de un golpe con espada frente a un puñetazo
  G.meleeMul = function (p) {
    const sw = G.equipped(p);
    if (!sw || p.boat) return 1;
    const sp = sw.sp && G.SWORDS[sw.sp];
    return (1.25 + sw.r * 0.07 + (sp ? sp.melee : 0)) * G.STANCES[G.stance(p)].dmg * (p.talent === 'Espadachín' ? 1.1 : 1);
  };
  G.cdMul = (p) => (p && p.inv ? G.STANCES[G.stance(p)].cd : 1);
  // mejoras de los accesorios equipados
  G.mods = function (p) {
    const out = { str: 1, spd: 1, hp: 1 };
    const eq = p && p.accEq;
    if (!eq) return out;
    for (const slot in eq) { const a = G.ACCS[eq[slot]]; if (a) for (const k in a.bonus) out[k] *= a.bonus[k]; }
    return out;
  };
  // ¿qué falta para aprender una técnica? ('' = se puede)
  G.techLock = function (p, id) {
    const T = G.TECH[id];
    if (!T) return 'Técnica desconocida';
    if (G.knows(p, id)) return 'Ya la dominas';
    if (p.lvl < T.lvl) return 'Necesitas nivel ' + T.lvl;
    if (T.needs && !G.knows(p, T.needs)) return 'Antes aprende ' + G.TECH[T.needs].name;
    if (T.swords && (p.inv.swords || []).length < T.swords) return 'Necesitas ' + T.swords + ' espadas';
    if ((p.arts.pts || 0) < T.pts) return 'Te faltan ' + Math.ceil(T.pts - p.arts.pts) + ' puntos';
    return '';
  };
  // código público para dibujar a los demás: rareza:postura:especial:cuello:brazo:cintura
  G.publicCode = function (p) {
    const sw = G.equipped(p), eq = p.accEq || {};
    if (!sw && !eq.cuello && !eq.brazo && !eq.cintura) return '';
    return [sw ? sw.r : 0, G.stance(p), (sw && sw.sp) || '', eq.cuello || '', eq.brazo || '', eq.cintura || ''].join(':');
  };
  G.parseCode = function (code) {
    if (!code) return null;
    const c = String(code).split(':');
    return { r: +c[0] || 0, stance: +c[1] || 0, sp: c[2] || '', cuello: c[3] || '', brazo: c[4] || '', cintura: c[5] || '' };
  };
  G.progress = function (p, q) {
    const st = p.secrets && p.secrets[q.id];
    if (!st || st.done) return 0;
    return Math.max(0, Math.min(q.goal, MMO.statValue(p, q.stat) - (st.base || 0)));
  };
})();
