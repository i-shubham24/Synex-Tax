//go:build windows

package dsc

import (
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var (
	crypt32  = syscall.NewLazyDLL("crypt32.dll")
	ncrypt   = syscall.NewLazyDLL("ncrypt.dll")
	advapi32 = syscall.NewLazyDLL("advapi32.dll")

	procCertGetCertificateContextProperty = crypt32.NewProc("CertGetCertificateContextProperty")
	procCryptAcquireCertificatePrivateKey = crypt32.NewProc("CryptAcquireCertificatePrivateKey")
	procNCryptSignHash                    = ncrypt.NewProc("NCryptSignHash")
	procNCryptFreeObject                  = ncrypt.NewProc("NCryptFreeObject")
	procCryptCreateHash                   = advapi32.NewProc("CryptCreateHash")
	procCryptSetHashParam                 = advapi32.NewProc("CryptSetHashParam")
	procCryptSignHashW                    = advapi32.NewProc("CryptSignHashW")
	procCryptDestroyHash                  = advapi32.NewProc("CryptDestroyHash")
	procCryptReleaseContext               = advapi32.NewProc("CryptReleaseContext")
)

const (
	certKeyProvInfoPropID           = 2
	cryptAcquireCacheFlag           = 0x1
	cryptAcquireCompareKeyFlag      = 0x4
	cryptAcquirePreferNCryptKeyFlag = 0x20000
	certNCryptKeySpec               = 0xFFFFFFFF
	calgSHA256                      = 0x0000800c
	hpHashVal                       = 0x0002
	bcryptPadPKCS1                  = 0x2
)

// Errors raised by token drivers when the user cancels or the PIN is refused.
var driverErrors = map[uint32]error{
	0x800704C7: ErrCancelled, // ERROR_CANCELLED
	0x000004C7: ErrCancelled,
	0x8010006E: ErrCancelled,  // SCARD_W_CANCELLED_BY_USER
	0x8010006B: ErrWrongPin,   // SCARD_W_WRONG_CHV
	0x8010006C: ErrPinBlocked, // SCARD_W_CHV_BLOCKED
}

func driverError(step string, code uintptr) error {
	if e, ok := driverErrors[uint32(code)]; ok {
		return e
	}
	return fmt.Errorf("dsc: %s failed (0x%08X)", step, uint32(code))
}

type cryptKeyProvInfo struct {
	ContainerName  *uint16
	ProvName       *uint16
	ProvType       uint32
	Flags          uint32
	ProvParamCount uint32
	ProvParam      uintptr
	KeySpec        uint32
}

type bcryptPKCS1PaddingInfo struct{ AlgID *uint16 }

func utf16At(p *uint16) string {
	if p == nil {
		return ""
	}
	var s []uint16
	for ptr := unsafe.Pointer(p); ; ptr = unsafe.Add(ptr, 2) {
		c := *(*uint16)(ptr)
		if c == 0 {
			break
		}
		s = append(s, c)
	}
	return syscall.UTF16ToString(s)
}

// keyProvider returns the name of the provider holding the certificate's private key, and false
// when this computer has no private key for it.
func keyProvider(ctx *syscall.CertContext) (string, bool) {
	var size uint32
	r, _, _ := procCertGetCertificateContextProperty.Call(uintptr(unsafe.Pointer(ctx)), certKeyProvInfoPropID, 0, uintptr(unsafe.Pointer(&size)))
	if r == 0 || size == 0 {
		return "", false
	}
	buf := make([]uint64, (size+7)/8) // 8-byte aligned
	r, _, _ = procCertGetCertificateContextProperty.Call(uintptr(unsafe.Pointer(ctx)), certKeyProvInfoPropID, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	if r == 0 {
		return "", false
	}
	info := (*cryptKeyProvInfo)(unsafe.Pointer(&buf[0]))
	name := utf16At(info.ProvName)
	runtime.KeepAlive(buf)
	return name, true
}

func certDER(ctx *syscall.CertContext) []byte {
	return append([]byte(nil), unsafe.Slice(ctx.EncodedCert, ctx.Length)...)
}

// each walks the current user's personal store ("MY"), where token drivers place certificates.
// visit returns true to stop; the context it was given stays valid until each returns.
func each(visit func(ctx *syscall.CertContext, der []byte, provider string) bool) error {
	store, err := syscall.CertOpenSystemStore(0, syscall.StringToUTF16Ptr("MY"))
	if err != nil {
		return fmt.Errorf("dsc: cannot open the certificate store: %w", err)
	}
	defer syscall.CertCloseStore(store, 0)
	var prev *syscall.CertContext
	for {
		ctx, err := syscall.CertEnumCertificatesInStore(store, prev)
		if err != nil || ctx == nil {
			return nil
		}
		prev = ctx
		provider, ok := keyProvider(ctx)
		if !ok {
			continue
		}
		if visit(ctx, certDER(ctx), provider) {
			syscall.CertFreeCertificateContext(ctx)
			return nil
		}
	}
}

// List returns the certificates on this computer that can sign now.
func List(now time.Time) ([]Certificate, error) {
	out := []Certificate{}
	err := each(func(_ *syscall.CertContext, der []byte, provider string) bool {
		c, x, err := Describe(der, provider)
		if err == nil && UsableForSigning(x, now) {
			out = append(out, c)
		}
		return false
	})
	return out, err
}

// Sign signs a SHA-256 digest with the certificate whose thumbprint is id. The token's driver
// asks for its PIN itself.
func Sign(id string, digest []byte, now time.Time) (*SignResponse, error) {
	if len(digest) != 32 {
		return nil, ErrBadDigest
	}
	want := strings.ToUpper(strings.ReplaceAll(id, " ", ""))
	var resp *SignResponse
	var signErr error = ErrNoCertificate
	err := each(func(ctx *syscall.CertContext, der []byte, provider string) bool {
		sum := sha1.Sum(der)
		if strings.ToUpper(hex.EncodeToString(sum[:])) != want {
			return false
		}
		info, x, err := Describe(der, provider)
		if err != nil {
			signErr = err
			return true
		}
		if !UsableForSigning(x, now) {
			signErr = errors.New("dsc: this certificate has expired or may not sign documents")
			return true
		}
		sig, alg, err := signWithContext(ctx, x, digest)
		if err != nil {
			signErr = err
			return true
		}
		resp = &SignResponse{
			Signature:        base64.StdEncoding.EncodeToString(sig),
			Algorithm:        alg,
			Certificate:      base64.StdEncoding.EncodeToString(der),
			Chain:            issuers(ctx),
			CertificateInfo:  info,
			SigningTimestamp: now.UTC(),
		}
		signErr = nil
		return true
	})
	if err != nil {
		return nil, err
	}
	return resp, signErr
}

// issuers returns the issuing certificates Windows finds for ctx, leaf excluded.
func issuers(ctx *syscall.CertContext) []string {
	out := []string{}
	para := syscall.CertChainPara{Size: uint32(unsafe.Sizeof(syscall.CertChainPara{}))}
	var chain *syscall.CertChainContext
	if err := syscall.CertGetCertificateChain(0, ctx, nil, 0, &para, 0, 0, &chain); err != nil || chain == nil {
		return out
	}
	defer syscall.CertFreeCertificateChain(chain)
	if chain.ChainCount == 0 {
		return out
	}
	simple := unsafe.Slice(chain.Chains, chain.ChainCount)[0]
	elements := unsafe.Slice(simple.Elements, simple.NumElements)
	for i, el := range elements {
		if i == 0 || el.CertContext == nil {
			continue
		}
		out = append(out, base64.StdEncoding.EncodeToString(certDER(el.CertContext)))
	}
	return out
}
