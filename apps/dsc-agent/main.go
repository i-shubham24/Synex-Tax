package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/synextax/synextax/apps/dsc-agent/modules/backup"
	"github.com/synextax/synextax/apps/dsc-agent/modules/certs"
	"github.com/synextax/synextax/apps/dsc-agent/modules/dsc"
	"github.com/synextax/synextax/apps/dsc-agent/modules/fvu"
	"github.com/synextax/synextax/apps/dsc-agent/modules/tally"
	"github.com/synextax/synextax/apps/dsc-agent/modules/uploader"
	"github.com/synextax/synextax/apps/dsc-agent/security"
)

const ListenAddress = "127.0.0.1:15850"

// AgentVersion is set at build time: go build -ldflags "-X main.AgentVersion=1.2.3".
var AgentVersion = "0.1.0"

type AppServer struct {
	tallyPoller   *tally.TallyPoller
	nonceVerifier *security.NonceVerifier
	backups       backup.Config
	fvu           fvu.Config
	uploads       *uploader.Runner
}

func corsMiddleware(next http.HandlerFunc, verifier *security.NonceVerifier) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Security: Validate origin BEFORE reflecting CORS headers or answering preflight
		if err := verifier.ValidateOrigin(r); err != nil {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, fmt.Sprintf(`{"error":"UNAUTHORIZED_ORIGIN","message":"%s"}`, err.Error()), http.StatusForbidden)
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
		next(w, r)
	}
}

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "pair":
			if err := pair(os.Args[2:]); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			return
		case "unpair":
			if err := unpair(); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			return
		}
	}
	server := &AppServer{
		tallyPoller:   tally.NewTallyPoller("http://127.0.0.1:9000"),
		nonceVerifier: security.NewNonceVerifier(false, nil),
		backups:       backup.Config{Destination: backupHome(), Keep: 30},
		fvu:           fvu.Config{JarPath: os.Getenv("SYNEXTAX_FVU_JAR"), Java: os.Getenv("SYNEXTAX_JAVA"), Root: filepath.Join(agentHome(), "FVU")},
	}

	// Scheduled uploads, when this computer has been paired with a device token.
	if cfgPath, err := uploader.ConfigPath(); err == nil {
		if cfg, err := uploader.Load(cfgPath); err != nil {
			log.Printf("agent config %s could not be read: %v", cfgPath, err)
		} else {
			if len(cfg.Folders) > 0 {
				server.backups.Folders = cfg.Folders
			}
			if cfg.Paired() {
				server.uploads = &uploader.Runner{
					Client:  &uploader.Client{Server: cfg.Server, Token: cfg.DeviceToken, Version: AgentVersion, HTTP: &http.Client{Timeout: 2 * time.Hour}},
					Backups: server.backups,
					Logf:    log.Printf,
				}
				go server.uploads.Loop(context.Background())
			}
		}
	}

	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/health", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		tallyOk, tallyMsg := server.tallyPoller.CheckHealth(r.Context())
		certs, _ := dsc.List(time.Now())

		json.NewEncoder(w).Encode(map[string]any{
			"status":           "ONLINE",
			"version":          AgentVersion,
			"daemon":           "SynexTax Local Desktop DSC & Tally Agent",
			"listenAddress":    ListenAddress,
			"tokensDetected":   len(certs),
			"tallyReachable":   tallyOk,
			"tallyStatus":      tallyMsg,
			"currentTimestamp": time.Now().UTC().Format(time.RFC3339),
		})
	}, server.nonceVerifier))

	// List detected Class 3 tokens
	mux.HandleFunc("/api/v1/tokens", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		certs, err := dsc.List(time.Now())
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

		var req dsc.SignRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "INVALID_JSON_PAYLOAD"})
			return
		}

		// A server-signed challenge for this action, used once.
		if err := server.nonceVerifier.VerifyChallenge(req.ChallengeToken, "dsc.sign", security.ServerKeys(), time.Now()); err != nil {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		// The token's driver asks for the PIN; the agent never sees it.
		digest, err := dsc.ParseDigest(req.DigestSha256)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		resp, err := dsc.Sign(req.CertificateID, digest, time.Now())
		if err != nil {
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	}, server.nonceVerifier))

	// Accounting data backups (Tally, Busy, Marg) kept on this machine.
	mux.HandleFunc("/api/v1/backup/detect", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"folders": server.backups.Detect(), "destination": server.backups.Destination})
	}, server.nonceVerifier))

	mux.HandleFunc("/api/v1/backup/list", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		list, err := server.backups.List(backup.Product(r.URL.Query().Get("product")))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"backups": list})
	}, server.nonceVerifier))

	mux.HandleFunc("/api/v1/backup/run", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"METHOD_NOT_ALLOWED"}`, http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Product        backup.Product `json:"product"`
			Source         string         `json:"source"`
			ChallengeToken string         `json:"challengeToken"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "INVALID_JSON_PAYLOAD"})
			return
		}
		if err := server.nonceVerifier.VerifyChallenge(req.ChallengeToken, "backup.run", security.ServerKeys(), time.Now()); err != nil {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		res, err := server.backups.Run(req.Product, req.Source, time.Now())
		if err != nil {
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(res)
	}, server.nonceVerifier))

	// Protean FVU: prepare a working folder, open the FVU, read back what it produced.
	mux.HandleFunc("/api/v1/fvu/prepare", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"METHOD_NOT_ALLOWED"}`, http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			FileName       string `json:"fileName"`
			Statement      string `json:"statement"`
			Csi            string `json:"csi"`
			ChallengeToken string `json:"challengeToken"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 20<<20)).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "INVALID_JSON_PAYLOAD"})
			return
		}
		if err := server.nonceVerifier.VerifyChallenge(req.ChallengeToken, "fvu.prepare", security.ServerKeys(), time.Now()); err != nil {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		dir, err := server.fvu.Prepare(req.FileName, []byte(req.Statement), []byte(req.Csi), time.Now())
		if err != nil {
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		launchErr := server.fvu.Launch(dir)
		resp := map[string]any{"folder": dir, "launched": launchErr == nil}
		if launchErr != nil {
			resp["launchError"] = launchErr.Error()
		}
		json.NewEncoder(w).Encode(resp)
	}, server.nonceVerifier))

	mux.HandleFunc("/api/v1/fvu/result", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		res, err := server.fvu.Read(r.URL.Query().Get("folder"))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(res)
	}, server.nonceVerifier))

	// TDS certificates from the TRACES PDF converter: PAN from the file name and signature check.
	mux.HandleFunc("/api/v1/certificates/scan", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		root := filepath.Join(agentHome(), "Certificates")
		list, err := certs.Scan(root, r.URL.Query().Get("folder"))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"folder": root, "certificates": list})
	}, server.nonceVerifier))

	// One certificate PDF, unchanged, from inside the certificates folder (needs a certs.read token).
	mux.HandleFunc("/api/v1/certificates/read", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"METHOD_NOT_ALLOWED"}`, http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			File           string `json:"file"`
			ChallengeToken string `json:"challengeToken"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "INVALID_JSON_PAYLOAD"})
			return
		}
		if err := server.nonceVerifier.VerifyChallenge(req.ChallengeToken, "certs.read", security.ServerKeys(), time.Now()); err != nil {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		body, err := certs.Read(filepath.Join(agentHome(), "Certificates"), req.File)
		if err != nil {
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(body)
	}, server.nonceVerifier))

	// Whether this computer uploads backups, and what it last did. The token is never shown.
	mux.HandleFunc("/api/v1/backup/uploader", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if server.uploads == nil {
			json.NewEncoder(w).Encode(map[string]any{"paired": false})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"paired": true, "server": server.uploads.Client.Server, "rules": server.uploads.Status()})
	}, server.nonceVerifier))

	fmt.Printf("SynexTax Local Desktop Bridge listening securely on https://%s\n", ListenAddress)
	log.Fatal(http.ListenAndServe(ListenAddress, mux))
}

// backupHome is where backups are kept: a folder in the signed-in user's profile.
func backupHome() string {
	return filepath.Join(userHome(), "SynexTax Backups")
}

// agentHome holds the agent's working folders (FVU runs).
func agentHome() string {
	return filepath.Join(userHome(), "SynexTax Agent")
}

func userHome() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return home
}

// pair saves the server address and a device token in the agent's config file. The token is read
// from standard input, not the command line, so it does not show in the list of running programs.
// Usage: synextax-agent pair [https://app.synextax.com]
func pair(args []string) error {
	server := "https://app.synextax.com"
	if len(args) > 0 {
		server = args[0]
	}
	server, err := uploader.NormalizeServer(server)
	if err != nil {
		return err
	}
	fmt.Print("Paste the device token from SynexTax (Settings, Backups) and press Enter: ")
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		return err
	}
	token := strings.TrimSpace(line)
	if !uploader.ValidToken(token) {
		return uploader.ErrBadToken
	}
	path, err := uploader.ConfigPath()
	if err != nil {
		return err
	}
	cfg, err := uploader.Load(path)
	if err != nil {
		return err
	}
	cfg.Server, cfg.DeviceToken = server, token
	if err := uploader.Save(path, cfg); err != nil {
		return err
	}
	fmt.Printf("Paired with %s. Restart the agent to start uploading backups. Settings saved in %s\n", server, path)
	return nil
}

// unpair removes the device token from the config file.
func unpair() error {
	path, err := uploader.ConfigPath()
	if err != nil {
		return err
	}
	cfg, err := uploader.Load(path)
	if err != nil {
		return err
	}
	if !cfg.Paired() {
		return errors.New("this agent is not paired")
	}
	cfg.DeviceToken = ""
	if err := uploader.Save(path, cfg); err != nil {
		return err
	}
	fmt.Println("Unpaired. Withdraw the device in SynexTax too.")
	return nil
}
