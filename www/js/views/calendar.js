// Calendar: month, week and list views of events, anniversaries/birthdays and payment due dates.
import * as L from '../logic.js';
import { S, custName, evTitle, invDue } from '../state.js';
import { $, $$, go, icon, esc, badge, topbar, empty } from '../ui.js';

const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
};

// Everything shown on the calendar between two dates (inclusive).
function marksBetween(from, to) {
  const marks = {};
  const add = (d, x) => { if (d >= from && d <= to) (marks[d] = marks[d] || []).push(x); };
  const y0 = +from.slice(0, 4), y1 = +to.slice(0, 4);
  for (const ev of S.events) {
    if (ev.date) add(ev.date, { kind: ev.status === 'Cancelled' ? 'cancel' : 'event', ev, sort: ev.time || '99' });
    if (ev.remindYearly && ev.status !== 'Cancelled') {
      const base = L.yearlyDate(ev); const by = L.parseISO(base).getFullYear();
      for (let y = Math.max(y0, by + 1); y <= y1; y++) {
        add(L.sameDayInYear(base, y), { kind: 'yearly', ev, years: y - by, sort: '00' });
      }
    }
  }
  for (const inv of S.invoices) {
    if (inv.docType !== 'invoice' || S.ev[inv.eventId]?.status === 'Cancelled') continue;
    const bal = L.totals(inv).balance;
    if (bal <= 0.009) continue;
    const due = invDue(inv);
    if (due) add(due, { kind: 'pay', inv, bal, sort: '01' });
  }
  for (const k in marks) marks[k].sort((a, b) => a.sort.localeCompare(b.sort));
  return marks;
}

function markRow(x) {
  if (x.kind === 'pay') return `<a class="row" href="#/invoice/${x.inv.id}"><span class="tile-ic neg">${icon('wallet')}</span><div class="grow"><div class="t">Payment due · ${L.moneyShort(x.bal)}</div><div class="s">${esc(custName(x.inv.customerId))} · ${esc(x.inv.number || '')}</div></div>${icon('right', 'chev')}</a>`;
  if (x.kind === 'yearly') {
    const bday = x.ev.type === 'Birthday';
    return `<a class="row" href="#/booking/${x.ev.id}"><span class="tile-ic">${icon(bday ? 'cake' : 'heart')}</span><div class="grow"><div class="t">${bday ? 'Birthday' : esc(L.ordinal(x.years) + ' ' + L.occasionOf(x.ev.type))}</div><div class="s">${esc(evTitle(x.ev))}</div></div>${icon('right', 'chev')}</a>`;
  }
  const ev = x.ev;
  return `<a class="row" href="#/booking/${ev.id}"><span class="tile-ic gold">${icon(ev.type === 'Birthday' ? 'cake' : ev.type === 'Flora order' ? 'flower' : 'sparkles')}</span>
    <div class="grow"><div class="t">${esc(evTitle(ev))}</div><div class="s">${esc(ev.type)} · ${esc(custName(ev.customerId))}</div>${ev.time || ev.venue ? `<div class="s">${icon('clock')}${esc([L.fmtTime(ev.time), ev.venue].filter(Boolean).join(' · '))}</div>` : ''}</div>
    ${badge(ev.status || 'Inquiry')}</a>`;
}

export async function calendarView(ym, view) {
  const t = L.todayISO();
  view = view || store.get('nw-cal-view') || 'month';
  store.set('nw-cal-view', view);
  let sel = store.get('nw-cal-sel') || t;
  ym = ym || sel.slice(0, 7);
  if (!sel.startsWith(ym)) sel = ym === t.slice(0, 7) ? t : ym + '-01';
  const [y, m] = ym.split('-').map(Number);
  const prev = L.toISO(new Date(y, m - 2, 1)).slice(0, 7), next = L.toISO(new Date(y, m, 1)).slice(0, 7);

  const seg = `<div class="seg" style="margin:6px 0 4px">${[['month', 'Month'], ['week', 'Week'], ['list', 'List']].map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('')}</div>`;
  let body = '';

  if (view === 'month') {
    const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const marks = marksBetween(`${ym}-01`, `${ym}-${L.pad(daysIn)}`);
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<div class="cell blank"></div>';
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${ym}-${L.pad(d)}`, mk = marks[iso] || [];
      const kinds = [...new Set(mk.map(x => x.kind))];
      cells += `<button class="cell ${iso === t ? 'today' : ''} ${iso === sel ? 'sel' : ''}" data-day="${iso}" aria-label="${L.fmtNice(iso)}${mk.length ? ', ' + mk.length + ' items' : ''}"><span>${d}</span><i>${kinds.map(k => `<em class="dot ${k}"></em>`).join('')}</i></button>`;
    }
    const dayMarks = marksBetween(sel, sel)[sel] || [];
    body = `<div class="split-view"><div>
        <div class="cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<div class="dow">${x[0]}<span class="d-only">${x.slice(1)}</span></div>`).join('')}${cells}</div>
        <div class="legend"><span><em class="dot event lg"></em>Event</span><span><em class="dot yearly lg"></em>Anniversary / birthday</span><span><em class="dot pay lg"></em>Payment due</span></div>
      </div><div>
        <div class="agenda-day">${L.DAYS[L.parseISO(sel).getDay()]}, ${L.fmtNice(sel)}</div>
        <div class="list">${dayMarks.length ? dayMarks.map(markRow).join('') : `<div class="row static"><div class="grow s">Nothing on this day.</div></div>`}</div>
        <button class="btn gold block" style="margin-top:12px" data-new="${sel}">${icon('plus')} Booking on this day</button>
      </div></div>`;
  } else if (view === 'week') {
    const base = sel; const d0 = L.parseISO(base);
    const mon = L.addDays(base, -((d0.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => L.addDays(mon, i));
    const marks = marksBetween(days[0], days[6]);
    body = `<div class="cal-head" style="padding-top:2px"><button class="icon-btn" data-wk="-7" aria-label="Previous week">${icon('left')}</button><b class="small">${L.fmtShort(days[0])} – ${L.fmtNice(days[6])}</b><button class="icon-btn" data-wk="7" aria-label="Next week">${icon('right')}</button></div>
      <div class="week-view">${days.map(d => { const dd = L.parseISO(d); const mk = marks[d] || []; return `<div class="wd ${d === t ? 'today' : ''}"><div class="d"><span>${L.DAYS[dd.getDay()].slice(0, 3)}</span><b>${dd.getDate()}</b></div><div class="list">${mk.length ? mk.map(markRow).join('') : '<div class="none">—</div>'}</div></div>`; }).join('')}</div>`;
  } else {
    const from = `${ym}-01`, to = L.addDays(L.toISO(new Date(y, m, 1)), 59);
    const marks = marksBetween(from, to);
    const keys = Object.keys(marks).sort();
    body = keys.length ? keys.map(d => `<div class="agenda-day">${d === t ? 'Today · ' : ''}${L.DAYS[L.parseISO(d).getDay()]}, ${L.fmtNice(d)}</div><div class="list">${marks[d].map(markRow).join('')}</div>`).join('')
      : empty('calendar', 'Nothing scheduled', 'No events, anniversaries or payments in these months.', '<a class="btn" href="#/booking/new">' + icon('plus') + ' New booking</a>');
  }

  $('#main').innerHTML = `${topbar('Calendar', { actions: `<a class="icon-btn" href="#/bookings" aria-label="All bookings">${icon('list')}</a>` })}
  <div class="page wide">
    <div class="cal-head">
      <h2>${L.MONTHS_LONG[m - 1]} ${y}</h2>
      <div class="nav">${ym !== t.slice(0, 7) || sel !== t ? `<button class="btn secondary sm" data-today>Today</button>` : ''}
        <a class="icon-btn" href="#/calendar/${prev}/${view}" aria-label="Previous month">${icon('left')}</a>
        <a class="icon-btn" href="#/calendar/${next}/${view}" aria-label="Next month">${icon('right')}</a></div>
    </div>
    ${seg}
    <div style="margin-top:10px">${body}</div>
  </div>
  <button class="fab" data-new="${sel}" aria-label="New booking">${icon('plus')}</button>`;

  $$('[data-view]').forEach(b => b.onclick = () => go(`#/calendar/${ym}/${b.dataset.view}`));
  $$('[data-day]').forEach(b => b.onclick = () => { store.set('nw-cal-sel', b.dataset.day); calendarView(ym, view); });
  $$('[data-wk]').forEach(b => b.onclick = () => { const n = L.addDays(sel, +b.dataset.wk); store.set('nw-cal-sel', n); go(`#/calendar/${n.slice(0, 7)}/week`); });
  $$('[data-today]').forEach(b => b.onclick = () => { store.set('nw-cal-sel', t); go(`#/calendar/${t.slice(0, 7)}/${view}`); });
  $$('[data-new]').forEach(b => b.onclick = () => { try { sessionStorage.setItem('nw-newdate', b.dataset.new); } catch (e) { /* ignore */ } go('#/booking/new'); });
}
