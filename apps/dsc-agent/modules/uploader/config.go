// Package uploader sends the agent's accounting backups to SynexTax on the firm's schedule.
//
// The agent is paired with a device token that a partner or manager creates in SynexTax
// (Settings, Backups) and pastes into "synextax-agent pair". The token is kept in the agent's own
// config file in the user's profile (%APPDATA%\SynexTax Agent\config.json, readable by that user
// only), never in the registry. The server keeps only the token's SHA-256.
package uploader

import (
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/synextax/synextax/apps/dsc-agent/modules/backup"
)

// Config is the agent's config file.
type Config struct {
	// Server is the SynexTax address, for example https://app.synextax.com.
	Server string `json:"server"`
	// DeviceToken is the secret shown once when the device was added.
	DeviceToken string `json:"deviceToken"`
	// Folders overrides a product's data folders for a non-default install.
	Folders map[backup.Product][]string `json:"folders,omitempty"`
}

var tokenRE = regexp.MustCompile(`^sxd_[A-Za-z0-9_-]{43}$`)

var (
	ErrBadToken  = errors.New("uploader: that is not a SynexTax device token (it starts with sxd_)")
	ErrBadServer = errors.New("uploader: the server must be an https:// address (http only for localhost)")
	ErrNotPaired = errors.New("uploader: this agent is not paired with SynexTax")
)

// ConfigPath is %APPDATA%\SynexTax Agent\config.json (or the platform's user config folder).
func ConfigPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "SynexTax Agent", "config.json"), nil
}

// NormalizeServer checks and tidies the server address.
func NormalizeServer(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" {
		return "", ErrBadServer
	}
	host := u.Hostname()
	local := host == "localhost" || host == "127.0.0.1"
	if u.Scheme != "https" && !(u.Scheme == "http" && local) {
		return "", ErrBadServer
	}
	return u.Scheme + "://" + u.Host, nil
}

// ValidToken reports whether s looks like a device token.
func ValidToken(s string) bool { return tokenRE.MatchString(s) }

// Load reads the config file; a missing file is an empty config.
func Load(path string) (Config, error) {
	var c Config
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return c, nil
	}
	if err != nil {
		return c, err
	}
	err = json.Unmarshal(b, &c)
	return c, err
}

// Save writes the config file for the current user only, replacing it in one step.
func Save(path string, c Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Paired reports whether the config has a server and a token.
func (c Config) Paired() bool { return c.Server != "" && ValidToken(c.DeviceToken) }
