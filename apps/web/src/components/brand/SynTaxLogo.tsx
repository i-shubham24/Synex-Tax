import React from 'react';
import Image from 'next/image';

interface SynTaxMarkProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

/**
 * SynTax brand mark featuring the dynamic S ribbon with cyan-navy gradient.
 */
export function SynTaxMark({ size = 32, className = '', priority = false }: SynTaxMarkProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/syntax-mark-512.png"
        alt="SynTax Mark"
        width={size}
        height={size}
        priority={priority}
        className="h-full w-full object-contain"
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
