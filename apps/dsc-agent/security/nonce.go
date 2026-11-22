package security

import (
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

var (
	ErrInvalidOrigin  = errors.New("security: unauthorized origin header")
	ErrReplayDetected = errors.New("security: replay detected, nonce already consumed")
)

var allowedOrigins = map[string]bool{
	"http://localhost:3000":      true,
	"http://127.0.0.1:3000":      true,
	"https://app.synextax.com":   true,
	"https://portal.synextax.in": true,
}

type NonceVerifier struct {
	mu         sync.Mutex
	usedNonces map[string]time.Time
}

func NewNonceVerifier() *NonceVerifier {
	v := &NonceVerifier{
		usedNonces: make(map[string]time.Time),
	}
	go v.cleanupLoop()
	return v
}

// ValidateOrigin accepts a request only from an allowed origin, compared exactly (scheme, host and
// port). A prefix match would let "https://app.synextax.com.attacker.net" through.
// SYNEXTAX_ALLOWED_ORIGINS adds origins, comma separated (for example a staging site).
func (v *NonceVerifier) ValidateOrigin(r *http.Request) error {
	raw := r.Header.Get("Origin")
	if raw == "" {
		raw = r.Header.Get("Referer")
	}
	origin, ok := normalizeOrigin(raw)
	if !ok {
		return ErrInvalidOrigin
	}
	if allowedOrigins[origin] {
		return nil
	}
	for _, extra := range strings.Split(os.Getenv("SYNEXTAX_ALLOWED_ORIGINS"), ",") {
		if o, ok := normalizeOrigin(strings.TrimSpace(extra)); ok && o == origin {
			return nil
		}
	}
	return ErrInvalidOrigin
}

// normalizeOrigin reduces an Origin or Referer value to scheme://host[:port].
func normalizeOrigin(raw string) (string, bool) {
	if raw == "" {
		return "", false
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return "", false
	}
	return strings.ToLower(u.Scheme + "://" + u.Host), true
}

func (v *NonceVerifier) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		v.mu.Lock()
		cutoff := time.Now().Add(-10 * time.Minute)
		for nonce, ts := range v.usedNonces {
			if ts.Before(cutoff) {
				delete(v.usedNonces, nonce)
			}
		}
		v.mu.Unlock()
	}
}
