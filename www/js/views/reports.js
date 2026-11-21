// Reports: revenue, expenses, profit, bookings, clients — all from the recorded data.
import * as L from '../logic.js';
import { S, custName } from '../state.js';
import { $, $$, icon, esc, eyebrow, topbar } from '../ui.js';
import { exportSheet } from '../report.js';

function bars(values, labels, cur, fmt) {
  const max = Math.max(1, ...values.map(v => Math.max(0, v)));
  return `<div class="bars" role="img" aria-label="${esc(labels.map((l, i) => l + ' ' + fmt(values[i])).join(', '))}">${values.map((v, i) => `<div class="bar ${i === cur ? 'cur' : ''}" title="${esc(labels[i])}: ${esc(fmt(v))}">${i === cur && v ? `<em>${esc(fmt(v))}</em>` : ''}<i style="height:${Math.max(0, v) / max * 82}%"></i><span>${labels[i][0]}</span></div>`).join('')}</div>`;
}
const short = v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'k' : String(Math.round(v));

export async function reportsView(yearArg) {
  const t = L.todayISO();
  const years = [...new Set([t.slice(0, 4), ...S.events.map(e => (e.date || '').slice(0, 4)), ...L.allPayments(S.invoices).map(p => (p.date || '').slice(0, 4))].filter(Boolean))].sort().reverse();
  let year = yearArg || sessionStorage.getItem('nw-rep-y') || t.slice(0, 4);
  if (!years.includes(year)) year = years[0];
  try { sessionStorage.setItem('nw-rep-y', year); } catch (e) { /* ignore */ }
  const curM = year === t.slice(0, 4) ? +t.slice(5, 7) - 1 : -1;

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${L.pad(i + 1)}`);
  const rev = months.map(m => L.finance(S, m).received);
  const exp = months.map(m => L.finance(S, m).spent);
  const fy = L.finance(S, year);
  const evYear = S.events.filter(e => (e.date || '').startsWith(year) && e.status !== 'Cancelled');
  const bookingsByMonth = months.map(m => evYear.filter(e => e.date.startsWith(m)).length);
  const byType = {}; evYear.forEach(e => byType[e.type] = (byType[e.type] || 0) + 1);
  const maxType = Math.max(1, ...Object.values(byType));
  const billed = S.invoices.filter(i => i.docType === 'invoice' && (i.date || '').startsWith(year)).reduce((a, i) => a + L.totals(i).total, 0);
  const outstanding = S.invoices.filter(i => i.docType === 'invoice' && S.ev[i.eventId]?.status !== 'Cancelled').reduce((a, i) => a + L.totals(i).balance, 0);
  const pays = L.allPayments(S.invoices).filter(p => (p.date || '').startsWith(year));
  const byMethod = {}; pays.forEach(p => { const k = p.method || 'Not set'; byMethod[k] = (byMethod[k] || 0) + L.paymentSigned(p); });
  const maxMethod = Math.max(1, ...Object.values(byMethod));
  const expByCat = {}; S.expenses.filter(x => (x.date || '').startsWith(year)).forEach(x => expByCat[x.category || 'Other'] = (expByCat[x.category || 'Other'] || 0) + Number(x.amount || 0));
  const maxCat = Math.max(1, ...Object.values(expByCat));
  const cancelled = S.events.filter(e => (e.date || '').startsWith(year) && e.status === 'Cancelled').length;

  // clients
  const perClient = {}; S.events.forEach(e => perClient[e.customerId] = (perClient[e.customerId] || 0) + 1);
  const newClients = S.customers.filter(c => (c.createdAt || '').startsWith(year)).length;
  const repeat = Object.values(perClient).filter(n => n > 1).length;
  const spend = {}; S.invoices.filter(i => i.docType === 'invoice' && (i.date || '').startsWith(year)).forEach(i => spend[i.customerId] = (spend[i.customerId] || 0) + L.totals(i).total);
  const top = Object.entries(spend).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const offersYr = S.offers.filter(o => String(o.year) === year || (o.sentAt || '').startsWith(year));
  const offerBooked = offersYr.filter(o => S.events.some(e => e.customerId === o.customerId && e.createdAt > o.sentAt)).length;

  $('#main').innerHTML = `${topbar('Reports', { back: true, actions: `<button class="icon-btn" id="exp2" aria-label="Export">${icon('download')}</button>` })}
  <div class="page wide">
    <div class="page-head" style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px"><div style="flex:1 1 280px"><h2>Reports</h2><p>Based on payments, expenses and bookings recorded in the app.</p></div>
      <div style="display:flex;gap:8px"><select id="yr" aria-label="Year" style="width:auto">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <button class="btn" id="exp">${icon('download')} Export</button></div></div>
    <div class="kpis">
      <div class="kpi dark"><span>Received ${year}</span><b>${L.moneyShort(fy.received)}</b><small>Invoiced ${L.moneyShort(billed)}</small></div>
      <div class="kpi"><span>Expenses</span><b>${L.moneyShort(fy.spent)}</b></div>
      <div class="kpi"><span>Profit</span><b class="${fy.profit < 0 ? 'neg' : ''}">${L.moneyShort(fy.profit)}</b><small>received − expenses</small></div>
      <div class="kpi"><span>Balance to collect</span><b>${L.moneyShort(outstanding)}</b><small>all open invoices</small></div>
    </div>
    <div class="split-view"><div>
      ${eyebrow('Money received by month')}
      <div class="card">${bars(rev, L.MONTHS, curM, short)}</div>
      ${eyebrow('Profit by month')}
      <div class="list">${months.map((m, i) => ({ m, i, r: rev[i], x: exp[i] })).filter(r => r.r || r.x).reverse().map(r => `<div class="row static"><div class="grow"><div class="t">${L.MONTHS_LONG[r.i]}</div><div class="s">In ${L.moneyShort(r.r)} · Out ${L.moneyShort(r.x)}</div></div><b class="num ${r.r - r.x < 0 ? 'neg' : 'pos'}">${L.moneyShort(r.r - r.x)}</b></div>`).join('') || '<div class="row static s">No payments or expenses this year.</div>'}</div>
      ${eyebrow('Bookings by month')}
      <div class="card">${bars(bookingsByMonth, L.MONTHS, curM, v => String(v))}<p class="small muted" style="margin:10px 0 0">${evYear.length} bookings in ${year}${cancelled ? ` · ${cancelled} cancelled` : ''}</p></div>
    </div><div>
      ${eyebrow('Event types')}
      <div class="card">${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="hbar"><span class="ellipsis">${esc(k)}</span><div class="progress"><i style="width:${v / maxType * 100}%"></i></div><b class="small">${v}</b></div>`).join('') || '<p class="small muted" style="margin:0">No bookings this year.</p>'}</div>
      ${eyebrow('Payment methods')}
      <div class="card">${Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="hbar"><span class="ellipsis">${esc(k)}</span><div class="progress"><i style="width:${Math.max(0, v) / maxMethod * 100}%"></i></div><b class="small">${short(v)}</b></div>`).join('') || '<p class="small muted" style="margin:0">No payments this year.</p>'}</div>
      ${Object.keys(expByCat).length ? eyebrow('Expenses by category') + `<div class="card">${Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="hbar"><span class="ellipsis">${esc(k)}</span><div class="progress gold"><i style="width:${v / maxCat * 100}%"></i></div><b class="small">${short(v)}</b></div>`).join('')}</div>` : ''}
      ${eyebrow('Clients')}
      <div class="kpis" style="grid-template-columns:1fr 1fr 1fr"><div class="kpi"><span>All clients</span><b>${S.customers.length}</b></div><div class="kpi"><span>New in ${year}</span><b>${newClients}</b></div><div class="kpi"><span>Returning</span><b>${repeat}</b></div></div>
      ${top.length ? `<div class="list" style="margin-top:10px">${top.map(([cid, v], i) => `<a class="row" href="#/client/${cid}"><span class="tile-ic ${i === 0 ? 'gold' : ''}">${i + 1}</span><div class="grow t">${esc(custName(cid))}</div><b class="num">${L.moneyShort(v)}</b></a>`).join('')}</div>` : ''}
      ${eyebrow('Anniversary & birthday offers')}
      <div class="list"><div class="row static"><span class="tile-ic gold">${icon('gift')}</span><div class="grow t">Offers sent</div><b>${offersYr.length}</b></div><div class="row static"><span class="tile-ic pos">${icon('circleCheck')}</span><div class="grow t">Booked again after an offer</div><b>${offerBooked}</b></div></div>
    </div></div>
  </div>`;
  $('#yr').onchange = e => reportsView(e.target.value);
  [$('#exp'), $('#exp2')].forEach(b => b.onclick = () => exportSheet(year));
}
