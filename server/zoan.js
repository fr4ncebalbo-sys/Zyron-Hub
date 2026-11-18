/* TRANSFORMACIÓN ZOAN (tecla C): con una fruta Zoan comida, el personaje pasa a su forma híbrida (lobo, leopardo,
   bisonte, elefante, fénix, dragón, dinosaurio, pteranodon, serpiente...) durante 60 s: +35% fuerza, +20% velocidad,
   +30% vida y anda más rápido. Se puede deshacer antes con C. Después, 30 s de recarga.
   Todos los jugadores cercanos ven la nube de humo/energía al transformarse (mensaje 'zoanfx'). */
'use strict';

function install(Room) {
  const P = Room.prototype;

  P.onZoan = function (s) {
    const { MMO } = this;
    const p = s.data, now = Date.now();
    const form = MMO.zoanFormOf(p.fruit);
    if (!form) return this.toast(s, 'Solo quien ha comido una fruta Zoan puede transformarse.');
    if (s.st.dead || p.execution) return;
    if (p.zoanOn) return this.endZoan(s, '🐾 Vuelves a tu forma humana.');
    if (p.inside) return this.toast(s, 'Aquí dentro no hay sitio para transformarse.');
    if ((s.cds.zoan || 0) > now) return this.toast(s, '🐾 Aún no puedes transformarte otra vez (' + Math.ceil((s.cds.zoan - now) / 1000) + ' s).');
    if (s.training) this.stopTraining(s, '');
    const before = MMO.stats(p).maxHp;
    p.zoanOn = form.kind;
    s.zoanUntil = now + MMO.ZOAN.dur;
    p.hp = Math.round(p.hp * MMO.stats(p).maxHp / Math.max(1, before));   // la vida crece en proporción
    s.st.zoan = form.kind;
    this.zoanFx(s, form.kind, true);
    this.toast(s, '🐾 ¡Te transformas en ' + form.name + '! +' + Math.round((MMO.ZOAN.str - 1) * 100) + '% fuerza, +' + Math.round((MMO.ZOAN.spd - 1) * 100) + '% velocidad, +' + Math.round((MMO.ZOAN.hp - 1) * 100) + '% vida durante ' + MMO.ZOAN.dur / 1000 + ' s (C para volver).');
    s.dirty = true; s.saveDirty = true;
    this.syncPublic(s);
  };

  P.endZoan = function (s, msg) {
    const { MMO } = this;
    const p = s.data;
    if (!p.zoanOn) return;
    const kind = p.zoanOn;
    p.zoanOn = null;
    s.st.zoan = '';
    s.cds.zoan = Date.now() + MMO.ZOAN.cd;
    p.hp = Math.min(p.hp, MMO.stats(p).maxHp);
    this.zoanFx(s, kind, false);
    if (msg) this.toast(s, msg);
    s.dirty = true; s.saveDirty = true;
    this.syncPublic(s);
  };

  P.tickZoan = function (s, now) {
    if (s.data.zoanOn && now > (s.zoanUntil || 0)) this.endZoan(s, '🐾 Se acaba tu transformación.');
  };

  // la nube de humo/energía solo viaja a quien puede verla
  P.zoanFx = function (s, kind, on) {
    const { MMO } = this;
    const p = s.data;
    const fx = { sid: s.sid, kind, on: on ? 1 : 0, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
    for (const o of this.ps.values()) if (!o.data.inside && Math.abs(o.data.x - p.x) < MMO.VIEW_X && Math.abs(o.data.y - p.y) < MMO.VIEW_Y) o.client.send('zoanfx', fx);
  };
}

module.exports = { install };
