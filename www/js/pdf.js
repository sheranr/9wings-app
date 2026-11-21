// Invoice / quotation PDF — 9Wings premium design (pdf-lib, works offline).
import { totals, fmtDate, num2, fmtTime } from './logic.js';

const C = {
  plum: [0x32, 0x13, 0x42], plum2: [0x6E, 0x22, 0x5E], purple: [0x63, 0x47, 0x91], gold: [0xC5, 0xA4, 0x6D], goldText: [0xB0, 0x8D, 0x4F],
  ivory: [0xFA, 0xF7, 0xF1], beige: [0xF3, 0xEB, 0xDD], line: [0xE6, 0xDF, 0xD8], text: [0x30, 0x2A, 0x32], grey: [0x7E, 0x78, 0x80], white: [0xFF, 0xFF, 0xFF]
};
const MM = 72 / 25.4;

let assets;
async function loadAssets() {
  if (!assets) assets = { logo: await fetch('img/logo-pdf.png').then(r => r.arrayBuffer()) };
  return assets;
}
// The built-in PDF fonts cover Latin characters only; anything else (e.g. emoji, Sinhala) is dropped.
const clean = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/\t/g, ' ').replace(/[^\n\x20-\x7E\xA0-\xFF\u2022]/g, '');

export async function buildInvoicePdf(inv, customer, ev, settings, { due } = {}) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const col = a => rgb(a[0] / 255, a[1] / 255, a[2] / 255);
  const quote = inv.docType === 'quotation';
  const doc = await PDFDocument.create();
  doc.setTitle(`${quote ? 'Quotation' : 'Invoice'} ${inv.number || ''}`);
  doc.setAuthor(clean(settings.businessName));
  doc.setCreator('9Wings app');
  const F = {
    reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRoman), serifB: await doc.embedFont(StandardFonts.TimesRomanBold)
  };
  const logo = await doc.embedPng((await loadAssets()).logo);
  const W = 595.28, H = 841.89, X0 = 48, X1 = W - 48, CW = X1 - X0;
  const BOTTOM = 70;
  let page, y;

  const text = (s, x, yy, { size = 9, font = F.reg, color = C.text, align = 'left', spacing = 0 } = {}) => {
    s = clean(s);
    const w = font.widthOfTextAtSize(s, size) + spacing * Math.max(0, s.length - 1);
    if (align === 'right') x -= w; else if (align === 'center') x -= w / 2;
    page.drawText(s, { x, y: yy, size, font, color: col(color), characterSpacing: spacing || undefined });
    return w;
  };
  const rect = (x, yy, w, h, fill, border) => page.drawRectangle({ x, y: yy, width: w, height: h, color: fill ? col(fill) : undefined, borderColor: border ? col(border) : undefined, borderWidth: border ? 0.6 : 0 });
  const hline = (x1, x2, yy, color = C.line, t = 0.6) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: t, color: col(color) });
  const wrap = (s, font, size, maxW) => {
    const out = [];
    for (const para of clean(s).split('\n')) {
      let cur = '';
      for (const word of para.split(' ')) {
        const tryS = cur ? cur + ' ' + word : word;
        if (font.widthOfTextAtSize(tryS, size) > maxW && cur) { out.push(cur); cur = word; } else cur = tryS;
      }
      out.push(cur);
    }
    return out;
  };
  const fit = (s, font, size, maxW) => { s = clean(s); if (font.widthOfTextAtSize(s, size) <= maxW) return s; while (s.length > 1 && font.widthOfTextAtSize(s + '...', size) > maxW) s = s.slice(0, -1); return s + '...'; };

  const docLabel = quote ? 'QUOTATION' : 'INVOICE';
  const footer = () => {
    text(clean(settings.businessName).toUpperCase(), X0, 30, { size: 6.5, color: C.grey, spacing: 0.4 });
    text(`${docLabel}  ·  ${inv.number || ''}`, X1, 30, { size: 6.5, color: C.grey, align: 'right', spacing: 0.4 });
  };
  const frame = () => {
    page = doc.addPage([W, H]);
    // thin champagne frame with a plum band on top
    page.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: col(C.gold), borderWidth: 0.8 });
    rect(20, H - 25, W - 40, 5, C.plum);
    footer();
  };

  // ---------- header ----------
  frame();
  const lw = 205, lh = lw * logo.height / logo.width;
  page.drawImage(logo, { x: X0 - 6, y: H - 44 - lh, width: lw, height: lh });
  text(docLabel, X1, H - 82, { size: quote ? 30 : 34, font: F.serifB, color: C.plum, align: 'right' });
  const RX = 281;
  text(`${clean(settings.businessName).toUpperCase()}`, RX, H - 98, { size: 7.5, font: F.bold, color: C.goldText, spacing: 0.5 });
  const phones = clean(settings.phones).split('\n').filter(Boolean).join('   |   ');
  if (phones) text(phones, RX, H - 113, { size: 8.5, font: F.bold, color: C.text });
  let hy = H - 126;
  if (settings.email) { text(settings.email, RX, hy, { size: 7.5, color: C.grey }); hy -= 11; }
  if (settings.tagline && !settings.email) { text(settings.tagline, RX, hy, { size: 7, color: C.grey }); }
  hline(X0 + 6, X1 - 6, H - 138, C.gold, 0.8);

  // ---------- bill to / details ----------
  y = H - 152;
  const billLines = [customer?.name || '', ...(customer?.address ? wrap(customer.address.replace(/\n/g, ', '), F.reg, 8.5, 220).slice(0, 2) : ['Address: —']), customer?.phone ? 'Phone: ' + customer.phone : ''].filter(Boolean);
  const details = [[quote ? 'Quotation No.' : 'Invoice No.', inv.number || ''], ['Date', fmtDate(inv.date)]];
  if (!quote && due) details.push(['Due date', fmtDate(due)]);
  const boxH = 28 + Math.max(billLines.length, details.length) * 12 + 6;
  const mid = 297;
  rect(X0, y - boxH, CW, boxH, C.ivory, C.line);
  page.drawLine({ start: { x: mid, y }, end: { x: mid, y: y - boxH }, thickness: 0.6, color: col(C.line) });
  hline(X0, X1, y - 22);
  text('BILL TO', X0 + 12, y - 14, { size: 7.5, font: F.bold, color: C.plum2, spacing: 0.4 });
  text(quote ? 'QUOTATION DETAILS' : 'INVOICE DETAILS', mid + 12, y - 14, { size: 7.5, font: F.bold, color: C.plum2, spacing: 0.4 });
  billLines.forEach((l, i) => text(fit(l, F.reg, 8.5, 220), X0 + 12, y - 36 - i * 12, { size: 8.5 }));
  details.forEach(([k, v], i) => { text(k, mid + 12, y - 36 - i * 12, { size: 8.5, color: C.text }); text(v, mid + 80, y - 36 - i * 12, { size: 8.5 }); });
  y -= boxH + 12;

  // ---------- event strip ----------
  if (ev) {
    rect(X0, y - 28, CW, 28, C.beige);
    text('EVENT', X0 + 12, y - 17, { size: 7.5, font: F.bold, color: C.plum2, spacing: 0.4 });
    const parts = [ev.type + (ev.names ? ' - ' + ev.names : ''), fmtDate(ev.date) + (ev.time ? ' ' + fmtTime(ev.time) : ''), ev.venue].filter(Boolean).join('   ·   ');
    text(fit(parts, F.bold, 8.5, CW - 96), X0 + 82, y - 17, { size: 8.5, font: F.bold });
    y -= 28 + 14;
  } else y -= 4;

  // ---------- items table ----------
  const cols = { d: X0 + 10, p: 315, q: 403, t: 451 };
  const head = () => {
    rect(X0, y - 30, CW, 30, C.plum);
    hline(X0, X1, y - 30, C.gold, 1);
    text('DESCRIPTION', cols.d, y - 18, { size: 7, font: F.bold, color: C.white, spacing: 0.3 });
    text('UNIT PRICE', cols.p, y - 14, { size: 7, font: F.bold, color: C.white, spacing: 0.3 });
    text('(LKR)', cols.p, y - 23, { size: 7, font: F.bold, color: C.white, spacing: 0.3 });
    text('QTY', cols.q, y - 18, { size: 7, font: F.bold, color: C.white, spacing: 0.3 });
    text('TOTAL (LKR)', cols.t, y - 18, { size: 7, font: F.bold, color: C.white, spacing: 0.3 });
    y -= 30;
  };
  head();
  const items = (inv.items || []).filter(it => it.desc || Number(it.price));
  items.forEach((it, i) => {
    const lines = wrap(it.desc, F.reg, 8, cols.p - cols.d - 14).slice(0, 3);
    const rh = Math.max(32, 14 + lines.length * 10.5);
    if (y - rh < BOTTOM) { frame(); y = H - 60; head(); }
    rect(X0, y - rh, CW, rh, i % 2 ? C.ivory : C.white, C.line);
    const mid0 = y - rh / 2 - 3 + (lines.length - 1) * 5.25;
    lines.forEach((l, k) => text(l, cols.d, mid0 - k * 10.5, { size: 8 }));
    const price = Number(it.price) || 0, qty = Number(it.qty) || 0;
    const ty = y - rh / 2 - 3;
    text(num2(price), cols.p, ty, { size: 8 });
    text(Number.isInteger(qty) && qty < 10 ? '0' + qty : String(qty), cols.q, ty, { size: 8 });
    text(num2(price * qty), cols.t, ty, { size: 8 });
    y -= rh;
  });

  // ---------- totals ----------
  const t = totals(inv);
  const rows = [['SUBTOTAL', 'LKR ' + num2(t.subtotal)]];
  if (t.discount > 0) rows.push(['DISCOUNT', '-  LKR ' + num2(t.discount)]);
  rows.push(['TOTAL', 'LKR ' + num2(t.total), 'total']);
  if (!quote) rows.push(['PAID', 'LKR ' + num2(t.paid)]);
  const totH = rows.length * 23 + (quote ? 0 : 36) + 20;
  if (y - totH < BOTTOM) { frame(); y = H - 60; }
  y -= 20;
  const TX = 283, TW = X1 - TX;
  rows.forEach(([k, v, kind]) => {
    rect(TX, y - 23, TW, 23, C.ivory);
    if (kind === 'total') hline(TX, X1, y, C.gold, 0.9);
    text(k, TX + 10, y - 15, { size: 8, font: kind === 'total' ? F.bold : F.reg, color: kind === 'total' ? C.plum : C.text, spacing: 0.2 });
    text(v, X1 - 10, y - 15.5, { size: 9.5, font: F.bold, color: C.plum, align: 'right' });
    hline(TX, X1, y - 23, [0xF0, 0xEA, 0xE3], 0.5);
    y -= 23;
  });
  if (!quote) {
    rect(TX, y - 36, TW, 36, C.plum2);
    text('BALANCE DUE', TX + 10, y - 22, { size: 9, font: F.bold, color: C.white, spacing: 0.3 });
    text('LKR ' + num2(t.balance), X1 - 10, y - 23, { size: 12.5, font: F.bold, color: C.white, align: 'right' });
    y -= 36;
  }

  // ---------- terms & payment details ----------
  const terms = clean(settings.terms).split('\n').filter(Boolean).flatMap(l => wrap('• ' + l, F.reg, 7, 228));
  const payLines = clean(settings.paymentMethod).split('\n').filter(Boolean);
  const noteLines = inv.notes ? wrap('Note: ' + inv.notes, F.reg, 7.5, CW - 24) : [];
  const boxH2 = 26 + Math.max(terms.length, payLines.length) * 9.5 + 8;
  if (y - 26 - boxH2 - noteLines.length * 10 - 40 < BOTTOM) { frame(); y = H - 60; }
  y -= 22;
  if (noteLines.length) {
    noteLines.forEach((l, i) => text(l, X0, y - i * 10, { size: 7.5, color: C.text }));
    y -= noteLines.length * 10 + 10;
  }
  rect(X0, y - boxH2, CW, boxH2, C.ivory, C.line);
  page.drawLine({ start: { x: mid, y }, end: { x: mid, y: y - boxH2 }, thickness: 0.6, color: col(C.line) });
  text('TERMS & CONDITIONS', X0 + 12, y - 14, { size: 7.5, font: F.bold, color: C.plum2, spacing: 0.3 });
  text('PAYMENT DETAILS', mid + 12, y - 14, { size: 7.5, font: F.bold, color: C.plum2, spacing: 0.3 });
  terms.forEach((l, i) => text(l, X0 + 12, y - 26 - i * 9.5, { size: 7, color: C.grey }));
  payLines.forEach((l, i) => {
    const k = l.indexOf(':');
    if (k > 0) { text(l.slice(0, k).replace(/^Account /, 'Account '), mid + 12, y - 26 - i * 9.5, { size: 7, color: C.grey }); text(fit(l.slice(k + 1).trim(), F.reg, 7, X1 - mid - 92), mid + 78, y - 26 - i * 9.5, { size: 7, color: C.grey }); }
    else text(l, mid + 12, y - 26 - i * 9.5, { size: 7, color: C.grey });
  });
  y -= boxH2 + 24;

  // ---------- thank you ----------
  const thanks = clean(settings.invoiceThanks || 'Thank you for choosing 9Wings.');
  wrap(thanks, F.serif, 11, CW).forEach((l, i) => text(l, W / 2, y - i * 14, { size: 11, font: F.serif, color: C.plum2, align: 'center' }));
  if (settings.slogan) text(settings.slogan, W / 2, y - wrap(thanks, F.serif, 11, CW).length * 14 - 4, { size: 8.5, font: F.serif, color: C.goldText, align: 'center' });

  return doc;
}

export function pdfFileName(inv, customer) {
  const who = (customer?.name || 'client').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
  return `${inv.number || 'draft'}_${who}.pdf`.replace(/[^\w.-]/g, '_');
}
