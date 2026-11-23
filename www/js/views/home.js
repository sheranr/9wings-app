// Home dashboard.
import * as D from '../data.js';
import * as L from '../logic.js';
import * as N from '../native.js';
import * as U from '../updates.js';
import * as B from '../backup.js';
import { S, session, isOwner, custName, evTitle, bookingPayment } from '../state.js';
import { $, $$, icon, esc, toast, sheet, closeSheet, badge, empty, eyebrow, datebox, topbar, confirmBox } from '../ui.js';

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

export function eventRow(ev, { showPay = true } = {}) {
  const pay = showPay ? bookingPayment(ev) : null;
  return `<a class="row" href="#/booking/${ev.id}">
    ${datebox(ev.date, ev.status === 'Cancelled' || ev.status === 'Completed')}
    <div class="grow"><div class="t">${esc(evTitle(ev))}</div>
      <div class="s">${esc(ev.type)} · ${esc(custName(ev.customerId))}</div>
      ${ev.venue || ev.time ? `<div class="s">${icon('pin')}${esc([L.fmtTime(ev.time), ev.venue].filter(Boolean).join(' · '))}</div>` : ''}</div>
    <div class="end">${badge(ev.status || 'Inquiry')}${pay && pay.status !== 'Paid' && ev.status !== 'Cancelled' ? `<span class="tiny ${pay.status === 'Overdue' ? 'neg' : 'muted'}">${pay.status === 'Pending' ? 'Unpaid' : pay.status}</span>` : pay?.status === 'Paid' ? '<span class="tiny pos">Paid</span>' : ''}</div>
  </a>`;
}

function activity() {
  const items = [];
  for (const ev of S.events) if (ev.createdAt) items.push({ at: ev.createdAt, ic: 'calendarPlus', cls: '', text: `New booking: <b>${esc(evTitle(ev))}</b> · ${esc(ev.type)}`, by: ev.createdBy, href: '#/booking/' + ev.id });
  for (const inv of S.invoices) {
    if (inv.createdAt) items.push({ at: inv.createdAt, ic: 'invoice', cls: 'gold', text: `${inv.docType === 'quotation' ? 'Quotation' : 'Invoice'} <b>${esc(inv.number || '')}</b> for ${esc(custName(inv.customerId))}`, by: inv.createdBy, href: '#/invoice/' + inv.id });
    for (const p of inv.payments || []) items.push({ at: p.at || (p.date + 'T12:00:00'), ic: p.type === 'Refund' ? 'undo' : 'arrowIn', cls: p.type === 'Refund' ? 'neg' : 'pos', text: `${p.type === 'Refund' ? 'Refund' : 'Payment received'} <b>${L.moneyShort(p.amount)}</b> · ${esc(custName(inv.customerId))}`, by: p.by, href: '#/invoice/' + inv.id });
  }
  for (const x of S.expenses) items.push({ at: x.createdAt || x.date, ic: 'arrowOut', cls: 'neg', text: `Expense <b>${L.moneyShort(x.amount)}</b> · ${esc(x.category || '')}${x.description ? ' — ' + esc(x.description) : ''}`, by: x.createdBy, href: '#/expense/' + x.id });
  return items.filter(i => i.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
}

export async function homeView() {
  const s = S.settings, t = L.todayISO(), month = t.slice(0, 7), year = t.slice(0, 4);
  const A = L.computeAlerts(S);
  const pendingOffers = A.yearly.filter(a => !a.sent);
  N.webSummaryNotification(pendingOffers.length + A.payments.length);
  const fin = L.finance(S, month);
  const outstanding = S.invoices.filter(i => i.docType === 'invoice' && S.ev[i.eventId]?.status !== 'Cancelled').reduce((a, i) => a + L.totals(i).balance, 0);
  const active = S.events.filter(e => e.status !== 'Cancelled');
  const upcoming = active.filter(e => e.date >= t && e.status !== 'Completed').sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const next30 = upcoming.filter(e => L.daysBetween(t, e.date) <= 30).length;
  const yearBookings = active.filter(e => (e.date || '').startsWith(year)).length;
  const first = (session.me?.name || '').split(' ')[0];
  const updBadge = (U.state.unread || 0) + (U.state.updateAvailable ? 1 : 0);

  // this week (Mon–Sun)
  const d0 = L.parseISO(t); const mon = L.addDays(t, -((d0.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => L.addDays(mon, i));
  const evOn = d => active.filter(e => e.date === d);

  const legacy = await legacyPrompt();
  const acts = activity();

  $('#main').innerHTML = `
  ${topbar('', { brand: true, actions: `
    <a class="icon-btn" href="#/updates" aria-label="Notifications">${icon('bell')}${updBadge ? `<span class="count">${updBadge}</span>` : ''}</a>
    <a class="icon-btn" href="${isOwner() ? '#/settings' : '#/account'}" aria-label="Settings">${icon('settings')}</a>` })}
  <div class="page wide">
    <div class="greet"><div><h2>${greeting()}${first && first !== 'Owner' ? ', ' + esc(first) : ''}</h2><p>${icon('calendar', 'sm')} ${L.DAYS[d0.getDay()]}, ${L.fmtNice(t)}</p></div></div>
    ${legacy}
    ${isOwner() && B.driveDue() ? `<div class="notice-bar" id="driveBar">${icon('cloud')}<div class="grow"><b>Monthly backup</b><div class="small muted">Save a copy of your data to Google Drive, so it's safe off the phone.</div></div><div style="display:flex;flex-direction:column;gap:4px"><button class="btn sm" id="driveSave">Save</button><button class="link-btn tiny" id="driveLater" style="padding:0">Later</button></div></div>` : ''}
    ${U.state.updateAvailable && U.state.latest ? `<div class="notice-bar ${U.state.forced ? 'neg' : ''}">${icon('download')}<div class="grow"><b>Update available · ${esc(U.state.latest.version)}</b><div class="small muted">${U.state.forced ? 'This update is required.' : 'Get the newest version of the app.'}</div></div><button class="btn sm" data-update>Update</button></div>` : ''}
    <div class="dash">
      <div>
        <section class="hero">
          <div class="lbl">Received in ${L.MONTHS_LONG[d0.getMonth()]}</div>
          <div class="big">${L.moneyShort(fin.received)}</div>
          <div class="sub">${fin.spent ? `${L.moneyShort(fin.spent)} spent · net ${L.moneyShort(fin.profit)}` : 'Payments recorded this month'}</div>
          <div class="split">
            <div><b>${L.moneyShort(outstanding)}</b><span>Balance to collect</span></div>
            <div><b>${next30}</b><span>Events in next 30 days</span></div>
          </div>
        </section>
        <div class="metrics">
          <a class="metric" href="#/bookings"><span>Bookings ${year}</span><b>${yearBookings}</b></a>
          <a class="metric" href="#/expenses"><span>Spent this month</span><b>${L.moneyShort(fin.spent)}</b></a>
          <a class="metric" href="#/reports"><span>Net this month</span><b class="${fin.profit < 0 ? 'neg' : ''}">${L.moneyShort(fin.profit)}</b></a>
        </div>
        <div class="quick">
          <a href="#/booking/new"><span class="tile-ic">${icon('calendarPlus')}</span>New booking</a>
          <a href="#/client/new"><span class="tile-ic">${icon('userPlus')}</span>Add client</a>
          <a href="#/invoice/new"><span class="tile-ic gold">${icon('filePlus')}</span>Create invoice</a>
          <a href="#/expense/new"><span class="tile-ic">${icon('receipt')}</span>Add expense</a>
        </div>

        ${eyebrow('Coming up', `<a class="link" href="#/bookings">All bookings</a>`)}
        ${upcoming.length ? `<div class="list">${upcoming.slice(0, 5).map(e => eventRow(e)).join('')}</div>`
          : `<div class="list">${empty('calendar', 'No upcoming events', 'New bookings will appear here.', '<a class="btn" href="#/booking/new">' + icon('plus') + ' New booking</a>', true)}</div>`}

        ${acts.length ? eyebrow('Recent activity') + `<div class="card"><div class="timeline">${acts.map(a => `<a class="tl" href="${a.href}"><span class="tl-ic ${a.cls}">${icon(a.ic)}</span><div class="grow"><p>${a.text}</p><small>${L.relTime(a.at)}${a.by ? ' · ' + esc(a.by) : ''}</small></div></a>`).join('')}</div></div>` : ''}
      </div>

      <div>
        ${eyebrow('This week', `<a class="link" href="#/calendar">Calendar</a>`)}
        <div class="week">${week.map(d => { const n = evOn(d); const dd = L.parseISO(d); return `<a href="#/calendar/${d.slice(0, 7)}" data-day="${d}" class="${d === t ? 'today' : ''}"><span>${L.DAYS[dd.getDay()].slice(0, 3)}</span><b>${dd.getDate()}</b><i>${n.slice(0, 3).map(() => '<em class="dot"></em>').join('')}</i></a>`; }).join('')}</div>

        ${eyebrow('Special offers to send', pendingOffers.length ? `<span class="n">${pendingOffers.length}</span>` : '')}
        ${A.yearly.length ? `<div class="list">${A.yearly.map(offerRow).join('')}</div>`
          : `<div class="list"><div class="row static">${'<span class="tile-ic gold">' + icon('gift') + '</span>'}<div class="grow"><div class="s" style="white-space:normal">No anniversaries or birthdays in the next ${Math.max(...L.alertDays(s))} days.</div></div></div></div>`}

        ${A.payments.length ? eyebrow('Payments due') + `<div class="list">${A.payments.map(p => `<a class="row" href="#/invoice/${p.inv.id}">
          <span class="tile-ic ${p.days < 0 ? 'neg' : 'gold'}">${icon('wallet')}</span>
          <div class="grow"><div class="t">${esc(p.customer?.name || '')}</div><div class="s">${esc(p.inv.number || '')}${p.ev ? ' · ' + esc(p.ev.type) + ' ' + L.fmtShort(p.ev.date) : ''}</div></div>
          <div class="end"><b>${L.moneyShort(p.balance)}</b><span class="tiny ${p.days < 0 ? 'neg' : 'muted'}">${p.days < 0 ? 'Overdue ' + -p.days + 'd' : 'Due ' + L.daysLabel(p.days).toLowerCase()}</span></div></a>`).join('')}</div>` : ''}
      </div>
    </div>
  </div>
  <a class="fab" href="#/booking/new" aria-label="New booking">${icon('plus')}</a>`;

  $$('[data-offer]').forEach(b => b.onclick = e => { e.preventDefault(); offerSheet(b.dataset.offer); });
  $$('[data-unsent]').forEach(b => b.onclick = async e => { e.preventDefault(); D.remove('offers', b.dataset.unsent); toast('Marked as not sent'); });
  $$('[data-update]').forEach(b => b.onclick = () => U.startDownload(U.state.latest?.url));
  const ds = $('#driveSave'); if (ds) ds.onclick = async () => {
    const r = await N.shareFile(new TextEncoder().encode(JSON.stringify(D.exportAll())), `9wings-backup-${L.todayISO()}.json`, 'application/json', '9Wings backup');
    if (r !== 'cancelled') { B.markDriveCopy(); $('#driveBar').remove(); toast(r === 'downloaded' ? 'Backup downloaded — upload it to Google Drive' : 'Backup ready'); }
  };
  const dl = $('#driveLater'); if (dl) dl.onclick = () => { B.snoozeDrive(7); $('#driveBar').remove(); };
  const mig = $('#migrate'); if (mig) mig.onclick = () => migrate(mig);
  const skip = $('#migrateSkip'); if (skip) skip.onclick = () => { try { localStorage.setItem(D.LEGACY_FLAG, '1'); } catch (e) { /* ignore */ } $('#legacyBar').remove(); };
}

function offerRow(a) {
  const { ev, occ, days, sent, customer } = a;
  const bday = ev.type === 'Birthday';
  return `<div class="row static offer ${sent ? 'sent' : ''}">
    <div class="yr">${icon(bday ? 'cake' : 'heart')}${bday ? '' : L.ordinal(occ.years)}</div>
    <div class="grow"><div class="t">${esc(ev.names || customer?.name || '')}</div>
      <div class="s">${bday ? 'Birthday' : L.titleCase(L.occasionOf(ev.type))} · ${L.fmtShort(occ.date)} · <span class="${days <= 7 ? 'gold' : ''}">${L.daysLabel(days)}</span></div>
      ${sent ? `<div class="s pos">${icon('check')} Offer sent ${L.fmtShort(sent.sentAt.slice(0, 10))} (${esc(sent.discount)}%) · <button class="link-btn tiny" style="padding:0" data-unsent="${sent.id}">Undo</button></div>` : ''}</div>
    ${sent ? '' : `<button class="btn wa sm" data-offer="${ev.id}">${icon('whatsapp')} Send</button>`}
  </div>`;
}

export function offerSheet(eventId) {
  const ev = S.ev[eventId], customer = S.cust[ev.customerId];
  const occ = L.nextOccurrence(ev);
  const disc = Number(S.settings.defaultDiscount) || 10;
  sheet(`<h3>Special ${esc(L.occasionOf(ev.type))} offer</h3>
    <p class="sub">To ${esc(customer?.name || '')} · ${esc(customer?.phone || 'no phone number')}</p>
    <label class="field"><span>Discount %</span><input id="disc" type="number" inputmode="decimal" min="0" max="100" value="${disc}"></label>
    <label class="field"><span>Message</span><textarea id="msg" rows="8">${esc(L.offerMessage(S.settings, ev, customer, occ, disc))}</textarea></label>
    <div class="btns"><button class="btn secondary" data-close>Cancel</button><button class="btn wa" data-send>${icon('whatsapp')} Open WhatsApp</button></div>`, sh => {
    const msg = $('#msg', sh), discIn = $('#disc', sh);
    let edited = false;
    msg.oninput = () => { edited = true; };
    discIn.oninput = () => {
      const d = discIn.value || '0';
      msg.value = edited ? msg.value.replace(/\d+(\.\d+)?%/, d + '%') : L.offerMessage(S.settings, ev, customer, occ, d);
    };
    $('[data-send]', sh).onclick = () => {
      if (!customer?.phone) { toast('Add a phone number to this client first.'); return; }
      N.openExternal(L.waLink(customer.phone, msg.value));
      D.put('offers', { eventId: ev.id, year: occ.year, discount: Number(discIn.value) || 0, sentAt: new Date().toISOString(), customerId: ev.customerId });
      closeSheet(); toast('Marked as sent');
    };
  });
}

// ---------- moving data from the earlier version of the app ----------
let legacyCache;
async function legacyPrompt() {
  if (!isOwner()) return '';
  try { if (localStorage.getItem(D.LEGACY_FLAG)) return ''; } catch (e) { return ''; }
  if (legacyCache === undefined) legacyCache = await D.readLegacy();
  const c = legacyCache.counts;
  if (!legacyCache.total) return '';
  return `<div class="notice-bar lav" id="legacyBar">${icon('upload')}<div class="grow"><b>Move your existing data</b><div class="small muted">${c.customers} clients, ${c.events} bookings and ${c.invoices} invoices are saved on this ${D.mode === 'firebase' ? 'device. Move them into the online database.' : 'device from the earlier version.'}</div></div><div style="display:flex;flex-direction:column;gap:4px"><button class="btn sm" id="migrate">Move</button><button class="link-btn tiny" id="migrateSkip" style="padding:0">Not now</button></div></div>`;
}
async function migrate(btn) {
  if (!(await confirmBox('Copy all clients, bookings, invoices, services and settings saved on this device into the app?', { ok: 'Move data', danger: false, title: 'Move existing data' }))) return;
  btn.disabled = true;
  const n = D.importLegacy(legacyCache);
  try { localStorage.setItem(D.LEGACY_FLAG, '1'); } catch (e) { /* ignore */ }
  legacyCache = { sets: [], counts: {}, total: 0 };
  toast(`Moved ${n} records ✓`, 4000);
}
