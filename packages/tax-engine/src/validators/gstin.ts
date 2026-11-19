const GSTN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const GSTN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Calculates the official GSTN Mod-36 checksum character for the first 14 characters of a GSTIN.
 */
export function calculateGstinChecksum(first14Chars: string): string | null {
  if (!first14Chars || first14Chars.length !== 14) {
    return null;
  }
  const upper = first14Chars.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const val = GSTN_ALPHABET.indexOf(upper[i]);
    if (val === -1) {
      return null;
    }
    const factor = i % 2 === 0 ? 1 : 2;
    const prod = val * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const checkCode = (36 - (sum % 36)) % 36;
  return GSTN_ALPHABET[checkCode];
}

/**
 * Validates format, state code, and Mod-36 checksum of a 15-character GSTIN.
 */
export function validateGstin(gstin: string): { isValid: boolean; stateCode?: string; stateName?: string; error?: string } {
  if (!gstin) {
    return { isValid: false, error: 'GSTIN is required' };
  }
  const trimmed = gstin.trim().toUpperCase();
  if (trimmed.length !== 15) {
    return { isValid: false, error: `GSTIN must be exactly 15 characters (received ${trimmed.length})` };
  }
  if (!GSTIN_REGEX.test(trimmed)) {
    return { isValid: false, error: 'GSTIN format is invalid. Must match 2-digit state + 10-char PAN + 1-char entity + Z + 1-char checksum' };
  }
  const stateCode = trimmed.substring(0, 2);
  const stateName = GSTN_STATE_CODES[stateCode];
  if (!stateName) {
    return { isValid: false, error: `Invalid GST state code: ${stateCode}` };
  }
  const expectedChecksum = calculateGstinChecksum(trimmed.substring(0, 14));
  if (expectedChecksum !== trimmed[14]) {
    return {
      isValid: false,
      stateCode,
      stateName,
      error: `GSTIN Mod-36 checksum failure: expected '${expectedChecksum}', received '${trimmed[14]}'`,
    };
  }

  return { isValid: true, stateCode, stateName };
}
