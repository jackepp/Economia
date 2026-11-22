import { errMsg, toast } from '../dom';
import { rerender } from '../nav';
import { autoCategorize } from '../rules';
import { allMonths, replaceState, S, save } from '../state';
import type { State, Transaction } from '../types';
import { parseCsvStatement } from './csv';
import { parsePdf } from './pdf';
import { parseSwedbankText } from './swedbank';
import { decode } from './util';

/** Lägger till nya transaktioner, hoppar över de som redan finns. Returnerar antal nya. */
function addNew(txs: Transaction[]): number {
  const existing = new Set(S.transactions.map((t) => t.id));
  let added = 0;
  for (const t of txs) if (!existing.has(t.id)) { existing.add(t.id); S.transactions.push(t); added++; }
  return added;
}

function afterImport(msg: string): void {
  autoCategorize(S);
  save();
  if (S.ui.period !== 'all' && !allMonths().includes(S.ui.period.slice(2))) S.ui.period = 'all';
  toast(msg);
  rerender();
}

export function importPasted(text: string): void {
  try {
    const { txs, skipped } = parseSwedbankText(text);
    const added = addNew(txs);
    afterImport(`Inklistrad text (Swedbank): ${added} nya, ${txs.length - added} dubbletter${skipped ? `, ${skipped} rader kunde inte läsas` : ''}`);
  } catch (e) {
    toast(errMsg(e));
  }
}

export async function importFiles(files: File[]): Promise<void> {
  const msgs: string[] = [];
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const name = f.name.toLowerCase();
      if (name.endsWith('.json')) {
        importBackup(decode(buf));
        msgs.push(`${f.name}: säkerhetskopia återställd`);
        continue;
      }
      const res = name.endsWith('.pdf') ? await parsePdf(buf) : parseCsvStatement(decode(buf), f.name);
      const added = addNew(res.txs);
      msgs.push(`${f.name} (${res.source}): ${added} nya, ${res.txs.length - added} dubbletter` +
        `${res.skipped ? `, ${res.skipped} rader hoppades över` : ''}${res.warn ? ` ⚠ ${res.warn}` : ''}`);
    } catch (e) {
      msgs.push(`${f.name}: ${errMsg(e)}`);
    }
  }
  afterImport(msgs.join('\n'));
}

export function importBackup(text: string): void {
  const d = JSON.parse(text) as Partial<State>;
  if (!d.transactions || !d.categories) throw new Error('Ogiltig säkerhetskopia');
  const ui = S.ui;
  replaceState(d);
  S.ui = Object.assign(ui, d.ui || {});
}
