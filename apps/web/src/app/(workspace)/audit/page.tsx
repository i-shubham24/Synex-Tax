'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Lock,
  Eye,
  FileCheck2,
  Calendar,
  AlertOctagon,
  Clock,
  AlertTriangle,
  Usb,
  Activity,
  Server,
  FileText,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Download,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { CustomDropdown, CustomSelect } from '../../../components/ui/CustomSelect';
import { DscSigningPanel } from '../../../components/audit/DscSigningPanel';

interface AuditLogEntry {
  id: string;
  eventType: string;
  performedBy: string;
  userRole: string;
  ipAddress: string;
  timestamp: string;
  hmacSignature: string;
  details: string;
  tableName?: string;
}

interface ExpiryItem {
  id: string;
  taxpayerName: string;
  gstin: string;
  returnPeriod: string;
  formType: string;
  correctionWindowCutoff: string;
  threeYearStatutoryBar: string;
  daysRemainingCorrection: number;
  status: 'SAFE' | 'WARNING_CORRECTION_NEAR' | 'EXPIRED';
  workflowStatus?: string;
}

interface PortalStatus {
  portal: string;
  name: string;
  status: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'UNKNOWN';
  latencyMs: number;
  message: string;
}

export default function AuditRadarPage() {
  const { authFetch } = useAuth();
  const [chain, setChain] = useState<{ checked: number; firstBroken: number | null; headOk: boolean; intact: boolean } | 'checking' | 'error'>('checking');
  const [activeTab, setActiveTab] = useState<'RADAR' | 'DSC' | 'DPDP' | 'LEDGER'>('RADAR');

  // Logs state
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filterTable, setFilterTable] = useState<string>('ALL');
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);

  // Expiry items
  const [expiryItems, setExpiryItems] = useState<ExpiryItem[]>([]);

  // Portal Health state
  const [portals, setPortals] = useState<PortalStatus[]>([]);

  // PII Reveal State
  const [piiTarget, setPiiTarget] = useState<string | null>(null);
  const [justification, setJustification] = useState<string>('');
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [piiError, setPiiError] = useState<string | null>(null);
  const [isRevealingPii, setIsRevealingPii] = useState<boolean>(false);

  // Recomputes the change-log hash chain on the server.
  const checkChain = useCallback(async () => {
    setChain('checking');
    try {
      const r = await authFetch('/api/v1/audit/chain');
      setChain(r.ok ? await r.json() : 'error');
    } catch {
      setChain('error');
    }
  }, [authFetch]);

  // Load live data on mount. The session's own token is used; nothing is kept in web storage.
  useEffect(() => {
    let cancelled = false;
    const load = async (url: string, apply: (b: any) => void) => {
      try {
        const r = await authFetch(url);
        if (r.ok && !cancelled) apply(await r.json());
      } catch {
        /* each panel shows its own empty state */
      }
    };
    load('/api/v1/audit/expiry-radar', (b) => setExpiryItems(b.expiryItems ?? []));
    load('/api/v1/audit/logs', (b) => setLogs(b.logs ?? []));
    load('/api/v1/compliance/portal-health', (b) => setPortals(b.portals ?? []));
    checkChain();
    return () => {
      cancelled = true;
    };
  }, [authFetch, checkChain]);

  // Refresh logs on filter change
  const refreshLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const queryParam = filterTable !== 'ALL' ? `?tableName=${encodeURIComponent(filterTable)}` : '';
      const logsRes = await authFetch(`/api/v1/audit/logs${queryParam}`);
      if (logsRes.ok) {
        const lData = await logsRes.json();
        setLogs(lData.logs ?? []);
      }
    } finally {
      setIsLoadingLogs(false);
    }
    checkChain();
  };

  // PII Reveal Handler
  const handleRevealPii = async () => {
    if (justification.trim().length < 10) {
      setPiiError('Say why you need the full PAN (at least 10 characters). It is recorded with your name.');
      return;
    }

    setIsRevealingPii(true);
    setPiiError(null);
    try {
      // Reveal the PAN of the first client this user can see; the server logs it before returning it.
      const entRes = await authFetch('/api/v1/client-master/entities');
      const entities = entRes.ok ? ((await entRes.json()) as Array<{ id: string }>) : [];
      if (!entities[0]) {
        setPiiError('There is no client to reveal a PAN for yet.');
        return;
      }
      const res = await authFetch('/api/v1/audit/reveal-pii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetTable: 'entities',
          targetColumn: 'pan',
          recordId: entities[0].id,
          accessReason: justification.trim(),
        }),
      });

      const json = await res.json();
      if (json.success && json.unmaskedValue) {
        setRevealedValue(json.unmaskedValue);
        // Refresh logs to show new PII reveal entry
        refreshLogs();
      } else {
        setPiiError(json.message || 'The value was not revealed.');
      }
    } catch (err: any) {
      setPiiError('The PAN could not be shown. Try again.');
    } finally {
      setIsRevealingPii(false);
    }
  };

  const filteredLogs = filterTable === 'ALL'
    ? logs
    : logs.filter((l) => (l.tableName || l.eventType.toLowerCase()).toLowerCase().includes(filterTable.toLowerCase()));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-pos-line pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-pos-ink tracking-tight">
            Audit trail, deadlines and DSC sign-off
          </h1>
          <p className="text-xs text-pos-ink/70 mt-0.5">
            Every change is recorded, chained to the one before and cannot be edited. Returns are signed off with the partner&apos;s DSC.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={checkChain}
            title="Recompute the SHA-256 chain linking every change-log entry"
            className="bg-pos-muted border border-pos-line px-3 py-1.5 rounded-md flex items-center gap-2 hover:bg-pos-line"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                chain === 'checking' ? 'bg-pos-ink/30' : chain === 'error' ? 'bg-amber-500' : chain.intact ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            ></span>
            <span className="text-pos-ink/80">Change log chain:</span>
            <span
              className={`font-semibold ${
                chain === 'checking' || chain === 'error' ? 'text-pos-ink/60' : chain.intact ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {chain === 'checking'
                ? 'Checking…'
                : chain === 'error'
                  ? 'Could not check'
                  : chain.intact
                    ? `Intact, ${chain.checked.toLocaleString('en-IN')} entries`
                    : chain.firstBroken !== null
                      ? `Broken at entry ${chain.firstBroken}`
                      : 'Entries missing at the end'}
            </span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Audit sections" className="flex flex-wrap items-center gap-2 border-b border-pos-line pb-2">
        {(
          [
            { id: 'RADAR', label: 'Deadlines', icon: Calendar },
            { id: 'DSC', label: 'DSC signing', icon: Usb },
            { id: 'DPDP', label: 'Reveal PAN', icon: Lock },
            { id: 'LEDGER', label: `Audit trail (${logs.length})`, icon: FileText },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`audit-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls="audit-panel"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pos-accent ${
              activeTab === tab.id ? 'bg-pos-accent text-white' : 'bg-pos-muted text-pos-ink/70 hover:bg-pos-line hover:text-pos-ink'
            }`}
          >
            <tab.icon className="h-4 w-4" aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div id="audit-panel" role="tabpanel" aria-labelledby={`audit-tab-${activeTab}`} className="space-y-6">
      {/* Tab 1: Section 39 Statutory Expiry Radar */}
      {activeTab === 'RADAR' && (
        <div className="space-y-4">
          <div className="bg-pos-muted border border-pos-line rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#3A6FE8]" />
                <h2 className="font-semibold text-sm text-pos-ink">Correction windows and time bars</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pos-surface text-pos-accent font-semibold border border-pos-line">
                Section 39(9) and 39(11)
              </span>
            </div>

            <p className="text-xs text-pos-ink/60 leading-relaxed">
              Monitors the 30th November amendment cutoff under Section 39(9) and the strict 3-year statutory bar under
              Section 39(11) (introduced by Finance Act 2023) after which the GSTN portal permanently rejects return filings.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              {expiryItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-colors ${
                    item.status === 'WARNING_CORRECTION_NEAR'
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                      : 'bg-pos-surface border-pos-line shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-pos-ink">
                    <span className="truncate max-w-[200px]" title={item.taxpayerName}>{item.taxpayerName}</span>
                    <span className="text-pos-accent font-semibold px-2 py-0.5 rounded bg-pos-muted text-[11px]">
                      {item.formType}
                    </span>
                  </div>

                  <div className="text-[11px] text-pos-ink/60 mt-1">
                    GSTIN / TAN: <span className="font-semibold text-pos-ink">{item.gstin}</span>
                  </div>
                  <div className="text-[11px] text-pos-ink/60">
                    Period: <span className="font-semibold">{item.returnPeriod}</span> | Status: <span className="text-emerald-600 font-semibold">{item.workflowStatus || 'DRAFT'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-pos-line text-[11px]">
                    <div>
                      <span className="text-pos-ink/50 text-[10px] block">Amendment Cutoff:</span>
                      <span className="text-[#C2410C] font-semibold">{item.correctionWindowCutoff}</span>
                      <div className="text-pos-ink/70 font-sans text-[10px]">({item.daysRemainingCorrection} days left)</div>
                    </div>
                    <div>
                      <span className="text-pos-ink/50 text-[10px] block">3-Year Statutory Bar:</span>
                      <span className="text-pos-red font-semibold">{item.threeYearStatutoryBar}</span>
                      <div className="text-pos-ink/70 font-sans text-[10px]">(Portal Hard Block)</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Hardware DSC Token Signing Console */}
      {activeTab === 'DSC' && (
        <div className="space-y-6">
          {/* Government Portal Health Ribbon */}
          <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-pos-line pb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-pos-ink">
                <Activity className="w-4 h-4 text-pos-accent" />
                <span>Government portals</span>
              </div>
              <span className="text-[10px] font-mono text-pos-ink/70 font-semibold px-2 py-0.5 rounded bg-pos-muted border border-pos-line">
                {portals.length === 0
                  ? 'Not checked yet'
                  : portals.every((p) => p.status === 'OPERATIONAL')
                    ? `All ${portals.length} answering`
                    : `${portals.filter((p) => p.status === 'OPERATIONAL').length} of ${portals.length} answering normally`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {portals.map((p) => (
                <div key={p.portal} className="p-3 rounded-lg bg-pos-muted border border-pos-line space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-pos-ink">{p.portal}</span>
                    <span className={`font-semibold text-[10px] flex items-center gap-1 ${p.status === 'OPERATIONAL' ? 'text-emerald-600' : p.status === 'UNKNOWN' ? 'text-pos-ink/50' : 'text-amber-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'OPERATIONAL' ? 'bg-emerald-500' : p.status === 'UNKNOWN' ? 'bg-pos-ink/30' : 'bg-amber-500'}`}></span>
                      {p.status === 'UNKNOWN' ? 'Unknown' : `${p.latencyMs} ms`}
                    </span>
                  </div>
                  <div className="text-[11px] text-pos-ink/70 truncate">{p.name}</div>
                  <div className="text-[10px] text-pos-ink/50 leading-tight">{p.message}</div>
                </div>
              ))}
            </div>
          </div>

          <DscSigningPanel onSigned={refreshLogs} />
        </div>
      )}

      {/* Tab 3: DPDP Act 2023 PII Access Gate */}
      {activeTab === 'DPDP' && (
        <div className="space-y-4">
          <div className="bg-pos-muted border border-pos-line rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-pos-accent" />
                <h2 className="font-semibold text-sm text-pos-ink">Reveal a client's full PAN</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pos-surface text-pos-accent font-semibold border border-pos-line">
                Every reveal logged
              </span>
            </div>

            <p className="text-xs text-pos-ink/60 leading-relaxed">
              PANs, bank accounts and mobile numbers are masked everywhere (Digital Personal Data Protection Act 2023).
              Showing one in full records who asked, when and why in the audit trail before the value is shown.
            </p>

            <div className="bg-pos-surface border border-pos-line rounded-lg p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-pos-ink/60 block text-[11px]">Client PAN:</span>
                  <span className="text-pos-ink font-semibold text-sm">
                    {revealedValue || 'XXXXX####X'}
                  </span>
                </div>
                {!revealedValue && (
                  <button
                    onClick={() => setPiiTarget('AADHAAR')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pos-muted hover:bg-pos-line text-pos-ink text-xs font-semibold transition-colors border border-pos-line"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#3A6FE8]" />
                    <span>Reveal</span>
                  </button>
                )}
              </div>

              {piiTarget && !revealedValue && (
                <div className="mt-3 p-3.5 bg-pos-muted border border-pos-line rounded-lg space-y-2 font-sans">
                  <label className="text-xs text-pos-ink/80 font-semibold block">
                    Statutory Purpose (Minimum 10 characters required by DPDP Act 2023):
                  </label>
                  <input
                    type="text"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="For example: checking PAN for the GST registration application"
                    className="w-full bg-pos-surface border border-pos-line rounded-md px-3 py-2 text-xs text-pos-ink focus:outline-none focus:border-pos-accent font-mono"
                  />
                  {piiError && <p className="text-[11px] text-pos-red">{piiError}</p>}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPiiTarget(null)}
                      className="px-3 py-1.5 text-xs text-pos-ink/60 hover:text-pos-ink"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRevealPii}
                      disabled={isRevealingPii}
                      className="px-3.5 py-1.5 bg-pos-accent hover:bg-pos-accent-deep text-white font-semibold text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isRevealingPii ? 'Recording' : 'Record and show'}
                    </button>
                  </div>
                </div>
              )}

              {revealedValue && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 font-sans flex items-center justify-between">
                  <span>Recorded in the audit trail under your name.</span>
                  <button
                    onClick={() => {
                      setRevealedValue(null);
                      setPiiTarget(null);
                      setJustification('');
                    }}
                    className="text-pos-ink/60 hover:text-pos-accent text-xs underline font-mono ml-4"
                  >
                    Lock Field
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Immutable Audit Trail Ledger */}
      {activeTab === 'LEDGER' && (
        <div className="bg-pos-muted border border-pos-line rounded-xl overflow-hidden shadow-sm space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-pos-line pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-pos-ink font-mono">Audit trail</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pos-surface text-pos-accent border border-pos-line font-semibold">
                  MCA Rule 3 & CGST Rule 56(15)
                </span>
              </div>
              <p className="text-[11px] text-pos-ink/60 mt-0.5">
                Every change, DSC signing and PII reveal, newest first. Entries cannot be edited or deleted.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <CustomDropdown
                variant="table"
                value={filterTable}
                onChange={(val) => setFilterTable(val)}
                className="min-w-[170px]"
                options={[
                  { value: 'ALL', label: 'All events', badge: 'ALL' },
                  { value: 'entities', label: 'Legal Entities', badge: 'Entities' },
                  { value: 'gst_registrations', label: 'GST Registrations', badge: 'GSTIN' },
                  { value: 'gst_invoices_purchase', label: 'Purchase Invoices', badge: 'Invoices' },
                  { value: 'signing_audit_logs', label: 'DSC signing', badge: 'DSC' },
                ]}
              />
              <button
                type="button"
                onClick={refreshLogs}
                disabled={isLoadingLogs}
                className="p-1.5 rounded bg-pos-surface border border-pos-line text-pos-ink/70 hover:text-pos-ink disabled:opacity-50"
                title="Refresh Logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-pos-surface border border-pos-line text-xs text-pos-ink/70 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-pos-accent font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Entries cannot be changed</span>
            </span>
            <span className="text-[11px]">
              The database refuses any edit or deletion of an entry, even by its owner, and each entry carries the hash of the one before it.
            </span>
          </div>

          <div className="overflow-x-auto border border-pos-line rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-pos-surface text-pos-ink/60 text-[11px] border-b border-pos-line">
                  <th className="py-2.5 px-3">Event</th>
                  <th className="py-2.5 px-3">Performed By</th>
                  <th className="py-2.5 px-3">IP Address</th>
                  <th className="py-2.5 px-3">Timestamp (IST)</th>
                  <th className="py-2.5 px-3">Chain hash</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pos-line font-mono">
                {filteredLogs.map((entry) => (
                  <tr key={entry.id} className="hover:bg-pos-tint transition-colors">
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-pos-surface text-pos-accent border border-pos-line">
                        {entry.eventType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-pos-ink font-semibold">{entry.performedBy}</div>
                      <div className="text-[10px] text-pos-ink/60">{entry.userRole}</div>
                    </td>
                    <td className="py-2.5 px-3 text-pos-ink/60">{entry.ipAddress}</td>
                    <td className="py-2.5 px-3 text-pos-ink/80">{new Date(entry.timestamp).toLocaleString('en-IN')}</td>
                    <td className="py-2.5 px-3 text-[#3A6FE8] text-[10px]">{entry.hmacSignature}</td>
                    <td className="py-2.5 px-3 font-sans text-pos-ink/80 text-xs">{entry.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-pos-ink/50 text-right pt-1">
            {filteredLogs.length} entries
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
