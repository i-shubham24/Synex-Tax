package backup

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func setup(t *testing.T) (Config, string) {
	t.Helper()
	root := t.TempDir()
	data := filepath.Join(root, "TallyData", "10001")
	if err := os.MkdirAll(data, 0o755); err != nil {
		t.Fatal(err)
	}
	for name, body := range map[string]string{"Company.900": "company master", "Tran.900": "vouchers", "LinkMgr.900": "links"} {
		if err := os.WriteFile(filepath.Join(data, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	cfg := Config{Folders: map[Product][]string{Tally: {filepath.Join(root, "TallyData")}}, Destination: filepath.Join(root, "Backups"), Keep: 2}
	return cfg, filepath.Join(root, "TallyData")
}

func TestRunWritesVerifiableArchive(t *testing.T) {
	cfg, src := setup(t)
	res, err := cfg.Run(Tally, "", time.Date(2026, 11, 21, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if res.Source != src || res.Files != 3 || !res.Complete {
		t.Fatalf("unexpected result %+v", res)
	}
	man, err := Verify(res.Archive)
	if err != nil {
		t.Fatal(err)
	}
	if len(man.Files) != 3 || man.Product != Tally {
		t.Fatalf("manifest %+v", man)
	}
}

func TestOnlyProductFoldersAreAllowed(t *testing.T) {
	cfg, _ := setup(t)
	_, err := cfg.Run(Tally, `C:\Windows\System32`, time.Now())
	if !errors.Is(err, ErrNotAllowed) {
		t.Fatalf("want ErrNotAllowed, got %v", err)
	}
	if _, err := cfg.Run("quickbooks", "", time.Now()); !errors.Is(err, ErrUnknownProduct) {
		t.Fatalf("want ErrUnknownProduct, got %v", err)
	}
}

func TestOldBackupsArePruned(t *testing.T) {
	cfg, _ := setup(t)
	base := time.Date(2026, 11, 21, 10, 0, 0, 0, time.UTC)
	for i := 0; i < 4; i++ {
		if _, err := cfg.Run(Tally, "", base.Add(time.Duration(i)*time.Minute)); err != nil {
			t.Fatal(err)
		}
	}
	list, err := cfg.List(Tally)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || filepath.Base(list[0]) != "tally-20261121-100300.zip" {
		t.Fatalf("kept %v", list)
	}
}

func TestTamperedArchiveFailsVerification(t *testing.T) {
	cfg, src := setup(t)
	res, err := cfg.Run(Tally, src, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	// Rewrite the archive with one file changed and the old manifest kept.
	man, _ := Verify(res.Archive)
	man.Files[0].SHA256 = "0000"
	if err := rewriteManifest(res.Archive, man); err != nil {
		t.Fatal(err)
	}
	if _, err := Verify(res.Archive); err == nil {
		t.Fatal("tampered archive passed verification")
	}
}

// rewriteManifest copies an archive with its manifest replaced.
func rewriteManifest(archive string, man Manifest) error {
	zr, err := zip.OpenReader(archive)
	if err != nil {
		return err
	}
	out := archive + ".new"
	f, err := os.Create(out)
	if err != nil {
		zr.Close()
		return err
	}
	zw := zip.NewWriter(f)
	for _, file := range zr.File {
		w, err := zw.Create(file.Name)
		if err != nil {
			return err
		}
		if file.Name == "manifest.json" {
			if err := json.NewEncoder(w).Encode(man); err != nil {
				return err
			}
			continue
		}
		rc, err := file.Open()
		if err != nil {
			return err
		}
		_, err = io.Copy(w, rc)
		rc.Close()
		if err != nil {
			return err
		}
	}
	zr.Close()
	if err := zw.Close(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(out, archive)
}
