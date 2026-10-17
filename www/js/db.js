// Local database (IndexedDB) — all data lives on the phone and works offline.
const DB_NAME = 'ninewings';
const DB_VERSION = 1;
export const STORES = ['customers', 'events', 'invoices', 'items', 'offers', 'settings'];

let dbPromise;
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('deleted')) db.createObjectStore('deleted', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  }));
}

function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export async function all(store) {
  return tx(store, 'readonly', s => reqP(s.getAll()));
}
export async function get(store, id) {
  return tx(store, 'readonly', s => reqP(s.get(id)));
}
// Save a record; stamps updatedAt so sync knows it changed.
export async function put(store, rec, { keepStamp = false } = {}) {
  if (!rec.id) rec.id = uid();
  if (!rec.createdAt) rec.createdAt = new Date().toISOString();
  if (!keepStamp) rec.updatedAt = new Date().toISOString();
  await tx(store, 'readwrite', s => reqP(s.put(rec)));
  if (!keepStamp) notifyChange();
  return rec;
}
export async function remove(store, id) {
  await tx(store, 'readwrite', s => reqP(s.delete(id)));
  await tx('deleted', 'readwrite', s => reqP(s.put({ key: store + ':' + id, store, id, at: new Date().toISOString() })));
  notifyChange();
}
export async function removeLocalOnly(store, id) {
  await tx(store, 'readwrite', s => reqP(s.delete(id)));
}
export async function tombstones() { return tx('deleted', 'readonly', s => reqP(s.getAll())); }
export async function clearTombstones(before) {
  const list = await tombstones();
  await tx('deleted', 'readwrite', s => Promise.all(list.filter(t => t.at <= before).map(t => reqP(s.delete(t.key)))));
}

// Settings are stored as a single record with id 'settings'.
export const DEFAULT_SETTINGS = {
  id: 'settings',
  businessName: '9WINGS EVENT',
  tagline: 'FLORA & WEDDINGS',
  phones: '070 405 5444\n074 205 5544',
  numberPrefix: '9W',
  terms: 'Selected models cannot be changed after three months.\nPayment must be made 10 days in advance.\nAdvance payments are non-refundable after 7 days.',
  paymentMethod: 'Bank: Peoples Bank - Kelaniya\nAccount Name: W.M.N.S.Wickramasinghe\nAccount Number: A/C 055200230018677',
  defaultDiscount: 10,
  alertDays: '30,7',
  paymentDueDays: 10,
  notifyHour: 9,
  anniversaryMsg: 'Dear {names},\nHappy {ordinal} {occasion} in advance! 💐\n{business} would love to make your special day memorable once again. Book your {occasion} decoration with us and enjoy a special {discount}% discount.\nCall us: {phones}',
  birthdayMsg: 'Dear {customer},\nHappy birthday in advance to {names}! 🎂\n{business} would love to make this year\'s celebration special too. Book your birthday decoration with us and enjoy a special {discount}% discount.\nCall us: {phones}',
  sheetUrl: '',
  sheetKey: '',
  lastSync: '',
  counters: {}
};

export async function getSettings() {
  const s = await get('settings', 'settings');
  return Object.assign({}, DEFAULT_SETTINGS, s || {});
}
export async function saveSettings(s) { return put('settings', s); }

export async function seedIfEmpty() {
  const s = await get('settings', 'settings');
  if (!s) await put('settings', { ...DEFAULT_SETTINGS });
  const items = await all('items');
  if (!items.length && !(s && s.seeded)) {
    const names = ['Poruwa decoration', 'Settee back decoration', 'Entrance arch', 'Head table decoration', 'Table centrepieces', 'Oil lamp decoration', 'Bridal bouquet', 'Cake table backdrop', 'Balloon decoration', 'Flower arrangement'];
    // fixed ids so a restore on a new phone doesn't create duplicates
    for (const [i, n] of names.entries()) await put('items', { id: 'seed-' + (i + 1), name: n, price: 0, updatedAt: '2000-01-01T00:00:00.000Z' }, { keepStamp: true });
    const st = await getSettings(); st.seeded = true; await put('settings', st);
  }
}

// Change listeners (used to reschedule notifications)
const listeners = new Set();
let changeTimer;
export function onChange(fn) { listeners.add(fn); }
function notifyChange() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }), 400);
}

export async function exportAll() {
  const out = { app: '9wings', version: 1, exportedAt: new Date().toISOString() };
  for (const s of STORES) out[s] = await all(s);
  return out;
}
export async function importAll(data) {
  for (const s of STORES) {
    if (!Array.isArray(data[s])) continue;
    for (const r of data[s]) {
      const cur = await get(s, r.id);
      if (!cur || (r.updatedAt || '') >= (cur.updatedAt || '')) await put(s, r, { keepStamp: true });
    }
  }
  notifyChange();
}
