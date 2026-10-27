/* Executive dashboard: summary/insights · bar (pass rate) · line (%CV by ward) · heatmap + ward dialog
   ND (Not Done) rows are never used in calculations; they count as "recorded" for completeness only. */
(function () {
  const { monthLabel, fiscalMonths, passOf, esc, css, icon, isND, WATCH_RATIO } = CV;
  const $ = (s) => document.querySelector(s);
  const MAX_SEL = 8;
  const NULLROW = { l1: null, l2: null };

  const S = { month: '', group: '', data: null, fy: null, level: 'ALL', selected: [], mean: true, cmp: false, byDev: new Map(), charts: {} };

  /* ------------------------------------------------------------ derived data */
  function index() {
    S.byDev = new Map();
    for (const r of S.data.rows) {
      if (!S.byDev.has(r.device)) S.byDev.set(r.device, new Map());
      S.byDev.get(r.device).set(r.month, r);
    }
  }
  const thr = () => S.data.threshold;
  const watchAt = () => thr() * WATCH_RATIO;
  const rowOf = (dev, m) => S.byDev.get(dev)?.get(m) || null;
  const hasValue = (r) => !!r && (r.l1 !== null || r.l2 !== null);
  const vals = (r, lv) => !r ? [] : (lv === 'L1' ? [r.l1] : lv === 'L2' ? [r.l2] : [r.l1, r.l2]).filter((v) => v !== null);
  const shortWard = (w) => w.ward.replace(/^หอผู้ป่วย/, '').trim() || w.ward;
  const wardByDev = (d) => S.data.wards.find((w) => w.device === d);
  const W = () => (S.group ? S.data.wards.filter((w) => w.group === S.group) : S.data.wards);

  function monthsOf(fy) {
    const have = new Set(S.data.rows.map((r) => r.month));
    if (fy === 'all') return [...have].sort();
    return fiscalMonths(fy).filter((m) => have.has(m));
  }
  const monthsShown = () => (S.month ? [S.month] : monthsOf(S.fy));

  function monthStat(m, level) {
    let n = 0, p = 0;
    for (const w of W()) {
      const ok = passOf(rowOf(w.device, m) || NULLROW, level, thr());
      if (ok === null) continue;
      n++; if (ok) p++;
    }
    return { n, p, pct: n ? (p / n) * 100 : null };
  }
  function wardStats(dev, months, level) {
    let fails = 0, max = null, n = 0, watch = 0;
    for (const m of months) {
      const r = rowOf(dev, m); if (!r) continue;
      const ok = passOf(r, level, thr());
      if (ok === null) continue;
      n++; if (ok === false) fails++;
      for (const v of vals(r, level)) { if (max === null || v > max) max = v; if (v < thr() && v >= watchAt()) watch++; }
    }
    return { fails, max, n, watch };
  }
  const fmt1 = (v) => (v === null || v === undefined ? '–' : v.toFixed(1));

  /* ------------------------------------------------------------ chart plumbing */
  function baseOptions() {
    const ink2 = css('--ink-2'), grid = css('--grid');
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 450 },
      interaction: { mode: 'index', intersect: false },
      font: { family: getComputedStyle(document.body).fontFamily },
      scales: {
        x: { grid: { display: false }, ticks: { color: ink2 }, border: { color: css('--line') } },
        y: { beginAtZero: true, grid: { color: grid }, ticks: { color: ink2 }, border: { display: false } }
      },
      plugins: {
        legend: { labels: { color: css('--ink'), usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 } },
        tooltip: { backgroundColor: css('--ink'), titleColor: css('--page-bg'), bodyColor: css('--page-bg'), padding: 10, cornerRadius: 10, boxPadding: 4 }
      }
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
      ctx.font = `700 11px ${getComputedStyle(document.body).fontFamily}`; ctx.fillStyle = css('--ink'); ctx.textAlign = 'center';
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

  /* ------------------------------------------------------------ executive summary */
  function spark(values) {
    const v = values.filter((x) => x !== null);
    if (v.length < 2) return '';
    const W = 120, H = 44, pad = 5, lo = Math.max(0, Math.min(...v) - 8), hi = 100;
    const X = (i) => pad + (i * (W - 2 * pad)) / (v.length - 1);
    const Y = (x) => H - pad - ((x - lo) / (hi - lo || 1)) * (H - 2 * pad);
    const pts = v.map((x, i) => [X(i), Y(x)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="แนวโน้มร้อยละที่ผ่านเกณฑ์"><path class="area" d="${d} L${last[0]} ${H} L${pts[0][0]} ${H} Z"/><path class="line" d="${d}"/><circle cx="${last[0]}" cy="${last[1]}" r="3.5"/></svg>`;
  }
  function deltaBadge(d, unit, goodUp = true) {
    if (d === null || d === undefined || isNaN(d)) return '';
    const rounded = Math.round(d * 10) / 10;
    if (rounded === 0) return `<span class="delta flat">${icon('minus')} คงที่</span>`;
    const up = rounded > 0, good = up === goodUp;
    return `<span class="delta ${good ? 'up' : 'down'}">${icon(up ? 'trending-up' : 'trending-down')} ${up ? '+' : ''}${rounded.toFixed(1)}${unit}</span>`;
  }

  function analyse() {
    const months = monthsShown(); if (!months.length) return null;
    const lv = S.level, t = thr();
    const last = months[months.length - 1];
    const lastStat = monthStat(last, lv);
    const all = monthsOf('all'), idx = all.indexOf(last);        // context for "previous month" and streaks (crosses fiscal years)
    let prev = null, prevStat = null;
    for (let i = idx - 1; i >= 0; i--) { const s = monthStat(all[i], lv); if (s.n) { prev = all[i]; prevStat = s; break; } }
    const trend = (S.fy === 'all' ? all : monthsOf(S.fy)).filter((m) => m <= last);
    const pcts = trend.map((m) => monthStat(m, lv).pct);
    const trendAll = pcts;
    const active = W().filter((w) => w.active);
    const failing = [], watch = [], repeat = [];
    let recorded = 0, nd = 0; const missing = [];
    for (const w of W()) {
      const r = rowOf(w.device, last);
      if (w.active) {
        if (r) { recorded++; if (isND(r)) nd++; } else missing.push(w);
      }
      const ok = passOf(r || NULLROW, lv, t);
      if (ok === false) failing.push(w);
      else if (ok === true && Math.max(...vals(r, lv)) >= watchAt()) watch.push({ w, max: Math.max(...vals(r, lv)) });
      // consecutive failing streak ending at the latest month (months without a result are skipped, a pass ends it)
      let streak = 0;
      for (let i = idx; i >= 0; i--) {
        const o = passOf(rowOf(w.device, all[i]) || NULLROW, lv, t);
        if (o === null) continue;
        if (o === false) streak++; else break;
      }
      if (streak >= 2) repeat.push({ w, streak });
    }
    // wards that passed every evaluated month in the period
    let perfect = 0, evaluated = 0;
    for (const w of W()) {
      const st = wardStats(w.device, months, lv);
      if (st.n >= 1) { evaluated++; if (st.fails === 0) perfect++; }
    }
    const valid = months.map((m) => monthStat(m, lv).pct).filter((v) => v !== null);
    const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    // previous fiscal year average (same level)
    let prevFyAvg = null;
    if (S.fy !== 'all' && !S.month) {
      const pm = monthsOf(S.fy - 1).map((m) => monthStat(m, lv).pct).filter((v) => v !== null);
      if (pm.length) prevFyAvg = pm.reduce((a, b) => a + b, 0) / pm.length;
    }
    // level comparison over period
    const avgOf = (k) => { const a = months.map((m) => monthStat(m, k).pct).filter((v) => v !== null); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
    const mpcts = months.map((m) => monthStat(m, lv).pct);
    return { months, last, lastStat, prev, prevStat, pcts, mpcts, failing, watch, repeat, missing, recorded, nd, active: active.length, perfect, evaluated, avg, prevFyAvg, l1: avgOf('L1'), l2: avgOf('L2') };
  }

  const LV_TXT = () => (S.level === 'ALL' ? 'ผ่านทั้ง L1 และ L2' : S.level);
  const periodTxt = () => (S.month ? monthLabel(S.month, true) : S.fy === 'all' ? 'ทุกปีงบประมาณ' : `ปีงบประมาณ ${S.fy}`);

  function renderSummary() {
    const A = analyse(); const kpis = $('#kpis');
    if (!A) {
      $('#heroText').textContent = 'ยังไม่มีข้อมูลในช่วงที่เลือก';
      kpis.innerHTML = ''; $('#insights').innerHTML = ''; $('#watchlist').innerHTML = '';
      return;
    }
    const { lastStat: s, prevStat: ps } = A;
    const pct = s.pct;
    const tg = S.data.target;
    const tone = pct === null ? 'info' : pct >= tg ? 'good' : pct >= tg - 10 ? 'warn' : 'bad';
    const toneTxt = { good: 'อยู่ในเกณฑ์ดี', warn: 'ควรติดตาม', bad: 'ต้องเร่งแก้ไข', info: '' }[tone];
    $('#heroPeriod').textContent = `· ${periodTxt()} · ${LV_TXT()}`;
    $('#heroText').innerHTML = pct === null
      ? `${monthLabel(A.last, true)}: ยังไม่มีผลที่นำมาคำนวณ`
      : `${monthLabel(A.last, true)} มี <span style="color:var(--${tone === 'good' ? 'ok' : tone === 'warn' ? 'warn' : 'bad'})">${pct.toFixed(1)}%</span> ของเครื่องผ่านเกณฑ์ (${s.p}/${s.n} เครื่อง) – ${toneTxt} (เป้าหมาย ${tg}%)`
        + (A.failing.length ? ` · ไม่ผ่าน ${A.failing.length} เครื่อง` : '');

    const dPct = pct !== null && ps && ps.pct !== null ? pct - ps.pct : null;
    const compl = A.active ? (A.recorded / A.active) * 100 : null;
    kpis.innerHTML = `
      <div class="glass lift reveal p-4"><div class="flex items-center justify-between text-sm font-semibold opacity-80"><span>ร้อยละที่ผ่านเกณฑ์</span>${icon('gauge', 'icon-lg')}</div>
        <div class="mt-1 flex items-end justify-between gap-2"><div class="kpi-value"><span data-count="${pct ?? ''}" data-dec="1">${fmt1(pct)}</span>${pct === null ? '' : '<span class="text-xl">%</span>'}</div>${spark(A.pcts)}</div>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs"><span>${monthLabel(A.last)} · ผ่าน ${s.p}/${s.n}</span>${deltaBadge(dPct, ' จุด')}</div></div>
      <div class="glass lift reveal p-4" style="--d:60ms"><div class="flex items-center justify-between text-sm font-semibold opacity-80"><span>เครื่องที่ไม่ผ่านเดือนล่าสุด</span>${icon('triangle-alert', 'icon-lg')}</div>
        <div class="kpi-value mt-1" style="color:${A.failing.length ? 'var(--bad)' : 'var(--ok)'}"><span data-count="${A.failing.length}" data-dec="0">${A.failing.length}</span> <span class="text-base font-semibold">เครื่อง</span></div>
        <div class="mt-1 text-xs">${A.failing.length ? esc(A.failing.slice(0, 3).map(shortWard).join(', ')) + (A.failing.length > 3 ? ` และอีก ${A.failing.length - 3}` : '') : `${icon('circle-check')} ผ่านทุกเครื่องที่ทำ QC`}</div></div>
      <div class="glass lift reveal p-4" style="--d:120ms"><div class="flex items-center justify-between text-sm font-semibold opacity-80"><span>ต้องเฝ้าระวัง</span>${icon('eye', 'icon-lg')}</div>
        <div class="kpi-value mt-1" style="color:${A.repeat.length ? 'var(--bad)' : A.watch.length ? 'var(--warn)' : 'var(--ok)'}"><span data-count="${A.repeat.length + A.watch.length}" data-dec="0">${A.repeat.length + A.watch.length}</span> <span class="text-base font-semibold">เครื่อง</span></div>
        <div class="mt-1 text-xs">ไม่ผ่านต่อเนื่อง ${A.repeat.length} · ใกล้เกณฑ์ ${A.watch.length}</div></div>
      <div class="glass lift reveal p-4" style="--d:180ms"><div class="flex items-center justify-between text-sm font-semibold opacity-80"><span>ความครบถ้วนของข้อมูล</span>${icon('clipboard-check', 'icon-lg')}</div>
        <div class="kpi-value mt-1" style="color:${A.missing.length ? 'var(--warn)' : 'var(--ok)'}"><span data-count="${compl ?? ''}" data-dec="0">${compl === null ? '–' : Math.round(compl)}</span><span class="text-xl">%</span></div>
        <div class="mt-1 text-xs">บันทึกแล้ว ${A.recorded}/${A.active} หอ${A.nd ? ` · ND ${A.nd}` : ''}${A.missing.length ? ` · ยังไม่บันทึก ${A.missing.length}` : ''}</div></div>`;
    kpis.querySelectorAll('[data-count]').forEach((el) => { const v = parseFloat(el.dataset.count); if (!isNaN(v)) countUp(el, v, +el.dataset.dec); });

    /* insights */
    const ins = [];
    const add = (cls, ic, html) => ins.push(`<div class="insight ${cls} fade-in"><span class="ic">${icon(ic)}</span><div class="text-sm leading-snug">${html}</div></div>`);
    if (dPct !== null) {
      const r = Math.round(dPct * 10) / 10;
      add(r > 0 ? 'good' : r < 0 ? 'bad' : 'info', r > 0 ? 'trending-up' : r < 0 ? 'trending-down' : 'minus',
        r === 0 ? `ร้อยละผ่านเกณฑ์<b>คงที่</b>เมื่อเทียบกับ ${monthLabel(A.prev)}` : `ร้อยละผ่านเกณฑ์<b>${r > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(r).toFixed(1)} จุด</b> เมื่อเทียบกับ ${monthLabel(A.prev)} (${ps.pct.toFixed(1)}% → ${pct.toFixed(1)}%)`);
    }
    if (A.failing.length === 0 && s.n) add('good', 'circle-check', `เดือน ${monthLabel(A.last)} <b>ผ่านเกณฑ์ทุกเครื่อง</b> ที่ทำ QC (${s.n} เครื่อง)`);
    else if (A.failing.length) add('bad', 'siren', `<b>${A.failing.length} เครื่องไม่ผ่านเกณฑ์</b> ใน ${monthLabel(A.last)}: ${esc(A.failing.map(shortWard).join(', '))}`);
    if (A.repeat.length) add('bad', 'triangle-alert', `<b>${A.repeat.length} เครื่องไม่ผ่านต่อเนื่อง ≥ 2 เดือน</b> ควรตรวจสอบสาเหตุเชิงระบบ (เครื่อง/สารควบคุม/ผู้ใช้): ${esc(A.repeat.slice(0, 4).map((x) => shortWard(x.w) + ` (${x.streak} เดือน)`).join(', '))}${A.repeat.length > 4 ? '…' : ''}`);
    if (A.watch.length) add('warn', 'scan-eye', `<b>${A.watch.length} เครื่องผ่านแต่ใกล้เกณฑ์</b> (%CV ≥ ${watchAt().toFixed(2)}) อาจไม่ผ่านในเดือนถัดไป: ${esc(A.watch.slice(0, 4).map((x) => shortWard(x.w)).join(', '))}${A.watch.length > 4 ? '…' : ''}`);
    if (A.missing.length) add('warn', 'hourglass', `<b>ยังไม่มีข้อมูล ${monthLabel(A.last)} ของ ${A.missing.length} หอ</b> (หอที่เปิดใช้งาน): ${esc(A.missing.slice(0, 4).map(shortWard).join(', '))}${A.missing.length > 4 ? '…' : ''}`);
    if (A.nd) add('info', 'ban', `ND (ไม่ได้ทำ) ${A.nd} หอใน ${monthLabel(A.last)} – <b>ไม่นำมาคำนวณ</b>ร้อยละที่ผ่านเกณฑ์`);
    if (A.evaluated) add('good', 'trophy', `<b>${A.perfect} จาก ${A.evaluated} เครื่อง</b> (${((A.perfect / A.evaluated) * 100).toFixed(0)}%) ผ่านเกณฑ์ทุกเดือนใน${periodTxt()}`);
    const metN = A.mpcts.filter((v) => v !== null && v >= S.data.target).length, evN = A.mpcts.filter((v) => v !== null).length;
    if (evN > 1) add(metN === evN ? 'good' : metN / evN >= .5 ? 'info' : 'warn', 'target', `<b>${metN} จาก ${evN} เดือน</b> ถึงเป้าหมายร้อยละผ่านเกณฑ์ ${S.data.target}% ใน${periodTxt()}`);
    if (S.level === 'ALL' && A.l1 !== null && A.l2 !== null && Math.abs(A.l1 - A.l2) >= 1)
      add('info', 'git-compare', `ตลอด${periodTxt()} <b>${A.l1 < A.l2 ? 'L1' : 'L2'} ไม่ผ่านบ่อยกว่า</b> (เฉลี่ยผ่าน L1 ${A.l1.toFixed(1)}% · L2 ${A.l2.toFixed(1)}%)`);
    if (A.prevFyAvg !== null && A.avg !== null) {
      const d = A.avg - A.prevFyAvg;
      add(d >= 0 ? 'good' : 'bad', d >= 0 ? 'arrow-up-right' : 'arrow-down-right', `ค่าเฉลี่ยร้อยละผ่านเกณฑ์ปีงบ ${S.fy} = <b>${A.avg.toFixed(1)}%</b> ${d >= 0 ? 'สูงกว่า' : 'ต่ำกว่า'}ปีงบ ${S.fy - 1} (${A.prevFyAvg.toFixed(1)}%) อยู่ ${Math.abs(d).toFixed(1)} จุด`);
    } else if (A.avg !== null) add('info', 'info', `ค่าเฉลี่ยร้อยละผ่านเกณฑ์ ${periodTxt()} = <b>${A.avg.toFixed(1)}%</b>${A.months.length > 1 ? ` (${A.months.length} เดือน)` : ''}`);
    $('#insights').innerHTML = ins.join('');

    /* watchlist */
    const items = [];
    const seen = new Set();
    for (const f of A.failing) { const rp = A.repeat.find((x) => x.w.device === f.device); seen.add(f.device); items.push({ w: f, tag: rp ? `ไม่ผ่านต่อเนื่อง ${rp.streak} เดือน` : 'ไม่ผ่านเดือนล่าสุด', cls: 'badge-error', score: 100 + (rp?.streak || 0) }); }
    for (const x of A.repeat) if (!seen.has(x.w.device)) { seen.add(x.w.device); items.push({ w: x.w, tag: `ไม่ผ่านต่อเนื่อง ${x.streak} เดือน`, cls: 'badge-error', score: 50 + x.streak }); }
    for (const x of A.watch) if (!seen.has(x.w.device)) items.push({ w: x.w, tag: 'ใกล้เกณฑ์', cls: 'badge-warning', score: x.max });
    items.sort((a, b) => b.score - a.score);
    $('#watchlist').innerHTML = items.length ? items.slice(0, 8).map((it) => {
      const r = rowOf(it.w.device, A.last); const v = vals(r, S.level);
      return `<button type="button" class="lift flex w-full items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2 text-left" data-open="${esc(it.w.device)}">
        <span class="min-w-0 flex-1"><span class="block truncate text-sm font-bold">${esc(shortWard(it.w))}</span><span class="dev">${esc(it.w.device)}${v.length ? ' · %CV ' + v.map((x) => x.toFixed(2)).join(' / ') : ''}</span></span>
        <span class="badge badge-sm ${it.cls}">${it.tag}</span>${icon('chevron-right')}</button>`;
    }).join('') + (items.length > 8 ? `<div class="text-center text-xs opacity-70">และอีก ${items.length - 8} เครื่อง – ดูทั้งหมดในหัวข้อ 3</div>` : '')
      : `<div class="insight good"><span class="ic">${icon('shield-check')}</span><div class="text-sm">ไม่มีหอผู้ป่วยที่ต้องเฝ้าระวังในเดือนล่าสุด</div></div>`;
    initReveal();
  }

  function renderGroups() {
    const card = $('#groupCard'); const groups = [...new Set(S.data.wards.map((w) => w.group).filter(Boolean))];
    card.hidden = !groups.length; if (!groups.length) return;
    const months = monthsShown(); const last = months[months.length - 1]; if (!last) return;
    const keep = S.group; const lv = S.level;
    const stat = (g) => { let n = 0, p = 0, f = 0; for (const w of S.data.wards.filter((x) => x.group === g)) { const ok = passOf(rowOf(w.device, last) || NULLROW, lv, thr()); if (ok === null) continue; n++; if (ok) p++; else f++; } return { n, p, f, pct: n ? (p / n) * 100 : null }; };
    $('#groupList').innerHTML = groups.map((g) => { const s = stat(g); const c = s.pct === null ? 'var(--muted)' : s.pct >= S.data.target ? 'var(--ok)' : s.pct >= S.data.target - 10 ? 'var(--warn)' : 'var(--bad)';
      return `<button type="button" class="lift rounded-xl border border-[var(--line)] px-3 py-2 text-left ${keep === g ? 'ring-2 ring-primary' : ''}" data-grp="${esc(g)}"><div class="flex items-baseline justify-between"><b>${esc(g)}</b><span class="font-extrabold" style="color:${c}">${fmt1(s.pct)}${s.pct === null ? '' : '%'}</span></div>
        <div class="mt-1 h-2 overflow-hidden rounded-full" style="background:var(--nd-bg)"><div class="h-full rounded-full" style="width:${s.pct ?? 0}%;background:${c};transition:width .8s"></div></div>
        <div class="mt-1 text-xs opacity-70">${monthLabel(last)} · ผ่าน ${s.p}/${s.n}${s.f ? ` · ไม่ผ่าน ${s.f}` : ''}</div></button>`; }).join('');
  }

  /* ------------------------------------------------------------ 1. bar chart */
  function renderBar() {
    const months = monthsShown(); const lv = S.level;
    const labels = months.map((m) => monthLabel(m));
    const defs = lv === 'ALL'
      ? [{ k: 'L1', name: 'L1', color: css('--l1') }, { k: 'L2', name: 'L2', color: css('--l2') }, { k: 'ALL', name: 'ผ่านทั้ง L1 และ L2', color: css('--all') }]
      : [{ k: lv, name: lv, color: css(lv === 'L1' ? '--l1' : '--l2') }];
    const stats = defs.map((d) => months.map((m) => monthStat(m, d.k)));
    const datasets = defs.map((d, i) => ({
      label: d.name, data: stats[i].map((s) => s.pct), backgroundColor: d.color, borderRadius: { topLeft: 6, topRight: 6 },
      borderSkipped: 'bottom', maxBarThickness: defs.length === 1 ? 44 : 24, categoryPercentage: .82, barPercentage: .92,
      showLabels: defs.length === 1 && months.length <= 13, order: 2
    }));
    // previous fiscal year overlay (same calendar months)
    let prevStats = null;
    const canCmp = S.fy !== 'all' && monthsOf(S.fy - 1).length > 0;
    $('#chkCmp').disabled = !canCmp;
    if (S.cmp && canCmp) {
      const cur = fiscalMonths(S.fy), old = fiscalMonths(S.fy - 1);
      const key = lv === 'ALL' ? 'ALL' : lv;
      prevStats = months.map((m) => { const i = cur.indexOf(m); return monthStat(old[i], key); });
      datasets.push({
        type: 'line', label: `ปีงบ ${S.fy - 1} (${lv === 'ALL' ? 'ผ่านทั้งคู่' : lv})`, data: prevStats.map((s) => s.pct), borderColor: css('--prev'), backgroundColor: css('--prev'),
        borderDash: [6, 4], borderWidth: 2.5, pointRadius: 3.5, pointStyle: 'rectRot', tension: .15, order: 0, spanGaps: false
      });
    }
    datasets.push({ type: 'line', label: `เป้าหมาย ${S.data.target}%`, data: months.map(() => S.data.target), borderColor: css('--ok'), borderDash: [2, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, order: 0 });
    const opt = baseOptions();
    opt.scales.y.max = 112; opt.scales.y.ticks.callback = (v) => (v <= 100 ? v + '%' : '');
    opt.scales.y.title = { display: true, text: 'ร้อยละที่ผ่านเกณฑ์', color: css('--ink-2') };
    opt.plugins.legend.display = true;
    opt.plugins.tooltip.callbacks = {
      label: (c) => {
        if (c.dataset.label.startsWith('เป้าหมาย')) return ` ${c.dataset.label}`;
        const s = c.dataset.type === 'line' ? prevStats[c.dataIndex] : stats[c.datasetIndex][c.dataIndex];
        return s.n ? ` ${c.dataset.label}: ${s.pct.toFixed(1)}% (ผ่าน ${s.p}/${s.n} เครื่อง)` : ` ${c.dataset.label}: ไม่มีข้อมูล`;
      }
    };
    draw('bar', $('#barChart'), { type: 'bar', data: { labels, datasets }, options: opt, plugins: [valueLabels] });
    $('#sub1').textContent = `เกณฑ์ผ่าน: %CV < ${thr()}% · ` + (lv === 'ALL' ? 'แท่งสีม่วง = เครื่องที่ผ่านทั้ง L1 และ L2 พร้อมกัน' : `เฉพาะ ${lv}`) + ' · ND ไม่นำมาคำนวณ';
    let h = '<thead><tr><th>เดือน</th>' + defs.map((d) => `<th>${esc(d.name)} ผ่าน/ทั้งหมด</th><th>${esc(d.name)} %</th>`).join('') + '</tr></thead><tbody>';
    months.forEach((m, j) => {
      h += `<tr><td>${monthLabel(m, true)}</td>` + defs.map((d, i) => { const s = stats[i][j]; return `<td>${s.n ? `${s.p}/${s.n}` : '–'}</td><td>${s.n ? s.pct.toFixed(1) : '–'}</td>`; }).join('') + '</tr>';
    });
    $('#barTable').innerHTML = h + '</tbody>';
  }

  /* ------------------------------------------------------------ 2. line chart + picker */
  const wardColor = (i) => css('--s' + ((i % 8) + 1));
  function renderPicker() {
    const q = $('#wardSearch').value.trim().toLowerCase();
    const full = S.selected.length >= MAX_SEL;
    const ordered = [...W()].sort((a, b) => {
      const ia = S.selected.indexOf(a.device), ib = S.selected.indexOf(b.device);
      return (ia < 0) - (ib < 0) || (ia >= 0 ? ia - ib : a.no - b.no);
    });
    $('#wardList').innerHTML = ordered.filter((w) => !q || (w.ward + ' ' + w.device).toLowerCase().includes(q)).map((w) => {
      const idx = S.selected.indexOf(w.device), on = idx >= 0;
      return `<label class="${!on && full ? 'off' : ''}"><input type="checkbox" class="checkbox checkbox-xs checkbox-primary" value="${esc(w.device)}" ${on ? 'checked' : ''} ${!on && full ? 'disabled' : ''}>
        <span class="sw" style="background:${on ? wardColor(idx) : 'var(--line)'}"></span><span>${esc(w.ward)}<br><span class="dev">${esc(w.device)}</span></span></label>`;
    }).join('') || '<div class="p-4 text-center text-sm opacity-70">ไม่พบหอผู้ป่วย</div>';
    $('#chips').innerHTML = S.selected.map((d, i) => `<span class="chip"><span class="sw" style="background:${wardColor(i)}"></span>${esc(shortWard(wardByDev(d) || { ward: d }))}<button type="button" data-rm="${esc(d)}" aria-label="เอาออก">${icon('x')}</button></span>`).join('');
    $('#pickHint').textContent = `เลือกแล้ว ${S.selected.length}/${MAX_SEL} หอ` + (full ? ' · ยกเลิกบางหอเพื่อเลือกเพิ่ม' : '');
  }
  function topFailing(n) {
    const months = monthsShown();
    return W().map((w) => ({ d: w.device, ...wardStats(w.device, months, S.level) })).filter((x) => x.fails > 0)
      .sort((a, b) => b.fails - a.fails || (b.max ?? 0) - (a.max ?? 0)).slice(0, n).map((x) => x.d);
  }
  function renderLine() {
    const months = monthsShown(); const labels = months.map((m) => monthLabel(m)); const lv = S.level;
    const ds = [];
    const series = (label, get, color, dash, extra = {}) => ds.push({
      label, data: months.map(get), borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 3.5, pointHoverRadius: 6,
      pointBorderColor: css('--solid'), pointBorderWidth: 2, borderDash: dash, spanGaps: false, tension: 0.15, ...extra
    });
    if (S.mean) {
      const avg = (k) => (m) => { const v = W().map((w) => rowOf(w.device, m)?.[k]).filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const mc = css('--muted');
      if (lv !== 'L2') series(lv === 'ALL' ? 'เฉลี่ยทุกหอ · L1' : 'เฉลี่ยทุกหอ', avg('l1'), mc, [], { borderWidth: 3, pointRadius: 0, pointHoverRadius: 4 });
      if (lv !== 'L1') series(lv === 'ALL' ? 'เฉลี่ยทุกหอ · L2' : 'เฉลี่ยทุกหอ', avg('l2'), mc, [6, 4], { borderWidth: 3, pointRadius: 0, pointHoverRadius: 4 });
    }
    S.selected.forEach((d, i) => {
      const c = wardColor(i), nm = shortWard(wardByDev(d) || { ward: d });
      if (lv !== 'L2') series(lv === 'ALL' ? `${nm} · L1` : nm, (m) => rowOf(d, m)?.l1 ?? null, c, []);
      if (lv !== 'L1') series(lv === 'ALL' ? `${nm} · L2` : nm, (m) => rowOf(d, m)?.l2 ?? null, c, lv === 'ALL' ? [6, 4] : [], lv === 'ALL' ? { pointStyle: 'rectRot' } : {});
    });
    ds.push({ label: `เกณฑ์ผ่าน < ${thr()}%`, data: months.map(() => thr()), borderColor: css('--bad'), borderDash: [2, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, fill: false });
    const opt = baseOptions();
    opt.scales.y.suggestedMax = Math.max(thr() * 1.5, 10);
    opt.scales.y.title = { display: true, text: '%CV', color: css('--ink-2') };
    opt.plugins.tooltip.itemSort = (a, b) => (b.raw ?? -1) - (a.raw ?? -1);
    opt.plugins.tooltip.callbacks = {
      label: (c) => c.raw === null || c.raw === undefined ? null : c.dataset.label.startsWith('เกณฑ์') ? ` ${c.dataset.label}` : ` ${c.dataset.label}: ${c.raw.toFixed(2)}%${c.raw >= thr() ? '  ▲ ไม่ผ่าน' : ''}`
    };
    draw('line', $('#lineChart'), { type: 'line', data: { labels, datasets: ds }, options: opt, plugins: [crosshair] });
    $('#sub2').textContent = (lv === 'ALL' ? 'เส้นทึบ = L1 · เส้นประ = L2 · ' : `แสดง ${lv} · `) + `เส้นแดงประ = เกณฑ์ผ่าน (< ${thr()}%) · เลือกได้สูงสุด ${MAX_SEL} หอ`;
  }

  /* ------------------------------------------------------------ 3. heatmap matrix */
  function matrixRows() {
    const months = monthsShown(); const q = $('#tblSearch').value.trim().toLowerCase(); const onlyFail = $('#onlyFail').checked;
    let rows = W().filter((w) => !q || (w.ward + ' ' + w.device).toLowerCase().includes(q))
      .map((w) => ({ w, ...wardStats(w.device, months, S.level) })).filter((x) => !onlyFail || x.fails > 0);
    const sort = $('#sortSel').value;
    if (sort === 'fails') rows.sort((a, b) => b.fails - a.fails || (b.max ?? 0) - (a.max ?? 0));
    else if (sort === 'max') rows.sort((a, b) => (b.max ?? -1) - (a.max ?? -1));
    return { months, rows };
  }
  const cls = (v) => (v >= thr() ? 'bad' : v >= watchAt() ? 'watch' : 'ok');
  function cell(r) {
    const lv = S.level;
    if (!r) return '<td class="cell-none">–</td>';
    if (isND(r)) return `<td class="cell-nd" title="ND = ไม่ได้ทำ (ไม่นำมาคำนวณ)">ND</td>`;
    const vs = vals(r, lv);
    if (!vs.length) return `<td class="cell-none" ${r.note ? `title="${esc(r.note)}"` : ''}>–</td>`;
    const one = (v) => (v === null ? '–' : v.toFixed(2));
    const worst = Math.max(...vs), c = cls(worst);
    const txt = lv === 'L1' ? one(r.l1) : lv === 'L2' ? one(r.l2) : `${one(r.l1)} / ${one(r.l2)}`;
    return `<td class="${c === 'bad' ? 'cell-bad mark-bad' : c === 'watch' ? 'cell-watch mark-watch' : ''}">${txt}</td>`;
  }
  function renderMatrix() {
    const { months, rows } = matrixRows();
    let h = '<thead><tr><th class="sticky-l">หอผู้ป่วย</th>' + months.map((m) => `<th>${monthLabel(m)}</th>`).join('') + '<th>ไม่ผ่าน (ครั้ง)</th><th>สูงสุด</th></tr></thead><tbody>';
    for (const { w, fails, max } of rows) {
      h += `<tr tabindex="0" role="button" data-dev="${esc(w.device)}" aria-label="ดูรายละเอียด ${esc(w.ward)}"><td class="sticky-l"><b>${esc(w.ward)}</b>${w.active ? '' : ' <span class="badge badge-ghost badge-xs">ปิดใช้งาน</span>'}<br><span class="dev">${esc(w.device)}</span></td>`
        + months.map((m) => cell(rowOf(w.device, m))).join('')
        + `<td class="${fails ? 'cell-bad' : ''}">${fails}</td><td>${max === null ? '–' : max.toFixed(2)}</td></tr>`;
    }
    if (!rows.length) h += `<tr><td colspan="${months.length + 3}" class="p-6 text-center opacity-70" style="text-align:center">ไม่พบข้อมูลตามเงื่อนไข</td></tr>`;
    $('#matrix').innerHTML = h + '</tbody>';
  }
  function downloadCsv() {
    const { months, rows } = matrixRows(); const lv = S.level;
    const head = ['หอผู้ป่วย', 'หมายเลขเครื่อง']; months.forEach((m) => { if (lv !== 'L2') head.push(`${monthLabel(m)} L1`); if (lv !== 'L1') head.push(`${monthLabel(m)} L2`); });
    const lines = [head];
    rows.forEach(({ w }) => {
      const l = [w.ward, w.device];
      months.forEach((m) => { const r = rowOf(w.device, m); const nd = isND(r); if (lv !== 'L2') l.push(nd ? 'ND' : r?.l1 ?? ''); if (lv !== 'L1') l.push(nd ? 'ND' : r?.l2 ?? ''); });
      lines.push(l);
    });
    const csv = '﻿' + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `cv-${S.fy === 'all' ? 'all' : 'FY' + S.fy}-${lv}.csv`; a.click(); URL.revokeObjectURL(a.href);
    toast('ดาวน์โหลด CSV แล้ว', 'success');
  }

  /* ------------------------------------------------------------ ward detail dialog */
  function openDetail(dev) {
    const w = wardByDev(dev); if (!w) return;
    const months = S.fy === 'all' ? monthsOf('all') : monthsOf(S.fy), t = thr();
    $('#dTitle').textContent = w.ward;
    $('#dSub').textContent = `เครื่อง ${w.device} · ${S.fy === 'all' ? 'ทุกปีงบประมาณ' : 'ปีงบประมาณ ' + S.fy} · เกณฑ์ผ่าน %CV < ${t}%`;
    const st = wardStats(dev, months, 'ALL');
    const lastR = [...months].reverse().map((m) => rowOf(dev, m)).find((r) => hasValue(r));
    $('#dChips').innerHTML = `<span class="badge ${st.fails ? 'badge-error' : 'badge-success'} gap-1">${icon(st.fails ? 'triangle-alert' : 'circle-check')} ไม่ผ่าน ${st.fails}/${st.n} เดือน</span>
      <span class="badge badge-ghost gap-1">${icon('arrow-up-right')} %CV สูงสุด ${st.max === null ? '–' : st.max.toFixed(2)}</span>
      ${st.watch ? `<span class="badge badge-warning gap-1">${icon('scan-eye')} ใกล้เกณฑ์ ${st.watch} ค่า</span>` : ''}
      ${lastR ? `<span class="badge badge-ghost gap-1">${icon('clock')} ล่าสุด ${monthLabel(lastR.month)}: L1 ${lastR.l1 === null ? '–' : lastR.l1.toFixed(2)} · L2 ${lastR.l2 === null ? '–' : lastR.l2.toFixed(2)}</span>` : ''}`;
    const opt = baseOptions(); opt.scales.y.suggestedMax = Math.max(t * 1.5, 10); opt.scales.y.title = { display: true, text: '%CV', color: css('--ink-2') };
    opt.plugins.tooltip.callbacks = { label: (c) => c.raw == null ? null : c.dataset.label.startsWith('เกณฑ์') ? ` ${c.dataset.label}` : ` ${c.dataset.label}: ${c.raw.toFixed(2)}%${c.raw >= t ? '  ▲ ไม่ผ่าน' : ''}` };
    const mk = (label, key, color, dash) => ({ label, data: months.map((m) => rowOf(dev, m)?.[key] ?? null), borderColor: color, backgroundColor: color, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: css('--solid'), pointBorderWidth: 2, borderDash: dash, tension: .15 });
    $('#detail').showModal();
    draw('detail', $('#detailChart'), { type: 'line', plugins: [crosshair], options: opt, data: { labels: months.map((m) => monthLabel(m)), datasets: [
      mk('L1', 'l1', css('--l1'), []), mk('L2', 'l2', css('--l2'), [6, 4]),
      { label: `เกณฑ์ผ่าน < ${t}%`, data: months.map(() => t), borderColor: css('--bad'), borderDash: [2, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 0 }] } });
    let h = '<thead><tr><th>เดือน</th><th>L1</th><th>L2</th><th style="text-align:left">ผล</th><th style="text-align:left">หมายเหตุ</th></tr></thead><tbody>';
    for (const m of [...months].reverse()) {
      const r = rowOf(dev, m), nd = isND(r), ok = r && !nd ? passOf(r, 'ALL', t) : null;
      const c = (v) => nd ? '<td class="cell-nd">ND</td>' : v === null || v === undefined ? '<td class="cell-none">–</td>' : `<td class="${v >= t ? 'cell-bad mark-bad' : v >= watchAt() ? 'cell-watch mark-watch' : ''}">${v.toFixed(2)}</td>`;
      const pill = nd ? '<span class="badge badge-sm badge-ghost">ND ไม่ได้ทำ</span>' : ok === null ? '<span class="badge badge-sm badge-ghost">ไม่มีข้อมูล</span>' : ok ? '<span class="badge badge-sm badge-success">ผ่าน</span>' : '<span class="badge badge-sm badge-error">ไม่ผ่าน</span>';
      h += `<tr><td>${monthLabel(m, true)}</td>${c(r?.l1)}${c(r?.l2)}<td style="text-align:left">${pill}</td><td style="text-align:left;white-space:normal">${nd ? '' : esc(r?.note || '')}</td></tr>`;
    }
    $('#detailTable').innerHTML = h + '</tbody>';
  }

  /* ------------------------------------------------------------ state, toast, wiring */
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = `alert alert-${kind || 'info'} toast-pop py-2 text-sm shadow-lg`; el.innerHTML = `<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el); setTimeout(() => el.remove(), 2600);
  }
  function syncUrl() {
    const p = new URLSearchParams();
    p.set('fy', S.fy); p.set('lv', S.level); if (S.group) p.set('g', S.group); if (S.month) p.set('m', S.month);
    if (S.selected.length) p.set('w', S.selected.join(','));
    if (S.cmp) p.set('cmp', '1');
    history.replaceState(null, '', '?' + p.toString() + location.hash);
  }
  function fillMonths() {
    const ms = monthsOf(S.fy); if (S.month && !ms.includes(S.month)) S.month = '';
    $('#monSel').innerHTML = '<option value="">ทั้ง' + (S.fy === 'all' ? 'หมด' : 'ปีงบประมาณ') + '</option>' + [...ms].reverse().map((m) => `<option value="${m}">${monthLabel(m, true)}</option>`).join('');
    $('#monSel').value = S.month;
    const i = ms.indexOf(S.month); $('#monPrev').disabled = !S.month || i <= 0; $('#monNext').disabled = !S.month || i >= ms.length - 1;
  }
  function renderAll() {
    fillMonths();
    $('#thrNote').innerHTML = `${icon('target')} เกณฑ์ผ่าน %CV &lt; <b>${thr()}</b>`;
    $('#watchPct').textContent = Math.round(WATCH_RATIO * 100);
    document.querySelectorAll('#lvlSeg button').forEach((b) => { const on = b.dataset.level === S.level; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('btn-active', on); b.classList.toggle('btn-primary', on); });
    $('#printTitle').textContent = `รายงาน %CV POCT Glucose · รพ.ศรีนครินทร์ · ${periodTxt()} · ${LV_TXT()}${S.group ? ' · กลุ่ม ' + S.group : ''} · พิมพ์เมื่อ ${new Date().toLocaleDateString('th-TH')}`;
    renderSummary(); renderGroups();
    if (!monthsShown().length) {
      for (const k of ['bar', 'line']) S.charts[k]?.destroy();
      $('#barTable').innerHTML = ''; $('#matrix').innerHTML = '<tbody><tr><td class="p-6" style="text-align:center">ยังไม่มีข้อมูลในปีงบประมาณนี้</td></tr></tbody>';
      return;
    }
    renderBar(); renderPicker(); renderLine(); renderMatrix(); syncUrl();
  }
  function setBanner(html) { const b = $('#banner'); b.hidden = !html; $('#bannerText').innerHTML = html || ''; }

  async function init() {
    hydrateIcons(); initReveal();
    $('#btnTheme').onclick = () => { const t = Theme.toggle(); $('#btnTheme').firstElementChild.firstElementChild?.setAttribute('href', `img/icons.svg#${t === 'dark' ? 'sun' : 'moon'}`); };
    $('#btnTheme').firstElementChild.firstElementChild?.setAttribute('href', `img/icons.svg#${Theme.current() === 'dark' ? 'sun' : 'moon'}`);
    $('#btnPrint').onclick = () => window.print();
    // make canvases crisp at print size, then restore
    const resizeCharts = () => Object.values(S.charts).forEach((c) => c && c.resize());
    window.addEventListener('beforeprint', () => { document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')); resizeCharts(); });
    window.addEventListener('afterprint', resizeCharts);
    $('#btnShare').onclick = async () => { try { await navigator.clipboard.writeText(location.href); toast('คัดลอกลิงก์ (รวมตัวกรองที่เลือก) แล้ว', 'success'); } catch { toast('คัดลอกไม่สำเร็จ – คัดลอกจากแถบที่อยู่ได้เลย', 'warning'); } };

    let data;
    try { data = await CV.loadData(); } catch (e) { setBanner('โหลดข้อมูลไม่สำเร็จ: ' + esc(e.message)); return; }
    S.data = data; index();
    if (data.source === 'seed') setBanner(CV.cfg.API_BASE
      ? `เชื่อมต่อ Google Sheet ไม่สำเร็จ (${esc(data.error?.message || '')}) – กำลังแสดงข้อมูลสำรองจากไฟล์ Excel ปี 2568–2569`
      : 'โหมดตัวอย่าง – กำลังแสดงข้อมูลสำรองจากไฟล์ Excel ปี 2568–2569 (API_BASE ใน config.js เว้นว่างไว้)');

    const fys = [...new Set(data.rows.map((r) => r.fy))].sort((a, b) => b - a);
    $('#fySel').innerHTML = fys.map((f) => `<option value="${f}">${f}</option>`).join('') + '<option value="all">ทุกปี (รวม)</option>';
    const q = new URLSearchParams(location.search);
    S.fy = q.get('fy') === 'all' ? 'all' : fys.includes(Number(q.get('fy'))) ? Number(q.get('fy')) : (fys[0] ?? 'all');
    S.level = ['L1', 'L2', 'ALL'].includes(q.get('lv')) ? q.get('lv') : 'ALL';
    const groups = [...new Set(data.wards.map((w) => w.group).filter(Boolean))];
    $('#grpWrap').hidden = !groups.length;
    $('#grpSel').innerHTML = '<option value="">ทุกกลุ่มหอ</option>' + groups.map((g) => `<option>${esc(g)}</option>`).join('');
    S.group = groups.includes(q.get('g')) ? q.get('g') : ''; $('#grpSel').value = S.group;
    S.cmp = q.get('cmp') === '1'; $('#chkCmp').checked = S.cmp;
    $('#fySel').value = S.fy;
    { const m = q.get('m'); S.month = m && monthsOf(S.fy).includes(m) ? m : ''; }
    const w = (q.get('w') || '').split(',').filter((d) => wardByDev(d));
    S.selected = w.length ? w.slice(0, MAX_SEL) : topFailing(3);

    $('#fySel').onchange = (e) => { S.fy = e.target.value === 'all' ? 'all' : Number(e.target.value); S.month = ''; S.selected = topFailing(3); renderAll(); };
    const setMonth = (m) => { S.month = m; S.selected = topFailing(3); renderAll(); };
    $('#monSel').onchange = (e) => setMonth(e.target.value);
    $('#monPrev').onclick = () => { const ms = monthsOf(S.fy), i = ms.indexOf(S.month); if (i > 0) setMonth(ms[i - 1]); };
    $('#monNext').onclick = () => { const ms = monthsOf(S.fy), i = ms.indexOf(S.month); if (i >= 0 && i < ms.length - 1) setMonth(ms[i + 1]); };
    $('#lvlSeg').onclick = (e) => { const b = e.target.closest('button[data-level]'); if (!b) return; S.level = b.dataset.level; renderAll(); };
    const setGroup = (g) => { S.group = g; $('#grpSel').value = g; S.selected = topFailing(3); renderAll(); };
    $('#grpSel').onchange = (e) => setGroup(e.target.value);
    $('#groupList').onclick = (e) => { const b = e.target.closest('[data-grp]'); if (b) setGroup(S.group === b.dataset.grp ? '' : b.dataset.grp); };
    $('#chkCmp').onchange = (e) => { S.cmp = e.target.checked; renderBar(); syncUrl(); };
    $('#wardSearch').oninput = renderPicker;
    $('#wardList').onchange = (e) => {
      const d = e.target.value; const i = S.selected.indexOf(d);
      if (e.target.checked && i < 0 && S.selected.length < MAX_SEL) S.selected.push(d); else if (!e.target.checked && i >= 0) S.selected.splice(i, 1);
      renderPicker(); renderLine(); syncUrl();
    };
    $('#chips').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; S.selected = S.selected.filter((d) => d !== b.dataset.rm); renderPicker(); renderLine(); syncUrl(); };
    $('#btnClear').onclick = () => { S.selected = []; renderPicker(); renderLine(); syncUrl(); };
    $('#btnTopFail').onclick = () => { S.selected = topFailing(5); renderPicker(); renderLine(); syncUrl(); };
    $('#chkMean').onchange = (e) => { S.mean = e.target.checked; renderLine(); };
    for (const id of ['#tblSearch', '#onlyFail', '#sortSel']) $(id).addEventListener(id === '#tblSearch' ? 'input' : 'change', renderMatrix);
    $('#btnCsv').onclick = downloadCsv;
    $('#matrix').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-dev]'); if (tr) openDetail(tr.dataset.dev); });
    $('#matrix').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest('tr[data-dev]'); if (tr) { e.preventDefault(); openDetail(tr.dataset.dev); } } });
    $('#watchlist').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openDetail(b.dataset.open); });
    $('#detail').addEventListener('close', () => { S.charts.detail?.destroy(); });
    document.addEventListener('themechange', () => { if (S.data && monthsShown().length) { renderBar(); renderLine(); renderPicker(); } });

    // scrollspy
    const links = [...document.querySelectorAll('.nav-link[data-sec]')];
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) links.forEach((l) => l.classList.toggle('active', l.dataset.sec === en.target.id)); }), { rootMargin: '-35% 0px -55% 0px' });
      links.forEach((l) => { const s = document.getElementById(l.dataset.sec); if (s) io.observe(s); });
    }

    $('#foot').innerHTML = `${icon('database')} ข้อมูลจาก ${data.source === 'api' ? 'Google Sheet' : 'ไฟล์สำรอง (seed)'}` + (data.generatedAt ? `<span class="sep">·</span>อัปเดตล่าสุด ${new Date(data.generatedAt).toLocaleString('th-TH')}` : '') + `<span class="sep">·</span>เกณฑ์ผ่าน %CV &lt; ${data.threshold}<span class="sep">·</span>ND = ไม่ได้ทำ (ไม่นำมาคำนวณ)`;
    try { await Promise.all([document.fonts.load('500 14px Sarabun'), document.fonts.load('700 14px Sarabun')]); } catch { /* fonts optional */ }
    renderAll();
  }
  init();
})();
