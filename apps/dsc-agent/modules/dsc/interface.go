package dsc

import (
	"time"
)

// PAdESOptions specifies visual signature parameters on the target PDF.
type PAdESOptions struct {
	Page     int     `json:"page"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Width    float64 `json:"width"`
	Height   float64 `json:"height"`
	Reason   string  `json:"reason"`
	Location string  `json:"location"`
}

// SignerProvider defines the abstract contract implemented by Windows CNG,
// macOS Keychain/PKCS#11, and the in-memory Dev Simulator.
type SignerProvider interface {
	EnumerateCertificates() ([]Certificate, error)
	SignPKCS7(certID string, payload []byte) ([]byte, Certificate, error)
	SignPAdES(certID string, pdfBytes []byte, opts PAdESOptions) ([]byte, Certificate, error)
}

// DetectFipsTier estimates FIPS 140-2 vs 140-3 from the token provider name and certificate issue date.
// Note: direct PKCS#11 C_GetTokenInfo hardware attestation is not queried here, so treat this as
// an issue-date estimate per CCA cutover guidance (September 21, 2026).
func DetectFipsTier(provider string, validFrom time.Time) (string, bool) {
	ccaCutoff := time.Date(2026, time.September, 21, 23, 59, 59, 0, time.UTC)
	providerLower := ""
	if provider != "" {
		providerLower = provider
	}

	// Modern tokens known to support FIPS 140-3
	if providerLower == "FIPS_140_3" || providerLower == "mtoken_crypto_140_3" {
		return "FIPS_140_3", false
	}

	// Standard Indian tokens (ePass2003, ProxKey, SafeNet) historically FIPS 140-2
	if isTokenProvider(provider) || provider == "DevSimulator" {
		if validFrom.Before(ccaCutoff) {
			// Grandfathered FIPS 140-2
			return "FIPS_140_2", true
		}
		return "FIPS_140_3", false
	}

	return "UNKNOWN", false
}
