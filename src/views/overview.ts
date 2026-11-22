import { esc, kr, monthLabel } from '../format';
import { txKey } from '../rules';
import { allMonths, catById, catLabel, displayName, isSub, orderedCats, periodTx, rootId, S, subsOf, sums, typeOf, UNCAT, type Sums } from '../state';

type MonthData = Sums & { m: string };

/** Summerar per huvudkategori, med fördelningen på underkategorier. */
function byRoot(byCat: Map<string | null, number>): Map<string | null, { v: number; subs: Map<string | null, number> }> {
  const out = new Map<string | null, { v: number; subs: Map<string | null, number> }>();
  for (const [id, v] of byCat) {
    const r = rootId(id);
    const e = out.get(r) || { v: 0, subs: new Map() };
    e.v += v;
    e.subs.set(id, (e.subs.get(id) || 0) + v);
    out.set(r, e);
  }
  return out;
}

// Klick hanteras i main.ts via data-go / data-show-cat / data-period
export function renderOverview(main: HTMLElement): void {
  const txs = periodTx(), { exp, inc, saved, byCat } = sums(txs);
  const savePct = inc > 0 ? Math.round((saved / inc) * 100) : null;
  const uncat = txs.filter((t) => !t.categoryId).length;
  const cats = [...byRoot(byCat).entries()].filter(([, e]) => Math.abs(e.v) >= 0.5).sort((a, b) => b[1].v - a[1].v);
  const max = Math.max(1, ...cats.map((c) => c[1].v));
  const mData: MonthData[] = allMonths().slice(-18).map((m) => ({ m, ...sums(S.transactions.filter((t) => t.date.startsWith(m))) }));
  const mMax = Math.max(1, ...mData.map((d) => d.exp));
  const order: (string | null)[] = [...orderedCats().filter((c) => !isSub(c)).map((c) => c.id), null];
  const barRow = (id: string | null, v: number, sub: boolean, label: string, color: string) =>
    `<div class="barrow${sub ? ' sub' : ''}" data-show-cat="${id ?? ''}">
        <div style="display:flex;align-items:center;min-width:0"><span class="dot" style="background:${color}"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span></div>
        <div class="bartrack"><div class="bar" style="width:${(Math.max(0, v) / max) * 100}%;background:${color}"></div></div>
        <div class="num">${kr(v)} <span class="muted">${exp > 0 ? Math.round((v / exp) * 100) : 0}%</span></div></div>`;
  const merch = new Map<string, { name: string; sum: number; n: number; cat: string | null }>();
  for (const t of txs) {
    if (typeOf(t) !== 'expense') continue;
    const k = txKey(t);
    const e = merch.get(k) || { name: displayName(t), sum: 0, n: 0, cat: t.categoryId };
    e.sum -= t.amount; e.n++;
    merch.set(k, e);
  }
  const top = [...merch.values()].sort((a, b) => b.sum - a.sum).slice(0, 10);
  const foreign = txs.filter((t) => t.currency && t.currency.toUpperCase() !== 'SEK').length;
  const savingColor = S.categories.find((c) => c.type === 'saving')?.color || 'inherit';
  const small = (s: string) => `<span class="muted" style="font-size:13px;font-weight:400">${s}</span>`;

  main.innerHTML = `
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Utgifter</div><div class="value">${kr(exp)}</div></div>
    <div class="card kpi"><div class="label">Inkomster</div><div class="value">${kr(inc)}</div></div>
    <div class="card kpi"><div class="label">Sparat</div><div class="value" style="color:${savingColor}">${kr(saved)}${savePct !== null ? ' ' + small(`${savePct}% av inkomst`) : ''}</div></div>
    <div class="card kpi"><div class="label">Kvar efter sparande</div><div class="value ${inc - exp - saved < 0 ? 'neg' : 'pos'}">${kr(inc - exp - saved)}</div></div>
    <div class="card kpi" style="cursor:pointer" data-go="board"><div class="label">Okategoriserade</div><div class="value">${uncat} ${small('st → sortera')}</div></div>
  </div>
  ${foreign ? `<p class="muted">Obs: ${foreign} transaktioner är i annan valuta än SEK och räknas just nu som SEK.</p>` : ''}
  <div class="grid two" style="margin-top:16px">
    <div class="card"><h2>Utgifter per kategori</h2>
      ${cats.length ? cats.map(([id, e]) => {
        const c = catById(id) || UNCAT;
        let h = barRow(id, e.v, false, c.name, c.color);
        // Underkategorier visas indragna när huvudkategorin har sådana
        if (id && subsOf(id).length) {
          for (const [sid, sv] of [...e.subs.entries()].filter(([, v]) => Math.abs(v) >= 0.5).sort((a, b) => b[1] - a[1])) {
            const sc = catById(sid) || UNCAT;
            h += barRow(sid, sv, true, sid === id ? 'Utan underkategori' : sc.name, sc.color);
          }
        }
        return h;
      }).join('') : '<p class="muted">Inga utgifter i perioden.</p>'}
    </div>
    <div class="card"><h2>Utgifter per månad</h2>
      <div class="months">${mData.map((d) => {
        const roots = byRoot(d.byCat);
        const segs = order.map((id) => ({ id, v: Math.max(0, roots.get(id)?.v || 0) })).filter((s) => s.v > 0);
        return `<div class="mcol ${S.ui.period === 'M:' + d.m ? 'sel' : ''}" data-period="M:${d.m}" title="${monthLabel(d.m)}\nUtgifter: ${kr(d.exp)}\nInkomster: ${kr(d.inc)}">
          <div class="ml num" style="font-size:10px">${Math.round(d.exp / 1000)}k</div>
          <div class="mstack" style="height:${(d.exp / mMax) * 160}px">${segs.map((s) => {
            const c = catById(s.id) || UNCAT;
            return `<div style="height:${(s.v / d.exp) * 100}%;background:${c.color}" title="${esc(c.name)}: ${kr(s.v)}"></div>`;
          }).join('')}</div>
          <div class="ml">${monthLabel(d.m)}</div></div>`;
      }).join('')}</div>
      <p class="muted" style="margin:8px 0 0;font-size:12px">Klicka på en månad för att välja den. Hovra för detaljer.</p>
    </div>
  </div>
  ${savingCard(mData)}
  <div class="card" style="margin-top:16px"><h2>Största mottagare</h2>
    <table><thead><tr><th>Mottagare</th><th>Kategori</th><th class="num">Antal</th><th class="num">Summa</th></tr></thead><tbody>
    ${top.map((e) => {
      const c = catById(e.cat) || UNCAT;
      return `<tr><td>${esc(e.name)}</td><td><span class="dot" style="background:${c.color}"></span>${esc(catLabel(c))}</td><td class="num">${e.n}</td><td class="num">${kr(e.sum)}</td></tr>`;
    }).join('')}
    </tbody></table></div>`;
}

function savingCard(mData: MonthData[]): string {
  const sc = S.categories.find((c) => c.type === 'saving');
  if (!sc) return '';
  const total = mData.reduce((s, d) => s + d.saved, 0);
  const avg = mData.length ? total / mData.length : 0;
  const withInc = mData.filter((d) => d.inc > 0);
  const incSum = withInc.reduce((s, d) => s + d.inc, 0);
  const rate = incSum > 0 ? Math.round((withInc.reduce((s, d) => s + d.saved, 0) / incSum) * 100) : null;
  const mx = Math.max(1, ...mData.map((d) => Math.abs(d.saved)));
  const stat = (label: string, v: string) =>
    `<div><div class="muted" style="font-size:12px">${label}</div><b class="num" style="font-size:18px">${v}</b></div>`;
  let cum = 0;
  return `<div class="card" style="margin-top:16px"><h2>Sparande per månad</h2>
    <div class="toolbar" style="gap:24px">
      ${stat('Totalt sparat (visade månader)', kr(total))}${stat('Snitt per månad', kr(avg))}${rate !== null ? stat('Sparkvot', rate + '%') : ''}
    </div>
    ${!mData.some((d) => d.saved)
      ? `<p class="muted">Inga sparöverföringar hittades. Överföringar vars beskrivning innehåller "Avanza" hamnar här automatiskt – annars kan du dra dem till kategorin <b>${esc(sc.name)}</b> under Sortera.</p>`
      : `<div class="months" style="height:180px">${mData.map((d) => {
          cum += d.saved;
          return `<div class="mcol ${S.ui.period === 'M:' + d.m ? 'sel' : ''}" data-period="M:${d.m}" title="${monthLabel(d.m)}\nSparat: ${kr(d.saved)}\nAckumulerat: ${kr(cum)}${d.inc > 0 ? `\nAndel av inkomst: ${Math.round((d.saved / d.inc) * 100)}%` : ''}">
      <div class="ml num" style="font-size:10px">${d.saved ? Math.round((d.saved / 1000) * 10) / 10 + 'k' : ''}</div>
      <div class="mstack" style="height:${(Math.abs(d.saved) / mx) * 120}px;background:${d.saved < 0 ? 'var(--neg)' : sc.color}"></div>
      <div class="ml">${monthLabel(d.m)}</div></div>`;
        }).join('')}</div>
    <p class="muted" style="margin:8px 0 0;font-size:12px">Uttag från Avanza tillbaka till kontot räknas som negativt sparande (röd stapel).</p>`}
  </div>`;
}
