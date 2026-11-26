/**
 * Aggressive Invoice Normalization Engine (Sprint 3 / Services Recon Matcher)
 * Solves the critical 6-day reconciliation failure where accounting software
 * stores 'SALES/25-26/1' while suppliers upload 'SALES25261' on the GST portal.
 */

// Normalizes financial year tokens:
// '2025-26', '25-26', '202526', '2526' -> '2526'
// '2026-27', '26-27', '202627', '2627' -> '2627'
function normalizeFyTokens(input: string): string {
  return input
    .replace(/\b20(2[4-9])-?(2[5-9])\b/g, '$1$2') // e.g. 2025-26 -> 2526, 2026-27 -> 2627
    .replace(/\b(2[4-9])-?(2[5-9])\b/g, '$1$2');  // e.g. 25-26 -> 2526
}

/**
 * The parts of an invoice number once case, financial-year tokens and leading zeros are evened
 * out: 'SALES/25-26/0001' -> ['SALES', '2526', '1'].
 */
export function invoiceNumberSegments(rawInvoiceNum: string): string[] {
  if (!rawInvoiceNum) return [];

  let normalized = rawInvoiceNum.trim().toUpperCase();

  // 1. Normalize financial year tokens before segmenting
  normalized = normalizeFyTokens(normalized);

  // 2. Split into segments using non-alphanumeric delimiters
  const segments = normalized.split(/[^A-Z0-9]+/).filter(Boolean);

  // 3. Normalize each segment: strip leading zeros from pure numeric segments (e.g. '0042' -> '42'),
  // preserving 4-digit FY tokens (e.g. '2526', '2627')
  return segments.map((seg) => {
    // If it's a 4-digit FY token (e.g. 2526), keep it intact
    if (/^2[4-9]2[5-9]$/.test(seg)) {
      return seg;
    }
    // If it's purely numeric with leading zeros, strip leading zeros
    if (/^0+[0-9]+$/.test(seg)) {
      return seg.replace(/^0+/, '') || '0';
    }
    // If segment has prefix like 'INV0042', strip zeros between letters and digits
    return seg.replace(/([A-Z])0+([1-9][0-9]*)/g, '$1$2');
  });
}

/**
 * Loose key: the segments joined with nothing, so 'SALES/25-26/1' and 'SALES25261' meet. Two
 * different numbers can share it ('A/1/12' and 'A/11/2' are both 'A112'); see
 * strictInvoiceKey for the tie-break.
 */
export function normalizeInvoiceNumber(rawInvoiceNum: string): string {
  return invoiceNumberSegments(rawInvoiceNum).join('');
}

/**
 * Strict key: the same segments with their boundaries kept, so 'A/1/12' and 'A-1-12' meet but
 * 'A/1/12' and 'A/11/2' do not. The matcher tries this before the loose key.
 */
export function strictInvoiceKey(rawInvoiceNum: string): string {
  return invoiceNumberSegments(rawInvoiceNum).join('|');
}

export interface InvoiceMatchResult {
  isExactMatch: boolean;
  isFuzzyMatch: boolean;
  normalizedBookNum: string;
  normalizedPortalNum: string;
  confidenceScore: number;
}

export function compareInvoices(bookInvoiceNum: string, portalInvoiceNum: string): InvoiceMatchResult {
  const cleanBook = (bookInvoiceNum || '').trim().toUpperCase();
  const cleanPortal = (portalInvoiceNum || '').trim().toUpperCase();

  if (cleanBook === cleanPortal) {
    return {
      isExactMatch: true,
      isFuzzyMatch: true,
      normalizedBookNum: cleanBook,
      normalizedPortalNum: cleanPortal,
      confidenceScore: 1.0,
    };
  }

  const normBook = normalizeInvoiceNumber(cleanBook);
  const normPortal = normalizeInvoiceNumber(cleanPortal);

  const isFuzzy = normBook === normPortal && normBook.length > 0;

  return {
    isExactMatch: false,
    isFuzzyMatch: isFuzzy,
    normalizedBookNum: normBook,
    normalizedPortalNum: normPortal,
    confidenceScore: isFuzzy ? 0.95 : 0.0,
  };
}
