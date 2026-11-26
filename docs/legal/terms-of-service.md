# SynTax Terms of Service

> **DRAFT for legal review, not legal advice.**
> Prepared by the product team on 26 November 2026 for review by Indian counsel before the Amritsar pilot (December 2026). Nothing here has been approved by a lawyer. Placeholders are in [square brackets]. Statutory references marked [verify section] have not been confirmed against the official text. Open questions for the lawyer are listed at the end.

**Version:** [0.1 draft] | **Effective date:** [date] | **Last updated:** [date]

These Terms of Service ("Terms") are an agreement between **Synex Labs** [legal form, for example LLP or private limited company, registration number, registered office address, Amritsar, Punjab] ("Synex Labs", "we", "us") and the firm or business that creates a SynTax workspace ("Customer", "you"). The individual who accepts these Terms confirms that they are authorised to bind the Customer.

The following form part of these Terms: the Order Form or online plan selection, the Privacy Notice, and the Data Processing Agreement ("DPA"). If they conflict, the order of priority is: (1) a signed Order Form, (2) the DPA (for personal data), (3) these Terms, (4) the Privacy Notice.

---

## 1. Definitions

- **Service:** the SynTax cloud software, its web application, the SynTax Sign local signer (`dsc-agent`), the backup agent, the client upload portal, and related support.
- **Workspace:** the Customer's tenant in the Service, walled off from every other customer at the database level.
- **Customer Data:** all data the Customer or its users put into the Service, including data about the Customer's own clients, their deductees, payees, contacts and invoices.
- **Authorised User:** a partner, manager, staff member or client contact whom the Customer invites to the Workspace.
- **Partner:** an Authorised User with the partner role, who controls access, approvals and bulk exports in the Workspace.
- **Government Systems:** systems we do not run, including the GST portal and GST Network, GST Suvidha Providers (GSPs), the NIC e-invoice and e-way bill systems, TRACES, Protean (NSDL) and the income-tax e-filing portal.
- **Subscription Term:** the paid period shown on the Order Form or plan selection, normally twelve months.

## 2. What SynTax is, and what it is not

2.1 **A preparation and transmission tool.** SynTax helps the Customer prepare, reconcile, validate, approve and, where an authorised channel is available, transmit GST, TDS/TCS and income-tax returns and related documents, and keeps the records and audit trail behind them. Where direct filing is not yet available, the Service produces portal-ready files (such as GST return JSON or TDS statement files validated with the official File Validation Utility) that the Customer uploads itself.

2.2 **Not tax, legal or professional advice.** SynTax is software. It does not give tax, legal, accounting or other professional advice, and it does not act as the Customer's tax practitioner, authorised representative or auditor. Calculations, rate tables, section mappings, reconciliation matches, mismatch flags, reminders and drafts produced by the Service (including any text produced by the built-in assistant) are working aids only.

2.3 **The Customer remains responsible for every filing.** The Customer, and where the Customer is a firm of Chartered Accountants, its partners and members, remain solely responsible for:

- (a) checking every figure, classification, section code, rate and deductee or payee detail before approving or filing;
- (b) every return, statement, certificate, reply or other document filed, signed, uploaded or sent using the Service, whether filed through the Service or by uploading a file it produced;
- (c) the advice the Customer gives its own clients, and its professional duties to them, including duties under the Chartered Accountants Act, 1949 and the ICAI Code of Ethics [verify references];
- (d) meeting due dates, including when a Government System is unavailable.

2.4 **Approval by a person.** The Service is built so that a person approves before anything is filed: staff prepare, and only a Partner, or a manager the Partner has authorised, can approve or mark a return filed, and never one they prepared themselves. The Customer must not configure or use the Service to bypass this review.

## 3. Accounts, access and security

3.1 Each Authorised User must have their own login with two-factor sign-in. Logins must not be shared.

3.2 Partners decide who sees which clients and who may approve filings. Managers and staff see only the clients or groups assigned to them.

3.3 The Customer is responsible for activity in its Workspace, for removing access promptly when a person leaves, and for telling us without delay at [security@synextax.in] about any suspected unauthorised access.

3.4 **What we never ask for or store.** We do not ask for or store passwords for the GST portal, the income-tax e-filing portal or TRACES; full 12-digit Aadhaar numbers; or DSC token PINs or private keys. Portal access, where offered, runs through the official API consent the taxpayer can revoke on the portal. Digital signing happens on the Customer's own computer through the SynTax Sign local signer; the PIN and private key never leave the token. The Customer must not enter such secrets into free-text fields, documents or messages in the Service.

3.5 **Masking and logging.** PAN and bank account numbers are masked on screen by default. Revealing a full value requires a reason, and every reveal is recorded in a log that the application cannot edit or delete. Bulk export of the client list and of the audit trail is limited to Partners and is logged.

## 4. Trial

4.1 A new Workspace receives a **14-day free trial**. No card or payment details are required to start it. During the trial the Customer may use sample clients and create up to [3] real clients.

4.2 At the end of the trial the Workspace becomes [read-only] until the Customer selects a paid plan. If no plan is selected within [30] days after the trial ends, we may delete the trial Workspace after giving [7] days' notice by email, and the Customer may export its data during that period.

4.3 Trial use is provided as is, without the service commitments in section 9.

## 5. Subscription, fees and payment

5.1 **Plans.** Paid plans are billed yearly in advance. At the date of this draft the published plans are: Solo practitioner ₹8,999, Growth firm ₹15,999 and Scale practice ₹29,999 per year, plus GST at the applicable rate (currently 18%) [confirm prices, plan limits and included modules against the live pricing page before publication]. Add-on suites and usage-based items (if any) are as shown on the Order Form.

5.2 **No per-PC or per-device fees.** Fees are per Workspace and plan, not per computer. Authorised Users may sign in from any supported device. There are no per-PC licence keys, hardware dongles or installation fees. The SynTax Sign local signer and the backup agent may be installed on as many of the Customer's computers as it needs.

5.3 **Invoices and tax.** We issue a GST tax invoice for each payment. Fees exclude GST and any other applicable taxes, which the Customer pays. If the Customer is required by law to deduct tax at source from our fees, it must deposit the tax, file the statement and provide the TDS certificate in time [verify applicable section under the Income-tax Act, 2025].

5.4 **Payment methods.** Payment is collected through [payment gateway name]. We do not store card or UPI details. Recurring payments use an RBI-compliant e-mandate, including advance notice before each debit and any additional authentication the RBI framework requires for the amount [verify current RBI e-mandate circular and per-transaction limit].

5.5 **Late payment.** If an invoice is unpaid [15] days after the due date, we will send a reminder. If it remains unpaid [15] days after the reminder, we may suspend the Workspace under section 7.

5.6 **Price changes.** We may change fees for a future Subscription Term by giving at least [30] days' notice by email before renewal. Fees for a Subscription Term already paid will not change.

5.7 **Refunds.** Fees paid for a Subscription Term that has started are not refundable, except (a) where these Terms say otherwise, (b) on termination by the Customer for our material breach under section 11.3, when we refund the unused portion pro rata, or (c) where the law requires.

## 6. Renewal and cancellation

6.1 Each Subscription Term renews automatically for a further term of the same length unless either party cancels before the renewal date.

6.2 We will remind the Customer by email at least [15] days before renewal, and the payment provider will send any pre-debit notice the RBI framework requires.

6.3 The Customer can cancel renewal at any time in the billing settings. Access continues until the end of the paid term.

## 7. Suspension

7.1 We may suspend all or part of the Service:

- (a) for non-payment, after the notices in section 5.5;
- (b) if an Authorised User's account appears compromised or the Workspace is being used in a way that threatens the security or integrity of the Service or other customers' data;
- (c) for a serious breach of section 8 (Acceptable use);
- (d) if required by law, a court, CERT-In or another competent authority.

7.2 We will give notice before suspension where it is lawful and practical, and otherwise as soon as possible afterwards, with the reason and what is needed to lift it.

7.3 **Export during suspension.** Except where suspension is required by law or to stop an active security threat, a Partner can still sign in to export the Workspace's data while the Workspace is suspended for non-payment.

7.4 Suspension does not delete data. We lift a suspension promptly once its cause is resolved.

## 8. Acceptable use

The Customer must:

- (a) use the Service only for lawful compliance and practice work for itself and its own clients;
- (b) upload personal data only where it has a lawful basis and has given any notice required under the Digital Personal Data Protection Act, 2023 ("DPDP Act") (see the DPA);
- (c) not try to access another customer's data, probe, scan or overload the Service, or get around its security controls, masking or approval steps;
- (d) not upload malware, or data it has no right to hold;
- (e) not use the Service to file a return or document it knows to be false;
- (f) not resell, sublicense or white-label the Service without a written agreement with us.

Security research is welcome through the process on our security page; good-faith reports made through that process are not a breach of this section.

## 9. Availability, support and changes

9.1 We work to keep the Service available, especially in the days before statutory due dates, and announce planned maintenance in advance in the application and by email. [Service level target, for example 99.5% monthly availability excluding planned maintenance and Government System outages, and any service credits: founder decision.]

9.2 **Government Systems.** Filing depends on Government Systems that we do not run. Their outages, rule changes, schema changes, rate limits and rejections are outside our control. We show their status where we can and retry only where it is safe. A Government System outage is not a failure of the Service.

9.3 Support is provided by email and in-app messages during [business hours, IST], with extended hours around due dates [define].

9.4 We improve the Service over time. We will not remove a core feature of the Customer's plan during a paid Subscription Term without at least [30] days' notice and a reasonable alternative; if we do, the Customer may terminate and receive a pro rata refund.

## 10. Customer Data, confidentiality and data protection

10.1 **Ownership.** The Customer owns Customer Data. We receive a limited right to host, process, transmit and display it only to provide, secure and support the Service and as the Customer instructs.

10.2 **Roles under the DPDP Act.** For personal data about the Customer's clients and their contacts, deductees and payees, the Customer is the Data Fiduciary and Synex Labs is its Data Processor. The DPA sets out these terms. For the account data of Authorised Users and billing contacts, Synex Labs is a Data Fiduciary, as described in the Privacy Notice.

10.3 **Location.** Customer Data is stored and processed in India, in Amazon Web Services Mumbai (ap-south-1) with an encrypted standby copy in AWS Hyderabad (ap-south-2). The limited exceptions (for example WhatsApp messages the Customer chooses to send, which Meta delivers through servers outside India) are listed in the DPA.

10.4 **AI features.** The built-in assistant runs on a model hosted in an AWS India region. Identifiers such as PAN, GSTIN, TAN, Aadhaar-like numbers, bank account numbers, IFSC codes, mobile numbers and email addresses are replaced with placeholders before text is sent to the model, and the map that restores them stays on our servers. We do not send raw personal data to AI or analytics services outside India, and we do not use Customer Data to train AI models.

10.5 **Confidentiality.** Each party will keep the other's confidential information confidential, use it only for this agreement, and disclose it only to personnel and sub-processors who need it and are bound by similar duties, or where the law requires (with prompt notice to the other party where lawful).

10.6 **Aggregated statistics.** We may use aggregated, de-identified usage measures (for example counts of returns prepared) to run and improve the Service, provided they cannot reasonably identify the Customer, its clients or any individual.

## 11. Term, termination and exit

11.1 These Terms start when the Customer creates a Workspace and continue until all Subscription Terms end or the agreement is terminated.

11.2 The Customer may terminate at any time by cancelling renewal; access continues to the end of the paid term.

11.3 Either party may terminate by written notice if the other materially breaches these Terms and does not cure the breach within [30] days of notice, or becomes insolvent [verify drafting under the Insolvency and Bankruptcy Code, 2016].

11.4 **Data export on exit.** Before and for **30 days after** the agreement ends, a Partner can export the Workspace's data in machine-readable formats, including CSV or Excel registers, the portal-ready files the Service produced, stored documents and certificates, and the audit trail as a JSON file. On request made within that period we will provide reasonable help with export [at no charge / at our standard rates: founder decision].

11.5 **Deletion after exit.** After the export window we delete Customer Data from the live systems within [30] days and from backups as they expire within a further [35] days [confirm backup retention], except:

- (a) records the Customer has placed under a statutory legal hold, or that we must keep by law, which we keep only for the required period;
- (b) the tamper-evident audit trail, which is append-only and cannot be edited or deleted by the application; its treatment on exit is set out in the DPA [open question for counsel];
- (c) our own billing and tax records relating to the Customer.

On request we confirm deletion in writing.

11.6 Sections 2.2, 2.3, 10, 11.4 to 11.6, 12, 13 and 15 survive termination.

## 12. Warranties and disclaimers

12.1 We will provide the Service with reasonable care and skill, in line with its documentation, and maintain the security measures described in the DPA.

12.2 The Customer warrants that it has the right to provide Customer Data and has given the notices and holds the consents or other lawful basis the DPDP Act requires.

12.3 Except as stated in these Terms, the Service is provided "as is". To the extent the law allows, we disclaim implied warranties, including fitness for a particular purpose. We do not warrant that the Service will be uninterrupted, that every Government System change will be reflected before it takes effect, or that the Service will detect every error in the Customer's data.

## 13. Limitation of liability

13.1 **Excluded losses.** Neither party is liable for indirect, special or consequential loss, or for loss of profit, goodwill or opportunity.

13.2 **Penalties and interest.** We are not liable for tax, interest, late fees, penalties or other amounts levied by a tax authority, or for professional claims against the Customer, to the extent they result from (a) figures, classifications or filings the Customer approved, (b) data the Customer or its clients supplied, (c) the Customer's failure to meet a due date, or (d) a Government System being unavailable or changing.

13.3 **Cap.** Each party's total liability arising out of or in connection with these Terms, in contract, tort (including negligence) or otherwise, is limited to the fees paid and payable by the Customer to us in the **12 months** before the event giving rise to the claim.

13.4 **Exceptions.** The cap and exclusions do not apply to: (a) the Customer's obligation to pay fees; (b) liability for fraud or wilful misconduct; (c) liability that cannot be limited under Indian law. [Counsel to advise whether a separate, higher cap should apply to a personal data breach caused by our breach of the DPA, and how to treat any penalty imposed by the Data Protection Board.]

13.5 **Indemnity by the Customer.** The Customer will indemnify us against third-party claims arising from Customer Data uploaded without a lawful basis or from the Customer's breach of section 8 [counsel to review scope and reciprocity].

## 14. Changes to these Terms

We will email account holders at least 30 days before a material change takes effect, and show a notice in the application. If the Customer does not agree, it may cancel before the change takes effect and receive a pro rata refund of the unused paid term. Continuing to use the Service after that date means the Customer accepts the updated Terms.

## 15. Governing law and disputes

15.1 These Terms are governed by the laws of India.

15.2 The parties will first try in good faith to settle any dispute by discussion between senior representatives within [30] days of written notice.

15.3 Failing that, the courts at **[Amritsar, Punjab]** have exclusive jurisdiction [placeholder: founders to confirm; counsel to advise whether arbitration under the Arbitration and Conciliation Act, 1996 with a seat at Amritsar is preferable].

## 16. General

16.1 **Notices.** Notices to us go to [legal@synextax.in] and [registered office address]. Notices to the Customer go to the email of the Workspace owner and Partners on record.

16.2 **Force majeure.** Neither party is liable for delay caused by events beyond its reasonable control, including Government System outages, power or network failures not caused by that party, natural events and orders of authorities. This does not excuse payment obligations or our security obligations.

16.3 **Assignment.** The Customer may not assign these Terms without our consent, not to be unreasonably withheld. We may assign them to a successor of our business on notice, provided the successor is bound by the DPA and keeps Customer Data in India.

16.4 **Electronic acceptance.** These Terms may be accepted electronically and are an electronic record under the Information Technology Act, 2000 [verify section].

16.5 **Entire agreement, severability, waiver.** These Terms and the documents listed at the top are the entire agreement on their subject. If a provision is invalid, the rest continues. A failure to enforce a right is not a waiver.

16.6 **Language.** The English version prevails over any translation.

---

## Open questions for the lawyer

1. **Entity details.** What is Synex Labs' legal form and registration? Should the contracting entity be different from the brand owner?
2. **Advice disclaimer.** Is section 2 strong enough to keep SynTax outside regulated professional activity, given the assistant drafts notice replies and suggests section codes? Does anything in the Chartered Accountants Act, 1949 or ICAI guidance on use of technology by members need to be reflected?
3. **Liability cap.** Is a 12-month fees cap enforceable against CA firms under the Indian Contract Act, 1872 [verify section on unreasonable terms] and consumer protection law, and should data breaches have a separate super-cap?
4. **Penalties.** Can we validly exclude liability for interest and late fees where a Service defect (rather than the Customer's approval) caused a wrong figure?
5. **Auto-renewal and e-mandate.** Do sections 5.4 and 6 comply with the current RBI e-mandate framework, including additional authentication for amounts above the per-transaction limit (the Growth and Scale plans with GST exceed ₹15,000)?
6. **Dispute forum.** Courts at Amritsar, or arbitration seated at Amritsar? Is an exclusive jurisdiction clause enforceable against a customer located elsewhere in India?
7. **Audit trail on exit.** How should the immutable, hash-chained audit trail be handled when a customer leaves and requests deletion, given it contains copies of changed records?
8. **Trial deletion.** Is deleting an unconverted trial Workspace after notice acceptable, given trial users may have uploaded real client data?
9. **Click-wrap.** Is click-wrap acceptance sufficient, or should firms above a certain plan sign an Order Form?
10. **Service levels.** Should we commit to an uptime figure and service credits for the pilot, or keep it as a target only?
