'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { SteppedPixelEyebrow } from './SteppedPixelEyebrow';

interface TestimonialItem {
  id: string;
  quote: string;
  author: string;
  designation: string;
  ratingDashes: number;
}

const TESTIMONIALS: TestimonialItem[] = [
  {
    id: 't-1',
    quote: 'SynexTax has transformed our tax consulting. Their real-time GSTR-2B insights and zero-Java DSC signing make corporate taxation completely stress-free!',
    author: 'Alexander Joseph',
    designation: 'CFO of Alexandria Sphere',
    ratingDashes: 4,
  },
  {
    id: 't-2',
    quote: 'The 4-pass fuzzy reconciliation engine resolved 140 invoice number discrepancies from our Amritsar textile suppliers before the 14th cutoff, stopping unwanted Section 17(5) deemed acceptances.',
    author: 'CA Amrinder Verma, FCA',
    designation: 'Senior Managing Partner, Verma & Associates',
    ratingDashes: 4,
  },
  {
    id: 't-3',
    quote: 'Dual-Act TDS support with automated Section 516 truncation saved us three whole days during quarter-end filing. No Java crashes or port locks on our USB tokens.',
    author: 'Gurinder Gill',
    designation: 'Head of Finance, Majha Agro Foods',
    ratingDashes: 4,
  },
];

export function SwissValueTrust() {
  const [clarityToggle, setClarityToggle] = useState<boolean>(true);
  const [currentIdx, setCurrentIdx] = useState<number>(0);

  const activeTestimonial = TESTIMONIALS[currentIdx];

  const handlePrev = () => {
    setCurrentIdx((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  const handleNext = () => {
    setCurrentIdx((prev) => (prev + 1) % TESTIMONIALS.length);
  };

  return (
    <section id="social-proof" className="py-20 lg:py-28 bg-white text-[#0E0F10] border-b border-[#E5E7EB] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Section Eyebrow & Subtitle */}
        <div className="space-y-2">
          <SteppedPixelEyebrow
            text="WHAT THEY SAID"
            variant="dark"
            accentColor="sky"
          />
          <p className="text-xs font-mono text-[#646A73] uppercase tracking-wider">
            We break down the jargon into words you actually use and understand.
          </p>
        </div>

        {/* 2-Column Grid matching df554be2b8d6bcc036280185cc883e36 and fa99bb7eb512c066f717e9059c02cc41 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          
          {/* Left Column: Headline with Inline Interactive Toggle + Stats + Stepped Photo Frame (7 cols) */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* Display Headline with Interactive Inline Toggles */}
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black font-sans text-[#0E0F10] tracking-tight leading-[1.12]">
              We're here to connect clarity <br />
              and compliance{' '}
              <button
                type="button"
                onClick={() => setClarityToggle(!clarityToggle)}
                className="inline-flex items-center align-middle mx-1 p-0.5 w-12 h-6 rounded-full bg-[#52AEFA] transition-colors relative shadow-inner cursor-pointer"
                title="Toggle between Clarity and Compliance perspectives"
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                    clarityToggle ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>{' '}
              so you <br />
              can breathe easy.{' '}
              <button
                type="button"
                onClick={() => setClarityToggle(!clarityToggle)}
                className="inline-flex items-center align-middle mx-1 p-0.5 w-12 h-6 rounded-full bg-[#52E888] transition-colors relative shadow-inner cursor-pointer"
                title="Toggle between Clarity and Compliance perspectives"
              >
                <span
                  className={`w-5 h-5 rounded-full bg-[#0E0F10] shadow-md transform transition-transform ${
                    clarityToggle ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </h2>

            {/* Dynamic Perspective Callout */}
            <div className="p-4 rounded-2xl bg-[#F7F8FA] border border-[#E5E7EB] text-xs font-mono text-[#646A73]">
              {clarityToggle ? (
                <span>
                  <strong className="text-[#0E0F10]">Clarity Mode Active:</strong> Plain operational language for clients, partners, and business owners. Zero tax legalese.
                </span>
              ) : (
                <span>
                  <strong className="text-[#0E0F10]">Compliance Mode Active:</strong> Section 170 CGST, Section 516 IT Act 2025, and Rule 88A set-off citations strictly enforced.
                </span>
              )}
            </div>

            {/* Key Stats Row */}
            <div className="grid grid-cols-2 gap-6 pt-2">
              <div>
                <div className="text-3xl sm:text-4xl font-black font-sans text-[#0E0F10]">
                  100<sup className="text-[#52AEFA] text-lg">+</sup>
                </div>
                <div className="text-xs font-mono text-[#646A73] mt-1">Total Testimonials</div>
              </div>

              <div>
                <div className="text-3xl sm:text-4xl font-black font-sans text-[#0E0F10]">
                  92,7<sup className="text-[#52E888] text-lg">%</sup>
                </div>
                <div className="text-xs font-mono text-[#646A73] mt-1">Satisfaction Rates</div>
              </div>
            </div>

            {/* Stepped Real Team Photography Frame */}
            <div className="relative pt-4">
              <div className="relative rounded-[24px] bg-[#52E888] p-3 shadow-lg max-w-lg overflow-hidden">
                {/* L-shaped stepped mosaic backing */}
                <div
                  className="absolute inset-0 opacity-20 pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, #0E0F10 1px, transparent 1px), linear-gradient(to bottom, #0E0F10 1px, transparent 1px)`,
                    backgroundSize: '10px 10px',
                  }}
                />

                <div className="relative rounded-[18px] overflow-hidden bg-white">
                  <Image
                    src="/references/df554be2b8d6bcc036280185cc883e36.webp"
                    alt="SynexTax CA Team collaborating on tax compliance"
                    width={600}
                    height={360}
                    className="w-full h-auto object-cover"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Pill Tags + Quote Carousel + Stepped Rating (5 cols) */}
          <div className="lg:col-span-5 space-y-8 lg:pt-8">
            
            <div className="text-xs font-mono text-[#646A73]">
              @2026SynexTax
            </div>

            {/* Pill Tags */}
            <div className="flex flex-wrap gap-2">
              {[
                'Tax Confidence',
                'Smart Support',
                'Strategic Planning',
                'Innovation',
                'Connecting Clarity',
                '+3',
              ].map((tag, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full bg-white border border-[#E5E7EB] text-xs font-mono text-[#0E0F10] shadow-xs"
                >
                  ( {tag} )
                </span>
              ))}
            </div>

            {/* Stepped Rating Dash Pills */}
            <div className="flex items-center gap-1.5 pt-2">
              <span className="w-8 h-2 rounded-full bg-[#52E888]" />
              <span className="w-8 h-2 rounded-full bg-[#52E888]" />
              <span className="w-8 h-2 rounded-full bg-[#52E888]" />
              <span className="w-8 h-2 rounded-full bg-[#52E888]" />
            </div>

            {/* Active Testimonial Quote */}
            <div className="space-y-4">
              <blockquote className="text-xl sm:text-2xl font-bold font-sans text-[#0E0F10] leading-snug">
                "{activeTestimonial.quote}"
              </blockquote>

              <div>
                <div className="font-bold text-sm text-[#0E0F10]">
                  {activeTestimonial.author}
                </div>
                <div className="text-xs font-mono text-[#646A73] mt-0.5">
                  {activeTestimonial.designation}
                </div>
              </div>
            </div>

            {/* Carousel Previous / Next Arrows */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrev}
                className="w-10 h-10 rounded-full border border-[#E5E7EB] bg-white hover:bg-[#F7F8FA] flex items-center justify-center text-[#0E0F10] shadow-xs transition-colors"
                title="Previous testimonial"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="w-10 h-10 rounded-full border border-[#E5E7EB] bg-white hover:bg-[#F7F8FA] flex items-center justify-center text-[#0E0F10] shadow-xs transition-colors"
                title="Next testimonial"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
