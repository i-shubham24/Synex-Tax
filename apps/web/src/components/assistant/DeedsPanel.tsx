'use client';

import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { DEED_REVIEW_NOTE, DEED_TEMPLATES, missingDeedFields, renderDeedHtml } from '@synextax/tax-engine';
import { areaCls, btnCls, downloadFile, ghostCls, inputCls, openPrintable } from './shared';

/** Deeds, agreements and board resolutions from fixed templates. Runs in the browser; no model. */
export function DeedsPanel() {
  const [id, setId] = useState(DEED_TEMPLATES[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const t = useMemo(() => DEED_TEMPLATES.find((x) => x.id === id)!, [id]);
  const missing = missingDeedFields(t, values);
  const groups = [...new Set(DEED_TEMPLATES.map((x) => x.group))];
  const preview = useMemo(() => t.render(values), [t, values]);
  const fileName = `${t.id}-${new Date().toISOString().slice(0, 10)}.doc`;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,460px)_1fr]">
      <div className="pos-card space-y-3 p-4">
        <label className="block text-[12px] text-pos-ink/60">Template
          <select className={inputCls} value={id} onChange={(e) => setId(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {DEED_TEMPLATES.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {t.fields.map((f) => (
          <label key={`${t.id}-${f.key}`} className="block text-[12px] text-pos-ink/60">{f.label}{f.required ? '' : ' (optional)'}
            {f.type === 'textarea' ? (
              <textarea rows={4} className={areaCls} placeholder={f.hint} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            ) : (
              <input type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} className={inputCls} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
        {missing.length > 0 && <p className="text-[12px] text-pos-ink/55">Still to fill: {missing.join(', ')}. Blank fields print as placeholders.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnCls} onClick={() => openPrintable(renderDeedHtml(t, values))}><Printer className="h-4 w-4" aria-hidden="true" />Printable page</button>
          <button type="button" className={ghostCls} onClick={() => downloadFile(fileName, renderDeedHtml(t, values, { word: true }), 'application/msword')}><Download className="h-4 w-4" aria-hidden="true" />Download .doc</button>
        </div>
      </div>
      <div className="pos-card p-5">
        <p className="mb-3 rounded-[10px] border border-pos-line bg-pos-muted px-3 py-2 text-[12px] text-pos-ink/70">{DEED_REVIEW_NOTE}</p>
        <h3 className="mb-3 text-center text-[16px] font-semibold text-pos-ink">{t.title}</h3>
        <div className="space-y-2 text-[13px] leading-relaxed text-pos-ink/85">
          {preview.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </div>
    </div>
  );
}
