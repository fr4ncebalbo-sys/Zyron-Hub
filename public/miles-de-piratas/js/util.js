/* MILESDEPIRATAS - utilidades generales (azar con semilla, ruido, formatos) */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});

  // ---------- Azar con semilla (se guarda en la partida) ----------
  function makeRng(seed) {
    return {
      s: (seed | 0) || 1,
      seed(n) { this.s = (n | 0) || 1; },
      next() {
        this.s = (this.s + 0x6D2B79F5) | 0;
        let t = this.s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      f(a, b) { return a + (b - a) * this.next(); },
      i(a, b) { return a + Math.floor((b - a + 1) * this.next()); },
      chance(p) { return this.next() < p; },
      pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(this.next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
      weighted(items, wf) {
        let tot = 0;
        const ws = new Array(items.length);
        for (let i = 0; i < items.length; i++) { const w = Math.max(0, wf(items[i]) || 0); ws[i] = w; tot += w; }
        if (tot <= 0) return null;
        let r = this.next() * tot;
        for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
        return items[items.length - 1];
      },
      gauss() {
        let u = 0, v = 0;
        while (u === 0) u = this.next();
        while (v === 0) v = this.next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      }
    };
  }
  OP.makeRng = makeRng;
  OP.R = makeRng(20240601);

  // ---------- Ruido determinista para el terreno ----------
  function hash2(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    const u = smooth(xf), v = smooth(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct) {
    oct = oct || 4;
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, y * f, s + i * 17); norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  }
  OP.hash2 = hash2; OP.vnoise = vnoise; OP.fbm = fbm;

  // ---------- Matemáticas ----------
  OP.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  OP.lerp = (a, b, t) => a + (b - a) * t;
  OP.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  // ---------- Formatos ----------
  function dots(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  OP.dots = dots;
  OP.fmtB = (n) => '฿ ' + dots(n || 0);
  OP.fmtBShort = (n) => {
    n = n || 0;
    if (n >= 1e9) return '฿ ' + (n / 1e9).toFixed(n >= 1e10 ? 0 : 2).replace('.', ',') + ' mil M';
    if (n >= 1e6) return '฿ ' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace('.', ',') + ' M';
    if (n >= 1e3) return '฿ ' + Math.round(n / 1e3) + ' mil';
    return '฿ ' + Math.round(n);
  };
  OP.dayOf = (t) => Math.floor(t / 24) + 1;
  OP.fmtTime = (t) => {
    const day = Math.floor(t / 24);
    const year = 1500 + Math.floor(day / 360);
    const d = (day % 360) + 1;
    const h = Math.floor(t % 24);
    return 'Año ' + year + ' · Día ' + d + ' · ' + String(h).padStart(2, '0') + ':00';
  };
  OP.fmtDay = (t) => {
    const day = Math.floor(t / 24);
    return 'Día ' + ((day % 360) + 1) + ', ' + (1500 + Math.floor(day / 360));
  };
  OP.fmtHours = (h) => {
    if (h < 1) return 'menos de 1 hora';
    if (h < 36) return Math.round(h) + ' h';
    const d = h / 24;
    return (d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)) + ' días';
  };
  OP.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
})();
