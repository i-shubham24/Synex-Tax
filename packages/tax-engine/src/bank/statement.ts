import Decimal from 'decimal.js';
import { parseDelimited, parseIndianAmount } from '../import/clientImport.js';

/**
 * Bank statement to books: read a statement pasted from Excel or a bank's CSV, check that the
 * running balance adds up, suggest a ledger for each line from narration rules, and write Tally
 * vouchers (Payment, Receipt, Contra) as import XML.
 *
 * Runs in the browser; the statement is never sent to or stored on the server.
 */

export interface BankLine {
  line: number;
  date: string; // ISO
  narration: string;
  reference: string;
  debit: string; // money out
  credit: string; // money in
  balance: string | null;
}

export interface BankParseResult {
  lines: BankLine[];
  issues: Array<{ line: number; message: string }>;
  opening: string | null;
  closing: string | null;
  totals: { debit: string; credit: string };
}

type Col = 'date' | 'narration' | 'reference' | 'debit' | 'credit' | 'amount' | 'drcr' | 'balance';
const HEAD: Array<[Col, RegExp]> = [
  ['date', /^(txn|transaction|value|posting|tran)?\s*date$|^date$/],
  ['narration', /^(narration|description|particulars|remarks|details|transaction\s*(details|remarks|description))$/],
  ['reference', /^(ref|reference|chq|cheque)[\s.\/]*(no|number|ref\s*no|\/\s*ref\s*no)?\.?$|^chq\s*\/\s*ref\s*no\.?$|^utr(\s*no)?$/],
  ['debit', /^(withdrawal|withdrawals|debit|dr)(\s*(amt|amount))?(\s*\(inr\))?\.?$/],
  ['credit', /^(deposit|deposits|credit|cr)(\s*(amt|amount))?(\s*\(inr\))?\.?$/],
  ['amount', /^(amount|txn\s*amount|transaction\s*amount)(\s*\(inr\))?$/],
  ['drcr', /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type)$/],
  ['balance', /^(closing\s*)?balance(\s*\(inr\))?$|^bal$/],
];
const matchHead = (h: string): Col | null => {
  const t = h.toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [c, re] of HEAD) if (re.test(t)) return c;
  return null;
};

const MON: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
function date(raw: string): string | null {
  const t = raw.trim();
  let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
  }
  m = /^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]+(\d{2,4})$/.exec(t);
  if (m && MON[m[2].toUpperCase()]) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${MON[m[2].toUpperCase()]}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const money = (raw: string | undefined): Decimal | null => {
  if (raw === undefined) return new Decimal(0);
  const t = raw.replace(/\s*(cr|dr)\.?$/i, '').trim();
  if (t === '' || t === '-') return new Decimal(0);
  const p = parseIndianAmount(t);
  return p === null ? null : new Decimal(p);
};

export function parseBankStatement(text: string): BankParseResult {
  const table = parseDelimited(text);
  let hi = -1;
  let best = 0;
  for (let i = 0; i < Math.min(30, table.length); i++) {
    const n = table[i].filter((c) => matchHead(c)).length;
    if (n > best) { best = n; hi = i; }
  }
  const issues: BankParseResult['issues'] = [];
  if (hi < 0 || best < 3) {
    issues.push({ line: 0, message: 'Could not find the heading row (date, narration, withdrawal, deposit, balance).' });
    return { lines: [], issues, opening: null, closing: null, totals: { debit: '0.00', credit: '0.00' } };
  }
  const map = table[hi].map(matchHead);
  const lines: BankLine[] = [];
  for (let r = hi + 1; r < table.length; r++) {
    const raw: Partial<Record<Col, string>> = {};
    table[r].forEach((c, i) => { const k = map[i]; if (k && raw[k] === undefined) raw[k] = c.trim(); });
    const d = date(raw.date ?? '');
    if (!d) continue; // opening/closing rows, totals and page breaks
    let debit = money(raw.debit);
    let credit = money(raw.credit);
    if (raw.amount !== undefined) {
      const a = money(raw.amount);
      const isDr = /^d/i.test(raw.drcr ?? '') || /dr\.?$/i.test(raw.amount);
      if (a) { debit = isDr ? a.abs() : new Decimal(0); credit = isDr ? new Decimal(0) : a.abs(); }
    }
    const balance = raw.balance ? money(raw.balance) : null;
    if (debit === null || credit === null) { issues.push({ line: r + 1, message: 'An amount is not a number.' }); continue; }
    if (debit.gt(0) && credit.gt(0)) issues.push({ line: r + 1, message: 'Both a withdrawal and a deposit on one line.' });
    lines.push({ line: r + 1, date: d, narration: (raw.narration ?? '').replace(/\s+/g, ' '), reference: raw.reference ?? '', debit: debit.toFixed(2), credit: credit.toFixed(2), balance: balance ? balance.toFixed(2) : null });
  }
  // Running balance check: each balance should equal the previous one plus deposits less withdrawals.
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1].balance;
    const cur = lines[i].balance;
    if (prev === null || cur === null) continue;
    const expected = new Decimal(prev).add(lines[i].credit).sub(lines[i].debit);
    if (!expected.eq(cur)) issues.push({ line: lines[i].line, message: `Balance ${cur} does not follow from ${prev}; expected ${expected.toFixed(2)}. A line may be missing.` });
  }
  const first = lines[0];
  const opening = first?.balance ? new Decimal(first.balance).sub(first.credit).add(first.debit).toFixed(2) : null;
  return {
    lines,
    issues,
    opening,
    closing: lines.length ? lines[lines.length - 1].balance : null,
    totals: { debit: lines.reduce((s, l) => s.add(l.debit), new Decimal(0)).toFixed(2), credit: lines.reduce((s, l) => s.add(l.credit), new Decimal(0)).toFixed(2) },
  };
}

/** Long digit runs in a narration (account and card numbers) are masked for display. */
export const maskNarration = (s: string) => s.replace(/\d{9,18}/g, (m) => `${'X'.repeat(m.length - 4)}${m.slice(-4)}`);

export interface LedgerRule {
  pattern: string; // case-insensitive text, or /regex/
  ledger: string;
  direction?: 'OUT' | 'IN';
}

/** Starting rules for common Indian bank narrations; the firm adds its own (party names) on top. */
export const DEFAULT_BANK_RULES: LedgerRule[] = [
  { pattern: '/\\bGST\\b|CBIC|GSTN|CPIN/', ledger: 'GST Payable', direction: 'OUT' },
  { pattern: '/\\bTDS\\b|ITNS ?281|OLTAS|CBDT.*(TDS|281)/', ledger: 'TDS Payable', direction: 'OUT' },
  { pattern: '/ADVANCE TAX|ITNS ?280|SELF ASSESSMENT/', ledger: 'Income Tax', direction: 'OUT' },
  { pattern: '/\\bEPF\\b|EPFO|PROVIDENT FUND/', ledger: 'PF Payable', direction: 'OUT' },
  { pattern: '/\\bESIC?\\b/', ledger: 'ESI Payable', direction: 'OUT' },
  { pattern: '/SALARY|SAL FOR|PAYROLL/', ledger: 'Salary Payable', direction: 'OUT' },
  { pattern: '/\\bRENT\\b/', ledger: 'Rent', direction: 'OUT' },
  { pattern: '/ELECTRICITY|PSPCL|\\bBILLDESK.*POWER/', ledger: 'Electricity', direction: 'OUT' },
  { pattern: '/CHARGES|CHRGS|\\bCHG\\b|SMS ALERT|AMC|MIN BAL|GST ON CHG/', ledger: 'Bank Charges', direction: 'OUT' },
  { pattern: '/INT\\.? ?(PD|PAID|CREDIT|CR)|INTEREST CREDIT|SB INT/', ledger: 'Bank Interest', direction: 'IN' },
  { pattern: '/INTEREST|INT\\.? ON (LOAN|OD|CC)/', ledger: 'Interest on Loan', direction: 'OUT' },
  { pattern: '/\\bEMI\\b|LOAN (REPAY|INST)/', ledger: 'Loan Repayment', direction: 'OUT' },
  { pattern: '/CASH (DEP|DEPOSIT)|BY CASH/', ledger: 'Cash', direction: 'IN' },
  { pattern: '/ATM|CASH WDL|CASH WITHDRAWAL|SELF/', ledger: 'Cash', direction: 'OUT' },
];

function test(rule: LedgerRule, narration: string): boolean {
  const m = /^\/(.*)\/$/.exec(rule.pattern);
  if (m) {
    try {
      return new RegExp(m[1], 'i').test(narration);
    } catch {
      return false;
    }
  }
  return narration.toLowerCase().includes(rule.pattern.toLowerCase());
}

/** The counterparty in a UPI, NEFT, RTGS or IMPS narration, when the bank's format shows one. */
export function partyFromNarration(n: string): string | null {
  const t = n.toUpperCase();
  const channel = /^(?:BY |TO )?(UPI|NEFT|RTGS|IMPS)\b/.exec(t);
  if (!channel) return null;
  // Tokens between "/" or "-": skip the channel words, IFSC codes, references, handles and bank codes.
  const SKIP = /^(UPI|NEFT|RTGS|IMPS|CR|DR|P2A|P2M|P2P|MOB|INB|NA|PAYMENT|TRANSFER|IFT|BY|TO)$/;
  for (const raw of t.split(/[\/\-]/).map((x) => x.split(/\s+/).filter((w) => !SKIP.test(w)).join(' ').trim())) {
    if (!raw || SKIP.test(raw) || /@/.test(raw) || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(raw) || /^[A-Z]{4}$/.test(raw)) continue;
    if (/\d/.test(raw)) continue; // references, invoice numbers, account fragments
    if (/^[A-Z][A-Z .&']{2,60}$/.test(raw) && raw.replace(/[^A-Z]/g, '').length >= 3) return raw.replace(/\s+/g, ' ');
  }
  return null;
}

export interface ClassifiedLine extends BankLine {
  ledger: string | null;
  source: 'RULE' | 'PARTY' | null;
  voucherType: 'Payment' | 'Receipt' | 'Contra';
}

export function classifyBankLines(lines: BankLine[], rules: LedgerRule[] = DEFAULT_BANK_RULES): ClassifiedLine[] {
  return lines.map((l) => {
    const out = new Decimal(l.debit).gt(0);
    const rule = rules.find((r) => (!r.direction || r.direction === (out ? 'OUT' : 'IN')) && test(r, l.narration));
    const party = rule ? null : partyFromNarration(l.narration);
    const ledger = rule?.ledger ?? party ?? null;
    const voucherType = ledger === 'Cash' ? 'Contra' : out ? 'Payment' : 'Receipt';
    return { ...l, ledger, source: rule ? 'RULE' : party ? 'PARTY' : null, voucherType };
  });
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Tally import XML for the classified lines. Debit amounts are negative with ISDEEMEDPOSITIVE Yes,
 * as Tally expects. Lines without a ledger go to `suspense` so nothing is dropped silently.
 */
export function tallyVoucherXml(lines: ClassifiedLine[], opts: { company: string; bankLedger: string; suspense?: string }): string {
  const suspense = opts.suspense ?? 'Suspense';
  const entry = (ledger: string, debit: boolean, amount: string) =>
    `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${debit ? '-' : ''}${amount}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
  const vouchers = lines.map((l) => {
    const other = l.ledger ?? suspense;
    const out = new Decimal(l.debit).gt(0);
    const amount = out ? l.debit : l.credit;
    // Money out: the other ledger is debited and the bank credited; money in: the reverse.
    const entries = out ? entry(other, true, amount) + entry(opts.bankLedger, false, amount) : entry(opts.bankLedger, true, amount) + entry(other, false, amount);
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${l.voucherType}" ACTION="Create"><DATE>${l.date.replace(/-/g, '')}</DATE><VOUCHERTYPENAME>${l.voucherType}</VOUCHERTYPENAME><NARRATION>${xml([l.narration, l.reference].filter(Boolean).join(' '))}</NARRATION>${entries}</VOUCHER></TALLYMESSAGE>`;
  });
  return `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(opts.company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${vouchers.join('')}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}
