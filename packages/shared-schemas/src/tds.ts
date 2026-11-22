import { z } from 'zod';
import { MonetaryAmountSchema, TaxRateSchema } from './gst.js';
import { PanStringSchema, TanStringSchema } from './tenancy.js';

export const StatutoryRegimeEnum = z.enum(['IT_ACT_1961', 'IT_ACT_2025']);
export type StatutoryRegime = z.infer<typeof StatutoryRegimeEnum>;

export const QuarterEnum = z.enum(['Q1', 'Q2', 'Q3', 'Q4']);
export type Quarter = z.infer<typeof QuarterEnum>;

export const DeducteeTypeHeadEnum = z.enum(['0020', '0021']);
export type DeducteeTypeHead = z.infer<typeof DeducteeTypeHeadEnum>;

export const PROTEAN_NON_PAN_LITERALS = ['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID'] as const;

export const DeducteePanSchema = z.union([
  PanStringSchema,
  z.literal('PANNOTAVBL'),
  z.literal('PANAPPLIED'),
  z.literal('PANINVALID'),
]);
export type DeducteePan = z.infer<typeof DeducteePanSchema>;

// ---------------------------------------------------------------------
// Child Table: ITNS 281N Section Allocations
// ---------------------------------------------------------------------
export const TdsSectionAllocationSchema = z.object({
  sectionCode: z.string().trim().min(2).max(16),
  incomeTax: MonetaryAmountSchema,
  surcharge: MonetaryAmountSchema,
  cess: MonetaryAmountSchema,
  totalSectionAmount: MonetaryAmountSchema,
});
export type TdsSectionAllocation = z.infer<typeof TdsSectionAllocationSchema>;

// ---------------------------------------------------------------------
// TDS Challan Schema
// ---------------------------------------------------------------------
export const TdsChallanCreateSchema = z.object({
  entityId: z.guid(),
  tanRegistrationId: z.guid(),
  statutoryRegime: StatutoryRegimeEnum,
  taxYear: z.number().int().min(2000).max(2100),
  quarter: QuarterEnum,
  challanNo: z.string().trim().min(1).max(16),
  bsrCode: z.string().regex(/^[0-9]{7}$/, 'BSR Code must be exactly 7 digits'),
  depositDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  deducteeTypeHead: DeducteeTypeHeadEnum,
  minorHead: z.enum(['200', '400']).default('200'),
  interestAllocation: MonetaryAmountSchema,
  othersAllocation: MonetaryAmountSchema,
  feeLateFiling: MonetaryAmountSchema,
  totalChallanAmount: MonetaryAmountSchema,
  sectionAllocations: z.array(TdsSectionAllocationSchema).min(1),
}).refine(
  (data) => {
    if (data.statutoryRegime === 'IT_ACT_1961') {
      return data.sectionAllocations.length === 1;
    }
    // IT_ACT_2025 (ITNS 281N) allows up to 20 sections
    return data.sectionAllocations.length <= 20;
  },
  {
    message: 'ITNS 281 (IT Act 1961) allows exactly 1 section code; ITNS 281N (IT Act 2025) allows up to 20 section codes.',
    path: ['sectionAllocations'],
  }
);
export type TdsChallanCreate = z.infer<typeof TdsChallanCreateSchema>;

// ---------------------------------------------------------------------
// TDS Deductee Record Schema
// ---------------------------------------------------------------------
export const TdsDeducteeCreateSchema = z.object({
  entityId: z.guid(),
  tanRegistrationId: z.guid(),
  challanId: z.guid(),
  sectionAllocationId: z.guid(),
  deducteePan: DeducteePanSchema,
  deducteeName: z.string().trim().min(2).max(150),
  panStatus: z.enum(['OPERATIVE', 'INOPERATIVE', 'INVALID', 'UNAVAILABLE']).default('OPERATIVE'),
  paymentCreditDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountPaid: MonetaryAmountSchema,
  tdsRate: TaxRateSchema,
  tdsDeducted: MonetaryAmountSchema,
  surchargeAmount: MonetaryAmountSchema,
  cessAmount: MonetaryAmountSchema,
  totalTdsDeposited: MonetaryAmountSchema,
  deductionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  certificateNumber13: z.string().max(32).optional(),
});
export type TdsDeducteeCreate = z.infer<typeof TdsDeducteeCreateSchema>;

// ---------------------------------------------------------------------
// TDS Return Summary Schema
// ---------------------------------------------------------------------
export const TdsReturnFilingSchema = z.object({
  tan: TanStringSchema,
  formType: z.enum(['24Q', '26Q', '27Q', '27EQ', 'FORM_130_131']),
  financialYear: z.string().regex(/^\d{4}-\d{2}$/),
  quarter: QuarterEnum,
  totalChallanAmount: MonetaryAmountSchema,
  totalDeductionAmount: MonetaryAmountSchema,
  deducteesCount: z.number().int().min(0),
  panNotAvailableCount: z.number().int().min(0),
});
export type TdsReturnFiling = z.infer<typeof TdsReturnFilingSchema>;
