import * as db from './db.js';
import * as L from './logic.js';
import { buildInvoicePdf, pdfFileName } from './pdf.js';
import * as N from './native.js';
import * as Sync from './sync.js';

const { esc, money, fmtDate, fmtNice, todayISO } = L;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = () => $('#view');

let S = {}; // in-memory copy of the data for the current screen
async function load() {
  const [customers, events, invoices, items, offers, settings] = await Promise.all(['customers', 'events', 'invoices', 'items', 'offers'].map(s => db.all(s)).concat([db.getSettings()]));
  S = { customers, events, invoices, items, offers, settings };
  S.cust = Object.fromEntries(customers.map(c => [c.id, c]));
  S.ev = Object.fromEntries(events.map(e => [e.id, e]));
  return S;
}

// ---------- UI helpers ----------
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function header(title, { back, action } = {}) {
  return `<header class="top">
    ${back ? `<button class="icon-btn" data-back aria-label="Back">${ICON.back}</button>` : `<img class="brand-logo" src="img/logo.jpg" alt="">`}
    <h1>${esc(title)}</h1>
    ${action || '<span class="spacer"></span>'}
  </header>`;
}
function modal(html, onMount) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet" role="dialog">${html}</div>`;
  m.classList.add('open');
  m.onclick = e => { if (e.target === m) closeModal(); };
  onMount && onMount($('.sheet', m));
}
function closeModal() { const m = $('#modal'); m.classList.remove('open'); m.innerHTML = ''; }
function confirmBox(msg, okLabel = 'Delete') {
  return new Promise(res => {
    modal(`<p class="confirm-msg">${esc(msg)}</p><div class="row-btns"><button class="btn ghost" data-no>Cancel</button><button class="btn danger" data-yes>${esc(okLabel)}</button></div>`, sh => {
      $('[data-no]', sh).onclick = () => { closeModal(); res(false); };
      $('[data-yes]', sh).onclick = () => { closeModal(); res(true); };
    });
  });
}
const go = hash => { location.hash = hash; };
const formData = form => Object.fromEntries(new FormData(form).entries());
const custName = id => S.cust[id]?.name || 'Unknown customer';
const evLabel = ev => `${ev.type}${ev.names ? ' · ' + ev.names : ''}`;
const statusPill = s => `<span class="pill st-${(s || 'Inquiry').toLowerCase()}">${esc(s || 'Inquiry')}</span>`;
const empty = (msg, btn = '') => `<div class="empty"><p>${msg}</p>${btn}</div>`;

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-5-5.5"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  wa: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/></svg>'
};

// ---------- Router ----------
const routes = [
  [/^#\/home$/, homeView],
  [/^#\/calendar(?:\/(\d{4}-\d{2}))?$/, calendarView],
  [/^#\/customers$/, customersView],
  [/^#\/customer\/new$/, () => customerForm()],
  [/^#\/customer\/([^/]+)\/edit$/, id => customerForm(id)],
  [/^#\/customer\/([^/]+)$/, customerDetail],
  [/^#\/event\/new(?:\/([^/]+))?$/, cid => eventForm(null, cid)],
  [/^#\/event\/([^/]+)\/edit$/, id => eventForm(id)],
  [/^#\/event\/([^/]+)$/, eventDetail],
  [/^#\/events$/, eventsView],
  [/^#\/invoices$/, invoicesView],
  [/^#\/invoice\/new(?:\/([^/]+))?$/, evId => invoiceForm(null, evId)],
  [/^#\/invoice\/([^/]+)$/, id => invoiceForm(id)],
  [/^#\/more$/, moreView],
  [/^#\/settings$/, settingsView],
  [/^#\/items$/, itemsView],
  [/^#\/sync$/, syncView],
  [/^#\/reports$/, reportsView],
];
const TABS = { home: '#/home', calendar: '#/calendar', customers: '#/customers', invoices: '#/invoices', more: '#/more' };

async function route() {
  const h = location.hash || '#/home';
  closeModal();
  await load();
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      const tab = h.startsWith('#/calendar') || h.startsWith('#/event') ? 'calendar' : h.startsWith('#/customer') ? 'customers' : h.startsWith('#/invoice') ? 'invoices' : h.startsWith('#/home') ? 'home' : 'more';
      $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
      window.scrollTo(0, 0);
      await fn(...m.slice(1).map(x => x && decodeURIComponent(x)));
      $$('[data-back]').forEach(b => b.onclick = () => history.length > 1 ? history.back() : go('#/home'));
      return;
    }
  }
  go('#/home');
}

// ---------- Home / alerts ----------
async function homeView() {
  const A = L.computeAlerts(S);
  const pendingOffers = A.yearly.filter(a => !a.sent);
  const count = pendingOffers.length + A.payments.length;
  N.webSummaryNotification(count);
  const t = todayISO();
  const next = S.events.filter(e => e.date >= t && e.status !== 'Cancelled').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const month = t.slice(0, 7);
  const monthIncome = S.invoices.filter(i => i.docType === 'invoice').flatMap(i => i.payments || []).filter(p => (p.date || '').startsWith(month)).reduce((a, p) => a + Number(p.amount || 0), 0);
  const outstanding = S.invoices.filter(i => i.docType === 'invoice').reduce((a, i) => a + L.totals(i).balance, 0);

  view().innerHTML = `
  ${header(L.titleCase(S.settings.businessName), { action: `<button class="icon-btn" onclick="location.hash='#/sync'" aria-label="Sync">${syncBadge()}</button>` })}
  <section class="hero">
    <p class="hello">${greet()}</p>
    <p class="today">${fmtNice(t)}</p>
    <div class="stats">
      <div><b>${money(monthIncome).replace('Rs. ', '')}</b><span>Received this month</span></div>
      <div><b>${money(outstanding).replace('Rs. ', '')}</b><span>Balance to collect</span></div>
    </div>
  </section>

  <section class="block">
    <h2>${ICON.bell} Special offers to send <em>${pendingOffers.length || ''}</em></h2>
    ${A.yearly.length ? A.yearly.map(a => yearlyCard(a)).join('') : `<p class="muted small">No anniversaries or birthdays in the next ${Math.max(...L.alertDays(S.settings))} days.</p>`}
  </section>

  ${A.payments.length ? `<section class="block"><h2>Payments due</h2>${A.payments.map(p => `
    <a class="card row" href="#/invoice/${p.inv.id}">
      <div class="grow"><b>${esc(p.customer?.name || '')}</b><span class="muted small">${esc(p.inv.number)} · ${p.ev.type} on ${fmtNice(p.ev.date)}</span></div>
      <div class="right"><b class="neg">${money(p.balance)}</b><span class="small ${p.days < 0 ? 'neg' : 'muted'}">${p.days < 0 ? 'Overdue ' + -p.days + 'd' : 'Due ' + L.daysLabel(p.days).toLowerCase()}</span></div>
    </a>`).join('')}</section>` : ''}

  <section class="block">
    <h2>Coming up</h2>
    ${next.length ? next.map(eventRow).join('') : empty('No upcoming events yet.', `<a class="btn" href="#/event/new">Add a booking</a>`)}
  </section>
  <a class="fab" href="#/event/new" aria-label="New booking">${ICON.plus}</a>`;

  $$('[data-offer]').forEach(b => b.onclick = () => offerModal(b.dataset.offer));
  $$('[data-unsent]').forEach(b => b.onclick = async () => { await db.remove('offers', b.dataset.unsent); route(); });
}
function greet() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function syncBadge() {
  const ls = S.settings.lastSync;
  const stale = !ls || (Date.now() - new Date(ls)) > 3 * 86400000;
  return `<span class="sync-ic ${stale ? 'stale' : ''}"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-14.3 5M4 12a8 8 0 0 1 14.3-5"/><path d="M18 3v4h-4M6 21v-4h4"/></svg></span>`;
}
function yearlyCard(a) {
  const { ev, occ, days, sent, customer } = a;
  return `<div class="card offer ${sent ? 'done' : ''}">
    <div class="offer-top">
      <div class="badge-yr">${ev.type === 'Birthday' ? '🎂' : '💍'}${ev.type === 'Birthday' ? '' : `<span>${L.ordinal(occ.years)}</span>`}</div>
      <div class="grow">
        <b>${esc(ev.names || customer?.name || '')}</b>
        <span class="muted small">${L.occasionOf(ev.type)} · ${fmtNice(occ.date)}</span>
        <span class="small ${days <= 7 ? 'gold' : 'muted'}">${L.daysLabel(days)}</span>
      </div>
    </div>
    ${sent ? `<div class="sent-row"><span class="small">✓ Offer sent ${fmtDate(sent.sentAt.slice(0, 10))} (${sent.discount}%)</span><button class="link small" data-unsent="${sent.id}">Undo</button></div>`
      : `<button class="btn wa" data-offer="${ev.id}">${ICON.wa} Send offer</button>`}
  </div>`;
}
function eventRow(ev) {
  const d = L.parseISO(ev.date);
  return `<a class="card row" href="#/event/${ev.id}">
    <div class="datebox"><b>${d ? d.getDate() : '?'}</b><span>${d ? L.MONTHS_LONG[d.getMonth()].slice(0, 3) : ''}</span></div>
    <div class="grow"><b>${esc(evLabel(ev))}</b><span class="muted small">${esc(custName(ev.customerId))}${ev.venue ? ' · ' + esc(ev.venue) : ''}</span></div>
    ${statusPill(ev.status)}
  </a>`;
}

function offerModal(eventId) {
  const ev = S.ev[eventId], customer = S.cust[ev.customerId];
  const occ = L.nextOccurrence(ev);
  const disc = Number(S.settings.defaultDiscount) || 10;
  modal(`<h3>Special ${L.occasionOf(ev.type)} offer</h3>
    <p class="muted small">To ${esc(customer?.name || '')} · ${esc(customer?.phone || 'no phone number')}</p>
    <label class="field"><span>Discount %</span><input id="disc" type="number" inputmode="decimal" min="0" max="100" value="${disc}"></label>
    <label class="field"><span>Message</span><textarea id="msg" rows="8">${esc(L.offerMessage(S.settings, ev, customer, occ, disc))}</textarea></label>
    <div class="row-btns"><button class="btn ghost" data-close>Cancel</button><button class="btn wa" data-send>${ICON.wa} Open WhatsApp</button></div>`, sh => {
    const msg = $('#msg', sh), discIn = $('#disc', sh);
    let edited = false;
    msg.oninput = () => { edited = true; };
    discIn.oninput = () => {
      const d = discIn.value || '0';
      if (!edited) msg.value = L.offerMessage(S.settings, ev, customer, occ, d);
      else msg.value = msg.value.replace(/\d+(\.\d+)?%/, d + '%');
    };
    $('[data-close]', sh).onclick = closeModal;
    $('[data-send]', sh).onclick = async () => {
      if (!customer?.phone) { toast('Add a phone number to this customer first.'); return; }
      N.openExternal(L.waLink(customer.phone, msg.value));
      await db.put('offers', { eventId: ev.id, year: occ.year, discount: Number(discIn.value) || 0, sentAt: new Date().toISOString(), customerId: ev.customerId });
      closeModal(); toast('Marked as sent'); route();
    };
  });
}

// ---------- Calendar ----------
async function calendarView(ym) {
  const t = todayISO();
  ym = ym || t.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate();
  const startDow = (first.getDay() + 6) % 7; // Monday first
  const marks = {}; // date -> list of {kind, label, href}
  const add = (d, x) => { (marks[d] = marks[d] || []).push(x); };
  for (const ev of S.events) {
    if (ev.date && ev.date.startsWith(ym)) add(ev.date, { kind: ev.status === 'Cancelled' ? 'cancel' : 'event', label: evLabel(ev), sub: custName(ev.customerId) + (ev.time ? ' · ' + ev.time : '') + (ev.venue ? ' · ' + ev.venue : ''), href: '#/event/' + ev.id, status: ev.status });
    if (ev.remindYearly && ev.status !== 'Cancelled') {
      const base = L.yearlyDate(ev);
      const by = L.parseISO(base).getFullYear();
      if (y > by) {
        const d = L.sameDayInYear(base, y);
        if (d.startsWith(ym)) add(d, { kind: 'yearly', label: ev.type === 'Birthday' ? 'Birthday' : `${L.ordinal(y - by)} ${L.occasionOf(ev.type)}`, sub: ev.names || custName(ev.customerId), href: '#/event/' + ev.id });
      }
    }
  }
  for (const inv of S.invoices) {
    const ev = S.ev[inv.eventId];
    if (inv.docType !== 'invoice' || !ev?.date || ev.status === 'Cancelled') continue;
    const bal = L.totals(inv).balance;
    if (bal <= 0.009) continue;
    const due = L.addDays(ev.date, -(Number(S.settings.paymentDueDays) || 10));
    if (due.startsWith(ym)) add(due, { kind: 'pay', label: `Payment due ${money(bal)}`, sub: `${custName(inv.customerId)} · ${inv.number}`, href: '#/invoice/' + inv.id });
  }
  const prev = L.toISO(new Date(y, m - 2, 1)).slice(0, 7), nxt = L.toISO(new Date(y, m, 1)).slice(0, 7);
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="cell blank"></div>';
  for (let d = 1; d <= daysIn; d++) {
    const iso = `${ym}-${L.pad(d)}`, mk = marks[iso] || [];
    const kinds = [...new Set(mk.map(x => x.kind))];
    cells += `<button class="cell ${iso === t ? 'today' : ''} ${mk.length ? 'has' : ''}" data-day="${iso}"><span>${d}</span><i>${kinds.map(k => `<em class="dot ${k}"></em>`).join('')}</i></button>`;
  }
  view().innerHTML = `${header('Calendar', { action: `<a class="icon-btn" href="#/events" aria-label="List">☰</a>` })}
  <div class="cal-head"><a class="icon-btn" href="#/calendar/${prev}">‹</a><h2>${L.MONTHS_LONG[m - 1]} ${y}</h2><a class="icon-btn" href="#/calendar/${nxt}">›</a></div>
  <div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<div class="dow">${x}</div>`).join('')}${cells}</div>
  <div class="legend"><span><em class="dot event"></em>Event</span><span><em class="dot yearly"></em>Anniversary / birthday</span><span><em class="dot pay"></em>Payment due</span></div>
  <div id="daylist"></div>
  <a class="fab" href="#/event/new" aria-label="New booking">${ICON.plus}</a>`;
  const showDay = iso => {
    $$('.cell').forEach(c => c.classList.toggle('sel', c.dataset.day === iso));
    const mk = marks[iso] || [];
    $('#daylist').innerHTML = `<section class="block"><h2>${fmtNice(iso)}</h2>${mk.length ? mk.map(x => `<a class="card row" href="${x.href}"><em class="dot ${x.kind} big"></em><div class="grow"><b>${esc(x.label)}</b><span class="muted small">${esc(x.sub)}</span></div>${x.status ? statusPill(x.status) : ''}</a>`).join('') : '<p class="muted small">Nothing on this day.</p>'}
      <a class="btn ghost full" href="#/event/new" data-newday="${iso}">+ Booking on this day</a></section>`;
    $('[data-newday]').onclick = e => { e.preventDefault(); sessionStorage.setItem('nw-newdate', iso); go('#/event/new'); };
  };
  $$('[data-day]').forEach(c => c.onclick = () => showDay(c.dataset.day));
  showDay(ym === t.slice(0, 7) ? t : `${ym}-01`);
}

async function eventsView() {
  const t = todayISO();
  const up = S.events.filter(e => e.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const past = S.events.filter(e => !e.date || e.date < t).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  view().innerHTML = `${header('All bookings', { back: true })}
  <div class="pad"><div class="search">${ICON.search}<input id="q" placeholder="Search name, type, venue"></div></div>
  <section class="block"><h2>Upcoming</h2><div id="up">${up.map(eventRow).join('') || '<p class="muted small">None</p>'}</div></section>
  <section class="block"><h2>Past</h2><div id="past">${past.map(eventRow).join('') || '<p class="muted small">None</p>'}</div></section>`;
  $('#q').oninput = e => { const q = e.target.value.toLowerCase(); $$('.card.row').forEach(c => c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none'); };
}

// ---------- Customers ----------
async function customersView() {
  const list = [...S.customers].sort((a, b) => a.name.localeCompare(b.name));
  view().innerHTML = `${header('Customers', { action: `<a class="icon-btn" href="#/customer/new" aria-label="Add">${ICON.plus}</a>` })}
  <div class="pad"><div class="search">${ICON.search}<input id="q" placeholder="Search name or phone"></div></div>
  <section class="block" id="list">${list.length ? list.map(c => {
    const n = S.events.filter(e => e.customerId === c.id).length;
    return `<a class="card row" href="#/customer/${c.id}"><div class="avatar">${esc((c.name || '?').trim()[0]?.toUpperCase() || '?')}</div><div class="grow"><b>${esc(c.name)}</b><span class="muted small">${esc(c.phone || '')}${n ? ' · ' + n + ' booking' + (n > 1 ? 's' : '') : ''}</span></div></a>`;
  }).join('') : empty('No customers yet.', '<a class="btn" href="#/customer/new">Add customer</a>')}</section>`;
  $('#q') && ($('#q').oninput = e => { const q = e.target.value.toLowerCase().replace(/\s/g, ''); $$('#list .card').forEach(c => c.style.display = c.textContent.toLowerCase().replace(/\s/g, '').includes(q) ? '' : 'none'); });
}

async function customerForm(id, { inline = false, onSaved } = {}) {
  const c = id ? S.cust[id] : {};
  const html = `<form id="cf" class="form">
    <label class="field"><span>Full name *</span><input name="name" required value="${esc(c.name)}" autocomplete="off"></label>
    <label class="field"><span>Phone (WhatsApp) *</span><input name="phone" type="tel" inputmode="tel" required value="${esc(c.phone)}" placeholder="07X XXX XXXX"></label>
    <label class="field"><span>Other phone</span><input name="phone2" type="tel" inputmode="tel" value="${esc(c.phone2)}"></label>
    <label class="field"><span>Address</span><textarea name="address" rows="2">${esc(c.address)}</textarea></label>
    <label class="field"><span>Notes</span><textarea name="notes" rows="2">${esc(c.notes)}</textarea></label>
    <button class="btn full" type="submit">Save customer</button>
    ${id ? '<button class="btn danger ghost full" type="button" id="del">Delete customer</button>' : ''}
  </form>`;
  if (inline) return html;
  view().innerHTML = `${header(id ? 'Edit customer' : 'New customer', { back: true })}<div class="pad">${html}</div>`;
  $('#cf').onsubmit = async e => {
    e.preventDefault();
    const rec = await db.put('customers', { ...c, ...formData(e.target) });
    toast('Customer saved');
    onSaved ? onSaved(rec) : go('#/customer/' + rec.id);
  };
  $('#del') && ($('#del').onclick = async () => {
    const evs = S.events.filter(e => e.customerId === id), invs = S.invoices.filter(i => i.customerId === id);
    if (evs.length || invs.length) { toast('This customer has bookings or invoices. Delete those first.'); return; }
    if (await confirmBox(`Delete ${c.name}?`)) { await db.remove('customers', id); go('#/customers'); }
  });
}

async function customerDetail(id) {
  const c = S.cust[id];
  if (!c) return go('#/customers');
  const evs = S.events.filter(e => e.customerId === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const invs = S.invoices.filter(i => i.customerId === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  view().innerHTML = `${header(c.name, { back: true, action: `<a class="icon-btn" href="#/customer/${id}/edit">Edit</a>` })}
  <section class="block">
    <div class="card">
      ${c.phone ? `<p><span class="muted small">Phone</span><br>${esc(c.phone)}${c.phone2 ? ' / ' + esc(c.phone2) : ''}</p>` : ''}
      ${c.address ? `<p><span class="muted small">Address</span><br>${esc(c.address)}</p>` : ''}
      ${c.notes ? `<p><span class="muted small">Notes</span><br>${esc(c.notes)}</p>` : ''}
      <div class="row-btns">
        ${c.phone ? `<a class="btn ghost" href="tel:${esc(c.phone.replace(/\s/g, ''))}">${ICON.phone} Call</a><button class="btn wa" id="wa">${ICON.wa} WhatsApp</button>` : ''}
      </div>
    </div>
  </section>
  <section class="block"><h2>Bookings</h2>${evs.map(eventRow).join('') || '<p class="muted small">No bookings yet.</p>'}
    <a class="btn ghost full" href="#/event/new/${id}">+ New booking</a></section>
  <section class="block"><h2>Invoices & quotations</h2>${invs.map(invoiceRow).join('') || '<p class="muted small">None yet.</p>'}</section>`;
  $('#wa') && ($('#wa').onclick = () => N.openExternal(L.waLink(c.phone, '')));
}

// ---------- Events (bookings) ----------
async function eventForm(id, presetCustomer) {
  const ev = id ? S.ev[id] : { type: 'Wedding', status: 'Confirmed', remindYearly: true, customerId: presetCustomer || '', date: sessionStorage.getItem('nw-newdate') || '' };
  sessionStorage.removeItem('nw-newdate');
  const custOpts = [...S.customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}" ${c.id === ev.customerId ? 'selected' : ''}>${esc(c.name)} ${c.phone ? '· ' + esc(c.phone) : ''}</option>`).join('');
  view().innerHTML = `${header(id ? 'Edit booking' : 'New booking', { back: true })}
  <div class="pad"><form id="ef" class="form">
    <div class="field"><span>Customer *</span>
      <div class="cust-pick">
        <select name="customerId" id="custSel"><option value="">— Select customer —</option><option value="__new">+ New customer</option>${custOpts}</select>
      </div>
      <div id="newCust" class="subform hidden">
        <input name="nc_name" placeholder="Customer full name">
        <input name="nc_phone" type="tel" inputmode="tel" placeholder="Phone (WhatsApp) 07X XXX XXXX">
        <input name="nc_address" placeholder="Address">
      </div>
    </div>
    <label class="field"><span>Event type</span><select name="type" id="typeSel">${L.EVENT_TYPES.map(t => `<option ${t === ev.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="field"><span id="namesLbl">Names (e.g. Nimal & Dilini)</span><input name="names" value="${esc(ev.names)}" autocomplete="off"></label>
    <div class="two">
      <label class="field"><span>Event date *</span><input name="date" type="date" required value="${esc(ev.date)}"></label>
      <label class="field"><span>Time</span><input name="time" type="time" value="${esc(ev.time)}"></label>
    </div>
    <label class="field"><span>Venue</span><input name="venue" value="${esc(ev.venue)}"></label>
    <label class="field"><span>Theme / colours</span><input name="theme" value="${esc(ev.theme)}"></label>
    <label class="field"><span>Status</span><select name="status">${L.STATUSES.map(s => `<option ${s === ev.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label class="check"><input type="checkbox" name="remindYearly" id="remind" ${ev.remindYearly ? 'checked' : ''}> <span>Remind me every year (anniversary / birthday offer)</span></label>
    <label class="field ${ev.remindYearly ? '' : 'hidden'}" id="ydWrap"><span>Yearly reminder date <em class="muted">— leave empty to use the event date</em></span><input name="yearlyDate" type="date" value="${esc(ev.yearlyDate || '')}"></label>
    <label class="field"><span>Notes</span><textarea name="notes" rows="3">${esc(ev.notes)}</textarea></label>
    <button class="btn full" type="submit">Save booking</button>
    ${id ? '<button class="btn danger ghost full" type="button" id="del">Delete booking</button>' : ''}
  </form></div>`;
  const custSel = $('#custSel');
  custSel.onchange = () => $('#newCust').classList.toggle('hidden', custSel.value !== '__new');
  if (!S.customers.length) { custSel.value = '__new'; custSel.onchange(); }
  const typeSel = $('#typeSel');
  const setLbl = () => { $('#namesLbl').textContent = typeSel.value === 'Birthday' ? "Birthday person's name (e.g. Baby Senuth)" : typeSel.value === 'Wedding' || typeSel.value === 'Engagement' || typeSel.value === 'Anniversary' ? 'Couple names (e.g. Nimal & Dilini)' : 'Name / title (optional)'; };
  setLbl();
  typeSel.onchange = () => { setLbl(); if (!id) { $('#remind').checked = !!L.YEARLY_DEFAULT[typeSel.value]; $('#remind').onchange(); } };
  $('#remind').onchange = () => $('#ydWrap').classList.toggle('hidden', !$('#remind').checked);
  $('#ef').onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target);
    let customerId = f.customerId;
    if (customerId === '__new' || !customerId) {
      if (!f.nc_name?.trim() || !f.nc_phone?.trim()) { toast('Enter the customer name and phone.'); return; }
      const c = await db.put('customers', { name: f.nc_name.trim(), phone: f.nc_phone.trim(), address: f.nc_address || '' });
      customerId = c.id;
    }
    const rec = await db.put('events', { ...ev, customerId, type: f.type, names: f.names, date: f.date, time: f.time, venue: f.venue, theme: f.theme, status: f.status, remindYearly: !!f.remindYearly, yearlyDate: f.yearlyDate || '', notes: f.notes });
    toast('Booking saved');
    history.replaceState(null, '', '#/event/' + rec.id); route();
  };
  $('#del') && ($('#del').onclick = async () => {
    const invs = S.invoices.filter(i => i.eventId === id);
    if (invs.length) { toast('This booking has invoices. Delete them first.'); return; }
    if (await confirmBox('Delete this booking?')) { await db.remove('events', id); go('#/calendar'); }
  });
}

async function eventDetail(id) {
  const ev = S.ev[id];
  if (!ev) return go('#/calendar');
  const c = S.cust[ev.customerId];
  const invs = S.invoices.filter(i => i.eventId === id);
  const occ = ev.remindYearly ? L.nextOccurrence(ev) : null;
  const offers = S.offers.filter(o => o.eventId === id).sort((a, b) => b.year - a.year);
  view().innerHTML = `${header(ev.type, { back: true, action: `<a class="icon-btn" href="#/event/${id}/edit">Edit</a>` })}
  <section class="block">
    <div class="card">
      <div class="ev-title"><h3>${esc(ev.names || c?.name || '')}</h3>${statusPill(ev.status)}</div>
      <p class="big-date">${fmtNice(ev.date)}${ev.time ? ' · ' + esc(ev.time) : ''}</p>
      ${ev.venue ? `<p><span class="muted small">Venue</span><br>${esc(ev.venue)}</p>` : ''}
      ${ev.theme ? `<p><span class="muted small">Theme / colours</span><br>${esc(ev.theme)}</p>` : ''}
      ${ev.notes ? `<p><span class="muted small">Notes</span><br>${esc(ev.notes).replace(/\n/g, '<br>')}</p>` : ''}
      <p><span class="muted small">Customer</span><br><a href="#/customer/${c?.id}">${esc(c?.name || '')}</a> ${c?.phone ? '· ' + esc(c.phone) : ''}</p>
      ${occ ? `<p class="yr-note">🔔 Next ${L.occasionOf(ev.type)}: <b>${fmtNice(occ.date)}</b>${ev.type === 'Birthday' ? '' : ` (${L.ordinal(occ.years)})`} — you'll be alerted ${L.alertDays(S.settings).join(' & ')} days before.</p>` : ''}
      ${ev.status !== 'Completed' && ev.status !== 'Cancelled' && ev.date <= todayISO() ? `<button class="btn ghost full" id="complete">Mark as completed</button>` : ''}
    </div>
  </section>
  <section class="block"><h2>Invoices & quotations</h2>${invs.map(invoiceRow).join('') || '<p class="muted small">None yet.</p>'}
    <a class="btn full" href="#/invoice/new/${id}">+ Create quotation / invoice</a></section>
  ${offers.length ? `<section class="block"><h2>Offers sent</h2>${offers.map(o => `<div class="card row"><div class="grow"><b>${o.year}</b><span class="muted small">Sent ${fmtDate(o.sentAt.slice(0, 10))} · ${o.discount}% discount</span></div></div>`).join('')}</section>` : ''}`;
  $('#complete') && ($('#complete').onclick = async () => { await db.put('events', { ...ev, status: 'Completed' }); toast('Marked completed'); route(); });
}

// ---------- Invoices ----------
function invoiceRow(inv) {
  const t = L.totals(inv);
  const paidUp = inv.docType === 'invoice' && t.balance <= 0.009 && t.total > 0;
  return `<a class="card row" href="#/invoice/${inv.id}">
    <div class="grow"><b>${esc(inv.number || 'Draft')}</b><span class="muted small">${inv.docType === 'quotation' ? 'Quotation' : 'Invoice'} · ${fmtDate(inv.date)} · ${esc(custName(inv.customerId))}</span></div>
    <div class="right"><b>${money(t.total)}</b>${inv.docType === 'invoice' ? `<span class="small ${paidUp ? 'pos' : 'neg'}">${paidUp ? 'Paid' : 'Bal ' + money(t.balance)}</span>` : '<span class="small muted">Quote</span>'}</div>
  </a>`;
}

async function invoicesView() {
  const list = [...S.invoices].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''));
  view().innerHTML = `${header('Invoices', { action: `<a class="icon-btn" href="#/invoice/new" aria-label="New">${ICON.plus}</a>` })}
  <div class="pad"><div class="seg" id="seg"><button class="on" data-f="all">All</button><button data-f="unpaid">Unpaid</button><button data-f="quotation">Quotations</button></div>
  <div class="search">${ICON.search}<input id="q" placeholder="Search number or name"></div></div>
  <section class="block" id="list"></section>`;
  let f = 'all';
  const draw = () => {
    const q = ($('#q').value || '').toLowerCase();
    const rows = list.filter(i => f === 'all' || (f === 'quotation' ? i.docType === 'quotation' : i.docType === 'invoice' && L.totals(i).balance > 0.009))
      .filter(i => !q || (i.number + ' ' + custName(i.customerId)).toLowerCase().includes(q));
    $('#list').innerHTML = rows.map(invoiceRow).join('') || empty('Nothing here yet.', '<a class="btn" href="#/invoice/new">New invoice</a>');
  };
  $$('#seg button').forEach(b => b.onclick = () => { f = b.dataset.f; $$('#seg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#q').oninput = draw;
  draw();
}

async function nextNumber(docType, date) {
  const s = await db.getSettings();
  const year = (date || todayISO()).slice(0, 4);
  const key = `${docType}-${year}`;
  const counters = s.counters || {};
  // never reuse a number that already exists
  const prefix = `${s.numberPrefix}-${docType === 'quotation' ? 'Q-' : ''}${year}-`;
  const used = (await db.all('invoices')).map(i => i.number).filter(n => n?.startsWith(prefix)).map(n => parseInt(n.slice(prefix.length), 10) || 0);
  const n = Math.max(counters[key] || 0, ...used, 0) + 1;
  counters[key] = n; s.counters = counters;
  await db.saveSettings(s);
  return prefix + L.pad(n, 4);
}

async function invoiceForm(id, presetEvent) {
  const isNew = !id;
  let inv = id ? structuredClone(S.invoices.find(i => i.id === id)) : null;
  if (id && !inv) return go('#/invoices');
  if (isNew) {
    const ev = presetEvent ? S.ev[presetEvent] : null;
    inv = { docType: 'invoice', date: todayISO(), customerId: ev?.customerId || '', eventId: ev?.id || '', items: [{ desc: '', price: '', qty: 1 }], discount: 0, payments: [], notes: '' };
  }
  const catalog = [...S.items].sort((a, b) => a.name.localeCompare(b.name));
  const render = () => {
    const t = L.totals(inv);
    const evOpts = S.events.filter(e => e.customerId === inv.customerId).sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(e => `<option value="${e.id}" ${e.id === inv.eventId ? 'selected' : ''}>${esc(evLabel(e))} · ${fmtDate(e.date)}</option>`).join('');
    view().innerHTML = `${header(isNew ? 'New ' + (inv.docType === 'quotation' ? 'quotation' : 'invoice') : (inv.number || 'Invoice'), { back: true })}
    <div class="pad"><form id="inf" class="form" autocomplete="off">
      <div class="seg" id="dt"><button type="button" data-t="quotation" class="${inv.docType === 'quotation' ? 'on' : ''}">Quotation</button><button type="button" data-t="invoice" class="${inv.docType === 'invoice' ? 'on' : ''}">Invoice</button></div>
      ${inv.number ? `<p class="muted small">No. <b>${esc(inv.number)}</b></p>` : '<p class="muted small">Number is given automatically when you save.</p>'}
      <label class="field"><span>Customer *</span><select id="cust"><option value="">— Select —</option>${[...S.customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}" ${c.id === inv.customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${!S.customers.length ? '<p class="small">No customers yet — <a href="#/event/new">add a booking</a> first.</p>' : ''}
      <label class="field"><span>Booking</span><select id="evsel"><option value="">— None —</option>${evOpts}</select></label>
      <label class="field"><span>Date</span><input type="date" id="date" value="${esc(inv.date)}"></label>

      <h3 class="sub">Items</h3>
      <datalist id="cat">${catalog.map(i => `<option value="${esc(i.name)}">`).join('')}</datalist>
      <div id="lines">${inv.items.map((it, i) => `
        <div class="line" data-i="${i}">
          <input class="desc" list="cat" placeholder="Description" value="${esc(it.desc)}">
          <div class="line-nums">
            <label><span>Price</span><input class="price" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(it.price)}"></label>
            <label><span>Qty</span><input class="qty" type="number" inputmode="decimal" step="1" min="0" value="${esc(it.qty)}"></label>
            <span class="lt">${L.num2((Number(it.price) || 0) * (Number(it.qty) || 0))}</span>
            <button type="button" class="x" data-rm="${i}" aria-label="Remove">×</button>
          </div>
        </div>`).join('')}</div>
      <button type="button" class="btn ghost full" id="addLine">+ Add item</button>

      <div class="totals">
        <div><span>Subtotal</span><b id="tSub">${L.num2(t.subtotal)}</b></div>
        <div><span>Discount (Rs.)</span><input id="disc" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(inv.discount || '')}" placeholder="0.00"></div>
        <div class="grand"><span>Total</span><b id="tTot">${money(t.total)}</b></div>
        ${inv.docType === 'invoice' ? `<div><span>Paid</span><b id="tPaid">${money(t.paid)}</b></div><div class="grand"><span>Balance due</span><b id="tBal" class="${t.balance > 0 ? 'neg' : 'pos'}">${money(t.balance)}</b></div>` : ''}
      </div>

      ${inv.docType === 'invoice' ? `<h3 class="sub">Payments received</h3>
      <div id="pays">${(inv.payments || []).map((p, i) => `<div class="card row pay"><div class="grow"><b>${money(p.amount)}</b><span class="muted small">${fmtDate(p.date)}${p.note ? ' · ' + esc(p.note) : ''}</span></div><button type="button" class="x" data-rmpay="${i}">×</button></div>`).join('') || '<p class="muted small">No payments yet.</p>'}</div>
      <button type="button" class="btn ghost full" id="addPay">+ Add payment (advance / balance)</button>` : ''}

      <label class="field"><span>Note on PDF (optional)</span><textarea id="notes" rows="2">${esc(inv.notes)}</textarea></label>

      <button class="btn full" type="submit">Save</button>
      <div class="row-btns">
        <button type="button" class="btn dark" id="pdfShare">Share PDF</button>
        <button type="button" class="btn ghost" id="pdfView">View PDF</button>
      </div>
      ${!isNew && inv.docType === 'quotation' ? '<button type="button" class="btn ghost full" id="convert">Convert to invoice</button>' : ''}
      ${!isNew ? '<button type="button" class="btn danger ghost full" id="del">Delete</button>' : ''}
    </form></div>`;
    bind();
  };
  const readLines = () => {
    inv.items = $$('#lines .line').map(l => ({ desc: $('.desc', l).value, price: $('.price', l).value, qty: $('.qty', l).value }));
    inv.discount = $('#disc').value;
    inv.notes = $('#notes').value;
    inv.date = $('#date').value;
  };
  const refreshTotals = () => {
    readLines();
    $$('#lines .line').forEach((l, i) => { $('.lt', l).textContent = L.num2((Number(inv.items[i].price) || 0) * (Number(inv.items[i].qty) || 0)); });
    const t = L.totals(inv);
    $('#tSub').textContent = L.num2(t.subtotal); $('#tTot').textContent = money(t.total);
    if ($('#tBal')) { $('#tPaid').textContent = money(t.paid); $('#tBal').textContent = money(t.balance); $('#tBal').className = t.balance > 0 ? 'neg' : 'pos'; }
  };
  const save = async () => {
    readLines();
    inv.customerId = $('#cust').value; inv.eventId = $('#evsel').value;
    if (!inv.customerId) { toast('Select a customer.'); return null; }
    inv.items = inv.items.filter(it => it.desc || Number(it.price));
    if (!inv.items.length) { toast('Add at least one item.'); return null; }
    if (!inv.number) inv.number = await nextNumber(inv.docType, inv.date);
    inv = await db.put('invoices', inv);
    return inv;
  };
  const makePdf = async () => {
    const saved = await save(); if (!saved) return null;
    const s = await db.getSettings();
    const doc = await buildInvoicePdf(saved, S.cust[saved.customerId], S.ev[saved.eventId], s);
    return { bytes: await doc.save(), name: pdfFileName(saved, S.cust[saved.customerId]) };
  };
  const bind = () => {
    $$('#lines input').forEach(i => i.oninput = refreshTotals);
    $$('#lines .desc').forEach(d => d.onchange = () => {
      const hit = catalog.find(c => c.name === d.value);
      const l = d.closest('.line');
      if (hit && Number(hit.price) && !Number($('.price', l).value)) { $('.price', l).value = hit.price; refreshTotals(); }
    });
    $('#disc').oninput = refreshTotals;
    $$('[data-rm]').forEach(b => b.onclick = () => { readLines(); inv.items.splice(+b.dataset.rm, 1); if (!inv.items.length) inv.items.push({ desc: '', price: '', qty: 1 }); render(); });
    $('#addLine').onclick = () => { readLines(); inv.items.push({ desc: '', price: '', qty: 1 }); render(); $$('#lines .desc').pop().focus(); };
    $$('#dt button').forEach(b => b.onclick = () => { if (inv.number) { toast(inv.docType === 'quotation' ? 'Use "Convert to invoice" below.' : 'Saved invoices stay invoices.'); return; } readLines(); inv.docType = b.dataset.t; render(); });
    $('#cust').onchange = () => { readLines(); inv.customerId = $('#cust').value; inv.eventId = ''; render(); };
    $('#evsel').onchange = () => { inv.eventId = $('#evsel').value; };
    $('#addPay') && ($('#addPay').onclick = () => paymentModal(p => { readLines(); inv.payments = [...(inv.payments || []), p]; render(); }));
    $$('[data-rmpay]').forEach(b => b.onclick = async () => { if (await confirmBox('Remove this payment?', 'Remove')) { readLines(); inv.payments.splice(+b.dataset.rmpay, 1); render(); } });
    $('#inf').onsubmit = async e => { e.preventDefault(); const r = await save(); if (r) { toast('Saved ' + r.number); history.replaceState(null, '', '#/invoice/' + r.id); route(); } };
    $('#pdfShare').onclick = async () => {
      try { const p = await makePdf(); if (!p) return; const r = await N.shareFile(p.bytes, p.name, 'application/pdf', inv.number); if (r === 'downloaded') toast('PDF downloaded'); }
      catch (e) { console.error(e); toast('Could not create PDF: ' + e.message); }
    };
    $('#pdfView').onclick = async () => {
      try {
        const p = await makePdf(); if (!p) return;
        if (N.isNative()) { await N.shareFile(p.bytes, p.name, 'application/pdf', 'Open PDF with…'); return; }
        const url = URL.createObjectURL(new Blob([p.bytes], { type: 'application/pdf' }));
        window.open(url, '_blank') || (location.href = url);
      } catch (e) { console.error(e); toast('Could not create PDF: ' + e.message); }
    };
    $('#convert') && ($('#convert').onclick = async () => {
      const r = await save(); if (!r) return;
      const copy = { ...structuredClone(r), id: undefined, createdAt: undefined, docType: 'invoice', number: '', date: todayISO(), payments: [], fromQuotation: r.number };
      copy.number = await nextNumber('invoice', copy.date);
      const saved = await db.put('invoices', copy);
      toast('Invoice ' + saved.number + ' created'); go('#/invoice/' + saved.id);
    });
    $('#del') && ($('#del').onclick = async () => { if (await confirmBox(`Delete ${inv.number}?`)) { await db.remove('invoices', inv.id); go('#/invoices'); } });
  };
  render();
}

function paymentModal(onAdd) {
  modal(`<h3>Add payment</h3>
    <label class="field"><span>Amount (Rs.)</span><input id="pa" type="number" inputmode="decimal" min="0" step="0.01"></label>
    <label class="field"><span>Date</span><input id="pd" type="date" value="${todayISO()}"></label>
    <label class="field"><span>Note</span><input id="pn" placeholder="Advance / Bank transfer / Cash"></label>
    <div class="row-btns"><button class="btn ghost" data-close>Cancel</button><button class="btn" data-ok>Add</button></div>`, sh => {
    $('#pa', sh).focus();
    $('[data-close]', sh).onclick = closeModal;
    $('[data-ok]', sh).onclick = () => {
      const amount = Number($('#pa', sh).value);
      if (!amount) { toast('Enter an amount'); return; }
      closeModal(); onAdd({ amount, date: $('#pd', sh).value, note: $('#pn', sh).value });
    };
  });
}

// ---------- More ----------
async function moreView() {
  view().innerHTML = `${header('More')}
  <section class="block menu">
    <a class="card row" href="#/sync"><div class="grow"><b>Backup to Google Sheet</b><span class="muted small">${S.settings.lastSync ? 'Last synced ' + new Date(S.settings.lastSync).toLocaleString() : 'Not set up yet'}</span></div>›</a>
    <a class="card row" href="#/reports"><div class="grow"><b>Reports</b><span class="muted small">Income, balances, offers</span></div>›</a>
    <a class="card row" href="#/events"><div class="grow"><b>All bookings</b><span class="muted small">Search past & upcoming</span></div>›</a>
    <a class="card row" href="#/items"><div class="grow"><b>Item price list</b><span class="muted small">Decor items used on invoices</span></div>›</a>
    <a class="card row" href="#/settings"><div class="grow"><b>Settings</b><span class="muted small">Business details, terms, messages, alerts</span></div>›</a>
  </section>
  <section class="block"><h2>Backup file</h2>
    <p class="muted small">Save a full copy of all data as a file (works offline). Keep it in Google Drive or send it to yourself.</p>
    <div class="row-btns"><button class="btn ghost" id="exp">Save backup file</button><label class="btn ghost">Restore file<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
  </section>
  ${!N.isNative() && 'Notification' in window && Notification.permission !== 'granted' ? `<section class="block"><button class="btn ghost full" id="perm">Allow notifications in this browser</button><p class="muted small">In the web version, alerts show when you open the app. The Android app alerts you even when closed.</p></section>` : ''}
  <p class="muted small center">9Wings Event app · v1.0</p>`;
  $('#exp').onclick = async () => {
    const data = await db.exportAll();
    const bytes = new TextEncoder().encode(JSON.stringify(data, null, 1));
    const name = `9wings-backup-${todayISO()}.json`;
    const r = await N.shareFile(bytes, name, 'application/json', '9Wings backup');
    if (r === 'downloaded') toast('Backup downloaded');
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== '9wings') throw new Error('Not a 9Wings backup file');
      if (!(await confirmBox('Restore this backup? Newer records on this phone are kept.', 'Restore'))) return;
      await db.importAll(data); toast('Backup restored'); route();
    } catch (err) { toast('Could not restore: ' + err.message); }
  };
  $('#perm') && ($('#perm').onclick = async () => { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Notifications allowed' : 'Notifications not allowed'); route(); });
}

async function settingsView() {
  const s = S.settings;
  view().innerHTML = `${header('Settings', { back: true })}
  <div class="pad"><form id="sf" class="form">
    <h3 class="sub">Business (printed on invoices)</h3>
    <label class="field"><span>Business name</span><input name="businessName" value="${esc(s.businessName)}"></label>
    <label class="field"><span>Tagline</span><input name="tagline" value="${esc(s.tagline)}"></label>
    <label class="field"><span>Phone numbers (one per line)</span><textarea name="phones" rows="2">${esc(s.phones)}</textarea></label>
    <label class="field"><span>Invoice number prefix</span><input name="numberPrefix" value="${esc(s.numberPrefix)}"></label>
    <label class="field"><span>Terms and conditions (one per line)</span><textarea name="terms" rows="4">${esc(s.terms)}</textarea></label>
    <label class="field"><span>Payment method (one per line, "Label: value")</span><textarea name="paymentMethod" rows="3">${esc(s.paymentMethod)}</textarea></label>
    <h3 class="sub">Alerts</h3>
    <label class="field"><span>Remind before anniversary / birthday (days, comma separated)</span><input name="alertDays" value="${esc(s.alertDays)}" inputmode="numeric"></label>
    <div class="two">
      <label class="field"><span>Payment due (days before event)</span><input name="paymentDueDays" type="number" value="${esc(s.paymentDueDays)}"></label>
      <label class="field"><span>Notification hour (0–23)</span><input name="notifyHour" type="number" min="0" max="23" value="${esc(s.notifyHour)}"></label>
    </div>
    <h3 class="sub">Offer messages</h3>
    <label class="field"><span>Default discount %</span><input name="defaultDiscount" type="number" value="${esc(s.defaultDiscount)}"></label>
    <label class="field"><span>Anniversary message</span><textarea name="anniversaryMsg" rows="6">${esc(s.anniversaryMsg)}</textarea></label>
    <label class="field"><span>Birthday message</span><textarea name="birthdayMsg" rows="6">${esc(s.birthdayMsg)}</textarea></label>
    <p class="muted small">You can use: {names} {customer} {ordinal} {occasion} {date} {discount} {business} {phones}</p>
    <button class="btn full" type="submit">Save settings</button>
  </form></div>`;
  $('#sf').onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target);
    ['defaultDiscount', 'paymentDueDays', 'notifyHour'].forEach(k => f[k] = Number(f[k]) || 0);
    await db.saveSettings({ ...(await db.getSettings()), ...f });
    toast('Settings saved'); history.back();
  };
}

async function itemsView() {
  const list = [...S.items].sort((a, b) => a.name.localeCompare(b.name));
  view().innerHTML = `${header('Item price list', { back: true })}
  <section class="block">
    <p class="muted small">These appear as suggestions when you add invoice items. The price fills in automatically.</p>
    <form id="addItem" class="inline-form"><input name="name" placeholder="Item name" required><input name="price" type="number" inputmode="decimal" placeholder="Price" step="0.01"><button class="btn">Add</button></form>
    ${list.map(i => `<div class="card row item" data-id="${i.id}"><input class="iname" value="${esc(i.name)}"><input class="iprice" type="number" inputmode="decimal" step="0.01" value="${esc(i.price)}"><button class="x" data-rm="${i.id}">×</button></div>`).join('')}
  </section>`;
  $('#addItem').onsubmit = async e => { e.preventDefault(); const f = formData(e.target); await db.put('items', { name: f.name.trim(), price: Number(f.price) || 0 }); route(); };
  $$('.item').forEach(row => {
    const save = async () => { const it = S.items.find(x => x.id === row.dataset.id); await db.put('items', { ...it, name: $('.iname', row).value, price: Number($('.iprice', row).value) || 0 }); toast('Saved'); };
    $('.iname', row).onchange = save; $('.iprice', row).onchange = save;
  });
  $$('[data-rm]').forEach(b => b.onclick = async () => { if (await confirmBox('Remove this item?', 'Remove')) { await db.remove('items', b.dataset.rm); route(); } });
}

async function syncView() {
  const s = S.settings;
  view().innerHTML = `${header('Google Sheet backup', { back: true })}
  <div class="pad">
    <div class="card">
      <p class="small">Your data is saved on this phone. Syncing copies it to your Google Sheet, so it's safe if the phone is lost — and you can restore it onto a new phone.</p>
      <p class="small"><b>Last sync:</b> ${s.lastSync ? new Date(s.lastSync).toLocaleString() : 'never'}</p>
      <div class="row-btns"><button class="btn" id="push">Sync now</button><button class="btn ghost" id="pull">Restore from sheet</button></div>
      <button class="link small" id="full">Send everything again (full sync)</button>
    </div>
    <form id="cfg" class="form">
      <h3 class="sub">Connection</h3>
      <label class="field"><span>Sheet script link (ends with /exec)</span><input name="sheetUrl" value="${esc(s.sheetUrl)}" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url"></label>
      <label class="field"><span>Secret key (same as in the script)</span><input name="sheetKey" value="${esc(s.sheetKey)}" autocomplete="off"></label>
      <div class="row-btns"><button class="btn ghost" type="submit">Save</button><button class="btn ghost" type="button" id="test">Test connection</button></div>
    </form>
  </div>`;
  const busy = async (btn, fn) => { const t = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait…'; try { await fn(); } catch (e) { toast(e.message, 5000); } finally { btn.disabled = false; btn.textContent = t; } };
  const saveCfg = async () => { const f = formData($('#cfg')); await db.put('settings', { ...(await db.getSettings()), sheetUrl: f.sheetUrl.trim(), sheetKey: f.sheetKey.trim() }, { keepStamp: true }); };
  $('#cfg').onsubmit = async e => { e.preventDefault(); await saveCfg(); toast('Saved'); };
  $('#test').onclick = e => busy(e.target, async () => { await saveCfg(); await Sync.testConnection(); toast('Connected to your sheet ✓'); });
  $('#push').onclick = e => busy(e.target, async () => { const n = await Sync.pushChanges(); toast(n ? `Synced ${n} change${n > 1 ? 's' : ''} ✓` : 'Already up to date ✓'); route(); });
  $('#full').onclick = e => busy(e.target, async () => { const n = await Sync.pushChanges({ full: true }); toast(`Sent ${n} records ✓`); route(); });
  $('#pull').onclick = e => busy(e.target, async () => {
    if (!(await confirmBox('Download data from the sheet onto this phone? Newer records on the phone are kept.', 'Restore'))) return;
    const n = await Sync.restoreFromSheet(); toast(`Restored ${n} records ✓`); afterDataChange(); route();
  });
}

async function reportsView() {
  const year = todayISO().slice(0, 4);
  const invs = S.invoices.filter(i => i.docType === 'invoice');
  const byMonth = Array(12).fill(0);
  for (const i of invs) for (const p of i.payments || []) if ((p.date || '').startsWith(year)) byMonth[Number(p.date.slice(5, 7)) - 1] += Number(p.amount) || 0;
  const max = Math.max(...byMonth, 1);
  const byType = {};
  for (const e of S.events.filter(e => (e.date || '').startsWith(year) && e.status !== 'Cancelled')) byType[e.type] = (byType[e.type] || 0) + 1;
  const offersYr = S.offers.filter(o => String(o.year) === year || (o.sentAt || '').startsWith(year));
  const booked = offersYr.filter(o => S.events.some(e => e.customerId === o.customerId && e.createdAt > o.sentAt && (e.type === 'Anniversary' || e.type === 'Birthday'))).length;
  const outstanding = invs.map(i => ({ i, b: L.totals(i).balance })).filter(x => x.b > 0.009).sort((a, b) => b.b - a.b);
  view().innerHTML = `${header('Reports ' + year, { back: true })}
  <section class="block"><h2>Money received by month</h2>
    <div class="bars">${byMonth.map((v, k) => `<div class="bar"><i style="height:${Math.round(v / max * 100)}%"></i><span>${L.MONTHS_LONG[k][0]}</span></div>`).join('')}</div>
    <p class="small">Total this year: <b>${money(byMonth.reduce((a, b) => a + b, 0))}</b></p></section>
  <section class="block"><h2>Bookings by type</h2>${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<div class="kv"><span>${esc(t)}</span><b>${n}</b></div>`).join('') || '<p class="muted small">No bookings this year.</p>'}</section>
  <section class="block"><h2>Special offers</h2><div class="kv"><span>Offers sent</span><b>${offersYr.length}</b></div><div class="kv"><span>Customers who booked again after an offer</span><b>${booked}</b></div></section>
  <section class="block"><h2>Balances to collect</h2>${outstanding.map(x => invoiceRow(x.i)).join('') || '<p class="muted small">Everything is paid. 🎉</p>'}</section>`;
}

// ---------- Startup ----------
async function afterDataChange() {
  const d = await load();
  const n = await N.rescheduleNotifications(d);
  if (n) console.log('scheduled', n, 'notifications');
}

async function start() {
  await db.seedIfEmpty();
  db.onChange(afterDataChange);
  window.addEventListener('hashchange', route);
  N.onNotificationTap(extra => { if (extra.route) go(extra.route); });
  if (!location.hash) history.replaceState(null, '', '#/home');
  await route();
  afterDataChange();
  if ('serviceWorker' in navigator && !N.isNative() && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  // Ask the browser not to clear our data
  navigator.storage?.persist?.().catch(() => {});
}
start().catch(e => { console.error(e); view().innerHTML = `<p class="pad">Something went wrong: ${esc(e.message)}</p>`; });
