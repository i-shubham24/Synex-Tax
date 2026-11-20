# SYNEXTAX MASTER ENGINEERING & PRODUCT EXECUTION SPECIFICATION
**Product:** SynexTax (by Synex Labs) | Multi-Tenant Cloud GST & Dual-Act TDS/TCS Compliance SaaS for Indian CA Practices & SMEs
**Current Live UI Baseline:** `https://synex-tax.vercel.app/` (Marketing frontend live; backend, DB, tax engine, workers, and full authenticated workspace to be wired and shipped per this master spec)
**Target Launch Markets:** Amritsar, Tarn Taran, Batala & Punjab CA Practices -> Pan-India
Treat this document as the **single source of truth** for WHAT to build, WHERE to build it, HOW every workflow operates end-to-end, and the EXACT phased execution order. Do not skip invariants or fall back to naive CRUD patterns.
**Strict UI Copywriting Rule:** NEVER use em dashes in any user-facing UI copy, headlines, tooltips, alerts, or marketing text. Use colons, commas, or short crisp sentences instead.
---
## 1. MONOREPO ARCHITECTURE & RUNTIME PINS ("WHERE TO BUILD EVERYTHING")
Upgrade all runtime pins immediately for CERT-In VAPT and cryptographic security compliance:
- **Frontend:** Next.js 16 LTS (`16.4.x`, App Router) + React 19 + Tailwind CSS + Framer Motion / GSAP + TanStack Table v8 / AG Grid (Do NOT use Next.js 15; security EOL is Jan 31, 2027).
- **Backend API & Queue Workers:** Node.js 22 LTS + Fastify (strict TypeScript) + BullMQ + Redis 7.
- **Database:** PostgreSQL 17 (AWS RDS Multi-AZ `ap-south-1` Mumbai + encrypted daily warm DR in `ap-south-2` Hyderabad).
- **Recon & Sanitization Service:** Python 3.12 + FastAPI + Polars + `decimal.Decimal`.
- **Local Desktop Bridge:** Go 1.27.x (`1.27.4+`, modular plugin host, <15 MB binary).
- **FVU Validation Farm:** Isolated, network-egress-blocked Docker containers pinned to Protean Java FVU `v1.2` (TY 2026-27+) and `v9.5` (FY <= 2025-26).
```text
synextax/
├── apps/
│   ├── web/                              # Next.js 16 LTS, React 19, Tailwind, TanStack Table v8 / AG Grid
│   │   ├── app/
│   │   │   ├── (marketing)/              # /, /features/gst, /features/tds, /pricing, /privacy, /terms, /contact
│   │   │   ├── (auth)/                   # /login, /signup, /mfa-setup, /mfa-verify
│   │   │   ├── (dashboard)/              # Protected workspace: /dashboard, /clients, /gst/*, /tds/*, /dsc, /audit, /settings
│   │   │   └── (client-portal)/          # [Phase 2] White-label passwordless SME portal (EN/PA/HI)
│   │   ├── components/                   # Unified Obsidian/White + Sky Cobalt + Emerald primitives, Screen A/B/C/D layouts
│   │   └── lib/                          # API client, Idempotency-Key generator, loopback dsc-agent client, theme state
│   ├── api/                              # Fastify strict TypeScript Modular Monolith (HTTP only, no heavy workers)
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── auth/                 # Argon2id, TOTP MFA, Passkeys, refresh sessions, trial workspace bootstrapper
│   │       │   ├── tenancy/              # 4-tier Client Master (Firm -> Group -> Entity -> GSTIN/TAN), RBAC, 10-min importer
│   │       │   ├── gst/                  # Sales/Purchase, GSTR-1/1A/IFF, 2B Recon trigger, IMS, GSTR-3B, QRMP/PMT-06
│   │       │   ├── tds/                  # Dual-Act router, ITNS 281/281N challans, deductees, Form 141, FVU orchestration, TRACES
│   │       │   ├── dsc/                  # Signing nonces, DSC inventory/expiry radar, batch PAdES signing tracker
│   │       │   ├── dpdp/                 # Multilingual consent vault (en/pa/hi), PII reveal logging, legal holds, CM webhook stub
│   │       │   ├── compliance/           # Runtime feature flags, live portal health status, MCA Rule 3(6) disclosure export
│   │       │   ├── billing/              # SaaS plans, RBI E-Mandate ₹15k logic, SAC 998314 GST invoicing
│   │       │   └── notifications/        # TRAI DLT SMS adapter, 90-day inactivity radar, Email/WhatsApp fallback
│   │       └── plugins/                  # jwt, hmac-rls-context, idempotency, filing-lock (Redis), rate-limiter, audit-meta
│   └── dsc-agent/                        # Go 1.27.x Modular Local Desktop Bridge
│       ├── cmd/agent/                    # Origin-pinned loopback HTTPS (127.0.0.1), single-use backend nonce verification
│       ├── modules/
│       │   ├── dsc/                      # [Phase 1] PKCS#11 + Windows CNG/CryptoAPI + macOS Keychain (FIPS 140-2 & 140-3 L3)
│       │   └── tally-sync/               # [Phase 2 Stub] Local Port 9000 XML-over-HTTP chunked polling + XML error parser
│       └── build/                        # Externalized OV Code Signing, MSIX packaging, macOS notarization scripts (NO keys in repo)
├── workers/
│   ├── queue-worker/                     # Dedicated Node/TS BullMQ worker (GSTN SAVE/RETFILE, IMS poll, DLT SMS, scheduled radars)
│   ├── fvu-v1-2/                         # Isolated Docker container pinned to Protean FVU v1.2 (IT Act 2025, TY 2026-27+)
│   └── fvu-v9-5/                         # Isolated Docker container pinned to Protean FVU v9.5 (IT Act 1961, <= FY 2025-26)
├── services/
│   └── recon-worker/                     # Python 3.12 + FastAPI + Polars (dirty Excel sanitizer + 4-pass fuzzy 2B recon + .err parser)
├── packages/
│   ├── tax-engine/                       # Pure deterministic zero-float math (Decimal.js): rounding, ITC set-off, Rule 86B/88A, validators
│   ├── shared-schemas/                   # Shared Zod DTOs, statutory lookup registries, Form 144 remittance maps, DLT/GSTN enums
│   ├── db/                               # Single source of truth: PostgreSQL 17 migrations (0001..0010), RLS, triggers, test scripts
│   ├── gsp-adapter/                      # Provider-agnostic GspGatewayAdapter + MockGspAdapter (swappable GSP)
│   ├── nic-adapter/                      # [Phase 2] NicGatewayAdapter (NIC IRP 1 <-> IRP 2 failover, 360-min token cache)
│   └── pan-adapter/                      # PanVerificationAdapter (Mock, Aggregator MVP, Protean OPV 750/day direct ready)
├── infra/
│   ├── docker/                           # Local dev Docker Compose (PostgreSQL 17, Redis 7, LocalStack S3/KMS)
│   └── terraform/                        # AWS Mumbai (ap-south-1) + Hyderabad (ap-south-2) warm DR (AWS Activate $5k sized)
├── tests/
│   └── golden-fixtures/                  # Anonymized real CA dirty Excel, 2B JSON, QRMP, ITNS 281N, TRACES .conso fixtures
└── .github/workflows/                    # CI: migration test, RLS isolation test, tax-math regression, SAST & dep audit
2. CRITICAL DATABASE, SECURITY & TAX-MATH INVARIANTS (FIX BEFORE APP CODE)
A. PostgreSQL 17 Schema & Security Fixes (packages/db/migrations/)
Consolidate all migrations cleanly into packages/db/migrations/ (delete duplicate copies in docs/) and fix every red-team finding from 0001 through 0010:
Fix Crashes & Immutability Errors:
Remove current_date from GENERATED ALWAYS ... STORED columns (gst_filings.is_3yr_expired, tds_returns.is_correction_window_expired). Compute dynamically in views/triggers.
Fold 'VALIDATED', 'PORTAL_SAVED', 'CLOSED' directly into 0001 filing_workflow_status enum (and add 'AADHAAR_OTP', 'AADHAAR_ESIGN' to signoff_method).
Fix app.capture_audit_event() (0005): replace broken (OLD ? 'firm_id')/OLD.firm_id on RECORD with safe jsonb extraction from v_old/v_new (NULLIF(v_new ->> 'firm_id', '')::uuid). Strip all keys ending in _ciphertext or _hash before persisting old_data/new_data/diff.
Fix validate_gstr3b_filing_guards() (0006): track explicit last_ims_modified_at timestamptz and check recompute_gstr2b_completed_at < last_ims_modified_at instead of comparing against updated_at.
Fix Security, RLS & VAPT Blockers:
HMAC-Signed Context: Implement app.set_request_context(...) verifying HMAC-SHA256 against app.context_keys (readable ONLY by synextax_rls_helper). app.current_firm_id() must fail closed (NULL) if signature is missing, expired, or forged.
Helper Grants & Search Path: Grant SELECT on public.firms, public.users, public.user_client_assignments, public.entities to synextax_rls_helper. Pin SET search_path = pg_catalog, public, app, audit on EVERY SECURITY DEFINER function.
Audit Schema Protection: Enable + FORCE ROW LEVEL SECURITY on audit.immutable_audit_logs, audit.signing_audit_logs, and audit.pii_access_logs (firm_id = app.current_firm_id()). Change trg_no_update_delete_* to BEFORE UPDATE OR DELETE OR TRUNCATE. Add SECURITY DEFINER writer functions (audit.log_signing_event, audit.log_pii_access) owned by synextax_audit_writer and grant EXECUTE to synextax_app.
Global Tables Read-Only: Revoke INSERT, UPDATE, DELETE on compliance_feature_flags, portal_health_status, dlt_sms_templates from synextax_app (SELECT only). Remove fake hardcoded DLT PE/Template IDs from prod migration 0008 (leave nullable or INACTIVE until live TRAI approval; move test IDs to dev seed).
Maker-Checker & Admin Hardening: Fire enforce_maker_checker_filing_lock() BEFORE INSERT OR UPDATE, verify MANAGER has can_approve_delegated = true, and enforce firms.enforce_segregation_of_duties (checker != maker). Restrict writes on firms, users, user_client_assignments to PARTNER, and protect subscription_invoices.payment_status to billing/system actor only.
Fix Statutory & Period-Locking Logic:
Exact Period Locks (0010): Never use ORDER BY created_at DESC LIMIT 1. Lock gst_invoices_sales if EXISTS a GSTR1, IFF, or GSTR3B row for that exact (firm_id, gst_registration_id, return_period) in ('PORTAL_SAVED','FILED','CLOSED') (permitting is_amendment = true inserts for GSTR1A while GSTR3B is unlocked; add revision_no to sales unique key). Lock gst_invoices_purchase ONLY if EXISTS a locked GSTR3B for that exact period. Lock tds_deductees, tds_challans, and tds_challan_section_allocations ONLY if EXISTS a locked tds_returns row for that exact (tan_registration_id, tax_year, quarter, form_code).
Nov 2026 & TDS Schema Precision: Standardize money to numeric(18,2) and rates to numeric(6,4). Split Composition into mutually exclusive COMPOSITION_10_1 and COMPOSITION_10_2A, add is_rule_14b_eco, is_gst_tds_deductor, and Rule 86B exemption fields to gst_registrations. Add 'GSTR7' to gst_filings.return_type. Allow Protean non-PAN literals ('PANNOTAVBL', 'PANAPPLIED', 'PANINVALID') in tds_deductees.deductee_pan, add correction_sequence to tds_returns unique key, enforce 3-column FK (firm_id, challan_id, section_allocation_id) and composite (firm_id, parent_record_id) FKs, add tds_remittance_tax_codes for Form 144, fix 0004 advisory refs (ADV_687 = 14-digit EWB, ADV_688 = RCMDOM/RCMIMP), add Consent Manager columns to dpdp_consent_records, and attach capture_audit_event() to tds_deductees, tds_challan_section_allocations, and ims_action_queue.
B. Deterministic Tax Math & Validation Library (packages/tax-engine/)
Zero-Float Rule: Never use JS Number, FLOAT, or DOUBLE for money. Use Decimal.js in TS and decimal.Decimal in Python; serialize currency as strings in JSON APIs ("14250.50").
3 Separate Statutory Rounding Functions (100% Unit Tested):
roundGstSection170(amount): Nearest ₹1 (>= 0.50 up, < 0.50 down). Keep line-item CGST/SGST/IGST exact to 2 decimals; apply rounding at final payable/round-off level.
roundItActSection516(amount): Step 1: Drop all paise completely (truncate, NEVER round paise up). Step 2: Round to nearest ₹10 (5-9 up, 0-4 down). Example: 29994.70 -> 29994 -> 29990.
roundInterestBaseRule269(amount): Truncate/round DOWN to nearest multiple of ₹100 for interest base (count any part of a month as a full month: 1% late deduction, 1.5% late deposit).
GST ITC Set-Off & Ledger Validator (GstItcSetOffEngine):
Sec 49A/49B & Rule 88A: Exhaust 100% IGST credit first (solving optimal CGST/SGST split minimizing cash outflow) before touching CGST or SGST credits. Hard-block CGST<->SGST cross-use. Force RCM, interest, and late fees strictly to Cash Ledger.
Rule 86B (1% Cash Rule): Check monthly domestic taxable turnover (strictly excluding exempt and zero-rated exports/SEZ) against ₹50 lakh; if exceeded and no documented entity exemption is active, cap ITC at 99% of output tax liability.
Advisory 643 Negative-Ledger Guards: Block GSTR-3B submission if Table 4(D)(1) reclaim exceeds (Reclaim Ledger opening + Table 4(B)(2)) or if RCM ITC in 4(A)(2)/(3) exceeds (RCM Ledger opening + Table 3.1(d) paid).
Zero-Network Pre-Validators (<50ms client & server): GSTIN 15-char format + Mod-36 checksum + state extraction; PAN 10-char format + 4th-char constitution match against 0020/0021 challans; Place of Supply vs. Supplier State tax-type guard; GST Rule 46 invoice number rules (max 16 chars, alphanumeric + -//); per-FY duplicate detection; Notification 03/2026-CT Credit Note rule (ref required < 2026-11-01, optional >= 2026-11-01); Section 17(5) blocked-credit HSN/SAC tagger.
Concurrency & Idempotency (apps/api/src/plugins/): Require Idempotency-Key UUID on all mutation/filing endpoints, enforce optimistic version checks (HTTP 409 Conflict), and acquire Redis lock lock:filing:{reg_id}:{period} during live portal save/recompute/file jobs.
3. END-TO-END SYSTEM FLOWS ("HOW EVERYTHING WORKS TOGETHER")
Flow 1: Public Homepage -> Auth -> 14-Day Trial -> Smart Paywall
Unauthenticated Public Site (/, /pricing, /privacy, /terms, /contact):
Fix live-site bugs immediately: add missing space in "clarity and compliance so your team can breathe easy", wire real /privacy, /terms, and /contact pages, and ensure stepped pricing cards SSR cleanly.
Signup & MFA (/signup -> /mfa-setup):
User creates firm + Partner account (Argon2id password hash + mandatory TOTP MFA setup + recovery codes).
Immediately upon completion, TrialWorkspaceBootstrapper seeds 2 realistic Amritsar sample clients (1 Textile GSTIN with sample GSTR-2B mismatches + IMS pending items, 1 TAN with TY 2026-27 Form 140 & ITNS 281N challan) and drops the user straight into /dashboard in 14-Day Trial Mode (no credit card required).
Smart Production Paywall (BillingService):
Trial users can test grids, fuzzy 2B recon, IMS tagging, and draft FVU validation on up to 3 real clients.
Active subscription (Solo ₹8,999/yr, Growth Firm ₹15,999/yr, Scale Practice ₹29,999/yr) unlocks: >3 clients, live GSTN RETFILE/IRN submissions, bulk Form 130/131 DSC signing, Staff/Manager seats, and Phase 2 White-Label Client Portal.
RBI E-Mandate ₹15,000 Rule: Plans <= ₹15,000 incl. GST (Solo ₹10,619, or semi-annual installments) enable UPI AutoPay / card e-mandate with 24-hour pre-debit DLT SMS; annual plans > ₹15,000 incl. GST dispatch proactive 15-day renewal invoices with 1-click UPI/NEFT links. All SaaS invoices use SAC 998314 at 18% GST (9% CGST + 9% SGST for Punjab 03, 18% IGST outside Punjab).
Flow 2: Authenticated DB Request Lifecycle (Zero-Leak Multi-Tenancy)
Request hits Fastify (apps/api) with JWT access token -> verified -> loads (firm_id, user_id, role, ip, request_id, user_agent).
Fastify signs a short-lived HMAC-SHA256 context payload using CONTEXT_SIGNING_SECRET (known to API, inaccessible to synextax_app DB role).
Opens a PostgreSQL transaction -> calls SELECT app.set_request_context(...) (SET LOCAL semantics, PgBouncer transaction-pooling safe).
All queries run as synextax_app -> PostgreSQL RLS enforces firm_id AND app.is_entity_visible(entity_id) (Partners see all; Managers/Staff/Clients see assigned entities only) -> every mutation fires app.capture_audit_event() into audit.immutable_audit_logs -> transaction commits.
Flow 3: Monthly GST, 4-Pass Recon, IMS & GSTR-3B Flow
Ingest: CA uploads messy Tally/Busy/Excel sales & purchase sheets -> services/recon-worker (Python Polars) strips merged headers, Indian commas (1,25,000.00), mixed dates -> packages/tax-engine runs <50ms pre-validation -> red error cells fixed inline -> committed to gst_invoices_sales / gst_invoices_purchase.
Outward (GSTR-1 / IFF / GSTR-1A): Auto-builds HSN Summary (Table 12: 4-digit <= ₹5Cr, 6-digit > ₹5Cr) and Doc Summary (Table 13) -> pre-GSTR-1 reconciliation gate -> BullMQ pushes SAVE via GspGatewayAdapter -> period locks at PORTAL_SAVED/FILED. Any post-GSTR-1, pre-3B fix routes strictly through single-shot GSTR-1A (is_amendment = true).
4-Pass Fuzzy 2B Recon (services/recon-worker): Pulls GSTR-2B via GSP (or JSON fallback) -> runs Pass 1 (Exact), Pass 2 (Normalized invoice no: strips /, -, ., spaces, leading zeros, FY tokens like 25-26/2025-26/2526 defeating SALES/25-26/1 vs SALES25261), Pass 3 (Configurable ₹1-₹5 & ±2-day tolerance), Pass 4 (Levenshtein probable match). Flags Section 17(5), Rule 42/43, and Nov 2026 >₹2.5L scrap/e-waste 2% GSTR-7 alerts. Generates 1-click vendor follow-up discrepancy packs.
IMS Console: Dual Recipient/Supplier view -> Accept (A), Reject (R), Pending (P), Reset. Enforces 1-period Credit Note pending cap, prompts for partial/full ITC reversal on CN acceptance, highlights post-acceptance Table 9A/9B amendments with net ITC delta, alerts on 12th of month for unactioned NONE invoices >₹25k before 14th lock, exports GSTN IMS Offline JSON fallback, and hard-locks GSTR-3B if IMS changes post-14th until Recompute GSTR-2B completes.
GSTR-3B Offset & File: Renders Tables 3.1 & 3.2 read-only -> runs GstItcSetOffEngine (Rule 88A + Rule 86B + Advisory 643 Reclaim/RCM Ledger check) -> opens Screen C Sign-Off Modal showing Cash Shortfall / PMT-06 link -> Maker-Checker Partner/Delegated Manager approval -> Local DSC Agent PKCS#7 sign (or EVC OTP) -> RETFILE -> stores immutable ARN + freezes period.
Flow 4: Dual-Act TDS/TCS & Docker FVU Flow
Regime Router: Automatically locks period into IT_ACT_1961 (<= 2026-03-31: Forms 24Q/26Q/27Q/27EQ, ITNS 281 max 1 section, 27EQ due 15th, FVU v9.5) OR IT_ACT_2025 (>= 2026-04-01: Forms 138/140/143/144, ITNS 281N up to 20 sections, Form 143 due 31st, FVU v1.2).
Challan & CSI: Enforces 0020 Company vs 0021 Non-Company and Resident vs Non-Resident splits, Tax Year 2026-27 safeguard warning, explicit FVU v1.2 Interest/Others/Late Fee allocation fields, and CSI OTP pull / .csi upload matching.
Deductee Grid & PAN Guard: Bulk verifies deductee PANs via PanVerificationAdapter (OPERATIVE vs INOPERATIVE 20% risk + non-PAN literals), validates quarter-bound payment dates, Sec 395(1)/Form 121 certificates, Form 144 remapped remittance codes, Rule 269(c) interest, and Sec 427/234E late fees. Supports 1-click "Mark Quarter Nil" and PAN-based Form 141 (Schedules A-E including NRI property Schedule E, 30-day due date).
Isolated FVU Validation & TRACES: Compiles caret-delimited .txt (FH/BH/CD/DD/SD) -> runs inside network-isolated workers/fvu-v1-2 or workers/fvu-v9-5 -> parses .err/.html into clickable UI row jumps -> outputs upload-ready .fvu + Form 27A .zip -> stores accepted 15-digit Token Number -> powers 1-click TRACES KYC Cheat Sheet + .conso C1-C9 diff editor + official TRACES .zip Form 130/131/133 splitting & batch PAdES signing.
Flow 5: Zero-Java Local DSC Signer Loopback Flow (apps/dsc-agent)
apps/api generates a single-use cryptographic signing nonce + SHA-256 payload hash -> sends to apps/web.
apps/web calls https://127.0.0.1:<port>/sign -> Go apps/dsc-agent verifies pinned Origin header (app.synextax.in) + nonce -> calls PKCS#11 / Windows CNG / macOS Keychain -> user enters USB token PIN strictly inside local OS prompt (PIN/private key NEVER leaves token or hits cloud).
Returns signed PKCS#7 or PAdES bytes + certificate metadata (FIPS_140_2 vs FIPS_140_3) -> apps/api verifies signature against nonce & payload hash -> logs via audit.log_signing_event().
4. AUTHENTICATED WORKSPACE UI ARCHITECTURE (apps/web)
Keep 100% visual unity between the Swiss-Grid Marketing Site and the POS-Ergonomic Dashboard:
Unified Palette: Light Mode default (#F8FAFC canvas, #FFFFFF cards, #141619 solid obsidian table headers/totals) + 1-click Obsidian Dark Mode (#0E0F10 canvas, #17191C cards). Brand Accents: Sky Cobalt (#2F8AE0 / #52AEFA) for active tabs/inspector headers/charts, Emerald (#16A34A / #52E888) for Save/Approve/File/Matched, Amber (#F59E0B) for Pending/Expiring, Coral Red (#DC2626) for Mismatch/Shortfall/Revoked.
Fonts: Plus Jakarta Sans for UI + JetBrains Mono (tabular-nums) for all GSTINs, PANs, TANs, invoice numbers, and ₹ figures.
Persistent App Shell:
Slim collapsible Left Rail (72px icon rail / 220px expanded, role-aware): Control Tower, Clients, GST & IMS, Dual-Act TDS, DSC Hub, Audit & DPDP, Settings (+ Phase 2/3 Notices, Practice Billing).
64px Top Utility Bar: Firm & pinned active Client/GSTIN/TAN context pill, centered Cmd+K pill search bar, Live Portal Health pill (GSTN/IRP/TRACES), Local DSC Agent live pill, Trial/Plan meter, Notification Bell, Theme toggle, Profile/MFA menu, and floating rush-day context-aware support widget.
4 Standardized Screen Layouts:
Screen A (/dashboard Control Tower): Top-right 4 period pills + 3-column bento (Tax/ITC Donut, 2x2 KPI tiles, Monthly Outflow Capsule Bar, Wide Filing Velocity Area Spline with peak badge, Urgent Deadlines Ranked List) + 5-tile Statutory Risk Radar Strip (3-Year GST Cliff, Pre-14th IMS Guard, API Token Watch, DSC/FIPS 140-3 Expiry Radar, TDS 2-Year & ISD Radar) + toggleable Filing Matrix & Staff Workload / Partner Approval Queue.
Screen B (/clients, /gst/*, /tds/*, /dsc): Segmented status tabs + inline search + Filter button -> 72% Master TanStack/AG Grid (solid obsidian header, sort chevrons, Excel copy/paste, pastel status pills, dark active pagination) + 28% Floating Right Inspector Card (solid Sky Cobalt header, mini obsidian breakdown table, obsidian total bar, dual bottom action buttons).
Screen C (GSTR-3B Offset & Pre-FVU Sign-Off Modal): Centered 620px modal with split summary header, aligned mono ledger breakdown, bold Coral Red Difference/Shortfall highlight, clearable verification inputs (X + copy/autofill), audit note textarea, and split footer (Discard + Emerald primary action left; utility preview/recompute buttons right).
Screen D (/settings/*): Single framed outer card split into Left Profile/Firm Avatar + vertical chevron tab stack (Firm & Personal, Team & RBAC, DSC Inventory, API & GSP, DPDP & Audit Pack, Subscription & Billing, Security & TOTP MFA) and Right 2-column form with Emerald Save Changes button.
5. PHASED BUILD ROADMAP & EXECUTION PLAN
PHASE 1: MVP LAUNCH (Build Now — Sprints 1 to 6)
Sprint 1 (DB, Security & Live-Site Polish):
Fix 0001–0010 migrations in packages/db/migrations/, run automated PostgreSQL 17 test suite proving HMAC context, RLS isolation (including audit.*), FILED immutability triggers, and ITNS 281N 20-section limits.
Fix synex-tax.vercel.app live-site issues (compliance so space, /privacy, /terms, /contact, SSR pricing cards).
Sprint 2 (Auth, Tenancy, Shell & 10-Min Migration):
Build apps/api Auth (Argon2id + TOTP MFA + sessions), hmac-rls-context, idempotency, filing-lock, and TrialWorkspaceBootstrapper (2 Amritsar sample clients).
Build unified apps/web App Shell, /login, /signup, Control Tower (Screen A + 5 Risk Radars + Filing Matrix), Unified 4-Tier Client Master (Screen B + 6-tab Entity 360° Profile), and 10-Min Migration Toolkit (SmartBiz/CompuTax Excel importer, bulk GSTIN enrichment, TRACES .conso bootstrapper, Partner-only watermarked export guard).
Sprint 3 (Core Tax Engine, Dirty Excel Sanitizer, GST & IMS):
Ship 100% unit-tested packages/tax-engine (3 rounding rules, GstItcSetOffEngine, Rule 86B/88A, Advisory 643, GSTIN/PAN/Rule 46 validators).
Ship services/recon-worker (dirty Excel sanitizer + 4-pass fuzzy GSTR-2B recon) and workers/queue-worker (BullMQ consumers + 12th-of-month unactioned IMS alert).
Ship /gst/import, /gst/gstr1 (GSTR-1/IFF/GSTR-1A + HSN/Doc tables), /gst/recon-2b (side-by-side diff + vendor follow-up packs + 17(5)/Rule 42-43/GSTR-7 alerts), /gst/ims (dual view, CN 1-period lock, partial reversal prompt, post-14th Recompute lock, Offline JSON export), /gst/gstr3b (hard-locked 3.1/3.2, Advisory 643 panel, Screen C Sign-Off modal), and QRMP PMT-06 Fixed Sum vs Self-Assessment calculator.
Sprint 4 (Dual-Act TDS/TCS & Isolated FVU Farm):
Ship /tds/challans (ITNS 281 vs ITNS 281N 20-section allocator, Tax Year 2026-27 guard, CSI OTP/upload match), /tds/deductees (PAN operative verification via PanVerificationAdapter, quarter-bound dates, Sec 395(1)/Form 121, Form 144 remittance codes, Form 138 Q4 salary grid, Nil quarter button, Form 141 Sched A-E helper).
Ship workers/fvu-v1-2 and workers/fvu-v9-5 Docker orchestration, .err clickable parser, .fvu + 27A .zip export, 1-click TRACES KYC Cheat Sheet, and .conso C1-C9 diff studio.
Sprint 5 (Local DSC Agent, Audit Vault, Billing & DLT):
Build Go 1.27 apps/dsc-agent (modules/dsc PKCS#11/CNG/Keychain + modules/tally-sync stub) and /dsc hub (inventory, FIPS 140-3 expiry radar, TRACES .zip Form 130/131/133 splitting & single-PIN batch PAdES signing).
Ship /audit (MCA Rule 3(1) diff viewer, signing trail, PII reveal log, 1-click MCA Rule 3(6) cloud disclosure PDF, DPDP multilingual consent + legal holds + offboarding exporter) and /settings (Screen D: RBAC, Maker-Checker, TRAI DLT templates, RBI E-Mandate ₹15k billing + SAC 998314 invoices).
Sprint 6 (India Cloud Deployment, GSP Sandbox & Hardening):
Deploy via infra/terraform to AWS Mumbai (ap-south-1) + Hyderabad (ap-south-2) DR sized for $5,000 AWS Activate credits; wire live GSP sandbox keys + PanVerificationAdapter; run golden-fixture tests (tests/golden-fixtures/) and CERT-In VAPT checklist.
PHASE 2: GROWTH & LOCAL ECOSYSTEM MOAT (Months 4–6)
apps/dsc-agent/modules/tally-sync: Local Port 9000 XML-over-HTTP TallyPrime/Busy incremental chunked sync with company GSTIN check and XML error parser.
Multi-IRP e-Invoicing (/gst/einvoice) & e-Way Bill Hub (/gst/ewb): packages/nic-adapter (NIC IRP 1 <-> IRP 2 failover, 360-min token cache), 30-day AATO >= ₹10Cr & 24-hour cancel timers, Jan 2027 RCMDOM/RCMIMP self-invoices, 14-digit EWB / 11-digit CEWB support, runtime flag for Advisory 664/668.
White-Label Business Client Portal (/client-portal) & Official WhatsApp Business API: Passwordless OTP portal (EN/PA/HI), document dropzone + PII-redacted OCR bill intake queue, 1-tap client liability approval, automated 2nd/5th/8th doc chasing & filing PDF delivery.
Additional Returns & Vendor Intelligence: Composition CMP-08 & GSTR-4 (10(1) vs 10(2A)), GSTR-6 (ISD), GSTR-7 (2% GST TDS on scrap/e-waste), ITC-04 (Job Work), revised RFD-01 (Dec 2026 capital goods ITC), and Vendor Compliance Health Score (A-D) + Hold GST Portion AP Ledger.
PHASE 3: ENTERPRISE PRACTICE OS (Months 7–12)
Annual Returns: Auto-consolidated GSTR-9 & GSTR-9C books-vs-portal reconciliation workpapers.
Notice & GSTAT Litigation Tracker (/notices): GST ASMT-10/DRC-01, TRACES defaults, CBIC Circular 258 (4 hearings) & ₹10k threshold guard, efiling.gstat.gov.in appeal deadlines + BharatKosh pre-deposit tracker, and workflow-native PII-redacted AI Reply Drafter.
RBI Account Aggregator Integration: Standardized AA JSON bank feed ingestion for 1-click "GST Declared Turnover vs. Bank Credits" health check.
CA Practice Fee Billing & Staff Profitability (/billing-clients): Auto-drafted fee invoices on FILED, embedded UPI collection links in WhatsApp receipts, clerk productivity and error-rate analytics.
6. YOUR IMMEDIATE EXECUTION ORDER RIGHT NOW
Do not try to write everything in one giant unverified dump. Execute strictly in checkpoints and stop for verification after each checkpoint:
Checkpoint 1 (NOW): Upgrade monorepo runtime pins (Next.js 16.4.x, Go 1.27.x, PostgreSQL 17), move & apply all Section 2A fixes into packages/db/migrations/0001..0010, and run an automated verification script against PostgreSQL 17 proving HMAC context, RLS isolation (including audit.*), FILED locks, and ITNS 281N 20-section enforcement. Output the test logs.
Checkpoint 2: Fix the 4 live-site bugs on apps/web (compliance so typo, /privacy, /terms, /contact, SSR pricing) and build packages/tax-engine with full unit tests covering Sec 170, Sec 516, Rule 269(c), Rule 88A/86B, Advisory 643, and GSTIN/PAN/Rule 46 validators.
Checkpoint 3: Wire apps/api Auth/MFA/HMAC-RLS/Trial Bootstrapper + services/recon-worker (dirty Excel + 4-pass fuzzy 2B recon) and connect the live Screen A/B/C/D dashboard workspace in apps/web to real database-backed API endpoints.
Start with Checkpoint 1 now.