/* CONTRATOS: misiones contra NPC concretos del mundo, una por dificultad (Fácil, Media, Difícil, Épica).
   Se eligen entre NPC reales que están en islas de tu mar; la EXP y los berries crecen mucho con la dificultad.
   Se guardan en el personaje (p.contracts) y se renuevan al cumplirlos o cuando pides contratos nuevos. */
'use strict';

const XP_MULT = [1, 2.2, 4.5, 9];
const MONEY_MULT = [1, 2, 4, 8];
const REFRESH_CD = 2 * 60000;   // pedir contratos nuevos como mucho cada 2 minutos

function install(Room) {
  const P = Room.prototype;

  // NPC que valen como objetivo para este jugador
  P.contractTargets = function (p) {
    const { OP, M, MMO } = this;
    const zone = MMO.zoneOf(p.x, p.y);
    const out = [];
    for (const a of OP.S.agents) {
      if (a.loc !== 'island' || a.pcCrew || a.prisonGuard || a.hunter || a.carriedBy) continue;
      if (p.faction === 'marine' && a.faction !== 'pirate') continue;          // los marines solo persiguen piratas
      if (p.npcCrew && a.unit === p.npcCrew) continue;                          // ni a tu propia tripulación NPC
      const I = M.islands[a.isl];
      if (!I || I.hidden || I.prison) continue;
      const inZone = I.sea === zone || MMO.zoneOf(I.dockX, I.dockY) === zone;
      out.push({ a, I, inZone, d: Math.hypot(I.dockX - p.x, I.dockY - p.y), diff: MMO.difficultyOf(a, p) });
    }
    return out;
  };
  P.makeContracts = function (p) {
    const { MMO } = this;
    const all = this.contractTargets(p);
    const list = [];
    const used = new Set();
    const target = [p.lvl - 3, p.lvl, p.lvl + 3, p.lvl + 6];   // nivel ideal de cada dificultad
    for (let k = 0; k < 4; k++) {
      const pool = all.filter((t) => !used.has(t.a.id) && t.a.lvl - p.lvl >= MMO.EASY_MIN_GAP);
      // primero los de esa dificultad en tu mar; si no hay, los de esa dificultad en otro sitio; si tampoco, el de nivel más parecido
      let c = pool.filter((t) => t.diff === k && t.inZone);
      if (!c.length) c = pool.filter((t) => t.diff === k);
      if (c.length) c = c.sort((x, y) => x.d - y.d).slice(0, 6);
      else c = pool.filter((t) => t.inZone).sort((x, y) => Math.abs(x.a.lvl - target[k]) - Math.abs(y.a.lvl - target[k]) || x.d - y.d).slice(0, 3);
      if (!c.length) continue;
      const t = c[Math.floor(this.game.rnd() * c.length)];
      used.add(t.a.id);
      const dk = MMO.difficultyOf(t.a, p);   // la etiqueta y la recompensa son las de su dificultad real
      list.push({ diff: dk, id: t.a.id, name: t.a.name, lvl: t.a.lvl, faction: t.a.faction, bounty: t.a.bounty || 0,
        xp: Math.round((60 + p.lvl * 30) * XP_MULT[dk]), money: Math.round((2000 + p.lvl * 1500) * MONEY_MULT[dk]) });
    }
    list.sort((x, y) => x.diff - y.diff || x.lvl - y.lvl);
    p.contracts = list;
    p.contractsAt = Date.now();
    return list;
  };
  // lista para la ventana de misiones (con la isla donde está AHORA cada objetivo)
  P.contractView = function (p) {
    const { OP, M } = this;
    return (p.contracts || []).map((c) => {
      const a = OP.S.A[c.id];
      const alive = a && a.loc === 'island' && a.isl >= 0;
      const I = alive ? M.islands[a.isl] : null;
      return Object.assign({}, c, { lvl: a ? a.lvl : c.lvl, isl: I ? I.name : '', x: I ? I.x : null, y: I ? I.y : null, gone: !alive });
    });
  };
  P.onContracts = function (s, m) {
    const p = s.data, now = Date.now();
    const stale = !p.contracts || !p.contracts.length || p.contracts.every((c) => { const a = this.OP.S.A[c.id]; return !a || a.loc !== 'island'; });
    if (m.refresh) {
      if (now - (p.contractsAt || 0) < REFRESH_CD) return this.toast(s, 'Los informadores aún no tienen trabajos nuevos (' + Math.ceil((REFRESH_CD - (now - p.contractsAt)) / 1000) + ' s).');
      this.makeContracts(p);
    } else if (stale) this.makeContracts(p);
    s.saveDirty = true;
    s.client.send('res', { what: 'contracts', list: this.contractView(p), refreshIn: Math.max(0, REFRESH_CD - (now - (p.contractsAt || 0))) });
  };
  // al derrotar a un NPC: si era un objetivo, se cobra el contrato
  P.contractKill = function (s, npc) {
    const { MMO, OP, game } = this;
    const p = s.data;
    const i = (p.contracts || []).findIndex((c) => c.id === npc.id);
    if (i < 0) return;
    const c = p.contracts[i];
    p.contracts.splice(i, 1);
    const D = MMO.DIFFS[c.diff];
    p.money += c.money;
    const r = game.gainXp(p, c.xp, { raw: true });
    p.stats.contracts = (p.stats.contracts || 0) + 1;
    if (c.diff >= 2) p.stats.contractsHard = (p.stats.contractsHard || 0) + 1;
    this.checkQuests(s);
    this.toast(s, '📜 ¡Contrato cumplido! ' + D.icon + ' ' + D.name + ': ' + npc.name + ' (+' + r.gained + ' EXP, +' + OP.fmtB(c.money) + ')');
    if (c.diff === 3) this.news('battle', '📜 ' + p.name + ' cumple un contrato ÉPICO: derrota a ' + npc.name + '.', 2);
    this.onLevels(s, r);
    s.dirty = true; s.saveDirty = true;
  };
}

module.exports = { install };
