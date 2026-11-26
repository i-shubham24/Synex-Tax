'use client';

import React from 'react';

interface SynTaxMarkProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

/**
 * SynTax brand mark featuring the exact official S ribbon logo asset.
 */
export function SynTaxMark({ size = 36, className = '', priority = true }: SynTaxMarkProps) {
  const h = size;
  const w = Math.round(h * (397 / 232));

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: w, height: h }}
    >
      <img
        src="/syntax-logo.png"
        alt="SynTax Mark"
        width={w}
        height={h}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className="h-full w-full object-contain select-none"
      />
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
  size = 36,
  tone = 'ink',
  className = '',
  showText = true,
}: SynTaxWordmarkProps) {
  const textClass = tone === 'paper' ? 'text-white' : 'text-pos-ink';

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <SynTaxMark size={size} priority />
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
