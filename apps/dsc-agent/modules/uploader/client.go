package uploader

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

// Client talks to /api/v1/backups/agent with the device token.
type Client struct {
	Server  string
	Token   string
	Version string
	HTTP    *http.Client

	mu     sync.Mutex
	csrf   string
	csrfAt time.Time
}

// HTTPError is a non-2xx answer from the server or from storage.
type HTTPError struct {
	Status  int
	Message string
	Body    map[string]any
}

func (e *HTTPError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("server answered %d: %s", e.Status, e.Message)
	}
	return fmt.Sprintf("server answered %d", e.Status)
}

// Retryable is true for network errors, 5xx, 429 and 409 (an upload out of step): worth trying again.
func Retryable(err error) bool {
	var h *HTTPError
	if errors.As(err, &h) {
		return h.Status >= 500 || h.Status == 429 || h.Status == 409
	}
	return err != nil && !errors.Is(err, context.Canceled)
}

func (c *Client) client() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return http.DefaultClient
}

// csrfToken: the API wants a CSRF token on every state-changing request without a signed-in
// session. One bound to no cookie comes from /api/v1/auth/csrf and is reused for an hour.
func (c *Client) csrfToken(ctx context.Context, fresh bool) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !fresh && c.csrf != "" && time.Since(c.csrfAt) < time.Hour {
		return c.csrf, nil
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.Server+"/api/v1/auth/csrf", nil)
	res, err := c.client().Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	var b struct {
		CsrfToken string `json:"csrfToken"`
	}
	if res.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&b) != nil || b.CsrfToken == "" {
		return "", &HTTPError{Status: res.StatusCode, Message: "no CSRF token"}
	}
	c.csrf, c.csrfAt = b.CsrfToken, time.Now()
	return c.csrf, nil
}

// do sends one request; body is JSON (any value) or raw bytes ([]byte). out receives the JSON answer.
func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	for attempt := 0; attempt < 2; attempt++ {
		var rd io.Reader
		ctype := ""
		switch b := body.(type) {
		case nil:
		case []byte:
			rd, ctype = bytes.NewReader(b), "application/octet-stream"
		default:
			j, err := json.Marshal(b)
			if err != nil {
				return err
			}
			rd, ctype = bytes.NewReader(j), "application/json"
		}
		req, err := http.NewRequestWithContext(ctx, method, c.Server+path, rd)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Device "+c.Token)
		req.Header.Set("X-Agent-Version", c.Version)
		if ctype != "" {
			req.Header.Set("Content-Type", ctype)
		}
		if method != http.MethodGet {
			tok, err := c.csrfToken(ctx, attempt > 0)
			if err != nil {
				return err
			}
			req.Header.Set("X-Csrf-Token", tok)
		}
		res, err := c.client().Do(req)
		if err != nil {
			return err
		}
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		res.Body.Close()
		if res.StatusCode == http.StatusForbidden && attempt == 0 && method != http.MethodGet {
			continue // the CSRF token may have expired: fetch a new one, once
		}
		if res.StatusCode < 200 || res.StatusCode > 299 {
			e := &HTTPError{Status: res.StatusCode}
			if json.Unmarshal(raw, &e.Body) == nil {
				e.Message, _ = e.Body["message"].(string)
			}
			return e
		}
		if out != nil {
			return json.Unmarshal(raw, out)
		}
		return nil
	}
	return &HTTPError{Status: http.StatusForbidden, Message: "refused"}
}

// Rule is one backup the firm set for this device.
type Rule struct {
	ID           string `json:"id"`
	Product      string `json:"product"`
	Label        string `json:"label"`
	SourceFolder string `json:"sourceFolder"`
	DailyTime    string `json:"dailyTime"`
}

// RemoteConfig is what GET /agent/config answers.
type RemoteConfig struct {
	Timezone   string `json:"timezone"`
	ChunkBytes int64  `json:"chunkBytes"`
	MaxBytes   int64  `json:"maxBytes"`
	Rules      []Rule `json:"rules"`
}

// Config fetches this device's rules.
func (c *Client) Config(ctx context.Context) (RemoteConfig, error) {
	var rc RemoteConfig
	err := c.do(ctx, http.MethodGet, "/api/v1/backups/agent/config", nil, &rc)
	return rc, err
}

type startReq struct {
	RuleID        string `json:"ruleId"`
	FileName      string `json:"fileName"`
	SizeBytes     int64  `json:"sizeBytes"`
	SHA256        string `json:"sha256"`
	ContentSHA256 string `json:"contentSha256"`
}

type startRes struct {
	Unchanged  bool              `json:"unchanged"`
	UploadID   string            `json:"uploadId"`
	Mode       string            `json:"mode"`
	URL        string            `json:"url"`
	Headers    map[string]string `json:"headers"`
	ChunkBytes int64             `json:"chunkBytes"`
	Received   int64             `json:"received"`
}

func (c *Client) start(ctx context.Context, r startReq) (startRes, error) {
	var out startRes
	err := c.do(ctx, http.MethodPost, "/api/v1/backups/agent/uploads", r, &out)
	return out, err
}

func (c *Client) chunk(ctx context.Context, id string, offset int64, data []byte) (int64, error) {
	var out struct {
		Received int64 `json:"received"`
	}
	err := c.do(ctx, http.MethodPut, "/api/v1/backups/agent/uploads/"+id+"/chunk?offset="+strconv.FormatInt(offset, 10), data, &out)
	return out.Received, err
}

func (c *Client) complete(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodPost, "/api/v1/backups/agent/uploads/"+id+"/complete", map[string]string{}, nil)
}

// Report tells the server a rule's backup failed, so the firm sees why.
func (c *Client) Report(ctx context.Context, ruleID, message string) error {
	if len(message) > 300 {
		message = message[:300]
	}
	return c.do(ctx, http.MethodPost, "/api/v1/backups/agent/report", map[string]string{"ruleId": ruleID, "message": message}, nil)
}

// putS3 sends the whole file to a presigned S3 URL with exactly the headers the server signed.
func (c *Client) putS3(ctx context.Context, url string, headers map[string]string, path string, size int64) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, f)
	if err != nil {
		return err
	}
	req.ContentLength = size
	for k, v := range headers {
		if k == "content-length" {
			continue // set through ContentLength
		}
		req.Header.Set(k, v)
	}
	res, err := c.client().Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	io.Copy(io.Discard, io.LimitReader(res.Body, 1<<16))
	// 412: the object is already there from an earlier attempt; completion checks its size.
	if res.StatusCode == http.StatusPreconditionFailed {
		return nil
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return &HTTPError{Status: res.StatusCode, Message: "storage refused the upload"}
	}
	return nil
}
