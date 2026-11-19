/**
 * Rule 46(b) of CGST Rules, 2017:
 * A tax invoice referred to in section 31 shall be issued by the registered
 * person containing the following particulars, namely:
 *   (b) a consecutive serial number, not exceeding sixteen characters, in one
 *       or multiple series, containing alphabets or numerals or special
 *       characters- hyphen or dash and slash symbolised as "-" and "/"
 *       respectively, and any combination thereof, unique for a financial year;
 */

const RULE_46_REGEX = /^[A-Za-z0-9\-\/]{1,16}$/;

export interface Rule46ValidationResult {
  isValid: boolean;
  sanitizedInvoiceNumber?: string;
  error?: string;
}

export function validateInvoiceNumberRule46(invoiceNumber: string): Rule46ValidationResult {
  if (!invoiceNumber) {
    return { isValid: false, error: 'Invoice number is mandatory' };
  }
  const trimmed = invoiceNumber.trim();
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Invoice number cannot be empty or whitespace' };
  }
  if (trimmed.length > 16) {
    return {
      isValid: false,
      error: `Invoice number exceeds statutory 16-character limit under Rule 46(b) (length: ${trimmed.length})`,
    };
  }
  if (!RULE_46_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: 'Invoice number violates Rule 46(b). Permitted characters: letters (A-Z, a-z), digits (0-9), hyphen (-), and forward slash (/) only. Spaces, dots, and underscores are prohibited on GSTN.',
    };
  }

  return { isValid: true, sanitizedInvoiceNumber: trimmed };
}
