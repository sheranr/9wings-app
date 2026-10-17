// Bridges to the phone: Android app (Capacitor) features with web fallbacks.
import { nextOccurrence, alertDays, addDays, parseISO, totals, occasionOf, ordinal, fmtNice, todayISO } from './logic.js';

const Cap = () => window.Capacitor;
export const isNative = () => !!(Cap() && Cap().isNativePlatform && Cap().isNativePlatform());
const plugin = name => (isNative() && Cap().Plugins ? Cap().Plugins[name] : null);

export function openExternal(url) {
  if (isNative()) {
    const Browser = plugin('AppLauncher');
    if (Browser && Browser.openUrl) { Browser.openUrl({ url }).catch(() => window.open(url, '_system')); return; }
    window.open(url, '_system');
  } else window.open(url, '_blank', 'noopener');
}

function b64FromBytes(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

// Share a file (PDF / backup) — opens the phone's share sheet (WhatsApp, Drive, etc.)
export async function shareFile(bytes, fileName, mime, title) {
  if (isNative()) {
    const Filesystem = plugin('Filesystem'), Share = plugin('Share');
    const res = await Filesystem.writeFile({ path: fileName, data: b64FromBytes(bytes), directory: 'CACHE' });
    await Share.share({ title, files: [res.uri], dialogTitle: title });
    return 'shared';
  }
  const file = new File([bytes], fileName, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  downloadFile(bytes, fileName, mime);
  return 'downloaded';
}

export async function saveFile(bytes, fileName, mime) {
  if (isNative()) {
    const Filesystem = plugin('Filesystem');
    await Filesystem.writeFile({ path: fileName, data: b64FromBytes(bytes), directory: 'DOCUMENTS', recursive: true });
    return 'Saved to Documents/' + fileName;
  }
  downloadFile(bytes, fileName, mime);
  return 'Downloaded ' + fileName;
}

function downloadFile(bytes, fileName, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---------- Notifications ----------
function hashId(str) { let h = 0; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000 || 1; }
function at(iso, hour) { const d = parseISO(iso); d.setHours(hour, 0, 0, 0); return d; }

// Builds the list of future reminders from the data.
export function plannedNotifications({ events, invoices, customers, settings }) {
  const now = new Date();
  const hour = Number(settings.notifyHour) || 9;
  const cust = Object.fromEntries(customers.map(c => [c.id, c]));
  const list = [];
  const today = todayISO();
  for (const ev of events) {
    if (ev.status === 'Cancelled') continue;
    const who = ev.names || cust[ev.customerId]?.name || 'Customer';
    if (ev.remindYearly) {
      // this year's and next year's occurrence, so nothing is missed between app opens
      let occ = nextOccurrence(ev, today);
      for (let k = 0; k < 2 && occ; k++) {
        for (const d of alertDays(settings)) {
          const when = at(addDays(occ.date, -d), hour);
          if (when > now) list.push({
            id: hashId(`y:${ev.id}:${occ.year}:${d}`), when,
            title: `${ev.type === 'Birthday' ? 'Birthday' : ordinal(occ.years) + ' ' + occasionOf(ev.type)} in ${d} days`,
            body: `${who} — ${fmtNice(occ.date)}. Tap to send the special offer.`,
            extra: { route: '#/home' }
          });
        }
        occ = nextOccurrence(ev, addDays(occ.date, 1));
      }
    }
    if (ev.date && ev.status !== 'Completed') {
      const when = at(addDays(ev.date, -1), hour);
      if (when > now) list.push({ id: hashId(`e:${ev.id}:${ev.date}`), when, title: `Tomorrow: ${ev.type}`, body: `${who}${ev.venue ? ' at ' + ev.venue : ''}`, extra: { route: '#/event/' + ev.id } });
    }
  }
  const evById = Object.fromEntries(events.map(e => [e.id, e]));
  for (const inv of invoices) {
    if (inv.docType !== 'invoice') continue;
    const ev = evById[inv.eventId];
    if (!ev || !ev.date || ev.status === 'Cancelled') continue;
    const bal = totals(inv).balance;
    if (bal <= 0.009) continue;
    const due = addDays(ev.date, -(Number(settings.paymentDueDays) || 10));
    for (const d of [2, 0]) {
      const when = at(addDays(due, -d), hour);
      if (when > now) list.push({ id: hashId(`p:${inv.id}:${due}:${d}`), when, title: d ? `Payment due in ${d} days` : 'Payment due today', body: `${cust[inv.customerId]?.name || ''} — balance Rs. ${bal.toLocaleString('en-US')} (${inv.number})`, extra: { route: '#/invoice/' + inv.id } });
    }
  }
  return list.sort((a, b) => a.when - b.when).slice(0, 60);
}

export async function ensureNotificationPermission() {
  const LN = plugin('LocalNotifications');
  if (!LN) return false;
  try {
    let p = await LN.checkPermissions();
    if (p.display !== 'granted') p = await LN.requestPermissions();
    return p.display === 'granted';
  } catch (e) { console.warn(e); return false; }
}

export async function rescheduleNotifications(data) {
  const LN = plugin('LocalNotifications');
  if (!LN) return 0;
  try {
    if (!(await ensureNotificationPermission())) return 0;
    try { await LN.createChannel({ id: 'alerts', name: 'Event alerts', importance: 4, visibility: 1 }); } catch (e) { /* older Android */ }
    const pending = await LN.getPending();
    if (pending.notifications?.length) await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    const list = plannedNotifications(data);
    if (list.length) await LN.schedule({
      notifications: list.map(n => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.when, allowWhileIdle: true }, channelId: 'alerts', extra: n.extra }))
    });
    return list.length;
  } catch (e) { console.warn('notification scheduling failed', e); return 0; }
}

export function onNotificationTap(handler) {
  const LN = plugin('LocalNotifications');
  if (LN) LN.addListener('localNotificationActionPerformed', a => handler(a.notification?.extra || {}));
}

// Web version: a summary notification when the app is opened (closed-app alerts need the Android app).
export async function webSummaryNotification(count) {
  if (isNative() || !count || !('Notification' in window)) return;
  const key = 'nw-notified-' + todayISO();
  try { if (localStorage.getItem(key)) return; } catch (e) { return; }
  if (Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts = { body: `${count} alert${count > 1 ? 's' : ''} need your attention.`, icon: 'img/icon-192.png' };
      if (reg) reg.showNotification('9Wings Event', opts); else new Notification('9Wings Event', opts);
      localStorage.setItem(key, '1');
    } catch (e) { /* ignore */ }
  }
}
