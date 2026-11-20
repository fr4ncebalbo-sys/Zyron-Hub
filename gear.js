/* EQUIPO (servidor): técnicas de espada, accesorios, aspecto por capas y misiones secretas de las casas.
   Las reglas y los datos están en public/miles-de-piratas/js/gear.js; aquí se valida todo. */
'use strict';

function install(Room) {
  const P = Room.prototype;
  const G = () => require('./context').OP.Gear;

  // ---------- Panel del dojo ----------
  P.onGear = function (s, m) {
    const { OP, MMO } = this;
    const Gear = G(), p = Gear.ensure(s.data);
    const done = () => { s.dirty = true; s.saveDirty = true; this.syncPublic(s); };
    if (m.op === 'unlock') {
      const T = Gear.TECH[m.id], why = Gear.techLock(p, m.id);
      if (!T) return;
      if (why) return this.toast(s, '🗡️ ' + T.name + ': ' + why + '.');
      p.arts.pts -= T.pts; p.arts.done.push(m.id);
      if (T.stance) p.arts.stance = T.stance;
      this.game.moment(p, 'Dominó la técnica ' + T.name, 25);
      this.toast(s, T.icon + ' ¡Has aprendido ' + T.name + '!');
      return done();
    }
    if (m.op === 'stance') { p.arts.stance = Math.max(1, Math.min(3, Number(m.n) || 1)); return done(); }
    if (m.op === 'equip') {
      const A = Gear.ACCS[m.id];
      if (!A || p.accs.indexOf(m.id) < 0) return;
      p.accEq[A.slot] = m.id;
      this.toast(s, A.icon + ' Te pones ' + A.name + ': ' + Gear.bonusText(A) + '.');
      return done();
    }
    if (m.op === 'unequip') {
      if (!Gear.SLOTS[m.slot]) return;
      delete p.accEq[m.slot];
      p.hp = Math.min(p.hp, MMO.stats(p).maxHp);
      return done();
    }
    if (m.op === 'look') {
      if (OP.HATS.indexOf(m.hat) < 0 || OP.SCARS.indexOf(m.scar) < 0 || OP.ACC_ONLY.indexOf(m.acc) < 0) return;
      p.app.hat = m.hat; p.app.scar = m.scar; p.app.acc = m.acc;
      return done();
    }
  };

  // ---------- Técnicas especiales (teclas 1, 2 y 3) ----------
  P.onTech = function (s, m) {
    const { OP, MMO } = this;
    const Gear = G(), p = Gear.ensure(s.data), now = Date.now();
    const T = Gear.TECH[m.id];
    if (!T || !T.cd || !Gear.knows(p, m.id) || s.st.dead) return;
    if (!Gear.equipped(p)) return this.toast(s, '🗡️ Equípate una espada (I) para usar ' + T.name + '.');
    if (p.boat || p.inside || p.execution) return this.toast(s, T.name + ': aquí no puedes usarla.');
    if (s.training) return this.toast(s, '🥋 Estás entrenando: suelta T para luchar.');
    if (s.stunUntil > now) return this.toast(s, '💫 Estás aturdido.');
    const key = 't_' + m.id;
    if ((s.cds[key] || 0) > now + 40) return this.toast(s, T.name + ': aún no (' + Math.ceil((s.cds[key] - now) / 1000) + ' s).');
    const reach = T.kind === 'ranged' ? T.range : T.radius, mult = T.mult * Gear.meleeMul(p);
    const targets = [];
    for (const npc of OP.S.agents) {
      if (npc.loc !== 'island' || npc._ko > now || npc.battle || Math.hypot(npc.x - p.x, npc.y - p.y) > reach + 0.35) continue;
      if ((p.faction === 'marine' && npc.faction === 'marine') || (npc.pcCrew && npc.pcCrew === p.crewId) || (p.npcCrew && npc.unit === p.npcCrew)) continue;
      targets.push({ d: Math.hypot(npc.x - p.x, npc.y - p.y), x: npc.x, y: npc.y, hit: () => this.hitNpc(s, npc, mult, now) });
    }
    for (const t of this.ps.values()) {
      if (t === s || t.st.dead || t.data.boat || t.data.inside || this.pvpBlocked(s, t) || Math.hypot(t.data.x - p.x, t.data.y - p.y) > reach + 0.35) continue;
      targets.push({ d: Math.hypot(t.data.x - p.x, t.data.y - p.y), x: t.data.x, y: t.data.y, hit: () => this.hitPlayer(s, t, mult, now) });
    }
    if (!targets.length) return this.toast(s, T.name + ': no hay nadie a tu alcance.');
    targets.sort((a, b) => a.d - b.d);
    s.cds[key] = now + T.cd; s.lastCombat = now;
    if (T.kind === 'ranged') {
      this.broadcast('afx', { k: 'ranged', who: s.sid, x: p.x, y: p.y, tx: targets[0].x, ty: targets[0].y, c: T.color, n: T.name });
      targets[0].hit();
    } else {
      this.broadcast('afx', { k: 'aoe', who: s.sid, x: p.x, y: p.y, r: T.radius, c: T.color, n: T.name });
      for (const t of targets.slice(0, 12)) t.hit();
    }
    s.dirty = true;
  };

  // ---------- Maestría: golpes con espada y entrenamiento con T ----------
  const prevAttack = P.onAttack;
  P.onAttack = function (s, m) {
    const before = s.nextAttack;
    prevAttack.call(this, s, m);
    const Gear = G();
    if (s.nextAttack !== before && Gear.equipped(s.data) && !s.data.boat) { Gear.ensure(s.data).arts.pts += Gear.ART_HIT; s.saveDirty = true; }
  };
  const prevTraining = P.tickTraining;
  P.tickTraining = function (s, dt, now) {
    const Gear = G(), active = !!s.training;
    const r = prevTraining.call(this, s, dt, now);
    if (active && s.training && Gear.equipped(s.data)) {
      const I = this.MMO.islandAt(s.data.x, s.data.y);
      Gear.ensure(s.data).arts.pts += Gear.ART_RATE * (I && I.train ? 1.5 : 1) * dt;
    }
    return r;
  };

  // ---------- Misiones secretas: el vecino de la casa ----------
  const prevTalk = P.onTalk;
  P.onTalk = function (s, m) {
    const p = s.data;
    if (!p.inside) return;
    const npc = this.roomNpcs(p).find((n) => n.id === String(m.npc || ''));
    if (!npc || !npc.secret) return prevTalk.call(this, s, m);
    if (Math.hypot(npc.x + 0.5 - s.ix, npc.y + 0.5 - s.iy) > 2.2) return this.toast(s, 'Acércate más para hablar.');
    const Gear = G(), q = Gear.secretById[npc.secret];
    Gear.ensure(p);
    const st = p.secrets[q.id], opt = String(m.opt || '');
    const out = { npc: npc.id, name: npc.name, app: npc.app, lines: [q.hello], options: [] };
    if (st && st.done) out.lines = ['Cuida bien de ' + Gear.rewardName(q) + '. Te la ganaste.'];
    else if (p.lvl < q.lvl) out.lines = ['Vuelve cuando seas más fuerte (nivel ' + q.lvl + '). Esto no es para novatos.'];
    else if (!st) {
      if (opt === 'accept') {
        p.secrets[q.id] = { base: this.MMO.statValue(p, q.stat) };
        out.lines = ['Trato hecho: ' + q.task.toLowerCase() + '. Te espero aquí.'];
        this.toast(s, '🤫 Misión secreta: ' + q.task + '.');
        s.dirty = true; s.saveDirty = true;
      } else {
        out.lines.push('Recompensa: ' + Gear.rewardName(q) + '.');
        out.options.push({ opt: 'accept', label: '🤫 Aceptar: ' + q.task });
      }
    } else {
      const cur = Gear.progress(p, q);
      if (cur < q.goal) out.lines = ['Aún no: ' + q.task.toLowerCase() + ' (' + cur + '/' + q.goal + ').'];
      else if (opt === 'claim') {
        st.done = true;
        if (q.reward.acc && p.accs.indexOf(q.reward.acc) < 0) p.accs.push(q.reward.acc);
        if (q.reward.sword) {
          const D = Gear.SWORDS[q.reward.sword];
          p.inv.swords = p.inv.swords || [];
          const sw = { id: 'sp' + q.reward.sword + Date.now().toString(36), n: D.n, r: D.r, sp: q.reward.sword };
          p.inv.swords.push(sw);
          if (!p.sword) p.sword = sw.id;
        }
        this.game.moment(p, 'Completó una misión secreta y consiguió ' + Gear.rewardName(q), 30);
        out.lines = ['Palabra cumplida. Aquí tienes ' + Gear.rewardName(q) + '.'];
        this.toast(s, '🎁 Has conseguido ' + Gear.rewardName(q) + '. Míralo en el Dojo (K).');
        s.dirty = true; s.saveDirty = true; this.syncPublic(s);
      } else {
        out.lines = ['¡Lo has conseguido!'];
        out.options.push({ opt: 'claim', label: '🎁 Recibir ' + Gear.rewardName(q) });
      }
    }
    s.client.send('dialog', out);
  };
}

module.exports = { install };
