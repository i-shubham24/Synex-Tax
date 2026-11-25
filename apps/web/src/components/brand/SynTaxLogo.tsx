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
  const h = size;
  const w = Math.round(h * (397 / 232));

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: w, height: h }}
    >
      {!failed ? (
        <img
          src="/brand/syntax-logo.png"
          alt="SynTax Mark"
          width={w}
          height={h}
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <svg
          width={w}
          height={h}
          viewBox="0 0 397 232"
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
            d="M50 88 C50 40, 90 20, 160 20 L220 20 C240 20, 250 35, 250 55 L160 55 C130 55, 100 65, 100 88 C100 110, 130 120, 160 120 L230 120 C280 120, 310 145, 310 180 C310 215, 270 230, 200 230 L110 230 C75 230, 60 215, 60 195 L150 195 C180 195, 230 190, 230 175 C230 155, 190 145, 160 145 L110 145 C65 145, 50 120, 50 88 Z"
            fill="url(#stNavy)"
          />
          <path
            d="M110 145 L50 225 L100 225 L160 145 Z"
            fill="url(#stCyan)"
          />
          <rect x="260" y="55" width="55" height="12" rx="6" fill="#00C4D4" />
          <rect x="240" y="80" width="55" height="12" rx="6" fill="#00C4D4" />
          <rect x="220" y="105" width="55" height="12" rx="6" fill="#00C4D4" />
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
  size = 32,
  tone = 'ink',
  className = '',
  showText = true,
}: SynTaxWordmarkProps) {
  const textClass = tone === 'paper' ? 'text-white' : 'text-pos-ink';

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <SynTaxMark size={size} />
      {showText && (
        <span
          className={`font-display font-semibold tracking-[-0.03em] ${textClass}`}
          style={{ fontSize: Math.max(18, Math.round(size * 0.72)) }}
        >
          SynTax
        </span>
      )}
    </span>
  );
}
