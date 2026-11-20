/* MILESDEPIRATAS - arranque, bucle principal, ratón y teclado */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const UI = OP.UI;
  const Sim = OP.Sim;
  const $ = (s) => document.querySelector(s);
  const Main = (OP.Main = { terrainReady: false });

  let last = 0, acc = 0, uiTimer = 0, saveTimer = 0, running = false;

  function boot() {
    UI.showStart();
    setTimeout(() => {
      try {
        OP.Map.build();
        Sim.attachMap();
        OP.Render.init($('#map'), $('#minimap'));
        OP.Render.buildTerrain();
        Main.terrainReady = true;
        const m = $('#loading-msg');
        if (m) m.textContent = '';
      } catch (e) {
        console.error(e);
        const m = $('#loading-msg');
        if (m) m.textContent = '⚠️ No se pudo crear el mundo: ' + e.message;
      }
    }, 60);
  }

  Main.startNew = function (spec) {
    Sim.newWorld((Date.now() & 0x7fffffff) || 1, spec);
    Main.enterGame();
    UI.goPlayer();
    UI.follow = false;
  };

  Main.enterGame = function () {
    $('#start').classList.add('hidden');
    $('#game').classList.remove('hidden');
    UI.started = true;
    UI.sel = null; UI.selIsland = null;
    UI.buildTopbar();
    UI.buildNews();
    UI.renderNews(true);
    OP.Render.resize();
    const p = OP.S.A[OP.S.playerId];
    if (p) UI.select(p, true); else UI.renderPanel(true);
    acc = 0; saveTimer = 0;
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  };

  function loop(ts) {
    const dt = Math.min(0.25, Math.max(0, (ts - last) / 1000));
    last = ts;
    if (UI.started && OP.S) {
      if (!UI.paused) {
        acc += dt * Sim.HOURS_PER_SEC * UI.speed;
        let steps = Math.floor(acc / Sim.STEP);
        acc -= steps * Sim.STEP;
        if (steps > 80) { steps = 80; acc = 0; }
        try {
          for (let i = 0; i < steps; i++) Sim.step();
        } catch (e) {
          console.error('Error en la simulación', e);
          UI.paused = true;
          UI.toast('⚠️ Error en la simulación: ' + e.message);
        }
      }
      // la cámara sigue al personaje
      if (UI.follow && UI.sel) {
        const [x, y] = OP.Render.agentPos(UI.sel);
        const c = OP.Render.cam;
        c.x += (x - c.x) * 0.15; c.y += (y - c.y) * 0.15;
        OP.Render.clampCam();
      }
      OP.Render.draw(ts, UI.sel);
      uiTimer += dt;
      if (uiTimer > 0.25) {
        uiTimer = 0;
        UI.updateTopbar();
        UI.renderPanel(false);
        UI.renderNews(false);
        OP.Render.drawMini(UI.sel);
      }
      if (!UI.paused) {
        saveTimer += dt;
        if (saveTimer > 120) {
          saveTimer = 0;
          const r = OP.Save.save('auto');
          if (r.ok) { const el = $('#autosave'); el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 1800); }
        }
      }
    }
    requestAnimationFrame(loop);
  }

  // ---------- Ratón sobre el mapa ----------
  function setupInput() {
    const cv = $('#map');
    let down = null, dragging = false, lastHover = 0;
    cv.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY };
      dragging = false;
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (down) {
        const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
        if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { dragging = true; UI.follow = false; }
        if (dragging) { OP.Render.pan(dx, dy); down.lx = e.clientX; down.ly = e.clientY; }
        $('#tooltip').classList.add('hidden');
        return;
      }
      const now = performance.now();
      if (now - lastHover < 90 || !OP.S) return;
      lastHover = now;
      const r = cv.getBoundingClientRect();
      const p = OP.Render.pick(e.clientX - r.left, e.clientY - r.top);
      const tip = $('#tooltip');
      if (!p) { tip.classList.add('hidden'); cv.style.cursor = 'grab'; return; }
      cv.style.cursor = 'pointer';
      let txt = '';
      if (p.type === 'agent') txt = (p.obj.faction === 'pirate' ? '☠ ' : '⚓ ') + p.obj.name + ' · nv ' + p.obj.lvl;
      else if (p.type === 'ship') { const u = OP.S.U[p.obj.unit]; txt = '⛵ ' + p.obj.name + (u && u.name ? ' — ' + u.name : ''); }
      else if (p.type === 'island') txt = (p.obj.hidden && !OP.S.isl[p.obj.idx].discovered) ? '🏝 Isla Postrera ???' : '🏝 ' + p.obj.name;
      else if (p.type === 'landmark') txt = '⛰ ' + p.obj.name;
      tip.textContent = txt;
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 10) + 'px';
      tip.classList.remove('hidden');
    });
    cv.addEventListener('pointerup', (e) => {
      if (down && !dragging && OP.S) {
        const r = cv.getBoundingClientRect();
        const p = OP.Render.pick(e.clientX - r.left, e.clientY - r.top);
        if (p) {
          if (p.type === 'agent') UI.select(p.obj, false);
          else if (p.type === 'ship') {
            const u = OP.S.U[p.obj.unit];
            const who = u && (OP.S.A[u.leader] || u.members.map((id) => OP.S.A[id]).find(Boolean));
            if (who) UI.select(who, false);
          } else if (p.type === 'island') UI.selectIsland(p.obj, false);
          else if (p.type === 'landmark') UI.toast('⛰ ' + p.obj.name + ': ' + p.obj.text);
        }
      }
      down = null; dragging = false;
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      OP.Render.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    }, { passive: false });
    cv.addEventListener('dblclick', (e) => {
      const r = cv.getBoundingClientRect();
      OP.Render.zoomAt(e.clientX - r.left, e.clientY - r.top, 2);
    });
    cv.addEventListener('pointerleave', () => $('#tooltip').classList.add('hidden'));
    // minimapa
    const mm = $('#minimap');
    const goMini = (e) => {
      const r = mm.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * OP.W, y = (e.clientY - r.top) / r.height * OP.H;
      UI.follow = false;
      OP.Render.centerOn(x, y);
    };
    let mmDown = false;
    mm.addEventListener('pointerdown', (e) => { mmDown = true; goMini(e); });
    mm.addEventListener('pointermove', (e) => { if (mmDown) goMini(e); });
    window.addEventListener('pointerup', () => { mmDown = false; });
    // paneles plegables
    $('#side-toggle').addEventListener('click', () => $('#side').classList.toggle('collapsed'));
    $('#news-toggle').addEventListener('click', () => $('#news').classList.toggle('collapsed'));
    $('#me-btn') && $('#me-btn').addEventListener('click', UI.goPlayer);
    document.addEventListener('click', (e) => { if (e.target.closest('#me-btn')) UI.goPlayer(); });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') UI.closeModal(); });
    // teclado
    window.addEventListener('keydown', (e) => {
      if (!UI.started) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key;
      if (k === ' ') { e.preventDefault(); UI.paused = !UI.paused; UI.updateTopbar(); }
      else if (k === '1') { UI.speed = 1; UI.paused = false; }
      else if (k === '2') { UI.speed = 2; UI.paused = false; }
      else if (k === '3') { UI.speed = 5; UI.paused = false; }
      else if (k === '4') { UI.speed = 10; UI.paused = false; }
      else if (k === 'Escape') { if (!$('#modal').classList.contains('hidden')) UI.closeModal(); else { UI.sel = null; UI.selIsland = null; UI.follow = false; UI.renderPanel(true); } }
      else if (k === 'm' || k === 'M') UI.goPlayer();
      else if (k === 'f' || k === 'F') { if (UI.sel) { UI.follow = !UI.follow; UI.renderPanel(true); } }
      else if (k === '+' || k === '=') OP.Render.zoomAt(innerWidth / 2, innerHeight / 2, 1.25);
      else if (k === '-') OP.Render.zoomAt(innerWidth / 2, innerHeight / 2, 0.8);
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') OP.Render.pan(80, 0);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') OP.Render.pan(-80, 0);
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') OP.Render.pan(0, 80);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') OP.Render.pan(0, -80);
      UI.updateTopbar();
    });
    window.addEventListener('beforeunload', () => { if (UI.started && OP.S) OP.Save.save('auto'); });
  }

  setupInput();
  boot();
})();
