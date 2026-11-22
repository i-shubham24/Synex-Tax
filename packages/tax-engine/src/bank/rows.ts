import { headerRole, isHeaderLike, normalizeHeader, parseSignedAmount, parseStatementDate, type ColumnRole } from './layouts.js';

/**
 * Rebuild table rows from text with positions: the text items of a PDF page (pdf.js) or the word
 * boxes of an OCR pass (Tesseract). Columns come from where the heading words sit; a line whose
 * date column holds a date starts an entry, and text-only lines below or around it continue its
 * narration.
 *
 * Coordinates are page units with the origin at the top left; y grows down the page.
 */

export interface PositionedText {
  text: string;
  x: number;
  y: number; // top
  w: number;
  h: number;
  page: number;
  /** OCR confidence 0 to 100; absent for a PDF text layer. */
  conf?: number;
}

export interface RebuiltTable {
  /** Row 0 is the heading row (synthetic "Column n" names when no heading was found). */
  rows: string[][];
  /** Per row: page, and per cell the lowest OCR confidence of its words (null when not OCR). */
  meta: Array<{ page: number; conf: Array<number | null> }>;
  /** Text above the first heading, for recognising the bank (not for display: it holds the account number). */
  preamble: string;
  /** False when no heading row was found and the columns were laid out from the entries alone. */
  headerFound: boolean;
}

interface Word extends PositionedText {
  cx: number;
  cy: number;
}

interface Line {
  page: number;
  top: number;
  bottom: number;
  words: Word[];
}

interface Column {
  x0: number;
  x1: number;
  text: string;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Split items where they hold runs of spaces (columns typed into one string), spreading the item's
 * width over its characters. A single space does not split: a narration item stays in one cell.
 */
function toWords(items: PositionedText[]): Word[] {
  const out: Word[] = [];
  for (const it of items) {
    const text = it.text.replace(/\s+$/, '');
    if (!text.trim()) continue;
    const cw = text.length ? it.w / text.length : 0;
    const re = /\S+(?: \S+)*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const x = it.x + m.index * cw;
      const w = m[0].length * cw;
      out.push({ ...it, text: m[0], x, w, cx: x + w / 2, cy: it.y + it.h / 2 });
    }
  }
  return out;
}

/** Words grouped into lines by vertical position, page by page. */
function toLines(words: Word[]): Line[] {
  const lines: Line[] = [];
  const pages = [...new Set(words.map((w) => w.page))].sort((a, b) => a - b);
  for (const page of pages) {
    const ws = words.filter((w) => w.page === page).sort((a, b) => a.cy - b.cy || a.x - b.x);
    const tol = Math.max(1, median(ws.map((w) => w.h)) * 0.5);
    let cur: (Line & { cy: number }) | null = null;
    for (const w of ws) {
      if (cur && Math.abs(w.cy - cur.cy) <= tol) {
        cur.words.push(w);
        cur.cy = cur.words.reduce((s, x) => s + x.cy, 0) / cur.words.length;
        cur.top = Math.min(cur.top, w.y);
        cur.bottom = Math.max(cur.bottom, w.y + w.h);
      } else {
        cur = { page, top: w.y, bottom: w.y + w.h, cy: w.cy, words: [w] };
        lines.push(cur);
      }
    }
  }
  for (const l of lines) l.words.sort((a, b) => a.x - b.x);
  return lines;
}

const lineHeight = (l: Line) => median(l.words.map((w) => w.h)) || 1;

/**
 * Heading columns from one line: neighbouring words are joined when together they name a
 * heading ("Withdrawal Amt.", "Value Dt"), longest match first, and only across small gaps.
 */
function headerColumns(line: Line): Column[] {
  const ws = line.words;
  const h = lineHeight(line);
  const cols: Column[] = [];
  let i = 0;
  while (i < ws.length) {
    let took = 0;
    for (let span = Math.min(5, ws.length - i); span >= 1; span--) {
      const part = ws.slice(i, i + span);
      const tight = part.every((w, k) => k === 0 || w.x - (part[k - 1].x + part[k - 1].w) < h * 1.6);
      if (!tight) continue;
      if (headerRole(part.map((w) => w.text).join(' '))) {
        took = span;
        break;
      }
    }
    if (took) {
      const part = ws.slice(i, i + took);
      cols.push({ x0: part[0].x, x1: part[took - 1].x + part[took - 1].w, text: part.map((w) => w.text).join(' ') });
      i += took;
    } else {
      // An unknown heading word: joined to an unknown neighbour close by, else its own column.
      const w = ws[i];
      const last = cols[cols.length - 1];
      if (last && !headerRole(last.text) && w.x - last.x1 < h * 0.8) {
        last.text = `${last.text} ${w.text}`;
        last.x1 = w.x + w.w;
      } else cols.push({ x0: w.x, x1: w.x + w.w, text: w.text });
      i++;
    }
  }
  return cols;
}

/** A heading split over two lines: the second line's words join the column above them. */
function mergeHeaderLines(cols: Column[], next: Line): Column[] {
  const out = cols.map((c) => ({ ...c }));
  for (const w of next.words) {
    const cx = w.x + w.w / 2;
    const over = out.find((c) => cx >= c.x0 - 4 && cx <= c.x1 + 4) ?? out.find((c) => w.x < c.x1 && w.x + w.w > c.x0);
    if (over) {
      over.text = `${over.text} ${w.text}`;
      over.x0 = Math.min(over.x0, w.x);
      over.x1 = Math.max(over.x1, w.x + w.w);
    } else out.push({ x0: w.x, x1: w.x + w.w, text: w.text });
  }
  out.sort((a, b) => a.x0 - b.x0);
  // Words of a two-line heading that formed separate columns but now overlap are one column.
  const merged: Column[] = [];
  for (const c of out) {
    const last = merged[merged.length - 1];
    if (last && c.x0 < last.x1) {
      last.text = `${last.text} ${c.text}`;
      last.x1 = Math.max(last.x1, c.x1);
    } else merged.push(c);
  }
  return merged;
}

const roleCount = (cols: Column[]) => new Set(cols.map((c) => headerRole(c.text)).filter((x) => x && x !== 'ignore')).size;
const hasDateWord = (l: Line) => l.words.some((w) => parseStatementDate(w.text));
const hasMoneyWord = (l: Line) => l.words.some((w) => /\d[.,]\d/.test(w.text) && parseSignedAmount(w.text) !== null);

/** The heading at line i (one or two lines), or null. Returns the columns and how many lines it used. */
function headingAt(lines: Line[], i: number): { cols: Column[]; used: number } | null {
  const l = lines[i];
  if (hasMoneyWord(l)) return null;
  const one = headerColumns(l);
  let best: { cols: Column[]; used: number } | null = isHeaderLike(one.map((c) => c.text)) ? { cols: one, used: 1 } : null;
  const next = lines[i + 1];
  if (next && next.page === l.page && next.top - l.bottom < lineHeight(l) * 1.2 && !hasDateWord(next) && !hasMoneyWord(next)) {
    const two = mergeHeaderLines(one, next);
    if (isHeaderLike(two.map((c) => c.text)) && roleCount(two) > (best ? roleCount(best.cols) : 0)) best = { cols: two, used: 2 };
  }
  return best;
}

/** Column bands from the heading: each column reaches halfway into the gap on either side. */
function bands(cols: Column[]): Array<[number, number]> {
  return cols.map((c, k) => {
    const left = k === 0 ? -Infinity : (cols[k - 1].x1 + c.x0) / 2;
    const right = k === cols.length - 1 ? Infinity : (c.x1 + cols[k + 1].x0) / 2;
    return [left, right];
  });
}

/**
 * Right-aligned figures can stick out to the left of a short heading; where a heading names an
 * amount or balance column, pull the boundary with the column on its left towards that column's
 * heading so the figures land under the right heading.
 */
function widenMoneyBands(cols: Column[], b: Array<[number, number]>): Array<[number, number]> {
  const money: Array<ColumnRole | null> = ['debit', 'credit', 'amount', 'balance'];
  return b.map(([l, r], k) => {
    const role = headerRole(cols[k].text);
    if (k > 0 && money.includes(role) && !money.includes(headerRole(cols[k - 1].text))) {
      const prev = cols[k - 1];
      const prevRole = headerRole(prev.text);
      // Narration headings are left aligned and wide; do not steal from them.
      if (prevRole !== 'narration') l = Math.max(prev.x1 + 2, Math.min(l, prev.x1 + (cols[k].x0 - prev.x1) * 0.25));
    }
    return [l, r];
  });
}

/** Columns laid out from the entries alone (no heading): spans of words that line up across dated lines. */
function columnsFromBody(lines: Line[]): Column[] {
  const spans: Array<[number, number]> = [];
  for (const l of lines) {
    if (!hasDateWord(l)) continue;
    const h = lineHeight(l);
    let cur: [number, number] | null = null;
    for (const w of l.words) {
      if (cur && w.x - cur[1] < h * 1.2) cur[1] = w.x + w.w;
      else {
        if (cur) spans.push(cur);
        cur = [w.x, w.x + w.w];
      }
    }
    if (cur) spans.push(cur);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged.map(([x0, x1], k) => ({ x0, x1, text: `Column ${k + 1}` }));
}

function cellsOf(line: Line, b: Array<[number, number]>): { cells: string[]; conf: Array<number | null> } {
  const cells: string[][] = b.map(() => []);
  const conf: Array<number | null> = b.map(() => null);
  for (const w of line.words) {
    let k = b.findIndex(([l, r]) => w.cx >= l && w.cx < r);
    if (k < 0) k = w.cx < b[0][0] ? 0 : b.length - 1;
    cells[k].push(w.text);
    if (w.conf !== undefined) conf[k] = conf[k] === null ? w.conf : Math.min(conf[k]!, w.conf);
  }
  return { cells: cells.map((c) => c.join(' ')), conf };
}

const FOOTER = /page\s*\d+\s*(of\s*\d+)?|computer[\s-]*generated|does not require (a )?signature|end of statement|statement summary|^\s*\*{2,}/i;

type Entry = { line: Line; cells: string[]; conf: Array<number | null>; dated: boolean; money: boolean };

export function rebuildRows(items: PositionedText[]): RebuiltTable {
  const lines = toLines(toWords(items));
  const preambleLines: string[] = [];
  let cols: Column[] | null = null;
  let body: Entry[] = [];
  let b: Array<[number, number]> = [];
  let dateCol = 0;
  let moneyCols: number[] = [];
  // Text-only lines between the first heading and the first entry: the statement centres narrations on the date line.
  let centred = false;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const heading = headingAt(lines, i);
    if (heading) {
      // Repeated headings on later pages may sit a little differently; use each page's own.
      if (!cols || heading.cols.length === cols.length) {
        const prev = cols as Column[] | null;
        cols = prev ? heading.cols.map((c, k) => ({ ...c, text: prev[k].text })) : heading.cols;
        b = widenMoneyBands(cols, bands(cols));
        const roles = cols.map((c) => headerRole(c.text));
        const d = roles.indexOf('date') >= 0 ? roles.indexOf('date') : roles.indexOf('valueDate');
        dateCol = Math.max(0, d);
        moneyCols = roles.map((x, k) => (x === 'debit' || x === 'credit' || x === 'amount' || x === 'balance' ? k : -1)).filter((k) => k >= 0);
      }
      i += heading.used - 1;
      continue;
    }
    const text = l.words.map((w) => w.text).join(' ');
    if (!cols) {
      preambleLines.push(text);
      continue;
    }
    if (FOOTER.test(text)) continue;
    const { cells, conf } = cellsOf(l, b);
    const dated = !!parseStatementDate(cells[dateCol] ?? '');
    const money = moneyCols.some((k) => /\d/.test(cells[k] ?? ''));
    if (!dated && !money && !body.some((e) => e.dated)) centred = true;
    body.push({ line: l, cells, conf, dated, money });
  }

  const headerFound = !!cols;
  if (!cols) {
    // No heading: lay the columns out from the entries, then read the lines again.
    cols = columnsFromBody(lines);
    if (!cols.length) return { rows: [], meta: [], preamble: preambleLines.join('\n'), headerFound: false };
    b = bands(cols);
    preambleLines.length = 0;
    const read = lines.map((l) => ({ l, ...cellsOf(l, b) }));
    const hits = cols.map((_, k) => read.filter((x) => parseStatementDate(x.cells[k]) && x.cells[k].length <= 24).length);
    dateCol = hits.indexOf(Math.max(...hits));
    let started = false;
    for (const x of read) {
      const text = x.l.words.map((w) => w.text).join(' ');
      const dated = !!parseStatementDate(x.cells[dateCol] ?? '');
      if (!started && !dated) {
        preambleLines.push(text);
        continue;
      }
      started = true;
      if (FOOTER.test(text)) continue;
      body.push({ line: x.l, cells: x.cells, conf: x.conf, dated, money: x.cells.some((c, k) => k !== dateCol && /\d[.,]\d{2}\b/.test(c)) });
    }
  }

  // Each text-only line belongs to the entry above it by default; to the entry below when it sits
  // clearly closer to that one, or (centred narrations) when it is no farther from it.
  const anchor = (e: Entry) => e.dated || e.money;
  const owner: number[] = body.map((e, k) => (anchor(e) ? k : -1));
  for (let k = 0; k < body.length; k++) {
    if (anchor(body[k])) continue;
    const e = body[k];
    let up = k - 1;
    while (up >= 0 && !anchor(body[up])) up--;
    let down = k + 1;
    while (down < body.length && !anchor(body[down])) down++;
    const prev = k > 0 ? body[k - 1].line : null;
    const next = k + 1 < body.length ? body[k + 1].line : null;
    const gapUp = prev && prev.page === e.line.page ? e.line.top - prev.bottom : Infinity;
    const gapDown = next && next.page === e.line.page ? next.top - e.line.bottom : Infinity;
    const h = lineHeight(e.line);
    let pick: number;
    if (up < 0) pick = down < body.length ? down : -1;
    else if (down >= body.length) pick = up;
    else if (centred) pick = gapDown <= gapUp + h * 0.1 ? down : up;
    else pick = gapDown + h * 0.25 < gapUp ? down : up;
    if (Math.min(gapUp, gapDown) > h * 2.5) pick = -1; // a stray note far from any entry
    owner[k] = pick;
  }

  const width = cols.length;
  const rows: string[][] = [cols.map((c) => c.text)];
  const meta: RebuiltTable['meta'] = [{ page: body[0]?.line.page ?? 1, conf: Array(width).fill(null) }];
  for (let k = 0; k < body.length; k++) {
    if (owner[k] !== k) continue;
    const parts = body.filter((_, j) => owner[j] === k); // in page order: lines above the date line, the date line, lines below
    const cells: string[] = Array(width).fill('');
    const conf: Array<number | null> = Array(width).fill(null);
    for (const p of parts) {
      p.cells.forEach((c, j) => {
        if (!c) return;
        cells[j] = cells[j] ? `${cells[j]} ${c}` : c;
        const cf = p.conf[j];
        if (cf !== null) conf[j] = conf[j] === null ? cf : Math.min(conf[j]!, cf);
      });
    }
    // A date cell with text from a line above (a wrapped time or serial) still starts with the date.
    if (!parseStatementDate(cells[dateCol]) && body[k].cells[dateCol]) cells[dateCol] = body[k].cells[dateCol];
    rows.push(cells);
    meta.push({ page: body[k].line.page, conf });
  }
  return { rows, meta, preamble: preambleLines.join('\n'), headerFound };
}

/** Rows of cells for a heading: the normalised text, for matching a saved mapping. */
export const headingKey = (header: string[]) => header.map(normalizeHeader).join('|');
