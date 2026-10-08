/* =====================================================================
   ATMOSFERA — MOTORE EMOTIVO  v0.1
   Scritto in stile "C": niente DOM, solo numeri e buffer.
   Si porta quasi riga per riga in C++ (ESP-IDF) sull'ESP32-S3.

   Tre stadi:
     1. sensori  → vettore emotivo (valenza, energia, tensione, intimità, chiave)
     2. vettore  → grammatica (archetipo, tavolozza, parametri dei motori)
     3. grammatica + seme → immagine 240×240 a 6 inchiostri Spectra

   Motori grafici (tutti a stato minimo):
     - Tiny CPPN   : rete di 2×8 neuroni che dipinge il fondo
     - Flow field  : linee che seguono un campo di rumore
     - Attrattore  : Clifford / de Jong, accumulato in densità ("il nucleo")
     - Fasce       : orizzonti ondulati
     - Accenti     : poche forme piene nell'inchiostro complementare
   ===================================================================== */
(function (root) {
'use strict';

const W = 240, H = 240;
// inchiostri Spectra 6
const PAPER = 0, BLACK = 1, RED = 2, YEL = 3, BLU = 4, GRN = 5;
const INK_NAMES = ['bianco', 'nero', 'rosso', 'giallo', 'blu', 'verde'];

// geometria del francobollo
const SX0 = 13, SX1 = 227, SY0 = 9, SY1 = 186;      // carta del francobollo
const IX0 = 22, IX1 = 218, IY0 = 18, IY1 = 177;     // area immagine
const IW = IX1 - IX0, IH = IY1 - IY0;
const PERF = 7.1, HOLE_R = 2.6;                      // passo e raggio dei fori

const BAYER = [
   0,32, 8,40, 2,34,10,42, 48,16,56,24,50,18,58,26,
  12,44, 4,36,14,46, 6,38, 60,28,52,20,62,30,54,22,
   3,35,11,43, 1,33, 9,41, 51,19,59,27,49,17,57,25,
  15,47, 7,39,13,45, 5,37, 63,31,55,23,61,29,53,21
];

/* ---------- utilità ---------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function bell(x, m, w) { return Math.exp(-((x - m) * (x - m)) / (2 * w * w)); }
function rng(seed) {                         // mulberry32: identico in C
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 0x9E3779B1)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct) {
  let a = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { a += amp * vnoise(x * f, y * f, s + i * 1013); norm += amp; f *= 2.03; amp *= 0.5; }
  return a / norm;
}
function pickW(weights, r) {
  let sum = 0; for (const w of weights) sum += w;
  let acc = 0; r *= sum;
  for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (r < acc) return i; }
  return weights.length - 1;
}

/* =====================================================================
   STADIO 1 — sensori → vettore emotivo  (tutti i valori 0..1)
   ===================================================================== */
function emotionFromSensors(d) {
  const L  = clamp(Math.log10(Math.max(1, d.lux)) / 4.6, 0, 1);   // 1 lux → 0, 40.000 lux → 1
  const k  = clamp((d.kelvin - 2200) / 4600, 0, 1);               // 0 calda, 1 fredda
  const n  = clamp((d.db - 25) / 65, 0, 1);                       // 25 dB → 0, 90 dB → 1
  const tc = clamp(1 - Math.max(0, 19 - d.temp, d.temp - 25) / 10, 0, 1); // comfort termico (19–25 °C)
  const hc = clamp(1 - Math.abs(d.hum - 47) / 38, 0, 1);          // comfort igrometrico
  const c  = clamp((d.co2 - 450) / 1600, 0, 1);                   // aria viziata

  const valenza  = clamp(0.20 * (1 - k) + 0.16 * tc + 0.08 * hc + 0.30 * (1 - smooth(0.1, 0.8, c))
                       + 0.10 * bell(L, 0.65, 0.3) + 0.16 * (1 - smooth(0.5, 0.95, n)), 0, 1);
  const energia  = clamp(0.58 * n + 0.30 * L + 0.12 * clamp((d.temp - 16) / 16, 0, 1), 0, 1);
  const tensione = clamp(0.48 * c + 0.22 * (1 - tc) + 0.20 * smooth(0.5, 0.9, n) + 0.10 * k * L, 0, 1);
  const intimita = clamp(0.36 * (1 - L) + 0.24 * (1 - k) + 0.26 * bell(n, 0.25, 0.17) + 0.14 * smooth(0.05, 0.35, c), 0, 1);
  // qualità dell'aria esterna (indice europeo), se disponibile: aria cattiva → più tensione, meno piacere
  const aq = d.aqi == null ? 0 : smooth(30, 100, d.aqi);
  const valenzaA = clamp(valenza - 0.12 * aq, 0, 1), tensioneA = clamp(tensione + 0.18 * aq, 0, 1);
  const chiave   = clamp(0.72 * L + 0.28 * valenzaA, 0, 1);          // luminosità d'insieme
  const calore   = clamp(0.75 * (1 - k) + 0.25 * clamp((d.temp - 10) / 22, 0, 1), 0, 1); // tinta: calda o fredda
  return { valenza: valenzaA, energia, tensione: tensioneA, intimita, chiave, calore };
}

/* nome dello stato d'animo: 3×3 valenza × energia, più un aggettivo */
const MOODS = [
  ['malinconia', 'disagio', 'inquietudine'],
  ['sospensione', 'attesa', 'fermento'],
  ['quiete', 'allegria', 'esultanza']
];
function moodName(e) {
  const vi = e.valenza < 0.4 ? 0 : (e.valenza < 0.62 ? 1 : 2);
  const ei = e.energia < 0.36 ? 0 : (e.energia < 0.62 ? 1 : 2);
  let adj = '';
  if (e.intimita > 0.62 && e.tensione < 0.5) adj = 'raccolta';
  else if (e.tensione > 0.6) adj = 'tesa';
  else if (e.chiave < 0.22) adj = 'notturna';
  else if (e.chiave > 0.8) adj = 'luminosa';
  return { name: MOODS[vi][ei], adj: adj };
}

/* =====================================================================
   STADIO 2 — vettore emotivo → grammatica
   ===================================================================== */
// tavolozze: rampa di inchiostri dal chiaro allo scuro + inchiostro d'accento
// "casa" = punto (valenza, energia) dove la tavolozza è più probabile
// "casa" = punto (valenza, energia, calore) dove la tavolozza è più probabile
const PALETTES = [
  { id: 'sole',      ramp: [PAPER, YEL, RED, BLACK], acc: BLU,   v: 0.82, e: 0.78, c: 0.70 },
  { id: 'lume',      ramp: [PAPER, YEL, RED, BLACK], acc: BLACK, v: 0.75, e: 0.22, c: 0.95 },
  { id: 'prato',     ramp: [PAPER, YEL, GRN, BLACK], acc: RED,   v: 0.82, e: 0.38, c: 0.50 },
  { id: 'lago',      ramp: [PAPER, GRN, BLU, BLACK], acc: YEL,   v: 0.58, e: 0.18, c: 0.20 },
  { id: 'mezzodì',   ramp: [PAPER, YEL, BLU, BLACK], acc: RED,   v: 0.66, e: 0.70, c: 0.45 },
  { id: 'brace',     ramp: [PAPER, YEL, RED, BLU],   acc: GRN,   v: 0.52, e: 0.82, c: 0.85 },
  { id: 'temporale', ramp: [PAPER, RED, BLU, BLACK], acc: YEL,   v: 0.22, e: 0.80, c: 0.30 },
  { id: 'ghiaccio',  ramp: [PAPER, BLU, BLACK],      acc: RED,   v: 0.45, e: 0.55, c: 0.05 },
  { id: 'notte',     ramp: [PAPER, BLU, BLACK],      acc: YEL,   v: 0.24, e: 0.20, c: 0.35 },
  { id: 'cenere',    ramp: [PAPER, BLACK],           acc: RED,   v: 0.36, e: 0.50, c: 0.50 }
];
const ARCHETYPES = ['nucleo', 'costellazione', 'orizzonte', 'deriva'];

function grammar(e, seed) {
  const r = rng(seed ^ 0xA5A5);
  // tavolozza: vicinanza nello spazio emotivo, con un po' di caso
  let best = 0, bw = -1;
  for (let i = 0; i < PALETTES.length; i++) {
    const p = PALETTES[i];
    const d2 = (p.v - e.valenza) * (p.v - e.valenza) + (p.e - e.energia) * (p.e - e.energia) + 0.6 * (p.c - e.calore) * (p.c - e.calore);
    let w = Math.exp(-d2 / 0.05) * (0.7 + 0.6 * r());
    if (p.id === 'cenere') w *= 0.35 + 1.4 * e.tensione;          // il grigio è per i momenti tesi
    if (w > bw) { bw = w; best = i; }
  }
  const pal = PALETTES[best];
  let ramp = pal.ramp.slice(), acc = pal.acc, lowKey = false;
  if (e.chiave < 0.3) {                                            // chiave bassa: fondo scuro, segni luminosi
    lowKey = true;
    const mid = ramp.slice(1, -1).reverse();
    ramp = [BLACK].concat(mid, [acc === YEL ? YEL : PAPER]);
    if (ramp[0] === ramp[1]) ramp.splice(1, 1);
    acc = acc === YEL ? PAPER : acc;
  }

  // archetipo della composizione
  const aw = [
    0.25 + 1.6 * e.intimita,                                       // nucleo
    0.15 + 1.5 * e.energia * (1 - e.intimita),                     // costellazione
    0.15 + 1.3 * (1 - e.energia) * (0.4 + e.valenza),              // orizzonte
    0.15 + 0.9 * e.tensione + 0.6 * e.energia                      // deriva
  ];
  const arche = pickW(aw, r());

  return {
    palette: pal.id, ramp: ramp, acc: acc, lowKey: lowKey,
    arche: arche, archeName: ARCHETYPES[arche],
    // CPPN
    cppnScale: 0.8 + 2.8 * e.energia,
    cppnBands: e.tensione > 0.55 ? 3 + Math.floor(3 * r()) : 0,
    groundAmt: (0.03 + 0.09 * (1 - e.valenza) + 0.08 * e.energia) * 3 / (ramp.length - 1) * (lowKey ? 0.8 : 1),
    groundBase: lowKey ? 0.0 : (1 - e.chiave) * 0.06,
    vignette: 0.35 * e.intimita,
    // flow field
    lines: Math.round(26 + 190 * e.energia * (0.6 + 0.4 * r())),
    lineLen: Math.round(28 + 110 * (1 - 0.55 * e.energia)),
    fieldFreq: 1.1 + 4.2 * e.energia,
    swirl: 0.7 + 2.2 * e.energia,
    converge: 0.12 + 0.6 * Math.max(e.tensione, 0.75 * e.intimita),
    orbit: 1 - e.tensione,                                         // 1 = le linee girano attorno, 0 = puntano al centro
    jitter: e.tensione * e.tensione * 1.2,
    ribbon: e.energia < 0.35,
    // attrattore
    attrKnot: e.tensione,
    attrGamma: 0.55 + 0.8 * e.tensione,
    attrDensity: 0.6 + 0.9 * e.energia,
    // accenti
    accents: Math.round(1 + 6 * e.energia * (1 - 0.6 * e.intimita)),
    pulse: e.intimita > 0.5 ? 2 + Math.round(4 * (e.intimita - 0.5) * 2) : 0,
    // grana del retino: ordinato (calmo) → granuloso (agitato)
    grain: clamp(0.08 + 0.75 * e.energia - 0.25 * e.intimita, 0, 0.9),
    e: e
  };
}

/* =====================================================================
   MOTORE 1 — Tiny CPPN  (4 ingressi → 8 → 8 → 2 uscite)
   ===================================================================== */
const ACT_SIN = 0, ACT_TANH = 1, ACT_GAUSS = 2, ACT_TRI = 3;
function makeCPPN(r, g) {
  const NI = 5, NH = 8, e = g.e;
  const net = { w1: [], w2: [], w3: [], a1: [], a2: [] };
  const sc = g.cppnScale;
  for (let i = 0; i < NH * NI; i++) net.w1.push((r() * 2 - 1) * sc);
  for (let i = 0; i < NH * NH; i++) net.w2.push((r() * 2 - 1) * 1.4);
  for (let i = 0; i < 2 * NH; i++) net.w3.push((r() * 2 - 1) * 1.2);
  const aw = [0.3 + e.energia, 0.4, 0.3 + e.valenza, 0.1 + 1.2 * e.tensione];
  for (let i = 0; i < NH; i++) { net.a1.push(pickW(aw, r())); net.a2.push(pickW(aw, r())); }
  return net;
}
function act(t, x) {
  switch (t) {
    case ACT_SIN: return Math.sin(x);
    case ACT_TANH: return Math.tanh(x);
    case ACT_GAUSS: return Math.exp(-x * x) * 2 - 1;
    default: { const f = x * 0.5 - Math.floor(x * 0.5); return Math.abs(f * 2 - 1) * 2 - 1; }
  }
}
function evalCPPN(net, x, y, out) {
  const r = Math.sqrt(x * x + y * y);
  const inp = [x, y, r, Math.sin(3 * r), 1];
  const h1 = new Array(8), h2 = new Array(8);
  for (let j = 0; j < 8; j++) {
    let s = 0; for (let i = 0; i < 5; i++) s += net.w1[j * 5 + i] * inp[i];
    h1[j] = act(net.a1[j], s);
  }
  for (let j = 0; j < 8; j++) {
    let s = 0; for (let i = 0; i < 8; i++) s += net.w2[j * 8 + i] * h1[i];
    h2[j] = act(net.a2[j], s);
  }
  for (let o = 0; o < 2; o++) {
    let s = 0; for (let i = 0; i < 8; i++) s += net.w3[o * 8 + i] * h2[i];
    out[o] = 0.5 + 0.5 * Math.tanh(s);
  }
}

/* =====================================================================
   MOTORE 2 — Attrattore strano (Clifford o de Jong) in un riquadro
   ===================================================================== */
function attractorParams(r, knot) {
  const lim = 1.3 + 1.5 * knot;                                   // tensione → nodi più stretti
  for (let tries = 0; tries < 24; tries++) {
    const p = { type: r() < 0.5 ? 0 : 1, a: (r() * 2 - 1) * lim, b: (r() * 2 - 1) * lim, c: (r() * 2 - 1) * 1.6, d: (r() * 2 - 1) * 1.6 };
    if (Math.abs(p.a) < 0.5 || Math.abs(p.b) < 0.5) continue;
    // prova: le orbite devono coprire abbastanza spazio
    let x = 0.1, y = 0.1, mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    const seen = new Uint8Array(1024);
    for (let i = 0; i < 4000; i++) {
      const s = stepAttr(p, x, y); x = s[0]; y = s[1];
      if (i > 100) { if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
    }
    if (!(mxx - mnx > 0.5 && mxy - mny > 0.5)) continue;
    x = 0.1; y = 0.1; let cells = 0;
    for (let i = 0; i < 4000; i++) {
      const s = stepAttr(p, x, y); x = s[0]; y = s[1];
      const cx = Math.floor((x - mnx) / (mxx - mnx + 1e-9) * 31.99), cy = Math.floor((y - mny) / (mxy - mny + 1e-9) * 31.99);
      const k = cy * 32 + cx; if (k >= 0 && k < 1024 && !seen[k]) { seen[k] = 1; cells++; }
    }
    if (cells < 110) continue;
    p.bx = [mnx, mxx, mny, mxy];
    return p;
  }
  return { type: 0, a: -1.4, b: 1.6, c: 1.0, d: 0.7, bx: [-2, 2, -1.7, 1.7] };
}
function stepAttr(p, x, y) {
  if (p.type === 0) return [Math.sin(p.a * y) + p.c * Math.cos(p.a * x), Math.sin(p.b * x) + p.d * Math.cos(p.b * y)];
  return [Math.sin(p.a * y) - Math.cos(p.b * x), Math.sin(p.c * x) - Math.cos(p.d * y)];
}
// disegna un nucleo centrato in (cx,cy) di lato size, ruotato di rot, nel buffer T
function drawNucleus(T, r, g, cx, cy, size, rot) {
  const p = attractorParams(r, g.attrKnot);
  const S = Math.max(8, Math.round(size));
  const cnt = new Uint16Array(S * S);
  const [mnx, mxx, mny, mxy] = p.bx;
  const sx = (mxx - mnx), sy = (mxy - mny), sc = 1 / Math.max(sx, sy);
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const N = Math.round(S * S * 5 * g.attrDensity);
  let x = 0.1, y = 0.1, mx = 1;
  for (let i = 0; i < N; i++) {
    const s = stepAttr(p, x, y); x = s[0]; y = s[1];
    if (i < 50) continue;
    const u = ((x - mnx) - sx / 2) * sc, v = ((y - mny) - sy / 2) * sc;     // -0.5..0.5
    const ru = u * ca - v * sa, rv = u * sa + v * ca;
    const px = Math.floor((ru * 0.96 + 0.5) * S), py = Math.floor((rv * 0.96 + 0.5) * S);
    if (px < 0 || py < 0 || px >= S || py >= S) continue;
    const k = py * S + px;
    if (cnt[k] < 65535) cnt[k]++;
    if (cnt[k] > mx) mx = cnt[k];
  }
  const lm = Math.log(1 + mx);
  const x0 = Math.round(cx - S / 2), y0 = Math.round(cy - S / 2);
  for (let j = 0; j < S; j++) {
    const yy = y0 + j; if (yy < IY0 || yy >= IY1) continue;
    for (let i = 0; i < S; i++) {
      const xx = x0 + i; if (xx < IX0 || xx >= IX1) continue;
      const c = cnt[j * S + i]; if (!c) continue;
      const v = Math.pow(Math.log(1 + c) / lm, g.attrGamma);
      if (v < 0.06) continue;
      const t = lerp(0.42, 1.0, v);
      const k = yy * W + xx;
      if (t > T[k]) T[k] = t;
    }
  }
  return { cx: cx, cy: cy, size: S, type: p.type };
}

/* =====================================================================
   MOTORE 3 — Flow field
   ===================================================================== */
function flowAngle(g, s, x, y, foci) {
  const nx = (x - IX0) / IW, ny = (y - IY0) / IH;
  let a = (fbm(nx * g.fieldFreq, ny * g.fieldFreq, s, 3) - 0.5) * Math.PI * 2 * g.swirl;
  let vx = Math.cos(a), vy = Math.sin(a);
  // convergenza verso il fuoco più vicino: tensione = punta al centro, calma = gira intorno
  let best = null, bd = 1e9;
  for (const f of foci) { const d = (f.cx - x) * (f.cx - x) + (f.cy - y) * (f.cy - y); if (d < bd) { bd = d; best = f; } }
  if (best) {
    const ang = Math.atan2(best.cy - y, best.cx - x) + g.orbit * Math.PI * 0.5;
    const w = g.converge * Math.exp(-Math.sqrt(bd) / 110);
    vx = lerp(vx, Math.cos(ang), w); vy = lerp(vy, Math.sin(ang), w);
  }
  return Math.atan2(vy, vx);
}
function drawFlow(T, r, g, s, foci, mult) {
  const n = Math.round(g.lines * mult);
  for (let i = 0; i < n; i++) {
    let x = IX0 + r() * IW, y = IY0 + r() * IH;
    const tone = lerp(0.36, 0.62, r());
    const len = Math.round(g.lineLen * (0.5 + r()));
    const wide = g.ribbon && r() < 0.6;
    const dotted = !g.ribbon && r() < 0.3 * g.e.energia;
    const dir = r() < 0.5 ? 1 : -1;
    for (let k = 0; k < len; k++) {
      let a = flowAngle(g, s, x, y, foci);
      if (g.jitter > 0) a += (r() - 0.5) * g.jitter;
      x += Math.cos(a) * 1.3 * dir; y += Math.sin(a) * 1.3 * dir;
      if (x < IX0 || x >= IX1 - 1 || y < IY0 || y >= IY1 - 1) break;
      if (dotted && ((k >> 2) & 1)) continue;
      const xi = x | 0, yi = y | 0, idx = yi * W + xi;
      if (tone > T[idx]) T[idx] = tone;
      if (wide) { const j = idx + 1, j2 = idx + W; if (tone > T[j]) T[j] = tone; if (tone > T[j2]) T[j2] = tone; }
    }
  }
}

/* =====================================================================
   MOTORE 4 — Fasce (orizzonti ondulati)
   ===================================================================== */
function drawBands(T, r, g, horizonY) {
  const n = 3 + Math.floor(r() * 4);
  const amp = 2 + 10 * (1 - g.e.tensione) * r() + 6 * g.e.energia;
  const ys = [];
  for (let i = 0; i < n; i++) ys.push(lerp(horizonY, IY1, (i + 0.4 + 0.3 * r()) / n));
  const fr = [], ph = [];
  for (let i = 0; i < n; i++) { fr.push(0.02 + 0.06 * r() + 0.05 * g.e.energia); ph.push(r() * 6.28); }
  for (let x = IX0; x < IX1; x++) {
    for (let i = 0; i < n; i++) {
      let yb = ys[i] + Math.sin(x * fr[i] + ph[i]) * amp * (0.5 + i / n);
      if (g.e.tensione > 0.55) yb = ys[i] + (Math.abs(((x * fr[i] + ph[i]) / Math.PI) % 2 - 1) - 0.5) * amp * 2; // creste spezzate
      const tone = 0.18 + 0.45 * (i / n);
      for (let y = Math.max(IY0, Math.round(yb)); y < IY1; y++) {
        const k = y * W + x; if (tone > T[k]) T[k] = tone;
      }
      const yl = Math.round(yb); if (yl >= IY0 && yl < IY1) { const k = yl * W + x; T[k] = Math.max(T[k], 0.7); }
    }
  }
}

/* =====================================================================
   MOTORE 5 — Accenti (inchiostro complementare, pieno o a retino)
   ===================================================================== */
function drawAccents(A, r, g, foci) {
  const e = g.e;
  const kinds = [0.2 + e.valenza, 0.15 + e.intimita, 0.1 + (1 - e.energia) * e.intimita, 0.05 + 1.3 * e.tensione, 0.05 + 0.9 * e.energia];
  const n = g.accents;
  for (let i = 0; i < n; i++) {
    const kind = pickW(kinds, r());                      // 0 disco, 1 anello, 2 luna, 3 scheggia, 4 trattini
    const rad = lerp(3, 16, Math.pow(r(), 1.4)) * (n <= 2 ? 1.5 : 1);
    let cx, cy;
    if (foci.length && r() < 0.35 + 0.6 * e.intimita) {   // intimità: gli accenti orbitano attorno al nucleo
      const f = foci[Math.floor(r() * foci.length)];
      const ang = r() * 6.283, d = f.size * lerp(0.35, 0.62, r());
      cx = f.cx + Math.cos(ang) * d; cy = f.cy + Math.sin(ang) * d;
    } else { cx = IX0 + 10 + r() * (IW - 20); cy = IY0 + 10 + r() * (IH - 20); }
    const half = r() < 0.25 ? 2 : 1;                      // 2 = a retino
    const rot = r() * 6.283, ca = Math.cos(rot), sa = Math.sin(rot);
    const R = Math.ceil(rad * 1.6);
    for (let y = Math.round(cy - R); y <= cy + R; y++) {
      if (y < IY0 || y >= IY1) continue;
      for (let x = Math.round(cx - R); x <= cx + R; x++) {
        if (x < IX0 || x >= IX1) continue;
        const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        let hit = false;
        if (kind === 0) hit = d <= rad;
        else if (kind === 1) hit = d <= rad && d >= rad - 1.6;
        else if (kind === 2) { const d2 = Math.sqrt((u - rad * 0.45) * (u - rad * 0.45) + v * v); hit = d <= rad && d2 > rad * 0.85; }
        else if (kind === 3) { const uu = u / (rad * 1.5), vv = v / (rad * 0.55); hit = uu > -1 && uu < 1 && Math.abs(vv) < (1 - uu) * 0.5 + 0.02 && Math.abs(vv) < 1; }
        else { const uu = u + rad * 1.5; hit = Math.abs(v) < 1.1 && uu >= 0 && uu < rad * 3 && ((uu | 0) % 6) < 3; }
        if (hit) A[y * W + x] = half;
      }
    }
  }
}

/* =====================================================================
   RENDER — riempie out (Uint8Array W*H) con indici d'inchiostro
   ===================================================================== */
function render(e, seed, out) {
  const g = grammar(e, seed);
  const r = rng(seed);
  const T = new Float32Array(W * H);           // sull'ESP32: uint8_t, 57,6 KB
  const A = new Uint8Array(W * H);             // maschera accenti
  const s = (seed * 2654435761) >>> 0;

  // 1. fondo: CPPN + vignetta d'intimità
  const net = makeCPPN(r, g), o = [0, 0];
  for (let y = IY0; y < IY1; y++) {
    for (let x = IX0; x < IX1; x++) {
      const nx = (x - IX0) / IW * 2 - 1, ny = (y - IY0) / IH * 2 - 1;
      evalCPPN(net, nx * 1.2, ny * 1.0, o);
      let f = o[0];
      if (g.cppnBands) f = Math.floor(f * g.cppnBands) / g.cppnBands;     // tensione → campiture a gradini
      const vig = g.vignette * Math.max(0, nx * nx + ny * ny - 0.35) * (g.lowKey ? -1 : 1);
      T[y * W + x] = clamp(g.groundBase + g.groundAmt * f + vig * 0.6, 0, 0.5);
    }
  }

  // 2. composizione: dove stanno i nuclei
  const foci = [];
  const mn = Math.min(IW, IH);
  const cxm = IX0 + IW / 2, cym = IY0 + IH / 2;
  if (g.arche === 0) {                                             // nucleo
    foci.push({ cx: cxm + (r() - 0.5) * 30, cy: cym + (r() - 0.5) * 20, size: mn * lerp(0.62, 0.92, e.intimita) });
  } else if (g.arche === 1) {                                      // costellazione
    const n = 2 + Math.floor(r() * 3), minD = lerp(28, 70, 1 - e.intimita);
    for (let t = 0; t < 60 && foci.length < n; t++) {
      const c = { cx: IX0 + 30 + r() * (IW - 60), cy: IY0 + 28 + r() * (IH - 56), size: mn * lerp(0.26, 0.42, r()) };
      if (foci.every(f => Math.hypot(f.cx - c.cx, f.cy - c.cy) > minD)) foci.push(c);
    }
  } else if (g.arche === 2) {                                      // orizzonte
    const hy = IY0 + IH * lerp(0.42, 0.62, r());
    drawBands(T, r, g, hy);
    foci.push({ cx: IX0 + IW * lerp(0.25, 0.75, r()), cy: hy - mn * 0.12, size: mn * lerp(0.36, 0.5, r()) });
  } else {                                                         // deriva
    foci.push({ cx: IX0 + IW * (r() < 0.5 ? 0.3 : 0.7), cy: IY0 + IH * lerp(0.3, 0.7, r()), size: mn * lerp(0.34, 0.5, r()) });
  }

  // 3. linee di flusso (prima del nucleo, così il nucleo resta leggibile)
  drawFlow(T, r, g, s, foci, g.arche === 3 ? 1.7 : (g.arche === 2 ? 0.5 : 1));

  // 4. pulsazioni concentriche (intimità)
  if (g.pulse && foci.length) {
    const f = foci[0];
    for (let y = IY0; y < IY1; y++) for (let x = IX0; x < IX1; x++) {
      const d = Math.hypot(x - f.cx, y - f.cy), ring = (d - f.size * 0.42) / 7;
      if (ring > 0 && ring < g.pulse && Math.abs(ring - Math.round(ring)) < 0.12) {
        const k = y * W + x; T[k] = Math.max(T[k], 0.5 - 0.06 * ring);
      }
    }
  }

  // 5. nuclei (attrattori)
  const nuclei = foci.map(f => drawNucleus(T, r, g, f.cx, f.cy, f.size, r() * 6.283));

  // 6. accenti
  drawAccents(A, r, g, foci);

  // 7. quantizzazione: rampa di inchiostri + retino ordinato/granuloso
  const ramp = g.ramp, R = ramp.length;
  out.fill(PAPER);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      // tavolo attorno al francobollo
      const inStamp = x >= SX0 && x < SX1 && y >= SY0 && y < SY1 && !isHole(x, y);
      if (!inStamp) { out[k] = (y < SY1 + 4 && BAYER[(y & 7) * 8 + (x & 7)] < 9) ? BLACK : PAPER; continue; }
      const inImg = x >= IX0 && x < IX1 && y >= IY0 && y < IY1;
      if (!inImg) { out[k] = PAPER; continue; }
      const thr = lerp(BAYER[(y & 7) * 8 + (x & 7)] / 64 + 1 / 128, hash2(x, y, s), g.grain);
      if (A[k]) { if (A[k] === 1 || thr < 0.5) { out[k] = g.acc; continue; } }
      const p = clamp(T[k], 0, 1) * (R - 1);
      const i = Math.min(R - 2, Math.floor(p)), fr = p - i;
      out[k] = fr > thr ? ramp[i + 1] : ramp[i];
    }
  }
  // filetto sottile attorno all'immagine
  for (let x = IX0 - 1; x <= IX1; x++) { out[(IY0 - 1) * W + x] = BLACK; out[IY1 * W + x] = BLACK; }
  for (let y = IY0 - 1; y <= IY1; y++) { out[y * W + IX0 - 1] = BLACK; out[y * W + IX1] = BLACK; }

  return { g: g, nuclei: nuclei };
}
function isHole(x, y) {
  const px = x + 0.5, py = y + 0.5;
  const edges = [[px - SX0, py, (SY1 - SY0)], [SX1 - px, py, (SY1 - SY0)], [py - SY0, px, (SX1 - SX0)], [SY1 - py, px, (SX1 - SX0)]];
  for (let i = 0; i < 4; i++) {
    const dEdge = edges[i][0]; if (dEdge > HOLE_R) continue;
    const along = edges[i][1] - (i < 2 ? SY0 : SX0);
    const len = edges[i][2], n = Math.round(len / PERF), step = len / n;
    const t = along / step, c = Math.round(t) * step;
    const dd = Math.hypot(along - c, dEdge);
    if (dd < HOLE_R) return true;
  }
  return false;
}

const API = { W, H, IX0, IX1, IY0, IY1, SX0, SX1, SY0, SY1, PAPER, BLACK, RED, YEL, BLU, GRN, INK_NAMES,
  emotionFromSensors, moodName, grammar, render, PALETTES, ARCHETYPES };
if (typeof module !== 'undefined') module.exports = API; else root.AtmosferaEngine = API;
})(this);
