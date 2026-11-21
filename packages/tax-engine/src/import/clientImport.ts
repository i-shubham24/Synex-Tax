import Decimal from 'decimal.js';
import { GSTN_STATE_CODES, validateGstin } from '../validators/gstin.js';

/**
 * Client master import ("switch in 10 minutes"): parse a CSV or a paste from Excel, find the real
 * header row, map columns, clean values and validate every row before anything is written.
 * Pure functions: the browser runs them for the preview grid and the API runs them again on commit.
 */

export type ImportField =
  | 'legalName'
  | 'tradeName'
  | 'groupName'
  | 'pan'
  | 'gstins'
  | 'tan'
  | 'constitution'
  | 'contactName'
  | 'mobile'
  | 'email'
  | 'filingCategory';

export type ImportConstitution =
  | 'PROPRIETORSHIP'
  | 'PARTNERSHIP'
  | 'LLP'
  | 'PRIVATE_LIMITED'
  | 'PUBLIC_LIMITED'
  | 'ONE_PERSON_COMPANY'
  | 'HUF'
  | 'TRUST'
  | 'SOCIETY'
  | 'AOP'
  | 'BOI'
  | 'LOCAL_AUTHORITY'
  | 'GOVERNMENT';

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  legalName: 'Legal name',
  tradeName: 'Trade name',
  groupName: 'Client group',
  pan: 'PAN',
  gstins: 'GSTIN',
  tan: 'TAN',
  constitution: 'Constitution',
  contactName: 'Contact person',
  mobile: 'Mobile',
  email: 'Email',
  filingCategory: 'Filing frequency',
};

// Normalised header text (lowercase, letters and digits only) to field.
const SYNONYMS: Record<ImportField, string[]> = {
  legalName: ['legalname', 'name', 'clientname', 'partyname', 'businessname', 'nameofbusiness', 'nameofthebusiness', 'legalnameofbusiness', 'companyname', 'entityname', 'assesseename', 'taxpayername', 'firmname', 'nameoftheassessee'],
  tradeName: ['tradename', 'tradenameifany', 'brandname', 'shopname'],
  groupName: ['group', 'groupname', 'clientgroup', 'family', 'familygroup', 'sisterconcern'],
  pan: ['pan', 'panno', 'pannumber', 'pancard', 'pancardno', 'incometaxpan'],
  gstins: ['gstin', 'gstno', 'gstnumber', 'gstinuin', 'gstinno', 'gstregno', 'gstregistrationno', 'gstregistrationnumber', 'gst', 'gstins'],
  tan: ['tan', 'tanno', 'tannumber'],
  constitution: ['constitution', 'constitutionofbusiness', 'typeofentity', 'entitytype', 'businesstype', 'typeofbusiness'],
  contactName: ['contactperson', 'contactname', 'authorisedsignatory', 'authorizedsignatory', 'signatory', 'proprietorname', 'ownername', 'director', 'partnername'],
  mobile: ['mobile', 'mobileno', 'mobilenumber', 'phone', 'phoneno', 'contactno', 'contactnumber', 'whatsapp', 'whatsappno', 'cell', 'cellno'],
  email: ['email', 'emailid', 'emailaddress', 'mail', 'mailid'],
  filingCategory: ['returnfrequency', 'filingfrequency', 'filingtype', 'frequency', 'qrmp', 'returntype', 'gstreturntype'],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

export function matchHeader(header: string): ImportField | null {
  const n = normHeader(header);
  if (!n) return null;
  for (const [field, words] of Object.entries(SYNONYMS) as Array<[ImportField, string[]]>) {
    if (words.includes(n)) return field;
  }
  return null;
}

/**
 * RFC 4180 parser for CSV and tab-separated text (a paste from Excel is tab-separated).
 * The delimiter is whichever of tab, comma or semicolon appears most on the first non-empty line.
 */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  // Exports often start with a title line; judge the delimiter on the busiest of the first lines.
  const sample = src.split('\n').filter((l) => l.trim()).slice(0, 15);
  const most = (re: RegExp) => Math.max(0, ...sample.map((l) => (l.match(re) ?? []).length));
  const counts: Array<[string, number]> = [
    ['\t', most(/\t/g)],
    [',', most(/,/g)],
    [';', most(/;/g)],
  ];
  const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** The header is the row (within the first rows) that names the most known columns; title rows sit above it. */
export function detectHeaderRow(rows: string[][], scan = 15): number {
  let best = -1;
  let bestScore = 1; // need at least two recognised columns
  rows.slice(0, scan).forEach((r, i) => {
    const score = new Set(r.map(matchHeader).filter(Boolean)).size;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

export type ColumnMap = Array<ImportField | null>;

export function mapColumns(header: string[]): ColumnMap {
  const seen = new Set<ImportField>();
  return header.map((h) => {
    const f = matchHeader(h);
    if (!f || (seen.has(f) && f !== 'gstins')) return null;
    seen.add(f);
    return f;
  });
}

// ---------------------------------------------------------------------------- cleaning

/** "₹ 1,25,000.50", "(1,000)", "1.5 Cr", "12 lakh" -> exact decimal string; null if not a number. */
export function parseIndianAmount(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/₹|rs\.?|inr/g, '').trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  let scale = new Decimal(1);
  const unit = s.match(/(crores?|cr|lakhs?|lacs?|l)\.?$/);
  if (unit) {
    scale = unit[1].startsWith('c') ? new Decimal(1e7) : new Decimal(1e5);
    s = s.slice(0, unit.index).trim();
  }
  s = s.replace(/,/g, '').replace(/\s/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = new Decimal(s).mul(scale).toDecimalPlaces(2);
  return (negative ? v.neg() : v).toFixed(2);
}

/** Indian mobile to +91XXXXXXXXXX, or null if it is not a valid mobile number. */
export function normalizeMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

export function maskPan(pan: string): string {
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? `XXXXX${pan.slice(5)}` : pan;
}

const CONSTITUTION_WORDS: Array<[RegExp, ImportConstitution]> = [
  [/\b(opc|one person company)\b/, 'ONE_PERSON_COMPANY'],
  [/\b(pvt|private)\b/, 'PRIVATE_LIMITED'],
  [/\bllp\b|limited liability partnership/, 'LLP'],
  [/\b(public limited|public ltd)\b/, 'PUBLIC_LIMITED'],
  [/\bhuf\b|hindu undivided/, 'HUF'],
  [/partnership|\bfirm\b/, 'PARTNERSHIP'],
  [/proprietor|individual|\bsole\b/, 'PROPRIETORSHIP'],
  [/\btrust\b/, 'TRUST'],
  [/society/, 'SOCIETY'],
  [/\baop\b|association of persons/, 'AOP'],
  [/\bboi\b|body of individuals/, 'BOI'],
  [/local authority/, 'LOCAL_AUTHORITY'],
  [/government|\bgovt\b/, 'GOVERNMENT'],
  [/\b(limited|ltd)\b/, 'PUBLIC_LIMITED'],
];

export function parseConstitution(raw: string): ImportConstitution | null {
  const s = raw.toLowerCase().replace(/\./g, ' ');
  for (const [re, c] of CONSTITUTION_WORDS) if (re.test(s)) return c;
  return null;
}

/** PAN holder type (4th character) and the constitutions it allows. */
const PAN_TYPE: Record<string, { label: string; allows: ImportConstitution[]; assume: ImportConstitution }> = {
  C: { label: 'a company', allows: ['PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'ONE_PERSON_COMPANY'], assume: 'PRIVATE_LIMITED' },
  P: { label: 'an individual', allows: ['PROPRIETORSHIP'], assume: 'PROPRIETORSHIP' },
  H: { label: 'a HUF', allows: ['HUF'], assume: 'HUF' },
  F: { label: 'a firm or LLP', allows: ['PARTNERSHIP', 'LLP'], assume: 'PARTNERSHIP' },
  A: { label: 'an AOP', allows: ['AOP', 'SOCIETY'], assume: 'AOP' },
  T: { label: 'a trust', allows: ['TRUST'], assume: 'TRUST' },
  B: { label: 'a BOI', allows: ['BOI'], assume: 'BOI' },
  L: { label: 'a local authority', allows: ['LOCAL_AUTHORITY'], assume: 'LOCAL_AUTHORITY' },
  G: { label: 'a government body', allows: ['GOVERNMENT'], assume: 'GOVERNMENT' },
};

// ---------------------------------------------------------------------------- validation

export type RowStatus = 'GREEN' | 'AMBER' | 'RED';

export interface RowIssue {
  field: ImportField | 'row';
  level: 'error' | 'cleaned';
  message: string;
}

export interface ImportRecord {
  legalName: string;
  tradeName: string;
  groupName: string;
  pan: string;
  gstins: Array<{ gstin: string; stateCode: string; stateName: string }>;
  tan: string;
  constitution: ImportConstitution | null;
  contactName: string;
  mobile: string;
  email: string;
  filingCategory: 'REGULAR_MONTHLY' | 'QRMP' | '';
}

export interface ValidatedRow {
  index: number; // 0-based data row
  sourceLine: number; // 1-based line in the file
  status: RowStatus;
  record: ImportRecord;
  issues: RowIssue[];
  /** PAN already in the workspace: this row adds to that client instead of creating one. */
  mergesIntoExisting: boolean;
}

export interface ValidateOptions {
  existingGstins?: Iterable<string>;
  existingPans?: Iterable<string>;
}

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const TAN_RE = /^[A-Z]{4}\d{5}[A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function tidy(v: string): string {
  return v.replace(/\s+/g, ' ').trim();
}

/** Raw cell values per field for one row (GSTIN cells may hold several separated by , ; / or spaces). */
export type RawRow = Partial<Record<ImportField, string>>;

export function rowsFromTable(rows: string[][], headerIndex: number, map: ColumnMap): Array<{ raw: RawRow; sourceLine: number }> {
  return rows.slice(headerIndex + 1).map((cells, i) => {
    const raw: RawRow = {};
    map.forEach((field, c) => {
      if (!field) return;
      const v = cells[c] ?? '';
      raw[field] = field === 'gstins' && raw.gstins ? `${raw.gstins} ${v}` : v;
    });
    return { raw, sourceLine: headerIndex + 2 + i };
  });
}

export function validateImportRows(input: Array<{ raw: RawRow; sourceLine: number }>, options: ValidateOptions = {}): ValidatedRow[] {
  const existingGstins = new Set([...(options.existingGstins ?? [])].map((g) => g.toUpperCase()));
  const existingPans = new Set([...(options.existingPans ?? [])].map((p) => p.toUpperCase()));
  const gstinSeenAt = new Map<string, number>();
  const panSeen = new Map<string, { line: number; name: string }>();

  return input.map(({ raw, sourceLine }, index) => {
    const issues: RowIssue[] = [];
    const cleaned = (field: ImportField | 'row', message: string) => issues.push({ field, level: 'cleaned', message });
    const error = (field: ImportField | 'row', message: string) => issues.push({ field, level: 'error', message });

    const text = (f: ImportField) => {
      const original = raw[f] ?? '';
      const t = tidy(original);
      if (t !== original && original.trim() !== '' && t !== original.trim()) cleaned(f, 'Extra spaces removed');
      return t;
    };

    const legalName = text('legalName');
    const tradeName = text('tradeName');
    const groupName = text('groupName');
    const contactName = text('contactName');

    // GSTINs
    const gstinTokens = (raw.gstins ?? '')
      .toUpperCase()
      .split(/[\s,;/|]+/)
      .map((t) => t.replace(/[^0-9A-Z]/g, ''))
      .filter(Boolean);
    if ((raw.gstins ?? '').trim() && (raw.gstins ?? '').trim() !== (raw.gstins ?? '').trim().toUpperCase()) cleaned('gstins', 'GSTIN changed to capitals');
    const gstins: ImportRecord['gstins'] = [];
    for (const g of gstinTokens) {
      const v = validateGstin(g);
      if (!v.isValid) {
        error('gstins', `${g}: ${v.error?.includes('checksum') ? 'check digit is wrong, a character is probably mistyped' : v.error ?? 'not a valid GSTIN'}`);
        continue;
      }
      if (existingGstins.has(g)) {
        error('gstins', `${g} is already in Client Master`);
        continue;
      }
      const earlier = gstinSeenAt.get(g);
      if (earlier !== undefined) {
        error('gstins', `${g} also appears on line ${earlier}`);
        continue;
      }
      gstinSeenAt.set(g, sourceLine);
      gstins.push({ gstin: g, stateCode: g.slice(0, 2), stateName: GSTN_STATE_CODES[g.slice(0, 2)] ?? '' });
    }

    // PAN: given, or taken from the GSTIN
    let pan = (raw.pan ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (raw.pan && raw.pan.trim() !== pan) cleaned('pan', 'PAN tidied to capitals');
    const embedded = gstins[0]?.gstin.slice(2, 12);
    if (!pan && embedded) {
      pan = embedded;
      cleaned('pan', 'PAN taken from the GSTIN');
    }
    if (!pan) error('pan', 'PAN or GSTIN is needed');
    else if (!PAN_RE.test(pan)) error('pan', 'PAN should be 5 letters, 4 digits, 1 letter');
    else {
      for (const g of gstins) {
        if (g.gstin.slice(2, 12) !== pan) error('gstins', `${g.gstin} belongs to PAN ${g.gstin.slice(2, 12)}, not ${pan}`);
      }
    }

    if (!legalName) error('legalName', 'Legal name is needed');

    // Constitution: stated, checked against the PAN type, or assumed from it
    let constitution: ImportConstitution | null = null;
    const panType = PAN_RE.test(pan) ? PAN_TYPE[pan[3]] : undefined;
    if ((raw.constitution ?? '').trim()) {
      constitution = parseConstitution(raw.constitution!);
      if (!constitution) error('constitution', `"${tidy(raw.constitution!)}" is not a constitution we recognise`);
      else if (panType && !panType.allows.includes(constitution)) {
        error('constitution', `PAN ${maskPan(pan)} belongs to ${panType.label}, which does not match "${tidy(raw.constitution!)}"`);
      }
    } else if (panType) {
      constitution = panType.assume;
      cleaned('constitution', `Taken from the PAN as ${panType.label}; confirm if it differs`);
    }

    // TAN
    let tan = (raw.tan ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (raw.tan && raw.tan.trim() !== tan) cleaned('tan', 'TAN tidied to capitals');
    if (tan && !TAN_RE.test(tan)) error('tan', 'TAN should be 4 letters, 5 digits, 1 letter');

    // Contact
    let mobile = '';
    if ((raw.mobile ?? '').trim()) {
      const m = normalizeMobile(raw.mobile!);
      if (!m) error('mobile', 'Mobile should be a 10 digit Indian number');
      else {
        mobile = m;
        if (m !== raw.mobile!.trim()) cleaned('mobile', 'Mobile written as +91');
      }
    }
    let email = (raw.email ?? '').trim();
    if (email) {
      const lower = email.toLowerCase();
      if (!EMAIL_RE.test(lower)) error('email', 'Email looks incomplete');
      else if (lower !== email) cleaned('email', 'Email changed to lowercase');
      email = lower;
    }

    // Filing frequency
    let filingCategory: ImportRecord['filingCategory'] = '';
    const fc = (raw.filingCategory ?? '').toLowerCase();
    if (fc) {
      if (/qrmp|quarter/.test(fc)) filingCategory = 'QRMP';
      else if (/month|regular/.test(fc)) filingCategory = 'REGULAR_MONTHLY';
      else error('filingCategory', 'Use Monthly or QRMP');
    }

    // Same PAN on several rows is one client with several GSTINs, unless the names disagree.
    let mergesIntoExisting = false;
    if (PAN_RE.test(pan)) {
      const prev = panSeen.get(pan);
      if (prev && prev.name && legalName && prev.name.toLowerCase() !== legalName.toLowerCase()) {
        error('legalName', `Same PAN as line ${prev.line} ("${prev.name}") but a different name`);
      } else if (prev) {
        cleaned('row', `Joined with line ${prev.line} as one client`);
      } else panSeen.set(pan, { line: sourceLine, name: legalName });
      if (existingPans.has(pan)) {
        mergesIntoExisting = true;
        cleaned('row', 'Client already exists: its new GSTINs and TAN are added to it');
      }
    }

    const status: RowStatus = issues.some((i) => i.level === 'error') ? 'RED' : issues.length ? 'AMBER' : 'GREEN';
    return {
      index,
      sourceLine,
      status,
      issues,
      mergesIntoExisting,
      record: { legalName, tradeName, groupName, pan, gstins, tan, constitution, contactName, mobile, email, filingCategory },
    };
  });
}

// ---------------------------------------------------------------------------- bulk GSTIN paste

export interface GstinPasteResult {
  gstin: string;
  valid: boolean;
  error?: string;
  pan?: string;
  stateCode?: string;
  stateName?: string;
  constitutionHint?: ImportConstitution;
  duplicate?: boolean;
}

/** Up to `limit` GSTINs from any pasted text; each checked, with PAN, state and holder type derived. */
export function parseGstinPaste(text: string, limit = 500): { results: GstinPasteResult[]; truncated: boolean } {
  const tokens = text.toUpperCase().split(/[^0-9A-Z]+/).filter((t) => t.length >= 10);
  const seen = new Set<string>();
  const results: GstinPasteResult[] = [];
  for (const t of tokens) {
    if (results.length >= limit) return { results, truncated: true };
    if (seen.has(t)) {
      results.push({ gstin: t, valid: false, duplicate: true, error: 'Listed twice' });
      continue;
    }
    seen.add(t);
    const v = validateGstin(t);
    if (!v.isValid) {
      results.push({ gstin: t, valid: false, error: v.error });
      continue;
    }
    const pan = t.slice(2, 12);
    results.push({ gstin: t, valid: true, pan, stateCode: v.stateCode, stateName: v.stateName, constitutionHint: PAN_TYPE[pan[3]]?.assume });
  }
  return { results, truncated: false };
}
