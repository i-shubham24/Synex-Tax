import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCertificates } from './certificates.js';

const cert = { id: 'c1', certificateNo: 'ABCDE12345', pan: 'ABCPK1234L', sectionCode: '1027', ratePercent: '2', amountLimit: '500000', validFrom: '2026-04-01', validTo: '2027-03-31' };
const row = (id: string, over: object) => ({ id, pan: 'ABCPK1234L', name: 'Dr Kaur', sectionCode: '1027', paidOn: '2026-07-01', amountPaid: '200000', taxDeducted: '4000', reasonCode: 'A', certificateNo: 'ABCDE12345', ...over });

test('certificate rows: limit used in date order, rate floor, validity, section and holder', () => {
  const { findings, usage } = checkCertificates(
    [
      row('r1', {}),
      row('r2', { paidOn: '2026-08-01' }),
      row('r3', { paidOn: '2026-09-01', amountPaid: '200000', taxDeducted: '4000' }), // wholly beyond the limit
      row('r4', { paidOn: '2027-04-05' }), // after validity
      row('r5', { taxDeducted: '1000', paidOn: '2026-06-01' }), // 0.5%, below 2%
      row('r6', { certificateNo: 'ZZZZZ99999' }),
      row('r7', { reasonCode: null }), // not a certificate row
    ],
    [cert],
  );
  const by = (id: string) => findings.filter((f) => f.rowId === id).map((f) => f.message).join(' | ');
  assert.equal(by('r1'), '');
  assert.ok(!by('r5').includes('beyond'));
  // Date order: r5 (June) 2 lakh, r1 (July) 4 lakh, r2 (August) 6 lakh crosses by 1 lakh, r3 is all beyond.
  assert.match(by('r2'), /Rs 100000 of this payment is beyond/);
  assert.match(by('r3'), /Rs 200000 of this payment is beyond/);
  assert.match(by('r4'), /outside the certificate’s validity/);
  assert.match(by('r5'), /below the certificate rate of 2.00%/);
  assert.match(by('r6'), /not in the register/);
  assert.equal(by('r7'), '');
  assert.deepEqual([usage[0].rows, usage[0].used, usage[0].remaining], [5, '1000000.00', '0.00']);
});
