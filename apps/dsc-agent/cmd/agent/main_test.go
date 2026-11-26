package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/synextax/synextax/apps/dsc-agent/modules/dsc"
	tallysync "github.com/synextax/synextax/apps/dsc-agent/modules/tally-sync"
	"github.com/synextax/synextax/apps/dsc-agent/security"
)

func setupTestHost(t *testing.T) (*AgentHost, *http.ServeMux) {
	sim, err := dsc.NewDevSimulator()
	if err != nil {
		t.Fatalf("failed to init dev simulator: %v", err)
	}

	host := &AgentHost{
		config: ServerConfig{
			Port:         DefaultPort,
			DevMode:      true,
			DevSimulator: true,
			HTTPOnly:     true,
		},
		signer:        sim,
		nonceVerifier: security.NewNonceVerifier(true, nil),
		tallyPlugin:   tallysync.NewTallySyncPlugin("http://127.0.0.1:9000"),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", host.handleHealth)
	mux.HandleFunc("GET /certificates", host.handleCertificates)
	mux.HandleFunc("POST /sign/pkcs7", host.handleSignPKCS7)
	mux.HandleFunc("POST /sign/pades-batch", host.handleSignPAdESBatch)

	return host, mux
}

func TestHealthEndpoint(t *testing.T) {
	host, mux := setupTestHost(t)
	handler := host.securityMiddleware(mux)

	req := httptest.NewRequest("GET", "/health", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}

	var res map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse json: %v", err)
	}

	if res["status"] != "ok" {
		t.Fatalf("expected status 'ok', got %v", res["status"])
	}
	if res["token_connected"] != true {
		t.Fatalf("expected token_connected true in dev simulator")
	}
	if res["detected_fips_tier"] != "FIPS_140_3" {
		t.Fatalf("expected FIPS_140_3, got %v", res["detected_fips_tier"])
	}
}

func TestCertificatesEndpoint(t *testing.T) {
	host, mux := setupTestHost(t)
	handler := host.securityMiddleware(mux)

	req := httptest.NewRequest("GET", "/certificates", nil)
	req.Header.Set("Origin", "https://app.synextax.in")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}

	var res struct {
		Certificates []struct {
			SubjectCN   string `json:"subject_cn"`
			PanHint     string `json:"pan_hint"`
			FipsProfile string `json:"fips_profile"`
		} `json:"certificates"`
		Count int `json:"count"`
	}

	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("json parse error: %v", err)
	}

	if res.Count != 1 || len(res.Certificates) == 0 {
		t.Fatalf("expected 1 certificate, got %d", res.Count)
	}

	cert := res.Certificates[0]
	if cert.PanHint != "AABCP1332L" {
		t.Fatalf("expected PAN AABCP1332L, got %s", cert.PanHint)
	}
	if cert.FipsProfile != "FIPS_140_3" {
		t.Fatalf("expected FIPS_140_3 profile, got %s", cert.FipsProfile)
	}
}

func TestSignPKCS7WithNonce(t *testing.T) {
	host, mux := setupTestHost(t)
	handler := host.securityMiddleware(mux)

	nonce := fmt.Sprintf("test-nonce-%d.%d", time.Now().UnixNano(), time.Now().Unix())
	payload := []byte(`{"gstin":"03AAACA1294F1Z3","return_type":"GSTR3B","liability":"24150.00"}`)
	payloadB64 := base64.StdEncoding.EncodeToString(payload)

	reqBody, _ := json.Marshal(map[string]string{
		"cert_id":        "dummy-cert",
		"payload_base64": payloadB64,
		"signing_nonce":  nonce,
	})

	req := httptest.NewRequest("POST", "/sign/pkcs7", bytes.NewReader(reqBody))
	req.Header.Set("Origin", "https://app.synextax.in")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}

	var res map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	if res["success"] != true {
		t.Fatalf("expected success true in response")
	}
	if res["signature_b64"] == "" {
		t.Fatalf("expected non-empty signature_b64")
	}

	// Replay attempt with same nonce MUST be rejected with 403 Forbidden
	reqReplay := httptest.NewRequest("POST", "/sign/pkcs7", bytes.NewReader(reqBody))
	reqReplay.Header.Set("Origin", "https://app.synextax.in")
	reqReplay.Header.Set("Content-Type", "application/json")
	recReplay := httptest.NewRecorder()

	handler.ServeHTTP(recReplay, reqReplay)
	if recReplay.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden on replayed nonce, got %d", recReplay.Code)
	}
}

func TestSignPAdESBatchWithNonce(t *testing.T) {
	host, mux := setupTestHost(t)
	handler := host.securityMiddleware(mux)

	nonce := fmt.Sprintf("pades-nonce-%d.%d", time.Now().UnixNano(), time.Now().Unix())
	dummyPdf := []byte("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n160\n%%EOF")
	pdfB64 := base64.StdEncoding.EncodeToString(dummyPdf)

	reqPayload := map[string]interface{}{
		"cert_id":       "dummy-cert",
		"signing_nonce": nonce,
		"documents": []map[string]interface{}{
			{
				"id":         "form-130-doc-1",
				"pdf_base64": pdfB64,
				"options": map[string]interface{}{
					"page":     1,
					"x":        50.0,
					"y":        100.0,
					"width":    150.0,
					"height":   40.0,
					"reason":   "TRACES Form 130 PAdES Signature",
					"location": "Amritsar Office",
				},
			},
			{
				"id":         "form-131-doc-2",
				"pdf_base64": pdfB64,
				"options": map[string]interface{}{
					"page":     1,
					"x":        50.0,
					"y":        100.0,
					"width":    150.0,
					"height":   40.0,
					"reason":   "TRACES Form 131 PAdES Signature",
					"location": "Amritsar Office",
				},
			},
		},
	}

	reqBytes, _ := json.Marshal(reqPayload)
	req := httptest.NewRequest("POST", "/sign/pades-batch", bytes.NewReader(reqBytes))
	req.Header.Set("Origin", "https://app.synextax.in")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}

	var res struct {
		Success         bool `json:"success"`
		TotalSigned     int  `json:"total_signed"`
		SignedDocuments []struct {
			ID              string `json:"id"`
			SignedPDFBase64 string `json:"signed_pdf_base64"`
			SHA256Hash      string `json:"sha256_hash"`
		} `json:"signed_documents"`
	}

	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode json: %v", err)
	}

	if !res.Success || res.TotalSigned != 2 {
		t.Fatalf("expected 2 successfully signed documents, got %d", res.TotalSigned)
	}

	for _, doc := range res.SignedDocuments {
		if doc.SignedPDFBase64 == "" || doc.SHA256Hash == "" {
			t.Fatalf("expected valid signed base64 and sha256 hash for doc %s", doc.ID)
		}
	}
}

func TestUnauthorizedOriginRejection(t *testing.T) {
	host, mux := setupTestHost(t)
	handler := host.securityMiddleware(mux)

	req := httptest.NewRequest("GET", "/health", nil)
	req.Header.Set("Origin", "https://malicious-tax-phish.net")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for unauthorized origin, got %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected no Access-Control-Allow-Origin on rejected request, got %q", got)
	}
}
