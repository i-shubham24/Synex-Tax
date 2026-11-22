// Package fvu prepares a statement for Protean's File Validation Utility on the CA's machine,
// opens the FVU the CA downloaded from Protean, and reads back what it produced.
//
// The FVU is Protean's own Java program with its own window; SynexTax does not drive it or
// change it. The agent saves the statement (and CSI file) into a fresh working folder, starts the
// FVU, and afterwards reports: a .fvu file means the statement passed; an error report is
// returned as plain text so the CA can fix the rows in SynexTax.
package fvu

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	ErrNoJar        = errors.New("fvu: no FVU jar configured; download the FVU from Protean and set its path in the agent")
	ErrBadName      = errors.New("fvu: file name must be letters, digits, underscore or dash, ending in .txt")
	ErrNotWorkspace = errors.New("fvu: folder is not one the agent prepared")
)

// Config says where the FVU jar is and where working folders go.
type Config struct {
	JarPath string // e.g. C:\Protean\FVU\TDS_STANDALONE_FVU_1.2.jar
	Java    string // java executable; "java" uses PATH
	Root    string // working folders are created under this
}

var nameRE = regexp.MustCompile(`^[A-Za-z0-9_-]{1,60}\.txt$`)

// Prepare writes the statement (and optional CSI file) into a new folder and returns its path.
func (c Config) Prepare(fileName string, statement []byte, csi []byte, now time.Time) (string, error) {
	if !nameRE.MatchString(fileName) {
		return "", ErrBadName
	}
	if len(statement) == 0 {
		return "", errors.New("fvu: statement is empty")
	}
	dir := filepath.Join(c.Root, now.Format("20060102-150405")+"-"+strings.TrimSuffix(fileName, ".txt"))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(dir, fileName), statement, 0o600); err != nil {
		return "", err
	}
	if len(csi) > 0 {
		if err := os.WriteFile(filepath.Join(dir, strings.TrimSuffix(fileName, ".txt")+".csi"), csi, 0o600); err != nil {
			return "", err
		}
	}
	return dir, nil
}

// Launch starts the FVU in the given working folder. It does not wait for it to close.
func (c Config) Launch(dir string) error {
	if c.JarPath == "" {
		return ErrNoJar
	}
	if !strings.EqualFold(filepath.Ext(c.JarPath), ".jar") || !strings.Contains(strings.ToUpper(filepath.Base(c.JarPath)), "FVU") {
		return fmt.Errorf("fvu: %s does not look like Protean's FVU jar", filepath.Base(c.JarPath))
	}
	if _, err := os.Stat(c.JarPath); err != nil {
		return fmt.Errorf("fvu: %w", err)
	}
	if err := c.inRoot(dir); err != nil {
		return err
	}
	java := c.Java
	if java == "" {
		java = "java"
	}
	cmd := exec.Command(java, "-jar", c.JarPath)
	cmd.Dir = dir
	return cmd.Start()
}

// Result is what the FVU left in a working folder.
type Result struct {
	Folder    string   `json:"folder"`
	Validated bool     `json:"validated"`
	FvuFile   string   `json:"fvuFile,omitempty"`
	Errors    string   `json:"errors,omitempty"`
	Files     []string `json:"files"`
}

var tagRE = regexp.MustCompile(`(?s)<[^>]*>`)
var spaceRE = regexp.MustCompile(`[ \t]+`)

// Read lists what is in a working folder: a .fvu file means the statement passed; an error file
// (err.html, *.err or *_err*.html) is returned as text with HTML tags removed.
func (c Config) Read(dir string) (Result, error) {
	if err := c.inRoot(dir); err != nil {
		return Result{}, err
	}
	res := Result{Folder: dir}
	var errFiles []string
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		name := d.Name()
		res.Files = append(res.Files, name)
		lower := strings.ToLower(name)
		switch {
		case strings.HasSuffix(lower, ".fvu"):
			res.Validated = true
			res.FvuFile = name
		case strings.HasSuffix(lower, ".err") || (strings.HasSuffix(lower, ".html") && strings.Contains(lower, "err")):
			errFiles = append(errFiles, p)
		}
		return nil
	})
	if err != nil {
		return res, err
	}
	sort.Strings(res.Files)
	var b strings.Builder
	for _, p := range errFiles {
		raw, err := os.ReadFile(p)
		if err != nil || len(raw) > 5<<20 {
			continue
		}
		text := tagRE.ReplaceAllString(string(raw), " ")
		for _, line := range strings.Split(text, "\n") {
			line = strings.TrimSpace(spaceRE.ReplaceAllString(line, " "))
			if line != "" {
				b.WriteString(line)
				b.WriteString("\n")
			}
		}
	}
	res.Errors = strings.TrimSpace(b.String())
	return res, nil
}

func (c Config) inRoot(dir string) error {
	root, err := filepath.Abs(c.Root)
	if err != nil {
		return err
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(root, abs)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") || strings.ContainsAny(rel, `/\`) {
		return ErrNotWorkspace
	}
	return nil
}
