import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRedacted, redactPii, restorePii } from './redact.js';

const SAMPLE = `Notice for 03AAFCP4821K1Z5 (PAN AAFCP4821K, TAN AMRG04217D). Director Aadhaar 2345 6789 0123,
mobile +91 98140 12345 or 9814012345, email accounts@phulkari.in, bank a/c 123456789012 IFSC HDFC0001234.`;

test('every identifier is replaced, the GSTIN before the PAN it contains', () => {
  const r = redactPii(SAMPLE);
  for (const v of ['03AAFCP4821K1Z5', 'AAFCP4821K', 'AMRG04217D', '2345 6789 0123', '98140 12345', 'accounts@phulkari.in', '123456789012', 'HDFC0001234']) {
    assert.ok(!r.text.includes(v), `leaked ${v}`);
  }
  assert.match(r.text, /\[GSTIN_1\]/);
  assert.equal(r.map['[GSTIN_1]'], '03AAFCP4821K1Z5');
  assert.ok(isRedacted(r.text));
  assert.ok(!isRedacted(SAMPLE));
});

test('the same value gets the same placeholder and restores exactly', () => {
  const r = redactPii('PAN AAFCP4821K and again aafcp4821k');
  assert.equal(r.counts.PAN, 1);
  assert.equal(restorePii('Reply about [PAN_1]', r.map), 'Reply about AAFCP4821K');
});

test('ordinary amounts and dates are left alone', () => {
  const r = redactPii('Tax of Rs 1,25,000 due on 20-11-2026 for FY 2026-27, section 393(1)');
  assert.equal(r.text, 'Tax of Rs 1,25,000 due on 20-11-2026 for FY 2026-27, section 393(1)');
});
