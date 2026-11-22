// Package dsc signs with a Class 3 DSC through the certificate store of the computer the agent
// runs on. USB token drivers (ePass2003, ProxKey, mToken, eToken) register the token's
// certificates there; the private key never leaves the token, and the token's own driver asks for
// the PIN. The agent never receives, stores or forwards a PIN.
//
// The agent signs only a SHA-256 digest the SynexTax server computed and named in a server-signed
// challenge; the server then checks the signature against the certificate the agent returns.
package dsc

import (
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/x509"
	"encoding/asn1"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"
)

var (
	ErrNoCertificate = errors.New("dsc: that signing certificate is not on this computer")
	ErrUnsupported   = errors.New("dsc: signing with a DSC needs the agent on Windows")
	ErrBadDigest     = errors.New("dsc: digest must be 64 hex characters (SHA-256)")
	ErrCancelled     = errors.New("dsc: signing was cancelled on this computer")
	ErrWrongPin      = errors.New("dsc: the token did not accept the PIN")
	ErrPinBlocked    = errors.New("dsc: the token's PIN is blocked")
	ErrKeyType       = errors.New("dsc: only RSA and ECDSA keys can sign")
)

// Certificate describes a signing certificate whose private key this computer can use.
type Certificate struct {
	// ID is the SHA-1 thumbprint, as Windows shows it. It only identifies the certificate.
	ID           string    `json:"id"`
	Subject      string    `json:"subject"`
	CommonName   string    `json:"commonName"`
	Issuer       string    `json:"issuer"`
	SerialNumber string    `json:"serialNumber"`
	Pan          string    `json:"pan,omitempty"`
	ValidFrom    time.Time `json:"validFrom"`
	ValidTo      time.Time `json:"validTo"`
	KeyAlgorithm string    `json:"keyAlgorithm"`
	Provider     string    `json:"provider"`
	// Token is true when the key is held by a smart card or USB token driver rather than a
	// Microsoft software provider.
	Token bool `json:"token"`
}

// SignRequest asks the agent to sign one digest with one certificate.
type SignRequest struct {
	// ChallengeToken is the server-signed token for action "dsc.sign".
	ChallengeToken string `json:"challengeToken"`
	CertificateID  string `json:"certificateId"`
	DigestSha256   string `json:"digestSha256"`
}

// SignResponse carries what the server needs to check the signature.
type SignResponse struct {
	Signature        string      `json:"signature"`   // base64
	Algorithm        string      `json:"algorithm"`   // RSA_PKCS1_SHA256 or ECDSA_SHA256 (DER)
	Certificate      string      `json:"certificate"` // base64 DER
	Chain            []string    `json:"chain"`       // base64 DER issuers, as Windows built the chain
	CertificateInfo  Certificate `json:"certificateInfo"`
	SigningTimestamp time.Time   `json:"signingTimestamp"`
}

var panRE = regexp.MustCompile(`^[A-Z]{5}[0-9]{4}[A-Z]$`)

// Describe reads a DER certificate.
func Describe(der []byte, provider string) (Certificate, *x509.Certificate, error) {
	x, err := x509.ParseCertificate(der)
	if err != nil {
		return Certificate{}, nil, err
	}
	sum := sha1.Sum(der)
	c := Certificate{
		ID:           strings.ToUpper(hex.EncodeToString(sum[:])),
		Subject:      x.Subject.String(),
		CommonName:   x.Subject.CommonName,
		Issuer:       x.Issuer.String(),
		SerialNumber: strings.ToUpper(x.SerialNumber.Text(16)),
		ValidFrom:    x.NotBefore.UTC(),
		ValidTo:      x.NotAfter.UTC(),
		KeyAlgorithm: keyAlgorithm(x),
		Provider:     provider,
		Token:        isTokenProvider(provider),
	}
	for _, n := range x.Subject.Names {
		if s, ok := n.Value.(string); ok && panRE.MatchString(strings.ToUpper(strings.TrimSpace(s))) {
			c.Pan = strings.ToUpper(strings.TrimSpace(s))
			break
		}
	}
	return c, x, nil
}

func keyAlgorithm(x *x509.Certificate) string {
	switch k := x.PublicKey.(type) {
	case *rsa.PublicKey:
		return fmt.Sprintf("RSA %d", k.N.BitLen())
	case *ecdsa.PublicKey:
		return "ECDSA " + k.Curve.Params().Name
	}
	return x.PublicKeyAlgorithm.String()
}

// isTokenProvider tells a token or smart card driver from Microsoft's software and TPM providers.
func isTokenProvider(provider string) bool {
	if strings.Contains(provider, "Smart Card") {
		return true
	}
	return provider != "" && !strings.HasPrefix(provider, "Microsoft")
}

// Usages that mark a certificate as not for signing documents: Windows file encryption (EFS)
// and EFS recovery.
var notForSigning = map[string]bool{"1.3.6.1.4.1.311.10.3.4": true, "1.3.6.1.4.1.311.10.3.4.1": true}

// UsableForSigning keeps certificates that are in date and allowed to sign documents. TLS-only
// certificates (developer HTTPS certificates and the like) are left out.
func UsableForSigning(x *x509.Certificate, now time.Time) bool {
	if now.Before(x.NotBefore) || now.After(x.NotAfter) {
		return false
	}
	if x.KeyUsage != 0 && x.KeyUsage&(x509.KeyUsageDigitalSignature|x509.KeyUsageContentCommitment) == 0 {
		return false
	}
	if len(x.ExtKeyUsage) > 0 || len(x.UnknownExtKeyUsage) > 0 {
		for _, u := range x.UnknownExtKeyUsage {
			if !notForSigning[u.String()] {
				return true
			}
		}
		for _, u := range x.ExtKeyUsage {
			switch u {
			case x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageCodeSigning, x509.ExtKeyUsageTimeStamping, x509.ExtKeyUsageOCSPSigning:
			default:
				return true
			}
		}
		return false
	}
	switch x.PublicKey.(type) {
	case *rsa.PublicKey, *ecdsa.PublicKey:
		return true
	}
	return false
}

// ParseDigest decodes a SHA-256 digest in hex.
func ParseDigest(s string) ([]byte, error) {
	if len(s) != 64 {
		return nil, ErrBadDigest
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return nil, ErrBadDigest
	}
	return b, nil
}

// signatureSize is the length of the raw signature the key produces.
func signatureSize(x *x509.Certificate) (int, bool, error) {
	switch k := x.PublicKey.(type) {
	case *rsa.PublicKey:
		return (k.N.BitLen() + 7) / 8, true, nil
	case *ecdsa.PublicKey:
		return 2 * ((k.Curve.Params().BitSize + 7) / 8), false, nil
	}
	return 0, false, ErrKeyType
}

// p1363ToDER turns the r||s form Windows returns for ECDSA into the DER form verifiers expect.
func p1363ToDER(sig []byte) ([]byte, error) {
	if len(sig) == 0 || len(sig)%2 != 0 {
		return nil, errors.New("dsc: malformed ECDSA signature")
	}
	half := len(sig) / 2
	return asn1.Marshal(struct{ R, S *big.Int }{new(big.Int).SetBytes(sig[:half]), new(big.Int).SetBytes(sig[half:])})
}
