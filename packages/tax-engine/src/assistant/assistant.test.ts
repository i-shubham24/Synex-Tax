import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkCitations, SECTION_MAP, bestRowFor2025 } from './sections.js';
import { incomeTaxBothRegimes } from './incomeTax.js';
import { capitalGain } from './capitalGains.js';
import { advanceTax } from './advanceTax.js';
import { gstCalc, tdsCalc } from './gstCalc.js';
import { DEED_TEMPLATES, renderDeedHtml, missingDeedFields, deedTemplate } from './deeds.js';
import { parseEfilingNews, parseGstCouncilPress, parseCbicWhatsNew, parseDate } from './feed.js';

const here = __dirname;
const page = (f: string) => {
  const local = path.join(here, 'testdata', f);
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  return fs.readFileSync(path.join(here, '..', '..', 'src', 'assistant', 'testdata', f), 'utf8');
};

test('citations: table sections kept with both numbers, unknown ones removed', () => {
  const r = checkCitations('Under section 393 of the Income-tax Act, 2025 (section 194C of the 1961 Act) tax is deducted. See also section 999Z and section 16 of the CGST Act, and section 87A.');
  assert.deepEqual(r.verified.map((c) => [c.act, c.section]), [['2025', '393'], ['1961', '194C'], ['CGST', '16'], ['UNSPECIFIED', '87A']]);
  assert.equal(r.verified.find((c) => c.section === '87A')!.rows![0].act2025, '156');
  assert.deepEqual(r.removed.map((c) => c.section), ['999Z']);
  assert.match(r.text, /\[section not verified\]/);
  assert.doesNotMatch(r.text, /999Z/);
  // 202 is in both Acts with different meanings: without an Act named it cannot be verified.
  assert.equal(checkCitations('section 202 applies').removed.length, 1);
  assert.equal(checkCitations('section 202 of the Income-tax Act, 2025').verified[0].rows![0].act1961, '115BAC');
  assert.equal(checkCitations('section 43B of the 1961 Act').removed.length, 1);
  // Every row names its source.
  assert.ok(SECTION_MAP.every((r) => r.src));
  assert.equal(bestRowFor2025('393(1) Table 6(i)(a)')!.act1961, '194C');
});

test('income tax: three years, both regimes', () => {
  // FY 2025-26: salary 12.75 lakh, new regime nil after rebate.
  const a = incomeTaxBothRegimes({ year: '2025-26', salary: 1275000 });
  assert.equal(a.NEW.totalTax, '0.00');
  // FY 2024-25: same salary, new regime 3-7 at 5% (20,000) + 7-10 at 10% (30,000) + 10-12 at 15% = 30,000 => 80,000 + 4%.
  const b = incomeTaxBothRegimes({ year: '2024-25', salary: 1275000 });
  assert.equal(b.NEW.taxOnNormal, '80000.00');
  assert.equal(b.NEW.totalTax, '83200.00');
  // Old regime 12.25 lakh after 50,000: 12,500 + 1,00,000 + 67,500 = 1,80,000 + cess.
  assert.equal(b.OLD.totalTax, '187200.00');
  // Marginal relief just above 12 lakh in 2026-27.
  const c = incomeTaxBothRegimes({ year: '2026-27', otherIncome: 1210000 });
  assert.equal(c.NEW.totalTax, '10400.00');
  // Special-rate gains: rebate not set against them in the new regime.
  const d = incomeTaxBothRegimes({ year: '2025-26', otherIncome: 500000, specialGains: [{ amount: 100000, rate: 20, label: 'STCG' }] });
  assert.equal(d.NEW.taxOnSpecial, '20000.00');
  assert.equal(d.NEW.totalTax, '20800.00');
});

test('capital gains: 23 July 2024 change', () => {
  const st = capitalGain({ kind: 'LISTED_EQUITY_STT', acquiredOn: '2024-01-10', transferredOn: '2024-07-22', saleValue: 200000, cost: 100000 });
  assert.equal(st.term, 'SHORT');
  assert.equal(st.rate, 15);
  assert.equal(capitalGain({ kind: 'LISTED_EQUITY_STT', acquiredOn: '2024-01-10', transferredOn: '2024-07-23', saleValue: 200000, cost: 100000 }).rate, 20);
  const lt = capitalGain({ kind: 'LISTED_EQUITY_STT', acquiredOn: '2023-01-10', transferredOn: '2025-02-01', saleValue: 500000, cost: 200000 });
  assert.equal(lt.section1961, '112A');
  assert.equal(lt.exemption, '125000.00');
  assert.equal(lt.tax, '21875.00');
  // Exactly 12 months is still short term.
  assert.equal(capitalGain({ kind: 'LISTED_EQUITY_STT', acquiredOn: '2024-08-01', transferredOn: '2025-08-01', saleValue: 2, cost: 1 }).term, 'SHORT');
  // Land bought 2015-16 (CII 254), sold FY 2025-26 (376): lower of 12.5% plain and 20% indexed.
  const land = capitalGain({ kind: 'LAND_OR_BUILDING', acquiredOn: '2015-06-01', transferredOn: '2025-06-01', saleValue: 10000000, cost: 4000000, residentIndividualOrHuf: true });
  assert.equal(land.indexedCost, '5921259.84');
  assert.equal(land.indexedOption!.tax, '815748.03');
  assert.equal(land.tax, '750000.00'); // 12.5% of 60 lakh is lower
  // Before the change: 20% with indexation.
  const old = capitalGain({ kind: 'OTHER', acquiredOn: '2019-05-01', transferredOn: '2024-05-01', saleValue: 300000, cost: 200000 });
  assert.equal(old.rate, 20);
  assert.equal(old.taxableGain, String((300000 - 200000 * 363 / 289).toFixed(2)));
});

test('advance tax: instalments, 234C and 234B', () => {
  const r = advanceTax({ fyStart: 2025, totalTax: 100000, payments: [{ date: '2025-09-10', amount: 30000 }], balancePaidOn: '2026-07-20' });
  assert.equal(r.liable, true);
  // June: 15,000 short x 3% = 450; Sept: 15,000 short x 3% = 450; Dec: 45,000 x 3% = 1,350; March: 70,000 x 1% = 700.
  assert.deepEqual(r.instalments.map((i) => i.interest234C), ['450.00', '450.00', '1350.00', '700.00']);
  assert.equal(r.interest234C, '2950.00');
  // 234B: 70,000 x 1% x 4 months (April to July).
  assert.equal(r.months234B, 4);
  assert.equal(r.interest234B, '2800.00');
  assert.equal(advanceTax({ fyStart: 2025, totalTax: 9000 }).liable, false);
  const p = advanceTax({ fyStart: 2025, totalTax: 50000, presumptive: true, payments: [{ date: '2026-03-15', amount: 50000 }] });
  assert.equal(p.instalments.length, 1);
  assert.equal(p.interest234C, '0.00');
});

test('GST from net and gross; TDS by code with the 1961 section', () => {
  assert.deepEqual(gstCalc({ amount: 1000, rate: 18, mode: 'NET', interState: false }), { taxableValue: '1000.00', cgst: '90.00', sgst: '90.00', igst: '0.00', totalTax: '180.00', grossValue: '1180.00', rateNote: null });
  const g = gstCalc({ amount: 1050, rate: 5, mode: 'GROSS', interState: true });
  assert.equal(g.taxableValue, '1000.00');
  assert.equal(g.igst, '50.00');
  assert.match(gstCalc({ amount: 100, rate: 12, mode: 'NET', interState: true }).rateNote!, /before 22 September 2025/);
  assert.throws(() => gstCalc({ amount: 100, rate: 7, mode: 'NET', interState: true }));
  const t = tdsCalc({ code: '1023', amount: 40000 });
  assert.deepEqual([t.section1961, t.rate, t.tax, t.applies], ['194C', 1, '400.00', true]);
  assert.equal(tdsCalc({ code: '1027', amount: 40000 }).applies, false);
  assert.equal(tdsCalc({ code: '1031', amount: 1000000, yearToDate: 4500000 }).tax, '500.00');
});

test('deeds: every template renders, marked for review', () => {
  assert.ok(DEED_TEMPLATES.length >= 12);
  for (const t of DEED_TEMPLATES) {
    const v = Object.fromEntries(t.fields.map((f) => [f.key, f.key === 'partners' ? 'Asha Rao, S. Rao, Pune, 60\nRavi Shah, K. Shah, Mumbai, 40' : 'X<1>']));
    const html = renderDeedHtml(t, v, { word: true });
    assert.match(html, /Template for review by the CA/);
    assert.doesNotMatch(html, /X<1>/);
    assert.doesNotMatch(html, /—|--/);
  }
  const p = deedTemplate('partnership-deed')!;
  assert.equal(missingDeedFields(p, {}).length, p.fields.filter((f) => f.required).length);
  assert.match(renderDeedHtml(p, { partners: 'Asha Rao, S. Rao, Pune, 60' }), /Asha Rao: 60%/);
});

test('feed parsers on saved official pages', () => {
  assert.equal(parseDate('06-Nov-2026'), '2026-11-06');
  assert.equal(parseDate('08-10-2026'), '2026-10-08');
  assert.equal(parseDate('31-02-2026'), null);
  const e = parseEfilingNews(page('efiling-latest-news.html'));
  assert.ok(e.length >= 10);
  assert.equal(e[0].date, '2026-11-06');
  assert.equal(e[0].source, 'CBDT');
  assert.equal(e[0].link, 'https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-11/Notification-No-141-2026.pdf');
  assert.match(e[0].text!, /Notification No\. 141\/2026/);
  assert.ok(e.every((i) => i.title && i.link.startsWith('https://')));
  const g = parseGstCouncilPress(page('gstcouncil-press-release.html'));
  assert.deepEqual(g, [{ source: 'GSTC', title: 'Press Release Regarding Recommendations of the 57th Meeting of the GST Council', date: '2026-10-08', link: 'https://gstcouncil.gov.in/sites/default/files/2026-10/press_release.pdf', text: null }]);
  const c = parseCbicWhatsNew(page('cbic-gst-home.html'));
  assert.equal(c[0].title, 'Notification No 03/2026 - HSNS CESS');
  assert.equal(c[0].link, 'https://cbic-gst.gov.in/pdf/Notification%20No%2003_2026%20-%20HSNS%20CESS.pdf');
  assert.equal(c.find((i) => /Advisory No. 09/.test(i.title))!.date, '2026-06-05');
  assert.ok(!c.some((i) => /Circular-No-250/.test(i.link)));
  // incometaxindia.gov.in serves no list in its HTML: nothing to parse there.
  assert.equal(parseEfilingNews(page('incometaxindia-notifications.html')).length, 0);
});
