// Payments (across all invoices) and expenses.
import * as D from '../data.js';
import * as L from '../logic.js';
import { S, isOwner, custName, evLabel } from '../state.js';
import { $, $$, go, icon, esc, toast, sheet, closeSheet, badge, empty, eyebrow, topbar, confirmBox, formData } from '../ui.js';
import { exportSheet } from '../report.js';

function periodOptions(sel) {
  const t = L.todayISO(), y = t.slice(0, 4);
  const lm = L.toISO(new Date(+y, +t.slice(5, 7) - 2, 1)).slice(0, 7);
  const opts = [[t.slice(0, 7), 'This month'], [lm, 'Last month'], [y, 'This year'], [String(+y - 1), 'Last year'], ['', 'All time']];
  return opts.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
}
const ssGet = (k, d) => { try { return sessionStorage.getItem(k) ?? d; } catch (e) { return d; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } };

// ---------- payments ----------
export async function paymentsView() {
  let period = ssGet('nw-pay-p', L.todayISO().slice(0, 7)), type = ssGet('nw-pay-t', 'All'), method = ssGet('nw-pay-m', 'All');
  $('#main').innerHTML = `${topbar('Payments', { actions: `<button class="icon-btn" id="exp" aria-label="Export">${icon('download')}</button><a class="icon-btn" href="#/invoices" aria-label="Invoices">${icon('invoice')}</a>` })}
  <div class="page wide">
    <div class="page-head"><h2>Payments</h2><p>Advances, part and final payments, and refunds across all invoices.</p></div>
    <div class="toolbar"><select id="per" aria-label="Period" style="flex:1">${periodOptions(period)}</select>
      <select id="mth" aria-label="Method" style="flex:1"><option>All</option>${L.PAYMENT_METHODS.map(m => `<option ${m === method ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div class="chips" id="chips">${['All', ...L.PAYMENT_TYPES].map(x => `<button class="chip ${x === type ? 'on' : ''}" data-t="${x}">${x}</button>`).join('')}</div>
    <div id="body" style="margin-top:8px"></div>
  </div>`;
  const draw = () => {
    ssSet('nw-pay-p', period); ssSet('nw-pay-t', type); ssSet('nw-pay-m', method);
    const all = L.allPayments(S.invoices).filter(p => (p.date || '').startsWith(period) && (method === 'All' || p.method === method));
    const list = all.filter(p => type === 'All' || (p.type || 'Partial') === type);
    const received = all.filter(p => p.type !== 'Refund').reduce((a, p) => a + Number(p.amount || 0), 0);
    const refunds = all.filter(p => p.type === 'Refund').reduce((a, p) => a + Number(p.amount || 0), 0);
    const byMethod = {};
    all.forEach(p => { const m = p.method || 'Not set'; byMethod[m] = (byMethod[m] || 0) + L.paymentSigned(p); });
    const groups = {};
    list.forEach(p => { const k = (p.date || '').slice(0, 7); (groups[k] = groups[k] || []).push(p); });
    $('#body').innerHTML = `<div class="kpis">
        <div class="kpi dark"><span>Net received</span><b>${L.moneyShort(received - refunds)}</b><small>${all.length} payment${all.length === 1 ? '' : 's'}</small></div>
        <div class="kpi"><span>Received</span><b>${L.moneyShort(received)}</b></div>
        <div class="kpi"><span>Refunds</span><b class="${refunds ? 'neg' : ''}">${L.moneyShort(refunds)}</b></div>
        <div class="kpi"><span>Top method</span><b style="font-size:16px">${esc(Object.entries(byMethod).sort((a, b) => b[1] - a[1])[0]?.[0] || '—')}</b></div>
      </div>
      ${list.length ? Object.keys(groups).sort().reverse().map(k => `${eyebrow(k ? L.MONTHS_LONG[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4) : 'No date')}
        <div class="list">${groups[k].map(p => { const ev = S.ev[p.invoice.eventId]; return `<a class="row" href="#/invoice/${p.invoice.id}">
          <span class="tile-ic ${p.type === 'Refund' ? 'neg' : 'pos'}">${icon(p.type === 'Refund' ? 'undo' : 'arrowIn')}</span>
          <div class="grow"><div class="t">${esc(custName(p.invoice.customerId))}</div><div class="s">${L.fmtShort(p.date)} · ${esc(p.invoice.number || '')}${ev ? ' · ' + esc(ev.type) : ''}</div></div>
          <div class="end"><b class="${p.type === 'Refund' ? 'neg' : ''}">${p.type === 'Refund' ? '− ' : ''}${L.moneyShort(p.amount)}</b><span class="tiny muted">${esc(p.type || 'Payment')}${p.method ? ' · ' + esc(p.method) : ''}</span></div></a>`; }).join('')}</div>`).join('')
        : `<div class="list" style="margin-top:14px">${empty('wallet', 'No payments', 'Payments are recorded on invoices. Open an invoice and tap Payment.', '<a class="btn secondary" href="#/invoices">Go to invoices</a>')}</div>`}`;
  };
  $('#exp').onclick = () => exportSheet(period);
  $('#per').onchange = e => { period = e.target.value; draw(); };
  $('#mth').onchange = e => { method = e.target.value; draw(); };
  $$('#chips .chip').forEach(c => c.onclick = () => { type = c.dataset.t; $$('#chips .chip').forEach(x => x.classList.toggle('on', x === c)); draw(); });
  draw();
}

// ---------- expenses ----------
export async function expensesView() {
  let period = ssGet('nw-exp-p', L.todayISO().slice(0, 7)), cat = ssGet('nw-exp-c', 'All');
  $('#main').innerHTML = `${topbar('Expenses', { actions: `<button class="icon-btn" id="exp" aria-label="Export">${icon('download')}</button><a class="icon-btn" href="#/expense/new" aria-label="Add expense">${icon('plus')}</a>` })}
  <div class="page wide">
    <div class="page-head"><h2>Expenses</h2><p>Flowers, materials, transport, labour and other costs.</p></div>
    <div class="toolbar"><select id="per" aria-label="Period" style="flex:1">${periodOptions(period)}</select>
      <select id="cat" aria-label="Category" style="flex:1"><option>All</option>${L.EXPENSE_CATEGORIES.map(c => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="search" style="margin-bottom:10px">${icon('search')}<input id="q" type="search" placeholder="Search description or supplier" aria-label="Search expenses"></div>
    <div id="body"></div>
  </div>
  <a class="fab" href="#/expense/new" aria-label="Add expense">${icon('plus')}</a>`;
  const draw = () => {
    ssSet('nw-exp-p', period); ssSet('nw-exp-c', cat);
    const q = ($('#q').value || '').toLowerCase();
    const inPeriod = S.expenses.filter(x => (x.date || '').startsWith(period));
    const list = inPeriod.filter(x => (cat === 'All' || x.category === cat) && (!q || [x.description, x.supplier, x.notes, x.category].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = list.reduce((a, x) => a + Number(x.amount || 0), 0);
    const byCat = {};
    inPeriod.forEach(x => { byCat[x.category || 'Other'] = (byCat[x.category || 'Other'] || 0) + Number(x.amount || 0); });
    const max = Math.max(1, ...Object.values(byCat));
    const income = L.finance(S, period).received;
    $('#body').innerHTML = `<div class="kpis">
        <div class="kpi dark"><span>${cat === 'All' ? 'Total spent' : esc(cat)}</span><b>${L.moneyShort(total)}</b><small>${list.length} expense${list.length === 1 ? '' : 's'}</small></div>
        <div class="kpi"><span>Received</span><b>${L.moneyShort(income)}</b><small>same period</small></div>
        <div class="kpi"><span>Net</span><b class="${income - total < 0 ? 'neg' : ''}">${L.moneyShort(income - inPeriod.reduce((a, x) => a + Number(x.amount || 0), 0))}</b><small>received − all expenses</small></div>
        <div class="kpi"><span>Biggest cost</span><b style="font-size:16px">${esc(Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] || '—')}</b></div>
      </div>
      ${Object.keys(byCat).length > 1 && cat === 'All' ? eyebrow('By category') + `<div class="card">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="hbar"><span class="ellipsis">${esc(k)}</span><div class="progress gold"><i style="width:${v / max * 100}%"></i></div><b class="small">${L.moneyShort(v).replace('LKR ', '')}</b></div>`).join('')}</div>` : ''}
      ${eyebrow('Expenses')}
      ${list.length ? `<div class="list">${list.map(x => `<a class="row" href="#/expense/${x.id}"><span class="tile-ic">${icon('receipt')}</span>
          <div class="grow"><div class="t">${esc(x.description || x.category || 'Expense')}</div><div class="s">${L.fmtShort(x.date)} · ${esc(x.category || '')}${x.supplier ? ' · ' + esc(x.supplier) : ''}${S.ev[x.eventId] ? ' · ' + esc(S.ev[x.eventId].type) : ''}</div></div>
          <div class="end"><b>${L.moneyShort(x.amount)}</b>${x.method ? `<span class="tiny muted">${esc(x.method)}</span>` : ''}</div></a>`).join('')}</div>`
        : `<div class="list">${empty('receipt', 'No expenses', 'Record costs to see your real profit.', '<a class="btn" href="#/expense/new">' + icon('plus') + ' Add expense</a>')}</div>`}`;
  };
  $('#exp').onclick = () => exportSheet(period);
  $('#per').onchange = e => { period = e.target.value; draw(); };
  $('#cat').onchange = e => { cat = e.target.value; draw(); };
  $('#q').oninput = draw;
  draw();
}

export async function expenseForm(id) {
  const x = id ? S.expenses.find(e => e.id === id) : { date: L.todayISO(), category: 'Flowers', method: 'Cash' };
  if (id && !x) return go('#/expenses');
  const evs = [...S.events].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 80);
  const suppliers = [...new Set(S.expenses.map(e => e.supplier).filter(Boolean))];
  $('#main').innerHTML = `${topbar(id ? 'Edit expense' : 'New expense', { back: true })}
  <div class="page narrow"><form id="xf" class="form" autocomplete="off">
    <div class="two"><label class="field"><span>Amount (LKR)</span><input name="amount" type="number" inputmode="decimal" min="0" step="0.01" required value="${esc(x.amount)}"></label>
      <label class="field"><span>Date</span><input name="date" type="date" required value="${esc(x.date)}"></label></div>
    <label class="field"><span>Category</span><select name="category">${L.EXPENSE_CATEGORIES.map(c => `<option ${c === x.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field"><span>Description</span><input name="description" value="${esc(x.description)}" placeholder="e.g. Roses and orchids for Perera wedding"></label>
    <div class="two"><label class="field"><span>Supplier <em>— optional</em></span><input name="supplier" list="sup" value="${esc(x.supplier)}"><datalist id="sup">${suppliers.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <label class="field"><span>Paid by</span><select name="method">${L.PAYMENT_METHODS.map(m => `<option ${m === x.method ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
    <label class="field"><span>Related booking <em>— optional</em></span><select name="eventId"><option value="">None</option>${evs.map(e => `<option value="${e.id}" ${e.id === x.eventId ? 'selected' : ''}>${esc(evLabel(e))} · ${L.fmtShort(e.date)} · ${esc(custName(e.customerId))}</option>`).join('')}</select></label>
    <label class="field"><span>Notes</span><textarea name="notes" rows="2">${esc(x.notes)}</textarea></label>
    <div class="form-actions"><button class="btn" type="submit">${id ? 'Save changes' : 'Save expense'}</button></div>
    ${id && isOwner() ? `<button type="button" class="btn danger block" id="del">${icon('trash')} Delete expense</button>` : ''}
  </form></div>`;
  $('#xf').onsubmit = e => {
    e.preventDefault();
    const f = formData(e.target);
    if (!(Number(f.amount) > 0)) { toast('Enter the amount.'); return; }
    D.put('expenses', { ...x, ...f, amount: Number(f.amount), description: f.description.trim(), supplier: f.supplier.trim() });
    toast('Expense saved'); go('#/expenses');
  };
  const del = $('#del'); if (del) del.onclick = async () => { if (await confirmBox('Move this expense to the recycle bin? You can restore it within 30 days.', { ok: 'Delete' })) { D.trash('expenses', id); toast('Moved to the recycle bin — restore it from More → Recycle bin within 30 days.', 4500); go('#/expenses'); } };
}
