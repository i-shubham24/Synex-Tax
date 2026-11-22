package certs

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestReadReturnsSignedPdfInsideTheFolderOnly(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "Certificates")
	os.MkdirAll(filepath.Join(root, "Q2"), 0o700)
	signed := []byte("%PDF-1.7\n1 0 obj << /Type /Sig /ByteRange [0 1 2 3] /Contents <00> >> endobj\n%%EOF")
	os.WriteFile(filepath.Join(root, "Q2", "ABCPK1234L_Q2.pdf"), signed, 0o600)
	os.WriteFile(filepath.Join(root, "Q2", "BQRPS4410K_Q2.pdf"), []byte("%PDF-1.7 plain"), 0o600)
	os.WriteFile(filepath.Join(root, "Q2", "fake.pdf"), []byte("MZ not a pdf"), 0o600)
	os.WriteFile(filepath.Join(root, "Q2", "big.pdf"), append(append([]byte{}, signed...), make([]byte, MaxSendSize)...), 0o600)
	os.WriteFile(filepath.Join(base, "outside.pdf"), signed, 0o600)

	got, err := Read(root, "Q2/ABCPK1234L_Q2.pdf")
	if err != nil || !bytes.Equal(got, signed) {
		t.Fatalf("signed certificate: %v", err)
	}
	cases := map[string]error{
		"Q2/BQRPS4410K_Q2.pdf":             ErrNotSigned,
		"Q2/fake.pdf":                      ErrNotPDF,
		"Q2/big.pdf":                       ErrTooLarge,
		"../outside.pdf":                   ErrNotInbox,
		"Q2/../../outside.pdf":             ErrNotInbox,
		filepath.Join(base, "outside.pdf"): ErrNotInbox,
		"Q2/missing.pdf":                   ErrNotAFile,
		"Q2/notes.txt":                     ErrNotAFile,
		"":                                 ErrNotInbox,
	}
	for rel, want := range cases {
		if _, err := Read(root, rel); !errors.Is(err, want) {
			t.Errorf("Read(%q) = %v, want %v", rel, err, want)
		}
	}
}
