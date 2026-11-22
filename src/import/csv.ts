import type { ParseResult, Transaction } from '../types';
import { idMaker, newTx, parseAmount, parseDate, round2 } from './util';

export function parseCSV(text: string, d: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const H = (s: string) => String(s).toLowerCase().replace(/[\s_]+/g, ' ').trim();

const AL = {
  date: ['transaktionsdag', 'started date', 'startdatum', 'completed date', 'slutförandedatum', 'bokföringsdag', 'transaktionsdatum', 'datum', 'date'],
  desc: ['beskrivning', 'description', 'text', 'mottagare', 'meddelande'],
  ref: ['referens', 'reference'],
  amount: ['belopp', 'amount', 'summa'],
  fee: ['fee', 'avgift'],
  currency: ['valuta', 'currency'],
  state: ['state', 'tillstånd', 'status'],
  type: ['type', 'typ'],
};
type Cols = Record<keyof typeof AL, number>;

function findCol(hdr: string[], aliases: string[]): number {
  for (const a of aliases) { const i = hdr.indexOf(a); if (i >= 0) return i; }
  for (const a of aliases) { const i = hdr.findIndex((h) => h.includes(a)); if (i >= 0) return i; }
  return -1;
}

interface Detected { rows: string[][]; i: number; hdr: string[]; c: Cols; source: string }

function detect(text: string, filename: string): Detected | null {
  let best: Omit<Detected, 'source'> | null = null;
  for (const d of [',', ';', '\t']) {
    const rows = parseCSV(text, d);
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const hdr = rows[i].map(H);
      const c = Object.fromEntries(Object.entries(AL).map(([k, a]) => [k, findCol(hdr, a)])) as Cols;
      if (c.date < 0 || c.amount < 0 || (c.desc < 0 && c.ref < 0)) continue;
      if (!best || hdr.length > best.hdr.length) best = { rows, i, hdr, c };
      break;
    }
  }
  if (!best) return null;
  const h = best.hdr.join('|'), fn = filename.toLowerCase();
  let source = 'Annan';
  if (/started date|startdatum|completed date|slutförandedatum/.test(h) || fn.includes('revolut')) source = 'Revolut';
  else if (/bokföringsdag|clearingnummer|radnummer/.test(h) || fn.includes('swedbank')) source = 'Swedbank';
  return { ...best, source };
}

/** CSV-export från Swedbank, Revolut eller annan bank med datum/beskrivning/belopp. */
export function parseCsvStatement(text: string, filename = ''): ParseResult {
  const det = detect(text, filename);
  if (!det) throw new Error('Hittade ingen rubrikrad med datum, beskrivning och belopp.');
  const { rows, i, c, source, hdr } = det;
  const out: Transaction[] = [], id = idMaker();
  let skipped = 0;
  for (const r of rows.slice(i + 1)) {
    const date = parseDate(r[c.date]);
    let amount = parseAmount(r[c.amount]);
    if (!date || isNaN(amount)) { skipped++; continue; }
    if (c.state >= 0 && /revert|declin|fail|pending|återf|nekad|misslyck|väntande|avböj|avvisad/i.test(r[c.state] || '')) { skipped++; continue; }
    if (c.fee >= 0) { const fee = parseAmount(r[c.fee]); if (!isNaN(fee)) amount -= Math.abs(fee); }
    let desc = (c.desc >= 0 ? r[c.desc] : '') || '', kind = '';
    // Swedbank-format där "Text" är transaktionstyp och "Referens" är mottagaren
    if (c.desc >= 0 && hdr[c.desc] === 'text' && c.ref >= 0) { kind = desc.trim(); desc = r[c.ref] || ''; }
    if (!desc.trim() && c.ref >= 0) desc = r[c.ref] || '';
    desc = desc.trim().replace(/\s+/g, ' ') || kind;
    const currency = (c.currency >= 0 && r[c.currency] ? r[c.currency].trim() : 'SEK') || 'SEK';
    const type = c.type >= 0 ? (r[c.type] || '').toLowerCase() : '';
    const hint = source === 'Revolut' && /topup|top-up|påfyll|exchange|växl/.test(type) ? 'overf' : null;
    amount = round2(amount);
    out.push(newTx({ id: id([source, date, amount, desc, ...(kind ? [kind] : [])]), date, description: desc, kind, amount, currency, source, hint }));
  }
  return { source, txs: out, skipped };
}
