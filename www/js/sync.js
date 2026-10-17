// Google Sheet backup: pushes changes to the sheet and restores from it.
import * as db from './db.js';
import { totals } from './logic.js';

// Readable columns written to each sheet tab (the full record is also stored as JSON).
export const COLUMNS = {
  customers: ['name', 'phone', 'phone2', 'address', 'notes'],
  events: ['date', 'type', 'names', 'customer', 'venue', 'status', 'remindYearly'],
  invoices: ['number', 'docType', 'date', 'customer', 'total', 'paid', 'balance'],
  items: ['name', 'price'],
  offers: ['eventId', 'year', 'discount', 'sentAt'],
  settings: ['businessName']
};

function rowFor(store, r, ctx) {
  const cols = {};
  for (const k of COLUMNS[store]) cols[k] = r[k] ?? '';
  if (store === 'events') cols.customer = ctx.cust[r.customerId]?.name || '';
  if (store === 'invoices') { const t = totals(r); Object.assign(cols, { customer: ctx.cust[r.customerId]?.name || '', total: t.total, paid: t.paid, balance: t.balance }); }
  const rec = { ...r };
  if (store === 'settings') { delete rec.sheetUrl; delete rec.sheetKey; delete rec.lastSync; }
  return { id: r.id, updatedAt: r.updatedAt || '', deleted: false, cols, json: JSON.stringify(rec) };
}

async function call(settings, payload) {
  if (!settings.sheetUrl || !settings.sheetKey) throw new Error('Add the Google Sheet link and key in Settings first.');
  if (!navigator.onLine) throw new Error('You are offline. Connect to the internet and try again.');
  const res = await fetch(settings.sheetUrl, { method: 'POST', body: JSON.stringify({ key: settings.sheetKey, ...payload }), redirect: 'follow' });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch (e) { throw new Error('The sheet did not answer correctly. Check the link (it must end with /exec) and that the script is deployed for "Anyone".'); }
  if (!data.ok) throw new Error(data.error || 'Sync failed');
  return data;
}

export async function pushChanges({ full = false } = {}) {
  const settings = await db.getSettings();
  const since = full ? '' : (settings.lastSync || '');
  const startedAt = new Date().toISOString();
  const customers = await db.all('customers');
  const ctx = { cust: Object.fromEntries(customers.map(c => [c.id, c])) };
  const tables = {};
  let count = 0;
  for (const store of Object.keys(COLUMNS)) {
    const recs = (store === 'customers' ? customers : await db.all(store)).filter(r => !since || (r.updatedAt || '') > since);
    tables[store] = { columns: COLUMNS[store], rows: recs.map(r => rowFor(store, r, ctx)) };
    count += recs.length;
  }
  const deleted = (await db.tombstones()).filter(t => !since || t.at > since);
  for (const t of deleted) {
    if (!tables[t.store]) continue;
    tables[t.store].rows.push({ id: t.id, updatedAt: t.at, deleted: true, cols: {}, json: '' });
    count++;
  }
  await call(settings, { action: 'push', tables });
  await db.clearTombstones(startedAt);
  const s2 = await db.getSettings();
  s2.lastSync = startedAt;
  await db.put('settings', s2, { keepStamp: true });
  return count;
}

export async function restoreFromSheet() {
  const settings = await db.getSettings();
  const data = await call(settings, { action: 'pull' });
  let count = 0;
  for (const store of Object.keys(COLUMNS)) {
    for (const row of (data.tables?.[store] || [])) {
      if (row.deleted === true || row.deleted === 'TRUE' || row.deleted === 'true') { await db.removeLocalOnly(store, row.id); continue; }
      if (!row.json) continue;
      let rec; try { rec = JSON.parse(row.json); } catch (e) { continue; }
      const cur = await db.get(store, rec.id);
      if (store === 'settings') { rec = { ...rec, sheetUrl: settings.sheetUrl, sheetKey: settings.sheetKey, lastSync: settings.lastSync }; }
      if (!cur || (rec.updatedAt || '') > (cur.updatedAt || '')) { await db.put(store, rec, { keepStamp: true }); count++; }
    }
  }
  return count;
}

export async function testConnection() {
  const settings = await db.getSettings();
  return call(settings, { action: 'ping' });
}
