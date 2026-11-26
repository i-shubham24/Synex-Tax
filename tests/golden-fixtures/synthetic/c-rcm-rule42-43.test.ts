/**
 * Golden fixture (c): rice sheller with RCM inward supplies and Rule 42/43 common credit.
 * The repo has no Rule 42/43 calculator (finding F16), so the first test only checks that the
 * hand computation in expected-results.json follows from the register. The engine tests run the
 * set-off engine, GSTR-9 tables 6/7 and the 17(5) classifier on the same numbers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { GstItcSetOffEngine } from '../../../packages/tax-engine/src/gst/itc-set-off-engine.ts';
import { computeGstr9AnnualReconciliation, type TaxSplit } from '../../../packages/tax-engine/src/gst/gstr9Engine.ts';
import { computeRule42And43 } from '../../../packages/tax-engine/src/gst/rule4243.ts';
import { classifySection175BlockedCredit } from '../../../packages/tax-engine/src/validators/section17-5.ts';
import { validateGstin } from '../../../packages/tax-engine/src/validators/gstin.ts';
import { datasets, parseCsv, readJson, readText } from './fixture-support.ts';

type Heads = { igst: string; cgst: string; sgst: string };
const H = ['igst', 'cgst', 'sgst'] as const;
const zero = () => ({ igst: new Decimal(0), cgst: new Decimal(0), sgst: new Decimal(0) });
const fmt = (h: Record<(typeof H)[number], Decimal>): Heads => ({ igst: h.igst.toFixed(2), cgst: h.cgst.toFixed(2), sgst: h.sgst.toFixed(2) });
const split = (h: Heads): TaxSplit => ({ taxableValue: '0.00', igst: h.igst, cgst: h.cgst, sgst: h.sgst, cess: '0.00' });
const heads = (s: TaxSplit): Heads => ({ igst: s.igst, cgst: s.cgst, sgst: s.sgst });

for (const ds of datasets('c-rcm-rule42-43', 'c')) {
  const client = readJson(ds.dir, 'client.json');
  const exp = readJson(ds.dir, 'expected-results.json');
  const [rh, ...rr] = parseCsv(readText(ds.dir, 'purchase-register-nov-2025.csv'));
  const rows = rr.map((r) => Object.fromEntries(rh.map((h, i) => [h, r[i]])) as Record<string, string>);
  const [ch, ...cr] = parseCsv(readText(ds.dir, 'capital-goods-register.csv'));
  const assets = cr.map((r) => Object.fromEntries(ch.map((h, i) => [h, r[i]])) as Record<string, string>);

  test(`${ds.label}: GSTINs valid; RCM self-invoices present`, () => {
    assert.ok(validateGstin(client.gstin).isValid);
    for (const r of rows) if (r['Supplier GSTIN']) assert.ok(validateGstin(r['Supplier GSTIN']).isValid, r['Supplier GSTIN']);
    assert.deepEqual(rows.filter((r) => r['Reverse Charge'] === 'Y').map((r) => r['Invoice No']), exp.rcm.selfInvoices);
  });

  test(`${ds.label}: F16 production Rule 42/43 engine matches fixture registers and 3B reversals`, () => {
    const out = computeRule42And43({
      exemptTurnoverE: client.outward.exempt.value,
      taxableTurnover: client.outward.taxable.taxableValue,
      inputs: rows.map((r) => ({
        itcType: r['ITC Type'],
        usage: r.Usage,
        igst: r.IGST,
        cgst: r.CGST,
        sgst: r.SGST,
      })),
      capitalGoods: assets.map((a) => ({
        usage: a.Usage,
        igstItc: a['IGST ITC'],
        cgstItc: a['CGST ITC'],
        sgstItc: a['SGST ITC'],
        usefulLifeMonths: Number(a['Useful Life Months']),
      })),
    });
    assert.equal(out.ratioEoverF, exp.turnover.ratioEoverF);
    const r42 = exp.rule42;
    assert.deepEqual(
      [out.rule42.T, out.rule42.T1, out.rule42.T2, out.rule42.T3, out.rule42.C1, out.rule42.T4, out.rule42.C2, out.rule42.D1, out.rule42.C3],
      [r42.T, r42.T1, r42.T2, r42.T3, r42.C1, r42.T4, r42.C2, r42.D1, r42.C3],
    );
    assert.deepEqual(out.rule42.eligibleFromInputs, r42.eligibleFromInputs);
    assert.deepEqual([out.rule43.Tr, out.rule43.Te], [exp.rule43.Tr, exp.rule43.Te]);
    assert.deepEqual(out.gstr3b4B1Rule42Reversal, {
      igst: exp.gstr3b['4B1_reversals'].rule42.igst,
      cgst: exp.gstr3b['4B1_reversals'].rule42.cgst,
      sgst: exp.gstr3b['4B1_reversals'].rule42.sgst,
    });
    assert.deepEqual(out.gstr3b4B1Rule43Reversal, exp.gstr3b['4B1_reversals'].rule43);
  });

  test(`${ds.label}: 17(5) classifier blocks exactly the canteen and the motor car`, () => {
    const blocked = rows.filter((r) => classifySection175BlockedCredit({ hsnOrSacCode: r['HSN/SAC'], description: r.Description }).isBlocked).map((r) => r['Invoice No']);
    assert.deepEqual(blocked, exp.section17_5Blocked);
    assert.deepEqual(rows.filter((r) => r.Usage === 'BLOCKED_17_5').map((r) => r['Invoice No']), exp.section17_5Blocked);
  });

  test(`${ds.label}: set-off pays all RCM in cash and uses IGST credit first (Rule 88A)`, () => {
    const g = exp.gstr3b;
    const r = GstItcSetOffEngine.compute({
      liability: { outward: { ...g.outward, cess: 0 }, rcm: { ...exp.rcm.liability, cess: 0 } },
      itcAvailable: { ...g['4C_net'], cess: 0 },
      turnover: { domesticTaxable: client.outward.taxable.taxableValue, exemptOrNilRated: client.outward.exempt.value },
    });
    const s = exp.setOff;
    assert.equal(r.itcUtilization.igstAgainstCgst.toFixed(2), s.igstAgainstCgst);
    assert.equal(r.itcUtilization.igstAgainstSgst.toFixed(2), s.igstAgainstSgst);
    assert.equal(r.itcUtilization.cgstAgainstCgst.toFixed(2), s.cgstAgainstCgst);
    assert.equal(r.itcUtilization.sgstAgainstSgst.toFixed(2), s.sgstAgainstSgst);
    assert.deepEqual(fmt(r.cashPayable.outward), s.cashOutward);
    assert.deepEqual(fmt(r.cashPayable.rcm), s.cashRcm);
    assert.equal(r.cashPayable.totalCashPayable.toFixed(2), s.totalCashPayable);
    assert.deepEqual(fmt(r.remainingItc), s.remainingItc);
    assert.equal(r.rule86bApplied, s.rule86bApplied);
  });

  const g = exp.gstr3b;
  const gstr9 = computeGstr9AnnualReconciliation({
    financialYear: '2025-26',
    gstin: client.gstin,
    legalName: client.legalName,
    outward: { b2b: { taxableValue: client.outward.taxable.taxableValue, ...g.outward, cess: '0.00' }, exemptNilNonGst: { exempt: client.outward.exempt.value, nilRated: '0', nonGst: '0' } },
    itc: {
      gstr3bTotalItcAvailed: split(g['4A_total']),
      rcmRegistered: split(exp.rcm.registeredSuppliers),
      rcmUnregistered: split(exp.rcm.unregisteredSuppliers),
      reversedRule42: split(g['4B1_reversals'].rule42),
      reversedRule43: split(g['4B1_reversals'].rule43),
      reversedSection17_5: split(g['4B1_reversals'].section17_5),
      itcAsPer2b: split(g['4A5_allOther']),
    },
  });
  const t7 = gstr9.gstr9.table7;
  const t6 = gstr9.gstr9.table6;

  test(`${ds.label}: GSTR-9 table 7 carries the Rule 42, Rule 43 and 17(5) reversals`, () => {
    const e = exp.gstr9.table7;
    assert.deepEqual(
      { rule42: heads(t7.rule42), rule43: heads(t7.rule43), section17_5: heads(t7.section17_5), totalReversed: heads(t7.totalReversed), netItcAvailable: heads(t7.netItcAvailable) },
      e,
    );
    assert.deepEqual([heads(t6.rcmRegistered), heads(t6.rcmUnregistered)], [exp.gstr9.table6.rcmRegistered, exp.gstr9.table6.rcmUnregistered]);
  });

  if (!ds.synthetic) continue;

  test(`${ds.label}: F15 GSTR-9 table 6 total equals 6A (RCM credit counted once)`, () => {
    assert.deepEqual(heads(t6.totalAvailedTable6), exp.gstr9.table6.totalAvailedTable6_equals_6A);
  });
}
