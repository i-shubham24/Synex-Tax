package dsc

import (
	"bytes"
	"encoding/base64"
	"testing"
	"time"
)

func TestDevSimulatorPKCS7Signing(t *testing.T) {
	sim, err := NewDevSimulator()
	if err != nil {
		t.Fatalf("failed to initialize dev simulator: %v", err)
	}

	payload := []byte(`{"gstin":"03AAACA1294F1Z3","ret_period":"112026","sec_count":12,"total_liability":"24150.00"}`)
	pkcs7Bytes, cert, err := sim.SignPKCS7("dummy-cert-id", payload)
	if err != nil {
		t.Fatalf("SignPKCS7 failed: %v", err)
	}

	if len(pkcs7Bytes) == 0 {
		t.Fatalf("expected non-empty PKCS7 detached signature bytes")
	}

	if cert.CommonName != "CA Amrinder Verma (Dev Simulator)" {
		t.Fatalf("expected subject CN in cert response, got %s", cert.CommonName)
	}
	if cert.Pan != "AABCP1332L" {
		t.Fatalf("expected PAN AABCP1332L, got %s", cert.Pan)
	}
}

func TestDevSimulatorPAdESBatchSigning(t *testing.T) {
	sim, err := NewDevSimulator()
	if err != nil {
		t.Fatalf("failed to initialize dev simulator: %v", err)
	}

	// Minimal PDF stub
	dummyPdf := []byte("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000056 00000 n \n0000000111 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n160\n%%EOF")

	opts := PAdESOptions{
		Page:     1,
		X:        100.0,
		Y:        150.0,
		Width:    200.0,
		Height:   50.0,
		Reason:   "Statutory Filing PAdES Signing",
		Location: "Amritsar Office",
	}

	signedPdf, cert, err := sim.SignPAdES("dummy-cert-id", dummyPdf, opts)
	if err != nil {
		t.Fatalf("SignPAdES failed: %v", err)
	}

	if !bytes.Contains(signedPdf, []byte("/Type /Sig")) {
		t.Fatalf("signed PDF must contain /Type /Sig dictionary")
	}

	if !bytes.Contains(signedPdf, []byte("/SubFilter /adbe.pkcs7.detached")) {
		t.Fatalf("signed PDF must contain /SubFilter /adbe.pkcs7.detached")
	}

	if cert.Pan != "AABCP1332L" {
		t.Fatalf("expected cert PAN, got %s", cert.Pan)
	}

	// Base64 verify
	b64 := base64.StdEncoding.EncodeToString(signedPdf)
	if len(b64) == 0 {
		t.Fatalf("expected valid base64 representation")
	}
}

func TestDetectFipsTier(t *testing.T) {
	// 1. Certificate issued before Sept 21, 2026 under FIPS 140-2
	beforeCutoff := time.Date(2026, time.August, 15, 0, 0, 0, 0, time.UTC)
	tier1, renewalReq1 := DetectFipsTier("ePass2003", beforeCutoff)
	if tier1 != "FIPS_140_2" || !renewalReq1 {
		t.Fatalf("expected grandfathered FIPS_140_2 with renewal required, got tier=%s renewal=%v", tier1, renewalReq1)
	}

	// 2. Certificate issued after Sept 21, 2026
	afterCutoff := time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC)
	tier2, renewalReq2 := DetectFipsTier("ePass2003", afterCutoff)
	if tier2 != "FIPS_140_3" || renewalReq2 {
		t.Fatalf("expected FIPS_140_3 with no renewal required, got tier=%s renewal=%v", tier2, renewalReq2)
	}
}
