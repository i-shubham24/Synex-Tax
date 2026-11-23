'use client';

import React, { useState } from 'react';
import { ApplicabilityCheck } from '../../../components/taxAudit/ApplicabilityCheck';
import { Form3cdBuilder, type ReportSeed } from '../../../components/taxAudit/Form3cdBuilder';

/** Tax audit under section 44AB for AY 2026-27: whether it is required, then the Form 3CA or 3CB with 3CD file. Nothing is saved. */
export default function TaxAuditPage() {
  const [seed, setSeed] = useState<ReportSeed | null>(null);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Tax audit</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-pos-ink/60">Audit of the previous year 2025-26 (assessment year 2026-27) under section 44AB of the Income-tax Act, 1961. Check whether an audit is required, then prepare the report file in the Department&apos;s format for upload on the e-filing portal. Figures are sent to the server to check and are not stored.</p>
      </div>
      <ApplicabilityCheck onUse={(r) => setSeed({ clause8: r.clauses, form: r.form ?? undefined })} />
      <Form3cdBuilder seed={seed} />
    </div>
  );
}
