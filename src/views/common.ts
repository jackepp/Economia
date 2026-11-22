import { esc } from '../format';
import { isSub, orderedCats } from '../state';

/** <option>-lista med kategorier – underkategorier indragna under sin huvudkategori. */
export function catOptions(sel?: string | null): string {
  return orderedCats()
    .map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${isSub(c) ? '   ↳ ' : ''}${esc(c.name)}</option>`)
    .join('');
}
