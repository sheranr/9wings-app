// More menu, settings, team, account, data & backup, updates & messages.
import * as D from '../data.js';
import * as L from '../logic.js';
import * as N from '../native.js';
import * as U from '../updates.js';
import * as B from '../backup.js';
import { S, session, isOwner } from '../state.js';
import { $, $$, go, icon, esc, toast, sheet, closeSheet, badge, eyebrow, topbar, confirmBox, busy, formData, initials } from '../ui.js';

const menuRow = (href, ic, title, sub, extra = '') => `<a class="row" href="${href}"><span class="tile-ic">${icon(ic)}</span><div class="grow"><div class="t">${title}${extra}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>${icon('right', 'chev')}</a>`;

export async function moreView() {
  const owner = isOwner();
  const upd = (U.state.unread || 0) + (U.state.updateAvailable ? 1 : 0);
  $('#main').innerHTML = `${topbar('More')}
  <div class="page">
    <div class="detail-head" style="display:flex;gap:14px;align-items:center"><div class="avatar lg">${initials(session.me?.name || 'Owner')}</div>
      <div class="grow"><h2 style="margin:0;font-size:23px">${esc(session.me?.name || 'Owner')}</h2><div class="meta"><span>${badge(owner ? 'Owner' : 'Staff', owner ? 'owner' : 'staff')}</span><span class="muted">${esc(session.user?.email || (D.mode === 'device' ? 'This device' : ''))}</span></div></div></div>
    ${eyebrow('Work')}
    <div class="list">
      ${menuRow('#/bookings', 'clipboard', 'Bookings', 'Search, filter and manage all bookings')}
      ${menuRow('#/payments', 'wallet', 'Payments', 'Advances, payments and refunds')}
      ${menuRow('#/expenses', 'receipt', 'Expenses', 'Costs by category and event')}
      ${menuRow('#/services', 'flower', 'Services & packages', 'Your service catalogue and prices')}
      ${menuRow('#/reports', 'chart', 'Reports', 'Revenue, profit, bookings and clients')}
    </div>
    ${eyebrow('Business')}
    <div class="list">
      ${owner ? menuRow('#/settings', 'settings', 'Settings', 'Business details, invoice, alerts, messages') : ''}
      ${owner ? menuRow('#/team', 'shield', 'Team', D.mode === 'firebase' ? 'Staff logins and access' : 'Needs the online database') : ''}
      ${owner ? menuRow('#/bin', 'trash', 'Recycle bin', (() => { const n = D.binItems().length; return n ? n + ' deleted item' + (n > 1 ? 's' : '') + ' — restore within 30 days' : 'Restore deleted records'; })()) : ''}
      ${menuRow('#/data', 'cloud', 'Data & backup', D.mode === 'firebase' ? 'Online database · backup file' : 'Saved on this device · backup file')}
      ${menuRow('#/updates', 'bell', 'Updates & messages', U.state.updateAvailable ? 'New version ' + esc(U.state.latest?.version || '') + ' available' : 'App version and news', upd ? ` <span class="badge b-overdue nodot">${upd}</span>` : '')}
      ${menuRow('#/account', 'user', 'My account', D.mode === 'firebase' ? 'Password and sign out' : 'Profile')}
    </div>
    ${!N.isNative() && 'Notification' in window && Notification.permission === 'default' ? `<button class="btn secondary block" id="perm" style="margin-top:18px">${icon('bell')} Allow notifications in this browser</button>` : ''}
    <p class="center tiny muted" style="margin-top:26px">${esc(S.settings.businessName)} · ${U.state.current ? 'v' + esc(U.state.current) : 'web app'}<br><span class="serif" style="font-style:italic">${esc(S.settings.slogan || '')}</span></p>
  </div>`;
  const p = $('#perm'); if (p) p.onclick = async () => { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Notifications allowed' : 'Notifications not allowed'); moreView(); };
}

// ---------- settings (owner) ----------
export async function settingsView() {
  if (!isOwner()) return go('#/more');
  const s = S.settings;
  const f = (name, label, opts = {}) => `<label class="field"><span>${label}</span>${opts.rows ? `<textarea name="${name}" rows="${opts.rows}">${esc(s[name])}</textarea>` : `<input name="${name}" type="${opts.type || 'text'}" ${opts.attrs || ''} value="${esc(s[name])}">`}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</label>`;
  $('#main').innerHTML = `${topbar('Settings', { back: true })}
  <div class="page narrow"><form id="sf" class="form" autocomplete="off">
    <div class="form-section"><h4>Business</h4>
      ${f('businessName', 'Business name')}${f('slogan', 'Slogan')}${f('tagline', 'Services line', { hint: 'Shown under the name on invoices.' })}
      ${f('phones', 'Phone numbers <em>— one per line</em>', { rows: 2 })}
      <div class="two">${f('email', 'Email', { type: 'email' })}${f('numberPrefix', 'Invoice number prefix', { hint: 'e.g. 9W → 9W-2026-0001' })}</div>
      ${f('address', 'Address <em>— optional</em>', { rows: 2 })}</div>
    <div class="form-section"><h4>Invoice</h4>
      ${f('terms', 'Terms and conditions <em>— one per line</em>', { rows: 4 })}
      ${f('paymentMethod', 'Payment details <em>— one per line, “Label: value”</em>', { rows: 3 })}
      ${f('invoiceThanks', 'Thank-you line', { rows: 2 })}</div>
    <div class="form-section"><h4>Alerts</h4>
      ${f('alertDays', 'Remind before anniversaries and birthdays <em>— days, comma separated</em>', { attrs: 'inputmode="numeric"' })}
      <div class="two">${f('paymentDueDays', 'Payment due (days before event)', { type: 'number', attrs: 'min="0"' })}${f('notifyHour', 'Reminder time (hour 0–23)', { type: 'number', attrs: 'min="0" max="23"' })}</div></div>
    <div class="form-section"><h4>Offer messages</h4>
      ${f('defaultDiscount', 'Default discount %', { type: 'number', attrs: 'min="0" max="100"' })}
      ${f('anniversaryMsg', 'Anniversary message', { rows: 6 })}${f('birthdayMsg', 'Birthday message', { rows: 6 })}
      <p class="small muted">You can use: {names} {customer} {ordinal} {occasion} {date} {discount} {business} {phones}</p></div>
    <div class="form-actions"><button class="btn" type="submit">Save settings</button></div>
  </form></div>`;
  $('#sf').onsubmit = e => {
    e.preventDefault();
    const v = formData(e.target);
    ['defaultDiscount', 'paymentDueDays', 'notifyHour'].forEach(k => v[k] = Number(v[k]) || 0);
    D.saveSettings(v); toast('Settings saved'); history.back();
  };
}

// ---------- team (owner) ----------
export async function teamView() {
  if (!isOwner()) return go('#/more');
  const A = D.getAdapter();
  const members = [...S.members].sort((a, b) => (a.role === 'owner' ? -1 : 1) - (b.role === 'owner' ? -1 : 1) || (a.name || '').localeCompare(b.name || ''));
  $('#main').innerHTML = `${topbar('Team', { back: true })}
  <div class="page narrow">
    <div class="page-head"><h2>Team</h2><p>Everyone here signs in with their own email and password and works on the same business data.</p></div>
    ${D.mode !== 'firebase' ? `<div class="notice-bar lav">${icon('cloudOff')}<div class="small">Staff logins need the online database. The app is currently saving data on this device only.</div></div>` : `
    <div class="list">${members.map(m => `<div class="row static ${m.active === false ? 'off' : ''}" style="${m.active === false ? 'opacity:.55' : ''}"><div class="avatar">${initials(m.name)}</div>
      <div class="grow"><div class="t">${esc(m.name || '')}${m.id === session.user?.uid ? ' <span class="muted small">(you)</span>' : ''}</div><div class="s">${esc(m.email || '')}</div></div>
      ${badge(m.role === 'owner' ? 'Owner' : 'Staff', m.role === 'owner' ? 'owner' : 'staff')}
      ${m.id !== session.user?.uid ? `<button class="btn secondary sm" data-m="${m.id}">${m.active === false ? 'Turn on' : 'Manage'}</button>` : ''}</div>`).join('')}</div>
    <button class="btn block" id="add" style="margin-top:14px">${icon('userPlus')} Add staff member</button>
    <div class="card lav" style="margin-top:18px"><h4>What staff can do</h4><p class="small" style="margin:0">Staff can add and edit clients, bookings, invoices, payments, expenses and services. Only the owner can change business settings, manage the team, and delete invoices or payments.</p></div>`}
  </div>`;
  const add = $('#add'); if (add) add.onclick = () => sheet(`<h3>Add staff member</h3><p class="sub">Create their login, then share the email and password with them.</p>
    <form id="tf" class="form" autocomplete="off">
      <label class="field"><span>Name</span><input name="name" required></label>
      <label class="field"><span>Email</span><input name="email" type="email" inputmode="email" required></label>
      <label class="field"><span>Temporary password <em>— at least 8 characters</em></span><input name="pw" type="text" minlength="8" required value="${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 8)}"></label>
      <label class="field"><span>Role</span><select name="role"><option value="staff">Staff</option><option value="owner">Owner (full access)</option></select></label>
      <div class="btns"><button type="button" class="btn secondary" data-close>Cancel</button><button class="btn" type="submit">Create login</button></div>
    </form>`, sh => {
    $('#tf', sh).onsubmit = e => {
      e.preventDefault();
      const f = formData(e.target);
      busy(e.submitter, async () => {
        await A.createStaff(f.name.trim(), f.email.trim(), f.pw, f.role);
        closeSheet();
        sheet(`<h3>Login created</h3><p class="sub">Share these details with ${esc(f.name)}. They can change the password under My account.</p>
          <div class="card beige"><dl class="kv"><dt>App</dt><dd>9Wings app</dd><dt>Email</dt><dd>${esc(f.email)}</dd><dt>Password</dt><dd class="num">${esc(f.pw)}</dd></dl></div>
          <div class="btns"><button class="btn secondary" id="cp">${icon('copy')} Copy</button><button class="btn" data-close>Done</button></div>`, s2 => {
          $('#cp', s2).onclick = () => { navigator.clipboard?.writeText(`9Wings app login\nEmail: ${f.email}\nPassword: ${f.pw}\nDownload: https://sheranr.github.io/9wings-app/download/`).then(() => toast('Copied')).catch(() => toast('Copy not available')); };
        });
      }, 'Creating…');
    };
  });
  $$('[data-m]').forEach(b => b.onclick = () => {
    const m = S.members.find(x => x.id === b.dataset.m);
    sheet(`<h3>${esc(m.name)}</h3><p class="sub">${esc(m.email)}</p>
      <label class="field"><span>Role</span><select id="role"><option value="staff" ${m.role !== 'owner' ? 'selected' : ''}>Staff</option><option value="owner" ${m.role === 'owner' ? 'selected' : ''}>Owner (full access)</option></select></label>
      <label class="check"><input type="checkbox" id="act" ${m.active !== false ? 'checked' : ''}> Can sign in</label>
      <div class="btns"><button class="btn secondary" data-close>Cancel</button><button class="btn" id="ok">Save</button></div>`, sh => {
      $('#ok', sh).onclick = () => { D.put('members', { ...m, role: $('#role', sh).value, active: $('#act', sh).checked }); closeSheet(); toast('Saved'); };
    });
  });
}

// ---------- my account ----------
export async function accountView() {
  const A = D.getAdapter();
  const me = session.me || {};
  $('#main').innerHTML = `${topbar('My account', { back: true })}
  <div class="page narrow">
    <div class="detail-head" style="display:flex;gap:14px;align-items:center"><div class="avatar lg">${initials(me.name)}</div><div><h2 style="margin:0">${esc(me.name || 'Owner')}</h2><div class="meta"><span class="muted">${esc(session.user?.email || '')}</span></div></div></div>
    <form id="nf" class="form"><label class="field"><span>Display name</span><input name="name" value="${esc(me.name)}" required></label>
      <button class="btn secondary" type="submit">Save name</button></form>
    ${D.mode === 'firebase' ? `
    <div class="form-section"><h4>Change password</h4>
      <form id="pf" class="form" autocomplete="off">
        <label class="field"><span>Current password</span><input name="old" type="password" required autocomplete="current-password"></label>
        <label class="field"><span>New password <em>— at least 8 characters</em></span><input name="pw" type="password" minlength="8" required autocomplete="new-password"></label>
        <button class="btn secondary" type="submit">Change password</button></form></div>
    <button class="btn danger block" id="out" style="margin-top:28px">${icon('logout')} Sign out</button>` : ''}
  </div>`;
  $('#nf').onsubmit = e => {
    e.preventDefault();
    const name = formData(e.target).name.trim();
    if (D.mode === 'firebase') { const m = S.members.find(x => x.id === session.user.uid) || {}; D.put('members', { ...m, id: session.user.uid, name }); }
    session.me = { ...session.me, name }; D.setActor({ uid: session.user?.uid, name });
    toast('Name saved');
  };
  const pf = $('#pf'); if (pf) pf.onsubmit = e => { e.preventDefault(); const f = formData(e.target); busy(e.submitter, async () => { await A.changePassword(f.old, f.pw); e.target.reset(); toast('Password changed'); }); };
  const out = $('#out'); if (out) out.onclick = async () => { if (await confirmBox('Sign out of the app on this device?', { ok: 'Sign out', danger: false, title: 'Sign out' })) A.signOut(); };
}

// ---------- data & backup ----------
export async function dataView() {
  const counts = ['customers', 'events', 'invoices', 'expenses', 'items', 'packages'].map(k => [k, D.all(k).length]);
  const names = { customers: 'Clients', events: 'Bookings', invoices: 'Invoices', expenses: 'Expenses', items: 'Services', packages: 'Packages' };
  $('#main').innerHTML = `${topbar('Data & backup', { back: true })}
  <div class="page narrow">
    <div class="page-head"><h2>Data &amp; backup</h2></div>
    <div class="notice-bar ${D.mode === 'firebase' ? 'lav' : ''}">${icon(D.mode === 'firebase' ? 'cloud' : 'phoneDevice')}<div class="grow small">${D.mode === 'firebase'
      ? `<b>Online database</b> (Firebase · ${esc(D.getAdapter().projectId || '')}). Works offline and syncs automatically when you're online. Everyone in the team sees the same data.${navigator.onLine ? '' : '<br><span class="neg">You\'re offline — changes will sync when you reconnect.</span>'}`
      : '<b>Saved on this device only.</b> Connect the online database to share data between devices and staff.'}</div></div>
    ${eyebrow('Records')}
    <div class="kpis" style="grid-template-columns:repeat(3,1fr)">${counts.map(([k, n]) => `<div class="kpi"><span>${names[k]}</span><b>${n}</b></div>`).join('')}</div>
    ${isOwner() ? `${eyebrow('Automatic backups')}
    <div class="card"><p class="small" style="margin:0 0 10px">Every week a full copy of the data is kept on this device (last 8 weeks)${N.isNative() ? ', and saved as a file in <b>Documents/9Wings Backups</b>' : ''}. Restoring brings back anything missing — it never overwrites newer changes.</p>
      <p class="small" style="margin:0 0 12px">${(() => { const l = B.lastAuto(); return l.at ? `Last backup: <b>${L.relTime(l.at)}</b>${l.where ? ' · ' + esc(l.where) : ''}` : 'No automatic backup yet.'; })()}</p>
      <div id="snaps"><div class="skel" style="height:56px"></div></div>
      <button class="btn secondary block" id="backupNow" style="margin-top:12px">${icon('sync')} Back up now</button></div>` : ''}
    ${eyebrow('Backup file')}
    <div class="card"><p class="small" style="margin:0 0 12px">Save a full copy as one file and keep it in Google Drive, so there's a copy off the phone. Do this once a month — the app reminds you.</p>
      ${isOwner() ? `<div class="btns" style="margin-top:0"><button class="btn secondary" id="exp">${icon('download')} Save backup</button><label class="btn secondary">${icon('upload')} Restore<input type="file" id="imp" accept=".json,application/json" hidden></label></div><p class="tiny muted" style="margin:10px 0 0">The file contains all client details. Keep it private — don't send it over WhatsApp or leave it in Downloads.</p>` : '<p class="small muted" style="margin:0">Only the owner can save or restore full backups.</p>'}</div>
    ${isOwner() ? `${eyebrow('Earlier version of the app')}<div class="card"><p class="small" style="margin:0 0 12px">Copy data saved on this device before the online database was connected.</p><button class="btn secondary" id="legacy">${icon('upload')} Move data from this device</button></div>` : ''}
  </div>`;
  const ex = $('#exp'); if (ex) ex.onclick = async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(D.exportAll(), null, 1));
    const r = await N.shareFile(bytes, `9wings-backup-${L.todayISO()}.json`, 'application/json', '9Wings backup');
    if (r !== 'cancelled') B.markDriveCopy();
    if (r === 'downloaded') toast('Backup downloaded');
  };
  const snaps = $('#snaps');
  if (snaps) {
    const list = await B.listSnapshots();
    snaps.innerHTML = list.length ? `<div class="list">${list.map(sn => `<div class="row static"><span class="tile-ic">${icon('history')}</span>
      <div class="grow"><div class="t">${L.fmtNice(sn.at.slice(0, 10))} <span class="muted small">${new Date(sn.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="s">${sn.counts.clients} clients · ${sn.counts.bookings} bookings · ${sn.counts.invoices} invoices</div></div>
      <div style="display:flex;gap:6px;flex:none"><button class="btn secondary sm" data-snap-restore="${esc(sn.id)}">Restore</button><button class="x-btn" style="height:36px;width:36px" data-snap-save="${esc(sn.id)}" aria-label="Save a copy">${icon('download', 'sm')}</button></div></div>`).join('')}</div>`
      : '<p class="small muted" style="margin:0">The first automatic backup is made when you sign in as owner.</p>';
    $$('[data-snap-restore]').forEach(b => b.onclick = async () => {
      const data = await B.readSnapshot(b.dataset.snapRestore);
      if (!data) return toast('Backup not found');
      if (!(await confirmBox(`Restore the backup from ${L.fmtNice(b.dataset.snapRestore.slice(0, 10))}? Anything missing is brought back; newer changes are kept.`, { ok: 'Restore', danger: false, title: 'Restore backup' }))) return;
      toast(`Restored ${D.importAll(data)} records ✓`, 4000);
    });
    $$('[data-snap-save]').forEach(b => b.onclick = async () => {
      const data = await B.readSnapshot(b.dataset.snapSave);
      const r = await N.shareFile(new TextEncoder().encode(JSON.stringify(data)), `9wings-backup-${b.dataset.snapSave.slice(0, 10)}.json`, 'application/json', '9Wings backup');
      if (r !== 'cancelled') B.markDriveCopy();
    });
  }
  const bn = $('#backupNow'); if (bn) bn.onclick = e => busy(e.currentTarget, async () => { const r = await B.backupNow(); toast(`Backup saved${r.where ? ' · ' + r.where : ''}`); dataView(); }, 'Backing up…');
  const imp = $('#imp'); if (imp) imp.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== '9wings') throw new Error('This is not a 9Wings backup file.');
      if (!(await confirmBox('Restore this backup? Records that are newer in the app are kept.', { ok: 'Restore', danger: false, title: 'Restore backup' }))) return;
      toast(`Restored ${D.importAll(data)} records ✓`, 4000);
    } catch (err) { toast('Could not restore: ' + err.message, 5000); }
  };
  const lg = $('#legacy'); if (lg) lg.onclick = e => busy(e.currentTarget, async () => {
    const legacy = await D.readLegacy();
    if (!legacy.total) { toast('No earlier data was found on this device.', 4000); return; }
    const c = legacy.counts;
    if (!(await confirmBox(`Found ${c.customers} clients, ${c.events} bookings and ${c.invoices} invoices. Copy them into the app?`, { ok: 'Move data', danger: false, title: 'Move data' }))) return;
    toast(`Moved ${D.importLegacy(legacy)} records ✓`, 4000);
    try { localStorage.setItem(D.LEGACY_FLAG, '1'); } catch (x) { /* ignore */ }
  });
}

// ---------- updates & messages ----------
const NOTICE_IC = { update: 'download', warning: 'alert', offer: 'gift', info: 'megaphone' };
function noticeHtml(n) {
  return `<div style="display:flex;gap:12px"><span class="tile-ic ${n.type === 'warning' ? 'neg' : n.type === 'offer' ? 'gold' : ''}">${icon(NOTICE_IC[n.type] || 'megaphone')}</span><div class="grow"><div class="t" style="font-weight:600">${esc(n.title || 'Message')}</div><div class="tiny muted">${n.created ? L.fmtNice(n.created.slice(0, 10)) : ''}</div>
    <p style="margin:8px 0 0;white-space:pre-line">${esc(n.message || '')}</p>${n.link ? `<button class="btn secondary sm" style="margin-top:10px" data-link="${esc(n.link)}">${esc(n.linkLabel || 'Open')}</button>` : ''}</div></div>`;
}
const bindLinks = root => $$('[data-link]', root).forEach(b => b.onclick = () => N.openExternal(b.dataset.link));
async function refreshShell() { const m = await import('../app.js'); m.refreshChrome(); }

export const updatesUI = {
  showUpdate(info, forced) {
    if ($('#modal')?.classList.contains('open') && !forced) return;
    sheet(`<div style="display:flex;gap:14px;align-items:center;margin-bottom:10px"><img src="img/icon-192.png" alt="" style="width:52px;height:52px;border-radius:14px;border:1px solid var(--line)"><div><h3>${forced ? 'Please update the app' : 'New version available'}</h3><p class="sub" style="margin:0">Version ${esc(info.version)}${U.state.current ? ' · you have ' + esc(U.state.current) : ''}</p></div></div>
      ${info.notes && !/^Download/i.test(info.notes) ? `<div class="card beige"><h4>What's new</h4><p style="margin:0;white-space:pre-line;font-size:14px">${esc(info.notes)}</p></div>` : ''}
      <p class="small muted">Your data is kept when you update.</p>
      <div class="btns">${forced ? '' : '<button class="btn secondary" data-later>Later</button>'}<button class="btn" data-go>${icon('download')} Update now</button></div>
      <p class="tiny muted">When the download finishes, open the file and tap <b>Install</b>.</p>`, sh => {
      $('[data-go]', sh).onclick = () => U.startDownload(info.url);
      const later = $('[data-later]', sh);
      if (later) later.onclick = () => { U.dismissUpdate(info.version); closeSheet(); const next = U.state.pending.find(n => !U.seenIds().includes(n.id)); if (next) setTimeout(() => updatesUI.showNotice(next), 250); };
    }, { dismissable: !forced });
  },
  showNotice(n) {
    if ($('#modal')?.classList.contains('open')) return;
    sheet(`${noticeHtml(n)}<div class="btns"><button class="btn" data-ok>OK</button></div>`, sh => {
      bindLinks(sh);
      $('[data-ok]', sh).onclick = () => {
        U.markSeen(n.id); U.state.unread = Math.max(0, U.state.unread - 1); closeSheet(); refreshShell();
        const next = U.state.pending.find(x => !U.seenIds().includes(x.id));
        if (next) setTimeout(() => updatesUI.showNotice(next), 250);
      };
    }, { onClose: () => U.markSeen(n.id) });
  },
  onState() { refreshShell(); if (location.hash === '#/updates') updatesView(); }
};

export async function updatesView() {
  const s = U.state;
  $('#main').innerHTML = `${topbar('Updates & messages', { back: true })}
  <div class="page narrow">
    <div class="card" style="margin-top:14px"><div style="display:flex;gap:14px;align-items:center"><img src="img/icon-192.png" alt="" style="width:52px;height:52px;border-radius:14px;border:1px solid var(--line)">
      <div class="grow"><b>${esc(S.settings.businessName)}</b><div class="small muted">${s.current ? 'Installed version ' + esc(s.current) : 'Web app — always up to date'}</div></div></div>
      ${s.updateAvailable && s.latest ? `<div class="notice-bar" style="margin-top:14px">${icon('download')}<div class="grow"><b>Version ${esc(s.latest.version)} is available</b>${s.latest.notes && !/^Download/i.test(s.latest.notes) ? `<div class="small" style="white-space:pre-line">${esc(s.latest.notes)}</div>` : ''}</div></div>
        <button class="btn block" style="margin-top:12px" data-update>${icon('download')} Update now</button><p class="tiny muted">When the download finishes, open the file and tap Install. Your data is kept.</p>`
        : `<p class="small pos" style="margin:14px 0 0">${icon('circleCheck', 'sm')} ${s.current ? 'You have the latest version.' : 'Always up to date.'}</p>`}
      <button class="btn secondary block" id="recheck" style="margin-top:12px">${icon('sync')} Check again</button>
      ${s.error ? '<p class="tiny muted">Couldn\'t check right now — are you online?</p>' : ''}
    </div>
    ${eyebrow('Messages')}
    ${s.notices.length ? s.notices.map(n => `<div class="card">${noticeHtml(n)}</div>`).join('') : '<div class="card"><p class="small muted" style="margin:0">No messages right now.</p></div>'}
  </div>`;
  $$('[data-back]').forEach(b => b.onclick = () => (history.length > 1 ? history.back() : go('#/home')));
  $$('[data-update]').forEach(b => b.onclick = () => U.startDownload(s.latest?.url));
  bindLinks($('#main'));
  s.notices.forEach(n => U.markSeen(n.id)); s.unread = 0; refreshShell();
  $('#recheck').onclick = e => busy(e.currentTarget, async () => { await U.check(updatesUI, { force: true }); toast(U.state.updateAvailable ? 'Update available' : 'You\'re up to date'); }, 'Checking…');
}
