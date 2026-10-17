// Invoice / quotation PDF in the 9Wings gold design (uses pdf-lib, works offline).
import { totals, fmtDate, num2 } from './logic.js';

const GOLD = [0.80, 0.62, 0.25], GOLD_L = [0.92, 0.80, 0.50], BLACK = [0.07, 0.07, 0.07], GREY = [0.35, 0.35, 0.35], LINE = [0.55, 0.55, 0.55];

let assetCache;
async function loadAssets() {
  if (assetCache) return assetCache;
  const get = u => fetch(u).then(r => r.arrayBuffer());
  assetCache = { logo: await get('img/logo.jpg'), floral: await get('img/floral.jpg') };
  return assetCache;
}

export async function buildInvoicePdf(inv, customer, ev, settings) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const c = a => rgb(a[0], a[1], a[2]);
  const doc = await PDFDocument.create();
  const isQuote = inv.docType === 'quotation';
  doc.setTitle(`${isQuote ? 'Quotation' : 'Invoice'} ${inv.number || ''}`);
  doc.setAuthor(settings.businessName);
  const page = doc.addPage([595.28, 841.89]);
  const W = 595.28, H = 841.89;
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const assets = await loadAssets();
  const logo = await doc.embedJpg(assets.logo);
  const floral = await doc.embedJpg(assets.floral);

  const text = (s, x, y, { size = 10, font = reg, color = BLACK, align = 'left', spacing = 0 } = {}) => {
    s = clean(s);
    let w = font.widthOfTextAtSize(s, size) + spacing * Math.max(s.length - 1, 0);
    if (align === 'right') x -= w; else if (align === 'center') x -= w / 2;
    if (!spacing) { page.drawText(s, { x, y, size, font, color: c(color) }); return; }
    for (const ch of s) { page.drawText(ch, { x, y, size, font, color: c(color) }); x += font.widthOfTextAtSize(ch, size) + spacing; }
  };
  const rect = (x, y, w, h, opts) => page.drawRectangle({ x, y, width: w, height: h, ...opts });
  const line = (x1, y1, x2, y2, t = 0.6, col = LINE) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: c(col) });
  const wrap = (s, font, size, maxW) => {
    const out = [];
    for (const para of clean(s).split('\n')) {
      let cur = '';
      for (const word of para.split(' ')) {
        const t = cur ? cur + ' ' + word : word;
        if (font.widthOfTextAtSize(t, size) > maxW && cur) { out.push(cur); cur = word; } else cur = t;
      }
      out.push(cur);
    }
    return out;
  };
  // Gold gradient bar (approximated with thin slices)
  const goldBar = (x, y, w, h, round = true) => {
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1), k = Math.sin(t * Math.PI);
      const col = [GOLD[0] + (GOLD_L[0] - GOLD[0]) * k, GOLD[1] + (GOLD_L[1] - GOLD[1]) * k, GOLD[2] + (GOLD_L[2] - GOLD[2]) * k];
      rect(x + (w / steps) * i, y, w / steps + 0.5, h, { color: c(col) });
    }
    if (round) {
      page.drawCircle({ x, y: y + h / 2, size: h / 2, color: c(GOLD) });
      page.drawCircle({ x: x + w, y: y + h / 2, size: h / 2, color: c(GOLD) });
    }
  };

  // Floral decoration (bottom right, behind everything)
  const fw = 98, fh = fw * floral.height / floral.width;
  page.drawImage(floral, { x: W - fw - 3, y: 0, width: fw, height: fh });

  // Top-left gold bars
  for (let i = 0; i < 3; i++) goldBar(0, H - 40 - i * 15, 50, 7);

  // Title
  const title = isQuote ? 'QUOTATION' : 'INVOICE';
  text(title, 48, H - 128, { size: 30, font: bold });
  rect(48, H - 140, bold.widthOfTextAtSize(title, 30) + 8, 2.5, { color: c(BLACK) });

  // Logo + business block (right)
  const lw = 92, lh = lw * logo.height / logo.width;
  page.drawImage(logo, { x: W - 50 - lw, y: H - 30 - lh, width: lw, height: lh });
  const rx = W - 48;
  text(settings.businessName, rx, H - 168, { size: 15, font: bold, align: 'right', spacing: 1.6 });
  text(settings.tagline, rx, H - 186, { size: 10.5, color: GREY, align: 'right', spacing: 1.4 });
  let py = H - 205;
  for (const p of settings.phones.split('\n').filter(Boolean)) { text(p, rx, py, { size: 10.5, color: GREY, align: 'right', spacing: 1.4 }); py -= 17; }

  // Customer block (left)
  const fields = [
    ['Name:', customer?.name || ''],
    ['Date:', fmtDate(inv.date)],
    ['Address:', (customer?.address || '').replace(/\n/g, ', ')],
    [isQuote ? 'Quotation No.:' : 'Invoice No.:', inv.number || ''],
  ];
  if (ev) fields.push(['Event:', [ev.type, ev.date ? fmtDate(ev.date) : '', ev.venue].filter(Boolean).join('  ·  ')]);
  let fy = H - 182;
  for (const [k, v] of fields) {
    text(k, 48, fy, { size: 10.5, color: GREY });
    let size = 10.5;
    const v2 = clean(v);
    while (size > 7.5 && reg.widthOfTextAtSize(v2, size) > 215) size -= 0.5;
    let vl = v2;
    if (reg.widthOfTextAtSize(vl, size) > 215) { while (vl.length > 1 && reg.widthOfTextAtSize(vl + '...', size) > 215) vl = vl.slice(0, -1); vl += '...'; }
    text(vl, 128, fy, { size });
    line(122, fy - 6, 345, fy - 6, 0.5, [0.88, 0.88, 0.88]);
    fy -= 21;
  }

  // Items table
  const tx = 48, tw = W - 96, colX = [tx, tx + 245, tx + 345, tx + 400, tx + tw];
  const items = (inv.items || []).filter(it => it.desc || it.price || it.qty);
  const tTop = Math.min(fy - 12, H - 300);
  const headH = 30;
  const minRows = 8;
  const rowsN = Math.max(items.length, minRows);
  // space needed below the table for totals, terms, payment method and footer
  const t = totals(inv);
  const rows = [['SUBTOTAL', t.subtotal]];
  if (t.discount > 0) rows.push(['DISCOUNT', -t.discount]);
  rows.push(['TOTAL', t.total, true]);
  if (!isQuote) { rows.push(['PAID', t.paid]); rows.push(['BALANCE DUE', t.balance, true]); }
  const termLines = settings.terms.split('\n').filter(Boolean).reduce((a, l) => a + wrap(l, reg, 9, 380).length, 0);
  const noteLines = inv.notes ? wrap('Note: ' + inv.notes, reg, 9, 400).length : 0;
  const payLines = settings.paymentMethod.split('\n').filter(Boolean).length;
  const bottomLimit = 62 + rows.length * 24 + 30 + 15 + termLines * 12 + (noteLines ? 4 + noteLines * 12 : 0) + 27 + payLines * 13 + 12;
  let rowH = Math.min(26, (tTop - headH - bottomLimit) / rowsN);
  rowH = Math.max(rowH, 15);
  const fs = rowH < 20 ? 8.5 : 9.5;
  const tBottom = tTop - headH - rowsN * rowH;

  rect(tx, tBottom, tw, tTop - tBottom, { borderColor: c(BLACK), borderWidth: 1.4 });
  const hy = tTop - 19;
  text('DESCRIPTION', tx + 10, hy, { size: 10.5, font: bold });
  text('UNIT PRICE', (colX[1] + colX[2]) / 2, hy, { size: 10.5, font: bold, align: 'center' });
  text('QTY', (colX[2] + colX[3]) / 2, hy, { size: 10.5, font: bold, align: 'center' });
  text('TOTAL', (colX[3] + colX[4]) / 2, hy, { size: 10.5, font: bold, align: 'center' });
  line(tx, tTop - headH, tx + tw, tTop - headH, 0.8, BLACK);
  for (let i = 1; i < 4; i++) line(colX[i], tTop, colX[i], tBottom, 0.6);
  for (let r = 0; r < rowsN; r++) {
    const y0 = tTop - headH - (r + 1) * rowH;
    if (r < rowsN - 1) line(tx, y0, tx + tw, y0, 0.5);
    const it = items[r];
    if (!it) continue;
    const ty = y0 + rowH / 2 - fs / 2 + 1;
    const dl = wrap(it.desc, reg, fs, colX[1] - colX[0] - 16);
    if (dl.length > 1 && rowH >= 22) {
      text(dl[0], tx + 10, ty + fs * 0.6, { size: fs });
      text(dl.slice(1).join(' '), tx + 10, ty - fs * 0.6, { size: fs });
    } else {
      const maxW = colX[1] - colX[0] - 16;
      let one = clean(it.desc), sz = fs;
      while (sz > 7 && reg.widthOfTextAtSize(one, sz) > maxW) sz -= 0.5;
      if (reg.widthOfTextAtSize(one, sz) > maxW) { while (one.length > 1 && reg.widthOfTextAtSize(one + '...', sz) > maxW) one = one.slice(0, -1); one += '...'; }
      text(one, tx + 10, ty, { size: sz });
    }
    const price = Number(it.price) || 0, qty = Number(it.qty) || 0;
    text(num2(price), (colX[1] + colX[2]) / 2, ty, { size: fs, align: 'center' });
    text(pad2(qty), (colX[2] + colX[3]) / 2, ty, { size: fs, align: 'center' });
    text(num2(price * qty), (colX[3] + colX[4]) / 2, ty, { size: fs, align: 'center' });
  }

  // Totals
  let ty = tBottom;
  const totH = 24;
  for (const [label, val, strong] of rows) {
    rect(tx, ty - totH, tw, totH, { borderColor: c(BLACK), borderWidth: 1.2 });
    text(label, tx + 10, ty - totH + 8, { size: strong ? 13 : 11, font: bold });
    rect(colX[3], ty - totH, colX[4] - colX[3], totH, { color: c(strong ? BLACK : [1, 1, 1]), borderColor: c(BLACK), borderWidth: 1.2 });
    text((val < 0 ? '- ' : '') + num2(Math.abs(val)), (colX[3] + colX[4]) / 2, ty - totH + 8, { size: 10.5, font: bold, color: strong ? [1, 1, 1] : BLACK, align: 'center' });
    ty -= totH;
  }

  // Terms & payment method
  let y = ty - 30;
  text('TERMS AND CONDITIONS', 48, y, { size: 11.5 }); y -= 15;
  for (const l of settings.terms.split('\n').filter(Boolean)) {
    for (const [i, wl] of wrap(l, reg, 9, 380).entries()) { if (i === 0) text('•', 54, y, { size: 9 }); text(wl, 66, y, { size: 9, color: GREY }); y -= 12; }
  }
  if (inv.notes) {
    y -= 4;
    for (const wl of wrap('Note: ' + inv.notes, reg, 9, 400)) { text(wl, 48, y, { size: 9, color: GREY }); y -= 12; }
  }
  y -= 12;
  text('PAYMENT METHOD', 48, y, { size: 11.5 }); y -= 15;
  for (const l of settings.paymentMethod.split('\n').filter(Boolean)) {
    const i = l.indexOf(':');
    text('•', 54, y, { size: 9 });
    if (i > 0) { text(l.slice(0, i + 1), 66, y, { size: 9, color: GREY }); text(l.slice(i + 1).trim(), 150, y, { size: 9, color: GREY }); }
    else text(l, 66, y, { size: 9, color: GREY });
    y -= 13;
  }

  // Footer banner
  goldBar(100, 26, W - 200, 20);
  text('THANK YOU FOR YOUR BUSINESS', W / 2, 32, { size: 11.5, font: bold, color: [0.15, 0.12, 0.05], align: 'center' });

  return doc;
}
// Built-in PDF fonts only cover Latin characters; drop anything else (e.g. emoji).
const clean = s => String(s ?? '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\t/g, ' ').replace(/[^\n\x20-\x7E\xA0-\xFF\u2022]/g, '');
const pad2 = n => (Number.isInteger(n) && n < 10 && n >= 0 ? '0' + n : String(n));

export function pdfFileName(inv, customer) {
  const who = (customer?.name || 'customer').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
  return `${inv.number || 'draft'}_${who}.pdf`.replace(/[^\w.-]/g, '_');
}
