
'use strict';
const FS = k => (DATA && DATA.fields[k] && DATA.fields[k].short) || k;
const NM = t => t == null ? t : String(t).replace(/(^|[^A-Za-z0-9_\-])([DXYZ])(?![A-Za-z0-9_])/g, (m, p, l) => p + FS(l));

/* ============================================================
   Helpers
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const FIELDS = ['Y', 'X', 'Z', 'D'];
const FC = k => `var(--${DATA.fields[k].color})`;
const FN = k => DATA.fields[k].name;
const MN = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MNF = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const PAL = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c5)', 'var(--c6)', 'var(--c4)', 'var(--c7)', 'var(--c8)'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nfCache = {};
function fmt(v, d) {
  if (v == null || isNaN(v)) return '—';
  if (d == null) { const a = Math.abs(v); d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3; }
  const k = d;
  nfCache[k] = nfCache[k] || new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d });
  return nfCache[k].format(v);
}
const fmtF = (v, d) => v == null || isNaN(v) ? '—' : new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const pct = (v, d = 1) => v == null || isNaN(v) ? '—' : fmtF(v * 100, d) + '%';
const sum = a => a.reduce((s, v) => s + (v || 0), 0);
const avg = a => { const b = a.filter(v => v != null); return b.length ? sum(b) / b.length : null; };
const mLabel = m => { const [y, mm] = m.split('-'); return MN[+mm - 1] + ' ' + y.slice(2); };
const mLong = m => { const [y, mm] = m.split('-'); return MNF[+mm - 1] + ' ' + y; };
const ratio = (a, b) => (a == null || !b) ? null : a / b;
function pill(r, goodHigh = true, label) {
  if (r == null) return '<span class="pill neutral">нет данных</span>';
  const ok = goodHigh ? r >= 1 : r <= 1;
  const near = Math.abs(r - 1) < 0.02;
  const cls = ok ? 'good' : near ? 'warn' : 'bad';
  return `<span class="pill ${cls}">${label || pct(r)}</span>`;
}
function lastIdx(arr) { let l = -1; arr.forEach((v, i) => { if (v != null) l = i; }); return l; }

/* ============================================================
   Chart engine (SVG)
   ============================================================ */
const CHARTS = [];
let chartSeq = 0;
function chartBox(spec) {
  const id = 'ch' + (++chartSeq);
  CHARTS.push({ id, spec, sig: (spec.title || '') + '|' + JSON.stringify(spec.cats) + JSON.stringify(spec.series.map(s => [s.name, s.values])) });
  return `<div class="legend">${legendHTML(spec)}</div><div class="chart" id="${id}"></div>`;
}
function swatch(s) {
  if (s.kind === 'line') return `<svg width="18" height="10" aria-hidden="true"><line x1="1" y1="5" x2="17" y2="5" style="stroke:${s.color};stroke-width:2.5" ${s.dash ? 'stroke-dasharray="4 3"' : ''}/></svg>`;
  if (s.hatch) return `<svg width="12" height="12" aria-hidden="true"><defs><pattern id="lg${(s.color + '').replace(/\W/g, '')}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" style="fill:${s.color};opacity:.18"/><line x1="0" y1="0" x2="0" y2="4" style="stroke:${s.color};stroke-width:1.6"/></pattern></defs><rect x=".5" y=".5" width="11" height="11" rx="2" fill="url(#lg${(s.color + '').replace(/\W/g, '')})" style="stroke:${s.color}"/></svg>`;
  return `<span class="dot" style="background:${s.color}"></span>`;
}
function legendHTML(spec) {
  if (spec.noLegend) return '';
  return spec.series.filter(s => !s.noLegend).map(s => `<span>${swatch(s)}${esc(s.name)}</span>`).join('');
}
function nice(min, max, count = 5) {
  if (min === max) { if (max === 0) max = 1; else if (max > 0) min = 0; else max = 0; }
  const span = max - min;
  let step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / count / step;
  if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
  const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
  const t = []; for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(10));
  return { lo, hi, t, step };
}
const _lblCtx = document.createElement('canvas').getContext('2d'), _lblCache = {}, _lumCache = {};
function isDark(color) {   // тёмная заливка → белая подпись
  const key = color + '|' + (document.documentElement.dataset.theme || '');
  if (key in _lumCache) return _lumCache[key];
  let c = color; const m = /var\((--[\w-]+)\)/.exec(c); if (m) c = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  _lblCtx.fillStyle = '#000'; _lblCtx.fillStyle = c; const h = _lblCtx.fillStyle;
  let r = 0, g = 0, b = 0;
  if (/^#[0-9a-f]{6}$/i.test(h)) { r = parseInt(h.slice(1, 3), 16); g = parseInt(h.slice(3, 5), 16); b = parseInt(h.slice(5, 7), 16); }
  else { const q = h.match(/\d+/g) || [0, 0, 0]; [r, g, b] = q.map(Number); }
  return (_lumCache[key] = (0.299 * r + 0.587 * g + 0.114 * b) < 140);
}
function measureLbl(t, fs) {
  const k = fs + '|' + t; if (_lblCache[k]) return _lblCache[k];
  _lblCtx.font = `800 ${fs}px ${getComputedStyle(document.body).fontFamily}`;
  return (_lblCache[k] = _lblCtx.measureText(t).width);
}
function drawChart(el, spec) {
  const W = Math.max(260, el.clientWidth);
  const A = el.dataset.anim === '1'; delete el.dataset.anim; el.classList.toggle('fx', A);
  const narrow = W < 520;
  const H = spec.height || (narrow ? 230 : 270);
  const series = spec.series;
  const cats = spec.cats, n = cats.length;
  const hasRight = series.some(s => s.axis === 'right');
  const yf = spec.yFmt || (v => fmt(v));
  const rf = spec.rFmt || (v => fmt(v));
  // ---- domains
  const bars = series.filter(s => s.kind !== 'line');
  const stacks = [...new Set(bars.map(s => s.stack || s.name))];
  let lmin = Infinity, lmax = -Infinity;
  for (let i = 0; i < n; i++) for (const st of stacks) {
    let pos = 0, neg = 0, any = false;
    for (const s of bars) if ((s.stack || s.name) === st) { const v = s.values[i]; if (v == null) continue; any = true; v >= 0 ? pos += v : neg += v; }
    if (any) { lmax = Math.max(lmax, pos); lmin = Math.min(lmin, neg); }
  }
  for (const s of series) if (s.kind === 'line' && s.axis !== 'right') for (const v of s.values) if (v != null) { lmax = Math.max(lmax, v); lmin = Math.min(lmin, v); }
  if (!isFinite(lmax)) { lmax = 1; lmin = 0; }
  const zero = spec.zero !== false || bars.length;
  const LBL = spec.labels !== false;
  if (LBL && bars.length) { if (lmax > 0) lmax *= 1.1; if (lmin < 0) lmin *= 1.1; }
  if (zero) { lmin = Math.min(0, lmin); lmax = Math.max(0, lmax); }
  else { const pad = (lmax - lmin) * 0.08 || Math.abs(lmax) * 0.05 || 1; lmin -= pad; lmax += pad; }
  if (spec.yMin != null) lmin = spec.yMin; if (spec.yMax != null) lmax = Math.max(spec.yMax, spec.yMaxSoft ? lmax : spec.yMax);
  const L = nice(lmin, lmax, narrow ? 4 : 5);
  let R = null;
  if (hasRight) {
    let rmin = Infinity, rmax = -Infinity;
    for (const s of series) if (s.axis === 'right') for (const v of s.values) if (v != null) { rmin = Math.min(rmin, v); rmax = Math.max(rmax, v); }
    if (!isFinite(rmax)) { rmin = 0; rmax = 1; }
    if (spec.rZero !== false) rmin = Math.min(0, rmin);
    R = nice(rmin, rmax, L.t.length - 1);
  }
  // ---- margins
  const lw = Math.max(...L.t.map(v => String(yf(v)).length)) * 6.6 + 10;
  const rw = R ? Math.max(...R.t.map(v => String(rf(v)).length)) * 6.6 + 12 : 8;
  const m = { l: Math.max(30, lw), r: Math.max(8, rw), t: LBL ? 16 : 10, b: 24 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const band = iw / n;
  const y = v => m.t + ih - (v - L.lo) / (L.hi - L.lo) * ih;
  const yr = v => m.t + ih - (v - R.lo) / (R.hi - R.lo) * ih;
  const cx = i => m.l + band * i + band / 2;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(spec.title || 'график')}"><defs>`;
  const pats = {};
  series.forEach(s => {
    if (s.hatch && !pats[s.color]) {
      const pid = 'p' + Math.random().toString(36).slice(2, 8);
      pats[s.color] = pid;
      svg += `<pattern id="${pid}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" style="fill:${s.color};opacity:.16"/><line x1="0" y1="0" x2="0" y2="5" style="stroke:${s.color};stroke-width:1.8"/></pattern>`;
    }
  });
  svg += '</defs><g class="hlg"></g>';
  // grid + left ticks
  L.t.forEach(v => {
    svg += `<line class="${v === 0 ? 'base' : 'gl'}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(yf(v))}</text>`;
  });
  if (R) R.t.forEach(v => { svg += `<text x="${W - m.r + 6}" y="${yr(v) + 4}">${esc(rf(v))}</text>`; });
  // reference lines
  (spec.refs || []).forEach(r => {
    const yy = y(r.v);
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" style="stroke:${r.color || 'var(--ink-2)'};stroke-width:1.2" stroke-dasharray="5 4"/>`;
    if (r.label) svg += `<text x="${W - m.r - 4}" y="${yy - 5}" text-anchor="end" style="fill:${r.color || 'var(--ink-2)'};font-weight:600">${esc(r.label)}</text>`;
  });
  // bars
  const gw = band * (spec.barWidth || (stacks.length > 1 ? 0.8 : 0.66));
  const sw = gw / Math.max(1, stacks.length);
  const y0 = y(Math.max(L.lo, Math.min(L.hi, 0))), dly = Math.min(45, 650 / n);
  const LB = [];                       // кандидаты подписей: {x, y, t, pr, cls, anchor}
  const lf = (v, s) => (s && s.lFmt) ? s.lFmt(v) : spec.lFmt ? spec.lFmt(v) : spec.yFmt && !spec.lRaw ? spec.yFmt(v) : (Math.abs(v) >= 100 ? fmtF(v, 0) : Math.abs(v) >= 10 ? fmtF(v, 1) : fmtF(v, Math.abs(v) < 1 && v !== 0 ? 2 : 1)) + (s && s.unit === '%' ? '%' : '');
  for (let i = 0; i < n; i++) {
    stacks.forEach((st, si) => {
      let pos = 0, neg = 0, nSeg = 0, tot = 0, lastY = null, lastNeg = false;
      const x0 = m.l + band * i + (band - gw) / 2 + sw * si;
      const pad = stacks.length > 1 ? Math.min(2, sw * 0.12) : 0;
      for (const s of bars) {
        if ((s.stack || s.name) !== st) continue;
        const v = s.values[i]; if (v == null || v === 0) continue;
        const a = v >= 0 ? pos : neg, b = a + v;
        v >= 0 ? pos = b : neg = b;
        const y1 = y(Math.max(a, b)), y2 = y(Math.min(a, b));
        const h = Math.max(0.5, y2 - y1);
        const fill = s.hatch ? `url(#${pats[s.color]})` : s.color;
        const style = s.hatch ? `fill:${fill};stroke:${s.color};stroke-width:1` : `fill:${fill}`;
        svg += `<rect x="${x0 + pad / 2}" y="${y1}" width="${Math.max(1, sw - pad)}" height="${h}" rx="${Math.min(2, sw / 4)}" style="${style}${A ? `;transform-origin:0 ${y0}px;animation-delay:${Math.round(i * dly + si * 35)}ms` : ''}" class="fx-bar"${s.opacity ? ` opacity="${s.opacity}"` : ''}/>`;
        nSeg++; tot += v;
        if (LBL && !s.noLabel) LB.push({ dark: !s.hatch && isDark(s.color), seg: true, x: x0 + sw / 2, y: (y1 + y2) / 2 + 3.5, h, w: sw - pad, t: lf(v, s), pr: 2, cls: s.hatch ? 'dl dl-in dl-p' : 'dl dl-in', stack: st, i });
        lastY = v >= 0 ? y(pos) : y(neg); lastNeg = v < 0;
      }
      if (LBL && nSeg) {
        const multi = nSeg > 1, sOne = bars.find(s => (s.stack || s.name) === st);
        // одиночный столбец — подпись над ним; стопка — подписи сегментов внутри и итог над стопкой
        const top = lastY, hgt = lastNeg ? 0 : y0 - lastY, dk = !!(sOne && !sOne.hatch && isDark(sOne.color));
        if (!multi) { const k = LB.length - 1; LB[k] = { dark: dk, x: x0 + sw / 2, y: lastNeg ? lastY + 12 : lastY - 4, t: LB[k].t, pr: 1, cls: sOne && sOne.hatch ? 'dl dl-p' : 'dl', w: sw, top, hgt }; }
        else LB.push({ x: x0 + sw / 2, y: lastNeg ? lastY + 12 : lastY - 4, t: lf(tot, sOne), pr: 0, cls: 'dl dl-tot', w: sw, top, hgt });
      }
    });
  }
  // lines
  const lineN = series.filter(s => s.kind === 'line' && !s.dash).length;
  series.filter(s => s.kind === 'line').forEach(s => {
    const Y = s.axis === 'right' ? yr : y;
    let d = '', pen = false, pts = [];
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += (pen ? 'L' : 'M') + cx(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; pts.push([cx(i), Y(v)]);
    });
    if (s.area && pts.length > 1) svg += `<path class="${A ? 'fx-fade' : ''}" d="M${pts[0][0].toFixed(1)} ${(m.t + ih).toFixed(1)}${pts.map(p => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')}L${pts[pts.length - 1][0].toFixed(1)} ${(m.t + ih).toFixed(1)}Z" style="fill:${s.color};opacity:.12"/>`;
    svg += `<path class="${A ? (s.dash ? 'fx-fade' : 'fx-line') : ''}"${s.dash ? '' : ' pathLength="1"'} d="${d}" fill="none" style="stroke:${s.color};stroke-width:${s.width || 2.2}${A ? ';animation-delay:120ms' : ''}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    const showDots = s.dots != null ? s.dots : n <= 30;
    if (showDots || pts.length === 1) pts.forEach(p => { svg += `<circle cx="${p[0]}" cy="${p[1]}" r="${n <= 14 ? 3.2 : 2.4}" class="fx-dot" style="fill:var(--surface);stroke:${s.color};stroke-width:1.8${A ? `;animation-delay:${Math.round(150 + (p[0] - m.l) / iw * 1100)}ms` : ''}"/>`; });
    if (!s.dash && pts.length > 2 && lineN <= 4) { const p = pts[pts.length - 1]; svg += `<circle class="fx-pulse" cx="${p[0]}" cy="${p[1]}" r="5" style="fill:none;stroke:${s.color};stroke-width:2"/>`; }
    if (LBL && !s.noLabel) {
      const idx = s.values.map((v, i) => v == null ? -1 : i).filter(i => i >= 0); if (!idx.length) return;
      const vals = idx.map(i => s.values[i]), imax = idx[vals.indexOf(Math.max(...vals))], imin = idx[vals.indexOf(Math.min(...vals))], ilast = idx[idx.length - 1];
      const key = new Set([ilast, imax, imin]);
      idx.forEach(i => { if (s.dash && n > 12 && !key.has(i)) return; const v = s.values[i], yy = Y(v); const pr = key.has(i) ? (s.dash ? 4 : 3) : (s.dash ? 6 : 5);
        LB.push({ x: cx(i), y: yy - 7, alt: yy + 15, t: lf(v, s), pr, cls: 'dl dl-ln', col: s.color, line: true }); });
    }
  });
  // ---- размещение подписей без наложений: по приоритету, в границах графика
  if (LBL && LB.length) {
    const placed = [], fs = narrow ? 9.5 : 10.5;
    const tw = t => measureLbl(t, fs) + 6;
    const box = (x, yb, t) => { const w = tw(t); return { x1: x - w / 2, x2: x + w / 2, y1: yb - fs, y2: yb + 3 }; };
    const hit = b => placed.some(p => b.x1 < p.x2 && b.x2 > p.x1 && b.y1 < p.y2 && b.y2 > p.y1);
    const inside = b => b.x1 >= m.l - 2 && b.x2 <= W - m.r + 2 && b.y1 >= 1 && b.y2 <= m.t + ih + 1;
    LB.sort((a, b) => a.pr - b.pr).forEach(l => {
      const w = tw(l.t);
      if (l.seg) { if (l.h < fs + 3 || w > l.w - 2) return; }
      else if (!l.line && w > Math.max(l.w * 1.3, l.w + 8)) {
        // не помещается по ширине — пробуем вертикально внутри столбца
        if (!(l.hgt >= w + 4 && l.w >= fs - 1)) return;
        const vb = { x1: l.x - fs / 2 - 1, x2: l.x + fs / 2 + 1, y1: l.top + 3, y2: l.top + 3 + w };
        if (hit(vb)) return; placed.push(vb);
        svg += `<text class="${l.cls} dl-v${l.dark && l.pr !== 0 ? ' dl-w' : ''}${A ? ' fx-fade' : ''}" transform="translate(${(l.x + fs / 2 - 1.5).toFixed(1)} ${(l.top + 4).toFixed(1)}) rotate(-90)" text-anchor="end">${esc(l.t)}</text>`;
        return;
      }
      let b = box(l.x, l.y, l.t), yy = l.y;
      if (l.line && (!inside(b) || hit(b)) && l.alt) { const b2 = box(l.x, l.alt, l.t); if (inside(b2) && !hit(b2)) { b = b2; yy = l.alt; } }
      if (!inside(b) || hit(b)) return;
      placed.push(b);
      svg += `<text class="${l.cls}${l.seg && l.dark ? ' dl-w' : ''}${A ? ' fx-fade' : ''}" x="${l.x}" y="${yy}" text-anchor="middle"${l.col ? ` style="fill:${l.col}"` : ''}>${esc(l.t)}</text>`;
    });
  }
  // x labels
  const xl = cats.map((c, i) => spec.xFmt ? spec.xFmt(c, i) : String(c));
  const maxLen = Math.max(...xl.map(s => (s || '').length), 1);
  const fit = Math.max(1, Math.floor(iw / (maxLen * 6.4 + 10)));
  let idxs = xl.map((s, i) => s ? i : -1).filter(i => i >= 0);
  const step = Math.ceil(idxs.length / fit);
  idxs = idxs.filter((_, k) => k % step === 0);
  idxs.forEach(i => { svg += `<text x="${cx(i)}" y="${H - 6}" text-anchor="middle">${esc(xl[i])}</text>`; });
  svg += '</svg>';
  el.innerHTML = svg + '<div class="tip"></div>';
  // ---- interaction
  const sv = el.querySelector('svg'), tip = el.querySelector('.tip'), hlg = sv.querySelector('.hlg');
  const tf = spec.tipFmt || ((v, s) => (s.axis === 'right' ? rf(v) : fmt(v)) + (s.unit ? ' ' + s.unit : ''));
  function show(ev) {
    const r = sv.getBoundingClientRect();
    const scale = W / r.width;
    const px = (ev.clientX - r.left) * scale;
    const i = Math.floor((px - m.l) / band);
    if (i < 0 || i >= n) { hide(); return; }
    const rows = series.filter(s => !s.noTip && s.values[i] != null).map(s => `<div class="r"><span><i class="sw" style="background:${s.color}"></i>${esc(s.name)}</span><span>${esc(tf(s.values[i], s, i))}</span></div>`).join('');
    const extra = spec.tipExtra ? spec.tipExtra(i) : '';
    if (!rows && !extra) { hide(); return; }
    hlg.innerHTML = `<rect class="hl" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}"/>`;
    tip.innerHTML = `<b>${esc(spec.tipTitle ? spec.tipTitle(cats[i], i) : xl[i] || cats[i])}</b>${rows}${extra}`;
    tip.style.opacity = 1;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = (cx(i) / scale) - tw / 2;
    left = Math.max(0, Math.min(r.width - tw, left));
    let top = (m.t / scale) - th - 6;
    if (top < -th + 10) top = 0;
    tip.style.transform = `translate(${left}px, ${Math.max(-th - 4, top)}px)`;
  }
  function hide() { tip.style.opacity = 0; hlg.innerHTML = ''; }
  sv.addEventListener('pointermove', show);
  sv.addEventListener('pointerdown', show);
  sv.addEventListener('pointerleave', hide);
}
function drawAll() { CHARTS.forEach(c => { const el = document.getElementById(c.id); if (el) drawChart(el, c.spec); }); }
let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { drawAll(); placeInk(); }, 120); });

/* horizontal bars (HTML) */
function hbars(rows, opts = {}) {
  // rows: [{label, bars:[{v, color, hatch, text}]}]
  const max = opts.max || Math.max(...rows.flatMap(r => r.bars.map(b => Math.abs(b.v || 0))), 1e-9);
  const thin = rows.some(r => r.bars.length > 1);
  return `<div class="hb">${rows.map((r, ri) => `<div class="hb-row${thin ? ' thin' : ''}" style="--i:${ri}"><span class="hb-l">${r.label}${r.extra ? `<span class="hb-x">${r.extra}</span>` : ''}</span><div class="hb-bars">${r.bars.map(b => {
    const w = b.v == null ? 0 : Math.max(0, Math.min(100, Math.abs(b.v) / max * 100));
    const bg = b.hatch ? `repeating-linear-gradient(135deg, ${b.color} 0 2px, transparent 2px 5px);outline:1px solid ${b.color};outline-offset:-1px` : b.color;
    return `<div class="hb-line"><div class="hb-track"><div class="hb-bar${b.hatch ? ' hatch' : ''}" style="width:${w}%;background:${bg}"></div>${!b.hatch && w > 0 && b.color !== 'var(--c8)' ? `<i class="hb-cap" style="left:${w}%;--c:${b.color}"></i>` : ''}</div><span class="hb-v">${b.text != null ? b.text : fmt(b.v)}</span></div>`;
  }).join('')}</div></div>`).join('')}</div>`;
}
function hbLegend(items) { return `<div class="legend">${items.map(i => `<span>${swatch(i)}${esc(i.name)}</span>`).join('')}</div>`; }

/* building blocks */
function kpis(list) {
  return `<div class="kpis">${list.map(k => `<div class="kpi"><span class="l">${NM(k.l)}</span><span class="v">${k.v}${k.u ? `<small>${k.u}</small>` : ''}</span>${k.s ? `<span class="s">${NM(k.s)}</span>` : ''}</div>`).join('')}</div>`;
}
function panel(title, unit, body, note, right) {
  title = NM(title); note = NM(note);
  return `<div class="panel"><div class="chart-head"><h3>${title}</h3>${right || ''}${unit ? `<span class="unit">${unit}</span>` : ''}</div>${body}${note ? `<p class="note">${note}</p>` : ''}</div>`;
}
function table(cols, rows, opts = {}) {
  // cols: [{t, v:bool}] ; rows: [{cells:[], cls}]
  return `<div class="tbl-wrap${opts.fit ? ' tbl-fit' : ''}"${opts.max ? ` style="max-height:${opts.max}px;overflow:auto"` : ''}><table><thead><tr>${cols.map(c => `<th${c.v ? ' class="v"' : ''}>${c.t}</th>`).join('')}</tr></thead><tbody>${rows.map(r => {
    if (r.group) return `<tr class="grp"><td colspan="${cols.length}">${r.group}</td></tr>`;
    return `<tr${r.cls ? ` class="${r.cls}"` : ''}>${r.cells.map((c, i) => `<td${cols[i] && cols[i].v ? ' class="v"' : ''}>${c == null ? '—' : c}</td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div>`;
}
function seg(id, opts, cur, cls = 'sm') {
  return `<div class="seg ${cls}" role="group" data-seg="${id}">${opts.map(o => `<button type="button" data-v="${esc(o.v)}" aria-pressed="${o.v === cur}">${o.dot ? `<span class="dot" style="background:${o.dot}"></span>` : ''}${esc(o.t)}</button>`).join('')}</div>`;
}
function secHead(t, p, right) { t = NM(t); p = NM(p); return `<div class="sec-head"><div><h2>${t}</h2>${p ? `<p>${p}</p>` : ''}</div>${right || ''}</div>`; }
function srcNote(t) { return `<div class="src">Источник: ${NM(t)}</div>`; }

/* ============================================================
   State
   ============================================================ */
const TABS = [
  { id: 'geo', t: 'Геология' }, { id: 'prod', t: 'Добыча' }, { id: 'mk', t: 'Маркетинг' }, { id: 'en', t: 'Энергетика' },
  { id: 'eco', t: 'Экология' }, { id: 'rel', t: 'Надёжность' }, { id: 'lc', t: 'Местное содержание' }, { id: 'econ', t: 'Экономика' }, { id: 'proj', t: 'Проекты' }];
const S = { tab: 'geo', field: 'all', sub: {} };
function readHash() {
  const [t, f] = location.hash.replace('#', '').split('/');
  if (TABS.some(x => x.id === t)) S.tab = t;
  if (f && (f === 'all' || FIELDS.includes(f))) S.field = f;
}
function writeHash() {
  const h = `#${S.tab}/${S.field}`;
  if (location.hash === h || location.href.startsWith('about:')) return;
  try { history.replaceState(null, '', h); } catch (e) { /* превью в srcdoc-iframe: адресной строки нет, состояние живёт в S */ }
}
const sub = (k, def) => S.sub[k] != null ? S.sub[k] : def;

const RENDER = {};
let LAST_SIG = new Set();
function render(mode = 'full') {
  CHARTS.length = 0;
  $('#tabs').innerHTML = TABS.map(t => `<button role="tab" type="button" aria-selected="${t.id === S.tab}" data-tab="${t.id}">${t.t}</button>`).join('');
  $('#fieldSeg').innerHTML = [{ v: 'all', t: 'Все' }].concat(FIELDS.map(k => ({ v: k, t: FS(k), dot: FC(k) }))).map(o =>
    `<button type="button" data-f="${o.v}" aria-pressed="${o.v === S.field}">${o.dot ? `<span class="dot" style="background:${o.dot}"></span>` : ''}${o.t}</button>`).join('');
  const r = RENDER[S.tab];
  const main = $('#main');
  main.innerHTML = S.field === 'all' ? r.all() : r.field(S.field);
  const prevSig = LAST_SIG; LAST_SIG = new Set();
  CHARTS.forEach(c => { LAST_SIG.add(c.sig); if (!REDUCED && (mode === 'full' || !prevSig.has(c.sig))) { const el = document.getElementById(c.id); if (el) el.dataset.anim = '1'; } });
  main.classList.toggle('fx-on', mode === 'full' && !REDUCED);
  drawAll();
  enhance(main);
  if (mode === 'full') entrance(main);
  placeInk();
  syncMap();
  writeHash();
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (t) { S.tab = t.dataset.tab; render(); t.scrollIntoView && 0; return; }
  const f = e.target.closest('[data-f]');
  if (f) { S.field = f.dataset.f; render(); return; }
  const g = e.target.closest('[data-goto]');
  if (g) { S.field = g.dataset.goto; render(); window.scrollTo({ top: $('nav.disc').offsetTop, behavior: 'smooth' }); return; }
  const b = e.target.closest('[data-seg] button');
  if (b) { S.sub[b.parentElement.dataset.seg] = b.dataset.v; const y = window.scrollY; render('soft'); window.scrollTo(0, y); }
});
window.addEventListener('hashchange', () => { readHash(); render(); });
$('#themeBtn').addEventListener('click', e => {
  const flip = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('kmg-theme', root.dataset.theme); } catch (err) { }
    drawAll(); mapTheme(); HERO.recolor && HERO.recolor();
  };
  if (!document.startViewTransition || REDUCED) { flip(); return; }
  const r = e.currentTarget.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(flip).ready.then(() => document.documentElement.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] },
    { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => { });
});
try { const t = localStorage.getItem('kmg-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { }

/* ============================================================
   ГЕОЛОГИЯ
   ============================================================ */
/* Накопленная добыча нефти, тыс. т: опорное значение из справки («Накопленная добыча на ДД.ММ.ГГГГ») + помесячный факт после этой даты.
   Так геология, справка и кольца в «Добыче» показывают одну и ту же цифру. */
function cumOilAnchor(k) {
  const r = ((DATA.refs || {})[k] || {}).geo; if (!r || !r.rows) return null;
  for (const row of r.rows) {
    const m = /Накопленная добыча на (\d{2})\.(\d{2})\.(\d{4})/.exec(String(row[0] || ''));
    const v = parseFloat(String(row[1]).replace(/[\s\u00a0]/g, '').replace(',', '.').replace(/[^0-9.]/g, ''));
    if (m && isFinite(v)) { let y = +m[3], mo = +m[2] - 1; if (mo === 0) { mo = 12; y--; } return { v, thru: `${y}-${String(mo).padStart(2, '0')}` }; }
  }
  return null;
}
function cumOilThrough(k, ym) {
  const a = cumOilAnchor(k), p = DATA.prod[k]; if (!a || !p || !p.mon.oil) return null;
  ym = ym || p.last; const ms = p.months, f = p.mon.oil.fact; let v = a.v;
  ms.forEach((m, i) => { const x = f[i] || 0; if (m > a.thru && m <= ym) v += x; else if (m > ym && m <= a.thru) v -= x; });
  return { v, ym };
}
const cumDateLabel = ym => { let y = +ym.slice(0, 4), m = +ym.slice(5) + 1; if (m > 12) { m = 1; y++; } return `01.${String(m).padStart(2, '0')}.${y}`; };

const GEO_COLS = {
  geoOil: { t: 'Геол. запасы нефти, млн т', d: 1 }, recOil: { t: 'Извл. запасы нефти, млн т', d: 1 },
  geoGas: { t: 'Геол. запасы газа, млрд м³', d: 1 }, recGas: { t: 'Извл. запасы газа, млрд м³', d: 1 },
  kin0: { t: 'КИН нач.', d: 3 }, kin: { t: 'КИН тек.', d: 3 }, kik0: { t: 'КИК нач.', d: 3 }, kik: { t: 'КИК тек.', d: 3 },
  curRec: { t: 'Тек. извл. запасы, млн т', d: 2 }, cum: { t: 'Накопл. добыча, млн т', d: 2 }
};
function geoMain(k) {
  const g = DATA.geo[k];
  const t = g.totals[0];
  return t;
}
RENDER.geo = {
  field(k) {
    const g = DATA.geo[k];
    const t = g.totals[0], c2 = g.totals.find(x => x.cat === 'С2');
    const ks = [
      { l: `Геологические запасы нефти (${t.cat})`, v: fmt(t.geoOil, 1), u: 'млн т', s: c2 ? `+ ${fmt(c2.geoOil, 1)} млн т по категории С2` : '' },
      { l: `Извлекаемые запасы нефти (${t.cat})`, v: fmt(t.recOil, 1), u: 'млн т', s: c2 ? `+ ${fmt(c2.recOil, 1)} млн т по категории С2` : '' },
    ];
    if (t.recGas != null) ks.push({ l: 'Извлекаемые запасы газа', v: fmt(t.recGas, 1), u: 'млрд м³', s: `геологические — ${fmt(t.geoGas, 1)} млрд м³` });
    if (t.kin0 != null) ks.push({ l: g.kinNote ? 'КИН утверждённый / текущий' : 'КИН начальный / текущий', v: `${fmtF(t.kin0, 3)} / ${fmtF(t.kin, 3)}`, s: t.kin0 ? `выработано ${pct(t.kin / t.kin0, 0)} от проектного КИН` : '' });
    else if (k === 'Y') { const y = g.objects[0]; ks.push({ l: 'КИН утв. / тек. (участок Y)', v: `${fmtF(y.kin0, 3)} / ${fmtF(y.kin, 3)}`, s: 'текущий КИН на 01.01.2026' }); }
    const cu = t.cum != null ? cumOilThrough(k) : null;
    if (cu) ks.push({ l: `Накопленная добыча нефти на ${cumDateLabel(cu.ym)}`, v: fmt(cu.v / 1000, 2), u: 'млн т', s: `остаточные извлекаемые — ${fmt(t.recOil - cu.v / 1000, 2)} млн т` });
    else if (t.cum != null) ks.push({ l: 'Накопленная добыча нефти', v: fmt(t.cum, 2), u: 'млн т', s: `текущие извлекаемые — ${fmt(t.curRec, 2)} млн т` });
    const objs = g.objects;
    const lab = o => `${o.obj.replace('Объект ', '')}${objs.some(x => x.obj === o.obj && x !== o) ? ' · ' + o.cat : ''}`;
    const oilChart = chartBox({
      title: 'Запасы нефти по объектам', cats: objs.map(lab),
      series: [{ name: 'Геологические', color: FC(k), values: objs.map(o => o.geoOil), unit: 'млн т' },
      { name: 'Извлекаемые', color: 'var(--c7)', values: objs.map(o => o.recOil), unit: 'млн т' }],
      tipTitle: (c, i) => `${objs[i].obj} · ${objs[i].cat}`
    });
    let gasChart = '';
    if (objs.some(o => o.geoGas != null)) gasChart = panel('Запасы газа по объектам', 'млрд м³', chartBox({
      title: 'Запасы газа', cats: objs.map(lab),
      series: [{ name: 'Геологические', color: FC(k), values: objs.map(o => o.geoGas), unit: 'млрд м³', hatch: true },
      { name: 'Извлекаемые', color: 'var(--c7)', values: objs.map(o => o.recGas), unit: 'млрд м³', hatch: true }],
      tipTitle: (c, i) => `${objs[i].obj} · ${objs[i].cat}`
    }));
    else if (objs.some(o => o.kin0 != null)) {
      const kk = objs.filter(o => o.kin0 != null);
      gasChart = panel('Коэффициент извлечения нефти', 'д. ед.', hbLegend([{ name: 'КИН начальный', color: 'var(--c7)' }, { name: 'КИН текущий', color: FC(k) }]) +
        hbars(kk.map(o => ({ label: lab(o), bars: [{ v: o.kin0, color: 'var(--c7)', text: fmtF(o.kin0, 3) }, { v: o.kin, color: FC(k), text: o.kin == null ? '—' : fmtF(o.kin, 3) }] }))), 'Текущий КИН показан там, где он есть в источнике.');
    }
    // table
    const detail = g.detail || g.objects;
    const cols = g.cols.filter(c => detail.concat(g.totals).some(o => o[c] != null));
    const tbl = table([{ t: g.objLabel }, { t: 'Категория' }].concat(cols.map(c => ({ t: GEO_COLS[c].t, v: true }))),
      detail.map(o => ({ cells: [esc(o.obj), esc(o.cat)].concat(cols.map(c => o[c] == null ? null : fmtF(o[c], GEO_COLS[c].d))) }))
        .concat(g.totals.map(o => ({ cls: 'tot', cells: [esc(o.obj), esc(o.cat)].concat(cols.map(c => o[c] == null ? null : fmtF(o[c], GEO_COLS[c].d))) }))), { fit: true });
    let html = secHead(`Геология · ${FN(k)}`, 'Запасы нефти и газа по объектам подсчёта и категориям, коэффициенты извлечения.') + kpis(ks) +
      `<div class="grid2">${panel('Запасы нефти по объектам', 'млн т', oilChart)}${gasChart}</div>` +
      `<h3 class="sub-h">Запасы по объектам и категориям</h3>${tbl}`;
    if (g.kinNote) html += `<p class="note">${g.kinNote}. Итог по ${FS('Y')} и участку «${KOR()}» сложен из двух участков с разными категориями (В+С1 и C₁+C₂).</p>`;
    // extras
    g.extras.forEach(ex => {
      html += `<h3 class="sub-h">${ex.title}</h3>`;
      if (ex.type === 'params') html += `<div class="params">${ex.rows.map(r => `<div><div class="v">${fmt(r[2])}<small>${esc(r[1] === '—' ? '' : r[1])}</small></div><div class="l">${esc(r[0])}</div></div>`).join('')}</div>`;
      if (ex.type === 'hbar') html += `<div class="panel">${hbars(ex.rows.map(r => ({ label: esc(r[0]), bars: [{ v: r[1], color: FC(k), text: fmtF(r[1], 2) + ' %' }] })))}<p class="note">Компонентный состав по образцам ВК, мол. %.</p></div>`;
      if (ex.type === 'residual') {
        const R = ex.data.rows;
        html += `<div class="grid2">${panel('Начальные и остаточные запасы', 'млн т / млрд м³', chartBox({
          title: 'Остаточные запасы', cats: R.map(r => r[0].replace(/,.*/, '').replace('запасы ', '')),
          series: [{ name: 'Всего на дату утверждения', color: FC(k), values: R.map(r => r[5]), hatch: true },
          { name: 'Остаточные на 01.01.2026', color: FC(k), values: R.map(r => r[6]) }],
          tipTitle: (c, i) => R[i][0]
        }))}${panel('Доля остаточных запасов', '', hbars(R.map(r => ({ label: esc(r[0]), bars: [{ v: r[6] / r[5], color: FC(k), text: pct(r[6] / r[5], 0) }] })), { max: 1 }), `Остаточные на 01.01.2026 к запасам на дату утверждения, Y вместе с участком «${KOR()}».`)}</div>` +
          `<div style="margin-top:16px">${table(ex.data.cols.map((c, i) => ({ t: c, v: i > 0 })), R.map(r => ({ cells: [esc(r[0])].concat(r.slice(1).map(v => fmt(v, 0))) })))}</div>`;
      }
      if (ex.type === 'paramsGrouped') {
        const groups = [...new Set(ex.rows.map(r => r[0]))];
        const names = [...new Set(ex.rows.map(r => r[1] + '|' + r[2]))];
        html += table([{ t: 'Параметр' }, { t: 'Ед. изм.' }].concat(groups.map(g => ({ t: g, v: true }))), names.map(nm => {
          const [a, u] = nm.split('|');
          return { cells: [esc(a), esc(u)].concat(groups.map(g => { const r = ex.rows.find(x => x[0] === g && x[1] === a); return r ? fmt(r[3], 3) : null; })) };
        }));
      }
      if (ex.type === 'recovery') {
        const rows = []; let cur = null;
        ex.rows.forEach(r => { if (r[0] !== cur) { cur = r[0]; rows.push({ group: esc(cur) }); } rows.push({ cls: cur === 'В целом' ? 'tot' : '', cells: [esc(r[1]), fmt(r[2], 1), fmt(r[3], 1), fmtF(r[4], 3)] }); });
        html += table([{ t: 'Вид запасов' }, { t: 'Геологические', v: true }, { t: 'Извлекаемые', v: true }, { t: 'Коэф. извлечения', v: true }], rows);
      }
      if (ex.type === 'wells') html += table([{ t: 'Тип скважин' }, { t: 'Кол-во', v: true }, { t: 'Объекты' }, { t: 'Горизонт' }, { t: 'Средняя глубина (абс. отм.), м', v: true }],
        ex.rows.map(r => ({ cells: [esc(r[0]), fmt(r[1]), esc(r[2]), esc(r[3]), esc(r[4])] })));
    });
    const src = { D: 'книга D, лист «Геология».', X: 'книга X, листы «Геология», «Геология 1», «Геология 2».', Y: 'книга Y, листы «Геология 1», «Геология 2».', Z: 'книга Z, листы «Геология», «Геология 1»–«Геология 3».' }[k];
    html += refPanel('geo', k);
    return `<section>${html}${srcNote(src)}</section>`;
  },
  all() {
    const T = FIELDS.map(k => ({ k, t: k === 'Y' ? DATA.geo.Y.objects[0] : geoMain(k) }));
    const totGeo = sum(T.map(x => x.t.geoOil)), totRec = sum(T.map(x => x.t.recOil)), totGas = sum(T.map(x => x.t.recGas));
    const ks = kpis([
      { l: 'Геологические запасы нефти, 4 месторождения', v: fmt(totGeo / 1000, 2), u: 'млрд т', s: 'основные категории (А+В+С1 / В+С1)' },
      { l: 'Извлекаемые запасы нефти', v: fmt(totRec / 1000, 2), u: 'млрд т', s: `в среднем ${pct(totRec / totGeo, 0)} от геологических` },
      { l: 'Извлекаемые запасы газа', v: fmt(totGas / 1000, 2), u: 'трлн м³', s: 'по X, Y, Z' },
    ]);
    const bar = hbLegend([{ name: 'Геологические', color: 'var(--c8)' }, { name: 'Извлекаемые', color: 'var(--c7)' }]) + hbars(T.map(x => ({
      label: `<span class="dot" style="background:${FC(x.k)};margin-right:6px"></span>${FS(x.k)} · ${esc(x.t.cat)}`,
      extra: `извлекаемые — ${pct(x.t.recOil / x.t.geoOil, 0)}`,
      bars: [{ v: x.t.geoOil, color: 'var(--c8)', text: fmt(x.t.geoOil, 0) + ' млн т' }, { v: x.t.recOil, color: FC(x.k), text: fmt(x.t.recOil, 0) + ' млн т' }]
    })));
    const gas = hbars(T.filter(x => x.t.recGas != null).map(x => ({
      label: `<span class="dot" style="background:${FC(x.k)};margin-right:6px"></span>${FS(x.k)}`,
      extra: `извлекаемые — ${pct(x.t.recGas / x.t.geoGas, 0)}`,
      bars: [{ v: x.t.geoGas, color: 'var(--c8)', text: fmt(x.t.geoGas, 0) }, { v: x.t.recGas, color: FC(x.k), text: fmt(x.t.recGas, 0) }]
    })));
    const kin = table([{ t: 'Месторождение' }, { t: 'Категория' }, { t: 'Геол. запасы нефти, млн т', v: true }, { t: 'Извл. запасы нефти, млн т', v: true }, { t: 'Доля извлекаемых', v: true }, { t: 'КИН нач.', v: true }, { t: 'КИН тек.', v: true }, { t: 'Извл. запасы газа, млрд м³', v: true }],
      T.map(x => ({ cells: [`<button class="op-name" style="all:unset;cursor:pointer;font-weight:600" data-goto="${x.k}"><span class="dot" style="background:${FC(x.k)};margin-right:6px"></span>${FN(x.k)}</button>`, esc(x.t.cat), fmt(x.t.geoOil, 1), fmt(x.t.recOil, 1), pct(x.t.recOil / x.t.geoOil, 0), x.t.kin0 == null ? null : fmtF(x.t.kin0, 3), x.t.kin == null ? null : fmtF(x.t.kin, 3), x.t.recGas == null ? null : fmt(x.t.recGas, 1)] })));
    return `<section>${secHead('Геология · все месторождения', `Сравнение запасов по основной категории. По Y — основной участок, без участка «${KOR()}». Нажмите на месторождение, чтобы открыть подробности.`)}${ks}
      <div class="grid2">${panel('Запасы нефти', 'млн т', bar)}${panel('Запасы газа', 'млрд м³', hbLegend([{ name: 'Геологические', color: 'var(--c8)' }, { name: 'Извлекаемые', color: 'var(--c7)' }]) + gas, 'У месторождения D запасы газа в источнике не приведены.')}</div>
      <h3 class="sub-h">Сводка по месторождениям</h3>${kin}${EXTRA.geoAll()}${srcNote('листы «Геология» каждой книги.')}</section>`;
  }
};

/* ============================================================
   ДОБЫЧА
   ============================================================ */
function prodStats(k, key = 'oil') {
  const p = DATA.prod[k], s = p.mon[key], M = p.months;
  const li = M.indexOf(p.last);
  const i26 = M.indexOf('2026-01');
  const fYTD = sum(s.fact.slice(i26, li + 1)), pYTD = sum(s.plan.slice(i26, li + 1));
  const plan26 = sum(s.plan.slice(i26, i26 + 12));
  const fact25 = sum(s.fact.slice(0, 12)), plan25 = sum(s.plan.slice(0, 12));
  return { fYTD, pYTD, plan26, fact25, plan25, ratio: ratio(fYTD, pYTD), li, i26, months: li - i26 + 1 };
}
const ytdLabel = n => `янв–${MN[n - 1]} 2026`;
RENDER.prod = {
  field(k) {
    const p = DATA.prod[k];
    const keys = Object.keys(p.mon);
    const key = keys.includes(sub('prodKey' + k)) ? sub('prodKey' + k) : 'oil';
    const s = p.mon[key];
    const st = prodStats(k, key);
    const yearsAv = monYears(k, key);
    const yr = yearsAv.includes(sub('prodYear', '2026')) ? sub('prodYear', '2026') : '2026';
    const ks = kpis([
      { l: `${s.name}: факт ${ytdLabel(st.months)}`, v: fmt(st.fYTD), u: s.unit, s: `план за период — ${fmt(st.pYTD)} ${s.unit}` },
      { l: 'Выполнение плана с начала года', v: st.ratio == null ? '—' : pct(st.ratio), s: st.ratio == null ? '' : `отклонение ${st.fYTD - st.pYTD >= 0 ? '+' : ''}${fmt(st.fYTD - st.pYTD)} ${s.unit}` },
      { l: `${s.name}: план на 2026 год`, v: fmt(st.plan26), u: s.unit, s: st.plan26 ? `выполнено ${pct(st.fYTD / st.plan26, 0)} годового плана` : '' },
      { l: `${s.name}: факт 2025 года`, v: fmt(st.fact25), u: s.unit, s: st.plan25 ? `план 2025 — ${fmt(st.plan25)} ${s.unit}` : '' },
    ]);
    // annual chart
    const aKey = sub('prodAnn', 'oil');
    const A = p.annual[aKey];
    const years = Object.keys(A).filter(y => A[y] != null).sort();
    const ann26 = sum(p.mon[aKey === 'oil' ? 'oil' : 'agas'].plan.slice(12)) / 1000;
    const aUnit = aKey === 'oil' ? 'млн т' : 'млрд м³';
    const AP = annualPlan(k, aKey === 'oil' ? 'oil' : 'agas');
    const hk = DATA.hist && DATA.hist[k] && DATA.hist[k][aKey === 'oil' ? 'oil' : 'agas'];
    const consistent = !!hk && Object.keys(AP).length > 0 && (() => { const y = DATA.hist[k].to.slice(0, 4), r = monYear(k, aKey === 'oil' ? 'oil' : 'agas', y); const f = sum(r.fact) / 1000; return A[y] && Math.abs(f - A[y]) / A[y] < 0.03; })();
    const planLine = consistent ? [{ name: 'План', color: 'var(--ink-2)', kind: 'line', dash: true, values: years.map(y => AP[y] ?? null).concat([ann26]), unit: aUnit, dots: false }] : [];
    const annChart = chartBox({
      title: 'Добыча по годам', cats: years.concat(['2026']),
      series: [{ name: 'Факт', color: FC(k), values: years.map(y => A[y]).concat([null]), unit: aUnit },
      { name: 'План 2026', color: FC(k), hatch: true, values: years.map(() => null).concat([ann26]), unit: aUnit, stack: 'Факт' }].concat(planLine),
      xFmt: (c, i) => c, height: 250
    });
    // monthly chart
    const MY = monYear(k, key, yr);
    const MM = MY.months, plan = MY.plan, fact = MY.fact;
    const monChart = chartBox({
      title: 'План-факт по месяцам', cats: MM,
      series: [{ name: 'План', color: FC(k), hatch: true, values: plan, unit: s.unit }, { name: 'Факт', color: FC(k), values: fact, unit: s.unit }],
      xFmt: c => MN[+c.slice(5) - 1], tipTitle: c => mLong(c),
      tipExtra: i => (fact[i] != null && plan[i]) ? `<div class="r"><span>Выполнение</span><span>${pct(fact[i] / plan[i])}</span></div>` : ''
    });
    // product YTD table
    const rows = keys.map(kk => {
      const q = prodStats(k, kk), u = p.mon[kk];
      return { cells: [esc(u.name), esc(u.unit), fmt(q.pYTD), fmt(q.fYTD), (q.fYTD - q.pYTD >= 0 ? '+' : '') + fmt(q.fYTD - q.pYTD), q.ratio == null ? null : pill(q.ratio), fmt(q.plan26), fmt(q.fact25)] };
    });
    let html = secHead(`Добыча · ${FN(k)}`, `Помесячный план-факт ${yearsAv.length > 2 ? `${yearsAv[yearsAv.length - 1]}–2026` : '2025–2026'} и многолетняя динамика. Последний месяц с фактом — ${mLong(p.last)}.`,
      seg('prodKey' + k, keys.map(kk => ({ v: kk, t: p.mon[kk].name })), key, '')) + ks +
      `<div class="grid2">${panel(`${s.name} по месяцам, ${yr}`, s.unit, monChart, '', (yearsAv.length > 2 ? ysel('prodYear', yearsAv, yr) : seg('prodYear', [{ v: '2025', t: '2025' }, { v: '2026', t: '2026' }], yr)))}
       ${panel('Добыча по годам', aUnit, annChart, `2026 — годовой план. ${p.annualSrc}`, seg('prodAnn', [{ v: 'oil', t: 'Нефть' }, { v: 'gas', t: 'Газ' }], aKey))}</div>
       ${EXTRA.prodField(k, key, st)}<h3 class="sub-h">План-факт по продуктам, ${ytdLabel(st.months)}</h3>` +
      table([{ t: 'Продукт' }, { t: 'Ед. изм.' }, { t: 'План', v: true }, { t: 'Факт', v: true }, { t: 'Откл.', v: true }, { t: 'Выполнение', v: true }, { t: 'План 2026', v: true }, { t: 'Факт 2025', v: true }], rows);
    if (p.summary) html += `<h3 class="sub-h">${p.summary.title}</h3>` + table(p.summary.cols.map((c, i) => ({ t: c, v: i >= 2 && i <= 7 })),
      p.summary.rows.map(r => ({ cells: [esc(r[0]), esc(r[1]), fmt(r[2], 2), fmt(r[3], 2), fmt(r[4], 2), (r[5] >= 0 ? '+' : '') + fmt(r[5], 3), fmt(r[6], 2), (r[7] >= 0 ? '+' : '') + fmt(r[7], 3), `<span class="txt">${esc(r[8])}</span>`] })));
    const src = { D: 'книга D, листы «Добыча», «Добыча 1», «Добыча 2».', X: 'книга X, листы «Добыча 2025», «Добыча др. года», «СКП Проекты».', Y: 'книга Y, лист «Добыча Все».', Z: `книга Z, листы «Добыча 2025», «Добыча», «${FS('Z')} Другие года».` }[k];
    return `<section>${html}${srcNote(src)}</section>`;
  },
  all() {
    const cards = FIELDS.map(k => {
      const q = prodStats(k, 'oil'), qg = prodStats(k, 'agas');
      return `<button type="button" class="op" data-goto="${k}"><div class="op-top"><span class="op-name"><span class="dot" style="background:${FC(k)}"></span>${FS(k)}<small class="op-full">${esc(FN(k).replace(/^[^(]*\(|\)$/g, ''))}</small></span>${pill(q.ratio)}</div>
      <dl><dt>Нефть, факт ${ytdLabel(q.months)}</dt><dd>${fmt(q.fYTD)} тыс. т</dd><dt>План за период</dt><dd>${fmt(q.pYTD)} тыс. т</dd>
      <dt>План 2026</dt><dd>${fmt(q.plan26)} тыс. т</dd><dt>Факт 2025</dt><dd>${fmt(q.fact25)} тыс. т</dd>
      <dt>Газ, факт с нач. года</dt><dd>${fmt(qg.fYTD)} млн м³</dd></dl>${sparkProd(k)}</button>`;
    }).join('');
    const tot = FIELDS.map(k => prodStats(k, 'oil'));
    const ks = kpis([
      { l: `Нефть, факт ${ytdLabel(tot[0].months)}`, v: fmt(sum(tot.map(t => t.fYTD)) / 1000, 2), u: 'млн т', s: 'сумма четырёх месторождений' },
      { l: 'План за тот же период', v: fmt(sum(tot.map(t => t.pYTD)) / 1000, 2), u: 'млн т', s: `выполнение ${pct(sum(tot.map(t => t.fYTD)) / sum(tot.map(t => t.pYTD)))}` },
      { l: 'План 2026 года', v: fmt(sum(tot.map(t => t.plan26)) / 1000, 1), u: 'млн т' },
      { l: 'Факт 2025 года', v: fmt(sum(tot.map(t => t.fact25)) / 1000, 1), u: 'млн т' },
    ]);
    const aKey = sub('prodAnnAll', 'oil');
    const allYears = [...new Set(FIELDS.flatMap(k => Object.keys(DATA.prod[k].annual[aKey])))].sort().filter(y => y >= (aKey === 'oil' ? '1998' : '2006'));
    const annChart = chartBox({
      title: 'Добыча по годам', cats: allYears,
      series: FIELDS.map(k => ({ name: FS(k), color: FC(k), kind: 'line', values: allYears.map(y => DATA.prod[k].annual[aKey][y] ?? null), unit: aKey === 'oil' ? 'млн т' : 'млрд м³', dots: false })),
      height: 280
    });
    const M = DATA.prod.D.months.slice(12);
    const exec = chartBox({
      title: 'Выполнение плана по месяцам', cats: M,
      series: FIELDS.map(k => { const s = DATA.prod[k].mon.oil; const ap = avg(s.plan.slice(12)); return { name: FS(k), color: FC(k), kind: 'line', values: M.map((m, i) => { const f = s.fact[12 + i], pl = s.plan[12 + i]; return f != null && pl && pl > ap * 0.3 ? f / pl * 100 : null; }), unit: '%' }; }),
      zero: false, refs: [{ v: 100, label: '100%' }], xFmt: c => MN[+c.slice(5) - 1], tipTitle: c => mLong(c), yFmt: v => fmt(v) + '%', tipFmt: v => fmtF(v, 1) + '%'
    });
    return `<section>${secHead('Добыча · все месторождения', 'Нефть: факт с начала 2026 года против плана, многолетняя динамика и выполнение плана по месяцам.')}${ks}<div class="ops">${cards}</div>
    ${prodDonuts()}
    <div class="grid2">${panel('Выполнение плана по нефти, 2026', 'факт / план, %', exec, lowPlanNote())}
    ${panel('Добыча по годам', aKey === 'oil' ? 'млн т' : 'млрд м³', annChart, 'D: 2000–2025; X: 2016–2025; Y: 2006–2025; Z: нефть (стабильная) с 2012, газ с 1998.', seg('prodAnnAll', [{ v: 'oil', t: 'Нефть' }, { v: 'gas', t: 'Газ' }], aKey))}</div>
    ${EXTRA.prodAll()}${srcNote('листы «Добыча» каждой книги.')}</section>`;
  }
};

/* ============================================================
   МАРКЕТИНГ
   ============================================================ */
function mkStats(pr) {
  let li = -1;
  pr.dirs.forEach(d => { d.fact.forEach((v, i) => { if (v != null && v !== 0) li = Math.max(li, i); }); });
  const dirs = pr.dirs.map(d => {
    const f = sum(d.fact.slice(0, li + 1)), p = sum(d.plan.slice(0, li + 1));
    let pw = 0, w = 0;
    if (d.price) d.price.slice(0, li + 1).forEach((v, i) => { const q = d.fact[i]; if (v && q) { pw += v * q; w += q; } });
    return { name: d.name, f, p, r: ratio(f, p), price: w ? pw / w : null, planY: sum(d.plan) };
  });
  const f = sum(dirs.map(d => d.f)), p = sum(dirs.map(d => d.p));
  let pw = 0, w = 0; dirs.forEach(d => { if (d.price) { pw += d.price * d.f; w += d.f; } });
  if (pr.avgPrice) { pw = 0; w = 0; pr.avgPrice.slice(0, li + 1).forEach((v, i) => { const q = sum(pr.dirs.map(d => d.fact[i] || 0)); if (v && q) { pw += v * q; w += q; } }); }
  return { li, dirs, f, p, r: ratio(f, p), price: w ? pw / w : null, planY: sum(dirs.map(d => d.planY)) };
}
RENDER.mk = {
  field(k) {
    const m = DATA.mk[k];
    const names = m.products.map(p => p.name);
    const pn = names.includes(sub('mk' + k)) ? sub('mk' + k) : names[0];
    const pr = m.products.find(p => p.name === pn);
    const st = mkStats(pr);
    const n = st.li + 1;
    const ks = [
      { l: `Реализация, факт ${ytdLabel(n)}`, v: fmt(st.f), u: pr.unit },
      { l: `${pr.planLabel || 'План'} за тот же период`, v: fmt(st.p), u: pr.unit, s: st.r == null ? '' : `выполнение ${pct(st.r)}` },
      { l: `${pr.planLabel || 'План'} на 2026 год`, v: fmt(st.planY), u: pr.unit },
    ];
    if (st.price != null) ks.push({ l: 'Средневзвешенная цена реализации', v: fmt(st.price, 1), u: pr.priceUnit, s: 'взвешено по фактическим объёмам' });
    const fact = (arr) => arr.map((v, i) => i <= st.li ? v : null);
    const multi = pr.dirs.length > 1;
    const series = [{ name: pr.planLabel || 'План', color: 'var(--c8)', hatch: true, stack: 'plan', values: pr.dirs[0].plan.map((_, i) => sum(pr.dirs.map(d => d.plan[i]))), unit: pr.unit }];
    pr.dirs.forEach((d, j) => series.push({ name: multi ? `Факт · ${d.name}` : 'Факт', color: multi ? PAL[j] : FC(k), stack: 'fact', values: fact(d.fact), unit: pr.unit }));
    if (pr.forecast) series.push({ name: 'Прогноз добычи', color: 'var(--ink-2)', kind: 'line', dash: true, values: pr.forecast, unit: pr.unit });
    const volChart = chartBox({ title: 'Объём реализации', cats: MONTHS26, series, xFmt: c => MN[+c.slice(5) - 1], tipTitle: c => mLong(c) });
    let priceChart = '';
    const pd = pr.dirs.filter(d => d.price && d.price.some(v => v));
    if (!pd.length && pr.avgPrice) priceChart = panel('Средняя цена реализации', pr.priceUnit, chartBox({ title: 'Цена', cats: MONTHS26, series: [{ name: 'Средняя цена', color: FC(k), kind: 'line', values: fact(pr.avgPrice).map(v => v || null), unit: pr.priceUnit }], zero: false, xFmt: c => MN[+c.slice(5) - 1], tipTitle: c => mLong(c) }), 'Цена в книге указана общая по всем направлениям.');
    else if (pd.length) priceChart = panel('Цена реализации', pr.priceUnit, chartBox({
      title: 'Цена', cats: MONTHS26, series: pd.map((d, j) => ({ name: d.name, color: pd.length > 1 ? PAL[pr.dirs.indexOf(d)] : FC(k), kind: 'line', values: fact(d.price).map(v => v || null), unit: pr.priceUnit })),
      zero: false, xFmt: c => MN[+c.slice(5) - 1], tipTitle: c => mLong(c)
    }), 'Нулевые значения цены (нет отгрузки) не показаны.');
    else priceChart = panel('Выполнение плана по месяцам', '%', chartBox({
      title: 'Выполнение', cats: MONTHS26, series: [{ name: 'Факт / план', color: FC(k), kind: 'line', values: MONTHS26.map((_, i) => { const f = sum(pr.dirs.map(d => d.fact[i])), p = sum(pr.dirs.map(d => d.plan[i])); return i <= st.li && p ? f / p * 100 : null; }) }],
      zero: false, refs: [{ v: 100, label: '100%' }], yFmt: v => fmt(v) + '%', tipFmt: v => fmtF(v, 1) + '%', xFmt: c => MN[+c.slice(5) - 1], tipTitle: c => mLong(c)
    }), 'Цена реализации в источнике для этого продукта не указана.');
    const dirTbl = table([{ t: 'Направление' }, { t: 'План', v: true }, { t: 'Факт', v: true }, { t: 'Откл.', v: true }, { t: 'Выполнение', v: true }].concat(pd.length || pr.avgPrice ? [{ t: `Ср. цена, ${pr.priceUnit}`, v: true }] : []),
      st.dirs.map(d => ({ cells: [esc(d.name), fmt(d.p), fmt(d.f), (d.f - d.p >= 0 ? '+' : '') + fmt(d.f - d.p), d.p ? pill(d.r) : '<span class="pill neutral">без плана</span>'].concat(pd.length || pr.avgPrice ? [d.price == null ? null : fmt(d.price, 1)] : []) }))
        .concat(multi ? [{ cls: 'tot', cells: ['Итого', fmt(st.p), fmt(st.f), (st.f - st.p >= 0 ? '+' : '') + fmt(st.f - st.p), pill(st.r)].concat(pd.length || pr.avgPrice ? [st.price == null ? null : fmt(st.price, 1)] : []) }] : []));
    let html = secHead(`Маркетинг · ${FN(k)}`, `Реализация продукции в 2026 году: план, факт по направлениям и цены. Последний месяц с фактом — ${MNF[st.li]} 2026.`, seg('mk' + k, names.map(x => ({ v: x, t: x })), pn, '')) +
      kpis(ks) + `<div class="grid2">${panel(`${pr.name}: реализация по месяцам`, pr.unit, volChart, multi ? 'План — суммарно по направлениям (заштриховано), факт — по направлениям.' : 'Заштриховано — план.')}${priceChart}</div>
      <h3 class="sub-h">${pr.name}: итоги ${ytdLabel(n)} по направлениям</h3>${dirTbl}`;
    if (m.table) {
      const tli = Math.max(...m.table.map(r => lastIdx(r.fact)));
      const tn = tli + 1, per = n => `${n} мес. 2026`;
      const tsum = (a, n) => sum(a.slice(0, n));
      html += `<h3 class="sub-h">Сводная таблица реализации, ${ytdLabel(tn)}</h3>` + table([{ t: 'Товар' }, { t: 'Накоплено', v: true }, { t: `План ${per(tn)}`, v: true }, { t: `Факт ${per(tn)}`, v: true }, { t: 'Откл.', v: true }, { t: 'План 2026 (год)', v: true }],
        m.table.map(r => { const pl = tsum(r.plan, tn), fa = tsum(r.fact, tn), dv = fa - pl; return { cells: [esc(r.name), r.cum == null ? null : `${fmt(r.cum)} <span class="txt" style="display:inline">(${esc(r.cumLabel)})</span>`, fmt(pl), fmt(fa), `<span class="${dv < 0 ? 'bad-t' : 'good-t'}">${dv >= 0 ? '+' : ''}${fmt(dv)}</span>`, fmt(sum(r.plan))] }; }));
    }
    if (m.annual) {
      const ys = ['2022', '2023', '2024', '2025'];
      const rows = [];
      ['Нефть', 'Газ'].forEach(sec => {
        rows.push({ group: sec });
        m.annual.filter(a => a.section === sec).forEach(a => {
          const vu = Object.values(a.volume)[0]?.unit, pu = Object.values(a.price)[0]?.unit;
          const conv = vu === 'тонн' ? 1e-3 : vu === 'м3' ? 1e-6 : 1;
          const unit = vu === 'тонн' ? 'тыс. т' : vu === 'м3' ? 'млн м³' : vu;
          rows.push({ cells: [`${esc(a.dir)} · объём, ${unit}`].concat(ys.map(y => a.volume[y] ? fmt(a.volume[y].v * conv, 1) + (a.volume[y].t === 'План' ? ' <span class="sc">план</span>' : '') : null)) });
          rows.push({ cells: [`${esc(a.dir)} · цена, ${esc(pu || '')}`].concat(ys.map(y => a.price[y] ? fmt(a.price[y].v, 2) + (a.price[y].t === 'План' ? ' <span class="sc">план</span>' : '') : null)) });
        });
      });
      html += `<h3 class="sub-h">Реализация по годам и направлениям, 2022–2025</h3>` + table([{ t: 'Направление / показатель' }].concat(ys.map(y => ({ t: y, v: true }))), rows);
    }
    const src = { D: 'книга D, листы «маркетинг-нефть», «маркетинг-газ», «маркетинг-табл».', X: 'книга X, листы «маркетинг-нефть», «маркетинг-газ», «маркетинг-сера», «маркетинг-табл».', Y: 'книга Y, листы «маркетинг-нефть», «-газ», «-СУГ», «-сера», «-таб».', Z: 'книга Z, листы «маркетинг-нефть», «маркетинг-газ», «Маркетинг-таб», «доп данные».' }[k];
    html += refPanel('mk', k);
    return `<section>${html}${srcNote(src)}</section>`;
  },
  all() {
    const S2 = FIELDS.map(k => ({ k, st: mkStats(DATA.mk[k].products[0]) }));
    const cards = S2.map(({ k, st }) => `<button type="button" class="op" data-goto="${k}"><div class="op-top"><span class="op-name"><span class="dot" style="background:${FC(k)}"></span>${FS(k)}<small class="op-full">${esc(FN(k).replace(/^[^(]*\(|\)$/g, ''))}</small></span>${pill(st.r)}</div>
      <dl><dt>Нефть, факт ${ytdLabel(st.li + 1)}</dt><dd>${fmt(st.f)} тыс. т</dd><dt>План за период</dt><dd>${fmt(st.p)} тыс. т</dd>
      <dt>Ср. цена</dt><dd>${st.price == null ? '—' : fmt(st.price, 1) + ' ' + DATA.mk[k].products[0].priceUnit}</dd><dt>Направления</dt><dd>${DATA.mk[k].products[0].dirs.map(d => d.name).join(', ')}</dd></dl></button>`).join('');
    const ktk = FIELDS.filter(k => DATA.mk[k].products[0].dirs.some(d => d.name === 'КТК' && d.price && d.price.some(v => v)));
    const ktkChart = chartBox({
      title: 'Цена КТК', cats: MONTHS26, series: ktk.map(k => { const d = DATA.mk[k].products[0].dirs.find(d => d.name === 'КТК'); return { name: FS(k), color: FC(k), kind: 'line', values: d.price.map(v => v || null), unit: '$/барр.' }; }),
      zero: false, xFmt: c => MN[+c.slice(5) - 1], tipTitle: c => mLong(c)
    });
    const kv = FIELDS.filter(k => DATA.mk[k].products[0].dirs.some(d => d.name === 'КТК'));
    const ktkVol = chartBox({ title: 'Реализация через КТК', cats: MONTHS26.slice(0, 9), series: kv.map(k => { const d = DATA.mk[k].products[0].dirs.find(d => d.name === 'КТК'); return { name: FS(k), color: FC(k), values: d.fact.slice(0, 9), unit: 'тыс. т' }; }), xFmt: c => MN[+c.slice(5) - 1], tipTitle: c => mLong(c),
      tipExtra: i => tipRow('Итого через КТК', fmt(sum(kv.map(k => DATA.mk[k].products[0].dirs.find(d => d.name === 'КТК').fact[i] || 0))) + ' тыс. т') });
    const ktkTot = hbars(kv.map(k => { const v = sum(DATA.mk[k].products[0].dirs.find(d => d.name === 'КТК').fact.slice(0, 9).map(x => x || 0)); return { label: `<span class="dot" style="background:${FC(k)};margin-right:6px"></span>${FS(k)}`, bars: [{ v, color: FC(k), text: fmt(v) + ' тыс. т' }] }; }));
    const exec = hbars(S2.map(({ k, st }) => ({ label: `<span class="dot" style="background:${FC(k)};margin-right:6px"></span>${FS(k)}`, bars: [{ v: st.r, color: FC(k), text: pct(st.r) }] })), { max: Math.max(1.2, ...S2.map(x => x.st.r)) });
    return `<section>${secHead('Маркетинг · все месторождения', 'Реализация нефти в 2026 году: выполнение плана и цены. Остальные продукты — во вкладке каждого месторождения.')}<div class="ops">${cards}</div>
      <div class="grid2">${panel('Цена реализации через КТК', '$/барр.', ktkChart, 'Y в сравнение не входит: его цена в источнике указана в $/т без разбивки по направлениям.')}${panel('Выполнение плана реализации нефти', `факт / план, ${ytdLabel(S2[0].st.li + 1)}`, exec)}</div>
      <div class="grid2">${panel('Реализация нефти через КТК по месяцам', 'тыс. т', ktkVol, 'Факт по месяцам 2026 года, все проекты.')}${panel('Через КТК с начала года', 'тыс. т', ktkTot, `Сумма за ${ytdLabel(9)}.`)}</div>
      ${EXTRA.mkAll()}${srcNote('листы «маркетинг» каждой книги.')}</section>`;
  }
};
function lowPlanNote() {
  const L = FIELDS.map(k => { const s = DATA.prod[k].mon.oil, ap = avg(s.plan.slice(12)); const ms = MONTHS26.filter((m, i) => s.plan[12 + i] && s.plan[12 + i] <= ap * 0.3 && m <= DATA.prod[k].last); return ms.length ? `${FS(k)}: ${ms.map(m => MNF[+m.slice(5) - 1]).join(', ')}` : ''; }).filter(Boolean);
  return L.length ? `Месяцы с аномально низким планом (капремонт или перенос работ — ${L.join('; ')} 2026) не показаны: отношение факта к плану там не информативно.` : '';
}
const MONTHS26 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);

/* ============================================================
   ЭНЕРГЕТИКА
   ============================================================ */
function enSummary(k) {
  const e = DATA.en[k];
  if (k === 'D') { const cap = sum(e.units.map(u => u.cap)); const a = e.annual[e.annual.length - 1]; return { cap, out: a.gen, label: String(a.y) }; }
  if (k === 'X') { const cap = sum(e.gen.map(u => u.cap)); return { cap, out: sum(e.gen.map(u => u.winter)), label: 'зима', out2: sum(e.gen.map(u => u.summer)) }; }
  if (k === 'Y') { const li = e.months.length - 1; return { cap: sum(e.plants.map(p => e.byPlant[p].cap[li])), out: sum(e.plants.map(p => e.byPlant[p].gen[li])), label: mLong(e.lastMonth) }; }
  if (k === 'Z') { return { cap: sum(e.units.map(u => u.cap)), out: sum(e.units.map(u => u.fact)), label: 'факт' }; }
}

RENDER.en = {
  field(k) {
    const e = DATA.en[k];
    let html = '';
    if (k === 'D') {
      const cap = sum(e.units.map(u => u.cap)); const a = e.annual[e.annual.length - 1];
      html += kpis([{ l: 'Установленная мощность', v: fmt(cap, 1), u: 'МВт', s: `${e.units.length} × ${fmt(e.units[0].cap, 1)} МВт, ${esc(e.units[0].type)}` },
      { l: `Генерация, ${a.y}`, v: fmt(a.gen, 2), u: 'МВт', s: `загрузка ${pct(a.gen / cap, 0)} от установленной` },
      { l: `Потребление, ${a.y}`, v: fmt(a.cons, 2), u: 'МВт' }, { l: `Резерв свободной мощности, ${a.y}`, v: fmt(a.res, 2), u: 'МВт' }]);
      const yrs = e.annual.map(a => String(a.y));
      html += `<div class="grid2">${panel('Генерация: выработка и свободный резерв', 'МВт', chartBox({
        title: 'Генерация', cats: yrs,
        series: [{ name: 'Выработка', color: FC(k), values: e.annual.map(a => a.gen), unit: 'МВт', stack: 'g' }, { name: 'Резерв свободной мощности', color: FC(k), hatch: true, values: e.annual.map(a => a.res), unit: 'МВт', stack: 'g' }],
        refs: [{ v: cap, label: `Установленная ${fmt(cap, 0)} МВт` }], yMax: cap * 1.1,
        tipExtra: i => `<div class="r"><span>Загрузка</span><span>${pct(e.annual[i].gen / cap, 0)}</span></div>`
      }), 'Выработка ГТГ плюс резерв свободной мощности. Пунктир — установленная мощность.')}
      ${panel('Потребление электроэнергии', 'МВт', chartBox({
        title: 'Потребление', cats: yrs,
        series: [{ name: 'Потребление', color: 'var(--c7)', values: e.annual.map(a => a.cons), unit: 'МВт' }]
      }), 'В источнике единица указана как «МВт/ч». Потребление совпадает с выработкой во все годы: месторождение потребляет всю собственную генерацию.')}</div>
      <h3 class="sub-h">Газотурбинные генераторы</h3>${table([{ t: 'ГТГ' }, { t: 'Тип' }, { t: 'Уст. мощность, МВт', v: true }], e.units.map(u => ({ cells: [esc(u.name), esc(u.type), fmt(u.cap, 1)] })).concat([{ cls: 'tot', cells: ['Итого', '', fmt(cap, 1)] }]))}`;
    }
    if (k === 'X') {
      const cap = sum(e.gen.map(u => u.cap)), w = sum(e.gen.map(u => u.winter)), su = sum(e.gen.map(u => u.summer)), cons = sum(e.cons.map(c => c.cap));
      html += kpis([{ l: 'Установленная мощность генерации', v: fmt(cap, 1), u: 'МВт', s: `${e.gen.length} агрегатов, наземная и морская части` },
      { l: 'Фактическая мощность, зима', v: fmt(w, 1), u: 'МВт', s: `загрузка ${pct(w / cap, 0)}` }, { l: 'Фактическая мощность, лето', v: fmt(su, 1), u: 'МВт', s: `загрузка ${pct(su / cap, 0)}` },
      { l: 'Установленная мощность потребителей', v: fmt(cons, 1), u: 'МВт', s: `${e.cons.length} групп потребителей` }]);
      const cnt = {}; const lab = e.gen.map(u => { cnt[u.name] = (cnt[u.name] || 0) + 1; return `${u.name} №${cnt[u.name]}`; });
      html += `<div class="grid2">${panel('Генерирующие агрегаты', 'МВт', chartBox({
        title: 'Генерация', cats: lab,
        series: [{ name: 'Установленная', color: 'var(--c8)', hatch: true, values: e.gen.map(u => u.cap), unit: 'МВт' }, { name: 'Факт, зима', color: FC(k), values: e.gen.map(u => u.winter), unit: 'МВт' }, { name: 'Факт, лето', color: 'var(--c1)', values: e.gen.map(u => u.summer), unit: 'МВт' }],
        tipTitle: (c, i) => `${e.gen[i].site} · ${c}`
      }), 'Пустые значения — агрегат в этом сезоне не работал (по данным источника).')}
      ${panel('Потребители', 'уст. мощность, МВт', ['Наземная часть', 'Морская часть'].map(site => `<p class="eyebrow" style="margin:6px 0 8px">${site}</p>` + hbars(e.cons.filter(c => c.site === site).sort((a, b) => (b.cap || 0) - (a.cap || 0)).map(c => ({ label: esc(c.name), bars: [{ v: c.cap, color: FC(k), text: c.cap == null ? '—' : fmt(c.cap, 2) }] })), { max: Math.max(...e.cons.map(c => c.cap || 0)) })).join('<div style="height:12px"></div>'))}</div>
      <h3 class="sub-h">Генерация по агрегатам</h3>` + table([{ t: 'Часть' }, { t: 'Агрегат' }, { t: 'Уст. мощность', v: true }, { t: 'Факт зима', v: true }, { t: 'Факт лето', v: true }, { t: 'Резервная мощность', v: true }],
        e.gen.map((u, i) => ({ cells: [esc(u.site), esc(lab[i]), fmt(u.cap, 2), u.winter == null ? null : fmt(u.winter, 2), u.summer == null ? null : fmt(u.summer, 2), fmt(u.reserve, 2)] })).concat([{ cls: 'tot', cells: ['Итого', '', fmt(cap, 1), fmt(w, 1), fmt(su, 1), ''] }]));
    }
    if (k === 'Y') {
      const li = e.months.length - 1;
      const plant = e.plants.includes(sub('yPlant')) ? sub('yPlant') : 'all';
      const pick = key => plant === 'all' ? e.months.map((_, i) => sum(e.plants.map(p => e.byPlant[p][key][i]))) : e.byPlant[plant][key];
      const cap = pick('cap'), gen = pick('gen');
      const consTot = e.cons.rows.map(r => sum(r.v));
      html += kpis([{ l: `Установленная мощность, ${mLong(e.lastMonth)}`, v: fmt(sum(e.plants.map(p => e.byPlant[p].cap[li])), 0), u: 'МВт', s: `${e.unitsLast.length} турбогенераторов на ${e.plants.length} заводах` },
      { l: 'Фактическая выработка', v: fmt(sum(e.plants.map(p => e.byPlant[p].gen[li])), 0), u: 'МВт', s: `загрузка ${pct(sum(e.plants.map(p => e.byPlant[p].gen[li])) / sum(e.plants.map(p => e.byPlant[p].cap[li])), 0)}` },
      { l: 'Потребление (все объекты)', v: fmt(consTot[consTot.length - 1], 0), u: 'МВт', s: mLong(e.cons.rows[e.cons.rows.length - 1].m) },
      { l: 'Средняя загрузка за период', v: pct(sum(e.months.map((_, i) => sum(e.plants.map(p => e.byPlant[p].gen[i])))) / sum(e.months.map((_, i) => sum(e.plants.map(p => e.byPlant[p].cap[i]))))), s: `${mLabel(e.months[0])} – ${mLabel(e.lastMonth)}` }]);
      html += `<div class="grid2">${panel('Генерация: выработка турбогенераторов', 'МВт', chartBox({
        title: 'Выработка', cats: e.months,
        series: [{ name: 'Установленная мощность', color: 'var(--c8)', hatch: true, values: cap, unit: 'МВт', stack: 'cap' }, { name: 'Фактическая выработка', color: FC(k), values: gen, unit: 'МВт', stack: 'gen' }],
        xFmt: c => mLabel(c), tipTitle: c => mLong(c), tipExtra: i => cap[i] ? `<div class="r"><span>Загрузка</span><span>${pct(gen[i] / cap[i], 0)}</span></div>` : ''
      }), 'Сумма по турбогенераторам выбранного объекта. Потребление показано отдельно, на соседнем графике.',
        seg('yPlant', [{ v: 'all', t: 'Все объекты' }].concat(e.plants.map(p => ({ v: p, t: p }))), plant))}
      ${panel('Потребление электроэнергии по объектам', 'МВт', chartBox({
          title: 'Потребление', cats: e.cons.rows.map(r => r.m),
          series: e.cons.cols.map((c, j) => ({ name: c, color: PAL[j], values: e.cons.rows.map(r => r.v[j]), unit: 'МВт', stack: 's' })),
          xFmt: c => mLabel(c), tipTitle: c => mLong(c), tipExtra: i => `<div class="r"><span>Всего</span><span>${fmt(consTot[i])} МВт</span></div>`
        }))}</div>`;
      html += `<h3 class="sub-h">Турбогенераторы, ${mLong(e.lastMonth)}</h3>` + table([{ t: 'Объект' }, { t: 'Участок' }, { t: 'Агрегат' }, { t: 'Уст. мощность, МВт', v: true }, { t: 'Факт, МВт', v: true }, { t: 'Загрузка', v: true }],
        e.unitsLast.map(u => ({ cells: [esc(u.plant), esc(u.site), esc(u.name), fmt(u.cap, 2), fmt(u.fact, 1), pct(u.fact / u.cap, 0)] })));
      html += `<p class="note">Лист «Энергетика 1» в книге ${FS('Y')} содержит ${e.rawRows} строк данных по агрегатам (остальные строки пустые) — они сведены по заводам и месяцам.</p>`;
    }
    if (k === 'Z') {
      const cap = sum(e.units.map(u => u.cap)), f = sum(e.units.map(u => u.fact));
      const R = e.mon.rows, C = e.mon.cols;
      const genIdx = C.map((c, i) => c.startsWith('ГТГ') ? i : -1).filter(i => i >= 0);
      const expIdx = C.map((c, i) => c.startsWith('Экспорт') ? i : -1).filter(i => i >= 0);
      const conIdx = C.map((c, i) => !genIdx.includes(i) && !expIdx.includes(i) ? i : -1).filter(i => i >= 0);
      html += kpis([{ l: 'Установленная мощность', v: fmt(cap, 1), u: 'МВт', s: `${e.units.length} ГТГ, ${esc(e.units[0].type)}` }, { l: 'Фактическая мощность', v: fmt(f, 1), u: 'МВт', s: `загрузка ${pct(f / cap, 0)}` },
      { l: `Средняя выработка, ${mLabel(R[0].m)}–${mLabel(R[R.length - 1].m)}`, v: fmt(avg(R.map(r => sum(genIdx.map(i => r.v[i])))), 1), u: 'МВт' },
      { l: 'Средний экспорт электроэнергии', v: fmt(avg(R.map(r => sum(expIdx.map(i => r.v[i])))), 1), u: 'МВт', s: C.filter((c, i) => expIdx.includes(i)).map(c => c.replace('Экспорт ', '')).join(', ') }]);
      const cats = R.map(r => r.m);
      const tot = idx => R.map(r => sum(idx.map(i => r.v[i])));
      const G = tot(genIdx), U = tot(conIdx), X = tot(expIdx);
      const opt = extra => Object.assign({ cats, xFmt: c => mLabel(c), tipTitle: c => mLong(c) }, extra);
      html += `<h3 class="sub-h">Генерация</h3><div class="grid2">${panel('Выработка по ГТГ', 'МВт', chartBox(opt({
        title: 'Выработка', series: genIdx.map((i, j) => ({ name: C[i], color: PAL[j], values: R.map(r => r.v[i]), unit: 'МВт', stack: 's' })),
        refs: [{ v: cap, label: `Установленная ${fmt(cap, 0)} МВт` }], yMax: cap * 1.08,
        tipExtra: i => `<div class="r"><span>Всего</span><span>${fmt(G[i], 1)} МВт</span></div>`
      })), 'Данные в источнике есть за январь–апрель 2023.')}
      ${panel('Газотурбинные генераторы: мощность', 'МВт', chartBox({
          title: 'ГТГ', cats: e.units.map(u => u.name),
          series: [{ name: 'Установленная', color: 'var(--c8)', hatch: true, values: e.units.map(u => u.cap), unit: 'МВт' }, { name: 'Фактическая', color: FC(k), values: e.units.map(u => u.fact), unit: 'МВт' }],
          tipExtra: i => `<div class="r"><span>Загрузка</span><span>${pct(e.units[i].fact / e.units[i].cap, 0)}</span></div>`
        }))}</div>
      <h3 class="sub-h">Потребление и экспорт</h3><div class="grid2">${panel('Потребление по объектам', 'МВт', chartBox(opt({
        title: 'Потребление', series: conIdx.map((i, j) => ({ name: C[i], color: ['var(--c7)', 'var(--c6)', 'var(--c5)', 'var(--c4)', 'var(--c1)'][j], values: R.map(r => r.v[i]), unit: 'МВт', stack: 's' })),
        tipExtra: i => `<div class="r"><span>Всего</span><span>${fmt(U[i], 1)} МВт</span></div>`
      })), 'Собственные нужды: КПК, УКПГ-2, УКПГ-3, промысловые объекты и прочие.')}
      ${panel('Экспорт электроэнергии', 'МВт', chartBox(opt({
          title: 'Экспорт', series: expIdx.map((i, j) => ({ name: C[i].replace('Экспорт ', ''), color: ['var(--c2)', 'var(--c3)'][j], values: R.map(r => r.v[i]), unit: 'МВт', stack: 's' })),
          tipExtra: i => `<div class="r"><span>Всего</span><span>${fmt(X[i], 1)} МВт</span></div>`
        })), 'Поставки внешним потребителям.')}</div>
      <h3 class="sub-h">Баланс по месяцам</h3>${table([{ t: 'Месяц' }, { t: 'Выработка', v: true }, { t: 'Потребление', v: true }, { t: 'Экспорт', v: true }, { t: 'Выработка − (потребление + экспорт)', v: true }],
        R.map((r, i) => ({ cells: [mLong(r.m), fmt(G[i], 1), fmt(U[i], 1), fmt(X[i], 1), fmt(Math.abs(G[i] - U[i] - X[i]) < 0.05 ? 0 : G[i] - U[i] - X[i], 1)] })))}
      <p class="note">МВт. В январе–феврале выработка полностью распределена между потреблением и экспортом. В марте–апреле около 15–16 МВт выработки в исходных листах не отнесены ни к потреблению, ни к экспорту.</p>`;
    }
    const src = { D: 'книга D, листы «Энергетика», «Энергетика 1».', X: 'книга X, листы «Генерация», «Потребление».', Y: 'книга Y, листы «Энергетика», «Энергетика 1».', Z: 'книга Z, листы «Энергетика» (выработка), «Потребление 2», «Экспорт 3», «Энергетика 1».' }[k];
    return `<section>${secHead(`Энергетика · ${FN(k)}`, 'Генерация (выработка) и потребление электроэнергии показаны раздельно.')}${html}${srcNote(src)}</section>`;
  },
  all() {
    const E = FIELDS.map(k => ({ k, ...enSummary(k) }));
    const rows = E.map(x => ({ label: `<span class="dot" style="background:${FC(x.k)};margin-right:6px"></span>${FS(x.k)}`, bars: [{ v: x.cap, color: 'var(--c8)', text: fmt(x.cap, 0) + ' МВт' }, { v: x.out, color: FC(x.k), text: fmt(x.out, 0) + ' МВт' }] }));
    const load = hbars(E.map(x => ({ label: `<span class="dot" style="background:${FC(x.k)};margin-right:6px"></span>${FS(x.k)} <span class="txt" style="display:inline">(${esc(x.label)})</span>`, bars: [{ v: x.out / x.cap, color: FC(x.k), text: pct(x.out / x.cap, 0) }] })), { max: 1 });
    return `<section>${secHead('Энергетика · все месторождения', 'Установленная и фактическая мощность собственной генерации. Периоды в источниках разные — они указаны в подписях.')}
      ${kpis([{ l: 'Установленная мощность, всего', v: fmt(sum(E.map(x => x.cap)), 0), u: 'МВт', s: 'четыре месторождения' }, { l: 'Фактическая мощность, всего', v: fmt(sum(E.map(x => x.out)), 0), u: 'МВт', s: 'по последним доступным данным' }])}
      <div class="grid2">${panel('Установленная и фактическая мощность', 'МВт', hbLegend([{ name: 'Установленная', color: 'var(--c8)' }, { name: 'Фактическая', color: 'var(--c7)' }]) + hbars(rows))}
      ${panel('Загрузка генерации', 'факт / установленная', load, 'D — среднегодовая генерация 2026; X — зимний режим; Y — последний месяц; Z — фактическая мощность ГТГ.')}</div>
      ${EXTRA.enAll()}${srcNote('листы «Энергетика» каждой книги.')}</section>`;
  }
};

/* ============================================================
   ЭКОЛОГИЯ
   ============================================================ */
function ecoYears(k) {
  const e = DATA.eco[k];
  const out = {};
  if (k === 'D') {
    e.rows.forEach(r => {
      const y = r.d.slice(0, 4);
      if (r.d === '2024-12-31' && r.quota) { out['2024'] = { t: r.total, q: r.quota, n: 12, full: true }; return; }
      if (!r.total) return;
      out[y] = out[y] || { t: 0, q: null, n: 0 };
      out[y].t += r.total; out[y].n += 3; if (r.quota) out[y].q = r.quota;
    });
  } else if (k === 'Y') {
    e.bySource.forEach(r => { out[r.label.includes('мес') ? '2026' : r.label] = { t: r.total, q: r.quota, n: r.label.includes('мес') ? 7 : 12, qAnnual: true }; });
  } else {
    e.rows.forEach(r => { const y = r.d.slice(0, 4); out[y] = out[y] || { t: 0, q: 0, n: 0 }; out[y].t += r.total || 0; out[y].q += r.quota || 0; out[y].n++; });
  }
  return out;
}
RENDER.eco = {
  field(k) {
    const e = DATA.eco[k];
    const Y = ecoYears(k);
    const ys = Object.keys(Y).sort();
    let html = '';
    const unit = 'тыс. т CO₂-экв.';
    const lastY = ys[ys.length - 1], prevY = ys[ys.length - 2];
    const qShare = y => { const o = Y[y]; if (!o || !o.q) return null; const q = o.qAnnual || k === 'D' ? o.q * (o.n / 12) : o.q; return o.t / q; };
    const ks = [];
    if (prevY) ks.push({ l: `Выбросы ПГ, ${prevY}`, v: fmt(Y[prevY].t, 1), u: unit, s: qShare(prevY) != null ? `${pct(qShare(prevY), 0)} от квоты` : 'квота в источнике не указана' });
    ks.push({ l: `Выбросы ПГ, ${lastY}${Y[lastY].n < 12 ? ` (${Y[lastY].n} мес.)` : ''}`, v: fmt(Y[lastY].t, 1), u: unit, s: qShare(lastY) != null ? `${pct(qShare(lastY), 0)} от квоты за тот же период` : '' });
    const anyQ = ys.filter(y => Y[y].q).pop();
    if (anyQ) ks.push({ l: `Квота выбросов, ${anyQ}`, v: fmt(Y[anyQ].qAnnual || k === 'D' ? Y[anyQ].q : Y[anyQ].q / Y[anyQ].n * 12, 1), u: unit, s: 'годовая' });
    html += kpis(ks);
    if (e.kind === 'month' || e.kind === 'quarter') {
      let rows = e.rows.filter(r => r.total);
      if (k === 'D') rows = rows.filter(r => r.d !== '2024-12-31');
      const range = sub('ecoRange' + k, 'recent');
      if (e.kind === 'month' && range === 'recent') rows = rows.filter(r => r.d >= '2025-01');
      const cats = rows.map(r => r.d);
      const lbl = c => e.kind === 'quarter' ? `${Math.ceil(+c.slice(5, 7) / 3)} кв. ${c.slice(2, 4)}` : mLabel(c);
      const series = e.sources.map((s, j) => ({ name: s, color: PAL[j], values: rows.map(r => r.v[j]), unit: 'тыс. т', stack: 's' }));
      if (e.kind === 'month') series.push({ name: 'Квота (в месяц)', color: 'var(--bad)', kind: 'line', dash: true, values: rows.map(r => r.quota), unit: 'тыс. т', dots: false });
      html += `<div class="grid2">${panel(e.kind === 'quarter' ? 'Выбросы по источникам, поквартально' : 'Выбросы по источникам, помесячно', 'тыс. т CO₂-экв.', chartBox({
        title: 'Выбросы', cats, series, xFmt: lbl, tipTitle: c => e.kind === 'quarter' ? lbl(c) : mLong(c),
        tipExtra: i => `<div class="r"><span>Итого</span><span>${fmt(rows[i].total, 1)} тыс. т</span></div>`
      }), k === 'D' ? 'Данных за II–III кв. 2026 в источнике пока нет.' : '', e.kind === 'month' ? seg('ecoRange' + k, [{ v: 'recent', t: '2025–2026' }, { v: 'all', t: 'Вся история' }], range) : '')}
      ${panel('Выбросы и квота по годам', 'тыс. т CO₂-экв.', chartBox({
          title: 'По годам', cats: ys,
          series: [{ name: 'Выбросы', color: FC(k), values: ys.map(y => Y[y].t), unit: 'тыс. т' }, { name: 'Квота', color: 'var(--bad)', hatch: true, values: ys.map(y => Y[y].q || null), unit: 'тыс. т' }],
          xFmt: y => Y[y].n < 12 ? `${y}*` : y, tipTitle: y => Y[y].n < 12 ? `${y} (${Y[y].n} мес.)` : y
        }), `* неполный год. ${k === 'D' ? 'Для D квота задана на год: 2024 и 2026 — из источника, 2025 — по справке (68 341 т); 2024 — годовой итог из источника.' : 'Квота — сумма месячных квот за те же месяцы.'}`)}</div>`;
      html += `<h3 class="sub-h">Данные по периодам</h3>` + table([{ t: 'Период' }].concat(e.sources.map(s => ({ t: esc(s.replace(/^ПГ на долю /, '').replace(/^./, c => c.toUpperCase())), v: true }))).concat([{ t: 'Итого', v: true }, { t: 'Квота', v: true }]),
        (k === 'D' ? e.rows.filter(r => r.total) : e.rows.filter(r => r.total)).slice().reverse().map(r => ({ cells: [k === 'D' ? (r.d === '2024-12-31' ? '2024 (год)' : `${Math.ceil(+r.d.slice(5, 7) / 3)} кв. ${r.d.slice(0, 4)}`) : mLong(r.d)].concat(r.v.map(v => fmt(v, 2))).concat([`<b>${fmt(r.total, 1)}</b>`, r.quota == null ? null : fmt(r.quota, 1)]) })), { max: 420 });
    }
    if (k === 'Y') {
      const A = e.annual, F = e.forecast;
      const cats = A.map(a => a[0]).concat(F.map(f => f[0]));
      html += `<div class="grid2">${panel('Выбросы парниковых газов: факт и прогноз', 'тыс. т CO₂-экв.', chartBox({
        title: 'ПГ', cats,
        series: [{ name: 'Факт', color: FC(k), values: A.map(a => a[1]).concat(F.map(() => null)), unit: 'тыс. т' }, { name: 'Прогноз выбросов', color: FC(k), hatch: true, values: A.map(() => null).concat(F.map(f => f[2])), unit: 'тыс. т', stack: 'Факт' },
        { name: 'НПР (квота)', color: 'var(--bad)', kind: 'line', dash: true, values: A.map(() => null).concat(F.map(f => f[1])), unit: 'тыс. т' }]
      }), 'НПР — национальный план распределения квот. В источнике единица факта указана как «MM CO2t».')}
      ${panel('Выбросы по источникам', 'тыс. т CO₂-экв.', chartBox({
          title: 'По источникам', cats: e.bySource.map(r => r.label),
          series: e.sources.map((s, j) => ({ name: s, color: PAL[j], values: e.bySource.map(r => r.v[j]), unit: 'тыс. т', stack: 's' })).concat([{ name: 'Квота', color: 'var(--bad)', hatch: true, values: e.bySource.map(r => r.quota), unit: 'тыс. т', stack: 'q' }]),
          tipExtra: i => `<div class="r"><span>Итого</span><span>${fmt(e.bySource[i].total)} тыс. т</span></div>`
        }), 'Квота за 7 мес. 2026 указана годовая.')}</div>`;
      html += `<h3 class="sub-h">Прогноз 2026–2030</h3>` + table([{ t: 'Год' }, { t: 'НПР (квота)', v: true }, { t: 'Прогнозные выбросы', v: true }, { t: 'Превышение', v: true }], F.map(f => ({ cells: [f[0], fmt(f[1]), fmt(f[2]), `<span class="bad-t">+${fmt(f[2] - f[1])} (${pct(f[2] / f[1] - 1, 0)})</span>`] })));
    }
    const src = { D: 'книга D, лист «Экология».', X: 'книга X, лист «Экология».', Y: 'книга Y, листы «Экология», «Экология 1», «Экология 2».', Z: 'книга Z, лист «Экология».' }[k];
    html += refPanel('eco', k);
    return `<section>${secHead(`Экология · ${FN(k)}`, 'Выбросы парниковых газов по источникам и их соотношение с квотой.')}${html}${srcNote(src)}</section>`;
  },
  all() {
    const ys = ['2024', '2025'];
    const Y = Object.fromEntries(FIELDS.map(k => [k, ecoYears(k)]));
    const share = (k, y) => { const o = Y[k][y]; if (!o || !o.q) return null; const q = o.qAnnual || k === 'D' ? o.q * (o.n / 12) : o.q; return o.t / q; };
    const rows = FIELDS.map(k => ({ label: `<span class="dot" style="background:${FC(k)};margin-right:6px"></span>${FS(k)}`, bars: ys.map((y, j) => ({ v: share(k, y), color: FC(k), hatch: j === 0, text: share(k, y) == null ? `${y}: нет квоты` : `${y}: ${pct(share(k, y), 0)}` })) }));
    const tot = FIELDS.map(k => ({ label: `<span class="dot" style="background:${FC(k)};margin-right:6px"></span>${FS(k)}`, bars: ys.map((y, j) => ({ v: Y[k][y]?.t, color: FC(k), hatch: j === 0, text: Y[k][y] ? `${y}: ${fmt(Y[k][y].t, 0)}` : '—' })) }));
    const tbl = table([{ t: 'Месторождение' }, { t: 'Выбросы 2024', v: true }, { t: 'Квота 2024', v: true }, { t: 'Выбросы 2025', v: true }, { t: 'Квота 2025', v: true }, { t: '2025 к квоте', v: true }],
      FIELDS.map(k => { const a = Y[k]['2024'], b = Y[k]['2025']; return { cells: [`<button style="all:unset;cursor:pointer;font-weight:600" data-goto="${k}"><span class="dot" style="background:${FC(k)};margin-right:6px"></span>${FN(k)}</button>`, a ? fmt(a.t, 1) : null, a && a.q ? fmt(a.q, 1) : null, b ? fmt(b.t, 1) : null, b && b.q ? fmt(b.q, 1) : null, share(k, '2025') == null ? '<span class="pill neutral">нет квоты</span>' : pill(share(k, '2025'), false, pct(share(k, '2025'), 0))] }; }));
    return `<section>${secHead('Экология · все месторождения', 'Годовые выбросы парниковых газов и их отношение к квоте, тыс. т CO₂-экв.')}
      <div class="grid2">${panel('Выбросы к квоте', '2024 — заштриховано, 2025 — сплошная', hbars(rows, { max: Math.max(1.2, ...FIELDS.flatMap(k => ys.map(y => share(k, y) || 0)))}), 'Больше 100% — превышение квоты. У D квота на 2025 год — по справке.')}
      ${panel('Объём выбросов', 'тыс. т CO₂-экв.', hbars(tot), 'Масштабы сильно различаются: Y выбрасывает в десятки раз больше остальных.')}</div>
      <h3 class="sub-h">Сводка</h3>${tbl}${EXTRA.ecoAll()}${srcNote('листы «Экология» каждой книги.')}</section>`;
  }
};

/* ============================================================
   НАДЁЖНОСТЬ
   ============================================================ */
function relYear(k) {
  const out = {};
  DATA.rel[k].pts.forEach(([m, p, f]) => { if (p > 1.05) return; /* план выше 100% — ошибка источника, месяц не учитывается */ const y = m.slice(0, 4); out[y] = out[y] || { p: [], f: [] }; if (p != null) out[y].p.push(p); if (f != null) out[y].f.push(f); });
  return Object.fromEntries(Object.entries(out).map(([y, o]) => [y, { p: avg(o.p), f: avg(o.f), n: o.f.length }]));
}
RENDER.rel = {
  field(k) {
    const r = DATA.rel[k];
    const range = sub('relRange', 'recent');
    let pts = r.pts.filter(p => p[0] <= '2026-12');
    if (range === 'recent') pts = pts.filter(p => p[0] >= '2024-01');
    const Yr = relYear(k);
    const y26 = Yr['2026'] || {}, y25 = Yr['2025'] || {};
    const ks = kpis([
      { l: `Эффективность, факт 2026 (${y26.n} мес.)`, v: pct(y26.f), s: `план — ${pct(avg(r.pts.filter(p => p[0] >= '2026-01' && p[2] != null && !(p[1] > 1.05)).map(p => p[1])))}${r.pts.some(p => p[0] >= '2026-01' && p[1] > 1.05) ? ' · без месяца с планом >100%' : ''}` },
      { l: 'Эффективность, факт 2025', v: pct(y25.f), s: `план — ${pct(y25.p)}` },
      { l: 'Минимум за 2025–2026', v: pct(Math.min(...r.pts.filter(p => p[0] >= '2025' && p[2] != null).map(p => p[2]))), s: mLong(r.pts.filter(p => p[0] >= '2025' && p[2] != null).reduce((a, b) => b[2] < a[2] ? b : a)[0]) },
      { l: 'События и комментарии', v: String(r.events.length), s: 'по данным источника' }]);
    const chart = chartBox({
      title: 'Эффективность', cats: pts.map(p => p[0]),
      series: [{ name: 'План', color: 'var(--ink-2)', kind: 'line', dash: true, values: pts.map(p => p[1] == null ? null : p[1] * 100), dots: false }, { name: 'Факт', color: FC(k), kind: 'line', values: pts.map(p => p[2] == null ? null : p[2] * 100), dots: range === 'recent' }],
      zero: false, yFmt: v => fmt(v) + '%', tipFmt: v => fmtF(v, 1) + '%',
      xFmt: (c, i) => range === 'recent' ? mLabel(c) : (c.endsWith('-01') ? c.slice(0, 4) : ''), tipTitle: c => mLong(c),
      tipExtra: i => { const ev = r.events.find(e => pts[i][0] >= e.from && pts[i][0] <= e.to); return ev ? `<div style="white-space:normal;max-width:260px;margin-top:4px;opacity:.85">${esc(ev.t.slice(0, 140))}${ev.t.length > 140 ? '…' : ''}</div>` : ''; }
    });
    const yrs = Object.keys(Yr).filter(y => y <= '2026' && Yr[y].f != null).sort();
    const ann = chartBox({
      title: 'Среднегодовая', cats: yrs,
      series: [{ name: 'План', color: FC(k), hatch: true, values: yrs.map(y => Yr[y].p * 100) }, { name: 'Факт', color: FC(k), values: yrs.map(y => Yr[y].f * 100) }],
      yFmt: v => fmt(v) + '%', tipFmt: v => fmtF(v, 1) + '%', xFmt: y => y.slice(2) === y ? y : `'${y.slice(2)}`, tipTitle: y => Yr[y].n < 12 ? `${y} (${Yr[y].n} мес.)` : y
    });
    let html = secHead(`Надёжность · ${FN(k)}`, 'Эффективность работы производственных объектов: план и факт по месяцам, ключевые события.') + ks +
      `<div class="grid2">${panel('Эффективность по месяцам', '%', chart, 'Наведите на точку, чтобы увидеть событие месяца.', seg('relRange', [{ v: 'recent', t: '2024–2026' }, { v: 'all', t: 'С 2015' }], range))}
      ${panel('Среднегодовая эффективность', '%', ann, 'До 2018 года в источнике по одному значению на год.')}</div>`;
    if (r.throughput) {
      const T = r.throughput.filter(t => t[0] >= '2024-01' && (t[3] || t[4]));
      html += `<div style="margin-top:16px">${panel('Суточная производительность', 'т/сут', chartBox({
        title: 'Производительность', cats: T.map(t => t[0]),
        series: [{ name: 'План', color: 'var(--ink-2)', kind: 'line', dash: true, values: T.map(t => t[2]), dots: false, unit: 'т/сут' }, { name: 'Факт (макс.)', color: 'var(--c7)', kind: 'line', values: T.map(t => t[3]), unit: 'т/сут' }, { name: 'Факт (средн.)', color: FC(k), kind: 'line', values: T.map(t => t[4]), unit: 'т/сут' }],
        zero: false, xFmt: c => mLabel(c), tipTitle: c => mLong(c),
        tipExtra: i => `<div class="r"><span>План на месяц</span><span>${fmt(T[i][1])} т</span></div>`
      }), 'Данные с 2024 года; полная история с 2019 — в исходном листе.')}</div>`;
    }
    html += `<h3 class="sub-h">События</h3><div class="panel"><ul class="events">${r.events.slice().reverse().map(e => `<li><span class="when">${e.from === e.to ? mLong(e.from) : `${mLabel(e.from)} – ${mLabel(e.to)}`}</span><span>${esc(e.t)}</span></li>`).join('') || '<li><span></span><span class="txt">Событий в источнике нет.</span></li>'}</ul></div>`;
    const src = `книга ${k}, лист «Надежность».`;
    return `<section>${html}${srcNote(src)}</section>`;
  },
  all() {
    const M = [...new Set(FIELDS.flatMap(k => DATA.rel[k].pts.map(p => p[0])))].filter(m => m >= '2025-01' && m <= '2026-12').sort();
    const series = FIELDS.map(k => { const d = Object.fromEntries(DATA.rel[k].pts.map(p => [p[0], p[2]])); return { name: FS(k), color: FC(k), kind: 'line', values: M.map(m => d[m] == null ? null : d[m] * 100) }; });
    const ch = chartBox({ title: 'Эффективность', cats: M, series, zero: false, yFmt: v => fmt(v) + '%', tipFmt: v => fmtF(v, 1) + '%', xFmt: c => mLabel(c), tipTitle: c => mLong(c) });
    const yrs = ['2022', '2023', '2024', '2025', '2026'];
    const Y = Object.fromEntries(FIELDS.map(k => [k, relYear(k)]));
    const tbl = table([{ t: 'Месторождение' }].concat(yrs.map(y => ({ t: y === '2026' ? '2026 (с нач. года)' : y, v: true }))),
      FIELDS.map(k => ({ cells: [`<button style="all:unset;cursor:pointer;font-weight:600" data-goto="${k}"><span class="dot" style="background:${FC(k)};margin-right:6px"></span>${FN(k)}</button>`].concat(yrs.map(y => { const o = Y[k][y]; if (!o || o.f == null) return null; return `${pct(o.f)} <span class="${o.f >= o.p ? 'good-t' : 'bad-t'}" style="font-size:12px">${o.f >= o.p ? '▲' : '▼'}</span>`; })) })));
    const last = FIELDS.map(k => { const y = Y[k]['2026']; return { label: `<span class="dot" style="background:${FC(k)};margin-right:6px"></span>${FS(k)}`, bars: [{ v: y.p, color: FC(k), hatch: true, text: 'план ' + pct(y.p) }, { v: y.f, color: FC(k), text: 'факт ' + pct(y.f) }] }; });
    return `<section>${secHead('Надёжность · все месторождения', 'Фактическая эффективность объектов по месяцам и среднегодовые значения.')}
      <div class="grid2">${panel('Фактическая эффективность, 2025–2026', '%', ch, 'Провал Y в начале 2026 — форс-мажоры: выход из строя трансформаторов и ограничения приёмки.')}${panel('2026 с начала года: план и факт', 'средняя за месяцы с фактом', hbars(last, { max: 1 }))}</div>
      <h3 class="sub-h">Среднегодовая фактическая эффективность</h3>${tbl}<p class="note">▲ — факт выше плана, ▼ — ниже плана за год.</p>${EXTRA.relAll()}${srcNote('листы «Надежность» каждой книги.')}</section>`;
  }
};

/* ============================================================
   МЕСТНОЕ СОДЕРЖАНИЕ
   ============================================================ */
const CATS = ['Товары', 'Работы', 'Услуги'];
const CATC = { 'Товары': 'var(--c1)', 'Работы': 'var(--c2)', 'Услуги': 'var(--c3)' };
RENDER.lc = {
  field(k) {
    const tru = DATA.lc.tru[k], dyn = DATA.lc.dyn[k], nat = DATA.lc.nat[k];
    const years = [...new Set(tru.map(t => t.y))].sort();
    const facts = tru.filter(t => t.st === 'Факт');
    const lastY = years.filter(y => facts.some(t => t.y === y)).pop();
    const dl = dyn.filter(d => d.share != null).pop();
    const dlMs = dyn.filter(d => d.ms != null).pop();
    const natShareIdx = nat.cols.findIndex(c => /Доля|Национализация/.test(c)) + 1;
    const nl = nat.rows.filter(r => r[natShareIdx] != null && r[natShareIdx] > 0).pop();
    const ks = [
      { l: `Доля МС в общих затратах, ${dl.y}`, v: pct(dl.share, 0), s: dyn.length > 1 ? `${dyn[0].y}: ${pct(dyn[0].share, 0)}` : '' },
      { l: `Затраты на МС, ${dlMs.y}`, v: fmt(dlMs.ms, 1), u: 'млн $' },
    ];
    if (nl) ks.push({ l: `Доля казахстанского персонала, ${nl[0]}`, v: pct(nl[natShareIdx], 1), s: nat.cols[natShareIdx - 1] });
    const tl = CATS.map(c => facts.find(x => x.y === lastY && x.cat === c));
    if (tl.some(Boolean)) ks.push({ l: `Доля МС в ТРУ, ${lastY}`, v: tl.map(t => t ? fmt(t.share * 100, 0) : '—').join(' / ') + '<small>%</small>', s: 'товары / работы / услуги' });
    let html = secHead(`Местное содержание · ${FN(k)}`, 'Доля казахстанского содержания в закупках товаров, работ и услуг (ТРУ), затраты на МС и национализация персонала.') + kpis(ks);
    // TRU chart: cats=years, series per category (fact solid, plan hatched)
    const hasPlan = tru.some(t => t.st === 'План');
    const series = [];
    CATS.forEach(c => {
      if (hasPlan) series.push({ name: `${c} · план`, color: CATC[c], hatch: true, values: years.map(y => { const t = tru.find(x => x.y === y && x.cat === c && x.st === 'План'); return t ? t.share * 100 : null; }), stack: c + 'p' });
      series.push({ name: hasPlan ? `${c} · факт` : c, color: CATC[c], values: years.map(y => { const t = tru.find(x => x.y === y && x.cat === c && x.st === 'Факт'); return t ? t.share * 100 : null; }), stack: c + 'f' });
    });
    const truChart = chartBox({ title: 'ТРУ', cats: years, series, yFmt: v => fmt(v) + '%', tipFmt: v => fmtF(v, 1) + '%', yMax: 100, height: 260 });
    const dynChart = chartBox({
      title: 'Динамика', cats: dyn.map(d => d.y),
      series: [{ name: 'Затраты на МС', color: FC(k), values: dyn.map(d => d.ms), unit: 'млн $' }, { name: 'Доля МС в общих затратах', color: 'var(--ink-2)', kind: 'line', axis: 'right', values: dyn.map(d => d.share == null ? null : d.share * 100) }],
      rFmt: v => fmt(v) + '%', tipFmt: (v, s) => s.axis === 'right' ? fmtF(v, 1) + '%' : fmt(v, 1) + ' млн $', rZero: true
    });
    html += `<div class="grid2">${panel('Доля МС в закупках ТРУ', '%', truChart, '')}${panel('Затраты на МС и их доля', 'млн $ · %', dynChart, k === 'Y' ? 'В источнике значения одинаковы за все годы (400 млн $ и 60%) — вероятно, это заглушка.' : '')}</div>`;
    // nationalization chart
    const nr = nat.rows.filter(r => r.slice(1).some(v => v != null && v !== 0));
    const countCols = nat.cols.map((c, i) => i + 1).filter(i => i !== natShareIdx && !/Руководство/.test(nat.cols[i - 1]));
    const natSeries = countCols.map((ci, j) => ({ name: nat.cols[ci - 1], color: j ? 'var(--c7)' : FC(k), values: nr.map(r => r[ci] || null), hatch: /план/i.test(nat.cols[ci - 1]) }))
      .concat([{ name: nat.cols[natShareIdx - 1], color: 'var(--ink-2)', kind: 'line', axis: 'right', values: nr.map(r => r[natShareIdx] ? r[natShareIdx] * 100 : null) }]);
    const mgmt = nat.cols.indexOf('Руководство');
    if (mgmt >= 0) natSeries.push({ name: 'Доля казахстанцев в руководстве', color: 'var(--c5)', kind: 'line', axis: 'right', values: nr.map(r => r[mgmt + 1] * 100) });
    const natS = natSeries.filter(s => s.values.some(v => v != null));
    if (!natS.some(s => s.kind !== 'line')) natS.forEach(s => { s.axis = 'left'; });
    const natChart = chartBox({ title: 'Национализация', cats: nr.map(r => r[0]), series: natS, zero: natS.some(s => s.kind !== 'line'), yFmt: natS.some(s => s.kind !== 'line') ? undefined : v => fmt(v, 1) + '%', rFmt: v => fmt(v) + '%', tipFmt: (v, s) => s.kind === 'line' ? fmtF(v, 1) + '%' : fmt(v), rZero: false });
    const natNote = { D: 'Количество позиций — штатные позиции; доля казахстанского персонала — правая шкала.', X: 'План и факт — количество национализированных позиций за год; доля — правая шкала.', Y: 'Численность персонала — столбцы; доли — правая шкала.', Z: 'Плановые и фактические значения национализации в источнике нулевые; показана только доля персонала.' }[k];
    const truTbl = table([{ t: 'Год' }, { t: 'Статус' }, { t: 'Категория' }, { t: 'Доля МС', v: true }, { t: 'Затраты на МС, млн $', v: true }, { t: 'Затраты всего, млн $', v: true }],
      tru.slice().sort((a, b) => b.y.localeCompare(a.y) || a.st.localeCompare(b.st) || CATS.indexOf(a.cat) - CATS.indexOf(b.cat)).map(t => ({ cells: [esc(t.y), t.st === 'План' ? '<span class="sc">план</span>' : 'факт', esc(t.cat), pct(t.share, 1), t.ms == null ? null : fmt(t.ms, 1), t.all == null ? null : fmt(t.all, 1)] })), { max: 380 });
    html += `<div class="grid2" style="margin-top:16px">${panel('Национализация персонала', '', natChart, natNote)}<div class="panel"><div class="chart-head"><h3>Закупки ТРУ: данные</h3></div>${truTbl}</div></div>`;
    const src = `книга ${k}, листы «ТРУ», «Динамика доли затрат», «Национализация».`;
    return `<section>${html}${srcNote(src)}</section>`;
  },
  all() {
    const yrs = [...new Set(FIELDS.flatMap(k => DATA.lc.dyn[k].map(d => d.y)))].sort();
    const share = chartBox({ title: 'Доля МС', cats: yrs, series: FIELDS.map(k => ({ name: FS(k), color: FC(k), kind: 'line', values: yrs.map(y => { const d = DATA.lc.dyn[k].find(x => x.y === y); return d && d.share != null ? d.share * 100 : null; }) })), zero: false, yFmt: v => fmt(v) + '%', tipFmt: v => fmtF(v, 1) + '%', xFmt: y => y.replace(' 1-2 кв.', '*') });
    const natY = [...new Set(FIELDS.flatMap(k => DATA.lc.nat[k].rows.map(r => r[0])))].sort();
    const ni = k => DATA.lc.nat[k].cols.findIndex(c => /Доля|Национализация/.test(c)) + 1;
    const nat = chartBox({ title: 'Национализация', cats: natY, series: FIELDS.map(k => ({ name: FS(k), color: FC(k), kind: 'line', values: natY.map(y => { const r = DATA.lc.nat[k].rows.find(x => x[0] === y); return r && r[ni(k)] ? r[ni(k)] * 100 : null; }) })), zero: false, yFmt: v => fmt(v) + '%', tipFmt: v => fmtF(v, 1) + '%', xFmt: y => y.replace(' 1-2 кв.', '*') });
    const lastFact = k => { const f = DATA.lc.tru[k].filter(t => t.st === 'Факт'); const y = [...new Set(f.map(t => t.y))].sort().pop(); return { y, rows: f.filter(t => t.y === y) }; };
    const truRows = FIELDS.map(k => { const L = lastFact(k); return { label: `<span class="dot" style="background:${FC(k)};margin-right:6px"></span>${FS(k)} <span class="txt" style="display:inline">(${esc(L.y)})</span>`, bars: CATS.map(c => { const t = L.rows.find(x => x.cat === c); return { v: t ? t.share : null, color: CATC[c], text: t ? `${c.toLowerCase()} ${pct(t.share, 0)}` : '—' }; }) }; });
    return `<section>${secHead('Местное содержание · все месторождения', 'Доля МС в затратах, в закупках ТРУ и доля казахстанского персонала.')}
      <div class="grid2">${panel('Доля МС в общих затратах', '%', share, '* 2026 — I–II кварталы. Y: в источнике одинаковое значение 60% за все годы.')}${panel('Доля казахстанского персонала', '%', nat, '* 2026 — I–II кварталы.')}</div>
      <div style="margin-top:16px">${panel('Доля МС в закупках ТРУ, последний год с фактом', '%', hbLegend(CATS.map(c => ({ name: c, color: CATC[c] }))) + hbars(truRows, { max: 1 }))}</div>
      ${EXTRA.lcAll()}${srcNote('листы «ТРУ», «Динамика доли затрат», «Национализация» каждой книги.')}</section>`;
  }
};

/* Map (Marketing tab): one persistent iframe so it does not reload on re-render */
let mapIfr = null;
function syncMap() {
  const sec = $('#mapSec');
  sec.hidden = S.tab !== 'mk';
  if (S.tab === 'mk' && !mapIfr && MAP_HTML) {
    mapIfr = document.createElement('iframe');
    mapIfr.title = 'Карта месторождений и нефтепроводов';
    mapIfr.setAttribute('allowfullscreen', '');
    mapIfr.srcdoc = MAP_HTML;
    $('#mapFrame').appendChild(mapIfr);
  }
}
function mapTheme() { try { const d = mapIfr && mapIfr.contentDocument; if (d) { const t = document.documentElement.dataset.theme; if (t) d.documentElement.dataset.theme = t; if (d.defaultView.recolorScheme) d.defaultView.recolorScheme(); } } catch (e) { } }
$('#mapNew').addEventListener('click', () => { try { const u = URL.createObjectURL(new Blob([MAP_HTML], { type: 'text/html' })); window.open(u, '_blank', 'noopener'); } catch (e) { } });
$('#mapFull').addEventListener('click', () => { const el = $('#mapFrame'); (el.requestFullscreen || el.webkitRequestFullscreen || (() => { })).call(el); });

/* ============================================================
   FX: анимации, герой-поток, новые визуализации
   ============================================================ */
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dotHTML = k => `<span class="dot" style="background:${FC(k)}"></span>`;

/* --- счётчики: числа «набегают» от нуля до значения --- */
const NUM_RE = /-?\d[\d\u00a0\u202f]*(?:,\d+)?/g;
const nfFix = {};
const NF = d => nfFix[d] || (nfFix[d] = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
function countUp(el, dur = 950) {
  if (REDUCED) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = []; let n;
  while ((n = walker.nextNode())) { if (!n.parentElement.closest('small') && /\d/.test(n.nodeValue)) nodes.push(n); }
  nodes.forEach(node => {
    const orig = node.nodeValue, parts = []; let last = 0, m;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(orig))) {
      parts.push(orig.slice(last, m.index));
      const s = m[0], dec = (s.split(',')[1] || '').length;
      parts.push({ v: parseFloat(s.replace(/[\u00a0\u202f]/g, '').replace(',', '.')), dec });
      last = m.index + s.length;
    }
    parts.push(orig.slice(last));
    const t0 = performance.now();
    const step = now => {
      const k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
      if (k >= 1) { node.nodeValue = orig; return; }
      node.nodeValue = parts.map(p => typeof p === 'object' ? NF(p.dec).format(p.v * e) : p).join('');
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* --- вход раздела: блоки появляются по очереди --- */
let revealIO = null;
function entrance(root) {
  if (REDUCED) return;
  const blocks = [];
  const add = (el, d) => { el.classList.add('fx-rise', 'rv'); el.style.setProperty('--d', d + 'ms'); blocks.push(el); };
  $$('section', root).forEach(sec => [...sec.children].forEach(ch => {
    if (ch.matches('.grid2, .ops, .proj')) [...ch.children].forEach((x, j) => add(x, j * 90)); else add(ch, 0);
  }));
  const run = el => { el.classList.add('seen'); $$('.kpi .v, .cu, .hb-v, .dn-leg .v, .dn-leg .p, .dn-v', el).forEach(x => countUp(x)); };
  if (revealIO) revealIO.disconnect();
  if (!('IntersectionObserver' in window)) { blocks.forEach(run); return; }
  revealIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { run(e.target); revealIO.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
  blocks.forEach(el => revealIO.observe(el));
}

/* --- скользящий индикатор активной вкладки --- */
let inkPrev = null;
function placeInk() {
  const tabs = $('#tabs'), sel = tabs.querySelector('[aria-selected="true"]');
  if (!sel) return;
  let ink = tabs.querySelector('.tab-ink');
  if (!ink) { ink = document.createElement('span'); ink.className = 'tab-ink'; ink.setAttribute('aria-hidden', 'true'); tabs.appendChild(ink); tabs.classList.add('has-ink'); }
  const to = { x: sel.offsetLeft, w: sel.offsetWidth };
  if (inkPrev && !REDUCED) {
    ink.style.transition = 'none';
    ink.style.transform = `translateX(${inkPrev.x}px)`; ink.style.width = inkPrev.w + 'px';
    void ink.offsetWidth; ink.style.transition = '';
  }
  ink.style.transform = `translateX(${to.x}px)`; ink.style.width = to.w + 'px';
  inkPrev = to;
  if (sel.offsetLeft < tabs.scrollLeft || sel.offsetLeft + sel.offsetWidth > tabs.scrollLeft + tabs.clientWidth)
    tabs.scrollTo({ left: sel.offsetLeft - 16, behavior: REDUCED ? 'auto' : 'smooth' });
}

/* --- кольцевые индикаторы --- */
let fxSeq = 0;
const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
function rings(items) {
  return `<div class="rings">${items.map((it, i) => {
    const ok = !(it.r == null || isNaN(it.r)), r = ok ? clamp(it.r, 0, 1) : 0, len = (r * 100).toFixed(2), id = 'fxr' + (++fxSeq);
    const N = 36;
    const ticks = Array.from({ length: N }, (_, j) => {
      const on = (j + 0.5) / N <= r, ang = j / N * 2 * Math.PI - Math.PI / 2;
      const [x1, y1] = polar(50, 50, 48, ang), [x2, y2] = polar(50, 50, 53, ang);
      return `<line class="rg-tk${on ? ' on' : ''}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" style="--tc:${it.color};--d1:${300 + j * 28}ms;--d2:${(j * 2400 / N).toFixed(0)}ms"/>`;
    }).join('');
    const mark = it.mark != null ? `<line class="rg-mark" x1="50" y1="3" x2="50" y2="17" transform="rotate(${(it.mark * 360).toFixed(1)} 50 50)"/>` : '';
    const [ex, ey] = polar(50, 50, 40, r * 2 * Math.PI - Math.PI / 2);
    const end = ok && r > 0.02 ? `<circle class="rg-halo" cx="${ex.toFixed(2)}" cy="${ey.toFixed(2)}" r="4.5" style="stroke:${it.color};animation-delay:${1200 + i * 300}ms"/><circle class="rg-end" cx="${ex.toFixed(2)}" cy="${ey.toFixed(2)}" r="3.2" style="fill:${it.color}"/>` : '';
    return `<div class="rg" style="--i:${i}"><div class="rg-dial"><svg viewBox="-6 -6 112 112" aria-hidden="true">` +
      `<defs><mask id="${id}"><circle cx="50" cy="50" r="40" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" pathLength="100" stroke-dasharray="${len} 100" transform="rotate(-90 50 50)"/></mask></defs>` +
      `<g class="rg-breath">${ticks}<circle class="rg-t" cx="50" cy="50" r="40"/>` +
      `<circle class="rg-a" cx="50" cy="50" r="40" pathLength="100" stroke-dasharray="${len} 100" transform="rotate(-90 50 50)" style="stroke:${it.color};animation-delay:${150 + i * 120}ms"/>` +
      `<circle class="rg-flow" cx="50" cy="50" r="40" pathLength="100" stroke-dasharray="1.6 3.2" transform="rotate(-90 50 50)" mask="url(#${id})"/>${mark}${end}</g></svg>` +
      `<span class="rg-v cu">${ok ? it.text : '—'}</span></div><span class="rg-l">${it.label}</span>${it.sub ? `<span class="rg-s">${it.sub}</span>` : ''}</div>`;
  }).join('')}</div>`;
}

/* --- кольцевая диаграмма (доли) --- */
function donut(items, center) {
  const tot = sum(items.map(i => i.v || 0));
  if (!tot) return '<div class="empty">Нет данных для диаграммы</div>';
  const id = 'fxd' + (++fxSeq);
  let off = 0;
  const geo = items.map(it => { const p = (it.v || 0) / tot * 100, gap = items.length > 1 ? Math.min(0.8, p / 3) : 0, g = { p, len: Math.max(0.05, p - gap), off }; off += p; return g; });
  const segs = items.map((it, i) => `<circle class="dn-seg" data-dn-i="${i}" data-p="${esc(pct(it.v / tot))}" data-l="${esc(it.label)}" cx="90" cy="90" r="70" pathLength="100" stroke-dasharray="${geo[i].len.toFixed(3)} ${(100 - geo[i].len).toFixed(3)}" stroke-dashoffset="${(-geo[i].off).toFixed(3)}" style="stroke:${it.color};animation-delay:${200 + i * 140}ms"><title>${esc(it.label)}: ${esc(it.text)}</title></circle>`).join('');
  const maskSegs = items.map((it, i) => `<circle cx="90" cy="90" r="70" fill="none" stroke="#fff" stroke-width="24" pathLength="100" stroke-dasharray="${geo[i].len.toFixed(3)} ${(100 - geo[i].len).toFixed(3)}" stroke-dashoffset="${(-geo[i].off).toFixed(3)}"/>`).join('');
  const N = 90;
  const ticks = Array.from({ length: N }, (_, j) => {
    const f = (j + 0.5) / N * 100, k = geo.findIndex(g => f >= g.off && f < g.off + g.p), ang = j / N * 2 * Math.PI - Math.PI / 2;
    const [x1, y1] = polar(90, 90, 87, ang), [x2, y2] = polar(90, 90, 93, ang);
    return `<line class="dn-tk" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" style="--tc:${items[Math.max(0, k)].color};--d1:${300 + j * 12}ms;--d2:${(j * 3000 / N).toFixed(0)}ms"/>`;
  }).join('');
  const leg = items.map((it, i) => `<li data-dn-i="${i}" style="--i:${i}"><span class="dot" style="background:${it.color}"></span><span>${esc(it.label)}</span><span class="v">${esc(it.text)}</span><span class="p">${pct(it.v / tot)}</span></li>`).join('');
  return `<div class="donut"><svg viewBox="-8 -8 196 196" role="img" aria-label="${esc(center.l)}"><defs><mask id="${id}"><g transform="rotate(-90 90 90)">${maskSegs}</g></mask></defs>` +
    `<circle class="dn-wave" cx="90" cy="90" r="82"/><circle class="dn-wave" cx="90" cy="90" r="82" style="animation-delay:1.3s"/>` +
    `<g class="dn-breath">${ticks}<g transform="rotate(-90 90 90)"><circle cx="90" cy="90" r="70" style="fill:none;stroke:var(--surface-2);stroke-width:24"/>${segs}</g>` +
    `<circle class="dn-flow" cx="90" cy="90" r="70" pathLength="100" stroke-dasharray="0.45 2.55" mask="url(#${id})"/></g>` +
    `<text class="dn-v" x="90" y="92" text-anchor="middle">${esc(center.v)}</text><text class="dn-l" x="90" y="112" text-anchor="middle">${esc(center.l)}</text></svg><ul class="dn-leg">${leg}</ul></div>`;
}

/* --- тепловая карта: строки — месторождения, столбцы — месяцы --- */
function heatmap(o) {
  const cols = o.cols;
  let h = `<div class="hm"><div class="hm-scroll"><div class="hm-g" style="grid-template-columns:minmax(52px,auto) repeat(${cols.length},minmax(30px,1fr))"><span></span>`;
  h += cols.map(c => `<span class="hm-h">${c.year ? `<i>${c.year}</i>` : ''}${c.label}</span>`).join('');
  o.rows.forEach((r, ri) => {
    h += `<span class="hm-r">${r.label}</span>`;
    cols.forEach((c, ci) => {
      const x = o.cell(r, c);
      if (!x) { h += `<span class="hm-c na" style="--i:${ci};--r:${ri}" data-tip="${esc(`<b>${FS(r.k)} · ${mLong(c.key)}</b>нет данных в источнике`)}"></span>`; return; }
      const a = x.d == null ? 0 : x.d >= 0 ? clamp(x.d / o.scale.pos, 0, 1) : clamp(-x.d / o.scale.neg, 0, 1);
      const bg = x.d == null ? 'var(--surface-2)' : `color-mix(in srgb,var(--${x.d >= 0 ? 'good' : 'bad'}) ${Math.round(8 + 37 * a)}%,var(--surface))`;
      h += `<span class="hm-c" style="--i:${ci};--r:${ri};background:${bg}" data-tip="${esc(x.tip)}">${x.t}</span>`;
    });
  });
  return h + `</div></div><div class="tip"></div></div><div class="hm-leg"><span>${o.legend[0]}</span><i class="hm-ramp"></i><span>${o.legend[1]}</span></div>`;
}


/* --- история добычи: помесячно по годам --- */
function monYears(k, key) {
  const ys = ['2026', '2025'], h = DATA.hist && DATA.hist[k];
  if (h && h[key]) for (let y = +h.to.slice(0, 4); y >= +h.from.slice(0, 4); y--) ys.push(String(y));
  return ys;
}
function monYear(k, key, y) {
  const p = DATA.prod[k];
  const months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  if (y >= '2025') { const off = y === '2025' ? 0 : 12; const s = p.mon[key]; return s ? { months, plan: s.plan.slice(off, off + 12), fact: s.fact.slice(off, off + 12), last: p.last } : null; }
  const h = DATA.hist && DATA.hist[k];
  if (!h || !h[key] || y < h.from.slice(0, 4) || y > h.to.slice(0, 4)) return null;
  const i0 = (+y - +h.from.slice(0, 4)) * 12;
  return { months, plan: h[key].plan.slice(i0, i0 + 12), fact: h[key].fact.slice(i0, i0 + 12), last: h.to };
}
function annualPlan(k, key) {
  const out = {}, h = DATA.hist && DATA.hist[k], p = DATA.prod[k];
  if (h && h[key]) for (let y = +h.from.slice(0, 4); y <= +h.to.slice(0, 4); y++) { const r = monYear(k, key, String(y)); if (r.plan.every(v => v != null)) out[y] = sum(r.plan) / 1000; }
  const m = p.mon[key]; if (m && m.plan.slice(0, 12).every(v => v != null)) out['2025'] = sum(m.plan.slice(0, 12)) / 1000;
  return out;
}
function ysel(id, years, cur) {
  return `<label class="ysel"><span>Год</span><select data-sel="${id}">${years.map(y => `<option value="${y}"${y === cur ? ' selected' : ''}>${y}</option>`).join('')}</select></label>`;
}
document.addEventListener('change', e => { const t = e.target.closest && e.target.closest('select[data-sel]'); if (!t) return; S.sub[t.dataset.sel] = t.value; render('soft'); });

/* --- карта «план-факт» по месяцам: понятные ячейки с процентом и значениями --- */
const PF_BINS = [['g2', '≥ 105%'], ['g1', '100–105%'], ['a', '95–100%'], ['r1', '85–95%'], ['r2', '< 85%']];
const pfBin = q => q >= 1.05 ? 'g2' : q >= 1 ? 'g1' : q >= 0.95 ? 'a' : q >= 0.85 ? 'r1' : 'r2';
const pfBinD = d => d >= 0.02 ? 'g2' : d >= 0 ? 'g1' : d >= -0.02 ? 'a' : d >= -0.1 ? 'r1' : 'r2';
const MONTHS25 = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);
const fmtV = v => v == null ? '—' : fmt(v, Math.abs(v) >= 100 ? 0 : 1);
function pfmap(o) {
  const cols = o.cols;
  let h = `<div class="hm pf"><div class="hm-scroll"><div class="hm-g" style="grid-template-columns:minmax(58px,auto) ${cols.map(c => c.total ? 'minmax(112px,1.5fr)' : `minmax(${o.minw || 62}px,1fr)`).join(' ')}"><span></span>`;
  h += cols.map(c => `<span class="hm-h${c.total ? ' tot' : ''}">${c.label}</span>`).join('');
  o.rows.forEach((r, ri) => {
    h += `<span class="hm-r${r.total ? ' tot' : ''}">${r.label}</span>`;
    cols.forEach((c, ci) => {
      const x = o.cell(r, c);
      const cls = `hm-c pf-c${c.total ? ' ctot' : ''}${r.total ? ' rtot' : ''}`;
      if (!x) { h += `<span class="${cls} na" style="--i:${ci};--r:${ri}" data-tip="${esc(`<b>${esc(r.name || r.k)} · ${c.total ? esc(c.label) : mLong(c.key)}</b>нет данных в источнике`)}"><small>нет данных</small></span>`; return; }
      h += `<span class="${cls} ${x.cls}" style="--i:${ci};--r:${ri}" data-tip="${esc(x.tip)}"><b>${x.main}</b>${x.sub ? `<small>${x.sub}</small>` : ''}</span>`;
    });
  });
  const leg = (o.bins || PF_BINS).map(([c, l]) => `<span><i class="pf-sw ${c}"></i>${l}</span>`).join('') +
    (o.future ? `<span><i class="pf-sw fut"></i>впереди — только план</span>` : '') + (o.anomaly ? `<span><i class="pf-sw an"></i>* план аномально низкий</span>` : '');
  return h + `</div></div><div class="tip"></div></div><div class="pf-leg">${leg}</div>`;
}
/* ячейка «план-факт» для объёмов */
function pfCellVol(name, label, f, pl, unit, opts = {}) {
  const head = `<b>${esc(name)} · ${esc(label)}</b>`;
  if (opts.future) return pl ? { cls: 'fut', main: 'план', sub: fmtV(pl), tip: head + tipRow('План', `${fmtV(pl)} ${unit}`) + 'Месяц ещё не наступил или факта пока нет' } : null;
  if (f == null || !pl) return f == null ? null : { cls: 'an', main: '—', sub: fmtV(f), tip: head + tipRow('Факт', `${fmtV(f)} ${unit}`) + 'План не задан' };
  const q = f / pl, dev = f - pl;
  const tip = head + tipRow('План', `${fmtV(pl)} ${unit}`) + tipRow('Факт', `${fmtV(f)} ${unit}`) + tipRow('Отклонение', `${dev >= 0 ? '+' : ''}${fmtV(dev)} ${unit}`) + tipRow('Выполнение', pct(q));
  if (opts.anomaly) return { cls: 'an', main: '*', sub: `${fmtV(f)} / ${fmtV(pl)}`, tip: tip + 'План аномально низкий (капремонт или перенос работ) — процент не информативен' };
  return { cls: pfBin(q), main: pct(q, 0), sub: `${fmtV(f)} / ${fmtV(pl)}`, tip };
}
/* добыча нефти: одна таблица на год (2026, 2025 и история, где она есть) */
function prodPF(year) {
  const M = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const R0 = {};
  FIELDS.forEach(k => {
    const r = monYear(k, 'oil', year);
    if (!r) { R0[k] = null; return; }
    const ap = avg(r.plan.filter(v => v != null));
    R0[k] = M.map((m, j) => ({ m, f: m <= r.last ? r.fact[j] : null, pl: r.plan[j], fut: m > r.last, an: !!(r.plan[j] && r.plan[j] <= ap * 0.3) }));
  });
  const have = FIELDS.filter(k => R0[k]);
  const lastAll = have.map(k => DATA.prod[k].last).sort()[0];
  const n = year === '2026' ? MONTHS26.filter(m => m <= lastAll).length : 12;
  const cols = M.map(m => ({ key: m, label: MN[+m.slice(5) - 1] })).concat([{ key: 'tot', total: true, label: year === '2026' ? `Итого ${ytdLabel(n).replace(' 2026', '')}` : `Итого ${year}` }]);
  const rows = FIELDS.map(k => ({ k, name: FN(k), label: `${dotHTML(k)}${FS(k)}${R0[k] ? '' : '<small class="pf-nod">только годовые итоги</small>'}` }));
  if (have.length === FIELDS.length) rows.push({ k: 'all', name: 'Все месторождения', label: 'Итого', total: true });
  return pfmap({
    cols, rows, future: year === '2026', anomaly: true, minw: 76,
    cell: (r, c) => {
      if (!r.total && !R0[r.k]) return { cls: 'na', main: '', sub: '', tip: `<b>${esc(r.name)} · ${year}</b>За этот год в источнике есть только годовые итоги` };
      if (c.total) {
        const pick = rr => rr.filter(x => x.f != null && !x.fut).slice(0, n);
        const parts = r.total ? FIELDS.map(k => pick(R0[k])) : [pick(R0[r.k])];
        return pfCellVol(r.name, c.label, sum(parts.flat().map(x => x.f)), sum(parts.flat().map(x => x.pl)), 'тыс. т');
      }
      const j = M.indexOf(c.key);
      if (r.total) {
        const xs = FIELDS.map(k => R0[k][j]);
        if (xs.every(x => x.fut)) return pfCellVol(r.name, mLong(c.key), null, sum(xs.map(x => x.pl)), 'тыс. т', { future: true });
        if (xs.some(x => x.f == null)) return null;
        return pfCellVol(r.name, mLong(c.key), sum(xs.map(x => x.f)), sum(xs.map(x => x.pl)), 'тыс. т');
      }
      const x = R0[r.k][j];
      return pfCellVol(r.name, mLong(c.key), x.f, x.pl, 'тыс. т', { future: x.fut, anomaly: x.an });
    }
  });
}
function prodPFBlock() {
  const years = [...new Set(FIELDS.flatMap(k => monYears(k, 'oil')))].sort().reverse();
  const yr = years.includes(sub('pfProdYear', '2026')) ? sub('pfProdYear', '2026') : '2026';
  const how = 'Как читать: сверху — выполнение плана, снизу — <b>факт / план</b>. Наведите на ячейку для подробностей.';
  const hist = years.length > 2 ? ` Помесячная история есть с ${years[years.length - 1]} года (${FIELDS.filter(k => monYears(k, 'oil').length > 2).map(FS).join(', ')}); по остальным — только годовые итоги.` : '';
  return panel('Добыча нефти: план и факт по месяцам', 'тыс. т', `<p class="pf-how">${how}</p>${prodPF(yr)}`, 'Цвет — выполнение плана месяца. * — месяц с аномально низким планом (капремонт), процент там не информативен.' + hist, ysel('pfProdYear', years, yr));
}

/* реализация нефти 2026 */
function mkPF() {
  const cols = MONTHS26.map(m => ({ key: m, label: MN[+m.slice(5) - 1] })).concat([{ key: 'tot', total: true, label: 'Итого с нач. года' }]);
  const rows = FIELDS.map(k => ({ k, name: FN(k), label: `${dotHTML(k)}${FS(k)}` }));
  return pfmap({
    cols, rows, future: true, anomaly: true, minw: 66,
    cell: (r, c) => {
      const pr = DATA.mk[r.k].products[0], st = mkStats(pr), u = pr.unit;
      if (c.total) return pfCellVol(r.name, `янв–${MN[st.li]} 2026`, st.f, st.p, u);
      const j = MONTHS26.indexOf(c.key);
      const pl = sum(pr.dirs.map(d => d.plan[j])), hasF = pr.dirs.some(d => d.fact[j] != null);
      const f = hasF ? sum(pr.dirs.map(d => d.fact[j])) : null;
      const ap = avg(MONTHS26.map((_, i) => sum(pr.dirs.map(d => d.plan[i]))));
      if (j > st.li) return pfCellVol(r.name, mLong(c.key), null, pl, u, { future: true });
      return pfCellVol(r.name, mLong(c.key), f, pl, u, { anomaly: pl <= ap * 0.3 });
    }
  });
}
/* надёжность: эффективность, факт против плана */
function relPF(year) {
  const M = year === '2025' ? MONTHS25 : MONTHS26;
  const last = DATA.prod.D.last;
  const cols = M.map(m => ({ key: m, label: MN[+m.slice(5) - 1] })).concat([{ key: 'tot', total: true, label: year === '2025' ? 'Среднее 2025' : 'Среднее с нач. года' }]);
  const rows = FIELDS.map(k => ({ k, name: FN(k), label: `${dotHTML(k)}${FS(k)}` }));
  const get = (k, m) => DATA.rel[k].pts.find(x => x[0] === m);
  return pfmap({
    cols, rows, future: year !== '2025', anomaly: true, minw: 60, bins: [['g2', '≥ +2 п.п.'], ['g1', '0…+2 п.п.'], ['a', '0…−2 п.п.'], ['r1', '−2…−10 п.п.'], ['r2', 'ниже −10 п.п.']],
    cell: (r, c) => {
      const head = l => `<b>${esc(r.name)} · ${esc(l)}</b>`;
      if (c.total) {
        const ps = M.filter(m => m <= last).map(m => get(r.k, m)).filter(p => p && p[2] != null && !(p[1] > 1.05));
        if (!ps.length) return null;
        const f = avg(ps.map(p => p[2])), pl = avg(ps.map(p => p[1]).filter(v => v));
        return { cls: pl ? pfBinD(f - pl) : 'an', main: pct(f, 0), sub: pl ? `план ${pct(pl, 0)}` : '', tip: head(c.label) + tipRow('Факт, среднее', pct(f)) + (pl ? tipRow('План, среднее', pct(pl)) : '') + tipRow('Месяцев с фактом', ps.length) };
      }
      const p = get(r.k, c.key);
      if (!p) return c.key > last ? { cls: 'fut', main: '—', sub: '', tip: head(mLong(c.key)) + 'Плана и факта в источнике пока нет' } : null;
      if (p[1] > 1.05) return { cls: 'an', main: '*', sub: p[2] != null ? `факт ${pct(p[2], 0)}` : '', tip: head(mLong(c.key)) + tipRow('План', pct(p[1])) + (p[2] != null ? tipRow('Факт', pct(p[2])) : '') + 'План выше 100% — похоже на ошибку в источнике, месяц не учитывается в среднем' };
      if (c.key > last || p[2] == null) return p[1] ? { cls: 'fut', main: 'план', sub: pct(p[1], 0), tip: head(mLong(c.key)) + tipRow('План', pct(p[1])) + 'Факта пока нет' } : { cls: 'fut', main: '—', sub: '', tip: head(mLong(c.key)) + 'Плана и факта в источнике пока нет' };
      const d = p[1] ? p[2] - p[1] : null;
      return { cls: d == null ? 'an' : pfBinD(d), main: pct(p[2], 0), sub: p[1] ? `план ${pct(p[1], 0)}` : '', tip: head(mLong(c.key)) + tipRow('Факт', pct(p[2])) + (p[1] ? tipRow('План', pct(p[1])) + tipRow('Разница', `${d >= 0 ? '+' : ''}${fmtF(d * 100, 1)} п.п.`) : '') };
    }
  });
}
/* блок с переключателем: 2025 скрыт по умолчанию */
function pfBlock(id, title, unit, build, note, how) {
  const mode = sub(id, '2026');
  const sw = seg(id, [{ v: '2026', t: 'Только 2026' }, { v: 'both', t: 'Показать 2025' }], mode);
  const body = (mode === 'both' ? `<p class="pf-yr">2025 год</p>${build('2025')}<p class="pf-yr">2026 год</p>` : '') + build('2026');
  return panel(title, unit, `<p class="pf-how">${how || 'Как читать: сверху — выполнение плана, снизу — <b>факт / план</b>. Наведите на ячейку для подробностей.'}</p>${body}`, note, sw);
}


/* ============================================================
   Экономика v2: обзор, схема раздела продукции, CAPEX/OPEX, денежные потоки, показатели
   ============================================================ */
const ECON_SRC = new Proxy({}, { get: (_, k) => `книга ${FS(k)}` });
const KOR = () => ((DATA.geo.Y.objects || [])[1] || {}).obj || '';
function grpRow(k, re) { const e = DATA.econ && DATA.econ[k]; return e ? e.grp.rows.find(r => re.test(r.name)) : null; }
const ECON_PAL = ['var(--c1)', 'var(--c3)', 'var(--c5)', 'var(--c6)', 'var(--c4)'];
const fm = v => v == null || isNaN(v) ? '—' : fmtF(v, Math.abs(v) >= 100 ? 0 : 1);
/* выбор диапазона лет */
function yrRange(id, years, def) {
  const a = sub(id + 'A', def[0]), b = sub(id + 'B', def[1]);
  const from = years.includes(a) ? a : def[0], to = years.includes(b) ? b : def[1];
  const opt = cur => years.map(y => `<option value="${y}"${y === cur ? ' selected' : ''}>${y}</option>`).join('');
  return { from: +from, to: +Math.max(+from, +to), html: `<div class="yr-range" role="group" aria-label="Период"><span>Период</span><select data-sel="${id}A" aria-label="С года">${opt(from)}</select><i>—</i><select data-sel="${id}B" aria-label="По год">${opt(to)}</select></div>` };
}
/* ---------- обзор ---------- */
function econOverview(r) {
  const inR = y => +y >= r.from && +y <= r.to;
  // годовые ряды — млн т и млрд м³; 2026 год — факт с начала года из помесячных данных (тыс. т и млн м³ → /1000)
  const ann = (k, key, monKey) => { const A = DATA.prod[k].annual[key] || {}; let v = sum(Object.keys(A).filter(inR).map(y => A[y] || 0));
    if (inR(2026) && DATA.prod[k].mon[monKey]) v += sum(DATA.prod[k].mon[monKey].fact.slice(12).map(x => x || 0)) / 1000; return v; };
  const oil = FIELDS.map(k => ann(k, 'oil', 'oil'));
  const gas = FIELDS.map(k => ann(k, 'gas', 'agas'));
  const col = (k, re) => { const S = DATA.econ[k].scheme; const i = S.cols.findIndex(c => re.test(c)); return i < 0 ? 0 : sum(S.rows.filter(x => inR(x.y)).map(x => x.v[i] || 0)); };
  const rep = FIELDS.map(k => { const C = DATA.econ[k].cash; const i = C.cols.findIndex(c => /Республики/.test(c)); return i < 0 ? 0 : sum(C.rows.filter(x => inR(x.y)).map(x => x.v[i] || 0)); });
  const cashCol = (k, re) => { const C = DATA.econ[k].cash; const i = C.cols.findIndex(c => re.test(c)); return i < 0 ? null : sum(C.rows.filter(x => inR(x.y)).map(x => x.v[i] || 0)); };
  const kmg = FIELDS.map(k => cashCol(k, /на долю КМГ/) ?? col(k, /на долю KMG/));
  const dn = (vals, unit, center) => donut(FIELDS.map((k, i) => ({ label: FS(k), v: Math.max(0, vals[i]), color: FC(k), text: `${fm(vals[i])} ${unit}` })), { v: fm(sum(vals)), l: center });
  return `<div class="econ-donuts">
    ${panel('Добыча нефти', 'млн т', dn(oil, 'млн т', 'млн т'), `Сумма за ${r.from}–${r.to}; 2026 год — факт с начала года. По годам ряды начинаются: ${FIELDS.map(k => `${FS(k)} — с ${Object.keys(DATA.prod[k].annual.oil)[0]}`).join(', ')}.`)}
    ${panel('Добыча газа', 'млрд м³', dn(gas, 'млрд м³', 'млрд м³'), `Сумма за ${r.from}–${r.to}; 2026 год — факт с начала года.`)}
    ${panel('Выплаты Республике', 'млн $', dn(rep, 'млн $', 'млн $'))}
    ${panel('ЧДП / дивиденды, доля КМГ', 'млн $', dn(kmg, 'млн $', 'млн $'), kmg.some(v => v < 0) ? 'Отрицательная сумма — проект в инвестиционной фазе за выбранный период; на диаграмме показана как 0.' : '')}
  </div>`;
}
function liftChart() {
  const yr = sub('liftY', '2026'), j = yr === '2025' ? 1 : 2;
  const parts = ['Персонал', 'Ремонт', 'Прочие'], pal = ['var(--c6)', 'var(--c3)', 'var(--c1)'];
  return panel('Лифтинг затраты', '$/барр.', chartBox({ title: 'Лифтинг', cats: FIELDS.map(FS),
    series: parts.map((p, i) => ({ name: p, color: pal[i], values: FIELDS.map(k => (DATA.econ[k].lift.find(r => r[0] === p) || [])[j] ?? null), unit: '$/барр.', stack: 'l' })) }),
    `${yr === '2025' ? 'Факт 2025 года' : 'План на 2026 год'}. Единицы в книгах не указаны, по смыслу — $/барр.`, seg('liftY', [{ v: '2025', t: '2025' }, { v: '2026', t: '2026' }], yr));
}
/* --- сводные кольца по шаблону «Главная страница экономика КНП» --- */
const mainYears = () => [...new Set(FIELDS.flatMap(k => Object.keys((DATA.econMain || { rows: {} }).rows[k] || {})))].sort();
function mainVal(k, y, i) {
  if (y === '2026' && i < 2) { const mm = DATA.prod[k].mon[i ? 'agas' : 'oil']; return mm ? sum(mm.fact.slice(12).map(x => x || 0)) : null; }
  const row = ((DATA.econMain || { rows: {} }).rows[k] || {})[y]; return row ? row[i] : null;
}
const mainSum = (k, r, i) => {
  if (i === 0 && r.from <= +mainYears()[0] && r.to >= 2026) { const c = cumOilThrough(k); if (c) return c.v; }
  return sum(mainYears().filter(y => +y >= r.from && +y <= r.to).map(y => mainVal(k, y, i) || 0));
};
function mainDonut(r, i, unit, title, note) {
  const vals = FIELDS.map(k => mainSum(k, r, i));
  return panel(title, unit, donut(FIELDS.map((k, n) => ({ label: FS(k), v: Math.max(0, vals[n]), color: FC(k), text: `${fm(vals[n])} ${unit}` })), { v: fm(sum(vals)), l: unit }), note);
}
function prodDonuts() {
  const ys = mainYears(), r = yrRange('pMain', ys, [ys[0], '2026']);
  const n26 = MONTHS26.filter(m => m <= DATA.prod.D.last).length;
  const note = `${r.from}–${Math.min(r.to, 2025)} — по шаблону «Главная страница экономика КНП»; 2026 год — факт за ${n26} мес. из помесячных данных.`;
  const cuD = r.from <= +ys[0] && r.to >= 2026 ? cumOilThrough('D') : null;
  const noteCum = cuD ? ` Дунга за весь период — по справочному значению накопленной добычи (на ${cumDateLabel(cuD.ym)}) плюс факт последующих месяцев.` : '';
  return `<h3 class="sub-h">Накопленная добыча</h3><div class="econ-range">${r.html}</div><div class="econ-donuts">${mainDonut(r, 0, 'тыс. т', 'Добыча нефти', note + noteCum)}${mainDonut(r, 1, 'млн м³', 'Добыча газа', note)}</div>`;
}

/* --- Free cash flow и цена безубыточности (шаблон «Главная страница экономика КНП») --- */
function fcfBlock() {
  const F = (DATA.econMain || {}).fcf || []; if (!F.length) return { chart: '', table: '' };
  const rows = FIELDS.flatMap(k => F.filter(x => x.k === k).sort((a, b) => a.y - b.y).map((x, i, arr) => ({ cls: i === arr.length - 1 ? 'grp-end' : '', cells: [i === 0 ? `<span class="dot" style="background:${FC(k)};margin-right:6px"></span><b>${FS(k)}</b>` : '', `${x.y}${x.y === 2026 ? '*' : ''}`, x.fcf == null ? null : fmtF(x.fcf, 0), x.beNP == null ? null : fmtF(x.beNP, 0), x.beCF == null ? null : fmtF(x.beCF, 0)] })));
  const ys = [...new Set(F.map(x => x.y))].sort();
  const ch = chartBox({ title: 'Free cash flow', cats: FIELDS.map(FS), series: ys.map((y, i) => ({ name: y === 2026 ? `${y} (план)` : String(y), color: ['var(--c8)', 'var(--c3)', 'var(--c1)'][i] || 'var(--c2)', hatch: y === 2026, values: FIELDS.map(k => (F.find(x => x.k === k && x.y === y) || {}).fcf ?? null), unit: 'млн $' })) });
  return { chart: panel('Free cash flow по годам', 'млн $', ch, '2026 год — плановые показатели.'), table: panel('Free cash flow и цена безубыточности', '', table([{ t: 'Оператор' }, { t: 'Год' }, { t: 'Free CF, млн $', v: true }, { t: 'Breakeven по P&L, $/bbl', v: true }, { t: 'Breakeven по CF, $/bbl', v: true }], rows), '*2026 год — плановые показатели. Источник — шаблон «Главная страница экономика КНП».') };
}

/* --- лифтинг затраты: столбцы с подписями сегментов и итогом --- */
function liftBars() {
  const yr = sub('liftY', '2026'), j = yr === '2025' ? 1 : 2;
  const parts = [['Персонал', 'var(--c6)'], ['Ремонт', 'var(--c3)'], ['Прочие', 'var(--c1)']];
  const D_ = FIELDS.map(k => parts.map(([p]) => (DATA.econ[k].lift.find(x => x[0] === p) || [])[j] || 0));
  const tot = D_.map(a => sum(a)), max = Math.max(...tot) * 1.28 || 1;
  const W = 560, H = 290, L = 34, B = 34, T = 20, bw = 74, gap = (W - L - FIELDS.length * bw) / (FIELDS.length + 1);
  const y = v => H - B - v / max * (H - B - T);
  const ticks = [0, 2, 4, 6, 8, 10, 12].filter(v => v <= max);
  let g = ticks.map(v => `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="lb-grid"/><text class="lb-ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  FIELDS.forEach((k, i) => {
    const x = L + gap + i * (bw + gap); let acc = 0;
    const segs = parts.map(([p, c], n) => { const v = D_[i][n], y1 = y(acc + v), h = y(acc) - y1; acc += v;
      return `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(0, h)}" style="fill:${c}"/>${h > 16 ? `<g class="lb-lab"><rect x="${x + bw / 2 - 17}" y="${y1 + h / 2 - 9}" width="34" height="18" rx="4"/><text x="${x + bw / 2}" y="${y1 + h / 2 + 4}" text-anchor="middle">${fmtF(v, 1)}</text></g>` : ''}`; }).join('');
    g += `<g class="lb-bar" style="animation-delay:${150 + i * 120}ms"><title>${esc(FS(k))}: ${parts.map(([p], n) => `${p} ${fmtF(D_[i][n], 2)}`).join(', ')}; итого ${fmtF(tot[i], 2)} $/барр.</title>${segs}</g>
      <text class="lb-tl" x="${x + bw / 2}" y="${y(tot[i]) - 22}" text-anchor="middle">итого</text><text class="lb-tot" x="${x + bw / 2}" y="${y(tot[i]) - 7}" text-anchor="middle">${fmtF(tot[i], 2)}</text>
      <text class="lb-x" x="${x + bw / 2}" y="${H - B + 18}" text-anchor="middle">${esc(FS(k))}</text>`;
  });
  const leg = parts.map(([p, c]) => `<span><i style="background:${c}"></i>${p}</span>`).join('') + `<span class="lb-sum">Итого лифтинг — над столбцом</span>`;
  return panel('Лифтинг затраты', '$/барр.', `<div class="lb-leg">${leg}</div><svg class="lb-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Лифтинг затраты">${g}</svg>`,
    `${yr === '2025' ? 'Факт 2025 года' : 'План на 2026 год'}. Над столбцом — итого лифтинг затрат. Единицы в книгах не указаны, по смыслу — $/барр.`, seg('liftY', [{ v: '2025', t: '2025' }, { v: '2026', t: '2026' }], yr));
}

/* ---------- схема раздела продукции (SVG, анимированная) ---------- */
function schemeSVG(k, r) {
  const S = DATA.econ[k].scheme, inR = y => y >= r.from && y <= r.to;
  const V = re => { const i = S.cols.findIndex(c => re.test(c)); return i < 0 ? null : sum(S.rows.filter(x => inR(x.y)).map(x => x.v[i] || 0)); };
  const nodes = [], edges = [];
  const N = (id, x, y, w, h, label, val, cls) => { if (val == null) return; nodes.push({ id, x, y, w, h, label, val, cls }); };
  const E = (a, b, pct, mode) => edges.push({ a, b, pct, mode });
  const ratio = (a, b) => a != null && b ? a / b : null;
  let partners = [];
  if (k !== 'Y') {
    const gross = V(/^Валовая выручка/), prior = V(/^Приоритетный платеж/), net0 = V(/^Чистая выручка/), net = net0 != null ? net0 : gross;
    const cost = V(/^Cost Oil/), prof = V(/^Profit Oil$/), poc = V(/^Profit Oil Подрядчика/), pos = V(/^Profit Oil Государства/);
    const rec = V(/^Поступления Подрядчика/), capex = V(/^Capex/), opex = V(/^Opex/), ncf = V(/^Чистый денежный поток/);
    const tax = V(/^Налоги/), bon = V(/^Бонусы/), soc = V(/^Соцпроекты/), state = V(/^Государство/);
    const hasPrior = prior != null && Math.abs(prior) > 0.5;
    const R = [10, 124, 238, 352, 480, 600, 740];
    N('gross', 450, R[0], 300, 62, 'Валовая выручка', gross, 'rev');
    if (hasPrior) { N('prior', 880, R[1], 270, 58, 'Приоритетный платёж', prior, 'st'); N('net', 300, R[1], 300, 58, 'Чистая выручка', net, 'rev'); E('gross', 'net', ratio(net, gross)); E('gross', 'prior', ratio(prior, gross)); }
    const top = hasPrior ? 'net' : 'gross', base = hasPrior ? net : gross;
    N('cost', 220, R[2], 300, 58, 'Cost Oil', cost, 'ct'); N('profit', 620, R[2], 290, 58, 'Profit Oil', prof, 'rev');
    E(top, 'cost', ratio(cost, base)); E(top, 'profit', ratio(prof, base));
    N('poc', 580, R[3], 300, 58, 'Profit Oil Подрядчика', poc, 'ct'); N('pos', 900, R[3], 260, 58, 'Profit Oil Государства', pos, 'st');
    E('profit', 'poc', ratio(poc, prof)); E('profit', 'pos', ratio(pos, prof));
    N('rec', 220, R[4], 300, 62, 'Поступления Подрядчика', rec, 'ct2');
    E('cost', 'rec', null); E('poc', 'rec', null, 'side');
    N('capex', 0, R[4] - 14, 180, 46, 'Capex', capex, 'cx'); N('opex', 0, R[4] + 42, 180, 46, 'Opex', opex, 'cx');
    E('rec', 'capex', null, 'left'); E('rec', 'opex', null, 'left');
    N('ncf', 220, R[5], 300, 58, 'Чистый денежный поток Подрядчика', ncf, 'ct2');
    E('rec', 'ncf', null);
    N('tax', 600, R[4] - 30, 250, 46, `Налоги (по доле ${KMGK()})`, tax, 'st'); N('bon', 600, R[4] + 26, 250, 46, 'Бонусы', bon, 'st'); N('soc', 600, R[4] + 82, 250, 46, 'Соцпроекты', soc, 'st');
    E('rec', 'tax', null, 'right'); E('rec', 'bon', null, 'right'); E('rec', 'soc', null, 'right');
    N('state', 900, R[4] + 10, 260, 62, 'Государство', state, 'st2');
    ['tax', 'bon', 'soc', 'pos'].forEach(x => E(x, 'state', null, x === 'pos' ? 'down' : 'right'));
    if (hasPrior) E('prior', 'state', null, 'rightdown');
    partners = S.cols.filter(c => /^на (долю )?/.test(c)).map(c => ({ c, v: V(new RegExp('^' + c.replace(/[()]/g, '\\$&') + '$')) }));
    const pw = Math.min(220, (1180 - (partners.length - 1) * 12) / partners.length), px0 = (1180 - (partners.length * pw + (partners.length - 1) * 12)) / 2;
    partners.forEach((p, i) => { N('p' + i, px0 + i * (pw + 12), R[6], pw, 58, p.c.replace(/^на (долю )?/, 'на долю '), p.v, 'pt'); E('ncf', 'p' + i, ratio(p.v, ncf), 'fan'); });
  } else {
    const inc = V(/^Общий доход/), cost = V(/^Всего расходы/), roy = V(/^Роялти$/), opx = V(/^Opex/), trn = V(/^Транспортные/), am = V(/^Амортизация/), oth = V(/^Другие расходы/);
    const pbt = V(/^Прибыль до/), cit = V(/^КПН/), np = V(/^Чистая прибыль/), plusA = V(/^\.\+Амортизация/), minusC = V(/^\.-Capex/), taxes = V(/^Налоги и роялти/), div = V(/^Дивиденты партнерам/);
    const R = [10, 124, 250, 380, 540];
    N('inc', 450, R[0], 300, 62, 'Общий доход', inc, 'rev');
    N('cost', 40, R[1], 300, 58, 'Всего расходы', cost, 'ct'); N('roy', 390, R[1], 190, 58, 'Роялти', roy, 'st'); N('pbt', 640, R[1], 320, 58, 'Прибыль до налогообложения', pbt, 'rev');
    E('inc', 'cost', ratio(cost, inc)); E('inc', 'roy', ratio(roy, inc)); E('inc', 'pbt', ratio(pbt, inc));
    [['opx', 'Opex', opx], ['trn', 'Транспорт', trn], ['am', 'Амортизация', am], ['oth', 'Другие', oth]].forEach(([id, l, v], i) => { N(id, 34 + i * 150, R[2], 140, 50, l, v, 'cx'); E('cost', id, ratio(v, cost), 'fan'); });
    N('np', 640, R[2], 260, 58, 'Чистая прибыль', np, 'ct2'); N('cit', 940, R[2], 230, 58, 'КПН', cit, 'st');
    E('pbt', 'np', ratio(np, pbt)); E('pbt', 'cit', ratio(cit, pbt));
    N('pa', 330, R[3] - 12, 210, 46, '+ Амортизация', plusA, 'ct'); N('mc', 330, R[3] + 44, 210, 46, '− Capex', minusC != null ? -Math.abs(minusC) : null, 'cx');
    N('div', 640, R[3], 260, 62, 'Дивиденды партнёрам', div, 'ct2');
    E('np', 'div', null); E('pa', 'div', null, 'right'); E('mc', 'div', null, 'right');
    N('state', 940, R[3], 230, 62, 'Государство', taxes, 'st2');
    E('cit', 'state', null); E('roy', 'state', null, 'roy');
    partners = S.cols.filter(c => /^на /.test(c)).map(c => ({ c, v: V(new RegExp('^' + c.replace(/[()]/g, '\\$&') + '$')) }));
    const pw = 260;
    partners.forEach((p, i) => { N('p' + i, 40 + i * (pw + 30), R[4], pw, 58, p.c.replace(/^на (долю )?/, 'на долю '), p.v, 'pt'); E('div', 'p' + i, ratio(p.v, div), 'fan'); });
  }
  const by = Object.fromEntries(nodes.map(n => [n.id, n]));
  const H = Math.max(...nodes.map(n => n.y + n.h)) + 14;
  const path = e => {
    const a = by[e.a], b = by[e.b]; if (!a || !b) return '';
    const ax = a.x + a.w / 2, ay = a.y + a.h, bx = b.x + b.w / 2, by_ = b.y;
    if (e.mode === 'left') return `M${a.x} ${a.y + a.h / 2} H${b.x + b.w + 10} V${b.y + b.h / 2} H${b.x + b.w}`;
    if (e.mode === 'right') return `M${a.x + a.w} ${a.y + a.h / 2} H${b.x - 30} V${b.y + b.h / 2} H${b.x}`;
    if (e.mode === 'side') return `M${a.x + (a.x > b.x ? 0 : a.w)} ${a.y + a.h / 2} H${b.x + b.w / 2 + (a.x > b.x ? 40 : -40)} V${b.y}`;
    if (e.mode === 'rightdown') return `M${a.x + a.w} ${a.y + a.h / 2} H${b.x + b.w + 14} V${b.y + b.h / 2} H${b.x + b.w}`;
    if (e.mode === 'roy') return `M${a.x + a.w} ${a.y + a.h / 2} H610 V${b.y - 36} H${b.x + 40} V${b.y}`;
    if (e.mode === 'long') return `M${ax} ${ay} V${ay + 150} H${b.x + 30} V${b.y}`;
    const my = e.mode === 'fan' ? b.y - 26 : (ay + by_) / 2;
    return `M${ax} ${ay} V${my} H${bx} V${by_}`;
  };
  const lbl = e => { if (e.pct == null || !isFinite(e.pct)) return ''; const b = by[e.b], a = by[e.a]; if (!b || !a) return '';
    const t = pct(e.pct, e.mode === 'fan' || Math.abs(e.pct) < 0.05 ? 2 : 0), w = t.length * 7.2 + 14;
    const x = b.x + b.w / 2, y = e.mode === 'fan' ? b.y - 26 : (a.y + a.h + b.y) / 2;
    return `<g class="sc-pill"><rect x="${x - w / 2}" y="${y - 10}" width="${w}" height="20" rx="10"/><text x="${x}" y="${y + 4.2}" text-anchor="middle">${t}</text></g>`; };
  const ord = id => nodes.findIndex(n => n.id === id);
  edges.forEach(e => { const A = by[e.a], B = by[e.b]; e.v = A && B ? (['rec', 'state', 'div'].includes(e.b) ? A.val : B.val) : null; });
  const E2 = edges.filter(e => by[e.a] && by[e.b]);
  const svg = `<svg class="scheme fl-svg" viewBox="0 0 1180 ${H}" role="img" aria-label="Схема раздела продукции"><defs><marker id="arw${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="sc-arw"/></marker></defs>
    ${E2.map((e, i) => { const d = path(e); return d ? `<g class="fl-e sc-e" data-e="${i}" data-a="${e.a}" data-b="${e.b}"><path class="fl-hit" d="${d}"/><path class="sc-edge" pathLength="1" d="${d}" marker-end="url(#arw${k})" style="animation-delay:${200 + Math.max(ord(e.a), ord(e.b)) * 70}ms"/></g>` : ''; }).join('')}
    ${E2.map(lbl).join('')}
    ${nodes.map((n, i) => `<g class="sc-node ${n.cls} fl-n" data-n="${n.id}" tabindex="0" role="button" aria-label="${esc(n.label)}: ${fm(n.val)} млн $" style="animation-delay:${i * 70}ms"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8"/><text class="sc-v scu${n.h < 50 ? ' sm' : ''}" x="${n.x + n.w / 2}" y="${n.y + n.h / 2 - 3}">${fm(n.val)}</text><text class="sc-l" x="${n.x + n.w / 2}" y="${n.y + n.h - 8}">${esc(n.label)}${n.w >= 230 ? ', млн $' : ''}</text></g>`).join('')}
  </svg>`;
  const NOTE = { rec: 'Cost Oil + Profit Oil Подрядчика', state: 'Profit Oil Государства + налоги + бонусы + соцпроекты (+ приоритетный платёж, если есть)', ncf: 'Поступления − Capex − Opex − платежи государству', div: 'Чистая прибыль + амортизация − Capex', mc: 'Вычитается при расчёте дивидендов' };
  FLOW_DATA[k] = { nodes: nodes.map(n => ({ id: n.id, label: n.label, val: n.val, note: NOTE[n.id] || '' })), edges: E2.map(e => ({ a: e.a, b: e.b, v: e.v, pct: e.pct })) };
  return `<div class="flow sc-flow" data-k="${k}"><div class="fl-tools"><span></span><div><button type="button" class="fl-btn" data-fl="reset">Сбросить выделение</button><button type="button" class="fl-btn" data-fl="full">Во весь экран</button></div></div>
    <div class="fl-scroll sc-scroll">${svg}</div><div class="tip fl-tip"></div><div class="fl-detail" hidden></div></div>`;
}
/* ============================================================
   Схема раздела продукции v3: поточная диаграмма по этапам (Sankey-стиль)
   ============================================================ */
const FLOW_DATA = {};
const FLOW_C = { rev: '#12304A', flow: '#2476B9', cost: '#F39B45', gov: '#20A675', neg: '#D85C5C', part: '#8291A5' };
function flowModel(k, r) {
  const S = DATA.econ[k].scheme, inR = y => y >= r.from && y <= r.to;
  const V = re => { const i = S.cols.findIndex(c => re.test(c)); return i < 0 ? null : sum(S.rows.filter(x => inR(x.y)).map(x => x.v[i] || 0)); };
  const nodes = [], edges = [];
  const N = (id, col, label, val, kind, note) => { if (val == null) return; nodes.push({ id, col, label, val, kind: val < 0 && kind !== 'gov' ? 'neg' : kind, note }); };
  const E = (a, b, v) => edges.push({ a, b, v });
  let stages, kpi;
  if (k !== 'Y') {
    const gross = V(/^Валовая выручка/), prior = V(/^Приоритетный платеж/), net0 = V(/^Чистая выручка/);
    const hasPrior = prior != null && Math.abs(prior) > 0.5, net = net0 != null ? net0 : gross;
    const cost = V(/^Cost Oil/), prof = V(/^Profit Oil$/), poc = V(/^Profit Oil Подрядчика/), pos = V(/^Profit Oil Государства/);
    const rec = V(/^Поступления Подрядчика/), capex = V(/^Capex/), opex = V(/^Opex/), ncf = V(/^Чистый денежный поток/);
    const tax = V(/^Налоги/), bon = V(/^Бонусы/), soc = V(/^Соцпроекты/), state = V(/^Государство/);
    const c0 = hasPrior ? 1 : 0;
    N('gross', 0, 'Валовая выручка', gross, 'rev');
    if (hasPrior) { N('prior', 1, 'Приоритетный платёж', prior, 'gov'); N('net', 1, 'Чистая выручка', net, 'flow'); E('gross', 'prior', prior); E('gross', 'net', net); }
    const top = hasPrior ? 'net' : 'gross';
    N('profit', 1 + c0, 'Profit Oil', prof, 'flow'); N('cost', 1 + c0, 'Cost Oil', cost, 'cost', 'Возмещение затрат Подрядчика');
    E(top, 'profit', prof); E(top, 'cost', cost);
    N('pos', 2 + c0, 'Profit Oil Государства', pos, 'gov'); N('poc', 2 + c0, 'Profit Oil Подрядчика', poc, 'flow');
    E('profit', 'pos', pos); E('profit', 'poc', poc);
    N('rec', 3 + c0, 'Поступления Подрядчика', rec, 'flow', 'Cost Oil + Profit Oil Подрядчика');
    E('cost', 'rec', cost); E('poc', 'rec', poc);
    N('tax', 4 + c0, `Налоги (по доле ${KMGK()})`, tax, 'gov'); N('bon', 4 + c0, 'Бонусы', bon, 'gov'); N('soc', 4 + c0, 'Соцпроекты', soc, 'gov');
    N('capex', 4 + c0, 'Capex', capex, 'cost'); N('opex', 4 + c0, 'Opex', opex, 'cost'); N('ncf', 4 + c0, 'ЧДП Подрядчика', ncf, 'flow', 'Чистый денежный поток Подрядчика: поступления − Capex − Opex − платежи государству');
    ['tax', 'bon', 'soc', 'capex', 'opex', 'ncf'].forEach(x => E('rec', x, nodes.find(n => n.id === x)?.val));
    N('state', 5 + c0, 'Государство, всего', state, 'gov', 'Profit Oil Государства + налоги + бонусы + соцпроекты' + (hasPrior ? ' + приоритетный платёж' : ''));
    ['pos', 'tax', 'bon', 'soc'].concat(hasPrior ? ['prior'] : []).forEach(x => E(x, 'state', nodes.find(n => n.id === x)?.val));
    S.cols.filter(c => /^на /.test(c)).forEach((c, i) => { const v = V(new RegExp('^' + c.replace(/[()]/g, '\\$&') + '$')); N('p' + i, 5 + c0, c.replace(/^на (долю )?/, ''), v, 'part'); E('ncf', 'p' + i, v); });
    stages = (hasPrior ? ['Выручка', 'Вычеты', 'Раздел продукции', 'Доли сторон', 'Поступления', 'Расходы и платежи', 'Распределение'] : ['Выручка', 'Раздел продукции', 'Доли сторон', 'Поступления', 'Расходы и платежи', 'Распределение']);
    kpi = [['Валовая выручка', gross, null, 'rev'], ['Cost Oil', cost, cost / gross, 'cost'], ['Profit Oil', prof, prof / gross, 'flow'], ['Государство, всего', state, state / gross, 'gov'], ['Поступления Подрядчика', rec, rec / gross, 'flow']];
  } else {
    const inc = V(/^Общий доход/), cost = V(/^Всего расходы/), roy = V(/^Роялти$/), opx = V(/^Opex/), trn = V(/^Транспортные/), am = V(/^Амортизация/), oth = V(/^Другие расходы/);
    const pbt = V(/^Прибыль до/), cit = V(/^КПН/), np = V(/^Чистая прибыль/), capex = V(/^\.-Capex/), taxes = V(/^Налоги и роялти/), div = V(/^Дивиденты партнерам/);
    N('inc', 0, 'Общий доход', inc, 'rev');
    N('roy', 1, 'Роялти', roy, 'gov'); N('pbt', 1, 'Прибыль до налогообложения', pbt, 'flow'); N('cost', 1, 'Всего расходы', cost, 'cost');
    E('inc', 'roy', roy); E('inc', 'pbt', pbt); E('inc', 'cost', cost);
    N('cit', 2, 'КПН', cit, 'gov'); N('np', 2, 'Чистая прибыль', np, 'flow');
    N('opx', 2, 'Opex', opx, 'cost'); N('trn', 2, 'Транспорт', trn, 'cost'); N('am', 2, 'Амортизация', am, 'cost'); N('oth', 2, 'Другие расходы', oth, 'cost');
    E('pbt', 'cit', cit); E('pbt', 'np', np); [['opx', opx], ['trn', trn], ['am', am], ['oth', oth]].forEach(([x, v]) => E('cost', x, v));
    N('div', 3, 'Дивиденды партнёрам', div, 'flow', 'Чистая прибыль + амортизация − Capex');
    N('capex', 3, 'Capex', capex != null ? Math.abs(capex) : null, 'cost', 'Вычитается при расчёте дивидендов');
    E('np', 'div', np); E('am', 'div', am); E('np', 'capex', capex != null ? Math.abs(capex) : null);
    N('state', 4, 'Государство', taxes, 'gov', 'Налоги и роялти: роялти + КПН');
    E('roy', 'state', roy); E('cit', 'state', cit);
    S.cols.filter(c => /^на /.test(c)).forEach((c, i) => { const v = V(new RegExp('^' + c.replace(/[()]/g, '\\$&') + '$')); N('p' + i, 4, c.replace(/^на (долю )?/, ''), v, 'part'); E('div', 'p' + i, v); });
    stages = ['Доход', 'Распределение дохода', 'Прибыль и затраты', 'Денежный поток', 'Распределение'];
    kpi = [['Общий доход', inc, null, 'rev'], ['Всего расходы', cost, cost / inc, 'cost'], ['Прибыль до налогообложения', pbt, pbt / inc, 'flow'], ['Государство (налоги и роялти)', taxes, taxes / inc, 'gov'], ['Дивиденды партнёрам', div, div / inc, 'flow']];
  }
  const ids = new Set(nodes.map(n => n.id));
  return { nodes, edges: edges.filter(e => e.v != null && ids.has(e.a) && ids.has(e.b)), stages, kpi, top: Math.abs(kpi[0][1]) || 1 };
}
function flLines(label, max) {
  const words = label.toUpperCase().split(' '), lines = [''];
  words.forEach(w => { const cur = lines[lines.length - 1]; if ((cur + ' ' + w).trim().length > 19 && cur) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim(); });
  if (lines.length > max) { lines.length = max; lines[max - 1] = lines[max - 1].slice(0, 18) + '…'; }
  return lines;
}
function flTitle(label, x, y, max) { return flLines(label, max).map((l, i) => `<text class="fl-t" x="${x}" y="${y + i * 11}">${esc(l)}</text>`).join(''); }
const widePanel = h => h.replace('class="panel', 'class="panel fl-wide');
function flowView(k, r) {
  const M = flowModel(k, r), cols = Math.max(...M.nodes.map(n => n.col)) + 1;
  const cw = 172, W = Math.max(1180, cols * cw + (cols - 1) * 74), gx = (W - cols * cw) / (cols - 1), gy = 12, padT = 46;
  const hOf = n => n.kind === 'part' || (n.kind === 'neg' && /^p\d/.test(n.id)) ? 58 : 76;
  const byCol = Array.from({ length: cols }, (_, c) => M.nodes.filter(n => n.col === c));
  const colH = byCol.map(ns => sum(ns.map(hOf)) + (ns.length - 1) * gy);
  const H = Math.max(...colH) + padT + 16;
  byCol.forEach((ns, c) => { let y = padT + (H - padT - 16 - colH[c]) / 2; ns.forEach(n => { n.x = c * (cw + gx); n.y = y; n.h = hOf(n); y += n.h + gy; }); });
  const by = Object.fromEntries(M.nodes.map(n => [n.id, n]));
  // порты: исходящие сортируем по y цели, входящие — по y источника
  M.nodes.forEach(n => {
    const outs = M.edges.filter(e => e.a === n.id).sort((p, q) => by[p.b].y - by[q.b].y);
    const ins = M.edges.filter(e => e.b === n.id).sort((p, q) => by[p.a].y - by[q.a].y);
    outs.forEach((e, i) => { e.y1 = n.y + n.h * (i + 1) / (outs.length + 1); });
    ins.forEach((e, i) => { e.y2 = n.y + n.h * (i + 1) / (ins.length + 1); });
  });
  const wOf = v => Math.max(2, Math.min(18, 18 * Math.abs(v) / M.top));
  const col = e => { const b = by[e.b]; return e.v < 0 ? FLOW_C.neg : FLOW_C[b.kind === 'part' ? 'flow' : b.kind] || FLOW_C.flow; };
  const fmtV = v => fm(v);
  const edgesSvg = M.edges.map((e, i) => {
    const a = by[e.a], b = by[e.b], x1 = a.x + cw, x2 = b.x - 9, dx = Math.max(40, (x2 - x1) / 2);
    const p = a.val ? e.v / a.val : null; e.pct = p;
    const d = `M${x1} ${e.y1} C${x1 + dx} ${e.y1}, ${x2 - dx} ${e.y2}, ${x2} ${e.y2}`;
    const mx = (x1 + x2) / 2, my = (e.y1 + e.y2) / 2, c = col(e);
    const nOut = M.edges.filter(x => x.a === e.a).length;
    const lab = nOut <= 3 && b.kind !== 'gov' || (nOut <= 3 && e.a !== 'roy' && e.a !== 'cit' && b.id !== 'state') ? (p != null && isFinite(p) && Math.abs(p) < 0.9995 ? `<g class="fl-lab" transform="translate(${mx} ${my})"><rect x="-25" y="-10" width="50" height="20" rx="10"/><text y="4">${pct(p, Math.abs(p) < 0.1 ? 1 : 0)}</text></g>` : '') : '';
    return `<g class="fl-e" data-e="${i}" data-a="${e.a}" data-b="${e.b}" style="--c:${c};animation-delay:${300 + a.col * 160}ms">
      <path class="fl-hit" d="${d}"/><path class="fl-rib" pathLength="1" d="${d}" style="stroke-width:${wOf(e.v)}px${e.v < 0 ? ';stroke-dasharray:6 5' : ''}"/>
      <path class="fl-arr" d="M${x2} ${e.y2 - 6} L${x2 + 9} ${e.y2} L${x2} ${e.y2 + 6}Z"/>${lab}</g>`;
  }).join('');
  const nodesSvg = M.nodes.map((n, i) => {
    const c = FLOW_C[n.kind] || FLOW_C.flow, src = /^p\d/.test(n.id) ? M.edges.find(e => e.b === n.id) : null, share = src ? n.val / (by[src.a].val || NaN) : n.val / M.top;
    return `<g class="fl-n ${n.kind}" data-n="${n.id}" tabindex="0" role="button" aria-label="${esc(n.label)}: ${fm(n.val)} млн $" style="--c:${c};animation-delay:${n.col * 160}ms">
      <rect class="fl-card" x="${n.x}" y="${n.y}" width="${cw}" height="${n.h}" rx="12"/><rect class="fl-bar" x="${n.x}" y="${n.y}" width="5" height="${n.h}" rx="2.5"/>
      ${flTitle(n.label, n.x + 16, n.y + 18, n.h > 60 ? 2 : 1)}
      <text class="fl-v scu" x="${n.x + 16}" y="${n.y + (n.h > 60 ? (flLines(n.label, 2).length > 1 ? 54 : 50) : 44)}">${fm(n.val)}</text>
      ${n.h > 60 ? `<text class="fl-u" x="${n.x + 16}" y="${n.y + 67}">млн $</text>` : ''}
      ${isFinite(share) && n.id !== M.nodes[0].id ? `<text class="fl-s" x="${n.x + cw - 12}" y="${n.y + (n.h > 60 ? 67 : 44)}">${pct(share, src ? 2 : Math.abs(share) < 0.1 ? 1 : 0)}</text>` : ''}</g>`;
  }).join('');
  const stagesSvg = M.stages.slice(0, cols).map((t, c) => `<text class="fl-st" x="${c * (cw + gx)}" y="16">${c + 1} · ${t.toUpperCase()}</text><line class="fl-stl" x1="${c * (cw + gx)}" x2="${c * (cw + gx) + cw}" y1="26" y2="26"/>`).join('');
  const kpis = M.kpi.map(([l, v, sh, kind]) => `<div class="fk" style="--c:${FLOW_C[v < 0 ? 'neg' : kind]}"><span class="fk-l">${l}</span><span class="fk-v scu">${fm(v)}</span><span class="fk-u">млн $${sh != null ? ` · <b>${pct(sh, 0)}</b> от ${k === 'Y' ? 'дохода' : 'выручки'}` : ''}</span>${sh != null ? `<i class="fk-bar"><i style="width:${Math.max(0, Math.min(100, sh * 100))}%"></i></i>` : '<i class="fk-bar"><i style="width:100%"></i></i>'}</div>`).join('');
  const legend = [['rev', 'Выручка / доход'], ['flow', 'Потоки Подрядчика'], ['cost', 'Затраты и возмещение'], ['gov', 'Доля государства'], ['neg', 'Отрицательные значения'], ['part', 'Доли партнёров']].map(([c, t]) => `<span><i style="background:${FLOW_C[c]}"></i>${t}</span>`).join('');
  FLOW_DATA[k] = { nodes: M.nodes.map(n => ({ id: n.id, label: n.label, val: n.val, note: n.note || '' })), edges: M.edges.map(e => ({ a: e.a, b: e.b, v: e.v, pct: e.pct })) };
  return `<div class="flow" data-k="${k}">
    <div class="fk-row">${kpis}</div>
    <div class="fl-tools"><div class="fl-legend">${legend}</div><div><button type="button" class="fl-btn" data-fl="reset">Сбросить выделение</button><button type="button" class="fl-btn" data-fl="full">Во весь экран</button></div></div>
    <div class="fl-scroll"><svg class="fl-svg" viewBox="-4 0 ${W + 8} ${H}" role="img" aria-label="Поточная схема раздела продукции">${stagesSvg}${edgesSvg}${nodesSvg}</svg></div>
    <div class="tip fl-tip"></div><div class="fl-detail" hidden></div>
    </div>`;
}
function flowEnhance(root) {
  $$('.flow[data-k]', root).forEach(F => {
    const data = FLOW_DATA[F.dataset.k], svg = F.querySelector('.fl-svg'), tip = F.querySelector('.fl-tip'), det = F.querySelector('.fl-detail');
    if (!data || !svg || F.dataset.bound) return; F.dataset.bound = '1';
    const node = id => data.nodes.find(n => n.id === id);
    let locked = null;
    const focus = id => {
      F.classList.toggle('focus', !!id);
      $$('.fl-n', F).forEach(g => g.classList.toggle('on', !!id && (g.dataset.n === id || data.edges.some(e => (e.a === id && e.b === g.dataset.n) || (e.b === id && e.a === g.dataset.n)))));
      $$('.fl-e', F).forEach(g => g.classList.toggle('on', !!id && (g.dataset.a === id || g.dataset.b === id)));
    };
    const showTip = (html, ev) => { tip.innerHTML = html; tip.style.opacity = 1; const r = F.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.transform = `translate(${clamp(ev.clientX - r.left + 14, 0, r.width - tw)}px,${clamp(ev.clientY - r.top - th - 10, 0, r.height - th)}px)`; };
    svg.addEventListener('pointermove', ev => {
      const n = ev.target.closest('.fl-n'), e = ev.target.closest('.fl-e');
      if (n) { const d = node(n.dataset.n); if (!locked) focus(d.id); showTip(`<b>${esc(d.label)}</b>${tipRow('Значение', fm(d.val) + ' млн $')}${d.note ? `<div style="margin-top:4px;color:var(--muted)">${esc(d.note)}</div>` : ''}`, ev); return; }
      if (e) { const x = data.edges[+e.dataset.e], a = node(x.a), b = node(x.b); if (!locked) { F.classList.add('focus'); $$('.fl-e', F).forEach(g => g.classList.toggle('on', g === e)); $$('.fl-n', F).forEach(g => g.classList.toggle('on', g.dataset.n === x.a || g.dataset.n === x.b)); }
        showTip(`<b>${esc(a.label)} → ${esc(b.label)}</b>${tipRow('Поток', fm(x.v) + ' млн $')}${x.pct != null && isFinite(x.pct) ? tipRow('Доля от источника', pct(x.pct)) : ''}`, ev); return; }
      tip.style.opacity = 0; if (!locked) focus(null);
    });
    svg.addEventListener('pointerleave', () => { tip.style.opacity = 0; if (!locked) focus(null); });
    const open = id => {
      locked = id; focus(id); const d = node(id);
      const ins = data.edges.filter(e => e.b === id), outs = data.edges.filter(e => e.a === id);
      const li = (arr, side) => arr.map(e => { const o = node(side === 'in' ? e.a : e.b); return `<li><span>${esc(o.label)}</span><b>${fm(e.v)}</b><em>${e.pct != null && isFinite(e.pct) ? pct(side === 'in' ? (d.val ? e.v / d.val : null) : e.pct) : ''}</em></li>`; }).join('');
      det.hidden = false;
      det.innerHTML = `<div class="fd-h"><div><span class="fd-k">Выбрано</span><h4>${esc(d.label)}</h4></div><b class="fd-v">${fm(d.val)} <small>млн $</small></b><button type="button" class="fl-btn" data-fl="reset" aria-label="Закрыть">×</button></div>${d.note ? `<p class="fd-n">${esc(d.note)}</p>` : ''}
        <div class="fd-c">${ins.length ? `<div><span class="fd-k">Откуда</span><ul>${li(ins, 'in')}</ul></div>` : ''}${outs.length ? `<div><span class="fd-k">Куда</span><ul>${li(outs, 'out')}</ul></div>` : ''}</div>`;
    };
    svg.addEventListener('click', ev => { const n = ev.target.closest('.fl-n'); if (n) open(n.dataset.n); });
    svg.addEventListener('keydown', ev => { const n = ev.target.closest('.fl-n'); if (n && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); open(n.dataset.n); } });
    F.addEventListener('click', ev => {
      const b = ev.target.closest('[data-fl]'); if (!b) return;
      if (b.dataset.fl === 'reset') { locked = null; focus(null); det.hidden = true; }
      if (b.dataset.fl === 'full') { const p = F.closest('.panel') || F; if (document.fullscreenElement) document.exitFullscreen(); else if (p.requestFullscreen) p.requestFullscreen(); }
    });
  });
}

/* ---------- CAPEX / OPEX по месяцам ---------- */
function capexOpex(k) {
  const mo = DATA.econ[k].monthly, idx = mo.months.map((m, i) => m.startsWith('2026') ? i : -1).filter(i => i >= 0);
  const M = idx.map(i => mo.months[i]);
  const ch = (key, title, color) => chartBox({ title, cats: M, series: [{ name: 'План', color: 'var(--ink-2)', kind: 'line', dash: true, values: idx.map(i => mo[key].plan[i]), unit: 'млн $' }, { name: 'Факт', color, kind: 'line', area: true, width: 2.6, values: idx.map(i => mo[key].fact[i]), unit: 'млн $' }], xFmt: c => MN[+c.slice(5) - 1], tipTitle: c => mLong(c) });
  return `<div class="grid2">${panel(`Капитальные затраты ${FS(k)}, 2026`, 'млн $ в месяц', ch('capex', 'Capex', 'var(--c1)'))}${panel(`Эксплуатационные расходы ${FS(k)}, 2026`, 'млн $ в месяц', ch('opex', 'Opex', 'var(--c2)'))}</div>
`;
}
function grpTable(k) {
  const g = DATA.econ[k].grp, rows = g.rows;
  const fx = rows.some(r => r.fixed), d = r => /^\$/.test(r.unit) ? 2 : 1;
  const isMain = r => /^(Капитальные затраты|Эксплуатационные расходы|Операционные расходы)/.test(r.name);
  return `<h3 class="sub-h">Исполнение ГРПиБ, ${esc(g.period)} 2026</h3>` + table(
    [{ t: 'Статья' }, { t: 'Ед.' }, { t: 'План 2026', v: true }, { t: `План ${g.period}`, v: true }, { t: `Факт ${g.period}`, v: true }, { t: 'Откл.', v: true }, { t: 'Исполнение', v: true }, { t: 'Комментарий' }],
    rows.map(r => ({ cls: isMain(r) ? 'grp-main' : 'grp-sub', cells: [isMain(r) ? `<b>${esc(r.name)}</b>` : `<span class="grp-ind">${esc(r.name)}</span>`, esc(r.unit), r.plan == null ? null : fmtF(r.plan, d(r)), r.ytdPlan == null ? null : fmtF(r.ytdPlan, d(r)), r.ytdFact == null ? null : fmtF(r.ytdFact, d(r)),
      r.ytdFact != null && r.ytdPlan != null ? `${r.ytdFact - r.ytdPlan >= 0 ? '+' : ''}${fmtF(r.ytdFact - r.ytdPlan, d(r))}` : null,
      r.ytdPlan ? pill(r.ytdFact / r.ytdPlan, false) : null, r.note ? `<span class="txt econ-note">${esc(r.note)}</span>` : ''] })))
    + `<p class="note">Для затрат «ниже плана» отмечено синим, «выше плана» — красным.${fx ? ' Часть значений в книге указана в тыс. $ при подписи «млн $» — приведены к млн $.' : ''}</p>`;
}
/* ---------- денежные потоки ---------- */
function cashView(k, r) {
  const C = DATA.econ[k].cash, rows = C.rows.filter(x => x.y >= r.from && x.y <= r.to), yrs = rows.map(x => String(x.y));
  const ii = [0, C.cols.findIndex(c => /Республики/.test(c))].filter((i, j, a) => i >= 0 && a.indexOf(i) === j);
  const cs = []; ii.forEach((i, n) => { const c = C.cols[i];
    cs.push({ name: c, color: n ? 'var(--c3)' : 'var(--c1)', values: rows.map(x => x.y <= 2025 ? x.v[i] : null), unit: 'млн $' });
    cs.push({ name: `${c} (план/прогноз)`, color: n ? 'var(--c3)' : 'var(--c1)', hatch: true, values: rows.map(x => x.y > 2025 ? x.v[i] : null), unit: 'млн $' }); });
  const main = chartBox({ title: 'Денежные потоки', cats: yrs, series: cs.filter(s => s.values.some(v => v != null)), xFmt: y => y, tipTitle: y => y + ' год' });
  const share = chartBox({ title: 'Доля Республики', height: 320, cats: yrs, series: [{ name: 'Доля Республики', color: 'var(--accent)', kind: 'line', width: 2.6, values: rows.map(x => x.share == null ? null : x.share * 100), unit: '%' }], xFmt: y => y, tipTitle: y => y + ' год' });
  const tot = ii.map(i => sum(rows.map(x => x.v[i] || 0)));
  const d1 = donut(ii.map((i, n) => ({ label: C.cols[i].replace('Денежные потоки ', '').replace(/^./, c => c.toUpperCase()), v: Math.max(0, tot[n]), color: n ? 'var(--c3)' : 'var(--c1)', text: `${fm(tot[n])} млн $` })), { v: fm(sum(tot.map(v => Math.max(0, v)))), l: 'млн $' });
  const bud = ['Национальный фонд', 'Республиканский бюджет', 'Местный бюджет'].map(c => ({ c, i: C.cols.indexOf(c) })).filter(x => x.i >= 0);
  const BL = { 'Национальный фонд': 'Нацфонд', 'Республиканский бюджет': 'Респ. бюджет', 'Местный бюджет': 'Местный бюджет' };
  const d2 = bud.length ? donut(bud.map((b, n) => ({ label: BL[b.c] || b.c, v: Math.max(0, sum(rows.map(x => x.v[b.i] || 0))), color: ['var(--c1)', 'var(--c2)', 'var(--c3)'][n], text: `${fm(sum(rows.map(x => x.v[b.i] || 0)))} млн $` })), { v: fm(sum(bud.map(b => sum(rows.map(x => x.v[b.i] || 0))))), l: 'млн $' }) : '';
  return `${panel(`Денежные потоки ${k === 'Y' ? 'партнёров (дивиденды)' : 'Подрядчика'} и Республики`, 'млн $', main, 'Сплошная заливка — факт по 2025 год, штриховка — план и прогноз из книги.')}
    <div style="margin-top:16px">${panel('Доля Республики в денежном потоке', '%', share)}</div>
    <div class="grid2" style="margin-top:16px">${panel('Итого за период', 'млн $', d1)}${panel('Поступления Республики по бюджетам', 'млн $', d2 || `<div class="empty-note">В книге ${esc(FS(k))} нет разбивки поступлений Республики по бюджетам (Нацфонд, республиканский и местный бюджеты).</div>`)}</div>`;
}
/* ---------- показатели ---------- */
function indView(k) {
  const e = DATA.econ[k];
  const kind = n => /^(Чистый )?[Дд]енежный поток (Подрядчика|Республики)/.test(n) ? 'ind-cf' : /^Доля /.test(n) ? 'ind-pct' : '';
  const etab = (t, title) => t ? `<h3 class="sub-h">${title}</h3>` + table([{ t: 'Показатель' }].concat(t.cols.map(c => ({ t: esc(c), v: true }))), t.rows.map(r => ({ cls: kind(r[0]), cells: [esc(r[0])].concat(r.slice(1).map(v => v == null ? null : fmtF(v, Math.abs(v) < 100 ? 2 : 0))) }))) : '';
  let html = etab(e.contr, k === 'Y' ? `Основные показатели деятельности ${FS(k)}` : 'Экономические показатели Подрядчика');
  if (k === 'Y') html += `<p class="note">Единицы — как в книге: суммы в строках указаны в разных единицах (млн $ и тыс. $).</p>`;
  html += etab(e.rep, 'Экономические показатели Республики');
  html += `<h3 class="sub-h">Лифтинг затраты</h3>` + table([{ t: 'Статья' }, { t: 'Факт 2025', v: true }, { t: 'План 2026', v: true }, { t: 'Изменение', v: true }],
    e.lift.map(r => ({ cells: [r[0], fmtF(r[1], 2), fmtF(r[2], 2), r[1] ? `${r[2] - r[1] >= 0 ? '+' : ''}${pct(r[2] / r[1] - 1, 0)}` : null] }))
      .concat([{ cls: 'tot', cells: ['Итого', fmtF(sum(e.lift.map(r => r[1])), 2), fmtF(sum(e.lift.map(r => r[2])), 2), null] }]));
  return html;
}
RENDER.econ = {
  field(k) {
    const e = DATA.econ[k], g = e.grp;
    const cap = grpRow(k, /^Капитальн/), opx = grpRow(k, /^(Эксплуатац|Операц)/), ub = grpRow(k, /баррель/);
    const rr = r => r && r.ytdPlan ? r.ytdFact / r.ytdPlan : null;
    const ks = [];
    if (cap) { ks.push({ l: `Капитальные затраты, план ${g.period}`, v: fmtF(cap.ytdPlan, 1), u: 'млн $', s: `план 2026 — ${fmtF(cap.plan, 1)}` });
      ks.push({ l: `Капитальные затраты, факт ${g.period}`, v: fmtF(cap.ytdFact, 1), u: 'млн $', s: rr(cap) != null ? `${pct(rr(cap), 0)} плана` : '' }); }
    if (opx) { ks.push({ l: `Эксплуатационные расходы, план ${g.period}`, v: fmtF(opx.ytdPlan, 1), u: 'млн $', s: `план 2026 — ${fmtF(opx.plan, 1)}` });
      ks.push({ l: `Эксплуатационные расходы, факт ${g.period}`, v: fmtF(opx.ytdFact, 1), u: 'млн $', s: rr(opx) != null ? `${pct(rr(opx), 0)} плана` : '' }); }
    const view = sub('eView' + k, 'scheme');
    const tabs = seg('eView' + k, [{ v: 'scheme', t: 'Схема раздела продукции' }, { v: 'capex', t: 'CAPEX / OPEX' }, { v: 'cash', t: 'Денежные потоки' }, { v: 'ind', t: 'Показатели' }], view, 'econ-tabs');
    let html = secHead(`Экономика · ${FN(k)}`, 'Раздел продукции, исполнение бюджета, денежные потоки и экономические показатели.') + `<div class="econ-nav">${tabs}</div>` + (view === 'capex' ? kpis(ks) : '');
    if (view === 'scheme') {
      const ys = DATA.econ[k].scheme.rows.map(x => String(x.y));
      const r = yrRange('sch' + k, ys, [ys[0], '2026']);
      const tabsF = `<div class="fl-assets" role="tablist" aria-label="Проект">${FIELDS.map(f => `<button type="button" role="tab" aria-selected="${f === k}" class="${f === k ? 'on' : ''}" data-goto="${f}">${FS(f)}</button>`).join('')}</div>`;
      html += widePanel(panel(k === 'Y' ? `Распределение доходов ${FS(k)}` : `Схема раздела продукции ${FS(k)}`, `сумма за ${r.from}–${r.to} · данные на ${MNF[+DATA.prod.D.last.slice(5) - 1]} ${DATA.prod.D.last.slice(0, 4)}, млн $`, tabsF + schemeSVG(k, { from: r.from, to: r.to }), 'Проценты на стрелках — доля от вышестоящего показателя. Наведите на блок — подсветятся его связи, нажмите — откроется расшифровка. 2026 год — план / оценка из книги.', r.html));
    } else if (view === 'capex') {
      html += capexOpex(k) + grpTable(k);
    } else if (view === 'cash') {
      const ys = DATA.econ[k].cash.rows.map(x => String(x.y));
      const r = yrRange('cf' + k, ys, [ys[0], ys[ys.length - 1]]);
      html += `<div class="econ-range">${r.html}</div>` + cashView(k, r);
    } else html += indView(k);
    return `<section>${html}${srcNote(`${ECON_SRC[k]}, листы «Схема РП», «ГРПиБ», «Денежный поток», экономические показатели, «Лифтинг затраты».`)}</section>`;
  },
  all() {
    const ys = mainYears();
    const r = yrRange('eAll', ys, [ys[0], '2026']);
    const rows = FIELDS.map(k => { const g = DATA.econ[k].grp; return { k, g, c: grpRow(k, /^Капитальн/), o: grpRow(k, /^(Эксплуатац|Операц)/), u: grpRow(k, /баррель/) }; });
    const tbl = table([{ t: 'Месторождение' }, { t: 'Период' }, { t: 'Capex план', v: true }, { t: 'Capex факт', v: true }, { t: 'Исполнение', v: true }, { t: 'Opex план', v: true }, { t: 'Opex факт', v: true }, { t: 'Исполнение', v: true }, { t: 'Удельные OPEX, $/барр.', v: true }],
      rows.map(({ k, g, c, o, u }) => ({ cells: [`<button class="lnk" data-goto="${k}"><span class="dot" style="background:${FC(k)};margin-right:6px"></span>${FS(k)}</button>`, esc(g.period), c ? fmtF(c.ytdPlan, 1) : null, c ? fmtF(c.ytdFact, 1) : null, c && c.ytdPlan ? pill(c.ytdFact / c.ytdPlan, false) : null, o ? fmtF(o.ytdPlan, 1) : null, o ? fmtF(o.ytdFact, 1) : null, o && o.ytdPlan ? pill(o.ytdFact / o.ytdPlan, false) : null, u && u.ytdFact != null ? fmtF(u.ytdFact, 2) : null] })));
    const bars = (key, color, title) => chartBox({ title, cats: FIELDS.map(FS), series: [{ name: 'План с начала года', color: 'var(--c8)', hatch: true, values: rows.map(x => x[key] ? x[key].ytdPlan : null), unit: 'млн $' }, { name: 'Факт с начала года', color, values: rows.map(x => x[key] ? x[key].ytdFact : null), unit: 'млн $' }] });
    return `<section>${secHead('Финансово-экономические показатели', 'Выплаты Республике и доля КМГ за выбранный период; лифтинг затраты и исполнение бюджета 2026 года.', r.html)}
      <div class="econ-donuts">${mainDonut(r, 2, 'млн $', 'Выплаты Республике', 'По шаблону «Главная страница экономика КНП».')}${mainDonut(r, 3, 'млн $', 'ЧДП / дивиденды, доля КМГ', 'По шаблону «Главная страница экономика КНП». Отрицательная сумма (инвестиционная фаза) показана на диаграмме как 0.')}</div>
      ${(() => { const f = fcfBlock(); return `<div class="grid2">${f.chart}${liftBars()}</div>${f.table}`; })()}
      <div class="grid2">${panel('Капитальные затраты с начала года', 'млн $', bars('c', 'var(--c1)', 'Capex'))}${panel('Эксплуатационные расходы с начала года', 'млн $', bars('o', 'var(--c2)', 'Opex'))}</div>
      ${panel('Исполнение ГРПиБ 2026', '', tbl, 'Периоды указаны в таблице.')}
      ${srcNote('листы «Схема РП», «Денежный поток», «ГРПиБ», «Лифтинг затраты» каждой книги; добыча — разделы «Добыча».')}</section>`;
  }
};

const pjText = t => esc(t).replace(/\s*·\s*/g, '<br>· ').replace(/^<br>/, '');
/* ============================================================
   Проекты v2: ключевые цифры, бюджет, сроки — визуально, текст свёрнут
   ============================================================ */
const pjNorm = t => String(t || '').toLowerCase().replace(/[\s\-–—.()«»"]/g, '');
function pjBudget(k, name) {
  const e = DATA.econ && DATA.econ[k]; if (!e) return null;
  const n = pjNorm(name);
  const r = e.grp.rows.find(x => !/^(Капитальн|Эксплуатац|Операц|Удельн|Прочие)/.test(x.name) && (n.includes(pjNorm(x.name)) || pjNorm(x.name).includes(n)));
  return r ? { row: r, period: e.grp.period } : null;
}
function pjFacts(p) {
  const t = [p.desc, p.status, p.notes].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const f = [], g = (re) => { const m = re.exec(t); return m ? m[1] : null; };
  const gain = g(/[Пп]рирост[^~\d]{0,20}~?\s?([\d.,]+)\s*тыс\.?\s*т\.?\s*в сутки/), bbl = g(/~?([\d.,]+)\s*тыс\.?\s*барр\.?\/сутки/);
  if (gain) f.push({ i: '▲', l: 'Прирост добычи', v: `${gain} тыс. т/сут`, s: bbl ? `≈ ${bbl} тыс. барр./сут` : '' });
  const est = g(/(?:[Оо]ценка|[Пп]редварительная оценка|[Пп]ервоначальная оценка)[^$]{0,40}\$\s?([\d.,]+)\s*млрд/);
  if (est) f.push({ i: '$', l: 'Оценка затрат', v: `$${est} млрд`, s: '' });
  const npv = g(/NPV@?\s?10(?:[,.]\d+)?\s*\$?\s?([\d.,]+)\s*млрд/i); if (npv) f.push({ i: '◆', l: 'NPV@10%', v: `$${npv} млрд`, s: '' });
  const irr = g(/IRR\s*([\d.,]+)\s*%/i); if (irr) f.push({ i: '%', l: 'IRR', v: `${irr}%`, s: '' });
  const gas = g(/([\d.,]+)\s*млрд\.?\s*м3\s*(?:\/\s*)?(?:в\s)?год/i); if (gas) f.push({ i: '◎', l: 'Мощность по газу', v: `${gas} млрд м³/год`, s: '' });
  const start = g(/[Вв]вод в эксплуатацию\s*(?:—|-|:)?\s*(20\d\d)/) || g(/[Вв]вод[^.]{0,30}?(20\d\d)/);
  if (start) f.push({ i: '⏱', l: 'Ввод', v: start, s: /оценка/.test(t.slice(t.indexOf(start) - 5, t.indexOf(start) + 20)) ? 'оценка' : '' });
  const prog = g(/[Пп]рогресс[^%]{0,70}?(\d{1,3}(?:[.,]\d+)?)\s*%/);
  const years = [...new Set((t.match(/\b20[2-4]\d\b/g) || []).map(Number))].filter(y => y >= 2024 && y <= 2045).sort();
  const first = (p.status || p.desc || p.notes || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0];
  return { f, prog: prog ? parseFloat(prog.replace(',', '.')) / 100 : null, years, start: start ? +start : null, summary: first.length > 200 ? first.slice(0, 198) + '…' : first };
}
function pjBudgetViz(b) {
  if (!b) return '';
  const r = b.row, mx = Math.max(r.plan || 0, r.ytdPlan || 0, Math.abs(r.ytdFact || 0)) || 1, q = r.ytdPlan ? r.ytdFact / r.ytdPlan : null;
  const bar = (l, v, c, d) => `<div class="pjb-row"><span>${l}</span><i><b style="width:${Math.max(0, (v || 0) / mx * 100)}%;background:${c};animation-delay:${d}ms"></b></i><em>${v == null ? '—' : fmtF(v, 1)}</em></div>`;
  return `<div class="pj-viz"><div class="pjb"><span class="pj-k">Бюджет 2026, млн $</span>${bar('План 2026', r.plan, 'var(--c8)', 100)}${bar(`План ${b.period}`, r.ytdPlan, 'var(--c3)', 220)}${bar(`Факт ${b.period}`, r.ytdFact, 'var(--c1)', 340)}</div>${q != null && q >= 0 ? `<div class="pj-ring">${rings([{ label: 'исполнение', r: Math.max(0, q), text: pct(q, 0), color: 'var(--c1)' }])}</div>` : ''}</div>`;
}
function pjTimeline(years, start) {
  if (!years.length) return '';
  const y0 = Math.min(2024, ...years), y1 = Math.max(...years, 2027), W = 100 / (y1 - y0);
  return `<div class="pj-tl"><span class="pj-k">Сроки, упомянутые в книге</span><div class="pj-tl-bar"><i class="now" style="left:${(2026.75 - y0) * W}%" title="сейчас"></i>${years.map((y, i) => `<span class="pj-tl-y${y === start ? ' st' : ''}" style="left:${(y - y0) * W}%;animation-delay:${300 + i * 90}ms">${y}</span>`).join('')}</div></div>`;
}
function RENDER_PROJ_BOOK(k) {
  const P = DATA.prod[k].projects || [];
  return `<div class="pj-list">${P.map((p, i) => { const b = pjBudget(k, p.name), F = pjFacts(p);
      return `<article class="pj2" style="--c:${FC(k)};--i:${i}">
      <header><span class="pj-n">${i + 1}</span><div><h3>${esc(p.name)}</h3><span class="pj-f">${esc(FS(k))}</span></div>${F.prog != null ? `<div class="pj-prog" title="прогресс работ">${rings([{ label: 'прогресс', r: Math.min(1, F.prog), text: pct(F.prog, 0), color: 'var(--accent)' }])}</div>` : ''}</header>
      ${F.f.length ? `<div class="pj-chips">${F.f.map((c, j) => `<div class="pj-chip" style="animation-delay:${200 + j * 80}ms"><span class="ic">${c.i}</span><span class="cl">${c.l}</span><b>${esc(c.v)}</b>${c.s ? `<small>${esc(c.s)}</small>` : ''}</div>`).join('')}</div>` : ''}
      ${pjBudgetViz(b)}
      ${pjTimeline(F.years, F.start)}
      ${F.summary ? `<p class="pj-sum">${esc(F.summary)}</p>` : ''}
      <div class="pj-more-wrap">
        ${p.desc ? `<details><summary>Описание</summary><p>${pjText(p.desc)}</p></details>` : ''}
        ${p.status ? `<details><summary>Оценка и статус</summary><p>${pjText(p.status)}</p></details>` : ''}
        ${p.notes ? `<details><summary>Основные моменты и риски</summary><p>${pjText(p.notes)}</p></details>` : ''}
        ${p.done ? `<details><summary>Завершённые проекты</summary><p>${pjText(p.done)}</p></details>` : ''}
      </div></article>`; }).join('')}</div>`;
}

/* ============================================================
   Проекты v3: данные из презентации «Инвпроекты ДКНП» + книги проектов
   ============================================================ */
const KMGK = () => (DATA.projDeck || {}).kmgDefault || 'КМГ';
const PJ_STAGES = ['Изучение', 'Выбор концепции', 'Разработка', 'Реализация', 'Завершение', 'Завершён'];
const PJ_SC = { 'Изучение': '#8291A5', 'Выбор концепции': '#F39B45', 'Разработка': '#2476B9', 'Реализация': '#20A675', 'Завершение': '#0FA3A3', 'Завершён': '#12304A' };
const pjMoney = v => v == null ? '—' : `$${fmtF(v, v % 1 ? 1 : 0)} млн`;
function pjDeck(k) { return ((DATA.projDeck || {}).fields || {})[k] || null; }
function pjGrp(k, key) {
  const e = DATA.econ && DATA.econ[k]; if (!e || !key) return null;
  const n = pjNorm(key), r = e.grp.rows.find(x => pjNorm(x.name).includes(n));
  return r ? { row: r, period: e.grp.period } : null;
}
function pjBook(k, name) { return name ? (DATA.prod[k].projects || []).find(p => p.name === name) : null; }
function pjAll() {
  const out = [];
  FIELDS.forEach(k => {
    const d = pjDeck(k);
    if (d) d.forEach(p => out.push({ k, p, deck: true }));
    else (DATA.prod[k].projects || []).forEach(b => out.push({ k, p: { id: b.name, name: b.name.replace(/\s*\(.*$/, ''), stage: /Акт ввода|проектную мощность/.test((b.desc || '') + (b.status || '')) ? 'Завершён' : 'Реализация', essence: '', status: [], book: b.name, finishY: null, _book: b }, deck: false }));
  });
  ((DATA.projDeck || {}).extra || []).forEach(p => out.push({ k: null, p, deck: true, extra: true }));
  return out;
}
const pjStage = st => `<span class="pj-stage" style="--s:${PJ_SC[st] || '#8291A5'}">${esc(st)}</span>`;
function pjFin(f) {
  if (!f) return '';
  const kl = f.kmgLabel || (DATA.projDeck || {}).kmgDefault || '', cell = (l, v, s, i) => `<div class="pf3" style="animation-delay:${150 + i * 80}ms"><span class="pf3-l">${l}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;
  const c = [];
  if (f.capex != null) c.push(cell(f.capexFact ? 'CAPEX, факт' : 'CAPEX', pjMoney(f.capex), f.capexKmg != null ? `${pjMoney(f.capexKmg)} на долю ${kl}` : '', c.length));
  if (f.npv != null) c.push(cell('NPV @10,68%', pjMoney(f.npv), f.npvKmg != null ? `${pjMoney(f.npvKmg)} на долю ${kl}` : '', c.length));
  if (f.irr != null) c.push(cell('IRR', `${fmtF(f.irr, f.irr % 1 ? 1 : 0)}%`, '', c.length));
  if (f.pp != null) c.push(cell('Окупаемость', `${f.pp} г.`, '', c.length));
  return `<div class="pf3-grid">${c.join('')}</div>`;
}
function pjPhases(k) {
  const P = ((DATA.projDeck || {}).phases || {})[k]; if (!P) return '';
  const mx = Math.max(...P.map(p => p.tpd));
  return panel('Основные фазы разработки месторождения', 'скважины и суточная добыча', `<div class="ph3">${P.map((p, i) => `${i ? '<span class="ph3-arr" aria-hidden="true">➜</span>' : ''}<div class="ph3-c" style="--i:${i}"><div class="ph3-h"><b>${esc(p.name)}</b><span>${esc(p.period)}</span></div>
    <div class="ph3-w"><b class="cu">+${p.wells}</b> скважин<small>${esc(p.what)}</small></div>
    <div class="ph3-bar"><i style="width:${p.tpd / mx * 100}%;animation-delay:${300 + i * 200}ms"></i></div>
    <div class="ph3-t">до <b>${fmt(p.tpd)}</b> т нефти в сутки <small>${esc(p.bpd)}</small></div></div>`).join('')}</div>`);
}
function pjCard(k, p, i) {
  const c = k ? FC(k) : '#8291A5', b = k ? pjGrp(k, p.grp) : null, book = k ? pjBook(k, p.book) : null;
  const res = p.reserves ? `<div class="pj-res">${p.reserves.map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>${p.resNote ? `<p class="pj-resn">${esc(p.resNote)}</p>` : ''}` : '';
  const prog = p.progress != null ? `<div class="pj-prog" title="прогресс">${rings([{ label: p.progressLabel || 'прогресс', r: p.progress, text: pct(p.progress, 0), color: PJ_SC[p.stage] }])}</div>` : '';
  return `<article class="pj3" id="pj-${esc(p.id)}" style="--c:${c};--s:${PJ_SC[p.stage] || '#8291A5'};--i:${i}">
    <header><div class="pj3-t"><h3>${esc(p.name)}${p.alias ? ` <small>${esc(p.alias)}</small>` : ''}</h3><div class="pj3-meta">${pjStage(p.stage)}${p.owner ? `<span class="pj-own">${esc(p.owner)}</span>` : ''}${p.finish ? `<span class="pj-fin">⏱ ${esc(p.finish)}</span>` : ''}</div></div>${prog}</header>
    ${p.essence ? `<div class="pj-ess"><b>${esc(p.essence)}</b>${p.essenceSub ? `<span>${esc(p.essenceSub)}</span>` : ''}</div>` : ''}
    ${p.effect ? `<div class="pj-eff"><span class="pj-k">Ожидаемый эффект</span><b>${esc(p.effect)}</b>${p.effectKmg ? `<small>${esc(p.effectKmg)}</small>` : ''}</div>` : ''}
    ${pjFin(p.fin)}${res}${pjBudgetViz(b)}
    ${p.status && p.status.length ? `<div class="pj-stl"><span class="pj-k">Текущий статус</span><ul>${p.status.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    <div class="pj-more-wrap">
      ${p.scope ? `<details><summary>Объём работ</summary><ul class="pj-scope">${p.scope.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}
      ${book ? `<details><summary>Из книги проекта${book.name !== p.name ? ` («${esc(book.name)}»)` : ''}</summary>${book.desc ? `<p><b>Описание.</b> ${pjText(book.desc)}</p>` : ''}${book.status ? `<p><b>Оценка и статус.</b> ${pjText(book.status)}</p>` : ''}${book.notes ? `<p><b>Основные моменты и риски.</b> ${pjText(book.notes)}</p>` : ''}${book.done ? `<p><b>Завершённые проекты.</b> ${pjText(book.done)}</p>` : ''}</details>` : ''}
    </div></article>`;
}
RENDER.proj = {
  field(k) {
    const D_ = pjDeck(k);
    let html = secHead(`Проекты · ${FN(k)}`, D_ ? 'Стадия, суть, финансовые показатели и статус — по презентации «Инвпроекты ДКНП»; бюджет 2026 года — из ГРПиБ; тексты книги — в «Из книги проекта».' : 'Данные из книги проекта.');
    html += pjPhases(k);
    if (D_) html += `<div class="pj-list">${D_.map((p, i) => pjCard(k, p, i)).join('')}</div>`;
    else html += RENDER_PROJ_BOOK(k);
    return `<section>${html}${srcNote(D_ ? `презентация «Инвпроекты ДКНП»; книга ${FS(k)} — листы «Проекты», «ГРПиБ таблица».` : `книга ${FS(k)}, лист «Проекты».`)}</section>`;
  },
  all() {
    const A = pjAll(), F = A.filter(x => x.p.fin);
    const sum_ = key => sum(F.map(x => x.p.fin[key] || 0));
    let html = secHead('Проекты · портфель', 'Инвестиционные проекты по стадиям, финансовым показателям и срокам. Нажмите на проект, чтобы открыть подробности.');
    html += kpis([{ l: 'Проектов в портфеле', v: String(A.length), s: `${A.filter(x => x.p.stage === 'Реализация' || x.p.stage === 'Завершение').length} в реализации / завершении` },
      { l: 'CAPEX проектов', v: fmt(sum_('capex')), u: 'млн $', s: `${F.length} проектов с оценкой` },
      { l: 'NPV @10,68%', v: fmt(sum_('npv')), u: 'млн $', s: 'сумма по проектам с оценкой' },
      { l: 'Медианный IRR', v: (() => { const v = F.map(x => x.p.fin.irr).filter(x => x != null).sort((a, b) => a - b); return v.length ? fmtF(v[Math.floor(v.length / 2)], 1) + '%' : '—'; })(), s: 'по проектам с оценкой' }]);
    // воронка стадий
    const pipe = `<div class="pj-pipe">${PJ_STAGES.map(st => { const L = A.filter(x => x.p.stage === st); return `<div class="pp-col" style="--s:${PJ_SC[st]}"><div class="pp-h">${esc(st)}<b>${L.length}</b></div>${L.map((x, i) => `<button type="button" class="pp-item" ${x.k ? `data-goto="${x.k}"` : ''} style="--c:${x.k ? FC(x.k) : '#8291A5'};animation-delay:${i * 90}ms"><span class="dot" style="background:${x.k ? FC(x.k) : '#8291A5'}"></span>${esc(x.p.name)}<small>${x.k ? esc(FS(x.k)) : esc(x.p.owner || '')}</small></button>`).join('')}</div>`; }).join('')}</div>`;
    html += panel('Портфель по стадиям', '', pipe, 'От изучения к завершению. Цвет точки — месторождение.');
    const names = F.map(x => x.p.name);
    const cn = chartBox({ title: 'CAPEX и NPV', cats: names, series: [{ name: 'CAPEX', color: 'var(--c3)', values: F.map(x => x.p.fin.capex), unit: 'млн $' }, { name: 'NPV @10,68%', color: '#20A675', values: F.map(x => x.p.fin.npv ?? null), unit: 'млн $' }] });
    const irr = F.filter(x => x.p.fin.irr != null).sort((a, b) => b.p.fin.irr - a.p.fin.irr);
    const ib = hbars(irr.map(x => ({ label: `<span class="dot" style="background:${FC(x.k)};margin-right:6px"></span>${esc(x.p.name)}`, bars: [{ v: x.p.fin.irr, color: FC(x.k), text: `${fmtF(x.p.fin.irr, 1)}% · окуп. ${x.p.fin.pp}` }] })));
    html += `<div class="grid2">${panel('CAPEX и NPV проектов', 'млн $', cn, 'CAPEX у завершённых проектов — фактический.')}${panel('IRR и окупаемость', '%', ib)}</div>`;
    // сроки
    const T = A.filter(x => x.p.finishY || (x.p.fin && x.p.fin.pp));
    const y0 = 2022, y1 = 2042, Wd = 100 / (y1 - y0);
    const gantt = `<div class="pj-gantt"><div class="pg-axis">${Array.from({ length: (y1 - y0) / 2 + 1 }, (_, i) => y0 + i * 2).map(y => `<span style="left:${(y - y0) * Wd}%">${y}</span>`).join('')}</div>${T.map((x, i) => { const f = x.p.finishY, pp = x.p.fin && x.p.fin.pp; const a = Math.min(...[f, pp].filter(Boolean)), b2 = Math.max(...[f, pp].filter(Boolean));
      return `<button type="button" class="pg-row" ${x.k ? `data-goto="${x.k}"` : ''} style="--c:${x.k ? FC(x.k) : '#8291A5'};--i:${i}"><span class="pg-name"><span class="dot" style="background:${x.k ? FC(x.k) : '#8291A5'}"></span>${esc(x.p.name)}</span><span class="pg-track">${a !== b2 ? `<i class="pg-span" style="left:${(a - y0) * Wd}%;width:${(b2 - a) * Wd}%"></i>` : ''}${f ? `<i class="pg-dot st" style="left:${(f - y0) * Wd}%" title="${esc(x.p.finish || '')}"></i>` : ''}${pp ? `<i class="pg-pp" style="left:${(pp - y0) * Wd}%" title="окупаемость ${pp}"></i>` : ''}<i class="pg-now" style="left:${(2026.75 - y0) * Wd}%"></i></span></button>`; }).join('')}</div>`;
    html += panel('Сроки: завершение и окупаемость', '', gantt, '● — завершение / ввод (или базовое проектирование для Актоты и Кайран), ◆ — год окупаемости, вертикальная линия — сегодня.');
    FIELDS.forEach(k => {
      const L = A.filter(x => x.k === k); if (!L.length) return;
      html += `<h3 class="sub-h"><span class="dot" style="background:${FC(k)};margin-right:8px"></span>${esc(FN(k))}</h3><div class="pj-grid">${L.map((x, i) => `<button type="button" class="pj-mini" data-goto="${k}" style="--c:${FC(k)};--i:${i}"><h4>${esc(x.p.name)}</h4>${pjStage(x.p.stage)}
        ${x.p.essence ? `<p class="pj-mess">${esc(x.p.essence)}</p>` : ''}
        ${x.p.fin ? `<span class="pj-mchips">${x.p.fin.capex != null ? `<span><em>$</em>${pjMoney(x.p.fin.capex)}</span>` : ''}${x.p.fin.irr != null ? `<span><em>%</em>IRR ${fmtF(x.p.fin.irr, 1)}%</span>` : ''}${x.p.fin.pp ? `<span><em>↺</em>${x.p.fin.pp}</span>` : ''}</span>` : ''}
        ${x.p.finish ? `<span class="pj-mb">⏱ ${esc(x.p.finish)}</span>` : ''}<span class="pj-more">Подробнее →</span></button>`).join('')}</div>`;
    });
    const X = ((DATA.projDeck || {}).extra || []);
    if (X.length) html += `<h3 class="sub-h">Другие проекты портфеля</h3><div class="pj-list">${X.map((p, i) => pjCard(null, p, i)).join('')}</div>`;
    return `<section>${html}${srcNote('презентация «Инвпроекты ДКНП»; книги проектов — листы «Проекты», «ГРПиБ таблица».')}</section>`;
  }
};


/* --- справочная информация по месторождению --- */
function refRows(rows) { return `<dl class="ref-dl">${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>`; }
function refPanel(sec, k) {
  const r = DATA.refs && DATA.refs[k] && DATA.refs[k][sec];
  if (!r) return '';
  if (sec === 'geo' && r.tables) return `<div style="margin-top:16px">${panel(r.title, 'справочно', r.tables.map(t => (t.title ? `<h4 class="ref-h">${esc(t.title)}</h4>` : '') + table(t.head.map((h, i) => ({ t: esc(h), v: i > 0 })), t.rows.map(row => row[4] === 'grp' ? { cls: 'tot', cells: [esc(row[0])].concat(t.head.slice(1).map(() => '')) } : { cells: row.slice(0, t.head.length).map((c, i) => c == null ? null : typeof c === 'number' ? fmt(c, Math.abs(c) < 10 ? 3 : 1) : esc(String(c))) }))).join(''))}</div>`;
  if (sec === 'geo') return `<div style="margin-top:16px">${panel(r.title, 'справочно', refRows(r.rows))}</div>`;
  if (sec === 'mk') return `<div style="margin-top:16px">${panel(r.title, 'справочно', `<div class="ref-grid">${donut([{ label: 'Экспорт', v: r.export, color: 'var(--c1)', text: 'КТО → КТК' }, { label: 'Внутренний рынок', v: r.domestic, color: 'var(--c3)', text: 'ПКОП' }], { v: '100%', l: 'годовой добычи' })}${refRows(r.rows)}</div>`)}</div>`;
  if (sec === 'eco') {
    const q = r.fact / r.quota;
    return `<div style="margin-top:16px">${panel(r.title, 'т CO₂', `<div class="ref-grid">${rings([{ label: 'Факт к квоте', r: q, text: pct(q, 0), color: FC(k), sub: `${fmt(r.fact, 0)} из ${fmt(r.quota, 0)} т` }])}${refRows([['Квота', `${fmt(r.quota, 0)} т`], ['Факт', `${fmt(r.fact, 0)} т`], ['Запас до квоты', `${fmt(r.quota - r.fact, 0)} т (${pct(1 - q, 0)})`]])}</div>`)}</div>`;
  }
  return '';
}

/* ============================================================
   Выгрузка справки: PDF (печать) и PowerPoint (редактируемые таблицы и диаграммы)
   ============================================================ */
const EXP_SECTIONS = [['geo', 'Геология'], ['prod', 'Добыча'], ['mk', 'Маркетинг'], ['en', 'Энергетика'], ['eco', 'Экология'], ['rel', 'Надёжность'], ['lc', 'Местное содержание'], ['econ', 'Экономика'], ['proj', 'Проекты']];
const FIELD_HEX = { Y: '0D3B66', X: '2C7BB6', Z: '6FB1DC', D: '8A9BB0' };
const asofText = () => { const l = DATA.prod.D.last; return `${MNF[+l.slice(5) - 1]} ${l.slice(0, 4)}`; };

function openExport() {
  if ($('#expModal')) return;
  const m = document.createElement('div');
  m.id = 'expModal'; m.className = 'exp-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'expTitle');
  m.innerHTML = `<div class="exp-card">
    <div class="exp-head"><h2 id="expTitle">Выгрузка справки</h2><button type="button" class="exp-x" aria-label="Закрыть">×</button></div>
    <p class="exp-sub">Выберите разделы — в документ попадут сводки по всем месторождениям. Данные на ${asofText()}.</p>
    <div class="exp-all"><button type="button" data-all="1">Выбрать все</button><button type="button" data-all="0">Снять все</button></div>
    <div class="exp-list">${EXP_SECTIONS.map(([v, t]) => `<label><input type="checkbox" value="${v}" checked> ${t}</label>`).join('')}</div>
    <label class="exp-opt"><input type="checkbox" id="expFields"> Добавить страницы по каждому месторождению <span>(только PDF, документ станет длиннее)</span></label>
    <div class="exp-btns"><button type="button" class="exp-btn" data-fmt="pptx">Скачать PowerPoint</button><button type="button" class="exp-btn alt" data-fmt="pdf">Скачать PDF</button></div>
    <p class="exp-note">PowerPoint собирается с редактируемыми таблицами и диаграммами. PDF: откроется окно печати — выберите «Сохранить как PDF».</p>
    <p class="exp-status" id="expStatus" role="status"></p></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('.exp-x')) return close();
    const all = e.target.closest('[data-all]');
    if (all) { $$('.exp-list input', m).forEach(i => { i.checked = all.dataset.all === '1'; }); return; }
    const b = e.target.closest('[data-fmt]');
    if (!b) return;
    const secs = $$('.exp-list input:checked', m).map(i => i.value);
    const st = $('#expStatus');
    if (!secs.length) { st.textContent = 'Выберите хотя бы один раздел.'; return; }
    if (b.dataset.fmt === 'pdf') { const wf = $('#expFields').checked; close(); exportPDF(secs, wf); return; }
    st.textContent = 'Собираем презентацию…'; $$('.exp-btn', m).forEach(x => { x.disabled = true; });
    exportPPTX(secs).then(() => close()).catch(err => { st.textContent = 'Не удалось собрать презентацию: ' + (err && err.message || err); $$('.exp-btn', m).forEach(x => { x.disabled = false; }); });
  });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  $('.exp-list input', m).focus();
}

/* ---------- PDF: страница для печати из выбранных разделов ---------- */
function exportPDF(secs, withFields) {
  const prevTheme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'light';
  CHARTS.length = 0;
  const logo = ($('.brand-logo') || {}).src || '';
  let html = `<div class="pr-cover"><img src="${logo}" alt="КазМұнайГаз"><h1>Крупные нефтегазовые проекты</h1><p class="pr-sub">Аналитическая справка · данные на ${asofText()}</p>
    <p class="pr-list">${secs.map(v => EXP_SECTIONS.find(x => x[0] === v)[1]).join(' · ')}</p><p class="pr-date">Сформировано ${new Date().toLocaleDateString('ru-RU')}</p></div>`;
  secs.forEach(t => {
    html += `<div class="pr-sec">${RENDER[t].all()}</div>`;
    if (withFields) FIELDS.forEach(k => { html += `<div class="pr-sec">${RENDER[t].field(k)}</div>`; });
    else if (DATA.refs) FIELDS.forEach(k => { const r = refPanel(t, k); if (r) html += `<div class="pr-ref"><h3 class="sub-h">${esc(FN(k))}</h3>${r}</div>`; });
  });
  const root = document.createElement('div');
  root.id = 'printRoot'; root.innerHTML = html;
  document.body.appendChild(root);
  document.body.classList.add('printing');
  drawAll(); enhance(root);
  const done = () => {
    window.removeEventListener('afterprint', done);
    root.remove(); document.body.classList.remove('printing');
    if (prevTheme) document.documentElement.dataset.theme = prevTheme; else delete document.documentElement.dataset.theme;
    render('soft');
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 500);
}

/* ---------- PowerPoint ---------- */
function loadScript(urls) {
  return urls.reduce((p, u) => p.catch(() => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = u; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); })), Promise.reject());
}
function logoPNG() {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0); res(c.toDataURL('image/png')); };
    img.onerror = () => res(null);
    img.src = ($('.brand-logo') || {}).src || '';
  });
}
async function exportPPTX(secs) {
  if (!window.PptxGenJS) await loadScript(['https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js', 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js']);
  const logo = await logoPNG();
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; pptx.title = 'Крупные нефтегазовые проекты'; pptx.company = 'КазМұнайГаз';
  const NAVY = '0B2A4A', BLUE = '0083C9', CYAN = '00AEEF', INK = '1F2D3D', MUTED = '6B7A8F', F = 'Arial';
  const foot = `Крупные нефтегазовые проекты · данные на ${asofText()}`;
  pptx.defineSlideMaster({ title: 'KMG', background: { color: 'FFFFFF' },
    objects: [{ rect: { x: 0, y: 0, w: 13.33, h: 0.1, fill: { color: BLUE } } }, { rect: { x: 0, y: 0.1, w: 13.33, h: 0.03, fill: { color: CYAN } } },
      ...(logo ? [{ image: { x: 11.35, y: 0.3, w: 1.6, h: 0.41, data: logo } }] : []),
      { text: { text: foot, options: { x: 0.5, y: 7.05, w: 9, h: 0.3, fontFace: F, fontSize: 9, color: MUTED } } }],
    slideNumber: { x: 12.5, y: 7.05, fontFace: F, fontSize: 9, color: MUTED } });
  const tSlide = (title, sub) => { const sl = pptx.addSlide({ masterName: 'KMG' }); sl.addText(title, { x: 0.5, y: 0.3, w: 10.6, h: 0.6, fontFace: F, fontSize: 24, bold: true, color: NAVY }); if (sub) sl.addText(sub, { x: 0.5, y: 0.88, w: 10.6, h: 0.35, fontFace: F, fontSize: 12, color: MUTED }); return sl; };
  const tbl = (sl, head, rows, opt = {}) => {
    const H = head.map((h, i) => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i && !opt.left ? 'right' : 'left' } }));
    const B = rows.map((r, ri) => r.map((c, i) => ({ text: c == null ? '—' : String(c), options: { color: INK, fill: { color: ri % 2 ? 'F2F6FA' : 'FFFFFF' }, align: i && !opt.left ? 'right' : 'left', bold: !!opt.boldLast && ri === rows.length - 1 } })));
    sl.addTable([H, ...B], { x: opt.x || 0.5, y: opt.y || 1.45, w: opt.w || 12.33, fontFace: F, fontSize: opt.fs || 12, border: { type: 'solid', pt: 0.5, color: 'D5DEE8' }, rowH: 0.42, autoPage: false, colW: opt.colW });
  };
  const note = (sl, t, y = 6.35) => sl.addText(t, { x: 0.5, y, w: 12.3, h: 0.55, fontFace: F, fontSize: 10, color: MUTED });
  const names = FIELDS.map(FN), short = FIELDS.map(FS), colors = FIELDS.map(k => FIELD_HEX[k] || BLUE);
  const P = v => v == null || isNaN(v) ? '—' : pct(v, 1);

  // титул
  const t0 = pptx.addSlide(); t0.background = { color: NAVY };
  if (logo) { t0.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.6, w: 3.1, h: 0.95, fill: { color: 'FFFFFF' } }); t0.addImage({ data: logo, x: 0.75, y: 0.7, w: 2.8, h: 0.72 }); }
  t0.addShape(pptx.ShapeType.rect, { x: 0.6, y: 2.55, w: 1.2, h: 0.06, fill: { color: CYAN } });
  t0.addText('Крупные нефтегазовые проекты', { x: 0.6, y: 2.75, w: 12, h: 0.9, fontFace: F, fontSize: 36, bold: true, color: 'FFFFFF' });
  t0.addText(`Аналитическая справка · ${short.join(', ')}`, { x: 0.6, y: 3.65, w: 12, h: 0.5, fontFace: F, fontSize: 18, color: 'BFD9EE' });
  t0.addText(`Данные на ${asofText()} · разделы: ${secs.map(v => EXP_SECTIONS.find(x => x[0] === v)[1]).join(', ')}`, { x: 0.6, y: 4.3, w: 12, h: 0.5, fontFace: F, fontSize: 13, color: 'BFD9EE' });
  t0.addText(`Сформировано ${new Date().toLocaleDateString('ru-RU')}`, { x: 0.6, y: 6.7, w: 6, h: 0.35, fontFace: F, fontSize: 11, color: '8FB3D1' });

  const ref = (k, sec) => DATA.refs && DATA.refs[k] && DATA.refs[k][sec];
  const refTitle = t => { const x = t.replace('Справочно: ', ''); return x[0].toUpperCase() + x.slice(1); };
  for (const t of secs) {
    if (t === 'prod') {
      const st = FIELDS.map(k => prodStats(k, 'oil')), n = st[0].months;
      const rows = FIELDS.map((k, i) => [names[i], fmt(st[i].fYTD, 0), fmt(st[i].pYTD, 0), P(st[i].ratio), fmt(st[i].plan26, 0), fmt(st[i].fact25, 0)]);
      const F_ = sum(st.map(x => x.fYTD)), P_ = sum(st.map(x => x.pYTD));
      rows.push(['Итого', fmt(F_, 0), fmt(P_, 0), P(F_ / P_), fmt(sum(st.map(x => x.plan26)), 0), fmt(sum(st.map(x => x.fact25)), 0)]);
      const sl = tSlide(`Добыча нефти, ${ytdLabel(n)}`, 'тыс. т');
      tbl(sl, ['Месторождение', 'Факт', 'План за период', 'Выполнение', 'План 2026', 'Факт 2025'], rows, { boldLast: true, colW: [4.33, 1.6, 1.8, 1.6, 1.5, 1.5] });
      const s2 = tSlide('Добыча нефти по месяцам, 2026', 'факт, тыс. т');
      s2.addChart(pptx.ChartType.bar, FIELDS.map((k, i) => ({ name: short[i], labels: MN.slice(0, n), values: DATA.prod[k].mon.oil.fact.slice(12, 12 + n).map(v => v || 0) })),
        { x: 0.5, y: 1.4, w: 12.3, h: 5.4, barGrouping: 'clustered', chartColors: colors, showLegend: true, legendPos: 'b', legendFontFace: F, catAxisLabelFontFace: F, valAxisLabelFontFace: F, valAxisLabelFormatCode: '# ##0', dataLabelFontFace: F });
    }
    if (t === 'geo') {
      const T = FIELDS.map(k => k === 'Y' ? DATA.geo.Y.objects[0] : DATA.geo[k].totals[0]);
      const sl = tSlide('Запасы нефти по основной категории', 'млн т');
      tbl(sl, ['Месторождение', 'Категория', 'Геологические', 'Извлекаемые', 'Доля извлекаемых', 'КИН утв.', 'КИН тек.'],
        FIELDS.map((k, i) => [names[i], T[i].cat, fmt(T[i].geoOil, 1), fmt(T[i].recOil, 1), P(T[i].recOil / T[i].geoOil), T[i].kin0 != null ? fmtF(T[i].kin0, 3) : '—', T[i].kin != null ? fmtF(T[i].kin, 3) : '—']),
        { colW: [4.03, 1.3, 1.6, 1.5, 1.6, 1.15, 1.15] });
      FIELDS.forEach(k => { const r = ref(k, 'geo'); if (!r) return; const s3 = tSlide(refTitle(r.title), FN(k)); tbl(s3, ['Показатель', 'Значение'], r.rows, { colW: [4.3, 8.03], fs: 13, left: true }); });
    }
    if (t === 'mk') {
      const rows = FIELDS.map((k, i) => { const pr = DATA.mk[k].products[0], st = mkStats(pr); return [names[i], ytdLabel(st.li + 1), fmt(st.f, 0), fmt(st.p, 0), P(st.r), st.price != null ? fmtF(st.price, 1) : '—']; });
      const sl = tSlide('Реализация нефти, 2026', 'тыс. т; средневзвешенная цена, $/барр.');
      tbl(sl, ['Месторождение', 'Период', 'Факт', 'План', 'Выполнение', 'Ср. цена'], rows, { colW: [4.33, 2.0, 1.5, 1.5, 1.5, 1.5] });
      const lis = FIELDS.map(k => mkStats(DATA.mk[k].products[0]).li), mx = Math.max(...lis);
      const lag = FIELDS.filter((k, i) => lis[i] < mx).map(k => `${FS(k)} — по ${MNF[lis[FIELDS.indexOf(k)]]}`);
      if (lag.length) note(sl, `Периоды различаются: в источнике ещё нет последнего месяца для ${lag.join(', ')}.`);
      FIELDS.forEach(k => {
        const r = ref(k, 'mk'); if (!r) return;
        const s3 = tSlide(refTitle(r.title), FN(k));
        s3.addChart(pptx.ChartType.doughnut, [{ name: 'Доля', labels: ['Экспорт', 'Внутренний рынок'], values: [r.export, r.domestic] }],
          { x: 0.5, y: 1.4, w: 4.6, h: 4.6, chartColors: [NAVY, CYAN], showLegend: true, legendPos: 'b', legendFontFace: F, showPercent: true, dataLabelColor: 'FFFFFF', dataLabelFontFace: F, holeSize: 55 });
        tbl(s3, ['Направление', 'Маршрут и стоимость транспортировки'], r.rows, { x: 5.4, y: 1.6, w: 7.4, colW: [2.6, 4.8], fs: 13, left: true });
      });
    }
    if (t === 'en') {
      const sl = tSlide('Энергетика: мощность собственной генерации', 'МВт');
      tbl(sl, ['Месторождение', 'Установленная', 'Фактическая', 'Загрузка', 'Период / режим'],
        FIELDS.map((k, i) => { const e = enSummary(k); return [names[i], fmt(e.cap, 1), fmt(e.out, 1), P(e.out / e.cap), e.label]; }), { colW: [4.33, 1.8, 1.8, 1.6, 2.8] });
      note(sl, 'Периоды в источниках разные: они указаны в последнем столбце.');
    }
    if (t === 'eco') {
      const sl = tSlide('Выбросы парниковых газов', 'тыс. т CO₂-экв.');
      tbl(sl, ['Месторождение', '2024', '2025', 'Квота 2025', '2025 к квоте'],
        FIELDS.map((k, i) => { const Y = ecoYears(k), a = Y['2024'] || {}, b = Y['2025'] || {}; return [names[i], a.t != null ? fmt(a.t, 1) : '—', b.t != null ? fmt(b.t, 1) : '—', b.q ? fmt(b.q, 1) : 'нет квоты', b.q ? P(b.t / b.q) : '—']; }), { colW: [4.33, 1.9, 1.9, 2.0, 2.2] });
      FIELDS.forEach(k => {
        const r = ref(k, 'eco'); if (!r) return;
        const s3 = tSlide(refTitle(r.title), `${FN(k)} · т CO₂`);
        s3.addChart(pptx.ChartType.bar, [{ name: 'т CO₂', labels: ['Квота', 'Факт'], values: [r.quota, r.fact] }],
          { x: 0.5, y: 1.4, w: 6.2, h: 5, chartColors: [NAVY, CYAN], showValue: true, dataLabelFormatCode: '# ##0', dataLabelFontFace: F, catAxisLabelFontFace: F, valAxisLabelFontFace: F, valAxisLabelFormatCode: '# ##0' });
        tbl(s3, ['Показатель', 'Значение'], [['Квота', `${fmt(r.quota, 0)} т`], ['Факт', `${fmt(r.fact, 0)} т`], ['Факт к квоте', P(r.fact / r.quota)], ['Запас до квоты', `${fmt(r.quota - r.fact, 0)} т`]], { x: 7.1, y: 1.6, w: 5.7, colW: [2.6, 3.1], fs: 13, left: true });
      });
    }
    if (t === 'rel') {
      const yrs = ['2022', '2023', '2024', '2025', '2026'];
      const sl = tSlide('Надёжность: среднегодовая фактическая эффективность', '%');
      tbl(sl, ['Месторождение'].concat(yrs.map(y => y === '2026' ? '2026 (с нач. года)' : y)),
        FIELDS.map((k, i) => { const Y = relYear(k); return [names[i]].concat(yrs.map(y => Y[y] && Y[y].f != null ? P(Y[y].f) : '—')); }), { colW: [4.33, 1.5, 1.5, 1.5, 1.5, 2.0] });
    }
    if (t === 'econ') {
      const sl = tSlide('Экономика: исполнение ГРПиБ с начала года', 'млн $');
      tbl(sl, ['Месторождение', 'Период', 'Capex план', 'Capex факт', 'Исполн.', 'Opex план', 'Opex факт', 'Исполн.', 'Удельные OPEX, $/барр.'],
        FIELDS.map((k, i) => { const g = DATA.econ[k].grp, c = grpRow(k, /^Капитальн/), o = grpRow(k, /^(Эксплуатац|Операц)/), u = grpRow(k, /баррель/); return [names[i], g.period, c ? fmt(c.ytdPlan, 1) : '—', c ? fmt(c.ytdFact, 1) : '—', c && c.ytdPlan ? P(c.ytdFact / c.ytdPlan) : '—', o ? fmt(o.ytdPlan, 1) : '—', o ? fmt(o.ytdFact, 1) : '—', o && o.ytdPlan ? P(o.ytdFact / o.ytdPlan) : '—', u && u.ytdFact != null ? fmtF(u.ytdFact, 2) : '—']; }), { colW: [3.13, 1.0, 1.2, 1.2, 1.0, 1.2, 1.2, 1.0, 1.4], fs: 11 });
      const s2 = tSlide('Денежные потоки Республики по годам', 'млн $, факт по 2025 год');
      const yrs = [...new Set(FIELDS.flatMap(k => DATA.econ[k].cash.rows.map(r => r.y)))].filter(y => y >= 2010 && y <= 2025).sort();
      s2.addChart(pptx.ChartType.bar, FIELDS.map((k, i) => { const C = DATA.econ[k].cash, j = C.cols.findIndex(c => /Республики/.test(c)); return { name: short[i], labels: yrs.map(String), values: yrs.map(y => { const r = C.rows.find(x => x.y === y); return r && j >= 0 ? (r.v[j] || 0) : 0; }) }; }),
        { x: 0.5, y: 1.4, w: 12.3, h: 5.4, barGrouping: 'stacked', chartColors: colors, showLegend: true, legendPos: 'b', legendFontFace: F, catAxisLabelFontFace: F, valAxisLabelFontFace: F, valAxisLabelFormatCode: '# ##0' });
    }
    if (t === 'proj') {
      const A = pjAll();
      const rows = A.map(x => [x.k ? FS(x.k) : (x.p.owner || ''), x.p.name, x.p.stage, x.p.fin && x.p.fin.capex != null ? fmt(x.p.fin.capex) : '—', x.p.fin && x.p.fin.npv != null ? fmt(x.p.fin.npv) : '—', x.p.fin && x.p.fin.irr != null ? fmtF(x.p.fin.irr, 1) + '%' : '—', x.p.fin && x.p.fin.pp ? String(x.p.fin.pp) : '—', x.p.finish || '—']);
      const sl = tSlide('Портфель инвестиционных проектов', 'CAPEX и NPV — млн $; по презентации «Инвпроекты ДКНП»');
      tbl(sl, ['Проект', 'Название', 'Стадия', 'CAPEX', 'NPV', 'IRR', 'Окуп.', 'Завершение'], rows, { colW: [1.3, 2.3, 1.6, 1.0, 1.0, 0.9, 0.8, 3.43], fs: 9, left: true });
    }
    if (t === 'lc') {
      const sl = tSlide('Местное содержание: доля МС в закупках', 'последний доступный период');
      tbl(sl, ['Месторождение', 'Период', 'Доля МС'], FIELDS.map((k, i) => { const d = DATA.lc.dyn[k].filter(x => x.share != null).pop(); return [names[i], d ? d.y : '—', d ? P(d.share) : '—']; }), { colW: [6.33, 3.0, 3.0] });
    }
  }
  await pptx.writeFile({ fileName: `КНП_справка_${DATA.prod.D.last}.pptx` });
}

/* --- спарклайн: факт сплошной линией, план пунктиром --- */
function spark(fact, plan, color) {
  const W = 220, H = 44, n = fact.length;
  const vals = fact.concat(plan).filter(v => v != null);
  if (!vals.length) return '';
  const mx = Math.max(...vals) * 1.08 || 1;
  const X = i => 3 + i * (W - 6) / (n - 1), Y = v => H - 3 - v / mx * (H - 8);
  const path = arr => { let d = '', pen = false; arr.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); return d; };
  const pts = fact.map((v, i) => v == null ? null : [X(i), Y(v)]).filter(Boolean);
  const area = pts.length > 1 ? `M${pts[0][0].toFixed(1)} ${H}` + pts.map(p => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') + `L${pts[pts.length - 1][0].toFixed(1)} ${H}Z` : '';
  const lp = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
    (n > 12 ? `<line x1="${X(11.5)}" x2="${X(11.5)}" y1="0" y2="${H}" style="stroke:var(--rule);stroke-width:1"/>` : '') +
    `<path class="fx-fade" d="${area}" style="fill:${color};opacity:.13"/>` +
    `<path d="${path(plan)}" style="fill:none;stroke:var(--muted);stroke-width:1.2" stroke-dasharray="3 3"/>` +
    `<path class="fx-line" pathLength="1" d="${path(fact)}" style="fill:none;stroke:${color};stroke-width:2" stroke-linejoin="round" stroke-linecap="round"/>` +
    (lp ? `<circle cx="${lp[0]}" cy="${lp[1]}" r="2.6" style="fill:${color}"/>` : '') + `</svg>`;
}
function sparkProd(k) {
  const p = DATA.prod[k], s = p.mon.oil;
  return `<span class="spark-l">Нефть 2025–2026, пунктир — план</span>${spark(s.fact, s.plan, FC(k))}`;
}

/* --- интерактив новых визуализаций (после каждой отрисовки) --- */
function enhance(root) {
  if (!REDUCED) $$('.scheme .scu, .flow .scu', root).forEach(el => countUp(el, 1100));
  flowEnhance(root);
  $$('.hb', root).forEach(h => { const pnl = h.closest('.panel'); if (pnl) pnl.classList.add('hbp'); });
  const live = $$('.donut, .rings, .hbp', root);
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('vis', e.isIntersecting))); live.forEach(el => io.observe(el)); }
  else live.forEach(el => el.classList.add('vis'));
  $$('.donut', root).forEach(d => {
    const cv = d.querySelector('.dn-v'), cl = d.querySelector('.dn-l'), dv = cv.textContent, dl = cl.textContent;
    const set = i => {
      $$('[data-dn-i]', d).forEach(x => x.classList.toggle('on', i != null && x.dataset.dnI === i));
      d.classList.toggle('hov', i != null);
      if (i == null) { cv.textContent = dv; cl.textContent = dl; return; }
      const s = d.querySelector(`.dn-seg[data-dn-i="${i}"]`); cv.textContent = s.dataset.p; cl.textContent = s.dataset.l;
    };
    d.addEventListener('pointerover', e => { const t = e.target.closest('[data-dn-i]'); set(t ? t.dataset.dnI : null); });
    d.addEventListener('pointerleave', () => set(null));
  });
  $$('.hm', root).forEach(h => {
    const tip = h.querySelector('.tip');
    const move = e => {
      const c = e.target.closest('.hm-c[data-tip]');
      if (!c) { tip.style.opacity = 0; return; }
      tip.innerHTML = c.dataset.tip; tip.style.opacity = 1;
      const hr = h.getBoundingClientRect(), cr = c.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      const left = clamp(cr.left - hr.left + cr.width / 2 - tw / 2, 0, Math.max(0, hr.width - tw));
      let top = cr.top - hr.top - th - 6; if (top < 0) top = cr.bottom - hr.top + 6;
      tip.style.transform = `translate(${left}px,${top}px)`;
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerdown', move);
    h.addEventListener('pointerleave', () => { tip.style.opacity = 0; });
  });
}

/* --- дополнительные блоки визуализации по вкладкам --- */
const tipRow = (a, b) => `<div class="r"><span>${a}</span><span>${b}</span></div>`;
const EXTRA = {
  prodAll() {
    const st = FIELDS.map(k => ({ k, ...prodStats(k, 'oil') }));
    const F = sum(st.map(s => s.fYTD)), mo = st[0].months;
    const dn = donut(st.map(s => ({ label: FS(s.k), v: s.fYTD, color: FC(s.k), text: `${fmt(s.fYTD)} тыс. т` })), { v: fmt(F / 1000, 2), l: 'млн т нефти' });
    const rg = rings(st.map(s => ({ label: `${dotHTML(s.k)}${FS(s.k)}`, r: s.plan26 ? s.fYTD / s.plan26 : null, text: s.plan26 ? pct(s.fYTD / s.plan26, 0) : '—', color: FC(s.k), mark: mo / 12, sub: `${fmt(s.fYTD)} из ${fmt(s.plan26)} тыс. т` })));
    return `<h3 class="sub-h">Карта выполнения плана</h3>${prodPFBlock()}` +
      `<div class="grid2" style="margin-top:16px">${panel(`Вклад в добычу нефти, ${ytdLabel(mo)}`, 'тыс. т', dn, 'Наведите на сегмент или строку легенды.')}` +
      `${panel('Годовой план 2026: сколько уже добыто', 'факт / план года', rg, `Риска на кольце — доля прошедшего года (${mo} из 12 мес.). Дуга короче риски — добыча отстаёт от равномерного графика.`)}</div>`;
  },
  prodField(k, key, st) {
    const p = DATA.prod[k], s = p.mon[key], u = s.unit;
    const P = s.plan.slice(12, 24), Fa = s.fact.slice(12, 24);
    let a = 0, b = 0;
    const cumP = P.map(v => (a += v || 0)), cumF = Fa.map((v, i) => i <= st.li - st.i26 ? (b += v || 0) : null);
    const ch = chartBox({
      title: 'Нарастающим итогом', cats: MONTHS26,
      series: [{ name: 'План, нарастающим', color: 'var(--ink-2)', kind: 'line', dash: true, values: cumP, unit: u, dots: false },
      { name: 'Факт, нарастающим', color: FC(k), kind: 'line', area: true, width: 2.6, values: cumF, unit: u }],
      xFmt: c => MN[+c.slice(5) - 1], tipTitle: c => mLong(c),
      tipExtra: i => cumF[i] != null ? tipRow('Отклонение', `${cumF[i] - cumP[i] >= 0 ? '+' : ''}${fmt(cumF[i] - cumP[i])} ${u}`) : ''
    });
    const f25 = sum(s.fact.slice(0, st.months));
    const rg = rings([
      { label: 'План с начала года', r: st.ratio, text: pct(st.ratio, 0), color: FC(k), sub: `${fmt(st.fYTD)} из ${fmt(st.pYTD)} ${u}` },
      { label: 'Годовой план 2026', r: st.plan26 ? st.fYTD / st.plan26 : null, text: st.plan26 ? pct(st.fYTD / st.plan26, 0) : '—', color: FC(k), mark: st.months / 12, sub: `риска — прошло ${st.months} из 12 мес.` },
      { label: `К ${ytdLabel(st.months).replace(' 2026', '')} 2025`, r: f25 ? st.fYTD / f25 : null, text: f25 ? pct(st.fYTD / f25, 0) : '—', color: 'var(--c7)', sub: `в 2025 за тот же период — ${fmt(f25)} ${u}` }
    ]);
    return `<div class="grid2" style="margin-top:16px">${panel(`${s.name}: 2026 нарастающим итогом`, u, ch, 'Разрыв между линиями — накопленное отклонение от плана.')}${panel('Темп выполнения', '', rg)}</div>`;
  },
  geoAll() {
    const T = FIELDS.map(k => ({ k, t: k === 'Y' ? DATA.geo.Y.objects[0] : DATA.geo[k].totals[0] }));
    const R = sum(T.map(x => x.t.recOil));
    return `<h3 class="sub-h">Структура запасов</h3><div class="grid2">${panel('Доля в извлекаемых запасах нефти', 'млн т', donut(T.map(x => ({ label: FS(x.k), v: x.t.recOil, color: FC(x.k), text: `${fmt(x.t.recOil, 0)} млн т` })), { v: fmt(R / 1000, 2), l: 'млрд т' }))}` +
      `${panel('Достигнутый КИН от утверждённого', 'КИН текущий / начальный', rings(T.filter(x => x.t.kin0).map(x => ({ label: `${dotHTML(x.k)}${FS(x.k)} · ${esc(x.t.cat)}`, r: x.t.kin != null ? x.t.kin / x.t.kin0 : null, text: x.t.kin != null ? pct(x.t.kin / x.t.kin0, 0) : '—', color: FC(x.k), sub: `КИН ${fmtF(x.t.kin, 3)} из ${fmtF(x.t.kin0, 3)}` }))), 'Какая часть проектного коэффициента извлечения уже достигнута.')}</div>`;
  },
  mkAll() {
    const S2 = FIELDS.map(k => ({ k, st: mkStats(DATA.mk[k].products[0]) }));
    return `<h3 class="sub-h">Карта реализации нефти</h3>${panel('Реализация нефти 2026: план и факт по месяцам', 'тыс. т', `<p class="pf-how">Как читать: сверху — выполнение плана, снизу — <b>факт / план</b>. План — сумма по всем направлениям.</p>${mkPF()}`, 'Пунктирные ячейки — месяцы без факта: показан только план. Y: факт реализации за сентябрь в источнике ещё не внесён.')}<div style="margin-top:16px">${panel('Выполнение плана реализации нефти, 2026', 'факт / план за период', rings(S2.map(({ k, st }) => ({ label: `${dotHTML(k)}${FS(k)}`, r: st.r, text: pct(st.r, 0), color: FC(k), sub: `${fmt(st.f)} из ${fmt(st.p)} тыс. т, ${ytdLabel(st.li + 1)}` }))))}</div>`;
  },
  enAll() {
    const E = FIELDS.map(k => ({ k, ...enSummary(k) }));
    return `<div style="margin-top:16px">${panel('Доля в установленной мощности генерации', 'МВт', donut(E.map(x => ({ label: FS(x.k), v: x.cap, color: FC(x.k), text: `${fmt(x.cap, 1)} МВт` })), { v: fmt(sum(E.map(x => x.cap)), 0), l: 'МВт всего' }))}</div>`;
  },
  ecoAll() {
    const Y = FIELDS.map(k => ({ k, o: ecoYears(k)['2025'] })).filter(x => x.o && x.o.t);
    if (!Y.length) return '';
    return `<div style="margin-top:16px">${panel('Структура выбросов, 2025', 'тыс. т CO₂-экв.', donut(Y.map(x => ({ label: FS(x.k), v: x.o.t, color: FC(x.k), text: `${fmt(x.o.t, 1)} тыс. т` })), { v: fmt(sum(Y.map(x => x.o.t)), 0), l: 'тыс. т CO₂-экв.' }), 'Выбросы за 2025 год по данным листов «Экология».')}</div>`;
  },
  relAll() {
    return `<div style="margin-top:16px">${pfBlock('pfRel', 'Эффективность: план и факт по месяцам', '%', relPF, 'Цвет — разница факта с планом в процентных пунктах. * — план выше 100% (вероятная ошибка в источнике), месяц исключён из среднего.', 'Как читать: сверху — <b>фактическая эффективность</b>, снизу — план. Наведите на ячейку для подробностей.')}</div>`;
  },
  lcAll() {
    const L = FIELDS.map(k => ({ k, d: DATA.lc.dyn[k].filter(x => x.share != null).pop() })).filter(x => x.d);
    return `<div style="margin-top:16px">${panel('Доля МС в общих затратах, последний период', '%', rings(L.map(x => ({ label: `${dotHTML(x.k)}${FS(x.k)}`, r: x.d.share, text: pct(x.d.share, 0), color: FC(x.k), sub: esc(x.d.y) }))))}</div>`;
  }
};

/* --- герой: живой поток добычи нефти по месторождениям --- */
const HERO = {};
function hexA(c, a) {
  c = c.trim();
  if (c[0] === '#') { if (c.length === 4) c = '#' + [...c.slice(1)].map(x => x + x).join(''); const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
  return c;
}
function lighten(c, a) {
  if (c[0] !== '#') return c;
  if (c.length === 4) c = '#' + [...c.slice(1)].map(x => x + x).join('');
  const n = parseInt(c.slice(1), 16), f = v => Math.round(v + (255 - v) * a).toString(16).padStart(2, '0');
  return '#' + f(n >> 16 & 255) + f(n >> 8 & 255) + f(n & 255);
}
function heroInit() {
  const st = FIELDS.map(k => ({ k, ...prodStats(k, 'oil') }));
  const F = sum(st.map(s => s.fYTD)), P = sum(st.map(s => s.pYTD));
  const T = FIELDS.map(k => k === 'Y' ? DATA.geo.Y.objects[0] : DATA.geo[k].totals[0]);
  $('#heroStats').innerHTML = [
    { v: fmt(F / 1000, 2), u: 'млн т', l: `нефть, факт ${ytdLabel(st[0].months)}` },
    { v: pct(F / P), l: 'выполнение плана за период' },
    { v: fmt(sum(T.map(t => t.recOil)) / 1000, 2), u: 'млрд т', l: 'извлекаемые запасы нефти' }
  ].map(s => `<div class="hs"><span class="v">${s.v}${s.u ? `<small>${s.u}</small>` : ''}</span><span class="l">${s.l}</span></div>`).join('');
  $$('#heroStats .v').forEach(el => countUp(el, 1400));
  $('#flowCap').textContent = `Потоки нефти, ${ytdLabel(st[0].months)}: ширина ленты пропорциональна фактической добыче, рамка у источника — план. Нажмите на месторождение, чтобы открыть его.`;

  const cv = $('#flow'), fig = cv.parentElement, lab = $('#flowLabels'), ctx = cv.getContext('2d');
  lab.innerHTML = st.map(s => `<button type="button" class="fl" data-goto="${s.k}" aria-label="${esc(FN(s.k))}: ${fmt(s.fYTD)} тыс. т, ${pct(s.fYTD / s.pYTD, 0)} плана"><span class="dot" style="background:${({ Y: '#eaf3fb', X: '#8cc8f0', Z: '#3fa6e6', D: '#a7b6c8' })[s.k] || FC(s.k)}"></span><b>${FS(s.k)}</b><span class="fv">${fmt(s.fYTD)} тыс. т</span><span class="fr ${s.fYTD >= s.pYTD ? 'up' : 'dn'}">${pct(s.fYTD / s.pYTD, 0)} плана</span></button>`).join('') ;
  const btns = $$('.fl', lab);
  let W = 0, H = 0, G = null, parts = [], col = {}, start = performance.now(), raf = 0, visible = true, lastT = 0;

  const readColors = () => { const cs = getComputedStyle(document.documentElement); const HC = { Y: '#eaf3fb', X: '#8cc8f0', Z: '#3fa6e6', D: '#a7b6c8' }; FIELDS.forEach(k => { col[k] = HC[k] || lighten(cs.getPropertyValue('--' + DATA.fields[k].color).trim() || '#ffffff', 0.3); }); };
  function layout() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = fig.clientWidth; H = fig.clientHeight;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    btns.forEach(b => { b.style.width = 'auto'; });
    const labW = Math.max(...btns.map(b => b.offsetWidth));
    const x0 = labW + 14, x1 = x0 + (W - x0) * 0.55, x2 = W - 4;
    const pad = 18, avail = H - pad * 2;
    let scale = avail * 0.46 / F;
    const slot = st.map(s => Math.max(s.fYTD, s.pYTD) * scale);
    const gap = Math.max(10, (avail - sum(slot)) / (st.length - 1));
    let y = pad;
    const items = st.map((s, i) => { const c = y + slot[i] / 2; y += slot[i] + gap; return { k: s.k, ys: c, t: Math.max(2, s.fYTD * scale), tp: s.pYTD * scale, f: s.fYTD }; });
    const TT = sum(items.map(i => i.t));
    let yt = H / 2 - TT / 2;
    items.forEach(it => { it.yt = yt + it.t / 2; yt += it.t; });
    G = { x0, x1, x2, items, TT, top: H / 2 - TT / 2 };
    btns.forEach((b, i) => { b.style.top = items[i].ys + 'px'; b.style.width = labW + 'px'; });
    const NP = Math.round(clamp(W * 0.38, 90, 220));
    parts = [];
    items.forEach((it, i) => { const n = Math.max(4, Math.round(NP * it.f / F)); for (let j = 0; j < n; j++) parts.push({ i, t: Math.random(), o: (Math.random() - 0.5) * 0.8, sp: 0.8 + Math.random() * 0.4, r: 0.9 + Math.random() * 1.3 }); });
  }
  const bez = (a, b, c, d, u) => { const v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; };
  function pos(it, t, o) {
    const { x0, x1, x2 } = G, a = (x1 - x0) / (x2 - x0);
    if (t < a) { const u = t / a, xm = (x0 + x1) / 2; return [bez(x0, xm, xm, x1, u), bez(it.ys, it.ys, it.yt, it.yt, u) + o * it.t]; }
    return [x1 + (t - a) / (1 - a) * (x2 - x1), it.yt + o * it.t];
  }
  function ribbon(it) {
    const { x0, x1, x2 } = G, xm = (x0 + x1) / 2, h = it.t / 2;
    ctx.beginPath();
    ctx.moveTo(x0, it.ys - h); ctx.bezierCurveTo(xm, it.ys - h, xm, it.yt - h, x1, it.yt - h); ctx.lineTo(x2, it.yt - h);
    ctx.lineTo(x2, it.yt + h); ctx.lineTo(x1, it.yt + h); ctx.bezierCurveTo(xm, it.yt + h, xm, it.ys + h, x0, it.ys + h); ctx.closePath();
    const g = ctx.createLinearGradient(x0, 0, x2, 0);
    g.addColorStop(0, hexA(col[it.k], 0.55)); g.addColorStop(0.55, hexA(col[it.k], 0.32)); g.addColorStop(1, hexA(col[it.k], 0.08));
    ctx.fillStyle = g; ctx.fill();
  }
  function frame(now) {
    if (!G) return;
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0; lastT = now;
    const rev = REDUCED ? 1 : clamp((now - start - 150) / 1300, 0, 1), e = 1 - Math.pow(1 - rev, 3);
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, G.x0 + (W - G.x0) * e, H); ctx.clip();
    G.items.forEach(ribbon);
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(G.x1, G.top - 0.5); ctx.lineTo(G.x2, G.top - 0.5); ctx.moveTo(G.x1, G.top + G.TT + 0.5); ctx.lineTo(G.x2, G.top + G.TT + 0.5); ctx.stroke();
    ctx.restore();
    // «ворота» у источника: рамка — план, заливка — факт
    G.items.forEach(it => {
      ctx.fillStyle = col[it.k]; ctx.fillRect(G.x0 - 6, it.ys - it.t / 2, 4, it.t);
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 1;
      ctx.strokeRect(G.x0 - 7.5, it.ys - it.tp / 2, 7, it.tp); ctx.setLineDash([]);
    });
    // частицы
    ctx.globalCompositeOperation = 'lighter';
    const lim = G.x0 + (W - G.x0) * e;
    parts.forEach(p => {
      if (!REDUCED) { p.t += dt * p.sp / 4.5; if (p.t > 1) { p.t -= 1; p.o = (Math.random() - 0.5) * 0.8; } }
      const it = G.items[p.i], [x, y] = pos(it, p.t, p.o);
      if (x > lim) return;
      const fade = Math.min(1, p.t / 0.06, (1 - p.t) / 0.12);
      ctx.fillStyle = hexA(col[it.k], 0.22 * fade); ctx.beginPath(); ctx.arc(x, y, p.r * 2.6, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.85 * fade})`; ctx.beginPath(); ctx.arc(x, y, p.r * 0.75, 0, 6.283); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
    if (!REDUCED && visible && !document.hidden) raf = requestAnimationFrame(frame); else raf = 0;
  }
  const kick = () => { if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); } };
  readColors(); layout(); kick();
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { layout(); kick(); }, 120); });
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(fig);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  HERO.recolor = () => { readColors(); kick(); };
}

/* ============================================================
   Boot
   ============================================================ */
/* ============================================================
   Вход по паролю: данные зашифрованы (AES-GCM, ключ из пароля через PBKDF2)
   ============================================================ */
let PAYLOAD_BYTES = null;
async function loadPayload() {
  if (PAYLOAD_BYTES) return PAYLOAD_BYTES;
  const r = await fetch(PAYLOAD.file, { cache: 'no-store' });
  if (!r.ok) throw new Error('nofile');
  return (PAYLOAD_BYTES = new Uint8Array(await r.arrayBuffer()));
}
async function unlockPayload(pw) {
  const buf = await loadPayload();
  const salt = buf.slice(0, 16), iv = buf.slice(16, 28), ct = buf.slice(28);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PAYLOAD.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  const obj = JSON.parse(new TextDecoder().decode(pt));
  DATA = obj.d; MAP_HTML = obj.m;
}
function startApp() {
  const eb = $('#exportBtn'); if (eb && !eb.dataset.bound) { eb.dataset.bound = '1'; eb.addEventListener('click', openExport); }
  const last = DATA.prod.D.last;
  $('#asof').textContent = `Факт добычи: январь–${MNF[+last.slice(5) - 1]} ${last.slice(0, 4)}`;
  $('#eyebrow').textContent = `Обзор по дисциплинам · данные на ${MN[+last.slice(5) - 1]}. ${last.slice(0, 4)}`;
  const nm = FIELDS.map(FS); $('#heroTitle').textContent = `${nm.slice(0, -1).join(', ')} и ${nm[nm.length - 1]}`;
  readHash();
  render();
  heroInit();
}
(async function gate() {
  const g = $('#gate');
  if (!PAYLOAD) {
    if (location.protocol !== 'file:') {
      g.querySelector('.gate-card').innerHTML = `<div class="gate-logo">${g.querySelector('.gate-logo').innerHTML}</div><h1 id="gateTitle" style="color:#c62f2f">Это исходник с открытыми данными</h1><p class="gate-sub">Этот файл нельзя публиковать: данные в нём не зашифрованы. Удалите его с сайта и загрузите <b>index.html</b>, собранный скриптом <b>build_secure.py</b>.</p>`;
      return;
    }
    g && g.remove(); document.body.classList.remove('locked'); const lo = $('#logoutBtn'); lo && lo.remove();
    const warn = document.createElement('div'); warn.className = 'src-warn'; warn.textContent = 'Исходник с открытыми данными — только для локальной работы. Не публиковать и не пересылать.';
    document.body.prepend(warn);
    startApp(); return;
  }
  const open = () => {
    g.classList.add('open'); document.body.classList.remove('locked');
    startApp();
    setTimeout(() => g.remove(), 600);
  };
  $('#logoutBtn').addEventListener('click', () => { try { sessionStorage.removeItem('knp-pw'); } catch (e) { } location.reload(); });
  let saved = null; try { saved = sessionStorage.getItem('knp-pw'); } catch (e) { }
  if (saved) { try { await unlockPayload(saved); open(); return; } catch (e) { try { sessionStorage.removeItem('knp-pw'); } catch (er) { } } }
  const form = $('#gateForm'), pw = $('#gatePw'), btn = $('#gateBtn'), err = $('#gateErr'), card = g.querySelector('.gate-card');
  $('#gateEye').addEventListener('click', e => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; e.currentTarget.textContent = show ? 'Скрыть' : 'Показать'; pw.focus(); });
  pw.addEventListener('keyup', e => { if (e.getModifierState) err.textContent = e.getModifierState('CapsLock') ? 'Включён Caps Lock' : (err.dataset.bad ? err.textContent : ''); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!pw.value) { err.textContent = 'Введите пароль'; pw.focus(); return; }
    btn.disabled = true; btn.textContent = 'Проверяем…'; err.textContent = ''; delete err.dataset.bad;
    try {
      await unlockPayload(pw.value);
      if ($('#gateRem').checked) { try { sessionStorage.setItem('knp-pw', pw.value); } catch (er) { } }
      btn.textContent = 'Открываем…'; open();
    } catch (ex) {
      btn.disabled = false; btn.textContent = 'Войти';
      err.textContent = ex && ex.message === 'nofile' || ex instanceof TypeError ? `Не найден файл данных ${PAYLOAD.file}. Он должен лежать рядом с index.html, а сайт — открываться по ссылке, не с диска.` : 'Неверный пароль. Проверьте раскладку клавиатуры и Caps Lock.'; err.dataset.bad = '1';
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      pw.select();
    }
  });
  setTimeout(() => pw.focus(), 300);
})();
