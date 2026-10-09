/* =====================================================================
   ATMOSFERA — APP v0.4
   Scatta:     1. il momento (solo sensori, oppure immagine + sensori)
               2. come ti senti (ghiera + parole tue)
               3. il francobollo: "Un'altra" finché non dici "È questa"
   Archivio:   tutto ciò che hai scelto, con dati, parole e immagine
   Laboratorio: pesi, sensori, vettore emotivo, gusto imparato, atlante
   ===================================================================== */
(function () {
'use strict';
const E = window.AtmosferaEngine, P = window.AtmosferaPhoto, A = window.AtmosferaAtmo;
const T = window.AtmosferaTaste, F = window.AtmosferaFeel, DB = window.AtmosferaDB, Z = window.AtmosferaZip;
const $ = id => document.getElementById(id);

/* colori di anteprima degli inchiostri (i pigmenti veri sono più spenti) */
const RGB = [[233,230,222],[35,37,42],[170,56,46],[222,186,56],[48,80,140],[62,108,74]];
/* codici a 4 bit del controller Spectra 6 (driver Waveshare/Good Display).
   DA VERIFICARE sul datasheet del pannello prima di usarli sull'hardware. */
const PANEL_CODE = [0x1, 0x0, 0x3, 0x2, 0x5, 0x6];
/* microfono del telefono: dBFS → dB SPL, da tarare con un fonometro */
const MIC_OFFSET_DB = 110;
const EXPORT_SCALE = 4;

const SCENES = [
  { n:'Colazione al sole',      at:[2026,9,4,8,12],   d:{lux:6000,kelvin:4800,db:42,temp:22,hum:50,co2:600} },
  { n:'Cena a lume di candela', at:[2026,9,3,21,40],  d:{lux:15,kelvin:2000,db:40,temp:22,hum:50,co2:1100} },
  { n:'Riunione lunga',         at:[2026,9,7,16,55],  d:{lux:450,kelvin:4600,db:52,temp:25.5,hum:33,co2:1900} },
  { n:'Concerto',               at:[2026,8,27,23,10], d:{lux:80,kelvin:3000,db:92,temp:28,hum:65,co2:2200} },
  { n:'Bosco dopo la pioggia',  at:[2026,9,5,17,30],  d:{lux:3000,kelvin:6200,db:33,temp:14,hum:92,co2:420} },
  { n:'Notte, tutti dormono',   at:[2026,9,1,2,14],   d:{lux:2,kelvin:2700,db:28,temp:19,hum:55,co2:900} },
  { n:'Spiaggia a mezzogiorno', at:[2026,7,18,12,30], d:{lux:60000,kelvin:5600,db:60,temp:33,hum:70,co2:420} },
  { n:'Metropolitana',          at:[2026,9,9,8,47],   d:{lux:300,kelvin:5000,db:85,temp:27,hum:60,co2:1800} }
];
const SENS = [
  { k:'lux',    l:'Luce',              min:0,    max:100,  step:1,   fmt:v=>Math.round(v).toLocaleString('it-IT')+' lux', toS:v=>Math.log10(Math.max(1,v))/Math.log10(60000)*100, fromS:s=>Math.round(Math.pow(10,s/100*Math.log10(60000))), photo:true },
  { k:'kelvin', l:'Colore della luce', min:1800, max:7000, step:50,  fmt:v=>Math.round(v).toLocaleString('it-IT')+' K', photo:true },
  { k:'db',     l:'Rumore',            min:25,   max:95,   step:1,   fmt:v=>Math.round(v)+' dB' },
  { k:'temp',   l:'Temperatura',       min:-5,   max:40,   step:0.5, fmt:v=>(+v).toLocaleString('it-IT',{maximumFractionDigits:1})+' °C' },
  { k:'hum',    l:'Umidità',           min:10,   max:98,   step:1,   fmt:v=>Math.round(v)+' %' },
  { k:'co2',    l:'CO₂',               min:400,  max:2500, step:10,  fmt:v=>Math.round(v).toLocaleString('it-IT')+' ppm' }
];
const EMO = [
  { k:'valenza',  l:'Valenza',  m:'Piacevole o spiacevole. Sceglie la tavolozza e quanto è carico il fondo.' },
  { k:'energia',  l:'Energia',  m:'Quiete o agitazione. Più linee, più turbolenza, retino più granuloso.' },
  { k:'tensione', l:'Tensione', m:'Le linee puntano al centro, i nodi si stringono, compaiono schegge.' },
  { k:'intimita', l:'Intimità', m:'Un solo nucleo grande, anelli che pulsano, accenti vicini.' },
  { k:'chiave',   l:'Chiave',   m:'Luminosità d’insieme. In basso il fondo diventa scuro.' },
  { k:'calore',   l:'Calore',   m:'Tavolozza verso rossi e gialli o verso blu e verdi.' }
];
const ARCH_TXT = { nucleo:'un nucleo grande al centro', costellazione:'più nuclei piccoli e lontani', orizzonte:'fasce ondulate con un nucleo sull’orizzonte', deriva:'flusso fitto con un nucleo spostato di lato' };
const PAL_TXT = { sole:'Sole', lume:'Lume', prato:'Prato', lago:'Lago', 'mezzodì':'Mezzodì', brace:'Brace', temporale:'Temporale', ghiaccio:'Ghiaccio', notte:'Notte', cenere:'Cenere' };
const MODE_TXT = { sens:'solo sensori', foto:'immagine + sensori', sim:'scena simulata', none:'solo come ti senti', mano:'taratura a mano' };
const FEEL_INK = { tenerezza:'--i-red', gioia:'--i-yel', entusiasmo:'--i-yel', meraviglia:'--i-yel', tensione:'--i-red', rabbia:'--i-red', ansia:'--i-blk', tristezza:'--i-blu', malinconia:'--i-blu', stanchezza:'--i-blk', calma:'--i-grn', serenita:'--i-grn' };

/* ---------- stato ---------- */
let prefs = {};
try { prefs = JSON.parse(localStorage.getItem('atmosfera.prefs.v1') || '{}') || {}; } catch (e) { prefs = {}; }
const S = {
  tab: 'scatta', mode: 'sens',
  sim: null, now: null, nowBusy: false, noneAt: new Date(),
  photo: null, photoCtx: null, photoBusy: false,
  edits: { sim: {}, now: {}, photo: {} },
  felt: null, feltSource: null, text: '',
  wFelt: typeof prefs.wFelt === 'number' ? prefs.wFelt : 0.75,
  peso: typeof prefs.peso === 'number' ? prefs.peso : 0.35,
  tune: false, hand: null,
  taste: T.newTaste(),
  sess: null, shareBlob: null,
  records: [], openId: null, filter: null, detailBlob: null, zipBlob: null
};
function savePrefs() { try { localStorage.setItem('atmosfera.prefs.v1', JSON.stringify({ wFelt: S.wFelt, peso: S.peso })); } catch (e) {} }

/* ---------- utilità ---------- */
const buf = new Uint8Array(E.W * E.H);
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function moodText(e) { const m = E.moodName(e); return cap(m.name) + (m.adj ? ', ' + m.adj : ''); }
function fmtDate(d, off) {
  if (!d) return '';
  const o = { weekday: 'short', day: 'numeric', month: 'short' }, to = { hour: '2-digit', minute: '2-digit' };
  let dd = d;
  if (typeof off === 'number') { dd = new Date(d.getTime() + off * 1000); o.timeZone = 'UTC'; to.timeZone = 'UTC'; }
  return dd.toLocaleDateString('it-IT', o).replace(/\./g, '') + ' · ' + dd.toLocaleTimeString('it-IT', to);
}
function fmtLong(d, off) {
  let dd = d; const o = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  if (typeof off === 'number') { dd = new Date(d.getTime() + off * 1000); o.timeZone = 'UTC'; }
  return dd.toLocaleString('it-IT', o);
}
function num(v, d) { return (+v).toLocaleString('it-IT', { maximumFractionDigits: d === undefined ? 2 : d, minimumFractionDigits: d === undefined ? 2 : 0 }); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hashSeed(parts) { let h = 0x811C9DC5; for (const p of parts) { h ^= p | 0; h = Math.imul(h, 0x01000193); h ^= h >>> 13; } return h >>> 0; }
function reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
function status(id, msg, ms) { const el = $(id); el.textContent = msg; clearTimeout(el._t); if (ms !== 0) el._t = setTimeout(() => { el.textContent = ''; }, ms || 5000); }
function slug(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'momento'; }
function feelVecKey(e) { return ['valenza', 'energia', 'tensione', 'intimita', 'chiave', 'calore'].map(k => e[k].toFixed(2)).join(','); }

/* =====================================================================
   IL MOMENTO
   ===================================================================== */
function simCtx(i) {
  const s = SCENES[i], a = s.at;
  const src = {}; Object.keys(s.d).forEach(k => { src[k] = 'scena simulata'; });
  return { kind: 'sim', vals: Object.assign({ aqi: null }, s.d), src: src, abs: new Date(a[0], a[1], a[2], a[3], a[4]), offset: null, place: '', meteo: null, notes: [] };
}
function noneCtx() {
  const src = {}; Object.keys(A.DEFAULTS).forEach(k => { src[k] = 'predefinito'; });
  return { kind: 'none', vals: Object.assign({}, A.DEFAULTS), src: src, abs: S.noneAt, offset: null, place: '', meteo: null, notes: [] };
}
function ctxKey() { return S.mode === 'foto' ? 'photo' : (S.sim !== null ? 'sim' : 'now'); }
function activeCtx() {
  if (S.mode === 'foto') return S.photoCtx;
  if (S.sim !== null) return simCtx(S.sim);
  return S.now || noneCtx();
}
function effective() {
  const c = activeCtx(); if (!c) return null;
  const ed = S.edits[ctxKey()];
  const vals = Object.assign({}, c.vals), src = Object.assign({}, c.src);
  Object.keys(ed).forEach(k => { vals[k] = ed[k].v; src[k] = ed[k].src; });
  if (S.mode === 'foto' && S.photo) {
    vals.lux = S.photo.lux; src.lux = S.photo.luxSrc === 'exif' ? 'foto, EXIF' : 'foto, stima';
    vals.kelvin = S.photo.a.kelvin; src.kelvin = 'foto';
  }
  return { c: c, vals: vals, src: src };
}

/* lo scatto in corso: emozioni, seme di base, data, luogo */
function moment() {
  if (S.mode === 'foto') {
    if (!S.photo) return { ready: false, msg: 'Scegli o scatta una foto per cominciare.' };
    if (!S.photoCtx) return { ready: false, msg: 'Sto leggendo i dati del luogo e del momento della foto…' };
  }
  const ef = effective(), c = ef.c;
  if (c.kind === 'none' && !S.felt && !Object.keys(S.edits.now).length) {
    return { ready: false, msg: S.nowBusy ? 'Sto raccogliendo i dati di dove sei…' : 'Premi “Rileva qui e ora”, oppure scegli come ti senti sulla ghiera.' };
  }
  let sensEmo = E.emotionFromSensors(ef.vals), base = sensEmo, seed;
  if (S.mode === 'foto') { base = P.blendEmotion(sensEmo, S.photo.a, S.peso); seed = S.photo.a.seed; }
  else if (c.kind === 'sim') seed = ((S.sim + 1) * 7919 + 12345) >>> 0;
  else if (c.kind === 'none') seed = hashSeed([Math.floor(S.noneAt.getTime() / 60000)]);
  else seed = hashSeed([Math.round(c.lat * 1000), Math.round(c.lon * 1000), Math.floor(c.abs.getTime() / 60000)]);
  let emo = F.blend(base, S.felt, S.wFelt), tuned = false;
  if (S.tune && S.hand) { emo = Object.assign({}, S.hand); tuned = true; }
  return { ready: true, ef: ef, c: c, kind: S.mode === 'foto' ? 'foto' : c.kind === 'now' ? 'sens' : c.kind,
           sensEmo: sensEmo, base: base, emo: emo, tuned: tuned, seed: seed >>> 0, date: c.abs, offset: c.offset, place: c.place || '' };
}

/* sessione di varianti: si azzera quando cambiano il momento o ciò che senti */
function session(m) {
  const key = m.seed + '|' + feelVecKey(m.emo);
  if (!S.sess || S.sess.key !== key) {
    S.sess = { key: key, seed: m.seed, emo: m.emo, idx: 0, saved: {}, variants: [{ seed: m.seed, genes: T.propose(S.taste, m.emo, m.seed, 0), canvas: null }] };
    S.shareBlob = null;
  }
  return S.sess;
}
function current() { const m = moment(); if (!m.ready) return { m: m }; const s = session(m); return { m: m, s: s, v: s.variants[s.idx] }; }

/* =====================================================================
   DISEGNO
   ===================================================================== */
const tc = document.createElement('canvas'); tc.width = E.W; tc.height = E.H;
const tctx = tc.getContext('2d', { willReadFrequently: true });
function fitText(s, max) { if (tctx.measureText(s).width <= max) return s; while (s.length > 2 && tctx.measureText(s + '…').width > max) s = s.slice(0, -1); return s.trimEnd() + '…'; }
function caption(out, line1, line2) {   // sul dispositivo sarà un font bitmap; qui testo vero portato a 1 bit
  tctx.clearRect(0, 0, E.W, E.H);
  tctx.fillStyle = '#000';
  tctx.font = 'italic 14px Spectral, Georgia, serif';
  tctx.fillText(fitText(line1, 210), 15, 207);
  tctx.font = '600 9px "Instrument Sans", system-ui, sans-serif';
  tctx.fillText(fitText(line2.toUpperCase(), 210), 15, 224);
  const d = tctx.getImageData(0, 190, E.W, 50).data;
  for (let y = 0; y < 50; y++) for (let x = 0; x < E.W; x++) if (d[(y * E.W + x) * 4 + 3] > 120) out[(y + 190) * E.W + x] = E.BLACK;
}
function paint(canvas, out) {
  const c = canvas.getContext('2d'), id = c.createImageData(E.W, E.H), p = id.data;
  for (let i = 0; i < out.length; i++) { const q = RGB[out[i]]; p[i * 4] = q[0]; p[i * 4 + 1] = q[1]; p[i * 4 + 2] = q[2]; p[i * 4 + 3] = 255; }
  c.putImageData(id, 0, 0);
}
function captionFor(m) {
  const t = S.text.trim();
  const l1 = t ? '“' + t.replace(/\s+/g, ' ') + '”' : (S.felt && S.felt.id ? S.felt.label.toLowerCase() : moodText(m.emo).toLowerCase());
  const place = m.place ? ' · ' + m.place.split(',').pop().trim() : '';
  return [l1, fmtDate(m.date, m.offset) + place];
}
function renderStamp(m, v, out, withCaption) {
  const res = E.render(m.emo, v.seed, out, v.genes);
  if (withCaption) { const l = captionFor(m); caption(out, l[0], l[1]); }
  return res;
}

/* =====================================================================
   SCHEDE
   ===================================================================== */
const TABS = ['scatta', 'archivio', 'lab'];
function setTab(t, noHash) {
  S.tab = t;
  TABS.forEach(k => { $('tab_' + k).setAttribute('aria-selected', String(k === t)); $('p_' + k).hidden = k !== t; });
  if (!noHash) try { history.replaceState(null, '', '#' + t); } catch (e) {}
  if (t === 'archivio') renderArchive();
  if (t === 'lab') { syncLab(); scheduleSlow(true); }
  if (t === 'scatta') update(false);
}
TABS.forEach(k => { $('tab_' + k).onclick = () => setTab(k); });
$('tab_scatta').parentElement.addEventListener('keydown', e => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = TABS.indexOf(S.tab), n = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
  setTab(TABS[n]); $('tab_' + TABS[n]).focus();
});

/* =====================================================================
   1. IL MOMENTO
   ===================================================================== */
function setMode(m) {
  S.mode = m;
  ['sens', 'foto'].forEach(k => $('m_' + k).setAttribute('aria-pressed', String(k === m)));
  document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = el.dataset.modes.split(' ').indexOf(m) < 0; });
  refreshMoment(); update(true);
}
$('m_sens').onclick = () => setMode('sens');
$('m_foto').onclick = () => setMode('foto');
$('simOff').onclick = () => { S.sim = null; refreshMoment(); update(true); };

function getPosition() {
  return new Promise((res, rej) => {
    if (!window.isSecureContext) return rej(new Error('La posizione funziona solo su https (su Vercel va bene).'));
    if (!navigator.geolocation) return rej(new Error('Questo browser non fornisce la posizione.'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      e => rej(new Error(e.code === 1 ? 'Permesso di posizione negato: puoi concederlo dalle impostazioni del browser per questo sito.' : 'Non riesco a ottenere la posizione. Riprova con la rete attiva.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  });
}
function ctxStatus(id, msg, isErr) { const el = $(id); el.textContent = msg; el.classList.toggle('err', !!isErr); }
$('locate').onclick = async () => {
  if (S.nowBusy) return;
  S.nowBusy = true; $('locate').disabled = true; ctxStatus('nowStatus', 'Chiedo la posizione al dispositivo…');
  update(false);
  try {
    const pos = await getPosition();
    const c = await A.collect({ lat: pos.lat, lon: pos.lon, onStep: m => ctxStatus('nowStatus', m) });
    c.kind = 'now'; c.acc = pos.acc;
    S.now = c; S.edits.now = {}; S.sim = null;
    ctxStatus('nowStatus', c.notes.length ? 'Fatto, con qualche lacuna: ' + c.notes.join('; ') + '.' : '');
  } catch (err) { ctxStatus('nowStatus', err.message, true); }
  finally {
    S.nowBusy = false; $('locate').disabled = false; $('locate').textContent = S.now ? 'Rileva di nuovo' : 'Rileva qui e ora';
    refreshMoment(); update(true);
  }
};
$('listen').onclick = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status('status', 'Questo browser non dà accesso al microfono.'); return; }
  let stream = null, ac = null;
  try {
    $('listen').disabled = true; $('listen').textContent = 'Ascolto…';
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 2048; src.connect(an);
    const data = new Float32Array(an.fftSize); let sum = 0, n = 0; const t0 = performance.now();
    await new Promise(res => { const iv = setInterval(() => {
      an.getFloatTimeDomainData(data); let s = 0; for (let i = 0; i < data.length; i++) s += data[i] * data[i];
      sum += s / data.length; n++;
      if (performance.now() - t0 > 3000) { clearInterval(iv); res(); }
    }, 50); });
    const db = Math.round(Math.max(25, Math.min(95, 10 * Math.log10(Math.max(1e-12, sum / Math.max(1, n))) + MIC_OFFSET_DB)));
    S.edits[ctxKey()].db = { v: db, src: 'microfono' };
    ctxStatus('nowStatus', 'Rumore misurato: ' + db + ' dB (taratura approssimativa).');
    refreshMoment(); update(false);
  } catch (err) { ctxStatus('nowStatus', err && err.name === 'NotAllowedError' ? 'Permesso del microfono negato.' : 'Non riesco a usare il microfono.', true); }
  finally {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (ac) ac.close();
    $('listen').disabled = false; $('listen').textContent = 'Ascolta 3 secondi';
  }
};

/* foto */
async function loadPhoto(file) {
  $('photoErr').hidden = true;
  if (!file) return;
  try {
    const ab = await file.arrayBuffer();
    let exif = null; try { exif = P.parseExif(ab); } catch (e) { exif = null; }
    const bmp = await decode(file);
    const sc = Math.min(1, 200 / Math.max(bmp.width, bmp.height));
    const w = Math.max(8, Math.round(bmp.width * sc)), h = Math.max(8, Math.round(bmp.height * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0, w, h);
    const a = P.analyzePixels(ctx.getImageData(0, 0, w, h).data, w, h);
    const fromExif = P.luxFromExif(exif);
    const tw = 120, th = Math.round(tw * h / w), t = document.createElement('canvas'); t.width = tw; t.height = th;
    t.getContext('2d').drawImage(bmp, 0, 0, tw, th);
    if (S.photo && S.photo.url) URL.revokeObjectURL(S.photo.url);
    const naive = exif && P.exifNaive(exif.date), fd = new Date(file.lastModified || Date.now());
    S.photo = {
      a: a, exif: exif, lux: fromExif ? Math.round(fromExif.lux) : P.luxGuess(a.brightness), luxSrc: fromExif ? 'exif' : 'stima', ev: fromExif ? fromExif.ev : null,
      naive: naive || { y: fd.getFullYear(), m: fd.getMonth() + 1, d: fd.getDate(), h: fd.getHours(), mi: fd.getMinutes() }, dateSrc: naive ? 'exif' : 'file',
      gps: exif && typeof exif.lat === 'number' ? { lat: exif.lat, lon: exif.lon } : null,
      url: URL.createObjectURL(file), thumb: t.toDataURL('image/jpeg', 0.72)
    };
    S.photoCtx = null; S.edits.photo = {};
    showPhoto(); refreshMoment(); update(true);
    fetchPhotoCtx();
  } catch (err) {
    $('photoErr').textContent = 'Non riesco ad aprire questa immagine. Se è una foto HEIC dell’iPhone, esportala in JPEG oppure scattala direttamente da qui.';
    $('photoErr').hidden = false;
  }
}
async function fetchPhotoCtx() {
  const ph = S.photo; if (!ph) return;
  S.photoBusy = true;
  let pos = ph.gps;
  try {
    if (!pos) { ctxStatus('photoStatus', 'La foto non ha la posizione: chiedo quella del dispositivo…'); pos = await getPosition(); }
    const n = ph.naive, then = new Date(n.y, n.m - 1, n.d, n.h, n.mi);
    const recent = Math.abs(Date.now() - then.getTime()) < 90 * 60000;
    const c = await A.collect({ lat: pos.lat, lon: pos.lon, naive: recent ? null : n, onStep: m => ctxStatus('photoStatus', m) });
    if (S.photo !== ph) return;
    c.kind = 'photo';
    if (recent) c.abs = new Date(Date.UTC(n.y, n.m - 1, n.d, n.h, n.mi) - c.offset * 1000);
    S.photoCtx = c;
    ctxStatus('photoStatus', (ph.gps ? '' : 'Posizione del dispositivo: la foto non aveva il GPS. ') + (c.notes.length ? 'Qualche lacuna: ' + c.notes.join('; ') + '.' : ''));
  } catch (err) {
    if (S.photo !== ph) return;
    const src = {}; Object.keys(A.DEFAULTS).forEach(k => { src[k] = 'predefinito'; });
    const n = ph.naive;
    S.photoCtx = { kind: 'photo', vals: Object.assign({}, A.DEFAULTS), src: src, abs: new Date(n.y, n.m - 1, n.d, n.h, n.mi), offset: null, place: '', meteo: null, notes: [] };
    ctxStatus('photoStatus', err.message + ' Uso valori predefiniti: puoi correggerli nel Laboratorio.', true);
  } finally {
    if (S.photo === ph) { S.photoBusy = false; refreshMoment(); update(true); }
  }
}
function decode(file) {
  if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => decodeImg(file));
  return decodeImg(file);
}
function decodeImg(file) {
  return new Promise((res, rej) => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { URL.revokeObjectURL(u); res(img); }; img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); }; img.src = u; });
}
function showPhoto() {
  const p = S.photo; if (!p) return;
  $('photoBox').hidden = false; $('photoImg').src = p.url;
  const n = p.naive, two = x => (x < 10 ? '0' : '') + x;
  const rows = [
    ['Scattata', n.d + '/' + n.m + '/' + n.y + ' · ' + two(n.h) + ':' + two(n.mi) + (p.dateSrc === 'exif' ? '' : '<span class="tag warn">data del file</span>')],
    ['Posizione', p.gps ? 'dal GPS della foto' : '<span class="tag warn">assente</span>'],
    ['Luce', num(p.lux, 0) + ' lux' + (p.luxSrc === 'exif' ? '<span class="tag">EXIF</span>' : '<span class="tag warn">stima</span>')],
    ['Colore luce', num(p.a.kelvin, 0) + ' K']
  ];
  $('reads').innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
}
$('file').addEventListener('change', e => { loadPhoto(e.target.files[0]); e.target.value = ''; });
const drop = $('drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadPhoto(f); });

/* riepilogo compatto del momento */
function refreshMoment() {
  $('simNote').hidden = !(S.mode === 'sens' && S.sim !== null);
  if (S.sim !== null) $('simName').textContent = 'Scena simulata: ' + SCENES[S.sim].n + '.';
  const c = activeCtx();
  const facts = [];
  if (c && c.kind !== 'none' && !(S.mode === 'foto' && S.photoBusy)) {
    const ef = effective(), v = ef.vals, m = c.meteo || {};
    if (c.place) facts.push(['place', esc(c.place)]);
    if (c.kind !== 'sim') facts.push(['', fmtDate(c.abs, c.offset)]);
    if (m.code != null) facts.push(['', A.weatherText(m.code) + (m.elev != null && m.elev < -6 ? ', notte' : '')]);
    facts.push(['', '<b>' + num(v.temp, 1) + ' °C</b>']);
    facts.push(['', 'umidità ' + Math.round(v.hum) + ' %']);
    facts.push(['', 'luce ' + Math.round(v.lux).toLocaleString('it-IT') + ' lux']);
    facts.push(['', Math.round(v.db) + ' dB' + (ef.src.db === 'microfono' ? ' misurati' : (ef.src.db && ef.src.db.indexOf('stima') === 0 ? ' stimati' : ''))]);
    if (m.aqi != null) facts.push(['', 'aria ' + A.aqiText(m.aqi)]);
    else facts.push(['', 'CO₂ ' + Math.round(v.co2) + ' ppm']);
  }
  $('facts').innerHTML = facts.map(f => '<li' + (f[0] ? ' class="' + f[0] + '"' : '') + '>' + f[1] + '</li>').join('');
  if (S.tab === 'lab') syncLab();
}

/* =====================================================================
   2. COME TI SENTI: la ghiera
   ===================================================================== */
const WC = 160, WR = 150, NS = 'http://www.w3.org/2000/svg';
function polar(a, r) { const t = a * Math.PI / 180; return [WC + r * Math.cos(t), WC - r * Math.sin(t)]; }
function wedge(a0, a1, r0, r1) {
  const p = (a, r) => polar(a, r).map(x => x.toFixed(2)).join(' ');
  return 'M' + p(a0, r0) + 'L' + p(a0, r1) + 'A' + r1 + ' ' + r1 + ' 0 0 0 ' + p(a1, r1) + 'L' + p(a1, r0) + 'A' + r0 + ' ' + r0 + ' 0 0 1 ' + p(a0, r0) + 'Z';
}
const wheelEl = $('wheel');
(function buildWheel() {
  const css = getComputedStyle(document.documentElement);
  let s = '<svg viewBox="0 0 320 320" aria-hidden="true">';
  const rings = [[26, 68, .16], [68, 110, .30], [110, 150, .48]];
  F.FEELINGS.forEach(f => {
    const col = css.getPropertyValue(FEEL_INK[f.id]).trim() || '#888';
    rings.forEach(r => { s += '<path d="' + wedge(f.a - 15, f.a + 15, r[0], r[1]) + '" fill="' + col + '" fill-opacity="' + r[2] + '"/>'; });
  });
  s += '<circle class="ring" cx="160" cy="160" r="68"/><circle class="ring" cx="160" cy="160" r="110"/>';
  s += '<line class="needle" id="wNeedle" x1="160" y1="160" x2="160" y2="160" visibility="hidden"/><circle class="knob" id="wKnob" cx="160" cy="160" r="7" visibility="hidden"/>';
  s += '<circle class="center" cx="160" cy="160" r="26"/><text class="ctext" x="160" y="161" text-anchor="middle" dominant-baseline="middle">non so</text>';
  F.FEELINGS.forEach(f => { const p = polar(f.a, 129); s += '<text class="lbl" data-id="' + f.id + '" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="middle">' + f.label + '</text>'; });
  wheelEl.innerHTML = s + '</svg>';
})();
function drawWheel() {
  const f = S.felt, knob = $('wKnob'), nd = $('wNeedle');
  wheelEl.querySelectorAll('.lbl').forEach(t => t.classList.toggle('on', !!(f && f.id === t.dataset.id)));
  if (f && f.id) {
    const p = polar(f.angle, Math.max(30, f.r * WR)), p0 = polar(f.angle, 26);
    knob.setAttribute('cx', p[0]); knob.setAttribute('cy', p[1]); nd.setAttribute('x1', p0[0]); nd.setAttribute('y1', p0[1]); nd.setAttribute('x2', p[0]); nd.setAttribute('y2', p[1]);
    knob.setAttribute('visibility', 'visible'); nd.setAttribute('visibility', 'visible');
    $('feltNow').innerHTML = esc(f.label) + '<small>' + f.word + '</small>';
    wheelEl.setAttribute('aria-valuenow', String(Math.round(f.intensity * 100)));
    wheelEl.setAttribute('aria-valuetext', f.label + ', ' + f.word);
  } else {
    knob.setAttribute('visibility', 'hidden'); nd.setAttribute('visibility', 'hidden');
    $('feltNow').textContent = '';
    wheelEl.setAttribute('aria-valuenow', '0'); wheelEl.setAttribute('aria-valuetext', 'nessuna emozione scelta');
  }
  $('feltClear').hidden = !(f && f.id);
}
function setFelt(f, source) { S.felt = f && f.id ? f : null; S.feltSource = S.felt ? source : null; drawWheel(); update(true); }
let dragging = false;
function wheelAt(ev, start) {
  const r = wheelEl.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width * 320, y = (ev.clientY - r.top) / r.height * 320;
  const d = Math.hypot(x - WC, y - WC) / WR;
  if (start && d > 1.08) return false;
  const a = Math.atan2(WC - y, x - WC) * 180 / Math.PI;
  setFelt(F.pick(a, Math.min(1, d)), 'wheel');
  return true;
}
wheelEl.addEventListener('pointerdown', e => { if (wheelAt(e, true)) { dragging = true; wheelEl.setPointerCapture(e.pointerId); e.preventDefault(); } });
wheelEl.addEventListener('pointermove', e => { if (dragging) wheelAt(e, false); });
['pointerup', 'pointercancel'].forEach(t => wheelEl.addEventListener(t, () => { dragging = false; }));
wheelEl.addEventListener('keydown', e => {
  const f = S.felt;
  let a = f ? f.angle : 30, r = f ? f.r : 0.75;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { a = f ? Math.round(a / 30) * 30 + (e.key === 'ArrowLeft' ? 30 : -30) : 30; }
  else if (e.key === 'ArrowUp') r = Math.min(1, (f ? r : 0.6) + 0.12);
  else if (e.key === 'ArrowDown') r = Math.max(0.2, r - 0.12);
  else if (e.key === 'Escape' || e.key === 'Delete' || e.key === 'Backspace') { setFelt(null); e.preventDefault(); return; }
  else return;
  e.preventDefault(); setFelt(F.pick(a, r), 'wheel');
});
$('feltClear').onclick = () => setFelt(null);

/* parole tue */
let textT = 0;
$('feelText').addEventListener('input', () => {
  S.text = $('feelText').value;
  clearTimeout(textT);
  textT = setTimeout(() => {
    const sug = F.fromText(S.text).slice(0, 3);
    if (sug.length && S.feltSource !== 'wheel') { S.felt = F.pickById(sug[0].id, 0.7); S.feltSource = 'text'; drawWheel(); }
    renderSuggest(sug);
    update(false);
  }, 350);
});
function renderSuggest(sug) {
  const box = $('suggest');
  if (!sug.length) { box.innerHTML = S.text.trim() ? '<span>Le tue parole finiranno sul francobollo e nell’archivio.</span>' : ''; return; }
  box.innerHTML = '<span>Ci leggo:</span>';
  sug.forEach(s => {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = s.label;
    b.setAttribute('aria-pressed', String(!!(S.felt && S.felt.id === s.id)));
    b.title = 'Dalle parole: ' + s.words.join(', ');
    b.onclick = () => { setFelt(F.pickById(s.id, 0.75), 'text'); renderSuggest(sug); };
    box.appendChild(b);
  });
}

/* =====================================================================
   3. IL FRANCOBOLLO: varianti e scelta
   ===================================================================== */
let raf = 0;
function update(full) {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const cur = current(), m = cur.m;
    $('emptyMsg').hidden = m.ready; if (!m.ready) $('emptyMsg').textContent = m.msg;
    $('another').disabled = !m.ready; $('thisone').disabled = !m.ready;
    if (!m.ready) {
      $('mood').innerHTML = '';
      $('variantsBox').hidden = true; $('savedBar').hidden = true;
      renderTuneLine(); if (S.tab === 'lab') syncLab();
      paintDock(m, null);
      return;
    }
    const s = cur.s, v = cur.v;
    renderStamp(m, v, buf, true); paint($('eink'), buf);
    const how = m.tuned ? 'taratura a mano' : (m.kind === 'none' ? 'solo come ti senti, senza dati del luogo' : (S.felt ? 'come ti senti + ' + MODE_TXT[m.kind] : 'letto da ' + MODE_TXT[m.kind]));
    $('mood').innerHTML = esc(S.felt ? S.felt.label + ' ' + S.felt.word : moodText(m.emo)) + '<small>' + esc(how) + '</small>';
    $('thisone').textContent = s.saved[s.idx] ? 'Salvata ✓' : 'È questa';
    $('thisone').disabled = !!s.saved[s.idx];
    $('savedBar').hidden = !s.saved[s.idx];
    renderVariants(s, m);
    renderTuneLine();
    paintDock(m, s);
    if (S.tab === 'lab') { syncLab(); scheduleSlow(full); }
  });
}
function renderVariants(s, m) {
  $('variantsBox').hidden = s.variants.length < 2;
  if (s.variants.length < 2) return;
  $('varCount').textContent = '(' + s.variants.length + ')';
  const strip = $('vstrip');
  if (strip.dataset.key !== s.key) { strip.innerHTML = ''; strip.dataset.key = s.key; }
  s.variants.forEach((v, i) => {
    let b = strip.children[i];
    if (!b) {
      b = document.createElement('button'); b.className = 'vthumb'; b.type = 'button';
      b.setAttribute('aria-label', 'Variante ' + (i + 1));
      const c = document.createElement('canvas'); c.width = E.W; c.height = E.H; b.appendChild(c);
      const tmp = new Uint8Array(E.W * E.H); E.render(m.emo, v.seed, tmp, v.genes); paint(c, tmp);
      b.onclick = () => { s.idx = i; S.shareBlob = null; update(false); };
      strip.appendChild(b);
    }
    b.setAttribute('aria-current', String(i === s.idx));
    let mark = b.querySelector('.saved');
    if (s.saved[i] && !mark) { mark = document.createElement('span'); mark.className = 'saved'; mark.textContent = '✓'; b.appendChild(mark); }
  });
  const cur = strip.children[s.idx];   // scorre solo la striscia, non la pagina
  if (cur) { const l = cur.offsetLeft - strip.offsetLeft, r = l + cur.offsetWidth; if (l < strip.scrollLeft) strip.scrollLeft = l - 4; else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 4; }
}
$('another').onclick = () => {
  const cur = current(); if (!cur.m.ready) return;
  const s = cur.s, k = s.variants.length;
  s.variants.push({ seed: (s.seed + k * 104729) >>> 0, genes: T.propose(S.taste, cur.m.emo, s.seed, k) });
  s.idx = k; S.shareBlob = null; update(true);
};
$('thisone').onclick = async () => {
  const cur = current(); if (!cur.m.ready || cur.s.saved[cur.s.idx]) return;
  const m = cur.m, s = cur.s, v = cur.v;
  $('thisone').disabled = true;
  try {
    const rejected = s.variants.filter((_, i) => i !== s.idx && !s.saved[i]).map(x => x.genes);
    S.taste = T.learn(S.taste, m.emo, v.genes, rejected, s.variants.length);
    const out = new Uint8Array(E.W * E.H), res = renderStamp(m, v, out, true);
    const c = document.createElement('canvas'); c.width = E.W; c.height = E.H; paint(c, out);
    const png = await canvasBlob(c);
    const ef = m.ef, cx = m.c;
    const rec = {
      id: Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), v: 3,
      date: m.date.toISOString(), offset: m.offset, createdAt: new Date().toISOString(),
      place: m.place, pos: typeof cx.lat === 'number' ? { lat: +cx.lat.toFixed(3), lon: +cx.lon.toFixed(3) } : null,
      mode: m.kind, scene: cx.kind === 'sim' ? SCENES[S.sim].n : null,
      sens: ef.vals, src: ef.src, meteo: cx.meteo ? { code: cx.meteo.code, cloud: cx.meteo.cloud, aqi: cx.meteo.aqi, elev: cx.meteo.elev } : null,
      felt: S.felt ? { id: S.felt.id, label: S.felt.label, word: S.felt.word, intensity: +S.felt.intensity.toFixed(2), angle: Math.round(S.felt.angle), r: +S.felt.r.toFixed(2), source: S.feltSource } : null,
      text: S.text.trim(), mood: moodText(m.emo), emoSensors: m.sensEmo, emo: m.emo, tuned: m.tuned, wFelt: S.wFelt,
      seed: v.seed, genes: v.genes, attempts: s.variants.length, variant: s.idx + 1,
      palette: res.g.palette, archetype: res.g.archeName,
      photo: m.kind === 'foto' ? { thumb: S.photo.thumb, lux: S.photo.lux, luxSrc: S.photo.luxSrc, a: S.photo.a, peso: S.peso } : null,
      png: png
    };
    await DB.put(rec);
    await DB.setMeta('taste', S.taste);
    S.records.unshift(rec); S.zipBlob = null;
    s.saved[s.idx] = rec.id;
    if (S.records.length === 1) DB.persist();
    S.shareBlob = await upscale(png);
    status('status', 'Salvata. Atmosfera ha imparato qualcosa del tuo gusto.');
    updateCount(); update(false);
  } catch (err) {
    status('status', 'Non riesco a salvare: ' + (err && err.message ? err.message : 'errore del browser') + '.');
    $('thisone').disabled = false;
  }
};
$('newMoment').onclick = () => {
  S.felt = null; S.feltSource = null; S.text = ''; $('feelText').value = ''; renderSuggest([]);
  S.noneAt = new Date(); S.sess = null; S.shareBlob = null;
  drawWheel(); update(true);
  const t = document.querySelector('.moment'); if (t) t.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
};
$('shareNow').onclick = () => {
  const cur = current(); if (!cur.m.ready) return;
  const id = cur.s.saved[cur.s.idx]; const rec = S.records.find(r => r.id === id);
  if (!S.shareBlob || !rec) { status('status', 'Un attimo, preparo l’immagine…'); return; }
  shareOrDownload(S.shareBlob, imageName(rec), 'image/png');
};
/* sul telefono: anteprima fissa in basso finché il francobollo è fuori schermo,
   così mentre giri la ghiera vedi cosa cambia */
let stampVisible = true;
function paintDock(m, s) {
  const dock = $('dock');
  const show = m.ready && !stampVisible && S.tab === 'scatta' && matchMedia('(max-width: 919px)').matches;
  dock.hidden = !show;
  if (!show) return;
  paint($('dockCanvas'), buf);
  $('dockMood').textContent = S.felt ? S.felt.label + ' ' + S.felt.word : moodText(m.emo);
  $('dockSub').textContent = s && s.variants.length > 1 ? 'variante ' + (s.idx + 1) + ' di ' + s.variants.length : 'tocca per vederlo';
  $('dockThis').disabled = !!(s && s.saved[s.idx]);
  $('dockThis').textContent = s && s.saved[s.idx] ? '✓' : 'È questa';
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver(es => { es.forEach(e => { stampVisible = e.isIntersecting; }); update(false); }, { threshold: 0.25 }).observe(document.querySelector('.stamp .screen'));
}
$('dockOpen').onclick = () => document.querySelector('.stamp').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
$('dockAnother').onclick = () => $('another').click();
$('dockThis').onclick = () => $('thisone').click();
function renderTuneLine() {
  const st = T.stats(S.taste);
  let t;
  if (!st.n) t = 'Ogni volta che dici “È questa”, Atmosfera impara cosa senti tuo.';
  else if (st.n < 5) t = 'Ti conosce da ' + st.n + (st.n === 1 ? ' scelta' : ' scelte') + '. Le varianti sono ancora molto diverse fra loro.';
  else t = 'Ti conosce da ' + st.n + ' scelte. Ultimamente trovi la tua al ' + num(st.recent, 1) + '° tentativo (all’inizio: ' + num(st.first, 1) + ').';
  $('tuneLine').textContent = t;
}

/* =====================================================================
   IMMAGINI ED ESPORTAZIONI
   ===================================================================== */
function canvasBlob(c) { return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('immagine')), 'image/png')); }
async function blobCanvas(blob) {
  const img = window.createImageBitmap ? await createImageBitmap(blob) : await new Promise((res, rej) => { const i = new Image(), u = URL.createObjectURL(blob); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); return c;
}
async function upscale(png) {
  const src = await blobCanvas(png), c = document.createElement('canvas');
  c.width = src.width * EXPORT_SCALE; c.height = src.height * EXPORT_SCALE;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(src, 0, 0, c.width, c.height);
  return canvasBlob(c);
}
function imageName(rec) {
  const d = new Date(rec.date), off = typeof rec.offset === 'number' ? rec.offset : -d.getTimezoneOffset() * 60;
  const l = new Date(d.getTime() + off * 1000).toISOString();
  return 'atmosfera_' + l.slice(0, 10) + '_' + l.slice(11, 16).replace(':', '') + '_' + slug(rec.felt ? rec.felt.label : rec.mood) + '_' + rec.id.slice(-4) + '.png';
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/* sul telefono apre il foglio di condivisione (da lì: Salva immagine, Salva su File…);
   altrove scarica il file */
function shareOrDownload(blob, name, type) {
  try {
    const file = new File([blob], name, { type: type });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      navigator.share({ files: [file], title: 'Atmosfera' }).catch(e => { if (!e || e.name !== 'AbortError') download(blob, name); });
      return;
    }
  } catch (e) {}
  download(blob, name);
}

/* =====================================================================
   ARCHIVIO
   ===================================================================== */
const urls = new Map();
function urlFor(rec) { if (!rec.png) return ''; if (!urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(rec.png)); return urls.get(rec.id); }
function updateCount() { $('archCount').textContent = S.records.length ? String(S.records.length) : ''; }
async function renderArchive() {
  const recs = S.records;
  const est = await DB.estimate();
  $('archLead').textContent = recs.length
    ? recs.length + (recs.length === 1 ? ' momento salvato' : ' momenti salvati') + ' in questo browser' + (est && est.usage ? ' · ' + (est.usage < 1048576 ? Math.max(1, Math.round(est.usage / 1024)) + ' KB' : num(est.usage / 1048576, 1) + ' MB') + ' usati' : '') + '. Esporta ogni tanto: è il tuo backup.'
    : 'Qui finiscono i francobolli che scegli con “È questa”, insieme ai dati del momento e alle tue parole.';
  $('zipBtn').disabled = !recs.length;
  // filtri per emozione
  const counts = {}; recs.forEach(r => { const k = r.felt ? r.felt.id : '_'; counts[k] = (counts[k] || 0) + 1; });
  const fbox = $('filters'); fbox.innerHTML = '';
  if (Object.keys(counts).length > 1) {
    const mk = (id, label, n) => { const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = label + ' ' + n; b.setAttribute('aria-pressed', String(S.filter === id)); b.onclick = () => { S.filter = S.filter === id ? null : id; renderArchive(); }; fbox.appendChild(b); };
    mk(null, 'Tutti', recs.length);
    F.FEELINGS.forEach(f => { if (counts[f.id]) mk(f.id, f.label, counts[f.id]); });
    if (counts._) mk('_', 'Senza emozione scelta', counts._);
  }
  const list = recs.filter(r => S.filter === null || (S.filter === '_' ? !r.felt : (r.felt && r.felt.id === S.filter)));
  const box = $('album'); box.innerHTML = '';
  if (!recs.length) { box.innerHTML = '<p class="emptytxt">Ancora vuoto. Vai su Scatta, scegli come ti senti e premi “È questa”.</p>'; }
  list.forEach(r => {
    const b = document.createElement('button'); b.className = 'item'; b.type = 'button';
    if (S.openId === r.id) b.setAttribute('aria-current', 'true');
    const d = new Date(r.date);
    b.innerHTML = '<img alt="" src="' + urlFor(r) + '"><span class="cap"><b>' + esc(r.felt ? r.felt.label : r.mood) + '</b>' + esc(fmtDate(d, typeof r.offset === 'number' ? r.offset : undefined)) + (r.place ? '<br>' + esc(r.place) : '') + '</span>';
    b.setAttribute('aria-label', (r.felt ? r.felt.label : r.mood) + ', ' + fmtDate(d));
    b.onclick = () => openDetail(r.id);
    box.appendChild(b);
  });
  if (S.openId && !recs.find(r => r.id === S.openId)) closeDetail();
}
let delArmed = 0;
async function openDetail(id) {
  const r = S.records.find(x => x.id === id); if (!r) return;
  S.openId = id; S.detailBlob = null; delArmed = 0; $('d_del').textContent = 'Elimina'; $('d_del').classList.remove('danger');
  $('detail').hidden = false;
  $('d_img').src = urlFor(r); $('d_img').alt = 'Francobollo: ' + (r.felt ? r.felt.label : r.mood);
  $('d_title').textContent = r.felt ? r.felt.label + (r.felt.word ? ' ' + r.felt.word : '') : r.mood;
  $('d_text').hidden = !r.text; $('d_text').textContent = r.text ? '“' + r.text + '”' : '';
  const v = r.sens || {}, src = r.src || {}, rows = [];
  const d = new Date(r.date);
  rows.push(['Quando', esc(fmtLong(d, typeof r.offset === 'number' ? r.offset : undefined))]);
  if (r.place) rows.push(['Dove', esc(r.place)]);
  rows.push(['Da', esc(MODE_TXT[r.mode] || r.mode || '') + (r.scene ? ' · ' + esc(r.scene) : '')]);
  if (r.felt) rows.push(['Sentito', esc(r.felt.label) + ' <small>(' + esc(r.felt.word) + (r.felt.source === 'text' ? ', dalle parole' : '') + ')</small>']);
  rows.push(['Letto dai dati', esc(r.emoSensors ? moodText(r.emoSensors) : r.mood)]);
  if (v.temp != null) rows.push(['Ambiente', num(v.temp, 1) + ' °C · ' + Math.round(v.hum) + ' % · ' + Math.round(v.lux).toLocaleString('it-IT') + ' lux · ' + Math.round(v.kelvin) + ' K · ' + Math.round(v.db) + ' dB · ' + Math.round(v.co2) + ' ppm']);
  if (r.meteo && r.meteo.code != null) rows.push(['Cielo', esc(A.weatherText(r.meteo.code)) + (r.meteo.aqi != null ? ' · aria ' + A.aqiText(r.meteo.aqi) : '')]);
  if (r.palette) rows.push(['Segni', esc(PAL_TXT[r.palette] || r.palette) + ', ' + esc(r.archetype || '')]);
  if (r.attempts) rows.push(['Scelta', r.attempts === 1 ? 'la prima proposta' : 'variante ' + r.variant + ' di ' + r.attempts]);
  if (r.photo && r.photo.thumb) rows.push(['Foto', '<img src="' + r.photo.thumb + '" alt="La foto di partenza" style="width:120px;border-radius:6px;border:1px solid var(--line)">']);
  $('d_reads').innerHTML = rows.map(x => '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>').join('');
  $('d_share').disabled = true;
  renderArchive();
  $('detail').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
  try { const b = await upscale(r.png); if (S.openId === id) { S.detailBlob = b; $('d_share').disabled = false; } } catch (e) {}
}
function closeDetail() { S.openId = null; S.detailBlob = null; $('detail').hidden = true; }
$('d_close').onclick = () => { closeDetail(); renderArchive(); };
$('d_share').onclick = () => { const r = S.records.find(x => x.id === S.openId); if (r && S.detailBlob) shareOrDownload(S.detailBlob, imageName(r), 'image/png'); };
$('d_del').onclick = async () => {
  const id = S.openId; if (!id) return;
  if (!delArmed) {
    delArmed = setTimeout(() => { delArmed = 0; $('d_del').textContent = 'Elimina'; $('d_del').classList.remove('danger'); }, 4000);
    $('d_del').textContent = 'Conferma: elimina'; $('d_del').classList.add('danger'); return;
  }
  clearTimeout(delArmed); delArmed = 0;
  await DB.del(id);
  S.records = S.records.filter(r => r.id !== id); S.zipBlob = null;
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  closeDetail(); updateCount(); renderArchive(); status('archStatus', 'Eliminato.');
};

/* esporta tutto: zip con immagini, dati in JSON e CSV, gusto imparato */
function csvCell(v) { if (v == null) return ''; if (typeof v === 'number') return String(Math.round(v * 1000) / 1000).replace('.', ','); const s = String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCSV(recs, names) {
  const head = ['data', 'ora', 'luogo', 'lat', 'lon', 'modalita', 'sentito', 'intensita', 'parole', 'letto_dai_dati', 'valenza', 'energia', 'tensione', 'intimita', 'chiave', 'calore',
    'luce_lux', 'colore_K', 'rumore_dB', 'temperatura_C', 'umidita_pct', 'co2_ppm', 'aqi', 'cielo', 'tavolozza', 'composizione', 'tentativi', 'seme', 'immagine'];
  const rows = recs.map(r => {
    const d = new Date(r.date), off = typeof r.offset === 'number' ? r.offset : -d.getTimezoneOffset() * 60, l = new Date(d.getTime() + off * 1000).toISOString();
    const v = r.sens || {}, e = r.emo || {};
    return [l.slice(0, 10), l.slice(11, 16), r.place, r.pos && r.pos.lat, r.pos && r.pos.lon, MODE_TXT[r.mode] || r.mode, r.felt && r.felt.label, r.felt && r.felt.intensity, r.text,
      r.emoSensors ? moodText(r.emoSensors) : r.mood, e.valenza, e.energia, e.tensione, e.intimita, e.chiave, e.calore,
      v.lux, v.kelvin, v.db, v.temp, v.hum, v.co2, r.meteo && r.meteo.aqi, r.meteo && r.meteo.code != null ? A.weatherText(r.meteo.code) : '',
      r.palette, r.archetype, r.attempts, r.seed, names[r.id]].map(csvCell).join(';');
  });
  return '﻿' + head.join(';') + '\r\n' + rows.join('\r\n') + '\r\n';
}
$('zipBtn').onclick = async () => {
  if (S.zipBlob) { shareOrDownload(S.zipBlob, S.zipName, 'application/zip'); return; }
  if (!S.records.length) return;
  const btn = $('zipBtn'); btn.disabled = true; btn.textContent = 'Preparo l’archivio…';
  try {
    const enc = new TextEncoder(), files = [], names = {}, used = {};
    for (const r of S.records) {
      let n = 'immagini/' + imageName(r); while (used[n]) n = n.replace(/\.png$/, '-b.png'); used[n] = 1; names[r.id] = n;
      if (r.png) files.push({ name: n, data: new Uint8Array(await (await upscale(r.png)).arrayBuffer()), date: new Date(r.date) });
    }
    const json = { app: 'atmosfera', v: 3, exported: new Date().toISOString(), records: S.records.map(r => { const o = Object.assign({}, r); delete o.png; o.image = names[r.id]; return o; }) };
    files.push({ name: 'atmosfera.json', data: enc.encode(JSON.stringify(json, null, 1)) });
    files.push({ name: 'atmosfera.csv', data: enc.encode(toCSV(S.records, names)) });
    files.push({ name: 'gusto.json', data: enc.encode(JSON.stringify(S.taste)) });
    files.push({ name: 'LEGGIMI.txt', data: enc.encode('Archivio di Atmosfera.\n\nimmagini/      i francobolli scelti, 960 x 960 pixel\natmosfera.csv  una riga per momento, si apre con Excel o Numbers\natmosfera.json tutti i dati, per reimportare l’archivio\ngusto.json     ciò che Atmosfera ha imparato del tuo gusto\n\nPer ripristinare: Atmosfera → Archivio → Importa, e scegli questo file .zip così com’è.\n') });
    S.zipBlob = new Blob([Z.makeZip(files)], { type: 'application/zip' });
    S.zipName = 'atmosfera-archivio-' + new Date().toISOString().slice(0, 10) + '.zip';
    btn.textContent = 'Scarica archivio (' + num(S.zipBlob.size / 1048576, 1) + ' MB)';
    status('archStatus', 'Pronto. Premi di nuovo per salvarlo.', 0);
  } catch (err) {
    btn.textContent = 'Esporta tutto (.zip)'; status('archStatus', 'Non riesco a preparare l’archivio.');
  } finally { btn.disabled = false; }
};
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    let recs = [], images = {}, taste = null;
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip') {
      const entries = Z.readZip(new Uint8Array(await f.arrayBuffer()));
      const dec = new TextDecoder();
      entries.forEach(en => {
        if (en.name === 'atmosfera.json') recs = (JSON.parse(dec.decode(en.data)).records || []);
        else if (en.name === 'gusto.json') { try { taste = T.sane(JSON.parse(dec.decode(en.data))); } catch (x) {} }
        else if (/\.png$/i.test(en.name)) images[en.name] = en.data;
      });
      for (const r of recs) if (r.image && images[r.image]) r.png = await downscale(new Blob([images[r.image]], { type: 'image/png' }));
    } else {
      const j = JSON.parse(await f.text());
      recs = Array.isArray(j.records) ? j.records : (Array.isArray(j.album) ? j.album.map(legacy) : []);
    }
    let n = 0;
    for (const r of recs) {
      if (!r || !r.id || !r.emo || typeof r.seed !== 'number' || !r.date) continue;
      if (S.records.find(x => x.id === r.id)) continue;
      if (!r.png) r.png = await pngFromRecord(r);
      delete r.image;
      await DB.put(r); S.records.push(r); n++;
    }
    S.records.sort((a, b) => (a.date < b.date ? 1 : -1));
    let tmsg = '';
    if (taste && taste.n > S.taste.n) { S.taste = taste; await DB.setMeta('taste', taste); tmsg = ' Recuperato anche il gusto imparato (' + taste.n + ' scelte).'; }
    S.zipBlob = null; updateCount(); renderArchive();
    status('archStatus', (n ? 'Importati ' + n + ' momenti.' : 'Nessun momento nuovo nel file.') + tmsg, 8000);
  } catch (err) { status('archStatus', err && err.message && /zip/i.test(err.message) ? err.message : 'Il file non è un archivio di Atmosfera.', 8000); }
});
async function downscale(png) {   // le immagini esportate sono ingrandite: le riporto a 240 × 240
  const src = await blobCanvas(png);
  if (src.width === E.W) return png;
  const c = document.createElement('canvas'); c.width = E.W; c.height = E.H;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(src, 0, 0, E.W, E.H);
  return canvasBlob(c);
}
async function pngFromRecord(r) {
  const out = new Uint8Array(E.W * E.H); E.render(r.emo, r.seed, out, r.genes || null);
  const d = new Date(r.date);
  caption(out, r.text ? '“' + r.text + '”' : (r.felt ? r.felt.label.toLowerCase() : (r.mood || moodText(r.emo)).toLowerCase()), fmtDate(d, typeof r.offset === 'number' ? r.offset : undefined) + (r.place ? ' · ' + r.place.split(',').pop().trim() : ''));
  const c = document.createElement('canvas'); c.width = E.W; c.height = E.H; paint(c, out);
  return canvasBlob(c);
}
/* album delle versioni precedenti (localStorage) */
function legacy(x) {
  return { id: x.id, v: 3, date: x.date, offset: x.offset, place: x.place || '', pos: x.pos || null, mode: x.mode === 'mano' ? 'mano' : (x.mode || 'sens'),
    scene: x.scene || null, sens: x.sens || null, src: null, meteo: x.meteo || null, felt: null, text: '', mood: moodText(x.emo),
    emoSensors: null, emo: x.emo, tuned: !!x.tuned, seed: x.seed, genes: null, attempts: 1, variant: 1,
    photo: x.photo ? { thumb: x.photo.thumb, lux: x.photo.lux, luxSrc: x.photo.luxSrc, a: x.photo.a, peso: x.photo.peso } : null };
}
async function migrateLegacy() {
  if (await DB.getMeta('migrated.v1')) return 0;
  let old = [];
  try { old = JSON.parse(localStorage.getItem('atmosfera.album.v1') || '[]'); } catch (e) { old = []; }
  let n = 0;
  for (const x of (Array.isArray(old) ? old : [])) {
    if (!x || !x.emo || typeof x.seed !== 'number' || !x.date) continue;
    const r = legacy(x); r.png = await pngFromRecord(r); await DB.put(r); n++;
  }
  await DB.setMeta('migrated.v1', true);
  return n;
}

/* =====================================================================
   LABORATORIO
   ===================================================================== */
function buildLab() {
  const sb = $('scenes');
  SCENES.forEach((s, i) => {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = s.n; b.id = 'sc' + i;
    b.onclick = () => { S.sim = i; S.edits.sim = {}; S.mode = 'sens'; setMode('sens'); setTab('scatta'); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); };
    sb.appendChild(b);
  });
  const box = $('sensors');
  SENS.forEach(s => {
    const d = document.createElement('div'); d.className = 'ctl';
    d.innerHTML = '<div class="top"><label for="s_' + s.k + '">' + s.l + '</label><output id="o_' + s.k + '" for="s_' + s.k + '"></output></div><input type="range" id="s_' + s.k + '" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '">';
    box.appendChild(d);
    const inp = d.querySelector('input');
    inp.addEventListener('input', () => {
      if (!activeCtx()) return;
      S.edits[ctxKey()][s.k] = { v: s.fromS ? s.fromS(+inp.value) : +inp.value, src: 'a mano' };
      refreshMoment(); update(false);
    });
  });
  const eb = $('emotions');
  EMO.forEach(m => {
    const d = document.createElement('div'); d.className = 'ctl';
    d.innerHTML = '<div class="top"><label for="e_' + m.k + '">' + m.l + '</label><output id="oe_' + m.k + '" for="e_' + m.k + '"></output></div><input type="range" id="e_' + m.k + '" min="0" max="1" step="0.01"><div class="maps">' + m.m + '</div>';
    eb.appendChild(d);
    const inp = d.querySelector('input');
    inp.addEventListener('input', () => { if (!S.tune) return; S.hand[m.k] = +inp.value; update(false); });
  });
  $('wFelt').value = S.wFelt; $('peso').value = S.peso;
  $('wFelt').addEventListener('input', () => { S.wFelt = +$('wFelt').value; savePrefs(); update(false); });
  $('peso').addEventListener('input', () => { S.peso = +$('peso').value; savePrefs(); update(false); });
  $('tune').addEventListener('change', () => {
    S.tune = $('tune').checked;
    if (S.tune) { S.tune = false; const m = moment(); S.tune = true; S.hand = Object.assign({}, m.ready ? m.emo : { valenza: .5, energia: .5, tensione: .3, intimita: .5, chiave: .6, calore: .5 }); }
    update(true);
  });
  $('resetEdits').onclick = () => { S.edits[ctxKey()] = {}; refreshMoment(); update(false); };
}
function syncLab() {
  $('o_wFelt').textContent = Math.round(S.wFelt * 100) + ' %';
  $('o_peso').textContent = Math.round(S.peso * 100) + ' %';
  SCENES.forEach((s, i) => $('sc' + i).setAttribute('aria-pressed', String(S.mode === 'sens' && S.sim === i)));
  const ef = effective();
  $('sensLead').textContent = !ef ? 'Nessun momento ancora.' : (S.mode === 'foto' ? 'Luce e colore della luce arrivano dalla foto; il resto dai dati aperti. Puoi correggere ogni valore.' : (ef.c.kind === 'none' ? 'Nessun dato del luogo: valori neutri. Rileva qui e ora per quelli veri.' : 'Valori del momento. Sono dati di esterno: se sei al chiuso, correggili.'));
  SENS.forEach(s => {
    const inp = $('s_' + s.k), out = $('o_' + s.k);
    inp.disabled = !ef || (S.mode === 'foto' && s.photo);
    if (!ef) { out.innerHTML = '—'; return; }
    const v = ef.vals[s.k];
    if (document.activeElement !== inp) inp.value = s.toS ? s.toS(v) : v;
    out.innerHTML = s.fmt(v) + '<em>' + esc(ef.src[s.k] || '') + '</em>';
  });
  $('resetEdits').hidden = !Object.keys(S.edits[ctxKey()]).length;
  const m = moment();
  EMO.forEach(x => {
    const inp = $('e_' + x.k);
    inp.disabled = !S.tune || !m.ready;
    if (m.ready) { if (document.activeElement !== inp) inp.value = m.emo[x.k]; $('oe_' + x.k).textContent = num(m.emo[x.k]); } else $('oe_' + x.k).textContent = '—';
  });
  $('emoLead').textContent = S.tune ? 'Taratura attiva: lo stato d’animo lo decidi tu, sensori e ghiera sono ignorati.' : 'Risultato di sensori, foto e ghiera, con i pesi qui sopra.';
  renderTaste();
  if (m.ready) {
    const s = session(m), v = s.variants[s.idx];
    const t0 = performance.now(), res = E.render(m.emo, v.seed, buf, v.genes);
    describe(res, performance.now() - t0, m, v);
  } else $('gram').innerHTML = '<dt>Stato</dt><dd>' + esc(m.msg) + '</dd>';
}
function swatch(ids) { return '<span class="sw">' + ids.map(i => '<i style="background:rgb(' + RGB[i].join(',') + ')" title="' + E.INK_NAMES[i] + '"></i>').join('') + '</span>'; }
function describe(res, ms, m, v) {
  const g = res.g, e = g.e;
  const rows = [
    ['Tavolozza', swatch(g.ramp) + (PAL_TXT[g.palette] || g.palette) + (g.lowKey ? ', in chiave bassa' : '') + '; accento ' + swatch([g.acc]) + E.INK_NAMES[g.acc]],
    ['Composizione', ARCH_TXT[g.archeName] + (res.nuclei.length > 1 ? ' (' + res.nuclei.length + ' nuclei)' : '')],
    ['Fondo', g.cppnBands ? 'campiture a ' + g.cppnBands + ' gradini' : (g.groundAmt > 0.15 ? 'velature piene' : 'velature leggere, molta carta')],
    ['Linee', g.lines + ' linee, ' + (g.ribbon ? 'larghe e lente' : (e.energia > 0.65 ? 'fitte e turbolente' : 'sottili')) + ', ' + (g.orbit > 0.6 ? 'girano attorno al nucleo' : (g.orbit > 0.35 ? 'in parte puntano al nucleo' : 'puntano dritte al nucleo'))],
    ['Nucleo', (g.attrKnot > 0.55 ? 'nodi stretti' : 'anse ampie') + (g.nucleusScale !== 1 ? ', ' + (g.nucleusScale > 1 ? 'più grande' : 'più piccolo') + ' del solito' : '') + (g.pulse ? ', ' + g.pulse + ' anelli' : '')],
    ['Accenti', g.accents + (g.accents === 1 ? ' forma' : ' forme')],
    ['Retino', g.grain < 0.3 ? 'ordinato' : (g.grain < 0.6 ? 'misto' : 'granuloso')],
    ['Origine', esc(MODE_TXT[m.kind]) + (m.tuned ? ' · taratura' : '') + ' · variante ' + (S.sess.idx + 1) + ' · seme ' + v.seed.toString(16).toUpperCase() + ' · ' + ms.toFixed(0) + ' ms']
  ];
  $('gram').innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
}
let tasteArmed = 0;
function renderTaste() {
  const st = T.stats(S.taste), d = T.describe(S.taste);
  const tight = Math.round(100 * (1 - (st.spread - 0.22) / (1.1 - 0.22)));
  let h = '<div class="taste">';
  if (!st.n) h += '<p class="lead" style="margin:0">Ancora nessuna scelta. Ogni “È questa” sposta il gusto verso ciò che hai scelto e lo allontana dalle varianti scartate. Le preferenze sono legate all’emozione: per la malinconia può imparare cose diverse che per la gioia.</p>';
  else {
    h += '<p>' + st.n + (st.n === 1 ? ' scelta' : ' scelte') + (st.n >= 5 ? ' · tentativi medi: all’inizio ' + num(st.first, 1) + ', ora ' + num(st.recent, 1) : '') + '.</p>';
    h += '<p class="lead" style="margin:0">Quanto si sono strette le varianti attorno al tuo gusto: ' + tight + ' %</p><div class="meter" aria-hidden="true"><i style="width:' + Math.max(3, tight) + '%"></i></div>';
    const lab = { tavolozze: 'Tavolozze che preferisci', eviti: 'Tavolozze che eviti', composizione: 'Composizione preferita', segni: 'Segni' };
    if (st.n < 4) h += '<p class="lead" style="margin:0">Dopo qualche scelta in più qui vedrai cosa preferisci.</p>';
    else if (d.length) h += '<dl class="reads">' + d.map(x => '<dt>' + lab[x.k] + '</dt><dd>' + x.v.map(y => esc(PAL_TXT[y] || y)).join(', ') + '</dd>').join('') + '</dl>';
    else h += '<p class="lead" style="margin:0">Nessuna preferenza netta per ora.</p>';
  }
  $('tasteBox').innerHTML = h + '</div>';
  $('tasteReset').hidden = !st.n;
}
$('tasteReset').onclick = async () => {
  if (!tasteArmed) { tasteArmed = setTimeout(() => { tasteArmed = 0; $('tasteReset').textContent = 'Ricomincia da zero'; $('tasteReset').classList.remove('danger'); }, 4000); $('tasteReset').textContent = 'Conferma: dimentica il mio gusto'; $('tasteReset').classList.add('danger'); return; }
  clearTimeout(tasteArmed); tasteArmed = 0; $('tasteReset').textContent = 'Ricomincia da zero'; $('tasteReset').classList.remove('danger');
  S.taste = T.newTaste(); S.sess = null; await DB.setMeta('taste', S.taste); update(true);
};
$('bin').onclick = () => {
  const cur = current(); if (!cur.m.ready) return;
  const out = new Uint8Array(E.W * E.H); renderStamp(cur.m, cur.v, out, true);
  const packed = new Uint8Array(out.length / 2);
  for (let i = 0; i < packed.length; i++) packed[i] = (PANEL_CODE[out[2 * i]] << 4) | PANEL_CODE[out[2 * i + 1]];
  download(new Blob([packed], { type: 'application/octet-stream' }), 'atmosfera-display-' + cur.v.seed.toString(16) + '.bin');
};

/* atlante (solo nel laboratorio, disegnato a pezzi per non bloccare) */
const V = [0.82, 0.55, 0.22], EN = [0.15, 0.5, 0.85], atlasC = [];
(function buildAtlas() {
  const at = $('atlas');
  const corner = document.createElement('div'); corner.className = 'corner'; at.appendChild(corner);
  ['energia bassa', 'energia media', 'energia alta'].forEach(t => { const d = document.createElement('div'); d.className = 'ax col'; d.textContent = t; at.appendChild(d); });
  ['valenza alta', 'valenza media', 'valenza bassa'].forEach((t, r) => {
    const d = document.createElement('div'); d.className = 'ax rowl'; d.textContent = t; at.appendChild(d);
    for (let c = 0; c < 3; c++) {
      const cell = document.createElement('div'); cell.className = 'cell';
      const b = document.createElement('button'); b.className = 'thumb'; b.type = 'button';
      const cv = document.createElement('canvas'); cv.width = E.W; cv.height = E.H; b.appendChild(cv);
      const lab = document.createElement('span'); cell.appendChild(b); cell.appendChild(lab); at.appendChild(cell);
      b.onclick = () => {
        const m = moment(); if (!m.ready) return;
        S.hand = Object.assign({}, m.emo, { valenza: V[r], energia: EN[c] }); S.tune = true; $('tune').checked = true; update(true);
      };
      atlasC.push({ cv: cv, lab: lab, b: b, r: r, c: c });
    }
  });
})();
let slowT = 0, slowJob = 0;
function scheduleSlow(full) { clearTimeout(slowT); slowT = setTimeout(slowRenders, full ? 40 : 300); }
function slowRenders() {
  if (S.tab !== 'lab') return;
  const job = ++slowJob, cur = current(); if (!cur.m.ready) return;
  const tasks = atlasC.map(a => () => {
    const ee = Object.assign({}, cur.m.emo, { valenza: V[a.r], energia: EN[a.c] });
    E.render(ee, cur.v.seed, buf, cur.v.genes); paint(a.cv, buf);
    a.lab.textContent = moodText(ee); a.b.setAttribute('aria-label', 'Prova ' + moodText(ee));
  });
  (function next() { if (job !== slowJob || !tasks.length) return; tasks.shift()(); setTimeout(next, 0); })();
}

/* =====================================================================
   AVVIO
   ===================================================================== */
(async function boot() {
  buildLab();
  drawWheel();
  setMode('sens');
  const h = (location.hash || '').replace('#', '');
  setTab(TABS.indexOf(h) >= 0 ? h : 'scatta', true);
  try {
    await DB.open();
    $('volatile').hidden = !DB.isVolatile();
    const t = await DB.getMeta('taste'); if (t) S.taste = T.sane(t);
    const migrated = await migrateLegacy();
    S.records = await DB.all();
    updateCount();
    if (migrated) status('status', 'Ho portato nell’archivio ' + migrated + ' scatti della versione precedente.', 8000);
  } catch (e) { $('volatile').hidden = false; }
  S.sess = null; update(true);
  if (S.tab === 'archivio') renderArchive();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => update(false));
})();
})();
