import { describe, expect, it } from 'vitest';
import { defaultRules } from './rules';
import { catById, catLabel, defaultState, normalize, orderedCats, replaceState, rootId, S, subsOf, sums, typeOf } from './state';
import type { State, Transaction } from './types';

const tx = (id: string, description: string, amount: number): Transaction =>
  ({ id, date: '2026-10-01', description, kind: '', amount, currency: 'SEK', source: 'Test', categoryId: null, manual: false });

const names = (parent: string) => subsOf(parent).map((c) => c.name);
const parentOfRule = (cat: string) => (cat.startsWith('bil_') ? 'transp' : cat.startsWith('boende_') ? 'boende' : cat);

describe('underkategorier', () => {
  it('migrerar data utan underkategorier (v3): Bil och Boende får sina, regler flyttas', () => {
    const old: State = defaultState();
    old.rulesVersion = 3;
    old.categories = old.categories.filter((c) => !c.parent).map((c) => (c.id === 'transp' ? { ...c, name: 'Transport' } : c));
    old.rules = defaultRules().map((r) => ({ ...r, categoryId: parentOfRule(r.categoryId) }))
      .filter((r) => !['tanka', 'mekonomen', 'bolån'].includes(r.pattern));
    old.transactions = [tx('a', 'PREEM SKELLEFTEÅ', -500), tx('b', 'Mekonomen', -1200), tx('c', 'SL Access', -40),
      tx('d', 'Carspect Umeå', -450), tx('e', 'HSB Brf Exempel', -4200), tx('f', 'Bolån amortering', -3000)];
    replaceState(old);
    normalize();
    expect(catById('transp')?.name).toBe('Bil');
    expect(names('transp')).toEqual(['Drivmedel', 'Parkering', 'Försäkring & skatt', 'Service', 'Besiktning', 'Reparation']);
    expect(names('boende')).toEqual(['Amortering + ränta', 'Hyra']);
    const ids = orderedCats().map((c) => c.id);
    expect(ids.indexOf('boende_lan')).toBe(ids.indexOf('boende') + 1);
    expect(S.transactions.map((t) => t.categoryId)).toEqual(['bil_drivm', 'bil_serv', 'transp', 'bil_besikt', 'boende_hyra', 'boende_lan']);
    expect(normalize()).toBe(false); // körs bara en gång
  });

  it('migrerar v4: "Service & reparation" delas i Service, Besiktning, Reparation', () => {
    const old: State = defaultState();
    old.rulesVersion = 4;
    old.categories = old.categories
      .filter((c) => !['bil_besikt', 'bil_rep', 'boende_lan', 'boende_hyra'].includes(c.id))
      .map((c) => (c.id === 'bil_serv' ? { ...c, name: 'Service & reparation' } : c));
    old.rules = defaultRules().map((r) => ({
      ...r,
      categoryId: ['bil_besikt', 'bil_rep'].includes(r.categoryId) ? 'bil_serv' : r.categoryId.startsWith('boende_') ? 'boende' : r.categoryId,
    }));
    old.rules.unshift({ pattern: 'min verkstad', categoryId: 'bil_serv', learned: true }); // inlärd – rörs inte
    old.transactions = [tx('a', 'Dekra Bilprovning', -400), tx('b', 'Bilverkstad AB', -900), tx('c', 'Min verkstad', -100)];
    old.transactions[1].description = 'Verkstad Norr';
    replaceState(old);
    normalize();
    expect(names('transp')).toEqual(['Drivmedel', 'Parkering', 'Försäkring & skatt', 'Service', 'Besiktning', 'Reparation']);
    expect(S.transactions.map((t) => t.categoryId)).toEqual(['bil_besikt', 'bil_rep', 'bil_serv']);
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
