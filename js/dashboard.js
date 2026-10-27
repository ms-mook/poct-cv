/* Dashboard: bar (pass rate by month) · line (%CV by ward) · detail matrix + ward dialog */
(function () {
  const { monthLabel, fiscalMonths, fmt, passOf, esc, css } = CV;
  const $ = (s) => document.querySelector(s);
  const LEVEL_NAME = { L1: 'L1', L2: 'L2', ALL: 'ผ่านทั้ง L1 และ L2' };
  const MAX_SEL = 8;

  const S = { data: null, fy: null, level: 'ALL', selected: [], mean: true, byDev: new Map(), charts: {} };

  /* ------------------------------------------------------------ derived data */
  function index() {
    S.byDev = new Map();
    for (const r of S.data.rows) {
      if (!S.byDev.has(r.device)) S.byDev.set(r.device, new Map());
      S.byDev.get(r.device).set(r.month, r);
    }
  }
  function monthsShown() {
    const have = new Set(S.data.rows.map((r) => r.month));
    if (S.fy === 'all') return [...have].sort();
    return fiscalMonths(S.fy).filter((m) => have.has(m));
  }
  const rowOf = (dev, m) => S.byDev.get(dev)?.get(m) || null;
  const thr = () => S.data.threshold;
  const hasValue = (r) => r && (r.l1 !== null || r.l2 !== null);

  function monthStat(m, level) {
    let n = 0, p = 0;
    for (const w of S.data.wards) {
      const ok = passOf(rowOf(w.device, m) || { l1: null, l2: null }, level, thr());
      if (ok === null) continue;
      n++; if (ok) p++;
    }
    return { n, p, pct: n ? (p / n) * 100 : null };
  }
  function wardStats(dev, months, level) {
    let fails = 0, max = null;
    for (const m of months) {
      const r = rowOf(dev, m); if (!r) continue;
      if (passOf(r, level, thr()) === false) fails++;
      const vs = level === 'L1' ? [r.l1] : level === 'L2' ? [r.l2] : [r.l1, r.l2];
      for (const v of vs) if (v !== null && (max === null || v > max)) max = v;
    }
    return { fails, max };
  }

  /* ------------------------------------------------------------ chart plumbing */
  function baseOptions() {
    const ink2 = css('--ink-2'), grid = css('--grid');
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      font: { family: getComputedStyle(document.body).fontFamily },
      scales: {
        x: { grid: { display: false }, ticks: { color: ink2 }, border: { color: css('--line') } },
        y: { beginAtZero: true, grid: { color: grid }, ticks: { color: ink2 }, border: { display: false } }
      },
      plugins: { legend: { labels: { color: css('--ink'), usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 } },
        tooltip: { backgroundColor: css('--ink'), titleColor: css('--bg'), bodyColor: css('--bg'), padding: 10, cornerRadius: 8, boxPadding: 4 } }
    };
  }
  function draw(key, canvas, config) {
    S.charts[key]?.destroy();
    S.charts[key] = new Chart(canvas, config);
  }
  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart; ctx.save();
      ctx.font = `600 11px ${getComputedStyle(document.body).fontFamily}`; ctx.fillStyle = css('--ink'); ctx.textAlign = 'center';
      chart.data.datasets.forEach((ds, i) => {
        if (!ds.showLabels) return;
        chart.getDatasetMeta(i).data.forEach((bar, j) => {
          const v = ds.data[j]; if (v === null || v === undefined) return;
          ctx.fillText(`${Math.round(v)}%`, bar.x, bar.y - 6);
        });
      });
      ctx.restore();
    }
  };
  const crosshair = {
    id: 'crosshair',
    afterDatasetsDraw(chart) {
      const a = chart.tooltip?.getActiveElements?.(); if (!a || !a.length) return;
      const { ctx, chartArea: { top, bottom } } = chart; const x = a[0].element.x;
      ctx.save(); ctx.strokeStyle = css('--muted'); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
    }
  };

  /* ------------------------------------------------------------ 1. bar chart */
  function renderBar() {
    const months = monthsShown();
    const labels = months.map((m) => monthLabel(m));
    const lv = S.level;
    const defs = lv === 'ALL'
      ? [{ k: 'L1', name: 'L1', color: css('--l1') }, { k: 'L2', name: 'L2', color: css('--l2') }, { k: 'ALL', name: 'ผ่านทั้ง L1 และ L2', color: css('--all') }]
      : [{ k: lv, name: lv, color: css(lv === 'L1' ? '--l1' : '--l2') }];
    const stats = defs.map((d) => months.map((m) => monthStat(m, d.k)));
    const labelIdx = defs.length === 1 ? 0 : 2;
    const datasets = defs.map((d, i) => ({
      label: d.name, data: stats[i].map((s) => s.pct), backgroundColor: d.color, borderRadius: { topLeft: 4, topRight: 4 },
      borderSkipped: 'bottom', maxBarThickness: defs.length === 1 ? 44 : 24, categoryPercentage: .82, barPercentage: .92,
      showLabels: defs.length === 1 && i === labelIdx && months.length <= 13
    }));
    const opt = baseOptions();
    opt.scales.y.max = 112; opt.scales.y.ticks.callback = (v) => (v <= 100 ? v + '%' : '');
    opt.scales.y.title = { display: true, text: 'ร้อยละที่ผ่านเกณฑ์', color: css('--ink-2') };
    opt.plugins.legend.display = defs.length > 1;
    opt.plugins.tooltip.callbacks = {
      label: (c) => { const s = stats[c.datasetIndex][c.dataIndex]; return s.n ? ` ${c.dataset.label}: ${s.pct.toFixed(1)}% (ผ่าน ${s.p}/${s.n} เครื่อง)` : ` ${c.dataset.label}: ไม่มีข้อมูล`; }
    };
    draw('bar', $('#barChart'), { type: 'bar', data: { labels, datasets }, options: opt, plugins: [valueLabels] });

    $('#sub1').textContent = `เกณฑ์ผ่าน: %CV < ${thr()}% · ` + (lv === 'ALL' ? 'แท่งสีม่วง = เครื่องที่ผ่านทั้ง L1 และ L2 พร้อมกัน' : `เฉพาะ ${lv}`);
    // accessible table twin
    let h = '<thead><tr><th>เดือน</th>' + defs.map((d) => `<th>${esc(d.name)} ผ่าน/ทั้งหมด</th><th>${esc(d.name)} %</th>`).join('') + '</tr></thead><tbody>';
    months.forEach((m, j) => {
      h += `<tr><td>${monthLabel(m, true)}</td>` + defs.map((d, i) => { const s = stats[i][j]; return `<td>${s.n ? `${s.p}/${s.n}` : '–'}</td><td>${s.n ? s.pct.toFixed(1) : '–'}</td>`; }).join('') + '</tr>';
    });
    $('#barTable').innerHTML = h + '</tbody>';
  }

  /* ------------------------------------------------------------ KPIs */
  function renderKpis() {
    const months = monthsShown(); const box = $('#kpis');
    if (!months.length) { box.innerHTML = ''; return; }
    const last = months[months.length - 1], s = monthStat(last, S.level);
    const failing = S.data.wards.filter((w) => passOf(rowOf(w.device, last) || { l1: null, l2: null }, S.level, thr()) === false);
    const pcts = months.map((m) => monthStat(m, S.level).pct).filter((v) => v !== null);
    const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
    const names = failing.slice(0, 3).map((w) => w.ward.replace('หอผู้ป่วย', '').trim()).join(', ');
    box.innerHTML = `
      <div class="kpi"><div class="k">ร้อยละที่ผ่านเกณฑ์ · ${monthLabel(last, true)}</div><div class="v">${s.pct === null ? '–' : s.pct.toFixed(1) + '%'}</div><div class="d">ผ่าน ${s.p} จาก ${s.n} เครื่อง</div></div>
      <div class="kpi ${failing.length ? 'bad' : ''}"><div class="k">เครื่องที่ไม่ผ่านเดือนล่าสุด</div><div class="v">${failing.length} <span style="font-size:15px;font-weight:500">เครื่อง</span></div><div class="d">${failing.length ? esc(names) + (failing.length > 3 ? ` และอีก ${failing.length - 3}` : '') : 'ผ่านทุกเครื่อง'}</div></div>
      <div class="kpi"><div class="k">ค่าเฉลี่ยร้อยละที่ผ่าน (${S.fy === 'all' ? 'ทุกเดือน' : 'ปีงบ ' + S.fy})</div><div class="v">${avg === null ? '–' : avg.toFixed(1) + '%'}</div><div class="d">${months.length} เดือนที่มีข้อมูล</div></div>`;
  }

  /* ------------------------------------------------------------ 2. line chart + picker */
  const wardColor = (i) => css('--s' + ((i % 8) + 1));
  function renderPicker() {
    const q = $('#wardSearch').value.trim().toLowerCase();
    const list = $('#wardList');
    const full = S.selected.length >= MAX_SEL;
    const ordered = [...S.data.wards].sort((a, b) => {
      const ia = S.selected.indexOf(a.device), ib = S.selected.indexOf(b.device);
      return (ia < 0) - (ib < 0) || (ia >= 0 ? ia - ib : a.no - b.no);
    });
    list.innerHTML = ordered.filter((w) => !q || (w.ward + ' ' + w.device).toLowerCase().includes(q)).map((w) => {
      const idx = S.selected.indexOf(w.device), on = idx >= 0;
      return `<label class="${!on && full ? 'off' : ''}"><input type="checkbox" value="${esc(w.device)}" ${on ? 'checked' : ''} ${!on && full ? 'disabled' : ''}>
        <span class="sw" style="background:${on ? wardColor(idx) : 'var(--line)'}"></span><span>${esc(w.ward)}<br><span class="dev">${esc(w.device)}</span></span></label>`;
    }).join('') || '<div class="empty" style="padding:16px">ไม่พบหอผู้ป่วย</div>';
    $('#pickHint').textContent = `เลือกแล้ว ${S.selected.length}/${MAX_SEL} หอ` + (full ? ' · ยกเลิกบางหอเพื่อเลือกเพิ่ม' : '');
  }
  function topFailing(n) {
    const months = monthsShown();
    return S.data.wards.map((w) => ({ d: w.device, ...wardStats(w.device, months, S.level) })).filter((x) => x.fails > 0)
      .sort((a, b) => b.fails - a.fails || (b.max ?? 0) - (a.max ?? 0)).slice(0, n).map((x) => x.d);
  }
  function renderLine() {
    const months = monthsShown(); const labels = months.map((m) => monthLabel(m)); const lv = S.level;
    const wardName = (d) => S.data.wards.find((w) => w.device === d)?.ward || d;
    const ds = [];
    const series = (label, get, color, dash, extra = {}) => ds.push({
      label, data: months.map(get), borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 3.5, pointHoverRadius: 6,
      pointBorderColor: css('--surface'), pointBorderWidth: 2, borderDash: dash, spanGaps: false, tension: 0.15, ...extra
    });
    if (S.mean) {
      const avg = (k) => (m) => { const v = S.data.wards.map((w) => rowOf(w.device, m)?.[k]).filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const mc = css('--muted');
      if (lv !== 'L2') series(lv === 'ALL' ? 'เฉลี่ยทุกหอ · L1' : 'เฉลี่ยทุกหอ', avg('l1'), mc, [], { borderWidth: 3, pointRadius: 0, pointHoverRadius: 4 });
      if (lv !== 'L1') series(lv === 'ALL' ? 'เฉลี่ยทุกหอ · L2' : 'เฉลี่ยทุกหอ', avg('l2'), mc, [6, 4], { borderWidth: 3, pointRadius: 0, pointHoverRadius: 4 });
    }
    S.selected.forEach((d, i) => {
      const c = wardColor(i), nm = wardName(d);
      if (lv !== 'L2') series(lv === 'ALL' ? `${nm} · L1` : nm, (m) => rowOf(d, m)?.l1 ?? null, c, []);
      if (lv !== 'L1') series(lv === 'ALL' ? `${nm} · L2` : nm, (m) => rowOf(d, m)?.l2 ?? null, c, lv === 'ALL' ? [6, 4] : [], lv === 'ALL' ? { pointStyle: 'rectRot' } : {});
    });
    ds.push({ label: `เกณฑ์ผ่าน < ${thr()}%`, data: months.map(() => thr()), borderColor: css('--bad'), borderDash: [2, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, fill: false });

    const opt = baseOptions();
    opt.scales.y.suggestedMax = Math.max(thr() * 1.5, 10);
    opt.scales.y.title = { display: true, text: '%CV', color: css('--ink-2') };
    opt.plugins.legend.labels.filter = () => true;
    opt.plugins.tooltip.itemSort = (a, b) => (b.raw ?? -1) - (a.raw ?? -1);
    opt.plugins.tooltip.callbacks = {
      label: (c) => c.raw === null || c.raw === undefined ? null : c.dataset.label.startsWith('เกณฑ์') ? ` ${c.dataset.label}` : ` ${c.dataset.label}: ${c.raw.toFixed(2)}%${c.raw >= thr() ? '  ▲ ไม่ผ่าน' : ''}`
    };
    draw('line', $('#lineChart'), { type: 'line', data: { labels, datasets: ds }, options: opt, plugins: [crosshair] });
    $('#sub2').textContent = lv === 'ALL' ? 'เส้นทึบ = L1 · เส้นประ = L2 · เส้นแดงประ = เกณฑ์ผ่าน' : `แสดง ${lv} · เส้นแดงประ = เกณฑ์ผ่าน (< ${thr()}%)`;
  }

  /* ------------------------------------------------------------ 3. matrix */
  function matrixRows() {
    const months = monthsShown(); const q = $('#tblSearch').value.trim().toLowerCase(); const onlyFail = $('#onlyFail').checked;
    let rows = S.data.wards.filter((w) => !q || (w.ward + ' ' + w.device).toLowerCase().includes(q))
      .map((w) => ({ w, ...wardStats(w.device, months, S.level) })).filter((x) => !onlyFail || x.fails > 0);
    const sort = $('#sortSel').value;
    if (sort === 'fails') rows.sort((a, b) => b.fails - a.fails || (b.max ?? 0) - (a.max ?? 0));
    else if (sort === 'max') rows.sort((a, b) => (b.max ?? -1) - (a.max ?? -1));
    return { months, rows };
  }
  function cell(r) {
    const t = thr(), lv = S.level;
    if (!hasValue(r)) return `<td class="na" ${r?.note ? `title="${esc(r.note)}"` : ''}>${r?.note ? '<span aria-label="' + esc(r.note) + '">–</span>' : '–'}</td>`;
    const one = (v) => v === null ? '–' : `<span class="${v >= t ? 'fail fail-mark' : ''}">${v.toFixed(2)}</span>`;
    const bad = passOf(r, lv, t) === false;
    const txt = lv === 'L1' ? one(r.l1) : lv === 'L2' ? one(r.l2) : `${one(r.l1)} / ${one(r.l2)}`;
    return `<td class="${bad ? 'fail' : ''}">${txt}</td>`;
  }
  function renderMatrix() {
    const { months, rows } = matrixRows();
    let h = '<thead><tr><th class="sticky">หอผู้ป่วย</th>' + months.map((m) => `<th>${monthLabel(m)}</th>`).join('') + '<th>ไม่ผ่าน (ครั้ง)</th><th>สูงสุด</th></tr></thead><tbody>';
    for (const { w, fails, max } of rows) {
      h += `<tr tabindex="0" role="button" data-dev="${esc(w.device)}" aria-label="ดูรายละเอียด ${esc(w.ward)}"><td class="sticky"><b>${esc(w.ward)}</b><br><span class="dev">${esc(w.device)}</span></td>`
        + months.map((m) => cell(rowOf(w.device, m))).join('')
        + `<td class="${fails ? 'fail' : ''}">${fails}</td><td>${max === null ? '–' : max.toFixed(2)}</td></tr>`;
    }
    if (!rows.length) h += `<tr><td colspan="${months.length + 3}" class="empty">ไม่พบข้อมูลตามเงื่อนไข</td></tr>`;
    $('#matrix').innerHTML = h + '</tbody>';
  }
  function downloadCsv() {
    const { months, rows } = matrixRows(); const lv = S.level;
    const head = ['หอผู้ป่วย', 'หมายเลขเครื่อง']; months.forEach((m) => { if (lv !== 'L2') head.push(`${monthLabel(m)} L1`); if (lv !== 'L1') head.push(`${monthLabel(m)} L2`); });
    const lines = [head];
    rows.forEach(({ w }) => { const l = [w.ward, w.device]; months.forEach((m) => { const r = rowOf(w.device, m); if (lv !== 'L2') l.push(r?.l1 ?? ''); if (lv !== 'L1') l.push(r?.l2 ?? ''); }); lines.push(l); });
    const csv = '﻿' + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `cv-${S.fy === 'all' ? 'all' : 'FY' + S.fy}-${lv}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  /* ------------------------------------------------------------ ward detail dialog */
  function openDetail(dev) {
    const w = S.data.wards.find((x) => x.device === dev); if (!w) return;
    const months = monthsShown(), t = thr();
    $('#dTitle').textContent = w.ward;
    $('#dSub').textContent = `เครื่อง ${w.device} · ${S.fy === 'all' ? 'ทุกปีงบประมาณ' : 'ปีงบประมาณ ' + S.fy} · เกณฑ์ผ่าน %CV < ${t}%`;
    const opt = baseOptions(); opt.scales.y.suggestedMax = Math.max(t * 1.5, 10); opt.scales.y.title = { display: true, text: '%CV', color: css('--ink-2') };
    opt.plugins.tooltip.callbacks = { label: (c) => c.raw == null ? null : c.dataset.label.startsWith('เกณฑ์') ? ` ${c.dataset.label}` : ` ${c.dataset.label}: ${c.raw.toFixed(2)}%${c.raw >= t ? '  ▲ ไม่ผ่าน' : ''}` };
    const mk = (label, key, color, dash) => ({ label, data: months.map((m) => rowOf(dev, m)?.[key] ?? null), borderColor: color, backgroundColor: color, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: css('--surface'), pointBorderWidth: 2, borderDash: dash, tension: .15 });
    $('#detail').showModal();
    draw('detail', $('#detailChart'), { type: 'line', plugins: [crosshair], options: opt, data: { labels: months.map((m) => monthLabel(m)), datasets: [
      mk('L1', 'l1', css('--l1'), []), mk('L2', 'l2', css('--l2'), [6, 4]),
      { label: `เกณฑ์ผ่าน < ${t}%`, data: months.map(() => t), borderColor: css('--bad'), borderDash: [2, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 0 }] } });
    let h = '<thead><tr><th>เดือน</th><th>L1</th><th>L2</th><th style="text-align:left">ผล</th><th style="text-align:left">หมายเหตุ</th></tr></thead><tbody>';
    for (const m of [...months].reverse()) {
      const r = rowOf(dev, m), ok = r ? passOf(r, 'ALL', t) : null;
      const c = (v) => v === null || v === undefined ? '<td class="na">–</td>' : `<td class="${v >= t ? 'fail' : ''}">${v >= t ? '<span class="fail-mark"></span>' : ''}${v.toFixed(2)}</td>`;
      h += `<tr><td>${monthLabel(m, true)}</td>${c(r?.l1)}${c(r?.l2)}<td style="text-align:left"><span class="pill ${ok === null ? 'na' : ok ? 'ok' : 'bad'}">${ok === null ? 'ไม่มีข้อมูล' : ok ? 'ผ่าน' : 'ไม่ผ่าน'}</span></td><td style="text-align:left;white-space:normal">${esc(r?.note || '')}</td></tr>`;
    }
    $('#detailTable').innerHTML = h + '</tbody>';
  }

  /* ------------------------------------------------------------ wiring */
  function renderAll() {
    $('#thrNote').innerHTML = `เกณฑ์ผ่าน: %CV &lt; <b>${thr()}</b>%`;
    const empty = !monthsShown().length;
    renderKpis();
    if (empty) {
      for (const k of ['bar', 'line']) S.charts[k]?.destroy();
      $('#barTable').innerHTML = ''; $('#matrix').innerHTML = '<tbody><tr><td class="empty">ยังไม่มีข้อมูลในปีงบประมาณนี้</td></tr></tbody>';
      return;
    }
    renderBar(); renderPicker(); renderLine(); renderMatrix();
  }
  function setBanner(html, err) {
    const b = $('#banner'); b.hidden = !html; b.className = 'banner' + (err ? ' err' : ''); $('#bannerText').innerHTML = html || '';
  }

  async function init() {
    let data;
    try { data = await CV.loadData(); } catch (e) { setBanner('โหลดข้อมูลไม่สำเร็จ: ' + esc(e.message), true); return; }
    S.data = data; index();
    if (data.source === 'seed') setBanner(CV.cfg.API_URL
      ? `เชื่อมต่อ Google Sheet ไม่สำเร็จ (${esc(data.error?.message || '')}) – กำลังแสดงข้อมูลสำรอง ณ วันที่ติดตั้ง`
      : 'ยังไม่ได้เชื่อมต่อ Google Sheet – กำลังแสดงข้อมูลสำรองจากไฟล์ Excel ปี 2568–2569 (ตั้งค่า API_URL ใน config.js)', !!CV.cfg.API_URL);

    const fys = [...new Set(data.rows.map((r) => r.fy))].sort((a, b) => b - a);
    $('#fySel').innerHTML = fys.map((f) => `<option value="${f}">ปีงบประมาณ ${f}</option>`).join('') + '<option value="all">ทุกปี (รวม)</option>';
    S.fy = fys[0] ?? 'all'; $('#fySel').value = S.fy;
    S.selected = topFailing(3);

    $('#fySel').onchange = (e) => { S.fy = e.target.value === 'all' ? 'all' : Number(e.target.value); S.selected = topFailing(3); renderAll(); };
    $('#lvlSeg').onclick = (e) => {
      const b = e.target.closest('button[data-level]'); if (!b) return;
      S.level = b.dataset.level; document.querySelectorAll('#lvlSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderAll();
    };
    $('#wardSearch').oninput = renderPicker;
    $('#wardList').onchange = (e) => {
      const d = e.target.value; const i = S.selected.indexOf(d);
      if (e.target.checked && i < 0 && S.selected.length < MAX_SEL) S.selected.push(d); else if (!e.target.checked && i >= 0) S.selected.splice(i, 1);
      renderPicker(); renderLine();
    };
    $('#btnClear').onclick = () => { S.selected = []; renderPicker(); renderLine(); };
    $('#btnTopFail').onclick = () => { S.selected = topFailing(5); renderPicker(); renderLine(); };
    $('#chkMean').onchange = (e) => { S.mean = e.target.checked; renderLine(); };
    for (const id of ['#tblSearch', '#onlyFail', '#sortSel']) $(id).addEventListener(id === '#tblSearch' ? 'input' : 'change', renderMatrix);
    $('#btnCsv').onclick = downloadCsv;
    $('#matrix').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-dev]'); if (tr) openDetail(tr.dataset.dev); });
    $('#matrix').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest('tr[data-dev]'); if (tr) { e.preventDefault(); openDetail(tr.dataset.dev); } } });
    $('#dClose').onclick = () => $('#detail').close();
    $('#detail').addEventListener('click', (e) => { if (e.target.id === 'detail') e.target.close(); });
    $('#detail').addEventListener('close', () => { S.charts.detail?.destroy(); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { renderAll(); });

    $('#foot').textContent = `ข้อมูลจาก ${data.source === 'api' ? 'Google Sheet' : 'ไฟล์สำรอง (seed)'}` + (data.generatedAt ? ` · อัปเดตล่าสุด ${new Date(data.generatedAt).toLocaleString('th-TH')}` : '') + ' · เกณฑ์ผ่าน %CV < ' + data.threshold;
    renderAll();
  }
  init();
})();
