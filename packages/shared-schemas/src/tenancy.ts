import { z } from 'zod';
import { LifecycleStatusEnum, UserRoleEnum } from './auth.js';

export const FirmKindEnum = z.enum([
  'CA_FIRM',
  'CA_PROPRIETOR',
  'TAX_ADVOCATE',
  'TAX_PRACTITIONER',
  'SME_SELF_SERVICE',
]);
export type FirmKind = z.infer<typeof FirmKindEnum>;

export const EntityConstitutionEnum = z.enum([
  'INDIVIDUAL',
  'PROPRIETORSHIP',
  'HUF',
  'PARTNERSHIP',
  'LLP',
  'PRIVATE_LIMITED',
  'PUBLIC_LIMITED',
  'ONE_PERSON_COMPANY',
  'SECTION_8_COMPANY',
  'FOREIGN_COMPANY',
  'TRUST',
  'SOCIETY',
  'AOP',
  'BOI',
  'COOPERATIVE_SOCIETY',
  'LOCAL_AUTHORITY',
  'GOVERNMENT',
  'ARTIFICIAL_JURIDICAL_PERSON',
]);
export type EntityConstitution = z.infer<typeof EntityConstitutionEnum>;

export const GstRegistrationTypeEnum = z.enum([
  'REGULAR',
  'COMPOSITION_10_1',
  'COMPOSITION_10_2A',
  'SEZ_UNIT',
  'SEZ_DEVELOPER',
  'ISD',
  'TDS_DEDUCTOR',
  'TCS_COLLECTOR',
  'NON_RESIDENT',
  'OIDAR',
  'CASUAL',
  'UIN_HOLDER',
]);
export type GstRegistrationType = z.infer<typeof GstRegistrationTypeEnum>;

export const PanStringSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid Indian PAN format (e.g. ABCDE1234F)');

export const GstinStringSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid Indian GSTIN format (15 characters)');

export const TanStringSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}[0-9]{5}[A-Z]$/, 'Invalid Indian TAN format (e.g. ABCD12345E)');

// ---------------------------------------------------------------------
// Firm Schemas
// ---------------------------------------------------------------------
export const FirmCreateSchema = z.object({
  legalName: z.string().trim().min(3).max(200),
  tradeName: z.string().trim().max(200).optional(),
  firmKind: FirmKindEnum,
  icaiFrn: z.string().trim().max(16).optional(),
  pan: PanStringSchema.optional(),
  gstin: GstinStringSchema.optional(),
  stateCode: z.string().length(2).default('03'),
  enforceSegregationOfDuties: z.boolean().default(true),
  defaultUiLanguage: z.enum(['en', 'pa', 'hi']).default('en'),
});
export type FirmCreate = z.infer<typeof FirmCreateSchema>;

export const FirmResponseSchema = FirmCreateSchema.extend({
  id: z.string().uuid(),
  status: LifecycleStatusEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FirmResponse = z.infer<typeof FirmResponseSchema>;

// ---------------------------------------------------------------------
// Client Group Schemas
// ---------------------------------------------------------------------
export const ClientGroupCreateSchema = z.object({
  firmId: z.string().uuid().optional(),
  groupName: z.string().trim().min(2).max(150),
  description: z.string().trim().max(500).optional(),
  primaryContactName: z.string().trim().max(100).optional(),
  primaryContactEmail: z.string().trim().email().optional(),
  primaryContactMobile: z.string().trim().regex(/^[0-9]{10}$/, '10-digit mobile number').optional(),
});
export type ClientGroupCreate = z.infer<typeof ClientGroupCreateSchema>;

export const ClientGroupResponseSchema = ClientGroupCreateSchema.extend({
  id: z.string().uuid(),
  firmId: z.string().uuid(),
  entityCount: z.number().int().nonnegative().default(0),
  status: LifecycleStatusEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ClientGroupResponse = z.infer<typeof ClientGroupResponseSchema>;

// ---------------------------------------------------------------------
// Legal Entity (PAN Level) Schemas
// ---------------------------------------------------------------------
export const EntityCreateSchema = z.object({
  firmId: z.string().uuid().optional(),
  clientGroupId: z.string().uuid(),
  pan: PanStringSchema,
  legalName: z.string().trim().min(2).max(200),
  tradeName: z.string().trim().max(200).optional(),
  constitution: EntityConstitutionEnum,
  dateOfIncorporation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  msmeUdyamNumber: z.string().trim().max(24).optional(),
  isRule14bEco: z.boolean().default(false),
  rule86bExempt: z.boolean().default(false),
  rule86bExemptReason: z.string().max(255).optional(),
  accountingSoftware: z.enum(['TALLY_PRIME', 'BUSY', 'ZOHO_BOOKS', 'EXCEL', 'MANUAL', 'OTHER']).default('TALLY_PRIME'),
});
export type EntityCreate = z.infer<typeof EntityCreateSchema>;

export const EntityResponseSchema = EntityCreateSchema.extend({
  id: z.string().uuid(),
  firmId: z.string().uuid(),
  status: LifecycleStatusEnum,
  gstinCount: z.number().int().nonnegative().default(0),
  tanCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EntityResponse = z.infer<typeof EntityResponseSchema>;

// ---------------------------------------------------------------------
// GST Registration Schemas
// ---------------------------------------------------------------------
export const GstRegistrationCreateSchema = z.object({
  firmId: z.string().uuid().optional(),
  entityId: z.string().uuid(),
  gstin: GstinStringSchema,
  stateCode: z.string().length(2),
  legalName: z.string().trim().max(200).optional(),
  tradeName: z.string().trim().max(200).optional(),
  registrationType: GstRegistrationTypeEnum.default('REGULAR'),
  filingFrequency: z.enum(['MONTHLY', 'QRMP']).default('MONTHLY'),
  isEinvoiceApplicable: z.boolean().default(false),
  isEwbApplicable: z.boolean().default(true),
  authUsername: z.string().trim().max(64).optional(),
});
export type GstRegistrationCreate = z.infer<typeof GstRegistrationCreateSchema>;

export const GstRegistrationResponseSchema = GstRegistrationCreateSchema.extend({
  id: z.string().uuid(),
  firmId: z.string().uuid(),
  portalAuthStatus: z.enum(['ACTIVE_SESSION', 'TOKEN_EXPIRED', 'NEVER_AUTHENTICATED']).default('NEVER_AUTHENTICATED'),
  status: LifecycleStatusEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GstRegistrationResponse = z.infer<typeof GstRegistrationResponseSchema>;

// ---------------------------------------------------------------------
// TAN Registration Schemas
// ---------------------------------------------------------------------
export const TanRegistrationCreateSchema = z.object({
  firmId: z.string().uuid().optional(),
  entityId: z.string().uuid(),
  tan: TanStringSchema,
  deductorType: z.enum(['COMPANY', 'NON_COMPANY']).default('COMPANY'),
  deductorBranch: z.string().trim().max(100).optional(),
  tracesUserId: z.string().trim().max(64).optional(),
});
export type TanRegistrationCreate = z.infer<typeof TanRegistrationCreateSchema>;

export const TanRegistrationResponseSchema = TanRegistrationCreateSchema.extend({
  id: z.string().uuid(),
  firmId: z.string().uuid(),
  tracesAuthStatus: z.enum(['VALID', 'EXPIRED', 'NOT_CONFIGURED']).default('NOT_CONFIGURED'),
  status: LifecycleStatusEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TanRegistrationResponse = z.infer<typeof TanRegistrationResponseSchema>;

// ---------------------------------------------------------------------
// User Client Assignment Schemas
// ---------------------------------------------------------------------
export const UserClientAssignmentCreateSchema = z.object({
  userId: z.string().uuid(),
  clientGroupId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
  scope: z.enum(['GROUP', 'ENTITY']).default('ENTITY'),
  canPrepare: z.boolean().default(true),
  canReview: z.boolean().default(false),
  canSignFile: z.boolean().default(false),
});
export type UserClientAssignmentCreate = z.infer<typeof UserClientAssignmentCreateSchema>;

export const UserClientAssignmentResponseSchema = UserClientAssignmentCreateSchema.extend({
  id: z.string().uuid(),
  firmId: z.string().uuid(),
  createdAt: z.string(),
});
export type UserClientAssignmentResponse = z.infer<typeof UserClientAssignmentResponseSchema>;
