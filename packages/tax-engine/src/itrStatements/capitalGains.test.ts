import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCgRow, detectCgLayout, readCgRows, toCgSales, cgRolesFromHeader } from './capitalGains.js';

// Synthetic: tables typed for these tests with the column headings described at the top of
// capitalGains.ts. They are not copies of real reports; scrips, ISINs and figures are invented
// (ISINs only follow the format).

const ZERODHA: string[][] = [
  ['Client ID', 'AB1234'],
  ['Tax P&L Statement from 2025-04-01 to 2026-03-31', '', '', 'Zerodha Broking Ltd'],
  [],
  ['Symbol', 'ISIN', 'Entry Date', 'Exit Date', 'Quantity', 'Buy Value', 'Sell Value', 'Profit', 'Period of Holding', 'Fair Market Value', 'Taxable Profit'],
  ['Short Term Trades'],
  ['ALPHA', 'INE000A01011', '2025-01-10', '2025-08-11', '10', '10000', '12000', '2000', '213', '', '2000'],
  ['Long Term Trades'],
  ['BETA', 'INE000B01012', '2016-05-02', '2025-09-15', '100', '50000', '150000', '100000', '3423', '90000', '60000'],
  ['GAMMA', 'INE000C01013', '2024-06-03', '2025-06-04', '5', '5000', '6500', '1500', '366', '', '1500'],
  ['Total', '', '', '', '', '65000', '168500', '103500'],
  ['Intraday Trades'],
  ['DELTA', 'INE000D01014', '2025-05-05', '2025-05-05', '50', '20000', '20500', '500', '0', '', '500'],
];

test('Zerodha-style tax P&L (synthetic): layout found, intraday skipped, sections classified', () => {
  const layout = detectCgLayout(ZERODHA);
  assert.equal(layout.source, 'ZERODHA');
  assert.equal(layout.header, 3);
  assert.deepEqual(layout.missing, []);
  const read = readCgRows(ZERODHA, layout.header, layout.roles, layout.source);
  assert.equal(read.rows.length, 3);
  assert.equal(read.skipped.length, 1);
  assert.match(read.skipped[0].reason, /business income/);
  assert.ok(read.rows.every((r) => r.asset === 'EQUITY_SHARE'));

  const { sales, issues } = toCgSales(read.rows);
  assert.deepEqual(issues, []);
  assert.deepEqual(sales.map((s) => [s.kind, s.date, s.saleValue, s.cost]), [
    ['111A', '2025-08-11', 12000, 10000],
    ['112A', '2025-09-15', 150000, 50000],
    ['112A', '2025-06-04', 6500, 5000],
  ]);
  assert.equal(sales[1].acquiredBefore1Feb2018, true);
  assert.equal(sales[1].fmv31Jan2018, 90000);
  assert.equal(sales[1].isin, 'INE000B01012');
  assert.equal(sales[2].acquiredBefore1Feb2018, false);
});

const CAMS: string[][] = [
  ['Computer Age Management Services Limited (CAMS)'],
  ['Capital Gain / Loss Statement for the period 01-Apr-2025 to 31-Mar-2026'],
  ['', '', '', '', 'Redemption', '', '', 'Purchase', '', '', '', ''],
  ['Scheme Name', 'ISIN', 'Category', 'Folio No', 'Date', 'Units', 'Amount', 'Date', 'Units', 'Amount', 'Grandfathered NAV as on 31/01/2018', 'Short Term'],
  ['Sample Flexi Cap Fund Growth', 'INF000X01AB1', 'Equity', '1234/56', '12-May-2025', '100.000', '15,000.00', '15-Jan-2017', '100.000', '8,000.00', '110.00', ''],
  ['Sample Short Duration Fund Growth', 'INF000Y01CD2', 'Debt', '7890/12', '10-Jun-2025', '500.000', '60,000.00', '01-Jun-2023', '500.000', '52,000.00', '', '8,000.00'],
  ['Sample Corporate Bond Fund Growth', 'INF000Z01EF3', 'Debt', '7890/13', '10-Jun-2025', '200.000', '30,000.00', '01-Feb-2023', '200.000', '25,000.00', '', ''],
  ['Sample Balanced Advantage Fund', 'INF000W01GH4', 'Hybrid', '7890/14', '10-Jul-2025', '10.000', '1,500.00', '01-Feb-2025', '10.000', '1,400.00', '', '100.00'],
];

test('CAMS-style statement (synthetic): two-row headings, fund categories, 50AA and grandfathering', () => {
  const layout = detectCgLayout(CAMS);
  assert.equal(layout.source, 'CAMS');
  assert.equal(layout.header, 3);
  assert.deepEqual(layout.missing, []);
  assert.equal(layout.roles[4], 'sellDate');
  assert.equal(layout.roles[7], 'buyDate');
  assert.equal(layout.roles[6], 'sellValue');
  assert.equal(layout.roles[9], 'buyValue');
  assert.equal(layout.roles[10], 'fmvPrice');
  const read = readCgRows(CAMS, layout.header, layout.roles, layout.source);
  assert.deepEqual(read.rows.map((r) => r.asset), ['EQUITY_FUND', 'SPECIFIED_FUND', 'OTHER_FUND', 'UNKNOWN']);
  assert.equal(read.rows[0].fmv31Jan2018, 11000);

  const c = read.rows.map(classifyCgRow);
  assert.equal(c[0].kind, '112A');
  assert.equal(c[1].kind, 'STCG'); // section 50AA, bought after 1 Apr 2023
  assert.equal(c[2].kind, 'LTCG'); // bought before 1 Apr 2023, held over 24 months
  assert.equal(c[3].kind, null); // hybrid: user picks

  const { sales, issues } = toCgSales(read.rows);
  assert.equal(sales.length, 3);
  assert.equal(sales[0].fmv31Jan2018, 11000);
  assert.equal(issues.length, 1);
});

test('Groww-style report (synthetic): prices times quantity give values', () => {
  const groww = [
    ['Groww capital gains report'],
    ['Stock name', 'ISIN', 'Quantity', 'Buy date', 'Buy price', 'Sell date', 'Sell price', 'Realised P&L'],
    ['EPSILON', 'INE000E01015', '20', '01/04/2025', '100.50', '01/10/2025', '120.25', '395.00'],
  ];
  const layout = detectCgLayout(groww);
  assert.equal(layout.source, 'GROWW');
  assert.deepEqual(layout.missing, []);
  const read = readCgRows(groww, layout.header, layout.roles, layout.source);
  assert.equal(read.rows[0].buyValue, 2010);
  assert.equal(read.rows[0].sellValue, 2405);
  assert.equal(read.rows[0].reportedGain, 395);
  assert.equal(classifyCgRow(read.rows[0]).kind, '111A');
});

test('Holding periods: 12 months for listed equity, 24 for other fund units, boundary flagged', () => {
  const eq = (buyDate: string, sellDate: string) => classifyCgRow({ asset: 'EQUITY_SHARE', buyDate, sellDate });
  assert.equal(eq('2024-08-01', '2025-08-01').kind, '111A'); // exactly 12 months: not more than 12
  assert.equal(eq('2024-08-01', '2025-08-02').kind, '112A');
  assert.equal(eq('2024-08-01', '2025-08-02').nearBoundary, true);
  const fund = (buyDate: string, sellDate: string) => classifyCgRow({ asset: 'OTHER_FUND', buyDate, sellDate });
  assert.equal(fund('2023-01-01', '2025-01-01').kind, 'STCG');
  assert.equal(fund('2023-01-01', '2025-06-01').kind, 'LTCG');
  assert.equal(classifyCgRow({ asset: 'EQUITY_SHARE', buyDate: '2023-01-01', sellDate: '2024-07-01' }).kind, null); // before 23 Jul 2024
});

test('Unknown headings leave roles for the mapping step', () => {
  const roles = cgRolesFromHeader(['Col A', 'Col B', 'Col C']);
  assert.deepEqual(roles, ['ignore', 'ignore', 'ignore']);
  assert.equal(detectCgLayout([['a', 'b'], ['1', '2']]).header, -1);
});
