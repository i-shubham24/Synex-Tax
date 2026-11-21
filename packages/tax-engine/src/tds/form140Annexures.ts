/**
 * Annexures of Protean's "File Format for Non-Salary TDS File - Form Number 140 (26Q) - Q1 to Q4",
 * file "Form Number 140 - 26Q - Q1 to Q4_22072026.xlsx" (tinpan.proteantech.in, read 20 Nov 2026).
 * Copied verbatim; replace from the new file when Protean revises the format.
 */

/** Annexure 1: state codes used in TDS statements. These are NOT the GST state codes (Punjab is 26 here, 03 in GST). */
export const PROTEAN_STATE_CODES: Record<string, string> = {
  'ANDAMAN AND NICOBAR ISLANDS': '01',
  'ANDHRA PRADESH': '02',
  'ARUNACHAL PRADESH': '03',
  ASSAM: '04',
  BIHAR: '05',
  CHANDIGARH: '06',
  'DADRA & NAGAR HAVELI AND DAMAN & DIU': '07',
  DELHI: '09',
  GOA: '10',
  GUJARAT: '11',
  HARYANA: '12',
  'HIMACHAL PRADESH': '13',
  'JAMMU & KASHMIR': '14',
  KARNATAKA: '15',
  KERALA: '16',
  LAKSHWADEEP: '17',
  'MADHYA PRADESH': '18',
  MAHARASHTRA: '19',
  MANIPUR: '20',
  MEGHALAYA: '21',
  MIZORAM: '22',
  NAGALAND: '23',
  ODISHA: '24',
  PONDICHERRY: '25',
  PUNJAB: '26',
  RAJASTHAN: '27',
  SIKKIM: '28',
  'TAMIL NADU': '29',
  TRIPURA: '30',
  'UTTAR PRADESH': '31',
  'WEST BENGAL': '32',
  CHHATTISGARH: '33',
  UTTARAKHAND: '34',
  JHARKHAND: '35',
  TELANGANA: '36',
  LADAKH: '37',
};

const STATE_ALIASES: Record<string, string> = {
  ORISSA: 'ODISHA',
  PUDUCHERRY: 'PONDICHERRY',
  LAKSHADWEEP: 'LAKSHWADEEP',
  'JAMMU AND KASHMIR': 'JAMMU & KASHMIR',
  'NCT OF DELHI': 'DELHI',
  'DADRA AND NAGAR HAVELI AND DAMAN AND DIU': 'DADRA & NAGAR HAVELI AND DAMAN & DIU',
  'ANDAMAN & NICOBAR ISLANDS': 'ANDAMAN AND NICOBAR ISLANDS',
};

/** Protean state code for a state name in any common spelling; undefined if unknown. */
export function proteanStateCode(name: string): string | undefined {
  const n = name.trim().toUpperCase().replace(/\s+/g, ' ');
  return PROTEAN_STATE_CODES[n] ?? PROTEAN_STATE_CODES[STATE_ALIASES[n] ?? ''];
}

/** Annexure 4: deductor category. */
export const DEDUCTOR_TYPES: Record<string, string> = {
  A: 'Central Government',
  S: 'State Government',
  D: 'Statutory body (Central Govt.)',
  E: 'Statutory body (State Govt.)',
  G: 'Autonomous body (Central Govt.)',
  H: 'Autonomous body (State Govt.)',
  L: 'Local Authority (Central Govt.)',
  N: 'Local Authority (State Govt.)',
  K: 'Company',
  M: 'Branch / Division of Company',
  P: 'Association of Person (AOP)',
  T: 'Association of Person (Trust)',
  J: 'Artificial Juridical Person',
  B: 'Body of Individuals',
  Q: 'Individual/HUF',
  F: 'Firm',
};

export const GOVERNMENT_DEDUCTOR_TYPES = new Set(['A', 'S', 'D', 'E', 'G', 'H', 'L', 'N']);

/** Annexure 7: minor head of challan. */
export const MINOR_HEADS: Record<string, string> = {
  '200': 'TDS payable by taxpayer',
  '400': 'TDS regular assessment (Raised by I. T. Dept.)',
  '100': 'Advance Tax',
};

const ALL_CODES =
  '1004,1005,1006,1008,1009,1011,1012,1013,1014,1015,1016,1017,1018,1019,1020,1021,1022,1023,1024,1026,1027,1028,1029,1030,1031,1033,1034,1035,1037,1038,1058,1059,1060,1061,1062,1063,1064,1065,1066,1067';

/** Annexure 6: reason flags for lower, nil or higher deduction, and the section codes each may be used with. */
export const REASON_FLAGS: Record<string, { description: string; sections: ReadonlySet<string> }> = Object.fromEntries(
  (
    [
      ['A', '“Lower deduction” or “no deduction” is on account of a certificate under section 395(1)', ALL_CODES],
      ['B', 'No deduction is on account of declaration under section 393(6)', '1004,1005,1008,1009,1013,1019,1020,1021,1022,1029,1030'],
      ['C', 'Deduction is on higher rate under section 397(2) on account of non-furnishing of PAN', ALL_CODES],
      ['D', 'No deduction or lower deduction is on account of payment made to a person or class of person on account of notification issued under section 194A(5)', '1020,1021,1022'],
      ['E', 'No deduction is on account of payment being made to a person referred to in Board Circular No. 3 of 2002 or Board Circular No. 11 of 2002', ALL_CODES],
      ['N', 'No deduction is on account of payment made to a person referred to in section 393(4) [Table: Sl. No. 18] or on account of a notification', '1064,1065'],
      ['O', 'No deduction as per the provisions of section 393(4) [Table: Sl. No. 5]', '1015'],
      ['P', 'No deduction is on account of payment of dividend made to a business trust referred to in section 393(4) [Table: Sl. No. 10(d)]', '1029'],
      ['Q', 'No deduction is on account of payment made to an entity referred to in section 393(4) [Table: Sl. No. 7(c)(v)]', '1020,1021,1022'],
      ['S', 'No deduction in view of the tax being deductible or collectible under another provision for the transaction referred in section 393(1) [Table Sl. No. 8]', '1031'],
      ['T', 'No deduction is on account of deductee being a transporter; PAN of deductee is mandatory {section 393(4) [Table: Sl. No. 8]}', '1023,1024'],
      ['Y', 'No deduction is on account of payment below threshold limit as specified in the Act', '1004,1005,1006,1012,1013,1019,1020,1021,1022,1023,1024,1026,1027,1029,1030,1031,1033,1034,1035,1037,1038,1058,1059,1062,1063,1066,1067'],
      ['Z', 'No deduction or lower deduction is on account of a notification issued under section 400(1)', '1005,1006,1008,1017,1019,1023,1024,1026,1027,1028,1029,1045,1046'],
    ] as Array<[string, string, string]>
  ).map(([flag, description, codes]) => [flag, { description, sections: new Set(codes.split(',')) }]),
);

/** Section codes where tax deducted and deposited may be zero because the benefit is in kind (field 24/25 remarks). */
export const IN_KIND_SECTION_CODES = new Set(['1034', '1038', '1059', '1061']);
