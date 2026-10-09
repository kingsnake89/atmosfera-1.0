/* =====================================================================
   ATMOSFERA — COME TI SENTI
   La ghiera delle emozioni: dodici stati attorno a un cerchio.
   Destra = piacevole, sinistra = spiacevole; in alto = energia,
   in basso = quiete. Il centro è "non so"; più ti allontani dal centro,
   più l'emozione è intensa.

   Oltre a valenza ed energia, ogni stato porta con sé tensione,
   intimità e calore, così "rabbia" e "entusiasmo" (entrambi carichi)
   producono francobolli diversi.

   Le parole scritte a mano vengono lette con un piccolo lessico:
   propongono uno stato sulla ghiera, ma la scelta resta tua.
   Funzioni pure, testabili in Node.
   ===================================================================== */
(function (root) {
'use strict';
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// angolo in gradi, 0 = destra, antiorario
const FEELINGS = [
  { id: 'tenerezza',  label: 'Tenerezza',  a: 0,   v: .88, e: .45, t: .05, i: .95, c: .85 },
  { id: 'gioia',      label: 'Gioia',      a: 30,  v: .90, e: .70, t: .08, i: .40, c: .80 },
  { id: 'entusiasmo', label: 'Entusiasmo', a: 60,  v: .78, e: .90, t: .25, i: .25, c: .75 },
  { id: 'meraviglia', label: 'Meraviglia', a: 90,  v: .64, e: .95, t: .20, i: .20, c: .50 },
  { id: 'tensione',   label: 'Tensione',   a: 120, v: .35, e: .82, t: .85, i: .25, c: .45 },
  { id: 'rabbia',     label: 'Rabbia',     a: 150, v: .12, e: .88, t: .95, i: .15, c: .85 },
  { id: 'ansia',      label: 'Ansia',      a: 180, v: .15, e: .62, t: .80, i: .20, c: .30 },
  { id: 'tristezza',  label: 'Tristezza',  a: 210, v: .12, e: .30, t: .40, i: .45, c: .20 },
  { id: 'malinconia', label: 'Malinconia', a: 240, v: .30, e: .20, t: .20, i: .60, c: .30 },
  { id: 'stanchezza', label: 'Stanchezza', a: 270, v: .42, e: .06, t: .25, i: .35, c: .45 },
  { id: 'calma',      label: 'Calma',      a: 300, v: .70, e: .15, t: .05, i: .50, c: .45 },
  { id: 'serenita',   label: 'Serenità',   a: 330, v: .86, e: .30, t: .05, i: .45, c: .60 }
];
const NEUTRAL = { v: .5, e: .4, t: .3, i: .45, c: .5 };
const BYID = {}; FEELINGS.forEach(f => { BYID[f.id] = f; });

/* punto sulla ghiera → stato sentito.
   angle in gradi (0 = destra, antiorario), r fra 0 (centro) e 1 (bordo) */
function pick(angle, r) {
  const a = ((angle % 360) + 360) % 360, rr = clamp(r, 0, 1);
  const k = Math.floor(a / 30), f0 = FEELINGS[k], f1 = FEELINGS[(k + 1) % 12], u = (a - k * 30) / 30;
  const mix = key => f0[key] + (f1[key] - f0[key]) * u;
  const s = rr < 0.12 ? 0 : (rr - 0.12) / 0.88;          // zona centrale morta: "non so"
  const at = key => NEUTRAL[key] + s * (mix(key) - NEUTRAL[key]);
  const near = u < 0.5 ? f0 : f1;
  return {
    id: s === 0 ? null : near.id, label: s === 0 ? '' : near.label, angle: a, r: rr, intensity: s,
    word: s === 0 ? '' : (s < 0.4 ? 'lieve' : (s < 0.75 ? 'chiara' : 'forte')),
    vec: { valenza: at('v'), energia: at('e'), tensione: at('t'), intimita: at('i'), calore: at('c') }
  };
}
function pickById(id, intensity) { const f = BYID[id]; if (!f) return null; return pick(f.a, 0.12 + 0.88 * clamp(intensity == null ? 0.75 : intensity, 0, 1)); }

/* stato sentito + emozione letta dai dati.
   w = quanto conta ciò che senti (0..1). Ciò che senti decide la struttura
   (valenza, energia, tensione, intimità); l'ambiente tiene buona parte di
   luce (chiave) e colore (calore). */
function blend(base, felt, w) {
  if (!felt || !felt.id || !(w > 0)) return Object.assign({}, base);
  const f = felt.vec, ww = clamp(w, 0, 1);
  const L = (a, b, k) => clamp(a + (b - a) * k, 0, 1);
  return {
    valenza: L(base.valenza, f.valenza, ww),
    energia: L(base.energia, f.energia, ww),
    tensione: L(base.tensione, f.tensione, ww),
    intimita: L(base.intimita, f.intimita, ww),
    chiave: clamp(base.chiave + 0.3 * ww * (f.valenza - base.valenza), 0, 1),
    calore: L(base.calore, f.calore, 0.35 * ww)
  };
}

/* ---------- parole → stati ---------- */
const LEX = [
  ['tenerezza',  ['tener', 'amor', 'innamor', 'abbracc', 'coccol', 'affett', 'dolc', 'insieme', 'intim', 'baci']],
  ['gioia',      ['felic', 'content', 'gioi', 'allegr', 'ridere', 'risat', 'bell', 'feste', 'evviva', 'soddisf']],
  ['entusiasmo', ['entusias', 'caric', 'eccitat', 'gasat', 'energic', 'motivat', 'euforic']],
  ['meraviglia', ['meravigl', 'stupit', 'stupor', 'incant', 'sorpres', 'wow', 'magic', 'emozionat']],
  ['tensione',   ['=teso', '=tesa', '=tesi', 'tension', 'stress', 'nervos', 'pression', 'fretta', 'scadenz', 'concentrat', 'sotto press']],
  ['rabbia',     ['arrabb', 'rabbi', 'furios', 'incazz', 'irritat', 'frustrat', 'odio', 'nervi']],
  ['ansia',      ['ansi', 'paur', 'preoccup', 'agitat', 'insicur', 'spavent', 'panic', 'timor']],
  ['tristezza',  ['trist', 'piang', '=giu', 'abbattut', 'delus', 'dolor', 'solitud', '=sconfortato', 'sconfort', 'vuot', 'perso', 'lutto']],
  ['malinconia', ['malincon', 'nostalg', 'manc', 'ricord', 'pensier', 'autunn', 'rimpiant']],
  ['stanchezza', ['stanc', 'esaust', 'sonn', 'spossat', 'distrutt', 'svuotat', 'pigr', 'annoi', 'noia']],
  ['calma',      ['calm', 'tranquill', 'rilassat', 'pace', 'silenz', 'lent', 'riposat']],
  ['serenita',   ['seren', 'grat', 'leggero', 'leggera', 'libero', 'libera', 'equilibr', 'bene', 'fiduc']]
];
const NEG = { non: 1, niente: 1, senza: 1, mai: 1, nessun: 1, nessuna: 1, poco: 1 };
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s']/g, ' '); }
/* ritorna gli stati riconosciuti, dal più presente: [{id, label, score, words}] */
function fromText(text) {
  const toks = norm(text).split(/[\s']+/).filter(Boolean);
  const score = {}, words = {};
  toks.forEach((tok, i) => {
    if (tok.length < 3) return;
    const negated = NEG[toks[i - 1]] || NEG[toks[i - 2]];
    for (const [id, stems] of LEX) {
      if (stems.some(st => st[0] === '=' ? tok === st.slice(1) : tok.indexOf(st) === 0)) {
        if (negated) continue;
        score[id] = (score[id] || 0) + 1; (words[id] = words[id] || []).push(tok);
        break;
      }
    }
  });
  return Object.keys(score).sort((a, b) => score[b] - score[a]).map(id => ({ id, label: BYID[id].label, score: score[id], words: words[id] }));
}

const API = { FEELINGS, NEUTRAL, pick, pickById, blend, fromText };
if (typeof module !== 'undefined') module.exports = API; else root.AtmosferaFeel = API;
})(this);
