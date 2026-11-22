import type { ParseResult, PdfItem, PdfPage } from '../types';
import { isRevolutText, parseRevolutPdf } from './revolut';
import { parseSwedbankPdf } from './swedbank';

/** Den del av pdf.js vi använder – gör att testerna kan skicka in Node-versionen. */
export interface PdfLib {
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
    }>;
  };
}

/** Sidor → rader (uppifrån och ned) → textbitar {x, s} (vänster till höger). */
export async function pdfPages(lib: PdfLib, buf: ArrayBuffer | Uint8Array): Promise<PdfPage[]> {
  const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: PdfPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const rows: { y: number; its: PdfItem[] }[] = [];
    for (const it of tc.items as { str?: string; transform?: number[] }[]) {
      const s = (it.str || '').trim();
      if (!s || !it.transform) continue;
      const y = it.transform[5];
      let r = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!r) { r = { y, its: [] }; rows.push(r); }
      r.its.push({ x: it.transform[4], s });
    }
    pages.push(rows.sort((a, b) => b.y - a.y).map((r) => r.its.sort((a, b) => a.x - b.x)));
  }
  return pages;
}

/** Väljer läsare utifrån innehållet i PDF:en. */
export function parsePdfPages(pages: PdfPage[]): ParseResult {
  const text = pages.flat().map((its) => its.map((i) => i.s).join(' ')).join('\n');
  return isRevolutText(text) ? parseRevolutPdf(pages) : parseSwedbankPdf(pages);
}

let libPromise: Promise<PdfLib> | null = null;
/** pdf.js laddas först när en PDF importeras (håller startsidan liten). */
function browserPdfLib(): Promise<PdfLib> {
  libPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.js?url')]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib as unknown as PdfLib;
    },
  );
  return libPromise;
}

export async function parsePdf(buf: ArrayBuffer): Promise<ParseResult> {
  return parsePdfPages(await pdfPages(await browserPdfLib(), buf));
}
