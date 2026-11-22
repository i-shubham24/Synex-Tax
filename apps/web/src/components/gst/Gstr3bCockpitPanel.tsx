'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, FileCheck, Layers, RefreshCw, Send, ShieldAlert, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const inr = (v: string | number) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const th = 'px-3 py-2.5 text-left text-[12px] font-semibold text-pos-ink/60 whitespace-nowrap border-b border-pos-line';
const thNum = `${th} text-right`;
const td = 'px-3 py-2.5 text-[13px] text-pos-ink border-b border-pos-line';
const tdNum = `${td} text-right font-mono tabular-nums`;

interface CockpitSummary {
  totalGstins: number;
  totalTaxableTurnover: string;
  totalGrossLiability: string;
  totalEligibleItc: string;
  totalCashPayable: string;
  totalItcClosing: string;
  statusCounts: {
    NOT_STARTED: number;
    READY_TO_AUTOFILL: number;
    VALIDATED: number;
    FILED: number;
  };
}

interface RegistrationRow {
  registrationId: string;
  entityId: string;
  entityName: string;
  gstin: string;
  stateCode: string;
  status: 'NOT_STARTED' | 'READY_TO_AUTOFILL' | 'VALIDATED' | 'FILED';
  arn: string | null;
  filedAt: string | null;
  outwardTaxable: string;
  grossLiability: string;
  eligibleItc: string;
  cashPayable: string;
  cashBreakdown: { igst: string; cgst: string; sgst: string };
  itcClosing: string;
  rule86bApplied: boolean;
}

interface CockpitResponse {
  period: string;
  summary: CockpitSummary;
  registrations: RegistrationRow[];
}

const defaultPeriod = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

export function Gstr3bCockpitPanel() {
  const { authFetch, user } = useAuth();
  const [period, setPeriod] = useState(defaultPeriod());
  const [loading, setLoading] = useState(false);
  const [cockpit, setCockpit] = useState<CockpitResponse | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [autofilling, setAutofilling] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null);

  const isPartnerOrManager = user?.role === 'PARTNER' || user?.role === 'MANAGER';

  const loadCockpit = useCallback(async (targetPeriod: string) => {
    setLoading(true);
    setBanner(null);
    try {
      const res = await authFetch(`/api/v1/gst/gstr3b/cockpit?period=${targetPeriod}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        setCockpit(body.data);
        const sel: Record<string, boolean> = {};
        for (const r of body.data.registrations || []) {
          sel[r.registrationId] = r.status !== 'FILED';
        }
        setSelected(sel);
      } else {
        setBanner({ tone: 'bad', text: body.message || 'Unable to load practice GSTR-3B position.' });
      }
    } catch {
      setBanner({ tone: 'bad', text: 'Network connection failed while fetching cockpit.' });
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadCockpit(period);
  }, [loadCockpit, period]);

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const allSelected = cockpit?.registrations && cockpit.registrations.length > 0 && selectedCount === cockpit.registrations.length;

  const toggleSelectAll = () => {
    if (!cockpit?.registrations) return;
    const nextVal = !allSelected;
    const next: Record<string, boolean> = {};
    for (const r of cockpit.registrations) {
      next[r.registrationId] = nextVal;
    }
    setSelected(next);
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleBulkAutofill = async () => {
    if (!isPartnerOrManager) {
      setBanner({ tone: 'bad', text: 'Maker-Checker policy: Only Partners and Managers can perform bulk GSTR-3B autofill.' });
      return;
    }
    const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (!ids.length) {
      setBanner({ tone: 'info', text: 'Select at least one client GSTIN to autofill.' });
      return;
    }

    setAutofilling(true);
    setBanner(null);
    try {
      const res = await authFetch('/api/v1/gst/gstr3b/bulk-autofill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ period, registrationIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setBanner({
          tone: 'ok',
          text: `Practice autofill completed for ${data.count} GSTIN(s). Total gross tax: ${inr(data.totalLiabilityAutofilled)}, Net cash payable: ${inr(data.totalCashPayable)}. Filings are now in VALIDATED state ready for partner signoff.`,
        });
        await loadCockpit(period);
      } else {
        setBanner({ tone: 'bad', text: data.message || 'Bulk autofill failed.' });
      }
    } catch {
      setBanner({ tone: 'bad', text: 'Network error during bulk autofill.' });
    } finally {
      setAutofilling(false);
    }
  };

  const dueStatutoryDate = (p: string) => {
    const [yStr, mStr] = p.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    return `20 ${new Date(nextY, nextM - 1, 1).toLocaleDateString('en-IN', { month: 'short' })} ${nextY}`;
  };

  return (
    <section className="space-y-5">
      {/* Top Controls Bar */}
      <div className="pos-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] font-medium text-pos-ink/70">
            Filing Period
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
            />
          </label>
          <span className="text-[12px] text-pos-ink/50">
            Statutory Due Date: <strong className="font-semibold text-pos-ink/80">{dueStatutoryDate(period)}</strong>
          </span>
          <button
            type="button"
            onClick={() => loadCockpit(period)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-pos-line px-3 py-1.5 text-[12px] text-pos-ink/70 hover:bg-pos-tint disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBulkAutofill}
            disabled={autofilling || loading || selectedCount === 0 || !isPartnerOrManager}
            className="inline-flex items-center gap-2 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            title={!isPartnerOrManager ? 'Partner or Manager role required' : ''}
          >
            <Zap className="h-4 w-4" />
            {autofilling ? 'Autofilling...' : `Bulk Autofill Selected (${selectedCount})`}
          </button>
        </div>
      </div>

      {/* Banner */}
      {banner && (
        <div
          role="status"
          className={`flex items-start gap-2.5 rounded-[12px] border p-3.5 text-[13px] ${
            banner.tone === 'ok'
              ? 'border-[#22a356]/20 bg-[#22a356]/10 text-[#15803d]'
              : banner.tone === 'bad'
              ? 'border-[#dc2626]/20 bg-[#dc2626]/5 text-[#dc2626]'
              : 'border-pos-line bg-pos-surface text-pos-ink'
          }`}
        >
          {banner.tone === 'ok' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          {banner.tone === 'bad' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          {banner.tone === 'info' && <Layers className="mt-0.5 h-4 w-4 shrink-0 text-pos-accent" />}
          <div>{banner.text}</div>
        </div>
      )}

      {/* Summary KPI Cards */}
      {cockpit && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="pos-card p-3.5">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Active GSTINs</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-pos-ink">{cockpit.summary.totalGstins}</div>
            <div className="mt-0.5 text-[11px] text-pos-ink/50">{cockpit.summary.statusCounts.VALIDATED} Validated</div>
          </div>
          <div className="pos-card p-3.5">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Table 3.1 Turnover</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-pos-ink">{inr(cockpit.summary.totalTaxableTurnover)}</div>
            <div className="mt-0.5 text-[11px] text-pos-ink/50">From sales registers</div>
          </div>
          <div className="pos-card p-3.5">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Gross Tax Liability</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-pos-ink">{inr(cockpit.summary.totalGrossLiability)}</div>
            <div className="mt-0.5 text-[11px] text-pos-ink/50">IGST + CGST + SGST</div>
          </div>
          <div className="pos-card p-3.5">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Table 4 ITC (2B)</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-[#15803d]">{inr(cockpit.summary.totalEligibleItc)}</div>
            <div className="mt-0.5 text-[11px] text-pos-ink/50">Eligible input credit</div>
          </div>
          <div className="pos-card p-3.5 border-l-4 border-l-[#dc2626]">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Net Cash Shortfall</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-[#dc2626]">{inr(cockpit.summary.totalCashPayable)}</div>
            <div className="mt-0.5 text-[11px] text-[#dc2626]/80 font-medium">PMT-06 challans needed</div>
          </div>
          <div className="pos-card p-3.5">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Closing ITC C/F</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-pos-ink">{inr(cockpit.summary.totalItcClosing)}</div>
            <div className="mt-0.5 text-[11px] text-pos-ink/50">Carried to next month</div>
          </div>
        </div>
      )}

      {/* Cash Warning Card */}
      {cockpit && Number(cockpit.summary.totalCashPayable) > 0 && (
        <div className="rounded-[12px] border border-[#f59e0b]/30 bg-[#fef3c7]/20 p-4 text-[13px] text-pos-ink">
          <div className="flex items-center gap-2 font-semibold text-[#b45309]">
            <ShieldAlert className="h-4 w-4" /> Statutory Cash Deposit Alert (Due by {dueStatutoryDate(period)})
          </div>
          <p className="mt-1 text-pos-ink/75">
            Clients have an aggregate cash shortfall of <strong className="font-mono">{inr(cockpit.summary.totalCashPayable)}</strong> that cannot be settled via ITC under Rule 88A. Ensure clients deposit cash into electronic cash ledgers via PMT-06 challans prior to the 20th to avoid Section 50(1) interest at 18% per annum.
          </p>
        </div>
      )}

      {/* Multi-GSTIN Cockpit Table */}
      <div className="pos-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between border-b border-pos-line px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-pos-ink">Practice Multi-GSTIN Position & Autofill Engine</h2>
            <p className="text-[12px] text-pos-ink/55">Computed deterministically via Rule 88A hierarchy and Rule 86B cash guards.</p>
          </div>
          <span className="text-[12px] font-medium text-pos-ink/60">
            {selectedCount} of {cockpit?.registrations.length || 0} GSTINs selected
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-pos-tint/40">
              <tr>
                <th className={`${th} w-10 text-center`}>
                  <input
                    type="checkbox"
                    checked={Boolean(allSelected)}
                    onChange={toggleSelectAll}
                    aria-label="Select all GSTINs"
                    className="rounded border-pos-line"
                  />
                </th>
                <th className={th}>Client & GSTIN</th>
                <th className={th}>Filing Status</th>
                <th className={thNum}>Taxable Value</th>
                <th className={thNum}>Gross Tax</th>
                <th className={thNum}>Eligible ITC (2B)</th>
                <th className={thNum}>Cash Shortfall</th>
                <th className={th}>Cash Split</th>
                <th className={th}>Rule 86B</th>
              </tr>
            </thead>
            <tbody>
              {loading && !cockpit && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[13px] text-pos-ink/50">
                    Loading practice GST position...
                  </td>
                </tr>
              )}
              {cockpit && cockpit.registrations.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[13px] text-pos-ink/50">
                    No active GST registrations found for this practice.
                  </td>
                </tr>
              )}
              {cockpit?.registrations.map((row) => {
                const isChecked = Boolean(selected[row.registrationId]);
                const hasCash = Number(row.cashPayable) > 0;
                return (
                  <tr
                    key={row.registrationId}
                    className={`transition-colors hover:bg-pos-tint/30 ${isChecked ? 'bg-pos-tint/15' : ''}`}
                  >
                    <td className={`${td} text-center`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRow(row.registrationId)}
                        aria-label={`Select ${row.gstin}`}
                        className="rounded border-pos-line"
                      />
                    </td>
                    <td className={td}>
                      <div className="font-medium text-pos-ink">{row.entityName}</div>
                      <div className="font-mono text-[12px] text-pos-ink/60">{row.gstin}</div>
                    </td>
                    <td className={td}>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                          row.status === 'FILED'
                            ? 'border-[#059669]/30 bg-[#059669]/10 text-[#059669]'
                            : row.status === 'VALIDATED'
                            ? 'border-[#22a356]/30 bg-[#22a356]/10 text-[#15803d]'
                            : row.status === 'READY_TO_AUTOFILL'
                            ? 'border-[#2563eb]/30 bg-[#2563eb]/10 text-[#2563eb]'
                            : 'border-pos-line bg-pos-ink/5 text-pos-ink/60'
                        }`}
                      >
                        {row.status === 'READY_TO_AUTOFILL'
                          ? 'Ready'
                          : row.status === 'VALIDATED'
                          ? 'Validated'
                          : row.status === 'FILED'
                          ? 'Filed'
                          : 'Not Started'}
                      </span>
                    </td>
                    <td className={tdNum}>{inr(row.outwardTaxable)}</td>
                    <td className={tdNum}>{inr(row.grossLiability)}</td>
                    <td className={`${tdNum} text-[#15803d]`}>{inr(row.eligibleItc)}</td>
                    <td className={`${tdNum} ${hasCash ? 'font-semibold text-[#dc2626]' : 'text-pos-ink/40'}`}>
                      {inr(row.cashPayable)}
                    </td>
                    <td className={td}>
                      {hasCash ? (
                        <div className="text-[11px] font-mono text-pos-ink/70">
                          {Number(row.cashBreakdown.igst) > 0 && <span>I: {inr(row.cashBreakdown.igst)} </span>}
                          {Number(row.cashBreakdown.cgst) > 0 && <span>C: {inr(row.cashBreakdown.cgst)} </span>}
                          {Number(row.cashBreakdown.sgst) > 0 && <span>S: {inr(row.cashBreakdown.sgst)}</span>}
                        </div>
                      ) : (
                        <span className="text-[12px] text-pos-ink/40">Settled via ITC</span>
                      )}
                    </td>
                    <td className={td}>
                      {row.rule86bApplied ? (
                        <span className="inline-flex rounded bg-[#b45309]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#b45309]">
                          1% Guard
                        </span>
                      ) : (
                        <span className="text-[11px] text-pos-ink/40">Exempt</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-pos-line bg-pos-surface/60 px-4 py-3 text-[12px] text-pos-ink/60">
          <strong>Rule 88A Compliance Note:</strong> IGST credit is consumed first against IGST liability, then CGST and SGST in optimal sequence to minimize total cash outgo. Rule 86B restricts ITC utilization to 99% of outward liability when monthly taxable supplies exceed ₹50 Lakhs (unless statutory exemptions apply).
        </div>
      </div>
    </section>
  );
}
