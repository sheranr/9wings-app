// Business rules: dates, money, statuses, alerts, messages. Pure functions — no storage or UI.
export const EVENT_TYPES = ['Wedding', 'Homecoming', 'Engagement', 'Birthday', 'Anniversary', 'Get-together', 'Corporate', 'Flora order', 'Other'];
export const YEARLY_DEFAULT = { Wedding: true, Engagement: true, Birthday: true, Anniversary: true };
// Original statuses (Inquiry, Confirmed, Completed, Cancelled) are kept; Pending and In Progress are added.
export const STATUSES = ['Inquiry', 'Pending', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'];
export const PAYMENT_METHODS = ['Cash', 'Bank transfer', 'Card', 'Online', 'Cheque'];
export const PAYMENT_TYPES = ['Advance', 'Partial', 'Final', 'Refund'];
export const EXPENSE_CATEGORIES = ['Flowers', 'Decor materials', 'Rentals', 'Transport', 'Labour', 'Venue', 'Equipment', 'Marketing', 'Utilities', 'Other'];
export const SERVICE_CATEGORIES = ['Wedding', 'Engagement', 'Church', 'Floral', 'Bridal', 'Birthday', 'Balloon', 'Vehicle', 'Surprise', 'Other'];
export const INVOICE_STATUSES = ['Paid', 'Partially paid', 'Pending', 'Overdue'];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = (n, w = 2) => String(n).padStart(w, '0');

// Dates are stored as 'YYYY-MM-DD' strings (local dates).
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export const fmtDate = s => { const d = parseISO(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ''; };
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const fmtNice = s => { const d = parseISO(s); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : ''; };
export const fmtShort = s => { const d = parseISO(s); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : ''; };
export const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export function sameDayInYear(iso, year) {
  const d = parseISO(iso);
  const m = d.getMonth(); let day = d.getDate();
  if (m === 1 && day === 29 && new Date(year, 1, 29).getMonth() !== 1) day = 28;
  return toISO(new Date(year, m, day));
}
export function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
export function relTime(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 60000;
  if (diff < 1) return 'just now';
  if (diff < 60) return Math.round(diff) + ' min ago';
  if (diff < 1440) return Math.round(diff / 60) + ' h ago';
  if (diff < 2880) return 'yesterday';
  return fmtNice(iso.slice(0, 10));
}

// ---------- Money ----------
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const num2 = n => nf2.format(Number(n || 0));
export const money = n => 'LKR ' + nf2.format(Number(n || 0));
// Compact: LKR 15,000 / LKR 1.25M
export function moneyShort(n) {
  n = Number(n || 0);
  const a = Math.abs(n), sign = n < 0 ? '−' : '';
  if (a >= 1e6) return `LKR ${sign}${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  return `LKR ${sign}${nf0.format(Math.round(a))}`;
}

// Payments: refunds subtract from the amount paid.
export const paymentSigned = p => (p.type === 'Refund' ? -1 : 1) * (Number(p.amount) || 0);
export function totals(inv) {
  const subtotal = (inv.items || []).reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  const discount = Math.min(Number(inv.discount) || 0, subtotal);
  const total = subtotal - discount;
  const paid = (inv.payments || []).reduce((a, p) => a + paymentSigned(p), 0);
  return { subtotal, discount, total, paid, balance: Math.max(total - paid, 0) };
}

// Due date: set on the invoice, otherwise X days before the event, otherwise the invoice date.
export function dueDate(inv, ev, settings) {
  if (inv.dueDate) return inv.dueDate;
  if (ev?.date) return addDays(ev.date, -(Number(settings?.paymentDueDays) || 10));
  return inv.date || '';
}
export function invoiceStatus(inv, ev, settings, today = todayISO()) {
  if (inv.docType === 'quotation') return 'Quotation';
  const t = totals(inv);
  if (t.total > 0 && t.balance <= 0.009) return 'Paid';
  const due = dueDate(inv, ev, settings);
  if (ev?.status === 'Cancelled') return t.paid > 0 ? 'Partially paid' : 'Pending';
  if (due && due < today) return 'Overdue';
  return t.paid > 0.009 ? 'Partially paid' : 'Pending';
}

// Sri Lankan numbers: 0771234567 -> 94771234567 for WhatsApp links.
export function waNumber(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '94' + p.slice(1);
  if (p.length === 9) p = '94' + p;
  return p;
}
export const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

export function occasionOf(type) {
  return { Wedding: 'wedding anniversary', Engagement: 'engagement anniversary', Anniversary: 'anniversary', Birthday: 'birthday' }[type] || 'anniversary';
}
export const yearlyDate = ev => ev.yearlyDate || ev.date;
export function nextOccurrence(ev, from = todayISO()) {
  const base = yearlyDate(ev);
  if (!base) return null;
  const by = parseISO(base).getFullYear();
  let y = Math.max(parseISO(from).getFullYear(), by + 1);
  let d = sameDayInYear(base, y);
  if (d < from) d = sameDayInYear(base, ++y);
  return { date: d, years: y - by, year: y };
}

export function fillTemplate(tpl, vars) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)); }
export const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/^9wings/i, '9Wings');
export function offerMessage(settings, ev, customer, occ, discount) {
  const tpl = ev.type === 'Birthday' ? settings.birthdayMsg : settings.anniversaryMsg;
  return fillTemplate(tpl, {
    names: ev.names || customer?.name || '',
    customer: customer?.name || '',
    ordinal: ordinal(occ.years),
    years: occ.years,
    occasion: occasionOf(ev.type),
    date: fmtNice(occ.date),
    discount,
    business: settings.businessName,
    phones: String(settings.phones || '').split('\n').filter(Boolean).join(' / ')
  });
}

export const alertDays = s => String(s.alertDays || '30,7').split(',').map(x => parseInt(x, 10)).filter(x => x > 0).sort((a, b) => b - a);

// Everything that needs attention, built from the data.
export function computeAlerts({ events, invoices, customers, offers, settings }, today = todayISO()) {
  const cust = Object.fromEntries(customers.map(c => [c.id, c]));
  const maxWindow = Math.max(...alertDays(settings), 1);
  const out = { yearly: [], payments: [], upcoming: [] };
  for (const ev of events) {
    if (ev.status === 'Cancelled') continue;
    if (ev.remindYearly) {
      const occ = nextOccurrence(ev, today);
      if (occ) {
        const days = daysBetween(today, occ.date);
        if (days <= maxWindow) {
          const sent = offers.find(o => o.eventId === ev.id && o.year === occ.year);
          out.yearly.push({ ev, customer: cust[ev.customerId], occ, days, sent });
        }
      }
    }
    if (ev.date && ev.status !== 'Completed') {
      const days = daysBetween(today, ev.date);
      if (days >= 0 && days <= 7) out.upcoming.push({ ev, customer: cust[ev.customerId], days });
    }
  }
  const evById = Object.fromEntries(events.map(e => [e.id, e]));
  for (const inv of invoices) {
    if (inv.docType !== 'invoice') continue;
    const t = totals(inv);
    if (t.balance <= 0.009) continue;
    const ev = evById[inv.eventId];
    if (ev?.status === 'Cancelled') continue;
    const due = dueDate(inv, ev, settings);
    if (!due) continue;
    const days = daysBetween(today, due);
    if (days <= 5 && days >= -60) out.payments.push({ inv, ev, customer: cust[inv.customerId], due, days, balance: t.balance });
  }
  out.yearly.sort((a, b) => a.days - b.days);
  out.payments.sort((a, b) => a.days - b.days);
  out.upcoming.sort((a, b) => a.days - b.days);
  return out;
}
export const daysLabel = d => d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : d < 0 ? `${-d} days ago` : `In ${d} days`;

// All payments across invoices, newest first.
export function allPayments(invoices) {
  const out = [];
  for (const inv of invoices) {
    if (inv.docType !== 'invoice') continue;
    (inv.payments || []).forEach((p, i) => out.push({ ...p, index: i, invoice: inv }));
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.at || '').localeCompare(a.at || ''));
}

// Money in, money out and profit for a date prefix ('2026' or '2026-11').
export function finance({ invoices, expenses }, prefix) {
  const received = allPayments(invoices).filter(p => (p.date || '').startsWith(prefix)).reduce((a, p) => a + paymentSigned(p), 0);
  const spent = (expenses || []).filter(e => (e.date || '').startsWith(prefix)).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  return { received, spent, profit: received - spent };
}

// ---------- details frozen on an invoice when it is issued ----------
// So a re-shared PDF always shows what the client originally received, even if settings or the client's address change later.
export const ISSUER_KEYS = ['businessName', 'tagline', 'slogan', 'phones', 'email', 'address', 'terms', 'paymentMethod', 'invoiceThanks'];
export const issuerFrom = settings => Object.fromEntries(ISSUER_KEYS.map(k => [k, settings?.[k] ?? '']));
export const billToFrom = c => ({ customerId: c?.id || '', name: c?.name || '', address: c?.address || '', phone: c?.phone || '' });
export const issuerDiffers = (inv, settings) => !!inv.issuer && ISSUER_KEYS.some(k => (inv.issuer[k] ?? '') !== (settings?.[k] ?? ''));
// Add the frozen details to an invoice that doesn't have them yet (or whose client was changed).
export function stampIssued(inv, settings, customer) {
  const out = { ...inv };
  if (!out.issuer) out.issuer = issuerFrom(settings);
  if (!out.billTo || out.billTo.customerId !== (customer?.id || '')) out.billTo = billToFrom(customer);
  return out;
}
