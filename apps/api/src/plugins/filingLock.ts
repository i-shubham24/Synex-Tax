export interface FilingLockParams {
  firmId: string;
  registrationId: string;
  returnPeriod: string;
  returnType: string;
  lockedByUserId: string;
  ttlSeconds?: number;
}

export class FilingLockManager {
  private static instance: FilingLockManager;
  // In-memory distributed lock table with TTL
  private locks = new Map<string, { userId: string; acquiredAt: number; expiresAt: number }>();

  public static getInstance(): FilingLockManager {
    if (!FilingLockManager.instance) {
      FilingLockManager.instance = new FilingLockManager();
    }
    return FilingLockManager.instance;
  }

  private makeKey(firmId: string, registrationId: string, returnPeriod: string, returnType: string): string {
    return `filing_lock:${firmId}:${registrationId}:${returnPeriod}:${returnType}`;
  }

  public async acquireLock(params: FilingLockParams): Promise<{ acquired: boolean; currentHolder?: string; remainingSeconds?: number }> {
    const key = this.makeKey(params.firmId, params.registrationId, params.returnPeriod, params.returnType);
    const now = Date.now();
    const ttlMs = (params.ttlSeconds || 600) * 1000; // default 10 minutes

    const existing = this.locks.get(key);
    if (existing && existing.expiresAt > now) {
      if (existing.userId === params.lockedByUserId) {
        // Re-entrant renewal
        existing.expiresAt = now + ttlMs;
        return { acquired: true };
      }
      const remainingSeconds = Math.ceil((existing.expiresAt - now) / 1000);
      return { acquired: false, currentHolder: existing.userId, remainingSeconds };
    }

    this.locks.set(key, {
      userId: params.lockedByUserId,
      acquiredAt: now,
      expiresAt: now + ttlMs,
    });

    return { acquired: true };
  }

  public async releaseLock(params: Omit<FilingLockParams, 'ttlSeconds'>): Promise<boolean> {
    const key = this.makeKey(params.firmId, params.registrationId, params.returnPeriod, params.returnType);
    const existing = this.locks.get(key);
    if (!existing) return true;

    if (existing.userId === params.lockedByUserId) {
      this.locks.delete(key);
      return true;
    }
    return false;
  }
}

export const filingLockManager = FilingLockManager.getInstance();
