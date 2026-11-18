/* Persistencia en SQLite (módulo node:sqlite integrado en Node.js: no hace falta compilar nada) */
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.OPW_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const FILE = path.join(DATA_DIR, 'mundo.sqlite');

const db = new DatabaseSync(FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass TEXT NOT NULL,
    salt TEXT NOT NULL,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    data TEXT NOT NULL,
    updated INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS crews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    faction TEXT NOT NULL,
    captain INTEGER NOT NULL,
    data TEXT NOT NULL,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS world (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated INTEGER NOT NULL
  );
`);

const q = {
  addAccount: db.prepare('INSERT INTO accounts (username, pass, salt, created) VALUES (?, ?, ?, ?)'),
  accountByName: db.prepare('SELECT * FROM accounts WHERE username = ?'),
  accountById: db.prepare('SELECT id, username, created FROM accounts WHERE id = ?'),
  addSession: db.prepare('INSERT INTO sessions (token, account_id, expires) VALUES (?, ?, ?)'),
  session: db.prepare('SELECT * FROM sessions WHERE token = ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  purgeSessions: db.prepare('DELETE FROM sessions WHERE expires < ?'),
  addChar: db.prepare('INSERT INTO characters (account_id, name, data, updated) VALUES (?, ?, ?, ?)'),
  charByAccount: db.prepare('SELECT * FROM characters WHERE account_id = ?'),
  charById: db.prepare('SELECT * FROM characters WHERE id = ?'),
  charByName: db.prepare('SELECT id FROM characters WHERE name = ?'),
  saveChar: db.prepare('UPDATE characters SET data = ?, updated = ? WHERE id = ?'),
  allChars: db.prepare('SELECT id, name, data FROM characters'),
  allCharsUser: db.prepare('SELECT c.id, c.name, c.data, a.username FROM characters c JOIN accounts a ON a.id = c.account_id'),
  addCrew: db.prepare('INSERT INTO crews (name, faction, captain, data, created) VALUES (?, ?, ?, ?, ?)'),
  crew: db.prepare('SELECT * FROM crews WHERE id = ?'),
  crewByName: db.prepare('SELECT id FROM crews WHERE name = ?'),
  saveCrew: db.prepare('UPDATE crews SET captain = ?, data = ? WHERE id = ?'),
  delCrew: db.prepare('DELETE FROM crews WHERE id = ?'),
  allCrews: db.prepare('SELECT * FROM crews'),
  getWorld: db.prepare('SELECT value FROM world WHERE key = ?'),
  setWorld: db.prepare('INSERT INTO world (key, value, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated')
};

const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

module.exports = {
  FILE,
  addAccount(username, pass, salt) { return num(q.addAccount.run(username, pass, salt, Date.now()).lastInsertRowid); },
  accountByName(username) { return q.accountByName.get(username) || null; },
  accountById(id) { return q.accountById.get(id) || null; },
  addSession(token, accountId, expires) { q.addSession.run(token, accountId, expires); },
  session(token) { return q.session.get(token) || null; },
  delSession(token) { q.delSession.run(token); },
  purgeSessions() { q.purgeSessions.run(Date.now()); },
  // el administrador pone una contraseña nueva (cifrada) y se cierran todas las sesiones abiertas de esa cuenta
  setPassword(accountId, passHash, salt) {
    db.prepare('UPDATE accounts SET pass = ?, salt = ? WHERE id = ?').run(passHash, salt, accountId);
    return num(db.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId).changes);
  },

  addCharacter(accountId, name, data) { return num(q.addChar.run(accountId, name, JSON.stringify(data), Date.now()).lastInsertRowid); },
  characterByAccount(accountId) { return q.charByAccount.get(accountId) || null; },
  characterById(id) { return q.charById.get(id) || null; },
  nameTaken(name) { return !!q.charByName.get(name); },
  saveCharacter(id, data) { q.saveChar.run(JSON.stringify(data), Date.now(), id); },
  allCharacters() { return q.allChars.all(); },
  allCharactersWithUser() { return q.allCharsUser.all(); },

  addCrew(name, faction, captain, data) { return num(q.addCrew.run(name, faction, captain, JSON.stringify(data), Date.now()).lastInsertRowid); },
  crew(id) {
    const r = q.crew.get(id);
    if (!r) return null;
    return { id: num(r.id), name: r.name, faction: r.faction, captain: num(r.captain), created: num(r.created), ...JSON.parse(r.data) };
  },
  crewNameTaken(name) { return !!q.crewByName.get(name); },
  saveCrew(c) { q.saveCrew.run(c.captain, JSON.stringify({ members: c.members, ship: c.ship || '', flag: c.flag, fleets: c.fleets || [] }), c.id); },
  deleteCrew(id) { q.delCrew.run(id); },
  allCrews() {
    return q.allCrews.all().map((r) => ({ id: num(r.id), name: r.name, faction: r.faction, captain: num(r.captain), created: num(r.created), ...JSON.parse(r.data) }));
  },

  // copia de seguridad consistente de toda la base de datos (aunque el servidor esté funcionando) en data/copias
  backup(tag) {
    const dir = path.join(DATA_DIR, 'copias');
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    const file = path.join(dir, 'mundo-' + tag + '-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '.sqlite');
    db.exec("VACUUM INTO '" + file.replace(/'/g, "''") + "'");
    return file;
  },
  // Nueva Era: borra todos los personajes y tripulaciones (las cuentas siguen para crear personaje nuevo)
  wipePlayers() {
    const characters = num(db.prepare('SELECT COUNT(*) AS n FROM characters').get().n);
    const crews = num(db.prepare('SELECT COUNT(*) AS n FROM crews').get().n);
    db.exec('BEGIN; DELETE FROM characters; DELETE FROM crews; COMMIT;');
    return { characters, crews };
  },
  getWorld(key) { const r = q.getWorld.get(key); return r ? r.value : null; },
  setWorld(key, value) { q.setWorld.run(key, value, Date.now()); },
  close() { try { db.close(); } catch (e) { /* ya cerrada */ } }
};
