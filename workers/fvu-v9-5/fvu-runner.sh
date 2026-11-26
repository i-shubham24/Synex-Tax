#!/bin/sh
# SynTax runner for Protean FVU 9.5. Usage: fvu-runner.sh <statement.txt> <file.csi> <output_dir>
set -eu

INPUT_FILE="${1:-}"
CSI_FILE="${2:-}"
OUTPUT_DIR="${3:-}"
JAR=/opt/fvu/TDS_STANDALONE_FVU_9.5.jar

if [ -z "$INPUT_FILE" ] || [ -z "$CSI_FILE" ] || [ -z "$OUTPUT_DIR" ]; then
  echo "Usage: fvu-runner.sh <statement.txt> <file.csi> <output_dir>" >&2
  exit 64
fi
[ -f "$JAR" ] || { echo "FVU jar missing: $JAR" >&2; exit 66; }
[ -f "$INPUT_FILE" ] || { echo "Statement not found: $INPUT_FILE" >&2; exit 66; }
[ -f "$CSI_FILE" ] || { echo "CSI file not found: $CSI_FILE" >&2; exit 66; }

# Protean ships FVU as a desktop program. Its main class also accepts arguments, but the order
# and count are not documented by Protean and have not been checked against a real statement
# yet. Until that check is done (docs/procurement/protean-fvu.md, "Open"), this runner refuses
# rather than guess, and the API never reports SUCCESS for a run that did not happen.
echo "FVU 9.5 command-line run is not verified yet; validate on the desktop agent." >&2
exit 69
