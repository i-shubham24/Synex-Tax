'use client';

import { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Eye,
  KeyRound,
  FileCheck2,
  Calendar,
  AlertOctagon,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface AuditLogEntry {
  id: string;
  eventType: string;
  performedBy: string;
  userRole: string;
  ipAddress: string;
  timestamp: string;
  hmacSignature: string;
  details: string;
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
}

const SAMPLE_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log-901',
    eventType: 'DSC_SIGNING_COMPLETED',
    performedBy: 'ca.verma@synextax.com',
    userRole: 'PARTNER',
    ipAddress: '182.72.104.18',
    timestamp: '2025-11-12T11:45:00Z',
    hmacSignature: 'a89c42...99f012e4b892a01',
    details: 'GSTR-3B return for period 102025 digitally signed using Class 3 USB token ePass2003.',
  },
  {
    id: 'log-902',
    eventType: 'PII_ACCESS_REVEAL',
    performedBy: 'ca.verma@synextax.com',
    userRole: 'PARTNER',
    ipAddress: '182.72.104.18',
    timestamp: '2025-11-12T10:15:22Z',
    hmacSignature: 'f41098...77ba8311cb44901',
    details: 'Decrypted signatory Aadhaar ciphertext. Statutory reason: GST REG-01 verification.',
  },
  {
    id: 'log-903',
    eventType: 'IMS_ACTION_ACCEPTED',
    performedBy: 'staff.rajat@synextax.com',
    userRole: 'STAFF',
    ipAddress: '182.72.104.19',
    timestamp: '2025-11-12T09:30:10Z',
    hmacSignature: 'bb1290...44ff0910ee22199',
    details: 'Accepted invoice INV/2025-26/089 in IMS. Net ITC claimed: Rs 27,000.00.',
  },
];

const SAMPLE_EXPIRY_ITEMS: ExpiryItem[] = [
  {
    id: 'exp-1',
    taxpayerName: 'Amritsar Precision Steel Ltd',
    gstin: '03AABCP1332L1Z4',
    returnPeriod: '032025',
    formType: 'GSTR-1',
    correctionWindowCutoff: '2025-11-30',
    threeYearStatutoryBar: '2028-03-31',
    daysRemainingCorrection: 18,
    status: 'WARNING_CORRECTION_NEAR',
  },
  {
    id: 'exp-2',
    taxpayerName: 'Apex Cloud Solutions Delhi',
    gstin: '07BBBPG4512D1ZR',
    returnPeriod: '082025',
    formType: 'GSTR-3B',
    correctionWindowCutoff: '2026-11-30',
    threeYearStatutoryBar: '2028-08-31',
    daysRemainingCorrection: 383,
    status: 'SAFE',
  },
];

export default function AuditRadarPage() {
  const [logs] = useState<AuditLogEntry[]>(SAMPLE_AUDIT_LOGS);
  const [expiryItems] = useState<ExpiryItem[]>(SAMPLE_EXPIRY_ITEMS);

  // PII Reveal State
  const [piiTarget, setPiiTarget] = useState<string | null>(null);
  const [justification, setJustification] = useState<string>('');
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [piiError, setPiiError] = useState<string | null>(null);

  const handleRevealPii = () => {
    if (justification.trim().length < 10) {
      setPiiError('DPDP Act 2023 statutory mandate: Minimum 10 characters legal purpose required.');
      return;
    }

    // Simulate statutory decryption
    setRevealedValue('XXXX-XXXX-4912 (Verified Authorized Signatory)');
    setPiiError(null);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-pos-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-pos-accent">
            <ShieldCheck className="w-4 h-4" />
            <span>Audit & Statutory Radar (DPDP Act 2023 & MCA Rule 3)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-pos-ink tracking-tight mt-1">
            Tamper-Evident Audit Ledger & Filing Expiry Radar
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="bg-pos-muted border border-pos-line px-3 py-1.5 rounded-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-pos-accent"></span>
            <span className="text-pos-ink/80">HMAC-SHA256 Hash Chain: </span>
            <span className="text-pos-accent font-bold">VERIFIED</span>
          </div>
        </div>
      </div>

      {/* Grid: Expiry Radar & DPDP PII Workflow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Section 39 Expiry Radar (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-pos-muted border border-pos-line rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#3A6FE8]" />
                <h2 className="font-bold text-sm text-pos-ink">Section 39 Statutory Expiry Radar</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pos-surface text-pos-ink/60">
                Sec 39(9) & 39(10)
              </span>
            </div>

            <p className="text-xs text-pos-ink/60 leading-relaxed">
              Monitors the 30th November amendment cutoff under Section 39(9) and the strict 3-year statutory bar under
              Section 39(10) after which the GSTN portal permanently rejects return filings.
            </p>

            <div className="space-y-3 font-mono text-xs">
              {expiryItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-lg border ${
                    item.status === 'WARNING_CORRECTION_NEAR'
                      ? 'bg-[#FFF6E0] border-[#F59E0B]/40'
                      : 'bg-pos-surface border-pos-line'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-pos-ink">
                    <span>{item.taxpayerName}</span>
                    <span className="text-pos-accent">{item.formType} ({item.returnPeriod})</span>
                  </div>

                  <div className="text-[11px] text-pos-ink/60 mt-1">
                    GSTIN: {item.gstin}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-pos-line text-[10px]">
                    <div>
                      <span className="text-pos-ink/50">Amendment Cutoff: </span>
                      <span className="text-[#C2410C] font-bold">{item.correctionWindowCutoff}</span>
                      <div className="text-pos-ink/60 font-sans">({item.daysRemainingCorrection} days left)</div>
                    </div>
                    <div>
                      <span className="text-pos-ink/50">3-Year Bar: </span>
                      <span className="text-pos-red font-bold">{item.threeYearStatutoryBar}</span>
                      <div className="text-pos-ink/60 font-sans">(Portal Hard Block)</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DPDP Act 2023 PII Access Gate (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-pos-muted border border-pos-line rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-pos-accent" />
                <h2 className="font-bold text-sm text-pos-ink">DPDP Act 2023 PII Access Gate</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pos-surface text-pos-accent font-bold">
                Section 6 Compliant
              </span>
            </div>

            <p className="text-xs text-pos-ink/60 leading-relaxed">
              Under the Digital Personal Data Protection Act 2023 and CERT-In VAPT guidelines, direct PII access
              (Aadhaar, Bank Account, Mobile) is masked and encrypted. Decryption requires explicit statutory purpose
              logging and Partner-level authorization.
            </p>

            <div className="bg-pos-surface border border-pos-line rounded-lg p-3.5 space-y-3 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-pos-ink/60">Signatory Aadhaar:</span>
                <span className="text-pos-ink/50">
                  {revealedValue || 'enc:aadhaar_aes256_gcm_ciphertext_9918'}
                </span>
                {!revealedValue && (
                  <button
                    onClick={() => setPiiTarget('AADHAAR')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-pos-muted hover:bg-pos-muted text-pos-ink/80 text-[11px] font-sans font-semibold transition-colors"
                  >
                    <Eye className="w-3 h-3 text-[#3A6FE8]" />
                    <span>Reveal</span>
                  </button>
                )}
              </div>

              {piiTarget && !revealedValue && (
                <div className="mt-3 p-3 bg-pos-muted border border-pos-line rounded-lg space-y-2 font-sans">
                  <label className="text-[11px] text-pos-ink/80 font-semibold block">
                    Statutory Purpose (Min 10 characters required by DPDP Act 2023):
                  </label>
                  <input
                    type="text"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="e.g. GST REG-01 verification for Punjab tax office"
                    className="w-full bg-pos-surface border border-pos-line rounded px-2.5 py-1.5 text-xs text-pos-ink focus:outline-none focus:border-pos-accent font-mono"
                  />
                  {piiError && <p className="text-[10px] text-pos-red">{piiError}</p>}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setPiiTarget(null)}
                      className="px-2.5 py-1 text-xs text-pos-ink/60 hover:text-pos-ink"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRevealPii}
                      className="px-3 py-1 bg-pos-accent hover:bg-pos-accent-deep text-white font-bold text-xs rounded transition-colors"
                    >
                      Confirm & Decrypt
                    </button>
                  </div>
                </div>
              )}

              {revealedValue && (
                <div className="p-2.5 rounded bg-pos-tint border border-pos-accent/30 text-[11px] text-pos-green font-sans flex items-center justify-between">
                  <span>Audit event logged with HMAC signature. Key expires in 5 minutes.</span>
                  <button
                    onClick={() => {
                      setRevealedValue(null);
                      setPiiTarget(null);
                      setJustification('');
                    }}
                    className="text-pos-ink/60 hover:text-pos-accent text-[10px] underline"
                  >
                    Lock
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Immutable Audit Log Ledger */}
      <div className="bg-pos-muted border border-pos-line rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-pos-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-pos-ink uppercase font-mono">Immutable Audit Trail (MCA Rule 3 Compliant)</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pos-surface text-pos-accent border border-pos-accent/30">
              TRUNCATE/UPDATE/DELETE Hard-Blocked by Trigger
            </span>
          </div>

          <span className="text-xs font-mono text-pos-ink/50">Showing {logs.length} events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-pos-surface text-pos-ink/60 font-mono text-[11px] border-b border-pos-line uppercase">
                <th className="py-2.5 px-3">Event</th>
                <th className="py-2.5 px-3">User & Role</th>
                <th className="py-2.5 px-3">IP Address</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">HMAC Hash</th>
                <th className="py-2.5 px-3">Event Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pos-line font-mono">
              {logs.map((entry) => (
                <tr key={entry.id} className="hover:bg-pos-tint">
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pos-surface text-pos-accent border border-pos-line">
                      {entry.eventType}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="text-pos-ink font-bold">{entry.performedBy}</div>
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
      </div>
    </div>
  );
}
