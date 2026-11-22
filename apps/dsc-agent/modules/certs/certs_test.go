package certs

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestScanFindsPanSignatureAndProblems(t *testing.T) {
	root := t.TempDir()
	q2 := filepath.Join(root, "Q2 2026-27")
	os.MkdirAll(q2, 0o700)
	signed := "%PDF-1.7\n1 0 obj << /Type /Sig /Filter /Adobe.PPKLite /ByteRange [0 100 200 300] /Contents <00> >> endobj\n%%EOF"
	plain := "%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n%%EOF"
	os.WriteFile(filepath.Join(q2, "ABCPK1234L_Q2_2026-27.pdf"), []byte(signed), 0o600)
	os.WriteFile(filepath.Join(q2, "BQRPS4410K_Q2_2026-27.pdf"), []byte(plain), 0o600)
	os.WriteFile(filepath.Join(q2, "certificate.pdf"), []byte(signed), 0o600)
	os.WriteFile(filepath.Join(q2, "notes.txt"), []byte("x"), 0o600)

	list, err := Scan(root, "Q2 2026-27")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 3 {
		t.Fatalf("want 3 PDFs, got %d", len(list))
	}
	got := map[string]Certificate{}
	for _, c := range list {
		got[filepath.Base(c.File)] = c
	}
	if c := got["ABCPK1234L_Q2_2026-27.pdf"]; c.Pan != "ABCPK1234L" || !c.Signed || c.Quarter != "Q2" || c.Problem != "" {
		t.Errorf("signed certificate read as %+v", c)
	}
	if c := got["BQRPS4410K_Q2_2026-27.pdf"]; c.Signed || c.Problem != "Not digitally signed." {
		t.Errorf("unsigned certificate read as %+v", c)
	}
	if c := got["certificate.pdf"]; c.Problem != "No PAN in the file name." {
		t.Errorf("unnamed certificate read as %+v", c)
	}
}

func TestScanStaysInsideTheFolder(t *testing.T) {
	root := t.TempDir()
	for _, sub := range []string{"..", `..\..\Windows`, `C:\Windows`} {
		if _, err := Scan(root, sub); !errors.Is(err, ErrNotInbox) {
			t.Errorf("%q: want ErrNotInbox, got %v", sub, err)
		}
	}
}
