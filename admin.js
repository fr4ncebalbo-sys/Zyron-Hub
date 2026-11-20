/* Panel de administración: SOLO responde a conexiones desde este mismo PC (localhost) y con la clave del administrador.
   La clave se crea la primera vez desde el propio panel y se guarda cifrada (scrypt) en la base de datos.
   Además: los códigos de recompensa (HOLAPIRATA / HOLAMARINO) que puede canjear cualquier jugador. */
'use strict';
const crypto = require('crypto');

const CODES = {   // solo en el servidor: así nadie puede ver la lista de códigos mirando los archivos del juego
  HOLAPIRATA: { faction: 'pirate', mult: 2, ms: 10 * 60000, text: 'x2 de EXP durante 10 minutos' },
  HOLAMARINO: { faction: 'marine', mult: 2, ms: 10 * 60000, text: 'x2 de EXP durante 10 minutos' }
};
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const isLocal = (ip) => LOOPBACK.indexOf(String(ip || '')) >= 0;
const hash = (pass, salt) => crypto.scryptSync(String(pass), salt, 64).toString('hex');
const ctx = () => require('./context');

function install(Room) {
  const P = Room.prototype;

  // ---------- Códigos ----------
  P.onCode = function (s, m) {
    const p = s.data;
    const code = String(m.code || '').trim().toUpperCase().replace(/\s+/g, '');
    s.codeTries = (s.codeTries || 0) + 1;
    if (s.codeTries > 20) return this.toast(s, 'Demasiados intentos. Vuelve a entrar más tarde.');
    const c = CODES[code];
    if (!c) return s.client.send('code', { ok: false, msg: 'Ese código no existe.' });
    if (c.faction && c.faction !== p.faction) return s.client.send('code', { ok: false, msg: 'Este código es solo para ' + (c.faction === 'pirate' ? 'piratas' : 'marines') + '.' });
    p.codesUsed = p.codesUsed || [];
    if (p.codesUsed.indexOf(code) >= 0) return s.client.send('code', { ok: false, msg: 'Ya canjeaste este código.' });
    p.codesUsed.push(code);
    p.buffs = p.buffs || [];
    p.buffs.push({ mult: c.mult, msLeft: c.ms, src: 'Código ' + code });
    s.dirty = true; s.saveDirty = true;
    this.saveChar(s);
    s.client.send('code', { ok: true, msg: '🎁 Código ' + code + ' canjeado: ' + c.text + '.' });
    this.toast(s, '🎁 ¡' + c.text + '!');
  };

  // ---------- Contraseña nueva para una cuenta (panel o consola del servidor) ----------
  // user: nombre de usuario (sin @) o cid: id del personaje · pass: la nueva (vacía = se genera una temporal)
  P.resetPassword = function (user, cid, pass) {
    const authMod = require('./auth');
    let acc = null;
    if (user) acc = this.db.accountByName(String(user).replace(/^@/, '').trim());
    else if (cid) { const row = this.db.characterById(Number(cid)); if (row) acc = this.db.accountById(Number(row.account_id)); }
    if (!acc) return { ok: false, msg: 'No existe ninguna cuenta ' + (user ? '@' + String(user).replace(/^@/, '') : 'con ese personaje') + '.' };
    let p = String(pass || '').trim();
    if (!p) p = authMod.tempPassword();
    if (p.length < 6 || p.length > 64) return { ok: false, msg: 'La contraseña debe tener entre 6 y 64 caracteres.' };
    const closed = authMod.setPassword(this.db, Number(acc.id), p);
    // si estaba jugando, sigue dentro; la próxima vez que entre usará la nueva
    return { ok: true, user: acc.username, pass: p, closed, msg: '🔑 Nueva contraseña de @' + acc.username + ': «' + p + '». Díselo a tu amigo; podrá entrar con ella desde ya (sus sesiones antiguas se han cerrado).' };
  };

  // ---------- Administrador ----------
  P.adminReply = function (s, o) { s.client.send('admin', o); };
  // si una orden del panel falla, el panel lo dice (antes el error solo salía en la ventana del servidor)
  P.onAdmin = function (s, m) {
    try { return this.onAdminOp(s, m); } catch (e) {
      console.error('[admin] Error en "' + (m && m.op) + '":', e);
      try { this.adminReply(s, { op: m && m.op, ok: false, msg: 'Error en el servidor: ' + e.message }); } catch (e2) { /* sin conexión */ }
    }
  };
  P.onAdminOp = function (s, m) {
    if (!isLocal(s.ip)) { this.strike(s, 'orden de administrador desde fuera'); return; }   // desde otro PC: ni se contesta
    const saved = this.db.getWorld('admin');
    const cfg = saved ? JSON.parse(saved) : null;
    const op = m.op;
    if (op === 'status') return this.adminReply(s, { op, configured: !!cfg, logged: !!s.admin });
    if (op === 'setup') {
      if (cfg) return this.adminReply(s, { op, ok: false, msg: 'La clave ya está creada.' });
      const pass = String(m.pass || '');
      if (pass.length < 6) return this.adminReply(s, { op, ok: false, msg: 'La clave debe tener al menos 6 caracteres.' });
      const salt = crypto.randomBytes(16).toString('hex');
      this.db.setWorld('admin', JSON.stringify({ salt, hash: hash(pass, salt), created: Date.now() }));
      s.admin = true;
      console.log('[admin] Clave de administrador creada');
      return this.adminReply(s, { op, ok: true, logged: true, msg: 'Clave creada. Ya eres administrador.' });
    }
    if (op === 'login') {
      if (!cfg) return this.adminReply(s, { op, ok: false, msg: 'Primero crea la clave.' });
      s.adminTries = (s.adminTries || 0) + 1;
      if (s.adminTries > 8) return this.adminReply(s, { op, ok: false, msg: 'Demasiados intentos. Vuelve a entrar al juego.' });
      const ok = crypto.timingSafeEqual(Buffer.from(hash(m.pass || '', cfg.salt), 'hex'), Buffer.from(cfg.hash, 'hex'));
      s.admin = ok;
      return this.adminReply(s, { op, ok, logged: ok, msg: ok ? 'Sesión de administrador abierta.' : 'Clave incorrecta.' });
    }
    if (!s.admin) return this.adminReply(s, { op, ok: false, msg: 'Inicia sesión de administrador primero.' });
    const { OP, Sim, M, game } = this;
    const S = OP.S;

    if (op === 'findNpc') {
      const q = String(m.q || '').toLowerCase().trim();
      const list = q.length < 2 ? [] : S.agents.filter((a) => a.loc !== 'dead' && a.name.toLowerCase().indexOf(q) >= 0).slice(0, 20)
        .map((a) => ({ id: a.id, name: a.name, lvl: a.lvl, faction: a.faction, where: a.loc === 'island' ? M.islands[a.isl].name : a.loc }));
      return this.adminReply(s, { op, list });
    }
    if (op === 'fruit') {
      const I = M.islands[Number(m.isl)];
      if (!I || !I.land.length) return this.adminReply(s, { op, ok: false, msg: 'Isla no válida.' });
      let fr = null;
      if (Number(m.fid) >= 0) {
        fr = S.fruits[Number(m.fid)];
        if (!fr) return this.adminReply(s, { op, ok: false, msg: 'Fruta no válida.' });
        if (fr.state === 'owned' || fr.state === 'carried') return this.adminReply(s, { op, ok: false, msg: 'Esa fruta ya la tiene alguien (' + (fr.ownerName || 'otro personaje') + ').' });
      } else {
        const free = S.fruits.filter((f) => f.state === 'none');
        if (!free.length) return this.adminReply(s, { op, ok: false, msg: 'No queda ninguna fruta libre.' });
        fr = free[Math.floor(game.rnd() * free.length)];
      }
      // si ya estaba escondida en otra isla, se quita de allí; si la isla tenía otra, esa vuelve a quedar libre
      if (fr.state === 'hidden' && S.isl[fr.isl] && S.isl[fr.isl].fruit === fr.id) { S.isl[fr.isl].fruit = -1; S.isl[fr.isl].fruitRumor = false; }
      const d = S.isl[I.idx];
      if (d.fruit >= 0 && d.fruit !== fr.id) { const old = S.fruits[d.fruit]; if (old && old.state === 'hidden') { old.state = 'none'; old.isl = -1; old.x = null; old.y = null; } }
      const c = I.land[Math.floor(game.rnd() * I.land.length)];
      fr.state = 'hidden'; fr.isl = I.idx; fr.since = S.time; fr.spotIsl = I.idx;
      fr.x = (c % M.W) + 0.5; fr.y = ((c / M.W) | 0) + 0.5;
      d.fruit = fr.id; d.fruitRumor = !!m.rumor;
      if (m.rumor) this.news('fruit', 'Rumores en las tabernas: ha aparecido una Fruta Maldita en ' + I.name + '.', 2);
      console.log('[admin] Fruta ' + OP.FRUITS[fr.id].name + ' colocada en ' + I.name);
      return this.adminReply(s, { op, ok: true, msg: '🍎 ' + OP.FRUITS[fr.id].name + ' escondida en ' + I.name + ' (casilla ' + Math.floor(fr.x) + ', ' + Math.floor(fr.y) + ').' });
    }
    if (op === 'xp') {
      const amount = Math.max(1, Math.min(1e8, Math.round(Number(m.amount) || 0)));
      if (m.t === 'n') {
        const a = S.A[Number(m.id)];
        if (!a || a.loc === 'dead') return this.adminReply(s, { op, ok: false, msg: 'NPC no encontrado.' });
        const before = a.lvl;
        Sim.gainXp(a, amount);
        console.log('[admin] +' + amount + ' EXP al NPC ' + a.name);
        return this.adminReply(s, { op, ok: true, msg: '⭐ ' + a.name + ': +' + amount + ' EXP (nivel ' + before + ' → ' + a.lvl + ').' });
      }
      const name = String(m.name || '').trim().toLowerCase();
      let t = null;
      for (const o of this.ps.values()) if (o.data.name.toLowerCase() === name) t = o;
      if (t) {
        const before = t.data.lvl;
        const r = game.gainXp(t.data, amount, { raw: true });
        this.onLevels(t, r);
        this.toast(t, '⭐ Un administrador te da +' + amount + ' EXP.');
        t.dirty = true; t.saveDirty = true; this.saveChar(t); this.syncPublic(t);
        console.log('[admin] +' + amount + ' EXP al jugador ' + t.data.name);
        return this.adminReply(s, { op, ok: true, msg: '⭐ ' + t.data.name + ': +' + amount + ' EXP (nivel ' + before + ' → ' + t.data.lvl + ').' });
      }
      // jugador desconectado: se actualiza su ficha guardada
      const row = this.db.allCharacters().find((r) => String(r.name).toLowerCase() === name);
      if (!row) return this.adminReply(s, { op, ok: false, msg: 'No hay ningún jugador con ese nombre.' });
      const d = game.migrate(JSON.parse(row.data));
      const before = d.lvl;
      game.gainXp(d, amount, { raw: true });
      this.db.saveCharacter(Number(row.id), d);
      console.log('[admin] +' + amount + ' EXP al jugador (desconectado) ' + d.name);
      return this.adminReply(s, { op, ok: true, msg: '⭐ ' + d.name + ' (desconectado): +' + amount + ' EXP (nivel ' + before + ' → ' + d.lvl + ').' });
    }

    // ---------- Jugadores: lista con su estado (conectados primero) ----------
    if (op === 'players') {
      const MMO = this.MMO;
      const list = this.db.allCharactersWithUser().map((r) => {
        const cid = Number(r.id);
        const sid = this.byCid.get(cid);
        const o = sid && this.ps.get(sid);
        let d = o ? o.data : null;
        if (!d) { try { d = JSON.parse(r.data); } catch (e) { return null; } }
        const I = MMO.islandAt(d.x, d.y);
        const crew = d.crewId && this.crews.get(d.crewId);
        return { cid, name: d.name, user: r.username, faction: d.faction, lvl: d.lvl, bounty: d.bounty || 0, merit: d.merit || 0, money: d.money || 0,
          online: !!o, dead: !!(o && o.st.dead), where: d.boat ? 'en el mar' : I ? I.name : '?', crew: crew ? crew.name : '',
          prison: !!d.prison, execution: !!this.executions.has(cid), muted: (d.mutedUntil || 0) > Date.now(), king: !!(S.playerKing && S.playerKing.cid === cid) };
      }).filter(Boolean).sort((a, b) => (b.online - a.online) || (b.bounty - a.bounty) || a.name.localeCompare(b.name));
      return this.adminReply(s, { op, list, execs: this.execList() });
    }
    // ---------- Acciones sobre un jugador (conectado o no) ----------
    if (op === 'pact') {
      const cid = Number(m.cid), act = String(m.act || '');
      const sid = this.byCid.get(cid);
      const t = sid && this.ps.get(sid);
      const row = t ? null : this.db.characterById(cid);
      if (!t && !row) return this.adminReply(s, { op, ok: false, msg: 'Ese personaje ya no existe.' });
      const d = t ? t.data : game.migrate(JSON.parse(row.data));
      const fail = (msg) => this.adminReply(s, { op, ok: false, msg });
      if (t && d.inside && (act === 'tp' || act === 'free' || act === 'exec')) this.exitInterior(t, true);   // lo saca del edificio antes de moverlo
      if (act === 'goto' && s.data.inside) this.exitInterior(s, true);
      const done = (msg) => {
        if (t) { t.dirty = true; t.saveDirty = true; this.saveChar(t); this.syncPublic(t); } else this.db.saveCharacter(cid, d);
        console.log('[admin] ' + msg);
        this.adminReply(s, { op, ok: true, msg, refresh: true });
      };
      const v = Number(m.value);
      if (act === 'money') {
        if (!Number.isFinite(v) || !v) return fail('Pon una cantidad (negativa para quitar).');
        const amt = Math.max(-1e12, Math.min(1e12, Math.round(v)));
        d.money = Math.max(0, (d.money || 0) + amt);
        if (t) this.toast(t, (amt > 0 ? '💰 El Gobierno Mundial te entrega ' : '💸 El Gobierno Mundial te confisca ') + OP.fmtB(Math.abs(amt)) + '.');
        return done('💰 ' + d.name + ': ' + (amt > 0 ? '+' : '') + OP.fmtB(amt) + ' (ahora ' + OP.fmtB(d.money) + ').');
      }
      if (act === 'bounty') {
        if (d.faction !== 'pirate') return fail('Solo los piratas tienen recompensa.');
        if (!Number.isFinite(v) || v < 0) return fail('Pon una recompensa (0 o más).');
        const before = d.bounty || 0;
        d.bounty = Math.min(1e11, Math.round(v));
        d.bountyLog = d.bountyLog || [];
        d.bountyLog.unshift({ at: Date.now(), up: d.bounty - before, total: d.bounty, why: 'fijada por el Gobierno Mundial' });
        if (d.bountyLog.length > 30) d.bountyLog.length = 30;
        this.wantedCache = null;
        if (m.news && d.bounty > before) this.news('bounty', '📜 ¡El Gobierno Mundial fija la recompensa de ' + d.name + ' en ' + OP.fmtB(d.bounty) + '!', d.bounty >= 1e8 ? 4 : 3);
        if (t) this.toast(t, '📜 Tu recompensa ahora es de ' + OP.fmtB(d.bounty) + '.');
        return done('📜 ' + d.name + ': recompensa ' + OP.fmtB(before) + ' → ' + OP.fmtB(d.bounty) + '.');
      }
      if (act === 'heal') {
        if (!t) return fail('Solo con jugadores conectados.');
        if (t.st.dead) this.respawn(t);
        d.hp = this.MMO.stats(d).maxHp;
        this.toast(t, '❤️ Un administrador te cura por completo.');
        return done('❤️ ' + d.name + ' curado.');
      }
      if (act === 'tp') {
        const I = M.islands[Number(m.isl)];
        if (!I || !I.land.length) return fail('Isla no válida.');
        if (d.prison || this.executions.has(cid)) return fail(d.name + ' está preso o en una ejecución: libéralo o cancélala antes.');
        const pos = game.portPos(I);
        d.x = pos.x; d.y = pos.y; d.boat = ''; d.wcls = I.sky ? 2 : I.deep ? 3 : 1;
        if (t) { if (t.ride) this.leaveRide(t, 'land'); t.lastIsl = I.idx; t.client.send('teleport', { x: d.x, y: d.y }); this.toast(t, '✨ Un administrador te lleva a ' + I.name + '.'); }
        return done('✨ ' + d.name + ' llevado a ' + I.name + '.');
      }
      if (act === 'goto') {   // el administrador va junto al jugador
        if (s.data.prison || s.data.execution) return fail('Ahora no puedes moverte.');
        if (s.ride) this.leaveRide(s, 'land');
        s.data.x = d.x + (d.boat ? 0 : 0.6); s.data.y = d.y; s.data.boat = d.boat ? this.MMO.shipOf(s.data, this.crewShip(s.data)) : ''; s.data.wcls = d.wcls || 1;
        s.client.send('teleport', { x: s.data.x, y: s.data.y });
        s.dirty = true; s.saveDirty = true; this.syncPublic(s);
        return this.adminReply(s, { op, ok: true, msg: '🧭 Estás junto a ' + d.name + '.' });
      }
      if (act === 'free') {
        if (!d.prison) return fail(d.name + ' no está en Prisión Abismo.');
        for (const a of this.prisonGuards(cid)) { a.prisonGuard = 0; this.Sim.retire(a, 'Volvió a su puesto'); }
        d.prison = null;
        const I = M.byId.sabaody, pos = game.portPos(I);
        d.x = pos.x; d.y = pos.y; d.boat = ''; d.wcls = 1;
        if (t) { t.lastIsl = I.idx; t.client.send('teleport', { x: d.x, y: d.y }); this.toast(t, '🔓 El Gobierno Mundial te deja salir de Prisión Abismo. Apareces en ' + I.name + '.'); }
        return done('🔓 ' + d.name + ' sale de Prisión Abismo.');
      }
      if (act === 'mute') {
        const min = Math.max(0, Math.min(10080, Math.round(v || 0)));
        d.mutedUntil = min ? Date.now() + min * 60000 : 0;
        if (t) this.toast(t, min ? '🔇 Un administrador te ha silenciado en el chat durante ' + min + ' min.' : '🔊 Ya puedes volver a escribir en el chat.');
        return done(min ? '🔇 ' + d.name + ' silenciado ' + min + ' min.' : '🔊 ' + d.name + ' puede volver a escribir.');
      }
      if (act === 'kick') {
        if (!t) return fail('No está conectado.');
        if (t === s) return fail('No puedes expulsarte a ti mismo.');
        t.client.send('kicked', { text: String(m.reason || '').slice(0, 120) });
        console.log('[admin] ' + d.name + ' expulsado');
        setTimeout(() => { try { t.client.leave(4006); } catch (e) { /* ya cerrada */ } }, 300);
        return this.adminReply(s, { op, ok: true, msg: '👢 ' + d.name + ' expulsado del servidor (puede volver a entrar).', refresh: true });
      }
      if (act === 'exec') { const r = this.forceExecutionCid(cid); return this.adminReply(s, { op, ok: r.ok, msg: r.msg, refresh: true }); }
      if (act === 'execCancel') { const ok = this.cancelExecution(cid); return this.adminReply(s, { op, ok, msg: ok ? '📜 Ejecución de ' + d.name + ' suspendida.' : d.name + ' no está en ninguna ejecución.', refresh: true }); }
      return fail('Acción desconocida.');
    }
    // ---------- Contraseña olvidada: poner una nueva a una cuenta (por @usuario o por personaje) ----------
    if (op === 'resetPass') {
      const r = this.resetPassword(m.user, m.cid, m.pass);
      if (r.ok) console.log('[admin] Contraseña cambiada para @' + r.user + ' (' + r.closed + ' sesión(es) cerradas)');   // la contraseña nunca se escribe en la consola
      return this.adminReply(s, { op, ok: r.ok, msg: r.msg, pass: r.ok ? r.pass : undefined });
    }
    // ---------- Anuncio mundial en grande para todos ----------
    if (op === 'announce') {
      const text = String(m.text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (text.length < 3) return this.adminReply(s, { op, ok: false, msg: 'Escribe el anuncio.' });
      const title = String(m.title || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) || 'ANUNCIO DEL GOBIERNO MUNDIAL';
      this.broadcast('announce', { title, text });
      this.system('📢 ' + title + ': ' + text, 'admin');
      if (m.news) this.news('world', '📢 ' + text, 4);
      console.log('[admin] Anuncio: ' + text);
      return this.adminReply(s, { op, ok: true, msg: '📢 Anuncio enviado a ' + this.ps.size + ' jugador(es).' });
    }
    // ---------- Guardar y copias de seguridad ----------
    if (op === 'save') { this.saveAll(); ctx().world.save(); console.log('[admin] Guardado manual'); return this.adminReply(s, { op, ok: true, msg: '💾 Mundo y jugadores guardados.' }); }
    if (op === 'backup') {
      this.saveAll(); ctx().world.save();
      const file = this.db.backup('manual');
      console.log('[admin] Copia de seguridad: ' + file);
      return this.adminReply(s, { op, ok: true, msg: '🗄️ Copia guardada en ' + file });
    }
    // ---------- Nueva Era (el panel ya pide escribir NUEVA ERA para confirmar) ----------
    if (op === 'era') {
      if (String(m.confirm || '').trim().toUpperCase() !== 'NUEVA ERA') return this.adminReply(s, { op, ok: false, msg: 'Escribe NUEVA ERA para confirmar.' });
      console.log('[admin] Nueva Era ordenada desde el panel por ' + s.data.name);
      this.adminReply(s, { op: 'info', ok: true, msg: '⏳ Haciendo la copia de seguridad y reiniciando la era...' });
      const msg = this.newEra();
      return this.adminReply(s, { op, ok: true, msg });
    }
  };
}

module.exports = { install, isLocal };
