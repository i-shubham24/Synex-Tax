'use client';

import React, { useState } from 'react';

interface SynTaxMarkProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

/**
 * SynTax brand mark featuring the dynamic S ribbon with cyan-navy gradient.
 */
export function SynTaxMark({ size = 32, className = '', priority = false }: SynTaxMarkProps) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      {!failed ? (
        <img
          src="/brand/syntax-mark-512.png"
          alt="SynTax Mark"
          width={size}
          height={size}
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
          aria-label="SynTax Mark"
        >
          <defs>
            <linearGradient id="stNavy" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0B1A3F" />
              <stop offset="100%" stopColor="#040C22" />
            </linearGradient>
            <linearGradient id="stCyan" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00E5FF" />
              <stop offset="100%" stopColor="#0097A7" />
            </linearGradient>
          </defs>
          <path
            d="M20 38 C20 22, 34 16, 52 16 L65 16 C72 16, 75 22, 75 28 L52 28 C42 28, 35 32, 35 38 C35 44, 42 48, 52 48 L68 48 C82 48, 90 56, 90 68 C90 82, 78 88, 60 88 L35 88 C26 88, 22 82, 22 76 L48 76 C58 76, 72 74, 72 68 C72 62, 60 59, 52 59 L38 59 C24 59, 20 50, 20 38 Z"
            fill="url(#stNavy)"
          />
          <path
            d="M38 59 L18 84 L36 84 L52 59 Z"
            fill="url(#stCyan)"
          />
          <rect x="76" y="24" width="16" height="4" rx="2" fill="#00C4D4" />
          <rect x="70" y="32" width="16" height="4" rx="2" fill="#00C4D4" />
          <rect x="64" y="40" width="16" height="4" rx="2" fill="#00C4D4" />
        </svg>
      )}
    </span>
  );
}

interface SynTaxWordmarkProps {
  size?: number;
  tone?: 'ink' | 'paper';
  className?: string;
  showText?: boolean;
}

/**
 * SynTax combined logo: brand mark alongside crisp modern typography.
 */
export function SynTaxWordmark({
  size = 28,
  tone = 'ink',
  className = '',
  showText = true,
}: SynTaxWordmarkProps) {
  const textClass = tone === 'paper' ? 'text-white' : 'text-pos-ink';

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SynTaxMark size={size} />
      {showText && (
        <span
          className={`font-display font-semibold tracking-[-0.03em] ${textClass}`}
          style={{ fontSize: Math.max(16, Math.round(size * 0.72)) }}
        >
          SynTax
        </span>
      )}
    </span>
  );
}
