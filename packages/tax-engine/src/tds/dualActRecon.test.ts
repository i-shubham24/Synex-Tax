import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDualActSection,
  reconcileConsoDualAct,
  generateAutoCorrectionEdits,
} from './dualActRecon.js';
import type { ConsoStatement } from './correction.js';

test('resolves dual-act section mapping accurately between 1961 Act and 2025 Act', () => {
  /* 194C Contractor: Non-corporate (Individual) mapped to 1023 (1%) */
  const indContractor = resolveDualActSection('194C', 'AABPS1234F', 1);
  assert.ok(indContractor);
  assert.equal(indContractor.act2025Code, '1023');
  assert.equal(indContractor.standardRate, 1);

  /* 194C Contractor: Corporate mapped to 1024 (2%) */
  const corpContractor = resolveDualActSection('194C', 'AABCS1234F', 2);
  assert.ok(corpContractor);
  assert.equal(corpContractor.act2025Code, '1024');
  assert.equal(corpContractor.standardRate, 2);

  /* 194J Technical vs Professional */
  const tech = resolveDualActSection('4JA', 'AABCS1234F', 2);
  assert.ok(tech);
  assert.equal(tech.act2025Code, '1026');
  assert.equal(tech.standardRate, 2);

  const prof = resolveDualActSection('4JB', 'AABCS1234F', 10);
  assert.ok(prof);
  assert.equal(prof.act2025Code, '1027');
  assert.equal(prof.standardRate, 10);

  /* 194I Rent: Plant (4IA) vs Land/Building (4IB) */
  const plantRent = resolveDualActSection('4IA', 'AABPS1234F', 2);
  assert.ok(plantRent);
  assert.equal(plantRent.act2025Code, '1008');

  const buildingRent = resolveDualActSection('4IB', 'AABPS1234F', 10);
  assert.ok(buildingRent);
  assert.equal(buildingRent.act2025Code, '1009');
});

test('reconciles TRACES consolidated file with unconsumed challan surplus and Section 201(1A) interest', () => {
  const sampleConso: ConsoStatement = {
    form: '140',
    tan: 'MUMB12345A',
    deductorName: 'Apex Advisory Services Pvt Ltd',
    taxYear: 2026,
    quarter: 3,
    originalToken: '123456789012345',
    previousToken: '123456789012345',
    issues: [],
    bh: [],
    deductor: {
      name: 'Apex Advisory Services Pvt Ltd',
      pan: 'AABCA1234F',
      address: {
        line1: 'Bandra Kurla Complex',
        line2: '',
        line3: '',
        line4: '',
        district: 'Mumbai',
        stateCode: '27',
        pin: '400051',
      },
      email: 'tax@apexadvisory.com',
      phoneCountryCode: '91',
      phone: '9876543210',
      type: 'C',
      gstin: '27AABCA1234F1Z5',
      responsible: {
        name: 'Rahul Sharma',
        designation: 'Director Finance',
        pan: 'AAAPS9999K',
        address: {
          line1: 'BKC',
          line2: '',
          line3: '',
          line4: '',
          district: 'Mumbai',
          stateCode: '27',
          pin: '400051',
        },
        email: 'rahul@apexadvisory.com',
        phoneCountryCode: '91',
        phone: '9876543210',
      },
      government: {
        stateCode: '',
        ministryCode: '',
        ministryOther: '',
        ain: '',
      },
    },
    challans: [
      {
        recordNo: 1,
        nil: false,
        mode: 'C',
        bsr: '0510308',
        challanNo: '00123',
        date: '2026-11-20', /* Deposited after Nov 7 due date for Oct */
        tax: '25000.00',
        interest: '0.00',
        fee: '0.00',
        others: '0.00',
        total: '25000.00',
        minorHead: '0021',
        raw: [],
        deductees: [
          {
            recordNo: 1,
            challanNo: 1,
            mode: 'C',
            pan: 'AAAPS1111B',
            name: 'Sunil Kumar',
            section: '1023',
            paidOn: '2026-10-10',
            amount: '500000.00',
            deducted: '5000.00', /* 1% deducted on 2026-10-10 */
            deposited: '5000.00',
            deductedOn: '2026-10-10',
            rate: '1.0',
            reason: '',
            certificate: '',
            raw: [],
          },
          {
            recordNo: 2,
            challanNo: 1,
            mode: 'C',
            pan: 'PANNOTAVBL', /* Literal missing PAN requiring 20% under Section 206AA */
            name: 'Vendor X',
            section: '1024',
            paidOn: '2026-10-15',
            amount: '100000.00',
            deducted: '2000.00', /* Only 2% deducted instead of 20% */
            deposited: '2000.00',
            deductedOn: '2026-10-15',
            rate: '2.0',
            reason: '',
            certificate: '',
            raw: [],
          },
        ],
      },
    ],
  };

  const report = reconcileConsoDualAct(sampleConso, 'IT_ACT_2025');

  assert.equal(report.tan, 'MUMB12345A');
  assert.equal(report.detectedRegime, 'IT_ACT_2025');
  assert.equal(report.metrics.totalChallans, 1);
  assert.equal(report.metrics.totalDeductees, 2);

  /* Challan surplus check: 25,000 tax deposited - 7,000 allocated = 18,000 unconsumed surplus */
  assert.equal(report.metrics.totalUnconsumedSurplus, '18000.00');
  assert.equal(report.challans[0].status, 'SURPLUS_AVAILABLE');

  /* Short deduction check: Vendor X had 100,000 * 20% = 20,000 expected - 2,000 deducted = 18,000 shortfall */
  assert.equal(report.metrics.totalShortDeduction, '18000.00');

  /* Late deposit interest check: Challan deposited 2026-11-20 (due 2026-11-07), delay exposed */
  assert.ok(parseFloat(report.metrics.totalLateDepositInterest) > 0);

  /* Recommended corrections check */
  assert.ok(report.recommendedCorrections.c2Challans.length > 0);
  assert.ok(report.recommendedCorrections.c3Deductees.length > 0);

  /* Auto correction edits generation check */
  const edits = generateAutoCorrectionEdits(report);
  assert.ok(edits.deductees && edits.deductees.length >= 1);
});
