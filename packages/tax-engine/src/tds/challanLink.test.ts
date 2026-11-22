import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkRowsToChallans } from './challanLink.js';

test('rows link to the challan that paid their month: exact totals first, then in date order; misfits reported', () => {
  const r = linkRowsToChallans(
    [
      { key: 'oct1', deductedOn: '2026-10-05', tax: '6000' },
      { key: 'oct2', deductedOn: '2026-10-20', tax: '1000' },
      { key: 'nov1', deductedOn: '2026-11-10', tax: '3000' },
      { key: 'nov2', deductedOn: '2026-11-25', tax: '2000' },
      { key: 'dec1', deductedOn: '2026-12-10', tax: '9000' },
    ],
    [
      { key: 'c-oct', depositedOn: '2026-11-07', tax: '7000' }, // exactly October's 7,000
      { key: 'c-nov-a', depositedOn: '2026-12-05', tax: '3500' },
      { key: 'c-nov-b', depositedOn: '2026-12-07', tax: '2000' },
      { key: 'c-dec', depositedOn: '2027-01-07', tax: '5000' }, // too small for December's 9,000 row
    ],
  );
  assert.deepEqual(r.links, { oct1: 'c-oct', oct2: 'c-oct', nov1: 'c-nov-a', nov2: 'c-nov-b' });
  assert.deepEqual(r.unlinked.map((u) => u.key), ['dec1']);
  assert.deepEqual(r.challanBalance, { 'c-oct': '0.00', 'c-nov-a': '500.00', 'c-nov-b': '0.00', 'c-dec': '5000.00' });
});

test('a challan dated before the month began is never used for it', () => {
  const r = linkRowsToChallans([{ key: 'x', deductedOn: '2026-12-10', tax: '100' }], [{ key: 'old', depositedOn: '2026-11-07', tax: '100' }]);
  assert.deepEqual(r.links, {});
  assert.match(r.unlinked[0].reason, /No challan dated in or after 2026-12/);
});
