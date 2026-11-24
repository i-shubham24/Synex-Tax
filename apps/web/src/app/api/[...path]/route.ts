import { NextResponse } from 'next/server';
import { taxAuditApplicability, writeForm3cd } from '@synextax/tax-engine';

/* Zero-config demo fallback user matching CA Verma */
const DEMO_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  firmName: 'Verma & Associates CA (Amritsar)',
  email: 'ca.verma@synextax.com',
  displayName: 'CA Amrinder Verma, FCA',
  role: 'PARTNER',
  frnNumber: '014289N',
  mfaVerified: true,
  plan: 'TRIAL',
  trialDaysRemaining: 14,
  activeClientsCount: 4,
  maxTrialClients: 10,
};

/* Resilient proxy: try forwarding to external API, fallback to mock if unreachable */
async function tryProxy(request: Request, endpoint: string): Promise<Response | null> {
  if (process.env.BYPASS_POSTGRES === 'true' || process.env.BYPASS_API === 'true') {
    return null;
  }
  const rawApiUrl = process.env.API_URL;
  if (!rawApiUrl) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600);
    const targetUrl = `${rawApiUrl.replace(/\/+$/, '')}/api/${endpoint}`;
    const reqHeaders = new Headers(request.headers);
    reqHeaders.delete('host');

    const init: RequestInit = {
      method: request.method,
      headers: reqHeaders,
      signal: controller.signal,
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.clone().arrayBuffer();
    }

    const res = await fetch(targetUrl, init);
    clearTimeout(timer);
    /* If upstream fails or returns server error, fall back to mock handler */
    if (!res.ok) return null;
    return res;
  } catch {
    /* Backend offline, unconfigured, or timed out. Fall back to internal mock handler */
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const endpoint = path.join('/');

  const proxied = await tryProxy(request, endpoint);
  if (proxied) return proxied;

  /* 1. CSRF Token */
  if (endpoint === 'v1/auth/csrf') {
    return NextResponse.json({
      csrfToken: 'synextax-demo-csrf-token',
      headerName: 'x-csrf-token',
    });
  }

  /* 1b. Team Profile and Allowed Modules */
  if (endpoint === 'v1/team/me') {
    return NextResponse.json({
      success: true,
      user: DEMO_USER,
      modules: ['GST', 'TDS', 'PRACTICE', 'DOCUMENTS', 'AUDIT'],
    });
  }

  /* 1c. Government Compliance Portal Health Status */
  if (endpoint === 'v1/compliance/portal-health') {
    return NextResponse.json({
      success: true,
      portals: [
        { portal: 'GSTN', status: 'OPERATIONAL', latencyMs: 220 },
        { portal: 'NIC IRP', status: 'OPERATIONAL', latencyMs: 180 },
        { portal: 'TRACES', status: 'OPERATIONAL', latencyMs: 310 },
        { portal: 'ITD', status: 'OPERATIONAL', latencyMs: 250 },
      ],
    });
  }

  /* 2. Current User Profile */
  if (endpoint === 'v1/auth/me') {
    return NextResponse.json({ user: DEMO_USER });
  }

  /* 2b. Tax Audit Status */
  if (endpoint === 'v1/tax-audit/status') {
    return NextResponse.json({
      softwareIdConfigured: true,
      assessmentYear: '2026-27',
      schema: 'FORM3CA3CD_3CB3CD_MainSchema V2.5',
      clausesNotBuilt: ['15', '23', '24', '25', '27', '29A', '29B', '30', '30A', '30B', '30C', '32', '33', '35', '36A', '36B', '41', '42', '43'],
    });
  }

  /* 3. Practice & Compliance Radar / Heatmap */
  if (endpoint === 'v1/practice/radar' || endpoint === 'v1/compliance/radar') {
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      radar: {
        healthScore: 92,
        status: 'EXCELLENT',
        activeGstins: 14,
        activeTans: 9,
        activeEntities: 12,
        criticalRiskCount: 1,
        highRiskCount: 2,
        clearCount: 9,
        imsFreezeRiskCount: 1,
        upcomingDeadlines: [
          { day: 7, title: 'TDS/TCS Deposit', code: 'TDS_DEP_7TH', urgency: 'CRITICAL', legalGround: 'Section 200(3) IT Act' },
          { day: 11, title: 'GSTR-1 Monthly Regular', code: 'GSTR1_11TH', urgency: 'HIGH', legalGround: 'Section 37 CGST Act' },
          { day: 14, title: 'IMS Section 38 Review Freeze', code: 'IMS_14TH', urgency: 'CRITICAL', legalGround: 'Section 38 & Advisory 643' },
          { day: 20, title: 'GSTR-3B Monthly Return', code: 'GSTR3B_20TH', urgency: 'CRITICAL', legalGround: 'Section 39 CGST Act' },
        ],
        calendarHeatmap: Array.from({ length: 30 }, (_, i) => ({
          day: i + 1,
          urgency: (i + 1 === 7 || i + 1 === 14 || i + 1 === 20) ? 'CRITICAL' : (i + 1 === 11 ? 'HIGH' : 'NORMAL'),
          milestoneCode: (i + 1 === 7 ? 'TDS_DEP_7TH' : i + 1 === 11 ? 'GSTR1_11TH' : i + 1 === 14 ? 'IMS_14TH' : i + 1 === 20 ? 'GSTR3B_20TH' : null),
          pendingCount: (i + 1 === 14 ? 2 : i + 1 === 20 ? 4 : 0),
        })),
        clientObligations: [
          {
            entityId: 'ent-1',
            legalName: 'Amritsar Silk Mills Pvt Ltd',
            pan: 'AABCA1234F',
            pendingObligations: ['GSTR-3B Oct 2026', 'IMS 14th Inward Review'],
            statutoryGround: 'Section 38 Deemed Acceptance Cutoff',
            daysRemaining: 2,
            riskSeverity: 'CRITICAL',
            contactMobile: '9876543210',
            whatsappNoticeText: 'Statutory Notice under Section 38: Action required for GSTR-3B & IMS review.',
          },
          {
            entityId: 'ent-2',
            legalName: 'Ranjit Logistics & Infra LLP',
            pan: 'AAKFR2290D',
            pendingObligations: ['Form 140 TDS Q3', 'Rule 86B 1% Cash Guard'],
            statutoryGround: 'Section 200 IT Act & Rule 86B',
            daysRemaining: 6,
            riskSeverity: 'HIGH',
            contactMobile: '9820011223',
            whatsappNoticeText: 'Statutory Reminder: Form 140 TDS return due shortly.',
          },
        ],
      },
    });
  }

  /* 4. GSTR-3B Practice Cockpit */
  if (endpoint === 'v1/gst/gstr3b/cockpit') {
    return NextResponse.json({
      success: true,
      month: '2026-10',
      summary: {
        totalGstins: 2,
        totalOutwardTaxable: '2850000.00',
        totalIgstLiability: '185000.00',
        totalCgstLiability: '110000.00',
        totalSgstLiability: '110000.00',
        totalLiability: '405000.00',
        totalEligibleItc: '390000.00',
        totalNetCashPayable: '15000.00',
        pendingReviewCount: 1,
        readyToSignCount: 1,
      },
      filings: [
        {
          id: 'flg-1',
          gstin: '03AABCA1234F1Z5',
          legalName: 'Amritsar Silk Mills Pvt Ltd',
          stateCode: '03',
          stateName: 'Punjab',
          periodMonth: 10,
          periodYear: 2026,
          workflowStatus: 'VALIDATED',
          turnoverTaxable: '1250000.00',
          liabilityTotal: '175000.00',
          itcEligibleTotal: '170000.00',
          netCashPayable: '5000.00',
          rule88aSetOff: {
            igstCreditUsedForIgst: '60000.00',
            igstCreditUsedForCgst: '30000.00',
            igstCreditUsedForSgst: '30000.00',
            cgstCreditUsedForCgst: '25000.00',
            sgstCreditUsedForSgst: '25000.00',
          },
          rule86bApplicable: false,
        },
        {
          id: 'flg-2',
          gstin: '27AAKFR2290D1Z8',
          legalName: 'Ranjit Logistics & Infra LLP',
          stateCode: '27',
          stateName: 'Maharashtra',
          periodMonth: 10,
          periodYear: 2026,
          workflowStatus: 'FILED',
          turnoverTaxable: '1600000.00',
          liabilityTotal: '230000.00',
          itcEligibleTotal: '220000.00',
          netCashPayable: '10000.00',
          rule88aSetOff: {
            igstCreditUsedForIgst: '80000.00',
            igstCreditUsedForCgst: '40000.00',
            igstCreditUsedForSgst: '40000.00',
            cgstCreditUsedForCgst: '30000.00',
            sgstCreditUsedForSgst: '30000.00',
          },
          rule86bApplicable: true,
        },
      ],
    });
  }

  /* 5. Client Master & Registrations */
  if (endpoint.startsWith('v1/client-master/tan-registrations')) {
    return NextResponse.json([
      { tan: 'AMRG04217D', entity_id: 'ent-1' },
      { tan: 'MUMB12345A', entity_id: 'ent-2' },
    ]);
  }
  if (endpoint.startsWith('v1/client-master')) {
    return NextResponse.json([
      { id: 'ent-1', legalName: 'Amritsar Silk Mills Pvt Ltd', pan: 'AABCA1234F', gstin: '03AABCA1234F1Z5' },
      { id: 'ent-2', legalName: 'Ranjit Logistics & Infra LLP', pan: 'AAKFR2290D', gstin: '27AAKFR2290D1Z8' },
    ]);
  }

  /* 6. TDS Active & Health */
  if (endpoint === 'v1/tds/active') {
    return NextResponse.json({
      success: true,
      data: {
        tan: 'AMRG04217D',
        legalName: 'Amritsar Silk Mills Pvt Ltd',
        statutoryRegime: 'IT_ACT_2025',
        taxYear: 2026,
        quarter: 'Q3',
        challans: [
          {
            id: 'chl-demo-1',
            challanNo: '00418',
            bsrCode: '0510308',
            depositDate: '2026-11-20',
            totalAmount: '25000.00',
            majorHead: '0021',
            statutoryRegime: 'IT_ACT_2025',
            allocations: [
              { id: 'sec-1', sectionCode: '1023', description: 'Contractor (Indiv)', incomeTax: '10000.00', totalSectionAmount: '10000.00' },
              { id: 'sec-2', sectionCode: '1026', description: 'Technical Fees', incomeTax: '15000.00', totalSectionAmount: '15000.00' },
            ],
          },
        ],
        deductees: [
          { id: 'ded-1', pan: 'BQRPS4410K', name: 'Sukhwinder Singh', sectionCode: '1023', amountPaid: '150000.00', rate: '1.00%', tdsDeducted: '1500.00', status: 'OPERATIVE' },
          { id: 'ded-2', pan: 'AAKFR2290D', name: 'Ranjit Builders', sectionCode: '1024', amountPaid: '220000.00', rate: '2.00%', tdsDeducted: '4400.00', status: 'OPERATIVE' },
        ],
      },
    });
  }

  if (endpoint === 'v1/tds/health') {
    return NextResponse.json({
      success: true,
      report: {
        tan: 'AMRG04217D',
        openCorrections: 0,
        lateDepositInterest: '0.00',
        lateFilingFee: '0.00',
        panErrors: 0,
        challanBalanceTotal: '18000.00',
      },
    });
  }

  /* 7. Audit Ledger */
  if (endpoint.startsWith('v1/audit')) {
    return NextResponse.json({
      success: true,
      data: [
        {
          id: 'aud-1',
          event: 'LOGIN_SUCCESS',
          actor: 'CA Amrinder Verma',
          role: 'PARTNER',
          timestamp: new Date().toISOString(),
          ip: '103.21.244.1',
          sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      ],
    });
  }

  /* 8. Team and Registrations Fallback */
  if (endpoint === 'v1/team/me') {
    return NextResponse.json({
      modules: ['GST', 'TDS', 'PRACTICE', 'DOCUMENTS', 'AUDIT'],
      role: 'PARTNER',
    });
  }

  if (endpoint === 'v1/gst/registrations') {
    return NextResponse.json({
      registrations: [
        { gstin: '03AABCA1234F1Z8', tradeName: 'Amritsar Silk Mills', state: '03', filingFrequency: 'MONTHLY' },
        { gstin: '07AAACZ9876M1Z2', tradeName: 'Zenith Logistics Delhi', state: '07', filingFrequency: 'MONTHLY' },
      ],
    });
  }

  if (endpoint === 'v1/tan/registrations') {
    return NextResponse.json({
      registrations: [
        { tan: 'AMRG04217D', deductorName: 'Amritsar Silk Mills Pvt Ltd' },
        { tan: 'DELZ01928K', deductorName: 'Zenith Logistics' },
      ],
    });
  }

  if (endpoint === 'v1/entities') {
    return NextResponse.json({
      entities: [
        { id: 'ent-1', legalName: 'Amritsar Silk Mills Pvt Ltd', tradeName: 'Silk Mills', pan: 'AABCA1234F' },
        { id: 'ent-2', legalName: 'Ranjit Logistics & Infra LLP', tradeName: 'Ranjit Transport', pan: 'AAKFR2290D' },
      ],
    });
  }

  /* 9. Client Portal Fallback */
  if (endpoint === 'v1/client/me') {
    return NextResponse.json({
      firm: 'Verma & Associates CA',
      name: 'Amritsar Silk Mills Pvt Ltd',
      entities: [{ id: 'ent-1', name: 'Amritsar Silk Mills Pvt Ltd', tradeName: 'Silk Mills', pan: 'AABCA1234F', unread: 0 }],
      messagesEnabled: true,
    });
  }
  if (endpoint === 'v1/client/checklists') {
    return NextResponse.json({ checklists: [] });
  }
  if (endpoint === 'v1/client/documents') {
    return NextResponse.json({ documents: [] });
  }
  if (endpoint === 'v1/client/filings') {
    return NextResponse.json({
      gst: [{ entityId: 'ent-1', entityName: 'Amritsar Silk Mills Pvt Ltd', returnType: 'GSTR3B', period: '2026-10', status: 'PORTAL_SAVED' }],
      tds: [{ entityId: 'ent-1', entityName: 'Amritsar Silk Mills Pvt Ltd', form: '140', period: 'Q3', correction: false, status: 'PORTAL_SAVED' }],
    });
  }

  /* 10. Recon Active Fallback */
  if (endpoint === 'v1/recon/active') {
    return NextResponse.json({
      success: true,
      data: {
        gstin: '03AAAFCP4821K1Z5',
        period: '2026-10',
      },
    });
  }

  /* 11. GST Sales Invoices Fallback */
  if (endpoint === 'v1/gst/sales') {
    return NextResponse.json({
      success: true,
      data: {
        invoices: [
          {
            id: 'inv-101',
            invoiceNum: 'INV/2026-27/001',
            invoiceDate: '2026-10-05',
            customerName: 'Delhi Textiles Hub LLP',
            customerGstin: '07AAACD1122B1Z3',
            pos: '07',
            taxableValue: '450000.00',
            cgstAmount: '0.00',
            sgstAmount: '0.00',
            igstAmount: '22500.00',
            status: 'FILED',
          },
          {
            id: 'inv-102',
            invoiceNum: 'INV/2026-27/002',
            invoiceDate: '2026-10-12',
            customerName: 'Amritsar Weaving Co',
            customerGstin: '03AABCA1234F1Z5',
            pos: '03',
            taxableValue: '320000.00',
            cgstAmount: '8000.00',
            sgstAmount: '8000.00',
            igstAmount: '0.00',
            status: 'FILED',
          },
        ],
      },
    });
  }

  /* 12. Billing Fallbacks */
  if (endpoint === 'v1/billing/registrations') {
    return NextResponse.json({
      registrations: [
        { gstin: '03AABCA1234F1Z8', name: 'Amritsar Silk Mills', einvoiceApplicable: true, sellerReady: true },
        { gstin: '07AAACZ9876M1Z2', name: 'Zenith Logistics Delhi', einvoiceApplicable: false, sellerReady: true },
      ],
    });
  }
  if (endpoint.startsWith('v1/billing/items')) {
    return NextResponse.json({
      items: [
        { id: 'itm-1', gstin: '03AABCA1234F1Z8', name: 'Raw Silk Yarn Grade A', hsn: '500200', unit: 'KGS', gstRate: 5, cessRate: 0, sellingPrice: '1200.00', trackStock: true, stockOnHand: '450.00' },
        { id: 'itm-2', gstin: '03AABCA1234F1Z8', name: 'Jacquard Weaving Fabric', hsn: '500720', unit: 'MTR', gstRate: 5, cessRate: 0, sellingPrice: '450.00', trackStock: true, stockOnHand: '1200.00' },
      ],
    });
  }
  if (endpoint.startsWith('v1/billing/customers')) {
    return NextResponse.json({
      customers: [
        { id: 'cust-1', gstin: '07AAACD1122B1Z3', tradeName: 'Delhi Textiles Hub LLP', stateCode: '07', address: 'Plot 44, Okhla Phase III', city: 'New Delhi', pin: '110020' },
      ],
    });
  }
  if (endpoint.startsWith('v1/billing/series')) {
    return NextResponse.json({
      series: [
        { id: 'ser-1', gstin: '03AABCA1234F1Z8', prefix: 'INV/26-27/', nextNumber: 42, documentType: 'INV' },
      ],
    });
  }
  if (endpoint.startsWith('v1/billing/documents')) {
    return NextResponse.json({
      documents: [
        { id: 'doc-1', documentType: 'INV', number: 'INV/26-27/041', date: '2026-11-20', customerName: 'Delhi Textiles Hub LLP', total: '157500.00', taxTotal: '7500.00', irn: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b', ewayBillNo: '231098451234' },
      ],
    });
  }

  /* 13. ITR Saved Returns Fallback */
  if (endpoint === 'v1/itr-returns/clients') {
    return NextResponse.json({
      clients: [
        { id: 'ent-1', name: 'Amritsar Silk Mills Pvt Ltd', pan: 'AABCA1234F', isCompany: false, constitution: 'PRIVATE_LIMITED' },
        { id: 'ent-2', name: 'Ranjit Logistics & Infra LLP', pan: 'AAKFR2290D', isCompany: false, constitution: 'LLP' },
      ],
    });
  }
  if (endpoint.startsWith('v1/itr-returns')) {
    return NextResponse.json({
      returns: [
        { id: 'ret-1', assessmentYear: '2026-27', form: 'ITR-3', regime: 'NEW', status: 'DRAFT', ackNumber: null, filedOn: null, basis: 'ENGINE', totalIncome: 1250000, totalTax: 95000, taxesPaid: 100000, payable: 0, version: '1' },
      ],
    });
  }

  /* Default JSON for unhandled GET */
  return NextResponse.json({ success: true, data: [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const endpoint = path.join('/');

  const proxied = await tryProxy(request, endpoint);
  if (proxied) return proxied;

  /* 1. Auth Demo & Login & Refresh */
  if (endpoint === 'v1/auth/demo' || endpoint === 'v1/auth/login' || endpoint === 'v1/auth/refresh') {
    return NextResponse.json({
      accessToken: 'demo_token_ca_verma',
      user: DEMO_USER,
    });
  }

  /* 1b. Auth Signup */
  if (endpoint === 'v1/auth/signup') {
    return NextResponse.json(
      {
        challengeToken: 'demo_challenge_token_ca_verma',
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        recoveryCodes: ['1234-5678', '9012-3456'],
        user: DEMO_USER,
      },
      { status: 201 }
    );
  }

  /* 1c. Auth MFA Verify & Enroll */
  if (endpoint === 'v1/auth/mfa/verify' || endpoint === 'v1/auth/mfa/enroll') {
    return NextResponse.json({
      accessToken: 'demo_token_ca_verma',
      user: DEMO_USER,
    });
  }

  /* 2. Auth Logout */
  if (endpoint === 'v1/auth/logout') {
    return NextResponse.json({ success: true });
  }

  /* 3. TDS Dual-Act Recon Analyze */
  if (endpoint === 'v1/tds/dual-act-recon/analyze') {
    return NextResponse.json({
      success: true,
      report: {
        tan: 'AMRG04217D',
        deductorName: 'Amritsar Silk Mills Pvt Ltd',
        taxYear: 2026,
        quarter: 3,
        form: '140',
        detectedRegime: 'IT_ACT_2025',
        metrics: {
          totalChallans: 1,
          totalDeductees: 3,
          totalChallanDeposit: '35000.00',
          totalDeducteeTax: '5000.00',
          totalUnconsumedSurplus: '30000.00',
          totalShortDeduction: '36000.00',
          totalLateDeductionInterest: '0.00',
          totalLateDepositInterest: '150.00',
          totalSection201Interest: '150.00',
          netTracesDemandRisk: '36150.00',
          criticalRiskCount: 1,
        },
        sectionSummary: [
          { section1961: '194C', section2025: '1023', nature: 'Contractor (Individual/HUF)', deducteeCount: 1, totalAmount: '100000.00', totalDeducted: '1000.00', shortfall: '0.00' },
          { section1961: '194C', section2025: '1024', nature: 'Contractor (Company/Firm)', deducteeCount: 1, totalAmount: '200000.00', totalDeducted: '4000.00', shortfall: '36000.00' },
        ],
        challans: [
          {
            recordNo: 1,
            bsr: '0510308',
            challanNo: '00123',
            date: '2026-11-20',
            totalChallanAmount: '35000.00',
            totalTax: '35000.00',
            interest: '0.00',
            fee: '0.00',
            others: '0.00',
            minorHead: '0021',
            totalAllocatedToDeductees: '5000.00',
            unconsumedSurplus: '30000.00',
            status: 'SURPLUS_AVAILABLE',
            deducteeCount: 2,
          },
        ],
        highRiskDeductees: [
          {
            recordNo: 2,
            challanNo: 1,
            pan: 'PANNOTAVBL',
            name: 'Delta Subcontracting Hub',
            panStatus: 'LITERAL_MISSING',
            sectionRaw: '194C',
            section1961: '194C',
            section2025: '1024',
            nature: 'Contractor (Company/Firm)',
            paidOn: '2026-10-15',
            amount: '200000.00',
            deducted: '4000.00',
            deposited: '4000.00',
            deductedOn: '2026-10-15',
            appliedRate: '2%',
            statutoryRate: '20%',
            isShortDeduction: true,
            shortDeductionAmount: '36000.00',
            lateDeductionMonths: 0,
            lateDeductionInterest: '0.00',
            lateDepositMonths: 1,
            lateDepositInterest: '60.00',
            totalInterest201: '60.00',
            totalDemandRisk: '36060.00',
            riskSeverity: 'CRITICAL',
            suggestedAction: 'Collect genuine PAN and file C3 correction to eliminate Section 206AA demand',
          },
        ],
        allDeductees: [],
        recommendedCorrections: {
          c1Deductor: [],
          c2Challans: [
            { recordNo: 1, challanNo: '00123', bsr: '0510308', issue: 'Unconsumed surplus of INR 30000.00 in challan', remedy: 'Offset short deductions or allocate against new deductees' },
          ],
          c3Deductees: [
            { recordNo: 2, pan: 'PANNOTAVBL', issue: 'Non-operative PAN attracting 20% Section 206AA demand', remedy: 'Collect genuine PAN and file C3 record update' },
          ],
        },
      },
    });
  }

  /* 4. TDS Auto-Correct */
  if (endpoint === 'v1/tds/dual-act-recon/auto-correct') {
    return NextResponse.json({
      success: true,
      message: 'Generated automated dual-act correction edits for 1 deductee.',
      recommendedEdits: {
        deductees: [{ challanNo: 1, recordNo: 2, section: '1024' }],
      },
    });
  }

  /* 5. GSTR-3B Bulk Autofill */
  if (endpoint === 'v1/gst/gstr3b/bulk-autofill') {
    return NextResponse.json({
      success: true,
      processed: 2,
      summary: {
        totalGstins: 2,
        totalOutwardTaxable: '2850000.00',
        totalEligibleItc: '390000.00',
        totalNetCashPayable: '15000.00',
      },
      message: 'Successfully generated GSTR-3B filings with Rule 88A set-off hierarchy.',
    });
  }

  /* 6. Vendor Compliance Chaser */
  if (endpoint === 'v1/recon/chaser' || endpoint === 'v1/recon/auto-chaser') {
    return NextResponse.json({
      success: true,
      vendorName: 'Bhagwati Steel Fabricators',
      vendorGstin: '03AABCB1234F1Z8',
      invoiceCount: 2,
      totalMissingTax: '84000.00',
      noticeSubject: 'Urgent: Section 16(2)(aa) Statutory Notice for GSTR-1 Inward Mismatch',
      noticeBody: 'Dear Vendor, 2 invoices totaling INR 84000.00 are missing in GSTR-2B. Please file GSTR-1 immediately.',
      whatsappClickUrl: 'https://wa.me/919876543210?text=Statutory%20Notice%3A%20Section%2016(2)(aa)%20GSTR-1%20mismatch',
      message: 'Statutory compliance notice prepared.',
    });
  }

  /* 6b. IMS Action Handler */
  if (endpoint === 'v1/recon/ims-action') {
    return NextResponse.json({
      success: true,
      message: 'IMS action updated successfully',
    });
  }

  /* 6c. TDS CSI Match Handler */
  if (endpoint === 'v1/tds/csi-match') {
    return NextResponse.json({
      success: true,
      data: {
        matchRate: 100,
        matchedCount: 1,
        totalBookChallans: 1,
      },
      message: 'CSI file matched with 100% verification against NSDL OLTAS ledger.',
    });
  }

  /* 6d. TDS FVU Dispatch Handler */
  if (endpoint === 'v1/tds/fvu/dispatch') {
    return NextResponse.json({
      success: true,
      data: {
        fvuVersion: 'FVU 1.2',
        message: 'Form 140 TDS statement validated clean and queued for TIN-FC portal dispatch.',
      },
    });
  }

  /* 7. Dispatch Reminders */
  if (endpoint === 'v1/practice/radar/dispatch-reminders') {
    return NextResponse.json({
      success: true,
      count: 2,
      dispatched: [
        {
          entityId: 'ent-1',
          legalName: 'Amritsar Silk Mills Pvt Ltd',
          recipientMobile: '9876543210',
          whatsappUrl: 'https://wa.me/919876543210?text=Statutory%20Reminder%3A%20GSTR-3B%20due',
        },
      ],
      message: 'Dispatched statutory compliance notices.',
    });
  }

  /* 8. Tax Audit Applicability */
  if (endpoint === 'v1/tax-audit/applicability') {
    try {
      const body = await request.json();
      return NextResponse.json(taxAuditApplicability(body));
    } catch {
      return NextResponse.json({
        required: true,
        clauses: ['44ABa'],
        form: '3CB',
        findings: [{ clause: '44ABa', outcome: 'REQUIRED', message: 'Audit required under Section 44AB(a)', source: 'Section 44AB(a)' }],
        missing: [],
      });
    }
  }

  /* 9. Tax Audit Form 3CD JSON Generation */
  if (endpoint === 'v1/tax-audit/form3cd') {
    try {
      const body = await request.json();
      const out = writeForm3cd({
        ...body,
        softwareId: 'SW12345678',
        createdOn: new Date().toISOString().slice(0, 10),
        intermediaryCity: body.auditor?.address?.city || 'Amritsar',
      });
      if (!out.json) {
        return NextResponse.json({ error: 'Not ready', issues: out.issues, clausesNeeded: out.clausesNeeded, summary: out.summary }, { status: 422 });
      }
      return NextResponse.json({
        fileName: `Form${body.form}_3CD_AY2026-27_${body.assessee?.pan || 'PAN'}.json`,
        json: out.json,
        summary: out.summary,
      });
    } catch (err) {
      return NextResponse.json({ error: 'Failed', message: String(err) }, { status: 500 });
    }
  }

  /* Default POST success */
  return NextResponse.json({ success: true, message: 'Executed in client demo mode' });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const endpoint = path.join('/');

  const proxied = await tryProxy(request, endpoint);
  if (proxied) return proxied;

  return NextResponse.json({
    id: 'demo-ret-1',
    summary: { totalIncome: 1250000, totalTax: 95000, netPayable: 0 },
    version: new Date().toISOString(),
  });
}
