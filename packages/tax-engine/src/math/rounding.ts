import { Decimal } from 'decimal.js';

export type NumericInput = Decimal | string | number;

/**
 * Section 170 CGST Act / State GST Acts:
 * The amount of tax, interest, penalty, fine or any other sum payable, and the
 * amount of refund or any other sum due, under the provisions of this Act shall
 * be rounded off to the nearest rupee and, for this purpose, where such amount
 * contains a part of a rupee consisting of paise, then, if such part is fifty
 * paise or more, it shall be increased to one rupee and if such part is less
 * than fifty paise it shall be ignored.
 *
 * Note: Invoice line items must preserve exact 2 decimal places.
 * Rounding is applied strictly at final tax liability / invoice round-off level.
 */
export function roundGstSection170(amount: NumericInput): Decimal {
  const d = new Decimal(amount);
  return d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/**
 * Section 516 Income-tax Act, 2025 / Section 288A & 288B Income-tax Act, 1961:
 * Step 1: Any part of a rupee consisting of paise shall be ignored (truncated).
 * Step 2: Thereafter, if the remaining amount is not a multiple of ten, but the
 *         last of the figures is five or more, the amount shall be increased to
 *         the next higher multiple of ten, and if the last of the figures is less
 *         than five, the amount shall be reduced to the next lower multiple of ten.
 *
 * Example:
 *   29994.70 -> Truncate paise to 29994 -> Last digit is 4 -> 29990
 *   29995.10 -> Truncate paise to 29995 -> Last digit is 5 -> 30000
 *   29994.99 -> Truncate paise to 29994 -> Last digit is 4 -> 29990
 */
export function roundItActSection516(amount: NumericInput): Decimal {
  const d = new Decimal(amount);
  const isNegative = d.isNegative();
  
  // Step 1: Truncate paise completely (drop fractional rupee)
  const rupees = d.abs().trunc();
  
  // Step 2: Round to nearest multiple of 10 based on units digit
  const units = rupees.mod(10).toNumber();
  let rounded: Decimal;
  if (units >= 5) {
    rounded = rupees.plus(10 - units);
  } else {
    rounded = rupees.minus(units);
  }

  return isNegative ? rounded.negated() : rounded;
}

/**
 * Rule 269 Income-tax Rules, 2026 / Rule 119A Income-tax Rules, 1962:
 * In calculating the interest payable by or to the assessee, the amount of tax,
 * penalty or other sum in respect of which such interest is to be calculated
 * shall be rounded off to the nearest multiple of one hundred rupees and for this
 * purpose any fraction of one hundred rupees shall be ignored (truncated down).
 *
 * Example:
 *   14589.50 -> Truncate down to multiple of 100 -> 14500
 *   99.99    -> Truncate down to multiple of 100 -> 0
 *   100.00   -> 100
 *   199.99   -> 100
 */
export function roundInterestBaseRule269(amount: NumericInput): Decimal {
  const d = new Decimal(amount);
  if (d.isZero() || d.isNegative()) {
    return new Decimal(0);
  }

  // Drop paise and truncate down to nearest multiple of 100
  const rupees = d.trunc();
  return rupees.dividedToIntegerBy(100).times(100);
}
