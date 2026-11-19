/* db.js — a very small promise wrapper over IndexedDB plus a namespaced
   localStorage store. If IndexedDB is unavailable (private mode, quota),
   everything transparently falls back to memory so the OS still runs. */

const DB_NAME = 'smartboardos';
const DB_VERSION = 1;
const STORES = ['boards', 'media', 'docs', 'kv'];
const NS = 'sbos:';

let dbPromise = null;
const memory = new Map(); // store -> Map(key -> value)
const memStore = (name) => {
  if (!memory.has(name)) memory.set(name, new Map());
  return memory.get(name);
};

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no-idb')); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (err) { reject(err); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('idb-open-failed'));
    req.onblocked = () => reject(new Error('idb-blocked'));
  }).catch((err) => {
    console.warn('[db] IndexedDB unavailable, using memory fallback:', err?.message);
    dbPromise = null;
    return null;
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then((db) => {
    if (!db) return null;
    return new Promise((resolve, reject) => {
      let t;
      try { t = db.transaction(store, mode); } catch (err) { reject(err); return; }
      const os = t.objectStore(store);
      let result;
      try { result = fn(os); } catch (err) { reject(err); return; }
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      t.onerror = () => reject(t.error || new Error('tx-failed'));
      t.onabort = () => reject(t.error || new Error('tx-aborted'));
    });
  });
}

export const db = {
  async get(store, key) {
    try {
      const r = await tx(store, 'readonly', (os) => os.get(key));
      if (r !== null && r !== undefined) return r;
      return memStore(store).get(key);
    } catch { return memStore(store).get(key); }
  },
  async put(store, value, key) {
    memStore(store).set(key, value);
    try { await tx(store, 'readwrite', (os) => os.put(value, key)); return true; }
    catch (err) { console.warn('[db] put failed', store, err?.message); return false; }
  },
  async del(store, key) {
    memStore(store).delete(key);
    try { await tx(store, 'readwrite', (os) => os.delete(key)); } catch { /* ignore */ }
  },
  async all(store) {
    try {
      const arr = await tx(store, 'readonly', (os) => os.getAll());
      if (Array.isArray(arr) && arr.length) return arr;
      return [...memStore(store).values()];
    } catch { return [...memStore(store).values()]; }
  },
  async entries(store) {
    try {
      const dbh = await openDB();
      if (!dbh) return [...memStore(store).entries()];
      return await new Promise((resolve) => {
        const t = dbh.transaction(store, 'readonly');
        const os = t.objectStore(store);
        const out = [];
        const req = os.openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (cur) { out.push([cur.key, cur.value]); cur.continue(); } else resolve(out);
        };
        req.onerror = () => resolve([...memStore(store).entries()]);
      });
    } catch { return [...memStore(store).entries()]; }
  },
  async clear(store) {
    memStore(store).clear();
    try { await tx(store, 'readwrite', (os) => os.clear()); } catch { /* ignore */ }
  },
  async clearAll() { await Promise.all(STORES.map((s) => this.clear(s))); },
};

/* ————————— localStorage (namespaced, crash-safe) ————————— */
export const ls = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(NS + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
    catch (err) { console.warn('[ls] set failed', key, err?.message); return false; }
  },
  remove(key) { try { localStorage.removeItem(NS + key); } catch { /* ignore */ } },
  clearAll() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(NS)).forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  },
  keys() {
    try { return Object.keys(localStorage).filter((k) => k.startsWith(NS)).map((k) => k.slice(NS.length)); }
    catch { return []; }
  },
};

/* ————————— settings (persisted, live) ————————— */
export const DEFAULTS = {
  theme: 'dark',
  accent: 'violet',
  wallpaper: 'aurora',
  motion: true,
  use24: false,
  teacherName: '',
  widgets: ['clock', 'timer', 'sticky', 'dice'],
  pen: { palm: 'auto', pressure: true, tilt: true, finger: true, palmDelay: 900, smoothing: 35 },
  board: { tool: 'pen', bg: 'plain' },
  version: 1,
};

export function loadSettings() {
  const saved = ls.get('settings', {}) || {};
  const merged = { ...DEFAULTS, ...saved };
  merged.pen = { ...DEFAULTS.pen, ...(saved.pen || {}) };
  merged.board = { ...DEFAULTS.board, ...(saved.board || {}) };
  if (!Array.isArray(merged.widgets)) merged.widgets = [...DEFAULTS.widgets];
  return merged;
}
export function saveSettings(settings) { return ls.set('settings', settings); }
