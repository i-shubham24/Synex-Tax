import { Decimal } from 'decimal.js';

export interface PosValidationParams {
  supplierStateCode: string; // 2-digit e.g. "03"
  posStateCode: string; // 2-digit Place of Supply e.g. "03"
  supplyType?: 'B2B' | 'B2CL' | 'B2CS' | 'SEZWP' | 'SEZWOP' | 'EXPWP' | 'EXPWOP' | 'DE' | 'RCMDOM' | 'RCMIMP';
  igstAmount: Decimal | string | number;
  cgstAmount: Decimal | string | number;
  sgstAmount: Decimal | string | number;
}

export interface PosValidationResult {
  isValid: boolean;
  isIntraState: boolean;
  expectedTaxType: 'CGST_SGST' | 'IGST';
  error?: string;
}

/**
 * Validates Place of Supply against Supplier State to prevent statutory misallocation:
 * - Intra-state (Supplier State == POS) strictly requires CGST + SGST (IGST must be 0),
 *   except for SEZ supplies where IGST applies even intra-state.
 * - Inter-state (Supplier State != POS) strictly requires IGST (CGST and SGST must be 0).
 */
export function validatePlaceOfSupply(params: PosValidationParams): PosValidationResult {
  const { supplierStateCode, posStateCode, supplyType = 'B2B' } = params;
  const igst = new Decimal(params.igstAmount || 0);
  const cgst = new Decimal(params.cgstAmount || 0);
  const sgst = new Decimal(params.sgstAmount || 0);

  const isSezOrExport = supplyType === 'SEZWP' || supplyType === 'SEZWOP' || supplyType === 'EXPWP' || supplyType === 'EXPWOP';
  const isSameState = supplierStateCode === posStateCode;

  // SEZ and exports are treated as inter-state supplies (IGST) regardless of geographical state
  if (isSezOrExport) {
    if (cgst.greaterThan(0) || sgst.greaterThan(0)) {
      return {
        isValid: false,
        isIntraState: false,
        expectedTaxType: 'IGST',
        error: `Supply type ${supplyType} is statutorily deemed an inter-state supply. CGST and SGST cannot be charged; only IGST applies.`,
      };
    }
    return { isValid: true, isIntraState: false, expectedTaxType: 'IGST' };
  }

  if (isSameState) {
    // Intra-state
    if (igst.greaterThan(0)) {
      return {
        isValid: false,
        isIntraState: true,
        expectedTaxType: 'CGST_SGST',
        error: `Supplier state (${supplierStateCode}) matches Place of Supply (${posStateCode}). Intra-state supplies require CGST + SGST; IGST cannot be charged.`,
      };
    }
    // CGST and SGST must be identical in rate and amount for normal intra-state supplies
    if (!cgst.equals(sgst)) {
      return {
        isValid: false,
        isIntraState: true,
        expectedTaxType: 'CGST_SGST',
        error: `CGST amount (${cgst}) must exactly equal SGST amount (${sgst}) on intra-state supplies.`,
      };
    }
    return { isValid: true, isIntraState: true, expectedTaxType: 'CGST_SGST' };
  } else {
    // Inter-state
    if (cgst.greaterThan(0) || sgst.greaterThan(0)) {
      return {
        isValid: false,
        isIntraState: false,
        expectedTaxType: 'IGST',
        error: `Supplier state (${supplierStateCode}) differs from Place of Supply (${posStateCode}). Inter-state supplies require IGST; CGST and SGST cannot be charged.`,
      };
    }
    return { isValid: true, isIntraState: false, expectedTaxType: 'IGST' };
  }
}
