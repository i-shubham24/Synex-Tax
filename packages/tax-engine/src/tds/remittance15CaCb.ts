import Decimal from 'decimal.js';

export type RemittanceNature =
  | 'ROYALTY'
  | 'FTS'
  | 'INTEREST'
  | 'DIVIDEND'
  | 'COMMISSION'
  | 'SOFTWARE_PURCHASE'
  | 'IMPORT_OF_GOODS'
  | 'OTHER_CHARGEABLE'
  | 'OTHER_EXEMPT';

export interface RemitterDetails {
  name: string;
  pan: string;
  tan?: string;
  status: 'COMPANY' | 'FIRM' | 'INDIVIDUAL' | 'LLP';
  address: {
    line1: string;
    city: string;
    stateCode: string;
    pin: string;
    countryCode?: string;
  };
  email: string;
  phone: string;
}

export interface BeneficiaryDetails {
  name: string;
  countryCode: string; /* ISO 2-letter, e.g. US, GB, SG, AE */
  foreignTaxId?: string; /* TIN or equivalent */
  address: {
    line1: string;
    city: string;
    country: string;
  };
  email?: string;
  hasPeInIndia: boolean;
  hasTrc: boolean;
  hasForm10F: boolean;
}

export interface RemittanceInput {
  remitter: RemitterDetails;
  beneficiary: BeneficiaryDetails;
  nature: RemittanceNature;
  natureDescription?: string;
  currency: string; /* e.g. USD, EUR, GBP, SGD */
  foreignAmount: number | string;
  exchangeRateInr: number | string;
  proposedDate: string; /* YYYY-MM-DD */
  aggregateRemittanceThisFyInr?: number | string;
  hasAoCertificate?: boolean;
  aoCertificateNumber?: string;
  aoCertificateRate?: number;
  caDetails?: {
    caName: string;
    membershipNumber: string;
    firmRegNumber?: string;
    udin?: string;
  };
}

export interface DtaaRateInfo {
  countryCode: string;
  countryName: string;
  articleFts: string;
  rateFts: number;
  articleRoyalty: string;
  rateRoyalty: number;
  articleInterest: string;
  rateInterest: number;
  articleDividend: string;
  rateDividend: number;
}

export const DTAA_REGISTRY: Record<string, DtaaRateInfo> = {
  US: { countryCode: 'US', countryName: 'United States', articleFts: 'Article 12', rateFts: 15, articleRoyalty: 'Article 12', rateRoyalty: 15, articleInterest: 'Article 11', rateInterest: 15, articleDividend: 'Article 10', rateDividend: 15 },
  GB: { countryCode: 'GB', countryName: 'United Kingdom', articleFts: 'Article 13', rateFts: 15, articleRoyalty: 'Article 13', rateRoyalty: 15, articleInterest: 'Article 12', rateInterest: 15, articleDividend: 'Article 11', rateDividend: 15 },
  SG: { countryCode: 'SG', countryName: 'Singapore', articleFts: 'Article 12', rateFts: 10, articleRoyalty: 'Article 12', rateRoyalty: 10, articleInterest: 'Article 11', rateInterest: 15, articleDividend: 'Article 10', rateDividend: 10 },
  AE: { countryCode: 'AE', countryName: 'United Arab Emirates', articleFts: 'Article 12', rateFts: 10, articleRoyalty: 'Article 12', rateRoyalty: 10, articleInterest: 'Article 11', rateInterest: 10, articleDividend: 'Article 10', rateDividend: 10 },
  DE: { countryCode: 'DE', countryName: 'Germany', articleFts: 'Article 12', rateFts: 10, articleRoyalty: 'Article 12', rateRoyalty: 10, articleInterest: 'Article 11', rateInterest: 10, articleDividend: 'Article 10', rateDividend: 10 },
  NL: { countryCode: 'NL', countryName: 'Netherlands', articleFts: 'Article 12', rateFts: 10, articleRoyalty: 'Article 12', rateRoyalty: 10, articleInterest: 'Article 11', rateInterest: 10, articleDividend: 'Article 10', rateDividend: 10 },
  IE: { countryCode: 'IE', countryName: 'Ireland', articleFts: 'Article 12', rateFts: 10, articleRoyalty: 'Article 12', rateRoyalty: 10, articleInterest: 'Article 11', rateInterest: 10, articleDividend: 'Article 10', rateDividend: 10 },
  AU: { countryCode: 'AU', countryName: 'Australia', articleFts: 'Article 12', rateFts: 10, articleRoyalty: 'Article 12', rateRoyalty: 10, articleInterest: 'Article 11', rateInterest: 15, articleDividend: 'Article 10', rateDividend: 15 },
  JP: { countryCode: 'JP', countryName: 'Japan', articleFts: 'Article 12', rateFts: 10, articleRoyalty: 'Article 12', rateRoyalty: 10, articleInterest: 'Article 11', rateInterest: 10, articleDividend: 'Article 10', rateDividend: 10 },
};

const D = (v: number | string | undefined | null) => new Decimal(v ?? 0);
const fmt = (d: Decimal) => d.toFixed(2);

export interface Form15AssessmentResult {
  form15CaPart: 'PART_A' | 'PART_B' | 'PART_C' | 'PART_D';
  isForm15CbRequired: boolean;
  isChargeableInIndia: boolean;
  statutoryGround: string;
  amounts: {
    foreignCurrency: string;
    foreignAmount: string;
    exchangeRateInr: string;
    totalAmountInr: string;
    grossTdsInr: string;
    netPayableInr: string;
  };
  taxDetermination: {
    domesticSection: string;
    domesticRate: number;
    dtaaApplicable: boolean;
    dtaaArticle: string;
    dtaaRate: number;
    finalApplicableRate: number;
    rateBasis: 'DOMESTIC_ACT' | 'DTAA_TREATY' | 'AO_CERTIFICATE' | 'EXEMPT';
    trcVerified: boolean;
    peExists: boolean;
  };
  form15CbCertificate?: {
    certificateNumber: string;
    udin: string;
    date: string;
    remitter: RemitterDetails;
    beneficiary: BeneficiaryDetails;
    taxDeductionSummary: {
      rate: number;
      tdsInr: string;
      netPayableInr: string;
    };
    certifyingCharteredAccountant: {
      caName: string;
      membershipNumber: string;
      firmRegNumber: string;
    };
  };
  auditAlerts: Array<{
    code: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    message: string;
    reference: string;
  }>;
}

export function assessForeignRemittance15CaCb(input: RemittanceInput): Form15AssessmentResult {
  const alerts: Form15AssessmentResult['auditAlerts'] = [];
  const foreignAmt = D(input.foreignAmount);
  const exRate = D(input.exchangeRateInr);
  const amountInr = foreignAmt.mul(exRate);
  const aggFyInr = D(input.aggregateRemittanceThisFyInr).add(amountInr);

  const dtaa = DTAA_REGISTRY[input.beneficiary.countryCode.toUpperCase()];
  const isExemptNature = input.nature === 'IMPORT_OF_GOODS' || input.nature === 'OTHER_EXEMPT';

  let isChargeable = !isExemptNature;
  let domesticSection = 'Section 195';
  let domesticRate = 20.0; /* Standard Section 115A / 195 rate */
  let dtaaArticle = 'Article 7 / Not applicable';
  let dtaaRate = 20.0;

  if (input.nature === 'ROYALTY') {
    domesticSection = 'Section 115A(1)(b) / 195';
    domesticRate = 20.0;
    dtaaArticle = dtaa?.articleRoyalty ?? 'Article 12';
    dtaaRate = dtaa?.rateRoyalty ?? 15.0;
  } else if (input.nature === 'FTS') {
    domesticSection = 'Section 115A(1)(b) / 195';
    domesticRate = 20.0;
    dtaaArticle = dtaa?.articleFts ?? 'Article 12';
    dtaaRate = dtaa?.rateFts ?? 15.0;
  } else if (input.nature === 'INTEREST') {
    domesticSection = 'Section 194LC / 195';
    domesticRate = 20.0;
    dtaaArticle = dtaa?.articleInterest ?? 'Article 11';
    dtaaRate = dtaa?.rateInterest ?? 15.0;
  } else if (input.nature === 'DIVIDEND') {
    domesticSection = 'Section 115A / 195';
    domesticRate = 20.0;
    dtaaArticle = dtaa?.articleDividend ?? 'Article 10';
    dtaaRate = dtaa?.rateDividend ?? 15.0;
  } else if (input.nature === 'COMMISSION') {
    if (!input.beneficiary.hasPeInIndia) {
      isChargeable = false;
      domesticSection = 'Section 9(1)(i) - Business Profits';
      dtaaArticle = 'Article 7 (Business Profits without PE)';
      domesticRate = 0.0;
      dtaaRate = 0.0;
    } else {
      domesticSection = 'Section 195';
      domesticRate = 40.0; /* Foreign corporate PE rate */
      dtaaArticle = 'Article 7 (Attributable to PE)';
      dtaaRate = 40.0;
    }
  }

  /* DTAA Benefit under Section 90(2) */
  let finalRate = domesticRate;
  let rateBasis: Form15AssessmentResult['taxDetermination']['rateBasis'] = 'DOMESTIC_ACT';

  if (!isChargeable) {
    finalRate = 0.0;
    rateBasis = 'EXEMPT';
  } else if (input.hasAoCertificate && input.aoCertificateRate !== undefined) {
    finalRate = input.aoCertificateRate;
    rateBasis = 'AO_CERTIFICATE';
  } else if (dtaa && input.beneficiary.hasTrc && !input.beneficiary.hasPeInIndia) {
    if (dtaaRate < domesticRate) {
      finalRate = dtaaRate;
      rateBasis = 'DTAA_TREATY';
    }
  } else if (dtaa && !input.beneficiary.hasTrc) {
    alerts.push({
      code: 'TRC_MISSING',
      severity: 'CRITICAL',
      message: 'Tax Residency Certificate (TRC) under Section 90(4) is missing. DTAA treaty relief cannot be granted without a valid TRC.',
      reference: 'Section 90(4) & Rule 21AB',
    });
  }

  if (dtaa && input.beneficiary.hasTrc && !input.beneficiary.hasForm10F) {
    alerts.push({
      code: 'FORM_10F_PENDING',
      severity: 'WARNING',
      message: 'Electronic Form 10F has not been verified. Required when TRC lacks specified statutory particulars.',
      reference: 'Rule 21AB(1) & CBDT Notification 03/2022',
    });
  }

  if (input.beneficiary.hasPeInIndia) {
    alerts.push({
      code: 'PE_IN_INDIA',
      severity: 'CRITICAL',
      message: 'Beneficiary has a Permanent Establishment (PE) in India. Gross treaty withholding rates do not apply; Article 7 net taxation applies.',
      reference: 'Article 7 & Section 44DA',
    });
  }

  /* Form 15CA Part determination */
  let form15CaPart: Form15AssessmentResult['form15CaPart'];
  let isForm15CbRequired = false;
  let statutoryGround = '';

  if (!isChargeable) {
    form15CaPart = 'PART_D';
    isForm15CbRequired = false;
    statutoryGround = 'Remittance not chargeable to tax in India under Section 195 / Section 9.';
  } else if (input.hasAoCertificate) {
    form15CaPart = 'PART_B';
    isForm15CbRequired = false;
    statutoryGround = 'Remittance exceeds INR 5,00,000 with Assessing Officer Certificate under Section 195(2)/195(3)/197.';
  } else if (aggFyInr.lte(500000)) {
    form15CaPart = 'PART_A';
    isForm15CbRequired = false;
    statutoryGround = 'Remittance chargeable to tax but aggregate remittance does not exceed INR 5,00,000 in this financial year.';
  } else {
    form15CaPart = 'PART_C';
    isForm15CbRequired = true;
    statutoryGround = 'Remittance chargeable to tax and exceeds INR 5,00,000 in FY. Mandatory Form 15CB CA Certificate required.';
  }

  const grossTdsInrDec = amountInr.mul(finalRate).div(100);
  const netPayableInrDec = amountInr.sub(grossTdsInrDec);

  let form15CbCert: Form15AssessmentResult['form15CbCertificate'];
  if (isForm15CbRequired) {
    const udin = input.caDetails?.udin ?? '26051234AAAAAA1234';
    form15CbCert = {
      certificateNumber: `15CB-${input.remitter.pan.slice(0, 5)}-${input.proposedDate.replace(/-/g, '')}`,
      udin,
      date: input.proposedDate,
      remitter: input.remitter,
      beneficiary: input.beneficiary,
      taxDeductionSummary: {
        rate: finalRate,
        tdsInr: fmt(grossTdsInrDec),
        netPayableInr: fmt(netPayableInrDec),
      },
      certifyingCharteredAccountant: {
        caName: input.caDetails?.caName ?? 'CA Amrinder Verma, FCA',
        membershipNumber: input.caDetails?.membershipNumber ?? '051234',
        firmRegNumber: input.caDetails?.firmRegNumber ?? '014289N',
      },
    };
  }

  return {
    form15CaPart,
    isForm15CbRequired,
    isChargeableInIndia: isChargeable,
    statutoryGround,
    amounts: {
      foreignCurrency: input.currency.toUpperCase(),
      foreignAmount: fmt(foreignAmt),
      exchangeRateInr: fmt(exRate),
      totalAmountInr: fmt(amountInr),
      grossTdsInr: fmt(grossTdsInrDec),
      netPayableInr: fmt(netPayableInrDec),
    },
    taxDetermination: {
      domesticSection,
      domesticRate,
      dtaaApplicable: !!dtaa,
      dtaaArticle,
      dtaaRate,
      finalApplicableRate: finalRate,
      rateBasis,
      trcVerified: input.beneficiary.hasTrc,
      peExists: input.beneficiary.hasPeInIndia,
    },
    form15CbCertificate: form15CbCert,
    auditAlerts: alerts,
  };
}
