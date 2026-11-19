'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight } from 'lucide-react';

interface SplitCtaButtonProps {
  href?: string;
  onClick?: () => void;
  children?: React.ReactNode;
  label?: string;
  variant?: 'dark' | 'light';
  accent?: 'mint' | 'sky';
  accentColor?: 'mint' | 'sky';
  arrowDirection?: 'up-right' | 'right';
  className?: string;
  type?: 'button' | 'submit';
}

export function SplitCtaButton({
  href,
  onClick,
  children,
  label,
  variant = 'dark',
  accent = 'mint',
  accentColor,
  arrowDirection = 'up-right',
  className = '',
  type = 'button',
}: SplitCtaButtonProps) {
  const effectiveAccent = accentColor || accent || 'mint';
  const buttonText = children || label;

  const bgStyles =
    variant === 'dark'
      ? 'bg-[#0E0F10] text-white hover:bg-[#17191C] border border-[#24272B]'
      : 'bg-white text-[#0E0F10] hover:bg-slate-50 border border-[#E5E7EB] shadow-sm';

  const accentStyles =
    effectiveAccent === 'mint'
      ? 'bg-[#52E888] text-[#0E0F10] group-hover:bg-[#3BD975]'
      : 'bg-[#52AEFA] text-[#0E0F10] group-hover:bg-[#389BF0]';

  const content = (
    <span className="inline-flex items-center gap-3">
      <span className="font-sans font-semibold text-xs tracking-tight">{buttonText}</span>
      <span
        className={`w-6 h-6 rounded-[4px] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${accentStyles}`}
      >
        {arrowDirection === 'up-right' ? (
          <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
        ) : (
          <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
        )}
      </span>
    </span>
  );

  const sharedClasses = `inline-flex items-center justify-between pl-4 pr-1.5 py-1.5 rounded-full transition-all duration-200 group cursor-pointer ${bgStyles} ${className}`;

  if (href) {
    return (
      <Link href={href} className={sharedClasses}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={sharedClasses}>
      {content}
    </button>
  );
}
