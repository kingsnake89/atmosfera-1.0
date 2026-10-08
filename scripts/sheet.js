/* Foglio di prova: 8 scene × 5 semi in un PNG.  npm run sheet */
const E = require('../public/engine/atmosfera-engine.js');
const zlib = require('zlib'), fs = require('fs');
const RGB = [[233,230,222],[35,37,42],[170,56,46],[222,186,56],[48,80,140],[62,108,74]];
const SCENES = [
  ['Colazione al sole', {lux:6000,kelvin:4800,db:42,temp:22,hum:50,co2:600}],
  ['Cena a lume di candela', {lux:15,kelvin:2000,db:40,temp:22,hum:50,co2:1100}],
  ['Riunione lunga', {lux:450,kelvin:4600,db:52,temp:25.5,hum:33,co2:1900}],
  ['Concerto', {lux:80,kelvin:3000,db:92,temp:28,hum:65,co2:2200}],
  ['Bosco dopo la pioggia', {lux:3000,kelvin:6200,db:33,temp:14,hum:92,co2:420}],
  ['Notte, tutti dormono', {lux:2,kelvin:2700,db:28,temp:19,hum:55,co2:900}],
  ['Spiaggia a mezzogiorno', {lux:60000,kelvin:5600,db:60,temp:33,hum:70,co2:420}],
  ['Metropolitana', {lux:300,kelvin:5000,db:85,temp:27,hum:60,co2:1800}],
];
const cols = 5, rows = SCENES.length, CW = E.W, CH = E.H, PAD = 6;
const WW = cols * (CW + PAD) + PAD, HH = rows * (CH + PAD) + PAD;
const img = Buffer.alloc(WW * HH * 3, 120);
const out = new Uint8Array(E.W * E.H);
let tTot = 0, nTot = 0;
SCENES.forEach(([name, s], row) => {
  const e = E.emotionFromSensors(s);
  const m = E.moodName(e);
  const gs = [];
  for (let c = 0; c < cols; c++) {
    const t0 = Date.now();
    const res = E.render(e, 1000 + c * 7919 + row * 31, out);
    tTot += Date.now() - t0; nTot++;
    gs.push(res.g.palette + '/' + res.g.archeName);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const p = RGB[out[y * E.W + x]], o = ((PAD + row * (CH + PAD) + y) * WW + PAD + c * (CW + PAD) + x) * 3;
      img[o] = p[0]; img[o + 1] = p[1]; img[o + 2] = p[2];
    }
  }
  const f = v => v.toFixed(2);
  console.log(name.padEnd(24), 'V', f(e.valenza), 'E', f(e.energia), 'T', f(e.tensione), 'I', f(e.intimita), 'K', f(e.chiave), '|', m.name, m.adj, '|', gs.join(' '));
});
console.log('ms medi per immagine:', (tTot / nTot).toFixed(1));
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dest = process.argv[2] || 'out/foglio.png'; fs.mkdirSync(require('path').dirname(dest), { recursive: true }); fs.writeFileSync(dest, png(WW, HH, img));
