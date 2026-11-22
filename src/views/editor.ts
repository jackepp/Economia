import { $, $$, $opt, toast } from '../dom';
import { esc, fmtKr2 } from '../format';
import { rerender } from '../nav';
import { txKey } from '../rules';
import { assignCategory, displayName, MARKERS, S, save } from '../state';
import type { Transaction } from '../types';

const FIELDS = ['mark', 'alias', 'note'] as const;

/** Dialog för kategori, namn på mottagaren, och markering/eget namn/anteckning per transaktion. */
export function openEditor(ids: string[]): void {
  const txs = ids.map((id) => S.transactions.find((t) => t.id === id)).filter((t): t is Transaction => !!t)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!txs.length) return;
  const keys = [...new Set(txs.map(txKey))], oneKey = keys.length === 1 ? keys[0] : null;
  const d = $<HTMLDialogElement>('#editor');
  const markOpts = (sel: string) => `<option value="">Ingen markering</option>` +
    Object.entries(MARKERS).map(([k, v]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${v}</option>`).join('');
  const cats = new Set(txs.map((t) => t.categoryId || ''));
  const curCat = cats.size === 1 ? [...cats][0] : '__mixed';
  const catOpts = (curCat === '__mixed' ? '<option value="__mixed" selected>(blandade – ändras inte)</option>' : '') +
    `<option value="" ${curCat === '' ? 'selected' : ''}>Okategoriserat</option>` +
    S.categories.map((c) => `<option value="${c.id}" ${curCat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  d.innerHTML = `<form method="dialog">
    <h2>${esc(displayName(txs[0]))}${txs.length > 1 ? ` <span class="muted" style="font-weight:400">· ${txs.length} transaktioner</span>` : ''}</h2>
    <label class="field"><span>Kategori${txs.length > 1 ? ' <span class="muted">– för alla ' + txs.length + '</span>' : ''}</span>
      <select id="edCat">${catOpts}</select></label>
    ${oneKey ? `<label class="field"><span>Namn på mottagaren <span class="muted">– gäller alla från ”${esc(txs[0].description)}”, även framtida importer</span></span>
      <input type="text" id="edAlias" value="${esc(S.aliases[oneKey] || '')}" placeholder="${esc(txs[0].description)}"></label>` : ''}
    ${txs.length > 1 ? `<div class="toolbar" style="margin:10px 0 0"><span class="muted">Markera alla:</span><select id="edAllMark">${markOpts('')}</select></div>` : ''}
    <div class="edlist">${txs.slice(0, 100).map((t) => `<div class="edrow" data-id="${esc(t.id)}">
      <div class="edhead"><span>${t.date} · ${esc(t.description)}${t.kind ? ' · <span class="muted">' + esc(t.kind) + '</span>' : ''}</span><b class="num ${t.amount < 0 ? '' : 'pos'}">${fmtKr2.format(t.amount)}</b></div>
      <div class="edfields"><select data-f="mark">${markOpts(t.mark || '')}</select>
        <input type="text" data-f="alias" value="${esc(t.alias || '')}" placeholder="Eget namn (bara denna)">
        <input type="text" data-f="note" value="${esc(t.note || '')}" placeholder="Anteckning…"></div></div>`).join('')}</div>
    ${txs.length > 100 ? `<p class="muted">Visar 100 av ${txs.length}.</p>` : ''}
    <div class="toolbar" style="justify-content:flex-end;margin:14px 0 0">
      <button class="btn primary" value="save">Spara</button><button type="button" class="btn" id="edCancel">Avbryt</button></div></form>`;

  const all = $opt<HTMLSelectElement>('#edAllMark', d);
  if (all) all.onchange = () => $$<HTMLSelectElement>('[data-f=mark]', d).forEach((s) => (s.value = all.value));
  $('#edCancel', d).onclick = () => d.close('cancel');
  const catSel = $<HTMLSelectElement>('#edCat', d);
  const startCat = catSel.value;
  d.onclose = () => {
    if (d.returnValue !== 'save') return;
    const newCat = catSel.value;
    if (newCat !== startCat && newCat !== '__mixed') assignCategory(txs.map((t) => t.id), keys, newCat || null);
    if (oneKey) {
      const v = $<HTMLInputElement>('#edAlias', d).value.trim();
      if (v) S.aliases[oneKey] = v; else delete S.aliases[oneKey];
    }
    for (const r of $$('.edrow', d)) {
      const t = S.transactions.find((x) => x.id === r.dataset.id);
      if (!t) continue;
      for (const f of FIELDS) {
        const v = $<HTMLInputElement | HTMLSelectElement>(`[data-f=${f}]`, r).value.trim();
        if (v) t[f] = v; else delete t[f];
      }
    }
    save();
    rerender();
    toast('Sparat');
  };
  d.returnValue = '';
  d.showModal();
}
