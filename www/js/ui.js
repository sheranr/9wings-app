// Shared UI building blocks.
import { icon } from './icons.js';
import { esc, MONTHS, parseISO } from './logic.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const go = hash => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
export const formData = form => Object.fromEntries(new FormData(form).entries());
export { icon, esc };

export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

// Bottom sheet on phones, centred dialog on larger screens.
let onCloseFn = null;
export function sheet(html, onMount, { dismissable = true, onClose } = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  m.classList.add('open');
  m.dataset.locked = dismissable ? '' : '1';
  onCloseFn = onClose || null;
  m.onclick = e => { if (e.target === m && dismissable) closeSheet(); };
  const sh = $('.sheet', m);
  $$('[data-close]', sh).forEach(b => b.onclick = () => closeSheet());
  onMount && onMount(sh);
  const first = $('input:not([type=hidden]), textarea, select', sh);
  if (first && window.innerWidth >= 640) setTimeout(() => first.focus(), 60);
  return sh;
}
export function closeSheet(force = false) {
  const m = $('#modal');
  if (m.dataset.locked && !force) return;
  m.classList.remove('open'); m.innerHTML = ''; m.dataset.locked = '';
  const f = onCloseFn; onCloseFn = null; f && f();
}
export const sheetOpen = () => $('#modal').classList.contains('open');
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });

export function confirmBox(msg, { ok = 'Delete', danger = true, title = 'Are you sure?' } = {}) {
  return new Promise(res => {
    let done = false;
    sheet(`<h3>${esc(title)}</h3><p class="sub">${esc(msg)}</p>
      <div class="btns"><button class="btn secondary" data-no>Cancel</button><button class="btn ${danger ? 'danger' : ''}" data-yes>${esc(ok)}</button></div>`, sh => {
      $('[data-no]', sh).onclick = () => { done = true; closeSheet(); res(false); };
      $('[data-yes]', sh).onclick = () => { done = true; closeSheet(); res(true); };
    }, { onClose: () => { if (!done) res(false); } });
  });
}

export const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const badge = (label, cls) => `<span class="badge b-${cls || slug(label)}">${esc(label)}</span>`;

export function empty(ic, title, text = '', action = '', compact = false) {
  return `<div class="empty ${compact ? 'compact' : ''}"><div class="tile-ic">${icon(ic)}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}
export const eyebrow = (label, extra = '') => `<div class="eyebrow">${esc(label)}${extra}</div>`;

export function datebox(iso, soft = false) {
  const d = parseISO(iso);
  return `<div class="datebox ${soft ? 'soft' : ''}"><b>${d ? d.getDate() : '–'}</b><span>${d ? MONTHS[d.getMonth()] : ''}</span></div>`;
}
export const initials = name => esc(String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?');

// Top bar: back button or brand, title, actions.
export function topbar(title, { back = false, actions = '', brand = false } = {}) {
  return `<header class="topbar"><div class="in">
    ${back ? `<button class="icon-btn" data-back aria-label="Back">${icon('back', 'lg')}</button>` : ''}
    ${brand ? `<a class="brand" href="#/home" aria-label="Home"><img src="img/logo-header.webp" alt="9Wings Flora & Wedding"></a><span class="spacer-d"></span>` : `<h1>${esc(title)}</h1>`}
    ${actions}
  </div></header>`;
}

// Keep a busy state on a button while an async action runs.
export async function busy(btn, fn, label = 'Please wait…') {
  const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = label;
  try { return await fn(); } catch (e) { console.error(e); toast(friendlyError(e), 5000); } finally { btn.disabled = false; btn.innerHTML = html; }
}
export function friendlyError(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Email or password is incorrect.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Please wait a few minutes and try again.';
  if (c.includes('email-already-in-use')) return 'An account with this email already exists.';
  if (c.includes('weak-password')) return 'Use a password with at least 6 characters.';
  if (c.includes('invalid-email')) return 'Please enter a valid email address.';
  if (c.includes('network-request-failed')) return 'No internet connection. Please try again when online.';
  if (c.includes('permission-denied')) return 'You don\'t have permission to do that.';
  if (c.includes('unavailable') || c.includes('deadline-exceeded')) return 'Can\'t reach the server right now. Please try again in a moment.';
  if (c.includes('requires-recent-login')) return 'For your security, please sign out and sign in again, then retry.';
  if (c.includes('user-disabled')) return 'This login has been turned off.';
  console.error(e);
  // Our own plain-language messages are fine to show; technical ones are not.
  const m = String(e?.message || '');
  return m && !/firebase|firestore|auth\/|http|error \(|undefined|null|exception|[{}<>]/i.test(m) && m.length < 140 ? m : 'Something went wrong. Please try again.';
}

// Highlights the sticky top bar once the page scrolls.
window.addEventListener('scroll', () => { const t = $('.topbar'); if (t) t.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });
