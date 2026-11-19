/**
 * SynexTax Core Service Interfaces & Adapters
 * Target: TypeScript 5.5+ (Strict Mode)
 * Architecture: Modular Monolith + Isolated Async Workers
 * Regulatory Baseline: November 2026 (Republic of India)
 */

// ============================================================================
// 1. GSP GATEWAY ADAPTER (GSTN Returns, IMS & Ledgers)
// ============================================================================

export type GspProviderCode = 'CYGNET' | 'VAYANA' | 'IRIS' | 'CDSL_VENTURES' | 'MASTERGST' | 'MOCK_SANDBOX';

export type ImsActionState = 'A' | 'R' | 'P' | 'NONE';

export interface GspAuthContext {
  firmId: string;
  gstin: string;
  portalUsername: string;
  stateCode: string;
  authSessionToken?: string;
  sessionExpiresAt?: Date;
  sekBytes?: Uint8Array; // Decrypted 32-byte Session Encryption Key
}

export interface GspOtpRequestResult {
  success: boolean;
  txnId: string;
  maskedMobile: string;
  expiresInSeconds: number;
}

export interface GspOtpAuthResult {
  success: boolean;
  authSessionToken: string;
  sessionExpiresAt: Date;
  sekHex: string;
  error?: {
    code: 'INVALID_OTP' | 'OTP_EXPIRED' | 'REVOKED_BY_TAXPAYER' | 'IP_NOT_WHITELISTED' | 'PORTAL_UNAVAILABLE';
    message: string;
  };
}

export interface Gstr1Payload {
  gstin: string;
  fp: string; // MMYYYY or YYYYMM per GSTN spec
  gt: number;
  cur_gt: number;
  b2b?: Array<{
    ctin: string;
    inv: Array<{
      inum: string;
      idt: string; // DD-MM-YYYY
      val: number;
      pos: string;
      rchrg: 'Y' | 'N';
      inv_typ: 'R' | 'SEZWP' | 'SEZWOP' | 'DE';
      itms: Array<{
        num: number;
        itm_det: {
          rt: number;
          txval: number;
          iamt: number;
          camt: number;
          samt: number;
          csamt: number;
        };
      }>;
    }>;
  }>;
  cdnr?: Array<unknown>;
  b2cl?: Array<unknown>;
  b2cs?: Array<unknown>;
  exp?: Array<unknown>;
  hsn?: Array<unknown>;
}

export interface Gstr3bPayload {
  gstin: string;
  ret_period: string; // MMYYYY
  sup_details: {
    osup_det: { txval: number; iamt: number; camt: number; samt: number; csamt: number }; // Table 3.1(a) HARD-LOCKED
    osup_zero: { txval: number; iamt: number; csamt: number };
    osup_nil_exmp: { txval: number };
    isup_rev: { txval: number; iamt: number; camt: number; samt: number; csamt: number };
    osup_nongst: { txval: number };
  };
  inter_sup: {
    unreg_details: Array<{ pos: string; txval: number; iamt: number }>; // Table 3.2 HARD-LOCKED
    comp_details: Array<{ pos: string; txval: number; iamt: number }>;
    uin_details: Array<{ pos: string; txval: number; iamt: number }>;
  };
  itc_elg: {
    itc_avl: Array<{ ty: string; iamt: number; camt: number; samt: number; csamt: number }>;
    itc_rev: Array<{ ty: string; iamt: number; camt: number; samt: number; csamt: number }>;
    itc_net: { iamt: number; camt: number; samt: number; csamt: number };
    itc_inelg: Array<{ ty: string; iamt: number; camt: number; samt: number; csamt: number }>;
  };
}

export interface ImsActionBatchRequest {
  gstin: string;
  returnPeriod: string; // YYYY-MM
  actions: Array<{
    record2bId: string;
    supplierGstin: string;
    docType: 'INV' | 'CRN' | 'DBN';
    docNum: string;
    docDate: string;
    action: ImsActionState;
    itcReversalAmount?: number; // Mandatory if CRN accepted with partial reversal
  }>;
}

export interface ImsActionBatchResponse {
  referenceId: string;
  status: 'PROCESSED' | 'PARTIAL' | 'REJECTED';
  successfulCount: number;
  failedCount: number;
  failures: Array<{
    docNum: string;
    errorCode: string;
    errorMessage: string;
  }>;
}

export interface GspGatewayAdapter {
  readonly providerCode: GspProviderCode;

  // Session & Authentication
  requestTaxpayerOtp(authContext: GspAuthContext): Promise<GspOtpRequestResult>;
  verifyOtpAndAcquireToken(authContext: GspAuthContext, otp: string, txnId: string): Promise<GspOtpAuthResult>;
  refreshToken(authContext: GspAuthContext): Promise<GspOtpAuthResult>;
  checkApiPairingStatus(gstin: string): Promise<{ isPaired: boolean; pairedGsp?: string; sessionValidUntil?: Date }>;

  // Returns Filing & Submission
  uploadGstr1Payload(authContext: GspAuthContext, payload: Gstr1Payload): Promise<{ referenceId: string; status: 'QUEUED' | 'PROCESSED' }>;
  submitGstr3bPayload(authContext: GspAuthContext, payload: Gstr3bPayload): Promise<{ referenceId: string; status: 'QUEUED' | 'PROCESSED' }>;
  executeRetfileWithDsc(authContext: GspAuthContext, returnType: string, signedPkcs7Payload: string): Promise<{ arn: string; filingDate: Date }>;
  
  // Data Pulls & Recomputation
  downloadGstr2b(authContext: GspAuthContext, returnPeriod: string): Promise<{ records: Array<unknown>; rawPayloadHash: string }>;
  triggerRecomputeGstr2b(authContext: GspAuthContext, returnPeriod: string): Promise<{ status: 'COMPLETED' | 'IN_PROGRESS'; completedAt?: Date }>;

  // IMS Actions
  submitImsActions(authContext: GspAuthContext, request: ImsActionBatchRequest): Promise<ImsActionBatchResponse>;
  exportImsOfflineJson(authContext: GspAuthContext, request: ImsActionBatchRequest): Promise<string>;
}

// ============================================================================
// 2. NIC GATEWAY ADAPTER (e-Invoicing IRP & e-Way Bill)
// ============================================================================

export interface NicAuthContext {
  gstin: string;
  apiSubUserName: string;
  apiSubUserPasswordEncrypted: string;
  irpCluster: 'NIC_IRP_1' | 'NIC_IRP_2';
}

export interface NicSessionCache {
  authToken: string;
  tokenAcquiredAt: Date;
  tokenExpiresAt: Date; // Strict 360-minute non-resetting cache rule
  sekBytes: Uint8Array;
}

export interface IrnGenerationRequest {
  version: '1.1' | '1.2'; // 1.2 includes RCMDOM & RCMIMP fields
  supplyType: 'B2B' | 'SEZWP' | 'SEZWOP' | 'EXPWP' | 'EXPWOP' | 'DEXP' | 'RCMDOM' | 'RCMIMP';
  docDetails: {
    typ: 'INV' | 'CRN' | 'DBN';
    no: string;
    dt: string; // DD/MM/YYYY
  };
  sellerDetails: {
    gstin: string;
    lglNm: string;
    trdNm?: string;
    pos: string;
    addr1: string;
    loc: string;
    pin: number;
    stcd: string;
  };
  buyerDetails: {
    gstin?: string;
    lglNm: string;
    pos: string;
    addr1: string;
    loc: string;
    pin: number;
    stcd: string;
  };
  itemList: Array<{
    slNo: string;
    hsnCd: string;
    qty?: number;
    unitPrice: number;
    totAmt: number;
    taxableAmt: number;
    igstAmt: number;
    cgstAmt: number;
    sgstAmt: number;
    cesAmt: number;
    totItemVal: number;
  }>;
  valDetails: {
    assVal: number;
    cgstVal: number;
    sgstVal: number;
    igstVal: number;
    cesVal: number;
    totInvVal: number;
  };
  ewbDetails?: {
    transId?: string;
    transName?: string;
    transMode?: '1' | '2' | '3' | '4';
    distance: number;
    transDocNo?: string;
    transDocDt?: string;
    vehNo?: string;
    vehType?: 'R' | 'O';
  };
}

export interface IrnGenerationResponse {
  irn: string;
  ackNo: string;
  ackDate: Date;
  signedInvoice: string;
  signedQrCode: string;
  ewbNumber?: string; // 12-digit legacy or 14-digit Jan 2027 format
  ewbValidTill?: Date;
  status: 'ACT';
}

export interface NicGatewayAdapter {
  authenticateSubUser(authContext: NicAuthContext): Promise<NicSessionCache>;
  getValidToken(gstin: string): Promise<NicSessionCache>;
  generateIrn(gstin: string, request: IrnGenerationRequest): Promise<IrnGenerationResponse>;
  cancelIrn(gstin: string, irn: string, cancelReason: '1' | '2' | '3' | '4', remarks: string): Promise<{ cancelledDate: Date }>;
  generateEWayBill(gstin: string, payload: unknown): Promise<{ ewbNumber: string; validUpto: Date }>;
  switchIrpFailover(currentCluster: 'NIC_IRP_1' | 'NIC_IRP_2'): 'NIC_IRP_1' | 'NIC_IRP_2';
}

// ============================================================================
// 3. FVU RUNNER (Isolated Docker FVU Farm)
// ============================================================================

export type FvuEngineVersion = '1.2' | '9.5' | '2.191';

export interface FvuValidationJob {
  jobId: string;
  firmId: string;
  entityId: string;
  returnId: string;
  tan: string;
  statutoryRegime: 'IT_ACT_1961' | 'IT_ACT_2025';
  fvuVersion: FvuEngineVersion;
  formCode: string;
  taxYear: number;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  inputAsciiFileS3Key: string;
  csiFileS3Key?: string;
}

export interface FvuValidationError {
  lineNo: number;
  recordType: 'BH' | 'CD' | 'DD';
  challanDetailRecordNo?: number;
  deducteeDetailRecordNo?: number;
  fieldCode: string;
  errorCode: string;
  errorMessage: string;
  severity: 'FATAL' | 'WARNING';
}

export interface FvuValidationResult {
  jobId: string;
  status: 'SUCCESS' | 'VALIDATION_FAILED' | 'SYSTEM_ERROR';
  fvuOutputFileS3Key?: string;
  warningFileS3Key?: string;
  errors: FvuValidationError[];
  executionTimeMs: number;
  containerId: string;
}

export interface FvuRunner {
  dispatchFvuJob(job: FvuValidationJob): Promise<{ jobId: string; queuePosition: number }>;
  pollFvuJobStatus(jobId: string): Promise<FvuValidationResult>;
  cancelJob(jobId: string): Promise<boolean>;
}

// ============================================================================
// 4. LOCAL DSC SIGNER BRIDGE & PLUGIN HOST (apps/dsc-agent)
// ============================================================================

export interface DscCertificateInfo {
  thumbprintSha256: string;
  subjectDn: string;
  commonName: string;
  holderPan?: string;
  issuerCn: string;
  serialNumberHex: string;
  validFrom: Date;
  validTo: Date;
  isExpired: boolean;
  tokenProfile: 'FIPS_140_2' | 'FIPS_140_3' | 'UNKNOWN';
  keyUsage: string[];
}

export interface SignHashRequest {
  nonce: string; // Single-use backend nonce
  thumbprintSha256: string;
  hashToSignHex: string; // SHA-256 hash of canonical filing JSON
  operationType: 'GST_RETFILE_PKCS7';
}

export interface SignHashResponse {
  nonce: string;
  signatureHex: string; // PKCS#7 detached signature
  signingTime: Date;
}

export interface SignPdfBatchRequest {
  nonce: string;
  thumbprintSha256: string;
  operationType: 'TRACES_BATCH_PADES';
  documents: Array<{
    documentId: string;
    pdfHashHex: string;
    signatureCoordinates: { page: number; x: number; y: number; width: number; height: number };
    signatureReason: string;
    signingLocation: string;
  }>;
}

export interface SignPdfBatchResponse {
  nonce: string;
  signedDocuments: Array<{
    documentId: string;
    signatureHex: string;
    signedAt: Date;
  }>;
}

/**
 * Phase 2 Plugin Host Interface for apps/dsc-agent
 * Allows extending the local desktop binary without rewriting the host.
 */
export interface LocalAgentPlugin {
  readonly pluginId: string;
  readonly name: string;
  readonly version: string;
  initialize(): Promise<boolean>;
  shutdown(): Promise<void>;
}

/**
 * Phase 2 Plugin Stub: Local TallyPrime / Busy Sync Plugin
 */
export interface TallySyncPluginConfig {
  tallyHost: string; // e.g. "127.0.0.1"
  tallyPort: number; // e.g. 9000
  expectedCompanyName: string;
  expectedGstin: string;
  chunkSize: number; // Max vouchers per XML request
  rateLimitDelayMs: number; // Prevent freezing single-threaded Tally listener
}

export interface TallyVoucherChunk {
  voucherType: 'Sales' | 'Purchase' | 'Credit Note' | 'Debit Note' | 'Payment';
  voucherNumber: string;
  date: string;
  partyName: string;
  partyGstin?: string;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalAmount: number;
  guid: string;
}

export interface DscAgentBridge {
  checkAgentHealth(): Promise<{ status: 'OK'; agentVersion: string; fipsDriverLoaded: boolean }>;
  listConnectedCertificates(): Promise<DscCertificateInfo[]>;
  signHash(request: SignHashRequest): Promise<SignHashResponse>;
  signPdfBatch(request: SignPdfBatchRequest): Promise<SignPdfBatchResponse>;
}

// ============================================================================
// 5. PAN VERIFICATION ADAPTER (Inoperative PAN Short-Deduction Prevention)
// ============================================================================

export type AadhaarSeedingStatus = 'OPERATIVE' | 'INOPERATIVE' | 'NOT_APPLICABLE' | 'UNKNOWN';

export interface PanVerificationResult {
  pan: string;
  isValid: boolean;
  fullName?: string;
  fullNameMatchScore?: number; // 0 to 100 fuzzy match score against client books
  category: 'INDIVIDUAL' | 'COMPANY' | 'FIRM' | 'HUF' | 'AOP' | 'TRUST' | 'OTHER';
  aadhaarSeedingStatus: AadhaarSeedingStatus;
  isUnderHigherDeduction206AB: boolean;
  checkedAt: Date;
  providerRef: string;
}

export interface PanVerificationAdapter {
  readonly providerCode: 'MOCK' | 'SANDBOX_SETU' | 'KARZA' | 'PROTEAN_OPV';
  verifySinglePan(pan: string, expectedName?: string): Promise<PanVerificationResult>;
  verifyBulkPan(panList: Array<{ pan: string; name?: string }>): Promise<Map<string, PanVerificationResult>>;
}

// ============================================================================
// 6. TRAI DLT NOTIFICATION SERVICE (Telecom Compliance)
// ============================================================================

export interface DltTemplateMetadata {
  templateCode: string;
  dltPeId: string; // Principal Entity ID (TRAI registered)
  dltTemplateId: string;
  senderHeader: string; // 6-alpha header matching -T or -S
  peTmChainId?: string;
  category: 'TRANSACTIONAL' | 'SERVICE_IMPLICIT' | 'SERVICE_EXPLICIT';
  approvedBody: string;
  allowedVariables: string[];
}

export interface NotificationDispatchRequest {
  recipientMobile: string; // E.164 +91...
  recipientEmail?: string;
  templateCode: string;
  variables: Record<string, string>; // e.g. { "#number#": "648291", "#url#": "https://portal.synextax.in" }
  fallbackChannels?: Array<'WHATSAPP' | 'EMAIL'>;
}

export interface NotificationDispatchResult {
  messageId: string;
  channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  status: 'DELIVERED' | 'SENT' | 'FAILED';
  operatorRef?: string;
  deliveredAt?: Date;
  error?: string;
}

export interface NotificationService {
  dispatchDltSms(request: NotificationDispatchRequest): Promise<NotificationDispatchResult>;
  verifyVariableCompliance(template: DltTemplateMetadata, vars: Record<string, string>): boolean;
  scanInactiveTemplates(): Promise<Array<{ templateCode: string; daysInactive: number }>>;
}

// ============================================================================
// 7. SUBSCRIPTION BILLING SERVICE (RBI E-Mandate 2026 & B2B GST SAC 998314)
// ============================================================================

export interface CreateSubscriptionRequest {
  firmId: string;
  planCode: 'SOLO_PRACTITIONER' | 'GROWTH_FIRM' | 'SCALE_PRACTICE';
  billingCadence: 'ANNUAL' | 'SEMI_ANNUAL' | 'QUARTERLY';
  recipientGstin?: string;
  recipientStateCode: string; // e.g. "03" for Punjab
}

export interface SubscriptionInvoiceResult {
  invoiceNumber: string;
  sacCode: '998314';
  baseAmount: number;
  cgstAmount: number; // 9% if Punjab ("03")
  sgstAmount: number; // 9% if Punjab ("03")
  igstAmount: number; // 18% if out-of-state
  totalAmount: number;
  isRbiAutoDebitEligible: boolean; // True if totalAmount <= 15,000 INR
  paymentRequiredAction: 'AUTO_MANDATE_DEBIT' | 'MANUAL_INVOICE_PAYMENT_LINK';
  paymentLinkUrl?: string;
  rbiPreDebitNotificationRequired: boolean;
}

export interface BillingService {
  createSubscription(request: CreateSubscriptionRequest): Promise<SubscriptionInvoiceResult>;
  dispatchRbiPreDebitNotification(subscriptionId: string): Promise<boolean>;
  generateB2bInvoicePdf(invoiceNumber: string): Promise<Buffer>;
}
