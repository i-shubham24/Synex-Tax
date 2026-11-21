import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTasks } from './tasks.js';
import { clientLedger, feeInvoiceNumber, feeInvoiceTax } from './fees.js';

const clients = [
  { entityId: 'e1', name: 'Golden Gate', gstins: [{ gstin: '03AAACG1234B1ZM', category: 'REGULAR_MONTHLY' }], tans: [{ tan: 'AMRG04217D', forms: ['140' as const, '138' as const] }] },
  { entityId: 'e2', name: 'Kirana Store', gstins: [{ gstin: '03AABCL1234F1Z8', category: 'QRMP' }], tans: [] },
  { entityId: 'e3', name: 'Dhaba', gstins: [{ gstin: '03AAHFJ3310M1Z1', category: 'COMPOSITION_10_1' }], tans: [] },
];

test('tasks from registrations: monthly, QRMP, composition and TDS due dates', () => {
  const t = generateTasks(clients, '2026-12-01', '2027-01-31');
  const pick = (name: string) => t.filter((x) => x.clientName === name).map((x) => `${x.title} @ ${x.dueDate}`);
  assert.deepEqual(pick('Golden Gate'), [
    'Deposit TDS deducted in Nov 2026 @ 2026-12-07',
    'GSTR-1 for Nov 2026 @ 2026-12-11',
    'GSTR-3B for Nov 2026 @ 2026-12-20',
    'Deposit TDS deducted in Dec 2026 @ 2027-01-07',
    'GSTR-1 for Dec 2026 @ 2027-01-11',
    'GSTR-3B for Dec 2026 @ 2027-01-20',
    'Form 138 statement for Q3 2026-27 @ 2027-01-31',
    'Form 140 statement for Q3 2026-27 @ 2027-01-31',
  ]);
  // Punjab QRMP: GSTR-3B on the 24th; IFF and PMT-06 only in the first two months of a quarter.
  assert.deepEqual(pick('Kirana Store'), ['IFF (optional) for Nov 2026 @ 2026-12-13', 'PMT-06 tax payment for Nov 2026 @ 2026-12-25', 'GSTR-1 for Q3 2026-27 @ 2027-01-13', 'GSTR-3B for Q3 2026-27 @ 2027-01-24']);
  assert.deepEqual(pick('Dhaba'), ['CMP-08 for Q3 2026-27 @ 2027-01-18']);
  // Keys are stable, so a second run over an overlapping window adds only new ones.
  const again = generateTasks(clients, '2027-01-01', '2027-01-31');
  assert.ok(again.every((x) => t.some((y) => y.key === x.key)));
});

test('composition annual return falls due on 30 April', () => {
  const t = generateTasks([clients[2]], '2027-04-01', '2027-04-30');
  assert.deepEqual(t.map((x) => [x.title, x.dueDate]), [['CMP-08 for Q4 2026-27', '2027-04-18'], ['GSTR-4 for 2026-27', '2027-04-30']]);
});

test('fee invoices: CGST and SGST within the state, IGST across, bill of supply when unregistered', () => {
  const lines = [{ sac: '998231', description: 'GST returns, Oct to Dec', amount: 9000 }, { sac: '998222', description: 'Bookkeeping', amount: 1000 }];
  assert.deepEqual(feeInvoiceTax({ firmGstin: '03AAACG1234B1ZM', firmState: '03', clientState: '03', lines }), {
    kind: 'TAX_INVOICE', taxable: '10000.00', cgst: '900.00', sgst: '900.00', igst: '0.00', total: '11800.00',
    lines: [{ sac: '998231', description: 'GST returns, Oct to Dec', amount: '9000.00' }, { sac: '998222', description: 'Bookkeeping', amount: '1000.00' }],
  });
  assert.equal(feeInvoiceTax({ firmGstin: '03AAACG1234B1ZM', firmState: '03', clientState: '07', lines }).igst, '1800.00');
  assert.equal(feeInvoiceTax({ firmGstin: null, firmState: '03', clientState: '03', lines }).kind, 'BILL_OF_SUPPLY');
  assert.equal(feeInvoiceNumber('sxt', 2026, 7), 'SXT/26-27/0007');
  assert.ok(feeInvoiceNumber('SYNEX', 2026, 12345).length <= 16);
});

test('client ledger: running balance and ageing, oldest invoices settled first', () => {
  const l = clientLedger(
    [
      { date: '2026-06-01', kind: 'INVOICE', reference: 'SXT/26-27/0001', amount: '11800' },
      { date: '2026-09-15', kind: 'INVOICE', reference: 'SXT/26-27/0004', amount: '5900' },
      { date: '2026-10-05', kind: 'RECEIPT', reference: 'R1', amount: '10000' },
      { date: '2026-11-10', kind: 'INVOICE', reference: 'SXT/26-27/0009', amount: '2360' },
    ],
    '2026-11-21',
  );
  assert.equal(l.outstanding, '10060.00');
  // 1,800 left on the June invoice (over 90 days), 5,900 from September (31 to 90), 2,360 from November.
  assert.deepEqual(l.ageing, { upTo30: '2360.00', days31to90: '5900.00', over90: '1800.00' });
  assert.equal(l.oldestUnpaidDays, 173);
});
