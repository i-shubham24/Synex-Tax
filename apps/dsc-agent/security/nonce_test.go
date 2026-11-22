package security

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestOriginIsMatchedExactly(t *testing.T) {
	v := &NonceVerifier{usedNonces: map[string]time.Time{}}
	cases := map[string]bool{
		"https://app.synextax.com":                   true,
		"http://localhost:3000":                      true,
		"https://app.synextax.com.attacker.net":      false,
		"http://localhost:3000.evil.com":             false,
		"https://app.synextax.com@evil.com":          false,
		"https://evil.com/?https://app.synextax.com": false,
		"": false,
	}
	for origin, want := range cases {
		r := httptest.NewRequest("GET", "/health", nil)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		if got := v.ValidateOrigin(r) == nil; got != want {
			t.Errorf("origin %q: allowed=%v, want %v", origin, got, want)
		}
	}
	// A Referer is reduced to its origin before comparing.
	r := httptest.NewRequest("GET", "/health", nil)
	r.Header.Set("Referer", "https://app.synextax.com/tds/health")
	if v.ValidateOrigin(r) != nil {
		t.Error("referer from the app should be allowed")
	}
	t.Setenv("SYNEXTAX_ALLOWED_ORIGINS", "https://synex-tax.vercel.app")
	r = httptest.NewRequest("GET", "/health", nil)
	r.Header.Set("Origin", "https://synex-tax.vercel.app")
	if v.ValidateOrigin(r) != nil {
		t.Error("configured origin should be allowed")
	}
}
