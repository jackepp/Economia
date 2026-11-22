import { describe, expect, it } from 'vitest';
import { replaceState } from './state';
import { buildTrends, defaultTrendUi, isoWeek, trendStats } from './trends';
import type { Transaction } from './types';

const tx = (id: string, date: string, amount: number, categoryId: string | null): Transaction =>
  ({ id, date, description: id, kind: '', amount, currency: 'SEK', source: 'Test', categoryId, manual: true });

describe('trender', () => {
  it('ISO-veckor', () => {
    expect(isoWeek('2026-01-01').key).toBe('2026-W01'); // torsdag
    expect(isoWeek('2027-01-01').key).toBe('2026-W53'); // fredag – hör till förra året
    expect(isoWeek('2026-10-07')).toEqual({ key: '2026-W41', label: 'v41', monday: '2026-10-05' });
  });

  it('summerar per månad, fyller tomma månader, räknar inte överföringar', () => {
    replaceState({ transactions: [
      tx('a', '2026-07-03', -100, 'mat'), tx('b', '2026-09-10', -300, 'mat'),
      tx('c', '2026-09-11', -50, 'bil_drivm'), tx('d', '2026-09-12', -20, 'transp'),
      tx('e', '2026-09-15', 25000, 'inkomst'), tx('f', '2026-09-16', -999, 'overf'),
    ] });
    const main = buildTrends(defaultTrendUi(), undefined, '2027-01-01');
    expect(main.periods.map((p) => p.key)).toEqual(['2026-07', '2026-08', '2026-09']);
    const bil = main.series.find((s) => s.id === 'transp')!;
    expect(bil.values).toEqual([0, 0, 70]);
    expect(main.series.find((s) => s.id === 'inkomst')!.values[2]).toBe(25000);
    expect(main.series.some((s) => s.id === 'overf')).toBe(false);
    expect(main.totalExpense).toEqual([100, 0, 370]);
    expect(main.partial).toBe(false);

    const sub = buildTrends({ ...defaultTrendUi(), level: 'sub' }, undefined, '2026-09-20');
    expect(sub.series.find((s) => s.id === 'bil_drivm')!.name).toBe('Bil › Drivmedel');
    expect(sub.series.find((s) => s.id === 'transp')!.name).toBe('Bil › övrigt');
    expect(sub.partial).toBe(true);
  });

  it('trend: lutning och pågående period räknas inte', () => {
    const st = trendStats([100, 200, 300, 5], true);
    expect(st.slope).toBe(100);
    expect(st.avg).toBe(200);
    expect(st.last).toBe(300);
  });
});
