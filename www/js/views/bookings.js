// Bookings: list with filters, multi-step booking form, booking details.
import * as D from '../data.js';
import * as L from '../logic.js';
import * as N from '../native.js';
import { S, isOwner, custName, evTitle, bookingPayment, invStatus } from '../state.js';
import { $, $$, go, icon, esc, toast, sheet, closeSheet, badge, empty, eyebrow, topbar, confirmBox, formData, initials } from '../ui.js';
import { eventRow } from './home.js';

const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } } };

// ---------- list ----------
export async function bookingsView() {
  const t = L.todayISO();
  const st = JSON.parse(ss.get('nw-bk') || '{}');
  const f = { q: st.q || '', status: st.status || 'All', type: st.type || 'All', when: st.when || 'upcoming', sort: st.sort || 'date' };
  const counts = { All: S.events.length };
  L.STATUSES.forEach(s => counts[s] = S.events.filter(e => (e.status || 'Inquiry') === s).length);

  $('#main').innerHTML = `${topbar('Bookings', { actions: `<a class="icon-btn" href="#/calendar" aria-label="Calendar">${icon('calendar')}</a>` })}
  <div class="page wide">
    <div class="page-head"><h2>Bookings</h2><p>${S.events.filter(e => e.date >= t && !['Cancelled', 'Completed'].includes(e.status)).length} upcoming · ${S.events.length} in total</p></div>
    <div class="toolbar"><div class="search">${icon('search')}<input id="q" type="search" placeholder="Search client, names, venue…" value="${esc(f.q)}" aria-label="Search bookings"></div>
      <button class="icon-btn" id="filt" aria-label="Filters">${icon('filter')}</button></div>
    <div class="chips" id="chips">${['All', ...L.STATUSES].map(s => `<button class="chip ${f.status === s ? 'on' : ''}" data-s="${s}">${s}<span class="n">${counts[s] || 0}</span></button>`).join('')}</div>
    <div class="small muted" id="filtSum" style="margin:6px 2px 10px"></div>
    <div id="list"></div>
  </div>
  <a class="fab" href="#/booking/new" aria-label="New booking">${icon('plus')}</a>`;

  const draw = () => {
    ss.set('nw-bk', JSON.stringify(f));
    const q = f.q.toLowerCase().trim();
    let list = S.events.filter(e => (f.status === 'All' || (e.status || 'Inquiry') === f.status) && (f.type === 'All' || e.type === f.type));
    if (f.when === 'upcoming') list = list.filter(e => e.date >= t);
    else if (f.when === 'past') list = list.filter(e => e.date < t);
    else if (f.when === 'month') list = list.filter(e => (e.date || '').startsWith(t.slice(0, 7)));
    else if (f.when === 'next30') list = list.filter(e => e.date >= t && L.daysBetween(t, e.date) <= 30);
    if (q) list = list.filter(e => [e.names, e.type, e.venue, e.location, custName(e.customerId), S.cust[e.customerId]?.phone, e.notes].join(' ').toLowerCase().includes(q));
    const asc = f.when !== 'past';
    list.sort(f.sort === 'added' ? (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
      : (a, b) => (asc ? 1 : -1) * ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
    $('#filtSum').textContent = `${{ upcoming: 'Upcoming', past: 'Past', month: 'This month', next30: 'Next 30 days', all: 'All dates' }[f.when]}${f.type !== 'All' ? ' · ' + f.type : ''} · ${f.sort === 'added' ? 'recently added' : 'by date'} · ${list.length} shown`;
    $('#list').innerHTML = list.length ? `<div class="list">${list.map(e => eventRow(e)).join('')}</div>`
      : `<div class="list">${empty('clipboard', q ? 'No matching bookings' : 'No bookings here', q ? 'Try a different search or filter.' : 'Change the filters or add a new booking.', q ? '' : '<a class="btn" href="#/booking/new">' + icon('plus') + ' New booking</a>')}</div>`;
  };
  $('#q').oninput = e => { f.q = e.target.value; draw(); };
  $$('#chips .chip').forEach(c => c.onclick = () => { f.status = c.dataset.s; $$('#chips .chip').forEach(x => x.classList.toggle('on', x === c)); draw(); });
  $('#filt').onclick = () => sheet(`<h3>Filter bookings</h3>
    <label class="field"><span>Dates</span><select id="fw">${[['upcoming', 'Upcoming'], ['next30', 'Next 30 days'], ['month', 'This month'], ['past', 'Past'], ['all', 'All dates']].map(([k, l]) => `<option value="${k}" ${f.when === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Event type</span><select id="ft"><option>All</option>${L.EVENT_TYPES.map(x => `<option ${f.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="field"><span>Sort</span><select id="fs"><option value="date" ${f.sort === 'date' ? 'selected' : ''}>By event date</option><option value="added" ${f.sort === 'added' ? 'selected' : ''}>Recently added</option></select></label>
    <div class="btns"><button class="btn secondary" id="fr">Reset</button><button class="btn" id="fa">Apply</button></div>`, sh => {
    $('#fa', sh).onclick = () => { f.when = $('#fw', sh).value; f.type = $('#ft', sh).value; f.sort = $('#fs', sh).value; closeSheet(); draw(); };
    $('#fr', sh).onclick = () => { Object.assign(f, { when: 'upcoming', type: 'All', sort: 'date' }); closeSheet(); draw(); };
  });
  draw();
}

// ---------- form (multi-step) ----------
const STEPS = ['Client', 'Event', 'Services', 'Status'];
export async function bookingForm(id, presetCustomer) {
  const editing = !!id;
  const orig = id ? S.ev[id] : null;
  if (id && !orig) return go('#/bookings');
  const ev = orig ? structuredClone(orig) : { type: 'Wedding', status: 'Confirmed', remindYearly: true, customerId: presetCustomer || '', date: ss.get('nw-newdate') || '', services: [] };
  try { sessionStorage.removeItem('nw-newdate'); } catch (e) { /* ignore */ }
  const hasInvoice = id && S.invoices.some(i => i.eventId === id);
  let step = editing ? 1 : (ev.customerId ? 1 : 0);
  let newClient = !S.customers.length;
  const nc = { name: '', phone: '', address: '' };
  const adv = { amount: '', method: 'Cash' };
  const services = S.items.filter(i => i.active !== false).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));

  const read = () => {
    const form = $('#bf'); if (!form) return;
    const f = formData(form);
    if (step === 0) { if (newClient) Object.assign(nc, { name: f.nc_name || '', phone: f.nc_phone || '', address: f.nc_address || '' }); }
    if (step === 1) Object.assign(ev, { type: f.type, names: f.names, date: f.date, time: f.time, venue: f.venue, location: f.location, theme: f.theme });
    if (step === 2) {
      ev.services = $$('[name=svc]:checked', form).map(c => c.value);
      Object.assign(ev, { packageId: f.packageId || '', requirements: f.requirements, estimatedPrice: f.estimatedPrice ? Number(f.estimatedPrice) : '' });
      if (!hasInvoice) Object.assign(adv, { amount: f.adv_amount || '', method: f.adv_method || 'Cash' });
    }
    if (step === 3) Object.assign(ev, { status: f.status, remindYearly: !!f.remindYearly, yearlyDate: f.yearlyDate || '', notes: f.notes });
  };
  const valid = () => {
    if (step === 0 && !newClient && !ev.customerId) { toast('Choose a client, or add a new one.'); return false; }
    if (step === 0 && newClient && (!nc.name.trim() || !nc.phone.trim())) { toast('Enter the client\'s name and phone number.'); return false; }
    if (step === 1 && !ev.date) { toast('Choose the event date.'); return false; }
    return true;
  };

  const namesLabel = t => t === 'Birthday' ? 'Birthday person' : ['Wedding', 'Engagement', 'Anniversary', 'Homecoming'].includes(t) ? 'Couple names' : 'Event name';
  const namesPh = t => t === 'Birthday' ? 'e.g. Baby Senuth' : ['Wedding', 'Engagement', 'Anniversary', 'Homecoming'].includes(t) ? 'e.g. Nimal & Dilini' : 'Optional';

  const stepHtml = () => {
    if (step === 0) {
      const sorted = [...S.customers].sort((a, b) => a.name.localeCompare(b.name));
      return `<div class="seg" style="margin-bottom:12px"><button type="button" class="${!newClient ? 'on' : ''}" data-nc="0">Existing client</button><button type="button" class="${newClient ? 'on' : ''}" data-nc="1">New client</button></div>
        ${newClient ? `<label class="field"><span>Full name</span><input name="nc_name" value="${esc(nc.name)}" autocomplete="off" required></label>
          <label class="field"><span>Phone <em>— WhatsApp</em></span><input name="nc_phone" type="tel" inputmode="tel" value="${esc(nc.phone)}" placeholder="07X XXX XXXX"></label>
          <label class="field"><span>Address <em>— optional</em></span><input name="nc_address" value="${esc(nc.address)}"></label>`
        : `<div class="search" style="margin-bottom:10px">${icon('search')}<input id="cq" type="search" placeholder="Search clients" aria-label="Search clients"></div>
          <div class="list" id="clist" style="max-height:52vh;overflow:auto">${sorted.map(c => `<label class="row" data-name="${esc((c.name + ' ' + (c.phone || '')).toLowerCase())}"><input type="radio" name="customerId" value="${c.id}" ${c.id === ev.customerId ? 'checked' : ''} style="width:20px;min-height:20px;accent-color:var(--plum)"><div class="avatar">${initials(c.name)}</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${esc(c.phone || '')}</div></div></label>`).join('') || '<div class="row static s">No clients yet.</div>'}</div>`}`;
    }
    if (step === 1) return `
      <label class="field"><span>Event type</span><select name="type" id="typeSel">${L.EVENT_TYPES.map(x => `<option ${x === ev.type ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field"><span id="namesLbl">${namesLabel(ev.type)}</span><input name="names" value="${esc(ev.names)}" placeholder="${namesPh(ev.type)}" autocomplete="off"></label>
      <div class="two"><label class="field"><span>Event date</span><input name="date" type="date" required value="${esc(ev.date)}"></label>
        <label class="field"><span>Time</span><input name="time" type="time" value="${esc(ev.time)}"></label></div>
      <label class="field"><span>Venue</span><input name="venue" value="${esc(ev.venue)}" placeholder="e.g. Grand Hotel Kandy"></label>
      <label class="field"><span>Location / address <em>— optional</em></span><input name="location" value="${esc(ev.location)}"></label>
      <label class="field"><span>Theme &amp; colours <em>— optional</em></span><input name="theme" value="${esc(ev.theme)}" placeholder="e.g. Ivory & gold, purple orchids"></label>`;
    if (step === 2) return `
      <div class="label" style="margin-top:4px">Services</div>
      <div class="chips" style="flex-wrap:wrap;margin:8px 0 4px;overflow:visible;padding:0">${services.map(sv => `<label class="chip ${ev.services?.includes(sv.id) ? 'on' : ''}"><input type="checkbox" name="svc" value="${sv.id}" ${ev.services?.includes(sv.id) ? 'checked' : ''} class="sr-only">${esc(sv.name)}</label>`).join('') || '<span class="small muted">Add services under More → Services.</span>'}</div>
      ${S.packages.length ? `<label class="field"><span>Package <em>— optional</em></span><select name="packageId"><option value="">None</option>${S.packages.map(p => `<option value="${p.id}" ${p.id === ev.packageId ? 'selected' : ''}>${esc(p.name)}${p.price ? ' · ' + L.moneyShort(p.price) : ''}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span>Decoration requirements</span><textarea name="requirements" rows="3" placeholder="Flowers, colours, stage size, special requests…">${esc(ev.requirements)}</textarea></label>
      <label class="field"><span>Estimated price (LKR) <em>— optional</em></span><input name="estimatedPrice" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(ev.estimatedPrice)}"></label>
      ${hasInvoice ? `<p class="small muted">Payments for this booking are recorded on its invoice.</p>` : `
      <div class="form-section"><h4>Advance received</h4><p class="small muted" style="margin:0 0 4px">If the client paid an advance, an invoice is created for this booking with the payment recorded.</p>
        <div class="two"><label class="field"><span>Amount (LKR)</span><input name="adv_amount" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(adv.amount)}" placeholder="0.00"></label>
        <label class="field"><span>Method</span><select name="adv_method">${L.PAYMENT_METHODS.map(m => `<option ${m === adv.method ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div></div>`}`;
    return `
      <label class="field"><span>Booking status</span><select name="status">${L.STATUSES.map(s => `<option ${s === (ev.status || 'Inquiry') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="switch-row"><input type="checkbox" name="remindYearly" id="remind" ${ev.remindYearly ? 'checked' : ''} style="width:22px;min-height:22px;accent-color:var(--plum)"><div class="grow"><b class="small">Remind me every year</b><div class="tiny muted">Anniversary or birthday offer, ${L.alertDays(S.settings).join(' and ')} days before</div></div></label>
      <label class="field ${ev.remindYearly ? '' : 'hidden'}" id="ydWrap"><span>Yearly reminder date <em>— leave empty to use the event date</em></span><input name="yearlyDate" type="date" value="${esc(ev.yearlyDate || '')}"></label>
      <label class="field"><span>Notes</span><textarea name="notes" rows="3">${esc(ev.notes)}</textarea></label>
      <div class="card beige" style="margin-top:10px"><h4>Summary</h4><dl class="kv">
        <dt>Client</dt><dd>${esc(newClient ? nc.name : custName(ev.customerId))}</dd>
        <dt>Event</dt><dd>${esc(ev.type)}${ev.names ? ' · ' + esc(ev.names) : ''}</dd>
        <dt>Date</dt><dd>${L.fmtNice(ev.date)}${ev.time ? ' · ' + L.fmtTime(ev.time) : ''}</dd>
        ${ev.venue ? `<dt>Venue</dt><dd>${esc(ev.venue)}</dd>` : ''}
        ${ev.services?.length ? `<dt>Services</dt><dd>${ev.services.map(i => esc(S.items.find(x => x.id === i)?.name || '')).join(', ')}</dd>` : ''}
        ${ev.estimatedPrice ? `<dt>Estimate</dt><dd>${L.money(ev.estimatedPrice)}</dd>` : ''}
        ${Number(adv.amount) ? `<dt>Advance</dt><dd>${L.money(adv.amount)} · ${esc(adv.method)}</dd>` : ''}
      </dl></div>`;
  };

  const render = () => {
    $('#main').innerHTML = `${topbar(editing ? 'Edit booking' : 'New booking', { back: true })}
    <div class="page narrow"><div class="steps">${STEPS.map((s, i) => `<button type="button" class="${i < step ? 'done' : ''} ${i === step ? 'on' : ''}" data-step="${i}"><i></i><span>${s}</span></button>`).join('')}</div>
      <h3 class="title" style="margin-bottom:8px">${['Who is the booking for?', 'Event details', 'Services & price', 'Status & notes'][step]}</h3>
      <form id="bf" class="form" autocomplete="off">${stepHtml()}
        <div class="form-actions">${step > 0 ? '<button type="button" class="btn secondary" id="prev">Back</button>' : ''}
          ${step < 3 ? `<button type="submit" class="btn">Continue</button>` : `<button type="submit" class="btn">${editing ? 'Save changes' : 'Save booking'}</button>`}</div>
        ${editing && step === 3 && isOwner() ? `<button type="button" class="btn danger block" id="del" style="margin-top:4px">${icon('trash')} Delete booking</button>` : ''}
      </form></div>`;
    $$('[data-back]').forEach(b => b.onclick = () => history.back());
    bind();
  };
  const goStep = n => { read(); if (n > step && !valid()) return; step = n; render(); window.scrollTo(0, 0); };
  const bind = () => {
    $$('[data-step]').forEach(b => b.onclick = () => { const n = +b.dataset.step; if (n <= step || editing) goStep(n); });
    $$('[data-nc]').forEach(b => b.onclick = () => { read(); newClient = b.dataset.nc === '1'; render(); });
    const cq = $('#cq'); if (cq) cq.oninput = () => { const q = cq.value.toLowerCase(); $$('#clist .row').forEach(r => r.style.display = (r.dataset.name || '').includes(q) ? '' : 'none'); };
    $$('[name=customerId]').forEach(r => r.onchange = () => { ev.customerId = r.value; });
    const ts = $('#typeSel'); if (ts) ts.onchange = () => { $('#namesLbl').textContent = namesLabel(ts.value); $('[name=names]').placeholder = namesPh(ts.value); if (!editing) ev.remindYearly = !!L.YEARLY_DEFAULT[ts.value]; };
    $$('.chip input[name=svc]').forEach(c => c.onchange = () => c.closest('.chip').classList.toggle('on', c.checked));
    const rm = $('#remind'); if (rm) rm.onchange = () => $('#ydWrap').classList.toggle('hidden', !rm.checked);
    const pv = $('#prev'); if (pv) pv.onclick = () => goStep(step - 1);
    $('#bf').onsubmit = e => { e.preventDefault(); if (step < 3) goStep(step + 1); else save(); };
    const del = $('#del'); if (del) del.onclick = async () => {
      if (D.allRaw('invoices').some(i => i.eventId === id && !i.deletedAt)) { toast('This booking has invoices. Delete those first.', 4000); return; }
      if (await confirmBox('Move this booking to the recycle bin? You can restore it within 30 days.', { ok: 'Delete' })) { D.trash('events', id); toast('Moved to the recycle bin — restore it from More → Recycle bin within 30 days.', 4500); go('#/bookings'); }
    };
  };
  const save = async () => {
    read();
    if (newClient && !ev.customerId) {
      if (!nc.name.trim() || !nc.phone.trim()) { step = 0; render(); toast('Enter the client\'s name and phone number.'); return; }
      const c = D.put('customers', { name: nc.name.trim(), phone: nc.phone.trim(), address: nc.address.trim() });
      ev.customerId = c.id;
    }
    if (!ev.customerId) { step = 0; render(); toast('Choose a client.'); return; }
    if (!ev.date) { step = 1; render(); toast('Choose the event date.'); return; }
    const rec = D.put('events', ev);
    let msg = editing ? 'Booking updated' : 'Booking saved';
    if (!hasInvoice && Number(adv.amount) > 0) {
      const items = (ev.services || []).map(sid => S.items.find(x => x.id === sid)).filter(Boolean).map(sv => ({ desc: sv.name, price: Number(sv.price) || 0, qty: 1 }));
      if (!items.some(i => i.price) && ev.estimatedPrice) items.splice(0, items.length, { desc: `${ev.type} decoration${ev.names ? ' — ' + ev.names : ''}`, price: Number(ev.estimatedPrice), qty: 1 });
      if (!items.length) items.push({ desc: `${ev.type} decoration`, price: Number(ev.estimatedPrice) || 0, qty: 1 });
      const number = await D.nextNumber('invoice', L.todayISO());
      D.put('invoices', L.stampIssued({ docType: 'invoice', number, date: L.todayISO(), customerId: ev.customerId, eventId: rec.id, items, discount: 0, notes: '',
        payments: [{ amount: Number(adv.amount), date: L.todayISO(), method: adv.method, type: 'Advance', note: 'Advance', at: new Date().toISOString() }] }, S.settings, D.get('customers', ev.customerId)));
      msg += ` · Invoice ${number} created with the advance`;
    }
    toast(msg, 3500);
    history.replaceState(null, '', '#/booking/' + rec.id);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  render();
}

// ---------- details ----------
export async function bookingDetail(id) {
  const ev = S.ev[id];
  if (!ev) return go('#/bookings');
  const c = S.cust[ev.customerId];
  const invs = S.invoices.filter(i => i.eventId === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const pay = bookingPayment(ev);
  const occ = ev.remindYearly ? L.nextOccurrence(ev) : null;
  const offers = S.offers.filter(o => o.eventId === id).sort((a, b) => b.year - a.year);
  const svc = (ev.services || []).map(sid => S.items.find(x => x.id === sid)).filter(Boolean);
  const pkg = ev.packageId ? S.packages.find(p => p.id === ev.packageId) : null;
  const t = L.todayISO();
  const days = ev.date ? L.daysBetween(t, ev.date) : null;

  const tl = [];
  if (ev.createdAt) tl.push({ at: ev.createdAt, ic: 'calendarPlus', text: 'Booking created', by: ev.createdBy });
  invs.forEach(i => {
    if (i.createdAt) tl.push({ at: i.createdAt, ic: 'invoice', cls: 'gold', text: `${i.docType === 'quotation' ? 'Quotation' : 'Invoice'} ${esc(i.number || '')} created`, by: i.createdBy });
    (i.payments || []).forEach(p => tl.push({ at: p.at || p.date + 'T12:00:00', ic: p.type === 'Refund' ? 'undo' : 'arrowIn', cls: p.type === 'Refund' ? 'neg' : 'pos', text: `${esc(p.type || 'Payment')} ${L.money(p.amount)}${p.method ? ' · ' + esc(p.method) : ''}`, by: p.by }));
  });
  offers.forEach(o => tl.push({ at: o.sentAt, ic: 'gift', cls: 'gold', text: `${esc(o.year)} offer sent (${esc(o.discount)}%)`, by: o.createdBy }));
  if (ev.updatedAt && ev.updatedAt !== ev.createdAt) tl.push({ at: ev.updatedAt, ic: 'edit', text: 'Booking updated', by: ev.updatedBy });
  tl.sort((a, b) => (b.at || '').localeCompare(a.at || ''));

  $('#main').innerHTML = `${topbar('Booking', { back: true, actions: `<a class="icon-btn" href="#/booking/${id}/edit" aria-label="Edit">${icon('edit')}</a>` })}
  <div class="page wide">
    <div class="detail-head">
      <div class="top-line"><span>${esc(ev.type)}</span><button class="link-btn" style="padding:0" id="stBtn" aria-label="Change status">${badge(ev.status || 'Inquiry')}</button>
        ${pay ? badge(pay.status === 'Pending' ? 'Unpaid' : pay.status, L.INVOICE_STATUSES.includes(pay.status) ? pay.status.toLowerCase().replace(' ', '-') : 'pending') : ''}</div>
      <h2>${esc(ev.names || c?.name || ev.type)}</h2>
      <div class="meta"><span>${icon('calendar')}${L.fmtNice(ev.date)}${ev.time ? ' · ' + L.fmtTime(ev.time) : ''}${days !== null && days >= 0 && ev.status !== 'Completed' ? ` <span class="muted">(${L.daysLabel(days).toLowerCase()})</span>` : ''}</span>
        ${ev.venue ? `<span>${icon('pin')}${esc(ev.venue)}</span>` : ''}</div>
    </div>
    <div class="action-row">
      ${c?.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${icon('phone')}Call</a><button class="wa" id="wa">${icon('whatsapp')}WhatsApp</button>` : `<a href="#/client/${c?.id}/edit">${icon('phone')}Add phone</a><span></span>`}
      <a href="#/invoice/new/${id}">${icon('filePlus')}Invoice</a>
      <a href="#/booking/${id}/edit">${icon('edit')}Edit</a>
    </div>
    ${ev.status !== 'Completed' && ev.status !== 'Cancelled' && ev.date && ev.date <= t ? `<div class="notice-bar">${icon('circleCheck')}<div class="grow small">The event date has passed.</div><button class="btn sm" id="complete">Mark completed</button></div>` : ''}

    <div class="split-view"><div>
      ${eyebrow('Client')}
      <div class="list"><a class="row" href="#/client/${c?.id}"><div class="avatar">${initials(c?.name)}</div><div class="grow"><div class="t">${esc(c?.name || 'Unknown client')}</div><div class="s">${esc([c?.phone, c?.address].filter(Boolean).join(' · '))}</div></div>${icon('right', 'chev')}</a></div>

      ${eyebrow('Event')}
      <div class="card"><dl class="kv">
        <dt>Type</dt><dd>${esc(ev.type)}</dd>
        ${ev.names ? `<dt>${ev.type === 'Birthday' ? 'Birthday of' : 'Names'}</dt><dd>${esc(ev.names)}</dd>` : ''}
        <dt>Date</dt><dd>${L.fmtNice(ev.date)}${ev.time ? ' · ' + L.fmtTime(ev.time) : ''}</dd>
        ${ev.venue ? `<dt>Venue</dt><dd>${esc(ev.venue)}</dd>` : ''}
        ${ev.location ? `<dt>Location</dt><dd>${esc(ev.location)}</dd>` : ''}
        ${ev.theme ? `<dt>Theme</dt><dd>${esc(ev.theme)}</dd>` : ''}
        <dt>Status</dt><dd>${esc(ev.status || 'Inquiry')}</dd>
      </dl>
      ${occ ? `<div class="notice-bar lav" style="margin-top:14px">${icon('bell')}<div class="small">Next ${esc(L.occasionOf(ev.type))}: <b>${L.fmtNice(occ.date)}</b>${ev.type === 'Birthday' ? '' : ` (${L.ordinal(occ.years)})`}. You'll be reminded ${L.alertDays(S.settings).join(' and ')} days before.</div></div>` : ''}</div>

      ${svc.length || pkg || ev.requirements || ev.estimatedPrice ? eyebrow('Services & requirements') + `<div class="card">
        ${svc.length ? `<div class="chips" style="flex-wrap:wrap;overflow:visible;margin:0;padding:0">${svc.map(s => `<span class="chip">${esc(s.name)}</span>`).join('')}</div>` : ''}
        ${pkg ? `<p class="small" style="margin:12px 0 0"><b>Package:</b> ${esc(pkg.name)}${pkg.price ? ' · ' + L.money(pkg.price) : ''}</p>` : ''}
        ${ev.requirements ? `<p style="margin:12px 0 0;white-space:pre-line">${esc(ev.requirements)}</p>` : ''}
        ${ev.estimatedPrice ? `<p class="small muted" style="margin:12px 0 0">Estimated price: <b class="plum">${L.money(ev.estimatedPrice)}</b></p>` : ''}
      </div>` : ''}
      ${ev.notes ? eyebrow('Notes') + `<div class="card"><p style="margin:0;white-space:pre-line">${esc(ev.notes)}</p></div>` : ''}
    </div><div>
      ${eyebrow('Payment')}
      ${pay ? `<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="small muted">Paid</span><b class="num">${L.money(pay.paid)} <span class="muted small">of ${L.money(pay.total)}</span></b></div>
        <div class="progress" style="margin:10px 0"><i style="width:${pay.total ? Math.min(100, pay.paid / pay.total * 100) : 0}%"></i></div>
        <div style="display:flex;justify-content:space-between"><span class="small muted">Balance</span><b class="num ${pay.balance > 0 ? 'neg' : 'pos'}">${L.money(pay.balance)}</b></div></div>`
        : `<div class="card"><p class="small muted" style="margin:0">No invoice yet${ev.estimatedPrice ? ` · estimate ${L.money(ev.estimatedPrice)}` : ''}.</p></div>`}

      ${eyebrow('Invoices & quotations')}
      <div class="list">${invs.map(i => { const st = invStatus(i); const tt = L.totals(i); return `<a class="row" href="#/invoice/${i.id}"><span class="tile-ic gold">${icon('invoice')}</span><div class="grow"><div class="t">${esc(i.number || 'Draft')}</div><div class="s">${i.docType === 'quotation' ? 'Quotation' : 'Invoice'} · ${L.fmtShort(i.date)}</div></div><div class="end"><b>${L.moneyShort(tt.total)}</b>${badge(st)}</div></a>`; }).join('')}
        <a class="row" href="#/invoice/new/${id}"><span class="tile-ic">${icon('plus')}</span><div class="grow t" style="color:var(--plum)">Create quotation or invoice</div></a></div>

      ${tl.length ? eyebrow('Activity') + `<div class="card"><div class="timeline">${tl.slice(0, 10).map(a => `<div class="tl"><span class="tl-ic ${a.cls || ''}">${icon(a.ic)}</span><div class="grow"><p>${a.text}</p><small>${L.relTime(a.at)}${a.by ? ' · ' + esc(a.by) : ''}</small></div></div>`).join('')}</div></div>` : ''}
    </div></div>
  </div>`;

  $('#stBtn').onclick = () => sheet(`<h3>Booking status</h3><p class="sub">${esc(evTitle(ev))} · ${L.fmtNice(ev.date)}</p>
    <div class="list">${L.STATUSES.map(s => `<button class="row" data-st="${s}">${badge(s)}<div class="grow"></div>${(ev.status || 'Inquiry') === s ? icon('check') : ''}</button>`).join('')}</div>`, sh => {
    $$('[data-st]', sh).forEach(b => b.onclick = () => { D.put('events', { ...ev, status: b.dataset.st }); closeSheet(); toast('Status: ' + b.dataset.st); });
  });
  const wa = $('#wa'); if (wa) wa.onclick = () => N.openExternal(L.waLink(c.phone, ''));
  const cp = $('#complete'); if (cp) cp.onclick = () => { D.put('events', { ...ev, status: 'Completed' }); toast('Marked as completed'); };
}
