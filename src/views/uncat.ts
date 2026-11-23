import { $, $$, toast } from '../dom';
import { esc, fmtKr2, kr } from '../format';
import { rerender } from '../nav';
import { txKey } from '../rules';
import { assignCategory, catById, catLabel, displayName, groupKey, inPeriod, orderedCats, S, save, subsOf, UNCAT } from '../state';
import type { Category, Transaction } from '../types';
import { openEditor } from './editor';

/** Behöver kategoriseras: saknar kategori, eller ligger direkt på en huvudkategori som har underkategorier. */
export function needsCategory(t: Transaction): boolean {
  const c = catById(t.categoryId);
  return !c || (!c.parent && subsOf(c.id).length > 0);
}

export const uncatCount = (): number => S.transactions.filter(needsCategory).length;

interface Row { key: string; cat: string | null; name: string; desc: string; ids: string[]; pats: string[]; sum: number; dates: string[]; kinds: Set<string>; notes: string[] }

/** Rader där användaren har öppnat en huvudkategori för att välja underkategori. */
const opened = new Map<string, string>();

export function renderUncat(main: HTMLElement): void {
  const all = S.ui.uncatAll !== false;
  const txs = S.transactions.filter((t) => needsCategory(t) && (all || inPeriod(t)));
  const rows = new Map<string, Row>();
  for (const t of txs) {
    const cat = catById(t.categoryId) ? t.categoryId : null;
    const key = (cat || '') + '|' + (S.ui.group ? groupKey(t) : t.id);
    const r = rows.get(key) || { key, cat, name: displayName(t), desc: t.description, ids: [], pats: [], sum: 0, dates: [], kinds: new Set(), notes: [] };
    r.ids.push(t.id);
    const p = txKey(t);
    if (p && !r.pats.includes(p)) r.pats.push(p);
    r.sum += t.amount;
    r.dates.push(t.date);
    if (t.kind) r.kinds.add(t.kind);
    if (t.note) r.notes.push(t.note);
    rows.set(key, r);
  }
  // Helt okategoriserat först, sedan flest transaktioner och störst belopp
  const list = [...rows.values()].sort((a, b) =>
    Number(!!a.cat) - Number(!!b.cat) || b.ids.length - a.ids.length || Math.abs(b.sum) - Math.abs(a.sum));
  const tops = orderedCats().filter((c) => !c.parent);
  const nUncat = txs.filter((t) => !catById(t.categoryId)).length;

  const pick = (c: Category, extra = '', label = c.name) =>
    `<button type="button" class="pick${extra}" data-cat="${c.id}" title="${esc(catLabel(c))}"><span class="dot" style="background:${c.color}"></span>${esc(label)}</button>`;
  // Utgifter först för belopp ut, inkomster först för belopp in
  const mainOrder = (sum: number) => {
    const rank: Record<string, number> = sum < 0 ? { expense: 0, saving: 1, transfer: 2, income: 3 } : { income: 0, transfer: 1, saving: 2, expense: 3 };
    return [...tops].sort((a, b) => rank[a.type] - rank[b.type]);
  };

  const rowHtml = (r: Row) => {
    // '' = användaren vill byta huvudkategori; annars den öppnade, eller radens nuvarande
    const open = opened.has(r.key) ? opened.get(r.key) : r.cat;
    const parent = open ? catById(open) : undefined;
    const dates = r.dates.sort();
    let meta = dates.length > 1 ? `${dates[0]} – ${dates[dates.length - 1]}` : dates[0];
    if (r.kinds.size && !r.kinds.has(r.name)) meta += ' · ' + esc([...r.kinds].join(', '));
    const picks = parent
      ? `<div class="picks-label">${r.cat ? 'Välj underkategori i' : 'Underkategori i'} <b>${esc(parent.name)}</b></div>
         <div class="picks">${subsOf(parent.id).map((s) => pick(s, ' sub')).join('')}
           ${r.cat === parent.id ? '' : pick(parent, ' plain', `Bara ${parent.name}`)}
           <button type="button" class="linkbtn" data-back>${r.cat === parent.id ? 'Annan kategori…' : '← Tillbaka'}</button></div>`
      : `<div class="picks">${mainOrder(r.sum).map((c) => pick(c, subsOf(c.id).length ? ' hassubs' : '')).join('')}
           ${r.cat ? '<button type="button" class="linkbtn" data-back>← Tillbaka</button>' : ''}</div>`;
    return `<div class="tri" data-key="${esc(r.key)}">
      <div class="tri-head">
        <div class="tri-name"><b>${esc(r.name)}</b>${r.ids.length > 1 ? `<span class="badge">×${r.ids.length}</span>` : ''}
          ${r.cat ? `<span class="tri-cur"><span class="dot" style="background:${catById(r.cat)!.color}"></span>${esc(catById(r.cat)!.name)}</span>` : ''}
          <div class="muted tri-meta">${r.name !== r.desc ? esc(r.desc) + ' · ' : ''}${meta}</div>
          ${r.notes.length ? `<div class="lnote">📝 ${esc(r.notes.join(' · '))}</div>` : ''}</div>
        <div class="tri-sum num ${r.sum < 0 ? '' : 'pos'}">${fmtKr2.format(r.sum)}</div>
        <button type="button" class="iconbtn" data-edit title="Ändra namn, anteckning eller enskilda transaktioner">✎</button>
      </div>
      ${picks}</div>`;
  };

  main.innerHTML = `<div class="toolbar">
      <select id="ucAll" aria-label="Vilka perioder"><option value="all" ${all ? 'selected' : ''}>Alla perioder</option><option value="period" ${all ? '' : 'selected'}>Bara vald period</option></select>
      <label><input type="checkbox" id="ucLearn" ${S.ui.learn ? 'checked' : ''}> Kom ihåg mottagaren framöver</label>
      <label><input type="checkbox" id="ucGrp" ${S.ui.group ? 'checked' : ''}> Gruppera per mottagare</label>
      <span class="muted">${txs.length ? `${nUncat} utan kategori · ${txs.length - nUncat} saknar underkategori · summa ${kr(txs.reduce((s, t) => s + t.amount, 0))}` : ''}</span></div>
    ${list.length ? `<div class="trilist">${list.slice(0, 200).map(rowHtml).join('')}</div>
      ${list.length > 200 ? `<p class="muted">Visar 200 av ${list.length} mottagare.</p>` : ''}`
      : `<div class="card empty-done"><div class="big">✓</div><b>Allt är kategoriserat</b><div class="muted">${all ? '' : 'i vald period. '}Nya transaktioner som inte känns igen hamnar här.</div></div>`}`;

  $<HTMLSelectElement>('#ucAll', main).onchange = (e) => { S.ui.uncatAll = (e.target as HTMLSelectElement).value === 'all'; save(); rerender(); };
  $<HTMLInputElement>('#ucLearn', main).onchange = (e) => { S.ui.learn = (e.target as HTMLInputElement).checked; save(); };
  $<HTMLInputElement>('#ucGrp', main).onchange = (e) => { S.ui.group = (e.target as HTMLInputElement).checked; save(); rerender(); };

  for (const el of $$('.tri', main)) {
    const r = rows.get(el.dataset.key!)!;
    el.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-edit]')) return openEditor(r.ids);
      if (t.closest('[data-back]')) {
        // Rad med huvudkategori som visar dess underkategorier: "Annan kategori…" visar alla huvudkategorier.
        // Annars tillbaka till utgångsläget.
        const showing = opened.has(r.key) ? opened.get(r.key) : r.cat;
        if (r.cat && showing === r.cat) opened.set(r.key, ''); else opened.delete(r.key);
        return rerender();
      }
      const b = t.closest<HTMLElement>('.pick');
      if (!b) return;
      const c = catById(b.dataset.cat)!;
      // Huvudkategori med underkategorier: fäll ut dem i raden i stället för att välja direkt
      if (b.classList.contains('hassubs')) { opened.set(r.key, c.id); return rerender(); }
      assign(r, c.id);
    };
  }
}

function assign(r: Row, catId: string): void {
  // Ögonblicksbild för "Ångra"
  const before = new Map(S.transactions.map((t) => [t.id, { categoryId: t.categoryId, manual: t.manual }]));
  const rulesBefore = S.rules.map((x) => ({ ...x }));
  const extra = assignCategory(r.ids, r.pats, catId);
  opened.delete(r.key);
  save();
  rerender();
  toast(`${r.name}: ${r.ids.length} st → ${catLabel(catById(catId) || UNCAT)}${extra ? ` (+${extra} till)` : ''}`, {
    label: 'Ångra',
    run: () => {
      for (const t of S.transactions) {
        const b = before.get(t.id);
        if (b) { t.categoryId = b.categoryId; t.manual = b.manual; }
      }
      S.rules = rulesBefore;
      save();
      rerender();
      toast('Ångrat');
    },
  });
}
