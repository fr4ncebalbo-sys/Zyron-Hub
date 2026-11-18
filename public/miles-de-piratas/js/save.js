/* MILESDEPIRATAS - guardar y cargar partidas (LocalStorage) */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});
  const PREFIX = 'opws_v1_';
  const SKIP = { A: 1, U: 1, SH: 1, _occ: 1 };

  function serialize() {
    const S = OP.S;
    const out = {};
    for (const k in S) if (!SKIP[k]) out[k] = S[k];
    out.rng = OP.R.s;
    out.savedAt = Date.now();
    return JSON.stringify(out);
  }
  function deserialize(str) {
    const st = JSON.parse(str);
    if (!st || !st.agents || !st.units) throw new Error('Partida dañada');
    OP.Sim.loadState(st);
    return st;
  }
  function storage() {
    try { return window.localStorage || null; } catch (e) { return null; }
  }
  function save(slot) {
    const ls = storage();
    if (!ls) return { ok: false, msg: 'Este navegador no deja guardar partidas.' };
    const data = serialize();
    const p = OP.S.A[OP.S.playerId];
    const meta = { slot, savedAt: Date.now(), time: OP.S.time, player: p ? p.name : '?', faction: p ? p.faction : '', size: data.length };
    try {
      ls.setItem(PREFIX + 'slot_' + slot, data);
      ls.setItem(PREFIX + 'meta_' + slot, JSON.stringify(meta));
      return { ok: true, meta };
    } catch (e) {
      return { ok: false, msg: 'No hay sitio para guardar (' + Math.round(data.length / 1024) + ' KB). Borra otra ranura.' };
    }
  }
  function load(slot) {
    const ls = storage();
    if (!ls) return { ok: false, msg: 'Este navegador no deja cargar partidas.' };
    const data = ls.getItem(PREFIX + 'slot_' + slot);
    if (!data) return { ok: false, msg: 'Esa ranura está vacía.' };
    try { deserialize(data); return { ok: true }; } catch (e) { return { ok: false, msg: 'No se pudo cargar: ' + e.message }; }
  }
  function list() {
    const ls = storage();
    const out = [];
    for (const slot of ['auto', '1', '2', '3']) {
      let meta = null;
      try { meta = ls ? JSON.parse(ls.getItem(PREFIX + 'meta_' + slot) || 'null') : null; } catch (e) { meta = null; }
      out.push({ slot, meta });
    }
    return out;
  }
  function remove(slot) {
    const ls = storage();
    if (!ls) return;
    try { ls.removeItem(PREFIX + 'slot_' + slot); ls.removeItem(PREFIX + 'meta_' + slot); } catch (e) { /* nada */ }
  }
  OP.Save = { serialize, deserialize, save, load, list, remove };
})();
