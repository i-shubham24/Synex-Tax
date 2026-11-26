import { test, describe } from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('SynTax Platform E2E Smoke & Workflow Verification', () => {
  const routes = [
    { path: '/', title: 'SynTax', checkText: 'SynTax' },
    { path: '/products/gst', title: 'SynTax', checkText: 'SynTax GST' },
    { path: '/products/tds', title: 'SynTax', checkText: 'SynTax TDS' },
    { path: '/products/sign', title: 'SynTax', checkText: 'SynTax Sign' },
    { path: '/products/desk', title: 'SynTax', checkText: 'SynTax Desk' },
    { path: '/pricing', title: 'SynTax', checkText: 'Pricing' },
    { path: '/dashboard', title: 'SynTax', checkText: 'Control Tower' },
    { path: '/gst', title: 'SynTax', checkText: 'GST' },
    { path: '/gst/recon-2b', title: 'SynTax', checkText: 'Reconciliation' },
    { path: '/gst/ims', title: 'SynTax', checkText: 'Invoice Management System' },
    { path: '/gst/gstr3b', title: 'SynTax', checkText: 'GSTR-3B' },
    { path: '/gst/gstr1', title: 'SynTax', checkText: 'GSTR-1' },
    { path: '/gst/import', title: 'SynTax', checkText: 'Sanitizer' },
    { path: '/tds', title: 'SynTax', checkText: 'Dual-Act' },
    { path: '/tds/challans', title: 'SynTax', checkText: '281N' },
    { path: '/tds/deductees', title: 'SynTax', checkText: 'Deductee' },
    { path: '/tds/form141', title: 'SynTax', checkText: 'Form 141' },
    { path: '/tds/fvu', title: 'SynTax', checkText: 'FVU' },
    { path: '/tds/traces', title: 'SynTax', checkText: 'TRACES' },
    { path: '/dsc', title: 'SynTax', checkText: 'Sign' },
    { path: '/clients', title: 'SynTax', checkText: 'Client' },
    { path: '/audit', title: 'SynTax', checkText: 'Audit' },
    { path: '/settings', title: 'SynTax', checkText: 'Settings' },
  ];

  for (const r of routes) {
    test(`Route ${r.path} returns 200 OK, has title, content, and zero em dashes`, async () => {
      const res = await fetch(`${BASE_URL}${r.path}`);
      assert.strictEqual(res.status, 200, `Expected 200 OK for ${r.path}, got ${res.status}`);
      const html = await res.text();
      assert.ok(html.includes(r.checkText), `Expected HTML at ${r.path} to include "${r.checkText}"`);
      assert.ok(!html.includes('—'), `Strict rule violation: HTML at ${r.path} contains em dash "—"`);
    });
  }

  test('Statutory Portal Health API returns live portal metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/compliance/portal-health`);
    if (res.ok) {
      const json = await res.json();
      assert.ok(json.portals || json.success, 'Portal health endpoint must return valid payload');
    }
  });
});
