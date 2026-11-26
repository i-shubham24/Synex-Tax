'use client';

import React, { useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  FileJson,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { GstCommandBar } from '../../../../components/gst/GstCommandBar';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';

interface ImportedPreviewRow {
  vendorGstin: string;
  vendorName?: string | null;
  invoiceNum: string;
  invoiceDate: string;
  docType?: string;
  taxableValue: string;
  igstAmount?: string;
  cgstAmount?: string;
  sgstAmount?: string;
  totalInvoiceValue?: string;
  itcEligibility?: string;
}

interface RegisterReport {
  fileName: string;
  period: string;
  headerRow: number;
  rowsRead: number;
  readyToImport: number;
  duplicates: number;
  notImported: Array<{ rowNumber: number; reason: string }>;
  skippedLines: number;
  warnings: Array<{ rowNumber: number; warnings: string[] }>;
  totals: { taxable: string; igst: string; cgst: string; sgst: string };
  preview: ImportedPreviewRow[];
  committed?: boolean;
  insertedCount?: number;
  alreadyPresent?: number;
}

interface TwoBReport {
  fileName: string;
  period: string;
  documentsInFile: number;
  saved: number;
  itcNotAvailable: number;
  rejected: Array<{ id: string; reason: string }>;
  unreadSections?: string[];
}

const SAMPLE_REGISTER_CSV = [
  'Supplier GSTIN,Supplier Name,Invoice No,Invoice Date,Voucher Type,Place of Supply,Taxable Value,IGST,CGST,SGST,Total',
  '03AABCP1332L1Z4,Amritsar Precision Steel Ltd,INV/2026-27/089,04-10-2026,Purchase,03-Punjab,150000.00,0.00,13500.00,13500.00,177000.00',
  '07BBBPG4512D1ZR,Apex Cloud Solutions Delhi,ACS/26-27/0441,05-10-2026,Purchase,03-Punjab,48000.00,8640.00,0.00,0.00,56640.00',
  '03CCCPM8891B1Z2,Golden Temple Roadways Transport,GTR-9021,08-10-2026,Purchase,03-Punjab,95000.00,0.00,5700.00,5700.00,106400.00',
].join('\n');

export default function GstImportSanitizerPage() {
  const { activeEntity, activeClient, activePeriod } = useWorkspace();
  const [selectedFile, setSelectedFile] = useState<{ fileName: string; content: string } | null>(null);
  const [report, setReport] = useState<RegisterReport | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [twoBReport, setTwoBReport] = useState<TwoBReport | null>(null);
  const [twoBError, setTwoBError] = useState<string | null>(null);
  const [loadingTwoB, setLoadingTwoB] = useState(false);

  const gstin = activeClient?.gstin ?? activeEntity?.gstins[0]?.gstin ?? '03AABCS1429B1Z2';
  const period = activePeriod;

  const submitRegisterFile = async (fileName: string, content: string, commit: boolean) => {
    setLoading(true);
    setRegisterError(null);
    try {
      const qs = new URLSearchParams({ period, ...(commit ? { commit: 'true' } : {}) });
      const res = await fetch(`/api/v1/gst/${gstin}/import/register-file?${qs.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ fileName, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegisterError(data.message ?? 'Register import failed validation.');
        return;
      }
      setReport(data as RegisterReport);
    } catch {
      setRegisterError('Could not reach purchase register importer.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    const next = { fileName: file.name, content };
    setSelectedFile(next);
    await submitRegisterFile(next.fileName, next.content, false);
  };

  const handleLoadSampleCsv = async () => {
    const sample = { fileName: `purchase-register-${period}.csv`, content: SAMPLE_REGISTER_CSV };
    setSelectedFile(sample);
    await submitRegisterFile(sample.fileName, sample.content, false);
  };

  const handleTwoBFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingTwoB(true);
    setTwoBError(null);
    try {
      const content = await file.text();
      const res = await fetch(`/api/v1/gst/${gstin}/recon/2b-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ fileName: file.name, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTwoBError(data.message ?? 'GSTR-2B file could not be imported.');
        return;
      }
      setTwoBReport(data as TwoBReport);
    } catch {
      setTwoBError('Could not upload GSTR-2B JSON file.');
    } finally {
      setLoadingTwoB(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl text-pos-ink">
      <GstCommandBar currentStep="VALIDATED" />

      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Purchase Register CSV/TSV Upload */}
          <div className="rounded-2xl border-2 border-dashed border-pos-line bg-pos-surface p-6 text-center transition-colors hover:border-pos-accent">
            <FileSpreadsheet className="mx-auto h-9 w-9 text-pos-accent" />
            <h3 className="mt-3 font-display font-semibold text-[16px]">
              Upload Tally, Busy, or Excel CSV Purchase Register
            </h3>
            <p className="mt-1 text-[12.5px] text-pos-ink/60">
              Detects header rows automatically, strips duplicate invoice lines, normalizes GSTINs, and prepares period {period}.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <label className="cursor-pointer rounded-xl bg-pos-head px-4 py-2 text-[13px] font-semibold text-white shadow-xs hover:opacity-90">
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleRegisterFileChange}
                  className="hidden"
                />
                {loading ? 'Sanitizing...' : 'Choose Register CSV/TSV'}
              </label>
              <button
                type="button"
                onClick={handleLoadSampleCsv}
                disabled={loading}
                className="rounded-xl border border-pos-line bg-pos-muted px-4 py-2 text-[13px] font-semibold text-pos-ink hover:border-pos-accent disabled:opacity-50"
              >
                Preview Sample CSV
              </button>
            </div>
            {registerError && (
              <p className="mt-3 text-[12px] font-medium text-red-600">{registerError}</p>
            )}
          </div>

          {/* Portal GSTR-2B JSON Upload */}
          <div className="rounded-2xl border-2 border-dashed border-pos-line bg-pos-surface p-6 text-center transition-colors hover:border-pos-accent">
            <FileJson className="mx-auto h-9 w-9 text-emerald-600" />
            <h3 className="mt-3 font-display font-semibold text-[16px]">
              Upload Portal GSTR-2B JSON
            </h3>
            <p className="mt-1 text-[12.5px] text-pos-ink/60">
              Imports B2B, CDNR, and B2BA tables for GSTIN {gstin} while preserving existing IMS actions.
            </p>
            <div className="mt-4 flex justify-center">
              <label className="cursor-pointer rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white shadow-xs hover:bg-emerald-700">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleTwoBFileChange}
                  className="hidden"
                />
                {loadingTwoB ? 'Importing 2B...' : 'Choose GSTR-2B JSON'}
              </label>
            </div>
            {twoBError && (
              <p className="mt-3 text-[12px] font-medium text-red-600">{twoBError}</p>
            )}
            {twoBReport && (
              <div className="mt-4 rounded-xl border border-pos-line bg-pos-muted/50 p-3 text-left text-[12px] space-y-1">
                <p className="font-semibold text-emerald-700">
                  Imported {twoBReport.saved} of {twoBReport.documentsInFile} documents ({twoBReport.period})
                </p>
                <p className="text-pos-ink/70">
                  ITC marked unavailable (itcavl=N): <span className="font-mono font-semibold">{twoBReport.itcNotAvailable}</span>
                  {' | '}Rejected: <span className="font-mono font-semibold">{twoBReport.rejected.length}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {report && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-pos-line bg-pos-surface p-4">
            <div className="flex flex-wrap items-center gap-4 text-[13px]">
              <div>
                <span className="text-pos-ink/50 text-[11px] block">File / Header Row</span>
                <span className="font-mono font-bold text-pos-ink">
                  {report.fileName} (Row {report.headerRow})
                </span>
              </div>
              <div className="border-l border-pos-line pl-4">
                <span className="text-pos-ink/50 text-[11px] block">Ready to Import</span>
                <span className="font-mono font-bold text-emerald-600">
                  {report.readyToImport} / {report.rowsRead}
                </span>
              </div>
              <div className="border-l border-pos-line pl-4">
                <span className="text-pos-ink/50 text-[11px] block">Duplicates Stripped</span>
                <span className="font-mono font-bold text-amber-600">{report.duplicates}</span>
              </div>
              <div className="border-l border-pos-line pl-4">
                <span className="text-pos-ink/50 text-[11px] block">Not Imported</span>
                <span className="font-mono font-bold text-red-600">{report.notImported.length}</span>
              </div>
            </div>

            {selectedFile && (
              <button
                type="button"
                onClick={() => submitRegisterFile(selectedFile.fileName, selectedFile.content, true)}
                disabled={loading || !!report.committed || report.readyToImport === 0}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {report.committed
                    ? `Committed (${report.insertedCount ?? report.readyToImport} saved)`
                    : 'Commit Sanitized Rows'}
                </span>
              </button>
            )}
          </div>
        )}

        {report && report.notImported.length > 0 && (
          <div className="rounded-xl border border-amber-300/70 bg-amber-50/70 dark:bg-amber-950/30 p-4 text-[12px] space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              <span>Skipped / Invalid Register Rows ({report.notImported.length})</span>
            </div>
            <ul className="space-y-1 font-mono text-[11.5px] text-amber-900/80 dark:text-amber-200/80">
              {report.notImported.slice(0, 10).map((item, idx) => (
                <li key={idx}>
                  Row {item.rowNumber}: {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {report && report.preview.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-pos-line bg-pos-surface shadow-sm">
            <table className="w-full min-w-[680px] text-left text-[13px]">
              <thead className="bg-[#141619] text-white text-[11.5px] uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Vendor GSTIN</th>
                  <th className="px-4 py-3">Supplier Name</th>
                  <th className="px-3 py-3">Invoice Num</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Taxable (&#8377;)</th>
                  <th className="px-4 py-3 text-right">Tax Total (&#8377;)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pos-line font-mono text-[12px] tabular-nums">
                {report.preview.map((r, idx) => {
                  const taxSum =
                    parseFloat(r.igstAmount || '0') +
                    parseFloat(r.cgstAmount || '0') +
                    parseFloat(r.sgstAmount || '0');
                  return (
                    <tr key={idx} className="hover:bg-pos-muted/40 font-sans">
                      <td className="px-4 py-3 font-mono font-medium text-pos-ink">{r.vendorGstin}</td>
                      <td className="px-4 py-3 text-pos-ink">{r.vendorName ?? 'Supplier'}</td>
                      <td className="px-3 py-3 font-mono font-semibold text-pos-ink">{r.invoiceNum}</td>
                      <td className="px-3 py-3 font-mono text-pos-ink/60">{r.invoiceDate}</td>
                      <td className="px-4 py-3 text-right font-mono text-pos-ink">&#8377;{r.taxableValue}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700">&#8377;{taxSum.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
