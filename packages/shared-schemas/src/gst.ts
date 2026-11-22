import { z } from 'zod';
import { GstinStringSchema } from './tenancy.js';

export const DocTypeEnum = z.enum(['INV', 'CRN', 'DBN']);
export type DocType = z.infer<typeof DocTypeEnum>;

export const SupplyTypeEnum = z.enum([
  'B2B',
  'B2CL',
  'B2CS',
  'EXPWP',
  'EXPWOP',
  'RCMDOM',
  'RCMIMP',
  'SEZWP',
  'SEZWOP',
]);
export type SupplyType = z.infer<typeof SupplyTypeEnum>;

export const ImsActionEnum = z.enum(['A', 'R', 'P', 'NONE']);
export type ImsAction = z.infer<typeof ImsActionEnum>;

export const FilingWorkflowStatusEnum = z.enum([
  'DRAFT',
  'VALIDATED',
  'RECONCILED',
  'CLIENT_APPROVED',
  'PORTAL_SAVED',
  'FILED',
  'CLOSED',
]);
export type FilingWorkflowStatus = z.infer<typeof FilingWorkflowStatusEnum>;

export const ReconStatusEnum = z.enum([
  'EXACT_MATCH',
  'FUZZY_MATCH',
  'MANUAL_MATCH',
  'MISMATCH_VALUE',
  'VENDOR_NOT_IN_2B',
  'PURCHASE_NOT_IN_PR',
  'UNRECONCILED',
]);
export type ReconStatus = z.infer<typeof ReconStatusEnum>;

export const ItcEligibilityEnum = z.enum([
  'ELIGIBLE',
  'INELIGIBLE_17_5',
  'INELIGIBLE_RULE_42_43',
  'INELIGIBLE_OTHER',
]);
export type ItcEligibility = z.infer<typeof ItcEligibilityEnum>;

// Monetary amount string schema for zero-float arithmetic
export const MonetaryAmountSchema = z
  .string()
  .regex(/^-?[0-9]+(\.[0-9]{1,2})?$/, 'Must be a valid currency string with up to 2 decimal places')
  .default('0.00');

export const TaxRateSchema = z
  .string()
  .regex(/^[0-9]+(\.[0-9]{1,4})?$/, 'Must be a valid tax rate string with up to 4 decimal places')
  .default('0.0000');

// ---------------------------------------------------------------------
// Sales Register Invoice Schema (GSTR-1 / e-Invoice)
// ---------------------------------------------------------------------
export const SalesInvoiceCreateSchema = z.object({
  entityId: z.guid(),
  gstRegistrationId: z.guid(),
  invoiceNum: z.string().trim().regex(/^[A-Za-z0-9\-\/]{1,16}$/, 'Rule 46(b) maximum 16 chars: A-Z, 0-9, -, /'),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  docType: DocTypeEnum.default('INV'),
  supplyType: SupplyTypeEnum.default('B2B'),
  customerGstin: GstinStringSchema.optional(),
  customerLegalName: z.string().trim().max(200).optional(),
  posStateCode: z.string().length(2),
  reverseCharge: z.boolean().default(false),
  tableSection: z.string().default('4A'),
  taxableValue: MonetaryAmountSchema,
  igstRate: TaxRateSchema,
  igstAmount: MonetaryAmountSchema,
  cgstRate: TaxRateSchema,
  cgstAmount: MonetaryAmountSchema,
  sgstRate: TaxRateSchema,
  sgstAmount: MonetaryAmountSchema,
  cessRate: TaxRateSchema,
  cessAmount: MonetaryAmountSchema,
  totalInvoiceValue: MonetaryAmountSchema,
  originalInvoiceRef: z.string().trim().max(32).optional(),
  originalInvoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  returnPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM'),
});
export type SalesInvoiceCreate = z.infer<typeof SalesInvoiceCreateSchema>;

// ---------------------------------------------------------------------
// Purchase Register Invoice Schema (GSTR-2B Recon)
// ---------------------------------------------------------------------
export const PurchaseInvoiceCreateSchema = z.object({
  entityId: z.guid(),
  gstRegistrationId: z.guid(),
  vendorGstin: GstinStringSchema,
  vendorTradeName: z.string().trim().max(200).optional(),
  invoiceNum: z.string().trim().max(32),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  docType: DocTypeEnum.default('INV'),
  posStateCode: z.string().length(2),
  reverseCharge: z.boolean().default(false),
  taxableValue: MonetaryAmountSchema,
  igstAmount: MonetaryAmountSchema,
  cgstAmount: MonetaryAmountSchema,
  sgstAmount: MonetaryAmountSchema,
  cessAmount: MonetaryAmountSchema,
  totalInvoiceValue: MonetaryAmountSchema,
  itcEligibility: ItcEligibilityEnum.default('ELIGIBLE'),
  returnPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM'),
});
export type PurchaseInvoiceCreate = z.infer<typeof PurchaseInvoiceCreateSchema>;

// ---------------------------------------------------------------------
// GST Filing State Machine Schema
// ---------------------------------------------------------------------
export const GstFilingStatusSchema = z.object({
  id: z.guid(),
  gstRegistrationId: z.guid(),
  returnPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  returnType: z.enum(['GSTR1', 'GSTR1A', 'GSTR3B', 'CMP08', 'GSTR9', 'GSTR9C', 'IFF']),
  workflowStatus: FilingWorkflowStatusEnum,
  recomputeGstr2bRequired: z.boolean().default(false),
  statutoryDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiryDate3Yr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is3YrExpired: z.boolean().default(false),
});
export type GstFilingStatus = z.infer<typeof GstFilingStatusSchema>;
