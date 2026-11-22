'use client';

import React from 'react';
import { FileDown } from 'lucide-react';

/** A CSV template with the headings an import recognises and one example row; Excel opens it directly. */
export function TemplateLink({ fileName, headers, example, label = 'Download a template' }: { fileName: string; headers: string[]; example: string[]; label?: string }) {
  const download = () => {
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [headers, example].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <button type="button" onClick={download} className="inline-flex items-center gap-1 text-[12.5px] text-pos-accent hover:underline">
      <FileDown className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
