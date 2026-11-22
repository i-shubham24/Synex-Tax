import { rebuildRows, type PositionedText, type RebuiltTable } from '@synextax/tax-engine';

/**
 * A bank statement PDF read in this browser tab. Pages with a text layer are read with pdf.js;
 * pages without one (scans) are drawn to a canvas and read with Tesseract, in a worker. Every
 * file comes from this app's /vendor folder; nothing is sent anywhere.
 */

const VENDOR = '/vendor';
/** Pages with fewer characters than this in their text layer are treated as scans. */
const SCAN_CHARS = 40;
/** Scans are drawn at 3x (216 dpi) for OCR, kept under a size browsers can draw. */
const OCR_SCALE = 3;
const MAX_CANVAS = 4200;

export class PdfPasswordError extends Error {
  constructor(public readonly wrong: boolean) {
    super(wrong ? 'That password did not open the file.' : 'This PDF is protected with a password.');
  }
}

export interface PdfReadResult {
  table: RebuiltTable;
  pages: number;
  ocrPages: number[];
  /** Mean OCR word confidence (0 to 100) over the scanned pages, or null. */
  ocrConfidence: number | null;
}

export type Progress = (message: string, fraction?: number) => void;

interface TextLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export async function readPdfStatement(buf: ArrayBuffer, opts: { password?: string; onProgress?: Progress; forceOcr?: boolean } = {}): Promise<PdfReadResult> {
  const progress = opts.onProgress ?? (() => {});
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `${VENDOR}/pdfjs/pdf.worker.min.mjs`;
  progress('Opening the PDF');
  let doc;
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf.slice(0)), // pdf.js takes ownership of what it is given
    password: opts.password,
    enableXfa: false,
    wasmUrl: `${VENDOR}/pdfjs/wasm/`,
    standardFontDataUrl: `${VENDOR}/pdfjs/standard_fonts/`,
    cMapUrl: `${VENDOR}/pdfjs/cmaps/`,
    cMapPacked: true,
  });
  try {
    doc = await task.promise;
  } catch (e) {
    void task.destroy();
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2);
    throw new Error('This PDF could not be opened. It may be damaged.');
  }

  const items: PositionedText[] = [];
  const scans: number[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      progress(`Reading page ${p} of ${doc.numPages}`, (p - 1) / doc.numPages);
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const found: PositionedText[] = [];
      let chars = 0;
      for (const raw of content.items) {
        if (!('str' in raw)) continue;
        const it = raw as TextLike;
        if (!it.str.trim()) continue;
        const tx = pdfjs.Util.transform(viewport.transform, it.transform);
        const h = Math.hypot(tx[2], tx[3]) || it.height || 8;
        const w = it.width * viewport.scale;
        found.push({ text: it.str, x: tx[4], y: tx[5] - h, w, h, page: p });
        chars += it.str.trim().length;
      }
      if (chars < SCAN_CHARS || opts.forceOcr) scans.push(p);
      else items.push(...found);
      page.cleanup();
    }

    let ocrConfidence: number | null = null;
    if (scans.length) {
      const confs: number[] = [];
      const ocr = await startOcr(progress);
      try {
        for (const [k, p] of scans.entries()) {
          progress(`Reading scanned page ${p} (${k + 1} of ${scans.length}); this takes a while`, k / scans.length);
          const page = await doc.getPage(p);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(OCR_SCALE, MAX_CANVAS / Math.max(base.width, base.height));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          await page.render({ canvas, viewport }).promise;
          const words = await ocr.read(canvas);
          for (const w of words) {
            items.push({ text: w.text, x: w.x0 / scale, y: w.y0 / scale, w: (w.x1 - w.x0) / scale, h: (w.y1 - w.y0) / scale, page: p, conf: w.conf });
            confs.push(w.conf);
          }
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
        }
      } finally {
        await ocr.stop();
      }
      ocrConfidence = confs.length ? Math.round(confs.reduce((s, x) => s + x, 0) / confs.length) : null;
    }
    progress('Laying out rows', 1);
    return { table: rebuildRows(items), pages: doc.numPages, ocrPages: scans, ocrConfidence };
  } finally {
    await task.destroy();
  }
}

interface OcrWord {
  text: string;
  conf: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

async function startOcr(progress: Progress) {
  const lang = await fetch(`${VENDOR}/tesseract/lang/eng.traineddata.gz`, { method: 'HEAD' }).catch(() => null);
  if (!lang || !lang.ok) throw new Error('Scanned statements need the English OCR data, which is not installed on this server yet. Ask your administrator, or use the bank\'s text PDF, Excel or CSV download.');
  progress('Starting text recognition');
  const { createWorker } = await import('tesseract.js');
  const origin = window.location.origin;
  const worker = await createWorker('eng', 1 /* LSTM only */, {
    workerPath: `${origin}${VENDOR}/tesseract/worker.min.js`,
    corePath: `${origin}${VENDOR}/tesseract/core`,
    langPath: `${origin}${VENDOR}/tesseract/lang`,
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'none',
  });
  await worker.setParameters({ tessedit_pageseg_mode: '11' as never, preserve_interword_spaces: '1', user_defined_dpi: String(72 * OCR_SCALE) });
  return {
    async read(canvas: HTMLCanvasElement): Promise<OcrWord[]> {
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
      const out: OcrWord[] = [];
      for (const b of data.blocks ?? []) for (const para of b.paragraphs) for (const line of para.lines) for (const w of line.words) {
        if (w.text.trim()) out.push({ text: w.text, conf: Math.round(w.confidence), ...w.bbox });
      }
      return out;
    },
    stop: () => worker.terminate(),
  };
}
