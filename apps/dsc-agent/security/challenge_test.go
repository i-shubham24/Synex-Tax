package security

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func makeToken(t *testing.T, key ed25519.PrivateKey, p challengePayload) string {
	t.Helper()
	body, _ := json.Marshal(p)
	head := "v1." + base64.RawURLEncoding.EncodeToString(body)
	return head + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(key, []byte(head)))
}

func TestChallengeTokens(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	_, other, _ := ed25519.GenerateKey(rand.Reader)
	keys := []ed25519.PublicKey{pub}
	now := time.Unix(1_800_000_000, 0)
	ok := challengePayload{Nonce: "0123456789abcdef0123456789abcdef", Action: "fvu.prepare", Iat: now.Unix(), Exp: now.Unix() + 120}
	v := &NonceVerifier{usedNonces: map[string]time.Time{}}

	if err := v.VerifyChallenge(makeToken(t, priv, ok), "fvu.prepare", keys, now); err != nil {
		t.Fatalf("valid token refused: %v", err)
	}
	if err := v.VerifyChallenge(makeToken(t, priv, ok), "fvu.prepare", keys, now); err != ErrReplayDetected {
		t.Fatalf("reused token: want replay, got %v", err)
	}
	fresh := func(n string) challengePayload { p := ok; p.Nonce = n + "0123456789abcdef0123456789abcdef"; return p }
	if err := v.VerifyChallenge(makeToken(t, other, fresh("a")), "fvu.prepare", keys, now); err != ErrBadChallenge {
		t.Fatalf("token from another key: want bad, got %v", err)
	}
	if err := v.VerifyChallenge(makeToken(t, priv, fresh("b")), "backup.run", keys, now); err != ErrChallengeAction {
		t.Fatalf("other action: want action error, got %v", err)
	}
	if err := v.VerifyChallenge(makeToken(t, priv, fresh("c")), "fvu.prepare", keys, now.Add(3*time.Minute)); err != ErrChallengeExpiry {
		t.Fatalf("expired: want expiry, got %v", err)
	}
	long := fresh("d")
	long.Exp = long.Iat + 3600
	if err := v.VerifyChallenge(makeToken(t, priv, long), "fvu.prepare", keys, now); err != ErrChallengeExpiry {
		t.Fatalf("hour-long token: want expiry, got %v", err)
	}
	tampered := makeToken(t, priv, fresh("e"))
	body, _ := json.Marshal(challengePayload{Nonce: "e0123456789abcdef0123456789abcdef", Action: "dsc.sign", Iat: now.Unix(), Exp: now.Unix() + 60})
	tampered = "v1." + base64.RawURLEncoding.EncodeToString(body) + tampered[len(tampered)-87:]
	if err := v.VerifyChallenge(tampered, "dsc.sign", keys, now); err != ErrBadChallenge {
		t.Fatalf("tampered payload: want bad, got %v", err)
	}
	if err := v.VerifyChallenge("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", "fvu.prepare", keys, now); err != ErrBadChallenge {
		t.Fatalf("old-style random nonce: want bad, got %v", err)
	}
	if err := v.VerifyChallenge(makeToken(t, priv, fresh("f")), "fvu.prepare", nil, now); err != ErrNoServerKey {
		t.Fatalf("no keys: want no-key error, got %v", err)
	}
}

func TestServerKeysFromEnvironment(t *testing.T) {
	t.Setenv("SYNEXTAX_AGENT_PUBLIC_KEY", "")
	t.Setenv("SYNEXTAX_AGENT_DEV", "")
	if len(ServerKeys()) != 0 {
		t.Fatal("no key should be trusted by default")
	}
	t.Setenv("SYNEXTAX_AGENT_DEV", "1")
	if k := ServerKeys(); len(k) != 1 || !k[0].Equal(DevPublicKey()) {
		t.Fatal("development key should be trusted only with SYNEXTAX_AGENT_DEV=1")
	}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	t.Setenv("SYNEXTAX_AGENT_DEV", "")
	t.Setenv("SYNEXTAX_AGENT_PUBLIC_KEY", base64.StdEncoding.EncodeToString(pub))
	if k := ServerKeys(); len(k) != 1 || !k[0].Equal(pub) {
		t.Fatal("configured key should be trusted")
	}
}

// A token from the API's development key (apps/api/src/security/agentChallenge.ts), so the two
// sides stay in step.
func TestTokenFromTheServer(t *testing.T) {
	const token = "v1.eyJuIjoiZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZiIsImFjdCI6ImZ2dS5wcmVwYXJlIiwiaWF0IjoxODAwMDAwMDAwLCJleHAiOjE4MDAwMDAxMjB9.Y3-k7eout28G9OMaTpr2GG99sDWpWdT135OEc5Xfq326A0_q7a7aWYN78FjW-0qwVv05g8peC0Boy1i-7NjfBw"
	if got := base64.StdEncoding.EncodeToString(DevPublicKey()); got != "zPXdy+JOBAyToL4zm84zojoeyCCnmwRTEjlZaXJJvBM=" {
		t.Fatalf("development public key differs from the API's: %s", got)
	}
	v := &NonceVerifier{usedNonces: map[string]time.Time{}}
	if err := v.VerifyChallenge(token, "fvu.prepare", []ed25519.PublicKey{DevPublicKey()}, time.Unix(1_800_000_060, 0)); err != nil {
		t.Fatalf("server token refused: %v", err)
	}
}
