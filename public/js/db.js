/* =====================================================================
   ATMOSFERA — ARCHIVIO (IndexedDB)
   Tutto resta nel browser di questo dispositivo:
     records : uno per scatto salvato (dati, emozioni, testo, stile scelto,
               immagine PNG del francobollo, miniatura della foto)
     meta    : il gusto imparato e poche preferenze
   Se IndexedDB non è disponibile (alcune finestre private) l'archivio
   vive solo in memoria e la pagina lo dice.
   ===================================================================== */
(function (root) {
'use strict';
const NAME = 'atmosfera', VERSION = 1;
let dbp = null, volatile = false;
const mem = { records: new Map(), meta: new Map() };

function open() {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    let req;
    try { req = indexedDB.open(NAME, VERSION); } catch (e) { volatile = true; return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' }).createIndex('date', 'date');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { volatile = true; resolve(null); };
    req.onblocked = () => { volatile = true; resolve(null); };
  });
  return dbp;
}
function tx(db, store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    let out; const r = fn(s);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error || new Error('db'));
    t.onabort = () => rej(t.error || new Error('db'));
  });
}

async function all() {
  const db = await open();
  const list = db ? await tx(db, 'records', 'readonly', s => s.getAll()) : Array.from(mem.records.values());
  return (list || []).sort((a, b) => (a.date < b.date ? 1 : -1));
}
async function put(rec) { const db = await open(); if (!db) { mem.records.set(rec.id, rec); return; } await tx(db, 'records', 'readwrite', s => s.put(rec)); }
async function del(id) { const db = await open(); if (!db) { mem.records.delete(id); return; } await tx(db, 'records', 'readwrite', s => s.delete(id)); }
async function getMeta(k) {
  const db = await open();
  if (!db) return mem.meta.has(k) ? mem.meta.get(k) : null;
  const r = await tx(db, 'meta', 'readonly', s => s.get(k));
  return r ? r.v : null;
}
async function setMeta(k, v) { const db = await open(); if (!db) { mem.meta.set(k, v); return; } await tx(db, 'meta', 'readwrite', s => s.put({ k: k, v: v })); }

/* chiede al browser di non cancellare l'archivio quando serve spazio */
async function persist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}
async function estimate() {
  try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) {}
  return null;
}

root.AtmosferaDB = { open, all, put, del, getMeta, setMeta, persist, estimate, isVolatile: () => volatile };
})(this);
