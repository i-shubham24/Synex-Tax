import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBankLines, maskNarration, parseBankStatement, partyFromNarration, tallyVoucherXml } from './statement.js';

const STATEMENT = [
  'Statement of account',
  'Account No: XXXXXXXX1234',
  'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  '01/10/26,UPI/DR/627412345678/LUDHIANA TRADERS/YESB/ludhiana@ybl/Payment,0000627412345678,01/10/26,"11,800.00",,"88,200.00"',
  '03/10/26,NEFT CR-HDFC0000123-DELHI MART-INV 102,N276261234567,03/10/26,,"1,57,500.00","2,45,700.00"',
  '07/10/26,GST PAYMENT CPIN 26100300012345,,07/10/26,"9,660.00",,"2,36,040.00"',
  '15/10/26,SMS ALERT CHARGES,,15/10/26,17.70,,"2,36,022.30"',
  '20/10/26,ATM WDL 501234567890 AMRITSAR,,20/10/26,"5,000.00",,"2,31,022.30"',
  '25/10/26,RANDOM TRANSFER 99,,25/10/26,"1,000.00",,"2,25,022.30"',
].join('\n');

test('bank statement: heading found under title rows, amounts and balances read, a gap caught', () => {
  const s = parseBankStatement(STATEMENT);
  assert.equal(s.lines.length, 6);
  assert.equal(s.opening, '100000.00');
  assert.deepEqual(s.totals, { debit: '27477.70', credit: '157500.00' });
  // 2,31,022.30 less 1,000 is 2,30,022.30, not 2,25,022.30.
  assert.deepEqual(s.issues.map((i) => i.line), [9]);
});

test('ledgers from rules and parties, cash as contra', () => {
  const c = classifyBankLines(parseBankStatement(STATEMENT).lines);
  assert.deepEqual(c.map((l) => [l.ledger, l.voucherType]), [
    ['LUDHIANA TRADERS', 'Payment'],
    ['DELHI MART', 'Receipt'],
    ['GST Payable', 'Payment'],
    ['Bank Charges', 'Payment'],
    ['Cash', 'Contra'],
    [null, 'Payment'],
  ]);
  assert.equal(partyFromNarration('IMPS/P2A/627400001111/HARPREET KAUR/SBIN'), 'HARPREET KAUR');
  assert.equal(maskNarration('ATM WDL 501234567890 AMRITSAR'), 'ATM WDL XXXXXXXX7890 AMRITSAR');
});

test('Tally XML: payment credits the bank, receipt debits it, unknown lines go to suspense', () => {
  const c = classifyBankLines(parseBankStatement(STATEMENT).lines);
  const x = tallyVoucherXml(c, { company: 'Golden Gate & Co', bankLedger: 'HDFC Bank' });
  assert.match(x, /<SVCURRENTCOMPANY>Golden Gate &amp; Co<\/SVCURRENTCOMPANY>/);
  assert.match(x, /<VOUCHER VCHTYPE="Payment" ACTION="Create"><DATE>20261001<\/DATE>.*?<LEDGERNAME>LUDHIANA TRADERS<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-11800.00<\/AMOUNT>.*?<LEDGERNAME>HDFC Bank<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>11800.00<\/AMOUNT>/);
  assert.match(x, /VCHTYPE="Receipt".*?<LEDGERNAME>HDFC Bank<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-157500.00<\/AMOUNT>/);
  assert.match(x, /<LEDGERNAME>Suspense<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-1000.00<\/AMOUNT>/);
  assert.equal((x.match(/<VOUCHER /g) ?? []).length, 6);
});
