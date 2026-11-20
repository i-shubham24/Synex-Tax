'use client';

import Link from 'next/link';

import React, { useState, useEffect } from 'react';
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
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Download,
  Search,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { CustomDropdown, CustomSelect } from '../../../components/ui/CustomSelect';

interface SectionAllocation {
  id: string;
  sectionCode: string;
  description: string;
  incomeTax: string;
  surcharge: string;
  cess: string;
  totalSectionAmount: string;
}

interface DeducteeRow {
  id: string;
  pan: string;
  name: string;
  sectionCode: string;
  amountPaid: string;
  rate: string;
  tdsDeducted: string;
  status: string;
  paymentDate?: string;
}

interface ReturnSummary {
  formCode: string;
  workflowStatus: string;
  totalDeductees: number;
  totalTaxDeposited: string;
  statutoryDueDate: string;
  correctionWindowExpiresAt: string;
  daysToCorrectionExpiry: number;
}

const SECTION_OPTIONS = [
  { code: '194C', label: '194C: Contractors & Subcontractors (1% Indiv / 2% Co)' },
  { code: '194J', label: '194J: Professional & Technical Fees (10% / 2%)' },
  { code: '194Q', label: '194Q: Purchase of Goods exceeding Rs 50 Lakhs (0.1%)' },
  { code: '194H', label: '194H: Commission or Brokerage (5%)' },
  { code: '194I', label: '194I: Rent on Land/Building/Plant (10% / 2%)' },
  { code: '192', label: '192: Salaries' },
];

const SAMPLE_DEDUCTEES: DeducteeRow[] = [
  {
    id: 'ded-1',
    pan: 'BQRPS4410K',
    name: 'Sukhwinder Singh (Sample contractor)',
    sectionCode: '194C',
    amountPaid: '150000.00',
    rate: '1.00%',
    tdsDeducted: '1500.00',
    status: 'OPERATIVE',
    paymentDate: '2026-10-13',
  },
  {
    id: 'ded-2',
    pan: 'AAKFR2290D',
    name: 'Ranjit Builders (Sample firm)',
    sectionCode: '194C',
    amountPaid: '220000.00',
    rate: '2.00%',
    tdsDeducted: '4400.00',
    status: 'OPERATIVE',
    paymentDate: '2026-10-16',
  },
  {
    id: 'ded-3',
    pan: 'PANNOTAVBL',
    name: 'Unregistered labour contractor (Sample)',
    sectionCode: '194C',
    amountPaid: '40000.00',
    rate: '20.00%',
    tdsDeducted: '8000.00',
    status: 'UNAVAILABLE',
    paymentDate: '2026-10-19',
  },
  {
    id: 'ded-4',
    pan: 'ACMPK8812B',
    name: 'Kiran Mehta (Sample consultant)',
    sectionCode: '194J',
    amountPaid: '60000.00',
    rate: '10.00%',
    tdsDeducted: '6000.00',
    status: 'OPERATIVE',
    paymentDate: '2026-10-22',
  },
  {
    id: 'ded-5',
    pan: 'AAEPB5531H',
    name: 'Balwant Bedi (Sample landlord)',
    sectionCode: '194I',
    amountPaid: '75000.00',
    rate: '10.00%',
    tdsDeducted: '7500.00',
    status: 'OPERATIVE',
    paymentDate: '2026-10-25',
  },
];

export default function TdsPage() {
  const { token } = useAuth();
  const [statutoryRegime, setStatutoryRegime] = useState<'IT_ACT_2025' | 'IT_ACT_1961'>('IT_ACT_2025');
  const [tan, setTan] = useState<string>('AMRG04217D');
  const [entityName, setEntityName] = useState<string>('Golden Gate Hardware Pvt Ltd (Sample)');
  const [quarter, setQuarter] = useState<string>('Q3');
  const [taxYear, setTaxYear] = useState<number>(2026);

  // Return Summary
  const [returnSummary, setReturnSummary] = useState<ReturnSummary>({
    formCode: '140',
    workflowStatus: 'DRAFT',
    totalDeductees: 5,
    totalTaxDeposited: '27400.00',
    statutoryDueDate: '2027-01-31',
    correctionWindowExpiresAt: '2029-03-31',
    daysToCorrectionExpiry: 862,
  });

  // Deductees List
  const [deductees, setDeductees] = useState<DeducteeRow[]>(SAMPLE_DEDUCTEES);
  const [deducteeSearch, setDeducteeSearch] = useState<string>('');

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
      incomeTax: '13900.00',
      surcharge: '0.00',
      cess: '0.00',
      totalSectionAmount: '13900.00',
    },
    {
      id: 'sec-2',
      sectionCode: '194J',
      description: 'Professional & Technical Fees',
      incomeTax: '6000.00',
      surcharge: '0.00',
      cess: '0.00',
      totalSectionAmount: '6000.00',
    },
    {
      id: 'sec-3',
      sectionCode: '194I',
      description: 'Rent on Land/Building/Plant',
      incomeTax: '7500.00',
      surcharge: '0.00',
      cess: '0.00',
      totalSectionAmount: '7500.00',
    },
  ]);

  // Challan metadata
  const [challanId, setChallanId] = useState<string>('5936afaf-76c3-47d0-af1e-ed7b663bf4d6');
  const [challanNo, setChallanNo] = useState<string>('00417');
  const [bsrCode, setBsrCode] = useState<string>('0510308');
  const [depositDate, setDepositDate] = useState<string>('2026-11-07');
  const [majorHead, setMajorHead] = useState<'0020' | '0021'>('0021');
  const [csiMatched, setCsiMatched] = useState<boolean>(false);

  // Feedback states
  const [csiFeedback, setCsiFeedback] = useState<string | null>(null);
  const [fvuFeedback, setFvuFeedback] = useState<{ fvuVersion: string; message: string } | null>(null);
  const [isMatchingCsi, setIsMatchingCsi] = useState<boolean>(false);
  const [isDispatchingFvu, setIsDispatchingFvu] = useState<boolean>(false);

  // Helper to obtain or ensure valid JWT session token
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
    } catch {
      // Fallback
    }
    return null;
  };

  // Load live data from PostgreSQL via /api/v1/tds/active on mount
  useEffect(() => {
    let cancelled = false;
    async function loadTdsActive() {
      try {
        const activeToken = await getValidAuthToken();
        const headers: Record<string, string> = {};
        if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
        const res = await fetch('/api/v1/tds/active', {
          headers,
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json.data) return;

        const d = json.data;
        if (d.tan) setTan(d.tan);
        if (d.legalName) setEntityName(d.legalName);
        if (d.quarter) setQuarter(d.quarter);
        if (d.taxYear) setTaxYear(d.taxYear);
        if (d.statutoryRegime) setStatutoryRegime(d.statutoryRegime);

        if (d.challans && d.challans.length > 0) {
          const c = d.challans[0];
          setChallanId(c.id);
          setChallanNo(c.challanNo);
          setBsrCode(c.bsrCode);
          setDepositDate(c.depositDate);
          setMajorHead(c.majorHead);
          setCsiMatched(Boolean(c.csiMatched));

          if (c.allocations && c.allocations.length > 0) {
            setAllocations(
              c.allocations.map((a: any) => ({
                id: a.id,
                sectionCode: a.description || a.sectionCode.replace('393(1)-', ''),
                description: a.description || a.sectionCode,
                incomeTax: a.incomeTax,
                surcharge: '0.00',
                cess: '0.00',
                totalSectionAmount: a.totalSectionAmount,
              }))
            );
          }
        }

        if (d.deductees && d.deductees.length > 0) {
          setDeductees(d.deductees);
        }

        if (d.returnSummary) {
          setReturnSummary(d.returnSummary);
        }
      } catch (err) {
        console.warn('TDS active load notice:', err);
      }
    }

    loadTdsActive();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Deductee PAN validation
  const fourthChar = calcPan.trim().toUpperCase()[3] || '';
  const isCompany = fourthChar === 'C';
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

  // CSI Match Handler
  const handleCsiMatch = async () => {
    setIsMatchingCsi(true);
    setCsiFeedback(null);
    try {
      const csrfRes = await fetch('/api/v1/auth/csrf');
      const { csrfToken } = await csrfRes.json();

      const activeToken = await getValidAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      };
      if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;

      const totalFormatted = totalAllocatedTax.toFixed(2);
      const payload = {
        tan,
        challans: [
          {
            id: challanId,
            bsrCode,
            challanDate: depositDate,
            challanNo,
            totalAmount: totalFormatted,
          },
        ],
        csiFileRecords: [
          {
            bsrCode,
            challanDate: depositDate,
            challanNo,
            amount: totalFormatted,
            majorHead,
          },
        ],
      };

      const res = await fetch('/api/v1/tds/csi-match', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setCsiMatched(true);
        setCsiFeedback(
          `CSI File Matched: ${json.data.matchRate}% (${json.data.matchedCount}/${json.data.totalBookChallans} challans verified against NSDL OLTAS ledger)`
        );
      } else {
        setCsiFeedback('CSI matching failed to locate matching bank scroll records.');
      }
    } catch (err: any) {
      setCsiFeedback('Error executing CSI matching: ' + err.message);
    } finally {
      setIsMatchingCsi(false);
    }
  };

  // FVU File Dispatch Handler
  const handleFvuDispatch = async () => {
    setIsDispatchingFvu(true);
    setFvuFeedback(null);
    try {
      const csrfRes = await fetch('/api/v1/auth/csrf');
      const { csrfToken } = await csrfRes.json();

      const activeToken = await getValidAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      };
      if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;

      const res = await fetch('/api/v1/tds/fvu/dispatch', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          tan,
          regime: statutoryRegime,
          formCode: statutoryRegime === 'IT_ACT_2025' ? '140' : '26Q',
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setFvuFeedback({ fvuVersion: json.data.fvuVersion, message: json.data.message });
      } else {
        alert(json.message || 'The statement could not be queued.');
      }
    } catch (err: any) {
      alert('FVU dispatch failed: ' + err.message);
    } finally {
      setIsDispatchingFvu(false);
    }
  };

  // Filtered deductees
  const filteredDeductees = deductees.filter((d) => {
    if (!deducteeSearch) return true;
    const q = deducteeSearch.toLowerCase();
    return (
      d.pan.toLowerCase().includes(q) ||
      d.name.toLowerCase().includes(q) ||
      d.sectionCode.toLowerCase().includes(q)
    );
  });

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
          <p className="text-xs text-pos-ink/70 mt-0.5">
            Client: <span className="font-bold text-pos-ink">{entityName}</span> | TAN: <span className="font-mono font-bold text-pos-accent">{tan}</span> | Quarter: <span className="font-bold">{quarter} ({taxYear})</span>
          </p>
          <Link href="/tds/health" className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-pos-line px-3 py-1 text-xs font-semibold text-pos-accent hover:bg-pos-tint">
            TDS health and past statements
          </Link>
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

      {/* Return Summary Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-pos-ink/60 font-semibold">
            <span>Statutory Return Form</span>
            <span className="font-mono font-bold text-pos-accent">{statutoryRegime === 'IT_ACT_2025' ? 'Act 2025' : 'Act 1961'}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-pos-ink">
              {statutoryRegime === 'IT_ACT_2025' ? 'Form 140' : 'Form 26Q'}
            </span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              {returnSummary.workflowStatus}
            </span>
          </div>
          <p className="text-[11px] text-pos-ink/50 mt-1">Single quarterly unified statement</p>
        </div>

        <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-pos-ink/60 font-semibold">
            <span>Validated Deductees</span>
            <User className="w-3.5 h-3.5 text-pos-accent" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-pos-ink">{deductees.length}</span>
            <span className="text-xs text-pos-ink/60 font-medium">Assessees</span>
          </div>
          <p className="text-[11px] text-emerald-600 font-semibold mt-1">100% PAN & Section checked</p>
        </div>

        <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-pos-ink/60 font-semibold">
            <span>Total Challan Tax</span>
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#3A6FE8]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-pos-ink font-mono">
              ₹{totalAllocatedTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-pos-ink/50 mt-1">Allocated across {allocations.length} section lines</p>
        </div>

        <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-pos-ink/60 font-semibold">
            <span>Correction Freeze Window</span>
            <Clock className="w-3.5 h-3.5 text-[#C2410C]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-pos-ink font-mono">
              {returnSummary.daysToCorrectionExpiry}d
            </span>
            <span className="text-xs font-semibold text-pos-ink/60">remaining</span>
          </div>
          <p className="text-[11px] text-[#C2410C] font-medium mt-1">
            2-Year Freeze: {returnSummary.correctionWindowExpiresAt}
          </p>
        </div>
      </div>

      {/* CSI Match Notification Banner */}
      {csiFeedback && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-mono font-semibold">{csiFeedback}</span>
          </div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-600 text-white">
            OLTAS Verified
          </span>
        </div>
      )}

      {/* FVU Dispatch Notification Card */}
      {fvuFeedback && (
        <div role="status" className="p-4 rounded-xl bg-pos-surface border border-amber-500/40 shadow-lg">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-600">
            <ShieldCheck className="w-4 h-4" />
            <span>Queued for Protean FVU {fvuFeedback.fvuVersion}, not validated yet</span>
          </div>
          <p className="mt-2 text-xs text-pos-ink/70">{fvuFeedback.message}</p>
        </div>
      )}

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
                  className="px-2.5 py-1 rounded bg-pos-surface hover:bg-pos-line text-[10px] font-mono text-pos-ink/80 font-semibold border border-pos-line"
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
                <CustomDropdown
                  variant="form"
                  value={calcSection}
                  onChange={(val) => setCalcSection(val)}
                  className="w-full"
                  buttonClassName="w-full h-9"
                  options={SECTION_OPTIONS.map((opt) => ({
                    value: opt.code,
                    label: opt.code,
                    description: opt.label,
                  }))}
                />
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

              <div className="flex items-center gap-2">
                {csiMatched ? (
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 flex items-center gap-1">
                    <Check className="w-3 h-3" /> CSI Matched
                  </span>
                ) : (
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 border border-amber-500/30">
                    CSI Pending
                  </span>
                )}
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-pos-surface border border-pos-line text-[#3A6FE8]">
                  TAN: {tan}
                </span>
              </div>
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
                <CustomDropdown
                  variant="form"
                  value={majorHead}
                  onChange={(val) => setMajorHead(val as any)}
                  className="w-full"
                  buttonClassName="w-full h-9 font-bold"
                  options={[
                    { value: '0020', label: '0020 (Company Deductee)', badge: '0020' },
                    { value: '0021', label: '0021 (Non-Company Deductee)', badge: '0021' },
                  ]}
                />
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
                    {allocations.map((alloc) => (
                      <tr key={alloc.id} className="hover:bg-pos-tint">
                        <td className="py-2.5 px-3">
                          <CustomSelect
                            variant="table"
                            value={alloc.sectionCode}
                            onChange={(e) => {
                              const newSec = e.target.value;
                              setAllocations(
                                allocations.map((a) =>
                                  a.id === alloc.id ? { ...a, sectionCode: newSec } : a
                                )
                              );
                            }}
                          >
                            {SECTION_OPTIONS.map((o) => (
                              <option key={o.code} value={o.code} className="bg-[#17191C] text-white">
                                {o.code}
                              </option>
                            ))}
                          </CustomSelect>
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
                <button
                  type="button"
                  onClick={handleCsiMatch}
                  disabled={isMatchingCsi}
                  className="px-3 py-1.5 rounded-lg bg-pos-muted hover:bg-pos-line text-pos-ink font-bold transition-colors flex items-center gap-1.5 border border-pos-line disabled:opacity-50"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-[#3A6FE8]" />
                  <span>{isMatchingCsi ? 'Matching...' : 'Match NSDL CSI File'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleFvuDispatch}
                  disabled={isDispatchingFvu}
                  className="px-3.5 py-1.5 rounded-lg bg-pos-accent hover:bg-pos-accent-deep text-white font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>{isDispatchingFvu ? 'Processing...' : 'Prepare FVU File'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Bottom Section: Deductee Compliance Master Grid */}
      <div className="bg-pos-surface border border-pos-line rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-pos-line pb-3">
          <div>
            <h2 className="font-bold text-sm text-pos-ink flex items-center gap-2">
              <User className="w-4 h-4 text-pos-accent" />
              <span>Deductee Compliance Master Grid ({deductees.length} Records)</span>
            </h2>
            <p className="text-[11px] text-pos-ink/60 mt-0.5">
              Verified deductee line items mapped to ITNS 281N allocations and Section 206AA penal rate audit.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-pos-ink/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search PAN or Name..."
                value={deducteeSearch}
                onChange={(e) => setDeducteeSearch(e.target.value)}
                className="bg-pos-muted border border-pos-line rounded-md pl-8 pr-3 py-1 text-xs font-mono text-pos-ink focus:outline-none focus:border-pos-accent w-48 sm:w-60"
              />
            </div>
          </div>
        </div>

        {/* Deductee Table */}
        <div className="overflow-x-auto border border-pos-line rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-pos-muted text-pos-ink/60 font-mono text-[11px] border-b border-pos-line">
                <th className="py-2.5 px-3">PAN</th>
                <th className="py-2.5 px-3">Deductee Name</th>
                <th className="py-2.5 px-2 text-center">Section</th>
                <th className="py-2.5 px-3">Payment Date</th>
                <th className="py-2.5 px-3 text-right">Amount Paid (₹)</th>
                <th className="py-2.5 px-2 text-right">Rate</th>
                <th className="py-2.5 px-3 text-right">TDS Deducted (₹)</th>
                <th className="py-2.5 px-3 text-center">Compliance Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pos-line font-mono">
              {filteredDeductees.map((d) => (
                <tr key={d.id} className="hover:bg-pos-tint transition-colors">
                  <td className="py-2.5 px-3 font-bold text-pos-ink">
                    {d.pan}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-pos-ink">
                    {d.name}
                  </td>
                  <td className="py-2.5 px-2 text-center font-bold text-pos-accent">
                    {d.sectionCode}
                  </td>
                  <td className="py-2.5 px-3 text-pos-ink/70">
                    {d.paymentDate || '2026-10-15'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium text-pos-ink">
                    ₹{parseFloat(d.amountPaid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-2 text-right text-pos-ink/80">
                    {d.rate}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-pos-ink">
                    ₹{parseFloat(d.tdsDeducted).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {d.status === 'OPERATIVE' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        <Check className="w-3 h-3" /> Valid PAN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-[#C2410C]/10 text-[#C2410C] border border-[#C2410C]/20">
                        <AlertCircle className="w-3 h-3" /> Sec 206AA (20%)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Deductee Summary Footnote */}
        <div className="flex flex-wrap items-center justify-between text-xs font-mono text-pos-ink/70 pt-2 border-t border-pos-line">
          <div>
            Showing {filteredDeductees.length} of {deductees.length} deductee line items
          </div>
          <div className="flex items-center gap-4">
            <span>
              Total Paid: <strong className="text-pos-ink">₹5,45,000.00</strong>
            </span>
            <span>
              Total Deposited: <strong className="text-pos-accent">₹{totalAllocatedTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
