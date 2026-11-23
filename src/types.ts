export type CatType = 'expense' | 'income' | 'saving' | 'transfer';

export interface Category {
  id: string;
  name: string;
  color: string;
  /** För underkategorier: ärvs från föräldern. */
  type: CatType;
  /** Id för överordnad kategori – sätts bara på underkategorier (en nivå). */
  parent?: string;
}

/** Kategori som den visas – inklusive "Okategoriserat" (id null). */
export interface CatView {
  id: string | null;
  name: string;
  color: string;
  type: CatType | null;
}

export interface Rule {
  /** Matchas mot början av ett ord. Avsluta med mellanslag för exakt ord. */
  pattern: string;
  categoryId: string;
  /** Skapad genom att dra/välja kategori – vinner över standardregler. */
  learned: boolean;
}

export interface Transaction {
  /** Dubblettnyckel: källa|datum|belopp|text#n */
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  /** Transaktionstyp från banken ("Kortköp/uttag", "Kort *1234" …) */
  kind?: string;
  amount: number;
  currency: string;
  source: string;
  categoryId: string | null;
  /** Kategorin är vald av användaren – reglerna rör den inte. */
  manual: boolean;
  /** Föreslagen kategori om ingen regel matchar (t.ex. påfyllningar). */
  hint?: string | null;
  alias?: string;
  note?: string;
  mark?: string;
}

export type View = 'overview' | 'uncat' | 'trends' | 'list' | 'settings' | 'import';

export interface TrendUi {
  /** Upplösning på x-axeln. */
  gran: 'month' | 'week';
  /** Huvudkategorier eller underkategorier som serier. */
  level: 'main' | 'sub';
  chart: 'line' | 'stack';
  /** Antal månader bakåt, 0 = allt. */
  range: number;
  /** Valda serier (kategori-id, '_' = okategoriserat) → färgplats 1–8. Färgen följer serien. */
  slots: Record<string, number>;
  total: boolean;
  /** Vad som visas: en typ av kategorier, eller inkomst mot utgift och sparande. */
  kind?: TrendKind;
  /** Sparade val per vy, så varje vy minns sina serier. */
  slotsBy?: Partial<Record<TrendKind, Record<string, number>>>;
}
export type TrendKind = 'expense' | 'income' | 'saving' | 'balance';

export interface UiState {
  view: View;
  /** 'all' | 'Y:2026' | 'M:2026-10' */
  period: string;
  learn: boolean;
  group: boolean;
  trends?: TrendUi;
  /** Okategoriserat: visa alla perioder (standard) eller bara vald period. */
  uncatAll?: boolean;
}

export interface State {
  rulesVersion: number;
  aliases: Record<string, string>;
  categories: Category[];
  rules: Rule[];
  transactions: Transaction[];
  ui: UiState;
}

export interface ParseResult {
  source: string;
  txs: Transaction[];
  skipped: number;
  warn?: string;
}

/** En textbit från en PDF-sida med x-position. */
export interface PdfItem {
  x: number;
  s: string;
}
/** En sida = rader uppifrån och ned, varje rad = textbitar vänster till höger. */
export type PdfPage = PdfItem[][];
