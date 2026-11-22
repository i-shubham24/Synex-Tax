import { z } from 'zod';

export const PortalKindEnum = z.enum(['GSTN', 'NIC_IRP', 'TRACES', 'CBDT_EFILING']);
export type PortalKind = z.infer<typeof PortalKindEnum>;

export const PortalHealthStatusEnum = z.enum(['OPERATIONAL', 'DEGRADED', 'OUTAGE', 'UNKNOWN']);
export type PortalHealthStatus = z.infer<typeof PortalHealthStatusEnum>;

export const PortalHealthItemSchema = z.object({
  portal: PortalKindEnum,
  name: z.string(),
  status: PortalHealthStatusEnum,
  latencyMs: z.number().int().nonnegative(),
  lastChecked: z.string(),
  message: z.string().optional(),
});
export type PortalHealthItem = z.infer<typeof PortalHealthItemSchema>;

export const PortalHealthResponseSchema = z.object({
  overallStatus: PortalHealthStatusEnum,
  checkedAt: z.string(),
  portals: z.array(PortalHealthItemSchema),
});
export type PortalHealthResponse = z.infer<typeof PortalHealthResponseSchema>;

export const FeatureFlagSchema = z.object({
  flagCode: z.string(),
  enabled: z.boolean(),
  effectiveFrom: z.string().nullable().optional(),
  description: z.string(),
});
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

export const DpdpConsentCreateSchema = z.object({
  entityId: z.guid(),
  purposeCode: z.enum(['GST_FILING', 'TDS_FILING', 'ITR_VERIFICATION', 'BANK_RECON', 'CLIENT_COMMUNICATION']),
  consentChannel: z.enum(['WEB_APP', 'OTP', 'PHYSICAL']).default('WEB_APP'),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DpdpConsentCreate = z.infer<typeof DpdpConsentCreateSchema>;
