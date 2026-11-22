import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ITR_TDS_SECTIONS, writeItr1, writeItr2, writeItr4 } from '@synextax/tax-engine';

const Amount = z.number().min(0).max(99_999_999_999);
const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Tan = z.string().trim().toUpperCase().regex(/^[A-Z]{4}\d{5}[A-Z]$/);

const Itr1Body = z.object({
  ageBand: z.enum(['BELOW_60', 'SENIOR', 'SUPER_SENIOR']).optional(),
  person: z.object({
    firstName: z.string().trim().max(25).optional(),
    middleName: z.string().trim().max(25).optional(),
    surname: z.string().trim().min(1).max(75),
    pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/),
    dob: Iso,
    employerCategory: z.enum(['CGOV', 'SGOV', 'PSU', 'PE', 'PESG', 'PEPS', 'PEO', 'OTH', 'NA']),
    address: z.object({ residenceNo: z.string().trim().min(1).max(50), locality: z.string().trim().min(1).max(50), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/) }),
    mobile: z.string().regex(/^\d{10}$/),
    email: z.string().trim().email().max(125),
    fatherName: z.string().trim().min(1).max(125),
    place: z.string().trim().min(1).max(50),
  }),
  filing: z.object({ section: z.union([z.literal(11), z.literal(12), z.literal(17)]), regime: z.enum(['NEW', 'OLD']), originalAck: z.string().regex(/^\d{15}$/).optional(), originalFiledOn: Iso.optional() }),
  salary: z.object({ gross: Amount, professionalTax: Amount.optional(), employers: z.array(z.object({ tan: Tan, name: z.string().trim().min(1).max(125), incomeChargeable: Amount, tds: Amount })).max(10) }).optional(),
  house: z.object({ letOut: z.boolean(), address: z.string().trim().min(1).max(50), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/), rent: Amount.optional(), municipalTax: Amount.optional(), interest: Amount.optional() }).optional(),
  otherSources: z.object({ savingsInterest: Amount.optional(), depositInterest: Amount.optional(), dividends: Amount.optional(), other: Amount.optional(), otherDescription: z.string().trim().max(125).optional() }).optional(),
  ltcg112A: z.object({ saleValue: Amount, cost: Amount }).optional(),
  deductions: z.object({ section80C: Amount.optional(), section80D: Amount.optional(), section80CCD1B: Amount.optional() }).optional(),
  tdsOther: z.array(z.object({ tan: Tan, name: z.string().trim().min(1).max(125), section: z.string().trim().max(8), amount: Amount, tds: Amount })).max(50).optional(),
  tcs: Amount.optional(),
  taxPayments: z.array(z.object({ bsr: z.string().regex(/^\d{7}$/), date: Iso, serial: z.number().int().min(0).max(99999), amount: Amount, kind: z.enum(['ADVANCE', 'SELF']) })).max(20).optional(),
  interest234C: Amount.optional(),
  bank: z.object({ ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/), name: z.string().trim().min(1).max(125), account: z.string().trim().regex(/^[A-Za-z0-9/-]{5,20}$/), type: z.enum(['SB', 'CA', 'CC', 'OD', 'NRO', 'OTH']) }),
});

const FIELD_LABEL: Record<string, string> = {
  surname: 'surname', pan: 'PAN', dob: 'date of birth', residenceNo: 'flat or house number', locality: 'area', city: 'city', stateCode: 'state code', pin: 'PIN code',
  mobile: 'mobile', email: 'email', fatherName: "father's name", place: 'place', tan: 'TAN', ifsc: 'IFSC', name: 'bank or employer name', account: 'account number',
};

const Pan = z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/);
const Person = z.object({
  firstName: z.string().trim().max(25).optional(),
  middleName: z.string().trim().max(25).optional(),
  surname: z.string().trim().min(1).max(75),
  pan: Pan,
  dob: Iso,
  employerCategory: z.enum(['CGOV', 'SGOV', 'PSU', 'PE', 'PESG', 'PEPS', 'PEO', 'OTH', 'NA']).optional(),
  address: z.object({ residenceNo: z.string().trim().min(1).max(50), locality: z.string().trim().min(1).max(50), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/) }),
  mobile: z.string().regex(/^\d{10}$/),
  email: z.string().trim().email().max(125),
  fatherName: z.string().trim().min(1).max(125),
  place: z.string().trim().min(1).max(50),
});
const Filing = z.object({ section: z.union([z.literal(11), z.literal(12), z.literal(17)]), regime: z.enum(['NEW', 'OLD']), originalAck: z.string().regex(/^\d{15}$/).optional(), originalFiledOn: Iso.optional() });
const Bank = z.object({ ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/), name: z.string().trim().min(1).max(125), account: z.string().trim().regex(/^[A-Za-z0-9/-]{5,20}$/), type: z.enum(['SB', 'CA', 'CC', 'OD', 'NRO', 'OTH']) });
const TdsOther = z.object({ tan: Tan, name: z.string().trim().min(1).max(125), section: z.enum(ITR_TDS_SECTIONS), amount: Amount, tds: Amount, head: z.enum(['BP', 'HP', 'OS', 'NA']).optional() });
const Tcs = z.object({ tan: Tan, name: z.string().trim().min(1).max(125), tcs: Amount });
const Payment = z.object({ bsr: z.string().regex(/^\d{7}$/), date: Iso, serial: z.number().int().min(0).max(99999), amount: Amount, kind: z.enum(['ADVANCE', 'SELF']) });
const Loan = z.object({ from: z.enum(['B', 'I']), lender: z.string().trim().min(1).max(125), account: z.string().trim().regex(/^[A-Za-z0-9/-]{1,20}$/), sanctionedOn: Iso, amount: Amount, outstanding: Amount, interest: Amount });
const Insurer = z.object({ name: z.string().trim().min(1).max(125), policy: z.string().trim().min(1).max(75), amount: Amount });
const Deductions = z.object({
  section80C: z.array(z.object({ amount: Amount, id: z.string().trim().min(1).max(50) })).max(20).optional(),
  section80CCD1B: Amount.optional(),
  section80D: z.object({
    selfFamily: z.object({ premium: Amount, checkup: Amount.optional(), seniorCitizen: z.boolean().optional(), insurers: z.array(Insurer).max(10) }).optional(),
    parents: z.object({ premium: Amount, checkup: Amount.optional(), seniorCitizen: z.boolean(), insurers: z.array(Insurer).max(10) }).optional(),
  }).optional(),
});
const Receipts = z.object({ code: z.string().regex(/^\d{5}(_\d)?$/), name: z.string().trim().min(1).max(75), digital: Amount, cash: Amount, otherMode: Amount.optional(), declaredDigital: Amount.optional(), declaredOther: Amount.optional(), declared: Amount.optional() });

const Itr4Body = z.object({
  person: Person,
  filing: Filing.extend({ form10IEA: z.object({ assessmentYear: z.enum(['2024-25', '2025-26', '2026-27']), ack: z.string().regex(/^\d{15}$/), date: Iso.optional() }).optional() }),
  salary: z.object({ gross: Amount, professionalTax: Amount.optional(), employers: z.array(z.object({ tan: Tan, name: z.string().trim().min(1).max(125), incomeChargeable: Amount, tds: Amount })).max(10) }).optional(),
  house: z.object({ letOut: z.boolean(), address: z.string().trim().min(1).max(50), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/), rent: Amount.optional(), municipalTax: Amount.optional(), loans: z.array(Loan).max(5).optional() }).optional(),
  otherSources: z.object({ savingsInterest: Amount.optional(), depositInterest: Amount.optional(), dividends: Amount.optional(), other: Amount.optional(), otherDescription: z.string().trim().max(125).optional() }).optional(),
  ltcg112A: z.object({ saleValue: Amount, cost: Amount }).optional(),
  business: z.object({
    ad: Receipts.optional(),
    ada: Receipts.optional(),
    ae: z.object({ code: z.string().regex(/^\d{5}$/), name: z.string().trim().min(1).max(75), vehicles: z.array(z.object({ regNo: z.string().trim().min(1).max(11), ownership: z.enum(['OWN', 'LEASE', 'HIRED']), tonnage: z.number().int().min(0).max(100), months: z.number().int().min(1).max(12), declared: Amount.optional() })).max(20) }).optional(),
    gstins: z.array(z.object({ gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]{3}$/), turnover: Amount })).max(20).optional(),
    financials: z.record(z.string().max(20), Amount).optional(),
  }),
  deductions: Deductions.optional(),
  tdsOther: z.array(TdsOther).max(50).optional(),
  tcs: z.array(Tcs).max(50).optional(),
  taxPayments: z.array(Payment).max(20).optional(),
  interest234C: Amount.optional(),
  bank: Bank,
});

const Itr2Body = z.object({
  person: Person,
  filing: Filing,
  flags: z.object({ director: z.boolean().optional(), unlistedShares: z.boolean().optional(), foreignAssets: z.boolean().optional(), landOrBuildingSold: z.boolean().optional(), lossesBroughtForward: z.boolean().optional() }).optional(),
  salary: z.object({ professionalTax: Amount.optional(), employers: z.array(z.object({ tan: Tan.optional(), name: z.string().trim().min(1).max(125), nature: z.enum(['CGOV', 'SGOV', 'PSU', 'PE', 'PESG', 'PEPS', 'PEO', 'OTH']), address: z.object({ line: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/) }), gross: Amount, tds: Amount })).max(10) }).optional(),
  houses: z.array(z.object({ letOut: z.boolean(), address: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/), rent: Amount.optional(), municipalTax: Amount.optional(), loans: z.array(Loan).max(5).optional() })).max(10).optional(),
  capitalGains: z.array(z.object({
    kind: z.enum(['111A', '112A', 'STCG', 'LTCG']), date: Iso, saleValue: Amount, cost: Amount, improvement: Amount.optional(), expenses: Amount.optional(),
    isin: z.string().trim().toUpperCase().regex(/^IN[0-9A-Z]{10}$/).optional(), name: z.string().trim().max(125).optional(), acquiredBefore1Feb2018: z.boolean().optional(), fmv31Jan2018: Amount.optional(),
  })).max(500).optional(),
  otherSources: z.object({ savingsInterest: Amount.optional(), depositInterest: Amount.optional(), refundInterest: Amount.optional(), dividends: Amount.optional(), other: Amount.optional(), otherDescription: z.string().trim().max(50).optional() }).optional(),
  deductions: Deductions.optional(),
  tdsOther: z.array(TdsOther).max(50).optional(),
  tcs: z.array(Tcs).max(50).optional(),
  taxPayments: z.array(Payment).max(20).optional(),
  interest234C: Amount.optional(),
  bank: Bank,
});

function invalid(error: z.ZodError) {
  const fields = [...new Set(error.issues.map((i) => FIELD_LABEL[String(i.path[i.path.length - 1])] ?? String(i.path[i.path.length - 1])))];
  return { error: 'Invalid', message: `Missing or not valid: ${fields.slice(0, 8).join(', ')}.` };
}

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * ITR-1, ITR-2 and ITR-4 JSON for Assessment Year 2026-27. Nothing is stored. ITR_SOFTWARE_ID is the software ID the
 * Income Tax Department issues to a registered e-return intermediary; without it the JSON is not
 * written, and the reply says so.
 */
export async function itrRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
  });

  fastify.get('/itr1/status', async (_request, reply) => reply.send({ softwareIdConfigured: /^SW\d{8}$/.test(process.env.ITR_SOFTWARE_ID ?? '') }));

  fastify.post('/itr1', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const b = Itr1Body.safeParse(request.body);
    if (!b.success) {
      const fields = [...new Set(b.error.issues.map((i) => FIELD_LABEL[String(i.path[i.path.length - 1])] ?? String(i.path[i.path.length - 1])))];
      return reply.status(400).send({ error: 'Invalid', message: `Missing or not valid: ${fields.slice(0, 8).join(', ')}.` });
    }
    const out = writeItr1({ ...b.data, softwareId: process.env.ITR_SOFTWARE_ID ?? '', createdOn: istToday(), intermediaryCity: process.env.ITR_INTERMEDIARY_CITY ?? b.data.person.address.city });
    if (!out.json) return reply.status(422).send({ error: 'Not ready', issues: out.issues, summary: out.summary });
    return reply.send({ fileName: `ITR1_AY2026-27_${b.data.person.pan}.json`, json: out.json, summary: out.summary });
  });

  fastify.get('/status', async (_request, reply) => reply.send({ softwareIdConfigured: /^SW\d{8}$/.test(process.env.ITR_SOFTWARE_ID ?? ''), forms: ['ITR-1', 'ITR-2', 'ITR-4'] }));

  fastify.post('/itr4', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const b = Itr4Body.safeParse(request.body);
    if (!b.success) return reply.status(400).send(invalid(b.error));
    const out = writeItr4({ ...b.data, softwareId: process.env.ITR_SOFTWARE_ID ?? '', createdOn: istToday(), intermediaryCity: process.env.ITR_INTERMEDIARY_CITY ?? b.data.person.address.city });
    if (!out.json) return reply.status(422).send({ error: 'Not ready', issues: out.issues, summary: out.summary });
    return reply.send({ fileName: `ITR4_AY2026-27_${b.data.person.pan}.json`, json: out.json, summary: out.summary });
  });

  fastify.post('/itr2', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const b = Itr2Body.safeParse(request.body);
    if (!b.success) return reply.status(400).send(invalid(b.error));
    const out = writeItr2({ ...b.data, softwareId: process.env.ITR_SOFTWARE_ID ?? '', createdOn: istToday(), intermediaryCity: process.env.ITR_INTERMEDIARY_CITY ?? b.data.person.address.city });
    if (!out.json) return reply.status(422).send({ error: 'Not ready', issues: out.issues, summary: out.summary });
    return reply.send({ fileName: `ITR2_AY2026-27_${b.data.person.pan}.json`, json: out.json, summary: out.summary });
  });

  // ITR-3: the Department's schema (ITR-3_2026_Main_V1.1) is published and kept in the tax engine, but the writer is not built yet.
  fastify.post('/itr3', async (_request, reply) => reply.status(501).send({ error: 'Not available', message: 'The ITR-3 file is not prepared here yet. Use the Department utility for returns with business accounts.' }));
}
