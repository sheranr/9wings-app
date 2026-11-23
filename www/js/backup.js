// Automatic backups (owner devices).
//  - Every 7 days a full copy of the data is kept on this device (last 8 copies), so anything deleted
//    or changed by mistake can be brought back even after it leaves the recycle bin.
//  - On the Android app the copy is also saved as a file in Documents/9Wings Backups.
//  - Once a month the dashboard reminds the owner to put a copy in Google Drive (off the phone).
import * as D from './data.js';
import { isNative } from './native.js';

const KEEP = 8;
const EVERY_DAYS = 7;
export const DRIVE_EVERY_DAYS = 30;
const DB = 'ninewings-backups';
const FOLDER = '9Wings Backups';

const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
};
const plugin = n => (isNative() && window.Capacitor?.Plugins ? window.Capacitor.Plugins[n] : null);

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('snapshots', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('snapshots', mode);
    const out = fn(t.objectStore('snapshots'));
    t.oncomplete = () => { db.close(); resolve(out?.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

const countsOf = d => ({ clients: (d.customers || []).length, bookings: (d.events || []).length, invoices: (d.invoices || []).length, expenses: (d.expenses || []).length });

// Snapshots kept on this device (newest first, without the data itself).
export async function listSnapshots() {
  try { return ((await tx('readonly', s => s.getAll())) || []).map(({ json, ...rest }) => rest).sort((a, b) => b.id.localeCompare(a.id)); }
  catch (e) { return []; }
}
export async function readSnapshot(id) {
  const r = await tx('readonly', s => s.get(id));
  return r ? JSON.parse(r.json) : null;
}

async function saveFile(name, json) {
  const FS = plugin('Filesystem');
  if (!FS) return null;
  for (const directory of ['DOCUMENTS', 'DATA']) {
    try {
      await FS.writeFile({ path: `${FOLDER}/${name}`, data: json, directory, encoding: 'utf8', recursive: true });
      // keep only the newest files
      try {
        const res = await FS.readdir({ path: FOLDER, directory });
        const names = (res.files || []).map(f => (typeof f === 'string' ? f : f.name)).filter(n => /^9wings-backup-.*\.json$/.test(n)).sort().reverse();
        for (const old of names.slice(KEEP)) await FS.deleteFile({ path: `${FOLDER}/${old}`, directory }).catch(() => {});
      } catch (e) { /* listing not allowed: fine */ }
      return directory === 'DOCUMENTS' ? `Documents/${FOLDER}` : 'app storage';
    } catch (e) { /* try the next location */ }
  }
  return null;
}

// Make a backup now (also used by the weekly schedule).
export async function backupNow() {
  const data = D.exportAll();
  const counts = countsOf(data);
  const json = JSON.stringify(data);
  const id = new Date().toISOString();
  await tx('readwrite', s => s.put({ id, at: id, counts, size: json.length, json }));
  const all = await listSnapshots();
  if (all.length > KEEP) await tx('readwrite', s => { all.slice(KEEP).forEach(x => s.delete(x.id)); });
  const where = await saveFile(`9wings-backup-${id.slice(0, 10)}.json`, json);
  ls.set('nw-autobackup-last', id);
  if (where) ls.set('nw-autobackup-where', where);
  return { id, counts, where };
}

export async function autoBackup() {
  const last = ls.get('nw-autobackup-last');
  if (last && Date.now() - new Date(last) < EVERY_DAYS * 86400000) return null;
  const c = countsOf(D.exportAll());
  if (!c.clients && !c.bookings && !c.invoices) return null; // nothing worth saving yet
  return backupNow();
}

export const lastAuto = () => ({ at: ls.get('nw-autobackup-last'), where: ls.get('nw-autobackup-where') });
// Monthly "copy to Google Drive" reminder.
export const markDriveCopy = () => ls.set('nw-drive-last', new Date().toISOString());
export const snoozeDrive = days => ls.set('nw-drive-snooze', new Date(Date.now() + days * 86400000).toISOString());
export function driveDue() {
  const snooze = ls.get('nw-drive-snooze');
  if (snooze && new Date(snooze) > new Date()) return false;
  const last = ls.get('nw-drive-last');
  if (!last) { // first reminder a week after the first automatic backup
    const first = ls.get('nw-autobackup-last');
    return !!first && Date.now() - new Date(first) > 7 * 86400000;
  }
  return Date.now() - new Date(last) > DRIVE_EVERY_DAYS * 86400000;
}
