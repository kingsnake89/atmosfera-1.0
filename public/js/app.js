/* =====================================================================
   ATMOSFERA — BANCO DI PROVA (interfaccia) v0.3
   Due modi di descrivere un momento, un solo motore:
     - Solo sensori       : i "sensori" sono i dati aperti di dove sei, adesso
                            (oppure una scena simulata, per provare offline)
     - Immagine + sensori : i dati aperti del luogo e del momento della foto;
                            la foto aggiunge luce, colore della luce e qualità visive
   La taratura a mano resta disponibile come interruttore, per i test.
   ===================================================================== */
(function () {
'use strict';
const E = window.AtmosferaEngine, P = window.AtmosferaPhoto, A = window.AtmosferaAtmo;
const $ = id => document.getElementById(id);

/* colori di anteprima degli inchiostri (i pigmenti veri sono più spenti) */
const RGB = [[233,230,222],[35,37,42],[170,56,46],[222,186,56],[48,80,140],[62,108,74]];
/* codici a 4 bit del controller Spectra 6 (driver Waveshare/Good Display).
   DA VERIFICARE sul datasheet del pannello prima di usarli sull'hardware. */
const PANEL_CODE = [0x1 /*bianco*/, 0x0 /*nero*/, 0x3 /*rosso*/, 0x2 /*giallo*/, 0x5 /*blu*/, 0x6 /*verde*/];
/* microfono del telefono: dBFS → dB SPL. Valore approssimativo, da tarare
   confrontandolo con un fonometro o un'app di misura. */
const MIC_OFFSET_DB = 110;

const NOTES = ['nessuna nota','con te','da solo','casa','lavoro','in viaggio','festa','pioggia','ricordati'];
const SCENES = [
  { n:'Colazione al sole',      at:[2026,9,4,8,12],   d:{lux:6000,kelvin:4800,db:42,temp:22,hum:50,co2:600},   note:3 },
  { n:'Cena a lume di candela', at:[2026,9,3,21,40],  d:{lux:15,kelvin:2000,db:40,temp:22,hum:50,co2:1100},   note:1 },
  { n:'Riunione lunga',         at:[2026,9,7,16,55],  d:{lux:450,kelvin:4600,db:52,temp:25.5,hum:33,co2:1900}, note:4 },
  { n:'Concerto',               at:[2026,8,27,23,10], d:{lux:80,kelvin:3000,db:92,temp:28,hum:65,co2:2200},   note:6 },
  { n:'Bosco dopo la pioggia',  at:[2026,9,5,17,30],  d:{lux:3000,kelvin:6200,db:33,temp:14,hum:92,co2:420},  note:7 },
  { n:'Notte, tutti dormono',   at:[2026,9,1,2,14],   d:{lux:2,kelvin:2700,db:28,temp:19,hum:55,co2:900},     note:3 },
  { n:'Spiaggia a mezzogiorno', at:[2026,7,18,12,30], d:{lux:60000,kelvin:5600,db:60,temp:33,hum:70,co2:420}, note:5 },
  { n:'Metropolitana',          at:[2026,9,9,8,47],   d:{lux:300,kelvin:5000,db:85,temp:27,hum:60,co2:1800},  note:5 }
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
  { k:'energia',  l:'Energia',  m:'Quiete o agitazione. Più linee, più turbolenza, retino più granuloso, più accenti.' },
  { k:'tensione', l:'Tensione', m:'Le linee puntano al centro, i nodi si stringono, il fondo va a gradini, compaiono schegge.' },
  { k:'intimita', l:'Intimità', m:'Un solo nucleo grande, anelli che pulsano, accenti che gli orbitano vicino.' },
  { k:'chiave',   l:'Chiave',   m:'Luminosità d’insieme. Sotto 0,30 il fondo diventa scuro e i segni si accendono.' },
  { k:'calore',   l:'Calore',   m:'Sposta la tavolozza verso rossi e gialli o verso blu e verdi.' }
];
const ARCH_TXT = { nucleo:'un nucleo grande al centro', costellazione:'più nuclei piccoli e lontani', orizzonte:'fasce ondulate con un nucleo sull’orizzonte', deriva:'flusso fitto con un nucleo spostato di lato' };
const PAL_TXT = { sole:'Sole', lume:'Lume', prato:'Prato', lago:'Lago', 'mezzodì':'Mezzodì', brace:'Brace', temporale:'Temporale', ghiaccio:'Ghiaccio', notte:'Notte', cenere:'Cenere' };
const MODE_TXT = { sens:'solo sensori', foto:'immagine + sensori', sim:'scena simulata', mano:'taratura a mano' };

/* ---------- stato ---------- */
const S = {
  mode: 'sens',
  sim: 4,                       // scena simulata attiva in "solo sensori" (null = dati veri)
  now: null, nowBusy: false,    // contesto "qui e ora"
  photoCtx: null, photoBusy: false,
  edits: { sim: {}, now: {}, photo: {} },   // correzioni a mano dei sensori
  tune: false, hand: null,
  note: SCENES[4].note, reseed: 0, peso: 0.35,
  photo: null, view: null
};
try { const p = JSON.parse(localStorage.getItem('atmosfera.prefs.v1') || 'null'); if (p && typeof p.peso === 'number') S.peso = p.peso; } catch (e) {}

/* ---------- utilità ---------- */
const buf = new Uint8Array(E.W * E.H);
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function moodText(e) { const m = E.moodName(e); return cap(m.name) + (m.adj ? ', ' + m.adj : ''); }
function fmtDate(d, tzOffsetSec) {
  if (!d) return '';
  const opt = { weekday: 'short', day: 'numeric', month: 'short' }, topt = { hour: '2-digit', minute: '2-digit' };
  let dd = d;
  if (typeof tzOffsetSec === 'number') { dd = new Date(d.getTime() + tzOffsetSec * 1000); opt.timeZone = 'UTC'; topt.timeZone = 'UTC'; }
  return dd.toLocaleDateString('it-IT', opt).replace(/\./g, '') + ' · ' + dd.toLocaleTimeString('it-IT', topt);
}
function num(v, d) { return (+v).toLocaleString('it-IT', { maximumFractionDigits: d === undefined ? 2 : d, minimumFractionDigits: d === undefined ? 2 : 0 }); }
function status(msg) { $('status').textContent = msg; clearTimeout(status.t); status.t = setTimeout(() => { $('status').textContent = ''; }, 5000); }
function hashSeed(parts) { let h = 0x811C9DC5; for (const p of parts) { h ^= p | 0; h = Math.imul(h, 0x01000193); h ^= h >>> 13; } return h >>> 0; }
function reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

/* ---------- contesti: da dove arrivano i valori dei sensori ---------- */
function simCtx(i) {
  const s = SCENES[i], a = s.at, d = new Date(a[0], a[1], a[2], a[3], a[4]);
  const src = {}; Object.keys(s.d).forEach(k => { src[k] = 'scena simulata'; });
  return { kind: 'sim', vals: Object.assign({ aqi: null }, s.d), src: src, abs: d, offset: null, place: '', meteo: null, notes: [] };
}
function ctxKey() { return S.mode === 'foto' ? 'photo' : (S.sim !== null ? 'sim' : 'now'); }
function activeCtx() {
  if (S.mode === 'foto') return S.photoCtx;
  return S.sim !== null ? simCtx(S.sim) : S.now;
}
/* valori effettivi: contesto + correzioni a mano (+ luce dalla foto) */
function effective() {
  const c = activeCtx(); if (!c) return null;
  const key = ctxKey(), ed = S.edits[key];
  const vals = Object.assign({}, c.vals), src = Object.assign({}, c.src);
  Object.keys(ed).forEach(k => { vals[k] = ed[k].v; src[k] = ed[k].src; });
  if (S.mode === 'foto' && S.photo) {
    vals.lux = S.photo.lux; src.lux = S.photo.luxSrc === 'exif' ? 'foto, EXIF' : 'foto, stima';
    vals.kelvin = S.photo.a.kelvin; src.kelvin = 'foto';
  }
  return { c: c, vals: vals, src: src };
}

/* lo scatto corrente */
function shot() {
  if (S.view) return { emo: S.view.emo, seed: S.view.seed, date: new Date(S.view.date), offset: S.view.offset, place: S.view.place || '', mode: S.view.mode, note: S.view.note, ready: true };
  let r = null;
  if (S.mode === 'sens') {
    const ef = effective();
    if (!ef) return { ready: false, msg: S.nowBusy ? 'Sto raccogliendo i dati di dove sei…' : 'Premi “Rileva qui e ora” per sviluppare il francobollo.' };
    const c = ef.c;
    const seed = c.kind === 'sim' ? ((S.sim + 1) * 7919 + 12345) >>> 0 : hashSeed([Math.round(c.lat * 1000), Math.round(c.lon * 1000), Math.floor(c.abs.getTime() / 60000)]);
    r = { emo: E.emotionFromSensors(ef.vals), seed: (seed + Math.imul(S.reseed, 104729)) >>> 0, date: c.abs, offset: c.offset, place: c.place || '', mode: c.kind === 'sim' ? 'sim' : 'sens', vals: ef.vals };
  } else {
    if (!S.photo) return { ready: false, msg: 'Scegli o scatta una foto per sviluppare il francobollo.' };
    const ef = effective();
    if (!ef) return { ready: false, msg: 'Sto leggendo i dati del luogo e del momento della foto…' };
    const base = E.emotionFromSensors(ef.vals);
    r = { emo: P.blendEmotion(base, S.photo.a, S.peso), base: base, seed: (S.photo.a.seed ^ Math.imul(S.reseed, 104729)) >>> 0,
          date: ef.c.abs, offset: ef.c.offset, place: ef.c.place || '', mode: 'foto', vals: ef.vals };
  }
  r.note = S.note; r.ready = true;
  if (S.tune && S.hand) { r.auto = r.emo; r.emo = S.hand; r.tuned = true; }
  return r;
}

/* ---------- disegno ---------- */
const tc = document.createElement('canvas'); tc.width = E.W; tc.height = E.H;
const tctx = tc.getContext('2d', { willReadFrequently: true });
function caption(out, line1, line2) {   // sul dispositivo sarà un font bitmap; qui testo vero portato a 1 bit
  tctx.clearRect(0, 0, E.W, E.H);
  tctx.fillStyle = '#000';
  tctx.font = 'italic 14px Spectral, Georgia, serif';
  tctx.fillText(line1, 15, 207);
  tctx.font = '600 9px "Instrument Sans", system-ui, sans-serif';
  let s = line2.toUpperCase();
  while (s.length > 4 && tctx.measureText(s).width > 210) s = s.slice(0, -2).trimEnd() + '…';
  tctx.fillText(s, 15, 224);
  const d = tctx.getImageData(0, 190, E.W, 50).data;
  for (let y = 0; y < 50; y++) for (let x = 0; x < E.W; x++) if (d[(y * E.W + x) * 4 + 3] > 120) out[(y + 190) * E.W + x] = E.BLACK;
}
function paint(canvas, out) {
  const c = canvas.getContext('2d'), id = c.createImageData(E.W, E.H), p = id.data;
  for (let i = 0; i < out.length; i++) { const q = RGB[out[i]]; p[i * 4] = q[0]; p[i * 4 + 1] = q[1]; p[i * 4 + 2] = q[2]; p[i * 4 + 3] = 255; }
  c.putImageData(id, 0, 0);
}
function captionLines(sh) {
  const l1 = NOTES[sh.note] === 'nessuna nota' ? moodText(sh.emo).toLowerCase() : NOTES[sh.note];
  const l2 = fmtDate(sh.date, sh.offset) + (sh.place ? ' · ' + sh.place.split(',').pop().trim() : '');
  return [l1, l2];
}
function stamp(sh, out, withCaption) {
  const res = E.render(sh.emo, sh.seed, out);
  if (withCaption) { const l = captionLines(sh); caption(out, l[0], l[1]); }
  return res;
}

/* ---------- modalità ---------- */
function setMode(m) {
  S.mode = m; S.view = null;
  ['sens', 'foto'].forEach(k => $('m_' + k).setAttribute('aria-pressed', String(k === m)));
  document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = el.dataset.modes.split(' ').indexOf(m) < 0; });
  refreshPanels(); update(true);
}
$('m_sens').onclick = () => setMode('sens');
$('m_foto').onclick = () => setMode('foto');

/* ---------- posizione e dati aperti ---------- */
function getPosition() {
  return new Promise((res, rej) => {
    if (!window.isSecureContext) return rej(new Error('La posizione funziona solo su https (su Vercel va bene; in locale usa localhost).'));
    if (!navigator.geolocation) return rej(new Error('Questo browser non fornisce la posizione.'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      e => rej(new Error(e.code === 1 ? 'Permesso di posizione negato. Puoi concederlo dalle impostazioni del browser per questo sito.' : 'Non riesco a ottenere la posizione. Riprova all’aperto o con la rete attiva.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  });
}
$('locate').onclick = async () => {
  if (S.nowBusy) return;
  S.nowBusy = true; S.view = null; $('locate').disabled = true;
  setCtxStatus('nowStatus', 'Chiedo la posizione al dispositivo…');
  update(false);
  try {
    const pos = await getPosition();
    const c = await A.collect({ lat: pos.lat, lon: pos.lon, onStep: m => setCtxStatus('nowStatus', m) });
    c.kind = 'now'; c.acc = pos.acc; c.posSrc = 'dispositivo';
    S.now = c; S.edits.now = {}; S.sim = null; S.reseed = 0;
    setCtxStatus('nowStatus', c.notes.length ? 'Fatto, con qualche lacuna: ' + c.notes.join('; ') + '.' : 'Dati aggiornati alle ' + fmtDate(c.abs, c.offset).split('· ')[1] + '.');
  } catch (err) {
    setCtxStatus('nowStatus', err.message, true);
  } finally {
    S.nowBusy = false; $('locate').disabled = false; $('locate').textContent = S.now ? 'Rileva di nuovo' : 'Rileva qui e ora';
    refreshPanels(); update(true);
  }
};
function setCtxStatus(id, msg, isErr) { const el = $(id); el.textContent = msg; el.classList.toggle('err', !!isErr); }

/* microfono: 3 secondi di livello medio (Leq), solo per lo scatto "qui e ora" */
$('listen').onclick = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status('Questo browser non dà accesso al microfono.'); return; }
  let stream = null, ac = null;
  try {
    $('listen').disabled = true; $('listen').textContent = 'Ascolto…';
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 2048; src.connect(an);
    const data = new Float32Array(an.fftSize); let sum = 0, n = 0;
    const t0 = performance.now();
    await new Promise(res => { const iv = setInterval(() => {
      an.getFloatTimeDomainData(data); let s = 0; for (let i = 0; i < data.length; i++) s += data[i] * data[i];
      sum += s / data.length; n++;
      if (performance.now() - t0 > 3000) { clearInterval(iv); res(); }
    }, 50); });
    const dbfs = 10 * Math.log10(Math.max(1e-12, sum / Math.max(1, n)));
    const db = Math.round(Math.max(25, Math.min(95, dbfs + MIC_OFFSET_DB)));
    const key = ctxKey();
    S.edits[key].db = { v: db, src: 'microfono (taratura approssimativa)' };
    status('Rumore misurato: ' + db + ' dB.');
    refreshPanels(); update(false);
  } catch (err) {
    status(err && err.name === 'NotAllowedError' ? 'Permesso del microfono negato.' : 'Non riesco a usare il microfono.');
  } finally {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (ac) ac.close();
    $('listen').disabled = false; $('listen').textContent = 'Ascolta 3 secondi';
  }
};

/* ---------- foto ---------- */
async function loadPhoto(file) {
  $('photoErr').hidden = true;
  if (!file) return;
  let bmp;
  try {
    const ab = await file.arrayBuffer();
    let exif = null; try { exif = P.parseExif(ab); } catch (e) { exif = null; }
    bmp = await decode(file);
    const max = 200, sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(8, Math.round(bmp.width * sc)), h = Math.max(8, Math.round(bmp.height * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    const a = P.analyzePixels(ctx.getImageData(0, 0, w, h).data, w, h);
    const fromExif = P.luxFromExif(exif);
    const tw = 96, th = Math.round(tw * h / w), t = document.createElement('canvas'); t.width = tw; t.height = th;
    t.getContext('2d').drawImage(bmp, 0, 0, tw, th);
    if (S.photo && S.photo.url) URL.revokeObjectURL(S.photo.url);
    const naive = exif && P.exifNaive(exif.date);
    const fileDate = new Date(file.lastModified || Date.now());
    S.photo = {
      a: a, exif: exif, name: file.name,
      lux: fromExif ? Math.round(fromExif.lux) : P.luxGuess(a.brightness),
      luxSrc: fromExif ? 'exif' : 'stima', ev: fromExif ? fromExif.ev : null,
      naive: naive || { y: fileDate.getFullYear(), m: fileDate.getMonth() + 1, d: fileDate.getDate(), h: fileDate.getHours(), mi: fileDate.getMinutes() },
      dateSrc: naive ? 'exif' : 'file',
      gps: exif && typeof exif.lat === 'number' ? { lat: exif.lat, lon: exif.lon } : null,
      url: URL.createObjectURL(file), thumb: t.toDataURL('image/jpeg', 0.7)
    };
    S.reseed = 0; S.view = null; S.photoCtx = null; S.edits.photo = {};
    showPhoto(); refreshPanels(); update(true);
    fetchPhotoCtx();
  } catch (err) {
    $('photoErr').textContent = 'Non riesco ad aprire questa immagine. Se è una foto HEIC dell’iPhone, esportala in JPEG oppure scattala direttamente da qui.';
    $('photoErr').hidden = false;
  }
}
async function fetchPhotoCtx() {
  const ph = S.photo; if (!ph) return;
  S.photoBusy = true; $('photoCtxBox').hidden = false;
  let pos = ph.gps, posSrc = 'foto (GPS)';
  try {
    if (!pos) {
      setCtxStatus('photoStatus', 'La foto non ha la posizione: chiedo quella del dispositivo…');
      pos = await getPosition(); posSrc = 'dispositivo (la foto non ha GPS)';
    }
    // se la foto è di adesso (meno di 90 minuti) uso i dati "correnti", altrimenti quelli orari di quel giorno
    const n = ph.naive, then = new Date(n.y, n.m - 1, n.d, n.h, n.mi);
    const recent = Math.abs(Date.now() - then.getTime()) < 90 * 60000;
    const c = await A.collect({ lat: pos.lat, lon: pos.lon, naive: recent ? null : n, onStep: m => setCtxStatus('photoStatus', m) });
    if (S.photo !== ph) return;                    // nel frattempo è arrivata un'altra foto
    c.kind = 'photo'; c.posSrc = posSrc;
    if (recent) c.abs = new Date(Date.UTC(n.y, n.m - 1, n.d, n.h, n.mi) - c.offset * 1000);
    S.photoCtx = c;
    setCtxStatus('photoStatus', c.notes.length ? 'Fatto, con qualche lacuna: ' + c.notes.join('; ') + '.' : 'Dati di ' + (c.place || 'quel luogo') + ', ' + fmtDate(c.abs, c.offset) + '.');
  } catch (err) {
    if (S.photo !== ph) return;
    // senza posizione: valori predefiniti, dichiarati come tali
    const src = {}; Object.keys(A.DEFAULTS).forEach(k => { src[k] = 'predefinito'; });
    const then = new Date(ph.naive.y, ph.naive.m - 1, ph.naive.d, ph.naive.h, ph.naive.mi);
    S.photoCtx = { kind: 'photo', vals: Object.assign({}, A.DEFAULTS), src: src, abs: then, offset: null, place: '', meteo: null, notes: [], posSrc: 'nessuna' };
    setCtxStatus('photoStatus', err.message + ' Uso valori predefiniti: correggili nei sensori.', true);
  } finally {
    if (S.photo === ph) { S.photoBusy = false; refreshPanels(); update(true); }
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
  const ex = p.exif || {}, n = p.naive;
  const rows = [
    ['Luce', num(p.lux, 0) + ' lux' + (p.luxSrc === 'exif' ? '<span class="tag">EXIF · EV ' + num(p.ev, 1) + '</span>' : '<span class="tag warn">stima grezza</span>')],
    ['Colore luce', num(p.a.kelvin, 0) + ' K<span class="tag">bilanciamento stimato</span>'],
    ['Luminosità', num(p.a.brightness)],
    ['Contrasto', num(p.a.contrast)],
    ['Saturazione', num(p.a.saturation)],
    ['Dettaglio', num(p.a.detail)],
    ['Scattata', n.d + '/' + n.m + '/' + n.y + ' · ' + (n.h < 10 ? '0' : '') + n.h + ':' + (n.mi < 10 ? '0' : '') + n.mi + (p.dateSrc === 'exif' ? '' : '<span class="tag warn">data del file</span>')],
    ['Posizione', p.gps ? num(p.gps.lat, 4) + ', ' + num(p.gps.lon, 4) + '<span class="tag">GPS</span>' : '<span class="tag warn">assente</span>']
  ];
  if (ex.exposure && ex.fnumber && ex.iso) rows.push(['Esposizione', '1/' + Math.round(1 / ex.exposure) + ' s · f/' + num(ex.fnumber, 1) + ' · ISO ' + ex.iso]);
  $('reads').innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
}
$('file').addEventListener('change', e => { loadPhoto(e.target.files[0]); e.target.value = ''; });
const drop = $('drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadPhoto(f); });

/* riepilogo di un contesto (meteo, aria, fonti) */
function ctxRows(c) {
  if (!c || c.kind === 'sim') return '';
  const m = c.meteo || {};
  const rows = [];
  rows.push(['Luogo', (c.place || 'senza nome') + ' <small>(' + num(c.lat, 3) + ', ' + num(c.lon, 3) + (c.acc ? ', ±' + Math.round(c.acc) + ' m' : '') + ')</small>']);
  rows.push(['Momento', fmtDate(c.abs, c.offset)]);
  if (m.elev != null) rows.push(['Sole', num(m.elev, 0) + '° sull’orizzonte · ' + m.phase]);
  if (m.code != null) rows.push(['Cielo', A.weatherText(m.code) + (m.cloud != null ? ', nubi ' + Math.round(m.cloud) + ' %' : '') + (m.wind != null ? ', vento ' + Math.round(m.wind) + ' km/h' : '') + (m.rain ? ', pioggia ' + num(m.rain, 1) + ' mm' : '')]);
  if (m.aqi != null) rows.push(['Aria', 'qualità ' + A.aqiText(m.aqi) + ' (indice europeo ' + Math.round(m.aqi) + ')' + (m.pm25 != null ? ' · PM2,5 ' + num(m.pm25, 0) + ' µg/m³' : '')]);
  if (m.osm) {
    const pl = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const roads = m.osm.big + m.osm.mid, rail = m.osm.rail, loc = m.osm.food + m.osm.night;
    rows.push(['Intorno', [roads ? pl(roads, 'strada trafficata', 'strade trafficate') : 'nessuna strada trafficata', rail ? pl(rail, 'binario', 'binari') : '', loc ? pl(loc, 'locale', 'locali') : ''].filter(Boolean).join(', ')]);
  }
  return rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
}
function refreshPanels() {
  const nowHtml = ctxRows(S.now);
  $('nowReads').hidden = !nowHtml || S.sim !== null; $('nowReads').innerHTML = nowHtml;
  const ph = ctxRows(S.photoCtx);
  $('photoReads').hidden = !ph; $('photoReads').innerHTML = ph;
  $('photoCtxBox').hidden = !S.photo;
  $('listen').disabled = S.nowBusy;
  $('compareBox').hidden = !(S.mode === 'foto' && S.photo && S.photoCtx);
  if (S.mode === 'sens' && S.sim !== null && !S.now) setCtxStatus('nowStatus', 'Stai guardando una scena simulata.');
  SCENES.forEach((s, i) => $('sc' + i).setAttribute('aria-pressed', String(S.mode === 'sens' && S.sim === i)));
  $('sensLead').textContent = S.mode === 'foto'
    ? 'Luce e colore della luce arrivano dalla foto, il resto dai dati aperti del luogo e del momento dello scatto. Puoi correggere ogni valore.'
    : (S.sim !== null ? 'Valori della scena simulata. Puoi spostarli liberamente.' : 'Valori ricavati dai dati aperti. Sono misure di esterno: se sei al chiuso, correggili a mano.');
  $('resetEdits').hidden = !Object.keys(S.edits[ctxKey()]).length;
  syncSensors();
}

/* ---------- controlli ---------- */
function buildScenes() {
  const box = $('scenes');
  SCENES.forEach((s, i) => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = s.n; b.id = 'sc' + i;
    b.onclick = () => { S.sim = i; S.edits.sim = {}; S.note = s.note; S.reseed = 0; S.view = null; refreshPanels(); update(true); };
    box.appendChild(b);
  });
}
function buildSensors() {
  const box = $('sensors');
  SENS.forEach(s => {
    const d = document.createElement('div'); d.className = 'ctl';
    d.innerHTML = '<div class="top"><label for="s_' + s.k + '">' + s.l + '</label><output id="o_' + s.k + '" for="s_' + s.k + '"></output></div>' +
      '<input type="range" id="s_' + s.k + '" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '">';
    box.appendChild(d);
    const inp = d.querySelector('input');
    inp.addEventListener('input', () => {
      if (!activeCtx()) return;
      S.edits[ctxKey()][s.k] = { v: s.fromS ? s.fromS(+inp.value) : +inp.value, src: 'a mano' };
      S.view = null; $('resetEdits').hidden = false; syncSensors(); update(false);
    });
  });
}
function syncSensors() {
  const ef = effective();
  SENS.forEach(s => {
    const inp = $('s_' + s.k), out = $('o_' + s.k);
    const lock = S.mode === 'foto' && s.photo;
    inp.disabled = !ef || lock;
    if (!ef) { out.innerHTML = '—'; return; }
    const v = ef.vals[s.k];
    if (document.activeElement !== inp) inp.value = s.toS ? s.toS(v) : v;
    out.innerHTML = s.fmt(v) + '<em>' + (ef.src[s.k] || '') + '</em>';
  });
}
$('resetEdits').onclick = () => { S.edits[ctxKey()] = {}; refreshPanels(); update(false); };
function buildEmotions() {
  const box = $('emotions');
  EMO.forEach(m => {
    const d = document.createElement('div'); d.className = 'ctl';
    d.innerHTML = '<div class="top"><label for="e_' + m.k + '">' + m.l + '</label><output id="oe_' + m.k + '" for="e_' + m.k + '"></output></div>' +
      '<input type="range" id="e_' + m.k + '" min="0" max="1" step="0.01"><div class="maps">' + m.m + '</div>';
    box.appendChild(d);
    const inp = d.querySelector('input');
    inp.addEventListener('input', () => { if (!S.tune) return; S.hand[m.k] = +inp.value; S.view = null; update(false); });
  });
}
function syncEmotions(sh) {
  const e = sh.ready ? sh.emo : null;
  EMO.forEach(m => {
    const inp = $('e_' + m.k);
    inp.disabled = !S.tune || !!S.view || !sh.ready;
    if (e) { if (document.activeElement !== inp) inp.value = e[m.k]; $('oe_' + m.k).textContent = num(e[m.k]); } else $('oe_' + m.k).textContent = '—';
  });
  $('emoLead').textContent = S.tune
    ? 'Taratura a mano attiva: lo stato d’animo lo decidi tu, i sensori sono ignorati.'
    : (S.mode === 'foto' ? 'Calcolato dai dati del luogo, poi spostato dalle qualità della foto.' : 'Calcolato dai sensori.');
}
$('tune').addEventListener('change', () => {
  S.tune = $('tune').checked;
  if (S.tune) { S.tune = false; const sh = shot(); S.tune = true; S.hand = Object.assign({}, sh.ready ? sh.emo : { valenza: .5, energia: .5, tensione: .3, intimita: .5, chiave: .6, calore: .5 }); }
  S.view = null; update(true);
});
$('reseed').onclick = () => { if (S.view) return; S.reseed++; update(true); };
$('notePrev').onclick = () => { if (S.view) return; S.note = (S.note + NOTES.length - 1) % NOTES.length; update(false); };
$('noteNext').onclick = () => { if (S.view) return; S.note = (S.note + 1) % NOTES.length; update(false); };
$('backLive').onclick = () => { S.view = null; renderAlbum(); update(true); };
$('peso').value = S.peso;
$('o_peso').textContent = Math.round(S.peso * 100) + ' %';
$('peso').addEventListener('input', () => {
  S.peso = +$('peso').value; $('o_peso').textContent = Math.round(S.peso * 100) + ' %';
  try { localStorage.setItem('atmosfera.prefs.v1', JSON.stringify({ peso: S.peso })); } catch (e) {}
  update(false);
});

/* ---------- descrizione della grammatica ---------- */
function swatch(ids) { return '<span class="sw">' + ids.map(i => '<i style="background:rgb(' + RGB[i].join(',') + ')" title="' + E.INK_NAMES[i] + '"></i>').join('') + '</span>'; }
function describe(res, ms, sh) {
  const g = res.g, e = g.e;
  const rows = [
    ['Tavolozza', swatch(g.ramp) + (PAL_TXT[g.palette] || g.palette) + (g.lowKey ? ', in chiave bassa' : '') + '; accento ' + swatch([g.acc]) + E.INK_NAMES[g.acc]],
    ['Composizione', ARCH_TXT[g.archeName] + (res.nuclei.length > 1 ? ' (' + res.nuclei.length + ' nuclei)' : '')],
    ['Fondo', g.cppnBands ? 'campiture a ' + g.cppnBands + ' gradini, nette' : (g.groundAmt > 0.15 ? 'velature morbide e piene' : 'velature leggere, molta carta')],
    ['Linee', g.lines + ' linee, ' + (g.ribbon ? 'larghe e lente' : (e.energia > 0.65 ? 'fitte e turbolente' : 'sottili')) + ', ' + (g.orbit > 0.6 ? 'girano attorno al nucleo' : (g.orbit > 0.35 ? 'in parte puntano al nucleo' : 'puntano dritte al nucleo'))],
    ['Nucleo', (g.attrKnot > 0.55 ? 'nodi stretti e contrastati' : 'anse ampie e morbide') + (g.pulse ? ', ' + g.pulse + ' anelli di pulsazione' : '')],
    ['Accenti', g.accents + (g.accents === 1 ? ' forma' : ' forme') + (e.tensione > 0.55 ? ', spesso schegge' : (e.intimita > 0.6 ? ', vicine al nucleo' : ''))],
    ['Retino', g.grain < 0.3 ? 'ordinato, quieto' : (g.grain < 0.6 ? 'misto' : 'granuloso, vibrante')],
    ['Origine', MODE_TXT[sh.mode] + (sh.tuned ? ' · taratura a mano' : '') + ' · seme ' + sh.seed.toString(16).toUpperCase() + ' · ' + ms.toFixed(0) + ' ms']
  ];
  $('gram').innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
}

/* ---------- aggiornamento ---------- */
let raf = 0, slowT = 0, slowJob = 0;
function update(full) {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const sh = shot();
    $('albumBanner').hidden = !S.view;
    $('emptyMsg').hidden = sh.ready; if (!sh.ready) $('emptyMsg').textContent = sh.msg;
    ['reseed', 'save'].forEach(id => { $(id).disabled = !sh.ready || !!S.view; });
    ['png', 'bin'].forEach(id => { $(id).disabled = !sh.ready; });
    $('noteNow').textContent = NOTES[S.view ? S.view.note : S.note];
    syncEmotions(sh); syncSensors();
    if (!sh.ready) {
      $('mood').innerHTML = '—<small>in attesa dei dati</small>';
      $('meta').textContent = '240 × 240 px · 6 inchiostri';
      $('gram').innerHTML = '<dt>Stato</dt><dd>' + sh.msg + '</dd>';
      clearThumbs(); return;
    }
    const t0 = performance.now();
    const res = stamp(sh, buf, true);
    paint($('eink'), buf);
    describe(res, performance.now() - t0, sh);
    const how = S.view ? 'dall’album · ' + MODE_TXT[sh.mode] : (sh.tuned ? 'taratura a mano' : (sh.mode === 'foto' ? 'letto da immagine e sensori' : (sh.mode === 'sim' ? 'scena simulata' : 'letto dai sensori, qui e ora')));
    $('mood').innerHTML = moodText(sh.emo) + '<small>' + how + '</small>';
    $('meta').textContent = fmtDate(sh.date, sh.offset) + (sh.place ? ' · ' + sh.place : '');
    clearTimeout(slowT);
    slowT = setTimeout(slowRenders, full ? 30 : 260);
  });
}

/* striscia dei semi, confronto e atlante: disegnati a pezzi per non bloccare la pagina */
const stripC = [];
for (let i = 0; i < 4; i++) {
  const b = document.createElement('button'); b.className = 'thumb'; b.setAttribute('aria-label', 'Prova il seme alternativo ' + (i + 1));
  const c = document.createElement('canvas'); c.width = E.W; c.height = E.H; b.appendChild(c); $('strip').appendChild(b);
  b.onclick = () => { S.view = null; S.reseed += i + 1; update(true); };
  stripC.push(c);
}
const V = [0.82, 0.55, 0.22], EN = [0.15, 0.5, 0.85], atlasC = [];
function clearThumbs() { stripC.concat(atlasC.map(a => a.cv)).forEach(c => c.getContext('2d').clearRect(0, 0, E.W, E.H)); atlasC.forEach(a => { a.lab.textContent = ''; }); }
(function buildAtlas() {
  const at = $('atlas');
  const corner = document.createElement('div'); corner.className = 'corner'; at.appendChild(corner);
  ['energia bassa', 'energia media', 'energia alta'].forEach(t => { const d = document.createElement('div'); d.className = 'ax col'; d.textContent = t; at.appendChild(d); });
  ['valenza alta', 'valenza media', 'valenza bassa'].forEach((t, r) => {
    const d = document.createElement('div'); d.className = 'ax rowl'; d.textContent = t; at.appendChild(d);
    for (let c = 0; c < 3; c++) {
      const cell = document.createElement('div'); cell.className = 'cell';
      const b = document.createElement('button'); b.className = 'thumb';
      const cv = document.createElement('canvas'); cv.width = E.W; cv.height = E.H; b.appendChild(cv);
      const lab = document.createElement('span');
      cell.appendChild(b); cell.appendChild(lab); at.appendChild(cell);
      b.onclick = () => {
        const sh = shot(); if (!sh.ready) return;
        S.hand = Object.assign({}, sh.emo, { valenza: V[r], energia: EN[c] });
        S.tune = true; $('tune').checked = true; S.view = null; update(true);
        window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
      };
      atlasC.push({ cv: cv, lab: lab, b: b, r: r, c: c });
    }
  });
})();
function slowRenders() {
  const job = ++slowJob, sh = shot(); if (!sh.ready) return;
  const tasks = [];
  if (S.mode === 'foto' && S.photo && S.photoCtx && !S.view && sh.base) {
    const imgEmo = sh.tuned ? sh.auto : sh.emo;
    tasks.push(() => { E.render(sh.base, sh.seed, buf); paint($('cmpA'), buf); });
    tasks.push(() => { E.render(imgEmo, sh.seed, buf); paint($('cmpB'), buf); });
  }
  stripC.forEach((c, i) => tasks.push(() => { E.render(sh.emo, (sh.seed + (i + 1) * 104729) >>> 0, buf); paint(c, buf); }));
  atlasC.forEach(a => tasks.push(() => {
    const ee = Object.assign({}, sh.emo, { valenza: V[a.r], energia: EN[a.c] });
    E.render(ee, sh.seed, buf); paint(a.cv, buf);
    a.lab.textContent = moodText(ee); a.b.setAttribute('aria-label', 'Prova ' + moodText(ee));
  }));
  (function next() { if (job !== slowJob || !tasks.length) return; tasks.shift()(); setTimeout(next, 0); })();
}

/* ---------- album (solo in questo browser) ---------- */
const AKEY = 'atmosfera.album.v1';
function loadAlbum() { try { const a = JSON.parse(localStorage.getItem(AKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function saveAlbum(a) { try { localStorage.setItem(AKEY, JSON.stringify(a)); return true; } catch (e) { return false; } }
let album = loadAlbum(), pendingDel = null;
$('save').onclick = () => {
  const sh = shot(); if (!sh.ready || S.view) return;
  const c = activeCtx();
  const entry = {
    id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), v: 2,
    mode: sh.mode, tuned: !!sh.tuned, date: sh.date.toISOString(), offset: sh.offset, place: sh.place,
    pos: c && typeof c.lat === 'number' ? { lat: +c.lat.toFixed(3), lon: +c.lon.toFixed(3) } : null,
    note: sh.note, seed: sh.seed, emo: sh.emo, sens: sh.vals,
    meteo: c && c.meteo ? { code: c.meteo.code, cloud: c.meteo.cloud, aqi: c.meteo.aqi } : null,
    photo: sh.mode === 'foto' ? { thumb: S.photo.thumb, lux: S.photo.lux, luxSrc: S.photo.luxSrc, a: S.photo.a, peso: S.peso } : null
  };
  album.unshift(entry);
  if (!saveAlbum(album)) { album.shift(); status('Non riesco a salvare: lo spazio del browser è pieno o bloccato.'); return; }
  renderAlbum(); status('Salvato nell’album.');
};
function renderAlbum() {
  const box = $('album'); box.innerHTML = '';
  if (!album.length) { box.innerHTML = '<p class="emptytxt">Ancora nessuno scatto. Premi “Salva nell’album” per conservare quello che vedi.</p>'; return; }
  const tmp = new Uint8Array(E.W * E.H);
  album.forEach(en => {
    const it = document.createElement('div'); it.className = 'item';
    const b = document.createElement('button'); b.className = 'thumb'; b.setAttribute('aria-label', 'Apri ' + moodText(en.emo));
    if (S.view && S.view.id === en.id) b.setAttribute('aria-current', 'true');
    const c = document.createElement('canvas'); c.width = E.W; c.height = E.H; b.appendChild(c);
    E.render(en.emo, en.seed, tmp); paint(c, tmp);
    b.onclick = () => { S.view = en; renderAlbum(); update(true); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); };
    const capEl = document.createElement('div'); capEl.className = 'cap';
    capEl.innerHTML = '<b>' + moodText(en.emo) + '</b>' + fmtDate(new Date(en.date), typeof en.offset === 'number' ? en.offset : undefined) +
      (en.place ? '<br>' + en.place : '') + '<br>' + (MODE_TXT[en.mode] || en.mode) + (en.tuned ? ', tarato' : '') + (en.note ? ' · ' + NOTES[en.note] : '');
    const del = document.createElement('button'); del.className = 'del'; del.textContent = 'Elimina';
    del.onclick = () => {
      if (pendingDel !== en.id) { pendingDel = en.id; del.textContent = 'Conferma eliminazione'; del.classList.add('confirm'); setTimeout(() => { if (pendingDel === en.id) { pendingDel = null; renderAlbum(); } }, 4000); return; }
      album = album.filter(x => x.id !== en.id); pendingDel = null; saveAlbum(album);
      if (S.view && S.view.id === en.id) S.view = null;
      renderAlbum(); update(true); status('Eliminato.');
    };
    it.appendChild(b); it.appendChild(capEl);
    if (en.photo && en.photo.thumb) { const im = document.createElement('img'); im.src = en.photo.thumb; im.alt = 'Foto di partenza'; im.style.cssText = 'width:44px;border-radius:4px;border:1px solid var(--line)'; it.appendChild(im); }
    it.appendChild(del);
    box.appendChild(it);
  });
}
$('exportAlbum').onclick = () => {
  if (!album.length) { status('L’album è vuoto.'); return; }
  download(new Blob([JSON.stringify({ app: 'atmosfera', v: 2, album: album }, null, 1)], { type: 'application/json' }), 'atmosfera-album.json');
};
$('importAlbum').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const items = (j && Array.isArray(j.album) ? j.album : []).filter(x => x && x.emo && typeof x.seed === 'number' && x.date);
    const known = new Set(album.map(x => x.id)); let n = 0;
    items.forEach(x => { if (!known.has(x.id)) { album.push(x); n++; } });
    album.sort((a, b) => (b.date > a.date ? 1 : -1));
    saveAlbum(album); renderAlbum(); status(n ? 'Importati ' + n + ' scatti.' : 'Nessuno scatto nuovo nel file.');
  } catch (err) { status('Il file non è un album di Atmosfera.'); }
});

/* ---------- esportazioni ---------- */
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function fileStem(sh) { return 'atmosfera-' + sh.date.toISOString().slice(0, 16).replace(/[:T]/g, '-') + '-' + sh.seed.toString(16); }
$('png').onclick = () => {
  const sh = shot(); if (!sh.ready) return;
  const out = new Uint8Array(E.W * E.H); stamp(sh, out, true);
  const Z = 4, c = document.createElement('canvas'); c.width = E.W * Z; c.height = E.H * Z;
  const small = document.createElement('canvas'); small.width = E.W; small.height = E.H; paint(small, out);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, c.width, c.height);
  c.toBlob(b => { if (b) download(b, fileStem(sh) + '.png'); }, 'image/png');
};
$('bin').onclick = () => {
  const sh = shot(); if (!sh.ready) return;
  const out = new Uint8Array(E.W * E.H); stamp(sh, out, true);
  const packed = new Uint8Array(out.length / 2);           // 2 pixel per byte, prima il nibble alto
  for (let i = 0; i < packed.length; i++) packed[i] = (PANEL_CODE[out[2 * i]] << 4) | PANEL_CODE[out[2 * i + 1]];
  download(new Blob([packed], { type: 'application/octet-stream' }), fileStem(sh) + '.bin');
  status('Buffer da 28.800 byte esportato. Verifica i codici colore sul datasheet del pannello.');
};

/* ---------- avvio ---------- */
buildScenes(); buildSensors(); buildEmotions(); renderAlbum();
setMode('sens');
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => update(false));
})();
