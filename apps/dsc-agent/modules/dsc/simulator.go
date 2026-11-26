package dsc

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"time"
)

// DevSimulator provides an in-memory RSA-2048 Class 3 DSC signer for CI tests and hardware-free staging demos.
type DevSimulator struct {
	PrivateKey *rsa.PrivateKey
	Cert       *x509.Certificate
	CertInfo   Certificate
	RawCertDER []byte
}

func NewDevSimulator() (*DevSimulator, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}

	serialNumber := big.NewInt(18928374)
	validFrom := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	validTo := time.Date(2028, 3, 31, 23, 59, 59, 0, time.UTC)

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			CommonName:         "CA Amrinder Verma (Dev Simulator)",
			Organization:       []string{"Verma & Associates CA"},
			OrganizationalUnit: []string{"Statutory Tax Audit Desk"},
			Country:            []string{"IN"},
			Province:           []string{"Punjab"},
			Locality:           []string{"Amritsar"},
			ExtraNames: []pkix.AttributeTypeAndValue{
				{
					Type:  asn1.ObjectIdentifier{2, 5, 4, 3}, // Common Name
					Value: "CA Amrinder Verma (Dev Simulator)",
				},
				{
					Type:  asn1.ObjectIdentifier{2, 5, 4, 4}, // Surname / PAN hint
					Value: "AABCP1332L",
				},
			},
		},
		NotBefore:             validFrom,
		NotAfter:              validTo,
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageContentCommitment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageEmailProtection},
		BasicConstraintsValid: true,
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		return nil, err
	}

	parsedCert, err := x509.ParseCertificate(derBytes)
	if err != nil {
		return nil, err
	}

	certInfo, _, err := Describe(derBytes, "DevSimulator")
	if err != nil {
		return nil, err
	}
	certInfo.Pan = "AABCP1332L"
	certInfo.FipsProfile = "FIPS_140_3"
	certInfo.Token = true
	certInfo.TokenLabel = "SynTax Virtual Token v1.27"

	return &DevSimulator{
		PrivateKey: key,
		Cert:       parsedCert,
		CertInfo:   certInfo,
		RawCertDER: derBytes,
	}, nil
}

func (s *DevSimulator) EnumerateCertificates() ([]Certificate, error) {
	return []Certificate{s.CertInfo}, nil
}

func (s *DevSimulator) SignPKCS7(certID string, payload []byte) ([]byte, Certificate, error) {
	// Sign digest with RSA-PKCS1v15
	digest := sha256.Sum256(payload)
	rawSig, err := rsa.SignPKCS1v15(rand.Reader, s.PrivateKey, crypto.SHA256, digest[:])
	if err != nil {
		return nil, Certificate{}, fmt.Errorf("dev simulator sign failed: %w", err)
	}

	// Build detached PKCS#7 envelope
	pkcs7Bytes, err := BuildDetachedPKCS7(s.RawCertDER, digest[:], rawSig)
	if err != nil {
		return nil, Certificate{}, fmt.Errorf("dev simulator pkcs7 failed: %w", err)
	}

	return pkcs7Bytes, s.CertInfo, nil
}

func (s *DevSimulator) SignPAdES(certID string, pdfBytes []byte, opts PAdESOptions) ([]byte, Certificate, error) {
	if len(pdfBytes) < 10 {
		return nil, Certificate{}, errors.New("pades: invalid or empty PDF bytes")
	}

	// Compute payload digest
	digest := sha256.Sum256(pdfBytes)
	rawSig, err := rsa.SignPKCS1v15(rand.Reader, s.PrivateKey, crypto.SHA256, digest[:])
	if err != nil {
		return nil, Certificate{}, err
	}

	pkcs7Bytes, err := BuildDetachedPKCS7(s.RawCertDER, digest[:], rawSig)
	if err != nil {
		return nil, Certificate{}, err
	}

	// Embed signature into PDF byte stream
	signedPdf, err := EmbedPAdESSignature(pdfBytes, pkcs7Bytes, opts, s.CertInfo.CommonName)
	if err != nil {
		return nil, Certificate{}, err
	}

	return signedPdf, s.CertInfo, nil
}

// BuildDetachedPKCS7 packages raw signature and cert into standard CMS ASN.1 structure.
func BuildDetachedPKCS7(certDER, digest, signature []byte) ([]byte, error) {
	// Minimal ASN.1 CMS SignedData container
	type Attribute struct {
		Type  asn1.ObjectIdentifier
		Value asn1.RawValue
	}
	type SignerInfo struct {
		Version            int
		IssuerAndSerial    asn1.RawValue
		DigestAlgorithm    pkix.AlgorithmIdentifier
		DigestEncryption   pkix.AlgorithmIdentifier
		EncryptedDigest    []byte
	}

	sha256OID := asn1.ObjectIdentifier{2, 16, 840, 1, 101, 3, 4, 2, 1}
	rsaEncryptionOID := asn1.ObjectIdentifier{1, 2, 840, 113549, 1, 1, 1}
	dataOID := asn1.ObjectIdentifier{1, 2, 840, 113549, 1, 7, 1}
	signedDataOID := asn1.ObjectIdentifier{1, 2, 840, 113549, 1, 7, 2}

	// SignerInfo ASN.1
	sInfo := struct {
		Version             int
		SignerIdentifier    asn1.RawValue
		DigestAlgorithm     pkix.AlgorithmIdentifier
		DigestEncryptionAlg pkix.AlgorithmIdentifier
		EncryptedDigest     []byte
	}{
		Version: 1,
		SignerIdentifier: asn1.RawValue{
			Class:      asn1.ClassUniversal,
			Tag:        asn1.TagSequence,
			IsCompound: true,
			Bytes:      certDER[0:min(len(certDER), 32)],
		},
		DigestAlgorithm:     pkix.AlgorithmIdentifier{Algorithm: sha256OID},
		DigestEncryptionAlg: pkix.AlgorithmIdentifier{Algorithm: rsaEncryptionOID},
		EncryptedDigest:     signature,
	}

	signerInfoDER, err := asn1.Marshal(sInfo)
	if err != nil {
		return nil, err
	}

	// Top SignedData structure
	cmsPayload := struct {
		Version          int
		DigestAlgorithms []pkix.AlgorithmIdentifier
		ContentInfo      struct {
			ContentType asn1.ObjectIdentifier
		}
		Certificates []asn1.RawValue `asn1:"tag:0,optional"`
		SignerInfos  []asn1.RawValue
	}{
		Version:          1,
		DigestAlgorithms: []pkix.AlgorithmIdentifier{{Algorithm: sha256OID}},
		ContentInfo: struct {
			ContentType asn1.ObjectIdentifier
		}{
			ContentType: dataOID,
		},
		Certificates: []asn1.RawValue{
			{Class: asn1.ClassUniversal, Tag: asn1.TagSequence, IsCompound: true, Bytes: certDER},
		},
		SignerInfos: []asn1.RawValue{
			{Class: asn1.ClassUniversal, Tag: asn1.TagSequence, IsCompound: true, Bytes: signerInfoDER},
		},
	}

	cmsDER, err := asn1.Marshal(cmsPayload)
	if err != nil {
		return nil, err
	}

	// Wrap in ContentInfo
	fullEnvelope := struct {
		ContentType asn1.ObjectIdentifier
		Content     asn1.RawValue `asn1:"tag:0,explicit"`
	}{
		ContentType: signedDataOID,
		Content: asn1.RawValue{
			Class:      asn1.ClassContextSpecific,
			Tag:        0,
			IsCompound: true,
			Bytes:      cmsDER,
		},
	}

	return asn1.Marshal(fullEnvelope)
}

// EmbedPAdESSignature injects an incremental update with /Type /Sig into a PDF byte stream.
func EmbedPAdESSignature(pdfBytes, pkcs7DER []byte, opts PAdESOptions, signerCN string) ([]byte, error) {
	hexSig := hex.EncodeToString(pkcs7DER)
	sigObjNum := 999
	sigDate := time.Now().UTC().Format("20060102150405Z")

	var buf bytes.Buffer
	buf.Write(pdfBytes)

	// Append incremental PDF update
	sigDict := fmt.Sprintf("\n%d 0 obj\n<<\n  /Type /Sig\n  /Filter /Adobe.PPKLite\n  /SubFilter /adbe.pkcs7.detached\n  /Contents <%s>\n  /M (D:%s)\n  /Name (%s)\n  /Reason (%s)\n  /Location (%s)\n>>\nendobj\n",
		sigObjNum, hexSig, sigDate, signerCN, opts.Reason, opts.Location)
	buf.WriteString(sigDict)

	// Append trailer update
	trailer := fmt.Sprintf("xref\n0 1\n0000000000 65535 f \n%d 1\n0000000000 00000 n \ntrailer\n<< /Size %d >>\nstartxref\n%d\n%%%%EOF\n",
		sigObjNum, sigObjNum+1, len(pdfBytes)+len(sigDict))
	buf.WriteString(trailer)

	return buf.Bytes(), nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
