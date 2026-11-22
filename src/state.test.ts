import { describe, expect, it } from 'vitest';
import { defaultRules } from './rules';
import { catLabel, catById, defaultState, normalize, orderedCats, replaceState, rootId, S, sums, typeOf } from './state';
import type { Transaction } from './types';

const tx = (id: string, description: string, amount: number): Transaction =>
  ({ id, date: '2026-10-01', description, kind: '', amount, currency: 'SEK', source: 'Test', categoryId: null, manual: false });

describe('underkategorier', () => {
  it('migrerar gammal data: Bil får underkategorier och bensin hamnar i Drivmedel', () => {
    const old = defaultState();
    old.rulesVersion = 3;
    old.categories = old.categories.filter((c) => !c.parent).map((c) => (c.id === 'transp' ? { ...c, name: 'Transport' } : c));
    old.rules = defaultRules().map((r) => (r.categoryId.startsWith('bil_') ? { ...r, categoryId: 'transp' } : r))
      .filter((r) => !['tanka', 'mekonomen'].includes(r.pattern));
    old.transactions = [tx('a', 'PREEM SKELLEFTEÅ', -500), tx('b', 'Mekonomen', -1200), tx('c', 'SL Access', -40)];
    replaceState(old);
    normalize();
    expect(catById('transp')?.name).toBe('Bil');
    expect(orderedCats().map((c) => c.id).slice(4, 9)).toEqual(['transp', 'bil_drivm', 'bil_park', 'bil_fors', 'bil_serv']);
    expect(S.transactions.map((t) => t.categoryId)).toEqual(['bil_drivm', 'bil_serv', 'transp']);
    // migreringen körs bara en gång
    expect(normalize()).toBe(false);
  });

  it('räknar underkategorier till huvudkategorin', () => {
    replaceState({ transactions: [tx('a', 'x', -100), tx('b', 'y', -50)] });
    S.transactions[0].categoryId = 'bil_drivm';
    S.transactions[1].categoryId = 'transp';
    expect(rootId('bil_drivm')).toBe('transp');
    expect(catLabel(catById('bil_drivm')!)).toBe('Bil › Drivmedel');
    expect(typeOf(S.transactions[0])).toBe('expense');
    expect(sums(S.transactions).exp).toBe(150);
  });
});
