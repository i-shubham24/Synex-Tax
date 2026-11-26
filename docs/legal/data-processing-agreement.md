# SynTax Data Processing Agreement

> **DRAFT for legal review, not legal advice.**
> Prepared by the product team on 26 November 2026 for review by Indian counsel. It is written against the Digital Personal Data Protection Act, 2023 ("DPDP Act") and the Digital Personal Data Protection Rules, 2025 ("DPDP Rules"), notified on 13 November 2025; under Rule 1 most of the Rules (Rules 3 and 5 to 16) apply from eighteen months after publication, about 13 May 2027. Placeholders are in [square brackets]. References marked [verify section] are not yet confirmed. Open questions for the lawyer are at the end.

**Version:** [0.1 draft] | **Effective date:** [date]

This Data Processing Agreement ("DPA") is between:

- **the Customer**, the CA firm or business named in the Order Form or that created the SynTax Workspace (the **Data Fiduciary**); and
- **Synex Labs**, [legal form and registration], [registered office], Amritsar, Punjab (the **Data Processor**).

It forms part of the SynTax Terms of Service ("Terms"). For the processing of Client Personal Data it prevails over the Terms if they conflict.

---

## 1. Definitions

Terms defined in the DPDP Act (such as Data Fiduciary, Data Processor, Data Principal, personal data, personal data breach, Board) have the same meaning here [verify definitions are in section 2 of the DPDP Act].

- **Client Personal Data:** personal data that the Customer or its Authorised Users put into the Service about the Customer's clients and the people in their records, including proprietors, partners, directors, contact persons, deductees, payees, employees in salary registers, and people named in documents uploaded through the client portal or backup agent.
- **Sub-processor:** a third party engaged by Synex Labs that processes Client Personal Data on its behalf.
- **Security Incident:** a personal data breach affecting Client Personal Data, or a cyber incident of a type CERT-In requires to be reported that affects the systems processing it.
- **Statutory Recipients:** government systems and their authorised intermediaries to which the Customer instructs data to be sent for filing, including the GST Network and GST Suvidha Providers, NIC e-invoice and e-way bill systems, Protean (NSDL) and the Income Tax Department (including TRACES).

## 2. Roles and scope

2.1 **Roles.** For Client Personal Data, the Customer is the Data Fiduciary and Synex Labs is its Data Processor, engaged under a valid contract as section 8(2) of the DPDP Act requires. The Customer remains responsible for compliance with the DPDP Act for processing undertaken on its behalf, as section 8(1) provides.

2.2 **Not covered.** This DPA does not cover personal data of the Customer's Authorised Users (account, security and billing data). Synex Labs is a Data Fiduciary for that data and handles it under its Privacy Notice.

2.3 **Details of processing.** Annex 1 describes the subject matter, nature, purpose, categories of data and Data Principals, and duration.

## 3. Customer responsibilities

The Customer:

- (a) determines the purposes and means of processing Client Personal Data and gives its clients the notice required by section 5 of the DPDP Act and Rule 3 of the DPDP Rules, or relies on another lawful ground;
- (b) holds and records any consent it relies on. The Service provides consent records by purpose (tax filing, client communication, reconciliation, bank verification, WhatsApp alerts, AI assistance), with language, channel, version and withdrawal, which the Customer may use for this;
- (c) handles Data Principals' requests and grievances about Client Personal Data, as the Data Fiduciary, with Synex Labs' help under section 7;
- (d) does not upload passwords for the GST portal, income-tax e-filing portal or TRACES, full 12-digit Aadhaar numbers, or DSC PINs into any field, document or message in the Service;
- (e) decides retention periods and legal holds for its records, subject to the law that applies to it;
- (f) is responsible for the accuracy of Client Personal Data it uploads, as section 8(3) of the DPDP Act requires.

## 4. Synex Labs' obligations as Data Processor

Synex Labs will:

- (a) process Client Personal Data only to provide the Service and on the Customer's documented instructions, which are these Terms, this DPA and the Customer's use of the Service's features and settings. If an instruction appears to break the law, Synex Labs will tell the Customer and may decline it;
- (b) not sell Client Personal Data, use it for advertising, or use it to train AI models;
- (c) ensure that personnel with access are bound by confidentiality and receive security and privacy training;
- (d) keep Client Personal Data in India (section 6) and apply the security measures in Annex 2;
- (e) send Client Personal Data to Statutory Recipients only when the Customer's Authorised Users instruct it through the Service;
- (f) disclose Client Personal Data to an authority only where the law requires, and, where lawful, tell the Customer first;
- (g) keep records of processing activities and logs as Rule 6 of the DPDP Rules requires, including retaining logs for at least one year (Rule 6 and Rule 8(3)).

## 5. Security

5.1 Synex Labs implements the reasonable security safeguards in Annex 2, which reflect section 8(5) of the DPDP Act and Rule 6 of the DPDP Rules, including encryption, masking, access control, logging and monitoring, and backups for continuity.

5.2 Synex Labs will commission an independent vulnerability assessment and penetration test by a CERT-In empanelled auditor at least [once a year] and after major changes, and share an executive summary with the Customer on request.

5.3 Synex Labs may update the measures in Annex 2 provided the overall level of protection is not reduced.

## 6. Data location and transfers

6.1 **India only.** Client Personal Data is stored and processed in India: AWS Mumbai (ap-south-1) as primary, with encrypted replication to AWS Hyderabad (ap-south-2). The Service's integration settings accept only these India regions for storage, email and the AI model.

6.2 **Exception: WhatsApp.** If the Customer turns on WhatsApp messages, the message text (for reminders: client name, period, documents outstanding, due date and firm name; for TDS certificates: a notice with a one-time download link) and the recipient's Indian mobile number are sent to Meta Platforms through the WhatsApp Cloud API, whose servers are outside India. Nothing else is sent. The Customer decides whether to turn this on.

6.3 **AI.** The built-in assistant uses a model hosted by Amazon Bedrock in an India region. Identifiers (PAN, GSTIN, TAN, Aadhaar-like numbers, bank account numbers, IFSC, mobile numbers, email addresses) are replaced with placeholders before any text is sent to the model, and the restore map stays on Synex Labs' servers. No raw personal data is sent to AI or analytics services outside India.

6.4 Any transfer outside India is subject to section 16 of the DPDP Act and Rule 15 of the DPDP Rules. If the Central Government restricts transfer to a country or entity concerned, Synex Labs will stop that transfer and tell the Customer.

## 7. Assistance with Data Principal rights

7.1 The Service lets Partners find, correct, export and delete Client Personal Data, subject to filed-period locks and legal holds, so the Customer can answer requests under sections 11 to 14 of the DPDP Act itself.

7.2 If Synex Labs receives a request or grievance directly from a Data Principal about Client Personal Data, it will forward it to the Customer within [2 working days] and will not respond itself except to say it has been forwarded, unless the Customer asks it to.

7.3 Synex Labs will give reasonable help so the Customer can respond within the period in Rule 14(3) of the DPDP Rules (not more than ninety days) and the Customer's own published period.

## 8. Security Incidents and breach notification

8.1 **To the Customer.** Synex Labs will notify the Customer of a Security Incident affecting Client Personal Data **without undue delay and in any case within [24] hours** of becoming aware of it, by email to the Partners on record and by [phone]. The notice will give what is known at the time and be updated as facts emerge, covering the information the Customer needs for its own notices under Rule 7 of the DPDP Rules: the nature, extent, timing and location of the breach; its likely impact; the measures taken or proposed to reduce risk; any findings about who caused it; and remedial steps to prevent recurrence.

8.2 **Customer's notices.** The Customer, as Data Fiduciary, is responsible for intimating each affected Data Principal without delay (Rule 7(1)) and the Board without delay, with a detailed report within 72 hours of becoming aware (Rule 7(2)), under section 8(6) of the DPDP Act. On the Customer's written request, Synex Labs will prepare draft notices and the technical content of the Board report.

8.3 **CERT-In.** Synex Labs will report cyber incidents affecting its systems to CERT-In within **6 hours** of noticing them or being told of them, as required by the CERT-In directions dated 28 April 2022 issued under section 70B(6) of the Information Technology Act, 2000 [verify which direction paragraph and whether Synex Labs, the Customer, or both are covered entities]. Synex Labs will keep the logs of its ICT systems securely for a rolling period of 180 days within India and provide them to CERT-In when required, as those directions require [verify direction paragraph]. Synex Labs will tell the Customer when it has made a report that concerns the Customer's data.

8.4 Synex Labs will not notify the Customer's clients or the Board about a breach of Client Personal Data on the Customer's behalf without the Customer's agreement, unless the law requires Synex Labs to do so.

8.5 Synex Labs will investigate, contain and remedy each Security Incident at its own cost where it was caused by its breach of this DPA, and keep a record of it.

## 9. Sub-processors

9.1 The Customer authorises the Sub-processors in Annex 3.

9.2 Synex Labs will bind each Sub-processor by written contract to protection at least equal to this DPA, and remains responsible for its Sub-processors.

9.3 Synex Labs will give at least [30] days' notice by email and in the application before adding or replacing a Sub-processor that processes Client Personal Data. The Customer may object on reasonable data protection grounds within that period. If the parties cannot resolve the objection, the Customer may terminate the affected part of the Service and receive a pro rata refund.

9.4 Statutory Recipients are not Sub-processors. Data reaches them because the Customer instructs a filing; their handling of it is governed by law and their own terms.

## 10. Audit rights

10.1 Synex Labs will make available the information reasonably needed to show compliance with this DPA, including: this DPA's Annex 2, the latest penetration test summary, [ISO/IEC 27001 certificate or SOC 2 report when obtained], and answers to a reasonable security questionnaire once a year.

10.2 **Audit trail export.** A Partner can export the Workspace's change log, signing trail and PII reveal log at any time as a JSON file and verify the hash chain.

10.3 **On-site or remote audit.** Where the information in 10.1 is not enough, or where the Board, a court or another regulator requires it, or after a Security Incident, the Customer (or an independent auditor bound by confidentiality, not a competitor of Synex Labs) may audit Synex Labs' compliance with this DPA, on [30] days' written notice, during business hours, not more than once in any 12 months (except after a Security Incident or on a regulator's demand), and in a way that does not expose other customers' data. Each party bears its own costs unless the audit finds a material breach by Synex Labs, in which case Synex Labs bears the reasonable audit cost.

10.4 Audits of AWS and other Sub-processors are satisfied by their published third-party reports.

## 11. Return and deletion on termination

11.1 **Export.** Before and for **30 days after** the Terms end, a Partner can export Client Personal Data in machine-readable formats (CSV or Excel registers, portal-ready files the Service produced, stored documents and certificates, and the audit trail as JSON).

11.2 **Deletion.** After the export window, Synex Labs will delete Client Personal Data from live systems within [30] days, and from backups as they expire within a further [35] days [confirm backup and point-in-time recovery retention], and will cause its Sub-processors to do the same, as section 8(7) of the DPDP Act contemplates. On request, Synex Labs will confirm deletion in writing.

11.3 **What is kept.** Synex Labs may keep Client Personal Data only:

- (a) where retention is required by law, including logs for one year under Rule 8(3) of the DPDP Rules and records under a legal hold the Customer set or a court or authority requires; and
- (b) in the append-only, hash-chained audit trail, which the application cannot edit or delete. [Treatment on exit to be decided with counsel: options are (i) keep the trail, isolated and access-restricted, until the longest statutory retention period for the records it covers ends, then delete the whole firm's chain at once by an owner-level procedure that is itself logged; or (ii) hand the exported trail to the Customer and delete the firm's chain after the export window.]

Anything kept stays protected by this DPA and is used for no other purpose.

## 12. Liability

Each party's liability under this DPA is subject to the limits in the Terms [counsel to advise whether a separate cap should apply to breaches of this DPA].

## 13. Term

This DPA lasts as long as Synex Labs processes Client Personal Data for the Customer, including after the Terms end until deletion is complete.

---

## Annex 1: Details of processing

| Item | Description |
|---|---|
| Subject matter | Provision of the SynTax service for GST, TDS/TCS, income-tax and practice-management work |
| Nature of processing | Storage, organisation, reconciliation, validation, calculation, generation of portal-ready files, transmission to Statutory Recipients on instruction, messaging, document storage, backup, retrieval, export and deletion |
| Purpose | To let the Customer prepare, review, approve and file its clients' returns and statements and run its practice |
| Data Principals | The Customer's clients who are individuals; proprietors, partners, directors and contact persons of client entities; deductees, payees and employees in clients' records; people named in uploaded documents |
| Categories of personal data | Names, PAN (masked by default), GSTIN, TAN, addresses, email addresses, mobile numbers, bank account numbers and IFSC (masked by default), invoice, challan, deduction and salary details, filing acknowledgements, TDS certificates, documents and accounting backups the Customer uploads, messages |
| Not processed | Portal passwords, full 12-digit Aadhaar numbers, DSC PINs and private keys |
| Duration | The term of the Terms plus the export and deletion periods in section 11 |

## Annex 2: Security measures

These are the measures in the Service as built at the date of this draft [engineering to confirm each line before signing]:

1. **Tenant isolation:** each firm's data is separated by PostgreSQL row-level security enforced by the database, with every request carrying a signed, short-lived context; a missing or tampered context sees nothing.
2. **Access control by role:** partners see the whole firm; managers and staff see only assigned clients or groups; module rights per user.
3. **Authentication:** two-factor sign-in with an authenticator app for every user, single-use recovery codes, Argon2id password hashing, lockout for 15 minutes after repeated wrong passwords, rotating session tokens not readable by page scripts, server-side sign-out.
4. **Maker and checker:** only a partner, or a manager the partner authorises, can approve or mark a return filed, and never one they prepared.
5. **Filed-period locks:** once a return is saved on the portal or filed, its invoices and deductee rows cannot be added to, edited or deleted.
6. **Masking and reveal log:** PAN and bank account numbers masked by default; revealing a full value needs a reason and is written to an append-only log before it is shown.
7. **Bulk export controls:** client list, assessee register and audit trail exports limited to partners and logged.
8. **Tamper-evident audit trail:** database triggers record every change to clients, registrations, invoices, challans and returns with who, when, IP and request ID; update, delete and truncate on the audit tables are blocked; each row carries the SHA-256 of the previous row of the same firm and a per-firm chain head detects removal from the end. Credential ciphertext and hash fields are stripped before logging.
9. **Signing:** DSC signing happens on the user's computer through the SynTax Sign local signer on a loopback address, restricted to known origins, with a single-use nonce per request; the PIN and private key never leave the token; every signing attempt is logged, and signing is refused if it cannot be logged.
10. **Encryption:** TLS in transit; encryption at rest for the database and document storage, with AWS KMS keys in India; the two-factor secret encrypted with AES-256-GCM.
11. **India-only regions:** integrations refuse non-India AWS regions; S3 document storage replicated from Mumbai to Hyderabad.
12. **AI redaction:** identifiers replaced with placeholders before any text reaches the model; restore map kept server-side.
13. **File validation isolation:** the official File Validation Utility runs in isolated containers with no outbound internet access.
14. **Short-lived links:** client upload links and TDS certificate links are random tokens kept only as SHA-256 hashes; certificate links last 7 days and serve one certificate.
15. **Backups:** managed database with point-in-time recovery; customer accounting backups stored by the backup agent with configurable retention; partners alerted when a scheduled backup is late.
16. **No tracking:** no advertising or third-party tracking scripts.
17. **Logging:** security and access logs kept for at least one year (DPDP Rules) and ICT logs for a rolling 180 days in India (CERT-In) [verify].

## Annex 3: Authorised Sub-processors (placeholders)

| Sub-processor | Service | Location of processing | Client Personal Data involved | Status |
|---|---|---|---|---|
| Amazon Web Services India Private Limited [confirm contracting entity] | Hosting (ECS Fargate), database (RDS PostgreSQL), cache (ElastiCache), document storage (S3), key management (KMS), email (SES), AI model (Bedrock) | AWS Mumbai **ap-south-1**; replica in AWS Hyderabad **ap-south-2** | All | [Account to be opened] |
| [GSP name] | GST Suvidha Provider: API access to the GST Network for saving and filing GST returns and fetching GSTR-2B and ledgers | India [confirm] | GSTIN, invoice data, return data of clients being filed | [Contract pending] |
| [SMS provider name] | SMS through TRAI DLT-registered templates (reminders, one-time codes) | India [confirm] | Mobile number, template variables | [To be selected] |
| Meta Platforms, Inc. / Meta Platforms Ireland Limited [confirm entity] | WhatsApp Cloud API (reminders and TDS certificate notices), only if the Customer turns it on | **Outside India** | Indian mobile number, message text | [Account pending] |
| [WhatsApp Business Solution Provider, if used instead of direct Cloud API] | WhatsApp messaging | [confirm] | As above | [Optional] |
| [Web front-end host, for example Vercel Inc.] | Serving the web application and proxying API requests | [Edge locations may be outside India: confirm, or move to India-only hosting before production] | Request contents in transit [confirm] | [Open question] |

Not Sub-processors for Client Personal Data: [payment gateway name] (processes the Customer's own billing data, for which Synex Labs is Data Fiduciary); Statutory Recipients (section 9.4).

---

## Open questions for the lawyer

1. **Notice period to the Customer.** Is [24] hours from awareness the right commitment, given the Customer must tell the Board without delay and give details within 72 hours (Rule 7(2))? Should it be shorter for the initial alert?
2. **CERT-In coverage.** Is Synex Labs a "service provider" or "body corporate" covered by the 28 April 2022 directions, and is a CA firm using SaaS also covered? Who reports an incident in Synex Labs' systems that affects a firm's clients?
3. **Audit trail and deletion.** Which option in section 11.3(b) is lawful and defensible under section 8(7) of the DPDP Act, the Companies Act audit trail rules, and CGST section 36?
4. **WhatsApp transfer.** Does sending message text through Meta outside India need anything beyond disclosure and the Customer's choice to turn it on, given Rule 15 and any orders under section 16?
5. **Front-end hosting.** Does the Vercel-hosted front end and API proxy count as processing outside India? Should production move to India-only hosting before the pilot?
6. **GSP role.** Is a GSP a Sub-processor of Synex Labs, a processor of the Customer, or an intermediary acting for the taxpayer under GST law? Should the Customer contract with it directly?
7. **Processor liability.** Under the DPDP Act, penalties fall on the Data Fiduciary. Should the DPA give the Customer an indemnity for penalties caused by Synex Labs' breach, and at what cap?
8. **Consent records.** Is it acceptable for the Data Processor's system to hold the Data Fiduciary's consent records, and does that create any Consent Manager issue under section 6(7) to 6(9)?
9. **Significant Data Fiduciary customers.** If a large Customer is notified as a Significant Data Fiduciary under section 10, what extra DPA terms (audits, DPIA support) are needed?
