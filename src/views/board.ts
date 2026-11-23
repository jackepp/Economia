import { $, $$, toast } from '../dom';
import { esc, fmtKr2, kr } from '../format';
import { rerender } from '../nav';
import { txKey } from '../rules';
import { assignCategory, catById, catLabel, displayName, groupKey, orderedCats, periodTx, rootId, S, save, subsOf, UNCAT } from '../state';
import type { CatView } from '../types';
import { openEditor } from './editor';

interface Group { ids: string[]; patterns: string[] }
let dragMap = new Map<string, Group>();
let dragKey: string | null = null;

/* Sortera: kort per mottagare som dras mellan kategorikolumner.
   Bara huvudkategorier visas som kolumner; när ett kort dras över en kolumn
   fälls dess underkategorier ut som släppytor. */
export function renderBoard(main: HTMLElement): void {
  const txs = periodTx();
  dragMap = new Map();
  const cols: CatView[] = [UNCAT, ...orderedCats().filter((c) => !c.parent)];
  const html = cols.map((c) => {
    const subs = c.id ? subsOf(c.id) : [];
    const list = txs.filter((t) => (c.id === null ? !t.categoryId || !catById(t.categoryId) : rootId(t.categoryId) === c.id));
    // Grupper per mottagare och exakt kategori, så att varje kort vet sin underkategori
    const groups = new Map<string, { key: string; cat: string | null; desc: string; kinds: Set<string>; pats: Set<string>; notes: string[]; ids: string[]; sum: number; dates: string[] }>();
    for (const t of list) {
      const cat = c.id === null ? null : t.categoryId;
      const k = (cat || '') + '|' + (S.ui.group ? groupKey(t) : t.id);
      const g = groups.get(k) || { key: k, cat, desc: displayName(t), kinds: new Set(), pats: new Set(), notes: [], ids: [], sum: 0, dates: [] };
      if (t.kind) g.kinds.add(t.kind);
      g.pats.add(txKey(t));
      if (t.note) g.notes.push(t.note);
      g.ids.push(t.id); g.sum += t.amount; g.dates.push(t.date);
      groups.set(k, g);
    }
    const arr = [...groups.values()].sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));
    const total = list.reduce((s, t) => s + t.amount, 0);
    const count = (id: string) => list.filter((t) => t.categoryId === id).length;
    const cards = arr.slice(0, 150).map((g) => {
      const dk = (c.id || '_') + '::' + g.key;
      dragMap.set(dk, { ids: g.ids, patterns: [...g.pats].filter(Boolean) });
      const dates = g.dates.sort();
      let dl = dates.length > 1 ? `${dates[0].slice(5)} – ${dates[dates.length - 1].slice(5)}` : dates[0];
      if (g.kinds.size && !g.kinds.has(g.desc)) dl += ' · ' + esc([...g.kinds].join(', '));
      const sub = g.cat && g.cat !== c.id ? catById(g.cat) : null;
      return `<div class="tx" draggable="true" data-key="${esc(dk)}" style="border-left-color:${(sub || c).color}" title="${esc(g.desc)}">
        <div class="d">${esc(g.desc || '(ingen beskrivning)')}${g.ids.length > 1 ? `<span class="badge">×${g.ids.length}</span>` : ''}</div>
        ${sub ? `<div class="subtag"><span class="dot" style="background:${sub.color}"></span>${esc(sub.name)}</div>` : ''}
        <div class="m"><span>${dl}</span><span class="${g.sum < 0 ? '' : 'pos'}">${fmtKr2.format(g.sum)}</span></div>
        ${g.notes.length ? `<div class="note">📝 ${esc(g.notes.join(' · '))}</div>` : ''}</div>`;
    }).join('');
    // Släppytor: huvudkategorin själv och varje underkategori
    const targets = subs.length ? `<div class="subdrop" aria-hidden="true">
        <div class="subdrop-title">Släpp på en underkategori</div>
        <div class="subt main" data-cat="${c.id}"><span class="dot" style="background:${c.color}"></span><span class="n">${esc(c.name)}</span><span class="muted">utan under­kategori</span></div>
        ${subs.map((s) => `<div class="subt" data-cat="${s.id}"><span class="dot" style="background:${s.color}"></span><span class="n">${esc(s.name)}</span><span class="muted num">${count(s.id) || ''}</span></div>`).join('')}
      </div>` : '';
    const chips = subs.length ? `<div class="subchips">${subs.map((s) => `<span class="subchip" title="${esc(catLabel(s))}"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}${count(s.id) ? ` <b>${count(s.id)}</b>` : ''}</span>`).join('')}</div>` : '';
    return `<div class="col ${c.id === null ? 'uncat' : ''}${subs.length ? ' hassubs' : ''}" data-cat="${c.id ?? ''}">
      <div class="colhead"><span class="dot" style="background:${c.color}"></span><b>${esc(c.name)}</b><span class="muted num">${list.length} st · ${kr(Math.abs(total) + 0)}</span></div>
      ${chips}
      <div class="colbody">${cards || '<div class="muted" style="font-size:12px;text-align:center;padding:12px">Dra hit</div>'}${arr.length > 150 ? `<div class="muted">+${arr.length - 150} till…</div>` : ''}</div>
      ${targets}</div>`;
  }).join('');
  const touch = matchMedia('(hover: none)').matches;
  const periodName = $<HTMLSelectElement>('#period').selectedOptions[0]?.textContent || 'Alla';
  main.innerHTML = `<div class="toolbar">
      <label><input type="checkbox" id="learn" ${S.ui.learn ? 'checked' : ''}> Kom ihåg: kategorisera samma mottagare automatiskt framöver</label>
      <label><input type="checkbox" id="grp" ${S.ui.group ? 'checked' : ''}> Gruppera per mottagare</label>
      <span class="muted">${touch ? 'Tryck på ett kort för att välja kategori, namn och anteckning.' : 'Dra kort till en kategori – håll kvar över den för att välja underkategori. Klicka för att ändra.'} Visar perioden: ${esc(periodName)}.</span></div>
    <div class="board">${html}</div>`;
  $<HTMLInputElement>('#learn', main).onchange = (e) => { S.ui.learn = (e.target as HTMLInputElement).checked; save(); };
  $<HTMLInputElement>('#grp', main).onchange = (e) => { S.ui.group = (e.target as HTMLInputElement).checked; save(); rerender(); };
  for (const el of $$('.tx', main)) {
    el.addEventListener('dragstart', (e) => {
      dragKey = el.dataset.key || null;
      el.classList.add('dragging');
      main.querySelector('.board')!.classList.add('dragmode');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'tx'); }
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      dragKey = null;
      main.querySelector('.board')?.classList.remove('dragmode');
      for (const c of $$('.col.over', main)) c.classList.remove('over');
    });
    el.addEventListener('click', () => { const g = dragMap.get(el.dataset.key || ''); if (g) openEditor(g.ids); });
  }
  const hotOff = (col: HTMLElement) => { for (const h of $$('.subt.hot', col)) h.classList.remove('hot'); };
  for (const col of $$('.col', main)) {
    col.addEventListener('dragover', (e) => {
      if (!dragKey) return;
      e.preventDefault();
      if (!col.classList.contains('over')) { for (const o of $$('.col.over', main)) if (o !== col) { o.classList.remove('over'); hotOff(o); } col.classList.add('over'); }
      // Markera den underkategori som pekaren är över
      const t = (e.target as HTMLElement).closest<HTMLElement>('.subt');
      for (const h of $$('.subt', col)) h.classList.toggle('hot', h === t);
    });
    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget as Node | null)) { col.classList.remove('over'); hotOff(col); }
    });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('over');
      hotOff(col);
      // Släpp på en underkategori, annars på huvudkategorin
      const t = (e.target as HTMLElement).closest<HTMLElement>('.subt');
      if (dragKey) moveTo(dragKey, (t ? t.dataset.cat : col.dataset.cat) || null);
    });
  }
}

function moveTo(key: string, catId: string | null): void {
  const g = dragMap.get(key);
  if (!g) return;
  const extra = assignCategory(g.ids, g.patterns, catId);
  save();
  rerender();
  toast(`${g.ids.length} st → ${catLabel(catById(catId) || UNCAT)}${extra ? ` (+${extra} i andra perioder)` : ''}`);
}
