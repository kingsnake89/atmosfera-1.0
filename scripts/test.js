/* Test minimi, senza dipendenze:  npm test */
const fs = require('fs'), path = require('path'), assert = require('assert');
const E = require('../public/engine/atmosfera-engine.js');
const P = require('../public/js/photo.js');
const A = require('../public/js/atmo.js');
const T = require('../public/js/taste.js');
const F = require('../public/js/feel.js');
const Z = require('../public/js/zip.js');
let ok = 0;
function t(name, fn) { try { fn(); ok++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } }

console.log('Motore');
t('stessi dati e stesso seme → stessa immagine', () => {
  const e = E.emotionFromSensors({ lux: 300, kelvin: 3000, db: 45, temp: 21, hum: 50, co2: 800 });
  const a = new Uint8Array(E.W * E.H), b = new Uint8Array(E.W * E.H);
  E.render(e, 42, a); E.render(e, 42, b);
  assert.deepStrictEqual(a, b);
});
t('seme diverso → immagine diversa', () => {
  const e = E.emotionFromSensors({ lux: 300, kelvin: 3000, db: 45, temp: 21, hum: 50, co2: 800 });
  const a = new Uint8Array(E.W * E.H), b = new Uint8Array(E.W * E.H);
  E.render(e, 1, a); E.render(e, 2, b);
  let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  assert.ok(diff > 2000, 'troppo simili: ' + diff);
});
t('solo i 6 inchiostri Spectra', () => {
  const a = new Uint8Array(E.W * E.H);
  E.render(E.emotionFromSensors({ lux: 2, kelvin: 2700, db: 28, temp: 19, hum: 55, co2: 900 }), 7, a);
  for (const v of a) assert.ok(v >= 0 && v <= 5);
});
t('il chiasso alza l’energia, la CO₂ alza la tensione', () => {
  const base = { lux: 300, kelvin: 4000, db: 35, temp: 21, hum: 50, co2: 500 };
  const q = E.emotionFromSensors(base);
  assert.ok(E.emotionFromSensors(Object.assign({}, base, { db: 85 })).energia > q.energia + 0.2);
  assert.ok(E.emotionFromSensors(Object.assign({}, base, { co2: 2000 })).tensione > q.tensione + 0.3);
});

console.log('Foto');
t('EXIF: tempo, diaframma, ISO e data', () => {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures/cena.jpg'));
  const x = P.parseExif(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  assert.ok(x, 'EXIF non trovato');
  assert.ok(Math.abs(x.exposure - 1 / 30) < 1e-6);
  assert.ok(Math.abs(x.fnumber - 1.8) < 1e-6);
  assert.strictEqual(x.iso, 1600);
  assert.strictEqual(P.exifDate(x.date).getHours(), 21);
  const l = P.luxFromExif(x);
  assert.ok(l.lux > 5 && l.lux < 40, 'lux fuori scala: ' + l.lux);
});
t('EXIF: posizione GPS', () => {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures/cena.jpg'));
  const x = P.parseExif(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  assert.ok(Math.abs(x.lat - 44.4951) < 0.001, 'lat ' + x.lat);
  assert.ok(Math.abs(x.lon - 11.3426) < 0.001, 'lon ' + x.lon);
  assert.deepStrictEqual(P.exifNaive(x.date), { y: 2026, m: 10, d: 3, h: 21, mi: 40 });
});
t('foto senza EXIF → nessun dato inventato', () => {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures/neve.jpg'));
  const x = P.parseExif(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  assert.ok(!x || !P.luxFromExif(x));
});
function synth(w, h, f) { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } return d; }
t('luce calda → pochi kelvin, luce fredda → molti', () => {
  const warm = P.analyzePixels(synth(64, 48, () => [235, 170, 90]), 64, 48);
  const cold = P.analyzePixels(synth(64, 48, () => [170, 200, 240]), 64, 48);
  assert.ok(warm.kelvin < 3600, 'calda: ' + warm.kelvin);
  assert.ok(cold.kelvin > 6500, 'fredda: ' + cold.kelvin);
});
t('righe fitte → più dettaglio di una campitura', () => {
  const flat = P.analyzePixels(synth(64, 48, () => [128, 128, 128]), 64, 48);
  const busy = P.analyzePixels(synth(64, 48, (x) => (x & 2) ? [240, 240, 240] : [20, 20, 20]), 64, 48);
  assert.ok(busy.detail > flat.detail + 0.5);
  assert.ok(busy.contrast > 0.9);
});
t('peso 0 → la foto non sposta le emozioni', () => {
  const base = E.emotionFromSensors({ lux: 300, kelvin: 3000, db: 45, temp: 21, hum: 50, co2: 800 });
  const a = { brightness: 0.9, contrast: 1, saturation: 1, detail: 1 };
  const m = P.blendEmotion(base, a, 0);
  for (const k of Object.keys(base)) assert.ok(Math.abs(m[k] - base[k]) < 1e-9, k);
});

console.log('Dati aperti');
t('sole: mezzogiorno di giugno a Bologna ≈ 69°, mezzanotte sotto l’orizzonte', () => {
  const noon = A.solarElevation(new Date(Date.UTC(2026, 5, 21, 11, 15)), 44.49, 11.34);
  const night = A.solarElevation(new Date(Date.UTC(2026, 5, 21, 23, 0)), 44.49, 11.34);
  assert.ok(Math.abs(noon - 69) < 1.5, 'mezzogiorno ' + noon.toFixed(1));
  assert.ok(night < -15, 'notte ' + night.toFixed(1));
});
t('luce: sole alto e sereno ≫ crepuscolo ≫ notte; coperto è più freddo', () => {
  const day = A.lightModel(60, 850, 0), dusk = A.lightModel(-3, 0, 0), night = A.lightModel(-20, 0, 0), grey = A.lightModel(40, 300, 100);
  assert.ok(day.lux > 50000 && dusk.lux < 200 && dusk.lux > 5 && night.lux < 5);
  assert.ok(dusk.kelvin < 3200 && grey.kelvin > day.kelvin);
});
t('rumore: incrocio trafficato > vicolo di notte', () => {
  const busy = A.noiseFromOSM([{ tags: { highway: 'primary' } }, { tags: { highway: 'primary' } }, { tags: { railway: 'tram' } }, { tags: { amenity: 'cafe' } }], 18);
  const calm = A.noiseFromOSM([{ tags: { highway: 'residential' } }], 3);
  assert.ok(busy.db > 60 && calm.db < 35, busy.db + ' / ' + calm.db);
});

console.log('Stile e gusto');
const emoMal = { valenza: .3, energia: .2, tensione: .2, intimita: .6, chiave: .5, calore: .3 };
const emoJoy = { valenza: .9, energia: .7, tensione: .1, intimita: .4, chiave: .8, calore: .8 };
t('geni a zero = disegno di base; geni diversi = disegno diverso', () => {
  const a = new Uint8Array(E.W * E.H), b = new Uint8Array(E.W * E.H), c = new Uint8Array(E.W * E.H);
  E.render(emoMal, 9, a); E.render(emoMal, 9, b, new Array(E.NGENES).fill(0));
  assert.deepStrictEqual(a, b);
  const g = new Array(E.NGENES).fill(0); g[E.GENE_C] = 2; g[E.GENE_C + 6] = 2; E.render(emoMal, 9, c, g);
  let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) d++;
  assert.ok(d > 2000, 'troppo simili: ' + d);
});
t('la tavolozza preferita vince quando il gusto è forte', () => {
  const g = new Array(E.NGENES).fill(0); const lago = E.PALETTES.findIndex(p => p.id === 'lago'); g[E.GENE_PAL + lago] = 2.5;
  let hits = 0; for (let s = 0; s < 20; s++) if (E.grammar(emoJoy, s, g).palette === 'lago') hits++;
  assert.ok(hits >= 14, 'lago scelto ' + hits + '/20');
});
t('scegliere sempre la stessa cosa sposta il gusto e restringe le varianti', () => {
  let ta = T.newTaste(); const s0 = T.spread(ta);
  const target = new Array(T.NG).fill(0); target[3] = 2; target[E.GENE_C] = -1.5;
  for (let i = 0; i < 12; i++) ta = T.learn(ta, emoMal, target, [T.propose(ta, emoMal, i, 1)], 4 - Math.min(3, i >> 2));
  assert.ok(ta.mean[3] > 1.2, 'gene tavolozza ' + ta.mean[3]);
  assert.ok(ta.mean[E.GENE_C] < -0.9);
  assert.ok(T.spread(ta) < s0 * 0.6);
  const st = T.stats(ta); assert.ok(st.recent < st.first);
});
t('il gusto dipende dall’emozione: per la malinconia ricorda le scelte malinconiche', () => {
  let ta = T.newTaste();
  const blue = new Array(T.NG).fill(0); blue[7] = 2.4;           // notte
  const sun = new Array(T.NG).fill(0); sun[0] = 2.4;             // sole
  for (let i = 0; i < 6; i++) { ta = T.learn(ta, emoMal, blue, [], 2); ta = T.learn(ta, emoJoy, sun, [], 2); }
  const pm = T.predict(ta, emoMal), pj = T.predict(ta, emoJoy);
  assert.ok(pm[7] > pm[0] + 0.5 && pj[0] > pj[7] + 0.5, pm[7] + ' / ' + pj[0]);
});
t('proposte riproducibili e varianti diverse', () => {
  const ta = T.newTaste();
  assert.deepStrictEqual(T.propose(ta, emoMal, 5, 2), T.propose(ta, emoMal, 5, 2));
  assert.notDeepStrictEqual(T.propose(ta, emoMal, 5, 1), T.propose(ta, emoMal, 5, 2));
});

console.log('Come ti senti');
t('la ghiera: in basso a sinistra malinconia, al centro "non so"', () => {
  assert.strictEqual(F.pick(240, 0.9).id, 'malinconia');
  assert.strictEqual(F.pick(30, 0.9).id, 'gioia');
  assert.strictEqual(F.pick(100, 0.05).id, null);
  assert.ok(F.pick(150, 1).vec.tensione > 0.9);
});
t('quello che senti pesa più dei dati, ma la luce resta dell’ambiente', () => {
  const base = E.emotionFromSensors({ lux: 6000, kelvin: 4800, db: 42, temp: 22, hum: 50, co2: 600 });
  const m = F.blend(base, F.pickById('tristezza', 1), 0.75);
  assert.ok(m.valenza < base.valenza - 0.3);
  assert.ok(Math.abs(m.chiave - base.chiave) < 0.25);
});
t('le parole scritte propongono uno stato', () => {
  assert.deepStrictEqual(F.fromText('sono stanca ma serena').map(x => x.id), ['stanchezza', 'serenita']);
  assert.strictEqual(F.fromText('ho paura e sono agitato')[0].id, 'ansia');
  assert.strictEqual(F.fromText('non sono triste').length, 0);
  assert.strictEqual(F.fromText('bel sole a giugno').length, 0);
});

console.log('Archivio');
t('zip: scrivo e rileggo immagini e testo', () => {
  const files = [{ name: 'atmosfera.json', data: new TextEncoder().encode('{"città":"Bologna"}') }, { name: 'immagini/a.png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) }];
  const back = Z.readZip(Z.makeZip(files));
  assert.strictEqual(back.length, 2);
  assert.strictEqual(new TextDecoder().decode(back[0].data), '{"città":"Bologna"}');
  assert.deepStrictEqual(Array.from(back[1].data), [137, 80, 78, 71, 1, 2, 3]);
  assert.strictEqual(Z.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

(async () => {
  global.fetch = async (url) => {
    const u = String(url);
    const json = o => ({ ok: true, status: 200, json: async () => o });
    if (u.includes('air-quality')) return json({ current: { carbon_dioxide: 431, european_aqi: 72, pm2_5: 18 } });
    if (u.includes('forecast')) return json({ utc_offset_seconds: 7200, current: { time: '2026-10-08T15:00', temperature_2m: 23.4, relative_humidity_2m: 61, cloud_cover: 20, shortwave_radiation: 420, weather_code: 1, wind_speed_10m: 9, precipitation: 0 } });
    if (u.includes('nominatim')) return json({ address: { suburb: 'Santo Stefano', city: 'Bologna' } });
    if (u.includes('overpass')) return json({ elements: [{ tags: { highway: 'secondary' } }, { tags: { amenity: 'bar' } }] });
    throw new Error('url inattesa ' + u);
  };
  try {
    const c = await A.collect({ lat: 44.49, lon: 11.34 });
    assert.strictEqual(c.vals.temp, 23.4); assert.strictEqual(c.vals.hum, 61); assert.strictEqual(c.vals.co2, 431);
    assert.strictEqual(c.place, 'Santo Stefano, Bologna');
    assert.ok(c.src.db.includes('OpenStreetMap'));
    const e = E.emotionFromSensors(c.vals), e0 = E.emotionFromSensors(Object.assign({}, c.vals, { aqi: null }));
    assert.ok(e.tensione > e0.tensione, 'l’aria cattiva deve alzare la tensione');
    ok++; console.log('  ✓ raccolta dati con risposte simulate: ' + c.place + ', ' + c.vals.temp + ' °C, ' + c.vals.db + ' dB');
  } catch (err) { console.error('  ✗ raccolta dati: ' + err.message); process.exitCode = 1; }
  console.log('\n' + ok + ' test superati');
})();
