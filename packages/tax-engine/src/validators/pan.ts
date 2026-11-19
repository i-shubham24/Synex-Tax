export type PanConstitution =
  | 'COMPANY'
  | 'INDIVIDUAL'
  | 'HUF'
  | 'FIRM_LLP'
  | 'AOP'
  | 'TRUST'
  | 'BOI'
  | 'LOCAL_AUTHORITY'
  | 'ARTIFICIAL_JURIDICAL_PERSON'
  | 'GOVERNMENT'
  | 'UNKNOWN';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const CONSTITUTION_BY_FOURTH_CHAR: Record<string, PanConstitution> = {
  C: 'COMPANY',
  P: 'INDIVIDUAL',
  H: 'HUF',
  F: 'FIRM_LLP',
  A: 'AOP',
  T: 'TRUST',
  B: 'BOI',
  L: 'LOCAL_AUTHORITY',
  J: 'ARTIFICIAL_JURIDICAL_PERSON',
  G: 'GOVERNMENT',
};

export interface PanValidationResult {
  isValid: boolean;
  constitution?: PanConstitution;
  isCompany?: boolean;
  error?: string;
}

/**
 * Validates a 10-character Indian Permanent Account Number (PAN) and derives its constitution.
 */
export function validatePan(pan: string): PanValidationResult {
  if (!pan) {
    return { isValid: false, error: 'PAN is required' };
  }
  const upper = pan.trim().toUpperCase();
  if (upper.length !== 10) {
    return { isValid: false, error: `PAN must be exactly 10 characters (received ${upper.length})` };
  }
  if (!PAN_REGEX.test(upper)) {
    return { isValid: false, error: 'PAN format is invalid. Must match 5 letters + 4 digits + 1 letter' };
  }
  const fourthChar = upper[3];
  const constitution = CONSTITUTION_BY_FOURTH_CHAR[fourthChar] || 'UNKNOWN';
  const isCompany = fourthChar === 'C';

  return {
    isValid: true,
    constitution,
    isCompany,
  };
}

/**
 * Validates whether a deductee PAN matches the TDS Challan head:
 * - '0020' requires Company PAN (4th character 'C')
 * - '0021' requires Non-Company PAN (4th character NOT 'C')
 */
export function validatePanForChallanHead(
  pan: string,
  deducteeHead: '0020' | '0021'
): { isCompatible: boolean; error?: string } {
  const result = validatePan(pan);
  if (!result.isValid) {
    return { isCompatible: false, error: result.error };
  }

  if (deducteeHead === '0020') {
    if (!result.isCompany) {
      return {
        isCompatible: false,
        error: `Challan head '0020' is strictly for Companies. Deductee PAN ${pan} has constitution '${result.constitution}'. Use challan head '0021'.`,
      };
    }
  } else if (deducteeHead === '0021') {
    if (result.isCompany) {
      return {
        isCompatible: false,
        error: `Challan head '0021' is strictly for Non-Companies. Deductee PAN ${pan} is a Company PAN. Use challan head '0020'.`,
      };
    }
  }

  return { isCompatible: true };
}

/**
 * Returns Challan Major Head for a given PAN:
 * - '0020' for Companies (4th character 'C')
 * - '0021' for Non-Companies
 */
export function getMajorHeadForPan(pan: string): '0020' | '0021' {
  const result = validatePan(pan);
  return result.isCompany ? '0020' : '0021';
}
