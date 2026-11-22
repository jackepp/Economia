import { autoCategorize, DEFAULT_RULES, defaultRules, txKey } from './rules';
import type { Category, CatView, State, Transaction, UiState } from './types';

export const LEGACY_STORE_KEY = 'mina-utgifter-v1';
export const UI_KEY = 'money-dash-ui';
export const RULES_VERSION = 6;

/** Standard-underkategorier per huvudkategori: [id, namn, färg]. Regler finns i DEFAULT_RULES[id]. */
const DEFAULT_SUBS: Record<string, [string, string, string][]> = {
  boende: [
    ['boende_lan', 'Amortering + ränta', '#8d6e63'],
    ['boende_hyra', 'Hyra', '#a1887f'],
  ],
  transp: [
    ['bil_drivm', 'Drivmedel', '#4a86d8'],
    ['bil_park', 'Parkering', '#7aa7e3'],
    ['bil_fors', 'Försäkring & skatt', '#123f80'],
    ['bil_serv', 'Service', '#9ec0ee'],
    ['bil_besikt', 'Besiktning', '#2a5aa8'],
    ['bil_rep', 'Reparation', '#6f95cc'],
  ],
};
const defaultSubs = (parent: string): Category[] =>
  (DEFAULT_SUBS[parent] || []).map(([id, name, color]) => ({ id, name, color, type: 'expense', parent }));

const TOP_CATS: Category[] = (
  [
    ['mat', 'Mat & dagligvaror', '#2e7d32', 'expense'],
    ['rest', 'Restaurang & café', '#ef6c00', 'expense'],
    ['boende', 'Boende & el', '#6d4c41', 'expense'],
    ['rakn', 'Räkningar & abonnemang', '#546e7a', 'expense'],
    ['transp', 'Bil', '#1e63c4', 'expense'],
    ['shop', 'Shopping', '#c2185b', 'expense'],
    ['noje', 'Nöje & streaming', '#7b3fb0', 'expense'],
    ['halsa', 'Hälsa & träning', '#00897b', 'expense'],
    ['resor', 'Resor', '#e0a800', 'expense'],
    ['ovrigt', 'Övrigt', '#8d8d8d', 'expense'],
    ['spar', 'Sparande (Avanza)', '#3f51b5', 'saving'],
    ['inkomst', 'Inkomst', '#7cb342', 'income'],
    ['overf', 'Överföringar', '#a7b4c2', 'transfer'],
  ] as const
).map(([id, name, color, type]) => ({ id, name, color, type }));
const DEFAULT_CATS: Category[] = TOP_CATS.flatMap((c) => [c, ...defaultSubs(c.id)]);

const defaultUi = (): UiState => ({ view: 'overview', period: 'all', learn: true, group: true });

export function defaultState(): State {
  return {
    rulesVersion: RULES_VERSION,
    aliases: {},
    categories: DEFAULT_CATS.map((c) => ({ ...c })),
    rules: defaultRules(),
    transactions: [],
    ui: defaultUi(),
  };
}

/**
 * Appens tillstånd. Objektet byts aldrig ut (så att `import { S }` alltid pekar rätt) –
 * använd replaceState() för att ladda nytt innehåll.
 */
export const S: State = defaultState();

export function replaceState(next: Partial<State>): void {
  Object.assign(S, defaultState(), next);
}

// save() anropar synken – kopplas in av sync.ts för att undvika cirkulära importer
let onSave: () => void = () => {};
export function setSaveHandler(fn: () => void): void {
  onSave = fn;
}

/** Spara: vyval (flik/period) per enhet i webbläsaren, allt annat synkas till databasen. */
export function save(): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(S.ui));
  } catch {
    /* privat läge e.d. */
  }
  onSave();
}

/** Fyller i saknade fält och kör migreringar. Returnerar true om något ändrades. */
export function normalize(): boolean {
  let ui: Partial<UiState> = {};
  try {
    ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
  } catch {
    /* ignorera */
  }
  S.ui = Object.assign(defaultUi(), S.ui || {}, ui);
  S.categories = S.categories || defaultState().categories;
  S.rules = S.rules || [];
  S.transactions = S.transactions || [];
  S.aliases = S.aliases || {};
  let changed = false;
  // Migrering: lägg till sparkategori för data sparad med en äldre version
  if (!S.categories.some((c) => c.type === 'saving') && !S.categories.some((c) => c.id === 'spar')) {
    const i = S.categories.findIndex((c) => c.type !== 'expense');
    S.categories.splice(i >= 0 ? i : S.categories.length, 0, { id: 'spar', name: 'Sparande (Avanza)', color: '#3f51b5', type: 'saving' });
    const j = S.rules.findIndex((r) => !r.learned);
    S.rules.splice(j >= 0 ? j : S.rules.length, 0,
      { pattern: 'avanza', categoryId: 'spar', learned: false },
      { pattern: 'isk ', categoryId: 'spar', learned: false });
    changed = true;
  }
  // Migrering v5: lägg till saknade standard-underkategorier (Bil, Boende) och flytta deras
  // standardregler dit från huvudkategorin eller en syskonkategori. Egna/inlärda regler lämnas orörda.
  if ((S.rulesVersion || 1) < 5) {
    for (const parentId of Object.keys(DEFAULT_SUBS)) {
      if (!catById(parentId)) continue;
      const family = new Set([parentId, ...DEFAULT_SUBS[parentId].map(([id]) => id)]);
      for (const s of defaultSubs(parentId)) {
        if (catById(s.id)) continue;
        const sibs = subsOf(parentId);
        S.categories.splice(S.categories.indexOf(sibs[sibs.length - 1] || catById(parentId)!) + 1, 0, s);
        const pats = new Set(DEFAULT_RULES[s.id] || []);
        for (const r of S.rules) if (!r.learned && family.has(r.categoryId) && pats.has(r.pattern)) r.categoryId = s.id;
      }
    }
    // "Service & reparation" är nu tre: Service, Besiktning, Reparation
    const serv = catById('bil_serv');
    if (serv?.name === 'Service & reparation') serv.name = 'Service';
    changed = true;
  }
  // Migrering v6: Bolånebanken (bolån) flyttas från Räkningar till Boende › Amortering + ränta
  if ((S.rulesVersion || 1) < 6 && catById('boende_lan')) {
    for (const r of S.rules) if (!r.learned && r.pattern === 'bolanebank' && r.categoryId === 'rakn') r.categoryId = 'boende_lan';
    changed = true;
  }
  // Migrering: lägg till nya standardregler när RULES_VERSION höjs (befintliga regler lämnas orörda)
  if ((S.rulesVersion || 1) < RULES_VERSION) {
    const have = new Set(S.rules.map((r) => r.pattern));
    for (const r of defaultRules()) if (!have.has(r.pattern)) S.rules.push(r);
    S.rulesVersion = RULES_VERSION;
    changed = true;
  }
  // Migrering: "Transport" heter nu "Bil" (bara om namnet inte redan ändrats för hand)
  const transp = S.categories.find((c) => c.id === 'transp' && c.name === 'Transport');
  if (transp) { transp.name = 'Bil'; changed = true; }
  if (changed) autoCategorize(S);
  return changed;
}

/** Läser gammal data sparad i webbläsaren (före databasen) – används bara för flytten till Supabase. */
export function loadLegacyLocal(): void {
  try {
    const raw = localStorage.getItem(LEGACY_STORE_KEY);
    replaceState(raw ? JSON.parse(raw) : {});
  } catch {
    replaceState({});
  }
  normalize();
}

/* ---------- Uppslag ---------- */
export const UNCAT: CatView = { id: null, name: 'Okategoriserat', color: '#b0b7c3', type: null };
export const catById = (id: string | null | undefined): Category | undefined => S.categories.find((c) => c.id === id);
export const catOf = (t: Transaction): CatView => catById(t.categoryId) || UNCAT;

/* ---------- Underkategorier ---------- */
/** Överordnad kategori, om den finns kvar. */
export const parentOf = (c: Category | undefined): Category | undefined => (c?.parent ? catById(c.parent) : undefined);
/** Huvudkategorins id – för en underkategori föräldern, annars samma id. */
export const rootId = (id: string | null): string | null => parentOf(catById(id))?.id ?? id;
export const subsOf = (id: string): Category[] => S.categories.filter((c) => c.parent === id);
export const isSub = (c: Category): boolean => !!parentOf(c);
/** Huvudkategorier i sin ordning, var och en följd av sina underkategorier. */
export const orderedCats = (): Category[] =>
  S.categories.filter((c) => !isSub(c)).flatMap((c) => [c, ...subsOf(c.id)]);
/** "Bil › Drivmedel" */
export const catLabel = (c: CatView): string => {
  const p = parentOf(catById(c.id));
  return p ? `${p.name} › ${c.name}` : c.name;
};

/** Typen bestäms av huvudkategorin. */
export const typeOf = (t: Transaction) => {
  const c = catById(t.categoryId);
  return (parentOf(c) || c)?.type || (t.amount < 0 ? 'expense' : 'income');
};

/** Visningsnamn: eget namn på transaktionen > namn på mottagaren > originaltext. */
export const displayName = (t: Transaction): string => t.alias || S.aliases[txKey(t)] || t.description;
export const groupKey = (t: Transaction): string => (t.alias ? 'a:' + t.alias.toLowerCase() : txKey(t));

/* ---------- Period ---------- */
export function inPeriod(t: Transaction, p = S.ui.period): boolean {
  if (p === 'all') return true;
  return p.startsWith('Y:') ? t.date.startsWith(p.slice(2)) : t.date.slice(0, 7) === p.slice(2);
}
export const periodTx = (): Transaction[] => S.transactions.filter((t) => inPeriod(t));
export const allMonths = (): string[] => [...new Set(S.transactions.map((t) => t.date.slice(0, 7)))].sort();

/* ---------- Summor ---------- */
export interface Sums {
  exp: number;
  inc: number;
  saved: number;
  byCat: Map<string | null, number>;
}
export function sums(txs: Transaction[]): Sums {
  let exp = 0, inc = 0, saved = 0;
  const byCat = new Map<string | null, number>();
  for (const t of txs) {
    const ty = typeOf(t);
    if (ty === 'transfer') continue;
    if (ty === 'income') { inc += t.amount; continue; }
    if (ty === 'saving') { saved -= t.amount; continue; } // insättning = negativt belopp = sparat; uttag minskar
    exp -= t.amount;
    byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) - t.amount);
  }
  return { exp, inc, saved, byCat };
}

/**
 * Sätter kategori på transaktionerna och lär sig mottagarna (om "Kom ihåg" är på).
 * Returnerar antal andra transaktioner som följde med.
 */
export function assignCategory(idList: string[], patterns: string[], catId: string | null, learn = S.ui.learn): number {
  const ids = new Set(idList);
  let extra = 0;
  for (const t of S.transactions) if (ids.has(t.id)) { t.categoryId = catId; t.manual = true; }
  const pats = new Set(patterns.filter(Boolean));
  if (learn && pats.size) {
    S.rules = S.rules.filter((r) => !(r.learned && pats.has(r.pattern)));
    if (catId) {
      for (const p of pats) S.rules.unshift({ pattern: p, categoryId: catId, learned: true });
      for (const t of S.transactions)
        if (!ids.has(t.id) && !t.manual && pats.has(txKey(t))) { t.categoryId = catId; extra++; }
    }
  }
  return extra;
}
