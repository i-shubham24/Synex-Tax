/**
 * Statutory Risk Radar detectors used by the Control Tower. Pure and deterministic:
 * the API runs them over firm data, the web app runs them over sample data in dev.
 */
import { IsoDate, daysBetween, makeDate } from './calendar.js';

/* ---------------------------------------------------- DSC expiry + FIPS */

export type FipsProfile = 'FIPS_140_2' | 'FIPS_140_3' | 'UNKNOWN';

export interface DscRecord {
  id: string;
  holder: string;
  entityName: string;
  validTo: IsoDate;
  fips: FipsProfile;
}

export interface DscRadarItem extends DscRecord {
  daysLeft: number;
  bucket: 7 | 15 | 45 | 'EXPIRED';
  /** CCA advisory: no DSC issuance on FIPS 140-2 modules after 21 Sep 2026; renewals need a FIPS 140-3 token. */
  needsNewToken: boolean;
}

export function dscExpiryRadar(dscs: DscRecord[], today: IsoDate, horizonDays = 45): DscRadarItem[] {
  return dscs
    .map((d) => {
      const daysLeft = daysBetween(today, d.validTo);
      const bucket: DscRadarItem['bucket'] = daysLeft < 0 ? 'EXPIRED' : daysLeft <= 7 ? 7 : daysLeft <= 15 ? 15 : 45;
      return { ...d, daysLeft, bucket, needsNewToken: d.fips !== 'FIPS_140_3' };
    })
    .filter((d) => d.daysLeft <= horizonDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/* ------------------------------------------------ GSTN API token watch */

/** Internal token states. GSTN signals revoked or disabled access with AUTH4037 / AUTH4033, not a named state. */
export type TokenState = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NOT_ENABLED';

export interface GstSession {
  gstin: string;
  entityName: string;
  state: TokenState;
  expiresAt: string | null; // ISO datetime
}

export interface TokenWatchItem extends GstSession {
  hoursLeft: number | null;
  reason: 'REVOKED' | 'EXPIRED' | 'NOT_ENABLED' | 'EXPIRING';
}

export function tokenWatch(sessions: GstSession[], nowMs: number, withinHours = 24): TokenWatchItem[] {
  const out: TokenWatchItem[] = [];
  for (const s of sessions) {
    const hoursLeft = s.expiresAt ? (Date.parse(s.expiresAt) - nowMs) / 3_600_000 : null;
    if (s.state === 'REVOKED' || s.state === 'NOT_ENABLED') out.push({ ...s, hoursLeft, reason: s.state });
    else if (s.state === 'EXPIRED' || (hoursLeft !== null && hoursLeft <= 0)) out.push({ ...s, hoursLeft, reason: 'EXPIRED' });
    else if (hoursLeft !== null && hoursLeft <= withinHours) out.push({ ...s, hoursLeft, reason: 'EXPIRING' });
  }
  const rank = { REVOKED: 0, EXPIRED: 1, NOT_ENABLED: 2, EXPIRING: 3 } as const;
  return out.sort((a, b) => rank[a.reason] - rank[b.reason] || (a.hoursLeft ?? 0) - (b.hoursLeft ?? 0));
}

/* ------------------------------------------------------ Pre-14th IMS */

export type ImsAction = 'A' | 'R' | 'P' | 'NONE';

export interface ImsRecord {
  id: string;
  gstin: string;
  entityName: string;
  supplierName: string;
  taxableValue: number;
  section17_5: boolean;
  action: ImsAction;
}

/**
 * GSTR-2B for a period is generated on the 14th of the following month; records left with
 * no action are deemed accepted then. Alerts open 48 hours before that cut-off.
 * @param period YYYY-MM of the inward-supply period
 */
export function pre14ImsGuard<T extends ImsRecord>(records: T[], period: string, nowMs: number, threshold = 25_000) {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  const cutoff = makeDate(y, m + 1, 14);
  const cutoffMs = Date.parse(`${cutoff}T00:00:00+05:30`);
  const hoursLeft = (cutoffMs - nowMs) / 3_600_000;
  const inWindow = hoursLeft > 0 && hoursLeft <= 48;
  const flagged = records.filter((r) => r.action === 'NONE' && (r.taxableValue > threshold || r.section17_5));
  return { cutoff, hoursLeft, inWindow, flagged };
}

/* ------------------------------------------------------------- ISD */

export interface EntityRegistrations {
  entityId: string;
  entityName: string;
  pan: string;
  gstins: Array<{ gstin: string; stateCode: string; type: string; active: boolean }>;
}

/** ISD registration is mandatory from 1 Apr 2025 where common input services are shared across GSTINs of one PAN. */
export function isdRadar(entities: EntityRegistrations[]) {
  return entities
    .map((e) => {
      const active = e.gstins.filter((g) => g.active && g.type !== 'ISD');
      const states = new Set(active.map((g) => g.stateCode));
      const hasIsd = e.gstins.some((g) => g.active && g.type === 'ISD');
      return { ...e, activeGstins: active.length, states: states.size, hasIsd };
    })
    .filter((e) => e.activeGstins >= 2 && e.states >= 2 && !e.hasIsd);
}

/* ------------------------------------------- RCMDOM & RCMIMP e-Invoice */

export interface RcmExposureRecord {
  entityId: string;
  entityName: string;
  gstin: string;
  aatoAbove5Cr: boolean;
  rcmDomCount: number;
  rcmImpCount: number;
  totalRcmTaxable: number;
  recurringCategories: string[]; // e.g. ['GTA freight', 'Rent', 'Scrap', 'Foreign SaaS']
}

export interface RcmEinvoiceRadarItem extends RcmExposureRecord {
  voluntaryStartDate: '2026-12-15';
  mandatoryDate: '2027-01-01';
  daysToVoluntary: number;
  daysToMandatory: number;
  readinessStatus: 'MANDATORY_ACTIVE' | 'VOLUNTARY_OPEN' | 'PREP_REQUIRED';
}

/**
 * Notifications 04/2026-CT & 05/2026-CT + GSTN Nov 17, 2026 advisory:
 * Scans > Rs 5 Cr entities with recurring Table 3.1(d) unregistered domestic RCM (RCMDOM)
 * or import of services (RCMIMP) self-invoice exposure ahead of Dec 15 voluntary / Jan 1, 2027 mandatory cutover.
 */
export function rcmEinvoiceRadar(records: RcmExposureRecord[], today: IsoDate): RcmEinvoiceRadarItem[] {
  const voluntaryDate = '2026-12-15' as const;
  const mandatoryDate = '2027-01-01' as const;
  return records
    .filter((r) => r.aatoAbove5Cr && (r.rcmDomCount > 0 || r.rcmImpCount > 0 || r.totalRcmTaxable > 0))
    .map((r) => {
      const daysToVoluntary = daysBetween(today, voluntaryDate);
      const daysToMandatory = daysBetween(today, mandatoryDate);
      const readinessStatus: RcmEinvoiceRadarItem['readinessStatus'] =
        today >= mandatoryDate ? 'MANDATORY_ACTIVE' : today >= voluntaryDate ? 'VOLUNTARY_OPEN' : 'PREP_REQUIRED';
      return {
        ...r,
        voluntaryStartDate: voluntaryDate,
        mandatoryDate,
        daysToVoluntary,
        daysToMandatory,
        readinessStatus,
      };
    })
    .sort((a, b) => b.totalRcmTaxable - a.totalRcmTaxable);
}
