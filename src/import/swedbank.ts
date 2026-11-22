import type { ParseResult, PdfPage, Transaction } from '../types';
import { idMaker, newTx, parseAmount, parseDate } from './util';

const AMT = '-?\\d{1,3}(?:[ \\u00a0]\\d{3})*,\\d{2}';
const AMT_ONLY = new RegExp(`^(${AMT})(\\s+${AMT})?$`);
/** Bokföringsdag Transaktionsdag Valutadag  Referens/Text  Belopp  Saldo */
const SWB_LINE = new RegExp(`^(\\d{6})\\s+(\\d{6})\\s+(\\d{6})\\s+(.+?)\\s+(${AMT})\\s+(${AMT})\\s*$`);
const SWB_KINDS = ['Överföring via internet', 'Bg kontoinsättning', 'Pg kontoinsättning', 'Debiteringsavgift', 'Kortköp/uttag', 'Swish mottagen', 'Swish skickad', 'Swish retur', 'Kontoinsättning', 'Insättning', 'Överföring', 'Autogiro', 'Bankgiro', 'Betalning', 'E-faktura', 'Swish', 'Uttag', 'Ränta', 'Lön'];

/** Delar "ICA SUPERMARKET Kortköp/uttag" i mottagare + transaktionstyp. */
export function splitKind(mid: string): { ref: string; kind: string } {
  for (const k of SWB_KINDS) {
    if (mid === k) return { ref: '', kind: k };
    if (mid.endsWith(' ' + k)) return { ref: mid.slice(0, -k.length - 1).trim(), kind: k };
  }
  return { ref: mid, kind: '' };
}

export interface SwbRow { line: string; ref?: string; kind?: string }

export function parseSwedbankLines(rows: SwbRow[]): ParseResult {
  const out: Transaction[] = [], id = idMaker();
  let skipped = 0;
  for (const r of rows) {
    const m = r.line.replace(/\s+/g, ' ').trim().match(SWB_LINE);
    if (!m) { if (/^\d{6}\s/.test(r.line.trim())) skipped++; continue; }
    let ref = r.ref, kind = r.kind ?? '';
    if (ref === undefined || (!ref && !kind)) ({ ref, kind } = splitKind(m[4]));
    const date = parseDate(m[2]) || parseDate(m[1])!;
    const amount = parseAmount(m[5]);
    const description = (ref || kind).replace(/\s+/g, ' ').trim();
    out.push(newTx({ id: id(['Swedbank', date, amount, description, kind]), date, description, kind, amount, currency: 'SEK', source: 'Swedbank' }));
  }
  if (!out.length) throw new Error('Hittade inga transaktionsrader i Swedbank-format.');
  return { source: 'Swedbank', txs: out, skipped };
}

/** Swedbank "Transaktionsrapport" som PDF. Kolumnerna Referens/Text läses via x-position. */
export function parseSwedbankPdf(pages: PdfPage[]): ParseResult {
  const rows: SwbRow[] = [];
  for (const page of pages) {
    let refX: number | null = null, textX: number | null = null;
    for (const its of page) {
      const low = its.map((i) => i.s.toLowerCase());
      if (low.includes('referens') && low.includes('text')) {
        refX = its[low.indexOf('referens')].x;
        textX = its[low.indexOf('text')].x;
        continue;
      }
      const line = its.map((i) => i.s).join(' ');
      if (refX !== null && textX !== null && /^\d{6}\b/.test(line)) {
        const rx = refX, tx = textX;
        const ref = its.filter((i) => i.x >= rx - 2 && i.x < tx - 2).map((i) => i.s).join(' ');
        const kind = its.filter((i) => i.x >= tx - 2 && !AMT_ONLY.test(i.s)).map((i) => i.s).join(' ');
        rows.push({ line, ref, kind });
      } else rows.push({ line });
    }
  }
  return parseSwedbankLines(rows);
}

/** Text som kopierats från Swedbank-rapporten och klistrats in. */
export const parseSwedbankText = (text: string): ParseResult =>
  parseSwedbankLines(text.split(/\r?\n/).map((line) => ({ line })));
