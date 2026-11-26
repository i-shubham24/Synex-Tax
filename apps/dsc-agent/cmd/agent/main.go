package main

import (
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/synextax/synextax/apps/dsc-agent/modules/dsc"
	tallysync "github.com/synextax/synextax/apps/dsc-agent/modules/tally-sync"
	"github.com/synextax/synextax/apps/dsc-agent/security"
)

const (
	AgentVersion = "1.27.0"
	DefaultPort  = "15850"
)

type ServerConfig struct {
	Port         string
	DevMode      bool
	DevSimulator bool
	HTTPOnly     bool
}

type AgentHost struct {
	config        ServerConfig
	signer        dsc.SignerProvider
	nonceVerifier *security.NonceVerifier
	tallyPlugin   *tallysync.TallySyncPlugin
}

func main() {
	var cfg ServerConfig
	flag.StringVar(&cfg.Port, "port", DefaultPort, "Port to listen on strictly at 127.0.0.1")
	flag.BoolVar(&cfg.DevMode, "dev", false, "Enable development mode (allows localhost:3000 origin)")
	flag.BoolVar(&cfg.DevSimulator, "dev-simulator", false, "Enable in-memory RSA-2048 Class 3 DSC simulator")
	flag.BoolVar(&cfg.HTTPOnly, "http", false, "Run plaintext HTTP for local loopback debugging")
	flag.Parse()

	// In dev mode or when --dev-simulator is set, default to dev simulator
	var signer dsc.SignerProvider
	if cfg.DevSimulator || cfg.DevMode {
		sim, err := dsc.NewDevSimulator()
		if err != nil {
			log.Fatalf("Fatal: failed to initialize dev simulator: %v", err)
		}
		signer = sim
		log.Println("SynTax Sign Agent: Dev Simulator initialized with in-memory Class 3 DSC.")
	} else {
		// This entry point has no native token signer yet. It must never sign with the in-memory
		// simulator outside development: a CA would get a signature from a key that is not theirs.
		// The agent that signs with real USB tokens is the root package (apps/dsc-agent/main.go).
		log.Fatal("Fatal: cmd/agent signs only with --dev or --dev-simulator. Build the root package (go build .) for real DSC tokens.")
	}

	host := &AgentHost{
		config:        cfg,
		signer:        signer,
		nonceVerifier: security.NewNonceVerifier(cfg.DevMode, nil),
		tallyPlugin:   tallysync.NewTallySyncPlugin("http://127.0.0.1:9000"),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", host.handleHealth)
	mux.HandleFunc("GET /certificates", host.handleCertificates)
	mux.HandleFunc("POST /sign/pkcs7", host.handleSignPKCS7)
	mux.HandleFunc("POST /sign/pades-batch", host.handleSignPAdESBatch)

	handler := host.securityMiddleware(mux)

	listenAddr := fmt.Sprintf("127.0.0.1:%s", cfg.Port)
	log.Printf("SynTax Sign Local Agent v%s listening on %s (DevMode=%v, Simulator=%v)\n",
		AgentVersion, listenAddr, cfg.DevMode, cfg.DevSimulator)

	if cfg.HTTPOnly {
		server := &http.Server{
			Addr:              listenAddr,
			Handler:           handler,
			ReadHeaderTimeout: 10 * time.Second,
			WriteTimeout:      60 * time.Second,
		}
		if err := server.ListenAndServe(); err != nil {
			log.Fatalf("Server stopped: %v", err)
		}
	} else {
		cacheDir := filepath.Join(os.Getenv("USERPROFILE"), ".synextax", "dsc-agent")
		if runtime.GOOS != "windows" {
			cacheDir = filepath.Join(os.Getenv("HOME"), ".synextax", "dsc-agent")
		}
		tlsCert, err := security.EnsureLoopbackCertificate(cacheDir)
		if err != nil {
			log.Fatalf("Fatal: TLS loopback certificate generation failed: %v", err)
		}

		server := &http.Server{
			Addr:              listenAddr,
			Handler:           handler,
			TLSConfig:         &tls.Config{Certificates: []tls.Certificate{tlsCert}},
			ReadHeaderTimeout: 10 * time.Second,
			WriteTimeout:      60 * time.Second,
		}
		if err := server.ListenAndServeTLS("", ""); err != nil {
			log.Fatalf("HTTPS Server stopped: %v", err)
		}
	}
}

func (h *AgentHost) securityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Security: Validate origin strictly BEFORE reflecting CORS headers
		if err := h.nonceVerifier.ValidateOrigin(r); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":   "UNAUTHORIZED_ORIGIN",
				"message": err.Error(),
			})
			return
		}

		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Idempotency-Key")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

func (h *AgentHost) handleHealth(w http.ResponseWriter, r *http.Request) {
	certs, _ := h.signer.EnumerateCertificates()
	fipsTier := "UNKNOWN"
	if len(certs) > 0 {
		fipsTier = certs[0].FipsProfile
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":             "ok",
		"agent_version":      AgentVersion,
		"os":                 runtime.GOOS,
		"loaded_plugins":     []string{"dsc", h.tallyPlugin.Name()},
		"token_connected":    len(certs) > 0,
		"tokensDetected":     len(certs),
		"version":            AgentVersion,
		"detected_fips_tier": fipsTier,
	})
}

func (h *AgentHost) handleCertificates(w http.ResponseWriter, r *http.Request) {
	certs, err := h.signer.EnumerateCertificates()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "ENUMERATION_FAILED", "message": err.Error()})
		return
	}

	type CertDTO struct {
		SerialHex                  string `json:"serial_hex"`
		SubjectCN                  string `json:"subject_cn"`
		PanHint                    string `json:"pan_hint"`
		IssuerCA                   string `json:"issuer_ca"`
		ValidFrom                  string `json:"valid_from"`
		ValidTo                    string `json:"valid_to"`
		TokenLabel                 string `json:"token_label"`
		FipsProfile                string `json:"fips_profile"`
		RenewalRequiresNewHardware bool   `json:"renewal_requires_new_hardware"`
	}

	list := make([]CertDTO, len(certs))
	for i, c := range certs {
		list[i] = CertDTO{
			SerialHex:                  c.SerialNumber,
			SubjectCN:                  c.CommonName,
			PanHint:                    c.Pan,
			IssuerCA:                   c.Issuer,
			ValidFrom:                  c.ValidFrom.Format(time.RFC3339),
			ValidTo:                    c.ValidTo.Format(time.RFC3339),
			TokenLabel:                 c.TokenLabel,
			FipsProfile:                c.FipsProfile,
			RenewalRequiresNewHardware: c.RenewalRequiresNewHardware,
		}
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"certificates": list,
		"count":        len(list),
	})
}

type PKCS7SignRequest struct {
	CertID         string `json:"cert_id"`
	PayloadBase64  string `json:"payload_base64"`
	SigningNonce   string `json:"signing_nonce"`
	PayloadSHA256  string `json:"payload_sha256"`
	NonceSignature string `json:"nonce_signature"`
}

func (h *AgentHost) handleSignPKCS7(w http.ResponseWriter, r *http.Request) {
	var req PKCS7SignRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "BAD_REQUEST", "message": "Invalid JSON body"})
		return
	}

	// 1. Nonce validation
	if err := h.nonceVerifier.VerifyAndConsumeNonce(req.SigningNonce, req.PayloadSHA256, req.NonceSignature); err != nil {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "INVALID_NONCE", "message": err.Error()})
		return
	}

	// 2. Decode payload
	payloadBytes, err := base64.StdEncoding.DecodeString(req.PayloadBase64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "BAD_PAYLOAD", "message": "Invalid base64 payload"})
		return
	}

	// 3. Verify payload SHA-256 matches expected
	actualSha := sha256.Sum256(payloadBytes)
	actualShaHex := hex.EncodeToString(actualSha[:])
	if req.PayloadSHA256 != "" && actualShaHex != req.PayloadSHA256 {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "PAYLOAD_DIGEST_MISMATCH", "message": "Payload SHA256 does not match nonce commitment"})
		return
	}

	// 4. Execute PKCS#7 signing
	sigBytes, cert, err := h.signer.SignPKCS7(req.CertID, payloadBytes)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "SIGNING_FAILED", "message": err.Error()})
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"signature_b64": base64.StdEncoding.EncodeToString(sigBytes),
		"algorithm":     "SHA256withRSA",
		"certificate":   cert,
		"signed_at":     time.Now().UTC().Format(time.RFC3339),
	})
}

type PAdESBatchDoc struct {
	ID        string            `json:"id"`
	PDFBase64 string            `json:"pdf_base64"`
	Options   dsc.PAdESOptions `json:"options"`
}

type PAdESBatchRequest struct {
	CertID         string          `json:"cert_id"`
	Documents      []PAdESBatchDoc `json:"documents"`
	SigningNonce   string          `json:"signing_nonce"`
	PayloadSHA256  string          `json:"payload_sha256"`
	NonceSignature string          `json:"nonce_signature"`
}

func (h *AgentHost) handleSignPAdESBatch(w http.ResponseWriter, r *http.Request) {
	var req PAdESBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "BAD_REQUEST", "message": "Invalid JSON body"})
		return
	}

	if len(req.Documents) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "EMPTY_BATCH", "message": "At least one PDF document required"})
		return
	}

	// 1. Nonce validation
	if err := h.nonceVerifier.VerifyAndConsumeNonce(req.SigningNonce, req.PayloadSHA256, req.NonceSignature); err != nil {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "INVALID_NONCE", "message": err.Error()})
		return
	}

	type SignedDocResult struct {
		ID              string `json:"id"`
		SignedPDFBase64 string `json:"signed_pdf_base64"`
		SHA256Hash      string `json:"sha256_hash"`
	}

	results := make([]SignedDocResult, 0, len(req.Documents))
	var lastCert dsc.Certificate

	// 2. Sequential PAdES signing under single PIN session
	for _, doc := range req.Documents {
		pdfBytes, err := base64.StdEncoding.DecodeString(doc.PDFBase64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "BAD_PDF_BASE64", "message": fmt.Sprintf("Doc %s has invalid base64", doc.ID)})
			return
		}

		signedPdf, cert, err := h.signer.SignPAdES(req.CertID, pdfBytes, doc.Options)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "PADES_SIGNING_FAILED", "message": err.Error()})
			return
		}
		lastCert = cert

		hash := sha256.Sum256(signedPdf)
		results = append(results, SignedDocResult{
			ID:              doc.ID,
			SignedPDFBase64: base64.StdEncoding.EncodeToString(signedPdf),
			SHA256Hash:      hex.EncodeToString(hash[:]),
		})
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":          true,
		"total_signed":     len(results),
		"signed_documents": results,
		"cert_metadata":    lastCert,
		"signed_at":        time.Now().UTC().Format(time.RFC3339),
	})
}
