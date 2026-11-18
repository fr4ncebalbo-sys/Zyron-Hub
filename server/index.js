/* MILESDEPIRATAS (online) - servidor
   Variables opcionales: PORT (2567), OPW_SPEED (velocidad de la simulación de NPC, 1 = normal), OPW_DATA_DIR (carpeta de datos) */
/* servidor
   Arranque:  npm start   (o doble clic en iniciar-servidor.bat)
   Abre:      http://localhost:2567 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server, matchMaker } = require('colyseus');
const { WebSocketTransport } = require('@colyseus/ws-transport');

const ctx = require('./context');
const db = require('./db');
const world = require('./world');
const gameMod = require('./game');
const authMod = require('./auth');

const PORT = Number(process.env.PORT) || 2567;
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');                 // lo único que ve el navegador: el portal y los juegos
const GAME = path.join(PUBLIC, 'miles-de-piratas');       // MilesDePiratas (sus js también los usa el servidor)

async function main() {
  console.log('☠  MILESDEPIRATAS');
  console.log('[db] ' + db.FILE);
  ctx.db = db;
  ctx.world = world;
  ctx.OP = world.init(db, (n) => { if (ctx.onNews) ctx.onNews(n); });
  ctx.game = gameMod.create(ctx.OP);
  const auth = authMod.router(ctx);
  ctx.auth = auth;
  const { WorldRoom } = require('./WorldRoom');

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', auth.router);
  // carteles personalizados: las imágenes que pongas en assets/posters (nombre-del-personaje.png, _default.png...)
  app.get('/api/posters', (req, res) => {
    let files = [];
    try { files = fs.readdirSync(path.join(GAME, 'assets', 'posters')).filter((f) => /^[\w.-]+\.(png|jpe?g|webp|gif)$/i.test(f)); } catch (e) { /* sin carpeta */ }
    res.json({ files });
  });
  // música y sonidos propios (opcionales): los archivos que pongas en assets/audio
  app.get('/api/audio', (req, res) => {
    let files = [];
    try { files = fs.readdirSync(path.join(GAME, 'assets', 'audio')).filter((f) => /^[\w.-]+\.(mp3|ogg|wav|m4a)$/i.test(f)); } catch (e) { /* sin carpeta */ }
    res.json({ files });
  });
  app.get('/vendor/colyseus.js', (req, res) => res.sendFile(path.join(ROOT, 'node_modules', 'colyseus.js', 'dist', 'colyseus.js')));
  // por si acaso: nada del servidor ni de la base de datos llega nunca al navegador
  app.use((req, res, next) => {
    if (/^\/(server|data|node_modules|tests|tools)(\/|$)/i.test(req.path) || /^\/package(-lock)?\.json$/i.test(req.path) || /\.(bat|exe|sqlite.*)$/i.test(req.path)) return res.status(404).end();
    next();
  });
  // solo se sirve la carpeta public: el portal en "/" y cada juego en su carpeta (/miles-de-piratas/, /juego-2/...)
  app.use(express.static(PUBLIC, { index: 'index.html', dotfiles: 'ignore', maxAge: 0 }));

  const server = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server, pingInterval: 5000, pingMaxRetries: 4 }), greet: false });
  gameServer.define('world', WorldRoom);
  await gameServer.listen(PORT);
  await matchMaker.createRoom('world', {});
  console.log('[servidor] Listo en http://localhost:' + PORT + '  (Ctrl+C para guardar y salir)');
  // direcciones para que entren tus amigos desde la misma red (wifi / cable)
  const lan = [];
  for (const list of Object.values(require('os').networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) lan.push('http://' + n.address + ':' + PORT);
  if (lan.length) console.log('[servidor] Amigos en tu misma red: ' + lan.join('  ·  ') + '   (para jugar por Internet, mira LEEME.txt → JUGAR ONLINE)');
  // iniciar-servidor.bat pide abrir el navegador solo cuando el servidor ya está escuchando
  if (process.env.OPW_OPEN === '1' && process.platform === 'win32') {
    require('child_process').exec('start "" "http://localhost:' + PORT + '"');
  }

  // Órdenes del administrador escritas en ESTA ventana del servidor: /forzar_ejecucion <nombre>, /reiniciar_era, /ayuda...
  if (process.stdin && process.stdin.readable) {
    const rl = require('readline').createInterface({ input: process.stdin });
    rl.on('line', (line) => {
      const t = String(line || '').trim();
      if (!t) return;
      if (!ctx.room) return console.log('[admin] El mundo aún no está listo.');
      try { ctx.room.adminCommand(t.charAt(0) === '/' ? t : '/' + t, (msg) => console.log('[admin] ' + msg)); } catch (e) { console.error('[admin] Error:', e.message); }
    });
    rl.on('error', () => { /* sin consola */ });
    console.log('[servidor] Órdenes de administrador: escribe /ayuda en esta ventana');
  }

  // Guardado de emergencia si el proceso termina de golpe
  process.on('exit', () => { try { world.save(); db.close(); } catch (e) { /* nada */ } });
  process.on('uncaughtException', (e) => { console.error('[servidor] Error inesperado:', e); });
}

main().catch((e) => { console.error('[servidor] No se pudo arrancar:', e); process.exit(1); });
