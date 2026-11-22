import { $, $$ } from '../dom';
import { esc, fmtKr2, kr } from '../format';
import { go } from '../nav';
import { catOf, displayName, periodTx, rootId, S, save } from '../state';
import { catOptions } from './common';
import { openEditor } from './editor';

/** cat: '*' alla, '_' okategoriserat, annars kategori-id. acc: '*' alla, annars konto (källa). */
let listFilter = { q: '', cat: '*', acc: '*' };

export function showCat(id: string | null): void {
  listFilter = { ...listFilter, q: '', cat: id === null ? '_' : id };
  go('list');
}

export function renderList(main: HTMLElement): void {
  const q = listFilter.q.toLowerCase();
  const { cat, acc } = listFilter;
  const accounts = [...new Set(S.transactions.map((t) => t.source || ''))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'sv'));
  const txs = periodTx().filter((t) =>
    (!q || [t.description, displayName(t), t.kind, t.note, t.amount].some((v) => String(v || '').toLowerCase().includes(q))) &&
    // en huvudkategori i filtret tar även med dess underkategorier
    (cat === '*' || (cat === '_' ? !t.categoryId : t.categoryId === cat || rootId(t.categoryId) === cat)) &&
    (acc === '*' || t.source === acc));
  txs.sort((a, b) => b.date.localeCompare(a.date) || a.amount - b.amount);
  const total = txs.reduce((s, t) => s + t.amount, 0);
  const opts = (sel: string | null) => `<option value="" ${!sel ? 'selected' : ''}>Okategoriserat</option>` + catOptions(sel);
  const sub = (s: string) => ` <span class="muted" style="font-size:12px">${s}</span>`;

  main.innerHTML = `<div class="card">
    <div class="toolbar"><input type="search" id="q" placeholder="Sök namn, anteckning eller belopp…" value="${esc(listFilter.q)}" style="min-width:240px">
      <select id="fc"><option value="*">Alla kategorier</option><option value="_">Okategoriserat</option>${catOptions()}</select>
      <select id="fa"><option value="*">Alla konton</option>${accounts.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select>
      <span class="muted">${txs.length} transaktioner · summa ${kr(total)}</span></div>
    <div style="overflow-x:auto"><table class="txtable"><thead><tr><th>Datum</th><th>Beskrivning</th><th>Konto</th><th class="num">Belopp</th><th>Kategori</th><th></th></tr></thead><tbody>
    ${txs.slice(0, 600).map((t) => {
      const name = displayName(t);
      return `<tr class="txrow" data-open="${esc(t.id)}"><td class="num" style="text-align:left">${t.date}</td>
      <td><b style="font-weight:550">${esc(name)}</b>${name !== t.description ? sub(`(${esc(t.description)})`) : ''}${t.kind && t.kind !== t.description ? sub(`· ${esc(t.kind)}`) : ''}
        ${t.note ? `<div class="lnote">📝 ${esc(t.note)}</div>` : ''}</td><td class="muted">${esc(t.source)}</td>
      <td class="num ${t.amount < 0 ? '' : 'pos'}">${fmtKr2.format(t.amount)}${t.currency !== 'SEK' ? ' ' + esc(t.currency) : ''}</td>
      <td><span class="dot" style="background:${catOf(t).color}"></span><select data-id="${esc(t.id)}">${opts(t.categoryId)}</select></td>
      <td><button class="iconbtn" data-edit="${esc(t.id)}" title="Ändra kategori, mottagare, anteckning">✎</button></td></tr>`;
    }).join('')}
    </tbody></table></div>${txs.length > 600 ? `<p class="muted">Visar de 600 senaste. Använd sök eller period för att smalna av.</p>` : ''}</div>`;

  const qEl = $<HTMLInputElement>('#q', main), fc = $<HTMLSelectElement>('#fc', main), fa = $<HTMLSelectElement>('#fa', main);
  fc.value = cat;
  fa.value = accounts.includes(acc) ? acc : '*';
  qEl.oninput = () => {
    listFilter.q = qEl.value;
    renderList(main);
    const n = $<HTMLInputElement>('#q', main);
    n.focus();
    n.setSelectionRange(n.value.length, n.value.length);
  };
  fc.onchange = () => { listFilter.cat = fc.value; renderList(main); };
  fa.onchange = () => { listFilter.acc = fa.value; renderList(main); };
  // Tryck på raden (utom kategorivalet) för att redigera kategori, mottagare och anteckning
  for (const tr of $$('tr[data-open]', main)) {
    tr.onclick = (e) => { if (!(e.target as HTMLElement).closest('select')) openEditor([tr.dataset.open!]); };
  }
  for (const s of $$<HTMLSelectElement>('select[data-id]', main)) {
    s.onchange = () => {
      const t = S.transactions.find((x) => x.id === s.dataset.id);
      if (!t) return;
      t.categoryId = s.value || null;
      t.manual = true;
      save();
      renderList(main);
    };
  }
}
