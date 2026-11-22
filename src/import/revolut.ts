import type { ParseResult, PdfItem, PdfPage, Transaction } from '../types';
import { idMaker, newTx, parseAmount, round2 } from './util';

const SV_MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, mars: 3, apr: 4, maj: 5, jun: 6, juni: 6, jul: 7, juli: 7, aug: 8, sep: 9, sept: 9, okt: 10, nov: 11, dec: 12 };

/** "3 okt. 2026" → "2026-10-03" */
export function parseSvDate(s: string): string | null {
  const m = String(s).match(/^(\d{1,2})\s+([a-zåäö]+)\.?\s+(\d{4})\b/i);
  if (!m) return null;
  const mo = SV_MON[m[2].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const REV_AMT = /^(-?\d{1,3}(?:[ \u00a0]\d{3})*,\d{2})\s*([A-Z]{3})$/;
const amtOf = (i: PdfItem) => i.s.trim().match(REV_AMT);

export const isRevolutText = (text: string): boolean => /Revolut/i.test(text) && /Pengar\s+ut/i.test(text);

/** Revolut kontoutdrag (PDF, svenska). Riktningen kontrolleras mot saldokolumnen. */
export function parseRevolutPdf(pages: PdfPage[]): ParseResult {
  const out: Transaction[] = [], refunds = new Set<Transaction>();
  let skipped = 0, mismatches = 0, prevSaldo: number | null = null, cur: Transaction | null = null;
  for (const page of pages) {
    let col: { desc: number | null; out: number | null; in: number | null } | null = null;
    for (const raw of page) {
      // slå ihop "293,50" + "SEK" om PDF:en delat upp dem
      const its = raw.reduce<PdfItem[]>((a, i) => {
        const p = a[a.length - 1];
        if (p && /^[A-Z]{3}$/.test(i.s.trim()) && /\d,\d{2}$/.test(p.s.trim())) p.s = p.s.trim() + ' ' + i.s.trim();
        else a.push({ ...i });
        return a;
      }, []);
      const line = its.map((i) => i.s).join(' ').trim();
      // Rubrikrad: Datum | Beskrivning | Pengar ut | Pengar in | Saldo
      if (/^Datum\b/i.test(line) && /Beskrivning/i.test(line) && /Pengar/i.test(line)) {
        const find = (re: RegExp): number | null => {
          for (let k = 0; k < its.length; k++) {
            const s = its[k].s.trim();
            if (re.test(s)) return its[k].x;
            if (/^pengar$/i.test(s) && its[k + 1] && re.test('pengar ' + its[k + 1].s.trim())) return its[k].x;
          }
          return null;
        };
        col = { desc: find(/^beskrivning$/i), out: find(/^pengar\s+ut$/i), in: find(/^pengar\s+in$/i) };
        continue;
      }
      if (!col) {
        // saldosammanfattningen före första rubriken: ta öppningssaldot
        if (prevSaldo === null && /^Konto\b/.test(line)) {
          const a = its.find((i) => REV_AMT.test(i.s.trim()));
          if (a) prevSaldo = parseAmount(amtOf(a)![1]);
        }
        continue;
      }
      const date = parseSvDate(line);
      if (date) {
        const amts = its.filter((i) => REV_AMT.test(i.s.trim()));
        const dx = col.desc;
        const description = dx === null ? '' : its.filter((i) => i.x >= dx - 2 && !amts.includes(i)).map((i) => i.s).join(' ').trim();
        if (!amts.length || !description) { skipped++; cur = null; continue; }
        const amtIt = amts[0], saldoIt = amts.length > 1 ? amts[amts.length - 1] : null;
        const [, a, currency] = amtOf(amtIt)!;
        const v = parseAmount(a);
        let sign = col.in !== null && amtIt.x >= col.in - 10 ? 1 : -1;
        const saldo = saldoIt ? parseAmount(amtOf(saldoIt)![1]) : null;
        // Kontrollera mot saldot – rättar riktningen om kolumnen tolkats fel
        if (prevSaldo !== null && saldo !== null && Math.abs(prevSaldo + sign * v - saldo) > 0.005) {
          if (Math.abs(prevSaldo - sign * v - saldo) <= 0.005) sign = -sign;
          else mismatches++;
        }
        if (saldo !== null) prevSaldo = saldo;
        cur = newTx({ id: '', date, description, kind: '', amount: round2(sign * v), currency, source: 'Revolut',
          hint: /påfyllning|top-?up/i.test(description) ? 'overf' : null });
        out.push(cur);
        continue;
      }
      if (cur) {
        // detaljrader under transaktionen
        const k = line.match(/^Kort:\s*\S*?(\d{4})\s*$/);
        if (k) { cur.kind = 'Kort *' + k[1]; continue; }
        if (/^Från:/.test(line) && cur.amount > 0 && !cur.hint) refunds.add(cur);
      }
    }
  }
  if (!out.length) throw new Error('Hittade inga transaktioner i Revolut-utdraget.');
  const id = idMaker();
  for (const t of out) {
    if (t.hint) t.kind = 'Påfyllning';
    if (refunds.has(t)) t.kind = (t.kind ? t.kind + ' · ' : '') + 'Återbetalning';
    t.id = id(['Revolut', t.date, t.amount, t.description]);
  }
  return { source: 'Revolut', txs: out, skipped, warn: mismatches ? `${mismatches} rader stämde inte med saldot – kontrollera dem` : '' };
}
