package uploader

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/synextax/synextax/apps/dsc-agent/modules/backup"
)

// IST is India Standard Time. A fixed zone, so the agent needs no time zone database on Windows.
var IST = time.FixedZone("IST", 5*3600+1800)

// DefaultMaxBytes is the largest file the server accepts.
const DefaultMaxBytes = 500 << 20

var ErrTooLarge = errors.New("uploader: the backup is larger than 500 MB")

// RuleStatus is what the agent last did for a rule, for its local status page.
type RuleStatus struct {
	Label   string    `json:"label"`
	Product string    `json:"product"`
	LastRun time.Time `json:"lastRun"`
	Result  string    `json:"result"`
}

// Runner uploads the newest backup of each rule at start-up and daily at the rule's time.
type Runner struct {
	Client  *Client
	Backups backup.Config
	Logf    func(format string, args ...any)
	// Sleep waits between retries (replaced in tests).
	Sleep func(ctx context.Context, d time.Duration) error
	Now   func() time.Time
	// Attempts per upload and the first retry delay; each retry waits twice as long.
	Attempts  int
	BaseDelay time.Duration

	mu      sync.Mutex
	config  RemoteConfig
	lastRun map[string]time.Time
	status  map[string]RuleStatus
}

func (r *Runner) now() time.Time {
	if r.Now != nil {
		return r.Now()
	}
	return time.Now()
}

func (r *Runner) logf(format string, args ...any) {
	if r.Logf != nil {
		r.Logf(format, args...)
	}
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// retry runs fn until it succeeds, fails for good, or runs out of attempts, with exponential
// backoff and jitter between attempts.
func (r *Runner) retry(ctx context.Context, fn func() error) error {
	attempts, base := r.Attempts, r.BaseDelay
	if attempts <= 0 {
		attempts = 5
	}
	if base <= 0 {
		base = 30 * time.Second
	}
	sleep := r.Sleep
	if sleep == nil {
		sleep = sleepCtx
	}
	var err error
	for i := 0; i < attempts; i++ {
		if err = fn(); err == nil || !Retryable(err) {
			return err
		}
		if i == attempts-1 {
			break
		}
		d := base << i
		d += time.Duration(rand.Int63n(int64(d)/4 + 1))
		r.logf("upload failed (%v); trying again in %s", err, d.Round(time.Second))
		if serr := sleep(ctx, d); serr != nil {
			return serr
		}
	}
	return err
}

// Due reports whether a rule's daily slot (HH:MM, India time) has come since it last ran.
func Due(dailyTime string, now, last time.Time) bool {
	parts := strings.Split(dailyTime, ":")
	if len(parts) != 2 {
		return false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return false
	}
	n := now.In(IST)
	slot := time.Date(n.Year(), n.Month(), n.Day(), h, m, 0, 0, IST)
	return !n.Before(slot) && last.Before(slot)
}

// Prepare finds the file to upload for a rule: a fresh zip for Tally, Busy and Marg, the newest
// backup file for Zoho Books and Vyapar.
func (r *Runner) Prepare(rule Rule) (string, error) {
	p := backup.Product(rule.Product)
	if backup.IsFileProduct(p) {
		return r.Backups.Newest(p, rule.SourceFolder, r.now())
	}
	res, err := r.Backups.Run(p, rule.SourceFolder, r.now())
	if err != nil {
		return "", err
	}
	if !res.Complete {
		r.logf("%s: %d files were in use and left out; the rest is uploaded", rule.Label, len(res.Skipped))
	}
	return res.Archive, nil
}

// RunRule prepares and uploads one rule's backup. The result is "uploaded" or "unchanged".
func (r *Runner) RunRule(ctx context.Context, rule Rule) (string, error) {
	path, err := r.Prepare(rule)
	if err != nil {
		return "", err
	}
	sum, size, err := backup.FileSHA256(path)
	if err != nil {
		return "", err
	}
	max := r.config.MaxBytes
	if max <= 0 {
		max = DefaultMaxBytes
	}
	if size > max {
		return "", ErrTooLarge
	}
	content, err := backup.ContentHash(backup.Product(rule.Product), path)
	if err != nil {
		return "", err
	}
	result := ""
	err = r.retry(ctx, func() error {
		var e error
		result, e = r.upload(ctx, rule, path, size, sum, content)
		return e
	})
	return result, err
}

func (r *Runner) upload(ctx context.Context, rule Rule, path string, size int64, sum, content string) (string, error) {
	s, err := r.Client.start(ctx, startReq{RuleID: rule.ID, FileName: filepath.Base(path), SizeBytes: size, SHA256: sum, ContentSHA256: content})
	if err != nil {
		return "", err
	}
	if s.Unchanged {
		return "unchanged", nil
	}
	switch s.Mode {
	case "S3":
		if err := r.Client.putS3(ctx, s.URL, s.Headers, path, size); err != nil {
			return "", err
		}
	case "CHUNKED":
		if err := r.sendChunks(ctx, s, path, size); err != nil {
			return "", err
		}
	default:
		return "", fmt.Errorf("uploader: unknown upload mode %q", s.Mode)
	}
	if err := r.Client.complete(ctx, s.UploadID); err != nil {
		return "", err
	}
	return "uploaded", nil
}

// sendChunks continues from what the server already has, so an interrupted upload resumes.
func (r *Runner) sendChunks(ctx context.Context, s startRes, path string, size int64) error {
	chunk := s.ChunkBytes
	if chunk <= 0 || chunk > 4<<20 {
		chunk = 4 << 20
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	buf := make([]byte, chunk)
	offset := s.Received
	for offset < size {
		n, err := f.ReadAt(buf, offset)
		if err != nil && !errors.Is(err, io.EOF) {
			return err
		}
		if n == 0 {
			return io.ErrUnexpectedEOF
		}
		received, err := r.Client.chunk(ctx, s.UploadID, offset, buf[:n])
		var h *HTTPError
		if errors.As(err, &h) && h.Status == 409 {
			if v, ok := h.Body["received"].(float64); ok && int64(v) <= size {
				offset = int64(v) // the server has a different amount: carry on from there
				continue
			}
		}
		if err != nil {
			return err
		}
		offset = received
	}
	return nil
}

// Status is what the runner last did, per rule.
func (r *Runner) Status() map[string]RuleStatus {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[string]RuleStatus, len(r.status))
	for k, v := range r.status {
		out[k] = v
	}
	return out
}

func (r *Runner) runAndRecord(ctx context.Context, rule Rule) {
	start := r.now()
	result, err := r.RunRule(ctx, rule)
	if err != nil {
		result = "failed: " + err.Error()
		if rerr := r.Client.Report(ctx, rule.ID, err.Error()); rerr != nil {
			r.logf("%s: could not report the failure: %v", rule.Label, rerr)
		}
	}
	r.logf("%s (%s): %s", rule.Label, rule.Product, result)
	r.mu.Lock()
	if r.lastRun == nil {
		r.lastRun, r.status = map[string]time.Time{}, map[string]RuleStatus{}
	}
	r.lastRun[rule.ID] = start
	r.status[rule.ID] = RuleStatus{Label: rule.Label, Product: rule.Product, LastRun: start, Result: result}
	r.mu.Unlock()
}

func (r *Runner) refresh(ctx context.Context) error {
	return r.retry(ctx, func() error {
		cfg, err := r.Client.Config(ctx)
		if err != nil {
			return err
		}
		r.mu.Lock()
		r.config = cfg
		r.mu.Unlock()
		return nil
	})
}

// Tick runs every rule whose daily slot has come since it last ran.
func (r *Runner) Tick(ctx context.Context) {
	r.mu.Lock()
	rules := append([]Rule(nil), r.config.Rules...)
	r.mu.Unlock()
	for _, rule := range rules {
		r.mu.Lock()
		last := r.lastRun[rule.ID]
		r.mu.Unlock()
		if Due(rule.DailyTime, r.now(), last) {
			r.runAndRecord(ctx, rule)
		}
	}
}

// Loop uploads every rule's backup at start-up, then each day at its time, until ctx ends.
// Rules are fetched again every 30 minutes, so changes made in SynexTax reach the agent.
func (r *Runner) Loop(ctx context.Context) {
	if err := r.refresh(ctx); err != nil {
		r.logf("could not fetch the backup rules: %v", err)
	}
	r.mu.Lock()
	rules := append([]Rule(nil), r.config.Rules...)
	r.mu.Unlock()
	for _, rule := range rules {
		r.runAndRecord(ctx, rule)
	}
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	lastRefresh := r.now()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
		if r.now().Sub(lastRefresh) >= 30*time.Minute {
			if err := r.refresh(ctx); err != nil {
				r.logf("could not fetch the backup rules: %v", err)
			}
			lastRefresh = r.now()
		}
		r.Tick(ctx)
	}
}
