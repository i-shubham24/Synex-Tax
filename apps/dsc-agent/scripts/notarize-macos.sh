#!/usr/bin/env bash
# macOS Code Signing and Notarization Template for SynTax Sign Desktop Bridge
# Zero credentials in repository: credentials read from Apple Developer keychain / environment variables.

set -euo pipefail

BINARY_PATH="${1:-build/syntax-sign-darwin-arm64}"
SIGNING_IDENTITY="${APPLE_DEVELOPER_IDENTITY:-}"
APPLE_ID="${APPLE_ID:-}"
TEAM_ID="${APPLE_TEAM_ID:-}"
APP_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:-}"

if [[ ! -f "$BINARY_PATH" ]]; then
    echo "Binary not found at $BINARY_PATH" >&2
    exit 1
fi

if [[ -z "$SIGNING_IDENTITY" ]]; then
    echo "APPLE_DEVELOPER_IDENTITY not set. Skipping live code signing."
    codesign -dv --verbose=4 "$BINARY_PATH" || true
    exit 0
fi

echo "Signing $BINARY_PATH with hardened runtime..."
codesign --force --options runtime --timestamp --sign "$SIGNING_IDENTITY" "$BINARY_PATH"

echo "Creating submission zip for notarization..."
ZIP_PATH="${BINARY_PATH}.zip"
ditto -c -k --keepParent "$BINARY_PATH" "$ZIP_PATH"

echo "Submitting to Apple notary service..."
xcrun notarytool submit "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$TEAM_ID" \
    --password "$APP_PASSWORD" \
    --wait

echo "Stapling notarization ticket..."
xcrun stapler staple "$BINARY_PATH"
echo "macOS notarization complete."
