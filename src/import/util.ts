import type { Transaction } from '../types';

/** UTF-8 om möjligt, annars Windows-1252 (äldre bankexporter). */
export function decode(buf: ArrayBuffer): string {
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
  return t.replace(/^﻿/, '');
}

/** "1 234,50", "-1,234.50", "−12,00 kr" → tal. */
export function parseAmount(input: string | null | undefined): number {
  let s = String(input || '').replace(/[\s ]/g, '').replace(/−/g, '-').replace(/[^\d,.\-]/g, '');
  if (!s) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc >= 0) s = s.replace(',', '.');
  return parseFloat(s);
}

/** 2026-01-15, 15/01/2026, 260115 → "2026-01-15". */
export function parseDate(input: string | null | undefined): string | null {
  const s = String(input || '').trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{2})(\d{2})(\d{2})$/))) return `20${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Ger stabila id:n: samma rad i en ny import får samma id → dubbletter hoppas över. */
export function idMaker(): (parts: (string | number)[]) => string {
  const seen: Record<string, number> = {};
  return (parts) => {
    const base = parts.join('|');
    seen[base] = (seen[base] || 0) + 1;
    return base + '#' + seen[base];
  };
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function newTx(fields: Omit<Transaction, 'categoryId' | 'manual'> & { hint?: string | null }): Transaction {
  return { categoryId: null, manual: false, hint: null, ...fields };
}
