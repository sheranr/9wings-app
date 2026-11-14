// App updates and messages from the management page.
// - Update check: compares the installed Android version with the latest GitHub release.
// - Messages: reads notices/notices.json from the repository (written by the management page).
import { isNative, openExternal } from './native.js';

export const REPO = 'sheranr/9wings-app';
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const NOTICES_URL = `https://raw.githubusercontent.com/${REPO}/main/notices/notices.json`;
export const DOWNLOAD_PAGE = 'https://sheranr.github.io/9wings-app/download/';
// System notifications for updates/messages use ids above this, so event reminders never cancel them.
export const SYS_ID_BASE = 2000000001;

const plugin = name => (isNative() && window.Capacitor?.Plugins ? window.Capacitor.Plugins[name] : null);

const store = {
  get(k, d) { try { const v = localStorage.getItem('nw-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('nw-' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};

export function cmpVersion(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export async function installedVersion() {
  const App = plugin('App');
  if (App?.getInfo) { try { return (await App.getInfo()).version; } catch (e) { /* ignore */ } }
  return null; // web app: always up to date (loads the newest files)
}

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store', headers: url.includes('api.github.com') ? { Accept: 'application/vnd.github+json' } : {} });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// Latest release: { version, notes, url, date, size }
export async function latestRelease() {
  const rel = await getJSON(RELEASE_API);
  const apk = (rel.assets || []).find(a => /\.apk$/i.test(a.name));
  return {
    version: String(rel.tag_name || '').replace(/^v/i, ''),
    notes: String(rel.body || '').replace(/\*\*/g, '').trim(),
    url: apk ? apk.browser_download_url : `https://github.com/${REPO}/releases/latest/download/9Wings-Event.apk`,
    date: rel.published_at,
    size: apk ? apk.size : 0
  };
}

// Messages file: { minVersion, notices: [{ id, title, message, type, created, expires, link, linkLabel, target, active }] }
export async function fetchNotices() {
  const data = await getJSON(NOTICES_URL + '?t=' + Date.now());
  return { minVersion: data.minVersion || '', notices: Array.isArray(data.notices) ? data.notices : [] };
}

function activeNotices(list, version) {
  const now = new Date().toISOString();
  const platform = isNative() ? 'android' : 'web';
  return list.filter(n => n && n.active !== false
    && (!n.expires || n.expires >= now.slice(0, 10))
    && (!n.target || n.target === 'all' || n.target === platform)
    && (!n.maxVersion || !version || cmpVersion(version, n.maxVersion) <= 0))
    .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
}

export function seenIds() { return store.get('seen-notices', []); }
export function markSeen(id) { const s = seenIds(); if (!s.includes(id)) { s.push(id); store.set('seen-notices', s.slice(-200)); } }

async function notify(id, title, body, extra) {
  const LN = plugin('LocalNotifications');
  if (!LN) {
    if (!isNative() && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try { new Notification(title, { body, icon: 'img/icon-192.png' }); } catch (e) { /* ignore */ }
    }
    return;
  }
  try {
    const p = await LN.checkPermissions();
    if (p.display !== 'granted') return;
    try { await LN.createChannel({ id: 'updates', name: 'App updates & messages', importance: 4, visibility: 1 }); } catch (e) { /* older Android */ }
    await LN.schedule({ notifications: [{ id, title, body, channelId: 'updates', schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true }, extra }] });
  } catch (e) { console.warn('notify failed', e); }
}
const idFor = s => SYS_ID_BASE + (Math.abs([...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 100000000);

export function startDownload(url) { openExternal(url || DOWNLOAD_PAGE); }

// Runs the checks. ui = { showUpdate(info, forced), showNotice(notice), onState(state) }
let running = false, lastCheck = 0;
export const state = { current: null, latest: null, updateAvailable: false, forced: false, notices: [], pending: [], unread: 0, error: '' };

export async function check(ui, { force = false } = {}) {
  if (running) return state;
  if (!force && Date.now() - lastCheck < 10 * 60 * 1000) return state;
  if (!navigator.onLine) return state;
  running = true; lastCheck = Date.now();
  try {
    state.current = await installedVersion();
    const [rel, nt] = await Promise.allSettled([state.current ? latestRelease() : Promise.resolve(null), fetchNotices()]);
    state.error = '';

    // --- update
    if (rel.status === 'fulfilled' && rel.value && state.current) {
      state.latest = rel.value;
      state.updateAvailable = cmpVersion(rel.value.version, state.current) > 0;
    }
    const minV = nt.status === 'fulfilled' ? nt.value.minVersion : '';
    state.forced = !!(state.current && minV && cmpVersion(state.current, minV) < 0);
    if (state.forced && !state.latest) state.latest = { version: minV, notes: '', url: DOWNLOAD_PAGE };
    if (state.forced) state.updateAvailable = true;

    if (state.updateAvailable && state.latest) {
      const key = 'notified-update-' + state.latest.version;
      if (!store.get(key, false)) {
        store.set(key, true);
        notify(idFor('u' + state.latest.version), 'Update available — 9Wings Event ' + state.latest.version, 'Tap to update to the newest version.', { route: '#/updates' });
      }
      if (state.forced || store.get('dismissed-update', '') !== state.latest.version) ui?.showUpdate?.(state.latest, state.forced);
    }

    // --- messages
    if (nt.status === 'fulfilled') {
      state.notices = activeNotices(nt.value.notices, state.current);
      const seen = seenIds();
      const fresh = state.notices.filter(n => !seen.includes(n.id));
      state.unread = fresh.length;
      state.pending = fresh;
      const notified = store.get('notified-notices', []);
      for (const n of fresh) {
        if (!notified.includes(n.id)) {
          notified.push(n.id);
          notify(idFor('n' + n.id), n.title || 'Message from 9Wings', n.message || '', { route: '#/updates' });
        }
      }
      store.set('notified-notices', notified.slice(-200));
      if (fresh.length && !state.forced) ui?.showNotice?.(fresh[fresh.length - 1]); // oldest unread first
    } else state.error = 'Could not load messages';
  } catch (e) {
    state.error = e.message;
  } finally {
    running = false;
    ui?.onState?.(state);
  }
  return state;
}

export function dismissUpdate(version) { store.set('dismissed-update', version); }

// Check again when the app comes back to the screen, and every 6 hours while open.
export function watch(ui) {
  const App = plugin('App');
  if (App?.addListener) App.addListener('resume', () => check(ui));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(ui); });
  window.addEventListener('online', () => check(ui));
  setInterval(() => check(ui), 6 * 60 * 60 * 1000);
  return check(ui, { force: true });
}
