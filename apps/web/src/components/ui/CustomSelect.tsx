'use client';

import React, { forwardRef, SelectHTMLAttributes, useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  wrapperClassName?: string;
  iconClassName?: string;
  variant?: 'pill' | 'form' | 'table';
}

/**
 * Optimized Styled Native Select with custom styling, appearance-none, and Lucide ChevronDown.
 */
export const CustomSelect = forwardRef<HTMLSelectElement, CustomSelectProps>(
  ({ className = '', wrapperClassName = '', iconClassName = '', variant = 'form', children, ...props }, ref) => {
    let baseStyle = 'appearance-none bg-pos-surface border border-pos-line text-pos-ink font-medium outline-none transition-all hover:border-pos-accent/60 focus:border-pos-accent focus:ring-1 focus:ring-pos-accent/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

    if (variant === 'pill') {
      baseStyle += ' h-9 rounded-full pl-3.5 pr-8 text-[13px]';
    } else if (variant === 'table') {
      baseStyle += ' h-7 rounded pl-2 pr-6 text-xs font-mono';
    } else {
      baseStyle += ' h-9 rounded-lg pl-3 pr-8 text-xs font-mono';
    }

    return (
      <div className={`relative inline-flex items-center ${wrapperClassName}`}>
        <select
          ref={ref}
          className={`${baseStyle} ${className}`}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-pos-ink/50 transition-colors ${iconClassName}`}
          aria-hidden="true"
        />
      </div>
    );
  }
);

CustomSelect.displayName = 'CustomSelect';

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string;
  description?: string;
}

export interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  variant?: 'pill' | 'form' | 'table';
  id?: string;
}

/**
 * Rich Interactive Dropdown with floating popover, active indicators, and keyboard accessibility.
 */
export function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select option',
  className = '',
  buttonClassName = '',
  menuClassName = '',
  variant = 'form',
  id,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  let buttonVariantStyle = 'h-9 rounded-lg px-3 text-xs font-mono';
  if (variant === 'pill') {
    buttonVariantStyle = 'h-9 rounded-full px-3.5 text-[13px] font-sans';
  } else if (variant === 'table') {
    buttonVariantStyle = 'h-7 rounded px-2 text-xs font-mono';
  }

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center justify-between gap-2 border border-pos-line bg-pos-surface text-pos-ink outline-none transition-colors hover:border-pos-accent/60 focus:border-pos-accent focus:ring-1 focus:ring-pos-accent/30 cursor-pointer w-full text-left font-medium ${buttonVariantStyle} ${buttonClassName}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-pos-ink/50 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-pos-accent' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className={`absolute left-0 top-full z-50 mt-1 min-w-[200px] max-h-60 overflow-y-auto rounded-xl border border-pos-line bg-[#0E0F10] p-1.5 shadow-2xl text-white ${menuClassName}`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#52E888]/15 text-[#52E888] font-semibold'
                    : 'text-slate-300 hover:bg-[#17191C] hover:text-white'
                }`}
              >
                <div className="flex flex-col truncate">
                  <span className="truncate">{opt.label}</span>
                  {opt.description && (
                    <span className="text-[12px] text-slate-400 font-mono truncate">
                      {opt.description}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {opt.badge && (
                    <span className="text-[11px] px-1.5 py-0.2 rounded bg-[#17191C] text-[#52E888] border border-[#24272B] font-mono">
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#52E888]" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
