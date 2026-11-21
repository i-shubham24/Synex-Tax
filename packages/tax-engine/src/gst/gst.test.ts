import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gstr1Summary, matchSalesHeader, parseSalesRegister } from './salesRegister.js';
import { cmp08, cmp08DueDate, gstr4Annual } from './composition.js';

const SUPPLIER = '03AAACG1234B1ZM'; // Punjab

const register = [
  'Sales Register October 2026',
  'Invoice No\tDate\tParty Name\tGSTIN\tPlace of Supply\tTaxable Value\tRate\tIGST\tCGST\tSGST\tInvoice Value\tType',
  'GG/101\t05/10/2026\tLudhiana Traders\t03AABCL1234F1Z8\t03-Punjab\t10,000.00\t18\t0\t900\t900\t11800\tINV',
  'GG/102\t06-10-2026\tDelhi Mart\t\tDelhi\t1,50,000\t5\t7500\t0\t0\t157500\tINV',
  'GG/103\t07 Oct 2026\tWalk-in\t\t03\t2000\t18\t0\t180\t180\t2360\tINV',
  'GG/104\t08/10/2026\tWalk-in\t\t03\t1000\t18\t0\t90\t90\t1180\tINV',
  'CN/1\t09/10/2026\tLudhiana Traders\t03AABCL1234F1Z8\t03\t1000\t18\t0\t90\t90\t1180\tCredit Note',
  'GG/105\t10/10/2026\tWrong Tax\t\t07\t1000\t18\t0\t90\t90\t1180\tINV',
  'GG/101\t11/10/2026\tDuplicate\t\t03\t1000\t18\t0\t90\t90\t1180\tINV',
  'Total\t\t\t\t\t165000\t\t7500\t1350\t1350\t\t',
].join('\n');

test('sales register headers from common exports are recognised', () => {
  assert.equal(matchSalesHeader('Voucher No.'), 'invoiceNo');
  assert.equal(matchSalesHeader('Party GSTIN'), 'customerGstin');
  assert.equal(matchSalesHeader('Place of Supply'), 'pos');
  assert.equal(matchSalesHeader('Taxable Value'), 'taxableValue');
  assert.equal(matchSalesHeader('State/UT Tax'), 'sgst');
});

test('sales register: classified for GSTR-1, tax split checked against place of supply, duplicates caught', () => {
  const { rows, missing } = parseSalesRegister(register, { supplierGstin: SUPPLIER, period: '2026-10' });
  assert.deepEqual(missing, []);
  const ok = rows.filter((r) => r.invoice).map((r) => [r.invoice!.invoiceNo, r.invoice!.section, r.invoice!.table, r.invoice!.pos]);
  assert.deepEqual(ok, [
    ['GG/101', 'B2B', '4A', '03'],
    ['GG/102', 'B2CL', '5', '07'],
    ['GG/103', 'B2CS', '7', '03'],
    ['GG/104', 'B2CS', '7', '03'],
    ['CN/1', 'CDNR', '9B', '03'],
  ]);
  const bad = rows.filter((r) => !r.invoice);
  assert.match(bad[0].errors.join(' '), /another state: charge IGST/);
  assert.match(bad[1].errors.join(' '), /appears again/);
});

test('GSTR-1 summary by table and rate, credit notes reduce it', () => {
  const { rows } = parseSalesRegister(register, { supplierGstin: '03AAACG1234B1ZM', period: '2026-10' });
  const s = gstr1Summary(rows.filter((r) => r.invoice).map((r) => r.invoice!));
  assert.deepEqual(s.lines.map((l) => [l.section, l.pos, l.rate, l.documents, l.taxableValue]), [
    ['B2B', null, 18, 1, '10000.00'],
    ['B2CL', null, 5, 1, '150000.00'],
    ['B2CS', '03', 18, 2, '3000.00'],
    ['CDNR', null, 18, 1, '-1000.00'],
  ]);
  assert.deepEqual(s.totals, { taxableValue: '162000.00', igst: '7500.00', cgst: '1080.00', sgst: '1080.00', cess: '0.00', tax: '9660.00' });
});

test('CMP-08: rate by kind, exempt turnover only where the rule counts it, interest at 18% a year', () => {
  assert.equal(cmp08DueDate(2026, 3), '2027-01-18');
  const trader = cmp08({ kind: 'TRADER', fyStart: 2026, quarter: 2, taxableTurnover: 900000, exemptTurnover: 100000 });
  assert.deepEqual([trader.base, trader.outward.cgst, trader.total, trader.dueDate], ['900000.00', '4500.00', '9000.00', '2026-10-18']);
  const restaurant = cmp08({ kind: 'RESTAURANT', fyStart: 2026, quarter: 2, taxableTurnover: 900000, exemptTurnover: 100000, rcmCgst: 900, rcmSgst: 900, paidOn: '2026-11-17' });
  // 5% of 10,00,000 = 50,000, plus 1,800 reverse charge; 30 days late at 18%: 51,800 x 0.18 x 30 / 365.
  assert.deepEqual([restaurant.base, restaurant.total, restaurant.daysLate, restaurant.interest], ['1000000.00', '51800.00', 30, '766.36']);
  const annual = gstr4Annual(2026, [trader, cmp08({ kind: 'TRADER', fyStart: 2026, quarter: 1, taxableTurnover: 500000 })], 9000);
  assert.deepEqual([annual.declared.total, annual.missingQuarters, annual.balance, annual.dueDate], ['14000.00', ['Q3', 'Q4'], '5000.00', '2027-04-30']);
});
