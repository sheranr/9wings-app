// Invoices & quotations: list, details with payments, editor, PDF.
import * as D from '../data.js';
import * as L from '../logic.js';
import * as N from '../native.js';
import { S, session, isOwner, custName, evLabel, invStatus, invDue } from '../state.js';
import { $, $$, go, icon, esc, toast, sheet, closeSheet, badge, empty, eyebrow, topbar, confirmBox, busy } from '../ui.js';
import { buildInvoicePdf, pdfFileName } from '../pdf.js';

const FILTERS = ['All', 'Pending', 'Partially paid', 'Overdue', 'Paid', 'Quotations'];

export function invoiceRow(i) {
  const t = L.totals(i), st = invStatus(i);
  return `<a class="row" href="#/invoice/${i.id}"><span class="tile-ic ${st === 'Overdue' ? 'neg' : st === 'Paid' ? 'pos' : 'gold'}">${icon('invoice')}</span>
    <div class="grow"><div class="t">${esc(custName(i.customerId))}</div><div class="s">${esc(i.number || 'Draft')} · ${L.fmtShort(i.date)}${S.ev[i.eventId] ? ' · ' + esc(S.ev[i.eventId].type) : ''}</div></div>
    <div class="end"><b>${L.moneyShort(t.total)}</b>${i.docType === 'invoice' && t.balance > 0.009 && t.paid > 0 ? `<span class="tiny neg">${L.moneyShort(t.balance)} due</span>` : badge(st)}</div></a>`;
}

export async function invoicesView() {
  let f = sessionStorage.getItem('nw-inv-f') || 'All';
  const real = S.invoices.filter(i => i.docType === 'invoice');
  const outstanding = real.reduce((a, i) => a + (S.ev[i.eventId]?.status === 'Cancelled' ? 0 : L.totals(i).balance), 0);
  const overdue = real.filter(i => invStatus(i) === 'Overdue');
  const counts = { All: S.invoices.length, Quotations: S.invoices.length - real.length };
  ['Pending', 'Partially paid', 'Overdue', 'Paid'].forEach(s => counts[s] = real.filter(i => invStatus(i) === s).length);

  $('#main').innerHTML = `${topbar('Invoices', { actions: `<a class="icon-btn" href="#/payments" aria-label="Payments">${icon('wallet')}</a>` })}
  <div class="page wide">
    <div class="page-head"><h2>Invoices</h2><p>${L.money(outstanding)} to collect${overdue.length ? ` · <span class="neg">${overdue.length} overdue</span>` : ''}</p></div>
    <div class="toolbar"><div class="search">${icon('search')}<input id="q" type="search" placeholder="Search number, client or booking" aria-label="Search invoices"></div></div>
    <div class="chips" id="chips">${FILTERS.map(x => `<button class="chip ${f === x ? 'on' : ''}" data-f="${x}">${x}<span class="n">${counts[x] || 0}</span></button>`).join('')}</div>
    <div id="list" style="margin-top:8px"></div>
  </div>
  <a class="fab" href="#/invoice/new" aria-label="New invoice">${icon('plus')}</a>`;
  const draw = () => {
    try { sessionStorage.setItem('nw-inv-f', f); } catch (e) { /* ignore */ }
    const q = ($('#q').value || '').toLowerCase();
    const list = S.invoices.filter(i => f === 'All' || (f === 'Quotations' ? i.docType === 'quotation' : i.docType === 'invoice' && invStatus(i) === f))
      .filter(i => !q || [i.number, custName(i.customerId), S.ev[i.eventId] ? evLabel(S.ev[i.eventId]) : ''].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''));
    $('#list').innerHTML = list.length ? `<div class="list">${list.map(invoiceRow).join('')}</div>`
      : `<div class="list">${empty('invoice', 'Nothing here', f === 'All' ? 'Create a quotation or invoice for a booking.' : 'No invoices with this status.', f === 'All' ? '<a class="btn" href="#/invoice/new">' + icon('plus') + ' New invoice</a>' : '')}</div>`;
  };
  $$('#chips .chip').forEach(c => c.onclick = () => { f = c.dataset.f; $$('#chips .chip').forEach(x => x.classList.toggle('on', x === c)); draw(); });
  $('#q').oninput = draw;
  draw();
}

// ---------- details ----------
export async function invoiceDetail(id) {
  const inv = S.inv[id];
  if (!inv) return go('#/invoices');
  const c = S.cust[inv.customerId], ev = S.ev[inv.eventId];
  const t = L.totals(inv), st = invStatus(inv), due = invDue(inv);
  const quote = inv.docType === 'quotation';
  const items = (inv.items || []).filter(it => it.desc || Number(it.price));

  $('#main').innerHTML = `${topbar(quote ? 'Quotation' : 'Invoice', { back: true, actions: `<a class="icon-btn" href="#/invoice/${id}/edit" aria-label="Edit">${icon('edit')}</a>` })}
  <div class="page wide">
    <div class="detail-head"><div class="top-line"><span>${quote ? 'Quotation' : 'Invoice'} ${esc(inv.number || '')}</span>${badge(st)}</div>
      <h2>${L.money(quote ? t.total : t.balance > 0.009 ? t.balance : t.total)}</h2>
      <div class="meta"><span class="muted">${quote ? 'Quoted total' : t.balance > 0.009 ? `Balance due${due ? ' by ' + L.fmtNice(due) : ''}` : 'Paid in full'}</span></div></div>
    <div class="action-row">
      <button id="share">${icon('share')}Share PDF</button>
      <button id="view">${icon('eye')}View PDF</button>
      ${!quote && t.balance > 0.009 ? `<button id="addPay">${icon('handCoins')}Payment</button>` : `<a href="#/invoice/${id}/edit">${icon('edit')}Edit</a>`}
      ${c?.phone ? `<button class="wa" id="remind">${icon('whatsapp')}${quote || t.balance <= 0.009 ? 'WhatsApp' : 'Remind'}</button>` : '<span></span>'}
    </div>
    ${quote ? `<div class="notice-bar lav">${icon('invoice')}<div class="grow small">Client accepted? Turn this quotation into an invoice.</div><button class="btn sm" id="convert">Convert</button></div>` : ''}

    <div class="split-view"><div>
      ${eyebrow('Items')}
      <div class="list">${items.map(it => `<div class="row static"><div class="grow"><div class="t" style="white-space:normal">${esc(it.desc)}</div><div class="s">${L.num2(it.price)} × ${esc(it.qty)}</div></div><b class="num">${L.num2((Number(it.price) || 0) * (Number(it.qty) || 0))}</b></div>`).join('') || '<div class="row static s">No items.</div>'}</div>
      <div class="sum" style="margin-top:10px">
        <div><span>Subtotal</span><span class="num">${L.money(t.subtotal)}</span></div>
        ${t.discount ? `<div><span>Discount</span><span class="num">− ${L.money(t.discount)}</span></div>` : ''}
        <div class="total"><span>Total</span><b>${L.money(t.total)}</b></div>
        ${quote ? '' : `<div><span>Paid</span><span class="num pos">${L.money(t.paid)}</span></div><div class="due"><span>Balance due</span><b>${L.money(t.balance)}</b></div>`}
      </div>
      ${inv.notes ? `<div class="card beige" style="margin-top:12px"><h4>Note on invoice</h4><p style="margin:0;white-space:pre-line">${esc(inv.notes)}</p></div>` : ''}
    </div><div>
      ${eyebrow('Details')}
      <div class="card"><dl class="kv">
        <dt>Client</dt><dd><a class="plum" href="#/client/${c?.id}">${esc(c?.name || 'Unknown')}</a>${c?.phone ? `<br><span class="muted small">${esc(c.phone)}</span>` : ''}</dd>
        ${ev ? `<dt>Booking</dt><dd><a class="plum" href="#/booking/${ev.id}">${esc(evLabel(ev))}</a><br><span class="muted small">${L.fmtNice(ev.date)}${ev.venue ? ' · ' + esc(ev.venue) : ''}</span></dd>` : ''}
        <dt>${quote ? 'Quotation' : 'Invoice'} date</dt><dd>${L.fmtNice(inv.date)}</dd>
        ${quote ? '' : `<dt>Due date</dt><dd>${due ? L.fmtNice(due) : '—'}</dd>`}
        ${inv.fromQuotation ? `<dt>From quotation</dt><dd>${esc(inv.fromQuotation)}</dd>` : ''}
        ${inv.createdBy ? `<dt>Created by</dt><dd>${esc(inv.createdBy)}</dd>` : ''}
      </dl></div>
      ${quote ? '' : eyebrow('Payments') + `<div class="list">${(inv.payments || []).map((p, i) => `<div class="row static"><span class="tile-ic ${p.type === 'Refund' ? 'neg' : 'pos'}">${icon(p.type === 'Refund' ? 'undo' : 'arrowIn')}</span>
          <div class="grow"><div class="t">${p.type === 'Refund' ? '− ' : ''}${L.money(p.amount)}</div><div class="s">${L.fmtNice(p.date)} · ${esc(p.type || 'Payment')}${p.method ? ' · ' + esc(p.method) : ''}${p.note && p.note !== p.type ? ' · ' + esc(p.note) : ''}</div></div>
          ${isOwner() ? `<button class="x-btn" data-rmpay="${i}" aria-label="Remove payment" style="height:40px;width:40px">${icon('trash', 'sm')}</button>` : ''}</div>`).join('') || '<div class="row static s">No payments recorded.</div>'}
        <button class="row" id="addPay2"><span class="tile-ic">${icon('plus')}</span><div class="grow t" style="color:var(--plum)">Record a payment</div></button></div>`}
      ${isOwner() ? `<button class="btn danger block" id="del" style="margin-top:22px">${icon('trash')} Delete ${quote ? 'quotation' : 'invoice'}</button>` : ''}
    </div></div>
  </div>`;

  const pdf = async () => {
    const doc = await buildInvoicePdf(inv, c, ev, S.settings, { due });
    return { bytes: await doc.save(), name: pdfFileName(inv, c) };
  };
  $('#share').onclick = e => busy(e.currentTarget, async () => { const p = await pdf(); const r = await N.shareFile(p.bytes, p.name, 'application/pdf', inv.number); if (r === 'downloaded') toast('PDF downloaded'); }, 'Preparing…');
  $('#view').onclick = e => busy(e.currentTarget, async () => {
    const p = await pdf();
    if (N.isNative()) { await N.shareFile(p.bytes, p.name, 'application/pdf', 'Open PDF with…'); return; }
    const url = URL.createObjectURL(new Blob([p.bytes], { type: 'application/pdf' }));
    if (!window.open(url, '_blank')) location.href = url;
  }, 'Preparing…');
  [$('#addPay'), $('#addPay2')].forEach(b => b && (b.onclick = () => paymentSheet(inv)));
  $$('[data-rmpay]').forEach(b => b.onclick = async () => {
    if (!(await confirmBox('Remove this payment from the invoice?', { ok: 'Remove' }))) return;
    const pays = [...inv.payments]; pays.splice(+b.dataset.rmpay, 1);
    D.put('invoices', { ...inv, payments: pays }); toast('Payment removed');
  });
  const rem = $('#remind'); if (rem) rem.onclick = () => {
    const name = (c.name || '').split(' ')[0];
    const text = quote || t.balance <= 0.009 ? `Dear ${name},\n` : `Dear ${name},\nThis is a friendly reminder from ${S.settings.businessName} that a balance of ${L.money(t.balance)} is due${due ? ' by ' + L.fmtNice(due) : ''} for ${ev ? ev.type.toLowerCase() + ' on ' + L.fmtNice(ev.date) : 'invoice ' + inv.number}.\n\n${S.settings.paymentMethod}\n\nThank you!`;
    N.openExternal(L.waLink(c.phone, text));
  };
  const cv = $('#convert'); if (cv) cv.onclick = e => busy(e.currentTarget, async () => {
    const number = await D.nextNumber('invoice', L.todayISO());
    const { id: _i, createdAt, createdBy, updatedAt, updatedBy, ...rest } = structuredClone(inv);
    const rec = D.put('invoices', { ...rest, docType: 'invoice', number, date: L.todayISO(), payments: [], fromQuotation: inv.number });
    toast('Invoice ' + number + ' created'); go('#/invoice/' + rec.id);
  });
  const del = $('#del'); if (del) del.onclick = async () => { if (await confirmBox(`Delete ${inv.number}? This can't be undone.`)) { D.remove('invoices', id); toast('Deleted'); go('#/invoices'); } };
}

export function paymentSheet(inv, onDone) {
  const t = L.totals(inv);
  const firstPay = !(inv.payments || []).length;
  sheet(`<h3>Record payment</h3><p class="sub">${esc(inv.number || '')} · balance ${L.money(t.balance)}</p>
    <div class="two"><label class="field"><span>Amount (LKR)</span><input id="pa" type="number" inputmode="decimal" min="0" step="0.01" value="${t.balance > 0 ? t.balance.toFixed(2) : ''}"></label>
      <label class="field"><span>Date</span><input id="pd" type="date" value="${L.todayISO()}"></label></div>
    <div class="two"><label class="field"><span>Type</span><select id="pt">${L.PAYMENT_TYPES.map(x => `<option ${x === (firstPay ? 'Advance' : 'Partial') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field"><span>Method</span><select id="pm">${L.PAYMENT_METHODS.map(m => `<option>${m}</option>`).join('')}</select></label></div>
    <label class="field"><span>Note <em>— optional</em></span><input id="pn" placeholder="e.g. Bank ref 12345"></label>
    <div class="btns"><button class="btn secondary" data-close>Cancel</button><button class="btn" data-ok>Save payment</button></div>`, sh => {
    const amt = $('#pa', sh), type = $('#pt', sh);
    amt.oninput = () => { const a = Number(amt.value); if (type.value !== 'Refund') type.value = a >= t.balance - 0.009 ? (firstPay ? 'Advance' : 'Final') : firstPay ? 'Advance' : 'Partial'; };
    $('[data-ok]', sh).onclick = () => {
      const amount = Number(amt.value);
      if (!(amount > 0)) { toast('Enter an amount'); return; }
      if (type.value === 'Refund' && amount > t.paid + 0.009) { toast('A refund can\'t be more than the amount paid.'); return; }
      const p = { amount, date: $('#pd', sh).value || L.todayISO(), type: type.value, method: $('#pm', sh).value, note: $('#pn', sh).value.trim(), at: new Date().toISOString(), by: session.me?.name || '' };
      D.put('invoices', { ...inv, payments: [...(inv.payments || []), p] });
      closeSheet(true); toast(type.value === 'Refund' ? 'Refund recorded' : 'Payment recorded');
      onDone && onDone();
    };
  });
}

// ---------- editor ----------
export async function invoiceForm(id, presetEvent) {
  const isNew = !id;
  let inv = id ? structuredClone(S.inv[id] || null) : null;
  if (id && !inv) return go('#/invoices');
  if (isNew) {
    const ev = presetEvent ? S.ev[presetEvent] : null;
    const items = (ev?.services || []).map(sid => S.items.find(x => x.id === sid)).filter(Boolean).map(sv => ({ desc: sv.name, price: sv.price || '', qty: 1 }));
    if (ev?.packageId) { const p = S.packages.find(x => x.id === ev.packageId); if (p) items.unshift({ desc: p.name, price: p.price || '', qty: 1 }); }
    inv = { docType: ev && !['Inquiry', 'Pending'].includes(ev.status) ? 'invoice' : 'quotation', date: L.todayISO(), customerId: ev?.customerId || '', eventId: ev?.id || '', items: items.length ? items : [{ desc: '', price: '', qty: 1 }], discount: 0, payments: [], notes: '' };
  }
  const svcs = S.items.filter(i => i.active !== false).sort((a, b) => a.name.localeCompare(b.name));

  const render = () => {
    const t = L.totals(inv);
    const evs = S.events.filter(e => e.customerId === inv.customerId).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const autoDue = L.dueDate({ ...inv, dueDate: '' }, S.ev[inv.eventId], S.settings);
    $('#main').innerHTML = `${topbar(isNew ? 'New ' + (inv.docType === 'quotation' ? 'quotation' : 'invoice') : 'Edit ' + (inv.number || ''), { back: true })}
    <div class="page narrow"><form id="inf" class="form" autocomplete="off">
      <div class="seg" id="dt"><button type="button" data-t="quotation" class="${inv.docType === 'quotation' ? 'on' : ''}">Quotation</button><button type="button" data-t="invoice" class="${inv.docType === 'invoice' ? 'on' : ''}">Invoice</button></div>
      <p class="small muted" style="margin:8px 2px">${inv.number ? `Number <b class="plum">${esc(inv.number)}</b>` : 'The number is given automatically when you save.'}</p>
      <label class="field"><span>Client</span><select id="cust" required><option value="">Select client</option>${[...S.customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}" ${c.id === inv.customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${!S.customers.length ? '<p class="small">No clients yet — <a class="plum" href="#/client/new">add a client</a> first.</p>' : ''}
      <label class="field"><span>Booking</span><select id="evsel"><option value="">None</option>${evs.map(e => `<option value="${e.id}" ${e.id === inv.eventId ? 'selected' : ''}>${esc(evLabel(e))} · ${L.fmtShort(e.date)}</option>`).join('')}</select></label>
      <div class="two"><label class="field"><span>Date</span><input type="date" id="date" value="${esc(inv.date)}"></label>
        ${inv.docType === 'invoice' ? `<label class="field"><span>Due date</span><input type="date" id="due" value="${esc(inv.dueDate || '')}" placeholder="${esc(autoDue)}"><span class="hint">${inv.dueDate ? '' : autoDue ? 'Automatic: ' + L.fmtNice(autoDue) : ''}</span></label>` : '<span></span>'}</div>

      <div class="form-section"><h4>Items</h4>
        <datalist id="cat">${svcs.map(i => `<option value="${esc(i.name)}">`).join('')}${S.packages.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
        <div class="lines" id="lines">${inv.items.map((it, i) => `<div class="line" data-i="${i}">
          <div class="line-top"><input class="desc" list="cat" placeholder="Description" value="${esc(it.desc)}" aria-label="Description"><button type="button" class="x-btn" data-rm="${i}" aria-label="Remove item">${icon('x')}</button></div>
          <div class="line-nums"><label>Unit price<input class="price" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(it.price)}"></label>
            <label>Qty<input class="qty" type="number" inputmode="decimal" step="1" min="0" value="${esc(it.qty)}"></label>
            <span class="lt">${L.num2((Number(it.price) || 0) * (Number(it.qty) || 0))}</span></div></div>`).join('')}</div>
        <div class="btns" style="margin-top:10px"><button type="button" class="btn secondary" id="addLine">${icon('plus')} Add item</button><button type="button" class="btn gold" id="pick">${icon('flower')} From services</button></div>
      </div>

      <div class="sum" style="margin-top:16px">
        <div><span>Subtotal</span><span class="num" id="tSub">${L.money(t.subtotal)}</span></div>
        <div><span>Discount (LKR)</span><input id="disc" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(inv.discount || '')}" placeholder="0.00"></div>
        <div class="total"><span>Total</span><b id="tTot">${L.money(t.total)}</b></div>
        ${inv.docType === 'invoice' && !isNew ? `<div><span>Paid</span><span class="num pos">${L.money(t.paid)}</span></div>` : ''}
      </div>
      <label class="field" style="margin-top:12px"><span>Note on PDF <em>— optional</em></span><textarea id="notes" rows="2">${esc(inv.notes)}</textarea></label>
      ${inv.docType === 'invoice' && isNew ? '<p class="small muted">You can record the advance and other payments after saving.</p>' : ''}
      <div class="form-actions"><button class="btn" type="submit">${isNew ? 'Save ' + (inv.docType === 'quotation' ? 'quotation' : 'invoice') : 'Save changes'}</button></div>
    </form></div>`;
    $$('[data-back]').forEach(b => b.onclick = () => history.back());
    bind();
  };
  const read = () => {
    inv.items = $$('#lines .line').map(l => ({ desc: $('.desc', l).value, price: $('.price', l).value, qty: $('.qty', l).value }));
    inv.discount = $('#disc').value; inv.notes = $('#notes').value; inv.date = $('#date').value;
    inv.customerId = $('#cust').value; inv.eventId = $('#evsel').value;
    if ($('#due')) inv.dueDate = $('#due').value;
  };
  const totalsNow = () => {
    read();
    $$('#lines .line').forEach((l, i) => { $('.lt', l).textContent = L.num2((Number(inv.items[i].price) || 0) * (Number(inv.items[i].qty) || 0)); });
    const t = L.totals(inv); $('#tSub').textContent = L.money(t.subtotal); $('#tTot').textContent = L.money(t.total);
  };
  const bind = () => {
    $$('#lines input').forEach(i => i.oninput = totalsNow);
    $$('#lines .desc').forEach(d => d.onchange = () => {
      const hit = svcs.find(s => s.name === d.value) || S.packages.find(p => p.name === d.value);
      const line = d.closest('.line');
      if (hit && Number(hit.price) && !Number($('.price', line).value)) { $('.price', line).value = hit.price; totalsNow(); }
    });
    $('#disc').oninput = totalsNow;
    $$('[data-rm]').forEach(b => b.onclick = () => { read(); inv.items.splice(+b.dataset.rm, 1); if (!inv.items.length) inv.items.push({ desc: '', price: '', qty: 1 }); render(); });
    $('#addLine').onclick = () => { read(); inv.items.push({ desc: '', price: '', qty: 1 }); render(); $$('#lines .desc').pop().focus(); };
    $('#pick').onclick = () => { read(); pickServices(svcs, lines => { inv.items = inv.items.filter(it => it.desc || Number(it.price)).concat(lines); render(); }); };
    $$('#dt button').forEach(b => b.onclick = () => {
      if (inv.number) { toast(inv.docType === 'quotation' ? 'Open the quotation and tap Convert to make an invoice.' : 'A saved invoice stays an invoice.', 3500); return; }
      read(); inv.docType = b.dataset.t; render();
    });
    $('#cust').onchange = () => { read(); inv.eventId = ''; render(); };
    $('#evsel').onchange = () => { read(); render(); };
    $('#inf').onsubmit = async e => {
      e.preventDefault(); read();
      if (!inv.customerId) { toast('Choose a client.'); return; }
      inv.items = inv.items.filter(it => it.desc || Number(it.price)).map(it => ({ desc: it.desc.trim(), price: Number(it.price) || 0, qty: Number(it.qty) || 0 }));
      if (!inv.items.length) { toast('Add at least one item.'); inv.items = [{ desc: '', price: '', qty: 1 }]; render(); return; }
      inv.discount = Number(inv.discount) || 0;
      const btn = e.submitter || $('#inf button[type=submit]'); btn.disabled = true;
      if (!inv.number) inv.number = await D.nextNumber(inv.docType, inv.date);
      const rec = D.put('invoices', inv);
      toast('Saved ' + rec.number);
      history.replaceState(null, '', '#/invoice/' + rec.id); window.dispatchEvent(new HashChangeEvent('hashchange'));
    };
  };
  render();
}

function pickServices(svcs, onAdd) {
  const cats = [...new Set(svcs.map(s => s.category || 'Other'))];
  sheet(`<h3>Add from services</h3><p class="sub">Tick the services or packages to add.</p>
    ${S.packages.length ? `<div class="label" style="margin:6px 0">Packages</div><div class="list">${S.packages.map(p => `<label class="row"><input type="checkbox" data-pkg="${p.id}" style="width:20px;min-height:20px;accent-color:var(--plum)"><div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${esc(p.description || '')}</div></div><b class="num small">${p.price ? L.moneyShort(p.price) : ''}</b></label>`).join('')}</div>` : ''}
    ${cats.map(cat => `<div class="label" style="margin:14px 0 6px">${esc(cat)}</div><div class="list">${svcs.filter(s => (s.category || 'Other') === cat).map(s => `<label class="row"><input type="checkbox" data-svc="${s.id}" style="width:20px;min-height:20px;accent-color:var(--plum)"><div class="grow t">${esc(s.name)}</div><b class="num small">${Number(s.price) ? L.moneyShort(s.price) : ''}</b></label>`).join('')}</div>`).join('')}
    <div class="btns"><button class="btn secondary" data-close>Cancel</button><button class="btn" data-ok>Add selected</button></div>`, sh => {
    $('[data-ok]', sh).onclick = () => {
      const lines = [
        ...$$('[data-pkg]:checked', sh).map(c => S.packages.find(p => p.id === c.dataset.pkg)).map(p => ({ desc: p.name, price: p.price || '', qty: 1 })),
        ...$$('[data-svc]:checked', sh).map(c => svcs.find(s => s.id === c.dataset.svc)).map(s => ({ desc: s.name, price: s.price || '', qty: 1 }))
      ];
      closeSheet(); if (lines.length) onAdd(lines);
    };
  });
}
