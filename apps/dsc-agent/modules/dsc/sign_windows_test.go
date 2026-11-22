//go:build windows

package dsc

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/binary"
	"math/big"
	"syscall"
	"testing"
	"unsafe"
)

// These tests sign through the same Windows calls a USB token uses, with keys that exist only in
// memory: nothing is written to the certificate store or the key store.

var (
	procNCryptOpenStorageProvider = ncrypt.NewProc("NCryptOpenStorageProvider")
	procNCryptCreatePersistedKey  = ncrypt.NewProc("NCryptCreatePersistedKey")
	procNCryptSetProperty         = ncrypt.NewProc("NCryptSetProperty")
	procNCryptFinalizeKey         = ncrypt.NewProc("NCryptFinalizeKey")
	procNCryptExportKey           = ncrypt.NewProc("NCryptExportKey")
	procCertSetProperty           = crypt32.NewProc("CertSetCertificateContextProperty")
	procCryptAcquireContextW      = advapi32.NewProc("CryptAcquireContextW")
	procCryptGenKey               = advapi32.NewProc("CryptGenKey")
	procCryptExportKey            = advapi32.NewProc("CryptExportKey")
	procCryptDestroyKey           = advapi32.NewProc("CryptDestroyKey")
)

const certKeyContextPropID = 5

type certKeyContext struct {
	Size    uint32
	Key     uintptr
	KeySpec uint32
}

func u16(s string) uintptr { return uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr(s))) }

// ephemeralNCryptKey makes a key in Microsoft's software key storage provider without a name,
// so it is never persisted.
func ephemeralNCryptKey(t *testing.T, alg string) (uintptr, []byte) {
	t.Helper()
	var prov, key uintptr
	if s, _, _ := procNCryptOpenStorageProvider.Call(uintptr(unsafe.Pointer(&prov)), u16("Microsoft Software Key Storage Provider"), 0); s != 0 {
		t.Skipf("no software key storage provider: 0x%X", s)
	}
	defer procNCryptFreeObject.Call(prov)
	if s, _, _ := procNCryptCreatePersistedKey.Call(prov, uintptr(unsafe.Pointer(&key)), u16(alg), 0, 0, 0); s != 0 {
		t.Fatalf("create key: 0x%X", s)
	}
	if alg == "RSA" {
		bits := uint32(2048)
		if s, _, _ := procNCryptSetProperty.Call(key, u16("Length"), uintptr(unsafe.Pointer(&bits)), 4, 0); s != 0 {
			t.Fatalf("key length: 0x%X", s)
		}
	}
	if s, _, _ := procNCryptFinalizeKey.Call(key, 0); s != 0 {
		t.Fatalf("finalize: 0x%X", s)
	}
	blobType := "RSAPUBLICBLOB"
	if alg != "RSA" {
		blobType = "ECCPUBLICBLOB"
	}
	var n uint32
	procNCryptExportKey.Call(key, 0, u16(blobType), 0, 0, 0, uintptr(unsafe.Pointer(&n)), 0)
	blob := make([]byte, n)
	if s, _, _ := procNCryptExportKey.Call(key, 0, u16(blobType), 0, uintptr(unsafe.Pointer(&blob[0])), uintptr(n), uintptr(unsafe.Pointer(&n)), 0); s != 0 {
		t.Fatalf("export: 0x%X", s)
	}
	return key, blob[:n]
}

// contextWithKey creates an in-memory certificate context for pub and attaches the key handle.
// The context owns the handle afterwards and releases it when freed.
func contextWithKey(t *testing.T, pub any, key uintptr, keySpec uint32) (*syscall.CertContext, *x509.Certificate) {
	t.Helper()
	der := testCertificate(t, pub, pkix.Name{CommonName: "Signer"}, x509.KeyUsageDigitalSignature|x509.KeyUsageContentCommitment, nil)
	ctx, err := syscall.CertCreateCertificateContext(syscall.X509_ASN_ENCODING|syscall.PKCS_7_ASN_ENCODING, &der[0], uint32(len(der)))
	if err != nil {
		t.Fatal(err)
	}
	kc := certKeyContext{Size: uint32(unsafe.Sizeof(certKeyContext{})), Key: key, KeySpec: keySpec}
	if r, _, e := procCertSetProperty.Call(uintptr(unsafe.Pointer(ctx)), certKeyContextPropID, 0, uintptr(unsafe.Pointer(&kc))); r == 0 {
		t.Fatalf("attach key: %v", e)
	}
	x, _ := x509.ParseCertificate(der)
	return ctx, x
}

func TestNCryptRSASignatureVerifies(t *testing.T) {
	key, blob := ephemeralNCryptKey(t, "RSA")
	// BCRYPT_RSAKEY_BLOB: magic, bits, exponent length, modulus length, then both big-endian.
	expLen, modLen := binary.LittleEndian.Uint32(blob[8:]), binary.LittleEndian.Uint32(blob[12:])
	pub := &rsa.PublicKey{E: int(new(big.Int).SetBytes(blob[24 : 24+expLen]).Int64()), N: new(big.Int).SetBytes(blob[24+expLen : 24+expLen+modLen])}
	ctx, x := contextWithKey(t, pub, key, certNCryptKeySpec)
	defer syscall.CertFreeCertificateContext(ctx)

	digest := sha256.Sum256([]byte("GSTR-3B 102026"))
	sig, alg, err := signWithContext(ctx, x, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	if alg != "RSA_PKCS1_SHA256" || rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig) != nil {
		t.Fatal("NCrypt RSA signature does not verify")
	}
}

func TestNCryptECDSASignatureVerifies(t *testing.T) {
	key, blob := ephemeralNCryptKey(t, "ECDSA_P256")
	// BCRYPT_ECCKEY_BLOB: magic, key length, then X and Y big-endian.
	n := binary.LittleEndian.Uint32(blob[4:])
	pub := &ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(blob[8 : 8+n]), Y: new(big.Int).SetBytes(blob[8+n : 8+2*n])}
	ctx, x := contextWithKey(t, pub, key, certNCryptKeySpec)
	defer syscall.CertFreeCertificateContext(ctx)

	digest := sha256.Sum256([]byte("Form 140 Q2"))
	sig, alg, err := signWithContext(ctx, x, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	if alg != "ECDSA_SHA256" || !ecdsa.VerifyASN1(pub, digest[:], sig) {
		t.Fatal("NCrypt ECDSA signature does not verify")
	}
}

func TestCryptoAPISignatureVerifies(t *testing.T) {
	var prov, key uintptr
	const provRSAAES, verifyContext, atSignature, publicKeyBlob = 24, 0xF0000000, 2, 6
	if r, _, e := procCryptAcquireContextW.Call(uintptr(unsafe.Pointer(&prov)), 0, u16("Microsoft Enhanced RSA and AES Cryptographic Provider"), provRSAAES, verifyContext); r == 0 {
		t.Skipf("no CryptoAPI provider: %v", e)
	}
	if r, _, e := procCryptGenKey.Call(prov, atSignature, 2048<<16, uintptr(unsafe.Pointer(&key))); r == 0 {
		t.Fatalf("gen key: %v", e)
	}
	var n uint32
	procCryptExportKey.Call(key, 0, publicKeyBlob, 0, 0, uintptr(unsafe.Pointer(&n)))
	blob := make([]byte, n)
	if r, _, e := procCryptExportKey.Call(key, 0, publicKeyBlob, 0, uintptr(unsafe.Pointer(&blob[0])), uintptr(unsafe.Pointer(&n))); r == 0 {
		t.Fatalf("export: %v", e)
	}
	procCryptDestroyKey.Call(key)
	// BLOBHEADER (8) + RSAPUBKEY (magic, bit length, exponent) then the modulus little-endian.
	bits := binary.LittleEndian.Uint32(blob[12:])
	mod := append([]byte(nil), blob[20:20+bits/8]...)
	for i, j := 0, len(mod)-1; i < j; i, j = i+1, j-1 {
		mod[i], mod[j] = mod[j], mod[i]
	}
	pub := &rsa.PublicKey{E: int(binary.LittleEndian.Uint32(blob[16:])), N: new(big.Int).SetBytes(mod)}
	ctx, x := contextWithKey(t, pub, prov, atSignature)
	defer syscall.CertFreeCertificateContext(ctx)

	digest := sha256.Sum256([]byte("Form 138 Q3"))
	sig, alg, err := signWithContext(ctx, x, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	if alg != "RSA_PKCS1_SHA256" || rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig) != nil {
		t.Fatal("CryptoAPI signature does not verify")
	}
}

func TestListReadsTheStore(t *testing.T) {
	// Read-only: lists whatever signing certificates this computer has, possibly none.
	certs, err := List(testNow)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range certs {
		if len(c.ID) != 40 {
			t.Fatalf("bad id %q", c.ID)
		}
	}
	if _, err := Sign("0000000000000000000000000000000000000000", make([]byte, 32), testNow); err != ErrNoCertificate {
		t.Fatalf("unknown certificate: %v", err)
	}
}
