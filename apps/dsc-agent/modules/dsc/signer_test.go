package dsc

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"math/big"
	"testing"
	"time"
)

var testNow = time.Date(2026, 11, 21, 10, 0, 0, 0, time.UTC)

// testCertificate issues a certificate for pub, signed by a throwaway CA key.
func testCertificate(t *testing.T, pub any, subject pkix.Name, usage x509.KeyUsage, eku []x509.ExtKeyUsage) []byte {
	t.Helper()
	caKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	ca := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "Test CA"}, NotBefore: testNow.AddDate(-1, 0, 0), NotAfter: testNow.AddDate(2, 0, 0), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	leaf := &x509.Certificate{SerialNumber: big.NewInt(0x4B89F2), Subject: subject, NotBefore: testNow.AddDate(0, -1, 0), NotAfter: testNow.AddDate(1, 0, 0), KeyUsage: usage, ExtKeyUsage: eku}
	der, err := x509.CreateCertificate(rand.Reader, leaf, ca, pub, caKey)
	if err != nil {
		t.Fatal(err)
	}
	return der
}

func TestDescribeFindsThePan(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	subject := pkix.Name{CommonName: "Amrinder Verma", Country: []string{"IN"}, ExtraNames: []pkix.AttributeTypeAndValue{{Type: asn1.ObjectIdentifier{2, 5, 4, 5}, Value: "AAAPV8912K"}}}
	der := testCertificate(t, &key.PublicKey, subject, x509.KeyUsageDigitalSignature|x509.KeyUsageContentCommitment, nil)
	c, x, err := Describe(der, "Microsoft Smart Card Key Storage Provider")
	if err != nil {
		t.Fatal(err)
	}
	if c.Pan != "AAAPV8912K" || c.CommonName != "Amrinder Verma" || c.KeyAlgorithm != "RSA 2048" || !c.Token || len(c.ID) != 40 || c.SerialNumber != "4B89F2" {
		t.Fatalf("unexpected %+v", c)
	}
	if !UsableForSigning(x, testNow) || UsableForSigning(x, testNow.AddDate(2, 0, 0)) {
		t.Fatal("validity window not applied")
	}
}

func TestTlsOnlyCertificatesAreLeftOut(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	der := testCertificate(t, &key.PublicKey, pkix.Name{CommonName: "localhost"}, x509.KeyUsageDigitalSignature, []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth})
	_, x, _ := Describe(der, "Microsoft Software Key Storage Provider")
	if UsableForSigning(x, testNow) {
		t.Fatal("a TLS server certificate was offered for document signing")
	}
	der = testCertificate(t, &key.PublicKey, pkix.Name{CommonName: "Encrypt only"}, x509.KeyUsageKeyEncipherment, nil)
	_, x, _ = Describe(der, "")
	if UsableForSigning(x, testNow) {
		t.Fatal("an encryption-only certificate was offered for signing")
	}
	efs := &x509.Certificate{SerialNumber: big.NewInt(9), Subject: pkix.Name{CommonName: "Hp"}, NotBefore: testNow.AddDate(-1, 0, 0), NotAfter: testNow.AddDate(1, 0, 0), UnknownExtKeyUsage: []asn1.ObjectIdentifier{{1, 3, 6, 1, 4, 1, 311, 10, 3, 4}}}
	caKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	efsDer, _ := x509.CreateCertificate(rand.Reader, efs, efs, &key.PublicKey, caKey)
	if _, x, _ = Describe(efsDer, "Microsoft Enhanced Cryptographic Provider v1.0"); UsableForSigning(x, testNow) {
		t.Fatal("a Windows file encryption certificate was offered for signing")
	}
	if isTokenProvider("Microsoft Software Key Storage Provider") || !isTokenProvider("eToken Base Cryptographic Provider") {
		t.Fatal("provider kind")
	}
}

func TestP1363ToDER(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	digest := sha256.Sum256([]byte("return"))
	r, s, _ := ecdsa.Sign(rand.Reader, key, digest[:])
	raw := make([]byte, 64)
	r.FillBytes(raw[:32])
	s.FillBytes(raw[32:])
	der, err := p1363ToDER(raw)
	if err != nil || !ecdsa.VerifyASN1(&key.PublicKey, digest[:], der) {
		t.Fatal("converted signature does not verify")
	}
	if _, err := ParseDigest("abc"); err != ErrBadDigest {
		t.Fatal("short digest accepted")
	}
}
