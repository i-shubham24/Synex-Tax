'use client';

import React from 'react';

interface MosaicCardProps {
  children: React.ReactNode;
  variant?: 'mint' | 'sky' | 'obsidian' | 'white';
  className?: string;
  onClick?: () => void;
}

export function MosaicCard({
  children,
  variant = 'mint',
  className = '',
  onClick,
}: MosaicCardProps) {
  let baseStyles = 'relative overflow-hidden rounded-[22px] transition-all duration-200 ';
  let bgStyles = '';
  let dotColor = 'rgba(0, 0, 0, 0.08)';

  switch (variant) {
    case 'mint':
      bgStyles = 'bg-gradient-to-br from-[#52E888] via-[#46DC7C] to-[#3BD975] text-[#0E0F10] shadow-xl';
      dotColor = 'rgba(0, 0, 0, 0.08)';
      break;
    case 'sky':
      bgStyles = 'bg-gradient-to-br from-[#52AEFA] via-[#439FE8] to-[#2F8AE0] text-[#0E0F10] shadow-xl';
      dotColor = 'rgba(0, 0, 0, 0.08)';
      break;
    case 'obsidian':
      bgStyles = 'bg-[#17191C] text-white border border-[#24272B] shadow-2xl';
      dotColor = 'rgba(255, 255, 255, 0.07)';
      break;
    case 'white':
      bgStyles = 'bg-white text-[#0E0F10] border border-[#E5E7EB] shadow-lg';
      dotColor = 'rgba(0, 0, 0, 0.04)';
      break;
  }

  return (
    <div
      onClick={onClick}
      className={`${baseStyles} ${bgStyles} ${className} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* Subtle geometric pixel-square pattern overlay (6% to 10% opacity) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, ${dotColor} 1.2px, transparent 1.2px)`,
          backgroundSize: '16px 16px',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
