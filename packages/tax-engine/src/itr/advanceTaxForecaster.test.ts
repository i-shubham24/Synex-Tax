import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAdvanceTaxForecast, roundDown100 } from './advanceTaxForecaster.js';

test('roundDown100: rounds down under Rule 119A', () => {
  assert.equal(roundDown100(new (require('decimal.js'))(12590)).toNumber(), 12500);
  assert.equal(roundDown100(new (require('decimal.js'))(99)).toNumber(), 0);
  assert.equal(roundDown100(new (require('decimal.js'))(500)).toNumber(), 500);
});

test('Senior citizen without business income is exempt under Section 207(2)', () => {
  const result = computeAdvanceTaxForecast({
    financialYear: '2026-27',
    taxpayerCategory: 'SENIOR_CITIZEN',
    hasBusinessIncome: false,
    isPresumptive: false,
    estimatedGrossTax: 250000,
    tdsCredits: 20000,
  });

  assert.equal(result.isExemptSeniorCitizen, true);
  assert.equal(result.isLiableForAdvanceTax, false);
  assert.equal(result.totalInterest234C, '0.00');
  assert.equal(result.totalInterest234B, '0.00');
  assert.equal(result.totalInterest, '0.00');
});

test('Tax liability below Rs 10,000 threshold under Section 208 is not liable', () => {
  const result = computeAdvanceTaxForecast({
    financialYear: '2026-27',
    taxpayerCategory: 'INDIVIDUAL',
    hasBusinessIncome: false,
    isPresumptive: false,
    estimatedGrossTax: 25000,
    tdsCredits: 18000, /* Net assessed tax = 7,000 < 10,000 */
  });

  assert.equal(result.isLiableForAdvanceTax, false);
  assert.equal(result.assessedTax, '7000.00');
  assert.equal(result.totalInterest, '0.00');
});

test('Regular assessee: computes 234C quarterly deferment and safe harbour cushion', () => {
  /* Assessed tax = 1,00,000
   * Q1: due 15,000 (safe 12,000), paid 10,000 -> shortfall 5,000 -> 3 months * 1% = 150
   * Q2: due 45,000 (safe 36,000), paid 30,000 (cum 40,000) -> 40,000 >= 36,000 safe harbour -> 0 interest
   * Q3: due 75,000 (safe 75,000), paid 35,000 (cum 75,000) -> fully met -> 0 interest
   * Q4: due 100,000 (safe 100,000), paid 15,000 (cum 90,000) -> shortfall 10,000 -> 1 month * 1% = 100
   * Total 234C = 250
   * Paid by 31 March = 90,000 >= 90% of 100,000 -> 234B is 0!
   */
  const result = computeAdvanceTaxForecast({
    financialYear: '2026-27',
    taxpayerCategory: 'INDIVIDUAL',
    hasBusinessIncome: true,
    isPresumptive: false,
    estimatedGrossTax: 120000,
    tdsCredits: 20000, /* Assessed tax = 100,000 */
    advanceTaxPaid: {
      upToJune15: 10000,
      upToSept15: 30000,
      upToDec15: 35000,
      upToMarch15: 15000,
    },
  });

  assert.equal(result.assessedTax, '100000.00');
  assert.equal(result.isLiableForAdvanceTax, true);
  assert.equal(result.installments.length, 4);
  assert.equal(result.installments[0].interest234C, '150.00');
  assert.equal(result.installments[1].interest234C, '0.00');
  assert.equal(result.installments[2].interest234C, '0.00');
  assert.equal(result.installments[3].interest234C, '100.00');
  assert.equal(result.totalInterest234C, '250.00');
  assert.equal(result.is234BApplicable, false);
  assert.equal(result.totalInterest234B, '0.00');
  assert.equal(result.totalInterest, '250.00');
});

test('Section 234B triggers when advance tax paid by 31 March is under 90%', () => {
  /* Assessed tax = 2,00,000. 90% is 1,80,000.
   * Paid by March 31 = 1,00,000.
   * Shortfall 234B = 1,00,000.
   * Months = 4 (default April to July).
   * 234B Interest = 1,00,000 * 1% * 4 = 4,000.
   */
  const result = computeAdvanceTaxForecast({
    financialYear: '2026-27',
    taxpayerCategory: 'COMPANY',
    hasBusinessIncome: true,
    isPresumptive: false,
    estimatedGrossTax: 250000,
    tdsCredits: 50000,
    advanceTaxPaid: {
      upToJune15: 20000,
      upToSept15: 30000,
      upToDec15: 30000,
      upToMarch15: 20000,
    },
  });

  assert.equal(result.assessedTax, '200000.00');
  assert.equal(result.is234BApplicable, true);
  assert.equal(result.shortfall234B, '100000.00');
  assert.equal(result.totalInterest234B, '4000.00');
});

test('Presumptive business under Section 44AD has single installment on 15 March', () => {
  const result = computeAdvanceTaxForecast({
    financialYear: '2026-27',
    taxpayerCategory: 'INDIVIDUAL',
    hasBusinessIncome: true,
    isPresumptive: true,
    estimatedGrossTax: 60000,
    tdsCredits: 10000, /* Assessed tax = 50,000 */
    advanceTaxPaid: {
      upToMarch15: 30000, /* Shortfall = 20,000 */
    },
  });

  assert.equal(result.isPresumptive, true);
  assert.equal(result.installments.length, 1);
  assert.equal(result.installments[0].statutoryPercent, 100);
  assert.equal(result.installments[0].shortfallAmount, '20000.00');
  assert.equal(result.installments[0].interest234C, '200.00'); /* 1% for 1 month */
  assert.equal(result.totalInterest234C, '200.00');
});
