import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAis, matchAis, classify, AisImportError, type AisReturnInput } from './ais.js';

/**
 * Hand-built AIS in the shape assumed by the parser: a taxpayer block, information lines with code,
 * description, source and amount, and transaction rows below some of them. The real layout is not
 * published; the second file uses other key names and nesting to show the parser does not rely on one.
 */
const ais = {
  PAN: 'ABCPK1234L',
  Name: 'MEERA KULKARNI',
  FinancialYear: '2025-26',
  PartB: {
    TDS_TCS: [
      {
        InformationCode: 'TDS-192', InformationDescription: 'Salary received (Section 192)', InformationSource: 'PUNE TECH PVT LTD (PNEA12345B)', Count: 2, Amount: 2400000,
        Transactions: [
          { Quarter: 'Q1', DateOfPaymentCredit: '30/06/2025', AmountPaidCredited: 1200000, TDSDeducted: 165000, Status: 'Active' },
          { Quarter: 'Q3', DateOfPaymentCredit: '31/12/2025', AmountPaidCredited: 1200000, TDSDeducted: 165000, Status: 'Active' },
        ],
      },
      {
        InformationCode: 'TDS-194A', InformationDescription: 'Interest other than interest on securities', InformationSource: 'STATE BANK OF INDIA', TAN: 'PNES12345C', Amount: 60000,
        Transactions: [
          { Quarter: 'Q2', DateOfPaymentCredit: '2025-09-30', AmountPaidCredited: '40,000', TDSDeducted: 4000, Status: 'Active' },
          { Quarter: 'Q4', DateOfPaymentCredit: '2026-03-31', AmountPaidCredited: 20000, TDSDeducted: 2000, Status: 'Active' },
          { Quarter: 'Q4', DateOfPaymentCredit: '2026-03-31', AmountPaidCredited: 20000, TDSDeducted: 2000, Status: 'Inactive' },
        ],
      },
      { InformationCode: 'TDS-194', InformationDescription: 'Dividend', InformationSource: 'INFOSYS LIMITED', TAN: 'BLRI12345D', Amount: 30000, TDSDeducted: 3000 },
      { InformationCode: 'TCS-206C(1G)', InformationDescription: 'Overseas tour package', InformationSource: 'TRAVEL CO', TAN: 'MUMT12345E', Amount: 700000, TCSCollected: 35000 },
    ],
    SFT: [
      { SFTCode: 'SFT-016(SB)', InformationDescription: 'Interest from savings bank', InformationSource: 'STATE BANK OF INDIA', ReporterPAN: 'AAACS8577K', Amount: 15500 },
      // The same deposit interest the bank reported under TDS-194A; it must not be counted twice.
      { SFTCode: 'SFT-016(TD)', InformationDescription: 'Interest from deposit', InformationSource: 'STATE BANK OF INDIA', ReporterPAN: 'AAACS8577K', Amount: 60000 },
      { SFTCode: 'SFT-015', InformationDescription: 'Dividend', InformationSource: 'INFOSYS LIMITED', Amount: 30000 },
      { SFTCode: 'SFT-017(LES)', InformationDescription: 'Sale of listed equity share', InformationSource: 'ZERODHA BROKING', Amount: 1200000, CostOfAcquisition: 700000 },
      { SFTCode: 'SFT-018(EMF)', InformationDescription: 'Sale of units of equity oriented mutual fund', InformationSource: 'CAMS', Amount: 300000 },
      { SFTCode: 'SFT-005', InformationDescription: 'Time deposits', InformationSource: 'STATE BANK OF INDIA', Amount: 1000000 },
      { SFTCode: 'SFT-017(Pur)', InformationDescription: 'Purchase of securities', InformationSource: 'ZERODHA BROKING', Amount: 500000 },
    ],
    TaxPayments: [
      { InformationDescription: 'Advance tax', BSRCode: '0002390', DateOfDeposit: '12-Dec-2025', ChallanSerialNumber: '00011', Amount: 100000 },
      { InformationDescription: 'Self assessment tax', BSRCode: '0510308', DateOfDeposit: '20-Jul-2026', ChallanSerialNumber: '00042', Amount: 25000 },
    ],
    Others: [{ InformationDescription: 'Interest on income tax refund', InformationSource: 'INCOME TAX DEPARTMENT', Amount: 1200 }],
  },
};

const ret: AisReturnInput = {
  salary: { employers: [{ tan: 'PNEA12345B', name: 'Pune Tech Pvt Ltd', gross: 2400000, tds: 330000 }] },
  otherSources: { savingsInterest: 15000, depositInterest: 45000, dividends: 30000 },
  capitalGains: [{ kind: '111A', saleValue: 500000 }, { kind: '112A', saleValue: 1000000 }],
  tdsOther: [{ tan: 'PNES12345C', name: 'SBI', section: '94A', amount: 60000, tds: 6000 }, { tan: 'DELX12345Z', name: 'Unknown Payer', section: '94A', amount: 1000, tds: 100 }],
  tcs: [],
  taxPayments: [{ bsr: '0002390', date: '2025-12-12', serial: 11, amount: 100000, kind: 'ADVANCE' }],
};

test('Parser reads codes, sources, transactions, skips inactive rows, masks PANs', () => {
  const a = parseAis(JSON.stringify(ais));
  assert.equal(a.taxpayer.pan, 'XXXXX1234L');
  assert.equal(a.taxpayer.financialYear, '2025-26');
  assert.equal(a.inactiveSkipped, 1);
  const sal = a.lines.filter((l) => l.category === 'salary');
  assert.equal(sal.length, 2);
  assert.equal(sal[0].sourceId, 'PNEA12345B'); // TAN taken from the brackets in the source name
  assert.equal(sal[0].date, '2025-06-30');
  assert.equal(sal[0].taxDeducted, 165000);
  const dep = a.lines.filter((l) => l.category === 'depositInterest');
  assert.equal(dep.find((l) => l.code === 'TDS-194A')?.amount, 40000);
  assert.equal(dep.find((l) => l.code === 'SFT-016(TD)')?.sourceId, 'XXXXX8577K');
  assert.equal(a.lines.find((l) => l.category === 'tcs')?.taxDeducted, 35000);
  assert.equal(a.lines.find((l) => l.code === 'SFT-005')?.category, 'deposit');
  assert.equal(a.lines.find((l) => l.code === 'SFT-017(Pur)')?.category, 'purchase');
  assert.equal(a.lines.find((l) => l.code === 'SFT-017(LES)')?.cost, 700000);
  const adv = a.lines.find((l) => l.category === 'taxPayment' && l.bsr === '0002390');
  assert.equal(adv?.date, '2025-12-12');
  assert.equal(adv?.challan, '00011');
  assert.equal(a.lines.find((l) => l.category === 'refundInterest')?.amount, 1200);
  // Every line got a category.
  assert.equal(a.unclassified, 0);
  // Payments without a source did not inherit the taxpayer's name.
  assert.equal(adv?.source, '');
});

test('Matcher: matched, different and missing lines, with add-to-return where it maps cleanly', () => {
  const m = matchAis(parseAis(ais), ret);
  const row = (key: string) => m.rows.find((r) => r.key === key)!;
  assert.equal(row('sal:PNEA12345B').status, 'MATCHED');
  assert.equal(row('sal:PNEA12345B').aisTax, 330000);
  // 15,500 against 15,000: more than Rs 100 and more than 1%.
  const sav = row('inc:savingsInterest');
  assert.equal(sav.status, 'DIFFERENT');
  assert.deepEqual(sav.add, { type: 'otherSources', field: 'savingsInterest', amount: 15500 });
  // Deposit interest reported under TDS-194A and SFT-016(TD) by the same bank counts once: 60,000.
  const dep = row('inc:depositInterest+otherInterest');
  assert.equal(dep.aisAmount, 60000);
  assert.equal(dep.status, 'DIFFERENT');
  assert.deepEqual(dep.add, { type: 'otherSources', field: 'depositInterest', amount: 60000 });
  assert.equal(row('inc:dividend').status, 'MATCHED');
  assert.equal(row('inc:dividend').aisAmount, 30000);
  const rfi = row('inc:refundInterest');
  assert.equal(rfi.status, 'MISSING_IN_RETURN');
  assert.deepEqual(rfi.add, { type: 'otherSources', field: 'refundInterest', amount: 1200 });
  // 12,00,000 + 3,00,000 against 5,00,000 + 10,00,000 in the return; no add action for gains.
  const cg = row('inc:securitiesSale+mutualFundSale');
  assert.equal(cg.status, 'MATCHED');
  assert.equal(cg.add, undefined);
  // TDS by deductor TAN.
  assert.equal(row('tds:PNES12345C').status, 'MATCHED');
  const inf = row('tds:BLRI12345D');
  assert.equal(inf.status, 'MISSING_IN_RETURN');
  assert.deepEqual(inf.add, { type: 'tdsOther', tan: 'BLRI12345D', name: 'INFOSYS LIMITED', section: '194', amount: 30000, tds: 3000, head: 'OS' });
  assert.equal(row('tds:ret:1').status, 'NOT_IN_AIS');
  assert.deepEqual(row('tcs:MUMT12345E').add, { type: 'tcs', tan: 'MUMT12345E', name: 'TRAVEL CO', tcs: 35000 });
  // Advance tax matched by BSR code and challan number; self-assessment tax missing.
  assert.equal(row('pay:0').status, 'MATCHED');
  assert.deepEqual(row('pay:1').add, { type: 'taxPayment', bsr: '0510308', date: '2026-07-20', serial: 42, amount: 25000, kind: 'SELF' });
  // Deposits and purchases are listed for information only.
  assert.deepEqual(m.information.map((l) => l.code).sort(), ['SFT-005', 'SFT-017(Pur)']);
  assert.ok(m.summary.missing >= 4);
  assert.ok(m.summary.different >= 2);
});

test('Employer missing from the return gets an add action; tolerance can be widened', () => {
  const m = matchAis(parseAis(ais), { otherSources: { savingsInterest: 15000 } }, { absolute: 1000, percent: 0 });
  const sal = m.rows.find((r) => r.key === 'sal:PNEA12345B')!;
  assert.equal(sal.status, 'MISSING_IN_RETURN');
  assert.deepEqual(sal.add, { type: 'employer', tan: 'PNEA12345B', name: 'PUNE TECH PVT LTD (PNEA12345B)', gross: 2400000, tds: 330000 });
  assert.equal(m.rows.find((r) => r.key === 'inc:savingsInterest')!.status, 'MATCHED');
});

test('A return with only a gross salary is compared in total', () => {
  const m = matchAis(parseAis(ais), { salary: { gross: 2400000 } });
  const sal = m.rows.find((r) => r.key === 'sal:total')!;
  assert.equal(sal.status, 'MATCHED');
  assert.equal(sal.aisTax, 330000);
  assert.ok(!m.rows.some((r) => r.key === 'sal:PNEA12345B'));
});

test('Other key names and nesting are read too', () => {
  const other = {
    taxpayerInfo: { pan: 'ABCPK1234L', fy: '2025-26' },
    information: {
      tdsTcsInformation: { items: [{ infoCode: 'TDS-194-IA', infoDesc: 'Payment on transfer of certain immovable property', deductorName: 'R SHARMA', deductorTan: 'DELR12345F', details: [{ date: '15-Jan-2026', amountPaid: 5000000, taxDeducted: 50000, status: 'ACTIVE' }] }] },
      sftInformation: { items: [{ code: 'SFT-016(SB)', description: 'Interest income', source: 'HDFC BANK', value: '2,345.60' }] },
    },
  };
  const a = parseAis(other);
  const prop = a.lines.find((l) => l.category === 'propertySale')!;
  assert.equal(prop.section, '194IA');
  assert.equal(prop.amount, 5000000);
  assert.equal(prop.date, '2026-01-15');
  assert.equal(a.lines.find((l) => l.category === 'savingsInterest')?.amount, 2346);
  const m = matchAis(a, {});
  assert.deepEqual(m.rows.find((r) => r.key === 'tds:DELR12345F')?.add, { type: 'tdsOther', tan: 'DELR12345F', name: 'R SHARMA', section: '4IA', amount: 5000000, tds: 50000, head: 'NA' });
});

test('Classifier: codes before descriptions', () => {
  assert.equal(classify('SFT-016(TD)', 'Interest')?.category, 'depositInterest');
  assert.equal(classify('SFT-018(Pur)', 'Purchase of units')?.category, 'purchase');
  assert.equal(classify('SFT-012', 'Purchase of immovable property')?.category, 'purchase');
  assert.equal(classify('', 'Rent received', '194I(B)')?.category, 'rent');
  assert.equal(classify('TDS-194J', 'Fees for professional services', '194J')?.category, 'businessReceipts');
  assert.equal(classify('', 'Something unknown'), undefined);
});

test('Rejects files that cannot be read', () => {
  assert.throws(() => parseAis('U2FsdGVkX1' + 'A'.repeat(50)), /password protected/);
  assert.throws(() => parseAis({ blob: 'A'.repeat(3000) }), /encrypted/);
  assert.throws(() => parseAis({ a: 1 }), AisImportError);
  let deep: unknown = { Amount: 1, InformationCode: 'SFT-015' };
  for (let k = 0; k < 60; k++) deep = { a: deep };
  assert.throws(() => parseAis(deep), /nested/);
});
