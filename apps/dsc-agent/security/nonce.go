package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrInvalidOrigin   = errors.New("security: unauthorized origin header")
	ErrReplayDetected  = errors.New("security: replay detected, nonce already consumed")
	ErrExpiredNonce    = errors.New("security: nonce expired (>120s)")
	ErrBadNonceFormat  = errors.New("security: malformed nonce token")
	ErrInvalidPayload  = errors.New("security: payload sha256 mismatch")
	ErrBadSignature    = errors.New("security: nonce signature invalid")
)

var defaultAllowedOrigins = map[string]bool{
	"https://app.synextax.in":    true,
	"https://app.synextax.com":   true,
	"https://portal.synextax.in": true,
}

var devAllowedOrigins = map[string]bool{
	"http://localhost:3000": true,
	"http://127.0.0.1:3000": true,
}

type NonceVerifier struct {
	mu         sync.Mutex
	usedNonces map[string]time.Time
	devMode    bool
	hmacSecret []byte
}

func NewNonceVerifier(devMode bool, hmacSecret []byte) *NonceVerifier {
	v := &NonceVerifier{
		usedNonces: make(map[string]time.Time),
		devMode:    devMode,
		hmacSecret: hmacSecret,
	}
	go v.cleanupLoop()
	return v
}

// ValidateOrigin accepts a request only from an explicitly allowed origin.
func (v *NonceVerifier) ValidateOrigin(r *http.Request) error {
	raw := r.Header.Get("Origin")
	if raw == "" {
		raw = r.Header.Get("Referer")
	}
	origin, ok := normalizeOrigin(raw)
	if !ok {
		return ErrInvalidOrigin
	}

	if defaultAllowedOrigins[origin] {
		return nil
	}

	if v.devMode && devAllowedOrigins[origin] {
		return nil
	}

	for _, extra := range strings.Split(os.Getenv("SYNEXTAX_ALLOWED_ORIGINS"), ",") {
		trimmed := strings.TrimSpace(extra)
		if trimmed != "" {
			if o, valid := normalizeOrigin(trimmed); valid && o == origin {
				return nil
			}
		}
	}

	return ErrInvalidOrigin
}

// VerifyAndConsumeNonce checks nonce validity, TTL <= 120s, payload hash, and prevents replay.
func (v *NonceVerifier) VerifyAndConsumeNonce(nonce, payloadSha256, signature string) error {
	if nonce == "" {
		return errors.New("security: missing signing nonce")
	}

	v.mu.Lock()
	defer v.mu.Unlock()

	// 1. Replay check
	if _, exists := v.usedNonces[nonce]; exists {
		return ErrReplayDetected
	}

	// 2. Format and timestamp parsing: format is <uuid>.<unix_epoch_sec> or standalone token
	parts := strings.Split(nonce, ".")
	if len(parts) >= 2 {
		tsSec, err := strconv.ParseInt(parts[len(parts)-1], 10, 64)
		if err == nil {
			nonceTime := time.Unix(tsSec, 0)
			age := time.Since(nonceTime)
			if age > 120*time.Second || age < -30*time.Second {
				return ErrExpiredNonce
			}
		}
	}

	// 3. Optional HMAC signature validation if secret is provided
	if len(v.hmacSecret) > 0 && signature != "" {
		expectedMac := hmac.New(sha256.New, v.hmacSecret)
		expectedMac.Write([]byte(fmt.Sprintf("%s:%s", nonce, payloadSha256)))
		expectedHex := hex.EncodeToString(expectedMac.Sum(nil))
		if !hmac.Equal([]byte(expectedHex), []byte(signature)) {
			return ErrBadSignature
		}
	}

	// 4. Record as consumed
	v.usedNonces[nonce] = time.Now()
	return nil
}

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
	ticker := time.NewTicker(2 * time.Minute)
	for range ticker.C {
		v.mu.Lock()
		cutoff := time.Now().Add(-5 * time.Minute)
		for nonce, ts := range v.usedNonces {
			if ts.Before(cutoff) {
				delete(v.usedNonces, nonce)
			}
		}
		v.mu.Unlock()
	}
}
