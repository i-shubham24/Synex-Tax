# Companies (Accounts) Rules, 2014: Rule 3(5) and 3(6) Cloud Disclosure Template

> **DRAFT for legal review, not legal advice.**
> Prepared by the product team on 26 November 2026 for review by Indian counsel and a practising Company Secretary or Chartered Accountant. It is a template a company client of a SynTax firm can adapt; it is not a filing and does not by itself make a company compliant. Placeholders are in [square brackets]. The wording of Rule 3(1), 3(5) and 3(6) below is summarised from the rule as amended by the Companies (Accounts) Fourth Amendment Rules, 2022 (G.S.R. 624(E), 5 August 2022), read from a secondary legal database; confirm it against the MCA's official text before use. Open questions for the lawyer are at the end.

---

## Part A: What the rules require (summary for the company)

Under the Companies Act, 2013, books of account may be kept in electronic form (section 128 [verify sub-section]). Rule 3 of the Companies (Accounts) Rules, 2014 sets the manner:

| Rule | Requirement (summary) |
|---|---|
| **3(1)** | Books of account and other books and papers kept in electronic mode must remain accessible in India, at all times, so as to be usable for subsequent reference. |
| **3(1), proviso** | For financial years starting on or after 1 April 2023, a company using accounting software must use software that records an audit trail of each transaction, creates an edit log of each change with the date of the change, and ensures the audit trail cannot be disabled. |
| **3(5)** | A backup of the books of account and other books and papers kept in electronic mode, including at a place outside India, must be kept on servers physically located in India on a **daily** basis. |
| **3(6)** | The company must intimate to the Registrar, on an annual basis at the time of filing its financial statements: (a) the name of the service provider; (b) the internet protocol address of the service provider; (c) the location of the service provider (where applicable); (d) where the books are kept on cloud, the address as provided by the service provider; and (e) where the service provider is outside India, the name and address of the person in control of the books and papers in India. |

The intimation under Rule 3(6) is given in the financial statement filing form [verify: Form AOC-4 / AOC-4 XBRL field names and whether an attachment is accepted].

**Where SynTax fits.** SynTax is GST, TDS/TCS and practice-management software used by the company's CA firm. It may hold some of the company's "other books and papers" (for example invoices, GST working papers, TDS registers and challans) and, if the firm uses the SynTax backup agent, a daily copy of the company's accounting data files from Tally, Busy, Marg, Zoho or Vyapar. SynTax is not, by itself, the company's general ledger. Each company must decide, with its auditor, which of its electronic books are kept where and list every service provider that applies.

---

## Part B: Facts about SynTax the company can rely on

[Synex Labs to confirm each fact in writing before a company relies on it.]

| Item | SynTax position |
|---|---|
| Service provider (software) | Synex Labs, [registered office address], Amritsar, Punjab, India |
| Underlying cloud provider | Amazon Web Services [India contracting entity to confirm] |
| Primary location | AWS Asia Pacific (Mumbai) region, **ap-south-1**, India |
| Backup / replica location | AWS Asia Pacific (Hyderabad) region, **ap-south-2**, India |
| Data outside India | None for stored records. (Only WhatsApp message text, if the firm turns WhatsApp on, passes through Meta's servers outside India; this is not a book of account.) |
| Database backup | Managed PostgreSQL with point-in-time recovery in India [confirm frequency and retention] |
| Document storage | Amazon S3 in Mumbai, encrypted with AWS KMS keys, replicated automatically to Hyderabad |
| Accounting file backups (backup agent) | Runs **daily** at a time the firm sets (default 20:00 IST); retention set per rule between 7 days and 10 years; partners are emailed if a backup is late |
| Access in India at all times | Records can be viewed and exported through the web application from India at any time, subject to service availability |
| Audit trail | Append-only change log for clients, registrations, invoices, challans and returns, with who, when and what changed; it cannot be edited, deleted or switched off by any user, including partners (see Part D) |
| IP address | Cloud services use addresses assigned by AWS that can change. [Synex Labs to provide a stable public endpoint name and the published AWS IP ranges for ap-south-1, or a fixed address if MCA practice requires one.] |

---

## Part C: Template intimation

> To be adapted by the company and its Company Secretary or auditor. Delete rows that do not apply. Add a row for each other service provider (for example the provider of the company's main accounting software if it is cloud-hosted).

**[Name of company]**
**CIN:** [CIN]
**Registered office:** [address]
**Financial year:** [1 April 20XX to 31 March 20XX]

**Particulars of books of account and other books and papers maintained in electronic mode, under Rule 3(6) of the Companies (Accounts) Rules, 2014**

1. **Books and papers covered:** [for example: books of account maintained in Tally Prime on the company's computer at the registered office; GST invoices, GST return working papers, TDS registers and challans maintained by the company's tax consultant [firm name] in SynTax; daily backup of the Tally data files in SynTax].

2. **Name of the service provider:**
   - (i) Synex Labs (SynTax), [registered office address], Amritsar, Punjab, India; using
   - (ii) Amazon Web Services [India contracting entity], as cloud infrastructure provider.
   - [Add other providers.]

3. **Internet protocol address of the service provider:** [IP address or endpoint as provided by Synex Labs in writing] [see open question 2].

4. **Location of the service provider:** India. Primary servers in AWS Asia Pacific (Mumbai) region (ap-south-1), Maharashtra; backup servers in AWS Asia Pacific (Hyderabad) region (ap-south-2), Telangana.

5. **Where the books are maintained on cloud, address as provided by the service provider:** [address as stated by Synex Labs, for example: "AWS Asia Pacific (Mumbai) region ap-south-1, Mumbai, Maharashtra, India; replica in AWS Asia Pacific (Hyderabad) region ap-south-2, Hyderabad, Telangana, India", or the data centre address if the service provider gives one].

6. **Service provider located outside India:** Not applicable. The service provider and servers are located in India. [If not applicable, delete. Otherwise: name and address of the person in control of the books in India.]

7. **Daily backup in India (Rule 3(5)):** A backup of the electronic books and papers listed at 1 is kept on servers physically located in India on a daily basis: [describe, for example: "the SynTax backup agent uploads the Tally data files daily at [time] to SynTax storage in AWS Mumbai, retained for [period]"].

8. **Accessibility in India (Rule 3(1)):** The books and papers listed at 1 remain accessible in India at all times through [describe access, for example the SynTax web application and the company's own computer].

9. **Audit trail (Rule 3(1) proviso):** The accounting software used for the books of account is [name and version], which records an audit trail of each transaction and an edit log of each change with the date of the change, and the audit trail cannot be disabled. [Records maintained in SynTax are additionally covered by the SynTax change log described in Part D.]

Signed for and on behalf of [Name of company]

[Name], [Director / Company Secretary / CFO]
DIN / Membership No.: [number]
Date: [date]
Place: [place]

---

## Part D: Note on the Rule 3(1) audit trail in SynTax

1. **What is logged.** A database trigger records every insert, update and delete on clients, registrations, invoices, challans, deductee records, returns and related tables, with the old and new values, the change, the user, the time (IST), the IP address and a request identifier. The user comes only from a signed request context, not from anything the user can set.

2. **It cannot be disabled or altered.** The audit tables have database triggers that block every update, delete and truncate, for all users including partners and Synex Labs' application. There is no setting in the application to turn logging off.

3. **Tamper evidence.** Each log row carries the SHA-256 hash of the previous row for the same firm, and a per-firm chain head records the last link. A changed, removed or reordered row, or rows removed from the end, break the chain. A partner can export the log as a JSON file and the chain can be recomputed to check it.

4. **What it does not cover.** The SynTax log covers records kept in SynTax. It does not cover changes made in the company's own accounting software (for example Tally, Busy or Zoho Books). Daily backups of those files stored by the SynTax backup agent are copies, not an audit trail; each version is kept with its SHA-256 checksum, but the edit log inside the accounting software is what Rule 3(1) looks at for the books of account. The company must enable and keep that software's own audit trail feature.

5. **Auditor reporting.** The company's statutory auditor reports on the audit trail under the Companies (Audit and Auditors) Rules, 2014 [verify: Rule 11(g)]. On request, the CA firm can give the auditor an export of the SynTax change log for the year.

6. **Retention.** Audit trail entries for the company's records are kept for as long as the related records must be kept (eight financial years for books of account under section 128 of the Companies Act, 2013 [verify sub-section]), unless the company's firm leaves SynTax and the exit arrangements in the Data Processing Agreement apply.

---

## Open questions for the lawyer

1. **Who is the "service provider".** For a SaaS on AWS, should the company name Synex Labs, AWS, or both? Does the answer change if the company itself never logs in to SynTax and only its CA firm does?
2. **IP address.** Cloud services do not have a single fixed IP address. What does MCA practice accept for Rule 3(6)(b): an endpoint hostname, AWS published IP ranges, or a static IP Synex Labs must provision?
3. **"Address as provided by the service provider".** Is the AWS region name sufficient, or must a data centre street address be given (AWS does not normally publish one)?
4. **Are SynTax records "books of account".** Are GST invoices, TDS registers and working papers held in SynTax "other books and papers" under section 2(13) of the Companies Act, 2013 [verify section], so that Rule 3 applies to SynTax for the company?
5. **Backup agent and Rule 3(5).** Does a daily upload of the company's Tally or Busy data file by the CA firm's backup agent satisfy the company's daily backup duty, given the firm (not the company) controls the SynTax Workspace? Should the company have its own access or a written undertaking from the firm?
6. **Form and field.** Confirm the current form (AOC-4 / AOC-4 XBRL / AOC-4 CFS) and the exact fields or attachment used for the Rule 3(6) intimation.
7. **Audit trail claim.** Is it accurate and safe for Synex Labs to state that the SynTax audit trail "cannot be disabled", given that the database owner role can in principle alter triggers during migrations (as happened once, inside a single transaction, to backfill the hash chain)? Should the statement be qualified, and should owner-level operations be logged separately?
8. **Liability.** Should Synex Labs give companies (who are not its customers) any written confirmation of these facts, and on what liability terms?
