// Client directory, profile and form.
import * as D from '../data.js';
import * as L from '../logic.js';
import * as N from '../native.js';
import { S, isOwner, invStatus } from '../state.js';
import { $, $$, go, icon, esc, toast, badge, empty, eyebrow, topbar, confirmBox, formData, initials } from '../ui.js';
import { eventRow } from './home.js';

export async function clientsView() {
  const t = L.todayISO();
  const stats = {};
  for (const e of S.events) { const s = stats[e.customerId] = stats[e.customerId] || { n: 0, last: '', next: '' }; s.n++; if (e.date < t && e.date > s.last) s.last = e.date; if (e.date >= t && (!s.next || e.date < s.next)) s.next = e.date; }
  const bal = {};
  for (const i of S.invoices) if (i.docType === 'invoice') bal[i.customerId] = (bal[i.customerId] || 0) + L.totals(i).balance;
  let sort = sessionStorage.getItem('nw-cl-sort') || 'name';

  $('#main').innerHTML = `${topbar('Clients', { actions: `<a class="icon-btn" href="#/client/new" aria-label="Add client">${icon('userPlus')}</a>` })}
  <div class="page wide">
    <div class="page-head"><h2>Clients</h2><p>${S.customers.length} client${S.customers.length === 1 ? '' : 's'}</p></div>
    <div class="toolbar"><div class="search">${icon('search')}<input id="q" type="search" placeholder="Search name or phone" aria-label="Search clients"></div>
      <select id="sort" aria-label="Sort"><option value="name">A–Z</option><option value="recent">Recent</option><option value="bookings">Most bookings</option><option value="balance">Balance due</option></select></div>
    <div id="list"></div>
  </div>
  <a class="fab" href="#/client/new" aria-label="Add client">${icon('userPlus')}</a>`;
  $('#sort').value = sort;
  const draw = () => {
    const q = ($('#q').value || '').toLowerCase().replace(/\s/g, '');
    let list = S.customers.filter(c => !q || (c.name + (c.phone || '') + (c.phone2 || '') + (c.email || '')).toLowerCase().replace(/\s/g, '').includes(q));
    const by = { name: (a, b) => a.name.localeCompare(b.name), recent: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''), bookings: (a, b) => (stats[b.id]?.n || 0) - (stats[a.id]?.n || 0), balance: (a, b) => (bal[b.id] || 0) - (bal[a.id] || 0) };
    list.sort(by[sort]);
    $('#list').innerHTML = list.length ? `<div class="list">${list.map(c => {
      const s = stats[c.id], b = bal[c.id] || 0;
      return `<a class="row" href="#/client/${c.id}"><div class="avatar">${initials(c.name)}</div><div class="grow"><div class="t">${esc(c.name)}</div>
        <div class="s">${esc(c.phone || 'No phone')}${s ? ` · ${s.n} booking${s.n > 1 ? 's' : ''}` : ''}</div></div>
        <div class="end">${s?.next ? `<span class="tiny plum">Next ${L.fmtShort(s.next)}</span>` : s?.last ? `<span class="tiny muted">Last ${L.fmtShort(s.last)}</span>` : ''}${b > 0.009 ? `<span class="tiny neg">${L.moneyShort(b)} due</span>` : ''}</div></a>`;
    }).join('')}</div>` : `<div class="list">${empty('users', q ? 'No matching clients' : 'No clients yet', q ? 'Try another name or number.' : 'Add your first client, or create a booking.', q ? '' : '<a class="btn" href="#/client/new">' + icon('userPlus') + ' Add client</a>')}</div>`;
  };
  $('#q').oninput = draw;
  $('#sort').onchange = e => { sort = e.target.value; try { sessionStorage.setItem('nw-cl-sort', sort); } catch (x) { /* ignore */ } draw(); };
  draw();
}

export async function clientForm(id) {
  const c = id ? S.cust[id] : {};
  if (id && !c) return go('#/clients');
  $('#main').innerHTML = `${topbar(id ? 'Edit client' : 'New client', { back: true })}
  <div class="page narrow"><form id="cf" class="form" autocomplete="off">
    <label class="field"><span>Full name</span><input name="name" required value="${esc(c.name)}"></label>
    <div class="two"><label class="field"><span>Phone <em>— WhatsApp</em></span><input name="phone" type="tel" inputmode="tel" required value="${esc(c.phone)}" placeholder="07X XXX XXXX"></label>
      <label class="field"><span>Other phone</span><input name="phone2" type="tel" inputmode="tel" value="${esc(c.phone2)}"></label></div>
    <label class="field"><span>Email <em>— optional</em></span><input name="email" type="email" inputmode="email" value="${esc(c.email)}"></label>
    <label class="field"><span>Address</span><textarea name="address" rows="2">${esc(c.address)}</textarea></label>
    <label class="field"><span>Notes</span><textarea name="notes" rows="3" placeholder="Preferences, family details, referrals…">${esc(c.notes)}</textarea></label>
    <div class="form-actions"><button class="btn" type="submit">${id ? 'Save changes' : 'Save client'}</button></div>
    ${id && isOwner() ? `<button class="btn danger block" type="button" id="del">${icon('trash')} Delete client</button>` : ''}
  </form></div>`;
  $('#cf').onsubmit = e => {
    e.preventDefault();
    const f = formData(e.target);
    const phone = f.phone.replace(/\D/g, '');
    const dup = S.customers.find(x => x.id !== id && phone && (x.phone || '').replace(/\D/g, '') === phone);
    if (dup && !id && !confirm(`${dup.name} already has this phone number. Add another client anyway?`)) return;
    const rec = D.put('customers', { ...c, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])) });
    toast('Client saved');
    history.replaceState(null, '', '#/client/' + rec.id); window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const del = $('#del'); if (del) del.onclick = async () => {
    if (S.events.some(e => e.customerId === id) || S.invoices.some(i => i.customerId === id)) { toast('This client has bookings or invoices. Delete those first.', 4000); return; }
    if (await confirmBox(`Delete ${c.name}? This can't be undone.`)) { D.remove('customers', id); toast('Client deleted'); go('#/clients'); }
  };
}

export async function clientDetail(id) {
  const c = S.cust[id];
  if (!c) return go('#/clients');
  const evs = S.events.filter(e => e.customerId === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const invs = S.invoices.filter(i => i.customerId === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  let billed = 0, paid = 0;
  invs.filter(i => i.docType === 'invoice').forEach(i => { const t = L.totals(i); billed += t.total; paid += t.paid; });
  const pays = L.allPayments(invs);

  $('#main').innerHTML = `${topbar('Client', { back: true, actions: `<a class="icon-btn" href="#/client/${id}/edit" aria-label="Edit">${icon('edit')}</a>` })}
  <div class="page wide">
    <div class="detail-head" style="display:flex;gap:14px;align-items:center"><div class="avatar lg">${initials(c.name)}</div>
      <div class="grow"><h2 style="margin:0">${esc(c.name)}</h2><div class="meta">${c.phone ? `<span>${icon('phone')}${esc(c.phone)}${c.phone2 ? ' / ' + esc(c.phone2) : ''}</span>` : ''}${c.email ? `<span>${icon('mail')}${esc(c.email)}</span>` : ''}</div></div></div>
    <div class="action-row">
      ${c.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${icon('phone')}Call</a><button class="wa" id="wa">${icon('whatsapp')}WhatsApp</button>` : `<a href="#/client/${id}/edit">${icon('phone')}Add phone</a><span></span>`}
      <a href="#/booking/new/${id}">${icon('calendarPlus')}Booking</a>
      <a href="#/client/${id}/edit">${icon('edit')}Edit</a>
    </div>
    <div class="kpis" style="margin-top:12px">
      <div class="kpi"><span>Bookings</span><b>${evs.length}</b></div>
      <div class="kpi"><span>Total billed</span><b>${L.moneyShort(billed)}</b></div>
      <div class="kpi"><span>Paid</span><b>${L.moneyShort(paid)}</b></div>
      <div class="kpi ${billed - paid > 0.009 ? 'dark' : ''}"><span>Balance</span><b>${L.moneyShort(Math.max(billed - paid, 0))}</b></div>
    </div>
    <div class="split-view"><div>
      ${eyebrow('Bookings & event history')}
      <div class="list">${evs.map(e => eventRow(e)).join('') || '<div class="row static s">No bookings yet.</div>'}
        <a class="row" href="#/booking/new/${id}"><span class="tile-ic">${icon('plus')}</span><div class="grow t" style="color:var(--plum)">New booking</div></a></div>
      ${c.address || c.notes ? eyebrow('Details') + `<div class="card"><dl class="kv">${c.address ? `<dt>Address</dt><dd style="white-space:pre-line">${esc(c.address)}</dd>` : ''}${c.notes ? `<dt>Notes</dt><dd style="white-space:pre-line">${esc(c.notes)}</dd>` : ''}${c.createdAt ? `<dt>Client since</dt><dd>${L.fmtNice(c.createdAt.slice(0, 10))}</dd>` : ''}</dl></div>` : ''}
    </div><div>
      ${eyebrow('Invoices & quotations')}
      <div class="list">${invs.map(i => { const t = L.totals(i); return `<a class="row" href="#/invoice/${i.id}"><span class="tile-ic gold">${icon('invoice')}</span><div class="grow"><div class="t">${esc(i.number || 'Draft')}</div><div class="s">${i.docType === 'quotation' ? 'Quotation' : 'Invoice'} · ${L.fmtShort(i.date)}</div></div><div class="end"><b>${L.moneyShort(t.total)}</b>${badge(invStatus(i))}</div></a>`; }).join('') || '<div class="row static s">None yet.</div>'}</div>
      ${pays.length ? eyebrow('Payment history') + `<div class="list">${pays.map(p => `<a class="row" href="#/invoice/${p.invoice.id}"><span class="tile-ic ${p.type === 'Refund' ? 'neg' : 'pos'}">${icon(p.type === 'Refund' ? 'undo' : 'arrowIn')}</span><div class="grow"><div class="t">${p.type === 'Refund' ? '−' : ''}${L.money(p.amount)}</div><div class="s">${L.fmtNice(p.date)} · ${esc(p.type || 'Payment')}${p.method ? ' · ' + esc(p.method) : ''}</div></div><span class="tiny muted">${esc(p.invoice.number || '')}</span></a>`).join('')}</div>` : ''}
    </div></div>
  </div>`;
  const wa = $('#wa'); if (wa) wa.onclick = () => N.openExternal(L.waLink(c.phone, ''));
}
