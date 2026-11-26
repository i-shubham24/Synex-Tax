# Protean FVU packages (item 4)

Downloaded 26 Nov 2026 from Protean's e-TDS download page:
https://tinpan.proteantech.in/downloads/e-tds/eTDS-download-regular.html

| Package | Applies to | Zip SHA-256 | Size |
|---------|-----------|-------------|------|
| [TDS_STANDALONE_FVU_1.2.zip](https://tinpan.proteantech.in/downloads/e-tds/download/TDS_STANDALONE_FVU_1.2.zip) | Statements for TY 2026-27 onward (Income-tax Act 2025: Forms 138, 140, 143, 144) | `21f7a5a45b42cdd2c952aa633a0049d6c81612e87d43d1d02720bd781943c06d` | 9,525,129 bytes |
| [TDS_STANDALONE_FVU_9.5.zip](https://tinpan.proteantech.in/downloads/e-tds/download/TDS_STANDALONE_FVU_9.5.zip) | Statements for FY 2010-11 to 2025-26 (24Q, 26Q, 27Q, 27EQ, and their corrections) | `7b549a29e9682d89acf88ecc0b53732c794a8700a474ee8e52d7c8bd2912ed0c` | 9,543,075 bytes |

Protean's TIN home page (tinpan.proteantech.in) confirms the split: FVU 1.2 for TY 2026-27 onward, FVU 9.5 for FY 2010-11 to 2025-26. RPU 1.2 and RPU 6.0 are the matching preparation utilities (not downloaded; SynTax writes the statement itself).

## Where the files are

- `workers/fvu-v1-2/protean/` and `workers/fvu-v9-5/protean/`: the unzipped packages (JARs and `e-mudhra.cer`; Protean's `.bat` and sample `fvu.log` removed). **Gitignored**: Protean's binaries are not ours to commit. Each worker's `protean.sha256` (committed) pins every file, and the Docker build runs `sha256sum -c`, so a different or tampered file fails the build.
- Main JAR checksums: FVU 1.2 `e337b5ce...faa60e3`, FVU 9.5 `bdd7b371...41930da` (full values in the `protean.sha256` files).
- The original zips are in this PC's scratch folder only; re-download from the links above on any other machine and compare the zip SHA-256.

## What the packages contain

- Main class `com.tin.FVU.FVU` (Swing desktop program, launched by Protean's `.bat` as `javaw -jar`).
- Libraries: BouncyCastle `bcprov-jdk15to18-1.80`, barbecue 1.5 (barcode), pd4ml (PDF), `ss_css2`, `VersionValidator.jar`, `sun.misc.base64decoder`.
- The 1.2 manifest also lists `pdfbox-app-1.8.8.jar`, which is not in the zip. Note it if FVU 1.2 fails to make the Form 27A PDF.
- `log4j-core-2.12.4.jar` ships but is not on the manifest class path. 2.12.4 is the patched Java 7 line (Log4Shell fixed); still, the worker runs it with no network.

## How SynTax uses them

1. **Desktop agent (works today).** On the CA's PC, set `SYNEXTAX_FVU_JAR` to the FVU JAR and start the agent. "Run FVU" in SynTax saves the statement and CSI into a fresh folder, opens Protean's FVU window there, and reads back the `.fvu` or the error file (`apps/dsc-agent/modules/fvu`). The agent takes one JAR today: point it at **1.2** for TY 2026-27 statements; for an FY 2025-26 or older correction, point it at **9.5**. Supporting both at once is a small agent change (two paths, picked by the statement's regime) that needs a Go build to verify.
2. **Server workers (not live yet).** `workers/fvu-v1-2` and `workers/fvu-v9-5` build containers with the JARs, checked by checksum. The runner deliberately exits with code 69 ("not verified") until the command-line contract below is confirmed, and the API's `validate-fvu` route reports only a SynTax pre-check (`fvuExecuted: false`).

## Open

- **FVU command-line contract.** `com.tin.FVU.FVU` has a "wrong number of arguments" check, so it accepts arguments, but Protean does not document their order. To confirm it, run the JAR headless (`java -Djava.awt.headless=true -jar ...`) on a statement SynTax wrote plus a real CSI file, and compare the output with a run in the FVU window. Running the downloaded JAR on this PC needs your go-ahead (the permission check stopped it this time). Until then the desktop agent path is the one to demo.
- **Real CSI file.** Needed for any FVU run (golden dataset 15e).
- **Update watch.** Protean ships new FVU versions without notice (1.2 was released 19 Aug 2026). The statutory change owner (item 18) checks the download page weekly; a new version means: download, update `protean.sha256`, rebuild the workers.
