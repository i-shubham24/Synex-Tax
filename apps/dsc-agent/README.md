# SynexTax Local Desktop DSC & Tally Agent (`apps/dsc-agent`)

The SynexTax Local Desktop Agent is a lightweight native daemon designed for CA workstations running Windows 10/11. It provides a secure loopback bridge enabling browser-based cloud tax compliance workflows to interface with physical hardware:

1. **Class 3 DSC on USB tokens** (ePass2003, ProxKey, mToken, eToken and others): the agent signs through the Windows certificate store, where the token's driver registers its certificates. It uses the smart card key storage provider (CNG) when the driver offers one and the older CryptoAPI provider otherwise. The private key stays on the token. Signing needs Windows; on other systems the agent lists no certificates.
2. **Local TallyPrime & Tally.ERP 9 XML Poller:**
   - Listens on `http://127.0.0.1:9000`
   - Enforces single-threaded concurrency locks to prevent Tally XML server crashes
   - Facilitates real-time incremental voucher syncing

---

## Security Architecture

- **Loopback Pinning:** Binds strictly to `127.0.0.1:15850`. Never exposes ports on external network interfaces (`0.0.0.0`).
- **Origin Header Verification:** Requests are strictly restricted to authorized domains:
  - `http://localhost:3000` (Local Development)
  - `http://127.0.0.1:3000` (Local Development)
  - `https://app.synextax.com` (Cloud Production)
- **Server-signed challenge tokens:** `/api/v1/sign`, `/api/v1/backup/run` and `/api/v1/fvu/prepare` need a `challengeToken` issued by `apps/api` (`POST /api/v1/dsc/agent-challenge`, or the DSC challenge). The token is signed with the server's Ed25519 key, names one action (`dsc.sign`, `backup.run`, `fvu.prepare`), lasts two minutes and is accepted once. A web page cannot make one up.
  - The agent trusts the key in `SYNEXTAX_AGENT_PUBLIC_KEY` (base64), or one built in with `-ldflags "-X github.com/synextax/synextax/apps/dsc-agent/security.EmbeddedPublicKey=<key>"`. `npm run agent-key -w @synextax/api` prints a new pair.
  - For local development start the agent with `SYNEXTAX_AGENT_DEV=1`; it then also trusts the API's development key. Never set this on a client's computer.
- **No PIN handling:** the token's own driver opens its PIN window. The agent never receives, stores or forwards a PIN.
- **Only server-built digests are signed:** the server builds the document from the return, keeps it, and sends its SHA-256 with a `dsc.sign` token. The agent returns the signature, the certificate and the issuers Windows found; the server checks the signature against the certificate and the certificate against its trusted roots.

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Daemon heartbeat, connected token count, Tally port status |
| `GET` | `/api/v1/tokens` | Signing certificates in the current user's Windows store that have a private key, are in date and may sign documents (TLS-only certificates are left out); PAN when the subject carries it in plain |
| `POST` | `/api/v1/sign` | `{challengeToken, certificateId, digestSha256}`: signs the digest (RSA PKCS#1 v1.5 or ECDSA, SHA-256) with that certificate's key; returns `{signature, algorithm, certificate, chain, certificateInfo}` |
| `POST` | `/api/v1/tally/query` | Proxies TDL XML payload to Tally with concurrency lock |
| `GET` | `/api/v1/backup/detect` | Tally, Busy and Marg data folders found on this machine |
| `POST` | `/api/v1/backup/run` | Zips one product's data folder with a SHA-256 manifest (needs a `backup.run` token); only the product's own folders are allowed |
| `GET` | `/api/v1/backup/list?product=tally` | Backups kept for a product, newest first (30 kept) |

| `POST` | `/api/v1/fvu/prepare` | Saves a statement (and CSI file) in a new working folder and opens Protean's FVU there (needs an `fvu.prepare` token) |
| `GET` | `/api/v1/fvu/result?folder=` | What the FVU produced in that folder: a `.fvu` file, or the error report as text |
| `GET` | `/api/v1/certificates/scan?folder=` | TDS certificate PDFs from the TRACES converter in the agent's certificates folder: PAN from the file name, signed or not |
| `POST` | `/api/v1/certificates/read` | `{challengeToken, file}`: one signed PDF of up to 2 MB, unchanged, from inside the certificates folder only (needs a `certs.read` token from `POST /api/v1/tds/certificates/agent-challenge`) |
| `GET` | `/api/v1/backup/uploader` | Whether this computer is paired for backup uploads, and what it last did per rule (the token is never shown) |

Settings (environment variables): `SYNEXTAX_FVU_JAR` (path to Protean's FVU jar), `SYNEXTAX_JAVA` (java executable), `SYNEXTAX_ALLOWED_ORIGINS` (extra web origins, comma separated, for example `https://synex-tax.vercel.app`). Origins are matched exactly.

Backups are written to `%USERPROFILE%\SynexTax Backups\<product>` and uploaded only when the computer is paired (see Backup uploads). Files held open by the accounting software are listed as skipped; close the company and run again for a complete copy.

## Backup uploads

A partner or manager adds the computer in SynexTax (Settings, Backups) and copies the device token shown once. On the computer run `synextax-agent pair https://app.synextax.com` and paste the token when asked (it is read from the keyboard, not the command line). It is saved in `%APPDATA%\SynexTax Agent\config.json`, readable by the signed-in user only; the server keeps only its SHA-256. `synextax-agent unpair` removes it. The same file can list non-default data folders under `folders`.

Once paired, the agent fetches its rules, uploads each rule's newest backup at start-up and then daily at the rule's time (India time): a fresh zip for Tally, Busy and Marg; the newest `.zip` Zoho Books export (drop folder `%USERPROFILE%\SynexTax Agent\Zoho Books`, or a file with "zoho" in its name in Downloads); the newest `.vyb` Vyapar backup (drop folder, Downloads, Documents, `%APPDATA%\vyaparApp`). Data unchanged since the last upload (same content hash) is not sent again. Files of up to 500 MB go straight to S3 through a presigned PUT when the server uses S3, otherwise to the API in resumable 4 MB chunks. Failures are retried with exponential backoff and reported to the server, which shows them on the rule.
