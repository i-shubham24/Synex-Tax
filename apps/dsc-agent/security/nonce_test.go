package security

import (
	"fmt"
	"net/http/httptest"
	"testing"
	"time"
)

func TestOriginIsMatchedExactly(t *testing.T) {
	vProd := NewNonceVerifier(false, nil)
	casesProd := map[string]bool{
		"https://app.synextax.in":                    true,
		"https://synex-tax.vercel.app":               false, // Demo bypass origin excluded in prod
		"https://app.synextax.com":                   true,
		"http://localhost:3000":                      false, // Not allowed in prod mode
		"https://app.synextax.in.attacker.net":       false,
		"http://localhost:3000.evil.com":             false,
		"https://evil.com/?https://app.synextax.in":  false,
		"":                                           false,
	}
	for origin, want := range casesProd {
		r := httptest.NewRequest("GET", "/health", nil)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		if got := vProd.ValidateOrigin(r) == nil; got != want {
			t.Errorf("prod mode origin %q: allowed=%v, want %v", origin, got, want)
		}
	}

	// Dev Mode allows localhost
	vDev := NewNonceVerifier(true, nil)
	rDev := httptest.NewRequest("GET", "/health", nil)
	rDev.Header.Set("Origin", "http://localhost:3000")
	if err := vDev.ValidateOrigin(rDev); err != nil {
		t.Errorf("dev mode should allow http://localhost:3000, got: %v", err)
	}
}

func TestNonceConsumptionAndReplayRejection(t *testing.T) {
	v := NewNonceVerifier(true, nil)
	nowSec := time.Now().Unix()
	nonce := fmt.Sprintf("nonce-uuid-12345.%d", nowSec)
	payloadHash := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

	// First consumption must succeed
	if err := v.VerifyAndConsumeNonce(nonce, payloadHash, ""); err != nil {
		t.Fatalf("first nonce consumption failed: %v", err)
	}

	// Second consumption with identical nonce must fail with ErrReplayDetected
	err := v.VerifyAndConsumeNonce(nonce, payloadHash, "")
	if err != ErrReplayDetected {
		t.Fatalf("expected ErrReplayDetected, got: %v", err)
	}
}

func TestNonceExpirationRejection(t *testing.T) {
	v := NewNonceVerifier(true, nil)
	// Nonce issued 150 seconds ago (exceeds 120s TTL)
	oldSec := time.Now().Add(-150 * time.Second).Unix()
	expiredNonce := fmt.Sprintf("expired-uuid-67890.%d", oldSec)
	payloadHash := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

	err := v.VerifyAndConsumeNonce(expiredNonce, payloadHash, "")
	if err != ErrExpiredNonce {
		t.Fatalf("expected ErrExpiredNonce, got: %v", err)
	}
}
