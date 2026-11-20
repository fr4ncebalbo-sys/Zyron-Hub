/* MILESDEPIRATAS (online) - MÚSICA Y SONIDOS (Web Audio API).
   - Todo se sintetiza en el navegador: no hace falta ningún archivo.
   - Si pones archivos en assets/audio se usan en su lugar (mira assets/audio/LEEME.txt):
       musica.mp3 (o .ogg) → música de fondo · golpe.mp3, critico.mp3, tecnica.mp3, puerta.mp3, nivel.mp3,
       transformacion.mp3, dialogo.mp3, mar.mp3 (bucle al navegar)...
   - Botón 🔊 (arriba a la derecha): volumen de la música y de los efectos, y silenciar. Se recuerda en este navegador. */
(function () {
  'use strict';
  const OP = window.OP, Net = OP.Net, Main = OP.Main;
  const KEY = 'opw_audio';
  let cfg = { music: 0.35, sfx: 0.7, muted: false };
  try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* sin almacenamiento */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* sin almacenamiento */ } };

  let ctx = null, master, musicG, sfxG, seaG, seaF;
  const files = {};   // nombre → AudioBuffer (si hay archivo propio en assets/audio)
  let musicEl = null;
  const NAMES = { hit: 'golpe', crit: 'critico', ability: 'tecnica', door: 'puerta', levelup: 'nivel', transform: 'transformacion', poof: 'transformacion', talk: 'dialogo', blip: 'dialogo', coin: 'moneda' };

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.connect(ctx.destination);
    musicG = ctx.createGain(); musicG.connect(master);
    sfxG = ctx.createGain(); sfxG.connect(master);
    applyVol();
    // mar al navegar: ruido filtrado en bucle (más fuerte en barcos grandes y en movimiento)
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { b = (b + (Math.random() * 2 - 1) * 0.05) * 0.985; d[i] = b * 3; }
    const sea = ctx.createBufferSource(); sea.buffer = buf; sea.loop = true;
    seaF = ctx.createBiquadFilter(); seaF.type = 'lowpass'; seaF.frequency.value = 700;
    seaG = ctx.createGain(); seaG.gain.value = 0;
    sea.connect(seaF).connect(seaG).connect(sfxG); sea.start();
    loadFiles();
    startMusic();
  }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, start, { passive: true }));
  function applyVol() {
    if (!ctx) return;
    master.gain.value = cfg.muted ? 0 : 1;
    musicG.gain.value = cfg.music;
    sfxG.gain.value = cfg.sfx;
    if (musicEl) { musicEl.volume = cfg.muted ? 0 : cfg.music; }
  }

  // archivos propios (opcionales)
  async function loadFiles() {
    let list = [];
    try { list = (await fetch('/api/audio').then((r) => r.json())).files || []; } catch (e) { return; }
    for (const f of list) {
      const base = f.replace(/\.[^.]+$/, '').toLowerCase();
      if (base === 'musica' || base === 'music') { musicEl = new Audio('assets/audio/' + encodeURIComponent(f)); musicEl.loop = true; applyVol(); musicEl.play().catch(() => {}); stopSynthMusic = true; continue; }
      try { const ab = await fetch('assets/audio/' + encodeURIComponent(f)).then((r) => r.arrayBuffer()); files[base] = await ctx.decodeAudioData(ab); } catch (e) { /* archivo no válido */ }
    }
  }

  // ---------- Música de fondo sintetizada: aventura en el mar (bucle de 8 compases) ----------
  let stopSynthMusic = false;
  const N = (n) => 440 * Math.pow(2, (n - 69) / 12);   // nota MIDI → Hz
  // acordes (re menor: i - VII - VI - V · luego relativo mayor) y melodía de saloma marinera
  const CHORDS = [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [45, 52, 57, 61], [50, 57, 62, 65], [53, 60, 65, 69], [48, 55, 60, 64], [45, 52, 57, 61]];
  const MELODY = [74, 0, 77, 76, 74, 72, 0, 69, 72, 0, 74, 72, 70, 69, 0, 0, 70, 0, 74, 72, 70, 69, 0, 67, 69, 0, 73, 0, 76, 0, 0, 0,
    74, 0, 77, 76, 74, 72, 0, 69, 77, 0, 79, 77, 76, 74, 0, 72, 72, 0, 76, 74, 72, 70, 0, 69, 69, 0, 73, 72, 69, 0, 0, 0];
  let step = 0, nextT = 0;
  const BEAT = 60 / 92 / 2;   // corcheas a 92 ppm
  function tone(freq, t, dur, type, vol, dest, attack) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function startMusic() {
    nextT = ctx.currentTime + 0.2;
    setInterval(() => {
      if (!ctx || stopSynthMusic || cfg.muted || cfg.music <= 0.001) { if (ctx) nextT = ctx.currentTime + 0.1; return; }
      while (nextT < ctx.currentTime + 0.4) {
        const bar = Math.floor(step / 8) % CHORDS.length, ch = CHORDS[bar], i = step % 8;
        if (i === 0) for (const n of ch.slice(1)) tone(N(n), nextT, BEAT * 8, 'triangle', 0.035, musicG, 0.25);   // colchón
        if (i % 4 === 0) tone(N(ch[0] - 12), nextT, BEAT * 3.5, 'sine', 0.16, musicG, 0.01);                        // bajo
        if (i % 2 === 1) tone(N(ch[(i >> 1) % 4] + 12), nextT, BEAT * 0.9, 'square', 0.018, musicG, 0.005);         // arpegio de guitarra
        const m = MELODY[step % MELODY.length];
        if (m) tone(N(m), nextT, BEAT * 1.6, 'triangle', 0.07, musicG, 0.02);                                         // melodía (acordeón)
        step++; nextT += BEAT;
      }
    }, 100);
  }

  // ---------- Efectos sintetizados ----------
  function noise(t, dur, freq, q, vol, type) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur)), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1; g.gain.value = vol;
    s.connect(f).connect(g).connect(sfxG); s.start(t);
  }
  function sweep(t, f0, f1, dur, type, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(sfxG); o.start(t); o.stop(t + dur + 0.05);
  }
  const SYN = {
    hit: (t, v) => { sweep(t, 160, 50, 0.12, 'sine', 0.5 * v); noise(t, 0.08, 1200, 0.8, 0.35 * v); },
    crit: (t, v) => { SYN.hit(t, v); sweep(t + 0.02, 1400, 2400, 0.12, 'triangle', 0.15 * v); },
    ability: (t, v) => { noise(t, 0.4, 900, 0.6, 0.3 * v, 'lowpass'); sweep(t, 300, 900, 0.35, 'sawtooth', 0.06 * v); },
    door: (t, v) => { sweep(t, 220, 140, 0.3, 'sawtooth', 0.05 * v); noise(t + 0.25, 0.06, 300, 1, 0.5 * v); noise(t + 0.33, 0.05, 280, 1, 0.4 * v); },
    levelup: (t, v) => { [72, 76, 79, 84].forEach((n, k) => tone(N(n), t + k * 0.09, 0.3, 'square', 0.06 * v, sfxG)); },
    transform: (t, v) => { sweep(t, 120, 900, 0.6, 'sawtooth', 0.08 * v); noise(t, 0.6, 600, 0.5, 0.25 * v, 'lowpass'); },
    poof: (t, v) => { noise(t, 0.3, 500, 0.6, 0.3 * v, 'lowpass'); },
    talk: (t, v) => { tone(N(81), t, 0.06, 'square', 0.05 * v, sfxG); tone(N(84), t + 0.07, 0.06, 'square', 0.05 * v, sfxG); },
    blip: (t, v) => { tone(N(84), t, 0.05, 'square', 0.04 * v, sfxG); },
    coin: (t, v) => { tone(N(88), t, 0.08, 'square', 0.05 * v, sfxG); tone(N(93), t + 0.08, 0.2, 'square', 0.05 * v, sfxG); }
  };
  function sfx(name, vol) {
    if (!ctx || cfg.muted || cfg.sfx <= 0.001) return;
    const v = vol == null ? 1 : vol;
    const file = files[NAMES[name] || name];
    if (file) { const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = file; g.gain.value = v; s.connect(g).connect(sfxG); s.start(); return; }
    const fn = SYN[name];
    if (fn) fn(ctx.currentTime + 0.01, v);
  }

  // ---------- Sonidos del juego ----------
  Net.on('fx', (m) => {
    if (!ctx || Main.room) return;
    const [x, y] = Main.myPos();
    const d = Math.hypot(m.x - x, m.y - y);
    if (d > 14) return;
    const v = Math.max(0.15, 1 - d / 14);
    if (!m.v) return;
    sfx(m.c ? 'crit' : 'hit', v);
  });
  Net.on('afx', () => sfx('ability', 0.8));
  Net.on('levelup', () => sfx('levelup'));
  // mar, velas y crujidos al navegar: cuanto más grande el barco, más se nota
  setInterval(() => {
    if (!ctx || !seaG) return;
    const self = Net.players.get(Net.sid);
    const sailing = self && self.boat && !Main.room;
    const size = sailing ? Math.max(0, (OP.SHIP_ORDER || []).indexOf(self.boat)) : 0;
    const target = sailing ? (self.moving ? 0.25 + size * 0.06 : 0.12) : 0;
    seaG.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
    seaF.frequency.setTargetAtTime(sailing && self.moving ? 900 + size * 120 : 500, ctx.currentTime, 0.5);
    if (sailing && self.moving && Math.random() < 0.08 + size * 0.02) noise(ctx.currentTime, 0.25, 180 + Math.random() * 80, 2, 0.08 + size * 0.02);   // crujido de las velas / el casco
  }, 300);

  // ---------- Botón de volumen ----------
  function ui() {
    if (document.getElementById('audio-ctl')) return;
    const d = document.createElement('div');
    d.id = 'audio-ctl';
    d.innerHTML = `<button id="audio-btn" title="Música y sonido">${cfg.muted ? '🔇' : '🔊'}</button>
      <div id="audio-pop" class="hidden"><label>🎵 Música <input type="range" min="0" max="100" id="vol-music" value="${Math.round(cfg.music * 100)}"></label>
      <label>💥 Efectos <input type="range" min="0" max="100" id="vol-sfx" value="${Math.round(cfg.sfx * 100)}"></label>
      <label class="check"><input type="checkbox" id="vol-mute" ${cfg.muted ? 'checked' : ''}> Silenciar todo</label></div>`;
    document.body.appendChild(d);
    const pop = d.querySelector('#audio-pop');
    d.querySelector('#audio-btn').addEventListener('click', () => { start(); pop.classList.toggle('hidden'); });
    d.querySelector('#vol-music').addEventListener('input', (e) => { cfg.music = e.target.value / 100; applyVol(); save(); });
    d.querySelector('#vol-sfx').addEventListener('input', (e) => { cfg.sfx = e.target.value / 100; applyVol(); save(); sfx('blip'); });
    d.querySelector('#vol-mute').addEventListener('change', (e) => { cfg.muted = e.target.checked; d.querySelector('#audio-btn').textContent = cfg.muted ? '🔇' : '🔊'; applyVol(); save(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#audio-ctl')) pop.classList.add('hidden'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();

  OP.Audio = { sfx, start };
})();
