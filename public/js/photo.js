/* =====================================================================
   ATMOSFERA — LETTURA "DA FOTO"
   Funzioni pure: lavorano su byte e pixel, niente DOM.
   Girano nel browser e in Node (per i test).

   Dalla foto ricaviamo due cose diverse:
   1. Sostituti dei sensori di luce
        - luce (lux): dall'esposizione EXIF se c'è, altrimenti stimata
        - colore della luce (K): bilanciamento del bianco stimato dai pixel
   2. Qualità visive, che spostano il vettore emotivo
        - luminosità, contrasto, saturazione, dettaglio (bordi)
   Rumore, temperatura, umidità e CO₂ la foto non li conosce:
   restano sui cursori.
   ===================================================================== */
(function (root) {
'use strict';

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/* ---------- EXIF minimo (JPEG) ----------
   Legge solo i campi che servono: tempo, diaframma, ISO, data. */
function parseExif(buffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;          // non è un JPEG
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xFF00) !== 0xFF00) return null;
    const len = v.getUint16(off + 2);
    if (marker === 0xFFE1 && off + 10 <= v.byteLength &&
        v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) { // "Exif\0\0"
      return readTiff(v, off + 10);
    }
    if (marker === 0xFFDA) break;                                         // inizio dati immagine
    off += 2 + len;
  }
  return null;
}
function readTiff(v, t0) {
  const le = v.getUint16(t0) === 0x4949;
  const u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
  if (u16(t0 + 2) !== 42) return null;
  const out = {};
  function ifd(start, cb) {
    if (start <= 0 || t0 + start + 2 > v.byteLength) return;
    const n = u16(t0 + start);
    for (let i = 0; i < n; i++) {
      const e = t0 + start + 2 + i * 12;
      if (e + 12 > v.byteLength) return;
      cb(u16(e), u16(e + 2), u32(e + 4), e + 8);
    }
  }
  function rational(valOff) { const o = t0 + u32(valOff); if (o + 8 > v.byteLength) return null; const d = u32(o + 4); return d ? u32(o) / d : null; }
  function ascii(count, valOff) {
    const o = count > 4 ? t0 + u32(valOff) : valOff; let s = '';
    for (let i = 0; i < count - 1 && o + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(o + i));
    return s;
  }
  let exifPtr = 0, gpsPtr = 0;
  ifd(u32(t0 + 4), (tag, type, count, valOff) => {
    if (tag === 0x8769) exifPtr = u32(valOff);
    if (tag === 0x8825) gpsPtr = u32(valOff);
    if (tag === 0x0132 && !out.date) out.date = ascii(count, valOff);       // DateTime
    if (tag === 0x0110) out.model = ascii(count, valOff);
  });
  ifd(exifPtr, (tag, type, count, valOff) => {
    if (tag === 0x829A) out.exposure = rational(valOff);                   // ExposureTime (s)
    else if (tag === 0x829D) out.fnumber = rational(valOff);               // FNumber
    else if (tag === 0x8827) out.iso = type === 3 ? u16(valOff) : u32(valOff);
    else if (tag === 0x9003) out.date = ascii(count, valOff);              // DateTimeOriginal
    else if (tag === 0x9011) out.offset = ascii(count, valOff);            // OffsetTimeOriginal, es. "+02:00"
  });
  // GPS: latitudine e longitudine in gradi, minuti, secondi
  const gps = {};
  ifd(gpsPtr, (tag, type, count, valOff) => {
    if (tag === 1 || tag === 3) gps[tag] = String.fromCharCode(v.getUint8(valOff));
    if ((tag === 2 || tag === 4) && count === 3) {
      const o = t0 + u32(valOff); if (o + 24 > v.byteLength) return;
      const r = k => { const d = u32(o + k * 8 + 4); return d ? u32(o + k * 8) / d : 0; };
      gps[tag] = r(0) + r(1) / 60 + r(2) / 3600;
    }
  });
  if (gps[2] != null && gps[4] != null) {
    const lat = gps[2] * (gps[1] === 'S' ? -1 : 1), lon = gps[4] * (gps[3] === 'W' ? -1 : 1);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) { out.lat = lat; out.lon = lon; }
  }
  return out;
}
// "2026:10:08 14:33:02" → Date (ora locale)
function exifDate(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}
// stessa data come ora "da orologio" del luogo dello scatto: {y,m,d,h,mi}
function exifNaive(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(s || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5] } : null;
}

/* ---------- luce dall'esposizione ----------
   EV100 = log2(N²/t) − log2(ISO/100);  illuminamento ≈ 2,5 · 2^EV100 lux
   (formula degli esposimetri a luce incidente, costante C = 250) */
function luxFromExif(x) {
  if (!x || !x.exposure || !x.fnumber || !x.iso) return null;
  const ev = Math.log2(x.fnumber * x.fnumber / x.exposure) - Math.log2(x.iso / 100);
  return { lux: clamp(2.5 * Math.pow(2, ev), 0.5, 120000), ev: ev };
}

/* ---------- analisi dei pixel ----------
   data: RGBA (Uint8ClampedArray) di un'immagine piccola, w×h */
function srgbToLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function cctFromLinear(r, g, b) {
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const s = X + Y + Z; if (s <= 0) return 5000;
  const x = X / s, y = Y / s;
  const n = (x - 0.3320) / (0.1858 - y);                                   // McCamy
  return clamp(449 * n * n * n + 3525 * n * n + 6823.3 * n + 5520.33, 1800, 10000);
}
function analyzePixels(data, w, h) {
  const N = w * h, LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) LUT[i] = srgbToLin(i);
  const gy = new Float32Array(N);                       // luminanza percettiva 0..1
  let sR = 0, sG = 0, sB = 0, sY = 0, sY2 = 0, sSat = 0;
  const lumHist = new Uint32Array(64);
  let hash = 0x811C9DC5;                                // FNV-1a: stessa foto → stesso seme
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const rl = LUT[r], gl = LUT[g], bl = LUT[b];
    sR += rl; sG += gl; sB += bl;
    const yp = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    gy[i] = yp; sY += yp; sY2 += yp * yp;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sSat += mx ? (mx - mn) / mx : 0;
    lumHist[Math.min(63, (yp * 64) | 0)]++;
    if ((i & 7) === 0) { hash ^= (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10); hash = Math.imul(hash, 0x01000193); }
  }
  const mean = sY / N, sd = Math.sqrt(Math.max(0, sY2 / N - mean * mean));

  // bianco: metà "mondo grigio", metà pixel più chiari non bruciati
  let cut = 0, acc = 0; for (let k = 63; k >= 0; k--) { acc += lumHist[k]; if (acc > N * 0.06) { cut = k / 64; break; } }
  let wR = 0, wG = 0, wB = 0, wn = 0;
  for (let i = 0; i < N; i++) {
    if (gy[i] >= cut && gy[i] < 0.97) { wR += LUT[data[i * 4]]; wG += LUT[data[i * 4 + 1]]; wB += LUT[data[i * 4 + 2]]; wn++; }
  }
  const kGray = cctFromLinear(sR / N, sG / N, sB / N);
  const kWhite = wn > N * 0.01 ? cctFromLinear(wR / wn, wG / wn, wB / wn) : kGray;
  const kelvin = Math.round(0.5 * kGray + 0.5 * kWhite);

  // dettaglio: media del gradiente (Sobel) sulla luminanza
  let sE = 0, ne = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = gy[i - w + 1] + 2 * gy[i + 1] + gy[i + w + 1] - gy[i - w - 1] - 2 * gy[i - 1] - gy[i + w - 1];
    const gv = gy[i + w - 1] + 2 * gy[i + w] + gy[i + w + 1] - gy[i - w - 1] - 2 * gy[i - w] - gy[i - w + 1];
    sE += Math.sqrt(gx * gx + gv * gv); ne++;
  }
  const edge = ne ? sE / ne : 0;

  return {
    brightness: mean,                                   // 0..1
    contrast: clamp(sd / 0.3, 0, 1),                    // 0..1
    saturation: sSat / N,                               // 0..1
    detail: clamp(edge / 0.35, 0, 1),                   // 0..1
    kelvin: kelvin,
    seed: hash >>> 0
  };
}

/* luce senza EXIF: le foto sono esposte in automatico, quindi la luminosità
   dice poco. È una stima grezza e la segnaliamo come tale. */
function luxGuess(brightness) { return Math.round(Math.pow(10, 0.6 + 3.6 * Math.pow(brightness, 1.15))); }

/* ---------- foto → vettore emotivo ----------
   base: emozioni calcolate dai sensori (con luce e K presi dalla foto)
   peso: quanto le qualità visive spostano il risultato (0..1) */
function blendEmotion(base, a, peso) {
  const t = clamp(peso, 0, 1);
  const lerp = (x, y) => clamp(x + (y - x) * t, 0, 1);
  return {
    valenza:  lerp(base.valenza,  0.20 + 0.45 * a.saturation + 0.35 * a.brightness),
    energia:  lerp(base.energia,  0.10 + 0.70 * a.detail + 0.20 * a.saturation),
    tensione: lerp(base.tensione, 0.60 * a.contrast + 0.40 * a.detail * (1 - a.saturation)),
    intimita: lerp(base.intimita, 0.55 * (1 - a.brightness) + 0.45 * (1 - a.detail)),
    chiave:   lerp(base.chiave,   a.brightness),
    calore:   base.calore
  };
}

const API = { parseExif, exifDate, exifNaive, luxFromExif, analyzePixels, luxGuess, blendEmotion, cctFromLinear };
if (typeof module !== 'undefined') module.exports = API; else root.AtmosferaPhoto = API;
})(this);
