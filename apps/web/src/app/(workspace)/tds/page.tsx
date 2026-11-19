'use client';

import { useState } from 'react';
import {
  Percent,
  Calculator,
  UploadCloud,
  FileCheck2,
  AlertCircle,
  Building2,
  User,
  ShieldCheck,
  Check,
  Plus,
  Trash2,
} from 'lucide-react';

interface SectionAllocation {
  id: string;
  sectionCode: string;
  description: string;
  incomeTax: string;
  surcharge: string;
  cess: string;
  totalSectionAmount: string;
}

const SECTION_OPTIONS = [
  { code: '194C', label: '194C: Contractors & Subcontractors (1% Indiv / 2% Co)' },
  { code: '194J', label: '194J: Professional & Technical Fees (10% / 2%)' },
  { code: '194Q', label: '194Q: Purchase of Goods exceeding Rs 50 Lakhs (0.1%)' },
  { code: '194H', label: '194H: Commission or Brokerage (5%)' },
  { code: '194I', label: '194I: Rent on Land/Building/Plant (10% / 2%)' },
  { code: '192', label: '192: Salaries' },
];

export default function TdsPage() {
  const [statutoryRegime, setStatutoryRegime] = useState<'IT_ACT_2025' | 'IT_ACT_1961'>('IT_ACT_2025');
  const [tan, setTan] = useState<string>('PTKV01234D');
  const [quarter, setQuarter] = useState<string>('Q3');
  const [financialYear, setFinancialYear] = useState<string>('2025-26');

  // Interactive Live Deductee Calculator state
  const [calcPan, setCalcPan] = useState<string>('AABCP1332L');
  const [calcSection, setCalcSection] = useState<string>('194J');
  const [calcAmount, setCalcAmount] = useState<string>('149994.70');
  const [calcRate, setCalcRate] = useState<string>('10.00');
  const [delayMonths, setDelayMonths] = useState<number>(1);

  // Multi-section challan allocations
  const [allocations, setAllocations] = useState<SectionAllocation[]>([
    {
      id: 'sec-1',
      sectionCode: '194C',
      description: 'Contractors & Subcontractors',
      incomeTax: '25000.00',
      surcharge: '0.00',
      cess: '0.00',
      totalSectionAmount: '25000.00',
    },
    {
      id: 'sec-2',
      sectionCode: '194J',
      description: 'Professional & Technical Fees',
      incomeTax: '50000.00',
      surcharge: '0.00',
      cess: '0.00',
      totalSectionAmount: '50000.00',
    },
  ]);

  // Challan metadata
  const [challanNo, setChallanNo] = useState<string>('00412');
  const [bsrCode, setBsrCode] = useState<string>('0510304');
  const [depositDate, setDepositDate] = useState<string>('2025-11-07');
  const [majorHead, setMajorHead] = useState<'0020' | '0021'>('0020');

  // Deductee PAN validation
  const fourthChar = calcPan.trim().toUpperCase()[3] || '';
  const isCompany = fourthChar === 'C';
  const autoMajorHead = isCompany ? '0020' : '0021';
  const isProteanLiteral = ['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID'].includes(calcPan.trim().toUpperCase());
  const effectiveRate = !isProteanLiteral && calcPan.length !== 10 ? '20.00' : calcRate;

  // Real-time Section 516 IT Act 2025 calculation
  const rawBase = parseFloat(calcAmount) || 0;
  const rawTds = (rawBase * parseFloat(effectiveRate)) / 100;
  // Step 1: Drop paise completely
  const truncatedRupees = Math.floor(rawTds);
  // Step 2: Round to nearest Rs 10
  const unitsDigit = truncatedRupees % 10;
  const roundedTdsSection516 =
    unitsDigit >= 5 ? truncatedRupees + (10 - unitsDigit) : truncatedRupees - unitsDigit;

  // Rule 269 Interest Base calculation: Truncate down to nearest Rs 100
  const interestBaseRule269 = Math.floor(roundedTdsSection516 / 100) * 100;
  const statutoryInterest = delayMonths > 0 ? interestBaseRule269 * 0.015 * delayMonths : 0;
  const totalPayableWithInterest = roundedTdsSection516 + statutoryInterest;

  // Sum total section allocations
  const totalAllocatedTax = allocations.reduce(
    (sum, a) => sum + (parseFloat(a.totalSectionAmount) || 0),
    0
  );

  const addSectionAllocation = () => {
    if (statutoryRegime === 'IT_ACT_1961' && allocations.length >= 1) {
      alert('ITNS 281 (1961 Act) is restricted to exactly 1 section code per challan.');
      return;
    }
    if (allocations.length >= 20) {
      alert('ITNS 281N (2025 Act) allows a maximum of 20 section allocations.');
      return;
    }

    const nextId = 'sec-' + (allocations.length + 1);
    setAllocations([
      ...allocations,
      {
        id: nextId,
        sectionCode: '194Q',
        description: 'Purchase of Goods',
        incomeTax: '10000.00',
        surcharge: '0.00',
        cess: '0.00',
        totalSectionAmount: '10000.00',
      },
    ]);
  };

  const removeSection = (id: string) => {
    if (allocations.length <= 1) return;
    setAllocations(allocations.filter((a) => a.id !== id));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Metadata Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-pos-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-pos-accent">
            <Percent className="w-4 h-4" />
            <span>Dual-Act TDS / TCS Processing Hub (1961 vs 2025 ITNS 281N)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-pos-ink tracking-tight mt-1">
            Challan Allocation & Deductee Compliance Engine
          </h1>
        </div>

        {/* Dual-Act Regime Switcher Toggle */}
        <div className="flex items-center p-1 rounded-lg bg-pos-muted border border-pos-line text-xs font-semibold">
          <button
            onClick={() => setStatutoryRegime('IT_ACT_2025')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
              statutoryRegime === 'IT_ACT_2025'
                ? 'bg-pos-accent text-white font-bold shadow-sm'
                : 'text-pos-ink/60 hover:text-pos-ink'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>IT Act 2025 (ITNS 281N: 20 Sections)</span>
          </button>
          <button
            onClick={() => {
              setStatutoryRegime('IT_ACT_1961');
              if (allocations.length > 1) {
                setAllocations([allocations[0]]);
              }
            }}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
              statutoryRegime === 'IT_ACT_1961'
                ? 'bg-pos-accent text-white font-bold shadow-sm'
                : 'text-pos-ink/60 hover:text-pos-ink'
            }`}
          >
            <span>IT Act 1961 (ITNS 281: 1 Section)</span>
          </button>
        </div>
      </div>

      {/* Grid: Left Column Deductee Calculator, Right Column ITNS 281N Challan Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Live Statutory TDS & Rule 269 Calculator (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-pos-muted border border-pos-line rounded-xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-pos-accent" />
                <h2 className="font-bold text-sm text-pos-ink">Statutory TDS Calculator</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pos-surface border border-pos-line text-pos-accent font-bold">
                Section 516 Compliant
              </span>
            </div>

            {/* Deductee PAN Input */}
            <div className="space-y-1.5">
              <label className="text-xs text-pos-ink/60 font-semibold flex items-center justify-between">
                <span>Deductee PAN / Literal</span>
                <span className="text-[10px] text-pos-ink/50">4th Char identifies constitution</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={10}
                  value={calcPan}
                  onChange={(e) => setCalcPan(e.target.value.toUpperCase())}
                  placeholder="e.g. AABCP1332L"
                  className="flex-1 bg-pos-surface border border-pos-line rounded-md px-3 py-2 text-xs font-mono font-bold text-pos-ink uppercase focus:outline-none focus:border-pos-accent"
                />
                <button
                  type="button"
                  onClick={() => setCalcPan('PANNOTAVBL')}
                  className="px-2.5 py-1 rounded bg-pos-muted hover:bg-pos-muted text-[10px] font-mono text-pos-ink/80 font-semibold"
                >
                  No PAN
                </button>
              </div>

              {/* PAN Validation Feedback */}
              <div className="flex items-center gap-2 text-[11px] font-mono pt-1">
                {isCompany ? (
                  <span className="inline-flex items-center gap-1 text-[#3A6FE8]">
                    <Building2 className="w-3 h-3" />
                    <span>Company Assessee (Major Head 0020)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-pos-accent">
                    <User className="w-3 h-3" />
                    <span>Non-Company Assessee (Major Head 0021)</span>
                  </span>
                )}
                {isProteanLiteral && (
                  <span className="text-[#C2410C] font-semibold">[Section 206AA: 20% Penal Rate]</span>
                )}
              </div>
            </div>

            {/* Section Code & Payment Amount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-pos-ink/60 font-semibold">TDS Section</label>
                <select
                  value={calcSection}
                  onChange={(e) => setCalcSection(e.target.value)}
                  className="w-full bg-pos-surface border border-pos-line rounded-md px-3 py-2 text-xs font-mono text-pos-ink focus:outline-none focus:border-pos-accent"
                >
                  {SECTION_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-pos-ink/60 font-semibold">TDS Rate (%)</label>
                <input
                  type="text"
                  value={effectiveRate}
                  onChange={(e) => setCalcRate(e.target.value)}
                  disabled={isProteanLiteral}
                  className="w-full bg-pos-surface border border-pos-line rounded-md px-3 py-2 text-xs font-mono font-bold text-pos-ink focus:outline-none focus:border-pos-accent disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-pos-ink/60 font-semibold">Gross Payment Amount (₹)</label>
              <input
                type="text"
                value={calcAmount}
                onChange={(e) => setCalcAmount(e.target.value)}
                placeholder="149994.70"
                className="w-full bg-pos-surface border border-pos-line rounded-md px-3 py-2 text-xs font-mono font-bold text-pos-ink focus:outline-none focus:border-pos-accent"
              />
            </div>

            {/* Delay in Deposit for Rule 269 Interest */}
            <div className="space-y-1.5">
              <label className="text-xs text-pos-ink/60 font-semibold flex items-center justify-between">
                <span>Delay in Deposit (Months)</span>
                <span className="text-[10px] text-pos-ink/50">Sec 201(1A): 1.5% per month</span>
              </label>
              <input
                type="number"
                min={0}
                max={24}
                value={delayMonths}
                onChange={(e) => setDelayMonths(parseInt(e.target.value) || 0)}
                className="w-full bg-pos-surface border border-pos-line rounded-md px-3 py-2 text-xs font-mono font-bold text-pos-ink focus:outline-none focus:border-pos-accent"
              />
            </div>

            {/* Statutory Calculation Breakdown Box */}
            <div className="bg-pos-surface border border-pos-line rounded-lg p-3.5 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-pos-ink/60">
                <span>Raw TDS (Unrounded):</span>
                <span>₹{rawTds.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-pos-ink/80">
                <span>Step 1 Truncated Paise:</span>
                <span>₹{truncatedRupees}.00</span>
              </div>
              <div className="flex justify-between text-pos-accent font-bold border-t border-pos-line pt-2">
                <span>Section 516 Statutory TDS:</span>
                <span>₹{roundedTdsSection516.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-pos-ink/60">
                <span>Rule 269 Interest Base:</span>
                <span>₹{interestBaseRule269.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#C2410C]">
                <span>Rule 269 Interest (1.5%/mo):</span>
                <span>₹{statutoryInterest.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-pos-ink font-extrabold border-t border-pos-line pt-2 text-sm">
                <span>Total Tax & Interest Payable:</span>
                <span>₹{totalPayableWithInterest.toFixed(2)}</span>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Multi-Section ITNS 281N Challan Builder (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-pos-muted border border-pos-line rounded-xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div>
                <h2 className="font-bold text-sm text-pos-ink">
                  {statutoryRegime === 'IT_ACT_2025'
                    ? 'ITNS 281N Multi-Section Challan Builder'
                    : 'ITNS 281 Single-Section Challan'}
                </h2>
                <p className="text-[11px] text-pos-ink/60">
                  {statutoryRegime === 'IT_ACT_2025'
                    ? 'Income-tax Act, 2025: Allocate up to 20 tax sections in a single payment challan.'
                    : 'Income-tax Act, 1961: Exactly 1 section code allowed per physical/OLTAS challan.'}
                </p>
              </div>

              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-pos-surface border border-pos-line text-[#3A6FE8]">
                TAN: {tan}
              </span>
            </div>

            {/* Challan Metadata Fields */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-pos-ink/60">Challan No</span>
                <input
                  type="text"
                  value={challanNo}
                  onChange={(e) => setChallanNo(e.target.value)}
                  className="w-full bg-pos-surface border border-pos-line rounded px-2.5 py-1.5 text-pos-ink font-bold"
                />
              </div>

              <div className="space-y-1">
                <span className="text-pos-ink/60">BSR Code</span>
                <input
                  type="text"
                  maxLength={7}
                  value={bsrCode}
                  onChange={(e) => setBsrCode(e.target.value)}
                  className="w-full bg-pos-surface border border-pos-line rounded px-2.5 py-1.5 text-pos-ink font-bold"
                />
              </div>

              <div className="space-y-1">
                <span className="text-pos-ink/60">Deposit Date</span>
                <input
                  type="date"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                  className="w-full bg-pos-surface border border-pos-line rounded px-2.5 py-1.5 text-pos-ink font-bold"
                />
              </div>

              <div className="space-y-1">
                <span className="text-pos-ink/60">Major Head</span>
                <select
                  value={majorHead}
                  onChange={(e) => setMajorHead(e.target.value as any)}
                  className="w-full bg-pos-surface border border-pos-line rounded px-2.5 py-1.5 text-pos-ink font-bold"
                >
                  <option value="0020">0020 (Company)</option>
                  <option value="0021">0021 (Non-Company)</option>
                </select>
              </div>
            </div>

            {/* Section Breakdown Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-pos-ink/80">
                  Section Allocations ({allocations.length}{statutoryRegime === 'IT_ACT_2025' ? '/20' : '/1'})
                </span>
                {statutoryRegime === 'IT_ACT_2025' && allocations.length < 20 && (
                  <button
                    type="button"
                    onClick={addSectionAllocation}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-pos-accent hover:text-pos-accent bg-pos-tint hover:bg-pos-tint px-2.5 py-1 rounded border border-pos-accent/30 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Section</span>
                  </button>
                )}
              </div>

              <div className="border border-pos-line rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-pos-surface text-pos-ink/60 font-mono text-[11px] border-b border-pos-line">
                      <th className="py-2.5 px-3">Section</th>
                      <th className="py-2.5 px-3 text-right">Income Tax (₹)</th>
                      <th className="py-2.5 px-3 text-right">Surcharge/Cess (₹)</th>
                      <th className="py-2.5 px-3 text-right">Total (₹)</th>
                      <th className="py-2.5 px-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pos-line font-mono">
                    {allocations.map((alloc, idx) => (
                      <tr key={alloc.id} className="hover:bg-pos-tint">
                        <td className="py-2.5 px-3">
                          <select
                            value={alloc.sectionCode}
                            onChange={(e) => {
                              const newSec = e.target.value;
                              setAllocations(
                                allocations.map((a) =>
                                  a.id === alloc.id ? { ...a, sectionCode: newSec } : a
                                )
                              );
                            }}
                            className="bg-pos-surface border border-pos-line rounded px-2 py-1 text-xs text-pos-ink"
                          >
                            {SECTION_OPTIONS.map((o) => (
                              <option key={o.code} value={o.code}>
                                {o.code}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="text"
                            value={alloc.incomeTax}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAllocations(
                                allocations.map((a) =>
                                  a.id === alloc.id
                                    ? { ...a, incomeTax: val, totalSectionAmount: val }
                                    : a
                                )
                              );
                            }}
                            className="bg-pos-surface border border-pos-line rounded px-2 py-1 text-right text-xs text-pos-ink font-bold w-24"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right text-pos-ink/60">₹0.00</td>
                        <td className="py-2.5 px-3 text-right font-bold text-pos-accent">
                          ₹{parseFloat(alloc.totalSectionAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {allocations.length > 1 && (
                            <button
                              onClick={() => removeSection(alloc.id)}
                              className="text-pos-ink/50 hover:text-pos-red p-1 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Challan Total & CSI Match Action Footer */}
            <div className="bg-pos-surface border border-pos-line rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
              <div>
                <span className="text-pos-ink/60">Total Challan Amount: </span>
                <span className="text-pos-ink font-extrabold text-sm">
                  ₹{totalAllocatedTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-pos-accent ml-2">({allocations.length} Section lines)</span>
              </div>

              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-lg bg-pos-muted hover:bg-pos-muted text-pos-ink font-bold transition-colors flex items-center gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5 text-[#3A6FE8]" />
                  <span>Match NSDL CSI File</span>
                </button>
                <button className="px-3.5 py-1.5 rounded-lg bg-pos-accent hover:bg-pos-accent-deep text-white font-bold transition-all shadow-[0_6px_14px_-6px_rgba(47,138,224,0.8)] flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Prepare FVU File</span>
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
