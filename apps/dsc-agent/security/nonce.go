package security

import (
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"
)

var (
	ErrInvalidOrigin   = errors.New("security: unauthorized origin header")
	ErrInvalidNonce    = errors.New("security: invalid or expired challenge nonce")
	ErrReplayDetected = errors.New("security: replay detected, nonce already consumed")
)

var allowedOrigins = map[string]bool{
	"http://localhost:3000":     true,
	"http://127.0.0.1:3000":     true,
	"https://app.synextax.com":  true,
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

func (v *NonceVerifier) ValidateOrigin(r *http.Request) error {
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = r.Header.Get("Referer")
	}
	if origin == "" {
		return ErrInvalidOrigin
	}

	for allowed := range allowedOrigins {
		if strings.HasPrefix(origin, allowed) {
			return nil
		}
	}

	return ErrInvalidOrigin
}

func (v *NonceVerifier) ConsumeNonce(nonce string) error {
	if len(nonce) != 64 {
		return ErrInvalidNonce
	}

	v.mu.Lock()
	defer v.mu.Unlock()

	if _, exists := v.usedNonces[nonce]; exists {
		return ErrReplayDetected
	}

	v.usedNonces[nonce] = time.Now()
	return nil
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
