import { $ } from './dom';

const REPO = 'https://github.com/jackepp/money-dash';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Visar "Version abc1234 · 22 nov. 23:20" i sidfoten, med länk till commiten på GitHub. */
function renderVersion(newer?: string): void {
  const el = $('#version');
  const dev = import.meta.env.DEV ? ' (lokal utveckling)' : '';
  el.innerHTML = `Version <a href="${REPO}/commit/${__APP_VERSION__}" target="_blank" rel="noopener">${__APP_VERSION__}</a>` +
    ` · byggd ${fmtTime(__BUILD_TIME__)}${dev}` +
    (newer ? ` · <button class="btn primary" id="reloadBtn">Ny version ${newer} – ladda om</button>` : '');
  // Ny adress (?v=…) så att webbläsaren inte visar sin sparade kopia av sidan (GitHub Pages cachar i 10 min)
  if (newer) $('#reloadBtn').onclick = () => location.replace(`${location.pathname}?v=${newer}`);
}

/** Hämtar version.json från servern och visar en knapp om en nyare version är publicerad. */
async function checkForUpdate(): Promise<void> {
  if (import.meta.env.DEV) return;
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = (await res.json()) as { version?: string };
    if (version && version !== __APP_VERSION__) renderVersion(version);
  } catch {
    /* offline – försök igen nästa gång */
  }
}

export function initVersion(): void {
  renderVersion();
  void checkForUpdate();
  // Kolla igen när appen öppnas på nytt (t.ex. från hemskärmen på iPhone)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
}
