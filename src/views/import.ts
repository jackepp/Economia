import { $ } from '../dom';
import { importPasted } from '../import';

export function renderImport(main: HTMLElement, empty: boolean): void {
  main.innerHTML = `<div class="card" style="max-width:760px;margin:0 auto">
    ${empty ? '<h2>Välkommen! Börja med att importera ett kontoutdrag.</h2>' : '<h2>Importera kontoutdrag</h2>'}
    <div id="dropzone"><div style="font-size:16px;font-weight:600">Dra och släpp PDF- eller CSV-filer här</div><div class="muted">eller klicka för att välja. Flera filer går bra – dubbletter hoppas över.</div></div>
    <h3 style="font-size:14px;margin-top:20px">Så exporterar du</h3>
    <p><b>Swedbank:</b> Internetbanken → konto → <i>Transaktionsrapport</i> → välj period → spara som <b>PDF</b> och dra in filen här. CSV-export fungerar också.</p>
    <details><summary class="muted" style="cursor:pointer">…eller klistra in text från Swedbank-rapporten</summary>
      <textarea id="paste" rows="8" placeholder="260115 260115 260115 ICA SUPERMARKET Kortköp/uttag -123,45 1 000,00"></textarea>
      <button class="btn primary" id="pasteBtn" style="margin-top:6px">Importera inklistrad text</button></details>
    <p><b>Revolut:</b> Appen → konto → <i>…</i> → <i>Kontoutdrag</i> → välj <b>PDF</b> (eller Excel/CSV) och period. Kortets sista siffror sparas, så du ser vem som betalade på ett gemensamt konto. Bara genomförda transaktioner tas med; avgifter dras från beloppet och påfyllningar/valutaväxlingar blir “Överföringar”.</p>
    <p class="muted">Filerna läses i din webbläsare. Bara transaktionerna (datum, text, belopp) sparas i din databas – inte själva filen eller kontonummer.</p></div>`;
  $('#dropzone', main).onclick = () => $('#fileInput').click();
  $('#pasteBtn', main).onclick = () => importPasted($<HTMLTextAreaElement>('#paste', main).value);
}
