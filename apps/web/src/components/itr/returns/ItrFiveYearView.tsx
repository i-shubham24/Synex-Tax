'use client';

import React from 'react';
import { ASSESSMENT_YEARS, STATUS_LABEL, inr, niceDate, type Ay, type YearRow } from './returnsShared';

/** Five assessment years of one client from its saved returns: income, tax, and refund or payable. */
export function ItrFiveYearView({ rows, current, onPick }: { rows: YearRow[]; current: Ay; onPick: (ay: Ay) => void }) {
  const byAy = new Map(rows.map((r) => [r.assessmentYear, r]));
  const th = 'px-2 py-1.5 text-left text-[12px] font-medium text-pos-ink/70 whitespace-nowrap';
  const td = 'px-2 py-1.5 text-[13px] text-pos-ink whitespace-nowrap';
  const fig = `${td} text-right font-mono tabular-nums`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-pos-line">
            <th className={th}>Assessment year</th><th className={th}>Form</th><th className={th}>Status</th>
            <th className={`${th} text-right`}>Total income</th><th className={`${th} text-right`}>Total tax</th><th className={`${th} text-right`}>Refund or payable</th><th className={th}>Figures</th>
          </tr>
        </thead>
        <tbody>
          {ASSESSMENT_YEARS.map((ay) => {
            const r = byAy.get(ay);
            const on = ay === current;
            return (
              <tr key={ay} className={`border-b border-pos-line/60 ${on ? 'bg-pos-tint' : ''}`}>
                <td className={td}>
                  <button type="button" onClick={() => onPick(ay)} aria-current={on ? 'true' : undefined} className={`text-left ${on ? 'font-semibold text-pos-ink' : 'text-pos-accent hover:underline'}`}>AY {ay}</button>
                </td>
                <td className={td}>{r?.form ?? ''}</td>
                <td className={td}>{r ? `${STATUS_LABEL[r.status]}${r.status === 'FILED' && r.filedOn ? `, ${niceDate(r.filedOn)}` : ''}` : <span className="text-pos-ink/60">{STATUS_LABEL.NONE}</span>}</td>
                <td className={fig}>{r ? inr(r.totalIncome) : ''}</td>
                <td className={fig}>{r ? inr(r.totalTax) : ''}</td>
                <td className={`${fig} ${r && r.payable > 0 ? 'text-[#b91c1c]' : r && r.payable < 0 ? 'text-[#15803d]' : ''}`}>
                  {r ? (r.payable > 0 ? `Pay ${inr(r.payable)}` : r.payable < 0 ? `Refund ${inr(-r.payable)}` : 'Nil') : ''}
                </td>
                <td className={`${td} text-pos-ink/70`}>{r ? (r.basis === 'ENGINE' ? 'Worked here' : 'As filed') : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
