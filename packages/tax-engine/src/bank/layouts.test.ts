import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySavedMapping, detectLayout, guessRolesFromContent, parseSignedAmount, parseStatementDate, restoreMasked, rowsToStatement, type BankId } from './layouts.js';
import { rebuildRows, type PositionedText } from './rows.js';

// Synthetic statements, made for these tests from each bank's published column headings. They are
// not copies of real customer statements; the figures are invented and add up.

interface Case {
  bank: BankId;
  table: string[][];
  lines: number;
  debit: string;
  credit: string;
  opening: string;
  closing: string;
}

const CASES: Case[] = [
  {
    bank: 'SBI',
    table: [
      ['State Bank of India'],
      ['Account Number', '00000012345678901'],
      ['IFS Code', 'SBIN0001234'],
      ['Txn Date', 'Value Date', 'Description', 'Ref No./Cheque No.', 'Debit', 'Credit', 'Balance'],
      ['1 Apr 2026', '1 Apr 2026', 'BY TRANSFER-NEFT*HDFC0000001*N091234*DELHI MART', 'TRANSFER FROM 3199', '', '25,000.00', '75,000.00'],
      ['3 Apr 2026', '3 Apr 2026', 'TO TRANSFER-UPI/DR/609312345678/RAJ TRADERS/', 'TRANSFER TO 4897', '5,000.00', '', '70,000.00'],
      ['5 Apr 2026', '5 Apr 2026', 'ATM WDL-ATM CASH 1234', '', '2,000.00', '', '68,000.00'],
    ],
    lines: 3, debit: '7000.00', credit: '25000.00', opening: '50000.00', closing: '68000.00',
  },
  {
    bank: 'HDFC',
    table: [
      ['HDFC BANK Ltd.'],
      ['Account No :50100123456789'],
      ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
      ['01/04/26', 'UPI-LUDHIANA TRADERS-ludhiana@ybl-YESB0000001', '0000627412345678', '01/04/26', '11,800.00', '', '88,200.00'],
      ['03/04/26', 'NEFT CR-HDFC0000123-DELHI MART-INV 102', 'N276261234567', '03/04/26', '', '1,57,500.00', '2,45,700.00'],
      ['07/04/26', 'GST PAYMENT CPIN 26100300012345', '', '07/04/26', '9,660.00', '', '2,36,040.00'],
    ],
    lines: 3, debit: '21460.00', credit: '157500.00', opening: '100000.00', closing: '236040.00',
  },
  {
    bank: 'ICICI',
    table: [
      ['ICICI Bank Limited', 'Detailed Statement'],
      ['S No.', 'Value Date', 'Transaction Date', 'Cheque Number', 'Transaction Remarks', 'Withdrawal Amount (INR )', 'Deposit Amount (INR )', 'Balance (INR )'],
      ['1', '01/04/2026', '01/04/2026', '-', 'MMT/IMPS/609112345678/RENT APRIL/HARPREET KAUR', '20,000.00', '0.00', '30,000.00'],
      ['2', '02/04/2026', '02/04/2026', '-', 'NEFT-SBIN0001234-AMRITSAR STORES-INV 77', '0.00', '12,500.00', '42,500.00'],
      ['3', '04/04/2026', '04/04/2026', '000123', 'CLG/SHARMA AND SONS', '2,500.00', '0.00', '40,000.00'],
    ],
    lines: 3, debit: '22500.00', credit: '12500.00', opening: '50000.00', closing: '40000.00',
  },
  {
    bank: 'KOTAK',
    table: [
      ['Kotak Mahindra Bank', 'Account Statement'],
      ['Sl. No.', 'Date', 'Description', 'Chq / Ref number', 'Amount', 'Dr / Cr', 'Balance', 'Dr / Cr'],
      ['1', '01-04-2026', 'UPI/RAJ TRADERS/609312345678/', 'UPI-609312345678', '5,000.00', 'DR', '45,000.00', 'CR'],
      // A narration that wrapped onto a second row in the export.
      ['', '', 'PAYMENT FOR INVOICE 41', '', '', '', '', ''],
      ['2', '02-04-2026', 'NEFT AMRITSAR STORES', 'NEFTINH123', '15,000.00', 'CR', '60,000.00', 'CR'],
      ['3', '05-04-2026', 'Chrg: SMS ALERT', '', '17.70', 'DR', '59,982.30', 'CR'],
    ],
    lines: 3, debit: '5017.70', credit: '15000.00', opening: '50000.00', closing: '59982.30',
  },
  {
    bank: 'PNB',
    table: [
      ['Punjab National Bank'],
      ['Txn No.', 'Txn Date', 'Description', 'Branch Name', 'Cheque No.', 'Dr Amount', 'Cr Amount', 'Balance', 'Value Date'],
      ['S1234', '01/04/2026', 'NEFT IN DELHI MART', 'LUDHIANA', '', '', '8,000.00', '18,000.00 Cr.', '01/04/2026'],
      ['S1240', '02/04/2026', 'UPI/RAJ TRADERS', 'LUDHIANA', '', '3,000.00', '', '15,000.00 Cr.', '02/04/2026'],
    ],
    lines: 2, debit: '3000.00', credit: '8000.00', opening: '10000.00', closing: '15000.00',
  },
  {
    bank: 'CANARA',
    table: [
      ['Branch', 'Ludhiana Main', 'IFSC Code', 'CNRB0001234'],
      ['Txn Date', 'Value Date', 'Cheque No.', 'Description', 'Branch Code', 'Debit', 'Credit', 'Balance'],
      ['', '', '', 'Opening Balance', '', '', '', '1,000.00'],
      ['01-04-2026', '01-04-2026', '', 'BY CASH DEPOSIT', '1234', '', '4,000.00', '5,000.00'],
      ['03-04-2026', '03-04-2026', '000045', 'TO CHQ PAID SELF', '1234', '1,500.00', '', '3,500.00'],
    ],
    lines: 2, debit: '1500.00', credit: '4000.00', opening: '1000.00', closing: '3500.00',
  },
  {
    bank: 'YES',
    table: [
      ['YES BANK', 'Statement of Account'],
      ['Transaction Date', 'Value Date', 'Cheque No/Reference No', 'Description', 'Withdrawals', 'Deposits', 'Running Balance'],
      ['01-Apr-2026', '01-Apr-2026', 'IMPS123', 'IMPS/P2A/609100001111/HARPREET KAUR', '2,000.00', '', '8,000.00'],
      ['02-Apr-2026', '02-Apr-2026', '', 'INT.PD:01-01-2026 TO 31-03-2026', '', '120.00', '8,120.00'],
    ],
    lines: 2, debit: '2000.00', credit: '120.00', opening: '10000.00', closing: '8120.00',
  },
  {
    bank: 'IDBI',
    // Newest entry first, a single amount column with a CR/DR column before it.
    table: [
      ['IDBI Bank'],
      ['Srl', 'Txn Date', 'Value Date', 'Description', 'Cheque No', 'CR/DR', 'CCY', 'Amount (INR)', 'Balance (INR)'],
      ['3', '05/04/2026', '05/04/2026', 'ATM WDL', '', 'Dr.', 'INR', '1,000.00', '21,000.00'],
      ['2', '03/04/2026', '03/04/2026', 'NEFT DELHI MART', '', 'Cr.', 'INR', '7,000.00', '22,000.00'],
      ['1', '01/04/2026', '01/04/2026', 'UPI RAJ TRADERS', '', 'Dr.', 'INR', '5,000.00', '15,000.00'],
    ],
    lines: 3, debit: '6000.00', credit: '7000.00', opening: '20000.00', closing: '21000.00',
  },
  {
    bank: 'JKB',
    // The balance goes overdrawn (Dr) and comes back.
    table: [
      ['The Jammu and Kashmir Bank Ltd'],
      ['Date', 'Particulars', 'Chq No', 'Debit', 'Credit', 'Balance'],
      ['01/04/2026', 'TO CLG SHARMA', '000111', '3,000.00', '', '2,000.00 Dr'],
      ['02/04/2026', 'BY CASH', '', '', '5,000.00', '3,000.00 Cr'],
    ],
    lines: 2, debit: '3000.00', credit: '5000.00', opening: '1000.00', closing: '3000.00',
  },
  {
    bank: 'BOM',
    table: [
      ['Bank of Maharashtra'],
      ['Sr No', 'Date', 'Particulars', 'Cheque/Reference No', 'Debit', 'Credit', 'Balance', 'Channel'],
      ['1', '01/04/2026', 'UPI/DR/RAJ TRADERS', '609312345678', '2,500.00', '-', '7,500.00', 'UPI'],
      ['2', '02/04/2026', 'NEFT CR AMRITSAR STORES', 'N12345', '-', '2,500.00', '10,000.00', 'NEFT'],
    ],
    lines: 2, debit: '2500.00', credit: '2500.00', opening: '10000.00', closing: '10000.00',
  },
];

for (const c of CASES) {
  test(`${c.bank}: layout recognised, lines read, balance runs through`, () => {
    const d = detectLayout(c.table);
    assert.equal(d.bank, c.bank);
    assert.equal(d.sure, true, d.reasons.join(' '));
    const s = rowsToStatement(c.table, d.header, d.roles);
    assert.deepEqual(s.issues, []);
    assert.equal(s.lines.length, c.lines);
    assert.deepEqual(s.totals, { debit: c.debit, credit: c.credit });
    assert.equal(s.opening, c.opening);
    assert.equal(s.closing, c.closing);
    assert.equal(s.reconciled, true);
  });
}

test('Kotak: a wrapped narration row joins the entry above', () => {
  const c = CASES.find((x) => x.bank === 'KOTAK')!;
  const d = detectLayout(c.table);
  assert.equal(rowsToStatement(c.table, d.header, d.roles).lines[0].narration, 'UPI/RAJ TRADERS/609312345678/ PAYMENT FOR INVOICE 41');
});

test('IDBI: newest-first statement is turned round', () => {
  const c = CASES.find((x) => x.bank === 'IDBI')!;
  const d = detectLayout(c.table);
  const s = rowsToStatement(c.table, d.header, d.roles);
  assert.equal(s.reversed, true);
  assert.deepEqual(s.lines.map((l) => l.date), ['2026-04-01', '2026-04-03', '2026-04-05']);
});

test('J&K: an overdrawn balance is negative', () => {
  const c = CASES.find((x) => x.bank === 'JKB')!;
  const d = detectLayout(c.table);
  assert.equal(rowsToStatement(c.table, d.header, d.roles).lines[0].balance, '-2000.00');
});

test('ICICI older layout: deposits before withdrawals, B/F row as opening', () => {
  const t = [
    ['ICICI BANK'],
    ['DATE', 'MODE**', 'PARTICULARS', 'DEPOSITS', 'WITHDRAWALS', 'BALANCE'],
    ['', '', 'B/F', '', '', '10,000.00'],
    ['01-04-2026', 'NEFT', 'NEFT-DELHI MART', '5,000.00', '', '15,000.00'],
    ['02-04-2026', '', 'ATM/CASH', '', '1,000.00', '14,000.00'],
  ];
  const d = detectLayout(t);
  assert.equal(d.bank, 'ICICI');
  assert.equal(d.sure, true);
  const s = rowsToStatement(t, d.header, d.roles);
  assert.equal(s.opening, '10000.00');
  assert.deepEqual(s.lines.map((l) => [l.debit, l.credit]), [['0.00', '5000.00'], ['1000.00', '0.00']]);
  assert.equal(s.reconciled, true);
});

test('the first row where the balance does not follow is flagged', () => {
  const t = CASES.find((x) => x.bank === 'HDFC')!.table.map((row) => [...row]);
  t[4][6] = '2,40,700.00'; // should be 2,45,700.00
  const d = detectLayout(t);
  const s = rowsToStatement(t, d.header, d.roles);
  assert.deepEqual(s.firstBreak, { line: 5, expected: '245700.00', found: '240700.00' });
  assert.equal(s.reconciled, false);
});

test('generic: unknown bank, one signed amount column, direction from the sign and the balance', () => {
  const t = [
    ['Date', 'Details', 'Amount', 'Balance'],
    ['2026-04-01', 'Card purchase', '-500.00', '9,500.00'],
    ['2026-04-02', 'Refund', '200.00', '9,700.00'],
  ];
  const d = detectLayout(t);
  assert.equal(d.bank, 'GENERIC');
  const s = rowsToStatement(t, d.header, d.roles);
  assert.deepEqual(s.lines.map((l) => [l.debit, l.credit]), [['500.00', '0.00'], ['0.00', '200.00']]);
  assert.equal(s.reconciled, true);
  assert.deepEqual(s.issues, []);
});

test('no heading row: columns guessed from contents, and the step is marked unsure', () => {
  const t = [
    ['01/04/2026', 'UPI RAJ TRADERS', '1,000.00', '', '9,000.00'],
    ['02/04/2026', 'NEFT DELHI MART', '', '2,000.00', '11,000.00'],
    ['03/04/2026', 'ATM CASH', '500.00', '', '10,500.00'],
  ];
  assert.deepEqual(guessRolesFromContent(t), ['date', 'narration', 'debit', 'credit', 'balance']);
  const d = detectLayout(t);
  assert.equal(d.sure, false);
  assert.equal(d.header, -1);
  const s = rowsToStatement(t, d.header, d.roles);
  assert.equal(s.lines.length, 3);
  assert.equal(s.reconciled, true);
});

test('a saved mapping applies by heading text, or by position', () => {
  const saved = { headers: ['Tran Dt', 'Remarks', 'Out', 'In', 'Bal'], roles: ['date', 'narration', 'debit', 'credit', 'balance'] as const };
  assert.deepEqual(applySavedMapping(['Tran Dt', 'Remarks', 'Out', 'In', 'Bal'], { ...saved, roles: [...saved.roles] }), ['date', 'narration', 'debit', 'credit', 'balance']);
  assert.deepEqual(applySavedMapping(['A', 'B', 'C', 'D', 'E'], { ...saved, roles: [...saved.roles] }), ['date', 'narration', 'debit', 'credit', 'balance']);
  assert.equal(applySavedMapping(['A', 'B'], { ...saved, roles: [...saved.roles] }), null);
});

test('dates, amounts and masked edits', () => {
  assert.equal(parseStatementDate('01-Apr-26'), '2026-04-01');
  assert.equal(parseStatementDate('1 Sept 2026'), '2026-09-01');
  assert.equal(parseStatementDate('01/04/2026 10:22:11'), '2026-04-01');
  assert.equal(parseStatementDate('46113'), '2026-04-01');
  assert.equal(parseStatementDate('31/02/2026'), null);
  assert.deepEqual(parseSignedAmount('1,000.00Cr'), { value: parseSignedAmount('1000')!.value, side: 'CR' });
  assert.equal(parseSignedAmount('-1,000.00')?.side, 'DR');
  assert.equal(parseSignedAmount('12a'), null);
  assert.equal(restoreMasked('ATM 501234567890 X', 'ATM XXXXXXXX7890 Amritsar'), 'ATM 501234567890 Amritsar');
});

// ---------------------------------------------------------------------------- positioned text

/** Text placed as pdf.js would report it: 5 units a character, 8 high. Right-aligned when `right` is set. */
const at = (page: number, y: number, x: number, text: string, opts: { right?: boolean; conf?: number } = {}): PositionedText => {
  const w = text.length * 5;
  return { text, x: opts.right ? x - w : x, y, w, h: 8, page, conf: opts.conf };
};

test('PDF text layer: two-line heading, wrapped narration, repeated heading and footer on page 2', () => {
  const head = (p: number, y: number) => [
    at(p, y, 40, 'Date'), at(p, y, 100, 'Narration'), at(p, y, 300, 'Chq./Ref.No.'), at(p, y, 380, 'Value'), at(p, y, 450, 'Withdrawal'), at(p, y, 530, 'Deposit'), at(p, y, 610, 'Closing'),
    at(p, y + 10, 380, 'Dt'), at(p, y + 10, 450, 'Amt.'), at(p, y + 10, 530, 'Amt.'), at(p, y + 10, 610, 'Balance'),
  ];
  const items: PositionedText[] = [
    at(1, 20, 40, 'HDFC BANK Ltd.'),
    at(1, 32, 40, 'Account No : 50100123456789'),
    ...head(1, 100),
    at(1, 125, 40, '01/04/26'), at(1, 125, 100, 'UPI/DR/627412345678/LUDHIANA'), at(1, 125, 300, '0000627412345678'), at(1, 125, 380, '01/04/26'), at(1, 125, 500, '11,800.00', { right: true }), at(1, 125, 660, '88,200.00', { right: true }),
    at(1, 135, 100, 'TRADERS/YESB/Payment'),
    at(1, 150, 40, '03/04/26'), at(1, 150, 100, 'NEFT CR-HDFC0000123-DELHI MART'), at(1, 150, 300, 'N276261234567'), at(1, 150, 380, '03/04/26'), at(1, 150, 580, '1,57,500.00', { right: true }), at(1, 150, 660, '2,45,700.00', { right: true }),
    at(1, 160, 100, '-INV 102'),
    at(1, 700, 280, 'Page 1 of 2'),
    ...head(2, 50),
    at(2, 75, 40, '07/04/26'), at(2, 75, 100, 'GST PAYMENT CPIN 26100300012345'), at(2, 75, 380, '07/04/26'), at(2, 75, 500, '9,660.00', { right: true }), at(2, 75, 660, '2,36,040.00', { right: true }),
    at(2, 90, 40, '10/04/26'), at(2, 90, 100, 'SMS ALERT CHARGES'), at(2, 90, 380, '10/04/26'), at(2, 90, 500, '17.70', { right: true }), at(2, 90, 660, '2,36,022.30', { right: true }),
    at(2, 200, 40, 'STATEMENT SUMMARY'),
    at(2, 700, 280, 'Page 2 of 2'),
  ];
  const t = rebuildRows(items);
  assert.equal(t.headerFound, true);
  assert.deepEqual(t.rows[0], ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance']);
  assert.equal(t.rows.length, 5);
  assert.equal(t.rows[1][1], 'UPI/DR/627412345678/LUDHIANA TRADERS/YESB/Payment');
  assert.equal(t.rows[2][1], 'NEFT CR-HDFC0000123-DELHI MART -INV 102');
  assert.deepEqual(t.meta.map((m) => m.page), [1, 1, 1, 2, 2]);
  const d = detectLayout(t.rows, t.preamble);
  assert.equal(d.bank, 'HDFC');
  assert.equal(d.sure, true);
  const s = rowsToStatement(t.rows, d.header, d.roles);
  assert.deepEqual(s.issues, []);
  assert.equal(s.reconciled, true);
  assert.deepEqual(s.totals, { debit: '21477.70', credit: '157500.00' });
});

test('OCR word boxes: narration centred on its date line, confidence kept per cell', () => {
  const items: PositionedText[] = [
    at(1, 10, 40, 'ICICI Bank'),
    at(1, 100, 40, 'Date'), at(1, 100, 120, 'Particulars'), at(1, 100, 400, 'Withdrawals'), at(1, 100, 500, 'Deposits'), at(1, 100, 600, 'Balance'),
    // Entry 1: three lines, the date on the middle one.
    at(1, 120, 120, 'NEFT-SBIN0001234', { conf: 91 }),
    at(1, 130, 40, '01/04/2026', { conf: 95 }), at(1, 130, 120, 'AMRITSAR', { conf: 88 }), at(1, 130, 570, '5,000.00', { right: true, conf: 93 }), at(1, 130, 660, '15,000.00', { right: true, conf: 45 }),
    at(1, 140, 120, 'STORES', { conf: 90 }),
    // Entry 2.
    at(1, 160, 120, 'UPI/RAJ', { conf: 90 }),
    at(1, 170, 40, '02/04/2026', { conf: 96 }), at(1, 170, 120, 'TRADERS', { conf: 92 }), at(1, 170, 470, '1,000.00', { right: true, conf: 94 }), at(1, 170, 660, '14,000.00', { right: true, conf: 97 }),
    at(1, 180, 120, 'INV', { conf: 80 }), at(1, 180, 140, '41', { conf: 70 }),
  ];
  const t = rebuildRows(items);
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[1][1], 'NEFT-SBIN0001234 AMRITSAR STORES');
  assert.equal(t.rows[2][1], 'UPI/RAJ TRADERS INV 41');
  assert.equal(t.meta[1].conf[4], 45);
  assert.equal(t.meta[2].conf[1], 70);
  const d = detectLayout(t.rows, t.preamble);
  assert.equal(d.bank, 'ICICI');
  const s = rowsToStatement(t.rows, d.header, d.roles);
  assert.equal(s.reconciled, true);
  assert.equal(s.opening, '10000.00');
});

test('no heading on the page: columns laid out from the entries', () => {
  const items: PositionedText[] = [
    at(1, 100, 40, '01/04/2026'), at(1, 100, 120, 'UPI RAJ TRADERS'), at(1, 100, 470, '1,000.00', { right: true }), at(1, 100, 660, '9,000.00', { right: true }),
    at(1, 115, 40, '02/04/2026'), at(1, 115, 120, 'NEFT DELHI MART'), at(1, 115, 570, '2,000.00', { right: true }), at(1, 115, 660, '11,000.00', { right: true }),
  ];
  const t = rebuildRows(items);
  assert.equal(t.headerFound, false);
  assert.deepEqual(t.rows[0], ['Column 1', 'Column 2', 'Column 3', 'Column 4', 'Column 5']);
  const d = detectLayout(t.rows.slice(1));
  assert.equal(d.sure, false);
  assert.deepEqual(d.roles, ['date', 'narration', 'debit', 'credit', 'balance']);
});
