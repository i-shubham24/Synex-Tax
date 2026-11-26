# SMS (DLT) and WhatsApp template drafts (items 6 and 7)

Drafts to submit for approval. `{#var#}` is the DLT variable marker; WhatsApp uses `{{1}}`, `{{2}}`. Punjabi and Hindi lines are drafts: have a native speaker check them before submission. Never put PAN, GSTIN, Aadhaar, amounts owed to the government or OTPs for portals in these messages; the only OTP we send is our own sign-in OTP.

Header (sender ID) to request: `SYNEXT` (6 characters, as in the playbook). Category: Service Implicit for client reminders sent by the CA firm, Transactional for our own sign-in OTP.

## SMS (DLT)

| ID | Type | English |
|----|------|---------|
| S1 | Transactional (OTP) | `{#var#} is your SynTax sign-in code. It expires in 10 minutes. Do not share it. - Synex Labs` |
| S2 | Service Implicit | `Dear {#var#}, {#var#} needs your documents for {#var#} by {#var#}. Upload here: {#var#} - SynTax` |
| S3 | Service Implicit | `Dear {#var#}, your {#var#} for {#var#} has been filed by {#var#}. - SynTax` |
| S4 | Service Implicit | `Reminder: {#var#} is due on {#var#}. Please share pending papers with {#var#}. - SynTax` |

Punjabi drafts:
- S2: `ਪਿਆਰੇ {#var#}, {#var#} ਨੂੰ {#var#} ਲਈ ਤੁਹਾਡੇ ਕਾਗਜ਼ {#var#} ਤੱਕ ਚਾਹੀਦੇ ਹਨ। ਇੱਥੇ ਭੇਜੋ: {#var#} - SynTax`
- S3: `ਪਿਆਰੇ {#var#}, ਤੁਹਾਡੀ {#var#} ({#var#}) {#var#} ਵੱਲੋਂ ਫਾਈਲ ਕਰ ਦਿੱਤੀ ਗਈ ਹੈ। - SynTax`

Hindi drafts:
- S2: `प्रिय {#var#}, {#var#} को {#var#} के लिए आपके दस्तावेज़ {#var#} तक चाहिए। यहाँ अपलोड करें: {#var#} - SynTax`
- S3: `प्रिय {#var#}, आपका {#var#} ({#var#}) {#var#} द्वारा फ़ाइल कर दिया गया है। - SynTax`

Links in S2 must be on a whitelisted domain (register the production domain from item 9 in the DLT URL whitelist).

## WhatsApp (utility templates, Phase 2)

| Name | Language | Body |
|------|----------|------|
| `doc_request_v1` | en | `Hello {{1}}, {{2}} needs these documents for {{3}}: {{4}}. Please upload by {{5}} using the button below.` Button: URL `Upload documents` |
| `doc_request_v1` | pa | `ਸਤ ਸ੍ਰੀ ਅਕਾਲ {{1}}, {{2}} ਨੂੰ {{3}} ਲਈ ਇਹ ਕਾਗਜ਼ ਚਾਹੀਦੇ ਹਨ: {{4}}। ਕਿਰਪਾ ਕਰਕੇ {{5}} ਤੱਕ ਹੇਠਾਂ ਦਿੱਤੇ ਬਟਨ ਨਾਲ ਭੇਜੋ।` |
| `doc_request_v1` | hi | `नमस्ते {{1}}, {{2}} को {{3}} के लिए ये दस्तावेज़ चाहिए: {{4}}। कृपया {{5}} तक नीचे दिए बटन से अपलोड करें।` |
| `filing_done_v1` | en | `Hello {{1}}, your {{2}} for {{3}} has been filed by {{4}}. The acknowledgement is in your client portal.` |
| `due_reminder_v1` | en | `Hello {{1}}, {{2}} is due on {{3}}. {{4}} is waiting for: {{5}}.` |

Opt-in: record the client's WhatsApp consent in the DPDP consent vault before the first message; every template carries the firm's name, not only SynTax's.
