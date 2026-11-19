package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/synextax/synextax/apps/dsc-agent/modules/dsc"
	"github.com/synextax/synextax/apps/dsc-agent/modules/tally"
	"github.com/synextax/synextax/apps/dsc-agent/security"
)

const (
	ListenAddress = "127.0.0.1:18531"
	AgentVersion  = "0.1.0"
)

type AppServer struct {
	tokenMgr     *dsc.TokenManager
	tallyPoller  *tally.TallyPoller
	nonceVerifier *security.NonceVerifier
}

func corsMiddleware(next http.HandlerFunc, verifier *security.NonceVerifier) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Security: Validate origin is authorized
		if err := verifier.ValidateOrigin(r); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"UNAUTHORIZED_ORIGIN","message":"%s"}`, err.Error()), http.StatusForbidden)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		next(w, r)
	}
}

func main() {
	server := &AppServer{
		tokenMgr:     dsc.NewTokenManager(),
		tallyPoller:  tally.NewTallyPoller("http://127.0.0.1:9000"),
		nonceVerifier: security.NewNonceVerifier(),
	}

	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/health", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		tallyOk, tallyMsg := server.tallyPoller.CheckHealth(r.Context())
		certs, _ := server.tokenMgr.ListCertificates()

		json.NewEncoder(w).Encode(map[string]any{
			"status":            "ONLINE",
			"version":           AgentVersion,
			"daemon":            "SynexTax Local Desktop DSC & Tally Agent",
			"listenAddress":     ListenAddress,
			"tokensDetected":    len(certs),
			"tallyReachable":    tallyOk,
			"tallyStatus":       tallyMsg,
			"currentTimestamp":  time.Now().UTC().Format(time.RFC3339),
		})
	}, server.nonceVerifier))

	// List detected Class 3 tokens
	mux.HandleFunc("/api/v1/tokens", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		certs, err := server.tokenMgr.ListCertificates()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]any{
			"tokens": certs,
			"count":  len(certs),
		})
	}, server.nonceVerifier))

	// Hardware token signing endpoint
	mux.HandleFunc("/api/v1/sign", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"METHOD_NOT_ALLOWED"}`, http.StatusMethodNotAllowed)
			return
		}

		var req dsc.SignDigestRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "INVALID_JSON_PAYLOAD"})
			return
		}

		// Consume challenge nonce to block replay attacks
		if err := server.nonceVerifier.ConsumeNonce(req.ChallengeNonce); err != nil {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		// Perform hardware signing
		resp, err := server.tokenMgr.SignDigest(req)
		if err != nil {
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	}, server.nonceVerifier))

	fmt.Printf("SynexTax Local Desktop Bridge listening securely on https://%s\n", ListenAddress)
	log.Fatal(http.ListenAndServe(ListenAddress, mux))
}
