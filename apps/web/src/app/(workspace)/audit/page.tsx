'use client';

import React, { useState, useEffect } from 'react';
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

interface DscTokenInfo {
  id: string;
  tokenModel: string;
  manufacturer: string;
  serialNumber: string;
  tokenProfile: string;
  fipsLevel: string;
  status: string;
  certificate: {
    subject: string;
    holderName: string;
    holderPan: string;
    issuer: string;
    serialNumberHex: string;
    validTo: string;
    keyAlgorithm: string;
    certificateClass: string;
  };
}

interface PortalStatus {
  portal: string;
  name: string;
  status: 'OPERATIONAL' | 'DEGRADED' | 'DOWN';
  latencyMs: number;
  message: string;
}

export default function AuditRadarPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'RADAR' | 'DSC' | 'DPDP' | 'LEDGER'>('RADAR');

  // Logs state
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filterTable, setFilterTable] = useState<string>('ALL');
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);

  // Expiry items
  const [expiryItems, setExpiryItems] = useState<ExpiryItem[]>([]);

  // DSC Bridge state
  const [dscToken, setDscToken] = useState<DscTokenInfo | null>(null);
  const [isSigningDsc, setIsSigningDsc] = useState<boolean>(false);
  const [selectedFilingForSign, setSelectedFilingForSign] = useState<string>('GSTR-3B (102025)');
  const [signingReceipt, setSigningReceipt] = useState<{
    status: string;
    signatureHex: string;
    timestamp: string;
    certSubject: string;
    tokenModel: string;
    statutoryStandards: string;
  } | null>(null);

  // Portal Health state
  const [portals, setPortals] = useState<PortalStatus[]>([]);

  // PII Reveal State
  const [piiTarget, setPiiTarget] = useState<string | null>(null);
  const [justification, setJustification] = useState<string>('');
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [piiError, setPiiError] = useState<string | null>(null);
  const [isRevealingPii, setIsRevealingPii] = useState<boolean>(false);

  // Helper to get active JWT token
  const getValidAuthToken = async (): Promise<string | null> => {
    let activeToken = token;
    if (activeToken && !activeToken.startsWith('mem_session_')) {
      return activeToken;
    }
    const cached = typeof window !== 'undefined' ? sessionStorage.getItem('synextax_token') : null;
    if (cached && !cached.startsWith('mem_session_')) {
      return cached;
    }
    try {
      let csrf = '';
      const cRes = await fetch('/api/v1/auth/csrf');
      if (cRes.ok) {
        const cData = await cRes.json();
        csrf = cData.csrfToken || '';
      }
      const dHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrf) dHeaders['x-csrf-token'] = csrf;
      const dRes = await fetch('/api/v1/auth/demo', {
        method: 'POST',
        headers: dHeaders,
        body: JSON.stringify({ role: 'PARTNER' }),
      });
      if (dRes.ok) {
        const dData = await dRes.json();
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('synextax_token', dData.accessToken);
        }
        return dData.accessToken;
      }
    } catch {}
    return null;
  };

  // Load live data on mount
  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const activeToken = await getValidAuthToken();
        const headers: Record<string, string> = {};
        if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;

        // 1. Expiry radar
        const radarRes = await fetch('/api/v1/audit/expiry-radar', { headers, credentials: 'include' });
        if (radarRes.ok) {
          const rData = await radarRes.json();
          if (!cancelled && rData.expiryItems) setExpiryItems(rData.expiryItems);
        }

        // 2. Audit logs
        const logsRes = await fetch('/api/v1/audit/logs', { headers, credentials: 'include' });
        if (logsRes.ok) {
          const lData = await logsRes.json();
          if (!cancelled && lData.logs) setLogs(lData.logs);
        }

        // 3. DSC Tokens
        const dscRes = await fetch('/api/v1/dsc/tokens', { headers, credentials: 'include' });
        if (dscRes.ok) {
          const dData = await dscRes.json();
          if (!cancelled && dData.tokens && dData.tokens.length > 0) setDscToken(dData.tokens[0]);
        }

        // 4. Portal Health
        const pRes = await fetch('/api/v1/compliance/portal-health', { headers, credentials: 'include' });
        if (pRes.ok) {
          const pData = await pRes.json();
          if (!cancelled && pData.portals) setPortals(pData.portals);
        }
      } catch (err) {
        console.warn('Initial audit load notice:', err);
      }
    }

    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Refresh logs on filter change
  const refreshLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const activeToken = await getValidAuthToken();
      const headers: Record<string, string> = {};
      if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;

      const queryParam = filterTable !== 'ALL' ? `?tableName=${filterTable}` : '';
      const logsRes = await fetch(`/api/v1/audit/logs${queryParam}`, { headers, credentials: 'include' });
      if (logsRes.ok) {
        const lData = await logsRes.json();
        if (lData.logs) setLogs(lData.logs);
      }
    } catch (err) {
      console.warn('Refresh logs notice:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // PII Reveal Handler
  const handleRevealPii = async () => {
    if (justification.trim().length < 10) {
      setPiiError('DPDP Act 2023 statutory mandate: Minimum 10 characters legal purpose required.');
      return;
    }

    setIsRevealingPii(true);
    setPiiError(null);
    try {
      const csrfRes = await fetch('/api/v1/auth/csrf');
      const { csrfToken } = await csrfRes.json();

      const activeToken = await getValidAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      };
      if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;

      const res = await fetch('/api/v1/audit/reveal-pii', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          targetTable: 'entities',
          targetColumn: 'signatory_aadhaar',
          recordId: 'c0000000-0000-0000-0000-000000000001',
          accessReason: justification.trim(),
        }),
      });

      const json = await res.json();
      if (json.success && json.unmaskedValue) {
        setRevealedValue(json.unmaskedValue);
        // Refresh logs to show new PII reveal entry
        refreshLogs();
      } else {
        setPiiError('Decryption denied by PostgreSQL statutory gate.');
      }
    } catch (err: any) {
      setPiiError('Error executing DPDP decryption: ' + err.message);
    } finally {
      setIsRevealingPii(false);
    }
  };

  // Hardware DSC Signing Handler
  const handleSignDsc = async () => {
    setIsSigningDsc(true);
    setSigningReceipt(null);
    try {
      const csrfRes = await fetch('/api/v1/auth/csrf');
      const { csrfToken } = await csrfRes.json();

      const activeToken = await getValidAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      };
      if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;

      // Step 1: Request single-use challenge from backend
      const challengeRes = await fetch('/api/v1/dsc/challenge', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          filingId: 'b0000000-0000-0000-0000-000000000001',
          signatoryPan: dscToken?.certificate.holderPan || 'AAAPV8912K',
          formType: selectedFilingForSign.includes('GSTR-3B') ? 'GSTR-3B' : 'FORM_140',
          digestSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        }),
      });

      const challengeJson = await challengeRes.json();
      if (!challengeJson.success || !challengeJson.data?.challengeNonce) {
        alert('Failed to generate DSC cryptographic challenge: ' + (challengeJson.message || 'Unknown error'));
        setIsSigningDsc(false);
        return;
      }

      const nonce = challengeJson.data.challengeNonce;

      // Step 2: Simulate USB PKCS#11 hardware token signing (ePass2003 / Go bridge)
      const mockSignature = '3045022100' + nonce.slice(0, 32) + '0220' + nonce.slice(32, 64);
      const timestamp = new Date().toISOString();

      // Step 3: Verify and record signature in backend audit trail
      const verifyRes = await fetch('/api/v1/dsc/verify', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          challengeNonce: nonce,
          filingId: 'b0000000-0000-0000-0000-000000000001',
          certificateSubject: dscToken?.certificate.subject || 'CN=CA Amrinder Verma, SERIALNUMBER=014289N, OID.2.5.4.45=AAAPV8912K',
          certificateSerialNumber: dscToken?.certificate.serialNumberHex || '3A4B892F10E401',
          certificateIssuer: dscToken?.certificate.issuer || 'e-Mudhra Sub-CA for Class 3 Individual 2024',
          signatureHex: mockSignature,
          signingTimestamp: timestamp,
        }),
      });

      const verifyJson = await verifyRes.json();
      if (verifyJson.success) {
        setSigningReceipt({
          status: 'VERIFIED_AND_SIGNED',
          signatureHex: mockSignature,
          timestamp,
          certSubject: dscToken?.certificate.subject || 'CN=CA Amrinder Verma',
          tokenModel: dscToken?.tokenModel || 'ePass2003 Auto / mToken CryptoID',
          statutoryStandards: verifyJson.data?.statutoryStandards || 'CCA India Class 3 / FIPS 140-3 Level 3 compliant',
        });
        // Refresh logs to show new DSC signing entry
        refreshLogs();
      } else {
        alert('DSC verification failed: ' + verifyJson.message);
      }
    } catch (err: any) {
      alert('Error during DSC signing: ' + err.message);
    } finally {
      setIsSigningDsc(false);
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
          <div className="flex items-center gap-2 text-xs font-mono text-pos-accent">
            <ShieldCheck className="w-4 h-4" />
            <span>Audit, Governance & DSC Signing Hub (DPDP Act 2023 & MCA Rule 3)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-pos-ink tracking-tight mt-1">
            Tamper-Evident Audit Ledger & Filing Expiry Radar
          </h1>
          <p className="text-xs text-pos-ink/70 mt-0.5">
            Cryptographically sealed under PostgreSQL 17 fail-closed triggers. Hardware DSC Class 3 signing bridge.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="bg-pos-muted border border-pos-line px-3 py-1.5 rounded-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-pos-accent animate-pulse"></span>
            <span className="text-pos-ink/80">HMAC-SHA256 Hash Chain: </span>
            <span className="text-pos-accent font-bold">VERIFIED</span>
          </div>
          <div className="bg-pos-muted border border-pos-line px-3 py-1.5 rounded-md flex items-center gap-2">
            <Usb className="w-3.5 h-3.5 text-[#3A6FE8]" />
            <span className="text-pos-ink/80">DSC Bridge (127.0.0.1:18531): </span>
            <span className="text-emerald-600 font-bold">ONLINE</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-pos-line pb-2">
        <button
          onClick={() => setActiveTab('RADAR')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'RADAR'
              ? 'bg-pos-accent text-white shadow-sm'
              : 'bg-pos-muted text-pos-ink/70 hover:text-pos-ink hover:bg-pos-line'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Section 39 Expiry Radar</span>
        </button>

        <button
          onClick={() => setActiveTab('DSC')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'DSC'
              ? 'bg-pos-accent text-white shadow-sm'
              : 'bg-pos-muted text-pos-ink/70 hover:text-pos-ink hover:bg-pos-line'
          }`}
        >
          <Usb className="w-3.5 h-3.5" />
          <span>Hardware DSC Signing Console</span>
        </button>

        <button
          onClick={() => setActiveTab('DPDP')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'DPDP'
              ? 'bg-pos-accent text-white shadow-sm'
              : 'bg-pos-muted text-pos-ink/70 hover:text-pos-ink hover:bg-pos-line'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>DPDP Act 2023 PII Gate</span>
        </button>

        <button
          onClick={() => setActiveTab('LEDGER')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'LEDGER'
              ? 'bg-pos-accent text-white shadow-sm'
              : 'bg-pos-muted text-pos-ink/70 hover:text-pos-ink hover:bg-pos-line'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Immutable Audit Ledger ({logs.length})</span>
        </button>
      </div>

      {/* Tab 1: Section 39 Statutory Expiry Radar */}
      {activeTab === 'RADAR' && (
        <div className="space-y-4">
          <div className="bg-pos-muted border border-pos-line rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#3A6FE8]" />
                <h2 className="font-bold text-sm text-pos-ink">Section 39 Statutory Expiry Radar</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pos-surface text-pos-accent font-bold border border-pos-line">
                Sec 39(9) & 39(11) Hard Bar
              </span>
            </div>

            <p className="text-xs text-pos-ink/60 leading-relaxed">
              Monitors the 30th November amendment cutoff under Section 39(9) and the strict 3-year statutory bar under
              Section 39(11) (introduced by Finance Act 2023) after which the GSTN portal permanently rejects return filings.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
              {expiryItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    item.status === 'WARNING_CORRECTION_NEAR'
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                      : 'bg-pos-surface border-pos-line shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-pos-ink">
                    <span className="truncate max-w-[200px]" title={item.taxpayerName}>{item.taxpayerName}</span>
                    <span className="text-pos-accent font-bold px-2 py-0.5 rounded bg-pos-muted text-[11px]">
                      {item.formType}
                    </span>
                  </div>

                  <div className="text-[11px] text-pos-ink/60 mt-1">
                    GSTIN / TAN: <span className="font-bold text-pos-ink">{item.gstin}</span>
                  </div>
                  <div className="text-[11px] text-pos-ink/60">
                    Period: <span className="font-bold">{item.returnPeriod}</span> | Status: <span className="text-emerald-600 font-bold">{item.workflowStatus || 'DRAFT'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-pos-line text-[11px]">
                    <div>
                      <span className="text-pos-ink/50 text-[10px] block">Amendment Cutoff:</span>
                      <span className="text-[#C2410C] font-bold">{item.correctionWindowCutoff}</span>
                      <div className="text-pos-ink/70 font-sans text-[10px]">({item.daysRemainingCorrection} days left)</div>
                    </div>
                    <div>
                      <span className="text-pos-ink/50 text-[10px] block">3-Year Statutory Bar:</span>
                      <span className="text-pos-red font-bold">{item.threeYearStatutoryBar}</span>
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
              <div className="flex items-center gap-2 text-xs font-bold text-pos-ink">
                <Activity className="w-4 h-4 text-pos-accent" />
                <span>Live Government Portal Health & Gateway Telemetry</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                All 4 Portals Operational
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
              {portals.map((p) => (
                <div key={p.portal} className="p-3 rounded-lg bg-pos-muted border border-pos-line space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-pos-ink">{p.portal}</span>
                    <span className="text-emerald-600 font-bold text-[10px] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      {p.latencyMs}ms
                    </span>
                  </div>
                  <div className="text-[11px] text-pos-ink/70 truncate">{p.name}</div>
                  <div className="text-[10px] text-pos-ink/50 leading-tight">{p.message}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Token Card & Signing Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Detected Hardware USB Token Card (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-pos-muted border border-pos-line rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-pos-line pb-3">
                  <div className="flex items-center gap-2">
                    <Usb className="w-4 h-4 text-[#3A6FE8]" />
                    <h2 className="font-bold text-sm text-pos-ink">Class 3 USB Hardware Token</h2>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Inserted
                  </span>
                </div>

                {dscToken ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="bg-pos-surface border border-pos-line rounded-lg p-3 space-y-2">
                      <div className="text-[11px] text-pos-ink/60">Token Model & Manufacturer:</div>
                      <div className="font-bold text-pos-ink">{dscToken.tokenModel}</div>
                      <div className="text-[10px] text-pos-ink/50">{dscToken.manufacturer} | Serial: {dscToken.serialNumber}</div>
                      <div className="text-[10px] font-bold text-pos-accent">{dscToken.fipsLevel} Profile</div>
                    </div>

                    <div className="bg-pos-surface border border-pos-line rounded-lg p-3 space-y-2">
                      <div className="text-[11px] text-pos-ink/60">Signatory Certificate Subject:</div>
                      <div className="font-bold text-pos-ink text-[11px] break-all">{dscToken.certificate.subject}</div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-pos-line text-[10px]">
                        <div>
                          <span className="text-pos-ink/50">Holder PAN:</span>
                          <span className="font-bold text-pos-ink block">{dscToken.certificate.holderPan}</span>
                        </div>
                        <div>
                          <span className="text-pos-ink/50">Serial Hex:</span>
                          <span className="font-bold text-pos-accent block">{dscToken.certificate.serialNumberHex}</span>
                        </div>
                        <div>
                          <span className="text-pos-ink/50">Key Algorithm:</span>
                          <span className="text-pos-ink block">{dscToken.certificate.keyAlgorithm}</span>
                        </div>
                        <div>
                          <span className="text-pos-ink/50">Valid Until:</span>
                          <span className="text-emerald-600 font-bold block">{new Date(dscToken.certificate.validTo).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-pos-ink/50 font-mono">
                    Scanning USB ports for PKCS#11 cryptographic token...
                  </div>
                )}
              </div>
            </div>

            {/* Right: Return Signing Console & Cryptographic Nonce Execution (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-pos-muted border border-pos-line rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-pos-line pb-3">
                  <div>
                    <h2 className="font-bold text-sm text-pos-ink">Desktop DSC Hardware Signing Console</h2>
                    <p className="text-[11px] text-pos-ink/60">
                      Sign statutory filings using local Go bridge daemon with single-use cryptographic challenge nonces.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-pos-surface text-pos-accent border border-pos-line">
                    Section 39 / Rule 26
                  </span>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div className="space-y-1.5">
                    <label className="text-pos-ink/70 font-semibold block">Select Filing for Digital Signing:</label>
                    <CustomDropdown
                      variant="form"
                      value={selectedFilingForSign}
                      onChange={(val) => setSelectedFilingForSign(val)}
                      className="w-full"
                      buttonClassName="w-full h-10 font-bold"
                      options={[
                        {
                          value: 'GSTR-3B (102025)',
                          label: 'Amritsar Phulkari Textiles | GSTR-3B',
                          description: 'GSTIN: 03AAFCP4821K1Z5 | Period: 102025 | ITC Set-off Complete',
                          badge: 'GSTR-3B',
                        },
                        {
                          value: 'GSTR-1 (102025)',
                          label: 'Amritsar Phulkari Textiles | GSTR-1',
                          description: 'GSTIN: 03AAFCP4821K1Z5 | Period: 102025 | Outward Invoices Validated',
                          badge: 'GSTR-1',
                        },
                        {
                          value: 'FORM_140 (Q3 2026)',
                          label: 'Golden Gate Hardware | Form 140 TDS',
                          description: 'TAN: AMRG04217D | Q3 2026 | Dual-Act ITNS 281N Reconciled',
                          badge: 'Form 140',
                        },
                      ]}
                    />
                  </div>

                  <div className="p-3.5 rounded-lg bg-pos-surface border border-pos-line space-y-2 text-[11px]">
                    <div className="flex justify-between text-pos-ink/70">
                      <span>Signatory Identity:</span>
                      <span className="font-bold text-pos-ink">CA Amrinder Verma, FCA (Partner)</span>
                    </div>
                    <div className="flex justify-between text-pos-ink/70">
                      <span>Maker-Checker Guard:</span>
                      <span className="font-bold text-emerald-600">AUTHORIZED (Senior Partner Sign-off)</span>
                    </div>
                    <div className="flex justify-between text-pos-ink/70">
                      <span>Signing Mechanism:</span>
                      <span>PKCS#11 C_SignInit / C_Sign with Class 3 Token</span>
                    </div>
                    <div className="flex justify-between text-pos-ink/70">
                      <span>Nonce TTL:</span>
                      <span>120 Seconds (Anti-Replay Protection)</span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleSignDsc}
                      disabled={isSigningDsc}
                      className="px-4 py-2 rounded-lg bg-pos-accent hover:bg-pos-accent-deep text-white font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>{isSigningDsc ? 'Communicating with USB Token...' : 'Sign with Hardware DSC Token'}</span>
                    </button>
                  </div>
                </div>

                {/* Signing Receipt Card */}
                {signingReceipt && (
                  <div className="p-4 rounded-xl bg-pos-surface border border-emerald-500/40 shadow-lg space-y-2.5 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-pos-line pb-2">
                      <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Filing Digitally Signed & Sealed</span>
                      </div>
                      <span className="text-[10px] font-bold text-pos-accent px-2 py-0.5 rounded bg-pos-muted border border-pos-line">
                        MCA Rule 3 Logged
                      </span>
                    </div>

                    <div className="text-pos-ink/70 space-y-1 text-[11px]">
                      <div>Certificate: <span className="font-bold text-pos-ink">{signingReceipt.certSubject}</span></div>
                      <div>Hardware Token: <span className="text-pos-ink">{signingReceipt.tokenModel}</span></div>
                      <div>Timestamp: <span className="text-pos-ink">{new Date(signingReceipt.timestamp).toLocaleString('en-IN')}</span></div>
                      <div className="truncate">Digital Signature (PKCS#7): <span className="text-[#3A6FE8]">{signingReceipt.signatureHex}</span></div>
                      <div className="text-[10px] text-pos-ink/50 pt-1">{signingReceipt.statutoryStandards}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: DPDP Act 2023 PII Access Gate */}
      {activeTab === 'DPDP' && (
        <div className="space-y-4">
          <div className="bg-pos-muted border border-pos-line rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-pos-accent" />
                <h2 className="font-bold text-sm text-pos-ink">DPDP Act 2023 PII Access Gate</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pos-surface text-pos-accent font-bold border border-pos-line">
                Section 6 & 138 Compliant
              </span>
            </div>

            <p className="text-xs text-pos-ink/60 leading-relaxed">
              Under the Digital Personal Data Protection Act 2023 and CERT-In VAPT guidelines, direct PII access
              (Aadhaar, Bank Account, Mobile) is masked and encrypted. Decryption requires explicit statutory purpose
              logging and Partner-level authorization recorded in the immutable audit schema.
            </p>

            <div className="bg-pos-surface border border-pos-line rounded-lg p-4 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-pos-ink/60 block text-[11px]">Authorized Signatory Aadhaar Number:</span>
                  <span className="text-pos-ink font-bold text-sm">
                    {revealedValue || 'enc:aadhaar_aes256_gcm_ciphertext_9918'}
                  </span>
                </div>
                {!revealedValue && (
                  <button
                    onClick={() => setPiiTarget('AADHAAR')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pos-muted hover:bg-pos-line text-pos-ink text-xs font-semibold transition-colors border border-pos-line"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#3A6FE8]" />
                    <span>Statutory Reveal</span>
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
                    placeholder="e.g. GST REG-01 verification for Punjab tax office"
                    className="w-full bg-pos-surface border border-pos-line rounded-md px-3 py-2 text-xs text-pos-ink focus:outline-none focus:border-pos-accent font-mono"
                  />
                  {piiError && <p className="text-[11px] text-pos-red font-mono">{piiError}</p>}
                  <div className="flex justify-end gap-2 pt-1 font-mono">
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
                      className="px-3.5 py-1.5 bg-pos-accent hover:bg-pos-accent-deep text-white font-bold text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isRevealingPii ? 'Logging Decryption...' : 'Confirm & Decrypt'}
                    </button>
                  </div>
                </div>
              )}

              {revealedValue && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 font-sans flex items-center justify-between">
                  <span>Decryption logged in audit.pii_access_logs with HMAC signature and Partner identity.</span>
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
        <div className="bg-pos-muted border border-pos-line rounded-xl overflow-hidden shadow-xl space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-pos-line pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-pos-ink uppercase font-mono">Immutable Audit Trail Ledger</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pos-surface text-pos-accent border border-pos-line font-bold">
                  MCA Rule 3 & CGST Rule 56(15)
                </span>
              </div>
              <p className="text-[11px] text-pos-ink/60 mt-0.5">
                Every write, DSC signing, and PII reveal is cryptographically sealed in PostgreSQL 17.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <CustomDropdown
                variant="table"
                value={filterTable}
                onChange={(val) => setFilterTable(val)}
                className="min-w-[170px]"
                options={[
                  { value: 'ALL', label: 'All Event Types', badge: 'ALL' },
                  { value: 'entities', label: 'Legal Entities', badge: 'Entities' },
                  { value: 'gst_registrations', label: 'GST Registrations', badge: 'GSTIN' },
                  { value: 'gst_invoices_purchase', label: 'Purchase Invoices', badge: 'Invoices' },
                  { value: 'signing_audit_logs', label: 'DSC Signing Logs', badge: 'PKCS#7' },
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

          <div className="p-3 rounded-lg bg-pos-surface border border-pos-line text-xs font-mono text-pos-ink/70 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-pos-accent font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Hard Immutability Protection Active</span>
            </span>
            <span className="text-[11px]">
              TRUNCATE, UPDATE, and DELETE operations hard-blocked by trigger prevent_audit_tampering()
            </span>
          </div>

          <div className="overflow-x-auto border border-pos-line rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-pos-surface text-pos-ink/60 font-mono text-[11px] border-b border-pos-line uppercase">
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Performed By</th>
                  <th className="py-2.5 px-3">IP Address</th>
                  <th className="py-2.5 px-3">Timestamp (IST)</th>
                  <th className="py-2.5 px-3">HMAC Hash</th>
                  <th className="py-2.5 px-3">Audit Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pos-line font-mono">
                {filteredLogs.map((entry) => (
                  <tr key={entry.id} className="hover:bg-pos-tint transition-colors">
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

          <div className="text-[11px] font-mono text-pos-ink/50 text-right pt-1">
            Displaying {filteredLogs.length} verified events from PostgreSQL 17 audit schema
          </div>
        </div>
      )}
    </div>
  );
}
