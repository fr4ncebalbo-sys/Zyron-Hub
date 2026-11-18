/* EDIFICIOS POR DENTRO (servidor): entrar y salir, moverse por la sala, hablar con sus NPC y sus servicios.
   - Dentro de un edificio el jugador desaparece del mapa para los de fuera, y solo ve (y le ven) los que están en la misma sala.
   - Dentro no se pelea, ningún NPC de fuera te ataca y te curas más rápido.
   - Servicios: el viejo timonel de Sabaody enseña el RECUBRIMIENTO del barco (y lo hace); el alquimista quita la Fruta del Diablo
     que comiste (para comer otra) y vende frutas libres del mundo. Todo validado aquí. */
'use strict';

function install(Room) {
  const P = Room.prototype;
  const IN = () => P._IN || (P._IN = require('./context').OP.Interiors);

  P.roomNpcs = function (p) { const door = p.inside && IN().door(p.inside.room); return IN().npcsFor(door); };

  P.onDoor = function (s, m) {
    const p = s.data;
    if (m.op === 'exit') return this.exitInterior(s, false);
    if (p.inside) return;
    if (s.st.dead || p.boat || p.execution || p.prison || s.ride) return;
    if ((s.stunUntil || 0) > Date.now()) return;
    const door = IN().door(String(m.id || ''));
    if (!door || Math.hypot(door.x - p.x, door.y + 0.3 - p.y) > 2) return this.toast(s, 'Acércate a la puerta.');
    if (Date.now() - s.lastCombat < 3000) return this.toast(s, '⚔ No puedes refugiarte en mitad de un combate.');
    if (s.training) this.stopTraining(s, '');
    if (p.zoanOn) this.endZoan(s, '');
    const R = IN().ROOMS[door.kind];
    p.inside = { room: door.id, kind: door.kind, isl: door.isl, name: door.name };
    s.ix = R.spawn[0]; s.iy = R.spawn[1] - 1;
    s.input.dx = 0; s.input.dy = 0;
    for (const [id, e] of this.engage) if (e.sid === s.sid) this.engage.delete(id);
    s.st.inside = door.id;
    s.client.send('room', { k: 'enter', door, npcs: this.roomNpcs(p).map((n) => ({ id: n.id, name: n.name, app: n.app, x: n.x, y: n.y, story: !!n.story, action: n.action || '' })), x: s.ix, y: s.iy });
    s.dirty = true;
    this.syncPublic(s);
  };

  // salir (andando por la puerta o al pasar algo que te saca: ejecución, cárcel, teletransporte...)
  P.exitInterior = function (s, silent) {
    const p = s.data;
    if (!p.inside) return;
    const door = IN().door(p.inside.room);
    p.inside = null;
    s.st.inside = '';
    if (!silent && door) {
      p.x = door.x; p.y = door.y + 0.55;
      const M = this.M, j = Math.floor(p.y) * M.W + Math.floor(p.x);
      if (M.isl[j] !== door.isl || !this.OP.isLand(M.t[j])) { const pos = this.game.portPos(M.islands[door.isl]); p.x = pos.x; p.y = pos.y; }
      p.boat = '';
      s.client.send('room', { k: 'exit', x: p.x, y: p.y });
      s.client.send('teleport', { x: p.x, y: p.y });
    } else s.client.send('room', { k: 'exit', x: p.x, y: p.y });
    s.dirty = true;
    this.syncPublic(s);
  };

  // cada tick dentro: moverse por la sala (con las mismas reglas que el cliente) y salir al pisar la puerta
  P.tickInside = function (s, dt) {
    const p = s.data;
    if (p.execution || p.prison || p.boat) return this.exitInterior(s, true);
    const kind = p.inside.kind;
    const pos = { x: s.ix, y: s.iy };
    const { dx, dy } = s.input;
    const moved = (dx || dy) ? IN().step(pos, dx, dy, dt, kind, this.roomNpcs(p)) : false;
    s.ix = pos.x; s.iy = pos.y;
    s.st.moving = moved;
    if (moved && Math.abs(dx) > 0.2) s.st.dir = dx < 0 ? -1 : 1;
    if (moved && IN().onExit(kind, pos)) return this.exitInterior(s, false);
    // dentro se descansa: te curas más rápido
    const st = this.MMO.stats(p);
    if (p.hp < st.maxHp && this.tickN % 10 === 0) { p.hp = Math.min(st.maxHp, p.hp + Math.max(1, st.maxHp * 0.02)); s.dirty = true; }
    s.st.fighting = false;
    this.syncPublic(s);
  };

  // ---------- Hablar con un NPC de la sala ----------
  P.onTalk = function (s, m) {
    const { OP, MMO, game } = this;
    const p = s.data;
    if (!p.inside) return;
    const npc = this.roomNpcs(p).find((n) => n.id === String(m.npc || ''));
    if (!npc) return;
    if (Math.hypot(npc.x + 0.5 - s.ix, npc.y + 0.5 - s.iy) > 2.2) return this.toast(s, 'Acércate más para hablar.');
    const next = MMO.nextLog(p);
    const fill = (t) => t.replace('{next}', next ? next.I.name + (next.why ? ' (aún te falta: ' + next.why.replace(/^el Log Pose no te deja atracar: necesitas /, '') + ')' : '') : 'ninguna: ¡ya has recorrido toda la ruta!');
    const opt = String(m.opt || '');
    const out = { npc: npc.id, name: npc.name, app: npc.app, lines: npc.lines.map(fill), options: [] };
    // ---- el viejo timonel: enseña y hace el recubrimiento ----
    if (npc.action === 'coat') {
      if (!p.coatTalk) { p.coatTalk = true; game.moment(p, 'Conoció a Aldric Velasombra, el Viejo Timonel', 30); s.dirty = true; s.saveDirty = true; }
      const price = MMO.SHOP.coating.price;
      if (opt === 'coat') {
        if (p.coated) out.lines = ['Tu barco ya está recubierto. Ve con cuidado ahí abajo.'];
        else if (MMO.shipOf(p, this.crewShip(p)) === 'bote') out.lines = ['¿Un bote? Ni la mejor resina lo salvaría. Consíguete un barco de verdad.'];
        else if (p.money < price) out.lines = ['El recubrimiento cuesta ' + OP.fmtB(price) + '. Vuelve cuando los tengas.'];
        else { p.money -= price; p.coated = true; game.addLog(p, 'Aldric Velasombra recubrió su barco.'); out.lines = ['Listo. Tu barco ya tiene su burbuja. Baja por la Isla Gyojin hacia el Nuevo Mundo... y no mires atrás.']; this.toast(s, '🫧 ¡Tu barco está recubierto! Ya puedes bajar a la Isla Gyojin (G en el paso).'); s.dirty = true; s.saveDirty = true; }
      }
      if (!p.coated) out.options.push({ opt: 'coat', label: '🫧 Recubrir mi barco (' + OP.fmtB(price) + ')' });
      else out.lines.push('Tu barco ya lleva el recubrimiento.');
    }
    // ---- el alquimista: quitar la fruta comida y vender frutas libres ----
    if (npc.action === 'fruit') {
      const offers = this.fruitOffers();
      if (opt === 'reset') {
        if (p.fruit < 0) out.lines = ['No veo ninguna maldición en ti. No has comido ninguna fruta.'];
        else {
          const F = OP.FRUITS[p.fruit], cost = IN().fruitResetCost(F);
          if (p.money < cost) out.lines = ['Purgar la ' + F.name + ' cuesta ' + OP.fmtB(cost) + '. No tienes suficiente.'];
          else {
            p.money -= cost;
            if (p.zoanOn) this.endZoan(s, '');
            const fr = OP.S.fruits[p.fruit];
            if (fr) { fr.state = 'none'; fr.owner = 0; fr.ownerName = ''; fr.isl = -1; fr.x = null; }   // la fruta vuelve al mundo
            game.moment(p, 'Se purgó la ' + F.name + ' con un alquimista', 30);
            this.news('fruit', p.name + ' ha renunciado a los poderes de la ' + F.name + '. Dicen que la fruta volverá a aparecer en algún lugar del mar.', 2);
            p.fruit = -1;
            out.lines = ['Bebe esto... y aguanta. ¡Ya está! Los poderes de la ' + F.name + ' te han dejado. Ya puedes comer otra fruta.'];
            this.toast(s, '🧪 Ya no tienes la ' + F.name + '. Puedes comer otra Fruta del Diablo.');
            s.dirty = true; s.saveDirty = true; this.syncPublic(s);
          }
        }
      } else if (opt.indexOf('buy:') === 0) {
        const fid = Number(opt.slice(4));
        const fr = OP.S.fruits[fid];
        const F = OP.FRUITS[fid];
        p.inv.fruits = p.inv.fruits || [];
        if (!fr || offers.indexOf(fid) < 0 || fr.state !== 'none') out.lines = ['Esa ya la he vendido. Mira lo que me queda.'];
        else if (p.inv.fruits.length >= MMO.FRUIT_BAG_MAX) out.lines = ['No te caben más frutas en la bolsa.'];
        else if (p.money < IN().fruitBuyCost(F)) out.lines = ['La ' + F.name + ' cuesta ' + OP.fmtB(IN().fruitBuyCost(F)) + '. No te llega.'];
        else {
          p.money -= IN().fruitBuyCost(F);
          fr.state = 'carried'; fr.isl = -1; fr.x = null; fr.ownerName = p.name; fr.owner = 0; fr.since = OP.S.time;
          p.inv.fruits.push(fid);
          game.moment(p, 'Compró la ' + F.name + ' a un alquimista', 30);
          out.lines = ['Aquí la tienes: la ' + F.name + '. Está en tu bolsa (I). Cómela solo si estás seguro...'];
          this.toast(s, '🍎 Has comprado la ' + F.name + '. Está en tu inventario (I).');
          s.dirty = true; s.saveDirty = true;
        }
      }
      if (p.fruit >= 0) { const F = OP.FRUITS[p.fruit]; out.options.push({ opt: 'reset', label: '🧪 Purgar mi ' + F.name + ' (' + OP.fmtB(IN().fruitResetCost(F)) + ')' }); }
      for (const fid of this.fruitOffers()) { const F = OP.FRUITS[fid]; out.options.push({ opt: 'buy:' + fid, label: '🍎 Comprar ' + F.name + ' · ' + OP.RARITY[F.rarity] + ' (' + OP.fmtB(IN().fruitBuyCost(F)) + ')' }); }
    }
    s.client.send('dialog', out);
  };

  // frutas a la venta: 3 frutas libres del mundo, distintas cada hora (las mismas para todos)
  P.fruitOffers = function () {
    const S = this.OP.S;
    const free = S.fruits.filter((f) => f.state === 'none').map((f) => f.id);
    if (!free.length) return [];
    const hour = Math.floor(Date.now() / 3600000);
    const out = [];
    for (let k = 0; k < 3 && out.length < free.length; k++) {
      let i = ((hour * 2654435761 + k * 40503) >>> 0) % free.length;
      while (out.indexOf(free[i]) >= 0) i = (i + 1) % free.length;
      out.push(free[i]);
    }
    return out;
  };
}

module.exports = { install };
