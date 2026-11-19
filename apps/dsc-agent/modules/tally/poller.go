package tally

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

var (
	ErrTallyUnreachable = errors.New("tally: unable to connect to TallyPrime on port 9000")
	ErrTallyBusy        = errors.New("tally: single-threaded concurrency guard active, another sync in progress")
)

type TallyPoller struct {
	tallyUrl   string
	httpClient *http.Client
	mu         sync.Mutex
}

func NewTallyPoller(tallyUrl string) *TallyPoller {
	if tallyUrl == "" {
		tallyUrl = "http://127.0.0.1:9000"
	}
	return &TallyPoller{
		tallyUrl: tallyUrl,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

// ExecuteTdlRequest sends a raw TDL XML request to Tally with single-thread mutex protection
func (p *TallyPoller) ExecuteTdlRequest(ctx context.Context, xmlPayload []byte) ([]byte, error) {
	// Acquire lock: Tally XML server crashes under concurrent requests
	if !p.mu.TryLock() {
		return nil, ErrTallyBusy
	}
	defer p.mu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.tallyUrl, bytes.NewReader(xmlPayload))
	if err != nil {
		return nil, fmt.Errorf("tally: failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "text/xml;charset=utf-8")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTallyUnreachable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tally: non-200 response from server (code %d)", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}

// CheckHealth probes if TallyPrime is running and accepting XML on Port 9000
func (p *TallyPoller) CheckHealth(ctx context.Context) (bool, string) {
	pingEnvelope := []byte(`<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>Company</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></DESC></BODY></ENVELOPE>`)

	resp, err := p.ExecuteTdlRequest(ctx, pingEnvelope)
	if err != nil {
		return false, err.Error()
	}

	if bytes.Contains(resp, []byte("<COMPANY")) || bytes.Contains(resp, []byte("<ENVELOPE")) {
		return true, "CONNECTED"
	}

	return false, "UNEXPECTED_RESPONSE"
}
