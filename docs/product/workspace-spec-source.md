To give you an exhaustive, PRD-grade blueprint of the entire working application without cutting corners, I am breaking the authenticated workspace down into three detailed parts, followed by your downloadable Master PRD (.md / .docx) to cross-verify against what Claude is building:
Part 1 (This Response): Persistent App Shell, Global Power Tools, CA Control Tower (/dashboard), Unified 4-Tier Client Master (/clients), and the 10-Minute Migration Toolkit.
Part 2 (Next): Complete GST, IMS, 4-Pass Fuzzy 2B Recon, e-Invoicing, e-Way Bill & Dirty-Data/Tally Ingestion Suite (/gst/*).
Part 3: Complete Dual-Act TDS/TCS Engine (1961 + 2025 Act), FVU Validation Hub, TRACES Tools (/tds/*), Local DSC Signer Hub (/dsc), White-Label Client Portal, Notice/GSTAT Tracker, CA Fee Billing, and Audit/DPDP/Settings (/settings).
Every feature below is tagged as [Phase 1 MVP], [Phase 2], or [Phase 3] so you can verify exact scope boundaries immediately.
1. Persistent Workspace Shell & Global Power Tools (Available on Every Screen)
Every authenticated route shares a high-density, low-friction shell combining your unified Obsidian/White + Sky Cobalt + Emerald visual system with POS-grade operational ergonomics.
A. Slim Collapsible Left Navigation Rail (72px collapsed / 220px expanded)
Role-aware navigation (for example, STAFF users never see Firm Billing or Partner Admin modules, while CLIENT users only see the White-Label Client Portal):
Control Tower (/dashboard) [Phase 1 MVP]: Firm-wide compliance overview, analytics, and risk radars.
Client Master (/clients) [Phase 1 MVP]: 4-tier hierarchy (Groups, PAN Entities, GSTINs, TANs) and migration tools.
GST & IMS Suite (/gst) [Phase 1 MVP]: Sales/Purchase grids, GSTR-1/1A/3B, Fuzzy 2B Recon, IMS Console, and Phase 2 e-Invoice/EWB.
Dual-Act TDS/TCS (/tds) [Phase 1 MVP]: Forms 138/140/143/144 + legacy 24Q/26Q/27Q/27EQ, ITNS 281N challans, FVU farm, TRACES tools.
DSC & Signer Hub (/dsc) [Phase 1 MVP]: Local USB token monitor, FIPS 140-3 expiry radar, and bulk Form 130/131 PDF signing.
Notices & Litigation (/notices) [Phase 3]: GST ASMT-10/DRC-01 tracker, TRACES default tracker, GSTAT appeal calendar, PII-redacted AI reply drafter.
Practice Billing (/billing-clients) [Phase 3]: Auto-drafted CA fee invoices, UPI collection links, and staff productivity metrics.
Audit, DPDP & Reports (/audit) [Phase 1 MVP]: MCA Rule 3(1) edit logs, signing logs, PII reveal logs, MCA Rule 3(6) cloud disclosure PDF.
Team & Settings (/settings) [Phase 1 MVP]: Firm profile, RBAC assignments, Maker-Checker rules, GSP/API status, and SaaS subscription billing.
B. Top Utility Bar (64px Sticky Header)
Firm & Active Client Context Switcher [Phase 1 MVP]: Displays the CA firm name on the left. Once a user selects a specific client (e.g., Guru Nanak Textiles Pvt. Ltd. | 03AABCG1234F1Z5), a pinned context pill stays visible across GST, TDS, and DSC modules so staff never accidentally file data under the wrong client.
Global Cmd+K Pill Command Bar [Phase 1 MVP]: Centered pill search bar supporting instant fuzzy search across Client Names, GSTINs, PANs, TANs, Invoice Numbers, Challan BSR/CINs, and direct keyboard actions (such as typing > file 3b or > import tally).
Live Government Portal Health Pill [Phase 1 MVP]: Compact status indicator reading from portal_health_status showing live green/amber/red dots and latency for GSTN, NIC IRP, TRACES, and ITD e-Filing, preventing panic support calls when government portals slow down on the 20th.
Local DSC Agent Live Pill [Phase 1 MVP]: Polls loopback 127.0.0.1 to show real-time hardware status (DSC Ready: ePass2003 FIPS 140-3 in green, or Agent Offline in amber with a 1-click installer/reconnect popover).
Trial / Plan Meter Badge [Phase 1 MVP]: For 14-day trial firms, shows remaining days and client slots (2/3 Real Clients Used) with an unobtrusive Activate Plan drawer.
Actionable Notification Center [Phase 1 MVP]: Categorized alert bell covering: (a) GSTN token revocations, (b) FVU v1.2/v9.5 job completions/failures, (c) Maker-Checker approval requests from staff, (d) 48-hour pre-14th IMS deemed-acceptance warnings, and (e) Client Portal document uploads [Phase 2].
Light/Obsidian Dark Toggle & Profile/MFA Menu [Phase 1 MVP]: Instant daytime/nighttime theme switcher plus user role badge, session lock, and TOTP MFA status.
Context-Aware Rush-Day Support Widget [Phase 1 MVP]: Floating bottom-right help trigger that automatically captures the current route, active client ID (redacted of secrets), and latest GSTN/FVU error payload into a support ticket or WhatsApp escalation for your Amritsar support desk.
2. Module 1: CA Control Tower (/dashboard)
Built directly on your 3-column bento analytics blueprint, the Control Tower is the CA Partner's morning command center to answer one question in 10 seconds: "What is due, what is stuck, and where is my firm's compliance risk today?"
A. Scope & Time Filter Bar [Phase 1 MVP]
Top-right segmented period pills: This Month, Q3 TY 26-27, FY 2026-27, All Pending (styled with solid Sky Cobalt active pill).
Secondary filter chips (visible to Partners and Managers): filter the entire dashboard by Assigned Staff Member, Client Group, or Filing Category (Regular Monthly, QRMP, Composition, TDS).
B. 3-Column Bento Analytics Grid [Phase 1 MVP]
Card 1 (Top-Left): Tax & ITC Composition Donut Chart: Multi-segment donut showing firm-wide aggregate IGST, CGST, SGST, RCM Cash, and TDS Deposited for the selected period, with bold tabular center total (Net Tax ₹ 12,54,000) and color-coded right legend.
Card 2 (Top-Center): 2x2 Actionable KPI Grid: Four crisp metric cards where clicking any card jumps straight to the filtered work queue:
Returns Due (count of unfiled GST + TDS returns in the active period)
Returns Filed (count completed with ARN/Token logged)
ITC Reconciled (total matched ₹ ITC across active GSTINs)
Pending Mismatches (total ₹ at risk in GSTR-2B vs. Purchase Register or open TDS defaults)
Card 3 (Top-Right): Monthly Outflow Capsule Bar Chart: Vertical rounded-top capsule bars comparing monthly ITC Utilized vs. Cash Paid across the 12 months of the Financial/Tax Year.
Card 4 (Bottom-Left Wide): Filing Velocity & Tax Trend Area Spline: Smooth gradient spline tracking daily filings completed across the month (1st to 31st) with a floating Sky Cobalt peak callout badge (helps Partners spot whether staff are leaving 80% of filings to the 19th/20th).
Card 5 (Bottom-Right): Urgent Deadlines & Top At-Risk Clients: Ranked scrollable list showing entity monogram, Client Name, GSTIN/TAN, statutory due date countdown, and right-aligned pending amount or status pill, with a View All link.
C. Statutory Risk Radar Strip (Your Unfair Competitive Moat)
Immediately below the bento charts sits a collapsible 5-tile Compliance Early Warning Bar that automatically scans the entire firm database:
Radar Tile | What It Automatically Detects | Phase
3-Year GST Return Cliff | Pulls from v_gst_return_expiry_radar: flags any unfiled GSTR-1/3B/4/9 within 90 days of GSTN's permanent 3-year portal lock. | [Phase 1 MVP]
Pre-14th IMS Guard | Flags unactioned (NONE) supplier invoices > ₹25,000 or Section 17(5) tagged sitting in IMS 48 hours before the 14th deemed-acceptance lock. | [Phase 1 MVP]
API Token & Revocation Watch | Lists GSTINs whose 6-hour to 30-day GSTN session expires within 24 hours or was manually set to REVOKED_BY_TAXPAYER. | [Phase 1 MVP]
DSC Expiry & FIPS 140-3 Radar | Flags client DSCs expiring in 45/15/7 days and explicitly tags expiring FIPS 140-2 USB tokens that require new FIPS 140-3 Level 3 hardware on renewal. | [Phase 1 MVP]
TDS 2-Year Correction & ISD Radar | Highlights open TDS quarters nearing the 2025 Act 2-year correction wall plus multi-GSTIN PANs flagged by v_isd_radar lacking mandatory ISD registration. | [Phase 1 MVP]

D. Firm-Wide Compliance Matrix & Staff Workload View [Phase 1 MVP]
A dedicated toggleable tab right inside the Control Tower (Analytics View vs. Filing Matrix View):
Filing Matrix: Spreadsheet grid listing all assigned clients as rows and statutory obligations as columns (GSTR-1, IMS/2B, GSTR-3B, TDS Challan, Qtr TDS). Each cell displays a compact color-coded state chip (Draft, Validated, Reconciled, Client Approved, Portal Saved, Filed) with last updated timestamp and assigned clerk initials. Clicking any cell opens that exact client and return period.
Partner Approval Queue Widget: Dedicated drawer listing every return waiting in CLIENT_APPROVED or RECONCILED state requiring Partner Maker-Checker sign-off.
Staff Workload Bars (Partner/Manager Only): Shows per-clerk completion ratio (e.g., Harpreet Kaur: 38/45 GSTR-3Bs filed, 4 pending client data, 3 awaiting Partner sign-off).
3. Module 2: Unified 4-Tier Client Master (/clients)
Instead of SmartBiz's fragmented per-app client lists, SynexTax centralizes every relationship in one relational workspace: Firm -> Client Group (Sister Concerns) -> Legal Entity (PAN) -> GSTINs & TANs.
A. Master Client List + Floating Right Inspector Card [Phase 1 MVP]
Follows your exact Screen B layout (solid obsidian table header + right floating inspector):
Top Filter Toolbar: Segmented pills (All Entities, Regular Monthly, QRMP, Composition, With TAN, Token Expired / Alert), inline search box, Filter popover (by Client Group, Assigned Staff, State, Constitution), and primary Split-Box button + Add Client / Bulk Import.
Master Grid Columns: Client Group, Entity Legal/Trade Name, PAN (masked as XXXXX1234Z by default; clicking eye icon logs an audited reveal in audit.pii_access_logs), Constitution (Pvt Ltd, LLP, Partnership, Proprietorship, OPC, etc.), GSTINs Count & Filing Category chips, TANs Count, Assigned Staff, Portal Status (Active/Suspended), and Compliance Health Pill.
Floating Right Inspector Card (Updates Instantly on Row Click):
Sky Cobalt header displaying Entity Name + PAN + quick expand arrow (Open Full 360° Profile).
Compact contact bar: Primary Signatory Name, mobile, and preferred communication language (EN / PA / HI).
Mini Obsidian status table listing every linked GSTIN (with live API token countdown) and TAN (with last filed quarter and latest token number).
DSC custody indicator (Office Custody vs With Client, plus earliest expiry date).
Bottom quick-action buttons: Open GST Workspace, Open TDS Workspace, and Send Portal Setup Guide (WhatsApp).
B. Entity 360-Degree Profile Workspace (/clients/[entityId]) [Phase 1 MVP]
Organized into six clean tabs so nothing gets buried:
Identity & Statutory Rules Tab:
Legal Name, Trade Name, PAN, Live PAN-Aadhaar Seeding Status (Operative, Inoperative, Exempt with 1-click re-verify button via PanVerificationAdapter), Constitution (including OPC added Nov 2026), CIN/LLPIN, Date of Incorporation, and Onboarding Source.
AATO Tier Selector: Auto-configures the 30-day e-Invoice reporting window for entities >= ₹10 crore and GSTR-9/9C applicability (> ₹2 crore / > ₹5 crore).
Rule 86B Exemption Switch: Toggle + documented statutory exemption reason (e.g., > ₹1L income tax paid in last 2 FYs) consumed directly by the GSTR-3B ITC Set-Off Engine.
ISD Compliance Alert Banner: Automatically surfaces if the PAN holds 2+ active GSTINs across states without an active ISD registration.
Statutory Legal Hold Panel: Auto-calculated retention lock (8 Financial Years for Companies under MCA Sec 128; 7 Tax Years / 72 Months for Non-Companies under IT Act 2025 Sec 62 & CGST Sec 36) plus a manual Litigation / Notice Hold toggle overriding DPDP erasure requests.
GST Registrations (GSTINs) Tab:
Full card per GSTIN displaying 15-digit GSTIN (checksum + PAN-embed validated), State Code, Registration Type (Regular, Composition 10(1), Composition 10(2A), SEZ Unit/Dev, ISD, REG-07 GST TDS Deductor), is_rule_14b_eco flag, Filing Category (Regular Monthly, QRMP with Fixed Sum vs. Self-Assessment method), and live Portal Status (Active, Suspended, Cancelled).
2026 GSTN API Access Manager: Tracks portal_username (never password), GSP-ASP pairing checklist, current token state (Active, Expiring Soon, Revoked), session window (6hr to 30 days), 1-click Request OTP, and a WhatsApp Client Setup Card (pre-filled instructions naming your exact GSP + ASP pair for gst.gov.in > Manage API Access).
NIC e-Invoice & e-Way Bill Sub-User Panel [Phase 2]: Stores encrypted NIC API sub-user credentials and tracks 360-minute cached token health.
Opening Statutory Ledgers: Stores opening balances for Electronic Cash/Credit Ledgers plus Advisory 643 Electronic Credit Reclaim Ledger and RCM Liability/ITC Ledger.
TAN Registrations (TANs) Tab:
TAN, Protean Deductor Category Code, Branch Name, Responsible Person Name/Designation/PAN, Address JSON, AIN (govt deductors), and TRACES Username (never password).
Immutable Token Ledger: Stores the Latest Accepted 15-Digit Token Number (PRN) for every filed quarter and form (both 1961 Act and 2025 Act).
1-Click TRACES KYC Cheat Sheet Modal: Displays Latest Accepted Token Number + CIN/BIN + 3 valid PAN-Amount pairs from the last accepted statement with copy buttons so CAs clear TRACES KYC screens in 10 seconds.
Signatories, Contacts & Masked Bank Accounts Tab:
Authorized Signatories list (name, designation, PAN, mobile, email, preferred language en/pa/hi, DSC link).
DPDP Consent Tracker: Shows active multilingual consent status (Tax Filing, WhatsApp Alerts, Reconciliation), granted timestamp, expiry date, and PDF consent artifact download.
Encrypted Bank Accounts Vault: Displays Bank Name, IFSC, Account Type, and masked last 4 digits (****8421), with an explicit Reveal Account Number button requiring a logged access reason (audit.pii_access_logs).
Team Assignments & Client Portal Access Tab:
Lists every assigned Staff/Manager user with granular access level (View, Prepare, Review).
[Phase 2] Manage Business Client Portal users (invite client owner/accountant via WhatsApp/email magic link, toggle whether they can self-approve IMS or self-sign via EVC).
Client Activity & Filing History Timeline Tab:
Chronological immutable stream of every filed return, ARN/Token acknowledgment download, approval sign-off, and edited record for that entity.
4. Module 3: "Switch in 10 Minutes" Migration & Onboarding Toolkit (/clients/import)
Because switching inertia is SmartBiz's single biggest defense in Amritsar, onboarding must be a dedicated built-in product tool rather than manual data entry [Phase 1 MVP]:
4-Source Migration Wizard:
SmartBiz / CompuTax / ClearTax Excel Importer: Drag-and-drop client master spreadsheets with saved auto-column mapping templates that handle merged headers, inconsistent column names, and dirty formatting.
Bulk GSTIN Auto-Enrichment: Paste up to 500 raw GSTINs; the backend queues GSTN lookup calls to auto-populate Legal Name, Trade Name, State, Constitution, Registration Status, Filing Category, and the past 12 months of filing statuses automatically.
TRACES .conso Bootstrapper: Upload existing TRACES consolidated .conso files to extract TAN metadata, historical deductee PAN master directories, and latest accepted 15-digit Token Numbers in seconds.
Quick Single-Client Guided Form: 60-second creation flow that auto-extracts PAN and State Code the moment a GSTIN is typed.
Pre-Commit Hygiene Preview Grid: Before writing a single row to PostgreSQL, displays a color-coded validation table:
Green: Validated (passes GSTIN Mod-36 checksum, PAN-embed check, and duplicate detection).
Amber (Auto-Cleaned): Trimmed spaces, uppercased identifiers, normalized phone numbers to +91.
Red (Needs Fix): Inline editable cells highlighting exact errors (e.g., invalid GSTIN checksum or mismatched PAN) so the onboarding team fixes them right in the grid without re-uploading Excel.
Partner-Only Export Guard (Anti-Poaching Control): While onboarding import is fast, bulk exporting the firm's master client list (names, mobiles, GSTINs, PANs) is hard-locked to PARTNER role only, stamped with a forensic watermark, and logged in audit.pii_access_logs.
That covers Part 1 (App Shell, Global Utilities, Control Tower, Unified 4-Tier Client Master, and the 10-Minute Migration Toolkit).
## Part 2: Complete GST, IMS, 4-Pass Fuzzy 2B Recon, e-Invoicing, e-Way Bill & Data Ingestion Suite (/gst/*)
This is the daily workhorse of SynexTax, where CA staff and business accountants spend 70% of their time between the 1st and 20th of every month. Every sub-module follows your Screen B (Solid Obsidian Header Table + Floating Right Inspector Card) and Screen C (Pre-Filing Reconciliation Modal) blueprints, backed by the deterministic tax engine and non-disableable audit logs.
### 1. GST Period Command Bar & State Stepper (Persistent Across /gst/*) [Phase 1 MVP]
Every GST workspace opens pinned to a single (GSTIN, Return Period) pair with a clean horizontal strip directly below the global top bar:
Return Period & Cadence Pill: Displays active period (e.g., Nov 2026 | Regular Monthly or Q3 Oct-Dec 2026 | QRMP), live GSTN API Token Countdown (Expires in 22d 4h or Revoked: Re-Auth), and 3-Year Expiry Countdown for any overdue historical period.
Immutable Workflow Stepper: Interactive visual track showing the exact return state (DRAFT -> VALIDATED -> RECONCILED -> CLIENT_APPROVED -> PORTAL_SAVED -> FILED -> CLOSED). Once a period hits PORTAL_SAVED or FILED, a prominent Period Locked (Read-Only) badge appears and all inline cell edits lock automatically, exposing only an + Add Amendment (GSTR-1A / B2BA) action.
Sequential Filing Guard Banner: Checks whether the previous period's GSTR-3B is filed (since GSTN blocks GSTR-2B generation and sequential returns if prior GSTR-3B is unfiled, and Rule 138E blocks e-Way Bill generation after 2 consecutive missed returns).
### 2. Multi-Source Ingestion & Dirty-Data Sanitization Hub (/gst/import)
Local Amritsar traders and CA offices send invoices in chaotic formats. This module converts messy real-world inputs into clean, validated gst_invoices_sales and gst_invoices_purchase rows in seconds.
Dirty Excel / CSV Smart Mapper (services/recon-worker) [Phase 1 MVP]:
Drag-and-drop upload for .xlsx, .xls, and .csv registers (Tally exports, Busy exports, Marg ERP exports, SmartBiz sheets, or custom client templates).
Automated Sanitizer: Automatically detects and skips merged title/blank header rows, strips Indian comma formatting (1,25,000.00 to 125000.00), normalizes mixed date strings (DD/MM/YY, DD-MMM-YYYY, Excel serial dates), trims hidden whitespace, and remembers each client's custom column mapping for future months.
Zero-Network Pre-Commit Hygiene Grid: Runs packages/tax-engine checks on all rows in under 50ms per batch before saving:
15-digit GSTIN Mod-36 checksum verification.
Place of Supply vs. Supplier State tax-type check (blocks IGST on intra-state or CGST+SGST on inter-state supplies, respecting SEZ/Export rules).
GST Rule 46 invoice numbering hygiene (max 16 alphanumeric chars plus - and /) and per-FY duplicate invoice detection.
Notification 03/2026-CT Credit Note rule (requires original_invoice_ref for Credit Notes dated before 2026-11-01; allows optional/nullable reference for post-sale discount Credit Notes dated >= 2026-11-01).
Inline editing on red error rows so clerks fix bad GSTINs or HSN codes right inside the import grid without re-uploading the file.
TallyPrime & Busy Direct Sync Console [Phase 2]:
Connects via your apps/dsc-agent (modules/tally-sync) plugin over local Port 9000 XML-over-HTTP.
Explicitly verifies the active open company GSTIN inside Tally before pulling, uses chunked date-sliced polling so office users never freeze, and parses embedded Tally XML error nodes rather than trusting HTTP 200.
OCR Bill Photo / PDF Intake Queue [Phase 2]:
Ingests invoice PDFs and WhatsApp bill photos uploaded via the Client Portal, extracts structured line items via PII-redacted OCR/LLM workers, and queues them in a side-by-side "Original Image vs. Extracted Row" verification screen.
GSTR-1 / 2B JSON & Portal Import Fallback [Phase 1 MVP]:
Allows importing official GSTN JSON/Excel downloads directly if a client's GSP API token is temporarily revoked or the portal is degraded.
### 3. Outward Supplies: Sales Register, GSTR-1, IFF & GSTR-1A (/gst/gstr1) [Phase 1 MVP]
Because Tables 3.1 and 3.2 of GSTR-3B are permanently hard-locked to GSTR-1/IFF figures, GSTR-1 preparation is now the single most critical accuracy gate in the monthly cycle.
Keyboard-First Sales Register Grid (Screen B Split Layout):
Segmented table filter tabs matching GSTN sections: All, B2B (4A), B2CL (5A), B2CS (7), Exports (6A), SEZ (6B/6C), Credit/Debit Notes (9B), Amendments (9A/9C), Nil/Exempt (8), HSN Summary (12), and Doc Issued (13).
Full keyboard navigation (Tab, Enter, Up/Down, Ctrl+C/Ctrl+V paste directly from Excel) with JetBrains Mono tabular figures, inline HSN/SAC 4-digit vs. 6-digit turnover validation, and zero modal bloat.
Floating Right Inspector Card: Updates live when any sales invoice is selected, showing exact line-item tax split (Taxable, IGST, CGST, SGST, Cess), linked IRN / e-Way Bill badge, IMS Buyer Action Status (showing whether your buyer accepted, rejected, or kept your invoice pending via Supplier View), and quick edit/delete buttons (locked once period is PORTAL_SAVED).
Auto-Generated HSN Summary (Table 12) & Document Summary (Table 13):
Automatically rolls up invoice lines into B2B vs. B2C HSN summary tables (enforcing 4-digit HSN for AATO up to ₹5 crore and 6-digit HSN above ₹5 crore) and computes continuous invoice serial ranges (From / To / Cancelled counts) for Table 13.
Pre-GSTR-1 Books vs. Portal Gate:
Before pushing SAVE to GSTN via the async BullMQ queue, runs a mandatory variance summary comparing Sales Register totals against e-Invoice auto-populated records (preventing duplicate reporting of IRN invoices).
GSTR-1A Single-Shot Amendment Workspace:
Available strictly after GSTR-1 is filed and before GSTR-3B is filed for that period.
Displays an explicit compliance warning banner ("GSTR-1A can only be filed ONCE per tax period; once GSTR-3B is filed, GSTR-1A closes permanently"), lists only newly added/amended delta rows (is_amendment = true), and feeds updated liability directly into the GSTR-3B preview.
QRMP IFF Support (M1 & M2):
For clients marked QRMP, automatically switches Month 1 and Month 2 outward screens into IFF mode (restricting upload to B2B invoices and Credit/Debit Notes within GSTN's ₹50 lakh monthly cumulative IFF cap).
### 4. Inward Supplies: Purchase Register & 4-Pass Fuzzy GSTR-2B Reconciliation (/gst/recon-2b) [Phase 1 MVP]
This is the single highest-ROI time-saver for Amritsar CAs, cutting 500-invoice monthly reconciliations from hours down to under 3 minutes.
One-Click GSTR-2B Sync & Side-by-Side Workspace:
Pulls static GSTR-2B records via GSP (or JSON fallback) and automatically flags sequential lock issues if the prior period's GSTR-3B is unfiled.
Python 4-Pass Fuzzy Matching Engine (services/recon-worker):
Pass 1 (Exact Match): Supplier GSTIN + Exact Invoice No. + Date + Tax Amounts within ₹0.00.
Pass 2 (Normalized Invoice Match): Defeats the notorious SALES/25-26/1 vs. SALES25261 mismatch by stripping all punctuation (/, -, ., spaces), stripping leading zeros, and normalizing financial-year tokens (2025-26, 25-26, 2526, 2026-27).
Pass 3 (Configurable Tolerance Match): Exact GSTIN + Normalized Invoice No. with configurable tax/value tolerance (default ±₹1 to ±₹5 rounding buffer) and ±2-day date tolerance.
Pass 4 (Probable / Fuzzy Match): Same GSTIN + Exact Taxable Value + Close Date with fuzzy Levenshtein invoice similarity, queued for 1-click human confirmation.
Reconciliation Buckets (Segmented Toolbar Tabs):
Exact Matched (Emerald), Fuzzy / Tolerance Matched (Sky Blue), Value / Tax Mismatch (Amber), In Books Only (Missing in 2B) (Coral Red), In 2B Only (Missing in Books) (Purple/Blue), and Manual Matched.
Side-by-Side Diff Inspector Card (Right Floating Panel):
Clicking any mismatched row displays Books vs. GSTR-2B figures stacked side-by-side (Taxable, IGST, CGST, SGST, Diff highlighted in Coral Red), plus a 1-click Link Manually, Accept 2B Value, or Tag Section 17(5) Blocked action.
Special Local Compliance Tagging Inside Purchase Grid:
Section 17(5) Blocked Credit Auto-Tagger: Flags ineligible HSN/SAC purchases (motor vehicles, catering/food, club memberships, personal expenses) to route cleanly into GSTR-3B Table 4(B)(1).
Rule 42/43 Exempt-Supply Reversal Calculator: Crucial for Punjab rice shellers and agro-traders dealing in mixed exempt + taxable supplies; computes common credit reversal ratios cleanly.
2% GST TDS Scrap/E-Waste Alert (Nov 1, 2026 Rule): Flags purchase contracts > ₹2.5 lakh (excl. GST) from registered suppliers of metal scrap, plastic scrap, tyre scrap, e-waste, or used cooking oil so CAs catch mandatory REG-07 / GSTR-7 2% GST TDS deductions early.
1-Click Vendor Follow-Up Discrepancy Engine:
Groups all In Books Only and Value Mismatch invoices by Supplier GSTIN and generates clean, branded supplier-wise Excel/PDF statements with 1-click email or WhatsApp [Phase 2] dispatch asking vendors to file/amend their GSTR-1.
### 5. Native Invoice Management System (IMS) Action Console (/gst/ims) [Phase 1 MVP]
SmartBiz's public GST specs still lean heavily on older GSTR-2/2A comparisons. A full native IMS engine puts SynexTax an entire generation ahead.
Dual-View Toggle:
Recipient View (Inward Supplies): Action every supplier invoice, debit note, and credit note flowing from suppliers' GSTR-1/IFF/1A.
Supplier View (Outward Monitoring): Shows your client's sales invoices that their buyers Rejected or kept Pending in IMS, warning you immediately if a rejected Credit Note will automatically increase your client's GSTR-3B output tax liability next period.
Four Action States & Bulk Controls:
Bulk-select rows (or apply auto-rules like "Accept all Exact-Matched eligible invoices") to assign Accept (A), Reject (R), Pending (P), or Reset.
Hard Credit Note Guardrails (Oct 2025 / Nov 2026 Rules):
Enforces the 1-tax-period pending cap on Credit Notes (1 month for monthly filers, 1 quarter for QRMP filers) right in the UI and DB trigger.
When accepting a Credit Note, prompts the user explicitly: "Does ITC need to be reduced?" (No if original ITC was never claimed; Yes with full reversal if left blank; or Yes with a specific partial ITC reversal amount).
48-Hour Pre-14th "Deemed Acceptance" Alert Tab: Highlights every high-value (> ₹25,000) or Section 17(5)-flagged record still in NONE status before the 14th draft GSTR-2B lock so ineligible ITC never slips into GSTR-3B silently.
"Amended Post-Acceptance" Lineage Badge: Automatically links incoming Table 9A/9B amendments to invoices previously marked Accept (A) in an earlier month, rendering the exact net ITC delta side-by-side.
IMS Bypass Segregated Tab: Visually separates records that bypass IMS and flow straight to GSTR-3B (inward RCM supplies from Table 4B, ISD credits, imports of goods/services, and Section 16(4) / Place-of-Supply barred credits) so CAs never search for them inside the IMS action grid.
Async Queue Sync, Post-14th Recompute & Offline JSON Backup:
Pushes IMS actions via BullMQ and polls Check Invoice Status (P to S) live.
If any IMS action is modified after the 14th, lights up a bold amber banner and hard-locks GSTR-3B filing until the user executes Recompute GSTR-2B and the refreshed 2B lands.
1-Click IMS Offline Tool JSON Export: Generates GSTN IMS Offline Tool compatible JSON as an emergency manual fallback if a client's API token gets revoked mid-filing week.
### 6. GSTR-3B Computation, ITC Set-Off Optimizer & Filing Modal (/gst/gstr3b) [Phase 1 MVP]
Turns the most stressful monthly filing into a zero-guesswork, auditable verification checkpoint.
Hard-Locked Outward Liability View (Tables 3.1 & 3.2):
Renders auto-populated Table 3.1 (except RCM 3.1(d)) and Table 3.2 figures as read-only locked cells with a lock icon and tooltip: "Locked to GSTR-1/IFF. Need a fix? Open GSTR-1A before filing 3B."
Provides a clean editable section for Table 3.1(d) Inward Reverse Charge (RCM) (such as Amritsar GTA 5% transport freight and unregistered scrap purchases).
Table 4 ITC Reconciliation & Advisory 643 Ledger Guards:
Auto-populates Table 4(A) from the latest recomputed GSTR-2B, cleanly separating 4(B)(1) permanent reversals (Section 17(5) / Rule 42/43), 4(B)(2) temporary reversals (Rule 37 / goods in transit), and 4(D)(1) reclaims.
Real-Time Negative-Ledger Blocker (GSTN Advisory 643): Live side panel displaying tracked closing balances of the Electronic Credit Reclaim Ledger and RCM Liability/ITC Ledger. Hard-blocks filing if 4(D)(1) reclaim exceeds (opening + 4(B)(2)) or if RCM ITC claimed exceeds (opening + 3.1(d) paid).
Section 16(4) & Rule 37A Ageing Warnings: Flags pending invoices approaching the November 30 statutory cutoff or suppliers whose GSTR-3B remains unfiled past September 30.
Deterministic ITC Set-Off Optimizer (GstItcSetOffEngine):
Runs exact Decimal.js math applying Section 49A/49B & Rule 88A: exhausts 100% of IGST credit first (solving the optimal CGST vs. SGST split to minimize total cash outflow), hard-blocks CGST-to-SGST cross-use, and routes RCM, interest, and late fees strictly to the Cash Ledger.
Rule 86B (1% Cash Rule) Auto-Guard: Checks monthly domestic taxable supply (strictly excluding exempt and zero-rated exports/SEZ) against ₹50 lakh; if triggered without a documented entity exemption, caps ITC utilization at 99% and moves 1% to cash automatically.
Screen C Pre-Filing Sign-Off & Offset Modal:
Displays live Cash Ledger balance vs. Net Cash Required (Difference / Challan Shortfall highlighted in Coral Red with 1-click PMT-06 Challan Generator).
Shows Maker-Checker approval history (Prepared by Staff -> Approved by Client/Partner), accepts a mandatory audit note, and dispatches SAVE -> OFFSET_LIABILITY -> RETFILE via Local DSC Signer (mandatory for Companies/LLPs) or EVC OTP (Proprietorships/Partnerships), storing the immutable ARN and PDF acknowledgment immediately.
### 7. Additional GST Return Workflows (QRMP, Composition, Annual & Specialty)
QRMP Monthly Tax Payment (PMT-06) [Phase 1 MVP / Early Phase 2]: Side-by-side calculator comparing Fixed Sum Method (35% of prior quarter cash) vs. Self-Assessment Method (actual net liability) so Amritsar QRMP traders never overpay cash in Months 1 and 2.
Composition Dealer Module (CMP-08 & GSTR-4) [Phase 2]: Enforces the November 1, 2026 split between Section 10(1) (1% traders/manufacturers, 5% restaurants) and Section 10(2A) (6% service/mixed), auto-computing quarterly CMP-08 liabilities and annual GSTR-4 summaries.
Annual Return & Reconciliation (GSTR-9 & GSTR-9C) [Phase 3]: Auto-consolidates 12 months of immutable filed GSTR-1, GSTR-2B, and GSTR-3B snapshots into draft GSTR-9 tables (Table 4 to Table 18) plus Books vs. GSTR-9 variance workpapers for Table 5/9/12/14 of GSTR-9C.
Specialty Local Modules [Phase 2 / Phase 3]:
Job Work (ITC-04) & Revised Refund (RFD-01 effective Dec 1, 2026) with capital-goods ITC declarations for Amritsar textile/shawl units.
ISD Monthly Distribution (GSTR-6) for multi-state PANs flagged by your ISD Radar.
2% GST TDS (GSTR-7) for registered buyers crossing ₹2.5 lakh on metal/plastic/tyre/e-waste/used-cooking-oil scrap contracts.
### 8. e-Invoicing (IRP), e-Way Bill & Vendor Compliance Intelligence (/gst/einvoice, /gst/ewb, /gst/vendors) [Phase 2]
Multi-IRP e-Invoice Console (/gst/einvoice):
Single and bulk IRN generation with automatic NIC-IRP 1 <-> NIC-IRP 2 failover (and optional private IRP routing), instant signed QR code + PDF invoice rendering, and strict 360-minute NIC token caching.
Statutory Countdown Timers: Live 30-day reporting countdown badges for AATO >= ₹10 crore entities (warning at Day 15, Day 25, Day 28) and a live 24-hour cancellation countdown on every active IRN (blocking cancellation if an active e-Way Bill is still linked).
Jan 1, 2027 Cutover Ready: Native versioned JSON support for domestic RCM (RCMDOM) and import-of-services RCM (RCMIMP) self-invoice IRN generation (voluntary Dec 15, 2026; mandatory Jan 1, 2027).
e-Way Bill Hub (/gst/ewb):
1-click Generate EWB from IRN, standalone EWB generation, Consolidated EWB (CEWB) builder, Part-B transporter/vehicle updates, and validity extension tracker.
Native dual-length validation supporting both legacy 12-digit EWB / 10-digit CEWB and Jan 1, 2027 14-digit EWB / 11-digit CEWB numbers, with Advisory 664 (Ship-to GSTIN / voluntary closure) kept cleanly behind your runtime EWB_ADVISORY_664_ENHANCEMENTS feature flag until GSTN lifts its abeyance.
Vendor Compliance Health Score & ITC Payment Hold (/gst/vendors):
Grades every vendor GSTIN A to D based on 12-month GSTR-1/3B filing punctuality, active/suspended registration status (especially ahead of April 1, 2027 automated suspensions), and historical IMS mismatch rate.
1-Click "Hold GST Portion" Ledger: Generates an accounts-payable export splitting every pending vendor bill into Base Amount (Pay Now) vs. GST Portion (Hold Until Appears in GSTR-2B) so SMEs stop losing cash to defaulting suppliers.
That completes Part 2 (the entire GST, IMS, Fuzzy 2B, GSTR-3B, e-Invoice, e-Way Bill, and Vendor Intelligence working area).
## Part 3: Dual-Act TDS/TCS Engine, Local DSC Hub, White-Label Client Portal, Notice/GSTAT Tracker, Practice Billing & Audit/Settings
This final part completes the authenticated workspace blueprint, covering the Income-tax Act, 1961 + Income-tax Act, 2025 Dual-Act TDS/TCS suite, the Zero-Java Local DSC Signer Hub, the White-Label Business Client Portal, Litigation/Notice & Practice Billing tools, and Audit/DPDP/Settings.
### 1. Module 4: Dual-Act TDS/TCS Compliance Suite (/tds/*) [Phase 1 MVP]
Every TDS screen opens pinned to a (TAN, Period, Form) context and automatically routes all validation, form codes, challan layouts, and FVU binaries through the Period Cutover Router (<= March 31, 2026 -> IT_ACT_1961; >= April 1, 2026 -> IT_ACT_2025).
#### A. TDS Period Command Bar & Dual-Act Regime Badge
Regime Lock Indicator: Displays a crisp badge (IT Act 2025 | Tax Year 2026-27 | Form 140 | FVU v1.2 in Sky Cobalt, or Legacy IT Act 1961 | FY 2025-26 | Form 26Q | FVU v9.5 in Slate) so staff can never accidentally mix old and new statutory sections in one return.
Statutory Due-Date & Late-Fee Ticker: Dynamically computes the exact due date per regime (31st for Forms 138/140/143/144 and 24Q/26Q/27Q; 15th strictly for legacy Form 27EQ TCS), live accrued Section 427 / 234E late fee (₹200/day capped at total quarter TDS), and the 2-Year Correction Window Countdown (correction_window_expires_at).
1-Click "Mark Quarter Nil" Action: Allows CAs to mark active TANs with zero quarterly deductions as Nil Return / Declaration cleanly, preventing silent CPC-TDS default notices.
Immutable Return State Stepper: Mirrors GST states (DRAFT -> VALIDATED -> RECONCILED -> CLIENT_APPROVED -> PORTAL_SAVED -> FILED -> CLOSED), locking linked challans and deductee rows via PostgreSQL triggers once filed and routing all post-filing fixes strictly into sequential TRACES correction batches (correction_sequence 1, 2, 3...).
#### B. Challan Vault & ITNS 281N Multi-Section Manager (/tds/challans)
Built on your Screen B layout (Solid Obsidian Header Table + Floating Right Inspector Card):
Smart Challan Split Validator: Enforces separate challans for Company (0020) vs. Non-Company (0021) deductees and Resident vs. Non-Resident deductees, plus Minor Head 200 (Regular) vs. 400 (Assessment).
Critical 2026-27 Tax Year Safeguard: When generating or logging an e-Pay Tax challan for deductions dated April 1, 2026 onward, surfaces a prominent amber warning confirming "Tax Year 2026-27" (not legacy AY 2026-27) so deposits never misallocate to FY 2025-26.
ITNS 281N Multi-Section Allocator (tds_challan_section_allocations):
For IT_ACT_1961 (ITNS 281): restricts each challan to strictly 1 section code.
For IT_ACT_2025 (ITNS 281N): expands a clean sub-grid inside the right floating inspector card allowing allocation across up to 20 distinct section codes in one single bank payment (e.g., Salary u/s 392, Rent, Contractors, and Professional Fees u/s 393) with section-wise Tax, Surcharge, and Cess breakdowns.
Explicit FVU v1.2 Allocation Fields: Dedicated editable columns for Interest Allocation, Others Allocation, and Late Fee (Sec 427/234E) with real-time cross-tally checks against total challan amount, preventing Q1-style CPC-TDS automated demand notices.
CSI (Challan Status Inquiry) Sync & Matching:
Supports both Automated CSI OTP Pull (via regulated API gateway) and Manual .csi Upload Fallback from incometax.gov.in.
Auto-matches bank CIN, 7-digit BSR Code, Tender Date, and Amount against logged challans, tagging matched rows green (CSI Verified) and highlighting unconsumed challan balances available for deductee tagging.
#### C. Keyboard-First Deductee & Salary Grids (/tds/deductees)
Excel-Speed Entry & Bulk Import: Keyboard-navigable spreadsheet grid (Tab, Enter, Ctrl+C/Ctrl+V from Excel/Tally) with automatic validation of:
Bulk PAN Operative Verification (PanVerificationAdapter): Checks deductee PANs for validity and Aadhaar-PAN linking status (OPERATIVE vs. INOPERATIVE), automatically flagging 20% higher deduction risk on inoperative PANs or Protean non-PAN literals (PANNOTAVBL, PANAPPLIED, PANINVALID).
Quarter-Bound Date Enforcement (FVU v1.2): Hard-validates that every deductee payment_credit_date falls strictly inside the active quarter and Tax Year.
Exact Statutory Interest & Rounding Math: Uses packages/tax-engine (Decimal.js) applying Rule 269(c) (rounding interest base down to nearest ₹100, counting part-of-month as full month at 1% late deduction / 1.5% late deposit) and Section 516 (dropping paise completely, then rounding to nearest ₹10).
Lower/Nil Deduction Certificates: Validates Section 395(1) certificate numbers (2025 Act) vs. Section 197 (1961 Act), plus consolidated Form 121 self-declarations (replacing Forms 15G/15H).
Form 144 Non-Resident Remittance Lookup: Uses the regime-partitioned tds_remittance_tax_codes table (FVU v1.2 remapped Nature of Remittance Codes to Tax Codes) alongside DTAA rate flags.
Form 138 Q4 Annual Salary Workspace: Dedicated Annexure II & III salary computation grid (Old vs. New regime comparison, perquisites, Chapter VI-A deductions) ready for Protean's Form 138 Q4 Version 1.0 schema.
#### D. PAN-Based Challan-cum-Statement Helper (Form 141 Schedules A to E) [Phase 1 MVP / Phase 2]
Built specifically for Punjab/Amritsar real-estate and high-value personal transactions where no TAN is required:
Supports Schedules A through E (strictly one schedule per filing), including Schedule E (effective Oct 1, 2026) for Resident Individuals/HUFs purchasing property from NRIs u/s 393(2).
Enforces the strict 30-day due date from the end of the deduction month and generates ready-to-file challan summaries and Form 132 tracking.
#### E. Server-Side Docker FVU Validation Hub & Pre-Filing Modal (/tds/fvu)
Screen C Pre-FVU Sign-Off Modal: Summarizes total deductees, challans, unconsumed balances, Section 427/234E late fee coverage (blocking submission if accrued late fee is unfunded), and PAN inoperative warnings before dispatching a validation job.
Isolated Docker FVU Orchestrator (workers/fvu-v1-2 & workers/fvu-v9-5):
Compiles clean caret-delimited ASCII .txt files (FH, BH, CD, DD, SD) matching Protean's exact specification.
Dispatches the .txt + .csi pair to an isolated, network-egress-blocked Java container pinned strictly to FVU v1.2 (TY 2026-27+) or FVU v9.5 (FY 2010-11 to FY 2025-26).
Clickable Error Report Parser: If Protean validation fails, parses the raw .err/.html output into human-readable error cards inside the UI; clicking any error jumps the cursor directly to the offending deductee or challan row.
Upload-Ready Output Bundle: On success, packages the .fvu inside an upload-ready .zip archive alongside a rendered Form 27A control chart summary, then prompts the CA to record the 15-digit ARN / Token Number immediately after uploading on incometax.gov.in.
#### F. TRACES Corrections, Conso Diff Editor & Bulk Certificate Hub (/tds/traces)
TRACES .conso Offline Correction Studio: Upload any password-protected TRACES .conso file; parses existing challans and deductees into an editable diff grid tracking C1 to C9 modifications, compiles the Correction .txt file, and validates it through the exact regime-matched FVU container.
1-Click TRACES KYC Cheat Sheet: Instant modal pulling the Latest Accepted 15-digit Token Number, CIN/BIN, and 3 valid PAN-Amount pairs straight from your database so CAs clear TRACES online correction KYC screens in 10 seconds.
TRACES Bulk Certificate Ingestion & Signing Hub (Forms 130, 131, 132, 133):
Strictly obeys Section 395(4) & Rule 215 (never fabricating unofficial PDFs).
Ingests official password-protected TRACES .zip downloads (password = uppercase TAN), splits individual non-editable PDFs per deductee PAN, passes them to your Local DSC Signer Agent for single-PIN batch PAdES signing, and dispatches signed certificates to employees and vendors via email or WhatsApp [Phase 2] with immutable delivery logs.
### 2. Module 5: Zero-Java Local DSC Signer & Token Hub (/dsc) [Phase 1 MVP]
Eliminates GSTN's brittle Java 1.8 emSigner headaches across CA offices while tracking hardware compliance with the September 2026 CCA FIPS 140-3 mandate.
Live Desktop Agent Connection Monitor: Communicates with apps/dsc-agent over origin-pinned loopback HTTPS (127.0.0.1) using single-use backend signing nonces. Shows connected USB token model, vendor (ePass2003, Watchdata ProxKey, mToken), detected FIPS 140-2 vs. FIPS 140-3 Level 3 tier, and active certificates.
Firm-Wide DSC Inventory & Custody Table (Screen B Layout):
Tracks every client signatory's certificate metadata (Holder Name, Signatory PAN, Issuer CA, Serial Hex, Valid To, FIPS Profile, Custody: Office vs. Client, Custodian Staff Member, and Portal Registration Status across GST, TRACES, and ITD e-Filing).
Automated Expiry & FIPS 140-3 Hardware Radar: Fires alerts at 45, 15, and 7 days before expiry, explicitly flagging grandfathered FIPS 140-2 tokens that must move onto a new FIPS 140-3 Level 3 USB dongle upon renewal.
Batch PAdES Signing Queue: Dedicated workspace for selecting 10 to 500 extracted TRACES Form 130/131/133 PDFs, placing a clean signature stamp coordinate box, unlocking the USB token PIN once inside the local OS prompt (zero PIN transmission to cloud), and watching real-time batch signing progress with every signature hash logged in audit.signing_audit_logs.
Agent Installer & Modular Plugin Status: One-click download for signed Windows (.exe/MSIX) and macOS (.dmg) installers, displaying plugin health (modules/dsc: Active, modules/tally-sync: Phase 2).
### 3. Module 6: White-Label Business Client Portal & WhatsApp Engine (/client-portal) [Phase 2]
Turns SynexTax into a client-retention weapon for Amritsar CA firms by giving every SME business owner a clean, mobile-first portal branded with the CA Firm's own logo, name, and colors.
Passwordless Access & Multilingual Experience: Business owners log in via WhatsApp/SMS OTP magic link (TRAI DLT compliant) and switch their portal and WhatsApp summaries effortlessly between English, Punjabi, and Hindi.
Monthly Document Dropzone: Drag-and-drop upload for Sales/Purchase Excel sheets, Tally exports, bank statements, and bill photos (which route directly into the CA's Dirty-Data/OCR intake queue with instant staff notification).
1-Tap Liability & IMS Mismatch Approval: Displays a jargon-free summary card ("Nov 2026 GST Payable: ITC ₹68,500 | Cash ₹14,200 | 3 Vendor Invoices Missing in 2B"). Tapping Approve for Filing writes an immutable client approval timestamp unlocking the CA's Maker-Checker gate.
Self-Service Filing Vault: Clients download filed GSTR-1, GSTR-3B, PMT-06 challans, Form 27A acknowledgments, and signed Forms 130/131/133 24/7 without calling the CA's office.
Official WhatsApp Business API Automation (Transactional Utility Templates):
Scheduled document-chasing reminders on the 2nd, 5th, and 8th of every month.
Instant PDF delivery of filed return acknowledgments and challans.
1-tap WhatsApp OTP sign-off and vendor discrepancy follow-ups.
### 4. Module 7: Structured Notice, Default & GSTAT Litigation Tracker (/notices) [Phase 3]
Replaces messy WhatsApp PDFs and spreadsheets with a structured legal calendar and workflow-native AI drafter.
Centralized Notice Register (Screen B Layout): Tracks GST notices (ASMT-10, DRC-01A, DRC-01, REG-17), Income Tax/TRACES Justification Reports and default demands, with automated statutory reply-deadline countdowns and CBIC Circular 258 tracking (up to 4 personal hearings per SCN, plus CBIC Instruction 02/2026 ₹10,000 notice threshold check).
GSTAT Appellate Tracker: Dedicated litigation tab for second-level GST appeals (efiling.gstat.gov.in), tracking appeal limitation windows, BharatKosh pre-deposit challans, defect rectification deadlines, and bench hearing dates.
Workflow-Native AI Reply Drafter (Beating Smartbiz AI): Rather than a generic chatbot, cross-references disputed invoices directly against your platform's immutable GSTR-2B, IMS, and challan records, strips/pseudonymizes all PII before calling a zero-data-retention enterprise LLM endpoint, and generates structured, section-cited draft replies ready for CA review.
Account Aggregator "GST vs. Bank Credits" Health Check [Phase 2/3]: Ingests RBI Account Aggregator standardized JSON bank feeds (or manual CSVs) to compare declared GSTR-1/3B turnover against actual bank statement credits ahead of GSTR-9 or MSME CC/OD loan renewals.
### 5. Module 8: CA Practice Fee Billing & Staff Analytics (/billing-clients) [Phase 3]
Closes the 15% to 20% unbilled-work revenue leak inside local CA practices.
Auto-Triggered Fee Drafts: Configurable retainer and per-filing fee rules (e.g., GSTR-1/3B monthly retainer + ad-hoc fees for LUTs, GSTR-1A amendments, or TRACES C1-C9 corrections) that automatically draft a CA fee invoice the moment a filing hits FILED.
Embedded UPI / Razorpay Collection: Appends a 1-click UPI payment link directly inside the client's WhatsApp filing receipt message, tracking paid vs. overdue retainers per Client Group.
Partner Productivity & Profitability Analytics: Measures returns filed per Article Clerk, validation/rework error rates, and client fee realization vs. staff hours spent.
### 6. Module 9: Audit Trail, DPDP Privacy Vault & Reports (/audit) [Phase 1 MVP]
Turns statutory compliance into a clean, auditor-ready dashboard that enterprise and corporate clients can inspect in minutes.
MCA Rule 3(1) & CGST Rule 56(15) Non-Disableable Edit Log Viewer: Searchable, read-only table querying audit.immutable_audit_logs showing Timestamp (IST), Actor, Role, Client Entity, Module/Table, Action, and an expandable JSON field-level Before vs. After diff (_ciphertext and _hash keys stripped). Exportable as tamper-evident CSV/PDF for statutory auditors.
Cryptographic Signing Trail (audit.signing_audit_logs): Complete ledger of every GST RETFILE PKCS#7 signature, EVC verification, and bulk Form 130/131 PAdES signature with certificate serial hex, payload SHA-256 hash, FIPS profile, and signing nonce.
PII Reveal & Anti-Poaching Log (audit.pii_access_logs): Records every time a user unmasks a PAN, reveals a client bank account number, or (as a Partner) exports bulk client data, showing Actor, Target, IP Address, and Logged Access Reason.
1-Click MCA Rule 3(6) Annual Cloud Disclosure Generator: Generates an official PDF certificate for corporate clients' annual ROC filings stating SynexTax's legal entity details, India cloud hosting region (AWS Mumbai ap-south-1), daily India backup location (AWS Hyderabad ap-south-2), static IP range, and Indian data custodian details.
DPDP Consent & Legal Hold Vault: Central view of all active/withdrawn multilingual consents (en, pa, hi) alongside Statutory Legal Hold Locks (8 FYs Companies / 7 TYs Non-Companies / Litigation Holds) and a DPDP Consent Manager webhook status log.
Readable Offboarding Data Exporter: Generates a complete, human-readable client archive (JSON/CSV + PDFs + full audit edit log) so offboarding clients retain full 7-to-8-year statutory preservation independence.
### 7. Module 10: Firm Settings, Team RBAC & SaaS Billing (/settings/*) [Phase 1 MVP]
Built strictly on your Screen D Settings Split Panel (Left Firm/User Avatar Card + Vertical Chevron Tab Stack; Right 2-Column Configuration Form + Emerald Save Changes Button):
Firm & Personal Profile: Firm legal/trade name, ICAI FRN, Firm PAN/GSTIN, State Code, default UI language, and personal profile/designation.
Team, RBAC & Maker-Checker Policy (Partner Only):
Invite Partners, Managers, and Article Clerks; toggle can_approve_delegated on trusted Managers; toggle firm-wide enforce_segregation_of_duties (maker cannot approve own filing).
Assign staff members to specific Client Groups or individual Entities with View, Prepare, or Review access (user_client_assignments).
API, GSP & Integration Connections: View active GSP partner connection status, NIC IRP 1/2 failover status, PAN verification quota status, and Compliance Feature Flag status (read-only transparency view showing active GSTN/CBDT rules like Jan 2027 14-digit EWB and Advisory 668 abeyance).
White-Label Branding & Communications [Phase 2]: Upload CA firm logo, set Client Portal subdomain/header text, manage WhatsApp Business utility credit balance, and view TRAI DLT notification status.
Security & TOTP MFA: Enroll/rotate Authenticator App TOTP, manage Passkeys, download one-time Recovery Codes, inspect active login sessions with 1-click remote revoke, and view failed login alerts.
Subscription & SaaS Billing (Partner Only):
Manage active tier (14-Day Trial, Solo Practitioner ₹8,999/yr, Growth Firm ₹15,999/yr, Scale Practice ₹29,999/yr) and live client quota meters (GSTINs/TANs used).
RBI E-Mandate (2026) Compliant Renewals: Automatic UPI AutoPay / card e-mandate enrollment with 24-hour pre-debit notifications for plans <= ₹15,000 incl. GST (Solo Plan / semi-annual installments); proactive 15-day renewal invoice + 1-click UPI/NEFT payment links for annual plans above ₹15,000.
Downloadable SAC 998314 GST Invoices: Auto-generated B2B tax invoices (9% CGST + 9% SGST for Punjab 03 firms; 18% IGST outside Punjab) so CA firms cleanly claim 18% ITC.
### Complete Workspace Map Verified! Ready for Your Master PRD?
All three parts of the working application (Persistent Shell + Control Tower + Client Master + GST/IMS/2B/3B/e-Invoice/EWB + Dual-Act TDS/FVU/TRACES + Local DSC Hub + White-Label Portal + Notices/GSTAT + Practice Billing + Audit/DPDP/Settings) are now fully mapped out with exact Phase 1/2/3 tags.