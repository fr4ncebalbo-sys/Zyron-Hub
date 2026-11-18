/* ENTRENAMIENTO CONTINUO: mientras mantienes T (o el botón), tu personaje medita/entrena sin moverse ni atacar.
   - La prioridad elegida (Fuerza, Velocidad, Poder o Vida) sube 0,25 puntos por segundo; las otras tres 0,01.
   - Fuerza → daño de los golpes · Velocidad → andar y atacar más rápido · Poder → daño de las técnicas de fruta · Vida → PV máximos.
   - En islas de entrenamiento especial (🥋) va x1,5. Hay un tope de puntos entrenados por estadística según tu nivel.
   - Cada 5 s de entrenamiento cuentan como "un entrenamiento" para las misiones; también da algo de EXP.
   Todo se guarda en el personaje (p.trained, baseStr/baseSpd/baseHp) y se ve en tiempo real en tu tarjeta. */
'use strict';

const KEYS = ['str', 'spd', 'hp', 'power'];

function install(Room) {
  const P = Room.prototype;

  P.onTrainHold = function (s, m) {
    const { MMO } = this;
    const p = s.data, now = Date.now();
    if (!m.on) return this.stopTraining(s, '');
    if (s.training) { if (MMO.TRAIN_FOCUS[m.focus]) { s.training.focus = m.focus; p.trainFocus = m.focus; } return; }
    if (s.st.dead || p.execution) return;
    if (p.boat || s.ride) return this.toast(s, '🥋 Para entrenar tienes que estar en tierra.');
    if (!MMO.islandAt(p.x, p.y)) return this.toast(s, '🥋 Para entrenar tienes que estar en una isla.');
    if (now - s.lastCombat < 3000) return this.toast(s, '🥋 No puedes concentrarte en mitad de un combate.');
    const focus = MMO.TRAIN_FOCUS[m.focus] ? m.focus : (p.trainFocus || 'str');
    p.trainFocus = focus;
    // el primer "entrenamiento" cuenta a los 2 s (para que un novato vea enseguida que funciona); luego, cada 5 s
    s.training = { focus, since: now, lastXp: now, lastCount: now - (this.MMO.TRAIN_HOLD.countEveryMs - 2000), gained: 0, capped: false };
    s.st.training = true;
    // en una isla de entrenamiento especial se ve lo que haces (caparazón de tortuga, troncos, espada de madera...)
    const I = MMO.islandAt(p.x, p.y);
    const prop = MMO.trainPropOf(I);
    s.st.prop = prop;
    s.training.isl = I ? I.idx : -1;
    p.carrying = MMO.CARRY_PROPS.indexOf(prop) >= 0;
    if (p.carrying) this.toast(s, prop === 'shell' ? '🐢 Cargas un caparazón de tortuga gigante: puedes caminar despacio mientras entrenas.' : '🪵 Cargas troncos en la nieve: puedes caminar despacio mientras entrenas.');
    s.input.dx = 0; s.input.dy = 0;
    s.dirty = true;
    this.syncPublic(s);
  };

  P.stopTraining = function (s, why) {
    const T = s.training;
    if (!T) return;
    s.training = null;
    s.st.training = false;
    s.st.prop = '';
    s.data.carrying = false;
    const secs = Math.round((Date.now() - T.since) / 1000);
    const F = this.MMO.TRAIN_FOCUS[T.focus];
    if (secs >= 2) this.toast(s, (why ? why + ' ' : '🥋 ') + 'Entrenaste ' + secs + ' s: ' + F.icon + ' ' + F.name.toLowerCase() + ' +' + (Math.round(T.gained * 100) / 100) + (T.focus === 'hp' ? ' pts (+' + Math.round(T.gained * this.MMO.TRAIN_HOLD.hpPerPt) + ' PV)' : ' pts') + '.');
    else if (why) this.toast(s, why);
    s.dirty = true; s.saveDirty = true;
    this.syncPublic(s);
  };

  // cada tick del jugador: devuelve true si está entrenando (entonces no se mueve)
  P.tickTraining = function (s, dt, now) {
    const T = s.training;
    if (!T) return false;
    const { MMO, game } = this;
    const p = s.data;
    if (s.st.dead || p.boat || p.execution || s.ride) { this.stopTraining(s, ''); return false; }
    if (s.lastCombat > T.since) { this.stopTraining(s, '⚔ ¡Te atacan! Dejas de entrenar.'); return false; }
    const H = MMO.TRAIN_HOLD;
    const I = MMO.islandAt(p.x, p.y);
    const bonus = I && I.train ? H.islandBonus : 1;
    const cap = MMO.trainCap(p);
    p.trained = p.trained || { str: 0, spd: 0, hp: 0, power: 0 };
    for (const k of KEYS) {
      const have = p.trained[k] || 0;
      if (have >= cap) { if (k === T.focus && !T.capped) { T.capped = true; this.toast(s, '🥋 Has llegado al tope de entrenamiento de ' + MMO.TRAIN_FOCUS[k].name.toLowerCase() + ' para tu nivel (' + cap + ' pts). Sube de nivel para seguir mejorando.'); } continue; }
      const add = Math.min(cap - have, (k === T.focus ? H.rate : H.other) * bonus * dt);
      p.trained[k] = have + add;
      if (k === 'str') p.baseStr += add;
      else if (k === 'spd') p.baseSpd += add;
      else if (k === 'hp') { p.baseHp += add * H.hpPerPt; p.hp += add * H.hpPerPt; }
      if (k === T.focus) T.gained += add;
    }
    // un poco de EXP y "entrenamientos" para las misiones
    if (now - T.lastXp >= H.xpEveryMs) {
      T.lastXp = now;
      const r = game.gainXp(p, (3 + p.lvl * 0.8) * (I && I.train ? I.train.bonus : 1));
      this.onLevels(s, r);
    }
    if (now - T.lastCount >= H.countEveryMs) {
      T.lastCount = now;
      p.stats.trains = (p.stats.trains || 0) + 1;
      if (I && I.train) {
        p.stats.specialTrains = (p.stats.specialTrains || 0) + 1;
        p.trainedAt = p.trainedAt || [];
        if (p.trainedAt.indexOf(I.id) < 0) { p.trainedAt.push(I.id); game.moment(p, 'Entrenó en ' + I.name + ': ' + I.train.label, 15 + I.danger * 2); }
      }
      this.checkQuests(s);
    }
    if (this.tickN % 10 === 0) { s.dirty = true; s.saveDirty = true; }
    // cargando peso: sigue caminando (despacio) mientras entrena, pero sin salir de la isla
    if (p.carrying) {
      const J = MMO.islandAt(p.x, p.y);
      if (!J || J.idx !== T.isl) { this.stopTraining(s, '🐢 Has salido de la zona de entrenamiento.'); return false; }
      return false;
    }
    s.input.dx = 0; s.input.dy = 0;
    s.st.moving = false;
    this.syncPublic(s);
    return true;
  };
}

module.exports = { install };
