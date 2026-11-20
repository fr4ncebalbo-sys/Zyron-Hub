/* MILESDEPIRATAS (online) - red: API de cuentas, conexión Colyseus y espejo local del mundo.
   El cliente no decide nada: recibe lo que dice el servidor y lo dibuja suavizado. */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const SHIP_TYPES = ['bote', 'carabela', 'bergantin', 'galeon', 'legendario', 'marine', 'almirante'];
  const TOKEN_KEY = 'opw_token';

  // Reloj del jugador: 1 segundo real = 1 minuto de juego. La vida de los NPC sigue a su ritmo
  // (2 horas de simulación por segundo), así que el reloj y las fechas se calculan dividiendo entre 120.
  OP.SIM_PER_CAL = 120;
  OP.calTime = (t) => (t || 0) / OP.SIM_PER_CAL + 8;   // empieza a las 8:00
  const fmtT = OP.fmtTime, fmtD = OP.fmtDay;
  OP.fmtTime = (t) => { const c = OP.calTime(t); return fmtT(c).replace(/\d\d:00$/, String(Math.floor(c % 24)).padStart(2, '0') + ':' + String(Math.floor((c % 1) * 60)).padStart(2, '0')); };
  OP.fmtDay = (t) => fmtD(OP.calTime(t));

  const Net = (OP.Net = { token: null, username: '', room: null, sid: '', me: null, crew: null, npcInfo: new Map(), players: new Map(), handlers: {}, connected: false, ping: 0 });

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  Net.token = load(TOKEN_KEY);
  Net.on = (type, fn) => { (Net.handlers[type] = Net.handlers[type] || []).push(fn); };
  const emit = (type, m) => { for (const fn of Net.handlers[type] || []) { try { fn(m); } catch (e) { console.error(e); } } };

  // ---------- API HTTP ----------
  async function api(path, body) {
    const r = await fetch('/api' + path, {   // ruta absoluta: el juego ahora vive en /miles-de-piratas/ pero la API sigue en /api
      method: body ? 'POST' : 'GET',
      headers: Object.assign({ 'content-type': 'application/json' }, Net.token ? { authorization: 'Bearer ' + Net.token } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    let j = {};
    try { j = await r.json(); } catch (e) { j = { error: 'El servidor no responde bien (' + r.status + ').' }; }
    if (!r.ok) { const err = new Error(j.error || 'Error ' + r.status); err.status = r.status; throw err; }
    return j;
  }
  Net.register = async (u, p) => { const j = await api('/register', { username: u, password: p }); Net.token = j.token; Net.username = j.username; store(TOKEN_KEY, j.token); return j; };
  Net.login = async (u, p) => { const j = await api('/login', { username: u, password: p }); Net.token = j.token; Net.username = j.username; store(TOKEN_KEY, j.token); return j; };
  Net.meInfo = async () => { const j = await api('/me'); Net.username = j.username; return j; };
  Net.createCharacter = (spec) => api('/character', spec);
  Net.forget = () => { Net.token = null; store(TOKEN_KEY, null); };
  Net.logout = async () => {
    try { await api('/logout', {}); } catch (e) { /* da igual */ }
    Net.forget();
    if (Net.room) { try { Net.room.leave(true); } catch (e) { /* nada */ } }
  };

  // ---------- Espejo del mundo para render.js ----------
  OP.S = { time: 8, agents: [], ships: [], battles: [], A: {}, U: {}, SH: {}, isl: [], playerId: 0, news: [] };
  const npcObjs = new Map(), shipObjs = new Map();
  function onSnap(m) {
    const S = OP.S;
    S.time = m.t;
    for (const i of m.ni) Net.npcInfo.set(i.id, i);
    for (const u of m.ui) S.U[u.id] = { id: u.id, name: u.n, faction: u.f, flag: u.flag, solo: u.solo, members: [] };
    const seen = new Set(), agents = [];
    for (const [id, x, y, fl, hp] of m.n) {
      const info = Net.npcInfo.get(id);
      if (!info) continue;
      let a = npcObjs.get(id);
      if (!a) { a = { id, npc: true, loc: 'island', x: x / 100, y: y / 100, isPlayer: false, maxHp: 100 }; npcObjs.set(id, a); }
      a.tx2 = x / 100; a.ty2 = y / 100;
      if (Math.hypot(a.tx2 - a.x, a.ty2 - a.y) > 6) { a.x = a.tx2; a.y = a.ty2; }
      a.name = info.n; a.faction = info.f; a.lvl = info.l; a.app = info.app; a.bounty = info.b; a.rank = info.r; a.epithet = info.e; a.unit = info.u;
      a.tx = fl & 2 ? 1 : null; a.battle = fl & 4 ? 1 : 0; a.ko = !!(fl & 8); a.engaged = !!(fl & 16);
      a.hp = hp; a.maxHp = 100;
      seen.add(id); agents.push(a);
    }
    for (const id of npcObjs.keys()) if (!seen.has(id)) npcObjs.delete(id);
    S.agents = agents;
    S.A = {}; for (const a of agents) S.A[a.id] = a;
    const ships = [], sseen = new Set();
    for (const [id, x, y, ti, dir, st, gate, unit, mar] of m.s) {
      let sh = shipObjs.get(id);
      if (!sh) { sh = { id, x: x / 100, y: y / 100 }; shipObjs.set(id, sh); }
      sh.tx2 = x / 100; sh.ty2 = y / 100;
      if (Math.hypot(sh.tx2 - sh.x, sh.ty2 - sh.y) > 8) { sh.x = sh.tx2; sh.y = sh.ty2; }
      sh.type = SHIP_TYPES[ti] || 'bote'; sh.dir = dir; sh.state = st === 1 ? 'sailing' : st === 2 ? 'battle' : 'docked'; sh.gate = gate || null; sh.unit = unit; sh.faction = mar ? 'marine' : 'pirate';
      sseen.add(id); ships.push(sh);
    }
    for (const id of shipObjs.keys()) if (!sseen.has(id)) shipObjs.delete(id);
    S.ships = ships;
    S.SH = {}; for (const s of ships) S.SH[s.id] = s;
    S.battles = m.b.map(([x, y, n]) => ({ x: x / 10, y: y / 10, sides: [{ f: new Array(Math.ceil(n / 2)) }, { f: new Array(Math.floor(n / 2)) }] }));
    S.fruitItems = (m.f || []).map(([id, x, y]) => ({ id, x, y }));
  }
  // dirección hacia la que mira un personaje según su movimiento (para los sprites de 4 direcciones)
  function faceOf(o, dx, dy) {
    const d = Math.hypot(dx, dy);
    o.walking = d > 0.015;
    if (!o.walking) return;
    o.face = Math.abs(dx) > Math.abs(dy) * 0.8 ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }
  Net.faceOf = faceOf;
  Net.smooth = function (dt) {
    const k = Math.min(1, dt * 10);
    for (const a of npcObjs.values()) { const dx = (a.tx2 - a.x) * k, dy = (a.ty2 - a.y) * k; faceOf(a, dx / Math.max(dt, 0.001) * 0.05, dy / Math.max(dt, 0.001) * 0.05); a.x += dx; a.y += dy; }
    for (const s of shipObjs.values()) { s.x += (s.tx2 - s.x) * k; s.y += (s.ty2 - s.y) * k; }
    const kp = Math.min(1, dt * 14);
    for (const p of Net.players.values()) {
      if (p.sid === Net.sid) continue;
      if (Math.hypot(p.sx - p.rx, p.sy - p.ry) > 6) { p.rx = p.sx; p.ry = p.sy; }
      const dx = (p.sx - p.rx) * kp, dy = (p.sy - p.ry) * kp;
      faceOf(p, p.moving ? dx / Math.max(dt, 0.001) * 0.05 : 0, p.moving ? dy / Math.max(dt, 0.001) * 0.05 : 0);
      p.rx += dx; p.ry += dy;
    }
  };
  // Copia el estado sincronizado de Colyseus a objetos propios (con posición suavizada)
  Net.pullPlayers = function () {
    const room = Net.room;
    if (!room || !room.state || !room.state.players) return;
    const seen = new Set();
    room.state.players.forEach((st, sid) => {
      let p = Net.players.get(sid);
      if (!p) { p = { sid, rx: st.x, ry: st.y }; Net.players.set(sid, p); }
      p.sx = st.x; p.sy = st.y;
      p.cid = st.cid; p.name = st.name; p.faction = st.faction; p.lvl = st.lvl; p.hp = st.hp; p.maxHp = st.maxHp;
      p.boat = st.boat; p.dir = st.dir; p.moving = st.moving; p.dead = st.dead; p.bounty = st.bounty; p.rank = st.rank;
      p.crewId = st.crewId; p.crewName = st.crewName; p.captain = st.captain; p.fighting = st.fighting;
      p.ride = st.ride || '';   // va de pasajero en el barco de este jugador (sid)
      p.shipLook = st.shipLook || '';
      p.training = !!st.training; p.armor = st.armor || 0; p.obs = !!st.obs; p.stun = st.stun || 0;   // entrenamiento y Aura
      p.zoan = st.zoan || ''; p.prop = st.prop || ''; p.inside = st.inside || '';                       // Bestia, entrenamiento especial, interiores
      const L = st.look;
      p.app = { skin: L.skin, hair: L.hair, hairColor: L.hairColor, cloth: L.cloth, acc: L.acc, build: L.build, hat: L.hat || '', scar: L.scar || '' };
      p.gear = st.gear || '';
      seen.add(sid);
    });
    for (const sid of Net.players.keys()) if (!seen.has(sid)) Net.players.delete(sid);
  };

  // ---------- Noticias (las guarda el cliente para el panel y el periódico) ----------
  function addNews(n) {
    const S = OP.S;
    if (S.news.some((x) => x.id === n.id)) return false;
    S.news.unshift(n);
    S.news.sort((a, b) => b.id - a.id);
    if (S.news.length > 200) S.news.length = 200;
    return true;
  }

  // ---------- Conexión ----------
  Net.connect = async function () {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    const room = await new Colyseus.Client(proto + location.host).join('world', { token: Net.token });
    Net.room = room; Net.sid = room.sessionId; Net.connected = true;
    room.onMessage('welcome', (m) => {
      OP.S.isl = m.discovered.map((d) => ({ discovered: !!d }));
      for (const n of m.news.slice().reverse()) addNews(n);
      emit('welcome', m);
    });
    room.onMessage('me', (m) => { Net.me = m; emit('me', m); });
    room.onMessage('snap', onSnap);
    room.onMessage('news', (n) => { if (addNews(n)) emit('news', n); });
    for (const t of ['chat', 'toast', 'fx', 'afx', 'invite', 'crewreq', 'code', 'admin', 'order', 'fruitnote', 'res', 'crew', 'levelup', 'quest', 'teleport', 'pong', 'exec', 'era', 'announce', 'kicked', 'fruitping', 'hakifx', 'zoanfx', 'room', 'dialog']) {
      room.onMessage(t, (m) => { if (t === 'crew') Net.crew = m; emit(t, m); });
    }
    room.onLeave((code) => { Net.connected = false; emit('leave', code); });
    room.onError((code, msg) => console.warn('Error de sala', code, msg));
    return room;
  };
  Net.send = (type, msg) => { if (Net.room && Net.connected) Net.room.send(type, msg || {}); };
  setInterval(() => Net.send('ping', { t: performance.now() }), 4000);
  Net.on('pong', (m) => { Net.ping = Math.round(performance.now() - m.t); });
})();
