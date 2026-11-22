import { $, $$, errMsg, toast } from '../dom';
import { esc } from '../format';
import { importBackup } from '../import';
import { decode } from '../import/util';
import { rerender } from '../nav';
import { autoCategorize } from '../rules';
import { catById, S, save } from '../state';
import { logout, session } from '../sync';
import type { Category } from '../types';

const TYPES: [Category['type'], string][] = [
  ['expense', 'Utgift'], ['income', 'Inkomst'], ['saving', 'Sparande'], ['transfer', 'Överföring (räknas ej)'],
];
const PALETTE = ['#3949ab', '#d81b60', '#00acc1', '#8e24aa', '#f4511e', '#43a047', '#fdd835', '#6d4c41'];

/* Kategorier & regler + data (logga ut, säkerhetskopia, radera) */
export function renderSettings(main: HTMLElement): void {
  const again = () => renderSettings(main);
  const recat = () => { autoCategorize(S); save(); };
  const catOpts = (sel?: string) => S.categories.map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const counts: Record<string, number> = {};
  for (const t of S.transactions) counts[t.categoryId ?? ''] = (counts[t.categoryId ?? ''] || 0) + 1;

  main.innerHTML = `<div class="grid two">
  <div class="card"><h2>Kategorier</h2>
    ${S.categories.map((c) => `<div class="catrow" data-id="${c.id}">
      <input type="color" value="${c.color}" data-f="color"><input type="text" value="${esc(c.name)}" data-f="name">
      <select data-f="type">${TYPES.map(([v, l]) => `<option value="${v}" ${c.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="muted num" style="width:46px">${counts[c.id] || 0} st</span><button class="btn danger" data-del="${c.id}" title="Ta bort">✕</button></div>`).join('')}
    <div class="toolbar" style="margin-top:12px"><input type="text" id="newCat" placeholder="Ny kategori…"><button class="btn primary" id="addCat">Lägg till</button></div>
  </div>
  <div class="card"><h2>Regler <span class="muted" style="font-weight:400">(${S.rules.length})</span></h2>
    <p class="muted" style="margin-top:-6px">Om mottagaren innehåller ett ord som börjar med mönstret får transaktionen kategorin. Finns ingen träff provas transaktionstypen (t.ex. "Lön", "Överföring"). Inlärda regler (från att dra kort) vinner, därefter det längsta/mest specifika mönstret. Avsluta mönstret med mellanslag för att kräva exakt ord.</p>
    <div class="toolbar"><input type="text" id="newPat" placeholder="t.ex. ica eller sl "><select id="newPatCat">${catOpts()}</select><button class="btn primary" id="addRule">Lägg till regel</button></div>
    <div style="max-height:520px;overflow-y:auto"><table><tbody>
    ${S.rules.map((r, i) => `<tr><td><code>${esc(r.pattern)}</code>${r.learned ? ' <span class="muted" style="font-size:11px">inlärd</span>' : ''}</td><td><select data-ri="${i}">${catOpts(r.categoryId)}</select></td><td><button class="btn danger" data-rdel="${i}">✕</button></td></tr>`).join('')}
    </tbody></table></div>
  </div></div>
  <div class="card" style="margin-top:16px"><h2>Data</h2>
    <p class="muted">Din data sparas i din Supabase-databas och synkas mellan dator och telefon. Inloggad som <b>${esc(session.user?.email || '')}</b>.
      Gratisnivån saknar automatisk säkerhetskopiering – spara gärna en kopia ibland.</p>
    <div class="toolbar"><button class="btn" id="logout">Logga ut</button><button class="btn" id="exp">Spara säkerhetskopia (.json)</button><button class="btn" id="imp">Återställ säkerhetskopia</button>
    <button class="btn" id="rerun">Kör om reglerna på allt (behåller manuella val)</button><button class="btn" id="resetManual">Glöm manuella val</button><button class="btn danger" id="wipe">Radera alla transaktioner</button></div></div>`;

  for (const row of $$('.catrow', main)) {
    const c = catById(row.dataset.id);
    if (!c) continue;
    for (const inp of $$<HTMLInputElement | HTMLSelectElement>('[data-f]', row)) {
      inp.onchange = () => {
        const f = inp.dataset.f as 'color' | 'name' | 'type';
        if (f === 'type') c.type = inp.value as Category['type']; else c[f] = inp.value;
        save(); again();
      };
    }
  }
  for (const b of $$('[data-del]', main)) {
    b.onclick = () => {
      const id = b.dataset.del!;
      if (!confirm(`Ta bort kategorin "${catById(id)?.name}"? Transaktionerna blir okategoriserade och dess regler tas bort.`)) return;
      S.categories = S.categories.filter((c) => c.id !== id);
      S.rules = S.rules.filter((r) => r.categoryId !== id);
      for (const t of S.transactions) if (t.categoryId === id) { t.categoryId = null; t.manual = false; }
      recat(); again();
    };
  }
  $('#addCat', main).onclick = () => {
    const n = $<HTMLInputElement>('#newCat', main).value.trim();
    if (!n) return;
    const i = S.categories.findIndex((c) => c.type !== 'expense'); // nya utgiftskategorier före inkomst/sparande
    S.categories.splice(i >= 0 ? i : S.categories.length, 0,
      { id: 'c' + Date.now().toString(36), name: n, color: PALETTE[S.categories.length % PALETTE.length], type: 'expense' });
    save(); again();
  };
  $('#addRule', main).onclick = () => {
    const p = $<HTMLInputElement>('#newPat', main).value.toLowerCase().replace(/^\s+/, '');
    if (!p.trim()) return;
    S.rules.unshift({ pattern: p, categoryId: $<HTMLSelectElement>('#newPatCat', main).value, learned: false });
    recat(); again();
    toast('Regel tillagd och tillämpad');
  };
  for (const s of $$<HTMLSelectElement>('[data-ri]', main)) s.onchange = () => { S.rules[+s.dataset.ri!].categoryId = s.value; recat(); };
  for (const b of $$('[data-rdel]', main)) b.onclick = () => { S.rules.splice(+b.dataset.rdel!, 1); recat(); again(); };
  $('#exp', main).onclick = () => {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `utgifter-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  $('#imp', main).onclick = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.json';
    i.onchange = async () => {
      const f = i.files?.[0];
      if (!f) return;
      try { importBackup(decode(await f.arrayBuffer())); save(); rerender(); toast('Säkerhetskopia återställd'); }
      catch (e) { toast(errMsg(e)); }
    };
    i.click();
  };
  $('#rerun', main).onclick = () => { recat(); toast('Reglerna har körts om'); };
  $('#resetManual', main).onclick = () => {
    if (!confirm('Alla manuella kategoriseringar nollställs och reglerna bestämmer igen. Fortsätta?')) return;
    S.transactions.forEach((t) => (t.manual = false));
    recat(); toast('Klart');
  };
  $('#logout', main).onclick = () => void logout();
  $('#wipe', main).onclick = () => {
    if (!confirm('Radera ALLA importerade transaktioner? Kategorier och regler behålls.')) return;
    S.transactions = [];
    save(); rerender();
  };
}
