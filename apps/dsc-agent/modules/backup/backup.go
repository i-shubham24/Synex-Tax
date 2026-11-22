// Package backup copies a client's accounting data (Tally, Busy or Marg) into dated zip files on
// the CA's own machine, with a SHA-256 manifest so a restore can be checked. For Zoho Books and
// Vyapar, whose own software writes the backup file, it finds the newest such file (files.go).
// Uploading to SynexTax is done by the uploader package, on the firm's schedule.
//
// Only folders of the known products are backed up, never a path chosen by the browser, so the
// agent cannot be used to read arbitrary files. Files the accounting software holds open are
// reported, not skipped silently: the CA closes the company (or the program) and runs it again.
package backup

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Product is an accounting package whose data folder can be backed up.
type Product string

const (
	Tally Product = "tally"
	Busy  Product = "busy"
	Marg  Product = "marg"
)

// DefaultFolders are the data folders each product installs to by default on Windows.
var DefaultFolders = map[Product][]string{
	Tally: {`C:\Users\Public\TallyPrime\Data`, `C:\Program Files\TallyPrime\Data`, `C:\TallyPrime\Data`, `C:\Tally.ERP9\Data`, `C:\Program Files\Tally.ERP9\Data`},
	Busy:  {`C:\BusyWin\DATA`, `D:\BusyWin\DATA`},
	Marg:  {`C:\Marg\Data`, `C:\MARGERP\Data`, `D:\Marg\Data`},
}

var (
	ErrUnknownProduct = errors.New("backup: unknown product")
	ErrNoFolder       = errors.New("backup: no data folder found for this product")
	ErrNotAllowed     = errors.New("backup: folder is not one of the product's data folders")
)

// Config says where data is read from and where backups are kept.
type Config struct {
	// Folders overrides DefaultFolders (for a non-default install, set by the CA in the agent's config file).
	Folders map[Product][]string
	// Destination is the folder backups are written under; one sub-folder per product.
	Destination string
	// Keep is how many backups to keep per product; older ones are removed. Zero keeps all.
	Keep int
}

// Manifest is written inside each zip as manifest.json.
type Manifest struct {
	Product   Product     `json:"product"`
	Source    string      `json:"source"`
	CreatedAt string      `json:"createdAt"`
	Files     []FileEntry `json:"files"`
	Skipped   []Skipped   `json:"skipped"`
}

type FileEntry struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type Skipped struct {
	Path   string `json:"path"`
	Reason string `json:"reason"`
}

// Result is what a run reports back to the browser.
type Result struct {
	Product  Product   `json:"product"`
	Source   string    `json:"source"`
	Archive  string    `json:"archive"`
	Files    int       `json:"files"`
	Bytes    int64     `json:"bytes"`
	Skipped  []Skipped `json:"skipped"`
	Removed  []string  `json:"removed"`
	Complete bool      `json:"complete"`
}

func (c Config) folders(p Product) ([]string, error) {
	if c.Folders != nil && len(c.Folders[p]) > 0 {
		return c.Folders[p], nil
	}
	f, ok := DefaultFolders[p]
	if !ok {
		return nil, ErrUnknownProduct
	}
	return f, nil
}

// Detect returns the product data folders that exist on this machine.
func (c Config) Detect() map[Product][]string {
	out := map[Product][]string{}
	for _, p := range AllProducts {
		list, _ := c.folders(p)
		for _, f := range list {
			if st, err := os.Stat(f); err == nil && st.IsDir() {
				out[p] = append(out[p], f)
			}
		}
	}
	return out
}

// Run backs up one product's data folder. `source` must be one of its folders, or empty for the first that exists.
func (c Config) Run(p Product, source string, now time.Time) (Result, error) {
	if IsFileProduct(p) {
		return Result{}, ErrFileProduct
	}
	list, err := c.folders(p)
	if err != nil {
		return Result{}, err
	}
	if source == "" {
		found := c.Detect()[p]
		if len(found) == 0 {
			return Result{}, ErrNoFolder
		}
		source = found[0]
	} else if !contains(list, source) {
		return Result{}, ErrNotAllowed
	}
	if c.Destination == "" {
		return Result{}, errors.New("backup: no destination folder configured")
	}
	outDir := filepath.Join(c.Destination, string(p))
	if err := os.MkdirAll(outDir, 0o700); err != nil {
		return Result{}, fmt.Errorf("backup: cannot create %s: %w", outDir, err)
	}
	stamp := now.Format("20060102-150405")
	archive := filepath.Join(outDir, fmt.Sprintf("%s-%s.zip", p, stamp))
	tmp := archive + ".part"

	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return Result{}, fmt.Errorf("backup: cannot create archive: %w", err)
	}
	zw := zip.NewWriter(f)
	man := Manifest{Product: p, Source: source, CreatedAt: now.UTC().Format(time.RFC3339)}
	var total int64

	walkErr := filepath.WalkDir(source, func(path string, d fs.DirEntry, err error) error {
		rel, _ := filepath.Rel(source, path)
		if err != nil {
			man.Skipped = append(man.Skipped, Skipped{Path: rel, Reason: err.Error()})
			if d != nil && d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.IsDir() || d.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		entry, n, cerr := addFile(zw, path, filepath.ToSlash(rel))
		if cerr != nil {
			man.Skipped = append(man.Skipped, Skipped{Path: rel, Reason: describe(cerr)})
			return nil
		}
		man.Files = append(man.Files, entry)
		total += n
		return nil
	})
	if walkErr == nil {
		mw, err := zw.Create("manifest.json")
		if err == nil {
			enc := json.NewEncoder(mw)
			enc.SetIndent("", "  ")
			walkErr = enc.Encode(man)
		} else {
			walkErr = err
		}
	}
	closeErr := zw.Close()
	fileErr := f.Close()
	if err := errors.Join(walkErr, closeErr, fileErr); err != nil {
		os.Remove(tmp)
		return Result{}, fmt.Errorf("backup: %w", err)
	}
	if err := os.Rename(tmp, archive); err != nil {
		os.Remove(tmp)
		return Result{}, fmt.Errorf("backup: %w", err)
	}
	removed := c.prune(outDir, p)
	return Result{Product: p, Source: source, Archive: archive, Files: len(man.Files), Bytes: total, Skipped: man.Skipped, Removed: removed, Complete: len(man.Skipped) == 0}, nil
}

func addFile(zw *zip.Writer, path, name string) (FileEntry, int64, error) {
	src, err := os.Open(path)
	if err != nil {
		return FileEntry{}, 0, err
	}
	defer src.Close()
	st, err := src.Stat()
	if err != nil {
		return FileEntry{}, 0, err
	}
	hdr, err := zip.FileInfoHeader(st)
	if err != nil {
		return FileEntry{}, 0, err
	}
	hdr.Name = name
	hdr.Method = zip.Deflate
	w, err := zw.CreateHeader(hdr)
	if err != nil {
		return FileEntry{}, 0, err
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(w, h), src)
	if err != nil {
		return FileEntry{}, 0, err
	}
	return FileEntry{Path: name, Size: n, SHA256: hex.EncodeToString(h.Sum(nil))}, n, nil
}

func describe(err error) string {
	msg := err.Error()
	if strings.Contains(strings.ToLower(msg), "being used by another process") || strings.Contains(strings.ToLower(msg), "sharing violation") {
		return "in use by the accounting software; close the company and run the backup again"
	}
	return msg
}

// List returns the backups kept for a product, newest first.
func (c Config) List(p Product) ([]string, error) {
	if _, ok := DefaultFolders[p]; !ok {
		return nil, ErrUnknownProduct
	}
	matches, err := filepath.Glob(filepath.Join(c.Destination, string(p), fmt.Sprintf("%s-*.zip", p)))
	if err != nil {
		return nil, err
	}
	sort.Sort(sort.Reverse(sort.StringSlice(matches)))
	return matches, nil
}

func (c Config) prune(dir string, p Product) []string {
	if c.Keep <= 0 {
		return nil
	}
	list, err := c.List(p)
	if err != nil || len(list) <= c.Keep {
		return nil
	}
	var removed []string
	for _, old := range list[c.Keep:] {
		if os.Remove(old) == nil {
			removed = append(removed, old)
		}
	}
	return removed
}

// Verify re-reads an archive and checks every file against its manifest.
func Verify(archive string) (Manifest, error) {
	zr, err := zip.OpenReader(archive)
	if err != nil {
		return Manifest{}, err
	}
	defer zr.Close()
	var man Manifest
	sums := map[string]string{}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			return Manifest{}, err
		}
		if f.Name == "manifest.json" {
			err = json.NewDecoder(rc).Decode(&man)
		} else {
			h := sha256.New()
			_, err = io.Copy(h, rc)
			sums[f.Name] = hex.EncodeToString(h.Sum(nil))
		}
		rc.Close()
		if err != nil {
			return Manifest{}, err
		}
	}
	for _, e := range man.Files {
		if sums[e.Path] != e.SHA256 {
			return man, fmt.Errorf("backup: %s does not match its manifest", e.Path)
		}
	}
	return man, nil
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if strings.EqualFold(filepath.Clean(x), filepath.Clean(v)) {
			return true
		}
	}
	return false
}
