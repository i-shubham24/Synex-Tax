//go:build windows

package dsc

import (
	"crypto/x509"
	"runtime"
	"syscall"
	"unsafe"
)

// signWithContext signs digest with the private key Windows associates with ctx. Smart card key
// storage providers (NCrypt) are preferred; older token CSPs (CryptoAPI) are used otherwise.
func signWithContext(ctx *syscall.CertContext, x *x509.Certificate, digest []byte) ([]byte, string, error) {
	size, isRSA, err := signatureSize(x)
	if err != nil {
		return nil, "", err
	}
	var key uintptr
	var keySpec uint32
	var mustFree int32
	r, _, e := procCryptAcquireCertificatePrivateKey.Call(
		uintptr(unsafe.Pointer(ctx)),
		cryptAcquireCacheFlag|cryptAcquireCompareKeyFlag|cryptAcquirePreferNCryptKeyFlag,
		0,
		uintptr(unsafe.Pointer(&key)),
		uintptr(unsafe.Pointer(&keySpec)),
		uintptr(unsafe.Pointer(&mustFree)),
	)
	if r == 0 {
		return nil, "", driverError("opening the private key", uintptr(errnoOf(e)))
	}

	var sig []byte
	if keySpec == certNCryptKeySpec {
		if mustFree != 0 {
			defer procNCryptFreeObject.Call(key)
		}
		sig, err = ncryptSign(key, digest, size, isRSA)
	} else {
		if mustFree != 0 {
			defer procCryptReleaseContext.Call(key, 0)
		}
		if !isRSA {
			return nil, "", ErrKeyType
		}
		sig, err = capiSign(key, keySpec, digest, size)
	}
	if err != nil {
		return nil, "", err
	}
	if !isRSA {
		der, err := p1363ToDER(sig)
		return der, "ECDSA_SHA256", err
	}
	return sig, "RSA_PKCS1_SHA256", nil
}

func errnoOf(e error) syscall.Errno {
	if n, ok := e.(syscall.Errno); ok {
		return n
	}
	return 0
}

func ncryptSign(key uintptr, digest []byte, size int, isRSA bool) ([]byte, error) {
	out := make([]byte, size)
	var written uint32
	var padding uintptr
	var flags uintptr
	pad := bcryptPKCS1PaddingInfo{AlgID: syscall.StringToUTF16Ptr("SHA256")}
	if isRSA {
		padding = uintptr(unsafe.Pointer(&pad))
		flags = bcryptPadPKCS1
	}
	status, _, _ := procNCryptSignHash.Call(
		key, padding,
		uintptr(unsafe.Pointer(&digest[0])), uintptr(len(digest)),
		uintptr(unsafe.Pointer(&out[0])), uintptr(len(out)),
		uintptr(unsafe.Pointer(&written)), flags,
	)
	runtime.KeepAlive(pad)
	runtime.KeepAlive(digest)
	if status != 0 {
		return nil, driverError("signing", status)
	}
	return out[:written], nil
}

// capiSign signs with a CryptoAPI provider. CryptSignHash returns the signature little-endian.
func capiSign(prov uintptr, keySpec uint32, digest []byte, size int) ([]byte, error) {
	var hash uintptr
	r, _, e := procCryptCreateHash.Call(prov, calgSHA256, 0, 0, uintptr(unsafe.Pointer(&hash)))
	if r == 0 {
		return nil, driverError("preparing the digest", uintptr(errnoOf(e)))
	}
	defer procCryptDestroyHash.Call(hash)
	r, _, e = procCryptSetHashParam.Call(hash, hpHashVal, uintptr(unsafe.Pointer(&digest[0])), 0)
	runtime.KeepAlive(digest)
	if r == 0 {
		return nil, driverError("preparing the digest", uintptr(errnoOf(e)))
	}
	out := make([]byte, size)
	n := uint32(size)
	r, _, e = procCryptSignHashW.Call(hash, uintptr(keySpec), 0, 0, uintptr(unsafe.Pointer(&out[0])), uintptr(unsafe.Pointer(&n)))
	if r == 0 {
		return nil, driverError("signing", uintptr(errnoOf(e)))
	}
	out = out[:n]
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}
