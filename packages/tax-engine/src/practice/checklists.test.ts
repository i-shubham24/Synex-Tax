import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKLIST_TEMPLATES, documentGaps, reminderMessage, whatsappLink } from './checklists.js';

const base = { entityId: 'e', service: 'GST_MONTHLY' as const, periodLabel: 'Oct 2026' };

test('every service has a template', () => {
  for (const [k, v] of Object.entries(CHECKLIST_TEMPLATES)) assert.ok(v.length >= 5, k);
});

test('gaps are grouped as overdue, this week and later; finished checklists drop out', () => {
  const g = documentGaps(
    [
      { ...base, id: 'a', clientName: 'B Co', dueDate: '2026-11-05', items: [{ id: '1', label: 'Sales', status: 'MISSING' }, { id: '2', label: 'Bank', status: 'ACCEPTED' }] },
      { ...base, id: 'b', clientName: 'A Co', dueDate: '2026-11-24', items: [{ id: '3', label: 'Purchase', status: 'REJECTED' }] },
      { ...base, id: 'c', clientName: 'C Co', dueDate: '2026-12-15', items: [{ id: '4', label: 'Sales', status: 'MISSING' }, { id: '5', label: 'EWB', status: 'NOT_NEEDED' }] },
      { ...base, id: 'd', clientName: 'D Co', dueDate: '2026-11-01', items: [{ id: '6', label: 'Sales', status: 'RECEIVED' }] },
    ],
    '2026-11-20',
  );
  assert.deepEqual(g.OVERDUE.map((r) => [r.id, r.outstanding, r.done, r.total]), [['a', ['Sales'], 1, 2]]);
  assert.deepEqual(g.THIS_WEEK.map((r) => r.id), ['b']);
  assert.deepEqual(g.LATER.map((r) => [r.id, r.total]), [['c', 1]]);
});

test('reminder lists what is outstanding and opens in WhatsApp for Indian mobiles only', () => {
  const msg = reminderMessage({ clientName: 'Phulkari Textiles', firmName: 'Verma and Associates', periodLabel: 'Oct 2026', serviceLabel: 'monthly GST return', dueDate: '2026-11-05', outstanding: ['Sales invoices', 'Bank statement'] });
  assert.match(msg, /- Sales invoices\n- Bank statement/);
  assert.match(msg, /5 Nov 2026/);
  assert.ok(!msg.includes('—'));
  assert.equal(whatsappLink('+919814012345', 'hi'), 'https://wa.me/919814012345?text=hi');
  assert.equal(whatsappLink('+14155550100', 'hi'), null);
});
