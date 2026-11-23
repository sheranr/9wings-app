// App shell: login, navigation, routing and live refresh.
import * as D from './data.js';
import * as N from './native.js';
import * as U from './updates.js';
import * as L from './logic.js';
import * as B from './backup.js';
import { S, session, snapshot, isOwner } from './state.js';
import { $, $$, go, icon, esc, toast, sheetOpen, closeSheet, initials } from './ui.js';
import { authView, noAccessView } from './views/auth.js';
import { homeView } from './views/home.js';
import { calendarView } from './views/calendar.js';
import { bookingsView, bookingForm, bookingDetail } from './views/bookings.js';
import { clientsView, clientForm, clientDetail } from './views/clients.js';
import { invoicesView, invoiceForm, invoiceDetail } from './views/invoices.js';
import { paymentsView, expensesView, expenseForm } from './views/money.js';
import { servicesView } from './views/services.js';
import { reportsView } from './views/reports.js';
import { binView } from './views/bin.js';
import { moreView, settingsView, teamView, dataView, updatesView, accountView, updatesUI } from './views/system.js';

const ID = '([^/]+)';
const routes = [
  [/^#\/home$/, homeView, 'home'],
  [/^#\/calendar(?:\/(\d{4}-\d{2}))?(?:\/(month|week|list))?$/, calendarView, 'calendar'],
  [/^#\/bookings$/, bookingsView, 'bookings'],
  [new RegExp(`^#/(?:booking|event)/new(?:/${ID})?$`), (cid) => bookingForm(null, cid), 'bookings', false],
  [new RegExp(`^#/(?:booking|event)/${ID}/edit$`), id => bookingForm(id), 'bookings', false],
  [new RegExp(`^#/(?:booking|event)/${ID}$`), bookingDetail, 'bookings'],
  [/^#\/(?:clients|customers)$/, clientsView, 'clients'],
  [/^#\/client\/new$/, () => clientForm(), 'clients', false],
  [new RegExp(`^#/(?:client|customer)/${ID}/edit$`), id => clientForm(id), 'clients', false],
  [new RegExp(`^#/(?:client|customer)/${ID}$`), clientDetail, 'clients'],
  [/^#\/invoices$/, invoicesView, 'invoices'],
  [new RegExp(`^#/invoice/new(?:/${ID})?$`), evId => invoiceForm(null, evId), 'invoices', false],
  [new RegExp(`^#/invoice/${ID}/edit$`), id => invoiceForm(id), 'invoices', false],
  [new RegExp(`^#/invoice/${ID}$`), invoiceDetail, 'invoices'],
  [/^#\/payments$/, paymentsView, 'payments'],
  [/^#\/expenses$/, expensesView, 'expenses'],
  [/^#\/expense\/new$/, () => expenseForm(), 'expenses', false],
  [new RegExp(`^#/expense/${ID}$`), id => expenseForm(id), 'expenses', false],
  [/^#\/(?:services|items)$/, servicesView, 'services'],
  [/^#\/reports$/, reportsView, 'reports'],
  [/^#\/more$/, moreView, 'more'],
  [/^#\/settings$/, settingsView, 'settings', false],
  [/^#\/team$/, teamView, 'team'],
  [/^#\/data$/, dataView, 'data'],
  [/^#\/bin$/, binView, 'bin'],
  [/^#\/updates$/, updatesView, 'updates'],
  [/^#\/account$/, accountView, 'account', false],
];
// Which bottom tab is highlighted for each section.
const TAB_OF = { home: 'home', calendar: 'calendar', bookings: 'calendar', clients: 'clients', invoices: 'invoices' };

const TABS = [['home', '#/home', 'home', 'Home'], ['calendar', '#/calendar', 'calendar', 'Calendar'], ['clients', '#/clients', 'users', 'Clients'], ['invoices', '#/invoices', 'invoice', 'Invoices'], ['more', '#/more', 'more', 'More']];
const SIDE = [
  [null, [['home', '#/home', 'dashboard', 'Dashboard'], ['calendar', '#/calendar', 'calendar', 'Calendar'], ['bookings', '#/bookings', 'clipboard', 'Bookings'], ['clients', '#/clients', 'users', 'Clients']]],
  ['Finance', [['invoices', '#/invoices', 'invoice', 'Invoices'], ['payments', '#/payments', 'wallet', 'Payments'], ['expenses', '#/expenses', 'receipt', 'Expenses'], ['reports', '#/reports', 'chart', 'Reports']]],
  ['Business', [['services', '#/services', 'flower', 'Services & packages'], ['team', '#/team', 'shield', 'Team', true], ['settings', '#/settings', 'settings', 'Settings', true], ['bin', '#/bin', 'trash', 'Recycle bin', true], ['updates', '#/updates', 'bell', 'Updates & messages']]],
];

function shell() {
  document.body.classList.remove('bare');
  if ($('.app')) return;
  document.body.innerHTML = `
  <div class="app">
    <aside class="side">
      <a class="logo" href="#/home"><img src="img/logo-full.webp" alt="9Wings Flora & Wedding"></a>
      <div class="slogan" id="slogan"></div>
      <a class="btn new" href="#/booking/new">${icon('plus')} New booking</a>
      <nav id="sidenav"></nav>
      <a class="me" href="#/account" id="me"></a>
    </aside>
    <div id="main"></div>
  </div>
  <nav class="tabbar" id="tabbar">${TABS.map(([k, h, ic, label]) => `<a href="${h}" data-tab="${k}">${icon(ic)}<span>${label}</span></a>`).join('')}</nav>
  <div id="modal"></div><div id="toast" role="status" aria-live="polite"></div>`;
}
function renderChrome(section) {
  const owner = isOwner();
  const badge = (U.state.unread || 0) + (U.state.updateAvailable ? 1 : 0);
  $('#slogan').textContent = S.settings.slogan || '';
  $('#sidenav').innerHTML = SIDE.map(([grp, items]) => (grp ? `<div class="grp">${grp}</div>` : '') + items.filter(i => !i[4] || owner).map(([k, h, ic, label]) =>
    `<a href="${h}" class="${section === k ? 'active' : ''}">${icon(ic)}<span>${label}</span>${k === 'updates' && badge ? `<span class="badge-n">${badge}</span>` : ''}</a>`).join('')).join('');
  const me = session.me || {};
  $('#me').innerHTML = `<div class="avatar">${initials(me.name || 'Owner')}</div><div class="grow"><b class="ellipsis">${esc(me.name || 'Owner')}</b><span>${me.role === 'owner' ? 'Owner' : 'Staff'}${D.mode === 'device' ? ' · this device' : ''}</span></div>`;
  const tab = TAB_OF[section] || 'more';
  $$('#tabbar a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === tab);
    const old = $('.badge-n', a); if (old) old.remove();
    if (a.dataset.tab === 'more' && badge) a.insertAdjacentHTML('beforeend', `<span class="badge-n">${badge}</span>`);
  });
}

let current = { hash: '', live: true };
export async function route() {
  if (!session.me) return;
  const h = location.hash || '#/home';
  if (sheetOpen()) closeSheet(true);
  snapshot();
  for (const [re, fn, section, live = true] of routes) {
    const m = h.match(re);
    if (!m) continue;
    shell(); renderChrome(section);
    current = { hash: h, live, section };
    window.scrollTo(0, 0);
    try { await fn(...m.slice(1).map(x => x && decodeURIComponent(x))); }
    catch (e) { console.error(e); $('#main').innerHTML = `<div class="page"><div class="empty"><h3>Something went wrong</h3><p>${esc(e.message)}</p><a class="btn" href="#/home">Go home</a></div></div>`; }
    bindBack();
    if (U.state.forced && U.state.latest) updatesUI.showUpdate(U.state.latest, true);
    return;
  }
  go('#/home');
}
function bindBack() { $$('[data-back]').forEach(b => b.onclick = () => (history.length > 1 ? history.back() : go('#/home'))); }

// Re-draw list and detail screens when data changes (including changes made by other staff),
// but never while someone is typing in a form or a sheet is open.
let pending = false;
function liveRefresh() {
  if (!session.me || !$('#main')) return;
  if (!current.live || sheetOpen()) { pending = true; return; }
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { pending = true; return; }
  pending = false;
  const y = window.scrollY;
  route().then(() => window.scrollTo(0, y));
}
document.addEventListener('focusout', () => setTimeout(() => { if (pending && !sheetOpen()) liveRefresh(); }, 300));
export const refreshChrome = () => { if (session.me && $('#sidenav')) renderChrome(current.section); };

// Phone reminders are rebuilt whenever the data changes.
let notifTimer;
function rescheduleSoon() {
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => { if (session.me) N.rescheduleNotifications(snapshot()).catch(() => {}); }, 1500);
}

// ---------- startup & login ----------
function boot(msg = '') {
  document.body.classList.add('bare');
  document.body.innerHTML = `<div class="boot"><img src="img/logo-full.webp" alt="9Wings Flora & Wedding"><div class="spin"></div>${msg ? `<p class="muted">${esc(msg)}</p>` : ''}</div><div id="modal"></div><div id="toast"></div>`;
}

let opened = '';
// Owner device, once per sign-in: empty old bin items, freeze details on invoices issued before this feature, weekly backup.
async function ownerHousekeeping() {
  try {
    D.purgeBin();
    const s = D.getSettings();
    for (const inv of D.allRaw('invoices')) if (!inv.issuer) D.put('invoices', L.stampIssued(inv, s, D.getAny('customers', inv.customerId)), { keepStamp: true });
    await B.autoBackup();
  } catch (e) { console.warn('housekeeping', e); }
}
async function signedIn(user) {
  const A = D.getAdapter();
  let me = null;
  try { me = await A.member(user.uid); try { localStorage.setItem('nw-me', JSON.stringify({ uid: user.uid, me })); } catch (x) { /* ignore */ } }
  catch (e) { // offline and not cached: use the last known membership on this device
    try { const c = JSON.parse(localStorage.getItem('nw-me') || 'null'); if (c && c.uid === user.uid) me = c.me; } catch (x) { /* ignore */ }
  }
  if (!me && A.ownerSetup) { try { await A.ownerSetup; me = await A.member(user.uid); } catch (e) { /* shown on the setup form */ } }
  if (!me || me.active === false) { session.me = null; opened = ''; return noAccessView(user, me); }
  session.user = user; session.me = me;
  D.setActor({ uid: user.uid, name: me.name || user.email });
  if (opened !== user.uid) {
    boot('Loading your business…');
    await D.openBusiness({ owner: me.role === 'owner' });
    opened = user.uid;
    if (me.role === 'owner') ownerHousekeeping();
  }
  snapshot();
  if (!location.hash || location.hash === '#/' || location.hash === '#/login') history.replaceState(null, '', '#/home');
  await route();
  rescheduleSoon();
  if (!watching) { watching = true; U.watch(updatesUI); }
}
let watching = false;

// Content Security Policy: only this app's own scripts may run, and it only talks to Firebase and GitHub (updates).
// Added at start-up (after the Android bridge has loaded) so it never blocks the phone features.
function lockDown() {
  if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) return;
  const m = document.createElement('meta');
  m.httpEquiv = 'Content-Security-Policy';
  m.content = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://*.googleapis.com https://api.github.com https://raw.githubusercontent.com",
    "frame-src https://*.firebaseapp.com",
    "object-src blob:",
    "base-uri 'self'",
    "form-action 'none'"
  ].join('; ');
  document.head.prepend(m);
}

async function start() {
  lockDown();
  boot();
  await D.start();
  D.onSaveError(msg => toast(msg, 5000));
  D.onChange(() => { liveRefresh(); rescheduleSoon(); });
  window.addEventListener('hashchange', route);
  N.onNotificationTap(extra => { if (extra.route) go(extra.route); });
  D.getAdapter().onAuth(user => {
    if (user) signedIn(user).catch(e => { console.error(e); toast(e.message, 6000); });
    else { session.me = null; session.user = null; opened = ''; D.closeBusiness(); authView(); }
  });
  if ('serviceWorker' in navigator && !N.isNative() && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
}
start().catch(e => { console.error(e); document.body.innerHTML = `<div class="boot"><p>Something went wrong: ${esc(e.message)}</p></div>`; });
