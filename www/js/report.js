// Report exports: Excel workbook and branded PDF, for a month, a year or all time.
import * as L from './logic.js';
import * as N from './native.js';
import { S, custName, evLabel, invStatus, invDue } from './state.js';
import { $, $$, icon, esc, toast, sheet, closeSheet, busy } from './ui.js';
import { buildXlsx, XLSX_STYLE as XS } from './xlsx.js';

// ---------- period ----------
export function periodLabel(p) {
  if (!p) return 'All time';
  if (p.length === 4) return 'Year ' + p;
  return L.MONTHS_LONG[+p.slice(5, 7) - 1] + ' ' + p.slice(0, 4);
}
const inP = (d, p) => !p || String(d || '').startsWith(p);

// Everything the exports need, computed once from the app data.
export function reportData(p) {
  const evs = S.events.filter(e => inP(e.date, p));
  const invs = S.invoices.filter(i => inP(i.date, p));
  const pays = L.allPayments(S.invoices).filter(x => inP(x.date, p));
  const exps = S.expenses.filter(x => inP(x.date, p)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const received = pays.filter(x => x.type !== 'Refund').reduce((a, x) => a + Number(x.amount || 0), 0);
  const refunds = pays.filter(x => x.type === 'Refund').reduce((a, x) => a + Number(x.amount || 0), 0);
  const spent = exps.reduce((a, x) => a + Number(x.amount || 0), 0);
  const realInvs = invs.filter(i => i.docType === 'invoice');
  const invoiced = realInvs.reduce((a, i) => a + L.totals(i).total, 0);
  const openInvs = S.invoices.filter(i => i.docType === 'invoice' && S.ev[i.eventId]?.status !== 'Cancelled' && L.totals(i).balance > 0.009);
  const outstanding = openInvs.reduce((a, i) => a + L.totals(i).balance, 0);
  const active = evs.filter(e => e.status !== 'Cancelled');

  // months covered: a year → 12 months, all time → every month with activity, a month → that month
  let months;
  if (p.length === 7) months = [p];
  else if (p.length === 4) months = Array.from({ length: 12 }, (_, i) => `${p}-${L.pad(i + 1)}`);
  else months = [...new Set([...pays.map(x => (x.date || '').slice(0, 7)), ...exps.map(x => (x.date || '').slice(0, 7)), ...active.map(e => (e.date || '').slice(0, 7))].filter(Boolean))].sort();
  const monthly = months.map(m => {
    const f = L.finance(S, m);
    return { m, label: L.MONTHS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4), received: f.received, spent: f.spent, profit: f.profit, bookings: S.events.filter(e => (e.date || '').startsWith(m) && e.status !== 'Cancelled').length };
  });
  const group = (list, key, val) => { const o = {}; list.forEach(x => { const k = key(x) || 'Other'; o[k] = (o[k] || 0) + val(x); }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const byType = group(active, e => e.type, () => 1);
  const byMethod = group(pays, x => x.method || 'Not set', x => L.paymentSigned(x));
  const byCat = group(exps, x => x.category, x => Number(x.amount || 0));
  const topClients = group(realInvs, i => i.customerId, i => L.totals(i).total).slice(0, 10);
  return { p, label: periodLabel(p), evs, active, invs, realInvs, pays, exps, received, refunds, spent, net: received - refunds, profit: received - refunds - spent, invoiced, outstanding, openInvs, monthly, byType, byMethod, byCat, topClients, cancelled: evs.length - active.length };
}

// ---------- Excel ----------
const M = v => ({ v: Number(v) || 0, t: 'money' });
const D = v => (v ? { v, t: 'date' } : '');
function titleRows(r, title, ncols) {
  const s = S.settings;
  return [[{ v: s.businessName + ' — ' + title, s: XS.title }], [{ v: `${r.label} · created ${L.fmtNice(L.todayISO())}`, s: XS.sub }], new Array(ncols).fill('')];
}
export function buildWorkbook(r) {
  const sheets = [];
  // 1. Summary
  const sum = [
    ...titleRows(r, 'Business report', 4),
    [{ v: 'Overview', s: XS.bold }, { v: '', s: XS.bold }],
    ['Money received', M(r.received)], ['Refunds', M(r.refunds)], ['Net received', M(r.net)], ['Expenses', M(r.spent)],
    [{ v: 'Profit (net received − expenses)', s: XS.bold }, { v: r.profit, t: 'money', s: XS.boldMoney }],
    ['Invoiced in period', M(r.invoiced)], ['Balance to collect (all open invoices)', M(r.outstanding)],
    ['Bookings', { v: r.active.length, t: 'int' }], ['Cancelled bookings', { v: r.cancelled, t: 'int' }],
    [''],
  ];
  const mh = sum.length;
  sum.push(['Month', 'Received', 'Expenses', 'Profit', 'Bookings']);
  r.monthly.forEach(m => sum.push([m.label, M(m.received), M(m.spent), M(m.profit), { v: m.bookings, t: 'int' }]));
  sum.push([{ v: 'Total', s: XS.bold }, { v: r.monthly.reduce((a, m) => a + m.received, 0), t: 'money', s: XS.boldMoney }, { v: r.monthly.reduce((a, m) => a + m.spent, 0), t: 'money', s: XS.boldMoney }, { v: r.monthly.reduce((a, m) => a + m.profit, 0), t: 'money', s: XS.boldMoney }, { v: r.monthly.reduce((a, m) => a + m.bookings, 0), t: 'int', s: XS.bold }]);
  sum.push(['']); sum.push([{ v: 'Bookings by event type', s: XS.bold }, { v: '', s: XS.bold }]); r.byType.forEach(([k, v]) => sum.push([k, { v, t: 'int' }]));
  sum.push(['']); sum.push([{ v: 'Payments by method', s: XS.bold }, { v: '', s: XS.bold }]); r.byMethod.forEach(([k, v]) => sum.push([k, M(v)]));
  if (r.byCat.length) { sum.push(['']); sum.push([{ v: 'Expenses by category', s: XS.bold }, { v: '', s: XS.bold }]); r.byCat.forEach(([k, v]) => sum.push([k, M(v)])); }
  if (r.topClients.length) { sum.push(['']); sum.push([{ v: 'Top clients (invoiced)', s: XS.bold }, { v: '', s: XS.bold }]); r.topClients.forEach(([k, v]) => sum.push([custName(k), M(v)])); }
  // style the monthly header like a table header
  sum[mh] = sum[mh].map(v => ({ v, s: 1 }));
  sheets.push({ name: 'Summary', widths: [38, 18, 18, 18, 12], rows: sum });

  // 2. Payments
  const pay = [...titleRows(r, 'Payments', 9), ['Date', 'Client', 'Invoice', 'Booking', 'Type', 'Method', 'Amount (LKR)', 'Note', 'Recorded by']];
  r.pays.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(x => {
    const ev = S.ev[x.invoice.eventId];
    pay.push([D(x.date), custName(x.invoice.customerId), x.invoice.number || '', ev ? evLabel(ev) : '', x.type || 'Payment', x.method || '', M(L.paymentSigned(x)), x.note || '', x.by || '']);
  });
  pay.push(['', '', '', '', '', { v: 'Total', s: XS.bold }, { v: r.net, t: 'money', s: XS.boldMoney }]);
  sheets.push({ name: 'Payments', widths: [12, 24, 16, 30, 11, 14, 16, 26, 16], rows: pay, headerRow: 3 });

  // 3. Expenses
  const exp = [...titleRows(r, 'Expenses', 8), ['Date', 'Category', 'Description', 'Supplier', 'Booking', 'Paid by', 'Amount (LKR)', 'Notes']];
  r.exps.forEach(x => exp.push([D(x.date), x.category || '', x.description || '', x.supplier || '', S.ev[x.eventId] ? evLabel(S.ev[x.eventId]) : '', x.method || '', M(x.amount), x.notes || '']));
  exp.push(['', '', '', '', '', { v: 'Total', s: XS.bold }, { v: r.spent, t: 'money', s: XS.boldMoney }]);
  sheets.push({ name: 'Expenses', widths: [12, 16, 34, 20, 28, 13, 16, 26], rows: exp, headerRow: 3 });

  // 4. Invoices
  const inv = [...titleRows(r, 'Invoices & quotations', 12), ['Number', 'Type', 'Date', 'Due date', 'Client', 'Booking', 'Event date', 'Status', 'Subtotal', 'Discount', 'Total (LKR)', 'Paid', 'Balance']];
  r.invs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.number || '').localeCompare(b.number || '')).forEach(i => {
    const t = L.totals(i), ev = S.ev[i.eventId];
    inv.push([i.number || '', i.docType === 'quotation' ? 'Quotation' : 'Invoice', D(i.date), i.docType === 'invoice' ? D(invDue(i)) : '', custName(i.customerId), ev ? evLabel(ev) : '', D(ev?.date), invStatus(i), M(t.subtotal), M(t.discount), M(t.total), i.docType === 'invoice' ? M(t.paid) : '', i.docType === 'invoice' ? M(t.balance) : '']);
  });
  sheets.push({ name: 'Invoices', widths: [16, 11, 12, 12, 24, 30, 12, 14, 14, 12, 15, 14, 14], rows: inv, headerRow: 3 });

  // 5. Bookings
  const bk = [...titleRows(r, 'Bookings', 13), ['Event date', 'Time', 'Type', 'Names', 'Client', 'Phone', 'Venue', 'Status', 'Estimate', 'Invoiced', 'Paid', 'Balance', 'Notes']];
  r.evs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(e => {
    let tot = 0, paid = 0;
    S.invoices.filter(i => i.eventId === e.id && i.docType === 'invoice').forEach(i => { const t = L.totals(i); tot += t.total; paid += t.paid; });
    bk.push([D(e.date), e.time ? L.fmtTime(e.time) : '', e.type, e.names || '', custName(e.customerId), S.cust[e.customerId]?.phone || '', e.venue || '', e.status || 'Inquiry', e.estimatedPrice ? M(e.estimatedPrice) : '', M(tot), M(paid), M(Math.max(tot - paid, 0)), e.notes || '']);
  });
  sheets.push({ name: 'Bookings', widths: [12, 10, 14, 24, 22, 14, 26, 12, 14, 14, 14, 14, 30], rows: bk, headerRow: 3 });

  // 6. Open balances (always all open invoices)
  const ob = [...titleRows(r, 'Balances to collect', 7), ['Invoice', 'Client', 'Phone', 'Booking', 'Due date', 'Status', 'Balance (LKR)']];
  r.openInvs.slice().sort((a, b) => (invDue(a) || '').localeCompare(invDue(b) || '')).forEach(i => ob.push([i.number || '', custName(i.customerId), S.cust[i.customerId]?.phone || '', S.ev[i.eventId] ? evLabel(S.ev[i.eventId]) : '', D(invDue(i)), invStatus(i), M(L.totals(i).balance)]));
  ob.push(['', '', '', '', '', { v: 'Total', s: XS.bold }, { v: r.outstanding, t: 'money', s: XS.boldMoney }]);
  sheets.push({ name: 'Balances', widths: [16, 24, 14, 30, 12, 14, 16], rows: ob, headerRow: 3 });

  return buildXlsx(sheets, { title: `${S.settings.businessName} report — ${r.label}`, author: S.settings.businessName });
}

// ---------- PDF ----------
const C = { plum: [0x32, 0x13, 0x42], plum2: [0x6E, 0x22, 0x5E], gold: [0xC5, 0xA4, 0x6D], goldText: [0xB0, 0x8D, 0x4F], ivory: [0xFA, 0xF7, 0xF1], beige: [0xF3, 0xEB, 0xDD], lav: [0xE9, 0xE1, 0xF0], line: [0xE6, 0xDF, 0xD8], text: [0x30, 0x2A, 0x32], grey: [0x7E, 0x78, 0x80], white: [255, 255, 255], neg: [0xA6, 0x45, 0x3B] };
const clean = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/[^\n\x20-\x7E\xA0-\xFF•]/g, '');
const n2 = v => L.num2(v);

export async function buildReportPdf(r) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const col = a => rgb(a[0] / 255, a[1] / 255, a[2] / 255);
  const doc = await PDFDocument.create();
  doc.setTitle(`${S.settings.businessName} report — ${r.label}`); doc.setAuthor(clean(S.settings.businessName)); doc.setCreator(clean(S.settings.businessName)); doc.setProducer(clean(S.settings.businessName));
  const F = { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), serif: await doc.embedFont(StandardFonts.TimesRoman), serifB: await doc.embedFont(StandardFonts.TimesRomanBold) };
  const logo = await doc.embedPng(await fetch('img/logo-pdf.png').then(x => x.arrayBuffer()));
  const W = 595.28, H = 841.89, X0 = 48, X1 = W - 48, CW = X1 - X0, BOTTOM = 64;
  let page, y, pageNo = 0;
  const text = (s, x, yy, { size = 9, font = F.reg, color = C.text, align = 'left', spacing = 0 } = {}) => {
    s = clean(s); const w = font.widthOfTextAtSize(s, size) + spacing * Math.max(0, s.length - 1);
    if (align === 'right') x -= w; else if (align === 'center') x -= w / 2;
    page.drawText(s, { x, y: yy, size, font, color: col(color), characterSpacing: spacing || undefined });
  };
  const rect = (x, yy, w, h, fill, border) => page.drawRectangle({ x, y: yy, width: w, height: h, color: fill ? col(fill) : undefined, borderColor: border ? col(border) : undefined, borderWidth: border ? 0.6 : 0 });
  const fit = (s, font, size, maxW) => { s = clean(s); if (font.widthOfTextAtSize(s, size) <= maxW) return s; while (s.length > 1 && font.widthOfTextAtSize(s + '...', size) > maxW) s = s.slice(0, -1); return s + '...'; };
  const newPage = () => {
    page = doc.addPage([W, H]); pageNo++;
    page.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: col(C.gold), borderWidth: 0.8 });
    rect(20, H - 25, W - 40, 5, C.plum);
    text(clean(S.settings.businessName).toUpperCase() + '  ·  BUSINESS REPORT  ·  ' + r.label.toUpperCase(), X0, 30, { size: 6.5, color: C.grey, spacing: 0.4 });
    text('Page ' + pageNo, X1, 30, { size: 6.5, color: C.grey, align: 'right' });
    y = H - 50;
  };
  const need = h => { if (y - h < BOTTOM) { newPage(); } };
  const heading = t => { need(40); y -= 18; text(t.toUpperCase(), X0, y, { size: 8.5, font: F.bold, color: C.plum2, spacing: 0.8 }); page.drawLine({ start: { x: X0, y: y - 5 }, end: { x: X1, y: y - 5 }, thickness: 0.6, color: col(C.gold) }); y -= 14; };
  // simple table: cols [{label, w, align}], rows [[...]]
  const table = (cols, rows, { totals } = {}) => {
    const head = () => { rect(X0, y - 20, CW, 20, C.plum); let x = X0; cols.forEach(c => { text(c.label, c.align === 'right' ? x + c.w - 8 : x + 8, y - 13.5, { size: 7, font: F.bold, color: C.white, align: c.align || 'left', spacing: 0.3 }); x += c.w; }); y -= 20; };
    need(44); head();
    rows.forEach((r0, i) => {
      if (y - 18 < BOTTOM) { newPage(); head(); }
      rect(X0, y - 18, CW, 18, i % 2 ? C.ivory : C.white);
      let x = X0; cols.forEach((c, k) => { const v = fit(r0[k] ?? '', F.reg, 7.8, c.w - 14); text(v, c.align === 'right' ? x + c.w - 8 : x + 8, y - 12, { size: 7.8, align: c.align || 'left', color: c.color?.(r0) || C.text }); x += c.w; });
      y -= 18;
    });
    if (!rows.length) { rect(X0, y - 18, CW, 18, C.white); text('Nothing recorded in this period.', X0 + 8, y - 12, { size: 7.8, color: C.grey }); y -= 18; }
    if (totals) {
      need(20); rect(X0, y - 20, CW, 20, C.beige); page.drawLine({ start: { x: X0, y }, end: { x: X1, y }, thickness: 0.8, color: col(C.gold) });
      let x = X0; cols.forEach((c, k) => { if (totals[k] != null) text(totals[k], c.align === 'right' ? x + c.w - 8 : x + 8, y - 13.5, { size: 8, font: F.bold, color: C.plum, align: c.align || 'left' }); x += c.w; });
      y -= 20;
    }
    page.drawRectangle({ x: X0, y, width: CW, height: 0.01, borderColor: col(C.line), borderWidth: 0.4 });
  };
  const bars = (list, colr) => {
    const max = Math.max(1, ...list.map(([, v]) => Math.abs(v)));
    list.forEach(([k, v, lbl]) => { need(16); text(fit(k, F.reg, 8, 120), X0, y - 9, { size: 8 }); rect(X0 + 130, y - 11, CW - 230, 7, C.beige); rect(X0 + 130, y - 11, Math.max(1.5, (CW - 230) * Math.max(0, v) / max), 7, colr); text(lbl ?? String(v), X1, y - 9.5, { size: 8, font: F.bold, align: 'right' }); y -= 16; });
  };

  // ---------- cover header ----------
  newPage();
  const lw = 170, lh = lw * logo.height / logo.width;
  page.drawImage(logo, { x: X0 - 6, y: H - 38 - lh, width: lw, height: lh });
  text('BUSINESS REPORT', X1, H - 70, { size: 22, font: F.serifB, color: C.plum, align: 'right' });
  text(r.label, X1, H - 88, { size: 11, font: F.serif, color: C.goldText, align: 'right' });
  text('Created ' + L.fmtNice(L.todayISO()), X1, H - 101, { size: 7.5, color: C.grey, align: 'right' });
  y = H - 50 - lh - 12;
  page.drawLine({ start: { x: X0, y }, end: { x: X1, y }, thickness: 0.8, color: col(C.gold) });
  y -= 14;

  // KPI tiles
  const kpis = [['Net received', 'LKR ' + n2(r.net), true], ['Expenses', 'LKR ' + n2(r.spent)], ['Profit', 'LKR ' + n2(r.profit)], ['Balance to collect', 'LKR ' + n2(r.outstanding)], ['Invoiced', 'LKR ' + n2(r.invoiced)], ['Bookings', String(r.active.length)]];
  const kw = (CW - 16) / 3, kh = 46;
  kpis.forEach(([k, v, dark], i) => {
    const x = X0 + (i % 3) * (kw + 8), yy = y - Math.floor(i / 3) * (kh + 8) - kh;
    rect(x, yy, kw, kh, dark ? C.plum : C.ivory, dark ? null : C.line);
    text(k.toUpperCase(), x + 10, yy + kh - 15, { size: 6.8, font: F.bold, color: dark ? [0xD8, 0xC8, 0xE2] : C.grey, spacing: 0.5 });
    text(v, x + 10, yy + 12, { size: 13, font: F.bold, color: dark ? C.white : (k === 'Profit' && r.profit < 0 ? C.neg : C.plum) });
  });
  y -= 2 * (kh + 8) + 4;

  // monthly
  heading(r.p.length === 7 ? 'Month summary' : 'By month');
  const mcols = [{ label: 'MONTH', w: 120 }, { label: 'RECEIVED', w: 100, align: 'right' }, { label: 'EXPENSES', w: 100, align: 'right' }, { label: 'PROFIT', w: 100, align: 'right' }, { label: 'BOOKINGS', w: CW - 420, align: 'right' }];
  table(mcols, r.monthly.map(m => [m.label, n2(m.received), n2(m.spent), n2(m.profit), String(m.bookings)]),
    { totals: ['Total', n2(r.monthly.reduce((a, m) => a + m.received, 0)), n2(r.monthly.reduce((a, m) => a + m.spent, 0)), n2(r.monthly.reduce((a, m) => a + m.profit, 0)), String(r.monthly.reduce((a, m) => a + m.bookings, 0))] });

  if (r.byType.length) { heading('Bookings by event type'); bars(r.byType, C.plum); }
  if (r.byMethod.length) { heading('Payments by method'); bars(r.byMethod.map(([k, v]) => [k, v, 'LKR ' + n2(v)]), C.plum); }
  if (r.byCat.length) { heading('Expenses by category'); bars(r.byCat.map(([k, v]) => [k, v, 'LKR ' + n2(v)]), C.gold); }
  if (r.topClients.length) { heading('Top clients'); table([{ label: 'CLIENT', w: CW - 140 }, { label: 'INVOICED (LKR)', w: 140, align: 'right' }], r.topClients.map(([k, v]) => [custName(k), n2(v)])); }

  heading('Payments received');
  table([{ label: 'DATE', w: 62 }, { label: 'CLIENT', w: 130 }, { label: 'INVOICE', w: 84 }, { label: 'TYPE', w: 60 }, { label: 'METHOD', w: 78 }, { label: 'AMOUNT (LKR)', w: CW - 414, align: 'right', color: rr => rr[3] === 'Refund' ? C.neg : null }],
    r.pays.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(x => [L.fmtDate(x.date), custName(x.invoice.customerId), x.invoice.number || '', x.type || 'Payment', x.method || '', (x.type === 'Refund' ? '-' : '') + n2(x.amount)]),
    { totals: ['Total', null, null, null, null, n2(r.net)] });

  heading('Expenses');
  table([{ label: 'DATE', w: 62 }, { label: 'CATEGORY', w: 90 }, { label: 'DESCRIPTION', w: 170 }, { label: 'SUPPLIER', w: 92 }, { label: 'AMOUNT (LKR)', w: CW - 414, align: 'right' }],
    r.exps.map(x => [L.fmtDate(x.date), x.category || '', x.description || '', x.supplier || '', n2(x.amount)]), { totals: ['Total', null, null, null, n2(r.spent)] });

  heading('Balances to collect');
  table([{ label: 'INVOICE', w: 84 }, { label: 'CLIENT', w: 130 }, { label: 'BOOKING', w: 138 }, { label: 'DUE', w: 62 }, { label: 'BALANCE (LKR)', w: CW - 414, align: 'right', color: rr => rr[5] === 'Overdue' ? C.neg : null }],
    r.openInvs.slice().sort((a, b) => (invDue(a) || '').localeCompare(invDue(b) || '')).map(i => [i.number || '', custName(i.customerId), S.ev[i.eventId] ? evLabel(S.ev[i.eventId]) : '', L.fmtDate(invDue(i)), n2(L.totals(i).balance), invStatus(i)]),
    { totals: ['Total', null, null, null, n2(r.outstanding)] });

  need(40); y -= 26;
  text(S.settings.slogan || '', W / 2, y, { size: 9.5, font: F.serif, color: C.goldText, align: 'center' });
  return doc;
}

// ---------- export panel ----------
export function exportSheet(defaultPeriod) {
  const t = L.todayISO(), y = t.slice(0, 4);
  const lm = L.toISO(new Date(+y, +t.slice(5, 7) - 2, 1)).slice(0, 7);
  const years = [...new Set([y, ...S.events.map(e => (e.date || '').slice(0, 4)), ...L.allPayments(S.invoices).map(p => (p.date || '').slice(0, 4)), ...S.expenses.map(x => (x.date || '').slice(0, 4))].filter(Boolean))].sort().reverse();
  const opts = [[t.slice(0, 7), 'This month'], [lm, 'Last month'], ...years.map(yy => [yy, yy === y ? 'This year (' + yy + ')' : 'Year ' + yy]), ['', 'All time'], ['custom', 'Choose a month…']];
  let period = defaultPeriod ?? y, format = 'xlsx';
  sheet(`<h3>Export report</h3><p class="sub">Money received, expenses, profit, payments, invoices, bookings and balances.</p>
    <label class="field"><span>Period</span><select id="xp">${opts.map(([v, l]) => `<option value="${v}" ${v === period ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="field hidden" id="xmw"><span>Month</span><input type="month" id="xm" value="${t.slice(0, 7)}"></label>
    <div class="label" style="margin:10px 0 6px">Format</div>
    <div class="list">
      <label class="row"><input type="radio" name="fmt" value="xlsx" checked style="width:20px;min-height:20px;accent-color:var(--plum)"><span class="tile-ic pos">${icon('grid')}</span><div class="grow"><div class="t">Excel spreadsheet (.xlsx)</div><div class="s">Summary, Payments, Expenses, Invoices, Bookings, Balances — opens in Excel and Google Sheets</div></div></label>
      <label class="row"><input type="radio" name="fmt" value="pdf" style="width:20px;min-height:20px;accent-color:var(--plum)"><span class="tile-ic neg">${icon('invoice')}</span><div class="grow"><div class="t">PDF report</div><div class="s">Branded summary to print or share</div></div></label>
    </div>
    <div class="btns"><button class="btn secondary" data-close>Cancel</button><button class="btn" id="xgo">${icon('download')} Export</button></div>`, sh => {
    const sel = $('#xp', sh);
    sel.onchange = () => $('#xmw', sh).classList.toggle('hidden', sel.value !== 'custom');
    $$('[name=fmt]', sh).forEach(r0 => r0.onchange = () => { format = r0.value; });
    $('#xgo', sh).onclick = e => busy(e.currentTarget, async () => {
      period = sel.value === 'custom' ? $('#xm', sh).value : sel.value;
      const r = reportData(period);
      const base = `9Wings-report-${period || 'all-time'}`;
      let res;
      if (format === 'xlsx') res = await N.shareFile(buildWorkbook(r), base + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Report ' + r.label);
      else { const d = await buildReportPdf(r); res = await N.shareFile(await d.save(), base + '.pdf', 'application/pdf', 'Report ' + r.label); }
      closeSheet(true);
      toast(res === 'downloaded' ? 'Report downloaded' : 'Report ready');
    }, 'Preparing…');
  });
}
