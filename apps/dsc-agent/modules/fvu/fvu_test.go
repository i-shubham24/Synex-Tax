package fvu

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPrepareWritesStatementAndCsi(t *testing.T) {
	c := Config{Root: t.TempDir()}
	dir, err := c.Prepare("AMRG04217D_140_Q3_202627.txt", []byte("1^FH^NS1^R^...\r\n"), []byte("csi"), time.Date(2026, 11, 21, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "AMRG04217D_140_Q3_202627.txt")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "AMRG04217D_140_Q3_202627.csi")); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Prepare("../escape.txt", []byte("x"), nil, time.Now()); !errors.Is(err, ErrBadName) {
		t.Fatalf("want ErrBadName, got %v", err)
	}
}

func TestReadReportsValidationAndErrors(t *testing.T) {
	c := Config{Root: t.TempDir()}
	ok, _ := c.Prepare("A.txt", []byte("x"), nil, time.Date(2026, 11, 21, 10, 0, 0, 0, time.UTC))
	os.WriteFile(filepath.Join(ok, "A.fvu"), []byte("fvu"), 0o600)
	r, err := c.Read(ok)
	if err != nil || !r.Validated || r.FvuFile != "A.fvu" {
		t.Fatalf("validated folder read as %+v, %v", r, err)
	}
	bad, _ := c.Prepare("B.txt", []byte("x"), nil, time.Date(2026, 11, 21, 10, 1, 0, 0, time.UTC))
	os.WriteFile(filepath.Join(bad, "B_err.html"), []byte("<html><table><tr><td>Line 4</td><td>T-FV-3077 Invalid PAN</td></tr></table></html>"), 0o600)
	r, err = c.Read(bad)
	if err != nil || r.Validated || !strings.Contains(r.Errors, "T-FV-3077 Invalid PAN") || strings.Contains(r.Errors, "<td>") {
		t.Fatalf("error folder read as %+v, %v", r, err)
	}
}

func TestOnlyPreparedFoldersAndRealJars(t *testing.T) {
	c := Config{Root: t.TempDir()}
	if _, err := c.Read(`C:\Windows`); !errors.Is(err, ErrNotWorkspace) {
		t.Fatalf("want ErrNotWorkspace, got %v", err)
	}
	if err := c.Launch(c.Root); !errors.Is(err, ErrNoJar) {
		t.Fatalf("want ErrNoJar, got %v", err)
	}
	c.JarPath = filepath.Join(c.Root, "notepad.exe")
	if err := c.Launch(c.Root); err == nil || !strings.Contains(err.Error(), "does not look like") {
		t.Fatalf("want refusal of a non-FVU program, got %v", err)
	}
}
