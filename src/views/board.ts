import { $, $$, toast } from '../dom';
import { esc, fmtKr2, kr } from '../format';
import { rerender } from '../nav';
import { txKey } from '../rules';
import { assignCategory, catById, displayName, groupKey, markIcon, periodTx, S, save, UNCAT } from '../state';
import type { CatView } from '../types';
import { openEditor } from './editor';

interface Group { ids: string[]; patterns: string[] }
let dragMap = new Map<string, Group>();
let dragKey: string | null = null;

/* Sortera: kort per mottagare som dras mellan kategorikolumner */
export function renderBoard(main: HTMLElement): void {
  const txs = periodTx();
  dragMap = new Map();
  const cols: CatView[] = [UNCAT, ...S.categories];
  const html = cols.map((c) => {
    const list = txs.filter((t) => (t.categoryId || null) === c.id);
    const groups = new Map<string, { key: string; desc: string; kinds: Set<string>; pats: Set<string>; marks: Set<string>; notes: string[]; ids: string[]; sum: number; dates: string[] }>();
    for (const t of list) {
      const k = S.ui.group ? groupKey(t) : t.id;
      const g = groups.get(k) || { key: k, desc: displayName(t), kinds: new Set(), pats: new Set(), marks: new Set(), notes: [], ids: [], sum: 0, dates: [] };
      if (t.kind) g.kinds.add(t.kind);
      g.pats.add(txKey(t));
      if (t.mark) g.marks.add(t.mark);
      if (t.note) g.notes.push(t.note);
      g.ids.push(t.id); g.sum += t.amount; g.dates.push(t.date);
      groups.set(k, g);
    }
    const arr = [...groups.values()].sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));
    const total = list.reduce((s, t) => s + t.amount, 0);
    const cards = arr.slice(0, 150).map((g) => {
      const dk = (c.id || '_') + '::' + g.key;
      dragMap.set(dk, { ids: g.ids, patterns: [...g.pats].filter(Boolean) });
      const dates = g.dates.sort();
      let dl = dates.length > 1 ? `${dates[0].slice(5)} – ${dates[dates.length - 1].slice(5)}` : dates[0];
      if (g.kinds.size && !g.kinds.has(g.desc)) dl += ' · ' + esc([...g.kinds].join(', '));
      return `<div class="tx" draggable="true" data-key="${esc(dk)}" style="border-left-color:${c.color}" title="${esc(g.desc)}">
        <div class="d">${[...g.marks].map(markIcon).join('')}${esc(g.desc || '(ingen beskrivning)')}${g.ids.length > 1 ? `<span class="badge">×${g.ids.length}</span>` : ''}</div>
        <div class="m"><span>${dl}</span><span class="${g.sum < 0 ? '' : 'pos'}">${fmtKr2.format(g.sum)}</span></div>
        ${g.notes.length ? `<div class="note">📝 ${esc(g.notes.join(' · '))}</div>` : ''}</div>`;
    }).join('');
    return `<div class="col ${c.id === null ? 'uncat' : ''}" data-cat="${c.id ?? ''}">
      <div class="colhead"><span class="dot" style="background:${c.color}"></span><b>${esc(c.name)}</b><span class="muted num">${list.length} st · ${kr(Math.abs(total) + 0)}</span></div>
      <div class="colbody">${cards || '<div class="muted" style="font-size:12px;text-align:center;padding:12px">Dra hit</div>'}${arr.length > 150 ? `<div class="muted">+${arr.length - 150} till…</div>` : ''}</div></div>`;
  }).join('');
  const touch = matchMedia('(hover: none)').matches;
  const periodName = $<HTMLSelectElement>('#period').selectedOptions[0]?.textContent || 'Alla';
  main.innerHTML = `<div class="toolbar">
      <label><input type="checkbox" id="learn" ${S.ui.learn ? 'checked' : ''}> Kom ihåg: kategorisera samma mottagare automatiskt framöver</label>
      <label><input type="checkbox" id="grp" ${S.ui.group ? 'checked' : ''}> Gruppera per mottagare</label>
      <span class="muted">${touch ? 'Tryck på ett kort för att välja kategori, namn och markering.' : 'Dra kort mellan kategorierna, eller klicka för att ändra.'} Visar perioden: ${esc(periodName)}.</span></div>
    <div class="board">${html}</div>`;
  $<HTMLInputElement>('#learn', main).onchange = (e) => { S.ui.learn = (e.target as HTMLInputElement).checked; save(); };
  $<HTMLInputElement>('#grp', main).onchange = (e) => { S.ui.group = (e.target as HTMLInputElement).checked; save(); rerender(); };
  for (const el of $$('.tx', main)) {
    el.addEventListener('dragstart', (e) => {
      dragKey = el.dataset.key || null;
      el.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'tx'); }
    });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragKey = null; });
    el.addEventListener('click', () => { const g = dragMap.get(el.dataset.key || ''); if (g) openEditor(g.ids); });
  }
  for (const col of $$('.col', main)) {
    col.addEventListener('dragover', (e) => { if (!dragKey) return; e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget as Node | null)) col.classList.remove('over'); });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('over');
      if (dragKey) moveTo(dragKey, col.dataset.cat || null);
    });
  }
}

function moveTo(key: string, catId: string | null): void {
  const g = dragMap.get(key);
  if (!g) return;
  const extra = assignCategory(g.ids, g.patterns, catId);
  save();
  rerender();
  toast(`${g.ids.length} st → ${(catById(catId) || UNCAT).name}${extra ? ` (+${extra} i andra perioder)` : ''}`);
}
