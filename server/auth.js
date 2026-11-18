/* Cuentas, sesiones y creación del personaje (API HTTP) */
'use strict';
const crypto = require('crypto');
const express = require('express');

const SESSION_DAYS = 14;
const hash = (pass, salt) => crypto.scryptSync(String(pass), salt, 64).toString('hex');

function router(ctx) {
  const { db, game, OP } = ctx;
  const r = express.Router();

  // Límite simple de intentos por IP (evita fuerza bruta)
  const hits = new Map();
  function limited(req, max) {
    const k = req.ip + '|' + req.path;
    const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < 60000);
    arr.push(now);
    hits.set(k, arr);
    return arr.length > max;
  }
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 60000)) hits.delete(k); }, 60000).unref();

  function newSession(accountId) {
    const token = crypto.randomBytes(24).toString('hex');
    db.addSession(token, accountId, Date.now() + SESSION_DAYS * 864e5);
    return token;
  }
  function accountFromToken(token) {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    const s = db.session(token);
    if (!s || s.expires < Date.now()) return null;
    return db.accountById(s.account_id);
  }
  function accountFromReq(req) {
    const h = req.get('authorization') || '';
    return accountFromToken(h.startsWith('Bearer ') ? h.slice(7).trim() : '');
  }

  r.post('/register', (req, res) => {
    if (limited(req, 8)) return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return res.status(400).json({ error: 'El usuario debe tener de 3 a 16 letras, números o _.' });
    if (password.length < 6 || password.length > 64) return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 64 caracteres.' });
    if (db.accountByName(username)) return res.status(409).json({ error: 'Ese usuario ya existe.' });
    const salt = crypto.randomBytes(16).toString('hex');
    const id = db.addAccount(username, hash(password, salt), salt);
    res.json({ token: newSession(id), username });
  });

  r.post('/login', (req, res) => {
    if (limited(req, 12)) return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    const acc = db.accountByName(username);
    const bad = () => res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    if (!acc) { hash(password, 'x'); return bad(); }
    const a = Buffer.from(hash(password, acc.salt), 'hex'), b = Buffer.from(acc.pass, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return bad();
    db.purgeSessions();
    res.json({ token: newSession(acc.id), username: acc.username });
  });

  r.post('/logout', (req, res) => {
    const h = req.get('authorization') || '';
    if (h.startsWith('Bearer ')) db.delSession(h.slice(7).trim());
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => {
    const acc = accountFromReq(req);
    if (!acc) return res.status(401).json({ error: 'Sesión caducada. Vuelve a entrar.' });
    const ch = db.characterByAccount(acc.id);
    let character = null;
    if (ch) {
      const p = JSON.parse(ch.data);
      character = { name: p.name, faction: p.faction, lvl: p.lvl, app: p.app, dream: p.dream, bounty: p.bounty, rank: p.rank };
    }
    res.json({ username: acc.username, character });
  });

  r.post('/character', (req, res) => {
    const acc = accountFromReq(req);
    if (!acc) return res.status(401).json({ error: 'Sesión caducada. Vuelve a entrar.' });
    if (db.characterByAccount(acc.id)) return res.status(409).json({ error: 'Tu cuenta ya tiene un personaje.' });
    const v = game.validateSpec(req.body);
    if (typeof v === 'string') return res.status(400).json({ error: v });
    if (db.nameTaken(v.name)) return res.status(409).json({ error: 'Ya hay alguien con ese nombre en el mundo.' });
    // la tirada de aparición (mar, isla, rasgos, talento) la hace el servidor
    const { p, island, perk } = game.newCharacter(v);
    try { db.addCharacter(acc.id, p.name, p); }
    catch (e) { return res.status(409).json({ error: 'Ya hay alguien con ese nombre en el mundo.' }); }
    res.json({
      ok: true,
      spawn: { island: island.name, sea: OP.SEAS[island.sea].name, perk: perk ? { name: island.name, text: perk.text } : null },
      talent: p.talent, traits: p.traits
    });
  });

  return { router: r, accountFromToken };
}

// cambiar la contraseña de una cuenta (solo lo usa el administrador): se guarda cifrada con sal nueva
function setPassword(db, accountId, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return db.setPassword(accountId, hash(password, salt), salt);
}
// contraseña temporal fácil de dictar: palabra + 4 cifras (p. ej. "ancla-4821")
function tempPassword() {
  const words = ['ancla', 'brujula', 'timon', 'mastil', 'vela', 'cofre', 'mapa', 'puerto', 'isla', 'marea'];
  return words[crypto.randomInt(words.length)] + '-' + String(crypto.randomInt(10000)).padStart(4, '0');
}

module.exports = { router, setPassword, tempPassword };
