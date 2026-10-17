// Business rules: dates, money, alerts, messages.
export const EVENT_TYPES = ['Wedding', 'Homecoming', 'Engagement', 'Birthday', 'Anniversary', 'Get-together', 'Corporate', 'Flora order', 'Other'];
export const YEARLY_DEFAULT = { Wedding: true, Engagement: true, Birthday: true, Anniversary: true };
export const STATUSES = ['Inquiry', 'Confirmed', 'Completed', 'Cancelled'];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = (n, w = 2) => String(n).padStart(w, '0');

// Dates are stored as 'YYYY-MM-DD' strings (local dates, no time zone problems).
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export const fmtDate = s => { const d = parseISO(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ''; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtNice = s => { const d = parseISO(s); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : ''; };
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
// Same month/day in a given year (29 Feb falls back to 28 Feb).
export function sameDayInYear(iso, year) {
  const d = parseISO(iso);
  let m = d.getMonth(), day = d.getDate();
  if (m === 1 && day === 29 && new Date(year, 1, 29).getMonth() !== 1) day = 28;
  return toISO(new Date(year, m, day));
}
export function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

export const money = n => 'Rs. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num2 = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function totals(inv) {
  const subtotal = (inv.items || []).reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  const discount = Math.min(Number(inv.discount) || 0, subtotal);
  const total = subtotal - discount;
  const paid = (inv.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  return { subtotal, discount, total, paid, balance: Math.max(total - paid, 0) };
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

// The yearly date used for reminders (defaults to the event date).
export const yearlyDate = ev => ev.yearlyDate || ev.date;

// Next yearly occurrence on/after `from` (and strictly after the original year).
export function nextOccurrence(ev, from = todayISO()) {
  const base = yearlyDate(ev);
  if (!base) return null;
  const by = parseISO(base).getFullYear();
  let y = Math.max(parseISO(from).getFullYear(), by + 1);
  let d = sameDayInYear(base, y);
  if (d < from) d = sameDayInYear(base, ++y);
  return { date: d, years: y - by, year: y };
}

export function fillTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}

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
    business: titleCase(settings.businessName),
    phones: settings.phones.split('\n').filter(Boolean).join(' / ')
  });
}
export const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/^9wings/i, '9Wings');

export const alertDays = s => String(s.alertDays || '30,7').split(',').map(x => parseInt(x, 10)).filter(x => x > 0).sort((a, b) => b - a);

// Everything that needs attention, built from the local data.
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
    if (!ev || !ev.date || ev.status === 'Cancelled') continue;
    const due = addDays(ev.date, -(Number(settings.paymentDueDays) || 10));
    const days = daysBetween(today, due);
    if (days <= 5 && daysBetween(today, ev.date) >= -30) out.payments.push({ inv, ev, customer: cust[inv.customerId], due, days, balance: t.balance });
  }

  out.yearly.sort((a, b) => a.days - b.days);
  out.payments.sort((a, b) => a.days - b.days);
  out.upcoming.sort((a, b) => a.days - b.days);
  return out;
}

export const daysLabel = d => d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : d < 0 ? `${-d} days ago` : `In ${d} days`;
