# SynTax Privacy Notice (English)

> **DRAFT for legal review, not legal advice.**
> Prepared by the product team on 26 November 2026 for review by Indian counsel. It is written to meet the Digital Personal Data Protection Act, 2023 ("DPDP Act") and the Digital Personal Data Protection Rules, 2025 ("DPDP Rules"), which were notified on 13 November 2025. Under Rule 1 of the DPDP Rules, most obligations (Rules 3 and 5 to 16) come into force eighteen months after publication, that is on or about 13 May 2027; we intend to follow them from launch. Placeholders are in [square brackets]. References marked [verify section] are not yet confirmed. Punjabi and Hindi versions are in `privacy-notice-pa.md` and `privacy-notice-hi.md`. Open questions for the lawyer are at the end.

**Version:** [1.0 draft] | **Last updated:** [date]

## 1. Who we are

SynTax is software that Chartered Accountant firms, tax practitioners and businesses use to prepare, reconcile, approve and file GST, TDS/TCS and income-tax returns and to run their practice. It is built and operated by **Synex Labs**, [registered office address], Amritsar, Punjab, India ("we", "us").

## 2. Our two roles

The DPDP Act gives us two different roles, depending on whose data it is.

| Whose data | Examples | Who decides why and how it is used | Our role |
|---|---|---|---|
| **You, as a SynTax user** (partner, manager, staff member of a firm, or a business user) | Name, work email, mobile, firm name, role, sign-in records | Synex Labs | **Data Fiduciary** |
| **Your firm's clients and the people in their records** (business owners, directors, contact persons, deductees, payees, employees in salary registers) | PAN, GSTIN, TAN, invoices, challans, deductee and payee details, documents uploaded through the client portal | The CA firm or business using SynTax | **Data Processor** acting for that firm |

**If you are a client of a firm that uses SynTax**, that firm is the Data Fiduciary for your data and is responsible for giving you notice and handling your requests. Please contact the firm first. We will help the firm respond. Sections 4 to 12 below also describe how your data is protected while it is in SynTax.

## 3. What personal data we process (itemised)

**3.1 Account data (we are Data Fiduciary)**

- Name, work email address, mobile number.
- Firm or business name, ICAI firm registration number (if given), and your role in the firm.
- Two-factor sign-in settings (the authenticator secret is stored encrypted; recovery codes are shown to you once).
- Password, stored only as an Argon2id hash. We never see or store your password in readable form.

**3.2 Security and usage data (we are Data Fiduciary)**

- Sign-in events, IP address, browser type and request identifiers.
- An audit log of changes you make in SynTax.
- A log of every time a masked value (such as a PAN or bank account number) is revealed, with the reason you gave.

**3.3 Billing data (we are Data Fiduciary)**

- Plan, invoices, GSTIN for billing, payment status and e-mandate status. Card and UPI details are handled by our payment provider, [payment gateway name]; we do not store them.

**3.4 Client data your firm uploads (we are Data Processor)**

- Legal and trade names, PAN, GSTIN, TAN, addresses, contact persons, email and mobile numbers.
- Invoices, challans, deductee and payee records, salary register entries, lower deduction certificates, declarations, filing acknowledgements and TDS certificates.
- Documents and accounting backup files uploaded through the client portal or the backup agent.
- Messages between the firm and its clients inside SynTax.

**3.5 What we never collect**

- Passwords for the GST portal, the income-tax e-filing portal or TRACES. Where portal access is offered it runs through official API consent that the taxpayer can revoke on the portal.
- Full 12-digit Aadhaar numbers.
- DSC token PINs or private keys. Signing happens on your own computer through the SynTax Sign local signer; the PIN and key never leave the token.

## 4. Why we use it (specified purposes)

| Purpose | Data used | Legal basis |
|---|---|---|
| Create and run your account and workspace | Account data | Your consent, given when you sign up, and performance of our terms |
| Keep accounts secure: two-factor sign-in, lockouts after repeated wrong passwords, fraud checks, the audit trail | Account, security and usage data | Consent, and legitimate uses permitted under section 7 of the DPDP Act [verify which clause] |
| Prepare, reconcile, validate and (where available) transmit returns your firm asks for | Client data | On the firm's instructions, as its Data Processor |
| Send service messages: filing reminders, approval requests, document requests, TDS certificates, statutory notices, in English, Punjabi or Hindi | Account data, client contact details | Consent (for the firm's clients, the firm's consent records under purposes such as client communication and WhatsApp alerts) |
| Answer questions through the built-in assistant | Text you type, with identifiers removed first (section 6) | Consent |
| Bill for your plan and meet our tax obligations | Billing data | Consent, and compliance with law |
| Comply with law, court orders and directions of authorities such as CERT-In | Any data the law requires | Legitimate use for compliance with law [verify clause of section 7] |

We do **not** sell personal data, use it for advertising, or use your clients' records to train AI models.

## 5. Where your data is stored

All personal data is stored and processed in **India**: Amazon Web Services Mumbai (ap-south-1), with an encrypted standby copy in AWS Hyderabad (ap-south-2). Email is sent through Amazon SES in an India region. The settings for our cloud services only accept India regions.

**The one exception:** if your firm turns on WhatsApp messages, the message (for example the client name, period, documents outstanding, due date and firm name, or a link to a TDS certificate) is delivered through Meta's WhatsApp Cloud API, whose servers are outside India. Only the message itself is sent. Cross-border transfer is permitted under section 16 of the DPDP Act and Rule 15 of the DPDP Rules unless the Central Government restricts it; we will stop or change this if it does.

## 6. AI features

The SynTax assistant runs on a language model hosted by Amazon Bedrock in an AWS India region. Before any text is sent to the model, PAN, GSTIN, TAN, Aadhaar-like numbers, bank account numbers, IFSC codes, mobile numbers and email addresses are replaced with placeholders, and the map that puts them back stays on our servers. We do not send raw personal data to AI or analytics services outside India.

## 7. Who we share it with

Only the parties needed to do what you or your firm ask:

- GST Suvidha Providers and the GST Network, to save and file GST returns.
- The NIC e-invoice and e-way bill systems, when your firm generates an IRN or e-way bill.
- Protean and the Income Tax Department (including TRACES), for TDS statements and related services.
- Our service providers, bound by contract to protect the data and to use it only for SynTax: Amazon Web Services (hosting, storage, email, AI model, in India), [SMS provider name] (SMS through registered DLT templates), Meta Platforms (WhatsApp, if turned on), and [payment gateway name] (billing).
- Authorities, when the law requires it.

The current list of service providers is kept at [URL] and in our Data Processing Agreement.

## 8. How we protect it

Following section 8(5) of the DPDP Act and Rule 6 of the DPDP Rules, we use:

- Encryption in transit and at rest, with keys managed in AWS KMS in India.
- Separation of each firm's data from every other firm by the database itself (row-level security), not only by application code.
- Access by role: partners see the whole firm; managers and staff see only clients assigned to them.
- Maker and checker: staff prepare, a partner or authorised manager approves, never their own work.
- Masking: PAN and bank account numbers are masked by default. Seeing the full value needs a reason, and every reveal is logged before it is shown.
- Partner-only bulk export of the client list and the audit trail, with every export logged.
- A tamper-evident audit trail: each entry carries a SHA-256 hash of the one before it, so a changed, removed or reordered entry breaks the chain. The application cannot edit or delete the log.
- Backups, and a standby copy in a second India region, so service can continue after an incident.
- Logs kept for at least one year, as Rule 6 and Rule 8(3) of the DPDP Rules require.

## 9. How long we keep it

- **Account data:** while your account is active, and then for [one year] after it closes, or longer where the law requires.
- **Client data:** as long as the firm keeps it in SynTax and for the export period after it leaves (30 days), then deleted, except records the law requires to be kept. Tax law sets most of these periods, for example GST records until 72 months after the due date of the annual return (section 36 of the CGST Act, 2017), and company books for eight financial years (section 128 of the Companies Act, 2013). Records under a notice, appeal or litigation hold are kept until the matter closes.
- **Logs and audit trail:** at least one year (Rule 8(3) of the DPDP Rules), and as long as the related tax records where they form part of them.
- **Billing records:** for the period tax law requires [verify period].

Where we erase data because its purpose is over, we will tell you at least 48 hours before, as Rule 8(2) of the DPDP Rules requires, where that rule applies.

## 10. Your rights

Under sections 11 to 14 of the DPDP Act you can:

- get a summary of the personal data we process about you and who we have shared it with (section 11);
- have inaccurate or incomplete data corrected, completed or updated, and have data erased when it is no longer needed, unless the law requires us to keep it (section 12);
- withdraw consent at any time, as easily as you gave it; this stops future processing that depends on it but does not affect what was done before (section 6(4) and 6(5));
- raise a grievance with us (section 13);
- nominate one or more people to exercise your rights if you die or are unable to (section 14 and Rule 14(4)).

To exercise a right, email [privacy@synextax.in] from your registered email, or use [Settings > Privacy] in the application. We may ask for your registered email or mobile number to confirm who you are.

## 11. Grievances and the Data Protection Board

**Grievance Officer:** [Name], Synex Labs, [address], Amritsar, Punjab. Email: [grievance@synextax.in]. Phone: [number].

We acknowledge every grievance within [2 working days] and aim to resolve it within **30 days**, and in every case within the 90 days allowed by Rule 14(3) of the DPDP Rules.

If you are not satisfied after using our grievance process, you can complain to the **Data Protection Board of India** [website and address]. Section 13(3) of the DPDP Act requires you to use our grievance process first.

## 12. If something goes wrong

If a personal data breach affects you, we will tell you without delay through your account or registered contact, explaining what happened, the likely consequences, what we are doing and what you can do, as Rule 7(1) of the DPDP Rules requires. We will inform the Data Protection Board without delay and give it a detailed report within 72 hours (Rule 7(2)). We report cyber incidents to CERT-In within 6 hours of noticing them, as its directions of 28 April 2022 under section 70B(6) of the Information Technology Act, 2000 require. Where the affected data belongs to a firm's clients, we tell the firm at once so it can meet its own duties.

## 13. Cookies and browser storage

We use only what the service needs: a session cookie to keep you signed in, and browser storage for preferences such as light or dark mode. There are no advertising or third-party tracking cookies and no outside analytics scripts.

## 14. Children

SynTax is for professionals and businesses. We do not knowingly create accounts for anyone under 18. A firm's client records may include a minor (for example a payee); the firm, as Data Fiduciary, is responsible for any verifiable parental consent that section 9 of the DPDP Act requires.

## 15. Changes to this notice

When we change this notice we update the date above and tell account holders by email before a material change applies. Where a change needs fresh consent, we will ask for it.

## 16. Language

This notice is available in English, Punjabi and Hindi. [Confirm whether other Eighth Schedule languages must be offered on request.]

---

## Open questions for the lawyer

1. **Timing.** Most DPDP Rules apply from about 13 May 2027. Is it right to publish a DPDP-style notice now, and should it say that some rights are offered voluntarily until then?
2. **Legal basis.** Which clause of section 7 (legitimate uses) fits security logging and compliance with law, so we do not rely on consent for them?
3. **WhatsApp.** Is the disclosure of Meta's servers outside India sufficient, or do we need separate express consent from each client recipient? Who collects it: the firm or us?
4. **Payee notices.** Payees who receive TDS certificates by email or WhatsApp never deal with us. Is the firm's notice enough, or should each message carry a short notice link?
5. **Audit trail and erasure.** How should erasure and correction requests be reconciled with an append-only, hash-chained audit log that holds copies of changed records?
6. **Retention of account data.** Is [one year] after closure reasonable, given Rule 8(3) requires logs for at least one year?
7. **Language versions.** Are English, Punjabi and Hindi enough for a Punjab pilot, and which version prevails?
8. **Significant Data Fiduciary.** Could Synex Labs be notified as a Significant Data Fiduciary under section 10 because of the volume of PAN and financial data? What should we prepare?
9. **Web front end.** The staging web front end is served by Vercel and its API proxy passes requests through it. Does that count as processing outside India that must be disclosed, or should production be served only from India?
