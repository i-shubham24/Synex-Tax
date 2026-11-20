/**
 * PII redaction for anything that leaves SynexTax for an AI or analytics service.
 *
 * The rule is "zero raw PII to non-Indian analytics or AI endpoints": text is redacted here first,
 * the placeholders go out, and the map that restores them never leaves our servers.
 * Order matters: longer identifiers are matched before shorter ones they contain (a GSTIN holds a PAN).
 */

export type PiiKind = 'GSTIN' | 'PAN' | 'TAN' | 'AADHAAR' | 'IFSC' | 'ACCOUNT' | 'MOBILE' | 'EMAIL';

const PATTERNS: Array<[PiiKind, RegExp]> = [
  ['EMAIL', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
  ['GSTIN', /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi],
  ['IFSC', /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi],
  ['PAN', /\b[A-Z]{5}\d{4}[A-Z]\b/gi],
  ['TAN', /\b[A-Z]{4}\d{5}[A-Z]\b/gi],
  // 12 digits, optionally grouped 4-4-4, not starting with 0 or 1 (Aadhaar numbers never do).
  ['AADHAAR', /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g],
  // Indian mobiles, with or without +91 / 0.
  ['MOBILE', /(?:\+91[\s-]?|\b0)?\b[6-9]\d{4}[\s-]?\d{5}\b/g],
  // Bank account numbers: 9 to 18 digits standing alone.
  ['ACCOUNT', /\b\d{9,18}\b/g],
];

export interface Redaction {
  text: string;
  /** placeholder -> original; keep server side only */
  map: Record<string, string>;
  counts: Partial<Record<PiiKind, number>>;
}

export function redactPii(input: string): Redaction {
  const map: Record<string, string> = {};
  const seen = new Map<string, string>();
  const counts: Partial<Record<PiiKind, number>> = {};
  let text = input;
  for (const [kind, re] of PATTERNS) {
    text = text.replace(re, (match) => {
      const key = `${kind}:${match.toUpperCase().replace(/[\s-]/g, '')}`;
      let ph = seen.get(key);
      if (!ph) {
        counts[kind] = (counts[kind] ?? 0) + 1;
        ph = `[${kind}_${counts[kind]}]`;
        seen.set(key, ph);
        map[ph] = match;
      }
      return ph;
    });
  }
  return { text, map, counts };
}

/** Puts the original values back into a reply that used the placeholders. */
export function restorePii(text: string, map: Record<string, string>): string {
  return text.replace(/\[(GSTIN|PAN|TAN|AADHAAR|IFSC|ACCOUNT|MOBILE|EMAIL)_\d+\]/g, (ph) => map[ph] ?? ph);
}

/** True when no recognisable identifier is left; call before any outbound request. */
export function isRedacted(text: string): boolean {
  return PATTERNS.every(([, re]) => {
    re.lastIndex = 0;
    const found = re.test(text);
    re.lastIndex = 0;
    return !found;
  });
}
