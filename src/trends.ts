import { monthLabel } from './format';
import { catById, catLabel, orderedCats, rootId, S, subsOf, typeOf } from './state';
import type { CatType, Transaction, TrendUi } from './types';

export interface Period { key: string; label: string }
export interface Series {
  /** Kategori-id, eller '_' för okategoriserat. */
  id: string;
  name: string;
  type: Exclude<CatType, 'transfer'>;
  values: number[];
  total: number;
}
export interface TrendData {
  periods: Period[];
  series: Series[];
  /** Summa av alla utgiftsserier per period. */
  totalExpense: number[];
  /** Summa per typ och period. */
  totals: Record<Series['type'], number[]>;
  /** Sista perioden pågår fortfarande (räknas inte i trenden). */
  partial: boolean;
}

export const defaultTrendUi = (): TrendUi => ({ gran: 'month', level: 'main', chart: 'line', range: 0, slots: {}, total: false });

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** ISO-vecka: måndagen den börjar och nyckeln "2026-W41". */
export function isoWeek(ds: string): { key: string; label: string; monday: string } {
  const d = new Date(ds + 'T00:00:00Z');
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const thu = new Date(mon);
  thu.setUTCDate(mon.getUTCDate() + 3);
  const y = thu.getUTCFullYear();
  const week = 1 + Math.floor((thu.getTime() - Date.UTC(y, 0, 1)) / 864e5 / 7);
  return { key: `${y}-W${pad(week)}`, label: `v${week}`, monday: isoDate(mon) };
}

const periodKey = (ds: string, gran: TrendUi['gran']) => (gran === 'month' ? ds.slice(0, 7) : isoWeek(ds).key);

/** Alla perioder från första till sista datum, även tomma. */
function periodsBetween(from: string, to: string, gran: TrendUi['gran']): Period[] {
  const out: Period[] = [];
  if (gran === 'month') {
    let [y, m] = from.slice(0, 7).split('-').map(Number);
    const end = to.slice(0, 7);
    for (;;) {
      const key = `${y}-${pad(m)}`;
      out.push({ key, label: monthLabel(key) });
      if (key >= end) break;
      if (++m > 12) { m = 1; y++; }
    }
  } else {
    const d = new Date(isoWeek(from).monday + 'T00:00:00Z');
    const endKey = isoWeek(to).key;
    for (;;) {
      const w = isoWeek(isoDate(d));
      out.push({ key: w.key, label: w.label });
      if (w.key === endKey || out.length > 600) break;
      d.setUTCDate(d.getUTCDate() + 7);
    }
  }
  return out;
}

/** Serie-id och namn för en transaktion på vald nivå. */
function seriesOf(t: Transaction, level: TrendUi['level']): { id: string; name: string } {
  // Okategoriserat delas i utgifter och inkomster (som i översikten)
  if (!t.categoryId || !catById(t.categoryId)) return t.amount < 0 ? { id: '_', name: 'Okategoriserat' } : { id: '_in', name: 'Okategoriserade inkomster' };
  if (level === 'main') {
    const id = rootId(t.categoryId)!;
    return { id, name: catById(id)!.name };
  }
  const c = catById(t.categoryId)!;
  // Huvudkategori som har underkategorier: det som ligger direkt på den blir "övrigt"
  return { id: c.id, name: !c.parent && subsOf(c.id).length ? `${c.name} › övrigt` : catLabel(c) };
}

/**
 * Summerar per period och serie. Utgifter och sparande räknas som positiva belopp,
 * inkomster likaså. Överföringar räknas inte.
 */
export function buildTrends(ui: TrendUi, txs: Transaction[] = S.transactions, today = isoDate(new Date())): TrendData {
  const dated = txs.filter((t) => typeOf(t) !== 'transfer');
  const empty = (): TrendData => ({ periods: [], series: [], totalExpense: [], totals: { expense: [], income: [], saving: [] }, partial: false });
  if (!dated.length) return empty();
  const last = dated.reduce((m, t) => (t.date > m ? t.date : m), dated[0].date);
  let cutoff = '';
  if (ui.range > 0) {
    const [y, m] = last.slice(0, 7).split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 - (ui.range - 1), 1));
    cutoff = isoDate(d);
  }
  const inRange = dated.filter((t) => t.date >= cutoff);
  if (!inRange.length) return empty();
  const first = inRange.reduce((m, t) => (t.date < m ? t.date : m), inRange[0].date);
  const periods = periodsBetween(first, last, ui.gran);
  const idx = new Map(periods.map((p, i) => [p.key, i]));
  const map = new Map<string, Series>();
  for (const t of inRange) {
    const { id, name } = seriesOf(t, ui.level);
    const type = typeOf(t) as Series['type'];
    const s = map.get(id) || { id, name, type, values: periods.map(() => 0), total: 0 };
    const v = type === 'income' ? t.amount : -t.amount;
    s.values[idx.get(periodKey(t.date, ui.gran))!] += v;
    s.total += v;
    map.set(id, s);
  }
  for (const s of map.values()) s.values = s.values.map((v) => Math.round(v * 100) / 100);
  // Ordning: som kategorierna, okategoriserat sist
  const order = new Map<string, number>(orderedCats().map((c, i) => [c.id, i]));
  const series = [...map.values()].filter((s) => Math.abs(s.total) >= 0.5)
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  const sumOf = (type: Series['type']) =>
    periods.map((_, i) => Math.round(series.filter((s) => s.type === type).reduce((sum, s) => sum + s.values[i], 0) * 100) / 100);
  const totals = { expense: sumOf('expense'), income: sumOf('income'), saving: sumOf('saving') };
  const partial = periods[periods.length - 1].key === periodKey(today, ui.gran);
  return { periods, series, totalExpense: totals.expense, totals, partial };
}

/** Vyn "Inkomst mot utgift": totalerna per typ, och vad som blir kvar. */
export function balanceSeries(data: TrendData): Series[] {
  const mk = (id: string, name: string, type: Series['type'], values: number[]): Series =>
    ({ id, name, type, values, total: values.reduce((a, b) => a + b, 0) });
  const { income, expense, saving } = data.totals;
  return [
    mk('=in', 'Inkomster', 'income', income),
    mk('=ut', 'Utgifter', 'expense', expense),
    mk('=spar', 'Sparande', 'saving', saving),
    // Kvar = inkomster − utgifter − sparande; uppåt är bra
    mk('=kvar', 'Kvar', 'income', income.map((v, i) => Math.round((v - expense[i] - saving[i]) * 100) / 100)),
  ];
}

export interface TrendStats { avg: number; last: number | null; vsAvg: number | null; slope: number }

/** Snitt, senaste hela period, och lutning (kr per period, minsta kvadrat). Pågående period räknas inte. */
export function trendStats(values: number[], partial: boolean): TrendStats {
  const v = partial ? values.slice(0, -1) : values;
  const n = v.length;
  if (!n) return { avg: 0, last: null, vsAvg: null, slope: 0 };
  const avg = v.reduce((a, b) => a + b, 0) / n;
  const last = v[n - 1];
  let slope = 0;
  if (n >= 2) {
    const mx = (n - 1) / 2;
    let num = 0, den = 0;
    v.forEach((y, x) => { num += (x - mx) * (y - avg); den += (x - mx) ** 2; });
    slope = num / den;
  }
  return { avg, last, vsAvg: avg ? (last - avg) / Math.abs(avg) : null, slope };
}
