package security

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"time"
)

// Challenge tokens are issued by the SynexTax server and signed with its Ed25519 key, so a web page
// cannot make up its own. Format: "v1.<base64url payload>.<base64url signature>", where the
// signature covers "v1.<base64url payload>". The payload names one action and expires within
// minutes; each nonce is accepted once.

var (
	ErrNoServerKey     = errors.New("security: this agent has no SynexTax server key; set SYNEXTAX_AGENT_PUBLIC_KEY")
	ErrBadChallenge    = errors.New("security: challenge token is not signed by the SynexTax server")
	ErrChallengeAction = errors.New("security: challenge token was issued for a different action")
	ErrChallengeExpiry = errors.New("security: challenge token has expired or is not yet valid")
)

// EmbeddedPublicKey can be set at build time:
// go build -ldflags "-X github.com/.../security.EmbeddedPublicKey=<base64 key>"
var EmbeddedPublicKey = ""

// devSeed matches the API's development key (apps/api/src/security/agentChallenge.ts). It is only
// trusted when SYNEXTAX_AGENT_DEV=1, for local development.
const devSeed = "synextax-dev-agent-challenge-key"

type challengePayload struct {
	Nonce  string `json:"n"`
	Action string `json:"act"`
	Exp    int64  `json:"exp"`
	Iat    int64  `json:"iat"`
}

// DevPublicKey is the public half of the development key.
func DevPublicKey() ed25519.PublicKey {
	seed := sha256.Sum256([]byte(devSeed))
	return ed25519.NewKeyFromSeed(seed[:]).Public().(ed25519.PublicKey)
}

// ServerKeys returns the keys this agent trusts: SYNEXTAX_AGENT_PUBLIC_KEY, the build-time key and,
// only with SYNEXTAX_AGENT_DEV=1, the development key.
func ServerKeys() []ed25519.PublicKey {
	var keys []ed25519.PublicKey
	for _, raw := range []string{os.Getenv("SYNEXTAX_AGENT_PUBLIC_KEY"), EmbeddedPublicKey} {
		if k := decodeKey(raw); k != nil {
			keys = append(keys, k)
		}
	}
	if os.Getenv("SYNEXTAX_AGENT_DEV") == "1" {
		keys = append(keys, DevPublicKey())
	}
	return keys
}

func decodeKey(raw string) ed25519.PublicKey {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		if b, err := enc.DecodeString(raw); err == nil && len(b) == ed25519.PublicKeySize {
			return ed25519.PublicKey(b)
		}
	}
	return nil
}

// VerifyChallenge checks a server-issued token for one action and consumes its nonce.
func (v *NonceVerifier) VerifyChallenge(token, action string, keys []ed25519.PublicKey, now time.Time) error {
	if len(keys) == 0 {
		return ErrNoServerKey
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] != "v1" {
		return ErrBadChallenge
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || len(sig) != ed25519.SignatureSize {
		return ErrBadChallenge
	}
	signed := []byte(parts[0] + "." + parts[1])
	ok := false
	for _, k := range keys {
		if ed25519.Verify(k, signed, sig) {
			ok = true
			break
		}
	}
	if !ok {
		return ErrBadChallenge
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ErrBadChallenge
	}
	var p challengePayload
	if err := json.Unmarshal(body, &p); err != nil || len(p.Nonce) < 32 {
		return ErrBadChallenge
	}
	if p.Action != action {
		return ErrChallengeAction
	}
	t := now.Unix()
	// Valid for at most five minutes, with a minute's allowance for clock differences.
	if p.Exp < t || p.Iat > t+60 || p.Exp-p.Iat > 300 {
		return ErrChallengeExpiry
	}
	return v.consume(p.Nonce, now)
}

func (v *NonceVerifier) consume(nonce string, now time.Time) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if _, used := v.usedNonces[nonce]; used {
		return ErrReplayDetected
	}
	v.usedNonces[nonce] = now
	return nil
}
