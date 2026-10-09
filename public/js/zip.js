/* =====================================================================
   ATMOSFERA — ZIP minimo, senza compressione
   Le immagini PNG sono già compresse: archiviarle "così come sono"
   rende il file semplice da scrivere e da rileggere, ovunque.
   makeZip([{ name, data: Uint8Array, date? }]) → Uint8Array
   readZip(Uint8Array) → [{ name, data }]   (solo file non compressi)
   ===================================================================== */
(function (root) {
'use strict';
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
function crc32(d) { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function utf8(s) { return new TextEncoder().encode(s); }
function dos(d) {
  const t = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const day = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  return [t, day];
}

function makeZip(files) {
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = utf8(f.name), data = f.data, crc = crc32(data), [t, d] = dos(f.date || new Date());
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, t, true); h.setUint16(12, d, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, t, true); c.setUint16(14, d, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  let csize = 0; central.forEach(p => { csize += p.length; });
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, off, true);
  const all = parts.concat(central, [new Uint8Array(e.buffer)]);
  let len = 0; all.forEach(p => { len += p.length; });
  const out = new Uint8Array(len); let p = 0;
  all.forEach(a => { out.set(a, p); p += a.length; });
  return out;
}

function readZip(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Non è un file zip.');
  const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
  const dec = new TextDecoder(), out = [];
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Zip danneggiato.');
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = v.getUint16(lo + 26, true), lxl = v.getUint16(lo + 28, true), start = lo + 30 + lnl + lxl;
    if (method !== 0) throw new Error('Questo zip è compresso: importa il file creato da Atmosfera, senza rizipparlo.');
    out.push({ name: name, data: u8.slice(start, start + size) });
    p += 46 + nl + xl + cl;
  }
  return out;
}

const API = { makeZip, readZip, crc32 };
if (typeof module !== 'undefined') module.exports = API; else root.AtmosferaZip = API;
})(this);
