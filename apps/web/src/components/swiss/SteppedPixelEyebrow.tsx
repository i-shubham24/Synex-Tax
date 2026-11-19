'use client';

import React from 'react';

interface SteppedPixelEyebrowProps {
  label?: string;
  text?: string;
  theme?: 'dark' | 'light' | string;
  variant?: 'dark' | 'light' | string;
  color?: 'mint' | 'sky' | string;
  accentColor?: 'mint' | 'sky' | string;
  className?: string;
}

export function SteppedPixelEyebrow({
  label,
  text,
  theme = 'light',
  variant,
  color,
  accentColor,
  className = '',
}: SteppedPixelEyebrowProps) {
  const displayLabel = label || text || '';
  const effectiveTheme = (theme || variant || 'light') as 'dark' | 'light';
  const rawColor = color || accentColor || (effectiveTheme === 'dark' ? 'mint' : 'sky');
  const fillColor = rawColor === 'mint' ? '#52E888' : '#52AEFA';
  const textColor = effectiveTheme === 'dark' ? 'text-slate-300' : 'text-slate-700';

  return (
    <div className={`inline-flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase ${textColor} ${className}`}>
      {/* Signature two-square diagonal stepped pixel icon */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <rect x="0" y="6" width="5" height="5" fill={fillColor} rx="0.5" />
        <rect x="6" y="1" width="5" height="5" fill={fillColor} rx="0.5" />
      </svg>
      <span>{displayLabel}</span>
    </div>
  );
}
