package security

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

// EnsureLoopbackCertificate generates an ephemeral or persisted self-signed TLS cert
// for 127.0.0.1 and localhost.
func EnsureLoopbackCertificate(cacheDir string) (tls.Certificate, error) {
	if cacheDir != "" {
		certPath := filepath.Join(cacheDir, "loopback.crt")
		keyPath := filepath.Join(cacheDir, "loopback.key")

		if _, err := os.Stat(certPath); err == nil {
			if cert, err := tls.LoadX509KeyPair(certPath, keyPath); err == nil {
				return cert, nil
			}
		}
	}

	// Generate fresh ECDSA P-256 certificate
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, err
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return tls.Certificate{}, err
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"SynTax Sign Desktop Agent"},
			CommonName:   "127.0.0.1",
		},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1"), net.IPv6loopback},
		DNSNames:              []string{"localhost"},
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return tls.Certificate{}, err
	}

	certPem := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	keyBytes, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return tls.Certificate{}, err
	}
	keyPem := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyBytes})

	if cacheDir != "" {
		_ = os.MkdirAll(cacheDir, 0700)
		_ = os.WriteFile(filepath.Join(cacheDir, "loopback.crt"), certPem, 0644)
		_ = os.WriteFile(filepath.Join(cacheDir, "loopback.key"), keyPem, 0600)
	}

	return tls.X509KeyPair(certPem, keyPem)
}
