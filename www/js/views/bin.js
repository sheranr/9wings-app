// Recycle bin: deleted records stay here for 30 days and can be restored (owner only).
import * as D from '../data.js';
import * as L from '../logic.js';
import { isOwner } from '../state.js';
const custName = id => D.getAny('customers', id)?.name || 'Unknown client';
import { $, $$, go, icon, esc, toast, empty, eyebrow, topbar, confirmBox } from '../ui.js';

const KIND = {
  invoices: { label: 'Invoice', ic: 'invoice', title: r => `${r.docType === 'quotation' ? 'Quotation' : 'Invoice'} ${r.number || ''}`, sub: r => `${custName(r.customerId)} · ${L.money(L.totals(r).total)}` },
  events: { label: 'Booking', ic: 'calendar', title: r => r.names || r.type, sub: r => `${r.type} · ${L.fmtNice(r.date)} · ${custName(r.customerId)}` },
  customers: { label: 'Client', ic: 'user', title: r => r.name, sub: r => r.phone || '' },
  expenses: { label: 'Expense', ic: 'receipt', title: r => r.description || r.category || 'Expense', sub: r => `${L.fmtNice(r.date)} · ${L.money(r.amount)}` },
  items: { label: 'Service', ic: 'flower', title: r => r.name, sub: r => r.category || '' },
  packages: { label: 'Package', ic: 'package', title: r => r.name, sub: r => (r.price ? L.money(r.price) : '') }
};

// Restoring a booking or invoice also brings back the client (and booking) it belongs to.
function restoreWithParents(store, id) {
  const r = D.getAny(store, id);
  if (!r) return 0;
  let n = 0;
  if ((store === 'events' || store === 'invoices') && r.customerId && D.getAny('customers', r.customerId)?.deletedAt) { D.restore('customers', r.customerId); n++; }
  if (store === 'invoices' && r.eventId && D.getAny('events', r.eventId)?.deletedAt) { D.restore('events', r.eventId); n++; }
  D.restore(store, id);
  return n + 1;
}

export async function binView() {
  if (!isOwner()) return go('#/more');
  const items = D.binItems();
  const now = Date.now();
  $('#main').innerHTML = `${topbar('Recycle bin', { back: true })}
  <div class="page narrow">
    <div class="page-head"><h2>Recycle bin</h2><p>Deleted invoices, bookings, clients, expenses and services stay here for ${D.BIN_DAYS} days, then are removed for good.</p></div>
    ${items.length ? `<div class="list">${items.map(({ store, rec }) => {
      const k = KIND[store];
      const left = Math.max(0, D.BIN_DAYS - Math.floor((now - new Date(rec.deletedAt)) / 86400000));
      return `<div class="row static"><span class="tile-ic">${icon(k.ic)}</span>
        <div class="grow"><div class="t">${esc(k.title(rec))}</div><div class="s">${esc(k.label)} · ${esc(k.sub(rec))}</div>
          <div class="s">Deleted ${L.relTime(rec.deletedAt)}${rec.deletedBy ? ' by ' + esc(rec.deletedBy) : ''} · <span class="${left <= 3 ? 'neg' : ''}">${left} day${left === 1 ? '' : 's'} left</span></div></div>
        <div style="display:flex;gap:6px;flex:none"><button class="btn secondary sm" data-restore="${store}:${rec.id}">${icon('undo')} Restore</button>
          <button class="x-btn" style="height:36px;width:36px" data-forever="${store}:${rec.id}" aria-label="Delete forever">${icon('trash', 'sm')}</button></div></div>`;
    }).join('')}</div>
    <button class="btn danger block" id="emptyBin" style="margin-top:16px">${icon('trash')} Empty recycle bin</button>`
      : `<div class="list">${empty('trash', 'The recycle bin is empty', 'Anything you delete appears here for ' + D.BIN_DAYS + ' days.')}</div>`}
    <p class="small muted" style="margin-top:16px">${icon('info', 'sm')} Records removed from the bin can still be brought back from a backup — More → Data &amp; backup.</p>
  </div>`;
  $$('[data-restore]').forEach(b => b.onclick = () => {
    const [store, id] = b.dataset.restore.split(':');
    const n = restoreWithParents(store, id);
    toast(n > 1 ? `Restored (with ${n - 1} linked record${n > 2 ? 's' : ''})` : 'Restored');
  });
  $$('[data-forever]').forEach(b => b.onclick = async () => {
    const [store, id] = b.dataset.forever.split(':');
    if (await confirmBox('Delete this permanently? It can only be recovered from a backup file.', { ok: 'Delete forever', title: 'Delete forever' })) { D.remove(store, id); toast('Deleted permanently'); }
  });
  const eb = $('#emptyBin'); if (eb) eb.onclick = async () => {
    if (!(await confirmBox(`Permanently delete all ${items.length} items in the recycle bin?`, { ok: 'Empty bin', title: 'Empty recycle bin' }))) return;
    items.forEach(({ store, rec }) => D.remove(store, rec.id)); toast('Recycle bin emptied');
  };
}
