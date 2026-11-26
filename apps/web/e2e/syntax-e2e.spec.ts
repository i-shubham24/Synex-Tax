import { test, expect } from '@playwright/test';

test.describe('SynTax Platform E2E Smoke & Workflow Suite', () => {
  const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

  test.beforeEach(async ({ page }) => {
    // Set localStorage auth session token for authenticated routes
    await page.addInitScript(() => {
      localStorage.setItem('synextax_token', 'demo_partner_token_e2e');
      localStorage.setItem('synextax_dashboard_theme', 'light');
    });
  });

  test('Flow 1: Landing Page Rebrand, Suite Pages & Zero Em Dashes', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await expect(page).toHaveTitle(/SynTax/);

    // Verify Brand Logo Wordmark
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('SynTax');
    expect(bodyText).not.toContain('—'); // Zero em dashes rule

    // Check Product Suite Pages
    await page.goto(`${BASE_URL}/products/gst`);
    await expect(page.locator('h1')).toContainText('SynTax GST');
    expect(await page.textContent('body')).not.toContain('—');

    await page.goto(`${BASE_URL}/products/tds`);
    await expect(page.locator('h1')).toContainText('SynTax TDS');
    expect(await page.textContent('body')).not.toContain('—');

    await page.goto(`${BASE_URL}/products/sign`);
    await expect(page.locator('h1')).toContainText('SynTax Sign');
    expect(await page.textContent('body')).not.toContain('—');

    await page.goto(`${BASE_URL}/products/desk`);
    await expect(page.locator('h1')).toContainText('SynTax Desk');
    expect(await page.textContent('body')).not.toContain('—');

    await page.goto(`${BASE_URL}/pricing`);
    await expect(page.locator('h1')).toContainText('Pricing');
    expect(await page.textContent('body')).not.toContain('—');
  });

  test('Flow 2: Practice Control Tower, Suite Switcher & Top Utility Bar', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    // Top Utility Bar elements
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('text=Portals Live, text=Portals Degraded, text=Portals Slow').first()).toBeVisible({ timeout: 10000 });

    // Suite Switcher Navigation Trigger
    const suiteButton = page.locator('button[title*="Switch Suite"], button:has-text("Control Tower")').first();
    await expect(suiteButton).toBeVisible();

    // Verify zero em dashes on Control Tower
    const dashText = await page.textContent('body');
    expect(dashText).not.toContain('—');
  });

  test('Flow 3: SynTax GST Live Flow (Recon, IMS, GSTR-3B & GSTR-1)', async ({ page }) => {
    // 1. GST Recon 2B
    await page.goto(`${BASE_URL}/gst/recon-2b`);
    await expect(page.locator('text=Reconciliation & Invoice Management System')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Pass 1: Exact')).toBeVisible();
    await expect(page.locator('text=Claimable ITC')).toBeVisible();

    // 2. Native IMS Console
    await page.goto(`${BASE_URL}/gst/ims`);
    await expect(page.locator('h1')).toContainText('Invoice Management System');
    await expect(page.locator('text=Recipient Actions')).toBeVisible();
    await expect(page.locator('text=Supplier View')).toBeVisible();

    // 3. GSTR-3B Hard Set-Off
    await page.goto(`${BASE_URL}/gst/gstr3b`);
    await expect(page.locator('h1')).toContainText('GSTR-3B');
    await expect(page.locator('text=Table 3.1: Tax on Outward Supplies')).toBeVisible();
    await expect(page.locator('text=Table 4: Eligible ITC Available')).toBeVisible();
    await expect(page.locator('text=Advisory 643 Cash Ledger Hard-Lock')).toBeVisible();

    // 4. GSTR-1 / GSTR-1A
    await page.goto(`${BASE_URL}/gst/gstr1`);
    await expect(page.locator('h1')).toContainText('GSTR-1');
    await expect(page.locator('text=Table 12: HSN Summary')).toBeVisible();
    await expect(page.locator('button:has-text("Amend via GSTR-1A")')).toBeVisible();

    // 5. Excel / Tally Dirty Import Sanitizer
    await page.goto(`${BASE_URL}/gst/import`);
    await expect(page.locator('h1')).toContainText('Sanitizer');

    // Verify zero em dashes across GST workspace
    const gstText = await page.textContent('body');
    expect(gstText).not.toContain('—');
  });

  test('Flow 4: SynTax TDS Live Flow (Challans, Deductees, Form 141, FVU & TRACES)', async ({ page }) => {
    // 1. Dual-Act Overview
    await page.goto(`${BASE_URL}/tds`);
    await expect(page.locator('text=Dual-Act TDS')).toBeVisible({ timeout: 10000 });

    // 2. Challans Vault (ITNS 281N)
    await page.goto(`${BASE_URL}/tds/challans`);
    await expect(page.locator('h1')).toContainText('ITNS 281N Challan Allocation Vault');
    await expect(page.locator('text=Multi-Section Allocation')).toBeVisible();

    // 3. Deductees & Operative PAN Guard
    await page.goto(`${BASE_URL}/tds/deductees`);
    await expect(page.locator('h1')).toContainText('Deductee Ledger & Operative PAN Guard');
    await expect(page.locator('button:has-text("Verify All PANs")')).toBeVisible();

    // 4. Form 141 Single-PAN Consolidated Return
    await page.goto(`${BASE_URL}/tds/form141`);
    await expect(page.locator('h1')).toContainText('Form 141');
    await expect(page.locator('text=Sched A')).toBeVisible();
    await expect(page.locator('text=Sched B')).toBeVisible();
    await expect(page.locator('text=Sched C')).toBeVisible();
    await expect(page.locator('text=Sched D')).toBeVisible();
    await expect(page.locator('text=Sched E')).toBeVisible();

    // 5. Isolated FVU Cloud Hub
    await page.goto(`${BASE_URL}/tds/fvu`);
    await expect(page.locator('h1')).toContainText('FVU Validation Hub');
    await expect(page.locator('text=Step 1: Compiler')).toBeVisible();
    await expect(page.locator('text=Step 2: Docker FVU')).toBeVisible();
    await expect(page.locator('text=Record 15-Digit PRN Token')).toBeVisible();

    // 6. TRACES Studio & 1-Click KYC Cheat Sheet
    await page.goto(`${BASE_URL}/tds/traces`);
    await expect(page.locator('h1')).toContainText('TRACES Studio');
    await expect(page.locator('text=C1 to C9 Comparison Matrix')).toBeVisible();

    // Verify zero em dashes across TDS workspace
    const tdsText = await page.textContent('body');
    expect(tdsText).not.toContain('—');
  });

  test('Flow 5: SynTax Sign Hub & Desk Workspaces', async ({ page }) => {
    // 1. Sign Hub
    await page.goto(`${BASE_URL}/dsc`);
    await expect(page.locator('h1')).toContainText('SynTax Sign Hub');
    await expect(page.locator('text=7-Day Expiry Radar')).toBeVisible();
    await expect(page.locator('text=FIPS 140-3 Hardware')).toBeVisible();

    // 2. Client Master 4-Tier & Masked PAN Reveal
    await page.goto(`${BASE_URL}/clients`);
    await expect(page.locator('h2')).toContainText('Client Master Directory');
    await expect(page.locator('text=Permanent PAN:')).toBeVisible();

    // 3. MCA Audit Vault
    await page.goto(`${BASE_URL}/audit`);
    await expect(page.locator('h1')).toContainText('Audit trail');
    await expect(page.locator('text=Change log chain:')).toBeVisible();

    // Verify zero em dashes across Sign and Desk workspaces
    const deskText = await page.textContent('body');
    expect(deskText).not.toContain('—');
  });
});
