/* HAKI ACTIVO (validado en el servidor; los clientes solo dibujan):
   - Armadura (Z): el cuerpo se vuelve negro metálico por niveles; más daño y menos daño recibido mientras dura.
   - Observación (X): ves las siluetas de enemigos y jugadores a través de todo (en tu cliente) y esquivas más.
   - Rey (V): el 10% de los personajes nace con él. Onda expansiva: los enemigos débiles cercanos caen inconscientes;
     los fuertes, los jefes y los jugadores quedan aturdidos. Recarga estricta de 60 s.
   La maestría (p.hakiXp) sube al usarlo y hace crecer su nivel (1-4): más cuerpo cubierto, más radio y más intensidad.
   Para no saturar la red, la onda solo se envía a quien está lo bastante cerca para verla. */
'use strict';

function install(Room) {
  const P = Room.prototype;

  const addXp = (p, k, n) => { p.hakiXp = p.hakiXp || { arm: 0, obs: 0, conq: 0 }; p.hakiXp[k] = (p.hakiXp[k] || 0) + n; };

  P.onHaki = function (s, m) {
    const { MMO } = this;
    const p = s.data, now = Date.now();
    const k = String(m.type || '');
    const A = MMO.HAKI_ACTIVE[k];
    if (!A) return;
    const H = MMO.HAKI[A.idx];
    p.haki = p.haki || [false, false, false];
    if (!p.haki[A.idx]) return this.toast(s, k === 'conq' ? '⚡ No naciste con el Aura del Rey (solo el 10% lo tiene).' : H.icon + ' Aún no has despertado el ' + H.name + ' (nivel ' + MMO.HAKI_LVL + '+, en una isla de entrenamiento especial 🥋).');
    if (s.st.dead || p.execution) return;
    if (p.inside) return this.toast(s, '🏠 Aquí dentro no.');
    if (s.training) this.stopTraining(s, '');
    if (s.stunUntil > now) return this.toast(s, '💫 Estás aturdido.');
    if ((s.cds['h' + k] || 0) > now) return this.toast(s, H.icon + ' ' + H.name + ': aún no (' + Math.ceil((s.cds['h' + k] - now) / 1000) + ' s).');
    const lvl = MMO.hakiLevel(p, k);
    s.cds['h' + k] = now + A.cd;
    if (k === 'arm') {
      s.armorUntil = now + A.dur; s.st.armor = lvl; addXp(p, 'arm', 15);
      this.toast(s, '🛡️ ¡Aura de Armadura nivel ' + lvl + '! ' + ['', 'Tus brazos', 'Brazos y piernas', 'Torso, brazos y piernas', 'Todo tu cuerpo'][lvl] + ' se endurecen (+' + Math.round(A.dmg * lvl * 100) + '% daño, -' + Math.round(A.def * lvl * 100) + '% daño recibido).');
    } else if (k === 'obs') {
      s.obsUntil = now + A.dur; s.st.obs = true; addXp(p, 'obs', 15);
      this.toast(s, '👁️ ¡Aura de Observación! Sientes la presencia de todos a tu alrededor.');
    } else this.conquerorBlast(s, lvl, now);
    s.dirty = true; s.saveDirty = true;
    this.syncPublic(s);
  };

  // cada tick del jugador: se apagan los Aura que terminan y la maestría sube mientras luchas con ellos
  P.tickHaki = function (s, now) {
    const p = s.data;
    if (s.st.armor && now > (s.armorUntil || 0)) { s.st.armor = 0; s.dirty = true; }
    if (s.st.obs && now > (s.obsUntil || 0)) { s.st.obs = false; s.dirty = true; }
    const stunned = (s.stunUntil || 0) > now ? 1 : 0;
    if (s.st.stun !== stunned) s.st.stun = stunned;
    if (this.tickN % 40 === 0 && now - s.lastCombat < 4000) {   // cada 2 s luchando con el Aura puesto
      if (s.st.armor) addXp(p, 'arm', 2);
      if (s.st.obs) addXp(p, 'obs', 2);
    }
  };

  // multiplicadores en combate
  P.hakiDmgMul = function (s) { const A = this.MMO.HAKI_ACTIVE.arm; return s && s.st && s.st.armor ? 1 + A.dmg * s.st.armor : 1; };
  P.hakiDefMul = function (s) { const A = this.MMO.HAKI_ACTIVE.arm; return s && s.st && s.st.armor ? Math.max(0.5, 1 - A.def * s.st.armor) : 1; };
  P.hakiDodge = function (s) { const A = this.MMO.HAKI_ACTIVE.obs; return s && s.st && s.st.obs ? A.dodge * (1 + this.MMO.hakiLevel(s.data, 'obs')) : 0; };

  // ---------- Aura del Rey: la onda expansiva ----------
  P.conquerorBlast = function (s, lvl, now) {
    const { OP, MMO, Sim } = this;
    const p = s.data;
    const A = MMO.HAKI_ACTIVE.conq;
    const radius = A.radius + A.radiusPerLvl * lvl;
    const stunMs = A.stunMs + A.stunPerLvl * lvl;
    let ko = 0, stunned = 0, players = 0;
    if (!p.boat) {
      const I = MMO.islandAt(p.x, p.y);
      const list = I ? Sim.occupants(I.idx) : [];
      for (const npc of list) {
        if (npc.loc !== 'island' || npc._ko > now || npc.pcCrew === p.crewId && p.crewId) continue;
        if (p.npcCrew && npc.unit === p.npcCrew) continue;
        if (p.faction === 'marine' && npc.faction === 'marine') continue;
        if (Math.hypot(npc.x - p.x, npc.y - p.y) > radius) continue;
        const boss = npc.rank >= 6 || (npc.bounty || 0) >= 1e8 || (OP.S.emperors.indexOf(npc.unit) >= 0 && OP.S.U[npc.unit] && OP.S.U[npc.unit].leader === npc.id);
        const weak = !boss && (npc.lvl <= p.lvl - 3 + lvl * 2 || npc.hp < npc.maxHp * (0.25 + 0.05 * lvl));
        this.engage.delete(npc.id);
        if (weak) { npc._ko = now + 15000 + lvl * 5000; npc.wait = Math.max(npc.wait || 0, 3); npc.hakiKo = true; ko++; }
        else { npc.stunUntil = now + stunMs; stunned++; }
      }
    }
    // jugadores: aturdidos (con las mismas protecciones que el PvP: novatos, condenados...)
    for (const o of this.ps.values()) {
      if (o === s || o.st.dead || o.data.inside || (p.crewId && o.data.crewId === p.crewId) || !!o.data.boat !== !!p.boat) continue;
      if (Math.hypot(o.data.x - p.x, o.data.y - p.y) > radius) continue;
      if (this.pvpBlocked(s, o)) continue;
      o.stunUntil = now + stunMs; o.st.stun = 1;
      if (o.training) this.stopTraining(o, '');
      o.lastCombat = now;
      this.toast(o, '⚡ ¡El Aura del Rey de ' + p.name + ' te deja paralizado!');
      players++;
    }
    addXp(p, 'conq', 30 + ko * 8 + stunned * 5 + players * 15);
    s.lastCombat = now;
    // el efecto solo viaja a quien puede verlo (optimización de red)
    const fx = { k: 'conq', sid: s.sid, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, r: radius, lvl, ko, st: stunned + players };
    for (const o of this.ps.values()) if (Math.abs(o.data.x - p.x) < MMO.VIEW_X && Math.abs(o.data.y - p.y) < MMO.VIEW_Y) o.client.send('hakifx', fx);
    this.toast(s, '⚡ ¡AURA DEL REY nivel ' + lvl + '! ' + (ko ? ko + ' enemigo(s) caen inconscientes' : 'Nadie cae inconsciente') + (stunned + players ? ' · ' + (stunned + players) + ' aturdido(s)' : '') + '.');
    if (ko + players >= 3) this.news('world', '⚡ ¡' + p.name + ' libera el Aura del Rey! ' + (ko + players) + ' rivales caen a su alrededor.', 2);
  };
}

module.exports = { install };
