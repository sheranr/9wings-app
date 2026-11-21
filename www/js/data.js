// Data layer. Screens read from an in-memory copy kept live from the database:
//  - Firebase mode: Firestore with offline cache (works offline, syncs when online, shared by all staff)
//  - Device mode: IndexedDB on this device only (used when Firebase is not configured yet)
// Writes update the in-memory copy at once and are saved in the background, so the app never waits on the network.
import { FIREBASE_CONFIG } from './firebase-config.js';

export const STORES = ['customers', 'events', 'invoices', 'items', 'packages', 'expenses', 'offers', 'settings', 'members'];
const BACKUP_STORES = ['customers', 'events', 'invoices', 'items', 'packages', 'expenses', 'offers', 'settings'];
export const mode = FIREBASE_CONFIG && FIREBASE_CONFIG.projectId ? 'firebase' : 'device';

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const cache = Object.fromEntries(STORES.map(s => [s, new Map()]));
let adapter = null;
let actor = { uid: '', name: '' }; // who is making changes (stamped on records)
export const setActor = a => { actor = a || { uid: '', name: '' }; };

// ---------- change listeners ----------
const listeners = new Set();
let changeTimer;
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(store) {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => listeners.forEach(f => { try { f(store); } catch (e) { console.error(e); } }), 120);
}

// ---------- reads ----------
export const all = store => [...cache[store].values()];
export const get = (store, id) => cache[store].get(id) || null;

// ---------- writes ----------
const clean = obj => JSON.parse(JSON.stringify(obj)); // drops undefined values (Firestore rejects them)
export function put(store, rec, { keepStamp = false } = {}) {
  rec = { ...rec };
  if (!rec.id) rec.id = uid();
  const now = new Date().toISOString();
  if (!rec.createdAt) { rec.createdAt = now; if (actor.name && !rec.createdBy) rec.createdBy = actor.name; }
  if (!keepStamp) { rec.updatedAt = now; if (actor.name) rec.updatedBy = actor.name; }
  rec = clean(rec);
  cache[store].set(rec.id, rec);
  emit(store);
  adapter.set(store, rec).catch(e => saveFailed(e, store));
  return rec;
}
export function remove(store, id) {
  cache[store].delete(id);
  emit(store);
  adapter.remove(store, id).catch(e => saveFailed(e, store));
}
let failHandler = () => {};
export const onSaveError = fn => { failHandler = fn; };
function saveFailed(e, store) {
  console.error('save failed', store, e);
  failHandler(e?.code === 'permission-denied' ? 'You don\'t have permission to change this.' : 'Could not save: ' + (e?.message || e));
}

// ---------- settings (one record) ----------
export const DEFAULT_SETTINGS = {
  id: 'business',
  businessName: '9Wings Flora & Wedding',
  tagline: 'Wedding & Flora · Event Planning & Decoration',
  slogan: 'Wings for Dream to Reality.',
  phones: '070 405 5444\n074 205 5544',
  email: '',
  address: '',
  numberPrefix: '9W',
  terms: 'Selected models cannot be changed after three months.\nPayment must be made 10 days in advance.\nAdvance payments are non-refundable after 7 days.',
  paymentMethod: 'Bank: Peoples Bank - Kelaniya\nAccount Name: W.M.N.S.Wickramasinghe\nAccount Number: A/C 055200230018677',
  invoiceThanks: 'Thank you for choosing 9Wings. We look forward to making your celebration beautiful.',
  defaultDiscount: 10,
  alertDays: '30,7',
  paymentDueDays: 10,
  notifyHour: 9,
  anniversaryMsg: 'Dear {names},\nHappy {ordinal} {occasion} in advance!\n{business} would love to make your special day memorable once again. Book your {occasion} decoration with us and enjoy a special {discount}% discount.\nCall us: {phones}',
  birthdayMsg: 'Dear {customer},\nHappy birthday in advance to {names}!\n{business} would love to make this year\'s celebration special too. Book your birthday decoration with us and enjoy a special {discount}% discount.\nCall us: {phones}'
};
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...(cache.settings.get('business') || {}) });
export const saveSettings = s => put('settings', { ...getSettings(), ...s, id: 'business' });

// ---------- invoice numbers ----------
// Firebase: a shared counter updated in a transaction (no duplicates between staff).
// Offline or device mode: next number after the highest one already used.
export async function nextNumber(docType, date) {
  const s = getSettings();
  const year = (date || new Date().toISOString()).slice(0, 4);
  const prefix = `${s.numberPrefix}-${docType === 'quotation' ? 'Q-' : ''}${year}-`;
  const used = all('invoices').map(i => i.number).filter(n => n?.startsWith(prefix)).map(n => parseInt(n.slice(prefix.length), 10) || 0);
  const localNext = Math.max(0, ...used) + 1;
  let n = localNext;
  try { n = await adapter.counter(`${docType}-${year}`, localNext); } catch (e) { /* offline: use local number */ }
  return prefix + String(n).padStart(4, '0');
}

// ---------- start ----------
let readyPromise = null;
export function start() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    adapter = mode === 'firebase' ? await import('./data-firebase.js').then(m => m.create()) : await import('./data-device.js').then(m => m.create());
    return adapter;
  })();
  return readyPromise;
}
export const getAdapter = () => adapter;

// Load all data for a signed-in member and keep it live.
let unsubs = [];
export async function openBusiness({ owner = true } = {}) {
  closeBusiness();
  const stores = STORES;
  await Promise.all(stores.map(store => new Promise(resolve => {
    let first = true;
    const timer = setTimeout(() => { if (first) { first = false; resolve(); } }, 6000); // offline with empty cache
    unsubs.push(adapter.subscribe(store, (changes) => {
      const map = cache[store];
      for (const c of changes) { if (c.type === 'removed') map.delete(c.id); else map.set(c.id, c.data); }
      if (first) { first = false; clearTimeout(timer); resolve(); }
      emit(store);
    }));
  })));
  // Only the owner may write business settings; staff just read them.
  if (owner && !cache.settings.get('business')) put('settings', { ...DEFAULT_SETTINGS });
  if (owner && !cache.items.size && !getSettings().seeded) seedServices();
}
export function closeBusiness() { unsubs.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); unsubs = []; STORES.forEach(s => cache[s].clear()); }

function seedServices() {
  const list = [
    ['Poruwa decoration', 'Wedding'], ['Settee back decoration', 'Wedding'], ['Entrance arch', 'Wedding'], ['Head table decoration', 'Wedding'],
    ['Table centrepieces', 'Floral'], ['Oil lamp decoration', 'Wedding'], ['Bridal bouquet', 'Bridal'], ['Engagement stage decoration', 'Engagement'],
    ['Church decoration', 'Church'], ['Cake table backdrop', 'Birthday'], ['Balloon decoration', 'Balloon'], ['Wedding car decoration', 'Vehicle'],
    ['Surprise room setup', 'Surprise'], ['Flower arrangement', 'Floral']
  ];
  list.forEach(([name, category], i) => put('items', { id: 'seed-' + (i + 1), name, category, price: 0, active: true, updatedAt: '2000-01-01T00:00:00.000Z' }, { keepStamp: true }));
  saveSettings({ seeded: true });
}

// ---------- backup file ----------
export function exportAll() {
  const out = { app: '9wings', version: 2, exportedAt: new Date().toISOString() };
  for (const s of BACKUP_STORES) out[s] = all(s);
  return out;
}
// Merges records: a record is replaced only if the incoming copy is newer.
export function importAll(data) {
  let n = 0;
  for (const s of BACKUP_STORES) {
    let list = data[s];
    if (s === 'settings' && Array.isArray(list)) list = list.map(r => ({ ...r, id: 'business' }));
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (!r || !r.id) continue;
      const cur = get(s, r.id);
      if (s === 'settings') {
        let { sheetUrl, sheetKey, lastSync, counters, ...rest } = r;
        // From the earlier app version keep the business details, not its old name and wording.
        if ((data.version || 1) < 2) rest = Object.fromEntries(Object.entries(rest).filter(([k]) => ['phones', 'numberPrefix', 'terms', 'paymentMethod', 'defaultDiscount', 'alertDays', 'paymentDueDays', 'notifyHour'].includes(k)));
        saveSettings({ ...rest, id: 'business' }); n++; continue;
      }
      if (!cur || (r.updatedAt || '') > (cur.updatedAt || '')) { put(s, r, { keepStamp: true }); n++; }
    }
  }
  return n;
}

// Data saved on this device before the online database: the earlier app version ('ninewings'),
// and — once Firebase is connected — anything typed into this version while it was in device-only mode.
export const LEGACY_FLAG = 'nw-legacy-done-' + mode;
function readDb(name, version) {
  return new Promise(resolve => {
    if (!('indexedDB' in window)) return resolve(null);
    let created = false;
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => { created = true; req.transaction.abort(); }; // never existed: don't create it
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (created) { db.close(); return resolve(null); }
      const names = ['customers', 'events', 'invoices', 'items', 'packages', 'expenses', 'offers', 'settings'].filter(n => db.objectStoreNames.contains(n));
      if (!names.length) { db.close(); return resolve(null); }
      const t = db.transaction(names, 'readonly');
      const out = { app: '9wings', version };
      names.forEach(n => { const r = t.objectStore(n).getAll(); r.onsuccess = () => { out[n] = r.result; }; });
      t.oncomplete = () => { db.close(); resolve(out); };
      t.onerror = () => { db.close(); resolve(null); };
    };
  });
}
// Returns a list of data sets (each can be passed to importAll), and totals for the prompt.
export async function readLegacy() {
  const sets = [await readDb('ninewings', 1)];
  if (mode === 'firebase') sets.push(await readDb('ninewings-device', 2));
  const list = sets.filter(Boolean);
  const count = k => list.reduce((a, d) => a + (d[k]?.length || 0), 0);
  const counts = { customers: count('customers'), events: count('events'), invoices: count('invoices') };
  return { sets: list, counts, total: counts.customers + counts.events + counts.invoices };
}
export const importLegacy = legacy => legacy.sets.reduce((n, d) => n + importAll(d), 0);
