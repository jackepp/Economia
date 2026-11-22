import type { Rule, State, Transaction } from './types';

// Mönster matchas mot början av ett ord i beskrivningen. Avsluta med mellanslag för exakt ord.
export const DEFAULT_RULES: Record<string, string[]> = {
  mat: ['ica', 'coop', 'willys', 'hemköp', 'hemkop', 'lidl', 'city gross', 'tempo', 'netto', 'mathem', 'matsmart', 'axfood'],
  rest: ['max ', 'pinchos', 'streetfood', 'mcdonald', 'burger king', 'espresso house', 'wayne', 'pressbyr', 'foodora', 'wolt', 'uber eats', 'sushi', 'pizz', 'restaurang', 'cafe', 'café', 'starbucks', 'subway', 'bastard burgers', 'o learys', '7-eleven'],
  boende: ['vattenfall', 'ellevio', 'fortum', 'tibber', 'e.on', 'eon ', 'göteborg energi'],
  boende_lan: ['amortering', 'bolån', 'låneränta', 'sbab', 'stadshypotek', 'landshypotek'],
  boende_hyra: ['hyra', 'hyresvärd', 'brf', 'hsb', 'bostad'],
  rakn: ['telia', 'tele2', 'telenor', 'tre ', 'hallon', 'comviq', 'bahnhof', 'bredband', 'com hem', 'tele 2', 'csn', 'folksam', 'if skadef', 'länsförs', 'trygg-hansa', 'trygg hansa', 'skatteverket', 'ica försäkr', 'akassa', 'a-kassa', 'debiteringsavgift'],
  transp: ['sl ', 'storstockholms', 'västtrafik', 'skånetrafiken', 'sj ', 'uber', 'bolt', 'voi', 'lime', 'tier', 'flygbussarna'],
  bil_drivm: ['circle k', 'preem', 'okq8', 'st1', 'ingo', 'tanka'],
  bil_park: ['easypark', 'parkering', 'aimo park', 'parkster', 'apcoa', 'q-park'],
  bil_fors: ['fordonsskatt', 'trafikförsäkr', 'bilförsäkr'],
  bil_serv: ['mekonomen', 'bilia', 'däck', 'vianor', 'euromaster', 'biltvätt', 'bilservice'],
  bil_besikt: ['besikt', 'bilprovning', 'carspect', 'dekra', 'opus'],
  bil_rep: ['verkstad', 'bilreparation', 'plåt', 'autoexperten'],
  shop: ['amazon', 'zalando', 'h&m', 'hm ', 'clas ohlson', 'ikea', 'elgiganten', 'webhallen', 'kjell', 'stadium', 'åhléns', 'ahlens', 'cdon', 'temu', 'shein', 'jula', 'biltema', 'normal', 'lindex', 'kappahl', 'dressmann', 'apple store', 'power ', 'rusta', 'dollarstore', 'byggmax', 'kicks', 'cubus', 'bestseller', 'lekia', 'arken zoo', 'computersalg', 'blocket', 'tradera', 'sellpy'],
  noje: ['spotify', 'netflix', 'hbo', 'disney', 'viaplay', 'youtube', 'apple.com', 'google', 'steam', 'playstation', 'xbox', 'nintendo', 'filmstaden', 'sf bio', 'ticketmaster', 'tidal', 'audible', 'storytel', 'bokus', 'adlibris', 'bookbeat', 'svenska bio', 'podme', 'sf anytime', 'akademibokhandeln'],
  halsa: ['apotek', 'apotea', 'kronans', 'vårdcentral', 'tandläk', 'sats', 'friskis', 'nordic wellness', 'actic', '1177', 'folktandvården', 'gym', 'fysio'],
  resor: ['sas ', 'norwegian', 'ryanair', 'booking.com', 'airbnb', 'hotel', 'hotels.com', 'scandic', 'expedia', 'finnair', 'klm', 'lufthansa'],
  spar: ['avanz', 'isk '],
  inkomst: ['lön', 'salary', 'löneutbet'],
  overf: ['överföring', 'eget konto', 'top-up', 'topup', 'revolut', 'insättning', 'exchanged to', 'till sparkonto', 'apple pay-påfyllning', 'påfyllning'],
};

export function defaultRules(): Rule[] {
  const rules: Rule[] = [];
  for (const [cat, pats] of Object.entries(DEFAULT_RULES))
    for (const p of pats) rules.push({ pattern: p, categoryId: cat, learned: false });
  return rules;
}

/** Normaliserad "handlare": gemener, utan siffror/kortnummer/datum och brus. */
export function norm(desc: string | null | undefined): string {
  return String(desc || '')
    .toLowerCase()
    .replace(/^(kortköp|köp|reservation|betalning|bg|pg)\s+/, '')
    .replace(/[*#]/g, ' ')
    // tar bort referenskoder/kortnr (ord som mest är siffror), behåller telefonnr och namn som "klipp1"
    .split(/\s+/)
    .filter((w) => {
      if (!w) return false;
      if (/^\+\d{6,}$/.test(w)) return true;
      const d = (w.match(/\d/g) || []).length;
      return d === 0 || d / w.length < 0.25 || (d / w.length < 0.5 && w.length < 8);
    })
    .join(' ')
    .trim();
}

/** Nyckel för gruppering och inlärda regler: mottagaren, annars transaktionstypen. */
export function txKey(t: Pick<Transaction, 'description' | 'kind'>): string {
  return norm(t.description) || String(t.kind || '').toLowerCase().trim() || String(t.description || '').toLowerCase();
}

/** Inlärda regler först (i ordning), därefter längsta mönstret först (mest specifikt vinner). */
export function orderedRules(rules: Rule[]): Rule[] {
  const learned = rules.filter((r) => r.learned);
  const other = rules.filter((r) => !r.learned).sort((a, b) => b.pattern.length - a.pattern.length);
  return learned.concat(other);
}

/** 1) matcha mot mottagaren, 2) mot transaktionstypen (t.ex. "Lön", "Överföring"), 3) importens förslag. */
export function matchRule(t: Pick<Transaction, 'description' | 'kind' | 'hint'>, rules: Rule[]): string | null {
  const hays = [' ' + norm(t.description) + ' '];
  if (t.kind) hays.push(' ' + String(t.kind).toLowerCase() + ' ');
  for (const hay of hays)
    for (const r of rules) if (r.pattern && hay.includes(' ' + r.pattern.toLowerCase())) return r.categoryId;
  return t.hint || null;
}

export function autoCategorize(S: State): void {
  const rules = orderedRules(S.rules);
  const ids = new Set(S.categories.map((c) => c.id));
  for (const t of S.transactions) {
    if (t.manual) continue;
    const c = matchRule(t, rules);
    t.categoryId = c && ids.has(c) ? c : null;
  }
}
