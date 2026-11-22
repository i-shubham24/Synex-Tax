package uploader

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/synextax/synextax/apps/dsc-agent/modules/backup"
)

const testToken = "sxd_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

// fakeServer follows the API's chunked protocol: start, chunks at the exact offset, complete.
type fakeServer struct {
	mu        sync.Mutex
	received  []byte
	completed int
	failNext  int // answer 503 to this many chunk requests
	lastSum   string
	lastHash  string
	reports   []string
}

func (f *fakeServer) handler(t *testing.T) http.Handler {
	mux := http.NewServeMux()
	auth := func(w http.ResponseWriter, r *http.Request) bool {
		if r.Header.Get("Authorization") != "Device "+testToken {
			w.WriteHeader(401)
			return false
		}
		if r.Method != http.MethodGet && r.Header.Get("X-Csrf-Token") != "csrf-1" {
			w.WriteHeader(403)
			return false
		}
		return true
	}
	mux.HandleFunc("/api/v1/auth/csrf", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"csrfToken": "csrf-1"})
	})
	mux.HandleFunc("/api/v1/backups/agent/config", func(w http.ResponseWriter, r *http.Request) {
		if !auth(w, r) {
			return
		}
		json.NewEncoder(w).Encode(RemoteConfig{ChunkBytes: 8, MaxBytes: 1 << 20, Rules: []Rule{{ID: "r1", Product: "vyapar", Label: "Shop", DailyTime: "20:00"}}})
	})
	mux.HandleFunc("/api/v1/backups/agent/uploads", func(w http.ResponseWriter, r *http.Request) {
		if !auth(w, r) {
			return
		}
		var s startReq
		json.NewDecoder(r.Body).Decode(&s)
		f.mu.Lock()
		defer f.mu.Unlock()
		if s.ContentSHA256 == f.lastHash {
			json.NewEncoder(w).Encode(map[string]any{"unchanged": true})
			return
		}
		f.lastSum, f.received = s.SHA256, nil
		json.NewEncoder(w).Encode(map[string]any{"uploadId": "u1", "mode": "CHUNKED", "chunkBytes": 8, "received": 0})
	})
	mux.HandleFunc("/api/v1/backups/agent/uploads/u1/chunk", func(w http.ResponseWriter, r *http.Request) {
		if !auth(w, r) {
			return
		}
		f.mu.Lock()
		defer f.mu.Unlock()
		if f.failNext > 0 {
			f.failNext--
			w.WriteHeader(503)
			return
		}
		off, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		if off != len(f.received) {
			w.WriteHeader(409)
			json.NewEncoder(w).Encode(map[string]any{"received": len(f.received)})
			return
		}
		b, _ := io.ReadAll(r.Body)
		f.received = append(f.received, b...)
		json.NewEncoder(w).Encode(map[string]any{"received": len(f.received)})
	})
	mux.HandleFunc("/api/v1/backups/agent/uploads/u1/complete", func(w http.ResponseWriter, r *http.Request) {
		if !auth(w, r) {
			return
		}
		f.mu.Lock()
		defer f.mu.Unlock()
		sum, _, _ := backupSum(f.received)
		if sum != f.lastSum {
			w.WriteHeader(422)
			return
		}
		f.completed++
		f.lastHash = sum
		json.NewEncoder(w).Encode(map[string]any{"status": "COMPLETE"})
	})
	mux.HandleFunc("/api/v1/backups/agent/report", func(w http.ResponseWriter, r *http.Request) {
		if !auth(w, r) {
			return
		}
		var b map[string]string
		json.NewDecoder(r.Body).Decode(&b)
		f.mu.Lock()
		f.reports = append(f.reports, b["message"])
		f.mu.Unlock()
	})
	return mux
}

func backupSum(b []byte) (string, int64, error) {
	dir, _ := os.MkdirTemp("", "sum")
	defer os.RemoveAll(dir)
	p := filepath.Join(dir, "x")
	os.WriteFile(p, b, 0o600)
	return backup.FileSHA256(p)
}

func TestUploadInChunksRetriesAndSkipsUnchanged(t *testing.T) {
	dir := t.TempDir()
	body := []byte("vyapar backup data that spans several chunks")
	file := filepath.Join(dir, "Shop_2026.vyb")
	os.WriteFile(file, body, 0o600)
	old := time.Now().Add(-time.Hour)
	os.Chtimes(file, old, old)

	f := &fakeServer{failNext: 2}
	srv := httptest.NewServer(f.handler(t))
	defer srv.Close()

	var slept []time.Duration
	r := &Runner{
		Client:    &Client{Server: srv.URL, Token: testToken, Version: "test"},
		Backups:   backup.Config{Folders: map[backup.Product][]string{backup.Vyapar: {dir}}},
		Sleep:     func(_ context.Context, d time.Duration) error { slept = append(slept, d); return nil },
		BaseDelay: time.Second,
	}
	ctx := context.Background()
	if err := r.refresh(ctx); err != nil {
		t.Fatal(err)
	}
	rule := r.config.Rules[0]
	res, err := r.RunRule(ctx, rule)
	if err != nil || res != "uploaded" {
		t.Fatalf("first run: %q %v", res, err)
	}
	if !bytes.Equal(f.received, body) || f.completed != 1 {
		t.Fatalf("server got %q (completed %d)", f.received, f.completed)
	}
	if len(slept) != 2 || slept[1] < 2*time.Second {
		t.Errorf("want two backoff waits, doubling; got %v", slept)
	}
	res, err = r.RunRule(ctx, rule)
	if err != nil || res != "unchanged" {
		t.Fatalf("second run: %q %v", res, err)
	}
	if f.completed != 1 {
		t.Errorf("unchanged file was uploaded again")
	}
}

func TestResumeFromServerOffset(t *testing.T) {
	dir := t.TempDir()
	body := []byte("0123456789abcdefghij")
	file := filepath.Join(dir, "b.vyb")
	os.WriteFile(file, body, 0o600)
	f := &fakeServer{}
	srv := httptest.NewServer(f.handler(t))
	defer srv.Close()
	f.received = append([]byte(nil), body[:8]...) // an earlier attempt sent the first chunk
	r := &Runner{Client: &Client{Server: srv.URL, Token: testToken}}
	// The start answer says 0 received; the server's 409 moves the agent to its real offset.
	if err := r.sendChunks(context.Background(), startRes{UploadID: "u1", ChunkBytes: 8, Received: 0}, file, int64(len(body))); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(f.received, body) {
		t.Fatalf("got %q", f.received)
	}
}

func TestFailureIsReported(t *testing.T) {
	f := &fakeServer{}
	srv := httptest.NewServer(f.handler(t))
	defer srv.Close()
	r := &Runner{Client: &Client{Server: srv.URL, Token: testToken}, Backups: backup.Config{Folders: map[backup.Product][]string{backup.Vyapar: {t.TempDir()}}}}
	r.runAndRecord(context.Background(), Rule{ID: "r1", Product: "vyapar", Label: "Shop"})
	if len(f.reports) != 1 || !strings.Contains(f.reports[0], "no backup file") {
		t.Fatalf("reports: %v", f.reports)
	}
	if st := r.Status()["r1"]; !strings.HasPrefix(st.Result, "failed") {
		t.Errorf("status %+v", st)
	}
}

func TestDue(t *testing.T) {
	at := func(s string) time.Time { v, _ := time.ParseInLocation("2006-01-02 15:04", s, IST); return v }
	if !Due("20:00", at("2026-11-22 20:05"), at("2026-11-22 08:00")) {
		t.Error("slot passed since last run: due")
	}
	if Due("20:00", at("2026-11-22 19:59"), at("2026-11-21 20:01")) {
		t.Error("before today's slot: not due")
	}
	if Due("20:00", at("2026-11-22 21:00"), at("2026-11-22 20:01")) {
		t.Error("already ran after the slot: not due")
	}
	if Due("25:00", at("2026-11-22 21:00"), time.Time{}) {
		t.Error("bad time: never due")
	}
}

func TestConfigFile(t *testing.T) {
	p := filepath.Join(t.TempDir(), "SynexTax Agent", "config.json")
	if c, err := Load(p); err != nil || c.Paired() {
		t.Fatalf("missing file: %+v %v", c, err)
	}
	if err := Save(p, Config{Server: "https://app.synextax.com", DeviceToken: testToken}); err != nil {
		t.Fatal(err)
	}
	c, err := Load(p)
	if err != nil || !c.Paired() {
		t.Fatalf("saved config: %+v %v", c, err)
	}
	for raw, ok := range map[string]bool{"https://app.synextax.com/": true, "http://localhost:4000": true, "http://app.synextax.com": false, "https://u:p@x.com": false, "https://x.com/path": false} {
		if _, err := NormalizeServer(raw); (err == nil) != ok {
			t.Errorf("NormalizeServer(%q) = %v", raw, err)
		}
	}
	if ValidToken("sxd_short") {
		t.Error("short token accepted")
	}
}
