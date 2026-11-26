'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileCheck2,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  RotateCcw,
  ShieldCheck,
  Download,
  ExternalLink,
  ChevronRight,
  Server,
  Layers,
  FileText,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';
import { TdsCommandBar } from '../../../../components/tds/TdsCommandBar';

interface ClickableError {
  line: number;
  recordId: string;
  errorCode: string;
  message: string;
}

interface FvuJob {
  id: string;
  return_id: string;
  fvu_version: string;
  docker_image: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'VALIDATION_FAILED' | 'SYSTEM_ERROR';
  error_summary?: string;
  started_at: string;
  completed_at?: string;
}

export default function FvuHubPage() {
  const { authFetch } = useAuth();
  const { activeClient } = useWorkspace();
  const [activeTan, setActiveTan] = useState<string>('PTLA12345B');
  const [activeReturnId, setActiveReturnId] = useState<string>('sample-return-id');
  const [activeRegime, setActiveRegime] = useState<'IT_ACT_2025' | 'IT_ACT_1961'>('IT_ACT_2025');
  const [txtContent, setTxtContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('PTLA12345B_140_Q3_2026.txt');
  const [lineCount, setLineCount] = useState<number>(0);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<{
    status: 'IDLE' | 'PRECHECK_PASSED' | 'SUCCESS' | 'FAILED';
    fvuVersion: string;
    errors: ClickableError[];
    outputFvuS3?: string;
  }>({
    status: 'IDLE',
    fvuVersion: activeRegime === 'IT_ACT_2025' ? '1.2' : '9.5',
    errors: [],
  });

  // PRN Token State
  const [prnToken, setPrnToken] = useState<string>('');
  const [tokenSubmitting, setTokenSubmitting] = useState<boolean>(false);
  const [tokenSuccess, setTokenSuccess] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<FvuJob[]>([]);

  const fetchJobs = async () => {
    try {
      const res = await authFetch(`/api/v1/tds/${activeTan}/fvu/jobs`);
      if (res.ok) {
        const json = await res.json();
        if (json.jobs) setRecentJobs(json.jobs);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [activeTan]);

  // Step 1: Compile Caret Text
  const handleCompileTxt = async () => {
    setIsCompiling(true);
    try {
      const res = await authFetch(`/api/v1/tds/${activeTan}/returns/${activeReturnId}/compile-txt`, {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        setTxtContent(json.txtContent);
        setFileName(json.fileName);
        setLineCount(json.lineCount);
      }
    } catch {
      // Show error
    } finally {
      setIsCompiling(false);
    }
  };

  // Step 2: Validate with Isolated Docker FVU
  const handleValidateFvu = async () => {
    setIsValidating(true);
    try {
      const res = await authFetch(`/api/v1/tds/${activeTan}/returns/${activeReturnId}/validate-fvu`, {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        setValidationResult({
          status: json.status === 'SUCCESS' ? 'SUCCESS' : json.precheck === 'PASSED' ? 'PRECHECK_PASSED' : 'FAILED',
          fvuVersion: json.fvuVersion || (activeRegime === 'IT_ACT_2025' ? '1.2' : '9.5'),
          errors: json.errors || json.clickableErrors || [],
          outputFvuS3: json.outputFvuS3,
        });
        fetchJobs();
      }
    } catch {
      setValidationResult({
        status: 'FAILED',
        fvuVersion: activeRegime === 'IT_ACT_2025' ? '1.2' : '9.5',
        errors: [{ line: 1, recordId: 'sys-1', errorCode: 'ERR_DOCKER_TIMEOUT', message: 'FVU validation runner timed out.' }],
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Step 3: Record PRN Token
  const handleRecordPrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[0-9]{15}$/.test(prnToken)) return;
    setTokenSubmitting(true);
    try {
      const res = await authFetch(`/api/v1/tds/${activeTan}/returns/${activeReturnId}/prn-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenNumber: prnToken }),
      });
      if (res.ok) {
        setTokenSuccess(`15-digit PRN ${prnToken} recorded successfully in firm statutory vault.`);
        setPrnToken('');
      }
    } catch {
      // Error
    } finally {
      setTokenSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto font-sans">
      <TdsCommandBar />

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-pos-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 font-semibold">
              <Terminal className="h-4 w-4" />
            </span>
            <h1 className="font-display text-[22px] font-semibold text-pos-ink">
              FVU Validation Hub &amp; Docker Farm
            </h1>
            <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-600">
              Isolated Runners
            </span>
          </div>
          <p className="mt-1 text-[13px] text-pos-ink/70">
            Caret-delimited statement compiler, dual-engine Docker FVU farm (v1.2 for 2025 Act and v9.5 for 1961 Act), with clickable .err line jumps.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCompileTxt}
            disabled={isCompiling}
            className="flex items-center gap-1.5 rounded-xl border border-pos-line bg-pos-surface px-3 py-1.5 text-[12px] font-medium text-pos-ink hover:bg-pos-muted transition-colors"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isCompiling ? 'animate-spin' : ''}`} />
            {isCompiling ? 'Compiling...' : 'Recompile .txt'}
          </button>
          <button
            type="button"
            onClick={handleValidateFvu}
            disabled={isValidating}
            className="flex items-center gap-1.5 rounded-xl bg-pos-ink px-4 py-1.5 text-[12px] font-semibold text-pos-surface hover:bg-pos-accent transition-colors shadow-sm disabled:opacity-50"
          >
            <Play className={`h-3.5 w-3.5 ${isValidating ? 'animate-spin' : ''}`} />
            {isValidating ? 'Running FVU...' : 'Run FVU Validation'}
          </button>
        </div>
      </div>

      {tokenSuccess && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[13px] text-emerald-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{tokenSuccess}</span>
          </div>
          <button type="button" onClick={() => setTokenSuccess(null)} className="text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Screen B 72/28 Split Layout */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 w-full min-w-0">
        {/* Left Column (72% ~ 8 cols on XL, full width below XL) */}
        <div className="xl:col-span-8 w-full min-w-0 space-y-4">
          {/* Step 1 & 2 Execution Status Card */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-indigo-600" />
                <h3 className="font-display text-[15px] font-semibold text-pos-ink">
                  Validation Pipeline Status
                </h3>
              </div>
              <span className="font-mono text-[11px] text-pos-ink/50">{fileName}</span>
            </div>

            {/* Stepper Pipeline */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Step 1 */}
              <div className="rounded-xl border border-pos-line bg-pos-muted/30 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-pos-ink/60 uppercase">Step 1: Compiler</span>
                  {txtContent ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-pos-ink/40" />
                  )}
                </div>
                <p className="text-[13px] font-semibold text-pos-ink">Caret .txt File</p>
                <p className="text-[11.5px] text-pos-ink/60">
                  {txtContent ? `${lineCount} lines compiled` : 'Click compile to generate'}
                </p>
              </div>

              {/* Step 2 */}
              <div className="rounded-xl border border-pos-line bg-pos-muted/30 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-pos-ink/60 uppercase">
                    Step 2: Docker FVU
                  </span>
                  {validationResult.status === 'SUCCESS' || validationResult.status === 'PRECHECK_PASSED' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : validationResult.status === 'FAILED' ? (
                    <XCircle className="h-4 w-4 text-rose-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-pos-ink/40" />
                  )}
                </div>
                <p className="text-[13px] font-semibold text-pos-ink">
                  FVU v{validationResult.fvuVersion} Runner
                </p>
                <p className="text-[11.5px] text-pos-ink/60">
                  {validationResult.status === 'SUCCESS'
                    ? 'Protean FVU passed: .fvu ready'
                    : validationResult.status === 'PRECHECK_PASSED'
                    ? 'Pre-check passed. Run Protean FVU on the desktop agent.'
                    : validationResult.status === 'FAILED'
                    ? `${validationResult.errors.length} Clickable Errors`
                    : 'Awaiting execution'}
                </p>
              </div>

              {/* Step 3 */}
              <div className="rounded-xl border border-pos-line bg-pos-muted/30 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-pos-ink/60 uppercase">Step 3: Portal PRN</span>
                  <KeyRound className="h-4 w-4 text-pos-ink/40" />
                </div>
                <p className="text-[13px] font-semibold text-pos-ink">15-Digit Token</p>
                <p className="text-[11.5px] text-pos-ink/60">Vault &amp; KYC integration</p>
              </div>
            </div>
          </div>

          {/* Validation Errors / Clickable Jump Cards */}
          {validationResult.status === 'FAILED' && validationResult.errors.length > 0 && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <h3 className="font-display text-[14.5px] font-semibold text-rose-800">
                  FVU .err Discrepancies ({validationResult.errors.length} issues)
                </h3>
              </div>
              <p className="text-[12px] text-rose-700/80">
                Click any error card below to jump directly into the deductee ledger and correct the field.
              </p>

              <div className="space-y-2">
                {validationResult.errors.map((err, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-rose-200 bg-white p-3 shadow-sm hover:border-rose-400 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded-lg bg-rose-100 px-2 py-1 font-mono text-[11px] font-bold text-rose-800">
                        Line {err.line}
                      </span>
                      <div>
                        <span className="font-mono text-[11px] font-semibold text-rose-600 block">
                          {err.errorCode}
                        </span>
                        <p className="text-[12.5px] text-pos-ink font-medium">{err.message}</p>
                      </div>
                    </div>
                    <Link
                      href={`/tds/deductees`}
                      className="flex items-center gap-1 text-[11.5px] font-semibold text-pos-accent hover:underline shrink-0"
                    >
                      <span>Fix in Deductees</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Caret-Delimited .txt Preview */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-pos-line px-4 py-3 bg-pos-muted/30">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-pos-ink/60" />
                <span className="text-[13px] font-semibold text-pos-ink">Statement File Preview</span>
              </div>
              {txtContent && (
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([txtContent], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();
                  }}
                  className="flex items-center gap-1.5 text-[11.5px] font-medium text-pos-accent hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download .txt
                </button>
              )}
            </div>

            <div className="p-4 bg-slate-950 text-slate-100 font-mono text-[11.5px] overflow-x-auto max-h-[360px]">
              {txtContent ? (
                <pre className="whitespace-pre">{txtContent}</pre>
              ) : (
                <p className="text-slate-500 py-6 text-center">
                  Click &apos;Recompile .txt&apos; above to generate the caret-delimited statement string.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (28% ~ 4 cols: PRN Vault & History on XL, full width below XL) */}
        <div className="xl:col-span-4 w-full min-w-0 space-y-4">
          {/* PRN Token Vault Card */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-pos-line pb-3">
              <KeyRound className="h-4 w-4 text-emerald-600" />
              <h3 className="font-display text-[15px] font-semibold text-pos-ink">
                Record 15-Digit PRN Token
              </h3>
            </div>

            <p className="text-[12px] text-pos-ink/70 leading-relaxed">
              Once uploaded to the ITD portal or TIN-FC, record the 15-digit Provisional Receipt Number to lock the return and enable TRACES KYC generation.
            </p>

            <form onSubmit={handleRecordPrn} className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-pos-ink/60 uppercase tracking-wider block mb-1">
                  Provisional Receipt Number (PRN)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="e.g. 010260400012345"
                  value={prnToken}
                  onChange={(e) => setPrnToken(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full rounded-xl border border-pos-line bg-pos-surface px-3 py-2 font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                />
              </div>

              <button
                type="submit"
                disabled={tokenSubmitting || prnToken.length !== 15}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                {tokenSubmitting ? 'Locking...' : 'Lock & Save PRN'}
              </button>
            </form>
          </div>

          {/* Docker FVU Farm Specs */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-4 shadow-sm space-y-2 text-[12px]">
            <h4 className="font-semibold text-pos-ink">Isolated FVU Runners</h4>
            <div className="space-y-1 text-pos-ink/70">
              <div className="flex justify-between">
                <span>IT Act 2025 Runner:</span>
                <span className="font-mono text-emerald-600">v1.2 (Docker)</span>
              </div>
              <div className="flex justify-between">
                <span>IT Act 1961 Runner:</span>
                <span className="font-mono text-sky-deep">v9.5 (Docker)</span>
              </div>
              <div className="flex justify-between">
                <span>Memory Sandbox:</span>
                <span className="font-mono">512 MB Non-Root</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
