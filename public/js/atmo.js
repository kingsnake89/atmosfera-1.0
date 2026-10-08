/* =====================================================================
   ATMOSFERA — DATI APERTI AL POSTO DEI SENSORI
   Finché non c'è l'hardware, i "sensori" si ricavano da una posizione
   e da un istante, usando fonti aperte e gratuite:

     temperatura, umidità, nuvole, radiazione  → Open-Meteo (meteo)
     CO₂, indice europeo della qualità dell'aria → Open-Meteo (CAMS)
     nome del luogo                              → OpenStreetMap Nominatim
     rumore (stima)                              → OpenStreetMap Overpass
     luce e colore della luce                    → posizione del sole + nuvole + radiazione

   Sono dati di ESTERNO: in una stanza luce, temperatura e CO₂ sono diversi.
   Ogni valore porta con sé la sua fonte, e si può correggere a mano.

   Le funzioni di calcolo sono pure (testabili in Node);
   le funzioni di rete usano fetch e girano nel browser.
   ===================================================================== */
(function (root) {
'use strict';

// indirizzi configurabili (la policy di Nominatim chiede di poterli cambiare)
const ENDPOINTS = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  archive:  'https://archive-api.open-meteo.com/v1/archive',
  air:      'https://air-quality-api.open-meteo.com/v1/air-quality',
  reverse:  'https://nominatim.openstreetmap.org/reverse',
  overpass: 'https://overpass-api.de/api/interpreter'
};
const DEFAULTS = { lux: 300, kelvin: 4000, db: 45, temp: 20, hum: 50, co2: 425, aqi: null };
const WVARS = ['temperature_2m', 'relative_humidity_2m', 'cloud_cover', 'shortwave_radiation', 'weather_code', 'wind_speed_10m', 'precipitation'];

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function pad(n) { return (n < 10 ? '0' : '') + n; }

/* ---------- sole ----------
   Elevazione del sole in gradi per un istante assoluto (Date) e una posizione.
   Formule approssimate (precisione ~0,5°), bastano per la luce. */
function solarElevation(date, lat, lon) {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = ((357.529 + 0.98560028 * d) % 360) * rad;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const ha = (gmst * 15 + lon) * rad - ra;
  const la = lat * rad;
  return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) / rad;
}

/* ---------- luce ----------
   giorno: radiazione globale (W/m²) × ~115 lux per W/m²
   crepuscolo: log10(lux) ≈ 2,6 + 0,35 · elevazione  (0° ≈ 400 lux, −6° ≈ 3 lux)
   notte: pochi lux (luna, lampioni)
   colore: basso e caldo all'alba e al tramonto, più freddo a sole alto,
   ~6500 K col cielo coperto, ~3000 K di notte (luci artificiali) */
function lightModel(elev, radiation, cloud) {
  const cl = clamp((cloud || 0) / 100, 0, 1);
  let lux, kelvin, phase;
  if (elev >= -6) {
    const twilight = Math.pow(10, 2.6 + 0.35 * Math.min(elev, 4)) * (1 - 0.6 * cl);
    lux = Math.max(twilight, radiation > 1 ? radiation * 115 : 0);
    let k = elev < 6 ? 2400 + 1200 * (elev + 6) / 12 : 3600 + 2200 * smooth(6, 45, elev);
    kelvin = k + (6500 - k) * 0.8 * cl * smooth(-3, 8, elev);
    phase = elev < 0 ? 'crepuscolo' : (elev < 8 ? (cl > 0.7 ? 'sole basso, coperto' : 'sole basso') : (cl > 0.7 ? 'giorno coperto' : 'pieno giorno'));
  } else {
    lux = 2; kelvin = 3000; phase = 'notte';
  }
  return { lux: Math.round(clamp(lux, 0.5, 120000)), kelvin: Math.round(clamp(kelvin, 1800, 7000)), phase: phase };
}

/* ---------- rumore stimato da OpenStreetMap ----------
   Conta strade, binari e locali vicini e aggiunge l'effetto dell'ora.
   È una stima di massima: il microfono (o il sensore vero) la sostituisce. */
function noiseFromOSM(elements, hour) {
  let big = 0, mid = 0, small = 0, rail = 0, food = 0, night = 0;
  for (const el of elements || []) {
    const t = el.tags || {};
    if (/^(motorway|trunk|primary)(_link)?$/.test(t.highway || '')) big++;
    else if (/^(secondary|tertiary)$/.test(t.highway || '')) mid++;
    else if (/^(residential|unclassified|living_street|service)$/.test(t.highway || '')) small++;
    if (/^(rail|tram|subway|light_rail)$/.test(t.railway || '')) rail++;
    if (/^(restaurant|cafe|fast_food|school)$/.test(t.amenity || '')) food++;
    if (/^(bar|pub|nightclub)$/.test(t.amenity || '')) night++;
  }
  const sat = (x, n) => Math.min(1, x / n);
  let db = 34 + 22 * sat(big, 2) + 9 * sat(mid, 3) + 4 * sat(small, 6) + 8 * sat(rail, 2) + 6 * sat(food, 8) + 4 * sat(night, 3);
  const h = hour;
  if (h >= 23 || h < 6) db -= 9 - 6 * sat(night, 3);   // di notte cala, tranne vicino ai bar
  else if (h >= 7 && h < 10 || h >= 17 && h < 20) db += 3; // ore di punta
  return { db: Math.round(clamp(db, 28, 85)), counts: { big, mid, small, rail, food, night } };
}

/* ---------- testi ---------- */
function weatherText(code) {
  if (code === 0) return 'sereno';
  if (code === 1) return 'quasi sereno';
  if (code === 2) return 'poco nuvoloso';
  if (code === 3) return 'coperto';
  if (code === 45 || code === 48) return 'nebbia';
  if (code >= 51 && code <= 57) return 'pioviggine';
  if (code >= 61 && code <= 67) return 'pioggia';
  if (code >= 71 && code <= 77) return 'neve';
  if (code >= 80 && code <= 82) return 'rovesci';
  if (code === 85 || code === 86) return 'rovesci di neve';
  if (code >= 95) return 'temporale';
  return '—';
}
function aqiText(a) {
  if (a == null) return '—';
  return a <= 20 ? 'buona' : a <= 40 ? 'discreta' : a <= 60 ? 'moderata' : a <= 80 ? 'scadente' : a <= 100 ? 'pessima' : 'molto pessima';
}
// componenti "da orologio" di un istante in un fuso con offset in secondi
function localParts(abs, offsetSec) {
  const d = new Date(abs.getTime() + offsetSec * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
function isoDay(p) { return p.y + '-' + pad(p.m) + '-' + pad(p.d); }

/* =====================================================================
   RETE
   ===================================================================== */
async function getJSON(url, ms, init) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), ms || 12000) : 0;
  try {
    const r = await fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, init || {}));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { if (t) clearTimeout(t); }
}
function qs(o) { return Object.keys(o).map(k => k + '=' + encodeURIComponent(o[k])).join('&'); }

/* meteo: "adesso" oppure un'ora del passato.
   naive = {y,m,d,h} ora locale del luogo (come nell'EXIF) */
async function fetchWeather(lat, lon, naive) {
  const base = { latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'auto' };
  if (!naive) {
    const j = await getJSON(ENDPOINTS.forecast + '?' + qs(Object.assign(base, { current: WVARS.concat('is_day').join(',') })));
    const c = j.current || {};
    return { at: c.time, offset: j.utc_offset_seconds || 0, temp: c.temperature_2m, hum: c.relative_humidity_2m, cloud: c.cloud_cover,
             rad: c.shortwave_radiation, code: c.weather_code, wind: c.wind_speed_10m, rain: c.precipitation, source: 'Open-Meteo, ora' };
  }
  const day = isoDay(naive), ageDays = (Date.now() - Date.UTC(naive.y, naive.m - 1, naive.d)) / 86400000;
  const useArchive = ageDays > 80;                                   // oltre ~3 mesi: archivio storico (ERA5)
  const url = (useArchive ? ENDPOINTS.archive : ENDPOINTS.forecast) + '?' + qs(Object.assign(base, { hourly: WVARS.join(','), start_date: day, end_date: day }));
  const j = await getJSON(url);
  const H = j.hourly || {}, key = day + 'T' + pad(naive.h) + ':00';
  const i = (H.time || []).indexOf(key);
  if (i < 0) throw new Error('ora non trovata');
  return { at: key, offset: j.utc_offset_seconds || 0, temp: H.temperature_2m[i], hum: H.relative_humidity_2m[i], cloud: H.cloud_cover[i],
           rad: H.shortwave_radiation[i], code: H.weather_code[i], wind: H.wind_speed_10m[i], rain: H.precipitation[i],
           source: useArchive ? 'Open-Meteo, archivio storico' : 'Open-Meteo, dati orari' };
}
async function fetchAir(lat, lon, naive) {
  const base = { latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'auto' };
  const vars = 'carbon_dioxide,european_aqi,pm2_5';
  if (!naive) {
    const j = await getJSON(ENDPOINTS.air + '?' + qs(Object.assign(base, { current: vars })));
    const c = j.current || {};
    return { co2: c.carbon_dioxide, aqi: c.european_aqi, pm25: c.pm2_5 };
  }
  const day = isoDay(naive);
  const j = await getJSON(ENDPOINTS.air + '?' + qs(Object.assign(base, { hourly: vars, start_date: day, end_date: day })));
  const H = j.hourly || {}, i = (H.time || []).indexOf(day + 'T' + pad(naive.h) + ':00');
  if (i < 0) throw new Error('ora non trovata');
  return { co2: H.carbon_dioxide[i], aqi: H.european_aqi[i], pm25: H.pm2_5[i] };
}
const placeCache = {};
async function fetchPlace(lat, lon) {
  const k = lat.toFixed(3) + ',' + lon.toFixed(3);
  if (placeCache[k]) return placeCache[k];
  const j = await getJSON(ENDPOINTS.reverse + '?' + qs({ format: 'jsonv2', lat: lat.toFixed(5), lon: lon.toFixed(5), zoom: 14, 'accept-language': 'it' }), 8000);
  const a = j.address || {};
  const name = a.neighbourhood || a.suburb || a.village || a.town || a.city || a.municipality || a.county || (j.name || '');
  const city = a.city || a.town || a.village || a.municipality || '';
  const out = name && city && name !== city ? name + ', ' + city : (name || city || '');
  placeCache[k] = out;
  return out;
}
async function fetchOSM(lat, lon) {
  const q = '[out:json][timeout:12];(' +
    'way(around:120,' + lat + ',' + lon + ')[highway~"^(motorway|trunk|primary|motorway_link|trunk_link|primary_link|secondary|tertiary)$"];' +
    'way(around:60,' + lat + ',' + lon + ')[highway~"^(residential|unclassified|living_street|service)$"];' +
    'way(around:160,' + lat + ',' + lon + ')[railway~"^(rail|tram|subway|light_rail)$"];' +
    'node(around:100,' + lat + ',' + lon + ')[amenity~"^(bar|pub|nightclub|restaurant|cafe|fast_food|school)$"];' +
    ');out tags 400;';
  const j = await getJSON(ENDPOINTS.overpass, 15000, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return j.elements || [];
}

/* Raccoglie tutto per un luogo e un istante.
   opts: { lat, lon, naive|null, onStep(msg) }
   Ritorna un "contesto": valori per il motore, fonte di ciascun valore, meteo, luogo. */
async function collect(opts) {
  const lat = opts.lat, lon = opts.lon, naive = opts.naive || null;
  const step = opts.onStep || function () {};
  const vals = Object.assign({}, DEFAULTS), src = { lux: 'predefinito', kelvin: 'predefinito', db: 'predefinito', temp: 'predefinito', hum: 'predefinito', co2: 'predefinito' };
  const notes = [];
  step('Chiedo il meteo a Open-Meteo…');
  const [w, air, place, osm] = await Promise.all([
    fetchWeather(lat, lon, naive).catch(e => { notes.push('meteo non disponibile (' + e.message + ')'); return null; }),
    fetchAir(lat, lon, naive).catch(e => { notes.push('qualità dell’aria non disponibile'); return null; }),
    fetchPlace(lat, lon).catch(() => ''),
    fetchOSM(lat, lon).catch(() => { notes.push('stima del rumore non disponibile'); return null; })
  ]);
  step('Metto insieme i dati…');

  // istante assoluto e ora locale del luogo
  const offset = w ? w.offset : -new Date().getTimezoneOffset() * 60;
  let abs;
  if (naive) abs = new Date(Date.UTC(naive.y, naive.m - 1, naive.d, naive.h, naive.mi || 0) - offset * 1000);
  else abs = new Date();
  const local = localParts(abs, offset);

  const meteo = { code: null, cloud: null, wind: null, rain: null, aqi: null, pm25: null, elev: null, phase: '' };
  if (w) {
    if (w.temp != null) { vals.temp = w.temp; src.temp = w.source; }
    if (w.hum != null) { vals.hum = w.hum; src.hum = w.source; }
    Object.assign(meteo, { code: w.code, cloud: w.cloud, wind: w.wind, rain: w.rain });
  }
  const elev = solarElevation(abs, lat, lon);
  const L = lightModel(elev, w ? w.rad || 0 : 0, w ? w.cloud : 30);
  vals.lux = L.lux; vals.kelvin = L.kelvin; meteo.elev = elev; meteo.phase = L.phase;
  src.lux = w ? 'sole + radiazione (Open-Meteo)' : 'posizione del sole';
  src.kelvin = 'sole + nuvole';
  if (air) {
    if (air.co2 != null) { vals.co2 = air.co2; src.co2 = 'Open-Meteo, CAMS'; }
    if (air.aqi != null) { vals.aqi = air.aqi; meteo.aqi = air.aqi; }
    meteo.pm25 = air.pm25;
  }
  if (osm) { const n = noiseFromOSM(osm, local.h); vals.db = n.db; src.db = 'stima da OpenStreetMap'; meteo.osm = n.counts; }

  return { lat: lat, lon: lon, place: place, abs: abs, local: local, offset: offset, vals: vals, src: src, meteo: meteo, notes: notes };
}

const API = { ENDPOINTS, DEFAULTS, solarElevation, lightModel, noiseFromOSM, weatherText, aqiText, localParts, collect };
if (typeof module !== 'undefined') module.exports = API; else root.AtmosferaAtmo = API;
})(this);
