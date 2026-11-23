import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CLAUSE12_SECTIONS, CLAUSE19_SECTIONS, ICDS_CODES, UNBUILT_CLAUSES, maskPan, taxAuditApplicability, writeForm3cd } from '@synextax/tax-engine';
import { publicMessage } from '../plugins/publicError.js';

const MAX = 99_999_999_999_999; // the schema's largest amount (14 digits)
const Amount = z.number().int().min(0).max(MAX);
const Signed = z.number().int().min(-MAX).max(MAX);
const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Text = (max: number) => z.string().trim().max(max);
const Req = (max: number) => z.string().trim().min(1).max(max);
const Pan = z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/);
const Aadhaar = z.string().regex(/^\d{12}$/);
const Tan = z.string().trim().toUpperCase().regex(/^[A-Z]{4}\d{5}[A-Z]$/);
const Rows = <T extends z.ZodTypeAny>(t: T, max = 500) => z.array(t).max(max);
const YN = z.enum(['Y', 'N']);

const Address = z.object({ line1: Req(100), line2: Text(100).optional(), city: Req(50), stateCode: z.string().regex(/^\d{2}$/), pin: Req(10), countryCode: z.string().regex(/^\d{1,4}$/).optional() });
const Described = z.object({ description: Req(150), amount: Signed });
const Effect = z.object({ particulars: Req(100), increase: Amount, decrease: Amount });
const Party = { name: Req(125), address: Req(150), pan: Pan.optional(), aadhaar: Aadhaar.optional() };
const Payee = z.object({ date: Iso, amount: Amount, nature: Text(100).optional(), name: Req(125), pan: Pan.optional(), aadhaar: Aadhaar.optional(), address: Address, taxDeducted: Amount.optional(), taxDeposited: Amount.optional() });
const Pay40A3 = z.object({ date: Iso, nature: Req(100), amount: Amount, name: Req(125), pan: Pan.optional(), aadhaar: Aadhaar.optional() });
const Liab = z.object({ section: z.enum(['43B', '43Ba', '43Bb', '43Bc', '43Bd', '43Bda', '43Be', '43Bf', '43Bg', '43Bh']), nature: Req(100), amount: Amount });
const Mode = z.string().regex(/^[A-Z]{1,6}$/);
const ChequeType = z.enum(['APC', 'APBD', 'OM']).optional();
const Ratio = z.object({ turnover: Amount, grossProfit: Signed.optional(), netProfit: Signed.optional(), stockInTrade: Amount.optional(), materialConsumed: Amount.optional(), finishedGoodsProduced: Amount.optional() });
const OtherAudit = z.object({ status: z.enum(['Y', 'N', 'X']), details: Text(500).optional() });

const PartB = z.object({
  clause9: z.object({ partners: Rows(z.object({ name: Req(100), share: z.number().min(0).max(99.99) }), 200), sharesIndeterminate: YN.optional(), changes: Rows(z.object({ date: Iso, name: Req(125), type: z.enum(['ADD', 'DEL', 'CHANGE']), oldShare: z.number().min(0).max(100).optional(), newShare: z.number().min(0).max(100).optional(), remarks: Text(300) }), 200) }).optional(),
  clause10: z.object({ codes: Rows(z.string().regex(/^\d{5}(_\d)?$/), 50), changes: Rows(z.object({ change: z.enum(['Added', 'Discontinued']), code: z.string().regex(/^\d{5}(_\d)?$/) }), 50) }).optional(),
  clause11: z.object({ prescribed: Rows(Req(100), 50), maintained: Rows(z.object({ books: Req(100), address: Address }), 50), examined: Rows(Req(100), 50) }).optional(),
  clause12: z.object({ rows: Rows(z.object({ section: z.enum(CLAUSE12_SECTIONS), otherSection: Text(100).optional(), amount: Signed }), 20) }).optional(),
  clause13: z.object({ method: z.enum(['01', '02']), changes: Rows(Effect, 50), icdsAdjustments: Rows(z.object({ icds: z.enum(ICDS_CODES), increase: Amount, decrease: Amount }), 50), disclosures: Rows(z.object({ icds: z.enum(ICDS_CODES).optional(), text: Req(2000) }), 20) }).optional(),
  clause14: z.object({ method: z.enum(['1', '2', '3']), deviations145A: Rows(Effect, 50) }).optional(),
  clause16: z.object({ section28: Rows(Described, 100), credits: Rows(z.object({ code: z.string().regex(/^0[1-9]$/), other: Text(50).optional(), amount: Signed }), 100), escalation: Rows(Described, 100), otherIncome: Rows(Described, 100), capitalReceipts: Rows(Described, 100) }).optional(),
  clause17: z.object({ properties: Rows(z.object({ details: Req(100), address: Address, consideration: Amount, valuation: Amount, provisoApplies: z.boolean() }), 100) }).optional(),
  clause18: z.object({ blocks: Rows(z.object({
    method: z.enum(['WDV', 'SLM']).optional(), block: z.string().regex(/^\d{1,2}$/), rate: z.number().min(0).max(100), openingWdv: Amount, goodwillAdjustment: Signed.optional(),
    additions: Rows(z.object({ purchaseDate: Iso, putToUseDate: Iso, value: Amount, cenvat: Signed.optional(), exchangeRate: Signed.optional(), subsidy: Signed.optional(), lessThan180Days: z.boolean() })),
    deductions: Rows(z.object({ saleDate: Iso, amount: Amount, outOfLessThan180DayAdditions: z.boolean() })),
    otherAdjustments: Signed.optional(), depreciationAllowable: Amount.optional(),
  }), 60) }).optional(),
  clause19: z.object({ rows: Rows(z.object({ section: z.enum(CLAUSE19_SECTIONS), other: Text(250).optional(), debited: Amount, admissible: Amount }), 50) }).optional(),
  clause20: z.object({ bonus: Rows(Described, 100), employeeContributions: Rows(z.object({ fund: z.enum(['PROVIDENT', 'SUPERAN', 'GRATUITY', 'PROV1948', 'OTHERWELFARE']), received: Amount, dueDate: Iso, paid: Amount, paidOn: Iso.optional() })) }).optional(),
  clause21: z.object({
    debited: Rows(z.object({ type: z.enum(['CAPITAL', 'PERSONAL', 'ADVERTISMNT', 'CLUBFEE', 'CLUBSERVICE', 'PENALTY', 'OTHERPENALTY', 'UNDERLAW', 'OFFENCE', 'SETTLE']), particulars: Req(125), amount: Amount })),
    s40a: z.object({
      nonResidentNotDeducted: Rows(Payee), nonResidentNotPaid: Rows(Payee), residentNotDeducted: Rows(Payee), residentNotPaid: Rows(Payee), levyNotDeducted: Rows(Payee), levyNotPaid: Rows(Payee), salaryOutsideIndia: Rows(Payee),
      fringeBenefitTax: Amount.optional(), wealthTax: Amount.optional(), royaltyIib: Amount.optional(), providentFundIv: Amount.optional(), perquisiteTaxV: Amount.optional(),
    }),
    s40b: Rows(z.object({ particulars: z.enum(['Interest', 'Salary', 'Bonus', 'Commission', 'Remuneration']), section: z.enum(['40b', '40ba']), debited: Amount, admissible: Amount, inadmissible: Amount, remarks: Text(100) }), 100),
    s40A3: Rows(Pay40A3), s40A3A: Rows(Pay40A3),
    gratuity40A7: Amount.optional(), employer40A9: Amount.optional(), contingent: Rows(Described, 100), section14A: Rows(Described, 100), interest36_1_iii: Amount.optional(),
  }).optional(),
  clause22: z.object({ interestInadmissible: Amount, payableToMicroSmall: Amount, paidInTime: Amount, notPaidInTime: Amount }).optional(),
  clause26: z.object({ preExistingPaid: Rows(Liab), preExistingUnpaid: Rows(Liab), currentPaid: Rows(Liab), currentUnpaid: Rows(Liab), indirectTaxThroughPl: z.boolean(), note: Text(100).optional() }).optional(),
  clause31: z.object({
    loans269SS: Rows(z.object({ ...Party, amount: Amount, squaredUp: YN, maxOutstanding: Amount, mode: Mode, specify: Text(100).optional(), chequeType: ChequeType })),
    specifiedSums269SS: Rows(z.object({ ...Party, amount: Amount, mode: Mode, specify: Text(100).optional(), chequeType: ChequeType })),
    receipts269STCash: Rows(z.object({ ...Party, nature: Req(100), amount: Amount, date: Iso })),
    receipts269STCheque: Rows(z.object({ ...Party, amount: Amount })),
    payments269STCash: Rows(z.object({ ...Party, nature: Req(100), amount: Amount, date: Iso })),
    payments269STCheque: Rows(z.object({ ...Party, amount: Amount })),
    repayments269T: Rows(z.object({ ...Party, amount: Amount, maxOutstanding: Amount, mode: Mode, specify: Text(125).optional(), chequeType: ChequeType })),
    repaymentsReceivedCash: Rows(z.object({ ...Party, amount: Amount })),
    repaymentsReceivedCheque: Rows(z.object({ ...Party, amount: Amount })),
  }).optional(),
  clause34: z.object({
    required: z.boolean(),
    rows: Rows(z.object({ tan: Tan, section: z.string().max(8), nature: Req(125), totalAmount: Amount, requiredAmount: Amount, specifiedRateAmount: Amount, specifiedRateTax: Amount, lowerRateAmount: Amount, lowerRateTax: Amount, notDeposited: Amount })),
    statementsRequired: z.boolean(),
    statements: Rows(z.object({ tan: Tan, form: z.string().max(6), dueDate: Iso, filedOn: Iso.optional(), allReported: z.boolean(), notReported: Text(100).optional() }), 200),
    interest: z.enum(['Y', 'N', 'X']),
    interestRows: Rows(z.object({ tan: Tan, interestPayable: Amount, interestPaid: Amount, paidOn: Iso.optional() }), 50),
  }).optional(),
  clause37: OtherAudit.optional(),
  clause38: OtherAudit.optional(),
  clause39: OtherAudit.optional(),
  clause40: z.object({ previous: Ratio, preceding: Ratio }).optional(),
  clause44: z.object({ total: Amount, exempt: Amount, composition: Amount, otherRegistered: Amount, unregistered: Amount }).optional(),
});

const Form3cdBody = z.object({
  form: z.enum(['3CA', '3CB']),
  assessee: z.object({
    firstName: Text(25).optional(), middleName: Text(25).optional(), name: Req(75), pan: Pan, aadhaar: Aadhaar.optional(),
    status: z.number().int().min(1).max(12), address: Address,
    indirectTax: Rows(z.object({ type: z.enum(['CED', 'SED', 'SET', 'SAT', 'GST', 'CD', 'OIT']), regNo: Text(25).optional(), stateCode: z.string().regex(/^\d{2}$/).optional(), other: Text(125).optional() }), 50),
  }),
  previousYear: z.object({ from: Iso, to: Iso }).optional(),
  clause8: z.array(z.enum(['44ABa', '44ABAA', '44ABb', '44ABci', '44ABcii', '44ABciii', '44ABd', '44ABe', '44AB3'])).min(1).max(9),
  clause8A: z.object({ opted: z.boolean(), section: z.enum(['115BA', '115BAA', '115BAB', '115BAC', '115BAD', '115BAE']).optional() }).optional(),
  auditor: z.object({
    firstName: Text(25).optional(), middleName: Text(25).optional(), lastName: Req(75), membershipNo: z.string().regex(/^\d{6}$/), firmName: Text(125).optional(),
    firmRegNo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,8}$/).optional(), signsForFirm: z.boolean(), address: Address, place: Req(35), signedOn: Iso,
  }),
  accountType: z.enum(['Profit and loss account', 'Income and expenditure account']),
  form3CA: z.object({ act: z.string().regex(/^\d{2}$/), otherAct: Text(250).optional(), auditReportDate: Iso, statutoryAuditor: z.enum(['SELF', 'OTHER']), statutoryAuditorName: Req(125) }).optional(),
  form3CB: z.object({ headOffice: Req(150), branches: z.number().int().min(0).max(999), result: z.enum(['Profit', 'Loss', 'Surplus', 'Deficit']), comments: z.object({ kind: z.enum(['Observations', 'Comments', 'Discrepancies', 'Inconsistencies']), text: Req(2000) }).optional() }).optional(),
  observations: Rows(z.object({ code: z.string().regex(/^\d{2}$/), text: Req(1000) }), 50).optional(),
  partB: PartB,
  notApplicable: z.array(z.enum(UNBUILT_CLAUSES)).max(UNBUILT_CLAUSES.length).optional(),
});

const ApplicabilityBody = z.object({
  business: z.object({
    turnover: Amount, totalReceipts: Amount.optional(), cashReceipts: Amount.optional(), totalPayments: Amount.optional(), cashPayments: Amount.optional(),
    presumptive44AD: z.object({ declaredIncome: Signed, digitalTurnover: Amount }).optional(),
    section44AD4Applies: z.boolean().optional(), lowerThanDeemed44AE: z.boolean().optional(), lowerThanDeemed44BB: z.boolean().optional(), lowerThanDeemed44BBB: z.boolean().optional(),
  }).optional(),
  profession: z.object({ grossReceipts: Amount, cashReceipts: Amount.optional(), presumptive44ADA: z.object({ declaredIncome: Signed }).optional() }).optional(),
  incomeAboveExemption: z.boolean().optional(),
  auditedUnderOtherLaw: z.boolean().optional(),
});

function invalid(error: z.ZodError) {
  const paths = [...new Set(error.issues.map((i) => i.path.join('.') || 'body'))];
  return { error: 'Invalid', message: `Missing or not valid: ${paths.slice(0, 8).join(', ')}.` };
}

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const PAN_IN_TEXT = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const maskText = (s: string) => s.replace(PAN_IN_TEXT, (p) => maskPan(p));

/**
 * Tax audit report (Form 3CA or 3CB with Form 3CD) for AY 2026-27, to the Department's schema V2.5.
 * Nothing is stored. The file carries the software ID (ITR_SOFTWARE_ID) that the Department issues
 * to a registered e-return intermediary, as the ITR routes do; without it the file is not written.
 * PANs are masked everywhere in the reply except inside the file itself, which must carry them.
 */
export async function taxAuditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
  });

  fastify.get('/status', async (_request, reply) => reply.send({
    softwareIdConfigured: /^SW\d{8}$/.test(process.env.ITR_SOFTWARE_ID ?? ''),
    assessmentYear: '2026-27',
    schema: 'FORM3CA3CD_3CB3CD_MainSchema V2.5',
    clausesNotBuilt: UNBUILT_CLAUSES,
  }));

  fastify.post('/applicability', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const b = ApplicabilityBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send(invalid(b.error));
    try {
      return reply.send(taxAuditApplicability(b.data));
    } catch (err) {
      request.log.error({ err }, 'tax audit applicability failed');
      return reply.status(500).send({ error: 'Internal Server Error', message: publicMessage(err) });
    }
  });

  fastify.post('/form3cd', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, bodyLimit: 4 * 1024 * 1024 }, async (request, reply) => {
    const b = Form3cdBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send(invalid(b.error));
    try {
      const out = writeForm3cd({
        ...b.data,
        softwareId: process.env.ITR_SOFTWARE_ID ?? '',
        createdOn: istToday(),
        intermediaryCity: process.env.ITR_INTERMEDIARY_CITY ?? b.data.auditor.address.city,
      });
      const issues = out.issues.map((i) => ({ field: i.field, message: maskText(i.message) }));
      if (!out.json) return reply.status(422).send({ error: 'Not ready', issues, clausesNeeded: out.clausesNeeded, summary: out.summary });
      return reply.send({ fileName: `Form${b.data.form}_3CD_AY2026-27_${maskPan(b.data.assessee.pan)}.json`, json: out.json, summary: out.summary });
    } catch (err) {
      request.log.error({ err }, 'tax audit report failed');
      return reply.status(500).send({ error: 'Internal Server Error', message: publicMessage(err) });
    }
  });
}
