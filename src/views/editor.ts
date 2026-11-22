import { $, $$, $opt, toast } from '../dom';
import { esc, fmtKr2 } from '../format';
import { rerender } from '../nav';
import { txKey } from '../rules';
import { assignCategory, displayName, S, save } from '../state';
import type { Transaction } from '../types';
import { catOptions } from './common';

const catSelect = (sel: string, attrs: string, keepLabel?: string) =>
  `<select ${attrs}>${keepLabel ? `<option value="__keep" selected>${keepLabel}</option>` : ''}` +
  `<option value="" ${!keepLabel && !sel ? 'selected' : ''}>Okategoriserat</option>${catOptions(keepLabel ? undefined : sel)}</select>`;
const field = (label: string, input: string) => `<label class="mini"><span>${label}</span>${input}</label>`;

/**
 * Redigera transaktioner: varje transaktion har egen kategori, mottagare och anteckning.
 * Med flera transaktioner (ett grupperat kort) finns dessutom "Ändra alla" överst.
 */
export function openEditor(ids: string[]): void {
  const txs = ids.map((id) => S.transactions.find((t) => t.id === id)).filter((t): t is Transaction => !!t)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!txs.length) return;
  const many = txs.length > 1;
  const keys = [...new Set(txs.map(txKey))], oneKey = keys.length === 1 ? keys[0] : null;
  const d = $<HTMLDialogElement>('#editor');
  const t0 = txs[0];

  // En transaktion: mottagarnamnet gäller som standard alla från samma mottagare (även framtida importer)
  const recipientAll = !many && oneKey ? `<label class="check"><input type="checkbox" id="edAliasAll" ${t0.alias ? '' : 'checked'}>
      Gäller alla från ”${esc(t0.description)}”, även framtida</label>` : '';
  const learn = `<label class="check"><input type="checkbox" id="edLearn" ${S.ui.learn ? 'checked' : ''}>
      Kom ihåg kategorin för ${oneKey ? `”${esc(t0.description)}”` : 'dessa mottagare'} framöver</label>`;

  const row = (t: Transaction) => `<div class="edrow" data-id="${esc(t.id)}">
      <div class="edhead"><span>${t.date} · ${esc(t.description)}${t.kind ? ' · <span class="muted">' + esc(t.kind) + '</span>' : ''}</span><b class="num ${t.amount < 0 ? '' : 'pos'}">${fmtKr2.format(t.amount)}</b></div>
      <div class="edfields">
        ${field('Kategori', catSelect(t.categoryId || '', 'data-f="cat"'))}
        ${field('Mottagare', `<input type="text" data-f="alias" value="${esc(many ? t.alias || '' : t.alias || (oneKey && S.aliases[oneKey]) || '')}" placeholder="${esc(many ? displayName(t) : t.description)}">`)}
        ${field('Anteckning', `<input type="text" data-f="note" value="${esc(t.note || '')}" placeholder="Vad var det?">`)}
      </div>
      ${many ? '' : recipientAll + learn}</div>`;

  d.innerHTML = `<form method="dialog">
    <h2>${esc(displayName(t0))}${many ? ` <span class="muted" style="font-weight:400">· ${txs.length} transaktioner</span>` : ''}</h2>
    ${many ? `<div class="edall"><b>Ändra alla ${txs.length}</b>
      <div class="edfields">
        ${field('Kategori', catSelect('', 'id="edAllCat"', '– behåll –'))}
        ${oneKey ? field('Mottagare <span class="muted">(även framtida)</span>', `<input type="text" id="edAlias" value="${esc(S.aliases[oneKey] || '')}" placeholder="${esc(t0.description)}">`) : '<span></span>'}
      </div>${learn}</div>` : ''}
    <div class="edlist">${txs.slice(0, 100).map(row).join('')}</div>
    ${txs.length > 100 ? `<p class="muted">Visar 100 av ${txs.length}.</p>` : ''}
    <div class="toolbar" style="justify-content:flex-end;margin:14px 0 0">
      <button class="btn primary" value="save">Spara</button><button type="button" class="btn" id="edCancel">Avbryt</button></div></form>`;

  // "Ändra alla" fyller i raderna – de kan sedan justeras en och en
  const allCat = $opt<HTMLSelectElement>('#edAllCat', d);
  if (allCat) allCat.onchange = () => { if (allCat.value !== '__keep') $$<HTMLSelectElement>('[data-f=cat]', d).forEach((s) => (s.value = allCat.value)); };
  $('#edCancel', d).onclick = () => d.close('cancel');

  d.onclose = () => {
    if (d.returnValue !== 'save') return;
    const learnOn = $<HTMLInputElement>('#edLearn', d).checked;
    // Kategori för alla: lär sig mottagarna om "Kom ihåg" är ikryssat
    const groupCat = allCat && allCat.value !== '__keep' ? allCat.value : null;
    if (groupCat !== null) assignCategory(txs.map((t) => t.id), keys, groupCat || null, learnOn);
    if (many && oneKey) {
      const v = $<HTMLInputElement>('#edAlias', d).value.trim();
      if (v) S.aliases[oneKey] = v; else delete S.aliases[oneKey];
    }
    for (const r of $$('.edrow', d)) {
      const t = S.transactions.find((x) => x.id === r.dataset.id);
      if (!t) continue;
      const val = (f: string) => $<HTMLInputElement | HTMLSelectElement>(`[data-f=${f}]`, r).value.trim();
      // Kategori per rad: bara denna transaktion (en ensam transaktion kan lära sig, se ovan)
      const cat = val('cat');
      if (cat !== (t.categoryId || '') && cat !== groupCat) {
        if (many) { t.categoryId = cat || null; t.manual = true; }
        else assignCategory([t.id], keys, cat || null, learnOn);
      }
      const alias = val('alias');
      if (!many && oneKey && $<HTMLInputElement>('#edAliasAll', d).checked) {
        if (alias) S.aliases[oneKey] = alias; else delete S.aliases[oneKey];
        delete t.alias;
      } else if (alias) t.alias = alias; else delete t.alias;
      const note = val('note');
      if (note) t.note = note; else delete t.note;
    }
    save();
    rerender();
    toast('Sparat');
  };
  d.returnValue = '';
  d.showModal();
}
