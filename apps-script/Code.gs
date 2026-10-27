/**
 * POCT Glucose %CV – Backend (Google Apps Script, bound to the Google Sheet)
 *
 * Sheets
 *   Data   : month (text YYYY-MM, Gregorian) | device | L1 | L2 | note | updated_at
 *   Wards  : no | ward | device | active
 *   Config : key | value | description        (cv_threshold = 6.7)
 *
 * Endpoints (deploy as Web app: Execute as "Me", access "Anyone") – called ONLY by the Vercel functions /api/*
 *   GET  ?action=data&key=API_KEY
 *   POST {key, action:'saveMonth', month, entries:[{device,l1,l2,note}]}
 *   POST {key, action:'upsertWard', ward:{device, ward, active, oldDevice?, isNew?}}
 *
 * Auth: every call must carry `key` = Script property API_KEY (same value as Vercel env APPS_SCRIPT_KEY).
 * The admin password (ADMIN_PASSWORD) lives only in Vercel Environment Variables and is checked by /api/admin.
 */

var SHEET_DATA = 'Data';
var SHEET_WARDS = 'Wards';
var SHEET_CONFIG = 'Config';
var SHEET_LOG = 'Log';
var DEFAULT_THRESHOLD = 6.7;
var DEFAULT_TARGET = 95;

/* ------------------------------------------------------------------ setup */

/** Run once from the editor (Run > setup) to normalise formats. Safe to re-run. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var d = ss.getSheetByName(SHEET_DATA);
  d.getRange('A:A').setNumberFormat('@');      // keep "2026-10" as text, not a date
  d.getRange('B:B').setNumberFormat('@');
  d.getRange('C:D').setNumberFormat('0.00');
  d.setFrozenRows(1);
  var wsh = ss.getSheetByName(SHEET_WARDS);
  wsh.getRange('B:C').setNumberFormat('@');
  if (String(wsh.getRange('E1').getValue()) !== 'group') wsh.getRange('E1').setValue('group');   // กลุ่มหอ (เช่น ICU, OPD)
  ensureLog_();
  var cfg = ss.getSheetByName(SHEET_CONFIG), has = false;
  cfg.getDataRange().getValues().forEach(function (r) { if (r[0] === 'target_pass_pct') has = true; });
  if (!has) cfg.appendRow(['target_pass_pct', DEFAULT_TARGET, 'เป้าหมายร้อยละเครื่องที่ผ่านเกณฑ์ (%)']);
  if (!PropertiesService.getScriptProperties().getProperty('API_KEY')) {
    Logger.log('ยังไม่ได้ตั้ง API_KEY: รันฟังก์ชัน createApiKey (หรือ Project Settings > Script properties > Add)');
  }
}

/**
 * Run once: creates a random API_KEY in Script properties (if none exists) and prints it in the execution log.
 * Copy the printed value into Vercel as APPS_SCRIPT_KEY. Running again prints the existing key (does not change it).
 */
function createApiKey() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('API_KEY');
  if (!k) {
    k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('API_KEY', k);
    Logger.log('สร้าง API_KEY ใหม่แล้ว – คัดลอกค่าด้านล่างไปใส่ Vercel เป็น APPS_SCRIPT_KEY');
  } else {
    Logger.log('มี API_KEY อยู่แล้ว – ค่าปัจจุบัน (ใส่ Vercel เป็น APPS_SCRIPT_KEY):');
  }
  Logger.log(k);
}

/* ------------------------------------------------------------------ routing */

function doGet(e) {
  try {
    checkKey_(e && e.parameter && e.parameter.key);
    var action = (e && e.parameter && e.parameter.action) || 'data';
    if (action === 'data') return json_(readAll_());
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    checkKey_(body.key);

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (body.action === 'saveMonth') return json_(saveMonth_(body));
      if (body.action === 'upsertWard') return json_(upsertWard_(body));
      if (body.action === 'history') return json_(history_(body));
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  var real = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!real) throw new Error('ยังไม่ได้ตั้งค่า API_KEY ใน Script properties');
  if (typeof key !== 'string' || key !== real) throw new Error('unauthorized');
}

/* ------------------------------------------------------------------ read */

function monthText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM');
  return String(v).trim();
}
function num_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function readAll_() {
  var ss = SpreadsheetApp.getActive();
  var wv = ss.getSheetByName(SHEET_WARDS).getDataRange().getValues();
  var wards = [];
  for (var i = 1; i < wv.length; i++) {
    if (!wv[i][2]) continue;
    wards.push({ no: Number(wv[i][0]) || i, ward: String(wv[i][1]), device: String(wv[i][2]),
                 active: !(wv[i][3] === false || String(wv[i][3]).toUpperCase() === 'FALSE'), group: String(wv[i][4] || '').trim() });
  }
  var dv = ss.getSheetByName(SHEET_DATA).getDataRange().getValues();
  var rows = [];
  for (var j = 1; j < dv.length; j++) {
    if (!dv[j][0] || !dv[j][1]) continue;
    rows.push({ month: monthText_(dv[j][0]), device: String(dv[j][1]).trim(),
                l1: num_(dv[j][2]), l2: num_(dv[j][3]), note: String(dv[j][4] || '') });
  }
  var threshold = DEFAULT_THRESHOLD, target = DEFAULT_TARGET;
  var cv = ss.getSheetByName(SHEET_CONFIG).getDataRange().getValues();
  for (var k = 1; k < cv.length; k++) if (cv[k][0] === 'cv_threshold' && num_(cv[k][1]) !== null) threshold = num_(cv[k][1]);
  for (var q = 1; q < cv.length; q++) if (cv[q][0] === 'target_pass_pct' && num_(cv[q][1]) !== null) target = num_(cv[q][1]);
  return { ok: true, threshold: threshold, target: target, wards: wards, rows: rows, generatedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ write */

function saveMonth_(body) {
  var month = String(body.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('รูปแบบเดือนไม่ถูกต้อง (YYYY-MM)');
  var entries = body.entries;
  if (!Array.isArray(entries) || !entries.length) throw new Error('ไม่มีข้อมูลที่จะบันทึก');

  var ss = SpreadsheetApp.getActive();
  var known = {};
  ss.getSheetByName(SHEET_WARDS).getDataRange().getValues().slice(1).forEach(function (r) { known[String(r[2]).trim()] = true; });

  var clean = entries.map(function (en) {
    var dev = String(en.device || '').trim();
    if (!known[dev]) throw new Error('ไม่พบหมายเลขเครื่อง ' + dev + ' ในชีต Wards');
    var l1 = num_(en.l1), l2 = num_(en.l2);
    [l1, l2].forEach(function (v) { if (v !== null && (v < 0 || v > 100)) throw new Error('ค่า %CV ต้องอยู่ระหว่าง 0–100 (' + dev + ')'); });
    return { device: dev, l1: l1, l2: l2, note: String(en.note || '').slice(0, 200) };
  });

  var sh = ss.getSheetByName(SHEET_DATA);
  sh.getRange('A:B').setNumberFormat('@');
  var last = sh.getLastRow();
  var values = last > 1 ? sh.getRange(2, 1, last - 1, 6).getValues() : [];
  var index = {};
  values.forEach(function (r, i) { index[monthText_(r[0]) + '|' + String(r[1]).trim()] = i; });

  var now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  var appended = [], updated = 0, logs = [], user = String(body.user || '').slice(0, 60);
  var show = function (a, b, n) { return (a === '' || a === null ? '–' : a) + ' / ' + (b === '' || b === null ? '–' : b) + (n ? ' [' + n + ']' : ''); };
  clean.forEach(function (c) {
    var rec = [month, c.device, c.l1 === null ? '' : c.l1, c.l2 === null ? '' : c.l2, c.note, now];
    var key = month + '|' + c.device;
    if (key in index) {
      var o = values[index[key]];
      logs.push([now, 'แก้ไข', month, c.device, show(o[2], o[3], o[4]), show(rec[2], rec[3], rec[4]), user]);
      values[index[key]] = rec; updated++;
    } else { appended.push(rec); logs.push([now, 'เพิ่ม', month, c.device, '', show(rec[2], rec[3], rec[4]), user]); }
  });
  if (logs.length) { var lg = ensureLog_(); lg.getRange(lg.getLastRow() + 1, 1, logs.length, 7).setValues(logs); }
  if (updated) sh.getRange(2, 1, values.length, 6).setValues(values);
  if (appended.length) sh.getRange(last + 1, 1, appended.length, 6).setValues(appended);
  SpreadsheetApp.flush();
  return { ok: true, updated: updated, added: appended.length };
}

function upsertWard_(body) {
  var w = body.ward || {};
  var ward = String(w.ward || '').trim(), device = String(w.device || '').trim();
  if (!ward || !device) throw new Error('กรุณากรอกชื่อหอผู้ป่วยและหมายเลขเครื่อง');
  var oldDevice = String(w.oldDevice || device).trim();
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_WARDS);
  var vals = sh.getDataRange().getValues();
  var rowIdx = -1, maxNo = 0;
  for (var i = 1; i < vals.length; i++) {
    maxNo = Math.max(maxNo, Number(vals[i][0]) || 0);
    if (String(vals[i][2]).trim() === oldDevice) rowIdx = i;
    else if (String(vals[i][2]).trim() === device) throw new Error('หมายเลขเครื่องนี้มีอยู่แล้ว');
  }
  var active = !(w.active === false);
  if (w.isNew && rowIdx >= 0) throw new Error('หมายเลขเครื่องนี้มีอยู่แล้ว');
  var wlog = function (act, before) { ensureLog_().appendRow([Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'), act, '', device, before, ward + (active ? '' : ' [ปิดใช้งาน]') + (w.group ? ' {' + w.group + '}' : ''), String(body.user || '')]); };
  if (rowIdx >= 0) {
    wlog('แก้ไขหอ/เครื่อง', String(vals[rowIdx][1]) + ' · ' + oldDevice);
    sh.getRange(rowIdx + 1, 2, 1, 3).setValues([[ward, device, active]]);
    sh.getRange(rowIdx + 1, 5).setValue(String(w.group || '').trim());
    if (oldDevice !== device) renameDevice_(oldDevice, device);
    return { ok: true, mode: 'updated' };
  }
  sh.appendRow([maxNo + 1, ward, device, active, String(w.group || '').trim()]);
  wlog('เพิ่มหอ/เครื่อง', '');
  return { ok: true, mode: 'added' };
}

function renameDevice_(from, to) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_DATA);
  var last = sh.getLastRow();
  if (last < 2) return;
  var rng = sh.getRange(2, 2, last - 1, 1), v = rng.getValues();
  v.forEach(function (r) { if (String(r[0]).trim() === from) r[0] = to; });
  rng.setValues(v);
}

/* ------------------------------------------------------------ audit log */

function ensureLog_() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) { sh = ss.insertSheet(SHEET_LOG); sh.appendRow(['time', 'action', 'month', 'device', 'before (L1 / L2 [note])', 'after (L1 / L2 [note])', 'user']); sh.setFrozenRows(1); sh.getRange('A:G').setNumberFormat('@'); }
  if (String(sh.getRange('G1').getValue()) !== 'user') sh.getRange('G1').setValue('user');
  return sh;
}
/** latest 300 changes, newest first */
function history_() {
  var sh = ensureLog_(), last = sh.getLastRow();
  if (last < 2) return { ok: true, items: [] };
  var n = Math.min(300, last - 1), v = sh.getRange(last - n + 1, 1, n, 7).getValues().reverse();
  return { ok: true, items: v.map(function (r) { return { time: String(r[0]), action: String(r[1]), month: String(r[2]), device: String(r[3]), before: String(r[4]), after: String(r[5]), user: String(r[6] || '') }; }) };
}
