/* =====================================================================
   ATMOSFERA — IL GUSTO DI CHI GUARDA
   Ogni francobollo nasce da un'emozione e da uno "stile" (22 geni, vedi
   il motore). Lo stile si impara dalle scelte:

   - proposta: lo stile che il gusto attuale prevede per questa emozione
   - "Un'altra": una variante, pescata attorno a quella previsione
   - "È questa": lo stile scelto attira il gusto verso di sé, quelli scartati
     lo spingono un po' via

   All'inizio le varianti sono molto diverse fra loro (esplorazione);
   più scelte fai, più si stringono attorno a ciò che ti somiglia.
   Il gusto è anche legato all'emozione: per la malinconia può preferire
   cose diverse che per l'allegria. Per questo ogni scelta resta in memoria
   insieme all'emozione in cui è stata fatta.

   Funzioni pure, testabili in Node.
   ===================================================================== */
(function (root) {
'use strict';
const E = typeof module !== 'undefined' ? require('../engine/atmosfera-engine.js') : root.AtmosferaEngine;
const NG = E.NGENES;
const KEYS = ['valenza', 'energia', 'tensione', 'intimita'];
const MAX_PICKS = 300;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function zeros() { return new Array(NG).fill(0); }
function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }
function emoVec(e) { return KEYS.map(k => (e && typeof e[k] === 'number') ? e[k] : 0.5); }

function newTaste() { return { v: 1, mean: zeros(), n: 0, picks: [] }; }
function sane(t) {
  if (!t || !Array.isArray(t.mean)) return newTaste();
  const m = zeros(); for (let i = 0; i < NG; i++) m[i] = clamp(+t.mean[i] || 0, -2.5, 2.5);
  return { v: 1, mean: m, n: Math.max(0, t.n | 0), picks: Array.isArray(t.picks) ? t.picks.filter(p => p && Array.isArray(p.genes) && Array.isArray(p.emo)).slice(-MAX_PICKS) : [] };
}

/* quanto esplorare: ampio all'inizio, stretto con l'esperienza */
function spread(t) { return Math.max(0.22, 1.1 / Math.sqrt(1 + t.n / 3)); }

/* lo stile previsto per un'emozione: gusto generale + scelte fatte in
   emozioni simili, pesate per somiglianza */
function predict(t, emo) {
  const ev = emoVec(emo), out = t.mean.slice();
  let wsum = 2;                                  // peso del gusto generale
  for (let i = 0; i < NG; i++) out[i] *= 2;
  for (const p of t.picks) {
    let d2 = 0; for (let k = 0; k < 4; k++) d2 += (p.emo[k] - ev[k]) * (p.emo[k] - ev[k]);
    const w = Math.exp(-d2 / 0.06);
    if (w < 0.02) continue;
    for (let i = 0; i < NG; i++) out[i] += w * (p.genes[i] || 0);
    wsum += w;
  }
  for (let i = 0; i < NG; i++) out[i] = clamp(out[i] / wsum, -2.5, 2.5);
  return out;
}

/* k = 0: la proposta (vicina alla previsione); k ≥ 1: le varianti */
function propose(t, emo, seed, k) {
  const base = predict(t, emo), r = rng((seed ^ Math.imul(k + 1, 0x9E3779B1)) >>> 0);
  const s = spread(t) * (k === 0 ? 0.35 : 1);
  const g = base.slice();
  for (let i = 0; i < NG; i++) {
    const extra = i < E.GENE_C ? 1.25 : 1;       // tavolozze e composizioni variano di più: si vede subito
    g[i] = clamp(base[i] + gauss(r) * s * extra, -2.5, 2.5);
  }
  return g.map(x => Math.round(x * 1000) / 1000);
}

/* impara da una scelta.
   chosen: geni scelti; rejected: geni delle varianti viste e scartate */
function learn(t0, emo, chosen, rejected, attempts) {
  const t = sane(t0);
  t.n += 1;
  const eta = Math.max(0.1, 0.45 / Math.sqrt(t.n));
  const R = (rejected || []).filter(g => Array.isArray(g));
  for (let i = 0; i < NG; i++) {
    let push = 0;
    if (R.length) { let avg = 0; for (const g of R) avg += g[i] || 0; avg /= R.length; push = 0.25 * ((chosen[i] || 0) - avg); }
    t.mean[i] = clamp(t.mean[i] + eta * ((chosen[i] || 0) - t.mean[i]) + eta * push, -2.5, 2.5);
  }
  t.picks.push({ emo: emoVec(emo).map(x => Math.round(x * 1000) / 1000), genes: chosen.slice(0, NG), attempts: Math.max(1, attempts | 0), t: Date.now() });
  if (t.picks.length > MAX_PICKS) t.picks = t.picks.slice(-MAX_PICKS);
  return t;
}

/* quanto ti conosce: tentativi medi prima di dire "è questa", all'inizio e ora */
function stats(t) {
  const a = t.picks.map(p => p.attempts);
  const avg = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  return { n: t.n, first: avg(a.slice(0, 5)), recent: avg(a.slice(-5)), spread: spread(t) };
}

/* il gusto a parole, per mostrarlo */
function describe(t) {
  if (!t.n) return [];
  const m = t.mean, out = [];
  const pal = E.PALETTES.map((p, i) => ({ id: p.id, v: m[E.GENE_PAL + i] })).sort((a, b) => b.v - a.v);
  const arch = E.ARCHETYPES.map((a, i) => ({ id: a, v: m[E.GENE_ARCH + i] })).sort((a, b) => b.v - a.v);
  if (pal[0].v > 0.15) out.push({ k: 'tavolozze', v: pal.filter(p => p.v > 0.15).slice(0, 3).map(p => p.id) });
  if (pal[pal.length - 1].v < -0.15) out.push({ k: 'eviti', v: pal.filter(p => p.v < -0.15).slice(-2).map(p => p.id) });
  if (arch[0].v > 0.15) out.push({ k: 'composizione', v: [arch[0].id] });
  const c = i => m[E.GENE_C + i];
  const words = [];
  if (c(0) > 0.25) words.push('molte linee'); else if (c(0) < -0.25) words.push('poche linee');
  if (c(1) > 0.25) words.push('grana vibrante'); else if (c(1) < -0.25) words.push('retino ordinato');
  if (c(2) > 0.25) words.push('fondi pieni'); else if (c(2) < -0.25) words.push('molta carta bianca');
  if (c(3) > 0.25) words.push('tanti accenti'); else if (c(3) < -0.25) words.push('pochi accenti');
  if (c(4) > 0.25) words.push('nuclei grandi'); else if (c(4) < -0.25) words.push('nuclei piccoli');
  if (c(5) > 0.25) words.push('flussi agitati'); else if (c(5) < -0.25) words.push('flussi distesi');
  if (c(6) > 0.25) words.push('fondi scuri'); else if (c(6) < -0.25) words.push('fondi chiari');
  if (c(7) > 0.25) words.push('campiture nette'); else if (c(7) < -0.25) words.push('sfumature');
  if (words.length) out.push({ k: 'segni', v: words });
  return out;
}

const API = { NG, newTaste, sane, spread, predict, propose, learn, stats, describe };
if (typeof module !== 'undefined') module.exports = API; else root.AtmosferaTaste = API;
})(this);
