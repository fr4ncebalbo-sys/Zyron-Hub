/* FRUTAS PARA LOS JUGADORES: además de las que aparecen al azar en el mundo (y que suelen acabar en manos de NPC),
   el servidor esconde frutas CERCA de los jugadores conectados, con un sistema de "lástima":
   - Cada minuto hay una probabilidad (de media una cada ~40 min con gente conectada).
   - Cuanto más tiempo pasa sin que un jugador encuentre una fruta, más sube la suerte (hasta x6).
   - Con 2 horas sin hallazgos y ninguna esperando, aparece una seguro.
   - Las frutas "reservadas" no las ven los NPC durante 3 horas; si nadie la encuentra, pasa a ser una fruta normal del mundo.
   Todo se guarda en el estado del mundo (OP.S.fruitPity). */
'use strict';

const PITY = {
  everyMs: 60000,            // se comprueba una vez por minuto
  baseMinutes: 40,           // probabilidad base: 1 entre 40 por minuto
  luckPerHour: 1.5,          // la suerte sube x1,5 por cada hora sin hallazgos
  luckMax: 6,
  guaranteeMs: 2 * 3600000,  // con 2 h sin hallazgos (y ninguna reservada esperando), aparece seguro
  minGapMs: 12 * 60000,      // nunca dos seguidas en menos de 12 min
  reserveMs: 3 * 3600000,    // tiempo que los NPC no la pueden coger
  seeRange: 12               // a cuántas casillas se ve una fruta escondida (antes 7)
};

function install(Room) {
  const P = Room.prototype;
  P.FRUIT_PITY = PITY;

  P.fruitPity = function () {
    const S = this.OP.S;
    if (!S.fruitPity) S.fruitPity = { lastFind: Date.now(), lastSpawn: 0, spawned: 0, found: 0 };
    return S.fruitPity;
  };
  // suerte actual (para el panel de administrador y el aviso de Fruit Notifier)
  P.fruitLuck = function (now) {
    const st = this.fruitPity();
    const hours = Math.max(0, (now - st.lastFind) / 3600000);
    return Math.min(PITY.luckMax, 1 + hours * PITY.luckPerHour);
  };

  P.tickFruitPity = function (now) {
    const { OP, M } = this;
    const S = OP.S;
    const st = this.fruitPity();
    // las reservadas que nadie encontró pasan a ser frutas normales del mundo (o vuelven al bolsillo del mundo)
    for (const fr of S.fruits) {
      if (fr.state !== 'hidden' || !fr.reserved || now - (fr.reservedAt || 0) < PITY.reserveMs) continue;
      fr.reserved = false;
      const d = S.isl[fr.isl];
      if (d && d.fruit < 0) d.fruit = fr.id;
      else { fr.state = 'none'; fr.isl = -1; fr.x = null; fr.spotIsl = -1; }
    }
    const online = [...this.ps.values()].filter((s) => !s.st.dead && !s.data.prison && !s.data.execution);
    if (!online.length) return;
    const reserved = S.fruits.filter((f) => f.state === 'hidden' && f.reserved).length;
    if (reserved >= Math.min(4, 1 + Math.ceil(online.length / 3))) return;
    if (now - (st.lastSpawn || 0) < PITY.minGapMs) return;
    const luck = this.fruitLuck(now);
    const guaranteed = now - st.lastFind >= PITY.guaranteeMs && reserved === 0;
    if (!guaranteed && this.game.rnd() > luck / PITY.baseMinutes) return;
    this.spawnFruitNearPlayers(online, now, guaranteed ? 'lástima' : 'suerte x' + luck.toFixed(1));
  };

  // esconde una fruta en una isla cercana a un jugador conectado (o en la suya)
  P.spawnFruitNearPlayers = function (online, now, why) {
    const { OP, M, MMO, game } = this;
    const S = OP.S;
    const pool = S.fruits.filter((f) => f.state === 'none');
    if (!pool.length) return null;
    const s = online[Math.floor(game.rnd() * online.length)];
    const p = s.data;
    const ok = (I) => I && !I.hidden && !I.prison && I.land.length >= 12 && !(I.calm && p.faction === 'pirate');
    const here = !p.boat && MMO.islandAt(p.x, p.y);
    let I = null;
    if (ok(here) && game.rnd() < 0.45) I = here;
    else {
      const zone = MMO.zoneOf(p.x, p.y);
      const near = M.islands.filter((x) => ok(x) && (x.sea === zone || MMO.zoneOf(x.dockX, x.dockY) === zone))
        .sort((a, b) => Math.hypot(a.dockX - p.x, a.dockY - p.y) - Math.hypot(b.dockX - p.x, b.dockY - p.y)).slice(0, 5);
      I = near.length ? near[Math.floor(game.rnd() * near.length)] : (ok(here) ? here : null);
    }
    if (!I) return null;
    // las más raras salen menos
    const tot = pool.reduce((t, f) => t + (5 - OP.FRUITS[f.id].rarity), 0);
    let r = game.rnd() * tot, fr = pool[0];
    for (const f of pool) { r -= 5 - OP.FRUITS[f.id].rarity; if (r <= 0) { fr = f; break; } }
    const c = I.land[Math.floor(game.rnd() * I.land.length)];
    fr.state = 'hidden'; fr.isl = I.idx; fr.since = S.time; fr.spotIsl = I.idx;
    fr.x = (c % M.W) + 0.5; fr.y = ((c / M.W) | 0) + 0.5;
    fr.reserved = true; fr.reservedAt = now;
    const st = this.fruitPity();
    st.lastSpawn = now; st.spawned = (st.spawned || 0) + 1;
    const F = OP.FRUITS[fr.id];
    this.news('fruit', '🍎 ¡Rumores en las tabernas! Alguien ha visto una Fruta Maldita en ' + I.name + '.', 3);
    // los que están en ese mar se enteran al momento
    for (const o of this.ps.values()) {
      if (MMO.zoneOf(o.data.x, o.data.y) !== I.sea && MMO.zoneOf(o.data.x, o.data.y) !== MMO.zoneOf(I.dockX, I.dockY)) continue;
      this.toast(o, '🍎 ¡Dicen que ha aparecido una Fruta Maldita en ' + I.name + '! Búscala por la isla: brilla cuando estás cerca.');
      o.client.send('fruitping', { x: I.x, y: I.y, isl: I.idx });
    }
    console.log('[frutas] ' + F.name + ' escondida en ' + I.name + ' cerca de ' + p.name + ' (' + why + ')');
    return { fr, I };
  };

  // un jugador la ha encontrado: la lástima vuelve a empezar
  P.onFruitFound = function (fr, now) {
    const st = this.fruitPity();
    st.lastFind = now; st.found = (st.found || 0) + 1;
    fr.reserved = false; fr.reservedAt = 0;
  };
}

module.exports = { install, PITY };
