/* Admin: login · monthly entry grid (ND = Not Done) · ward management */
(function () {
  const { monthLabel, nextMonth, esc, toNum, icon } = CV;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const KEY = 'poct_cv_admin_pw';
  const TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const S = { data: null, pw: null, user: '', dirty: false, saving: false };

  // session only (cleared when the tab closes): {u, p}
  const getPw = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const setPw = (v) => { try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY); } catch { /* private mode */ } };
  const auth = () => ({ username: S.user, password: S.pw });
  const prevMonth = (m) => { let [y, mo] = m.split('-').map(Number); mo--; if (mo < 1) { mo = 12; y--; } return `${y}-${String(mo).padStart(2, '0')}`; };

  function toast(msg, err) {
    const el = document.createElement('div');
    el.className = `alert ${err ? 'alert-error' : 'alert-success'} toast-pop py-2 text-sm shadow-lg`;
    el.innerHTML = `${icon(err ? 'circle-alert' : 'circle-check')}<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el); setTimeout(() => el.remove(), err ? 6500 : 3500);
  }
  function banner(msg) { $('#banner').hidden = !msg; $('#bannerText').textContent = msg || ''; }
  const setDirty = (v) => { S.dirty = v; };

  /* ------------------------------------------------------------ auth */
  async function login(u, pw) {
    const out = await CV.api('login', { username: u, password: pw });
    S.user = out.user || u; S.pw = pw; setPw({ u: S.user, p: pw });
    $('#whoami').innerHTML = `${icon('user-round-cog')} ${esc(S.user)}`; $('#whoami').hidden = false;
    $('#loginView').hidden = true; $('#adminView').hidden = false; $('#btnLogout').hidden = false;
    initEntry(); renderWards();
  }
  function logout() { S.pw = null; setPw(null); setDirty(false); location.reload(); }
  /** Session expired / wrong password on a later call → back to login */
  function handleAuthError(err) {
    if (/รหัสผ่าน|unauthorized/i.test(err.message)) { setPw(null); toast('เซสชันหมดอายุหรือรหัสผ่านไม่ถูกต้อง – กรุณาเข้าสู่ระบบใหม่', true); return true; }
    return false;
  }

  /* ------------------------------------------------------------ month picker (Thai month + พ.ศ. selects) */
  const curMonth = () => `${$('#mYear').value - 543}-${String($('#mMonth').value).padStart(2, '0')}`;
  function setMonth(m) {
    const [y, mo] = m.split('-').map(Number);
    if (![...$('#mYear').options].some((o) => +o.value === y + 543)) $('#mYear').add(new Option(String(y + 543), y + 543));
    $('#mYear').value = y + 543; $('#mMonth').value = mo;
  }
  function confirmLeave() { return !S.dirty || confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการเปลี่ยนเดือนโดยทิ้งการแก้ไขหรือไม่?'); }

  /* ------------------------------------------------------------ monthly entry */
  const rowsOfMonth = (m) => new Map(S.data.rows.filter((r) => r.month === m).map((r) => [r.device, r]));

  function initEntry() {
    $('#mMonth').innerHTML = TH.map((t, i) => `<option value="${i + 1}">${t}</option>`).join('');
    const months = [...new Set(S.data.rows.map((r) => r.month))].sort();
    const y0 = months.length ? +months[0].slice(0, 4) : new Date().getFullYear();
    const y1 = Math.max(new Date().getFullYear(), months.length ? +months[months.length - 1].slice(0, 4) : 0) + 1;
    $('#mYear').innerHTML = Array.from({ length: y1 - y0 + 1 }, (_, i) => `<option value="${y0 + i + 543}">${y0 + i + 543}</option>`).join('');
    setMonth(months.length ? nextMonth(months[months.length - 1]) : new Date().toISOString().slice(0, 7));
    renderEntry();
  }

  function renderEntry() {
    const m = curMonth(); const existing = rowsOfMonth(m);
    $('#monthState').className = 'badge gap-1 ' + (existing.size ? 'badge-info' : 'badge-ghost');
    $('#monthState').innerHTML = existing.size ? `${icon('pencil')} แก้ไขข้อมูลเดิม ${existing.size} หอ` : `${icon('plus')} เดือนใหม่ (ยังไม่มีข้อมูล)`;
    const wards = S.data.wards.filter((w) => w.active || existing.has(w.device));
    let h = '<thead><tr><th class="sticky-l">หอผู้ป่วย</th><th>L1 %CV</th><th>L2 %CV</th><th>ND</th><th style="text-align:left">หมายเหตุ</th><th style="text-align:left">ผล</th></tr></thead><tbody>';
    wards.forEach((w) => {
      const r = existing.get(w.device), nd = !!r && (r.nd || /^\s*nd\s*$/i.test(r.note));
      h += `<tr data-dev="${esc(w.device)}" data-had="${r ? 1 : 0}" class="${nd ? 'nd' : ''}">
        <td class="sticky-l"><b>${esc(w.ward)}</b>${w.active ? '' : ' <span class="badge badge-ghost badge-xs">ปิดใช้งาน</span>'}<br><span class="dev">${esc(w.device)}</span></td>
        <td><input type="number" class="input input-bordered input-sm num l1 bg-transparent" step="0.01" min="0" max="100" inputmode="decimal" aria-label="L1 ${esc(w.ward)}" value="${r?.l1 ?? ''}" ${nd ? 'disabled' : ''}></td>
        <td><input type="number" class="input input-bordered input-sm num l2 bg-transparent" step="0.01" min="0" max="100" inputmode="decimal" aria-label="L2 ${esc(w.ward)}" value="${r?.l2 ?? ''}" ${nd ? 'disabled' : ''}></td>
        <td style="text-align:center"><input type="checkbox" class="checkbox checkbox-sm nd-cb" aria-label="ND ไม่ได้ทำ ${esc(w.ward)}" ${nd ? 'checked' : ''}></td>
        <td style="text-align:left"><input type="text" class="input input-bordered input-sm note bg-transparent" maxlength="200" aria-label="หมายเหตุ ${esc(w.ward)}" value="${esc(r?.note || '')}"></td>
        <td class="res" style="text-align:left"></td></tr>`;
    });
    $('#entryTable').innerHTML = h + '</tbody>';
    $$('#entryTable tbody tr').forEach(snapshot);
    $$('#entryTable tbody tr').forEach(updateRow);
    applyFilter(); updateSummary(); setDirty(false); S.curM = m;
  }
  const sig = (tr) => [tr.querySelector('.l1').value, tr.querySelector('.l2').value, tr.querySelector('.nd-cb').checked, tr.querySelector('.note').value].join('|');
  function snapshot(tr) { tr.dataset.sig = sig(tr); }

  function updateRow(tr) {
    const t = S.data.threshold, res = tr.querySelector('.res');
    const nd = tr.querySelector('.nd-cb').checked;
    const i1 = tr.querySelector('.l1'), i2 = tr.querySelector('.l2');
    const l1 = toNum(i1.value), l2 = toNum(i2.value);
    tr.classList.toggle('nd', nd);
    tr.classList.toggle('dirty', sig(tr) !== tr.dataset.sig);
    const badVal = (v) => v !== null && (v < 0 || v > 100);
    i1.classList.toggle('err', badVal(l1)); i2.classList.toggle('err', badVal(l2));
    if (nd) { res.innerHTML = '<span class="badge badge-sm badge-ghost">ND ไม่ได้ทำ</span>'; return; }
    if (l1 === null && l2 === null) { res.innerHTML = tr.dataset.had === '1' && tr.classList.contains('dirty') ? '<span class="badge badge-sm badge-warning">จะล้างค่าเดิม</span>' : ''; return; }
    if (badVal(l1) || badVal(l2)) { res.innerHTML = '<span class="badge badge-sm badge-error">ค่าต้อง 0–100</span>'; return; }
    const fails = [l1 !== null && l1 >= t && 'L1', l2 !== null && l2 >= t && 'L2'].filter(Boolean);
    res.innerHTML = l1 === null || l2 === null ? '<span class="badge badge-sm badge-warning">กรอกไม่ครบ</span>'
      : fails.length ? `<span class="badge badge-sm badge-error gap-1">▲ ไม่ผ่าน ${fails.join('+')}</span>` : '<span class="badge badge-sm badge-success">ผ่าน</span>';
  }
  function updateSummary() {
    const trs = $$('#entryTable tbody tr');
    let done = 0, fail = 0, nd = 0, partial = 0;
    trs.forEach((tr) => {
      if (tr.querySelector('.nd-cb').checked) { nd++; done++; return; }
      const a = toNum(tr.querySelector('.l1').value), b = toNum(tr.querySelector('.l2').value);
      if (a !== null && b !== null) { done++; if (a >= S.data.threshold || b >= S.data.threshold) fail++; } else if (a !== null || b !== null) partial++;
    });
    $('#entrySummary').textContent = `เสร็จ ${done}/${trs.length} หอ · ND ${nd} · ไม่ผ่าน ${fail}` + (partial ? ` · กรอกไม่ครบ ${partial}` : '');
    $('#prog').value = trs.length ? Math.round((done / trs.length) * 100) : 0;
    const dirty = trs.some((tr) => tr.classList.contains('dirty')); setDirty(dirty);
    $('#btnSave').classList.toggle('btn-warning', dirty); $('#btnSave').classList.toggle('btn-primary', !dirty);
  }
  function applyFilter() {
    const q = $('#entrySearch').value.trim().toLowerCase();
    $$('#entryTable tbody tr').forEach((tr) => { tr.hidden = !!q && !(tr.textContent + tr.dataset.dev).toLowerCase().includes(q); });
  }

  function onEntryInput(e) {
    const tr = e.target.closest('tr[data-dev]'); if (!tr) return;
    if (e.target.classList.contains('nd-cb')) {
      const on = e.target.checked, note = tr.querySelector('.note');
      tr.querySelectorAll('.l1,.l2').forEach((i) => { i.disabled = on; if (on) i.value = ''; });
      if (on && (!note.value.trim() || /^\s*nd\s*$/i.test(note.value))) note.value = 'ND';
      if (!on && /^\s*nd\s*$/i.test(note.value)) note.value = '';
    }
    updateRow(tr); updateSummary();
  }

  /** Enter / ↓ / ↑ move to the same column in the next / previous visible row */
  function onEntryKey(e) {
    const el = e.target; if (!/^(l1|l2|note)$/.test([...el.classList].find((c) => /^(l1|l2|note)$/.test(c)) || '')) return;
    if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const col = ['l1', 'l2', 'note'].find((c) => el.classList.contains(c));
    const trs = $$('#entryTable tbody tr').filter((t) => !t.hidden);
    let i = trs.indexOf(el.closest('tr')) + (e.key === 'ArrowUp' ? -1 : 1);
    while (trs[i] && trs[i].querySelector('.' + col).disabled) i += e.key === 'ArrowUp' ? -1 : 1;
    const next = trs[i]?.querySelector('.' + col); if (next) { next.focus(); next.select?.(); next.closest('tr').scrollIntoView({ block: 'nearest' }); }
  }

  /** Paste a block copied from Excel (rows = wards in visible order, cols = L1,L2). "ND" cells mark the row as ND. */
  function onEntryPaste(e) {
    const el = e.target; if (!el.classList.contains('l1') && !el.classList.contains('l2')) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t'));
    const trs = $$('#entryTable tbody tr').filter((tr) => !tr.hidden);
    const start = trs.indexOf(el.closest('tr')); const colStart = el.classList.contains('l2') ? 1 : 0;
    let bad = 0, n = 0;
    lines.forEach((cols, i) => {
      const tr = trs[start + i]; if (!tr) return; n++;
      if (cols.some((c) => /^\s*nd\s*$/i.test(c))) {
        const cb = tr.querySelector('.nd-cb'); if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } return;
      }
      if (tr.querySelector('.nd-cb').checked) return;
      cols.forEach((c, j) => {
        const k = colStart + j; if (k > 1) return;
        const raw = String(c ?? '').trim().replace(',', '.'); const v = toNum(raw);
        if (raw && v === null) bad++;
        tr.querySelector(k === 0 ? '.l1' : '.l2').value = v === null ? '' : v;
      });
      updateRow(tr);
    });
    updateSummary();
    toast(`วางข้อมูล ${n} แถว – ตรวจทานก่อนกดบันทึก` + (bad ? ` (มี ${bad} ช่องที่ไม่ใช่ตัวเลข ถูกเว้นว่าง)` : ''), !!bad);
  }

  async function saveMonth() {
    if (S.saving) return;
    const m = curMonth();
    const entries = [], problems = []; let cleared = 0;
    $$('#entryTable tbody tr').forEach((tr) => {
      const name = tr.querySelector('b').textContent, dev = tr.dataset.dev;
      const nd = tr.querySelector('.nd-cb').checked; let note = tr.querySelector('.note').value.trim();
      const l1 = toNum(tr.querySelector('.l1').value), l2 = toNum(tr.querySelector('.l2').value);
      const had = tr.dataset.had === '1', changed = tr.classList.contains('dirty');
      if (nd) { if (changed || !had) entries.push({ device: dev, l1: null, l2: null, note: 'ND' }); return; }
      if (l1 === null && l2 === null) {
        if (had && changed) { cleared++; entries.push({ device: dev, l1: null, l2: null, note: /^\s*nd\s*$/i.test(note) ? '' : note }); }
        return;
      }
      if (l1 === null || l2 === null) { problems.push(`${name}: กรอก L1 และ L2 ให้ครบ (หรือติ๊ก ND ถ้าไม่ได้ทำ)`); return; }
      if (l1 < 0 || l1 > 100 || l2 < 0 || l2 > 100) { problems.push(`${name}: ค่าต้องอยู่ระหว่าง 0–100`); return; }
      if (had && !changed) return;                       // unchanged existing row → nothing to send
      if (/^\s*nd\s*$/i.test(note)) note = '';           // values present → not ND
      entries.push({ device: dev, l1, l2, note });
    });
    if (problems.length) return toast(problems.slice(0, 3).join(' · ') + (problems.length > 3 ? ` (+${problems.length - 3})` : ''), true);
    if (!entries.length) return toast('ไม่มีการเปลี่ยนแปลงที่ต้องบันทึก', true);
    if (cleared && !confirm(`มี ${cleared} หอที่ล้างค่า %CV เดิมออก (ข้อมูลเดิมจะถูกลบ) ต้องการบันทึกต่อหรือไม่?\nหากไม่ได้ทำ QC ให้ติ๊ก ND แทน`)) return;
    S.saving = true; const btn = $('#btnSave'); btn.disabled = true; btn.querySelector('span').textContent = 'กำลังบันทึก…'; btn.firstElementChild.classList.add('spin-slow');
    try {
      const out = await CV.api('saveMonth', { ...auth(), month: m, entries });
      toast(`บันทึกแล้ว (${monthLabel(m, true)}): เพิ่มใหม่ ${out.added} · แก้ไข ${out.updated}`);
      S.data = await CV.loadData({ fresh: true }); renderEntry(); renderWards();
    } catch (err) { if (!handleAuthError(err)) toast(err.message, true); else setTimeout(() => location.reload(), 1200); }
    finally { S.saving = false; btn.disabled = false; btn.querySelector('span').textContent = 'บันทึกข้อมูลเดือนนี้'; btn.firstElementChild.classList.remove('spin-slow'); }
  }

  /* ------------------------------------------------------------ wards */
  function renderWards() {
    let h = '<thead><tr><th>#</th><th style="text-align:left">ชื่อหอผู้ป่วย</th><th style="text-align:left">หมายเลขเครื่อง</th><th style="text-align:left">กลุ่มหอ</th><th>ใช้งาน</th><th></th></tr></thead><tbody>';
    S.data.wards.forEach((w) => {
      h += `<tr data-old="${esc(w.device)}"><td>${w.no}</td>
        <td style="text-align:left"><input type="text" class="wn input input-bordered input-sm w-60 bg-transparent" value="${esc(w.ward)}" aria-label="ชื่อหอ"></td>
        <td style="text-align:left"><input type="text" class="wd input input-bordered input-sm w-40 bg-transparent" value="${esc(w.device)}" aria-label="หมายเลขเครื่อง"></td>
        <td style="text-align:left"><input type="text" class="wg input input-bordered input-sm w-32 bg-transparent" list="grpList" value="${esc(w.group || '')}" aria-label="กลุ่มหอ"></td>
        <td style="text-align:center"><input type="checkbox" class="wa toggle toggle-sm toggle-primary" ${w.active ? 'checked' : ''} aria-label="ใช้งาน"></td>
        <td><button class="btn btn-sm ws gap-1" type="button">${icon('save')} บันทึก</button></td></tr>`;
    });
    $('#wardTable').innerHTML = h + '</tbody>';
    $('#grpList').innerHTML = [...new Set(S.data.wards.map((w) => w.group).filter(Boolean))].map((g) => `<option value="${esc(g)}">`).join('');
  }
  async function saveWard(payload, okMsg) {
    try {
      await CV.api('upsertWard', { ...auth(), ward: payload });
      toast(okMsg); S.data = await CV.loadData({ fresh: true }); renderWards(); renderEntry();
      return true;
    } catch (err) { if (!handleAuthError(err)) toast(err.message, true); return false; }
  }

  async function loadHistory() {
    const t = $('#histTable'); t.innerHTML = '<tbody><tr><td style="text-align:center" class="p-6">กำลังโหลด…</td></tr></tbody>';
    try {
      const out = await CV.api('history', auth());
      const name = (d) => S.data.wards.find((w) => w.device === d)?.ward || d;
      t.innerHTML = '<thead><tr><th style="text-align:left">เวลา</th><th style="text-align:left">การกระทำ</th><th style="text-align:left">เดือน</th><th style="text-align:left">หอผู้ป่วย</th><th style="text-align:left">ก่อน (L1 / L2)</th><th style="text-align:left">หลัง (L1 / L2)</th><th style="text-align:left">ผู้แก้ไข</th></tr></thead><tbody>'
        + (out.items.length ? out.items.map((i) => `<tr><td style="text-align:left">${esc(i.time)}</td><td style="text-align:left"><span class="badge badge-sm ${/^เพิ่ม/.test(i.action) ? 'badge-success' : 'badge-warning'}">${esc(i.action)}</span></td><td style="text-align:left">${/^\d{4}-\d{2}$/.test(i.month) ? monthLabel(i.month) : esc(i.month)}</td><td style="text-align:left">${esc(name(i.device))}<br><span class="dev">${esc(i.device)}</span></td><td style="text-align:left">${esc(i.before || '–')}</td><td style="text-align:left"><b>${esc(i.after)}</b></td><td style="text-align:left">${i.user ? `<span class="badge badge-sm badge-ghost">${esc(i.user)}</span>` : '<span class="opacity-50">–</span>'}</td></tr>`).join('')
          : '<tr><td colspan="7" style="text-align:center" class="p-6">ยังไม่มีประวัติ (เริ่มบันทึกหลังอัปเดต Apps Script)</td></tr>') + '</tbody>';
    } catch (err) { if (!handleAuthError(err)) t.innerHTML = `<tbody><tr><td style="text-align:center" class="p-6">${esc(err.message)}</td></tr></tbody>`; }
  }

  /* ------------------------------------------------------------ init */
  function tab(which) {
    const entry = which === 'entry';
    for (const k of ['entry', 'wards', 'hist']) {
      const on = k === which, cap = k[0].toUpperCase() + k.slice(1);
      $('#tab' + cap).setAttribute('aria-selected', on); $('#tab' + cap).classList.toggle('tab-active', on); $('#pane' + cap).hidden = !on;
    }
    if (which === 'hist') loadHistory();
  }

  async function init() {
    hydrateIcons();
    const setThemeIcon = () => $('#btnTheme').querySelector('use')?.setAttribute('href', `img/icons.svg#${Theme.current() === 'dark' ? 'sun' : 'moon'}`);
    setThemeIcon(); $('#btnTheme').onclick = () => { Theme.toggle(); setThemeIcon(); };
    $('#pwToggle').onclick = () => { const i = $('#pw'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; $('#pwToggle').querySelector('use').setAttribute('href', `img/icons.svg#${show ? 'eye-off' : 'eye'}`); };
    try { S.data = await CV.loadData({ fresh: true }); } catch (e) { banner('โหลดข้อมูลไม่สำเร็จ: ' + e.message); return; }
    if (!CV.cfg.API_BASE) { banner('ยังไม่ได้ตั้งค่า API_BASE ใน config.js – เข้าสู่ระบบและบันทึกข้อมูลไม่ได้ (ดูขั้นตอนใน README.md)'); $('#loginBtn').disabled = true; }
    else if (S.data.source === 'seed') banner('อ่านข้อมูลจาก Google Sheet ไม่สำเร็จ: ' + (S.data.error?.message || '') + ' – ตรวจ Environment Variables ใน Vercel และการ Deploy Apps Script (ดู README.md)');

    $('#loginForm').onsubmit = async (e) => {
      e.preventDefault(); const b = $('#loginBtn'); b.disabled = true; $('#loginErr').textContent = '';
      try { await login($('#uname').value.trim(), $('#pw').value); } catch (err) { $('#loginErr').textContent = err.message; $('#pw').select(); } finally { b.disabled = !CV.cfg.API_BASE; }
    };
    $('#btnLogout').onclick = () => { if (!S.dirty || confirm('มีข้อมูลที่ยังไม่ได้บันทึก ออกจากระบบหรือไม่?')) logout(); };
    $('#tabEntry').onclick = () => tab('entry'); $('#tabWards').onclick = () => tab('wards'); $('#tabHist').onclick = () => tab('hist'); $('#btnHist').onclick = loadHistory;
    $('#btnCopyWards').onclick = async () => { const txt = $$('#entryTable tbody tr').filter((t) => !t.hidden).map((t) => t.querySelector('b').textContent + '\t' + t.dataset.dev).join('\n'); try { await navigator.clipboard.writeText(txt); toast('คัดลอกรายชื่อหอ (ชื่อ, เครื่อง) แล้ว'); } catch { toast('คัดลอกไม่สำเร็จ', true); } };

    const change = (fn) => () => { if (!confirmLeave()) { setMonth(S.curM); return; } fn(); S.curM = curMonth(); renderEntry(); };
    $('#mMonth').onchange = change(() => {}); $('#mYear').onchange = change(() => {});
    $('#mPrev').onclick = change(() => setMonth(prevMonth(curMonth()))); $('#mNext').onclick = change(() => setMonth(nextMonth(curMonth())));
    $('#entrySearch').oninput = applyFilter;
    const et = $('#entryTable'); et.addEventListener('input', onEntryInput); et.addEventListener('change', onEntryInput); et.addEventListener('paste', onEntryPaste); et.addEventListener('keydown', onEntryKey);
    et.addEventListener('focusin', (e) => { if (e.target.matches('input[type=number]')) e.target.select(); });
    $('#btnSave').onclick = saveMonth;
    document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !$('#adminView').hidden && !$('#paneEntry').hidden) { e.preventDefault(); saveMonth(); } });
    window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

    $('#wardForm').onsubmit = async (e) => {
      e.preventDefault();
      if (await saveWard({ ward: $('#wName').value.trim(), device: $('#wDev').value.trim(), active: true, isNew: true, group: $('#wGrp').value.trim() }, 'เพิ่มหอ/เครื่องแล้ว')) e.target.reset();
    };
    $('#wardTable').addEventListener('click', (e) => {
      const b = e.target.closest('.ws'); if (!b) return; const tr = b.closest('tr');
      const dev = tr.querySelector('.wd').value.trim(), old = tr.dataset.old;
      if (dev !== old && !confirm(`เปลี่ยนหมายเลขเครื่องจาก ${old} เป็น ${dev}?\nข้อมูลย้อนหลังของเครื่องนี้จะถูกย้ายไปที่หมายเลขใหม่ทั้งหมด`)) return;
      saveWard({ ward: tr.querySelector('.wn').value.trim(), device: dev, oldDevice: old, active: tr.querySelector('.wa').checked, group: tr.querySelector('.wg').value.trim() }, 'บันทึกแล้ว');
    });
    const saved = getPw();
    if (saved && saved.p && CV.cfg.API_BASE) { try { await login(saved.u, saved.p); } catch { setPw(null); } }
  }
  init();
})();
