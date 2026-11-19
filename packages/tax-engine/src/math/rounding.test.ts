import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import {
  roundGstSection170,
  roundItActSection516,
  roundInterestBaseRule269,
} from './rounding.js';

test('roundGstSection170: Nearest Re 1 rounding', () => {
  assert.equal(roundGstSection170('100.49').toString(), '100');
  assert.equal(roundGstSection170('100.50').toString(), '101');
  assert.equal(roundGstSection170('100.51').toString(), '101');
  assert.equal(roundGstSection170('0.49').toString(), '0');
  assert.equal(roundGstSection170('0.50').toString(), '1');
  assert.equal(roundGstSection170(12450.499).toString(), '12450');
  assert.equal(roundGstSection170(new Decimal('84321.75')).toString(), '84322');
});

test('roundItActSection516: Step 1 drop paise, Step 2 round to nearest Rs 10', () => {
  // Classic statutory case: 29994.70 -> 29994 -> 29990
  assert.equal(roundItActSection516('29994.70').toString(), '29990');
  
  // Verify paise is dropped first, NOT rounded up to 29995 which would result in 30000
  assert.equal(roundItActSection516('29994.99').toString(), '29990');
  
  // 29995.10 -> 29995 -> 30000
  assert.equal(roundItActSection516('29995.10').toString(), '30000');
  
  // Exact boundaries
  assert.equal(roundItActSection516('1234.00').toString(), '1230');
  assert.equal(roundItActSection516('1235.00').toString(), '1240');
  assert.equal(roundItActSection516('1230.00').toString(), '1230');
  
  // Edge amounts below 10
  assert.equal(roundItActSection516('4.99').toString(), '0');
  assert.equal(roundItActSection516('5.00').toString(), '10');
  assert.equal(roundItActSection516('9.99').toString(), '10');
});

test('roundInterestBaseRule269: Truncate down to nearest multiple of Rs 100', () => {
  assert.equal(roundInterestBaseRule269('14589.50').toString(), '14500');
  assert.equal(roundInterestBaseRule269('99.99').toString(), '0');
  assert.equal(roundInterestBaseRule269('100.00').toString(), '100');
  assert.equal(roundInterestBaseRule269('199.99').toString(), '100');
  assert.equal(roundInterestBaseRule269('200.00').toString(), '200');
  assert.equal(roundInterestBaseRule269('200.01').toString(), '200');
  assert.equal(roundInterestBaseRule269('0').toString(), '0');
});
