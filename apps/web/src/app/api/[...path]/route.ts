import { NextResponse } from 'next/server';
import {
  taxAuditApplicability,
  writeForm3cd,
  parseDelimited,
  parseConsoFile,
  maskPan,
} from '@synextax/tax-engine';

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

/**
 * Forwards to the API. The built-in demo answers (the mock handlers below) are used ONLY when no
 * API is configured or a bypass flag is set (the Vercel demo). When an API is configured and
 * cannot be reached, the caller gets a 503: showing demo data there would tell a CA that a
 * register was saved, a return reconciled or a PAN reveal logged when nothing happened.
 */
async function tryProxy(request: Request, endpoint: string): Promise<Response | null> {
  if (process.env.BYPASS_POSTGRES === 'true' || process.env.BYPASS_API === 'true') {
    return null;
  }
  const rawApiUrl = process.env.API_URL;
  if (!rawApiUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
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

    return await fetch(targetUrl, init);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      {
        error: 'API_UNAVAILABLE',
        message: timedOut
          ? 'The SynTax server took too long to answer. Nothing was saved; please try again.'
          : 'The SynTax server cannot be reached right now. Nothing was saved; please try again.',
      },
      { status: timedOut ? 504 : 503 },
    );
  } finally {
    clearTimeout(timer);
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

  /* 7. Audit Ledger and Radar */
  if (endpoint === 'v1/audit/chain') {
    return NextResponse.json({
      intact: true,
      checked: 1842,
      firstBroken: null,
      headOk: true,
    });
  }

  if (endpoint === 'v1/audit/expiry-radar') {
    return NextResponse.json({
      expiryItems: [
        {
          id: 'exp-1',
          taxpayerName: 'Amritsar Silk Mills Pvt Ltd',
          gstin: '03AABCA1234F1Z8',
          returnPeriod: '2026-09',
          formType: 'GSTR-1',
          correctionWindowCutoff: '2026-11-30',
          threeYearStatutoryBar: '2029-12-31',
          daysRemainingCorrection: 4,
          status: 'WARNING_CORRECTION_NEAR',
          workflowStatus: 'PENDING_APPROVAL',
        },
        {
          id: 'exp-2',
          taxpayerName: 'Zenith Logistics Delhi',
          gstin: '07AAACZ9876M1Z2',
          returnPeriod: '2026-09',
          formType: 'GSTR-3B',
          correctionWindowCutoff: '2026-11-30',
          threeYearStatutoryBar: '2029-12-31',
          daysRemainingCorrection: 4,
          status: 'WARNING_CORRECTION_NEAR',
          workflowStatus: 'FILED',
        },
        {
          id: 'exp-3',
          taxpayerName: 'Kaler Weaving Works',
          gstin: '03AAACK9988D1Z4',
          returnPeriod: '2026-10',
          formType: 'GSTR-1',
          correctionWindowCutoff: '2026-12-31',
          threeYearStatutoryBar: '2030-01-31',
          daysRemainingCorrection: 35,
          status: 'SAFE',
          workflowStatus: 'DRAFT',
        },
      ],
    });
  }

  if (endpoint.startsWith('v1/audit/logs') || endpoint === 'v1/audit/logs') {
    return NextResponse.json({
      logs: [
        {
          id: 'aud-1',
          eventType: 'GSTR3B_HARD_LOCK_SETOFF',
          performedBy: 'CA Amrinder Verma',
          userRole: 'PARTNER',
          ipAddress: '103.21.244.1',
          timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
          hmacSignature: 'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          details: 'Executed Rule 88A/86B statutory set-off lock for 03AABCA1234F1Z8 (Oct 2026). Cash payable: ₹0.00',
          tableName: 'gst_filings',
        },
        {
          id: 'aud-2',
          eventType: 'IMS_ACTION_ACCEPTED',
          performedBy: 'Shubham Kaler',
          userRole: 'MANAGER',
          ipAddress: '103.21.244.1',
          timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
          hmacSignature: 'sha256-c782b21764da563b65ef34d3f3f2d21fa40a7b4f526b72a6b2c8928374d92e10',
          details: 'Accepted 42 recipient invoices on GSTN IMS. GSTR-2B recompute queued.',
          tableName: 'ims_actions',
        },
        {
          id: 'aud-3',
          eventType: 'DSC_BATCH_PADES_SIGN',
          performedBy: 'CA Amrinder Verma',
          userRole: 'PARTNER',
          ipAddress: '103.21.244.1',
          timestamp: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
          hmacSignature: 'sha256-a94f6f125c7b658b9ef5e921d7b003a29b4e284a1d4891b9204859a72e90c884',
          details: 'Hardware DSC batch PAdES signed 12 Form 16A TDS certificates via Go Desktop Bridge :15850.',
          tableName: 'dsc_signatures',
        },
        {
          id: 'aud-4',
          eventType: 'CLIENT_MIGRATION_IMPORT',
          performedBy: 'Rohan Sharma',
          userRole: 'STAFF',
          ipAddress: '103.21.244.1',
          timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
          hmacSignature: 'sha256-88a291b7f0c43981d3f44810a9c4021bb55e712a39281a9420b9e847c102a901',
          details: 'Migrated 40 clients from legacy Tally XML dump into SynTax 4-tier Client Master.',
          tableName: 'entities',
        },
        {
          id: 'aud-5',
          eventType: 'PII_ACCESS_PAN_REVEAL',
          performedBy: 'CA Amrinder Verma',
          userRole: 'PARTNER',
          ipAddress: '103.21.244.1',
          timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
          hmacSignature: 'sha256-42b781048a91c01e523b19280d941829e701a2b947c901e8284b8109c40281b3',
          details: 'PII pan reveal justified: "MCA Annual Filing ROC Form MGT-7 verification for director PAN"',
          tableName: 'audit_logs',
        },
      ],
    });
  }

  if (endpoint.startsWith('v1/audit')) {
    return NextResponse.json({
      success: true,
      data: [],
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
    const reqUrl = new URL(request.url);
    const reqPeriod = reqUrl.searchParams.get('period') || '2026-10';
    return NextResponse.json({
      success: true,
      data: {
        gstin: '03AAAFCP4821K1Z5',
        period: reqPeriod,
        summary: {
          exactMatchCount: 2,
          fuzzyMatchCount: 1,
          probableMatchCount: 0,
          valueMismatchCount: 0,
          docTypeMismatchCount: 0,
          purchaseNotIn2bCount: 1,
          vendorNotInPrCount: 1,
          outOfPeriodCount: 0,
          totalItcNotAvailable: '0.00',
          totalDeferredItc: '0.00',
        },
      },
    });
  }

  /* 10b. TRACES KYC Cheat Sheet Masked Demo Fallback */
  if (/^v1\/tds\/[^/]+\/traces\/kyc-cheat-sheet\/[^/]+$/.test(endpoint)) {
    const parts = endpoint.split('/');
    return NextResponse.json({
      success: true,
      tan: parts[2],
      token: parts[5],
      taxYear: 2026,
      quarter: 'Q3',
      cheatSheet: {
        prn: parts[5],
        challan: {
          bsrCode: '0021489',
          depositDate: '2026-10-14',
          challanSerial: '00142',
          challanAmount: '24150.00',
        },
        panCombinations: [
          { deducteeId: 'demo-1', pan: maskPan('BQRPS4410K'), masked: true, amount: '1500.00' },
          { deducteeId: 'demo-2', pan: maskPan('AAKFR2290D'), masked: true, amount: '4400.00' },
          { deducteeId: 'demo-3', pan: maskPan('ACMPK8812B'), masked: true, amount: '6000.00' },
        ],
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
  if (endpoint.startsWith('v1/billing/stock')) {
    return NextResponse.json({
      rows: [
        { itemId: 'itm-1', name: 'Raw Silk Yarn Grade A', unit: 'KGS', openingQty: '200.00', openingValue: '240000.00', inwardQty: '350.00', inwardValue: '420000.00', outwardQty: '100.00', returnedQty: '0.00', closingQty: '450.00', averageCost: '1200.00', closingValue: '540000.00', short: false },
        { itemId: 'itm-2', name: 'Jacquard Weaving Fabric', unit: 'MTR', openingQty: '500.00', openingValue: '225000.00', inwardQty: '800.00', inwardValue: '360000.00', outwardQty: '100.00', returnedQty: '0.00', closingQty: '1200.00', averageCost: '450.00', closingValue: '540000.00', short: false },
      ],
    });
  }
  if (endpoint.startsWith('v1/billing/purchases')) {
    return NextResponse.json({
      purchases: [
        { id: 'pur-1', itemName: 'Raw Silk Yarn Grade A', unit: 'KGS', supplierName: 'Kashmir Silk Co-op', supplierGstin: '01AAACK9988D1Z2', billNo: 'PUR/26/102', billDate: '2026-11-10', quantity: '350.00', value: '420000.00', status: 'ACTIVE', version: '1' },
      ],
    });
  }
  if (endpoint.startsWith('v1/billing/gstr1')) {
    return NextResponse.json({
      documents: 1,
      sections: [
        { section: 'B2B', table: '4A', documents: 1, taxable: '150000.00', igst: '7500.00', cgst: '0.00', sgst: '0.00', cess: '0.00' },
      ],
      hsn: [
        { tab: 'B2B', hsn: '500200', uqc: 'KGS', rate: 5, quantity: '100.00', taxable: '150000.00', igst: '7500.00', cgst: '0.00', sgst: '0.00', cess: '0.00', totalValue: '157500.00' },
      ],
      documentsIssued: [
        { nature: 'Invoices for outward supply', series: 'INV/26-27/', from: '041', to: '041', total: 1, cancelled: 0, netIssued: 1 },
      ],
      pushes: [
        { batch: 'bch-1', documents: 1, rows: 1, superseded: false, at: '2026-11-20T10:30:00Z' },
      ],
    });
  }
  if (endpoint.startsWith('v1/billing/documents/')) {
    return NextResponse.json({
      document: {
        id: 'doc-1',
        docType: 'INV',
        docNo: 'INV/26-27/041',
        docDate: '2026-11-20',
        dueDate: '2026-12-05',
        buyerName: 'Delhi Textiles Hub LLP',
        buyerGstin: '07AAACD1122B1Z3',
        buyer: {
          legalName: 'Delhi Textiles Hub LLP',
          tradeName: 'Delhi Textiles Hub',
          gstin: '07AAACD1122B1Z3',
          stateCode: '07',
          address1: 'Plot 44, Okhla Phase III',
          address2: null,
          place: 'New Delhi',
          pincode: '110020',
        },
        placeOfSupply: '07',
        reverseCharge: false,
        interState: true,
        originalDocNo: null,
        originalDocDate: null,
        notes: null,
        section: 'B2B',
        pos: '07',
        taxable: '150000.00',
        tax: '7500.00',
        total: '157500.00',
        invoiceValue: '157500.00',
        irn: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
        ackNo: '11261004829104',
        ackDate: '2026-11-20',
        ewayBillNo: '231098451234',
        ewayBillDate: '2026-11-20',
        status: 'ACTIVE',
        version: '1',
        ewayBillRequired: true,
        consignmentValue: '157500.00',
        transport: {
          mode: 1,
          distanceKm: 450,
          vehicleNo: 'PB02CC9900',
          vehicleType: 'R',
          transporterId: '07AAACD1122B1Z3',
          transporterName: 'Delhi Express Logistics',
        },
        lines: [
          {
            lineNo: 1,
            description: 'Raw Silk Yarn Grade A',
            hsn: '500200',
            isService: false,
            unit: 'KGS',
            quantity: '100.00',
            unitPrice: '1500.00',
            gross: '150000.00',
            discount: '0.00',
            taxable: '150000.00',
            gstRate: 5,
            igst: '7500.00',
            cgst: '0.00',
            sgst: '0.00',
            cess: '0.00',
            total: '157500.00',
          },
        ],
        totals: {
          taxable: '150000.00',
          igst: '7500.00',
          cgst: '0.00',
          sgst: '0.00',
          cess: '0.00',
          tax: '7500.00',
          roundOff: '0.00',
          invoiceValue: '157500.00',
          amountPayable: '157500.00',
        },
      },
      seller: {
        legalName: 'Amritsar Silk Mills Pvt Ltd',
        tradeName: 'Amritsar Silk Mills',
        gstin: '03AABCA1234F1Z8',
        address1: 'Grand Trunk Road, Putlighar',
        address2: null,
        place: 'Amritsar',
        pincode: '143001',
        stateCode: '03',
      },
    });
  }
  if (endpoint.startsWith('v1/billing/documents')) {
    return NextResponse.json({
      documents: [
        {
          id: 'doc-1',
          docType: 'INV',
          docNo: 'INV/26-27/041',
          docDate: '2026-11-20',
          buyerName: 'Delhi Textiles Hub LLP',
          buyerGstin: '07AAACD1122B1Z3',
          section: 'B2B',
          taxable: '150000.00',
          tax: '7500.00',
          invoiceValue: '157500.00',
          status: 'ACTIVE',
          irn: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
          ewbNo: '231098451234',
        },
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
  if (endpoint.endsWith('/pan')) {
    return NextResponse.json({ pan: 'AABCA1234F' });
  }
  if (endpoint.startsWith('v1/itr-returns/register.csv')) {
    const csvContent = [
      'Client Name,PAN,Constitution,Assessment Year,Form,Regime,Status,Ack Number,Filed On,Total Income,Total Tax,Tax Payable',
      '"Amritsar Silk Mills Pvt Ltd","AABCA****F","PRIVATE_LIMITED","2026-27","ITR-3","NEW","READY","984512938471902","2026-07-28",1250000,95000,-5000',
      '"Ranjit Logistics & Infra LLP","AAKFR****D","LLP","2026-27","ITR-5","NEW","FILED","871928491823712","2026-09-14",2480000,744000,0',
      '"Harpreet Singh & Sons HUF","AAFHH****K","HUF","2026-27","ITR-2","NEW","DRAFT","","",850000,42500,2500',
      '"Karamjit Kaur Sole Prop","BFPPK****E","INDIVIDUAL","2026-27","ITR-4","NEW","NONE","","",0,0,0',
    ].join('\n');
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="assessee-register-AY-2026-27.csv"',
      },
    });
  }
  if (endpoint.startsWith('v1/itr-returns/register')) {
    return NextResponse.json({
      assessmentYear: '2026-27',
      canExport: true,
      rows: [
        { entityId: 'ent-1', name: 'Amritsar Silk Mills Pvt Ltd', pan: 'AABCA****F', constitution: 'PRIVATE_LIMITED', returnId: 'demo-return-1', form: 'ITR-3', regime: 'NEW', status: 'READY', ackNumber: '984512938471902', filedOn: '2026-07-28', totalIncome: 1250000, totalTax: 95000, payable: -5000 },
        { entityId: 'ent-2', name: 'Ranjit Logistics & Infra LLP', pan: 'AAKFR****D', constitution: 'LLP', returnId: 'demo-return-2', form: 'ITR-5', regime: 'NEW', status: 'FILED', ackNumber: '871928491823712', filedOn: '2026-09-14', totalIncome: 2480000, totalTax: 744000, payable: 0 },
        { entityId: 'ent-3', name: 'Harpreet Singh & Sons HUF', pan: 'AAFHH****K', constitution: 'HUF', returnId: 'demo-return-3', form: 'ITR-2', regime: 'NEW', status: 'DRAFT', ackNumber: null, filedOn: null, totalIncome: 850000, totalTax: 42500, payable: 2500 },
        { entityId: 'ent-4', name: 'Karamjit Kaur Sole Prop', pan: 'BFPPK****E', constitution: 'INDIVIDUAL', returnId: null, form: 'ITR-4', regime: 'NEW', status: 'NONE', ackNumber: null, filedOn: null, totalIncome: null, totalTax: null, payable: null },
      ],
    });
  }
  if (endpoint.endsWith('/challan')) {
    return NextResponse.json({
      payOn: new Date().toISOString().slice(0, 10),
      assessmentYear: '2026-27',
      pan: 'AABCA****F',
      selfAssessment: {
        majorHead: '0021',
        majorHeadName: 'Income tax other than corporation tax (0021)',
        minorHead: '300',
        minorHeadName: 'Self-assessment tax (300)',
        tax: 2500,
        surcharge: 0,
        cess: 100,
        interest: 0,
        penalty: 0,
        fee: 0,
        others: 0,
        total: 2600,
      },
      nextAdvance: null,
      instalments: [],
      interest: { i234A: 0, i234B: 0, i234C: 0, months234B: 0 },
      notes: ['Challan generated for e-Pay Tax self-assessment.'],
    });
  }
  if (endpoint.startsWith('v1/itr-returns/')) {
    const returnId = endpoint.replace('v1/itr-returns/', '');
    return NextResponse.json({
      id: returnId || 'demo-return-1',
      entityId: 'ent-1',
      entityName: 'Amritsar Silk Mills Pvt Ltd',
      clientName: 'Amritsar Silk Mills Pvt Ltd',
      pan: 'AABCA1234F',
      firmName: 'Verma & Associates CA (Amritsar)',
      assessmentYear: '2026-27',
      form: 'ITR-3',
      regime: 'NEW',
      status: 'DRAFT',
      panMasked: 'AABCA****F',
      notes: 'Salary as per Form 16; interest on fixed deposits as per AIS.',
      summary: {
        totalIncome: 1250000,
        totalTax: 95000,
        taxesPaid: 100000,
        payable: -5000,
        basis: 'ENGINE',
        notes: ['Salary as per Form 16 of both employers.', 'Interest on fixed deposits as per AIS.'],
      },
      input: {
        values: {
          salary: 1100000,
          standardDeduction: 75000,
          houseIncome: 120000,
          otherIncome: 105000,
          advanceTax: 60000,
          tds: 40000,
        },
        ageBand: 'BELOW_60',
        metroCity: false,
      },
      version: '1',
      updatedAt: new Date().toISOString(),
    });
  }
  if (endpoint === 'v1/itr-returns') {
    return NextResponse.json({
      returns: [
        { id: 'demo-return-1', assessmentYear: '2026-27', form: 'ITR-3', regime: 'NEW', status: 'DRAFT', ackNumber: null, filedOn: null, basis: 'ENGINE', totalIncome: 1250000, totalTax: 95000, taxesPaid: 100000, payable: -5000, version: '1' },
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

  /* 10. GST File Register Import, 2B File Upload, Recon, and TRACES Conso-Diff Fallbacks */
  if (/^v1\/gst\/[^/]+\/import\/register-file$/.test(endpoint)) {
    try {
      const reqUrl = new URL(request.url);
      const period = reqUrl.searchParams.get('period') || '2026-10';
      const commit = reqUrl.searchParams.get('commit') === 'true';
      const body = (await request.json()) as { fileName?: string; content?: string };
      const rows = parseDelimited(body.content ?? '');
      const header = rows[0] ?? [];
      const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim().length > 0));
      const col = (nameRe: RegExp) => header.findIndex((h) => nameRe.test(h.toLowerCase()));
      const idxGstin = col(/gstin/);
      const idxName = col(/name|party|supplier/);
      const idxInv = col(/invoice.*(no|num)|doc/);
      const idxDate = col(/date/);
      const idxTaxable = col(/taxable/);
      const idxIgst = col(/igst/);
      const idxCgst = col(/cgst/);
      const idxSgst = col(/sgst/);

      const preview = dataRows.slice(0, 50).map((r, i) => ({
        vendorGstin: (idxGstin >= 0 ? r[idxGstin] : '03AABCP1332L1Z4') || '03AABCP1332L1Z4',
        vendorName: (idxName >= 0 ? r[idxName] : `Supplier ${i + 1}`) || `Supplier ${i + 1}`,
        invoiceNum: (idxInv >= 0 ? r[idxInv] : `INV-${i + 1}`) || `INV-${i + 1}`,
        invoiceDate: (idxDate >= 0 ? r[idxDate] : `${period}-05`) || `${period}-05`,
        taxableValue: (idxTaxable >= 0 ? r[idxTaxable] : '0.00') || '0.00',
        igstAmount: (idxIgst >= 0 ? r[idxIgst] : '0.00') || '0.00',
        cgstAmount: (idxCgst >= 0 ? r[idxCgst] : '0.00') || '0.00',
        sgstAmount: (idxSgst >= 0 ? r[idxSgst] : '0.00') || '0.00',
      }));
      return NextResponse.json(
        {
          success: true,
          committed: commit,
          fileName: body.fileName ?? 'register.csv',
          period,
          headerRow: rows.length > 0 ? 1 : 0,
          rowsRead: dataRows.length,
          readyToImport: dataRows.length,
          duplicates: 0,
          notImported: [],
          skippedLines: 0,
          warnings: [],
          totals: { taxable: '0.00', igst: '0.00', cgst: '0.00', sgst: '0.00' },
          preview,
          insertedCount: commit ? dataRows.length : 0,
        },
        { status: commit ? 201 : 200 },
      );
    } catch (err) {
      return NextResponse.json({ error: 'Invalid File', message: String(err) }, { status: 422 });
    }
  }

  if (/^v1\/gst\/[^/]+\/recon\/2b-file$/.test(endpoint)) {
    try {
      const body = (await request.json()) as { fileName?: string; content?: string };
      const parsed = JSON.parse(body.content ?? '{}') as { data?: { rtnprd?: string; docdata?: Record<string, unknown[]> } };
      const rawPeriod = parsed?.data?.rtnprd;
      const period = rawPeriod && rawPeriod.length === 6 ? `${rawPeriod.slice(2)}-${rawPeriod.slice(0, 2)}` : '2026-10';
      const b2bCount = Array.isArray(parsed?.data?.docdata?.b2b) ? parsed.data!.docdata!.b2b!.length : 0;
      return NextResponse.json(
        {
          success: true,
          fileName: body.fileName ?? 'gstr2b.json',
          period,
          documentsInFile: b2bCount,
          saved: b2bCount,
          itcNotAvailable: 0,
          rejected: [],
          unreadSections: [],
        },
        { status: 201 },
      );
    } catch {
      return NextResponse.json({ error: 'Not A GSTR-2B File', message: 'Invalid JSON file format.' }, { status: 422 });
    }
  }

  if (/^v1\/tds\/[^/]+\/traces\/kyc-cheat-sheet\/[^/]+\/reveal$/.test(endpoint)) {
    const body = (await request.json().catch(() => ({}))) as { accessReason?: string };
    if (!body.accessReason || body.accessReason.trim().length < 5) {
      return NextResponse.json({ error: 'REASON_REQUIRED', message: 'State why full PANs are needed.' }, { status: 400 });
    }
    // Demo mode has no audit log: say so rather than claim the reveal was logged.
    return NextResponse.json({
      success: true,
      logged: false,
      demo: true,
      panCombinations: [
        { deducteeId: 'demo-1', pan: 'BQRPS4410K', masked: false, amount: '1500.00' },
        { deducteeId: 'demo-2', pan: 'AAKFR2290D', masked: false, amount: '4400.00' },
        { deducteeId: 'demo-3', pan: 'ACMPK8812B', masked: false, amount: '6000.00' },
      ],
    });
  }

  if (/^v1\/tds\/[^/]+\/traces\/conso-diff$/.test(endpoint)) {
    const parts = endpoint.split('/');
    const tan = parts[2];
    const body = (await request.json().catch(() => ({}))) as { consoContent?: string };
    const parsed = parseConsoFile(body.consoContent ?? '');
    if (!parsed.fh?.length && !parsed.bh.length && parsed.challans.length === 0) {
      return NextResponse.json({ error: 'INVALID_CONSO_FILE', message: 'File does not match Protean caret-delimited .conso layout.', issues: parsed.issues }, { status: 422 });
    }
    const consoDeductees = parsed.challans.flatMap((c) => c.deductees);
    const missingPanCount = consoDeductees.filter((d) => ['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID'].includes(d.pan)).length;
    return NextResponse.json({
      success: true,
      tan,
      diffs: [
        { recordType: 'C1', description: 'Deductor Header & TAN Match', systemValue: tan, consoValue: parsed.tan || tan, status: parsed.tan && parsed.tan !== tan ? 'DISCREPANCY' : 'MATCHED' },
        { recordType: 'C2', description: 'Challan Records (BSR, Serial, Deposit Date)', systemValue: 'Demo Master', consoValue: `${parsed.challans.length} challans parsed`, status: 'MATCHED' },
        { recordType: 'C3', description: 'Deductee Records & PAN Status', systemValue: 'Demo Master', consoValue: `${consoDeductees.length} deductees (${missingPanCount} PAN placeholders)`, status: missingPanCount > 0 ? 'DISCREPANCY' : 'MATCHED' },
        { recordType: 'C9', description: 'Challan Addition / Short-Deduction Action', systemValue: 'Books baseline', consoValue: missingPanCount > 0 ? 'C3 PAN correction suggested' : 'No additions needed', status: missingPanCount > 0 ? 'DISCREPANCY' : 'MATCHED' },
      ],
      issues: parsed.issues,
      consoSummary: {
        form: parsed.form,
        quarter: parsed.quarter,
        taxYear: parsed.taxYear,
        totalChallans: parsed.challans.length,
        totalDeductees: consoDeductees.length,
      },
      batchSigningPayload: { supportedForms: ['130', '131', '133'], requiresPadesSigning: true, padesReady: false },
    });
  }

  if (/^v1\/gst\/[^/]+\/recon\/2b\/\d{4}-\d{2}$/.test(endpoint)) {
    const period = endpoint.split('/').pop() ?? '2026-10';
    return NextResponse.json({
      success: true,
      period,
      summary: {
        totalPurchaseCount: 4,
        total2bCount: 4,
        exactMatches: 2,
        fuzzyMatches: 1,
        probableMatches: 0,
        valueMismatches: 0,
        docTypeMismatches: 0,
        purchaseNotIn2b: 1,
        datedAfterPeriod: 0,
        vendorNotInPr: 1,
        totalItcClaimed: '84840.00',
        totalItcAvailable: '35640.00',
        totalItcNotAvailable: '11400.00',
        totalItcAtRisk: '37800.00',
        totalUnclaimedItc: '11160.00',
        totalDeferredItc: '0.00',
      },
    });
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
