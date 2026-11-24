import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DEP_BLOCKS, ITR_TDS_SECTIONS, ITRU_REASONS, maskPan, writeItr1, writeItr2, writeItr3, writeItr4, writeItr5, writeItr6, writeItrU } from '@synextax/tax-engine';

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

// Schedules shared by the ITR-2 and ITR-3 bodies (Phase 2B).
const Ack15 = z.string().regex(/^\d{15}$/);
const Retirement89A = { retirement89A: z.object({ country: z.enum(['US', 'UK', 'CA']), amount: Amount }).optional(), retirementOther: Amount.optional(), retirementPriorRelief: Amount.optional() };
const Relief89A = z.object({ amount: Amount, form10EEFiled: z.boolean() }).optional();
const Claim = z.object({ section: z.enum(['54', '54B', '54EC', '54F']), invested: Amount, investedOn: Iso.optional(), deposited: Amount.optional(), depositedOn: Iso.optional(), account: z.string().trim().max(20).optional(), ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(), atMostOneOtherHouse: z.boolean().optional() });
const PropertySaleRow = z.object({
  asset: z.enum(['RESIDENTIAL_HOUSE', 'AGRI_LAND', 'OTHER']), acquiredOn: Iso, soldOn: Iso, consideration: Amount, stampValue: Amount, cost: Amount,
  improvements: z.array(z.object({ year: z.string().regex(/^\d{4}-\d{2}$/), amount: Amount })).max(20).optional(), expenses: Amount.optional(), claims: z.array(Claim).max(4).optional(),
  address: z.string().trim().min(1).max(250), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/),
  buyers: z.array(z.object({ name: z.string().trim().min(1).max(125), pan: Pan.optional(), aadhaar: z.string().regex(/^\d{12}$/).optional(), share: z.number().min(0).max(100), amount: Amount })).min(1).max(10),
});
const VdaRow = z.object({ acquiredOn: Iso, transferredOn: Iso, cost: Amount, consideration: Amount });
const ExemptIncome = z.object({
  interest: Amount.optional(),
  agriculture: z.object({ grossReceipts: Amount, expenses: Amount, broughtForwardLoss: Amount.optional(), lands: z.array(z.object({ district: z.string().trim().min(1).max(125), pin: z.string().regex(/^\d{6}$/), acres: z.number().min(0).max(100000), owned: z.boolean(), irrigated: z.boolean() })).max(20).optional() }).optional(),
  others: z.array(z.object({ subCategory: z.string().trim().max(30).optional(), description: z.string().trim().min(1).max(125), amount: Amount })).max(20).optional(),
});
const Clubbed = z.object({ name: z.string().trim().min(1).max(125), pan: Pan.optional(), aadhaar: z.string().regex(/^\d{12}$/).optional(), relationship: z.string().trim().min(1).max(50), amount: Amount, head: z.enum(['SA', 'HP', 'CG', 'OS', 'EI', 'BP']) });
const Ay = z.string().regex(/^\d{4}-\d{2}$/);
const LossYear = z.object({ ay: Ay, filedOn: Iso, filedInTime: z.boolean(), hp: Amount.optional(), stcl: Amount.optional(), ltcl: Amount.optional(), business: Amount.optional(), business115BAC: Amount.optional(), speculation: Amount.optional() });
const AmtCredit = z.object({ ay: Ay, gross: Amount, setOffEarlier: Amount });
const AssetsLiab = z.object({
  immovable: z.array(z.object({ description: z.string().trim().min(1).max(25), address: z.object({ residenceNo: z.string().trim().min(1).max(50), locality: z.string().trim().min(1).max(50), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/) }), amount: Amount })).max(20).optional(),
  bankDeposits: Amount, sharesSecurities: Amount, insurance: Amount, loansGiven: Amount, cash: Amount, jewellery: Amount, artwork: Amount, vehicles: Amount, liabilities: Amount,
  interestInFirmOrAop: z.boolean().optional(),
});
const Country = { countryName: z.string().trim().min(1).max(55), countryCode: z.string().regex(/^\d{1,4}$/), zip: z.string().trim().min(1).max(8) };
const OwnerStatus = z.enum(['OWNER', 'BENEFICIAL_OWNER', 'BENIFICIARY']);
const ForeignAssetsBody = z.object({
  bankAccounts: z.array(z.object({ ...Country, bank: z.string().trim().min(1).max(125), address: z.string().trim().min(1).max(200), account: z.string().trim().min(1).max(34), status: OwnerStatus, openedOn: Iso, peak: Amount, closing: Amount, interest: Amount })).max(20).optional(),
  custodialAccounts: z.array(z.object({ ...Country, institution: z.string().trim().min(1).max(125), address: z.string().trim().min(1).max(200), account: z.string().trim().min(1).max(34), status: OwnerStatus, openedOn: Iso, peak: Amount, closing: Amount, grossPaid: Amount, nature: z.enum(['I', 'D', 'S', 'O', 'N']) })).max(20).optional(),
  equityDebt: z.array(z.object({ ...Country, entity: z.string().trim().min(1).max(125), address: z.string().trim().min(1).max(200), nature: z.string().trim().min(1).max(34), acquiredOn: Iso, initial: Amount, peak: Amount, closing: Amount, grossPaid: Amount, grossProceeds: Amount })).max(20).optional(),
  immovable: z.array(z.object({ ...Country, address: z.string().trim().max(200).optional(), ownership: z.enum(['DIRECT', 'BENEFICIAL_OWNER', 'BENIFICIARY']), acquiredOn: Iso, investment: Amount, income: Amount, natureOfIncome: z.string().trim().min(1).max(100), taxableAmount: Amount, schedule: z.enum(['SA', 'HP', 'CG', 'OS', 'EI', 'NI']), scheduleItem: z.string().trim().min(1).max(50) })).max(20).optional(),
});
const RoyaltyDeductions = { section80QQB: z.object({ amount: Amount, form10CCDAck: Ack15 }).optional(), section80RRB: z.object({ amount: Amount, form10CCEAck: Ack15 }).optional() };
const Phase2B = {
  propertySales: z.array(PropertySaleRow).max(20).optional(),
  vda: z.array(VdaRow).max(500).optional(),
  exemptIncome: ExemptIncome.optional(),
  clubbedIncome: z.array(Clubbed).max(20).optional(),
  lossesBroughtForward: z.array(LossYear).max(8).optional(),
  amtCredit: z.array(AmtCredit).max(15).optional(),
  assetsLiabilities: AssetsLiab.optional(),
  foreignAssets: ForeignAssetsBody.optional(),
};

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
  flags: z.object({ director: z.boolean().optional(), unlistedShares: z.boolean().optional(), foreignAssets: z.boolean().optional(), landOrBuildingSold: z.boolean().optional(), lossesBroughtForward: z.boolean().optional(), foreignIncome: z.boolean().optional() }).optional(),
  salary: z.object({ professionalTax: Amount.optional(), relief89A: Relief89A, employers: z.array(z.object({ tan: Tan.optional(), name: z.string().trim().min(1).max(125), nature: z.enum(['CGOV', 'SGOV', 'PSU', 'PE', 'PESG', 'PEPS', 'PEO', 'OTH']), address: z.object({ line: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/) }), gross: Amount, tds: Amount, ...Retirement89A })).max(10) }).optional(),
  houses: z.array(z.object({ letOut: z.boolean(), address: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/), rent: Amount.optional(), municipalTax: Amount.optional(), loans: z.array(Loan).max(5).optional() })).max(10).optional(),
  capitalGains: z.array(z.object({
    kind: z.enum(['111A', '112A', 'STCG', 'LTCG']), date: Iso, saleValue: Amount, cost: Amount, improvement: Amount.optional(), expenses: Amount.optional(),
    isin: z.string().trim().toUpperCase().regex(/^IN[0-9A-Z]{10}$/).optional(), name: z.string().trim().max(125).optional(), acquiredBefore1Feb2018: z.boolean().optional(), fmv31Jan2018: Amount.optional(),
    exemption54F: Claim.optional(),
  })).max(500).optional(),
  ...Phase2B,
  otherSources: z.object({ savingsInterest: Amount.optional(), depositInterest: Amount.optional(), refundInterest: Amount.optional(), dividends: Amount.optional(), other: Amount.optional(), otherDescription: z.string().trim().max(50).optional() }).optional(),
  deductions: Deductions.extend(RoyaltyDeductions).optional(),
  tdsOther: z.array(TdsOther).max(50).optional(),
  tcs: z.array(Tcs).max(50).optional(),
  taxPayments: z.array(Payment).max(20).optional(),
  interest234C: Amount.optional(),
  bank: Bank,
});

const Employer = z.object({ tan: Tan.optional(), name: z.string().trim().min(1).max(125), nature: z.enum(['CGOV', 'SGOV', 'PSU', 'PE', 'PESG', 'PEPS', 'PEO', 'OTH']), address: z.object({ line: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/) }), gross: Amount, tds: Amount });
const House = z.object({ letOut: z.boolean(), address: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/), rent: Amount.optional(), municipalTax: Amount.optional(), loans: z.array(Loan).max(5).optional() });
const CgRow = z.object({
  kind: z.enum(['111A', '112A', 'STCG', 'LTCG']), date: Iso, saleValue: Amount, cost: Amount, improvement: Amount.optional(), expenses: Amount.optional(),
  isin: z.string().trim().toUpperCase().regex(/^IN[0-9A-Z]{10}$/).optional(), name: z.string().trim().max(125).optional(), acquiredBefore1Feb2018: z.boolean().optional(), fmv31Jan2018: Amount.optional(),
});
const Opt = Amount.optional();
const Books = z.object({
  kind: z.enum(['BUSINESS', 'PROFESSION']),
  trading: z.object({ salesGoods: Opt, salesServices: Opt, professionReceipts: Opt, openingStock: Opt, purchases: Opt, directExpenses: Opt, closingStock: Opt }),
  otherIncome: Opt,
  expenses: z.object({
    freight: Opt, consumables: Opt, powerFuel: Opt, rent: Opt, repairsBuilding: Opt, repairsMachinery: Opt, salaries: Opt, bonus: Opt, providentFund: Opt, staffWelfare: Opt, insurance: Opt,
    salesPromotion: Opt, advertisement: Opt, commission: Opt, professionalFees: Opt, hotel: Opt, travel: Opt, conveyance: Opt, telephone: Opt, ratesTaxes: Opt, auditFee: Opt, interest: Opt,
    other: z.array(z.object({ nature: z.string().trim().min(1).max(125), amount: Amount })).max(20).optional(),
  }).optional(),
  bookDepreciation: Opt,
  depreciation: z.array(z.object({
    block: z.enum(Object.keys(DEP_BLOCKS) as [keyof typeof DEP_BLOCKS, ...Array<keyof typeof DEP_BLOCKS>]), wdvOpening: Amount, additionsFull: Opt, additionsHalf: Opt, realisation: Opt,
    additional: z.object({ full: Opt, half: Opt, previousYearHalf: Opt }).optional(),
  })).max(8).optional(),
  balanceSheet: z.object({
    // Proprietor's capital can be negative where drawings exceed it (the schema allows it).
    capital: z.number().min(-99_999_999_999).max(99_999_999_999), reserves: Opt,
    securedLoansBank: Opt, securedLoansOthers: Opt, unsecuredLoansBank: Opt, unsecuredLoansOthers: Opt, advances: Opt,
    grossBlock: Opt, accumulatedDepreciation: Opt, capitalWip: Opt, investmentsLongTerm: Opt, investmentsTrade: Opt,
    stock: Opt, debtors: Opt, cashInHand: Opt, bank: Opt, otherCurrentAssets: Opt, loansAdvances: Opt, deposits: Opt, creditors: Opt, provisions: Opt,
  }),
  cashReceiptsWithin5Pct: z.boolean().optional(),
  cashPaymentsWithin5Pct: z.boolean().optional(),
  manufacturing: z.boolean().optional(),
});
const Firm = z.object({
  name: z.string().trim().min(1).max(125), pan: Pan, liableToAudit: z.boolean(), section92E: z.boolean().optional(), workingPartner: z.boolean().optional(),
  sharePercent: z.number().min(0).max(100), shareOfProfit: z.number().min(-99_999_999_999).max(99_999_999_999), interest: Amount.optional(), remuneration: Amount.optional(),
  capitalOn31Mar: z.number().min(-99_999_999_999).max(99_999_999_999),
});

const Itr3Body = z.object({
  person: Person,
  status: z.enum(['I', 'H']),
  karta: z.object({ name: z.string().trim().min(1).max(125), pan: Pan }).optional(),
  filing: Filing.extend({ form10IEA: z.object({ assessmentYear: z.enum(['2024-25', '2025-26', '2026-27']), ack: z.string().regex(/^\d{15}$/), date: Iso.optional() }).optional() }),
  flags: z.object({
    partnerInFirm: z.boolean().optional(), director: z.boolean().optional(), unlistedShares: z.boolean().optional(), foreignAssets: z.boolean().optional(), landOrBuildingSold: z.boolean().optional(),
    lossesBroughtForward: z.boolean().optional(), speculativeOrFnO: z.boolean().optional(), disallowances: z.boolean().optional(), optedOut44AD: z.boolean().optional(),
  }).optional(),
  business: z.object({
    natures: z.array(z.object({ code: z.string().regex(/^\d{5}(_\d)?$/), tradeName: z.string().trim().max(125).optional() })).max(10),
    ad: Receipts.optional(),
    ada: Receipts.optional(),
    ae: z.object({ code: z.string().regex(/^\d{5}$/), name: z.string().trim().min(1).max(75), vehicles: z.array(z.object({ regNo: z.string().trim().min(1).max(11), ownership: z.enum(['OWN', 'LEASE', 'HIRED']), tonnage: z.number().min(0).max(100), months: z.number().int().min(1).max(12), declared: Amount.optional() })).max(20) }).optional(),
    noAccounts: z.object({ debtors: Amount, creditors: Amount, stock: Amount, cash: Amount }).optional(),
    books: Books.optional(),
    liable44AA: z.boolean().optional(),
  }),
  salary: z.object({ professionalTax: Amount.optional(), relief89A: Relief89A, employers: z.array(Employer.extend(Retirement89A)).max(10) }).optional(),
  houses: z.array(House).max(10).optional(),
  capitalGains: z.array(CgRow.extend({ exemption54F: Claim.optional() })).max(500).optional(),
  ...Phase2B,
  firms: z.array(Firm).max(20).optional(),
  speculation: z.object({ turnover: Amount, grossProfit: z.number().min(-99_999_999_999).max(99_999_999_999), expenses: Amount.optional() }).optional(),
  unabsorbedDepreciation: z.array(z.object({ ay: Ay, amount: Amount, adjusted115BAC: Amount.optional() })).max(30).optional(),
  otherSources: z.object({ savingsInterest: Amount.optional(), depositInterest: Amount.optional(), refundInterest: Amount.optional(), dividends: Amount.optional(), other: Amount.optional(), otherDescription: z.string().trim().max(50).optional() }).optional(),
  deductions: Deductions.extend(RoyaltyDeductions).optional(),
  tdsOther: z.array(TdsOther).max(50).optional(),
  tcs: z.array(Tcs).max(50).optional(),
  taxPayments: z.array(Payment).max(20).optional(),
  interest234C: Amount.optional(),
  bank: Bank,
});

// ITR-5, ITR-6 and ITR-U bodies.
const Addr = z.object({ line: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/) });
const SignedAmount = z.number().min(-99_999_999_999).max(99_999_999_999);
const Entity = z.object({
  name: z.string().trim().min(1).max(125), pan: Pan, formedOn: Iso,
  address: z.object({ residenceNo: z.string().trim().min(1).max(50), locality: z.string().trim().min(1).max(50), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/) }),
  mobile: z.string().regex(/^\d{10}$/), email: z.string().trim().email().max(125),
});
const Signatory = z.object({ name: z.string().trim().min(1).max(125), fatherName: z.string().trim().min(1).max(125), pan: Pan, capacity: z.string().trim().toUpperCase().max(2), place: z.string().trim().min(1).max(50) });
const EntityFiling = z.object({ section: z.union([z.literal(11), z.literal(12), z.literal(17)]), originalAck: z.string().regex(/^\d{15}$/).optional(), originalFiledOn: Iso.optional() });
const EntityBooks = z.object({
  trading: z.object({ salesGoods: Opt, salesServices: Opt, professionReceipts: Opt, openingStock: Opt, purchases: Opt, directExpenses: Opt, closingStock: Opt }),
  otherIncome: z.object({ rent: Opt, interest: Opt, dividends: Opt, profitOnInvestments: Opt, misc: Opt }).optional(),
  expenses: z.object({
    freight: Opt, consumables: Opt, powerFuel: Opt, rent: Opt, repairsBuilding: Opt, repairsMachinery: Opt, salaries: Opt, bonus: Opt, providentFund: Opt, staffWelfare: Opt, insurance: Opt,
    salesPromotion: Opt, advertisement: Opt, commission: Opt, professionalFees: Opt, hotel: Opt, travel: Opt, conveyance: Opt, telephone: Opt, ratesTaxes: Opt, auditFee: Opt,
    other: z.array(z.object({ nature: z.string().trim().min(1).max(50), amount: Amount })).max(20).optional(),
  }).optional(),
  interestOthers: Opt, bookDepreciation: Opt, currentTax: Opt, deferredTax: Opt,
  depreciation: z.array(z.object({ block: z.enum(Object.keys(DEP_BLOCKS) as [keyof typeof DEP_BLOCKS, ...Array<keyof typeof DEP_BLOCKS>]), wdvOpening: Amount, additionsFull: Opt, additionsHalf: Opt, realisation: Opt })).max(8).optional(),
  cashReceiptsWithin5Pct: z.boolean().optional(), cashPaymentsWithin5Pct: z.boolean().optional(),
});
const EntityCommon = {
  entity: Entity, signatory: Signatory, filing: EntityFiling,
  natures: z.array(z.object({ code: z.string().regex(/^\d{5}$/), tradeName: z.string().trim().max(125).optional() })).min(1).max(10),
  books: EntityBooks,
  audit: z.object({ firmName: z.string().trim().min(1).max(125), firmPan: Pan, reportDate: Iso, ack3CD: z.string().regex(/^\d{15}$/) }).optional(),
  houses: z.array(z.object({
    address: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(50), stateCode: z.string().regex(/^\d{2}$/), pin: z.string().regex(/^\d{6}$/), rent: Amount, municipalTax: Opt, interest: Opt,
    loan: z.object({ from: z.enum(['B', 'I']), lender: z.string().trim().min(1).max(125), account: z.string().trim().regex(/^[A-Za-z0-9/-]{1,20}$/), sanctionedOn: Iso, amount: Amount, outstanding: Amount }).optional(),
  })).max(10).optional(),
  capitalGains: z.array(CgRow).max(500).optional(),
  otherSources: z.object({ savingsInterest: Opt, depositInterest: Opt, otherInterest: Opt, dividends: Opt, other: Opt, otherDescription: z.string().trim().max(50).optional() }).optional(),
  tdsOther: z.array(TdsOther).max(50).optional(),
  tcs: z.array(Tcs).max(50).optional(),
  taxPayments: z.array(Payment).max(20).optional(),
  interest234C: Amount.optional(),
  bank: Bank,
  msmeRegNo: z.string().trim().max(50).optional(),
};
const Itr5Body = z.object({
  ...EntityCommon,
  kind: z.enum(['FIRM', 'LLP']),
  llpin: z.string().trim().toUpperCase().max(8).optional(),
  partners: z.array(z.object({
    name: z.string().trim().min(1).max(125), pan: Pan, address: Addr, share: z.number().min(0).max(100), status: z.enum(['INDIVIDUAL', 'HUF', 'FIRM', 'LLP', 'DOMESTIC_COMPANY']).optional(),
    working: z.boolean(), interest: Opt, rate: z.number().min(0).max(100).optional(), remuneration: Opt,
  })).min(1).max(50),
  balanceSheet: z.object({
    partnersCapital: SignedAmount, reserves: Opt,
    securedLoansBank: Opt, securedLoansOthers: Opt, unsecuredLoansBank: Opt, unsecuredLoansOthers: Opt, advances: Opt, grossBlock: Opt, accumulatedDepreciation: Opt, capitalWip: Opt,
    investmentsLongTerm: Opt, investmentsShortTerm: Opt, stock: Opt, debtors: Opt, cashInHand: Opt, bank: Opt, otherCurrentAssets: Opt, loansAdvances: Opt, deposits: Opt,
    creditors: Opt, otherPayables: Opt, incomeTaxProvision: Opt, otherProvisions: Opt,
  }),
});
const Itr6Body = z.object({
  ...EntityCommon,
  companyType: z.enum(['PUBLIC', 'PRIVATE']),
  unlisted: z.boolean(),
  regime: z.discriminatedUnion('option', [
    z.object({ option: z.literal('115BAA'), form10IC: z.object({ assessmentYear: z.string().regex(/^\d{4}-\d{2}$/), ack: z.string().regex(/^\d{15}$/), date: Iso }) }),
    z.object({ option: z.literal('NORMAL'), turnover2023_24UpTo400Cr: z.boolean(), mat: z.object({ otherAdditions: Opt, otherDeductions: Opt }), matCreditBroughtForward: z.boolean().optional() }),
  ]),
  keyPersons: z.array(z.object({ name: z.string().trim().min(1).max(125), designation: z.enum(['MD', 'DIR', 'SEC', 'CEO', 'CFO', 'MGR', 'OPO']), pan: Pan.optional(), din: z.string().regex(/^\d{8}$/).optional(), address: Addr })).min(1).max(30),
  balanceSheet: z.object({
    shareCapital: Amount, authorisedCapital: Opt, reserves: SignedAmount.optional(),
    longTermBorrowingsBank: Opt, longTermBorrowingsOthers: Opt, deferredTaxLiability: Opt, longTermProvisions: Opt, shortTermBorrowingsBank: Opt, shortTermBorrowingsOthers: Opt,
    tradePayables: Opt, otherCurrentLiabilities: Opt, incomeTaxProvision: Opt, otherShortTermProvisions: Opt, tangibleGross: Opt, tangibleDepreciation: Opt, intangibleGross: Opt,
    intangibleAmortisation: Opt, capitalWip: Opt, nonCurrentInvestments: Opt, deferredTaxAsset: Opt, longTermLoansAdvances: Opt, currentInvestments: Opt, inventories: Opt,
    tradeReceivables: Opt, cashInHand: Opt, bankBalances: Opt, shortTermLoansAdvances: Opt, otherCurrentAssets: Opt,
  }),
});
const ItrUBody = z.object({
  base: z.discriminatedUnion('form', [
    z.object({ form: z.literal('ITR1'), input: Itr1Body }),
    z.object({ form: z.literal('ITR2'), input: Itr2Body }),
    z.object({ form: z.literal('ITR3'), input: Itr3Body }),
    z.object({ form: z.literal('ITR4'), input: Itr4Body }),
  ]),
  filedOn: Iso.optional(),
  aadhaar: z.string().regex(/^\d{12}$/).optional(),
  eligible: z.boolean(),
  reasons: z.array(z.enum(Object.keys(ITRU_REASONS) as [keyof typeof ITRU_REASONS, ...Array<keyof typeof ITRU_REASONS>])).min(1).max(8),
  previous: z.object({
    section: z.enum(['139(1)', 'OTHER']), form: z.enum(['ITR1', 'ITR2', 'ITR3', 'ITR4', 'ITR5', 'ITR6', 'ITR7']), ack: z.string().regex(/^\d{15}$/), filedOn: Iso,
    totalIncome: Amount, heads: z.object({ salary: Opt, houseProperty: SignedAmount.optional(), business: Opt, capitalGains: Opt, otherSources: Opt }),
    amountPayable: Amount, refundClaimed: Opt, refundIssued: Opt,
  }).optional(),
  regularAssessmentTax: Opt,
  payments140B: z.array(z.object({ bsr: z.string().regex(/^\d{7}$/), date: Iso, serial: z.number().int().min(0).max(99999), amount: Amount })).max(20).optional(),
});

function invalid(error: z.ZodError) {
  const fields = [...new Set(error.issues.map((i) => FIELD_LABEL[String(i.path[i.path.length - 1])] ?? String(i.path[i.path.length - 1])))];
  return { error: 'Invalid', message: `Missing or not valid: ${fields.slice(0, 8).join(', ')}.` };
}

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * ITR-1, ITR-2, ITR-3 and ITR-4 JSON for Assessment Year 2026-27. Nothing is stored. ITR_SOFTWARE_ID is the software ID the
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

  fastify.get('/status', async (_request, reply) => reply.send({ softwareIdConfigured: /^SW\d{8}$/.test(process.env.ITR_SOFTWARE_ID ?? ''), forms: ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4'] }));

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

  // ITR-3 for business or profession income without a tax audit. The PAN in the file name is masked; the return JSON carries it in full, as the Department needs.
  fastify.post('/itr3', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const b = Itr3Body.safeParse(request.body);
    if (!b.success) return reply.status(400).send(invalid(b.error));
    const out = writeItr3({ ...b.data, softwareId: process.env.ITR_SOFTWARE_ID ?? '', createdOn: istToday(), intermediaryCity: process.env.ITR_INTERMEDIARY_CITY ?? b.data.person.address.city });
    if (!out.json) return reply.status(422).send({ error: 'Not ready', issues: out.issues, summary: out.summary });
    return reply.send({ fileName: `ITR3_AY2026-27_${maskPan(b.data.person.pan)}.json`, json: out.json, summary: out.summary });
  });

  // ITR-5 (firm or LLP) and ITR-6 (company) with regular books. File names carry a masked PAN; the return JSON carries it in full.
  fastify.post('/itr5', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const b = Itr5Body.safeParse(request.body);
    if (!b.success) return reply.status(400).send(invalid(b.error));
    const out = writeItr5({ ...b.data, softwareId: process.env.ITR_SOFTWARE_ID ?? '', createdOn: istToday(), intermediaryCity: process.env.ITR_INTERMEDIARY_CITY ?? b.data.entity.address.city });
    if (!out.json) return reply.status(422).send({ error: 'Not ready', issues: out.issues, summary: out.summary });
    return reply.send({ fileName: `ITR5_AY2026-27_${maskPan(b.data.entity.pan)}.json`, json: out.json, summary: out.summary });
  });

  fastify.post('/itr6', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const b = Itr6Body.safeParse(request.body);
    if (!b.success) return reply.status(400).send(invalid(b.error));
    const out = writeItr6({ ...b.data, softwareId: process.env.ITR_SOFTWARE_ID ?? '', createdOn: istToday(), intermediaryCity: process.env.ITR_INTERMEDIARY_CITY ?? b.data.entity.address.city });
    if (!out.json) return reply.status(422).send({ error: 'Not ready', issues: out.issues, summary: out.summary });
    return reply.send({ fileName: `ITR6_AY2026-27_${maskPan(b.data.entity.pan)}.json`, json: out.json, summary: out.summary });
  });

  // ITR-U (section 139(8A)) over an ITR-1 to ITR-4 body; the date of the updated return is today unless given. Until the Department
  // releases AY 2026-27 schemas for updated returns, the reply is 422 with the Part B-ATI working and the 140B figures.
  fastify.post('/itru', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const b = ItrUBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send(invalid(b.error));
    const env = { softwareId: process.env.ITR_SOFTWARE_ID ?? '', createdOn: istToday(), intermediaryCity: process.env.ITR_INTERMEDIARY_CITY ?? b.data.base.input.person.address.city };
    const base = { ...b.data.base, input: { ...b.data.base.input, ...env } } as Parameters<typeof writeItrU>[0]['base'];
    const out = writeItrU({ ...b.data, base, filedOn: b.data.filedOn ?? env.createdOn });
    if (!out.json) return reply.status(422).send({ error: 'Not ready', issues: out.issues, summary: out.summary, parts: out.parts });
    return reply.send({ fileName: `ITRU_AY2026-27_${maskPan(b.data.base.input.person.pan)}.json`, json: out.json, summary: out.summary });
  });
}
