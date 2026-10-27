/* Shared helpers: data loading, Thai dates, pass/fail logic */
(function () {
  const TH_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const TH_L = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const cfg = window.APP_CONFIG || {};

  const monthLabel = (m, long) => {
    const [y, mo] = m.split('-').map(Number);
    return long ? `${TH_L[mo - 1]} ${y + 543}` : `${TH_S[mo - 1]} ${String((y + 543) % 100).padStart(2, '0')}`;
  };
  const fiscalYear = (m) => { const [y, mo] = m.split('-').map(Number); return (mo >= 10 ? y + 1 : y) + 543; };
  const fiscalMonths = (fy) => { // Oct (fy-544) … Sep (fy-543)
    const out = [];
    for (let i = 0; i < 12; i++) {
      const mo = ((9 + i) % 12) + 1, y = mo >= 10 ? fy - 544 : fy - 543;
      out.push(`${y}-${String(mo).padStart(2, '0')}`);
    }
    return out;
  };
  const nextMonth = (m) => { let [y, mo] = m.split('-').map(Number); mo++; if (mo > 12) { mo = 1; y++; } return `${y}-${String(mo).padStart(2, '0')}`; };

  const toNum = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
  const fmt = (v) => v === null || v === undefined ? '–' : v.toFixed(2);

  /** level: 'L1' | 'L2' | 'ALL' → true (pass) / false (fail) / null (no data) */
  function passOf(r, level, thr) {
    if (level === 'L1') return r.l1 === null ? null : r.l1 < thr;
    if (level === 'L2') return r.l2 === null ? null : r.l2 < thr;
    const vals = [r.l1, r.l2].filter((v) => v !== null);
    return vals.length ? vals.every((v) => v < thr) : null;
  }

  async function loadData() {
    let raw, source = 'api', error = null;
    if (cfg.API_URL) {
      try {
        const res = await fetch(cfg.API_URL + (cfg.API_URL.includes('?') ? '&' : '?') + 'action=data', { redirect: 'follow' });
        raw = await res.json();
        if (!raw.ok) throw new Error(raw.error || 'API error');
      } catch (e) { error = e; raw = null; }
    }
    if (!raw) {
      const res = await fetch('data/seed.json');
      raw = await res.json();
      source = 'seed';
    }
    const thr = toNum(raw.threshold) ?? cfg.THRESHOLD_DEFAULT ?? 6.7;
    const wards = raw.wards.map((w) => ({ no: Number(w.no), ward: w.ward, device: w.device, active: w.active !== false }))
      .sort((a, b) => a.no - b.no);
    const rows = raw.rows.map((r) => ({
      month: r.month, device: r.device, l1: toNum(r.l1), l2: toNum(r.l2), note: r.note || '', fy: fiscalYear(r.month)
    }));
    return { wards, rows, threshold: thr, source, error, generatedAt: raw.generatedAt || null };
  }

  async function api(action, payload) {
    if (!cfg.API_URL) throw new Error('ยังไม่ได้ตั้งค่า API_URL ใน config.js');
    const res = await fetch(cfg.API_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request → no CORS preflight
      body: JSON.stringify({ action, ...payload })
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'เกิดข้อผิดพลาด');
    return out;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  window.CV = { monthLabel, fiscalYear, fiscalMonths, nextMonth, toNum, fmt, passOf, loadData, api, esc, css, cfg };
})();
