/* ฟังก์ชันที่ใช้ร่วมกันระหว่างหน้า dashboard และ admin */
(function () {
  var MONTH_SHORT = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
  var MONTH_FULL = ['ตุลาคม', 'พฤศจิกายน', 'ธันวาคม', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน'];

  function monthInfo(fy, k) {
    var be = k < 3 ? fy - 1 : fy;
    return { fy: fy, k: k, be: be, label: MONTH_SHORT[k] + ' ' + String(be).slice(-2), full: MONTH_FULL[k] + ' ' + be };
  }

  function cfg() { return window.APP_CONFIG || {}; }

  function fetchSeed() {
    return fetch('data/seed.json').then(function (r) { return r.json(); });
  }

  /** โหลดข้อมูลจาก Apps Script (ถ้าตั้ง API_URL) หรือจาก seed.json */
  function load(fresh) {
    var api = cfg().API_URL;
    if (!api) {
      return fetchSeed().then(function (d) { d.source = 'seed'; return d; });
    }
    var url = api + (api.indexOf('?') >= 0 ? '&' : '?') + 'action=data' + (fresh ? '&t=' + Date.now() : '');
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.error || 'API error');
      j.source = 'sheet';
      return j;
    }).catch(function (err) {
      return fetchSeed().then(function (d) { d.source = 'seed-fallback'; d.error = String(err.message || err); return d; });
    });
  }

  /** ส่งคำสั่งเขียนข้อมูลไปที่ Apps Script (ใช้ text/plain เพื่อไม่ให้เกิด CORS preflight) */
  function post(payload) {
    var api = cfg().API_URL;
    if (!api) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า API_URL ใน config.js'));
    return fetch(api, { method: 'POST', body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'บันทึกไม่สำเร็จ'); return j; });
  }

  /** สร้างโครงสร้างสำหรับคำนวณ */
  function buildModel(data) {
    var thr = Number(data.threshold) || 6.7;
    var years = data.years.slice().sort(function (a, b) { return a - b; });
    var wardByMachine = {};
    years.forEach(function (fy) {
      (data.wards[fy] || []).forEach(function (w, i) {
        var cur = wardByMachine[w.machine];
        wardByMachine[w.machine] = { machine: w.machine, ward: w.ward, order: cur ? cur.order : (fy * 1000 + i), fy: fy };
      });
    });
    var wards = Object.keys(wardByMachine).map(function (m) { return wardByMachine[m]; })
      .sort(function (a, b) { return a.order - b.order; });
    // เดือนที่มีข้อมูลตัวเลขอย่างน้อย 1 ค่า
    var seen = {}, months = [];
    var byMonth = {}, byWard = {};
    data.records.forEach(function (r) {
      var key = r.fy * 100 + r.k;
      (byMonth[key] = byMonth[key] || []).push(r);
      (byWard[r.machine] = byWard[r.machine] || {})[key] = r;
      if ((r.l1 !== null || r.l2 !== null) && !seen[key]) {
        seen[key] = true;
        months.push(monthInfo(r.fy, r.k));
      }
    });
    months.sort(function (a, b) { return a.fy * 100 + a.k - (b.fy * 100 + b.k); });
    months.forEach(function (m) { m.key = m.fy * 100 + m.k; });
    return { thr: thr, years: years, wards: wards, wardByMachine: wardByMachine, months: months, byMonth: byMonth, byWard: byWard, data: data };
  }

  var fmt = function (v) { return v === null || v === undefined ? '–' : Number(v).toFixed(2); };

  /** ร้อยละผ่านเกณฑ์ของเดือนหนึ่ง: level = 'L1' | 'L2' | 'BOTH' */
  function passStat(model, key, level) {
    var recs = model.byMonth[key] || [], n = 0, ok = 0;
    recs.forEach(function (r) {
      if (level === 'L1') { if (r.l1 === null) return; n++; if (r.l1 < model.thr) ok++; }
      else if (level === 'L2') { if (r.l2 === null) return; n++; if (r.l2 < model.thr) ok++; }
      else { if (r.l1 === null || r.l2 === null) return; n++; if (r.l1 < model.thr && r.l2 < model.thr) ok++; }
    });
    return { n: n, ok: ok, pct: n ? ok * 100 / n : null };
  }

  /* ---------- ธีม ---------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('poct-theme'); } catch (e) { /* ไม่มี storage */ }
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    var btn = document.getElementById('themeBtn');
    if (btn) btn.addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('poct-theme', next); } catch (e) { /* ข้าม */ }
      document.dispatchEvent(new Event('themechange'));
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { document.dispatchEvent(new Event('themechange')); });
  }

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function toast(msg, ms) {
    var el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 3200);
  }

  function sourceBanner(data) {
    if (data.source === 'sheet') return { cls: 'ok', text: 'เชื่อมต่อ Google Sheet แล้ว · อัปเดตล่าสุด ' + new Date(data.updated).toLocaleString('th-TH') };
    if (data.source === 'seed-fallback') return { cls: '', text: 'เชื่อมต่อ Google Sheet ไม่สำเร็จ (' + data.error + ') จึงแสดงข้อมูลสำรองจาก seed.json' };
    return { cls: 'info', text: 'โหมดตัวอย่าง: ยังไม่ได้ตั้งค่า API_URL ใน config.js จึงแสดงข้อมูลจาก data/seed.json (สำเนาของข้อมูลปี 2568-2569)' };
  }

  window.CV = { monthInfo: monthInfo, MONTH_FULL: MONTH_FULL, MONTH_SHORT: MONTH_SHORT, load: load, post: post, buildModel: buildModel,
    passStat: passStat, fmt: fmt, initTheme: initTheme, css: css, esc: esc, toast: toast, sourceBanner: sourceBanner, cfg: cfg };
})();
