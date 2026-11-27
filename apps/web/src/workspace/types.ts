/**
 * Workspace domain types for the web app. Shapes mirror the API's
 * /api/v1/client-master/tree response so the live adapter is a mapping, not a rewrite.
 */
import type { FipsProfile, TokenState, ImsAction } from '@synextax/tax-engine';

export type Role = 'PARTNER' | 'MANAGER' | 'STAFF' | 'CLIENT';
export type FilingCategory = 'REGULAR_MONTHLY' | 'QRMP' | 'COMPOSITION' | 'ISD';
export type Constitution = 'PRIVATE_LIMITED' | 'LLP' | 'PARTNERSHIP' | 'PROPRIETORSHIP' | 'ONE_PERSON_COMPANY' | 'PUBLIC_LIMITED' | 'HUF';

/** Return workflow states (spec: DRAFT -> VALIDATED -> RECONCILED -> CLIENT_APPROVED -> PORTAL_SAVED -> FILED -> CLOSED). */
export type FilingState = 'NA' | 'DRAFT' | 'VALIDATED' | 'RECONCILED' | 'CLIENT_APPROVED' | 'PORTAL_SAVED' | 'FILED';

export type Obligation = 'GSTR1' | 'IMS_2B' | 'GSTR3B' | 'TDS_CHALLAN' | 'TDS_RETURN';

export interface StaffMember {
  id: string;
  name: string;
  initials: string;
  role: Role;
}

export interface GstRegistration {
  gstin: string;
  stateCode: string;
  type: 'REGULAR' | 'COMPOSITION' | 'ISD' | 'SEZ_UNIT' | 'TDS_DEDUCTOR';
  filingCategory: FilingCategory;
  portalStatus: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'CANCELLATION_PENDING';
  token: { state: TokenState; expiresAt: string | null };
  lutArn?: string | null;
  lutValidTo?: string | null;
  cancellationStatus?: 'NONE' | 'APPLIED' | 'QUERY_RAISED' | 'AUTO_APPROVED' | 'APPROVED' | 'REJECTED';
  cancellationArn?: string | null;
}

export interface TanRegistration {
  tan: string;
  branch: string;
  lastFiledQuarter: string; // e.g. "Q2 TY 2026-27"
  lastToken: string; // latest accepted 15-digit token number
}

export interface DscCertificate {
  id: string;
  holder: string;
  validTo: string; // ISO date
  fips: FipsProfile;
  custody: 'OFFICE' | 'CLIENT';
}

export interface Entity {
  id: string;
  groupId: string;
  legalName: string;
  tradeName?: string;
  pan: string;
  constitution: Constitution;
  assignedTo: string; // staff id
  gstins: GstRegistration[];
  tans: TanRegistration[];
  dscs: DscCertificate[];
  itcReconciled: number; // Rs, current period
  pendingMismatch: number; // Rs at risk
  aatoAbove5Cr?: boolean;
  rcmExposure?: {
    rcmDomCount: number;
    rcmImpCount: number;
    totalRcmTaxable: number;
    recurringCategories: string[];
  };
}

export interface ClientGroup {
  id: string;
  name: string;
}

/** One cell of the filing matrix: an entity's obligation for the active period. */
export interface FilingCell {
  entityId: string;
  obligation: Obligation;
  periodLabel: string;
  state: FilingState;
  updatedAt: string; // ISO datetime
  assignee: string; // staff id
  amount?: number; // liability or deposit, Rs
}

/** An unfiled historical return (feeds the 3-year cliff radar). */
export interface OpenReturn {
  entityId: string;
  gstin: string;
  returnType: 'GSTR-1' | 'GSTR-3B' | 'GSTR-9' | 'GSTR-4';
  periodLabel: string;
  dueDate: string;
}

/** A filed TDS statement (feeds the 2-year correction radar). */
export interface FiledStatement {
  entityId: string;
  tan: string;
  form: string;
  periodLabel: string;
  dueDate: string;
  openDefaults: number; // Rs short deduction / payment defaults still open on TRACES
}

export interface ImsInward {
  id: string;
  entityId: string;
  gstin: string;
  supplierName: string;
  taxableValue: number;
  section17_5: boolean;
  action: ImsAction;
}

export type NotificationCategory = 'TOKEN' | 'FVU' | 'APPROVAL' | 'IMS' | 'UPLOAD';

export interface WorkspaceNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  at: string; // ISO datetime
  href: string;
  entityId?: string;
}

export interface FirmProfile {
  id: string;
  name: string;
  frn: string;
  enabledSuites?: string[];
}

export interface WorkspaceSnapshot {
  firm: FirmProfile;
  staff: StaffMember[];
  groups: ClientGroup[];
  entities: Entity[];
  filings: FilingCell[];
  openReturns: OpenReturn[];
  filedStatements: FiledStatement[];
  ims: ImsInward[];
  notifications: WorkspaceNotification[];
  /** Current GST period shown by default (YYYY-MM). */
  activePeriod: string;
  /** Monthly ITC utilised vs cash paid, Apr..Mar of the current FY (Rs lakh). */
  outflow: Array<{ month: string; itc: number; cash: number }>;
  /** Filings completed per day of the active month. */
  velocity: number[];
  /** Firm-wide tax composition for the active period (Rs). */
  composition: Array<{ key: string; value: number }>;
}

export type DataSource = 'sample' | 'api';
