import Decimal from 'decimal.js';
import { parseIndianAmount } from '../import/clientImport.js';
import type { BankLine, BankParseResult } from './statement.js';

/**
 * Bank statement layouts: find the heading row in a table of cells (from a paste, a CSV or
 * Excel file, or rows rebuilt from a PDF), work out which column holds what, recognise the bank,
 * and turn the rows into statement lines whose running balance is checked.
 *
 * Pure functions over rows of cells; the browser reads the file, this decides what it means.
 */

export type ColumnRole = 'date' | 'valueDate' | 'narration' | 'reference' | 'debit' | 'credit' | 'amount' | 'drcr' | 'balance' | 'balanceDrCr' | 'ignore';

/** Roles in the order the column-mapping step offers them. */
export const COLUMN_ROLES: Array<{ role: ColumnRole; label: string }> = [
  { role: 'date', label: 'Transaction date' },
  { role: 'valueDate', label: 'Value date' },
  { role: 'narration', label: 'Narration' },
  { role: 'reference', label: 'Cheque or reference' },
  { role: 'debit', label: 'Withdrawal (out)' },
  { role: 'credit', label: 'Deposit (in)' },
  { role: 'amount', label: 'Amount (one column)' },
  { role: 'drcr', label: 'Dr or Cr marker' },
  { role: 'balance', label: 'Balance' },
  { role: 'balanceDrCr', label: 'Balance Dr or Cr' },
  { role: 'ignore', label: 'Ignore' },
];

export type BankId = 'SBI' | 'HDFC' | 'ICICI' | 'KOTAK' | 'PNB' | 'CANARA' | 'YES' | 'IDBI' | 'JKB' | 'BOM' | 'GENERIC';

export interface BankLayout {
  id: BankId;
  name: string;
  /** The bank's name as printed on its statements. */
  title: RegExp;
  /** First four letters of the bank's IFSC codes. */
  ifsc: string;
  /** Column orders the bank is known to use (serial and branch columns as 'ignore'). */
  orders: ColumnRole[][];
}

const r = (s: string) => s.split(' ') as ColumnRole[];

export const BANK_LAYOUTS: BankLayout[] = [
  { id: 'SBI', name: 'State Bank of India', title: /state\s+bank\s+of\s+india/i, ifsc: 'SBIN', orders: [r('date valueDate narration reference debit credit balance')] },
  { id: 'HDFC', name: 'HDFC Bank', title: /hdfc\s+bank/i, ifsc: 'HDFC', orders: [r('date narration reference valueDate debit credit balance')] },
  {
    id: 'ICICI',
    name: 'ICICI Bank',
    title: /icici\s+bank/i,
    ifsc: 'ICIC',
    orders: [r('ignore valueDate date reference narration debit credit balance'), r('date ignore narration credit debit balance')],
  },
  {
    id: 'KOTAK',
    name: 'Kotak Mahindra Bank',
    title: /kotak\s+mahindra/i,
    ifsc: 'KKBK',
    orders: [r('ignore date narration reference amount drcr balance balanceDrCr'), r('ignore date valueDate narration reference amount balance')],
  },
  { id: 'PNB', name: 'Punjab National Bank', title: /punjab\s+national\s+bank/i, ifsc: 'PUNB', orders: [r('ignore date narration ignore reference debit credit balance valueDate')] },
  { id: 'CANARA', name: 'Canara Bank', title: /canara\s+bank/i, ifsc: 'CNRB', orders: [r('date valueDate reference narration ignore debit credit balance')] },
  { id: 'YES', name: 'Yes Bank', title: /\byes\s+bank\b/i, ifsc: 'YESB', orders: [r('date valueDate reference narration debit credit balance')] },
  { id: 'IDBI', name: 'IDBI Bank', title: /\bidbi\s+bank\b/i, ifsc: 'IBKL', orders: [r('ignore date valueDate narration reference drcr ignore amount balance')] },
  { id: 'JKB', name: 'J&K Bank', title: /jammu\s*(and|&)\s*kashmir\s+bank|\bj\s*&\s*k\s+bank\b/i, ifsc: 'JAKA', orders: [r('date narration reference debit credit balance')] },
  { id: 'BOM', name: 'Bank of Maharashtra', title: /bank\s+of\s+maharashtra/i, ifsc: 'MAHB', orders: [r('ignore date narration reference debit credit balance ignore')] },
];

export const bankName = (id: BankId) => BANK_LAYOUTS.find((b) => b.id === id)?.name ?? 'Other bank';

// ---------------------------------------------------------------------------- headings

export const normalizeHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/₹|\binr\b|\brs\b\.?/g, ' ')
    .replace(/[()\[\]:#*_.]/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();

const HEADER_RULES: Array<[ColumnRole, RegExp]> = [
  ['ignore', /^(s ?no|sl ?no|sr ?no|srl( no)?|serial( no)?|no|txn no|tran no|transaction no|branch( name| code)?|ccy|currency|channel|mode|init br|tran id|transaction id)$/],
  ['valueDate', /^value ?(date|dt)$/],
  ['date', /^((txn|tran|trans|transaction|posting|post|book|entry) ?)?(date|dt)$/],
  ['balanceDrCr', /^(balance|bal) ?(dr\/cr|cr\/dr)$/],
  ['drcr', /^(dr\/cr|cr\/dr|type|txn type|debit\/credit (indicator|flag)|d\/c|c\/d)$/],
  ['amount', /^((txn|tran|transaction) )?(amt|amount)( dr\/cr)?$|^debit\/credit$|^dr\/cr amount$/],
  ['debit', /^((withdrawals?|debits?|dr|payments?|paid out)( (amt|amount))?( dr)?|(dr|debit|withdrawal) (amt|amount))$/],
  ['credit', /^((deposits?|credits?|cr|receipts?|paid in)( (amt|amount))?( cr)?|(cr|credit|deposit) (amt|amount))$/],
  ['balance', /^((closing|running|available|avail|ledger) )?(balance|bal)( (amt|amount))?$/],
  ['narration', /narration|description|particulars|remarks|details/],
  ['reference', /^(chq|cheque|ref|reference|instrument|instr|utr)\b|\b(chq|cheque)\b|ref no/],
];

/** The role a heading names, or null when it is not a heading we know. */
export function headerRole(raw: string): ColumnRole | null {
  const t = normalizeHeader(raw);
  if (!t) return null;
  for (const [role, re] of HEADER_RULES) if (re.test(t)) return role;
  return null;
}

/** Roles for a heading row: the first date column is the transaction date, a Dr/Cr column right after the balance belongs to it. */
export function rolesFromHeader(header: string[]): ColumnRole[] {
  const roles: ColumnRole[] = header.map((h) => headerRole(h) ?? 'ignore');
  const seen = new Set<ColumnRole>();
  roles.forEach((role, i) => {
    if (role === 'drcr' && roles[i - 1] === 'balance') roles[i] = 'balanceDrCr';
    if (roles[i] !== 'ignore' && seen.has(roles[i])) roles[i] = roles[i] === 'narration' ? 'narration' : 'ignore';
    seen.add(roles[i]);
  });
  return roles;
}

const MONEY_ROLES: ColumnRole[] = ['debit', 'credit', 'amount'];
const headerScore = (row: string[]) => {
  const roles = new Set(row.map(headerRole).filter((x): x is ColumnRole => !!x && x !== 'ignore'));
  const hasDate = roles.has('date') || roles.has('valueDate');
  const hasMoney = MONEY_ROLES.some((m) => roles.has(m));
  return hasDate && hasMoney ? roles.size : Math.min(roles.size, 2);
};

/** Index of the heading row within the first rows, or -1. */
export function findHeaderRow(table: string[][], within = 60): number {
  let best = -1;
  let score = 2;
  for (let i = 0; i < Math.min(within, table.length); i++) {
    const s = headerScore(table[i]);
    if (s > score) {
      score = s;
      best = i;
    }
  }
  return best;
}

export const isHeaderLike = (row: string[]) => headerScore(row) >= 3;

// ---------------------------------------------------------------------------- values

const MON: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const valid = (y: string, m: string, d: string) => {
  const iso = `${y.length === 2 ? `20${y}` : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
};

/** A statement date in any of the forms Indian banks print, or an Excel serial day; ISO or null. */
export function parseStatementDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const serial = Math.floor(Number(t));
    if (serial > 30000 && serial < 70000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
    return null;
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return valid(m[1], m[2], m[3]);
  m = /(?:^|\s)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?!\d)/.exec(` ${t}`);
  if (m) return valid(m[3], m[2], m[1]);
  m = /(?:^|\s)(\d{1,2})[\s\-\/]?([A-Za-z]{3})[A-Za-z]*\.?[\s\-\/,']+(\d{4}|\d{2})(?!\d)/.exec(` ${t}`);
  if (m && MON[m[2].toUpperCase()]) return valid(m[3], MON[m[2].toUpperCase()], m[1]);
  return null;
}

/** Amount with its own sign or Dr/Cr marker: { value (absolute), side } or null when not a number. */
export function parseSignedAmount(raw: string): { value: Decimal; side: 'DR' | 'CR' | null } | null {
  let t = raw.replace(/\s+/g, ' ').trim();
  if (t === '' || t === '-' || t === '--') return { value: new Decimal(0), side: null };
  let side: 'DR' | 'CR' | null = null;
  const mark = /\(?(?<![a-z])(dr|cr|db|d|c)\.?\)?$/i.exec(t);
  if (mark) {
    side = /^c/i.test(mark[1]) ? 'CR' : 'DR';
    t = t.slice(0, mark.index).trim();
  }
  const lead = /^(dr|cr)\.?\s*/i.exec(t);
  if (lead) {
    side = /^c/i.test(lead[1]) ? 'CR' : 'DR';
    t = t.slice(lead[0].length);
  }
  if (t.startsWith('+')) {
    side = side ?? 'CR';
    t = t.slice(1);
  }
  const p = parseIndianAmount(t);
  if (p === null) return null;
  const v = new Decimal(p);
  if (v.isNeg()) side = side === 'CR' ? 'DR' : side === 'DR' ? 'CR' : 'DR';
  return { value: v.abs(), side };
}

const sideOf = (raw: string): 'DR' | 'CR' | null => {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (/^(dr|d|db|debit|w|wdl|withdrawal)\.?$/.test(t)) return 'DR';
  if (/^(cr|c|credit|dep|deposit)\.?$/.test(t)) return 'CR';
  return null;
};

// ---------------------------------------------------------------------------- detection

export interface LayoutDetection {
  bank: BankId;
  /** How the bank was recognised. */
  bankFrom: 'title' | 'ifsc' | 'columns' | null;
  header: number;
  roles: ColumnRole[];
  /** True when the columns match one of the bank's known orders and every needed column was found. */
  sure: boolean;
  /** Why the mapping step is shown, when it is. */
  reasons: string[];
}

const compact = (roles: ColumnRole[]) => roles.filter((x) => x !== 'ignore').join(' ');

/** The bank, from its name or IFSC in the text above the heading (narrations name other banks, so they are not read). */
export function detectBank(preamble: string): { bank: BankId; from: 'title' | 'ifsc' } | null {
  for (const b of BANK_LAYOUTS) if (b.title.test(preamble)) return { bank: b.id, from: 'title' };
  const ifsc = /\bIFS(?:C)?\s*(?:code)?\s*[:\-.]?\s*([A-Z]{4})0[A-Z0-9]{6}\b/i.exec(preamble) ?? /\b([A-Z]{4})0[A-Z0-9]{6}\b/.exec(preamble);
  if (ifsc) {
    const b = BANK_LAYOUTS.find((x) => x.ifsc === ifsc[1].toUpperCase());
    if (b) return { bank: b.id, from: 'ifsc' };
  }
  return null;
}

export function missingRoles(roles: ColumnRole[]): string[] {
  const has = (x: ColumnRole) => roles.includes(x);
  const out: string[] = [];
  if (!has('date') && !has('valueDate')) out.push('a date column');
  if (!has('narration')) out.push('a narration column');
  if (!has('amount') && !(has('debit') && has('credit'))) out.push(has('debit') || has('credit') ? 'both withdrawal and deposit columns' : 'the amount columns');
  if (!has('balance')) out.push('a balance column (needed to check the statement)');
  return out;
}

/**
 * Find the heading row, map its columns, and name the bank. `preamble` is any text known to be
 * from the top of the statement (a PDF's first lines); rows above the heading are added to it.
 */
export function detectLayout(table: string[][], preamble = ''): LayoutDetection {
  const header = findHeaderRow(table);
  const above = table.slice(0, header < 0 ? Math.min(table.length, 12) : header).map((row) => row.join(' ')).join('\n');
  const named = detectBank(`${preamble}\n${above}`);
  const reasons: string[] = [];
  let roles: ColumnRole[];
  if (header < 0) {
    roles = guessRolesFromContent(table);
    reasons.push('No heading row was found, so the columns were guessed from their contents.');
  } else {
    roles = rolesFromHeader(table[header]);
  }
  let bank: BankId = named?.bank ?? 'GENERIC';
  let bankFrom: LayoutDetection['bankFrom'] = named?.from ?? null;
  const seq = compact(roles);
  const matches = BANK_LAYOUTS.filter((b) => b.orders.some((o) => compact(o) === seq));
  if (!named && matches.length === 1) {
    bank = matches[0].id;
    bankFrom = 'columns';
  }
  const known = bank !== 'GENERIC' && matches.some((b) => b.id === bank);
  const missing = missingRoles(roles);
  if (missing.length) reasons.push(`Could not find ${missing.join(', ')}.`);
  if (header >= 0 && !known && bank !== 'GENERIC') reasons.push(`The columns differ from the ${bankName(bank)} layout we know; please check them.`);
  return { bank, bankFrom, header, roles, sure: header >= 0 && missing.length === 0 && (known || bank === 'GENERIC'), reasons };
}

/** Roles from cell contents, for a table without a heading row. */
export function guessRolesFromContent(table: string[][]): ColumnRole[] {
  const width = Math.max(0, ...table.map((row) => row.length));
  const body = table.filter((row) => row.some((c) => parseStatementDate(c))).slice(0, 200);
  const roles: ColumnRole[] = Array(width).fill('ignore');
  if (!body.length) return roles;
  const share = (i: number, f: (c: string) => boolean) => body.filter((row) => f(row[i] ?? '')).length / body.length;
  const isMoney = (c: string) => c.trim() !== '' && /\d/.test(c) && parseSignedAmount(c) !== null && !parseStatementDate(c);
  const stats = Array.from({ length: width }, (_, i) => ({
    i,
    date: share(i, (c) => !!parseStatementDate(c) && c.trim().length <= 24),
    money: share(i, isMoney),
    filled: share(i, (c) => c.trim() !== ''),
    text: body.reduce((s, row) => s + (row[i] ?? '').replace(/[^A-Za-z]/g, '').length, 0) / body.length,
  }));
  const dateCols = stats.filter((s) => s.date > 0.8).map((s) => s.i);
  if (dateCols[0] !== undefined) roles[dateCols[0]] = 'date';
  if (dateCols[1] !== undefined) roles[dateCols[1]] = 'valueDate';
  const narr = stats.filter((s) => roles[s.i] === 'ignore').sort((a, b) => b.text - a.text)[0];
  if (narr && narr.text > 3) roles[narr.i] = 'narration';
  const money = stats.filter((s) => roles[s.i] === 'ignore' && s.money > 0.25 && s.text < 2.5 && s.i > (narr?.i ?? -1)).map((s) => s);
  if (money.length) {
    const balance = money[money.length - 1];
    roles[balance.i] = 'balance';
    const rest = money.slice(0, -1);
    if (rest.length >= 2) {
      roles[rest[rest.length - 2].i] = 'debit';
      roles[rest[rest.length - 1].i] = 'credit';
    } else if (rest.length === 1) roles[rest[0].i] = 'amount';
  }
  return roles;
}

// ---------------------------------------------------------------------------- saved mappings

export interface SavedMapping {
  headers: string[];
  roles: ColumnRole[];
}

/** A mapping the user saved for this bank, applied by heading text, or by position when the column count is the same. */
export function applySavedMapping(header: string[], saved: SavedMapping): ColumnRole[] | null {
  const want = saved.headers.map(normalizeHeader);
  const roles: ColumnRole[] = [];
  let hits = 0;
  let named = 0;
  header.forEach((h, i) => {
    const n = normalizeHeader(h);
    if (n) named++;
    const at = n ? want.indexOf(n) : -1;
    if (at >= 0) {
      hits++;
      roles[i] = saved.roles[at] ?? 'ignore';
    } else roles[i] = headerRole(h) ?? 'ignore';
  });
  if (named > 0 && hits / named >= 0.6) return roles;
  if (header.length === saved.roles.length) return [...saved.roles];
  return null;
}

// ---------------------------------------------------------------------------- rows to lines

export interface StatementResult extends BankParseResult {
  /** The first line whose balance does not follow from the line before it. */
  firstBreak: { line: number; expected: string; found: string } | null;
  /** Every line had a balance and every balance followed. */
  reconciled: boolean;
  /** The statement listed the newest entry first; the lines were turned round. */
  reversed: boolean;
  /** Lines where a single amount column's direction was taken from the balance, not the statement. */
  inferred: number[];
}

const empty = (issues: BankParseResult['issues']): StatementResult => ({
  lines: [],
  issues,
  opening: null,
  closing: null,
  totals: { debit: '0.00', credit: '0.00' },
  firstBreak: null,
  reconciled: false,
  reversed: false,
  inferred: [],
});

const OPENING = /opening\s+bal|balance\s+(b\/?f|brought|forward)|\bb\/f\b|brought\s+forward/i;
const STOP = /closing\s+bal|statement\s+summary|end\s+of\s+statement|^\s*(grand\s+)?totals?\b/i;

/**
 * Statement lines from a table and its column roles. Rows without a date that carry only text
 * continue the narration of the line above; an opening balance row is read; totals and
 * repeated headings are skipped. The running balance is checked line by line.
 */
export function rowsToStatement(table: string[][], header: number, roles: ColumnRole[]): StatementResult {
  const issues: BankParseResult['issues'] = [];
  const col = (role: ColumnRole) => roles.indexOf(role);
  const dateCol = col('date') >= 0 ? col('date') : col('valueDate');
  if (dateCol < 0) return empty([{ line: 0, message: 'Choose which column holds the date.' }]);
  if (col('amount') < 0 && col('debit') < 0 && col('credit') < 0) return empty([{ line: 0, message: 'Choose the withdrawal and deposit columns, or the amount column.' }]);
  const cell = (row: string[], role: ColumnRole) => {
    const out = roles.map((x, i) => (x === role ? (row[i] ?? '').trim() : '')).filter(Boolean);
    return out.join(' ');
  };
  const bal = (row: string[]): Decimal | null => {
    const raw = cell(row, 'balance');
    if (!raw) return null;
    const p = parseSignedAmount(raw);
    if (!p) return null;
    const side = sideOf(cell(row, 'balanceDrCr')) ?? p.side;
    return side === 'DR' ? p.value.neg() : p.value;
  };

  interface Draft {
    line: number;
    date: string;
    narration: string[];
    reference: string[];
    debit: Decimal;
    credit: Decimal;
    balance: Decimal | null;
    amount: Decimal | null; // single amount whose side is not known yet
  }
  const drafts: Draft[] = [];
  let opening: Decimal | null = null;
  let stopped = false;
  for (let i = header + 1; i < table.length; i++) {
    const row = table[i];
    if (!row.some((c) => c.trim())) continue;
    if (isHeaderLike(row)) continue;
    const joined = row.join(' ');
    const d = parseStatementDate(row[dateCol] ?? '');
    if (!d) {
      if (OPENING.test(joined)) {
        const b = bal(row);
        if (b && opening === null && drafts.length === 0) opening = b;
        continue;
      }
      if (STOP.test(joined)) {
        stopped = true;
        continue;
      }
      // A continuation: narration or reference spilling onto the next row.
      const prev = drafts[drafts.length - 1];
      const hasMoney = ['debit', 'credit', 'amount', 'balance'].some((x) => /\d/.test(cell(row, x as ColumnRole)));
      if (prev && !hasMoney && !stopped) {
        const n = cell(row, 'narration');
        const ref = cell(row, 'reference');
        if (n) prev.narration.push(n);
        if (ref) prev.reference.push(ref);
      }
      continue;
    }
    if (stopped) stopped = false; // a new page of entries after a page summary
    const line = i + 1;
    let debit = new Decimal(0);
    let credit = new Decimal(0);
    let amount: Decimal | null = null;
    let bad = false;
    for (const role of ['debit', 'credit'] as const) {
      const raw = cell(row, role);
      if (!raw) continue;
      const p = parseSignedAmount(raw);
      if (!p) bad = true;
      else if (role === 'debit') debit = p.value;
      else credit = p.value;
    }
    const rawAmount = cell(row, 'amount');
    if (rawAmount) {
      const p = parseSignedAmount(rawAmount);
      if (!p) bad = true;
      else {
        const side = sideOf(cell(row, 'drcr')) ?? p.side;
        if (side === 'DR') debit = p.value;
        else if (side === 'CR') credit = p.value;
        else if (col('drcr') < 0 && col('balance') >= 0) amount = p.value;
        else credit = p.value;
      }
    }
    if (bad) {
      issues.push({ line, message: 'An amount is not a number.' });
      continue;
    }
    if (debit.isZero() && credit.isZero() && !amount && OPENING.test(joined)) {
      const b = bal(row);
      if (b && opening === null && drafts.length === 0) opening = b;
      continue;
    }
    if (debit.gt(0) && credit.gt(0)) issues.push({ line, message: 'Both a withdrawal and a deposit on one line.' });
    drafts.push({ line, date: d, narration: [cell(row, 'narration')].filter(Boolean), reference: [cell(row, 'reference')].filter(Boolean), debit, credit, balance: bal(row), amount });
  }
  if (!drafts.length) return empty([...issues, { line: 0, message: 'No dated entries were found under the heading row.' }]);

  // Newest first: turn the lines round so the balance runs forward.
  const reversed = drafts.length > 1 && drafts[0].date > drafts[drafts.length - 1].date;
  if (reversed) drafts.reverse();

  // A single unsigned amount column: the balance says which way the money went.
  const inferred: number[] = [];
  let prevBal: Decimal | null = opening;
  for (let k = 0; k < drafts.length; k++) {
    const dft = drafts[k];
    if (dft.amount) {
      const next = dft.balance;
      const known = prevBal !== null && next !== null;
      if (known && prevBal!.sub(dft.amount).eq(next!)) dft.debit = dft.amount;
      else {
        dft.credit = dft.amount;
        if (!(known && prevBal!.add(dft.amount).eq(next!))) issues.push({ line: dft.line, message: 'The amount does not say whether it is a withdrawal or a deposit; taken as a deposit.' });
      }
      inferred.push(dft.line);
      dft.amount = null;
    }
    if (dft.balance !== null) prevBal = dft.balance;
  }

  const lines: BankLine[] = drafts.map((x) => ({
    line: x.line,
    date: x.date,
    narration: x.narration.join(' ').replace(/\s+/g, ' ').trim(),
    reference: x.reference.join(' ').replace(/\s+/g, ' ').trim(),
    debit: x.debit.toFixed(2),
    credit: x.credit.toFixed(2),
    balance: x.balance ? x.balance.toFixed(2) : null,
  }));

  // Running balance: each balance should equal the one before plus deposits less withdrawals.
  let firstBreak: StatementResult['firstBreak'] = null;
  let prev: Decimal | null = opening;
  let allBalances = true;
  for (const l of lines) {
    if (l.balance === null) {
      allBalances = false;
      continue;
    }
    if (prev !== null) {
      const expected = prev.add(l.credit).sub(l.debit);
      if (!expected.eq(l.balance)) {
        issues.push({ line: l.line, message: `Balance ${l.balance} does not follow from ${prev.toFixed(2)}; expected ${expected.toFixed(2)}. A line may be missing or misread.` });
        firstBreak = firstBreak ?? { line: l.line, expected: expected.toFixed(2), found: l.balance };
      }
    }
    prev = new Decimal(l.balance);
  }
  const first = lines[0];
  const open = opening ? opening.toFixed(2) : first.balance ? new Decimal(first.balance).sub(first.credit).add(first.debit).toFixed(2) : null;
  return {
    lines,
    issues,
    opening: open,
    closing: lines[lines.length - 1].balance,
    totals: { debit: lines.reduce((s, l) => s.add(l.debit), new Decimal(0)).toFixed(2), credit: lines.reduce((s, l) => s.add(l.credit), new Decimal(0)).toFixed(2) },
    firstBreak,
    reconciled: allBalances && !firstBreak,
    reversed,
    inferred,
  };
}

/**
 * After the user edits a masked cell (account numbers shown as XXXX1234), put the hidden digits
 * back wherever the masked text was left as it was.
 */
export function restoreMasked(original: string, editedMasked: string): string {
  let out = editedMasked;
  for (const m of original.match(/\d{9,18}/g) ?? []) {
    const masked = `${'X'.repeat(m.length - 4)}${m.slice(-4)}`;
    const at = out.indexOf(masked);
    if (at >= 0) out = out.slice(0, at) + m + out.slice(at + masked.length);
  }
  return out;
}
