'use client';

import React, { useState } from 'react';
import { Globe, ShieldCheck, AlertCircle, Download, FileText, CheckCircle2 } from 'lucide-react';
import {
  assessForeignRemittance15CaCb,
  DTAA_REGISTRY,
  type RemittanceNature,
  type RemittanceInput,
} from '@synextax/tax-engine';

export function Remittance15CaCbPanel() {
  const [country, setCountry] = useState('SG');
  const [nature, setNature] = useState<RemittanceNature>('ROYALTY');
  const [foreignAmount, setForeignAmount] = useState('25000');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('86.50');
  const [hasTrc, setHasTrc] = useState(true);
  const [hasForm10F, setHasForm10F] = useState(true);
  const [hasPe, setHasPe] = useState(false);
  const [udin, setUdin] = useState('26051234AAAAAA1234');

  const input: RemittanceInput = {
    remitter: {
      name: 'Amritsar Silk Mills Pvt Ltd',
      pan: 'AABCA1234F',
      tan: 'AMRG04217D',
      status: 'COMPANY',
      address: { line1: 'GT Road', city: 'Amritsar', stateCode: '03', pin: '143001' },
      email: 'accounts@amritsarsilk.com',
      phone: '9876543210',
    },
    beneficiary: {
      name: 'Pacific Software Infrastructure Pte Ltd',
      countryCode: country,
      foreignTaxId: 'T19LL8821B',
      address: { line1: '71 Robinson Road', city: 'Singapore', country: 'Singapore' },
      hasPeInIndia: hasPe,
      hasTrc,
      hasForm10F,
    },
    nature,
    currency,
    foreignAmount: Number(foreignAmount) || 0,
    exchangeRateInr: Number(exchangeRate) || 0,
    proposedDate: new Date().toISOString().slice(0, 10),
    aggregateRemittanceThisFyInr: 1200000,
    caDetails: {
      caName: 'CA Amrinder Verma, FCA',
      membershipNumber: '051234',
      firmRegNumber: '014289N',
      udin,
    },
  };

  const assessment = assessForeignRemittance15CaCb(input);

  const download15Cb = () => {
    const blob = new Blob([JSON.stringify(assessment, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Form15CB_${input.remitter.pan}_${country}_${nature}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-pos-line bg-pos-surface p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-pos-accent/15 text-pos-accent">
              <Globe className="h-4 w-4" />
            </span>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-pos-ink">
              Foreign Remittance 15CA & 15CB Cockpit
            </h2>
          </div>
          <p className="mt-1 text-[13px] text-pos-ink/70">
            Automated Section 195 taxability assessment, DTAA treaty relief under Section 90(2), and Form 15CB CA certification.
          </p>
        </div>
        <button
          type="button"
          onClick={download15Cb}
          className="flex h-10 items-center gap-2 rounded-full bg-pos-accent px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Download className="h-4 w-4" /> Download Form 15CA/CB Package
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Input Form */}
        <div className="space-y-4 rounded-[16px] border border-pos-line bg-pos-surface p-5">
          <h3 className="text-[14px] font-semibold text-pos-ink">1. Remittance Parameters</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[12px] font-medium text-pos-ink/75">Beneficiary Country (DTAA)</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1 h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] font-medium text-pos-ink outline-none"
              >
                {Object.values(DTAA_REGISTRY).map((c) => (
                  <option key={c.countryCode} value={c.countryCode}>
                    {c.countryName} ({c.countryCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[12px] font-medium text-pos-ink/75">Nature of Remittance</label>
              <select
                value={nature}
                onChange={(e) => setNature(e.target.value as RemittanceNature)}
                className="mt-1 h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] font-medium text-pos-ink outline-none"
              >
                <option value="ROYALTY">Royalty (Software / IP License)</option>
                <option value="FTS">Fees for Technical Services (FTS)</option>
                <option value="INTEREST">Interest on Foreign Loan</option>
                <option value="DIVIDEND">Dividend to Non-Resident</option>
                <option value="COMMISSION">Overseas Commission (No Indian PE)</option>
                <option value="IMPORT_OF_GOODS">Import of Goods (Exempt)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-[12px] font-medium text-pos-ink/75">Currency</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="mt-1 h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-pos-ink/75">Foreign Amount</label>
              <input
                type="text"
                value={foreignAmount}
                onChange={(e) => setForeignAmount(e.target.value)}
                className="mt-1 h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-pos-ink/75">Exchange Rate (INR)</label>
              <input
                type="text"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className="mt-1 h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink"
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-pos-line pt-3">
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-pos-ink/60">
              Statutory Documentation Verification
            </h4>
            <div className="grid gap-2 text-[13px] sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hasTrc}
                  onChange={(e) => setHasTrc(e.target.checked)}
                  className="rounded"
                />
                <span className="text-pos-ink/80">Valid TRC under Section 90(4)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hasForm10F}
                  onChange={(e) => setHasForm10F(e.target.checked)}
                  className="rounded"
                />
                <span className="text-pos-ink/80">Electronic Form 10F Filed</span>
              </label>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={hasPe}
                  onChange={(e) => setHasPe(e.target.checked)}
                  className="rounded"
                />
                <span className="text-pos-ink/80">Beneficiary has Permanent Establishment (PE) in India</span>
              </label>
            </div>
          </div>

          <div className="border-t border-pos-line pt-3">
            <label className="text-[12px] font-medium text-pos-ink/75">Chartered Accountant UDIN</label>
            <input
              type="text"
              value={udin}
              onChange={(e) => setUdin(e.target.value)}
              className="mt-1 h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink"
            />
          </div>
        </div>

        {/* Right: Assessment & Certificate */}
        <div className="space-y-4 rounded-[16px] border border-pos-line bg-pos-surface p-5">
          <h3 className="text-[14px] font-semibold text-pos-ink">2. Statutory Assessment & Withholding</h3>

          <div className="flex items-center justify-between rounded-[12px] bg-pos-muted/60 p-3.5">
            <div>
              <span className="text-[11px] font-semibold uppercase text-pos-ink/50">Form 15CA Requirement</span>
              <p className="text-[16px] font-bold text-pos-accent">{assessment.form15CaPart}</p>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-semibold uppercase text-pos-ink/50">Form 15CB CA Certificate</span>
              <p className={`text-[14px] font-bold ${assessment.isForm15CbRequired ? 'text-[#15803d]' : 'text-pos-ink/70'}`}>
                {assessment.isForm15CbRequired ? 'Mandatory (Required)' : 'Not Required'}
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-[12px] border border-pos-line p-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-pos-ink/65">Gross Remittance Value:</span>
              <span className="font-mono font-semibold text-pos-ink">
                {assessment.amounts.foreignCurrency} {Number(assessment.amounts.foreignAmount).toLocaleString('en-IN')} (INR {Number(assessment.amounts.totalAmountInr).toLocaleString('en-IN')})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-pos-ink/65">Tax Determination Basis:</span>
              <span className="font-semibold text-pos-ink">
                {assessment.taxDetermination.rateBasis} ({assessment.taxDetermination.finalApplicableRate}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-pos-ink/65">DTAA Article Applied:</span>
              <span className="font-mono text-pos-ink/80">{assessment.taxDetermination.dtaaArticle}</span>
            </div>
            <div className="flex justify-between border-t border-pos-line pt-2 text-[14px]">
              <span className="font-semibold text-pos-ink">TDS to Deduct:</span>
              <span className="font-mono font-bold text-red-600">
                INR {Number(assessment.amounts.grossTdsInr).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="font-semibold text-pos-ink">Net Amount Payable to Vendor:</span>
              <span className="font-mono font-bold text-[#15803d]">
                INR {Number(assessment.amounts.netPayableInr).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {assessment.form15CbCertificate && (
            <div className="rounded-[12px] bg-pos-surface border border-pos-line p-3 text-[12px]">
              <div className="flex items-center gap-1.5 font-semibold text-[#15803d]">
                <ShieldCheck className="h-4 w-4" /> Form 15CB Certificate Generated
              </div>
              <div className="mt-2 space-y-1 text-pos-ink/70">
                <p>Certificate No: <span className="font-mono text-pos-ink">{assessment.form15CbCertificate.certificateNumber}</span></p>
                <p>UDIN: <span className="font-mono text-pos-ink">{assessment.form15CbCertificate.udin}</span></p>
                <p>Signatory: <span className="font-medium text-pos-ink">{assessment.form15CbCertificate.certifyingCharteredAccountant.caName}</span> ({assessment.form15CbCertificate.certifyingCharteredAccountant.membershipNumber})</p>
              </div>
            </div>
          )}

          {assessment.auditAlerts.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {assessment.auditAlerts.map((alert, k) => (
                <div key={k} className="flex items-start gap-2 rounded-[10px] bg-amber-500/10 p-2.5 text-[12px] text-amber-900 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <span className="font-semibold">{alert.reference}: </span>
                    {alert.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
