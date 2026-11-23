import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessForeignRemittance15CaCb, type RemittanceInput } from './remittance15CaCb.js';

const SAMPLE_REMITTER = {
  name: 'Amritsar Silk Mills Pvt Ltd',
  pan: 'AABCA1234F',
  tan: 'AMRG04217D',
  status: 'COMPANY' as const,
  address: { line1: 'GT Road', city: 'Amritsar', stateCode: '03', pin: '143001' },
  email: 'accounts@amritsarsilk.com',
  phone: '9876543210',
};

test('Form 15CA Part C & 15CB: Royalty payment to Singapore with valid TRC yields 10% DTAA rate', () => {
  const input: RemittanceInput = {
    remitter: SAMPLE_REMITTER,
    beneficiary: {
      name: 'CloudScale Technologies Pte Ltd',
      countryCode: 'SG',
      foreignTaxId: 'T19LL1234K',
      address: { line1: 'Marina Boulevard', city: 'Singapore', country: 'Singapore' },
      hasPeInIndia: false,
      hasTrc: true,
      hasForm10F: true,
    },
    nature: 'ROYALTY',
    currency: 'USD',
    foreignAmount: 20000,
    exchangeRateInr: 86.5,
    proposedDate: '2026-11-25',
    aggregateRemittanceThisFyInr: 1000000,
  };

  const res = assessForeignRemittance15CaCb(input);

  /* Over 5L and chargeable => Part C & 15CB mandatory */
  assert.equal(res.form15CaPart, 'PART_C');
  assert.equal(res.isForm15CbRequired, true);

  /* DTAA treaty relief under Section 90(2): 10% Singapore DTAA rate wins over 20% domestic rate */
  assert.equal(res.taxDetermination.finalApplicableRate, 10.0);
  assert.equal(res.taxDetermination.rateBasis, 'DTAA_TREATY');

  /* Amounts: 20,000 * 86.5 = 1,730,000 INR; 10% TDS = 173,000 INR; Net = 1,557,000 INR */
  assert.equal(res.amounts.totalAmountInr, '1730000.00');
  assert.equal(res.amounts.grossTdsInr, '173000.00');
  assert.equal(res.amounts.netPayableInr, '1557000.00');

  /* Form 15CB Certificate populated */
  assert.ok(res.form15CbCertificate);
  assert.equal(res.form15CbCertificate.taxDeductionSummary.rate, 10.0);
  assert.equal(res.auditAlerts.length, 0);
});

test('Form 15CA Part D: Overseas sales commission without Indian PE is not chargeable', () => {
  const input: RemittanceInput = {
    remitter: SAMPLE_REMITTER,
    beneficiary: {
      name: 'London Trade Agency LLP',
      countryCode: 'GB',
      address: { line1: 'Oxford Street', city: 'London', country: 'United Kingdom' },
      hasPeInIndia: false,
      hasTrc: true,
      hasForm10F: true,
    },
    nature: 'COMMISSION',
    currency: 'GBP',
    foreignAmount: 5000,
    exchangeRateInr: 108.0,
    proposedDate: '2026-11-28',
  };

  const res = assessForeignRemittance15CaCb(input);

  assert.equal(res.form15CaPart, 'PART_D');
  assert.equal(res.isForm15CbRequired, false);
  assert.equal(res.isChargeableInIndia, false);
  assert.equal(res.amounts.grossTdsInr, '0.00');
});

test('Form 15CA Part A: Chargeable remittance under 5 Lakhs does not require 15CB', () => {
  const input: RemittanceInput = {
    remitter: SAMPLE_REMITTER,
    beneficiary: {
      name: 'Alpha Software Inc',
      countryCode: 'US',
      address: { line1: 'Silicon Valley', city: 'San Jose', country: 'United States' },
      hasPeInIndia: false,
      hasTrc: true,
      hasForm10F: true,
    },
    nature: 'FTS',
    currency: 'USD',
    foreignAmount: 2000,
    exchangeRateInr: 86.5,
    proposedDate: '2026-11-28',
    aggregateRemittanceThisFyInr: 0,
  };

  const res = assessForeignRemittance15CaCb(input);

  /* 2000 * 86.5 = 173,000 INR <= 500,000 INR => Part A */
  assert.equal(res.form15CaPart, 'PART_A');
  assert.equal(res.isForm15CbRequired, false);
});
