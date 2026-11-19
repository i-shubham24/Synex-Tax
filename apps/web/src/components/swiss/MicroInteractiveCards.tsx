'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  Sparkles,
  Bot,
  Send,
  Lock,
  ChevronDown,
  Layers,
  ArrowUpRight,
  Maximize2,
  CheckCircle2,
} from 'lucide-react';

export function MicroInteractiveCards() {
  // Card 1: Tax Summary timeframe state
  const [summaryPeriod, setSummaryPeriod] = useState<'Weekly' | 'Monthly' | 'Annual'>('Weekly');
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // Card 2: Community active member state
  const [activeCommunityPill, setActiveCommunityPill] = useState<string>('Amrinder');

  // Card 6: AI Assistant prompt and response state
  const [aiQuestion, setAiQuestion] = useState<string>('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isAiTyping, setIsAiTyping] = useState<boolean>(false);

  const sampleQuestions = [
    'Can we claim Table 4(D)(1) reclaim?',
    'What is the Rule 86B 1% cash threshold?',
    'Which section applies to ITNS 281N?',
  ];

  const handleAskQuestion = (q: string) => {
    setAiQuestion(q);
    setIsAiTyping(true);
    setAiAnswer(null);

    setTimeout(() => {
      setIsAiTyping(false);
      if (q.includes('4(D)(1)')) {
        setAiAnswer(
          'Under Advisory 643 and Notification 56/2023, Table 4(D)(1) reclaim is strictly capped by your cumulative Table 4(B)(2) reversals plus opening reclaim ledger balance. Attempting excess reclaim triggers statutory warning.'
        );
      } else if (q.includes('Rule 86B')) {
        setAiAnswer(
          'Rule 86B mandates minimum 1% output tax liability payment in cash if taxable turnover exceeds Rs 50 Lakhs in a month. Exemptions apply for CAs whose client paid > Rs 1 Lakh income tax in the last 2 assessment years.'
        );
      } else {
        setAiAnswer(
          'Under the Direct Tax Code and IT Act 2025, Form ITNS 281N supports multi-section allocation allowing up to 20 sections (e.g. 194C, 194J, 194Q) under a single consolidated challan identification number.'
        );
      }
    }, 450);
  };

  return (
    <section id="intelligence" className="bg-[#F7F8FA] border-y border-[#E5E7EB] py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#E5E7EB] text-xs font-mono font-bold text-[#0E0F10] uppercase tracking-wider mb-3">
            <span className="w-2 h-2 rounded-sm bg-[#52AEFA]" />
            <span>Interactive Micro-Architecture</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black font-sans tracking-tight text-[#0E0F10]">
            Fintech Precision In Every Card
          </h2>
          <p className="text-sm sm:text-base text-[#646A73] mt-3">
            Every component in SynexTax is interactive, mathematically deterministic, and calibrated for Indian CA practices.
          </p>
        </div>

        {/* 6 Micro-Cards Grid matching design reference fd1d3385321124b18e7c49413462a936 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* CARD 1: Tax Summary with Spline Curve & Progress Bar */}
          <div className="bg-white rounded-[24px] border border-[#E5E7EB] p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#0E0F10] text-[#52E888] flex items-center justify-center font-bold text-xs">
                  ST
                </div>
                <span className="font-bold text-sm text-[#0E0F10]">SynexTax</span>
              </div>

              {/* Timeframe selector */}
              <div className="relative">
                <button
                  onClick={() =>
                    setSummaryPeriod((prev) =>
                      prev === 'Weekly' ? 'Monthly' : prev === 'Monthly' ? 'Annual' : 'Weekly'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] text-xs font-mono font-bold text-[#0E0F10] hover:bg-slate-100 transition-colors"
                >
                  <span>{summaryPeriod}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#646A73]" />
                </button>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-mono text-[#646A73]">Tax Summary</div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-[#0E0F10] tracking-tight">
                {summaryPeriod === 'Weekly'
                  ? '₹1,39,760.00'
                  : summaryPeriod === 'Monthly'
                  ? '₹6,42,850.00'
                  : '₹78,14,200.00'}
              </div>
            </div>

            {/* Spline Curve Visualization */}
            <div className="relative h-32 mt-4 bg-gradient-to-b from-[#F7F8FA] to-white rounded-xl p-2 border border-[#E5E7EB]/60">
              {/* Callout pin */}
              <div className="absolute top-3 right-6 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#52E888]/20 border border-[#52E888] text-[11px] font-mono font-bold text-[#0E0F10]">
                <span>+10.12%</span>
                <TrendingUp className="w-3 h-3 text-[#16A34A]" />
              </div>

              {/* SVG Spline curve */}
              <svg className="w-full h-full overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#52E888" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#52E888" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M 0 85 Q 75 80, 150 60 T 300 15 L 300 100 L 0 100 Z"
                  fill="url(#curveGradient)"
                />
                <path
                  d="M 0 85 Q 75 80, 150 60 T 300 15"
                  fill="none"
                  stroke="#52E888"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                {/* Target Pin Marker */}
                <circle cx="300" cy="15" r="5" fill="#52E888" stroke="#FFFFFF" strokeWidth="2.5" />
              </svg>
            </div>

            {/* Breakdown labels and segmented bar */}
            <div className="mt-5 space-y-2">
              <div className="grid grid-cols-3 text-xs font-mono text-[#646A73]">
                <div>
                  <div>Eligible ITC</div>
                  <div className="font-bold text-[#0E0F10] flex items-center gap-1.5 mt-0.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#52E888]" /> 48%
                  </div>
                </div>
                <div>
                  <div>TDS 194C</div>
                  <div className="font-bold text-[#0E0F10] flex items-center gap-1.5 mt-0.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#52AEFA]" /> 20%
                  </div>
                </div>
                <div>
                  <div>Cash Ledger</div>
                  <div className="font-bold text-[#0E0F10] flex items-center gap-1.5 mt-0.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#0E0F10]" /> 57%
                  </div>
                </div>
              </div>

              {/* Multi-segment progress bar */}
              <div className="h-3 w-full rounded-full bg-[#E5E7EB] flex overflow-hidden">
                <div className="h-full bg-[#52E888] w-[48%]" />
                <div className="h-full bg-[#52AEFA] w-[20%]" />
                <div className="h-full bg-[#0E0F10] w-[32%]" />
              </div>
            </div>
          </div>

          {/* CARD 2: 10K+ Total Users Community Board */}
          <div className="bg-white rounded-[24px] border border-[#E5E7EB] p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="text-2xl font-black font-sans text-[#0E0F10] tracking-tight">
                10K+ Total Users
              </div>
              <p className="text-xs text-[#646A73] mt-1">
                Chartered Accountants and tax practitioners have migrated to SynexTax.
              </p>

              {/* Floating community pill tags */}
              <div className="flex flex-wrap gap-2 mt-5">
                {[
                  { id: 'Amrinder', name: 'CA Amrinder Verma', role: 'Partner FCA', color: 'dark' },
                  { id: 'Simran', name: 'Simran Kaur', role: 'GST Lead', color: 'mint' },
                  { id: 'Gurinder', name: 'Gurinder Gill', role: 'Agro Client', color: 'light' },
                  { id: 'Rajat', name: 'Rajat Sharma', role: 'Tax Associate', color: 'blue' },
                  { id: 'Harpreet', name: 'Harpreet Singh', role: 'Textile CFO', color: 'light' },
                ].map((pill) => {
                  const isActive = activeCommunityPill === pill.id;
                  let bgClasses = 'bg-[#F7F8FA] text-[#0E0F10] border-[#E5E7EB]';
                  if (pill.color === 'dark') bgClasses = 'bg-[#0E0F10] text-white border-[#0E0F10]';
                  if (pill.color === 'mint') bgClasses = 'bg-[#52E888] text-[#0E0F10] border-[#52E888] font-bold';
                  if (pill.color === 'blue') bgClasses = 'bg-[#52AEFA] text-white border-[#52AEFA] font-bold';

                  return (
                    <button
                      key={pill.id}
                      onClick={() => setActiveCommunityPill(pill.id)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono transition-transform hover:scale-105 ${bgClasses} ${
                        isActive ? 'ring-2 ring-[#0E0F10] ring-offset-1' : ''
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                        {pill.name.charAt(0)}
                      </div>
                      <span>{pill.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active community card details */}
              <div className="mt-6 p-3 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] text-xs space-y-1">
                <div className="font-bold text-[#0E0F10]">
                  Verified CA Firm Status:
                </div>
                <div className="text-[#646A73]">
                  100% Legal & Reconciled across Amritsar, Ludhiana, Jalandhar & Chandigarh circles.
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#E5E7EB]">
              <button className="w-full py-2.5 rounded-full border-2 border-[#0E0F10] font-sans font-bold text-xs text-[#0E0F10] hover:bg-[#0E0F10] hover:text-white transition-all">
                Join Our CA Community
              </button>
            </div>
          </div>

          {/* CARD 3: Quantum Concentric Radar */}
          <div className="bg-white rounded-[24px] border border-[#E5E7EB] p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col items-center text-center">
            
            {/* Concentric circles and radar */}
            <div className="relative w-44 h-44 my-2 flex items-center justify-center">
              {/* Outer ring */}
              <div className="absolute inset-0 rounded-full border border-dashed border-[#52E888]/40 animate-spin" style={{ animationDuration: '30s' }} />
              {/* Middle ring */}
              <div className="absolute inset-4 rounded-full border border-[#52AEFA]/30" />
              {/* Inner ring */}
              <div className="absolute inset-8 rounded-full border border-[#52E888]/40" />
              
              {/* Interlocking green and blue circles in center */}
              <div className="relative flex items-center">
                <div className="w-14 h-14 rounded-full bg-[#52E888] shadow-lg flex items-center justify-center text-[#0E0F10] font-black z-10 -mr-3">
                  <TrendingUp className="w-6 h-6 text-[#0E0F10]" />
                </div>
                <div className="w-14 h-14 rounded-full bg-[#52AEFA] shadow-lg flex items-center justify-center text-white font-black font-mono text-xl z-20">
                  ₹
                </div>
              </div>
            </div>

            {/* Orbiting pill tags */}
            <div className="flex flex-wrap justify-center gap-1.5 mt-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] text-[10px] font-mono text-[#646A73]">
                Quantum Cryptographic Vault
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] text-[10px] font-mono text-[#646A73]">
                FIPS 140-3 Hardware Token
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] text-[10px] font-mono text-[#646A73]">
                MCA Rule 3 Immutable Ledger
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] text-[10px] font-mono text-[#646A73]">
                Section 138 DPDP Privacy
              </span>
            </div>
          </div>

          {/* CARD 4: Statutory Security Shield with Padlock */}
          <div className="bg-white rounded-[24px] border border-[#E5E7EB] p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col items-center text-center">
            
            {/* Center Shield with mosaic texture */}
            <div className="relative w-36 h-36 my-2 flex items-center justify-center">
              {/* Mosaic backdrop */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#52E888]/20 to-[#52AEFA]/20 rounded-full blur-xl" />
              
              {/* Shield container */}
              <div className="relative w-24 h-28 bg-[#52E888] rounded-t-2xl rounded-b-[40px] flex items-center justify-center shadow-lg border-2 border-white">
                {/* Subtle mosaic pixel grid overlay */}
                <div
                  className="absolute inset-0 opacity-20 rounded-t-2xl rounded-b-[40px]"
                  style={{
                    backgroundImage: `linear-gradient(to right, #0E0F10 1px, transparent 1px), linear-gradient(to bottom, #0E0F10 1px, transparent 1px)`,
                    backgroundSize: '8px 8px',
                  }}
                />
                <Lock className="w-10 h-10 text-[#0E0F10] relative z-10" />
              </div>
            </div>

            {/* Orbiting tags */}
            <div className="flex flex-wrap justify-center gap-1.5 mt-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] text-[10px] font-mono text-[#0E0F10] font-semibold">
                Privacy Logic
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] text-[10px] font-mono text-[#0E0F10] font-semibold">
                Threat Detection
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] text-[10px] font-mono text-[#0E0F10] font-semibold">
                Unchangeable Ledger
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] text-[10px] font-mono text-[#0E0F10] font-semibold">
                Automate Audit
              </span>
            </div>
          </div>

          {/* CARD 5: Tax Savings Analytics Bar Chart */}
          <div className="bg-white rounded-[24px] border border-[#E5E7EB] p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="text-xs font-mono text-[#646A73] uppercase tracking-wider">
              Statutory Reconciled Column
            </div>
            <div className="text-xl font-black font-sans text-[#0E0F10] mt-0.5">
              Tax Savings Analytics
            </div>
            <p className="text-xs text-[#646A73] mt-1">
              A concise overview of tax savings strategies and insights.
            </p>

            {/* Vertical Bar Chart with Peak Mosaic Highlight */}
            <div className="relative h-40 mt-5 pt-6 pb-2 flex items-end justify-between gap-2 border-b border-dashed border-[#E5E7EB]">
              
              {/* Dashed threshold line */}
              <div className="absolute top-10 left-0 right-0 border-t border-dashed border-[#52E888] flex items-center justify-end">
                <span className="text-[10px] font-mono font-bold text-[#16A34A] bg-white px-1 -mt-2">
                  Optimal ITC Cap
                </span>
              </div>

              {/* Bar 1 */}
              <div className="flex-1 bg-[#E5E7EB] rounded-t-md h-[45%]" />
              {/* Bar 2 */}
              <div className="flex-1 bg-[#E5E7EB] rounded-t-md h-[65%]" />
              {/* Bar 3 */}
              <div className="flex-1 bg-[#E5E7EB] rounded-t-md h-[55%]" />
              {/* Bar 4: Peak Highlight with Mosaic & Indicator */}
              <div className="flex-1 relative h-[90%]">
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded bg-[#52E888] text-[10px] font-mono font-bold text-[#0E0F10] shadow-sm">
                  +12.4% ↑
                </div>
                <div
                  className="w-full h-full bg-[#52E888] rounded-t-md relative overflow-hidden"
                  style={{
                    backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)`,
                    backgroundSize: '4px 4px',
                  }}
                />
              </div>
              {/* Bar 5 */}
              <div className="flex-1 bg-[#E5E7EB] rounded-t-md h-[72%]" />
              {/* Bar 6 */}
              <div className="flex-1 bg-[#E5E7EB] rounded-t-md h-[60%]" />
            </div>

            <div className="flex justify-between items-center text-[10px] font-mono text-[#646A73] mt-2">
              <span>Nov</span>
              <span>Dec</span>
              <span>Jan</span>
              <span className="font-bold text-[#0E0F10]">Feb (Peak)</span>
              <span>Mar</span>
              <span>Apr</span>
            </div>
          </div>

          {/* CARD 6: Interactive Ask AI Tax Consultation Assistant */}
          <div className="bg-white rounded-[24px] border border-[#E5E7EB] p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#52AEFA] flex items-center justify-center text-white font-bold">
                    <Bot className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-sm text-[#0E0F10]">SynexTax Assistant</span>
                </div>
                <div className="text-xs font-mono text-[#646A73] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#52E888] animate-pulse" /> 24/7 Live
                </div>
              </div>

              <div className="text-center my-4">
                <div className="text-lg font-black font-sans text-[#0E0F10]">
                  Need help?
                </div>
                <p className="text-xs text-[#646A73] mt-1">
                  Ask our AI assistant about your tax consultation easily always 24/7.
                </p>
              </div>

              {/* Sample question chips */}
              <div className="space-y-1.5 my-3">
                {sampleQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAskQuestion(q)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg bg-[#F7F8FA] hover:bg-[#EFF7FF] border border-[#E5E7EB] text-[11px] font-mono text-[#0E0F10] truncate transition-colors"
                  >
                    ↗ {q}
                  </button>
                ))}
              </div>

              {/* Dynamic response preview */}
              {isAiTyping && (
                <div className="p-3 rounded-xl bg-[#EFF7FF] border border-[#52AEFA]/30 text-xs font-mono text-[#2F8AE0] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#52AEFA] animate-ping" />
                  <span>Consulting statutory engine and Finance Act 2025...</span>
                </div>
              )}

              {aiAnswer && !isAiTyping && (
                <div className="p-3 rounded-xl bg-[#DCFCE7] border border-[#52E888]/40 text-xs font-sans text-[#15803D] animate-fadeIn">
                  {aiAnswer}
                </div>
              )}
            </div>

            {/* Input field */}
            <div className="mt-4 pt-3 border-t border-[#E5E7EB]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (aiQuestion.trim()) handleAskQuestion(aiQuestion.trim());
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder="Ask any question about taxation..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#52AEFA]"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-[#52E888] text-[#0E0F10] hover:bg-[#3BD975] transition-colors"
                  title="Submit statutory question"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
