import { z } from 'zod';

export const AuditActionEnum = z.enum(['INSERT', 'UPDATE', 'DELETE']);
export type AuditAction = z.infer<typeof AuditActionEnum>;

export const AuditLogQuerySchema = z.object({
  tableName: z.string().optional(),
  recordId: z.string().uuid().optional(),
  action: AuditActionEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const PiiRevealRequestSchema = z.object({
  targetTable: z.string().min(1),
  targetColumn: z.string().min(1),
  recordId: z.string().uuid(),
  accessReason: z.string().trim().min(10, 'Access reason must be at least 10 characters explaining statutory justification'),
});
export type PiiRevealRequest = z.infer<typeof PiiRevealRequestSchema>;

export const SigningAuditLogCreateSchema = z.object({
  entityId: z.string().uuid(),
  dscId: z.string().uuid().optional(),
  certSerialHex: z.string().min(1).max(64),
  holderPan: z.string().max(10).optional(),
  holderName: z.string().max(150).optional(),
  operation: z.enum([
    'GST_RETFILE_PKCS7',
    'TRACES_BATCH_PADES',
    'FORM_130_131_PADES',
    'EVC_VERIFICATION',
    'IRP_EINVOICE_SIGN',
    'AADHAAR_ESIGN',
  ]),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/, 'Must be 64-character SHA-256 hex string'),
  signatureNonce: z.string().uuid(),
  tokenProfile: z.enum(['FIPS_140_2', 'FIPS_140_3', 'EVC', 'AADHAAR']).default('FIPS_140_3'),
  status: z.enum(['SUCCESS', 'FAILED', 'REJECTED']),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type SigningAuditLogCreate = z.infer<typeof SigningAuditLogCreateSchema>;
