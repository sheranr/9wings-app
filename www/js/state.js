// Snapshot of the data for rendering, plus who is signed in.
import * as D from './data.js';
import * as L from './logic.js';

export const S = {};
export const session = { user: null, me: null };
export const isOwner = () => session.me?.role === 'owner';

export function snapshot() {
  for (const s of ['customers', 'events', 'invoices', 'items', 'packages', 'expenses', 'offers', 'members']) S[s] = D.all(s);
  S.settings = D.getSettings();
  S.cust = Object.fromEntries(S.customers.map(c => [c.id, c]));
  S.ev = Object.fromEntries(S.events.map(e => [e.id, e]));
  S.inv = Object.fromEntries(S.invoices.map(i => [i.id, i]));
  return S;
}
export const custName = id => S.cust[id]?.name || 'Unknown client';
export const evLabel = ev => `${ev.type}${ev.names ? ' · ' + ev.names : ''}`;
export const evTitle = ev => ev.names || S.cust[ev.customerId]?.name || ev.type;
export const invStatus = inv => L.invoiceStatus(inv, S.ev[inv.eventId], S.settings);
export const invDue = inv => L.dueDate(inv, S.ev[inv.eventId], S.settings);
// Payment status of a booking, from its invoices.
export function bookingPayment(ev) {
  const invs = S.invoices.filter(i => i.eventId === ev.id && i.docType === 'invoice');
  if (!invs.length) return null;
  let total = 0, paid = 0;
  invs.forEach(i => { const t = L.totals(i); total += t.total; paid += t.paid; });
  const balance = Math.max(total - paid, 0);
  const status = total > 0 && balance <= 0.009 ? 'Paid' : invs.some(i => invStatus(i) === 'Overdue') ? 'Overdue' : paid > 0 ? 'Partially paid' : 'Pending';
  return { total, paid, balance, status };
}
