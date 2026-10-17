/**
 * 9Wings Event — Google Sheet backup.
 * Paste this whole file into Extensions > Apps Script of your Google Sheet.
 * 1) Change SECRET_KEY below to your own secret words (no spaces), e.g. golden-swan-2026-x7
 * 2) Run "setup" once (allow access when asked).
 * 3) Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone > Deploy.
 * 4) Copy the Web app URL (ends with /exec) into the app: More > Backup to Google Sheet.
 */
const SECRET_KEY = 'CHANGE-ME-to-your-own-secret';

const TABLES = {
  customers: 'Customers',
  events: 'Bookings',
  invoices: 'Invoices',
  items: 'Items',
  offers: 'Offers',
  settings: 'Settings'
};
const FIXED = ['id', 'updatedAt', 'deleted'];

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.values(TABLES).forEach(name => sheet_(ss, name));
  const first = ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) ss.deleteSheet(first);
  SpreadsheetApp.getUi && Logger.log('Setup done. Now deploy as a Web app.');
}

function sheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.setFrozenRows(1);
    // keep phone numbers (leading 0) and dates exactly as the app sends them
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    // "Locked": editing by hand shows a warning, because the app owns this data.
    const p = sh.protect().setDescription('Managed by the 9Wings app — edit in the app, not here.');
    p.setWarningOnly(true);
  }
  return sh;
}

function doGet() {
  return json_({ ok: true, app: '9wings', message: 'The 9Wings backup is running.' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  if (!req || req.key !== SECRET_KEY || SECRET_KEY.indexOf('CHANGE-ME') === 0) return json_({ ok: false, error: 'Wrong secret key (check the key in the app and in the script).' });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (req.action === 'ping') return json_({ ok: true });
    if (req.action === 'push') return json_(push_(req.tables || {}));
    if (req.action === 'pull') return json_(pull_());
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function push_(tables) {
  const ss = SpreadsheetApp.getActive();
  let written = 0;
  Object.keys(tables).forEach(store => {
    const name = TABLES[store];
    if (!name) return;
    const t = tables[store];
    const rows = t.rows || [];
    const sh = sheet_(ss, name);
    const header = FIXED.concat(t.columns || [], ['json']);
    // header row (rewrite if columns changed)
    const cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    if (cur.join('|') !== header.join('|')) {
      sh.getRange(1, 1, 1, Math.max(header.length, cur.length)).clearContent();
      sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#F6EEDC');
    }
    if (!rows.length) return;
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : [];
    const index = {};
    ids.forEach((id, i) => { index[id] = i + 2; });
    const appends = [];
    rows.forEach(r => {
      const values = [r.id, r.updatedAt || '', r.deleted ? 'TRUE' : 'FALSE']
        .concat((t.columns || []).map(c => (r.cols && r.cols[c] !== undefined && r.cols[c] !== null ? String(r.cols[c]) : '')))
        .concat([r.deleted ? '' : (r.json || '')]);
      const at = index[r.id];
      if (at) {
        const existing = String(sh.getRange(at, 2).getValue() || '');
        if (!r.deleted && existing && existing > (r.updatedAt || '')) return; // sheet has newer copy
        sh.getRange(at, 1, 1, values.length).setValues([values]);
      } else {
        appends.push(values);
      }
      written++;
    });
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, header.length).setNumberFormat('@');
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, header.length).setValues(appends);
  });
  return { ok: true, written: written };
}

function pull_() {
  const ss = SpreadsheetApp.getActive();
  const out = {};
  Object.keys(TABLES).forEach(store => {
    const sh = ss.getSheetByName(TABLES[store]);
    out[store] = [];
    if (!sh || sh.getLastRow() < 2) return;
    const data = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const head = data[0];
    const iJson = head.indexOf('json'), iDel = head.indexOf('deleted');
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      out[store].push({ id: String(row[0]), updatedAt: String(row[1] || ''), deleted: row[iDel] === true || String(row[iDel]).toUpperCase() === 'TRUE', json: iJson >= 0 ? String(row[iJson] || '') : '' });
    }
  });
  return { ok: true, tables: out };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
