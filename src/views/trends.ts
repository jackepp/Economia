import { $, $$, $opt, toast } from '../dom';
import { esc, fmtKr2, kr } from '../format';
import { S, save } from '../state';
import { buildTrends, defaultTrendUi, trendStats, type Series, type TrendData } from '../trends';
import type { TrendUi } from '../types';

const MAX_SERIES = 8;
const SVG = 'http://www.w3.org/2000/svg';

function tui(): TrendUi {
  S.ui.trends = Object.assign(defaultTrendUi(), S.ui.trends || {});
  return S.ui.trends;
}

/** Väljer de 5 största utgiftsposterna (första gången, "Största 5", eller när valet försvinner vid nivåbyte). */
let autoPick = false, levelChanged = false;
function pickTop(ui: TrendUi, data: TrendData): void {
  ui.slots = {};
  data.series.filter((s) => s.type === 'expense').sort((a, b) => b.total - a.total).slice(0, 5)
    .forEach((s, i) => (ui.slots[s.id] = i + 1));
}
/** Tar bort valda serier som inte finns i den aktuella datan. */
function prune(ui: TrendUi, data: TrendData): void {
  const ids = new Set(data.series.map((s) => s.id));
  for (const id of Object.keys(ui.slots)) if (!ids.has(id)) delete ui.slots[id];
}

/** Ny serie tar lägsta lediga färgplats – redan valda behåller sin färg. */
function toggle(ui: TrendUi, id: string): void {
  if (ui.slots[id]) { delete ui.slots[id]; return; }
  const used = new Set(Object.values(ui.slots));
  for (let s = 1; s <= MAX_SERIES; s++) if (!used.has(s)) { ui.slots[id] = s; return; }
  toast(`Högst ${MAX_SERIES} serier åt gången – slå av någon först.`);
}

const color = (slot: number) => `var(--s${slot})`;

export function renderTrends(main: HTMLElement): void {
  if (!S.ui.trends) autoPick = true;
  const ui = tui();
  const data = buildTrends(ui);
  prune(ui, data);
  if (autoPick || (levelChanged && !Object.keys(ui.slots).length)) pickTop(ui, data);
  autoPick = levelChanged = false;
  const sel = data.series.filter((s) => ui.slots[s.id]);
  const opt = <T extends string | number>(cur: T, pairs: [T, string][]) =>
    pairs.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');

  main.innerHTML = `
  <div class="toolbar trendbar">
    <select id="trRange">${opt(ui.range, [[3, 'Senaste 3 mån'], [6, 'Senaste 6 mån'], [12, 'Senaste 12 mån'], [24, 'Senaste 2 år'], [0, 'Allt']])}</select>
    <select id="trGran">${opt(ui.gran, [['month', 'Per månad'], ['week', 'Per vecka']])}</select>
    <select id="trLevel">${opt(ui.level, [['main', 'Huvudkategorier'], ['sub', 'Underkategorier']])}</select>
    <select id="trChart">${opt(ui.chart, [['line', 'Linjer'], ['stack', 'Staplar (staplade)']])}</select>
    <label><input type="checkbox" id="trTotal" ${ui.total ? 'checked' : ''}> ${ui.chart === 'stack' ? 'Visa övriga utgifter' : 'Visa totala utgifter'}</label>
  </div>
  <div class="card">
    <div class="chips" id="trChips">
      ${data.series.map((s) => {
        const slot = ui.slots[s.id];
        return `<button class="chip ${slot ? 'on' : ''}" data-sid="${esc(s.id)}" aria-pressed="${!!slot}" title="${esc(s.name)}: ${kr(s.total)} i perioden">
          <span class="key" style="${slot ? `background:${color(slot)}` : ''}"></span>${esc(s.name)}</button>`;
      }).join('')}
    </div>
    <div class="toolbar" style="margin:6px 0 0"><span class="muted" style="font-size:12px">Tryck på en kategori för att visa eller dölja den (högst ${MAX_SERIES}).</span>
      <span class="spacer"></span><button class="btn" id="trTop">Största 5</button><button class="btn" id="trClear">Rensa</button></div>
    <div id="trendChart" class="trendchart"></div>
    ${data.partial ? `<p class="muted" style="font-size:12px;margin:4px 0 0">Sista ${ui.gran === 'month' ? 'månaden' : 'veckan'} pågår fortfarande och räknas inte i trenden.</p>` : ''}
  </div>
  <div class="card" style="margin-top:16px">
    <h2>Trend</h2>
    ${statsTable(sel, data, ui)}
    <details style="margin-top:12px"><summary class="muted" style="cursor:pointer">Visa alla värden per ${ui.gran === 'month' ? 'månad' : 'vecka'}</summary>
      ${dataTable(sel, data)}</details>
  </div>`;

  const on = (id: string, fn: (v: string) => void) => {
    const el = $<HTMLSelectElement | HTMLInputElement>(id, main);
    el.onchange = () => { fn(el.type === 'checkbox' ? String((el as HTMLInputElement).checked) : el.value); save(); renderTrends(main); };
  };
  on('#trRange', (v) => (ui.range = +v));
  on('#trGran', (v) => (ui.gran = v as TrendUi['gran']));
  on('#trLevel', (v) => { ui.level = v as TrendUi['level']; levelChanged = true; });
  on('#trChart', (v) => (ui.chart = v as TrendUi['chart']));
  on('#trTotal', (v) => (ui.total = v === 'true'));
  for (const b of $$('[data-sid]', main)) b.onclick = () => { toggle(ui, b.dataset.sid!); save(); renderTrends(main); };
  $('#trTop', main).onclick = () => { pickTop(ui, data); save(); renderTrends(main); };
  $('#trClear', main).onclick = () => { ui.slots = {}; save(); renderTrends(main); };

  current = { data, ui };
  drawChart();
}

/* ---------- Tabeller (samma värden som grafen – även för den som inte kan hovra) ---------- */
function statsTable(sel: Series[], data: TrendData, ui: TrendUi): string {
  if (!sel.length) return '<p class="muted">Välj kategorier ovan.</p>';
  const per = ui.gran === 'month' ? 'mån' : 'v';
  const rows = sel.map((s) => {
    const st = trendStats(s.values, data.partial);
    const flat = Math.abs(st.slope) < Math.max(20, Math.abs(st.avg) * 0.03);
    const up = st.slope > 0;
    // Uppåt är dåligt för utgifter, bra för inkomst och sparande
    const good = s.type === 'expense' ? !up : up;
    const trend = flat ? '<span class="muted">→ stabil</span>'
      : `<span class="${good ? 'pos' : 'neg'}">${up ? '↗ ökar' : '↘ minskar'} ${kr(Math.abs(st.slope))}/${per}</span>`;
    const vs = st.vsAvg === null ? '–' : `${st.vsAvg >= 0 ? '+' : '−'}${Math.round(Math.abs(st.vsAvg) * 100)} %`;
    return `<tr><td><span class="lkey" style="background:${color(ui.slots[s.id])}"></span>${esc(s.name)}</td>
      <td class="num">${kr(st.avg)}</td><td class="num">${st.last === null ? '–' : kr(st.last)}</td><td class="num">${vs}</td><td>${data.periods.length - (data.partial ? 1 : 0) >= 2 ? trend : '<span class="muted">för lite data</span>'}</td></tr>`;
  }).join('');
  return `<div style="overflow-x:auto"><table class="trtable"><thead><tr><th>Kategori</th><th class="num">Snitt/${per}</th><th class="num">Senaste</th><th class="num">mot snitt</th><th>Trend</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function dataTable(sel: Series[], data: TrendData): string {
  if (!sel.length) return '';
  return `<div style="overflow-x:auto"><table><thead><tr><th>Period</th>${sel.map((s) => `<th class="num">${esc(s.name)}</th>`).join('')}<th class="num">Alla utgifter</th></tr></thead><tbody>
    ${data.periods.map((p, i) => `<tr><td>${esc(p.label)}</td>${sel.map((s) => `<td class="num">${fmtKr2.format(s.values[i])}</td>`).join('')}<td class="num">${fmtKr2.format(data.totalExpense[i])}</td></tr>`).join('')}
    </tbody></table></div>`;
}

/* ---------- Grafen (SVG) ---------- */
let current: { data: TrendData; ui: TrendUi } | null = null;

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
};

/** Jämna steg för y-axeln: 0, 2 000, 4 000 … */
function niceTicks(min: number, max: number): number[] {
  const span = Math.max(1, max - min);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
/** Ett format per axel: kompakt (5k, 10k) om axeln når 10 000, annars hela tal. */
const tickFormat = (max: number) => (v: number) =>
  v === 0 ? '0' : max >= 10000 ? `${Math.round((v / 1000) * 10) / 10}k`.replace('.', ',') : new Intl.NumberFormat('sv-SE').format(v);

function drawChart(): void {
  const box = $opt('#trendChart');
  if (!box || !current) return;
  const { data, ui } = current;
  const sel = data.series.filter((s) => ui.slots[s.id]);
  box.innerHTML = '';
  if (!data.periods.length) { box.innerHTML = '<p class="muted">Ingen data att visa.</p>'; return; }
  if (!sel.length && !ui.total) { box.innerHTML = '<p class="muted" style="padding:40px 0;text-align:center">Välj en eller flera kategorier ovan.</p>'; return; }

  const W = box.clientWidth || 600, narrow = W < 560;
  const H = narrow ? 240 : 320;
  const n = data.periods.length;
  const stack = ui.chart === 'stack';
  // Staplat: bara utgifter/sparande (inkomster staplas inte ihop med utgifter)
  const series = stack ? sel.filter((s) => s.type !== 'income') : sel;
  const rest = data.totalExpense.map((t, i) => Math.max(0, t - series.filter((s) => s.type === 'expense').reduce((a, s) => a + s.values[i], 0)));
  const showTotal = ui.total;

  let lo = 0, hi = 1;
  if (stack) {
    for (let i = 0; i < n; i++) hi = Math.max(hi, series.reduce((a, s) => a + Math.max(0, s.values[i]), 0) + (showTotal ? rest[i] : 0));
  } else {
    for (const s of series) for (const v of s.values) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
    if (showTotal) for (const v of data.totalExpense) hi = Math.max(hi, v);
  }
  const ticks = niceTicks(lo, hi);
  lo = ticks[0]; hi = ticks[ticks.length - 1];

  // Direktetiketter vid linjeslut när det finns plats (bred skärm, få serier)
  const endLabels = !stack && !narrow && series.length + (showTotal ? 1 : 0) <= 4;
  const m = { l: 52, r: endLabels ? 120 : 12, t: 12, b: 26 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const step = n > 1 ? pw / (stack ? n : n - 1) : pw;
  const xAt = (i: number) => m.l + (stack ? step * (i + 0.5) : n > 1 ? step * i : pw / 2);
  const yAt = (v: number) => m.t + ph - ((v - lo) / (hi - lo)) * ph;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Utgifter över tid per kategori' }, box);
  // Rutnät och y-axel
  const compact = tickFormat(Math.max(Math.abs(lo), hi));
  for (const t of ticks) {
    el('line', { x1: m.l, x2: W - m.r, y1: yAt(t), y2: yAt(t), class: t === 0 ? 'axis' : 'grid' }, svg);
    const lab = el('text', { x: m.l - 6, y: yAt(t) + 4, 'text-anchor': 'end', class: 'tick' }, svg);
    lab.textContent = compact(t);
  }
  // x-etiketter – glesa ut så de inte krockar
  const every = Math.max(1, Math.ceil((n * (ui.gran === 'month' ? 48 : 34)) / pw));
  data.periods.forEach((p, i) => {
    if ((n - 1 - i) % every) return;
    const t = el('text', { x: xAt(i), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, svg);
    t.textContent = p.label + (data.partial && i === n - 1 ? '…' : '');
  });

  if (stack) {
    const bw = Math.min(24, step * 0.6);
    for (let i = 0; i < n; i++) {
      let base = 0;
      const segs = series.map((s) => ({ v: Math.max(0, s.values[i]), c: color(ui.slots[s.id]) }));
      if (showTotal && rest[i] > 0) segs.push({ v: rest[i], c: 'var(--rest)' });
      const visible = segs.filter((s) => s.v > 0);
      visible.forEach((s, k) => {
        const y0 = yAt(base), y1 = yAt(base + s.v);
        base += s.v;
        const top = k === visible.length - 1;
        const h = Math.max(0, y0 - y1 - (top ? 0 : 2)); // 2px mellanrum mellan segmenten
        if (h <= 0) return;
        const x = xAt(i) - bw / 2, y = y0 - h, r = top ? Math.min(4, h) : 0;
        el('path', { d: `M${x},${y0} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y0} Z`, fill: s.c }, svg);
      });
    }
  } else {
    const line = (vals: number[], stroke: string, cls = '') => {
      const d = vals.map((v, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
      el('path', { d, fill: 'none', stroke, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: cls }, svg);
      if (n === 1 || vals.length) el('circle', { cx: xAt(n - 1), cy: yAt(vals[n - 1]), r: 4, fill: stroke, class: 'ring' }, svg);
    };
    if (showTotal) line(data.totalExpense, 'var(--rest)');
    for (const s of series) line(s.values, color(ui.slots[s.id]));
    if (endLabels) {
      const labs = [...series.map((s) => ({ name: s.name, y: yAt(s.values[n - 1]) })), ...(showTotal ? [{ name: 'Alla utgifter', y: yAt(data.totalExpense[n - 1]) }] : [])]
        .sort((a, b) => a.y - b.y);
      // Krockar etiketterna hoppar vi över dem – förklaringen ovan och tooltipen räcker
      if (labs.every((l, i) => !i || l.y - labs[i - 1].y >= 14)) {
        for (const l of labs) { const t = el('text', { x: xAt(n - 1) + 10, y: l.y + 4, class: 'endlab' }, svg); t.textContent = l.name; }
      }
    }
  }

  // Hovring: hårkors som snäpper till närmaste period, en tooltip med alla serier
  const cross = el('line', { y1: m.t, y2: m.t + ph, class: 'cross', visibility: 'hidden' }, svg);
  const dots = el('g', {}, svg);
  const tip = document.createElement('div');
  tip.className = 'charttip';
  tip.hidden = true;
  box.appendChild(tip);
  const hit = el('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' }, svg);
  const show = (clientX: number) => {
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(stack ? (x - m.l) / step - 0.5 : n > 1 ? (x - m.l) / step : 0)));
    cross.setAttribute('x1', String(xAt(i))); cross.setAttribute('x2', String(xAt(i)));
    cross.setAttribute('visibility', 'visible');
    dots.innerHTML = '';
    const rows: { name: string; v: number; c: string }[] = series.map((s) => ({ name: s.name, v: s.values[i], c: color(ui.slots[s.id]) }));
    if (showTotal) rows.push(stack ? { name: 'Övriga utgifter', v: rest[i], c: 'var(--rest)' } : { name: 'Alla utgifter', v: data.totalExpense[i], c: 'var(--rest)' });
    if (!stack) for (const row of rows) el('circle', { cx: xAt(i), cy: yAt(row.v), r: 4, fill: row.c, class: 'ring' }, dots);
    tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'tiphead';
    head.textContent = data.periods[i].label + (data.partial && i === n - 1 ? ' (pågår)' : '');
    tip.appendChild(head);
    for (const row of rows.sort((a, b) => b.v - a.v)) {
      const line = document.createElement('div');
      const key = document.createElement('span'); key.className = 'lkey'; key.style.background = row.c;
      const val = document.createElement('b'); val.textContent = kr(row.v);
      const name = document.createElement('span'); name.className = 'muted'; name.textContent = ' ' + row.name;
      line.append(key, val, name);
      tip.appendChild(line);
    }
    if (stack) {
      const sum = document.createElement('div'); sum.className = 'muted';
      sum.textContent = 'Summa ' + kr(rows.reduce((a, r) => a + Math.max(0, r.v), 0));
      tip.appendChild(sum);
    }
    tip.hidden = false;
    const px = (xAt(i) / W) * box.clientWidth;
    tip.style.left = `${Math.min(Math.max(0, px + 12), box.clientWidth - tip.offsetWidth)}px`;
    if (px + 12 + tip.offsetWidth > box.clientWidth) tip.style.left = `${Math.max(0, px - 12 - tip.offsetWidth)}px`;
  };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; } });
}

// Rita om när fönstret ändrar storlek (t.ex. iPhone som vrids)
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawChart, 150); });
