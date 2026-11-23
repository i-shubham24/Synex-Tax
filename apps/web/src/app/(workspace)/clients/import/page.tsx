'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardPaste, FileUp, Layers, ListChecks, Trash2, Upload } from 'lucide-react';
import {
  IMPORT_FIELD_LABELS,
  detectHeaderRow,
  mapColumns,
  maskPan,
  parseDelimited,
  parseGstinPaste,
  rowsFromTable,
  validateImportRows,
  type ColumnMap,
  type ImportField,
  type RawRow,
  type ValidatedRow,
} from '@synextax/tax-engine';
import { useAuth } from '../../../../context/AuthContext';

type Source = 'paste' | 'file' | 'gstins' | 'smartbiz';
type Row = { raw: RawRow; sourceLine: number };

interface SmartBizMigrationSummary {
  filesProcessed: number;
  entitiesCreated: number;
  returnsImported: number;
  challansRecorded: number;
  deducteesLoaded: number;
  errors: Array<{ filename: string; reason: string }>;
}

const EDITABLE: ImportField[] = ['legalName', 'pan', 'gstins', 'constitution', 'tan', 'mobile', 'email', 'groupName'];
const FIELD_OPTIONS = Object.entries(IMPORT_FIELD_LABELS) as Array<[ImportField, string]>;

const chip: Record<ValidatedRow['status'], string> = {
  GREEN: 'bg-[#5fe88a]/20 text-[#147a3a]',
  AMBER: 'bg-[#f2b53a]/20 text-[#8a5a00]',
  RED: 'bg-[#dc2626]/15 text-[#b91c1c]',
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const chipLabel: Record<ValidatedRow['status'], string> = { GREEN: 'Ready', AMBER: 'Cleaned', RED: 'Fix' };

export default function ClientImportPage() {
  const { user, authFetch } = useAuth();
  const [source, setSource] = useState<Source>('paste');
  const [text, setText] = useState('');
  const [table, setTable] = useState<string[][] | null>(null);
  const [headerIndex, setHeaderIndex] = useState(-1);
  const [columns, setColumns] = useState<ColumnMap>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [existing, setExisting] = useState<{ gstins: string[]; pans: string[] }>({ gstins: [], pans: [] });
  const [filter, setFilter] = useState<'ALL' | ValidatedRow['status']>('ALL');
  const [groupName, setGroupName] = useState('Imported clients');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [smartBizProgress, setSmartBizProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [smartBizResult, setSmartBizResult] = useState<SmartBizMigrationSummary | null>(null);


  useEffect(() => {
    authFetch('/api/v1/client-master/import/context')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setExisting(d))
      .catch(() => {});
  }, [authFetch]);

  const validated = useMemo(
    () => validateImportRows(rows, { existingGstins: existing.gstins, existingPans: existing.pans }),
    [rows, existing],
  );
  const counts = useMemo(
    () => validated.reduce((c, r) => ({ ...c, [r.status]: c[r.status] + 1 }), { GREEN: 0, AMBER: 0, RED: 0 }),
    [validated],
  );
  const shown = validated.filter((r) => filter === 'ALL' || r.status === filter);

  function load(input: string, kind: Source) {
    setResult(null);
    setMessage(null);
    if (kind === 'gstins') {
      const { results, truncated } = parseGstinPaste(input);
      setTable(null);
      setColumns([]);
      setRows(results.map((r, i) => ({ sourceLine: i + 1, raw: { gstins: r.gstin, legalName: '' } })));
      if (truncated) setMessage('Only the first 500 GSTINs were taken.');
      return;
    }
    const parsed = parseDelimited(input);
    const h = detectHeaderRow(parsed);
    if (h < 0) {
      setTable(null);
      setRows([]);
      setMessage('No header row found. Make sure the first rows include column names such as Name, PAN or GSTIN.');
      return;
    }
    const map = mapColumns(parsed[h]);
    setTable(parsed);
    setHeaderIndex(h);
    setColumns(map);
    setRows(rowsFromTable(parsed, h, map));
  }

  function remap(col: number, field: ImportField | null) {
    if (!table) return;
    const next = [...columns];
    next[col] = field;
    setColumns(next);
    setRows(rowsFromTable(table, headerIndex, next));
  }

  function edit(index: number, field: ImportField, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, raw: { ...r.raw, [field]: value } } : r)));
  }

  async function onFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Files up to 5 MB. Split larger lists.');
      return;
    }
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) {
      setMessage('Upload a CSV. For an Excel file, copy the cells and use Paste from Excel.');
      return;
    }
    const content = await file.text();
    setText(content);
    load(content, 'file');
  }

  async function onSmartBizFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;
    setBusy(true);
    setMessage(null);
    setSmartBizResult(null);

    const summary: SmartBizMigrationSummary = {
      filesProcessed: 0,
      entitiesCreated: 0,
      returnsImported: 0,
      challansRecorded: 0,
      deducteesLoaded: 0,
      errors: [],
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setSmartBizProgress({ current: i + 1, total: files.length, filename: file.name });
      try {
        const content = await file.text();
        const res = await authFetch('/api/v1/tds/import/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: content, autoCreate: true }),
        });
        const data = await res.json();
        if (res.status === 201) {
          summary.filesProcessed += 1;
          summary.returnsImported += 1;
          if (data.createdEntity) summary.entitiesCreated += 1;
          summary.challansRecorded += data.challans || 0;
          summary.deducteesLoaded += data.deductees || 0;
        } else {
          summary.errors.push({
            filename: file.name,
            reason: data.message || `HTTP ${res.status}: Import failed`,
          });
        }
      } catch (err: any) {
        summary.errors.push({
          filename: file.name,
          reason: err?.message || 'Network error while uploading',
        });
      }
    }

    setBusy(false);
    setSmartBizProgress(null);
    setSmartBizResult(summary);
  }

  async function commit() {
    setBusy(true);
    setMessage(null);
    try {
      const keep = rows.filter((_, i) => validated[i].status !== 'RED');
      const res = await authFetch('/api/v1/client-master/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: keep, defaultGroupName: groupName }),
      });
      const body = await res.json();
      if (res.status === 201) setResult(body);
      else setMessage(body.message ?? 'Import failed. Nothing was saved.');
    } catch {
      setMessage('Could not reach the server. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  if (user && user.role !== 'PARTNER') {
    return (
      <div className="pos-card mx-auto max-w-xl p-8 text-center">
        <p className="text-[15px] text-pos-ink">Only partners can import clients.</p>
        <Link href="/clients" className="mt-4 inline-block text-pos-accent">Back to Client Master</Link>
      </div>
    );
  }

  if (smartBizResult) {
    return (
      <div className="pos-card mx-auto max-w-2xl p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#22a356]/15 text-[#22a356]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-pos-ink">SmartBiz migration complete</h1>
            <p className="text-[13.5px] text-pos-ink/60">
              {smartBizResult.filesProcessed} past statements processed and verified.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-pos-line bg-pos-surface/60 p-4">
            <span className="text-[12px] font-medium text-pos-ink/60">Clients Provisioned</span>
            <div className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-pos-ink">
              {smartBizResult.entitiesCreated}
            </div>
          </div>
          <div className="rounded-2xl border border-pos-line bg-pos-surface/60 p-4">
            <span className="text-[12px] font-medium text-pos-ink/60">Returns Logged</span>
            <div className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-pos-ink">
              {smartBizResult.returnsImported}
            </div>
          </div>
          <div className="rounded-2xl border border-pos-line bg-pos-surface/60 p-4">
            <span className="text-[12px] font-medium text-pos-ink/60">Challans Verified</span>
            <div className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-pos-ink">
              {smartBizResult.challansRecorded}
            </div>
          </div>
          <div className="rounded-2xl border border-pos-line bg-pos-surface/60 p-4">
            <span className="text-[12px] font-medium text-pos-ink/60">Payees Mastered</span>
            <div className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-pos-ink">
              {smartBizResult.deducteesLoaded}
            </div>
          </div>
        </div>

        {smartBizResult.errors.length > 0 && (
          <div className="mt-6 rounded-2xl border border-[#dc2626]/20 bg-[#dc2626]/5 p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[#b91c1c]">
              <AlertCircle className="h-4 w-4" />
              <span>{smartBizResult.errors.length} files skipped or require attention</span>
            </div>
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-pos-ink/75">
              {smartBizResult.errors.map((e, idx) => (
                <li key={idx} className="flex justify-between gap-4 font-mono">
                  <span className="truncate">{e.filename}</span>
                  <span className="text-[#b91c1c]">{e.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/clients" className="rounded-full bg-pos-accent px-5 py-2.5 text-[14px] font-medium text-white">
            Open Client Master
          </Link>
          <Link href="/tds" className="rounded-full border border-pos-line px-5 py-2.5 text-[14px] text-pos-ink hover:bg-pos-tint">
            Open TDS Workspace
          </Link>
          <button
            type="button"
            onClick={() => setSmartBizResult(null)}
            className="rounded-full border border-pos-line px-5 py-2.5 text-[14px] text-pos-ink/70 hover:bg-pos-tint"
          >
            Migrate More Files
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="pos-card mx-auto max-w-xl p-8">
        <CheckCircle2 className="h-8 w-8 text-[#22a356]" />
        <h1 className="mt-4 text-[22px] font-semibold text-pos-ink">Clients imported</h1>
        <ul className="mt-4 space-y-1.5 text-[14px] text-pos-ink/75">
          <li>{plural(result.entitiesCreated, 'new client')}{result.entitiesUpdated ? `, ${plural(result.entitiesUpdated, 'existing client')} updated` : ''}</li>
          <li>{plural(result.gstinsAdded, 'GSTIN')} and {plural(result.tansAdded, 'TAN')} added</li>
          <li>{plural(result.contactsAdded, 'contact')} and {plural(result.groupsCreated, 'new group')}</li>
        </ul>
        <p className="mt-4 text-[13px] text-pos-ink/55">Each change is in the audit trail. Assign staff to the new clients from Client Master.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/clients" className="rounded-full bg-pos-accent px-5 py-2.5 text-[14px] font-medium text-white">Open Client Master</Link>
          <button type="button" onClick={() => { setResult(null); setRows([]); setText(''); }} className="rounded-full border border-pos-line px-5 py-2.5 text-[14px] text-pos-ink">
            Import more
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/clients" className="inline-flex items-center gap-1.5 text-[13px] text-pos-ink/55 hover:text-pos-accent">
            <ArrowLeft className="h-4 w-4" /> Client Master
          </Link>
          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Import clients</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-pos-ink/60">
            Bring your client list from any software or Excel sheet. Every row is checked before anything is saved.
          </p>
        </div>
      </div>

      <div className="pos-card p-5">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Import source">
          {([
            ['paste', 'Paste from Excel', ClipboardPaste],
            ['file', 'Upload CSV', FileUp],
            ['gstins', 'Paste GSTINs', ListChecks],
            ['smartbiz', 'SmartBiz Migrator', Layers],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={source === id}
              onClick={() => setSource(id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] transition-colors ${
                source === id ? 'bg-pos-accent text-white' : 'border border-pos-line text-pos-ink/70 hover:bg-pos-tint'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {source === 'smartbiz' ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-pos-accent/30 bg-pos-accent/5 p-4 text-[13.5px] text-pos-ink/80">
              <div className="font-semibold text-pos-accent">60-Second SmartBiz Legacy Migrator</div>
              <p className="mt-1">
                Drop raw SmartBiz exports, TRACES CONSO files, or Protean .txt return files. SynexTax automatically discovers the client PAN, infers constitution, registers the TAN, and imports all past returns, challans, and payee directories in one pass.
              </p>
            </div>

            {busy && smartBizProgress ? (
              <div className="flex flex-col items-center justify-center rounded-[16px] border border-pos-line bg-pos-surface/50 p-8 text-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-pos-accent border-t-transparent" />
                <p className="mt-3 text-[14px] font-medium text-pos-ink">
                  Migrating file {smartBizProgress.current} of {smartBizProgress.total}
                </p>
                <p className="mt-1 font-mono text-[12.5px] text-pos-ink/60">
                  {smartBizProgress.filename}
                </p>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-pos-line px-6 py-10 text-center text-[14px] text-pos-ink/60 hover:border-pos-accent">
                <Layers className="h-7 w-7 text-pos-accent" />
                <span className="font-medium text-pos-ink">Drop SmartBiz or past return files here, or click to browse</span>
                <span className="text-[12.5px] text-pos-ink/60">Supports multiple .txt, .conso, or .tds files at once (up to 5 MB per file)</span>
                <input
                  type="file"
                  multiple
                  accept=".txt,.conso,.tds,text/plain"
                  className="sr-only"
                  onChange={(e) => e.target.files && onSmartBizFiles(e.target.files)}
                />
              </label>
            )}
          </div>
        ) : source === 'file' ? (
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-pos-line px-6 py-10 text-center text-[14px] text-pos-ink/60 hover:border-pos-accent">
            <Upload className="h-6 w-6" />
            Choose a CSV file (up to 5 MB)
            <input type="file" accept=".csv,.txt,.tsv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        ) : (
          <div className="mt-4">
            <label htmlFor="import-text" className="sr-only">{source === 'gstins' ? 'GSTINs' : 'Rows copied from Excel'}</label>
            <textarea
              id="import-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              spellCheck={false}
              placeholder={
                source === 'gstins'
                  ? 'Paste up to 500 GSTINs, separated by lines, commas or spaces.'
                  : 'In Excel, select the client list including its header row, copy, and paste here.'
              }
              className="w-full resize-y rounded-[16px] border border-pos-line bg-pos-surface px-4 py-3 font-mono text-[12.5px] text-pos-ink outline-none focus:border-pos-accent"
            />
            <button
              type="button"
              disabled={!text.trim()}
              onClick={() => load(text, source)}
              className="mt-3 rounded-full bg-pos-accent px-5 py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
            >
              Check rows
            </button>
          </div>
        )}
        {message && <p role="status" className="mt-3 text-[13.5px] text-[#b45309]">{message}</p>}
      </div>

      {table && columns.length > 0 && (
        <div className="pos-card p-5">
          <h2 className="text-[15px] font-semibold text-pos-ink">Columns</h2>
          <p className="mt-1 text-[13px] text-pos-ink/55">Header found on line {headerIndex + 1}. Change any column that was read wrongly.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {table[headerIndex].map((h, i) => (
              <label key={i} className="flex items-center gap-2 rounded-full border border-pos-line px-3 py-1.5 text-[12.5px]">
                <span className="max-w-[10rem] truncate text-pos-ink/70">{h || `Column ${i + 1}`}</span>
                <select
                  value={columns[i] ?? ''}
                  onChange={(e) => remap(i, (e.target.value || null) as ImportField | null)}
                  className="bg-transparent text-pos-accent outline-none"
                  aria-label={`Field for column ${h || i + 1}`}
                >
                  <option value="">Ignore</option>
                  {FIELD_OPTIONS.map(([f, label]) => <option key={f} value={f}>{label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {validated.length > 0 && (
        <div className="pos-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-line p-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter rows">
              {(['ALL', 'RED', 'AMBER', 'GREEN'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`rounded-full px-3.5 py-1.5 text-[12.5px] ${filter === f ? 'bg-pos-ink text-pos-surface' : 'border border-pos-line text-pos-ink/70'}`}
                >
                  {f === 'ALL' ? `All ${validated.length}` : `${chipLabel[f]} ${counts[f]}`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[12.5px] text-pos-ink/60">
                Group for rows without one
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-40 rounded-full border border-pos-line bg-transparent px-3 py-1.5 text-pos-ink outline-none focus:border-pos-accent" />
              </label>
              <button
                type="button"
                disabled={busy || counts.GREEN + counts.AMBER === 0}
                onClick={commit}
                className="rounded-full bg-[#22a356] px-5 py-2 text-[13.5px] font-medium text-white disabled:opacity-40"
              >
                {busy ? 'Saving' : `Save ${counts.GREEN + counts.AMBER} clients${counts.RED ? `, skip ${counts.RED} to fix` : ''}`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[12.5px]">
              <thead className="bg-[#141416] text-white">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Line</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  {EDITABLE.map((f) => <th key={f} className="px-3 py-2.5 font-medium">{IMPORT_FIELD_LABELS[f]}</th>)}
                  <th className="px-3 py-2.5 font-medium">What changed or needs fixing</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const errFields = new Set(r.issues.filter((i) => i.level === 'error').map((i) => i.field));
                  return (
                    <tr key={r.index} className="border-b border-pos-line align-top">
                      <td className="px-3 py-2 tabular-nums text-pos-ink/60">{r.sourceLine}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${chip[r.status]}`}>{chipLabel[r.status]}</span></td>
                      {EDITABLE.map((f) => (
                        <td key={f} className="px-1.5 py-1">
                          <input
                            aria-label={`${IMPORT_FIELD_LABELS[f]}, line ${r.sourceLine}`}
                            value={rows[r.index].raw[f] ?? (f === 'pan' ? r.record.pan : '')}
                            onChange={(e) => edit(r.index, f, e.target.value)}
                            className={`w-full min-w-[7rem] rounded-md border bg-transparent px-2 py-1 outline-none focus:border-pos-accent ${
                              errFields.has(f) ? 'border-[#dc2626]/60 bg-[#dc2626]/5' : 'border-transparent hover:border-pos-line'
                            } ${['pan', 'gstins', 'tan'].includes(f) ? 'ident font-mono' : ''}`}
                          />
                        </td>
                      ))}
                      <td className="max-w-[22rem] px-3 py-2 text-pos-ink/65">
                        {r.issues.map((i, k) => (
                          <div key={k} className={i.level === 'error' ? 'text-[#b91c1c]' : ''}>{i.message}</div>
                        ))}
                        {r.record.pan && !r.issues.length && <span className="text-pos-ink/60">PAN {maskPan(r.record.pan)}</span>}
                      </td>
                      <td className="px-2 py-2">
                        <button type="button" aria-label={`Remove line ${r.sourceLine}`} onClick={() => setRows((p) => p.filter((_, i) => i !== r.index))} className="rounded p-1 text-pos-ink/60 hover:text-[#dc2626]">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
