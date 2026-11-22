import './style.css';
import { $, $$ } from './dom';
import { monthLabel } from './format';
import { importFiles } from './import';
import { go, setPeriod, setRenderer } from './nav';
import { allMonths, S, save } from './state';
import { session, startSession } from './sync';
import type { View } from './types';
import { renderBoard } from './views/board';
import { renderImport } from './views/import';
import { showCat, renderList } from './views/list';
import { renderLogin } from './views/login';
import { renderOverview } from './views/overview';
import { renderSettings } from './views/settings';

const main = $('#main');
const periodSel = $<HTMLSelectElement>('#period');

function renderPeriod(): void {
  const months = allMonths().reverse();
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  let h = '<option value="all">Alla</option>';
  for (const y of years) {
    h += `<optgroup label="${y}"><option value="Y:${y}">Hela ${y}</option>`;
    for (const m of months.filter((m) => m.startsWith(y))) h += `<option value="M:${m}">${monthLabel(m)}</option>`;
    h += '</optgroup>';
  }
  periodSel.innerHTML = h;
  periodSel.value = S.ui.period;
  if (periodSel.value !== S.ui.period) { S.ui.period = 'all'; periodSel.value = 'all'; }
}

const VIEWS: Record<View, (main: HTMLElement) => void> = {
  overview: renderOverview,
  board: renderBoard,
  list: renderList,
  settings: renderSettings,
  import: (m) => renderImport(m, false),
};

function render(): void {
  document.body.classList.toggle('loggedout', !session.user);
  if (!session.user) return renderLogin(main);
  if (!session.ready) { main.innerHTML = '<div class="empty">Hämtar din data…</div>'; return; }
  renderPeriod();
  for (const b of $$('#tabs button')) b.classList.toggle('active', b.dataset.view === S.ui.view);
  if (!S.transactions.length && S.ui.view !== 'settings') return renderImport(main, true);
  (VIEWS[S.ui.view] || renderOverview)(main);
}
setRenderer(render);

/* ---------- Sidhuvud ---------- */
for (const b of $$('#tabs button')) b.onclick = () => go(b.dataset.view as View);
periodSel.onchange = () => { S.ui.period = periodSel.value; save(); render(); };
const fileInput = $<HTMLInputElement>('#fileInput');
$('#importBtn').onclick = () => fileInput.click();
fileInput.onchange = () => { void importFiles([...(fileInput.files || [])]); fileInput.value = ''; };

/* ---------- Klick i vyerna (data-go, data-show-cat, data-period) ---------- */
main.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-go],[data-show-cat],[data-period]');
  if (!el) return;
  if (el.dataset.go) go(el.dataset.go as View);
  else if (el.dataset.showCat !== undefined) showCat(el.dataset.showCat || null);
  else if (el.dataset.period) setPeriod(el.dataset.period);
});

/* ---------- Släpp filer var som helst på sidan ---------- */
const globalDrop = $('#globaldrop');
let dragDepth = 0;
const isFileDrag = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (!isFileDrag(e)) return; dragDepth++; globalDrop.style.display = 'flex'; });
window.addEventListener('dragleave', (e) => {
  if (!isFileDrag(e)) return;
  if (--dragDepth <= 0) { dragDepth = 0; globalDrop.style.display = 'none'; }
});
window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth = 0;
  globalDrop.style.display = 'none';
  if (session.user && e.dataTransfer?.files.length) void importFiles([...e.dataTransfer.files]);
});

void startSession();
