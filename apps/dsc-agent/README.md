# SynexTax Local Desktop DSC & Tally Agent (`apps/dsc-agent`)

The SynexTax Local Desktop Agent is a lightweight native daemon designed for CA workstations running Windows 10/11. It provides a secure loopback bridge enabling browser-based cloud tax compliance workflows to interface with physical hardware:

1. **FIPS 140-2 / FIPS 140-3 USB DSC Hardware Tokens:**
   - Feitian ePass2003 (`eps2003csp11.dll`)
   - Watchdata ProxKey (`wdpkcs.dll`)
   - Aladdin / mToken CryptoToken (`akisp11.dll`)
   - Safenet eToken Pro (`etpkcs11.dll`)
2. **Local TallyPrime & Tally.ERP 9 XML Poller:**
   - Listens on `http://127.0.0.1:9000`
   - Enforces single-threaded concurrency locks to prevent Tally XML server crashes
   - Facilitates real-time incremental voucher syncing

---

## Security Architecture

- **Loopback Pinning:** Binds strictly to `127.0.0.1:18531`. Never exposes ports on external network interfaces (`0.0.0.0`).
- **Origin Header Verification:** Requests are strictly restricted to authorized domains:
  - `http://localhost:3000` (Local Development)
  - `http://127.0.0.1:3000` (Local Development)
  - `https://app.synextax.com` (Cloud Production)
- **Anti-Replay Nonce Guard:** Requires single-use 64-character SHA-256 challenge nonces issued by `apps/api` with 120-second TTL.
- **PIN Isolation:** Token PIN is passed directly to the local hardware driver; it is never transmitted over the internet to cloud servers.

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Daemon heartbeat, connected token count, Tally port status |
| `GET` | `/api/v1/tokens` | Enumerates connected Class 3 certificates and signatory PANs |
| `POST` | `/api/v1/sign` | Executes hardware PKCS#11 RSA-SHA256 digest signing |
| `POST` | `/api/v1/tally/query` | Proxies TDL XML payload to Tally with concurrency lock |
