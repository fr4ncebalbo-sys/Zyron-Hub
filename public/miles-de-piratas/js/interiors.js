/* MILESDEPIRATAS - INTERIORES de los edificios (datos COMPARTIDOS: los usan el servidor y el cliente).
   - Las puertas salen del propio mapa: en cada isla con pueblo hay una taberna (la casa más cercana al puerto),
     en algunas una clínica del alquimista y un par de casas con vecinos. Siempre las mismas casillas.
   - Cada sala es un plano por casillas (estilo RPG clásico): # pared · . suelo · R alfombra · D salida;
     el resto son muebles que no se pueden atravesar.
   - Los NPC de dentro cuentan la historia del mundo y guían por la ruta (nombres propios del juego). */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const IN = (OP.Interiors = {});

  IN.ROOMS = {
    tavern: { name: 'Taberna', w: 13, h: 10, spawn: [6.5, 8.5], map: [
      '#############',
      '#SSSWSSSWSbb#',
      '#.........b.#',
      '#BBBBB......#',
      '#...........#',
      '#.cTc...cTc.#',
      '#...........#',
      '#.cTc..RR...#',
      '#......RR..P#',
      '######D######'] },
    house: { name: 'Casa', w: 9, h: 8, spawn: [4.5, 6.5], map: [
      '#########',
      '#SWSFSWK#',
      '#......K#',
      '#.......#',
      '#..TT...#',
      '#...RR..#',
      '#P..RR.b#',
      '####D####'] },
    clinic: { name: 'Clínica del alquimista', w: 11, h: 8, spawn: [5.5, 6.5], map: [
      '###########',
      '#MMWMMMWMM#',
      '#....O....#',
      '#CCCC.....#',
      '#.........#',
      '#K....RR.K#',
      '#KP...RR.K#',
      '#####D#####'] }
  };
  const WALKABLE = { '.': 1, R: 1, D: 1 };
  IN.tileAt = (kind, x, y) => { const R = IN.ROOMS[kind]; if (!R) return '#'; const row = R.map[Math.floor(y)]; return row ? row[Math.floor(x)] || '#' : '#'; };
  // ¿se puede pisar? (muebles, paredes y NPC bloquean)
  IN.free = function (kind, x, y, npcs) {
    if (!WALKABLE[IN.tileAt(kind, x, y)]) return false;
    for (const n of npcs || []) if (Math.floor(n.x) === Math.floor(x) && Math.floor(n.y) === Math.floor(y)) return false;
    return true;
  };
  IN.WALK = 3.2;   // casillas por segundo dentro de un edificio
  IN.step = function (p, dx, dy, dt, kind, npcs) {
    const L = Math.hypot(dx, dy);
    if (L < 0.01) return false;
    const vx = dx / L * IN.WALK * dt, vy = dy / L * IN.WALK * dt;
    let moved = false;
    const ok = (x, y) => IN.free(kind, x + 0.28 * Math.sign(vx || 0), y, npcs) && IN.free(kind, x, y + 0.2 * Math.sign(vy || 0), npcs);
    if (ok(p.x + vx, p.y)) { p.x += vx; moved = true; }
    if (ok(p.x, p.y + vy)) { p.y += vy; moved = true; }
    return moved;
  };
  IN.onExit = (kind, p) => IN.tileAt(kind, p.x, p.y) === 'D';

  // ---------- Puertas (a partir del mapa, igual en el servidor y en el cliente) ----------
  const CLINIC_ISLANDS = ['logue', 'drum', 'sabaody', 'water7', 'dressrosa', 'wano', 'alabasta', 'gyojin'];
  let doors = null, byId = null;
  IN.doors = function () {
    if (doors) return doors;
    const M = OP.M, T = OP.T;
    doors = []; byId = {};
    if (!M) return doors;
    for (const I of M.islands) {
      if (!I.land || !I.land.length || I.hidden) continue;
      const cand = [];
      for (const c of I.land) {
        if (M.t[c] !== T.TOWN) continue;
        const x = c % M.W, y = (c / M.W) | 0;
        if (x % 2 || y % 2 || OP.hash2(x, y, 4242) >= 0.8) continue;   // las mismas casillas en las que se dibuja una casa
        const below = (y + 2) * M.W + x + 1;
        if (M.isl[below] !== I.idx || !OP.isLand(M.t[below])) continue;   // delante de la puerta tiene que haber suelo
        cand.push({ x, y, d: Math.hypot(x - I.dockX, y - I.dockY) });
      }
      if (!cand.length) continue;
      cand.sort((a, b) => a.d - b.d);
      const kinds = ['tavern'];
      if (CLINIC_ISLANDS.indexOf(I.id) >= 0) kinds.push('clinic');
      kinds.push('house', 'house');
      const picked = [cand[0]];
      for (let k = 1; k < kinds.length; k++) {   // las demás, lo más separadas posible
        let best = null, bd = -1;
        for (const c of cand) { if (picked.indexOf(c) >= 0) continue; const d = Math.min(...picked.map((q) => Math.hypot(q.x - c.x, q.y - c.y))); if (d > bd) { bd = d; best = c; } }
        if (!best || bd < 2) break;
        picked.push(best);
      }
      picked.forEach((c, k) => {
        const kind = kinds[k];
        const id = I.id + ':' + kind + (kind === 'house' ? k : '');
        const d = { id, kind, isl: I.idx, islId: I.id, x: c.x + 1, y: c.y + 1.6, tx: c.x, ty: c.y,
          name: kind === 'tavern' ? (TAVERN_NAMES[I.id] || 'Taberna de ' + I.name) : kind === 'clinic' ? 'Clínica del alquimista' : 'Casa de ' + I.name };
        doors.push(d); byId[id] = d;
      });
    }
    return doors;
  };
  IN.door = (id) => { IN.doors(); return byId[id] || null; };
  IN.nearDoor = function (x, y, r) {
    let best = null, bd = r || 1.5;
    for (const d of IN.doors()) { const dd = Math.hypot(d.x - x, d.y + 0.3 - y); if (dd < bd) { bd = dd; best = d; } }
    return best;
  };

  // ---------- Personajes de los interiores ----------
  const TAVERN_NAMES = { sabaody: 'Taberna La Burbuja Rota', logue: 'Taberna del Último Puerto', water7: 'Taberna de los Astilleros', alabasta: 'Taberna del Oasis', jaya: 'Taberna del Sueño Roto', wano: 'Casa de té del Cerezo', dressrosa: 'Taberna del Coliseo', drum: 'Taberna de la Nieve Eterna' };
  const A = (skin, hair, hairColor, cloth, acc, build) => ({ skin, hair, hairColor, cloth, acc: acc || 'ninguno', build: build || 'normal' });
  // historia: un personaje importante por isla (texto propio del juego). {next} = siguiente isla de tu Log Pose
  const STORY = {
    sabaody: { where: 'tavern', npc: { id: 'aldric', name: 'Aldric Velasombra, el Viejo Timonel', app: A('#d9a066', 'largo', '#e8e8e8', '#5a6a7a', 'gafas', 'normal'), x: 7, y: 4, action: 'coat', lines: [
      'Vaya, vaya... otro joven con fuego en la mirada. Hace mucho tiempo yo también navegué con el hombre que llegó al final del mar.',
      'Para seguir adelante tendrás que bajar a diez mil metros, hasta la Isla Gyojin, y cruzar por debajo de la Red Line.',
      'Ningún barco aguanta esa presión sin RECUBRIMIENTO: una resina de los manglares que forma una burbuja alrededor del casco.',
      'Yo te enseño a hacerlo. Pero el Nuevo Mundo no perdona: si no estás preparado, no vuelvas a por tu barco.'] } },
    logue: { where: 'house', npc: { id: 'tessa', name: 'Abuela Tessa', app: A('#f6d3b3', 'moño', '#d8d8d8', '#8a4a6a', 'ninguno', 'delgado'), x: 5, y: 3, lines: [
      'Esta es la ciudad del principio y del final: aquí empezó la Gran Era de la Piratería.',
      'Si vas a entrar en la Grand Line, compra un Log Pose. Las brújulas no sirven allí: el Log Pose se fija a la isla siguiente.',
      'Sube por Reverse Mountain con un barco de verdad, no con un bote. Y si un día quieres volver, la corriente también baja.',
      'Tu próximo destino debería ser {next}.'] } },
    water7: { where: 'house', npc: { id: 'brunel', name: 'Maestro Brunel, carpintero de naves', app: A('#b97a4a', 'corto', '#3a2a1a', '#2a6ad8', 'cigarro', 'fornido'), x: 5, y: 3, lines: [
      'Un barco es como un compañero de tripulación: si lo cuidas, te lleva hasta el fin del mundo.',
      'Más adelante, en Sabaody, busca a un viejo timonel en la taberna. Sabe cómo bajar al fondo del mar.',
      'Desde aquí tu Log Pose apunta a {next}.'] } },
    alabasta: { where: 'house', npc: { id: 'sadiq', name: 'Viejo Sadiq del desierto', app: A('#8d5a32', 'calvo', '#1b1b1f', '#e8d8a8', 'turbante', 'delgado'), x: 5, y: 3, lines: [
      'El desierto pone a prueba a los viajeros: el sol de día, el frío de noche.',
      'Quien sobrevive un día entero aquí sale más fuerte. Dicen que en Punk Hazard la prueba es peor: fuego y hielo a la vez.',
      'Tu siguiente isla es {next}.'] } },
    drum: { where: 'clinic', npc: { id: 'ilsa', name: 'Doctora Ilsa Escarcha', app: A('#f6d3b3', 'largo', '#c8c8d8', '#f4f4f4', 'gafas', 'delgado'), x: 2, y: 2, action: 'fruit', lines: [
      'En esta isla curamos casi todo... incluso la maldición del mar.',
      'Con mis remedios puedo arrancarte los poderes de tu Fruta del Diablo. No es barato, ni agradable. Pero podrás comer otra.',
      'Y si tienes berries de sobra, también tengo alguna fruta guardada en mis estantes.'] } },
    skypiea: { where: 'tavern', npc: { id: 'aurel', name: 'Sacerdote Aurel de las nubes', app: A('#f6d3b3', 'calvo', '#f4f4f4', '#f4f4f4', 'ninguno', 'delgado'), x: 7, y: 4, lines: [
      'Bienvenido a la tierra sobre el mar blanco. Pocos suben con la corriente Knock Up y aún menos bajan.',
      'Aquí arriba se entrena distinto: el aire es fino y el cuerpo aprende a moverse ligero.'] } },
    gyojin: { where: 'tavern', npc: { id: 'nerea', name: 'Nerea, cantora de las profundidades', app: A('#7fc8d8', 'largo', '#2a6ad8', '#3ab0b0', 'flor', 'delgado'), x: 7, y: 4, lines: [
      'Has bajado a diez mil metros con tu barco recubierto. ¡Eso solo lo consiguen los valientes!',
      'Más allá del túnel empieza el Nuevo Mundo. Allí los mares son más salvajes y los piratas, Emperadores.'] } },
    punkhazard: { where: 'tavern', npc: { id: 'vorn', name: 'Vorn, superviviente de la isla partida', app: A('#b97a4a', 'puntiagudo', '#7a1a1a', '#5a5a66', 'cicatriz', 'fornido'), x: 7, y: 4, lines: [
      'Media isla arde y la otra media está congelada. Aquí no se viene a pasear.',
      'Si aguantas dos días de juego en esta isla, entrenando sin caer, sabrás que estás listo para el resto del Nuevo Mundo.'] } },
    wano: { where: 'tavern', npc: { id: 'kenshiro', name: 'Kenshiro, rōnin errante', app: A('#eebd94', 'coleta', '#1b1b1f', '#4a3a6a', 'cicatriz', 'normal'), x: 7, y: 4, lines: [
      'Este país estuvo cerrado al mundo durante siglos. Sus espadachines son los más temidos del mar.',
      'Sobrevive aquí dos días y tu nombre se oirá hasta en Laugh Tale.'] } }
  };
  const POOL = [A('#eebd94', 'corto', '#5a3a1a', '#c0392b', 'barba', 'fornido'), A('#d9a066', 'calvo', '#1b1b1f', '#2a6ad8', 'parche', 'normal'), A('#f6d3b3', 'coleta', '#c8a050', '#3fa65a', 'pendientes', 'delgado'),
    A('#b97a4a', 'afro', '#1b1b1f', '#e07a3a', 'gafas de sol', 'normal'), A('#8d5a32', 'puntiagudo', '#7a1a1a', '#5a4a8a', 'bandana', 'fornido'), A('#f6d3b3', 'largo', '#e8c050', '#c84a8a', 'flor', 'delgado')];
  const VILLAGER_NAMES = ['Brann', 'Odile', 'Teodoro', 'Mira', 'Gorka', 'Selene', 'Pim', 'Ulla', 'Rodrigo', 'Vesna', 'Lupe', 'Cosme'];
  const RUMORS = [
    'Dicen que las Frutas del Diablo aparecen cerca de quien navega. Mantén los ojos abiertos: brillan cuando estás cerca.',
    'He oído que en la plaza de Marineford ejecutan a los piratas más buscados... y que a veces alguien los rescata.',
    'Los cazarrecompensas no perdonan a los traidores. Si traicionas a tu tripulación, prepárate.',
    'Un marinero me contó que el Haki del Rey solo lo tiene uno de cada diez. ¿Serás tú?',
    'Si te pierdes, mira tu Log Pose: siempre apunta a la siguiente isla de la ruta.',
    'En las islas con 🥋 se entrena el doble de bien. En la de las tortugas gigantes, cargan sus caparazones a la espalda.'
  ];
  const h = (s) => { let v = 7; for (const ch of String(s)) v = (v * 31 + ch.charCodeAt(0)) >>> 0; return v; };
  IN.npcsFor = function (door) {
    if (!door) return [];
    const out = [];
    const I = OP.M && OP.M.islands[door.isl];
    const st = STORY[door.islId];
    if (st && st.where === door.kind) out.push(Object.assign({ story: true }, st.npc));
    const k = h(door.id);
    if (door.kind === 'tavern') {
      out.push({ id: 'barkeep', name: (door.islId === 'sabaody' ? 'Doña Mirela' : VILLAGER_NAMES[k % VILLAGER_NAMES.length]) + ', tabernera', app: POOL[(k >> 3) % POOL.length], x: 3, y: 2,
        lines: ['¡Bienvenido a ' + door.name + '! Aquí se viene a descansar y a escuchar historias.', RUMORS[k % RUMORS.length], 'Si buscas tu próximo rumbo, tu Log Pose marca {next}.'] });
      out.push({ id: 'patron', name: 'Viejo marinero', app: POOL[(k >> 5) % POOL.length], x: 2, y: 5, lines: [RUMORS[(k >> 2) % RUMORS.length], 'Hace años navegué por ' + (I ? I.name : 'estos mares') + '. Las cosas han cambiado mucho...'] });
    } else if (door.kind === 'clinic' && !(st && st.where === 'clinic')) {
      out.push({ id: 'alchemist', name: 'Alquimista ' + VILLAGER_NAMES[(k >> 4) % VILLAGER_NAMES.length], app: A('#eebd94', 'largo', '#5a3a6a', '#4a2a6a', 'gafas', 'delgado'), x: 2, y: 2, action: 'fruit',
        lines: ['Bienvenido a mi clínica. Mezclo remedios que ningún médico se atreve a probar.', 'Puedo quitarte los poderes de tu Fruta del Diablo para que comas otra... por un precio.', 'También vendo alguna fruta que me ha llegado de contrabando.'] });
    } else if (door.kind === 'house' && !(st && st.where === 'house')) {
      out.push({ id: 'villager', name: VILLAGER_NAMES[(k >> 2) % VILLAGER_NAMES.length] + ', vecino de ' + (I ? I.name : 'la isla'), app: POOL[k % POOL.length], x: 5, y: 3,
        lines: [RUMORS[(k >> 6) % RUMORS.length], 'Desde aquí, la siguiente isla de la ruta es {next}.'] });
    }
    return out;
  };
  // precios del alquimista
  IN.fruitResetCost = (F) => Math.round(8e6 * ((OP.RARITY_MULT && OP.RARITY_MULT[F.rarity]) || 1));
  IN.fruitBuyCost = (F) => Math.round(30e6 * ((OP.RARITY_MULT && OP.RARITY_MULT[F.rarity]) || 1));
})();
