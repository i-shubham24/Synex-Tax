# Windows EV/OV Code Signing Template for SynTax Sign Desktop Bridge
# Requires Windows SDK signtool.exe and an HSM / Azure Key Vault or hardware token.
# Zero private keys in repository: certificate credentials are read from secure environment variables.

param(
    [string]$BinaryPath = "build\syntax-sign-windows-amd64.exe",
    [string]$CertThumbprint = $env:WINDOWS_SIGN_THUMBPRINT,
    [string]$TimestampUrl = "http://timestamp.digicert.com"
)

if (-not (Test-Path $BinaryPath)) {
    Write-Error "Binary not found at $BinaryPath"
    exit 1
}

if (-not $CertThumbprint) {
    Write-Warning "WINDOWS_SIGN_THUMBPRINT not set. Running in test verification mode."
    Get-AuthenticodeSignature -FilePath $BinaryPath
    exit 0
}

Write-Host "Signing $BinaryPath with certificate thumbprint $CertThumbprint..."
& signtool.exe sign /sha1 $CertThumbprint /tr $TimestampUrl /td sha256 /fd sha256 /v $BinaryPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully signed $BinaryPath"
    & signtool.exe verify /pa /v $BinaryPath
} else {
    Write-Error "Signing failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
