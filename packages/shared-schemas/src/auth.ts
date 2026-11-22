import { z } from 'zod';

export const UserRoleEnum = z.enum(['PARTNER', 'MANAGER', 'STAFF', 'CLIENT']);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const LifecycleStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export type LifecycleStatus = z.infer<typeof LifecycleStatusEnum>;

export const LoginRequestSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  firmId: z.guid('Invalid firm ID').optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const MfaSetupResponseSchema = z.object({
  secret: z.string(),
  qrCodeUrl: z.string().url(),
  backupCodes: z.array(z.string().length(8)),
});
export type MfaSetupResponse = z.infer<typeof MfaSetupResponseSchema>;

export const MfaVerifyRequestSchema = z.object({
  sessionToken: z.string().min(1, 'Session token is required'),
  totpCode: z.string().regex(/^[0-9]{6}$/, 'TOTP code must be exactly 6 digits'),
});
export type MfaVerifyRequest = z.infer<typeof MfaVerifyRequestSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const AuthTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresInSeconds: z.number().int().positive(),
  user: z.object({
    id: z.guid(),
    firmId: z.guid(),
    email: z.string().email(),
    displayName: z.string(),
    role: UserRoleEnum,
    firmName: z.string(),
  }),
});
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;

export const UserSessionPayloadSchema = z.object({
  userId: z.guid(),
  firmId: z.guid(),
  identityId: z.guid(),
  role: UserRoleEnum,
  email: z.string().email(),
  displayName: z.string(),
});
export type UserSessionPayload = z.infer<typeof UserSessionPayloadSchema>;
