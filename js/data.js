/* MILESDEPIRATAS - datos fijos del mundo */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});

  // Tamaño del mundo en casillas
  OP.W = 768;
  OP.H = 432;
  OP.CX = 384; // eje de la Muralla Carmesí central (Monte Contracorriente)
  OP.CY = 216; // eje de la Ruta Mayor

  // Tipos de casilla (menor que 10 = agua)
  const T = (OP.T = {
    SEA: 0, CALM: 1, CLOUDSEA: 2, DEEP: 3,
    SAND: 10, GRASS: 11, FOREST: 12, HILL: 13, MOUNTAIN: 14, SNOW: 15, ICE: 16, PINE: 17, SNOWPEAK: 18,
    DESERT: 19, DUNE: 20, ROCK: 21, LAVA: 22, TOWN: 23, ROAD: 24, RIVER: 25, JUNGLE: 26, SAKURA: 27,
    CANDY: 28, CHOCO: 29, CREAM: 30, METAL: 31, LAB: 32, STONE: 33, WALL: 34, MBASE: 35, CLOUD: 36, WOOD: 37,
    MANGROVE: 38, DEADTREE: 39, SWAMP: 40, GOLD: 41, CACTUS: 42, ELEPHANT: 43, FLOWER: 44, RUIN: 45, WHITERUIN: 46,
    BUBBLE: 47, CORAL: 48, PRISON: 49, CASTLE: 50, ASH: 55, LIGHTHOUSE: 56, CANAL: 57,
    REDLINE: 60, REDTOP: 61, RMRIVER: 62, HOLY: 63
  });
  OP.isWater = (t) => t < 10;
  OP.isLand = (t) => t >= 10 && t < 60;
  OP.isRed = (t) => t >= 60;

  // Bandas de la Ruta Mayor y del Cinturón Quieto (con una ligera ondulación)
  OP.glTop = (x) => 186 + 2 * Math.sin(x * 0.05);
  OP.glBot = (x) => 246 + 2 * Math.sin(x * 0.05 + 1.3);
  OP.calmTop = (x) => OP.glTop(x) - 14;
  OP.calmBot = (x) => OP.glBot(x) + 14;
  OP.zoneAt = function (x, y) {
    if (y >= OP.glTop(x) && y < OP.glBot(x)) return x < OP.CX ? 'newworld' : 'paradise';
    if (y >= OP.calmTop(x) && y < OP.calmBot(x)) return 'calm';
    if (y < OP.calmTop(x)) return x < OP.CX ? 'north' : 'east';
    return x < OP.CX ? 'west' : 'south';
  };

  OP.SEAS = {
    east: { name: 'Mar del Este', kind: 'blue', label: [575, 22] },
    north: { name: 'Mar del Norte', kind: 'blue', label: [190, 22] },
    west: { name: 'Mar del Oeste', kind: 'blue', label: [190, 418] },
    south: { name: 'Mar del Sur', kind: 'blue', label: [575, 418] },
    paradise: { name: 'Mar Esmeralda', kind: 'gl', label: [575, 252] },
    newworld: { name: 'Mar Indómito', kind: 'gl', label: [190, 252] },
    calm: { name: 'Cinturón Quieto', kind: 'calm' },
    sky: { name: 'Mar Blanco (cielo)', kind: 'gl' },
    deep: { name: 'Fondo del mar', kind: 'gl' }
  };
  OP.BLUES = ['east', 'west', 'north', 'south'];
  // Multiplicador de experiencia y dureza por zona
  OP.ZONE_MULT = { east: 1, west: 1, north: 1, south: 1, calm: 3, paradise: 2.5, sky: 3, deep: 3, newworld: 5 };
  OP.ZONE_CAP = { east: 22, west: 22, north: 22, south: 22, calm: 55, paradise: 52, sky: 55, deep: 58, newworld: 100 };
  OP.ZONE_GRUNT = { east: 2, west: 2, north: 2, south: 2, calm: 8, paradise: 6, sky: 7, deep: 7, newworld: 16 };

  // ---------- Islas ----------
  // biome = tipo de paisaje; danger = peligro (1..10); pop = población
  OP.ISLANDS = [
    // ===== EAST BLUE =====
    { id: 'dawn', name: 'Isla Albor', sea: 'east', x: 715, y: 60, r: 10, biome: 'tropical', pop: 15000, danger: 1,
      towns: ['Villa Brisamar', 'Reino de Aurea', 'Vertedero Gris'], traits: ['Monte Serpa', 'Bosques salvajes', 'Basurero de Vertedero Gris'] },
    { id: 'shells', name: 'Puerto Concha', sea: 'east', x: 652, y: 96, r: 6, biome: 'tropical', pop: 6000, danger: 1,
      towns: ['Puerto Concha', 'Base Marine 153'], traits: ['Base de la Marina', 'Plaza del castigo'], base: 'Rama 153 de la Marina' },
    { id: 'orange', name: 'Villa Naranjal', sea: 'east', x: 600, y: 52, r: 6, biome: 'tropical', pop: 3000, danger: 1,
      towns: ['Villa Naranjal'], traits: ['Tienda de mascotas', 'Calles del puerto'] },
    { id: 'syrup', name: 'Villa Almíbar', sea: 'east', x: 588, y: 124, r: 6, biome: 'forest', pop: 2500, danger: 1, arch: 2,
      towns: ['Villa Almíbar', 'Mansión de la colina'], traits: ['Islas Lagarto', 'Acantilados', 'Mentirosos famosos'] },
    { id: 'baratie', name: 'Restaurante Olla Flotante', sea: 'east', x: 530, y: 104, r: 3, biome: 'wood', pop: 60, danger: 2, ex: 1.6, ey: 0.7,
      towns: ['Restaurante flotante'], traits: ['Restaurante en el mar', 'Los mejores cocineros'], cook: true },
    { id: 'arlong', name: 'Bahía Mandarina', sea: 'east', x: 470, y: 132, r: 8, biome: 'tropical', pop: 4000, danger: 3, arch: 3,
      towns: ['Villa Cocotal', 'Bahía Mandarina'], traits: ['Islas Citrina', 'Huertos de mandarinas', 'Antigua guarida de hombres-pez'] },
    { id: 'logue', name: 'Puerto Umbral', sea: 'east', x: 432, y: 148, r: 7, biome: 'city', pop: 20000, danger: 2,
      towns: ['Puerto Umbral', 'Plaza de la ejecución'], traits: ['Ciudad del principio y del fin', 'Tienda de Compás de Ruta'], base: 'Base Marine de Puerto Umbral', logpose: true },
    { id: 'shimotsuki', name: 'Villa Escarcha', sea: 'east', x: 690, y: 138, r: 5, biome: 'forest', pop: 1200, danger: 1,
      towns: ['Dojo de espadas'], traits: ['Dojo legendario', 'Arrozales'], train: { label: 'Entrenar en el dojo de espadas', bonus: 1.6, talent: 'Espadachín' } },

    // ===== NORTH BLUE =====
    { id: 'lvneel', name: 'Reino de Lunaria', sea: 'north', x: 90, y: 62, r: 9, biome: 'forest', pop: 12000, danger: 1,
      towns: ['Ciudad Lunaria', 'Puerto Norte'], traits: ['Leyenda de la ciudad dorada', 'Bosques de pinos'], logpose: true },
    { id: 'flevance', name: 'Albaplomo', sea: 'north', x: 200, y: 46, r: 7, biome: 'whiteruins', pop: 300, danger: 2,
      towns: ['La Ciudad Blanca (ruinas)'], traits: ['Minas de plomo ámbar', 'Ruinas blancas'] },
    { id: 'spidermiles', name: 'Millas Araña', sea: 'north', x: 288, y: 98, r: 6, biome: 'wasteland', pop: 3000, danger: 2,
      towns: ['Vertedero'], traits: ['Basureros', 'Contrabandistas'] },
    { id: 'minion', name: 'Isla Cierzo', sea: 'north', x: 160, y: 128, r: 6, biome: 'winter', pop: 800, danger: 2,
      towns: ['Aldea Helada'], traits: ['Nieve perpetua', 'Lagos helados'] },
    { id: 'rubeck', name: 'Isla Rubedo', sea: 'north', x: 58, y: 140, r: 6, biome: 'tropical', pop: 5000, danger: 1,
      towns: ['Puerto Rubedo', 'Base Marine del Norte'], traits: ['Base de la Marina'], base: 'Base Marine Rubedo' },
    { id: 'swallow', name: 'Isla Vencejo', sea: 'north', x: 325, y: 42, r: 5, biome: 'tropical', pop: 2000, danger: 1,
      towns: ['Pueblo Golondrina'], traits: ['Médicos famosos', 'Osos polares'], hospital: true },

    // ===== WEST BLUE =====
    { id: 'ohara', name: 'Sapientia', sea: 'west', x: 100, y: 300, r: 8, biome: 'ruins', pop: 200, danger: 2,
      towns: ['Árbol del Conocimiento (ruinas)'], traits: ['Historia prohibida', 'Biblioteca quemada'], lore: true },
    { id: 'toroa', name: 'Torreón', sea: 'west', x: 250, y: 292, r: 6, biome: 'city', pop: 7000, danger: 1,
      towns: ['Torreón', 'Base Marine Torreón'], traits: ['Base de la Marina'], base: 'Base Marine Torreón' },
    { id: 'ilusia', name: 'Reino de Espejismo', sea: 'west', x: 70, y: 385, r: 7, biome: 'forest', pop: 9000, danger: 1,
      towns: ['Ciudad Espejismo'], traits: ['Castillo antiguo', 'Bosques'] },
    { id: 'kano', name: 'País de Carmín', sea: 'west', x: 180, y: 368, r: 9, biome: 'tropical', pop: 11000, danger: 2,
      towns: ['Capital Carmín', 'Puerto Mafia'], traits: ['Familias mafiosas', 'Mercado negro'], logpose: true },
    { id: 'lascamp', name: 'Campo Cañón', sea: 'west', x: 305, y: 362, r: 6, biome: 'desert', pop: 3500, danger: 2,
      towns: ['Campo Cañón'], traits: ['Ciudad de armas', 'Cañones'] },
    { id: 'calabaza', name: 'Isla Calabaza', sea: 'west', x: 240, y: 410, r: 5, biome: 'tropical', pop: 1500, danger: 1,
      towns: ['Aldea Calabaza'], traits: ['Huertos', 'Pescadores'] },

    // ===== SOUTH BLUE =====
    { id: 'baterilla', name: 'Playa Bermeja', sea: 'south', x: 722, y: 378, r: 7, biome: 'tropical', pop: 6000, danger: 1,
      towns: ['Pueblo Bermejo'], traits: ['Playas', 'Leyendas de piratas'] },
    { id: 'briss', name: 'Reino de Copas', sea: 'south', x: 600, y: 300, r: 7, biome: 'forest', pop: 8000, danger: 1,
      towns: ['Ciudad de Copas'], traits: ['Barcos en las copas de los árboles'] },
    { id: 'sorbet', name: 'Reino de Granizo', sea: 'south', x: 505, y: 360, r: 7, biome: 'city', pop: 10000, danger: 1,
      towns: ['Capital Granizo'], traits: ['Comercio', 'Tienda de Compás de Ruta'], logpose: true },
    { id: 'karate', name: 'Isla del Puño', sea: 'south', x: 640, y: 410, r: 5, biome: 'mountain', pop: 900, danger: 2,
      towns: ['Templo del puño'], traits: ['Maestros de artes marciales'], train: { label: 'Entrenar artes marciales', bonus: 1.5, talent: 'Luchador' } },
    { id: 'centaurea', name: 'Cardo Azul', sea: 'south', x: 555, y: 412, r: 6, biome: 'tropical', pop: 4000, danger: 1,
      towns: ['Cardo Azul', 'Base Marine del Sur'], traits: ['Base de la Marina'], base: 'Base Marine Cardo Azul' },
    { id: 'samba', name: 'Isla Samba', sea: 'south', x: 440, y: 300, r: 6, biome: 'tropical', pop: 3000, danger: 1,
      towns: ['Aldea Samba'], traits: ['Fiestas', 'Tambores'] },

    // ===== MAR ESMERALDA (primera mitad de la Ruta Mayor) =====
    { id: 'twincapes', name: 'Cabo del Faro', sea: 'paradise', x: 411, y: 205, r: 4, biome: 'rocky', pop: 2, danger: 3,
      towns: ['Faro'], traits: ['Faro al pie de Monte Contracorriente', 'Una ballena gigante espera'], logpose: true },
    { id: 'whiskey', name: 'Pico Cardón', sea: 'paradise', x: 437, y: 226, r: 7, biome: 'cactus', pop: 1500, danger: 4,
      towns: ['Pico Cardón'], traits: ['Montañas cactus', 'Cazarrecompensas disfrazados'] },
    { id: 'littlegarden', name: 'Jardín Primigenio', sea: 'paradise', x: 465, y: 203, r: 8, biome: 'prehistoric', pop: 2, danger: 5,
      towns: ['Campamento gigante'], traits: ['Dinosaurios', 'Dos gigantes en duelo eterno', 'Volcán'], train: { label: 'Entrenar entre gigantes y dinosaurios', bonus: 1.8 } },
    { id: 'drum', name: 'Isla Invernia', sea: 'paradise', x: 495, y: 229, r: 9, biome: 'winter', pop: 5000, danger: 4,
      towns: ['Pueblo Cuernogrande', 'Castillo de la cima'], traits: ['Montes Invernia', 'Médicos legendarios', 'Cerezos de nieve'], hospital: true },
    { id: 'alabasta', name: 'Arenara', sea: 'paradise', x: 538, y: 213, r: 14, biome: 'desert', pop: 10000000, danger: 4, ex: 1.25, ey: 0.95,
      towns: ['Alcázar Dorado', 'Puerto Azahar', 'Oasis Lluvia', 'Pozo Viejo', 'Ruinas Verdes'], traits: ['Desierto Ámbar', 'Río Ámbar', 'Monolito del templo real'], poneglyph: 'historic' },
    { id: 'jaya', name: 'Isla Quimera', sea: 'paradise', x: 568, y: 232, r: 8, biome: 'tropical', pop: 3000, danger: 5,
      towns: ['Villa Burla', 'Cabaña del cazador de oro'], traits: ['Ciudad de los sueños rotos', 'Corriente Ascendente cercana'] },
    { id: 'skypiea', name: 'Celesta', sea: 'sky', x: 594, y: 199, r: 6, biome: 'sky', pop: 8000, danger: 6, sky: true,
      towns: ['Playa Alba', 'Alto Bosque', 'Ruinas del Sol'], traits: ['Isla del cielo', 'Mar de nubes', 'Campana dorada'], poneglyph: 'historic',
      train: { label: 'Entrenar en una isla del cielo', bonus: 2.0 } },
    { id: 'water7', name: 'Puerto Canales', sea: 'paradise', x: 623, y: 223, r: 7, biome: 'canals', pop: 120000, danger: 3,
      towns: ['Ciudad del agua', 'Astillero Mayor', 'Muelles'], traits: ['Astilleros legendarios', 'Gran Marea', 'Canales'], shipyard: true },
    { id: 'enieslobby', name: 'Corte del Alba', sea: 'paradise', x: 651, y: 204, r: 5, biome: 'fortress', pop: 3000, danger: 7,
      towns: ['Tribunal', 'Torre de la Justicia'], traits: ['Isla judicial', 'Cascada sin fondo', 'Puerta de la Justicia'], base: 'Corte del Alba (Gobierno Mundial)' },
    { id: 'navarone', name: 'Fuerte Ocho', sea: 'paradise', x: 640, y: 241, r: 5, biome: 'fortress', pop: 2500, danger: 5,
      towns: ['Fortaleza Ocho'], traits: ['Fortaleza de la Marina', 'Cocina de la base'], base: 'Base Fuerte Ocho' },
    { id: 'thriller', name: 'Barca Espectral', sea: 'paradise', x: 680, y: 225, r: 7, biome: 'ghost', pop: 400, danger: 7,
      towns: ['Mansión fantasma', 'Bosque de los zombis'], traits: ['Triángulo de Bruma', 'Barco-isla gigante', 'Zombis'] },
    { id: 'sabaody', name: 'Archipiélago de Burbujas', sea: 'paradise', x: 716, y: 204, r: 8, biome: 'mangrove', pop: 50000, danger: 6, arch: 4,
      towns: ['Arboleda 1', 'Arboleda 13 (subastas)', 'Parque de Burbujas'], traits: ['Manglares gigantes', 'Burbujas', 'Recubrimiento de barcos'], coating: true },
    { id: 'marineford', name: 'Bastión Central', sea: 'paradise', x: 708, y: 238, r: 7, biome: 'fortress', pop: 30000, danger: 9,
      towns: ['Cuartel General', 'Plaza del Juicio'], traits: ['Cuartel General de la Marina', 'Muros de asedio'], base: 'Cuartel General de la Marina', hq: true },
    // Cinturón Quieto
    { id: 'amazonlily', name: 'Isla Orquídea', sea: 'calm', x: 692, y: 179, r: 5, biome: 'jungle', pop: 4000, danger: 6, calm: true,
      towns: ['Aldea Guerrera'], traits: ['Isla de las mujeres guerreras', 'Bestias abisales'] },
    { id: 'impeldown', name: 'Prisión Abismo', sea: 'calm', x: 664, y: 253, r: 4, biome: 'prison', pop: 900, danger: 9, calm: true,
      towns: ['Prisión submarina'], traits: ['La gran prisión', 'Seis niveles de infierno'], base: 'Prisión Abismo', prison: true },
    // Bajo la Muralla Carmesí
    { id: 'gyojin', name: 'Isla Coralina', sea: 'deep', x: 742, y: 222, r: 4, biome: 'bubble', pop: 5000000, danger: 6, deep: true,
      towns: ['Palacio de Perlas', 'Distrito Coral'], traits: ['10.000 metros bajo el mar', 'Hombres-pez y sirenas', 'Monolito de la disculpa'], poneglyph: 'historic' },

    // ===== MAR INDÓMITO =====
    { id: 'punkhazard', name: 'Isla Dualia', sea: 'newworld', x: 45, y: 207, r: 7, biome: 'volcanic', pop: 50, danger: 7,
      towns: ['Laboratorio abandonado'], traits: ['Mitad fuego, mitad hielo', 'Gases venenosos'] },
    { id: 'g5', name: 'Base Cinco', sea: 'newworld', x: 62, y: 238, r: 4, biome: 'fortress', pop: 1500, danger: 7,
      towns: ['Fortaleza Cinco'], traits: ['La base más dura de la Marina'], base: 'Base Cinco' },
    { id: 'dressrosa', name: 'Rosaleda', sea: 'newworld', x: 95, y: 222, r: 10, biome: 'toy', pop: 400000, danger: 8,
      towns: ['Ciudad de Acacia', 'Coliseo Carmesí', 'Palacio real'], traits: ['Juguetes vivientes', 'Campos de girasoles', 'Coliseo'],
      train: { label: 'Combatir en el Coliseo', bonus: 1.7, talent: 'Luchador' } },
    { id: 'zou', name: 'Lomo del Coloso', sea: 'newworld', x: 142, y: 203, r: 8, biome: 'elephant', pop: 20000, danger: 7,
      towns: ['Bosque de la Ballena', 'Ciudad Trompa'], traits: ['Isla sobre un elefante milenario', 'Tribu Felpa'], poneglyph: 'road' },
    { id: 'wholecake', name: 'Confitia', sea: 'newworld', x: 192, y: 228, r: 11, biome: 'candy', pop: 200000, danger: 9, arch: 5,
      towns: ['Castillo de pastel', 'Dulcelandia'], traits: ['Archipiélago de dulces', 'Territorio de un Emperador'], poneglyph: 'road' },
    { id: 'elbaf', name: 'Titania', sea: 'newworld', x: 236, y: 201, r: 8, biome: 'giants', pop: 30000, danger: 8,
      towns: ['Aldea de los gigantes'], traits: ['Árbol gigante', 'Guerreros gigantes'], train: { label: 'Entrenar con los gigantes', bonus: 1.9 } },
    { id: 'wano', name: 'Kagero', sea: 'newworld', x: 272, y: 226, r: 11, biome: 'sakura', pop: 300000, danger: 9,
      towns: ['Capital de las Flores', 'Castaño', 'Isla del Ogro'], traits: ['Samuráis', 'País cerrado', 'Cascada de entrada'], poneglyph: 'road' },
    { id: 'egghead', name: 'Isla Prisma', sea: 'newworld', x: 314, y: 206, r: 6, biome: 'future', pop: 600, danger: 8,
      towns: ['Laboratorio Faro'], traits: ['Isla del futuro', 'Tecnología de 500 años adelante'] },
    { id: 'laughtale', name: 'Isla Postrera', sea: 'newworld', x: 352, y: 226, r: 7, biome: 'legend', pop: 0, danger: 10, hidden: true,
      towns: ['???'], traits: ['El tesoro del Rey de los Mares', 'Solo se encuentra con los 4 Monolitos de Ruta'] },

    // ===== ISLAS NUEVAS (MMO) =====
    // Se añaden AL FINAL para no cambiar el índice de ninguna isla original. Están en huecos libres de los
    // cuatro mares, así que el resto del mapa se genera exactamente igual que antes.
    // spawnPerk: efecto especial si un jugador nuevo aparece aquí (ver js/mmo-rules.js → SPAWN_PERKS)
    { id: 'chaos', name: 'Isla Chaos', sea: 'east', x: 482, y: 58, r: 6, biome: 'wasteland', pop: 900, danger: 2,
      towns: ['Ruinas del Caos'], traits: ['Tormentas eternas', 'Energía salvaje en el aire'], spawnPerk: 'chaos' },
    { id: 'poche', name: 'Reino Poche', sea: 'north', x: 236, y: 140, r: 7, biome: 'city', pop: 14000, danger: 1,
      towns: ['Capital Poche', 'Puerto Real'], traits: ['Reino de guerreros valientes', 'Murallas de piedra'], spawnPerk: 'poche' },
    { id: 'fetu', name: 'Villa Fetu', sea: 'west', x: 172, y: 312, r: 6, biome: 'tropical', pop: 2200, danger: 1,
      towns: ['Villa Fetu'], traits: ['Corredores del viento', 'Playas larguísimas'], spawnPerk: 'fetu' },
    { id: 'tomas', name: 'Isla Tomas', sea: 'south', x: 686, y: 316, r: 5, biome: 'desert', pop: 700, danger: 1,
      towns: ['Pueblo de los Cuentos'], traits: ['Cuna de mentirosos legendarios'], spawnPerk: 'tomas' },
    { id: 'perkin', name: 'Isla Perkin', sea: 'north', x: 118, y: 100, r: 5, biome: 'jungle', pop: 1100, danger: 2,
      towns: ['Aldea Perkin'], traits: ['Selva desconcertante', 'Frutas que confunden'], spawnPerk: 'perkin' },

    // ===== AMPLIACIÓN: 3 islas nuevas por cada mar (también al final, en huecos libres comprobados) =====
    // Mar del Este
    { id: 'kanpai', name: 'Isla Kanpai', sea: 'east', x: 402, y: 72, r: 6, biome: 'tropical', pop: 3500, danger: 1, isNew: true,
      towns: ['Puerto Jarana', 'Taberna del Barril'], traits: ['Festival de los Barriles', 'Cerveceros piratas', 'Muelle de fiestas'] },
    { id: 'gaviota', name: 'Roca Gaviota', sea: 'east', x: 540, y: 26, r: 5, biome: 'rocky', pop: 300, danger: 2, isNew: true,
      towns: ['Faro Gaviota'], traits: ['Colonia de gaviotas mensajeras', 'Acantilados blancos', 'Nidos en las rocas'] },
    { id: 'tsubaki', name: 'Villa Tsubaki', sea: 'east', x: 744, y: 120, r: 6, biome: 'sakura', pop: 2400, danger: 2, isNew: true,
      towns: ['Villa Tsubaki', 'Dojo de las Camelias'], traits: ['Camelias rojas', 'Dojo de lanceros', 'Puentes de madera'],
      train: { label: 'Entrenar en el dojo de lanzas', bonus: 1.4, talent: 'Luchador' } },
    // Mar del Norte
    { id: 'grimvik', name: 'Fiordo Grimvik', sea: 'north', x: 24, y: 84, r: 7, biome: 'winter', pop: 1800, danger: 3, isNew: true,
      towns: ['Grimvik', 'Cabaña de los cazadores'], traits: ['Cazadores de osos polares', 'Auroras boreales', 'Fiordos helados'],
      train: { label: 'Entrenar en la nieve con los cazadores', bonus: 1.4, talent: 'Tirador' } },
    { id: 'herrumbre', name: 'Isla Herrumbre', sea: 'north', x: 356, y: 132, r: 6, biome: 'wasteland', pop: 2100, danger: 2, isNew: true,
      towns: ['Forja Herrumbre', 'Cementerio de barcos'], traits: ['Chatarreros y forjadores', 'Barcos desguazados', 'Humo de las forjas'] },
    { id: 'murmullo', name: 'Bosque Murmullo', sea: 'north', x: 266, y: 24, r: 6, biome: 'forest', pop: 600, danger: 2, isNew: true, hospital: true,
      towns: ['Aldea de los Susurros'], traits: ['Árboles que susurran', 'Ermitaños herbolarios', 'Niebla eterna'] },
    // Mar del Oeste
    { id: 'lumbra', name: 'Puerto Lumbra', sea: 'west', x: 26, y: 318, r: 6, biome: 'city', pop: 9000, danger: 1, isNew: true,
      towns: ['Lumbra', 'Gran Mercado'], traits: ['Mercado de las mil lámparas', 'Comerciantes de todos los mares'] },
    { id: 'tortuga', name: 'Cayo Tortuga', sea: 'west', x: 358, y: 302, r: 5, biome: 'tropical', pop: 900, danger: 1, isNew: true,
      towns: ['Refugio Tortuga'], traits: ['Tortugas gigantes', 'Playas de arena rosa'],
      train: { label: 'Entrenar cargando tortugas gigantes', bonus: 1.4, talent: 'Fuerte' } },
    { id: 'calavera', name: 'Ruinas Calavera', sea: 'west', x: 360, y: 408, r: 6, biome: 'ruins', pop: 150, danger: 3, isNew: true, richTreasure: true,
      towns: ['Templo Calavera'], traits: ['Ruinas de un antiguo rey pirata', 'Tesoros malditos', 'Calaveras de piedra'] },
    // Mar del Sur
    { id: 'mango', name: 'Isla Mango', sea: 'south', x: 530, y: 298, r: 6, biome: 'tropical', pop: 2600, danger: 1, isNew: true,
      towns: ['Plantación Mango', 'Muelle Dulce'], traits: ['Plantaciones de mango', 'Monos ladrones'] },
    { id: 'sahrim', name: 'Oasis de Sahrim', sea: 'south', x: 440, y: 372, r: 6, biome: 'desert', pop: 1700, danger: 2, isNew: true, hospital: true,
      towns: ['Sahrim'], traits: ['Oasis escondido', 'Caravanas de camellos', 'Curanderos del desierto'] },
    { id: 'kazan', name: 'Termas de Kazan', sea: 'south', x: 408, y: 404, r: 6, biome: 'mountain', pop: 1100, danger: 2, isNew: true,
      towns: ['Pueblo de las Termas'], traits: ['Aguas termales', 'Volcán dormido', 'Cascadas calientes'],
      train: { label: 'Entrenar bajo las cascadas termales', bonus: 1.5 } }
  ];

  // Lugares que se dibujan pero no se visitan
  OP.LANDMARKS = [
    { id: 'reversemountain', name: 'Monte Contracorriente', x: 384, y: 216, text: 'Las corrientes de los cuatro mares suben y bajan hacia la Ruta Mayor' },
    { id: 'mariejois', name: 'Ciudadela Sagrada', x: 762, y: 216, text: 'Tierra Santa sobre la Muralla Carmesí. Hogar de los Linajes Sagrados' },
    { id: 'redline_w', name: 'Muralla Carmesí', x: 6, y: 216, text: 'Salida del túnel bajo la Muralla Carmesí hacia el Mar Indómito' }
  ];

  // Parches especiales de agua: nubes alrededor de Celesta y fondo marino alrededor de la Isla Coralina
  OP.CLOUD_PATCH = { x: 594, y: 201, r: 12 };
  OP.DEEP_PATCH = { x: 742, y: 222, r: 8 };

  // Pasos especiales entre mares (no se navegan por agua normal)
  OP.GATES = [
    { id: 'rm_east', name: 'Monte Contracorriente', kind: 'climb', from: [396, 166], to: [400, 216], oneWay: true, req: 'paradise', hours: 10,
      path: [[396, 166], [390, 178], [386, 196], [384, 209], [389, 215], [400, 216]] },
    { id: 'rm_north', name: 'Monte Contracorriente', kind: 'climb', from: [372, 166], to: [400, 216], oneWay: true, req: 'paradise', hours: 10,
      path: [[372, 166], [378, 178], [382, 196], [384, 209], [389, 215], [400, 216]] },
    { id: 'rm_west', name: 'Monte Contracorriente', kind: 'climb', from: [372, 266], to: [400, 216], oneWay: true, req: 'paradise', hours: 10,
      path: [[372, 266], [378, 254], [382, 236], [384, 223], [389, 217], [400, 216]] },
    { id: 'rm_south', name: 'Monte Contracorriente', kind: 'climb', from: [396, 266], to: [400, 216], oneWay: true, req: 'paradise', hours: 10,
      path: [[396, 266], [390, 254], [386, 236], [384, 223], [389, 217], [400, 216]] },
    { id: 'fish_in', name: 'Descenso a la Isla Coralina', kind: 'dive', from: [730, 222], to: [735, 222], oneWay: false, req: 'deep', hours: 8 },
    { id: 'fish_out', name: 'Túnel bajo la Muralla Carmesí', kind: 'tunnel', from: [749, 222], to: [15, 222], oneWay: false, req: 'newworld', hours: 10 },
    { id: 'knockup', name: 'Corriente Ascendente', kind: 'sky', from: [579, 222], to: [589, 210], oneWay: false, req: 'sky', hours: 4 }
  ];

  // ---------- Islas más grandes ----------
  // Cada isla crece hasta un 40%, sin acercarse a sus vecinas, a los pasos especiales ni a los bordes de su mar.
  // Las islas del cielo, del fondo, del Cinturón Quieto, las prisiones y las muy pequeñas se quedan como estaban.
  (function growIslands() {
    const MAX = 1.4, GAP = 6, L = OP.ISLANDS;
    const fixed = (I) => I.sky || I.deep || I.calm || I.prison || I.r <= 3 || I.biome === 'rocky';
    const reach = (I) => I.r * Math.max(I.ex || 1, I.ey || 1) * (I.arch ? 1.8 : 1) * 1.14;
    const g = L.map((I) => (fixed(I) ? 1 : MAX));
    L.forEach((I, i) => {
      if (fixed(I)) return;
      const R = reach(I);
      for (const G of OP.GATES) for (const pt of [G.from, G.to]) g[i] = Math.min(g[i], (Math.hypot(pt[0] - I.x, pt[1] - I.y) - 5) / R);
      const yR = I.r * (I.ey || 1) * 1.14;
      if (I.sea === 'paradise' || I.sea === 'newworld') g[i] = Math.min(g[i], (I.y - OP.glTop(I.x) - 2) / yR, (OP.glBot(I.x) - I.y - 2) / yR);
      else if (I.y < OP.CY) g[i] = Math.min(g[i], (OP.calmTop(I.x) - I.y - 3) / yR);
      else g[i] = Math.min(g[i], (I.y - OP.calmBot(I.x) - 3) / yR);
    });
    for (let pass = 0; pass < 8; pass++) for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const d = Math.hypot(L[i].x - L[j].x, L[i].y - L[j].y) - GAP, need = reach(L[i]) * g[i] + reach(L[j]) * g[j];
      if (need > d) { const k = Math.max(0.7, d / need); if (!fixed(L[i])) g[i] *= k; if (!fixed(L[j])) g[j] *= k; }
    }
    L.forEach((I, i) => { I.r = Math.round(I.r * Math.max(1, Math.min(MAX, g[i])) * 2) / 2; });
  })();

  // ---------- Talentos ----------
  OP.TALENTS = {
    'Tirador': { icon: '🎯', desc: 'Dispara de lejos: golpea fuerte al empezar el combate.', role: 'francotirador' },
    'Luchador': { icon: '👊', desc: 'Pelea cuerpo a cuerpo y aprende más de cada combate.', role: 'combatiente' },
    'Inteligente': { icon: '📜', desc: 'Encuentra más secretos y puede leer los Monolitos.', role: 'arqueólogo' },
    'Fuerte': { icon: '💪', desc: 'Gana más fuerza y aguanta más golpes.', role: 'carpintero' },
    'Espadachín': { icon: '⚔️', desc: 'Domina la espada: más poder en cada duelo.', role: 'espadachín' },
    'Navegante': { icon: '🧭', desc: 'Su barco va más rápido y evita tormentas.', role: 'navegante' },
    'Médico': { icon: '🩺', desc: 'Cura a su tripulación mucho más rápido.', role: 'médico' },
    'Estratega': { icon: '♟️', desc: 'Planea los combates: todo su bando pelea mejor.', role: 'segundo al mando' },
    'Ladrón': { icon: '🗝️', desc: 'Roba dinero y mapas, y escapa de las prisiones.', role: 'navegante' },
    'Asesino': { icon: '🗡️', desc: 'Ataca por sorpresa. Es peligroso y temido.', role: 'combatiente' },
    'Diplomático': { icon: '🤝', desc: 'Hace alianzas, evita peleas y recluta mejor.', role: 'cocinero' }
  };
  OP.TALENT_LIST = Object.keys(OP.TALENTS);

  OP.ROLES_PIRATE = ['capitán', 'espadachín', 'navegante', 'cocinero', 'médico', 'francotirador', 'carpintero', 'arqueólogo', 'músico', 'segundo al mando', 'combatiente'];
  OP.CORE_ROLES = ['espadachín', 'navegante', 'cocinero', 'médico', 'francotirador', 'carpintero'];

  // ---------- Frutas Malditas en el mundo ----------
  // (además, el servidor esconde frutas CERCA de los jugadores conectados con un sistema de "lástima": server/fruits.js)
  OP.FRUIT_MAX_HIDDEN = 6;       // frutas escondidas a la vez en todo el mundo (antes 2: casi nunca había ninguna)
  OP.FRUIT_SPAWN_CHANCE = 0.03;  // probabilidad por día de juego (12 s reales) → una nueva cada ~7 min reales si hay hueco

  // ---------- Recompensas de los NPC ----------
  // cap: recompensa máxima de un NPC. perLvl2: escala por nivel (techo = perLvl2 · nivel², hasta cap).
  // mode: 'full' (normal), 'reduced' (pocas y bajas) u 'off' (ningún NPC con recompensa).
  // Pensado para la transición futura: cuando haya muchos jugadores, arrancar el servidor con OPW_NPC_BOUNTY=reduced u off.
  // tiers: cupo global de NPC por encima de cada umbral (las recompensas altas son muy raras)
  // Población de NPC y cupos de nivel (cuántos NPC pueden estar como mucho en cada nivel o por encima)
  OP.NPC_MAX = 300;
  OP.NPC_LEVEL_TIERS = [[100, 2], [95, 6], [90, 14], [80, 32], [70, 60], [60, 100], [50, 150], [40, 210]];
  OP.NPC_BOUNTY = { cap: 7e8, perLvl2: 1e5, mode: 'full', reducedMult: 0.3, tiers: [[6e8, 2], [4.5e8, 5], [3e8, 12], [1e8, 45], [3e7, 130]] };   // escalera: muy pocos arriba, cifras variadas entre medias

  // ---------- Rangos de la Marina ----------
  OP.RANKS = ['Recluta', 'Marinero', 'Sargento', 'Teniente', 'Capitán', 'Comodoro', 'Contraalmirante', 'Vicealmirante', 'Almirante', 'Almirante General'];
  OP.RANK_MERIT = [0, 30, 90, 220, 480, 900, 1500, 2400, 4000, 6000];
  OP.RANK_SLOTS = [999, 999, 999, 999, 60, 30, 18, 12, 3, 1];
  OP.RANK_LEVEL = [1, 3, 7, 12, 18, 26, 34, 45, 70, 85];
  OP.RANK_VALUE = [1, 2, 4, 8, 16, 30, 50, 90, 400, 800]; // millones de recompensa por derrotarlo

  // ---------- Barcos ----------
  OP.SHIPS = {
    bote: { name: 'Bote', speed: 3.6, hp: 25, cap: 2, cost: 0, guns: 0 },
    carabela: { name: 'Carabela', speed: 5.0, hp: 90, cap: 6, cost: 2500000, guns: 2 },
    bergantin: { name: 'Bergantín', speed: 6.0, hp: 150, cap: 10, cost: 12000000, guns: 4 },
    galeon: { name: 'Galeón', speed: 5.6, hp: 280, cap: 24, cost: 45000000, guns: 8 },
    legendario: { name: 'Navío legendario', speed: 7.4, hp: 420, cap: 30, cost: 180000000, guns: 10 },
    marine: { name: 'Buque de la Marina', speed: 6.0, hp: 220, cap: 20, cost: 0, guns: 6 },
    almirante: { name: 'Buque insignia de la Marina', speed: 7.0, hp: 450, cap: 30, cost: 0, guns: 12 }
  };
  OP.SHIP_ORDER = ['bote', 'carabela', 'bergantin', 'galeon', 'legendario'];

  // ---------- Frutas Malditas ----------
  // rarity: 1 Raro, 2 Épico, 3 Legendario, 4 Mítico
  OP.RARITY = ['', 'Rara', 'Épica', 'Legendaria', 'Mítica'];
  OP.RARITY_MULT = [1, 1.25, 1.45, 1.7, 2.0];
  // Nombres según su efecto. key = identificador fijo (no cambia aunque cambie el nombre).
  // look = [color principal, color de los remolinos, forma] para el dibujo de cada fruta.
  OP.FRUITS = [
    ['Fruta Goma', 'Arcana', 'Cuerpo de goma: estira brazos y piernas', 4, 'gomu', '#8a5ad8', '#3a1f7a', 'round'],
    ['Fruta Trozos', 'Arcana', 'Separa su cuerpo en trozos', 1, 'bara', '#d84a7a', '#7a1a3a', 'twin'],
    ['Fruta Resbalosa', 'Arcana', 'Piel tan resbaladiza que nada le toca', 1, 'sube', '#ff9ac8', '#b8407a', 'heart'],
    ['Fruta Bomba', 'Arcana', 'Hace explotar cualquier parte de su cuerpo', 1, 'bomu', '#e8742a', '#7a2a0a', 'round'],
    ['Fruta Peso', 'Arcana', 'Cambia su peso a voluntad', 1, 'kilo', '#9aa0b4', '#4a4f62', 'pear'],
    ['Fruta Brazos', 'Arcana', 'Hace brotar brazos en cualquier sitio', 2, 'hana', '#f070b0', '#8a2060', 'round'],
    ['Fruta Cera', 'Arcana', 'Crea cera más dura que el acero', 1, 'doru', '#f4e6b0', '#a08a3a', 'oval'],
    ['Fruta Quirófano', 'Arcana', 'Crea una sala donde lo controla todo', 3, 'ope', '#e8483a', '#7a120a', 'heart'],
    ['Fruta Hilos', 'Arcana', 'Crea hilos que cortan y controlan', 3, 'ito', '#ff70c0', '#a0206a', 'twin'],
    ['Fruta Terremoto', 'Arcana', 'Provoca terremotos que parten el mar', 4, 'gura', '#e8e2c8', '#7a7458', 'round'],
    ['Fruta Barrera', 'Arcana', 'Crea barreras irrompibles', 2, 'bari', '#a8e0ff', '#3a7aa8', 'oval'],
    ['Fruta Fantasma', 'Arcana', 'Fantasmas que quitan las ganas de luchar', 2, 'horo', '#f0f0ff', '#8a8ab8', 'pear'],
    ['Fruta Resurrección', 'Arcana', 'Vuelve a la vida una vez', 2, 'yomi', '#5aa8a0', '#1a4a46', 'pear'],
    ['Fruta Almas', 'Arcana', 'Roba y da vida a las almas', 4, 'soru', '#f05a8a', '#6a1036', 'heart'],
    ['Fruta Cuchillas', 'Arcana', 'Convierte su cuerpo en cuchillas', 1, 'supa', '#c8ccd8', '#5a6070', 'spiky'],
    ['Fruta Sombras', 'Arcana', 'Controla las sombras', 2, 'kage', '#4a3a6a', '#16102a', 'pear'],
    ['Fruta Veneno', 'Arcana', 'Crea y controla venenos mortales', 3, 'doku', '#7a3aa8', '#2a0a4a', 'spiky'],
    ['Fruta Repulsión', 'Arcana', 'Repele todo lo que toca', 3, 'nikyu', '#c87a5a', '#6a3020', 'heart'],
    ['Fruta Mochi', 'Arcana', 'Cuerpo de mochi elástico y pegajoso', 3, 'mochi', '#f4f0e8', '#b0a890', 'oval'],
    ['Fruta Sabiduría', 'Bestia', 'Gana inteligencia humana', 1, 'hito', '#e8c088', '#8a5a2a', 'pear'],
    ['Fruta Bisonte', 'Bestia', 'Se transforma en un bisonte', 1, 'ushi', '#8a5a3a', '#3a2010', 'round'],
    ['Fruta Leopardo', 'Bestia', 'Se transforma en leopardo', 2, 'neko', '#f0c040', '#6a4a10', 'round'],
    ['Fruta Lobo', 'Bestia', 'Se transforma en lobo', 2, 'inu', '#9aa8b8', '#3a4656', 'oval'],
    ['Fruta Fénix', 'Bestia', 'Fénix de llamas azules que se regenera', 4, 'tori', '#4ab0ff', '#0a4a9a', 'spiky'],
    ['Fruta Dragón Azul', 'Bestia', 'Se transforma en un dragón oriental', 4, 'uo', '#3a7ad8', '#0a2a6a', 'oval'],
    ['Fruta Trex', 'Bestia', 'Dinosaurio ancestral de mandíbulas brutales', 3, 'ryu_alo', '#6a9a3a', '#2a4a10', 'spiky'],
    ['Fruta Pteranodon', 'Bestia', 'Vuela como un reptil ancestral', 2, 'ryu_ptera', '#a8b84a', '#4a5a10', 'pear'],
    ['Fruta Elefante', 'Bestia', 'Se transforma en elefante', 1, 'zou', '#a8a0b0', '#4a4458', 'round'],
    ['Fruta Hidra', 'Bestia', 'Serpiente de ocho cabezas', 3, 'hebi', '#5a8a3a', '#1a3a10', 'oval'],
    ['Fruta Fuego Fuego', 'Elemental', 'Cuerpo de fuego', 3, 'mera', '#ff6a2a', '#a01a0a', 'spiky'],
    ['Fruta Hielo', 'Elemental', 'Congela el mar entero', 3, 'hie', '#bfe8ff', '#4a8ab8', 'round'],
    ['Fruta Luz', 'Elemental', 'Se mueve a la velocidad de la luz', 4, 'pika', '#fff07a', '#b89a10', 'spiky'],
    ['Fruta Magma', 'Elemental', 'Cuerpo de magma ardiente', 4, 'magu', '#d83a1a', '#4a0a04', 'round'],
    ['Fruta Rayo', 'Elemental', 'Domina el rayo', 4, 'goro', '#7ab0ff', '#1a3a8a', 'spiky'],
    ['Fruta Arena', 'Elemental', 'Cuerpo de arena que seca todo', 2, 'suna', '#e8c87a', '#8a6a2a', 'pear'],
    ['Fruta Humo', 'Elemental', 'Cuerpo de humo', 2, 'moku', '#d8d8dc', '#7a7a84', 'oval'],
    ['Fruta Oscuridad', 'Elemental', 'Oscuridad que traga todo y anula poderes', 4, 'yami', '#3a2058', '#0a0414', 'round'],
    ['Fruta Gas', 'Elemental', 'Cuerpo de gas venenoso', 2, 'gasu', '#9ad84a', '#3a6a10', 'pear'],
    ['Fruta Nieve', 'Elemental', 'Cuerpo de nieve', 2, 'yuki', '#f4f8ff', '#9ab0d0', 'round'],
    ['Fruta Pantano', 'Elemental', 'Cuerpo de pantano sin fondo', 2, 'numa', '#6a7a4a', '#2a3418', 'oval']
  ].map((f, i) => ({ id: i, name: f[0], type: f[1], ability: f[2], rarity: f[3], key: f[4], look: [f[5], f[6], f[7]] }));
  OP.FRUIT_BY_KEY = {};
  for (const F of OP.FRUITS) OP.FRUIT_BY_KEY[F.key] = F;

  // ---------- Nombres ----------
  OP.NAMES_M = ['Kaito', 'Jiro', 'Taro', 'Ren', 'Kenji', 'Ryo', 'Daisuke', 'Haru', 'Ichiro', 'Mamoru', 'Nobu', 'Osamu', 'Riku', 'Tetsu', 'Yoshi',
    'Zen', 'Goro', 'Hiro', 'Isamu', 'Kazu', 'Shin', 'Wataru', 'Benny', 'Carlo', 'Diego', 'Fausto', 'Hugo', 'Jack', 'Oscar', 'Pablo', 'Salvo',
    'Ulises', 'Willy', 'Yago', 'Bruno', 'Dante', 'Ezra', 'Flint', 'Hal', 'Ivo', 'Jasper', 'Kit', 'Lino', 'Moss', 'Otto', 'Pip', 'Rook', 'Sid',
    'Vic', 'Bastian', 'Cyrus', 'Doran', 'Gael', 'Hector', 'Lucio', 'Nando', 'Paco', 'Remy', 'Silas', 'Tobias', 'Gonzo', 'Barto', 'Rufo',
    'Tadeo', 'Iker', 'Kuro', 'Gin', 'Toshi', 'Akio', 'Masa', 'Raizo', 'Kenta', 'Duval', 'Morgan', 'Bram', 'Tiago', 'Elio', 'Matteo'];
  OP.NAMES_F = ['Rin', 'Mika', 'Yuki', 'Sora', 'Hana', 'Aki', 'Kiko', 'Emi', 'Kana', 'Saki', 'Umi', 'Mei', 'Natsu', 'Ran', 'Tama', 'Yoko',
    'Elena', 'Gina', 'Iris', 'Kora', 'Lola', 'Quina', 'Rosa', 'Tina', 'Vera', 'Xenia', 'Zara', 'Coco', 'Greta', 'Ines', 'Mara', 'Nell',
    'Olga', 'Tess', 'Velma', 'Wren', 'Alma', 'Brisa', 'Carmen', 'Dalia', 'Erika', 'Frida', 'Hilda', 'Ivy', 'Juno', 'Luna', 'Marisa', 'Nora',
    'Perla', 'Reina', 'Selene', 'Tara', 'Ada', 'Chiyo', 'Fumi', 'Hotaru', 'Izumi', 'Kaede', 'Momo', 'Nagisa', 'Shiori', 'Tsubame', 'Yume'];
  OP.SURNAMES = ['Kurogane', 'Shiranui', 'Takeda', 'Hoshino', 'Kazama', 'Mizuno', 'Arashi', 'Kagero', 'Tsubaki', 'Ryuzaki', 'Sakamoto',
    'Ishida', 'Morita', 'Kurosawa', 'Hayabusa', 'Kanzaki', 'Nanase', 'Okami', 'Tachibana', 'Umino', 'Marlowe', 'Barrett', 'Delmar',
    'Espada', 'Ferro', 'Galeano', 'Herrera', 'Krane', 'Lobo', 'Montero', 'Navarro', 'Ocampo', 'Pardo', 'Quinn', 'Rivas', 'Salazar',
    'Tormenta', 'Valdés', 'Wilde', 'Blackwood', 'Corsario', 'Brasa', 'Coral', 'Garfio', 'Ancla', 'Bruma', 'Cuervo', 'Halcón', 'Marea',
    'Vendaval', 'Kaizoku', 'Shiokaze', 'Nagisa', 'Kaminari', 'Tatsumaki', 'Yamakaze', 'Onibi', 'Hagane', 'Sazanami', 'Fuuma', 'Grimm',
    'Stone', 'Hook', 'Rojas', 'Duarte', 'Silva', 'Castillo', 'Mendoza', 'Aguirre', 'Bellamar', 'Oleaje'];
  OP.EPI_NOUN = [['Tiburón', 'm'], ['Huracán', 'm'], ['Relámpago', 'm'], ['Cuervo', 'm'], ['Lobo', 'm'], ['Kraken', 'm'], ['Dragón', 'm'],
    ['Escorpión', 'm'], ['Martillo', 'm'], ['Trueno', 'm'], ['Cometa', 'm'], ['Demonio', 'm'], ['Fantasma', 'm'], ['Volcán', 'm'], ['Toro', 'm'],
    ['Tormenta', 'f'], ['Serpiente', 'f'], ['Sombra', 'f'], ['Calavera', 'f'], ['Sirena', 'f'], ['Bestia', 'f'], ['Muralla', 'f'], ['Llama', 'f'], ['Pantera', 'f']];
  OP.EPI_ADJ = [['Rojo', 'Roja'], ['Negro', 'Negra'], ['Blanco', 'Blanca'], ['Dorado', 'Dorada'], ['Loco', 'Loca'], ['Silencioso', 'Silenciosa'],
    ['de Hierro', 'de Hierro'], ['Carmesí', 'Carmesí'], ['Salvaje', 'Salvaje'], ['de Acero', 'de Acero'], ['de Fuego', 'de Fuego'],
    ['de Hielo', 'de Hielo'], ['Errante', 'Errante'], ['Sonriente', 'Sonriente'], ['del Norte', 'del Norte'], ['del Sur', 'del Sur'], ['Imparable', 'Imparable']];
  OP.EPI_BODY = ['Puño de Hierro', 'Brazo de Acero', 'Garra de Plata', 'Mil Espadas', 'Cien Balas', 'Tres Filos', 'Ojo de Águila',
    'Pierna de Trueno', 'Mano Negra', 'Diente de Sable', 'Doble Filo', 'Bala de Cañón', 'Rompeolas', 'Cazadragones', 'Corazón de Piedra'];
  OP.SHIP_WORDS = ['Viento', 'Marea', 'Gaviota', 'Ballena', 'Estrella', 'Tormenta', 'Fortuna', 'Aurora', 'Bruma', 'Ola', 'Sirena', 'Calavera',
    'Corona', 'Ancla', 'Perla', 'Delfín', 'Cometa', 'Horizonte', 'Tiburón', 'Leviatán'];
  OP.SHIP_ADJ = ['Negra', 'Dorada', 'Loca', 'Libre', 'Salvaje', 'Roja', 'Brava', 'Errante', 'Feroz', 'Alegre', 'Veloz', 'Eterna'];
  OP.JP_WORDS = ['Kaze', 'Nami', 'Umi', 'Sora', 'Hoshi', 'Tora', 'Ryu', 'Taka', 'Kumo', 'Hi', 'Yuki', 'Kame'];

  OP.HAIR_STYLES = ['corto', 'puntiagudo', 'largo', 'coleta', 'afro', 'calvo', 'cresta', 'moño'];
  OP.HAIR_NAMES = { corto: 'Corto', puntiagudo: 'Puntiagudo', largo: 'Largo', coleta: 'Coleta', afro: 'Afro', calvo: 'Calvo', cresta: 'Cresta', 'moño': 'Moño' };
  OP.SKINS = ['#f6d3b3', '#eebd94', '#d9a066', '#b97a4a', '#8d5a32', '#5e3a22'];
  OP.HAIR_COLORS = ['#1b1b1f', '#4a2c17', '#8a5a2b', '#e8c45a', '#f2f2f2', '#c43b2b', '#3d7be0', '#3fa65a', '#e07ac2', '#f08a24', '#7a4bd1', '#8f9aa6'];
  OP.CLOTH_COLORS = ['#c0392b', '#2e86de', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#2c3e50', '#16a085', '#d35400', '#ff6fa8', '#7f8c8d'];
  OP.ACCESSORIES = ['ninguno', 'sombrero de paja', 'tricornio', 'bandana', 'gorro', 'cicatriz', 'parche', 'gafas', 'barba',
    'gafas de sol', 'bigote', 'pendientes', 'capa', 'turbante', 'flor', 'cigarro', 'casco vikingo'];
  OP.BUILDS = ['delgado', 'normal', 'fornido'];

  // ---------- Personalidad ----------
  OP.DREAMS_PIRATE = {
    onepiece: 'Encontrar el Tesoro Supremo',
    fama: 'Ser el pirata más famoso',
    dinero: 'Hacerse rico',
    aventura: 'Vivir aventuras por todo el mar',
    espadachin: 'Ser el mejor espadachín del mundo',
    allblue: 'Encontrar el Mar Legendario',
    mapa: 'Dibujar el mapa del mundo entero'
  };
  OP.DREAMS_MARINE = {
    justicia: 'Acabar con la piratería',
    ascender: 'Llegar a Almirante',
    proteger: 'Proteger a la gente',
    poder: 'Ser el marine más fuerte',
    espadachin: 'Ser el mejor espadachín del mundo'
  };
  OP.QUOTES = {
    onepiece: ['El Tesoro Supremo será mío, cueste lo que cueste.', 'Llegaré a Isla Postrera aunque tenga que cruzar el mundo entero.', '¡Seré el próximo Rey de los Mares!', 'El tesoro me espera al final de la Ruta Mayor.'],
    fama: ['Algún día mi cartel estará en cada taberna del mar.', 'Que el mundo entero aprenda mi nombre.', 'Cuanto más alta la recompensa, más fuerte mi leyenda.'],
    dinero: ['Un buen botín vale más que mil palabras.', 'El oro no traiciona... casi nunca.', 'Cada doblón cuenta. Cada isla tiene su tesoro.'],
    aventura: ['El horizonte siempre esconde algo mejor.', 'No navego por oro: navego por lo desconocido.', 'Cada isla nueva es una historia nueva.'],
    justicia: ['La justicia no descansa.', 'Ningún pirata escapará mientras yo respire.', 'El mar será libre de piratas.'],
    ascender: ['Llevaré la capa de Almirante.', 'Cada misión es un paso hacia la cima.', 'Las estrellas del uniforme se ganan sudando.'],
    proteger: ['Mientras yo esté aquí, nadie hará daño a esta gente.', 'Mi espada protege a los débiles.', 'Una ciudad a salvo vale más que una medalla.'],
    poder: ['La fuerza es la única justicia que entienden los piratas.', 'Seré el marine más fuerte de la historia.', 'Entreno hasta que no quede nadie que me iguale.'],
    espadachin: ['Mi espada no conoce la derrota.', 'Cortaré todo lo que se interponga en mi camino.', 'Un día el mundo entero conocerá mi filo.'],
    allblue: ['Existe un mar donde viven los peces de los cuatro mares.', 'Cocinaré con los peces del Mar Legendario.', 'Ese mar legendario me está esperando.'],
    mapa: ['Ninguna isla quedará fuera de mi mapa.', 'Cada costa que veo la dibujo.', 'El mapa del mundo será mi obra maestra.']
  };
  OP.PERSONALITY_WORDS = {
    ambition: ['Conformista', 'Ambicioso'],
    aggression: ['Pacífico', 'Agresivo'],
    courage: ['Cauteloso', 'Valiente'],
    sociability: ['Solitario', 'Sociable'],
    greed: ['Generoso', 'Codicioso'],
    loyalty: ['Independiente', 'Leal'],
    curiosity: ['Práctico', 'Curioso'],
    honor: ['Despiadado', 'Honorable']
  };
})();
