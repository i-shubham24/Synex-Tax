# First real USB DSC token test (item 12)

Goal: prove the real agent signs with a physical Class 3 token on Windows before any CA demo. Run it on a Windows 10/11 PC with the token's own driver installed (ePass2003: "ePass2003 Auto" setup; ProxKey: Watchdata driver). Use a token issued to a team member, never a client's.

## Build and start
1. Build the real agent (root package, not `cmd/agent`): `go build -o syntax-sign.exe .` in `apps/dsc-agent`.
2. Start it. It listens on `127.0.0.1:15850`.
3. Open the workspace in the browser, then the Sign hub (`/dsc`). The pill should show the agent online.

## Checks (write the result next to each)
| # | Step | Expected |
|---|------|----------|
| 1 | Plug in the token, open `/dsc` | Certificate listed with name, issuer (a CCA-licensed CA), validity, PAN if present in the subject |
| 2 | Unplug the token, refresh | Certificate disappears; nothing cached |
| 3 | Sign a test digest from Audit, DSC panel | Token driver's own PIN window opens; SynTax never shows a PIN box |
| 4 | Enter the PIN | Server accepts the signature and the chain ends at a CCA India root |
| 5 | Repeat step 3 and press Cancel | "Signing was cancelled on this computer", no audit row marked signed |
| 6 | Enter a wrong PIN once | "The token did not accept the PIN"; check the driver's retry counter, stop before it blocks |
| 7 | Replay the same challenge (resend the request) | Refused as already used |
| 8 | Call the agent from another site's page (any origin not in the allow list) | Refused (origin) |
| 9 | Check the audit log for steps 4 and 5 | One signed entry, one cancelled entry, hash chain verifies |
| 10 | Note the token model, driver version, key type (RSA 2048) and what the FIPS label says | Compare with the box: if the label is a guess, record it |

## Pass rule
All 10 rows as expected, on two token makes if possible (ePass2003 and ProxKey). Record driver versions in `apps/dsc-agent/README.md` under "Tested tokens".
