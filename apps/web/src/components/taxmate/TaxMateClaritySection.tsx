'use client';

import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Users,
  Shield,
  ArrowRight,
} from 'lucide-react';

interface TestimonialItem {
  id: string;
  quote: string;
  author: string;
  title: string;
  firm: string;
  metrics: string;
}

const TESTIMONIALS: TestimonialItem[] = [
  {
    id: 'test-1',
    quote:
      'TaxMate has transformed our tax practice. Their expertise in Section 516 rounding, ITNS 281N multi-section challans, and 4-pass GSTR-2B recon makes complex Indian tax compliance effortless!',
    author: 'CA Alexander Joseph',
    title: 'Senior Partner & Tax Lead',
    firm: 'Alexandria Sphere Tax Advocates',
    metrics: '100+ Daily Inquiries | 92.7% Accuracy',
  },
  {
    id: 'test-2',
    quote:
      'Replacing our legacy desktop setup with SynexTax eliminated Tally XML crashes and gave us sub-second GSTR-2B reconciliation with automated 48-hour pre-14th IMS protection.',
    author: 'CA Amrinder Verma, FCA',
    title: 'Managing Partner',
    firm: 'Verma & Associates (Amritsar)',
    metrics: '₹14.8M Recovered ITC | Zero Float Discrepancy',
  },
];

export function TaxMateClaritySection() {
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const activeTestimonial = TESTIMONIALS[currentIdx];

  const handleNext = () => {
    setCurrentIdx((prev) => (prev + 1) % TESTIMONIALS.length);
  };

  const handlePrev = () => {
    setCurrentIdx((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  return (
    <section className="py-20 lg:py-28 bg-white text-slate-900 border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Main Headline with TaxMate signature toggle pills */}
        <div className="max-w-4xl space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-600 uppercase tracking-wider">
            <span className="w-2.5 h-2.5 bg-emerald-500 inline-block"></span>
            <span>Connecting Clarity & Compliance</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-950 tracking-tight leading-[1.15]">
            We are here to connect clarity{' '}
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-sky-500 text-white text-sm font-mono font-bold align-middle mx-1 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-white mr-1.5 animate-pulse"></span>
              Clarity
            </span>{' '}
            and compliance{' '}
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500 text-slate-950 text-sm font-mono font-bold align-middle mx-1 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-slate-950 mr-1.5"></span>
              Compliance
            </span>{' '}
            so you can breathe easy.
          </h2>
        </div>

        {/* 2-Column Split: Left Photo + Stats (6 cols), Right Pill Cloud & Testimonial Card (6 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          
          {/* Left Column: Portrait with Geometric Stepped Green Shapes (TaxMate signature) */}
          <div className="lg:col-span-6 space-y-6">
            
            <div className="relative rounded-3xl p-6 bg-slate-50 border border-slate-200/80 shadow-lg overflow-hidden flex flex-col justify-between aspect-[16/10]">
              
              {/* Geometric mint green blocks background */}
              <div className="absolute top-4 right-4 w-32 h-32 bg-emerald-400/20 rounded-2xl -rotate-6 pointer-events-none"></div>
              <div className="absolute bottom-4 right-16 w-24 h-24 bg-sky-400/20 rounded-2xl rotate-12 pointer-events-none"></div>

              <div className="relative z-10 space-y-2 max-w-sm">
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-950 text-white font-bold uppercase">
                  Verified Case Study
                </span>
                <h3 className="text-2xl font-black text-slate-950 tracking-tight">
                  Seamless Transition from Desktop to Cloud
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  How leading tax practices across Punjab transformed their client return workflows while ensuring 100%
                  adherence to MCA Rule 3 audit trails.
                </p>
              </div>

              {/* Stats Box */}
              <div className="relative z-10 grid grid-cols-2 gap-4 pt-4 border-t border-slate-200/80">
                <div>
                  <div className="text-3xl font-black text-slate-950 tracking-tight font-sans">100+</div>
                  <div className="text-[11px] text-slate-500 font-medium">Daily Inquiries Automated</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-emerald-600 tracking-tight font-sans">92.7%</div>
                  <div className="text-[11px] text-slate-500 font-medium">Satisfaction Rates</div>
                </div>
              </div>

            </div>

          </div>

          {/* Right Column: Pill Cloud + Alexander Joseph Testimonial Card */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Pill Cloud matching TaxMate Reference */}
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              {[
                'Tax Compliance',
                'Smart Support',
                'Strategic Planning',
                'Innovation',
                'Connecting Clarity',
                'Section 170 CGST',
                'ITNS 281N',
              ].map((pill) => (
                <span
                  key={pill}
                  className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold transition-colors cursor-default"
                >
                  {pill}
                </span>
              ))}
            </div>

            {/* Testimonial Box */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-6 sm:p-8 space-y-5 shadow-lg relative">
              
              {/* 5-Bar Green Rating (TaxMate signature) */}
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((b) => (
                  <span key={b} className="w-5 h-2 rounded-sm bg-emerald-500"></span>
                ))}
              </div>

              <blockquote className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                &ldquo;{activeTestimonial.quote}&rdquo;
              </blockquote>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                <div>
                  <div className="font-extrabold text-sm text-slate-950">{activeTestimonial.author}</div>
                  <div className="text-xs text-slate-500">{activeTestimonial.title} | {activeTestimonial.firm}</div>
                </div>

                {/* Slider Controls [ < ] [ > ] */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrev}
                    aria-label="Previous testimonial"
                    className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-950 hover:text-white transition-all flex items-center justify-center shadow-sm"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleNext}
                    aria-label="Next testimonial"
                    className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-950 hover:text-white transition-all flex items-center justify-center shadow-sm"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
