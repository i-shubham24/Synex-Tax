import { itrStatementTextLines, type PositionedText } from '@synextax/tax-engine';
import { PdfPasswordError } from '@/components/bank/readPdf';

/**
 * The text layer of a PDF read in this browser tab with pdf.js (the same files as the bank
 * statement reader, from this app's /vendor folder), as lines top to bottom. Used for Form 16,
 * which TRACES issues with a text layer. Scanned pages have no text and are reported, not read.
 */

const VENDOR = '/vendor';

export { PdfPasswordError };

export interface PdfTextResult {
  lines: string[];
  pages: number;
  /** Pages with almost no text: likely scans or images. */
  emptyPages: number[];
}

interface TextLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export async function readPdfText(buf: ArrayBuffer, password?: string): Promise<PdfTextResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `${VENDOR}/pdfjs/pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf.slice(0)),
    password,
    enableXfa: false,
    wasmUrl: `${VENDOR}/pdfjs/wasm/`,
    standardFontDataUrl: `${VENDOR}/pdfjs/standard_fonts/`,
    cMapUrl: `${VENDOR}/pdfjs/cmaps/`,
    cMapPacked: true,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    void task.destroy();
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2);
    throw new Error('This PDF could not be opened. It may be damaged.');
  }
  try {
    const items: PositionedText[] = [];
    const emptyPages: number[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      let chars = 0;
      for (const raw of content.items) {
        if (!('str' in raw)) continue;
        const it = raw as TextLike;
        if (!it.str.trim()) continue;
        const tx = pdfjs.Util.transform(viewport.transform, it.transform);
        const h = Math.hypot(tx[2], tx[3]) || it.height || 8;
        items.push({ text: it.str, x: tx[4], y: tx[5] - h, w: it.width * viewport.scale, h, page: p });
        chars += it.str.trim().length;
      }
      if (chars < 40) emptyPages.push(p);
      page.cleanup();
    }
    return { lines: itrStatementTextLines(items), pages: doc.numPages, emptyPages };
  } finally {
    await task.destroy();
  }
}
