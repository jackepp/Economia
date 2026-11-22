import { S, save } from './state';
import type { View } from './types';

// render() registreras av main.ts – så kan alla moduler rita om utan cirkulära importer
let renderFn: () => void = () => {};
export const setRenderer = (fn: () => void): void => { renderFn = fn; };
export const rerender = (): void => renderFn();

export function go(v: View): void {
  S.ui.view = v;
  save();
  rerender();
  window.scrollTo(0, 0);
}

/** Klick på vald månad igen = tillbaka till "Alla". */
export function setPeriod(p: string): void {
  S.ui.period = S.ui.period === p ? 'all' : p;
  save();
  rerender();
}
