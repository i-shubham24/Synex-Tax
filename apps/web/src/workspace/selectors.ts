/**
 * Derives Control Tower state from a workspace snapshot using the tested rules in
 * @synextax/tax-engine. Pure functions: same snapshot + same date = same output.
 */
import {
  daysBetween,
  dscExpiryRadar,
  gstDueDate,
  gstReturnExpiry,
  isdRadar,
  pre14ImsGuard,
  tdsCorrectionDeadline,
  tdsStatementDueDate,
  tokenWatch,
  type IsoDate,
} from '@synextax/tax-engine';
import type { Entity, FilingCell, FilingState, Obligation, WorkspaceSnapshot } from './types';

export const OBLIGATIONS: Array<{ id: Obligation; label: string }> = [
  { id: 'GSTR1', label: 'GSTR-1' },
  { id: 'IMS_2B', label: 'IMS / 2B' },
  { id: 'GSTR3B', label: 'GSTR-3B' },
  { id: 'TDS_CHALLAN', label: 'TDS challan' },
  { id: 'TDS_RETURN', label: 'Qtr TDS' },
];

export const STATE_LABEL: Record<FilingState, string> = {
  NA: 'Not due',
  DRAFT: 'Draft',
  VALIDATED: 'Validated',
  RECONCILED: 'Reconciled',
  CLIENT_APPROVED: 'Client approved',
  PORTAL_SAVED: 'Portal saved',
  FILED: 'Filed',
};

export interface Filters {
  staffId: string | null;
  groupId: string | null;
  category: 'ALL' | 'REGULAR_MONTHLY' | 'QRMP' | 'COMPOSITION' | 'TDS';
}

export const NO_FILTERS: Filters = { staffId: null, groupId: null, category: 'ALL' };

export function filterEntities(s: WorkspaceSnapshot, f: Filters): Entity[] {
  return s.entities.filter((e) => {
    if (f.staffId && e.assignedTo !== f.staffId) return false;
    if (f.groupId && e.groupId !== f.groupId) return false;
    if (f.category === 'TDS') return e.tans.length > 0;
    if (f.category !== 'ALL') return e.gstins.some((g) => g.filingCategory === f.category);
    return true;
  });
}

export function cellsFor(s: WorkspaceSnapshot, entities: Entity[]): FilingCell[] {
  const ids = new Set(entities.map((e) => e.id));
  return s.filings.filter((c) => ids.has(c.entityId));
}

/* ------------------------------------------------------------- KPIs */

export function kpis(s: WorkspaceSnapshot, entities: Entity[]) {
  const cells = cellsFor(s, entities).filter((c) => c.state !== 'NA');
  const ids = new Set(entities.map((e) => e.id));
  return {
    due: cells.filter((c) => c.state !== 'FILED').length,
    filed: cells.filter((c) => c.state === 'FILED').length,
    itcReconciled: entities.reduce((a, e) => a + e.itcReconciled, 0),
    pendingMismatch:
      entities.reduce((a, e) => a + e.pendingMismatch, 0) +
      s.filedStatements.filter((f) => ids.has(f.entityId)).reduce((a, f) => a + f.openDefaults, 0),
  };
}

/* ------------------------------------------------------------ Radar */

export type Severity = 'critical' | 'warning' | 'clear';

export interface RadarItem {
  key: string;
  title: string;
  detail: string;
  entityId?: string;
  href: string;
  severity: Severity;
}

export interface RadarTile {
  id: 'cliff' | 'ims' | 'token' | 'dsc' | 'tds';
  title: string;
  summary: string;
  severity: Severity;
  items: RadarItem[];
}

const entityName = (s: WorkspaceSnapshot, id: string) => s.entities.find((e) => e.id === id)?.legalName ?? id;

/** IMS period whose GSTR-2B cut-off (14th of the next month) is the next one ahead. */
export function nextImsPeriod(today: IsoDate): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));
  const pm = d < 14 ? m - 1 : m; // before the 14th: last month's 2B is still open
  const date = new Date(Date.UTC(y, pm - 1, 1));
  return date.toISOString().slice(0, 7);
}

export function radar(s: WorkspaceSnapshot, entities: Entity[], today: IsoDate, nowMs: number): RadarTile[] {
  const ids = new Set(entities.map((e) => e.id));

  // 1. 3-year GST return cliff
  const cliff = s.openReturns
    .filter((r) => ids.has(r.entityId))
    .map((r) => ({ r, e: gstReturnExpiry(r.dueDate, today) }))
    .filter(({ e }) => e.level !== 'OK')
    .sort((a, b) => a.e.daysLeft - b.e.daysLeft)
    .map<RadarItem>(({ r, e }) => ({
      key: `${r.gstin}-${r.returnType}-${r.periodLabel}`,
      title: `${r.returnType} ${r.periodLabel}`,
      detail:
        e.level === 'BARRED'
          ? `${entityName(s, r.entityId)}. Barred since ${e.barDate}; needs the portal unbarring route.`
          : `${entityName(s, r.entityId)}. Locks on ${e.barDate}, ${e.daysLeft} days left.`,
      entityId: r.entityId,
      href: '/gst',
      severity: e.level === 'WATCH' ? 'warning' : 'critical',
    }));

  // 2. Pre-14th IMS guard
  const period = nextImsPeriod(today);
  const guard = pre14ImsGuard(
    s.ims.filter((i) => ids.has(i.entityId)).map((i) => ({ ...i, entityName: entityName(s, i.entityId) })),
    period,
    nowMs,
  );
  const imsItems = guard.flagged.map<RadarItem>((r) => ({
    key: r.id,
    title: r.supplierName,
    detail: `${r.entityName}. Rs ${r.taxableValue.toLocaleString('en-IN')}${r.section17_5 ? ', Sec 17(5) blocked credit' : ''}. No action yet.`,
    entityId: r.entityId,
    href: '/gst/recon-2b',
    severity: guard.inWindow ? 'critical' : 'warning',
  }));

  // 3. GSTN API token watch
  const sessions = entities.flatMap((e) =>
    e.gstins.map((g) => ({ gstin: g.gstin, entityName: e.legalName, state: g.token.state, expiresAt: g.token.expiresAt, entityId: e.id })),
  );
  const tokenItems = tokenWatch(sessions, nowMs).map<RadarItem>((t) => {
    const owner = sessions.find((x) => x.gstin === t.gstin);
    const reason =
      t.reason === 'REVOKED'
        ? 'Access revoked by the taxpayer. Needs a fresh OTP consent.'
        : t.reason === 'EXPIRED'
          ? 'Session expired. Request a new OTP to resume syncs.'
          : t.reason === 'NOT_ENABLED'
            ? 'API access not enabled on the GST portal yet.'
            : `Session ends in ${Math.max(1, Math.round(t.hoursLeft ?? 0))} h.`;
    return {
      key: t.gstin,
      title: t.gstin,
      detail: `${t.entityName}. ${reason}`,
      entityId: owner?.entityId,
      href: '/clients',
      severity: t.reason === 'EXPIRING' ? 'warning' : 'critical',
    };
  });

  // 4. DSC expiry + FIPS 140-3
  const dscs = entities.flatMap((e) => e.dscs.map((d) => ({ ...d, entityName: e.legalName, entityId: e.id })));
  const dscItems = dscExpiryRadar(dscs, today).map<RadarItem>((d) => {
    const owner = dscs.find((x) => x.id === d.id);
    return {
      key: d.id,
      title: d.holder,
      detail: `${d.entityName}. ${d.bucket === 'EXPIRED' ? 'Expired' : `Expires in ${d.daysLeft} days`}${
        d.needsNewToken ? '; renewal needs a FIPS 140-3 token' : ''
      }.`,
      entityId: owner?.entityId,
      href: '/settings',
      severity: d.bucket === 7 || d.bucket === 'EXPIRED' ? 'critical' : 'warning',
    };
  });

  // 5. TDS 2-year correction wall + ISD
  const tdsItems = s.filedStatements
    .filter((f) => ids.has(f.entityId))
    .map((f) => ({ f, deadline: tdsCorrectionDeadline(f.dueDate) }))
    .map(({ f, deadline }) => ({ f, deadline, daysLeft: daysBetween(today, deadline) }))
    .filter(({ f, daysLeft }) => daysLeft >= 0 && daysLeft <= 180 && f.openDefaults > 0)
    .map<RadarItem>(({ f, deadline, daysLeft }) => ({
      key: `${f.tan}-${f.form}-${f.periodLabel}`,
      title: `${f.form} ${f.periodLabel}`,
      detail: `${entityName(s, f.entityId)}. Rs ${f.openDefaults.toLocaleString('en-IN')} open default; corrections close ${deadline} (${daysLeft} days).`,
      entityId: f.entityId,
      href: '/tds',
      severity: daysLeft <= 60 ? 'critical' : 'warning',
    }));
  const isdItems = isdRadar(
    entities.map((e) => ({ entityId: e.id, entityName: e.legalName, pan: e.pan, gstins: e.gstins.map((g) => ({ gstin: g.gstin, stateCode: g.stateCode, type: g.type, active: g.portalStatus === 'ACTIVE' })) })),
  ).map<RadarItem>((e) => ({
    key: `isd-${e.entityId}`,
    title: `ISD missing: ${e.pan}`,
    detail: `${e.entityName}. ${e.activeGstins} GSTINs across ${e.states} states and no ISD registration.`,
    entityId: e.entityId,
    href: '/clients',
    severity: 'warning',
  }));

  const sev = (items: RadarItem[]): Severity =>
    items.some((i) => i.severity === 'critical') ? 'critical' : items.length ? 'warning' : 'clear';

  const cutoffLabel = new Date(`${guard.cutoff}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return [
    { id: 'cliff', title: '3-year GST return cliff', summary: cliff.length ? `${cliff.length} unfiled near the portal lock` : 'No returns near the lock', severity: sev(cliff), items: cliff },
    { id: 'ims', title: 'Pre-14th IMS guard', summary: `${imsItems.length} risky records before ${cutoffLabel}`, severity: sev(imsItems), items: imsItems },
    { id: 'token', title: 'API token watch', summary: tokenItems.length ? `${tokenItems.length} GSTINs need attention` : 'All sessions healthy', severity: sev(tokenItems), items: tokenItems },
    { id: 'dsc', title: 'DSC expiry and FIPS 140-3', summary: dscItems.length ? `${dscItems.length} expiring within 45 days` : 'No DSC expiring soon', severity: sev(dscItems), items: dscItems },
    { id: 'tds', title: 'TDS correction and ISD', summary: `${tdsItems.length} near the 2-year wall, ${isdItems.length} ISD gap`, severity: sev([...tdsItems, ...isdItems]), items: [...tdsItems, ...isdItems] },
  ];
}

/* ------------------------------------------- Approvals and workload */

export function approvalQueue(s: WorkspaceSnapshot, entities: Entity[]) {
  return cellsFor(s, entities)
    .filter((c) => c.state === 'CLIENT_APPROVED' || c.state === 'RECONCILED')
    .filter((c) => c.obligation === 'GSTR3B' || c.obligation === 'TDS_RETURN')
    .sort((a, b) => (a.state === b.state ? b.updatedAt.localeCompare(a.updatedAt) : a.state === 'CLIENT_APPROVED' ? -1 : 1));
}

export function workload(s: WorkspaceSnapshot, entities: Entity[]) {
  const cells = cellsFor(s, entities).filter((c) => c.state !== 'NA');
  return s.staff
    .filter((m) => m.role !== 'PARTNER')
    .map((m) => {
      const mine = cells.filter((c) => c.assignee === m.id);
      const threeB = mine.filter((c) => c.obligation === 'GSTR3B');
      return {
        staff: m,
        total: mine.length,
        filed: mine.filter((c) => c.state === 'FILED').length,
        threeBFiled: threeB.filter((c) => c.state === 'FILED').length,
        threeBTotal: threeB.length,
        pendingClientData: mine.filter((c) => c.state === 'DRAFT').length,
        // Same rule as approvalQueue: only GSTR-3B and TDS returns need partner sign-off.
        awaitingPartner: mine.filter(
          (c) => (c.obligation === 'GSTR3B' || c.obligation === 'TDS_RETURN') && (c.state === 'CLIENT_APPROVED' || c.state === 'RECONCILED'),
        ).length,
      };
    })
    .filter((w) => w.total > 0);
}

/* ------------------------------------------------- Urgent deadlines */

export function urgentDeadlines(s: WorkspaceSnapshot, entities: Entity[], today: IsoDate) {
  const out: Array<{ entity: Entity; label: string; due: IsoDate; daysLeft: number; amount?: number; state: FilingState }> = [];
  for (const e of entities) {
    const g = e.gstins.find((x) => x.type !== 'ISD');
    for (const c of s.filings.filter((x) => x.entityId === e.id && x.state !== 'FILED' && x.state !== 'NA')) {
      let due: IsoDate | null = null;
      let label = '';
      if ((c.obligation === 'GSTR3B' || c.obligation === 'GSTR1') && g) {
        const cadence = g.filingCategory === 'QRMP' ? 'QRMP' : 'MONTHLY';
        due = gstDueDate(c.obligation, s.activePeriod, cadence, g.stateCode);
        label = `${c.obligation === 'GSTR3B' ? 'GSTR-3B' : 'GSTR-1'} ${c.periodLabel}`;
      } else if (c.obligation === 'TDS_RETURN' && e.tans.length) {
        due = tdsStatementDueDate('140', 2026, 3);
        label = `Form 140 ${c.periodLabel}`;
      } else if (c.obligation === 'TDS_CHALLAN') {
        // Rule 218: deposit by the 7th of the next month; March deductions by 30 April.
        due = tdsDepositDueDate(s.activePeriod);
        label = `TDS deposit ${c.periodLabel}`;
      }
      if (due) out.push({ entity: e, label, due, daysLeft: daysBetween(today, due), amount: c.amount, state: c.state });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || (b.amount ?? 0) - (a.amount ?? 0));
}

function tdsDepositDueDate(period: string): IsoDate {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  if (m === 3) return `${y}-04-30`;
  return new Date(Date.UTC(y, m, 7)).toISOString().slice(0, 10);
}

export function todayIst(): IsoDate {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
