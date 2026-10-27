/* Admin: login · monthly entry grid · ward management */
(function () {
  const { monthLabel, nextMonth, esc, toNum } = CV;
  const $ = (s) => document.querySelector(s);
  const KEY = 'poct_cv_admin_pw';
  const CLOSED_NOTE = 'ปิดปรับปรุงหอผู้ป่วย';
  const S = { data: null, pw: null };

  const getPw = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
  const setPw = (v) => { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { /* private mode */ } };

  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toast.id); toast.id = setTimeout(() => (t.hidden = true), err ? 6000 : 3500);
  }

  /* ------------------------------------------------------------ auth */
  async function login(pw) {
    await CV.api('login', { password: pw });
    S.pw = pw; setPw(pw);
    $('#loginView').hidden = true; $('#adminView').hidden = false; $('#btnLogout').hidden = false;
    initEntry(); renderWards();
  }
  function logout() { S.pw = null; setPw(null); location.reload(); }

  /* ------------------------------------------------------------ monthly entry */
  const rowsOfMonth = (m) => new Map(S.data.rows.filter((r) => r.month === m).map((r) => [r.device, r]));

  function initEntry() {
    const months = [...new Set(S.data.rows.map((r) => r.month))].sort();
    $('#monthPick').value = months.length ? nextMonth(months[months.length - 1]) : new Date().toISOString().slice(0, 7);
    renderEntry();
  }

  function renderEntry() {
    const m = $('#monthPick').value;
    $('#monthTh').textContent = /^\d{4}-\d{2}$/.test(m) ? monthLabel(m, true) : '';
    if (!/^\d{4}-\d{2}$/.test(m)) { $('#entryTable').innerHTML = ''; return; }
    const existing = rowsOfMonth(m);
    const q = $('#entrySearch').value.trim().toLowerCase();
    const wards = S.data.wards.filter((w) => w.active || existing.has(w.device));
    let h = '<thead><tr><th>หอผู้ป่วย</th><th>เครื่อง</th><th>L1 %CV</th><th>L2 %CV</th><th>ปิด/ไม่ได้ตรวจ</th><th style="text-align:left">หมายเหตุ</th><th style="text-align:left">ผล</th></tr></thead><tbody>';
    wards.forEach((w) => {
      const r = existing.get(w.device);
      const closed = r && r.l1 === null && r.l2 === null && r.note;
      const hide = q && !(w.ward + ' ' + w.device).toLowerCase().includes(q);
      h += `<tr data-dev="${esc(w.device)}" class="${closed ? 'closed' : ''}" ${hide ? 'hidden' : ''}>
        <td><b>${esc(w.ward)}</b>${w.active ? '' : ' <span class="pill na">ปิดใช้งาน</span>'}</td><td class="dev">${esc(w.device)}</td>
        <td><input type="number" class="l1" step="0.01" min="0" max="100" inputmode="decimal" aria-label="L1 ${esc(w.ward)}" value="${r?.l1 ?? ''}" ${closed ? 'disabled' : ''}></td>
        <td><input type="number" class="l2" step="0.01" min="0" max="100" inputmode="decimal" aria-label="L2 ${esc(w.ward)}" value="${r?.l2 ?? ''}" ${closed ? 'disabled' : ''}></td>
        <td style="text-align:center"><input type="checkbox" class="closed-cb" aria-label="ปิดปรับปรุง ${esc(w.ward)}" ${closed ? 'checked' : ''}></td>
        <td style="text-align:left"><input type="text" class="note" maxlength="200" aria-label="หมายเหตุ ${esc(w.ward)}" value="${esc(r?.note || '')}" style="min-height:34px"></td>
        <td class="res"></td></tr>`;
    });
    $('#entryTable').innerHTML = h + '</tbody>';
    document.querySelectorAll('#entryTable tbody tr').forEach(updateRow);
    updateSummary();
  }

  function updateRow(tr) {
    const t = S.data.threshold, res = tr.querySelector('.res');
    const closed = tr.querySelector('.closed-cb').checked;
    const l1 = toNum(tr.querySelector('.l1').value), l2 = toNum(tr.querySelector('.l2').value);
    tr.classList.toggle('closed', closed);
    if (closed) { res.innerHTML = '<span class="pill na">ปิด/ไม่ได้ตรวจ</span>'; return; }
    if (l1 === null && l2 === null) { res.innerHTML = ''; return; }
    const bad = (v) => v !== null && (v >= t || v < 0 || v > 100);
    const fails = [bad(l1) && 'L1', bad(l2) && 'L2'].filter(Boolean);
    res.innerHTML = l1 === null || l2 === null ? '<span class="pill na">กรอกไม่ครบ</span>'
      : fails.length ? `<span class="pill bad">▲ ไม่ผ่าน ${fails.join('+')}</span>` : '<span class="pill ok">ผ่าน</span>';
  }
  function updateSummary() {
    const trs = [...document.querySelectorAll('#entryTable tbody tr')];
    let filled = 0, fail = 0, closed = 0;
    trs.forEach((tr) => {
      if (tr.querySelector('.closed-cb').checked) { closed++; return; }
      const a = toNum(tr.querySelector('.l1').value), b = toNum(tr.querySelector('.l2').value);
      if (a !== null || b !== null) { filled++; if ((a ?? 0) >= S.data.threshold || (b ?? 0) >= S.data.threshold) fail++; }
    });
    $('#entrySummary').textContent = `กรอกแล้ว ${filled}/${trs.length} เครื่อง · ปิด/ไม่ได้ตรวจ ${closed} · ไม่ผ่าน ${fail}`;
  }

  function onEntryInput(e) {
    const tr = e.target.closest('tr[data-dev]'); if (!tr) return;
    if (e.target.classList.contains('closed-cb')) {
      const on = e.target.checked;
      tr.querySelectorAll('.l1,.l2').forEach((i) => { i.disabled = on; if (on) i.value = ''; });
      const note = tr.querySelector('.note'); if (on && !note.value) note.value = CLOSED_NOTE; if (!on && note.value === CLOSED_NOTE) note.value = '';
    }
    updateRow(tr); updateSummary();
  }

  /** Paste a block copied from Excel (rows = wards in the visible order, cols = L1,L2) */
  function onEntryPaste(e) {
    const el = e.target; if (!el.classList.contains('l1') && !el.classList.contains('l2')) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.trim())) return; // single value → normal paste
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t'));
    const trs = [...document.querySelectorAll('#entryTable tbody tr')].filter((tr) => !tr.hidden && !tr.querySelector('.closed-cb').checked);
    const start = trs.indexOf(el.closest('tr')); const colStart = el.classList.contains('l2') ? 1 : 0;
    const clean = (v) => { const n = toNum(String(v ?? '').trim().replace(',', '.')); return n === null ? '' : n; };
    lines.forEach((cols, i) => {
      const tr = trs[start + i]; if (!tr) return;
      cols.forEach((c, j) => { const k = colStart + j; if (k > 1) return; tr.querySelector(k === 0 ? '.l1' : '.l2').value = clean(c); });
      updateRow(tr);
    });
    updateSummary(); toast(`วางข้อมูล ${Math.min(lines.length, trs.length - start)} แถว – ตรวจทานก่อนกดบันทึก`);
  }

  async function saveMonth() {
    const m = $('#monthPick').value; if (!/^\d{4}-\d{2}$/.test(m)) return toast('กรุณาเลือกเดือน', true);
    const entries = [], problems = [];
    document.querySelectorAll('#entryTable tbody tr').forEach((tr) => {
      const name = tr.querySelector('b').textContent, dev = tr.dataset.dev;
      const closed = tr.querySelector('.closed-cb').checked, note = tr.querySelector('.note').value.trim();
      const l1 = toNum(tr.querySelector('.l1').value), l2 = toNum(tr.querySelector('.l2').value);
      if (closed) { entries.push({ device: dev, l1: null, l2: null, note: note || CLOSED_NOTE }); return; }
      if (l1 === null && l2 === null) return;                      // untouched → skip
      if (l1 === null || l2 === null) { problems.push(`${name}: กรอก L1 และ L2 ให้ครบ`); return; }
      if (l1 < 0 || l1 > 100 || l2 < 0 || l2 > 100) { problems.push(`${name}: ค่าต้องอยู่ระหว่าง 0–100`); return; }
      entries.push({ device: dev, l1, l2, note });
    });
    if (problems.length) return toast(problems.slice(0, 3).join(' · ') + (problems.length > 3 ? ` (+${problems.length - 3})` : ''), true);
    if (!entries.length) return toast('ยังไม่มีข้อมูลที่จะบันทึก', true);
    const btn = $('#btnSave'); btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try {
      const out = await CV.api('saveMonth', { password: S.pw, month: m, entries });
      toast(`บันทึกแล้ว: เพิ่มใหม่ ${out.added} · แก้ไข ${out.updated} (${monthLabel(m, true)})`);
      S.data = await CV.loadData(); renderEntry(); renderWards();
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; btn.textContent = '💾 บันทึกข้อมูลเดือนนี้'; }
  }

  /* ------------------------------------------------------------ wards */
  function renderWards() {
    let h = '<thead><tr><th>#</th><th style="text-align:left">ชื่อหอผู้ป่วย</th><th style="text-align:left">หมายเลขเครื่อง</th><th>ใช้งาน</th><th></th></tr></thead><tbody>';
    S.data.wards.forEach((w) => {
      h += `<tr data-old="${esc(w.device)}"><td>${w.no}</td>
        <td style="text-align:left"><input type="text" class="wn" value="${esc(w.ward)}" aria-label="ชื่อหอ" style="min-width:230px"></td>
        <td style="text-align:left"><input type="text" class="wd" value="${esc(w.device)}" aria-label="หมายเลขเครื่อง" style="min-width:150px"></td>
        <td style="text-align:center"><input type="checkbox" class="wa" ${w.active ? 'checked' : ''} aria-label="ใช้งาน"></td>
        <td><button class="btn small ws" type="button">บันทึก</button></td></tr>`;
    });
    $('#wardTable').innerHTML = h + '</tbody>';
  }
  async function saveWard(payload, okMsg) {
    try {
      await CV.api('upsertWard', { password: S.pw, ward: payload });
      toast(okMsg); S.data = await CV.loadData(); renderWards(); renderEntry();
      return true;
    } catch (err) { toast(err.message, true); return false; }
  }

  /* ------------------------------------------------------------ init */
  function tab(which) {
    const entry = which === 'entry';
    $('#tabEntry').setAttribute('aria-selected', entry); $('#tabWards').setAttribute('aria-selected', !entry);
    $('#paneEntry').hidden = !entry; $('#paneWards').hidden = entry;
  }

  async function init() {
    try { S.data = await CV.loadData(); } catch (e) { $('#banner').hidden = false; $('#bannerText').textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + e.message; return; }
    if (!CV.cfg.API_URL) {
      $('#banner').hidden = false; $('#bannerText').textContent = 'ยังไม่ได้ตั้งค่า API_URL ใน config.js – เข้าสู่ระบบและบันทึกข้อมูลไม่ได้ (ดูขั้นตอนใน README.md)';
      $('#loginBtn').disabled = true;
    }
    $('#loginForm').onsubmit = async (e) => {
      e.preventDefault(); const b = $('#loginBtn'); b.disabled = true; $('#loginErr').textContent = '';
      try { await login($('#pw').value); } catch (err) { $('#loginErr').textContent = err.message; } finally { b.disabled = !CV.cfg.API_URL; }
    };
    $('#btnLogout').onclick = logout;
    $('#tabEntry').onclick = () => tab('entry'); $('#tabWards').onclick = () => tab('wards');
    $('#monthPick').onchange = renderEntry; $('#entrySearch').oninput = () => {
      const q = $('#entrySearch').value.trim().toLowerCase();
      document.querySelectorAll('#entryTable tbody tr').forEach((tr) => { tr.hidden = !!q && !(tr.textContent + tr.dataset.dev).toLowerCase().includes(q); });
    };
    const et = $('#entryTable'); et.addEventListener('input', onEntryInput); et.addEventListener('change', onEntryInput); et.addEventListener('paste', onEntryPaste);
    $('#btnSave').onclick = saveMonth;
    $('#wardForm').onsubmit = async (e) => {
      e.preventDefault();
      if (await saveWard({ ward: $('#wName').value, device: $('#wDev').value, active: true, isNew: true }, 'เพิ่มหอ/เครื่องแล้ว')) e.target.reset();
    };
    $('#wardTable').addEventListener('click', (e) => {
      const b = e.target.closest('.ws'); if (!b) return; const tr = b.closest('tr');
      const dev = tr.querySelector('.wd').value.trim(), old = tr.dataset.old;
      if (dev !== old && !confirm(`เปลี่ยนหมายเลขเครื่องจาก ${old} เป็น ${dev}?\nข้อมูลย้อนหลังของเครื่องนี้จะถูกย้ายไปที่หมายเลขใหม่ทั้งหมด`)) return;
      saveWard({ ward: tr.querySelector('.wn').value, device: dev, oldDevice: old, active: tr.querySelector('.wa').checked }, 'บันทึกแล้ว');
    });
    const saved = getPw();
    if (saved && CV.cfg.API_URL) { try { await login(saved); } catch { setPw(null); } }
  }
  init();
})();
