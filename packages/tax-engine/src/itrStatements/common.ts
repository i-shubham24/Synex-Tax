import type { PositionedText } from '../bank/rows.js';

/**
 * Pieces shared by the statement readers for income tax returns (Form 16, Form 26AS, capital gains
 * reports). Files are read in the browser; nothing here keeps or sends them.
 */

export interface StatementIssue {
  /** What the issue is about: a field name, a part of the statement, or a row number. */
  field: string;
  message: string;
}

export const PAN_RE = /\b([A-Z]{5}\d{4}[A-Z])\b/;
export const TAN_RE = /\b([A-Z]{4}\d{5}[A-Z])\b/;

/** PAN shown with the first five letters hidden, as elsewhere in the app. */
export const maskPanValue = (pan: string) => (/^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? `XXXXX${pan.slice(5)}` : pan ? 'XXXXXXXXXX' : '');

/**
 * Lines of text from positioned text (pdf.js text items), top to bottom per page. Items whose
 * vertical centres sit within half a line height of each other are one line; within a line, items
 * are joined left to right, with a wide gap kept as two spaces so label and figure stay apart.
 */
export function textLines(items: PositionedText[]): string[] {
  const out: string[] = [];
  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  for (const page of pages) {
    const its = items.filter((i) => i.page === page && i.text.trim()).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
    const lines: { cy: number; h: number; items: PositionedText[] }[] = [];
    for (const it of its) {
      const cy = it.y + it.h / 2;
      const last = lines[lines.length - 1];
      if (last && Math.abs(cy - last.cy) <= Math.max(2, Math.min(it.h, last.h) / 2)) last.items.push(it);
      else lines.push({ cy, h: it.h, items: [it] });
    }
    for (const l of lines) {
      const sorted = l.items.sort((a, b) => a.x - b.x);
      let s = '';
      let end = -Infinity;
      for (const it of sorted) {
        const gap = it.x - end;
        if (s) s += gap > Math.max(4, it.h * 0.8) ? '  ' : gap > 0.5 ? ' ' : '';
        s += it.text.trim();
        end = it.x + it.w;
      }
      out.push(s);
    }
  }
  return out;
}

/** An amount printed as 1,23,456.00 or 123456 or (1,234.00) for a loss; null when not a number. */
export function parseAmount(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let t = String(raw).replace(/₹|\bRs\.?|\bINR\b/gi, '').replace(/\s+/g, '').trim();
  if (!t || /^-+$/.test(t)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith('-')) {
    neg = !neg;
    t = t.slice(1);
  }
  if (!/^\d{1,3}(,\d{2,3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t.replace(/,/g, ''));
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

const MON: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const validIso = (y: string, m: string, d: string) => {
  const year = y.length === 2 ? `20${y}` : y;
  const iso = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
};

/** A date as 31-Mar-2025, 31/03/2025, 31.03.2025, 2025-03-31 or an Excel day number; ISO or null. */
export function parseDate(raw: string | undefined | null): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const serial = Math.floor(Number(t));
    return serial > 20000 && serial < 80000 ? new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10) : null;
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return validIso(m[1], m[2], m[3]);
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})\b/.exec(t);
  if (m) return validIso(m[3], m[2], m[1]);
  m = /^(\d{1,2})[\s\-/]*([A-Za-z]{3})[A-Za-z]*[\s\-/,']+(\d{4}|\d{2})\b/.exec(t);
  if (m && MON[m[2].toUpperCase()]) return validIso(m[3], MON[m[2].toUpperCase()], m[1]);
  m = /^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})\b/.exec(t);
  if (m && MON[m[1].toUpperCase()]) return validIso(m[3], MON[m[1].toUpperCase()], m[2]);
  return null;
}

/** Heading text reduced for matching: lower case, currency marks and punctuation dropped. */
export const normLabel = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/₹|\(rs\.?\)|\brs\b\.?|\binr\b/g, ' ')
    .replace(/[^a-z0-9/%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const round2 = (v: number) => Math.round(v * 100) / 100;
