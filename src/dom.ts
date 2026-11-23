/** querySelector som kastar om elementet saknas – fångar stavfel direkt. */
export function $<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Hittar inte ${sel}`);
  return el;
}
export const $opt = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T[] => [
  ...root.querySelectorAll<T>(sel),
];

let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Kort meddelande längst ner; med action visas en knapp (t.ex. "Ångra") och meddelandet stannar längre. */
export function toast(msg: string, action?: { label: string; run: () => void }): void {
  const el = $('#toast');
  el.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toastbtn';
    b.textContent = action.label;
    b.onclick = () => { el.style.display = 'none'; clearTimeout(toastTimer); action.run(); };
    el.append(' ', b);
  }
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.display = 'none'), action ? 8000 : 4500);
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
