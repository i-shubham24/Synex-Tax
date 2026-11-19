/**
 * Sample firm for development and demos. Clearly labelled "Sample data" in the UI.
 * Dates are anchored on November 2026 and include cases that trip every radar:
 * a return near its 3-year bar, a revoked GSTN token, a FIPS 140-2 DSC near expiry,
 * a multi-state PAN without ISD, and a TDS statement near its correction wall.
 */
import { calculateGstinChecksum } from '@synextax/tax-engine';
import type { Entity, FilingCell, FilingState, Obligation, WorkspaceSnapshot } from './types';

/** Builds a GSTIN with a valid Mod-36 checksum. */
function gstin(state: string, pan: string, entityNo = '1') {
  const base = `${state}${pan}${entityNo}Z`;
  return base + calculateGstinChecksum(base);
}

const iso = (d: string, t = '10:30:00') => `${d}T${t}+05:30`;

const STAFF = [
  { id: 's-av', name: 'CA Amrinder Verma', initials: 'AV', role: 'PARTNER' as const },
  { id: 's-hk', name: 'Harpreet Kaur', initials: 'HK', role: 'MANAGER' as const },
  { id: 's-rs', name: 'Rajat Sharma', initials: 'RS', role: 'STAFF' as const },
  { id: 's-sg', name: 'Simran Gill', initials: 'SG', role: 'STAFF' as const },
  { id: 's-ms', name: 'Manpreet Singh', initials: 'MS', role: 'STAFF' as const },
];

const GROUPS = [
  { id: 'g-silk', name: 'Amritsar Silk group' },
  { id: 'g-golden', name: 'Golden City group' },
  { id: 'g-majha', name: 'Majha Agro group' },
  { id: 'g-lawrence', name: 'Lawrence Road traders' },
  { id: 'g-batala', name: 'Batala Engineering' },
];

const ENTITIES: Entity[] = [
  {
    id: 'e-silk', groupId: 'g-silk', legalName: 'Amritsar Silk Mills Pvt Ltd', pan: 'AABCA1294F', constitution: 'PRIVATE_LIMITED', assignedTo: 's-rs',
    gstins: [
      { gstin: gstin('03', 'AABCA1294F'), stateCode: '03', type: 'REGULAR', filingCategory: 'REGULAR_MONTHLY', portalStatus: 'ACTIVE', token: { state: 'ACTIVE', expiresAt: iso('2026-11-20', '08:00:00') } },
      { gstin: gstin('07', 'AABCA1294F'), stateCode: '07', type: 'REGULAR', filingCategory: 'REGULAR_MONTHLY', portalStatus: 'ACTIVE', token: { state: 'ACTIVE', expiresAt: iso('2026-12-10') } },
    ],
    tans: [{ tan: 'AMRA01492B', branch: 'Head office', lastFiledQuarter: 'Q2 TY 2026-27', lastToken: '022610400172834' }],
    dscs: [{ id: 'd-1', holder: 'Rakesh Mehra (Director)', validTo: '2026-11-25', fips: 'FIPS_140_2', custody: 'OFFICE' }],
    itcReconciled: 4_820_000, pendingMismatch: 24_150,
  },
  {
    id: 'e-golden', groupId: 'g-golden', legalName: 'Golden City Healthcare LLP', pan: 'AAKFG4410M', constitution: 'LLP', assignedTo: 's-sg',
    gstins: [{ gstin: gstin('03', 'AAKFG4410M'), stateCode: '03', type: 'REGULAR', filingCategory: 'REGULAR_MONTHLY', portalStatus: 'ACTIVE', token: { state: 'REVOKED', expiresAt: null } }],
    tans: [{ tan: 'AMRG05512C', branch: 'Hall Bazar', lastFiledQuarter: 'Q2 TY 2026-27', lastToken: '022610400193311' }],
    dscs: [{ id: 'd-2', holder: 'Dr. Neha Kapoor (Partner)', validTo: '2026-12-02', fips: 'FIPS_140_3', custody: 'CLIENT' }],
    itcReconciled: 1_260_000, pendingMismatch: 0,
  },
  {
    id: 'e-majha', groupId: 'g-majha', legalName: 'Majha Rice Sheller', pan: 'ABZPM2231K', constitution: 'PROPRIETORSHIP', assignedTo: 's-rs',
    gstins: [{ gstin: gstin('03', 'ABZPM2231K'), stateCode: '03', type: 'REGULAR', filingCategory: 'QRMP', portalStatus: 'ACTIVE', token: { state: 'ACTIVE', expiresAt: iso('2026-12-18') } }],
    tans: [],
    dscs: [],
    itcReconciled: 640_000, pendingMismatch: 8_400,
  },
  {
    id: 'e-agro', groupId: 'g-majha', legalName: 'Majha Agro Exports Pvt Ltd', pan: 'AAHCM7781Q', constitution: 'PRIVATE_LIMITED', assignedTo: 's-hk',
    gstins: [
      { gstin: gstin('03', 'AAHCM7781Q'), stateCode: '03', type: 'REGULAR', filingCategory: 'REGULAR_MONTHLY', portalStatus: 'ACTIVE', token: { state: 'ACTIVE', expiresAt: iso('2026-12-04') } },
      { gstin: gstin('06', 'AAHCM7781Q'), stateCode: '06', type: 'REGULAR', filingCategory: 'REGULAR_MONTHLY', portalStatus: 'ACTIVE', token: { state: 'EXPIRED', expiresAt: iso('2026-11-15') } },
    ],
    tans: [{ tan: 'AMRM08821D', branch: 'Head office', lastFiledQuarter: 'Q2 TY 2026-27', lastToken: '022610400204417' }],
    dscs: [{ id: 'd-3', holder: 'Gurpreet Sandhu (Director)', validTo: '2026-12-28', fips: 'FIPS_140_2', custody: 'OFFICE' }],
    itcReconciled: 2_310_000, pendingMismatch: 61_900,
  },
  {
    id: 'e-roadways', groupId: 'g-golden', legalName: 'Golden Temple Roadways', pan: 'AAGFG3302L', constitution: 'PARTNERSHIP', assignedTo: 's-ms',
    gstins: [{ gstin: gstin('03', 'AAGFG3302L'), stateCode: '03', type: 'REGULAR', filingCategory: 'REGULAR_MONTHLY', portalStatus: 'ACTIVE', token: { state: 'ACTIVE', expiresAt: iso('2026-12-01') } }],
    tans: [{ tan: 'AMRG02210E', branch: 'Transport Nagar', lastFiledQuarter: 'Q1 TY 2026-27', lastToken: '022610400118802' }],
    dscs: [],
    itcReconciled: 380_000, pendingMismatch: 11_400,
  },
  {
    id: 'e-lawrence', groupId: 'g-lawrence', legalName: 'Lawrence Road Pharma', pan: 'AADCL7782H', constitution: 'PRIVATE_LIMITED', assignedTo: 's-sg',
    gstins: [{ gstin: gstin('03', 'AADCL7782H'), stateCode: '03', type: 'REGULAR', filingCategory: 'REGULAR_MONTHLY', portalStatus: 'ACTIVE', token: { state: 'ACTIVE', expiresAt: iso('2026-11-30') } }],
    tans: [{ tan: 'AMRL01177F', branch: 'Lawrence Road', lastFiledQuarter: 'Q2 TY 2026-27', lastToken: '022610400211056' }],
    dscs: [{ id: 'd-4', holder: 'Sanjay Arora (Director)', validTo: '2027-08-14', fips: 'FIPS_140_3', custody: 'OFFICE' }],
    itcReconciled: 970_000, pendingMismatch: 0,
  },
  {
    id: 'e-hall', groupId: 'g-lawrence', legalName: 'Hall Bazar Fabrics', pan: 'AJWPS0098F', constitution: 'PROPRIETORSHIP', assignedTo: 's-ms',
    gstins: [{ gstin: gstin('03', 'AJWPS0098F'), stateCode: '03', type: 'REGULAR', filingCategory: 'QRMP', portalStatus: 'ACTIVE', token: { state: 'NOT_ENABLED', expiresAt: null } }],
    tans: [],
    dscs: [],
    itcReconciled: 150_000, pendingMismatch: 3_200,
  },
  {
    id: 'e-batala', groupId: 'g-batala', legalName: 'Batala Castings Pvt Ltd', pan: 'AAECB5512P', constitution: 'PRIVATE_LIMITED', assignedTo: 's-hk',
    gstins: [{ gstin: gstin('03', 'AAECB5512P'), stateCode: '03', type: 'REGULAR', filingCategory: 'REGULAR_MONTHLY', portalStatus: 'ACTIVE', token: { state: 'ACTIVE', expiresAt: iso('2026-12-12') } }],
    tans: [{ tan: 'AMRB04471G', branch: 'Foundry Road', lastFiledQuarter: 'Q2 TY 2026-27', lastToken: '022610400226690' }],
    dscs: [{ id: 'd-5', holder: 'Vikram Bhatia (Director)', validTo: '2026-12-31', fips: 'FIPS_140_2', custody: 'CLIENT' }],
    itcReconciled: 1_880_000, pendingMismatch: 42_700,
  },
  {
    id: 'e-tarn', groupId: 'g-majha', legalName: 'Tarn Taran Agro Traders', pan: 'AAHFT3321L', constitution: 'PARTNERSHIP', assignedTo: 's-rs',
    gstins: [{ gstin: gstin('03', 'AAHFT3321L'), stateCode: '03', type: 'COMPOSITION', filingCategory: 'COMPOSITION', portalStatus: 'ACTIVE', token: { state: 'ACTIVE', expiresAt: iso('2026-12-20') } }],
    tans: [],
    dscs: [],
    itcReconciled: 0, pendingMismatch: 0,
  },
];

// Obligation states per entity for the active period (Nov 2026 GST, Q3 TY 2026-27 TDS).
const MATRIX: Record<string, Partial<Record<Obligation, [FilingState, string, string?, number?]>>> = {
  //            state            updated                assignee override, amount
  'e-silk': { GSTR1: ['FILED', '2026-11-11T18:20'], IMS_2B: ['RECONCILED', '2026-11-18T16:05'], GSTR3B: ['CLIENT_APPROVED', '2026-11-19T09:40', undefined, 148_920], TDS_CHALLAN: ['VALIDATED', '2026-11-18T12:10', undefined, 62_400], TDS_RETURN: ['DRAFT', '2026-11-15T11:00'] },
  'e-golden': { GSTR1: ['FILED', '2026-11-10T17:45'], IMS_2B: ['DRAFT', '2026-11-16T10:20'], GSTR3B: ['DRAFT', '2026-11-16T10:25', undefined, 75_000], TDS_CHALLAN: ['FILED', '2026-11-06T15:00', undefined, 18_000], TDS_RETURN: ['DRAFT', '2026-11-12T13:30'] },
  'e-majha': { GSTR1: ['NA', '2026-11-01T09:00'], IMS_2B: ['RECONCILED', '2026-11-17T14:00'], GSTR3B: ['NA', '2026-11-01T09:00'] },
  'e-agro': { GSTR1: ['FILED', '2026-11-11T12:05'], IMS_2B: ['RECONCILED', '2026-11-18T19:30'], GSTR3B: ['RECONCILED', '2026-11-19T08:15', undefined, 236_400], TDS_CHALLAN: ['FILED', '2026-11-07T10:00', undefined, 48_200], TDS_RETURN: ['VALIDATED', '2026-11-17T16:40'] },
  'e-roadways': { GSTR1: ['FILED', '2026-11-09T16:30'], IMS_2B: ['VALIDATED', '2026-11-18T11:15'], GSTR3B: ['DRAFT', '2026-11-18T11:20', undefined, 8_000], TDS_CHALLAN: ['DRAFT', '2026-11-14T10:00', undefined, 6_500], TDS_RETURN: ['DRAFT', '2026-11-10T10:00'] },
  'e-lawrence': { GSTR1: ['FILED', '2026-11-11T11:10'], IMS_2B: ['RECONCILED', '2026-11-17T17:50'], GSTR3B: ['PORTAL_SAVED', '2026-11-19T10:05', undefined, 12_000], TDS_CHALLAN: ['FILED', '2026-11-05T12:00', undefined, 21_700], TDS_RETURN: ['FILED', '2026-10-29T17:00'] },
  'e-hall': { GSTR1: ['NA', '2026-11-01T09:00'], IMS_2B: ['DRAFT', '2026-11-13T15:00'], GSTR3B: ['NA', '2026-11-01T09:00'] },
  'e-batala': { GSTR1: ['FILED', '2026-11-11T19:55'], IMS_2B: ['RECONCILED', '2026-11-18T18:10'], GSTR3B: ['CLIENT_APPROVED', '2026-11-19T08:50', undefined, 8_000], TDS_CHALLAN: ['VALIDATED', '2026-11-18T09:30', undefined, 33_000], TDS_RETURN: ['FILED', '2026-10-30T18:20'] },
  'e-tarn': { GSTR1: ['NA', '2026-11-01T09:00'], IMS_2B: ['NA', '2026-11-01T09:00'], GSTR3B: ['NA', '2026-11-01T09:00'] },
};

const PERIOD_LABEL: Record<Obligation, string> = {
  GSTR1: 'Oct 2026',
  IMS_2B: 'Oct 2026',
  GSTR3B: 'Oct 2026',
  TDS_CHALLAN: 'Oct 2026',
  TDS_RETURN: 'Q3 TY 2026-27',
};

function buildFilings(): FilingCell[] {
  const cells: FilingCell[] = [];
  for (const e of ENTITIES) {
    const row = MATRIX[e.id] ?? {};
    (['GSTR1', 'IMS_2B', 'GSTR3B', 'TDS_CHALLAN', 'TDS_RETURN'] as Obligation[]).forEach((ob) => {
      const v = row[ob];
      const noTan = (ob === 'TDS_CHALLAN' || ob === 'TDS_RETURN') && e.tans.length === 0;
      cells.push({
        entityId: e.id,
        obligation: ob,
        periodLabel: PERIOD_LABEL[ob],
        state: noTan || !v ? 'NA' : v[0],
        updatedAt: v ? `${v[1]}:00+05:30` : '2026-11-01T09:00:00+05:30',
        assignee: v?.[2] ?? e.assignedTo,
        amount: v?.[3],
      });
    });
  }
  return cells;
}

export const SAMPLE_SNAPSHOT: WorkspaceSnapshot = {
  firm: { id: 'f-verma', name: 'Verma & Associates CA (Amritsar)', frn: '014289N' },
  staff: STAFF,
  groups: GROUPS,
  entities: ENTITIES,
  filings: buildFilings(),
  openReturns: [
    { entityId: 'e-roadways', gstin: ENTITIES[4].gstins[0].gstin, returnType: 'GSTR-9', periodLabel: 'FY 2022-23', dueDate: '2023-12-31' },
    { entityId: 'e-hall', gstin: ENTITIES[6].gstins[0].gstin, returnType: 'GSTR-1', periodLabel: 'Nov 2023', dueDate: '2023-12-11' },
    { entityId: 'e-majha', gstin: ENTITIES[2].gstins[0].gstin, returnType: 'GSTR-3B', periodLabel: 'Q4 FY 2023-24', dueDate: '2024-04-24' },
  ],
  filedStatements: [
    { entityId: 'e-silk', tan: 'AMRA01492B', form: '26Q', periodLabel: 'Q4 FY 2023-24', dueDate: '2024-05-31', openDefaults: 12_840 },
    { entityId: 'e-golden', tan: 'AMRG05512C', form: '24Q', periodLabel: 'Q1 FY 2024-25', dueDate: '2024-07-31', openDefaults: 3_200 },
    { entityId: 'e-batala', tan: 'AMRB04471G', form: '26Q', periodLabel: 'Q2 FY 2025-26', dueDate: '2025-10-31', openDefaults: 0 },
  ],
  ims: [
    { id: 'i1', entityId: 'e-silk', gstin: ENTITIES[0].gstins[0].gstin, supplierName: 'Ludhiana Yarn House', taxableValue: 184_000, section17_5: false, action: 'NONE' },
    { id: 'i2', entityId: 'e-silk', gstin: ENTITIES[0].gstins[0].gstin, supplierName: 'Hotel Ritz Plaza (staff party)', taxableValue: 18_500, section17_5: true, action: 'NONE' },
    { id: 'i3', entityId: 'e-agro', gstin: ENTITIES[3].gstins[0].gstin, supplierName: 'Punjab Packaging Co', taxableValue: 62_300, section17_5: false, action: 'NONE' },
    { id: 'i4', entityId: 'e-agro', gstin: ENTITIES[3].gstins[0].gstin, supplierName: 'Sandhu Motors (car)', taxableValue: 640_000, section17_5: true, action: 'NONE' },
    { id: 'i5', entityId: 'e-batala', gstin: ENTITIES[7].gstins[0].gstin, supplierName: 'Mandi Gobindgarh Steel', taxableValue: 412_000, section17_5: false, action: 'A' },
    { id: 'i6', entityId: 'e-golden', gstin: ENTITIES[1].gstins[0].gstin, supplierName: 'Cipla Distributors', taxableValue: 96_400, section17_5: false, action: 'NONE' },
    { id: 'i7', entityId: 'e-golden', gstin: ENTITIES[1].gstins[0].gstin, supplierName: 'Local stationery', taxableValue: 2_100, section17_5: false, action: 'NONE' },
  ],
  notifications: [
    { id: 'n1', category: 'TOKEN', title: 'GSTN access revoked', body: 'Golden City Healthcare revoked API access. Ask the client for a fresh OTP consent.', at: '2026-11-19T09:12:00+05:30', href: '/clients', entityId: 'e-golden' },
    { id: 'n2', category: 'APPROVAL', title: '2 returns waiting for your sign-off', body: 'Amritsar Silk Mills and Batala Castings GSTR-3B are client-approved.', at: '2026-11-19T09:45:00+05:30', href: '/dashboard?view=matrix' },
    { id: 'n3', category: 'IMS', title: 'IMS cut-off on 14 Dec', body: '5 supplier documents above Rs 25,000 or under Sec 17(5) still have no action.', at: '2026-11-19T08:00:00+05:30', href: '/gst/recon-2b' },
    { id: 'n4', category: 'FVU', title: 'FVU 1.2 validation passed', body: 'Agro Exports, Form 140, Q3 TY 2026-27 is ready to upload.', at: '2026-11-18T16:42:00+05:30', href: '/tds', entityId: 'e-agro' },
    { id: 'n5', category: 'FVU', title: 'FVU 9.5 rejected a correction', body: 'Amritsar Silk Mills 26Q Q4 FY 2023-24: T-FV-4021, challan amount mismatch.', at: '2026-11-18T12:05:00+05:30', href: '/tds', entityId: 'e-silk' },
  ],
  activePeriod: '2026-10',
  outflow: [
    { month: 'APR', itc: 38, cash: 12 }, { month: 'MAY', itc: 41, cash: 15 }, { month: 'JUN', itc: 52, cash: 14 },
    { month: 'JUL', itc: 47, cash: 18 }, { month: 'AUG', itc: 58, cash: 16 }, { month: 'SEP', itc: 61, cash: 21 },
    { month: 'OCT', itc: 66, cash: 19 }, { month: 'NOV', itc: 0, cash: 0 }, { month: 'DEC', itc: 0, cash: 0 },
    { month: 'JAN', itc: 0, cash: 0 }, { month: 'FEB', itc: 0, cash: 0 }, { month: 'MAR', itc: 0, cash: 0 },
  ],
  velocity: [1, 0, 2, 1, 3, 2, 6, 2, 4, 9, 22, 6, 4, 11, 3, 2, 4, 9, 18, 31, 7, 2, 3, 1, 1, 0, 2, 3, 4, 2],
  composition: [
    { key: 'IGST', value: 501_600 },
    { key: 'CGST', value: 313_500 },
    { key: 'SGST', value: 313_500 },
    { key: 'RCM cash', value: 62_700 },
    { key: 'TDS deposited', value: 189_800 },
  ],
};
