package backup

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Products whose own software writes the backup file. The agent does not zip anything for these;
// it picks the newest backup file in the product's usual folders and uploads it unchanged.
const (
	// Zoho Books is online. Settings > Data Management > Backup Data emails a download link, and
	// the browser saves the backup (a .zip of CSV or XLS files) to the Downloads folder. Downloads
	// also holds unrelated files, so only .zip files with "zoho" in the name are taken there; any
	// .zip in the drop folder %USERPROFILE%\SynexTax Agent\Zoho Books is taken.
	Zoho Product = "zoho"
	// Vyapar desktop writes backups as .vyb files (Backup and Restore > Backup to computer), saved
	// where the user chooses: usually Downloads or Documents. Vyapar keeps its own data under
	// %APPDATA%\vyaparApp, which some versions also use for automatic backups. Only .vyb files are taken.
	Vyapar Product = "vyapar"
)

// AllProducts lists every product the agent can back up.
var AllProducts = []Product{Tally, Busy, Marg, Zoho, Vyapar}

var ErrFileProduct = errors.New("backup: this product writes its own backup file; the agent uploads the newest one")
var ErrNoBackupFile = errors.New("backup: no backup file found for this product")

type filePattern struct {
	ext       string
	nameRE    *regexp.Regexp // nil: any name with the extension
	recursive bool
}

type fileFolder struct {
	path    string
	pattern filePattern
}

var zohoAny = filePattern{ext: ".zip"}
var zohoNamed = filePattern{ext: ".zip", nameRE: regexp.MustCompile(`(?i)zoho`)}
var vyaparFiles = filePattern{ext: ".vyb"}
var vyaparDeep = filePattern{ext: ".vyb", recursive: true}

func init() {
	DefaultFolders[Zoho] = folderPaths(defaultFileFolders(Zoho))
	DefaultFolders[Vyapar] = folderPaths(defaultFileFolders(Vyapar))
}

func folderPaths(list []fileFolder) []string {
	out := make([]string, 0, len(list))
	for _, f := range list {
		out = append(out, f.path)
	}
	return out
}

func defaultFileFolders(p Product) []fileFolder {
	home, _ := os.UserHomeDir()
	if home == "" {
		home = "."
	}
	switch p {
	case Zoho:
		return []fileFolder{
			{filepath.Join(home, "SynexTax Agent", "Zoho Books"), zohoAny},
			{filepath.Join(home, "Downloads"), zohoNamed},
		}
	case Vyapar:
		out := []fileFolder{
			{filepath.Join(home, "SynexTax Agent", "Vyapar"), vyaparFiles},
			{filepath.Join(home, "Downloads"), vyaparFiles},
			{filepath.Join(home, "Documents"), vyaparFiles},
		}
		if appData := os.Getenv("APPDATA"); appData != "" {
			out = append(out, fileFolder{filepath.Join(appData, "vyaparApp"), vyaparDeep})
		}
		return out
	}
	return nil
}

// IsFileProduct is true for products whose own software writes the backup file.
func IsFileProduct(p Product) bool { return p == Zoho || p == Vyapar }

// patternFor is the file pattern for a folder: the default folder's own, or for a folder the CA
// set in the agent's config file, the product's extension with any name.
func patternFor(p Product, folder string) filePattern {
	for _, f := range defaultFileFolders(p) {
		if strings.EqualFold(filepath.Clean(f.path), filepath.Clean(folder)) {
			return f.pattern
		}
	}
	if p == Vyapar {
		return vyaparFiles
	}
	return zohoAny
}

// Newest returns the most recently changed backup file of a file product. source, when set, must
// be one of the product's folders. Files changed in the last 30 seconds may still be being
// written and are passed over.
func (c Config) Newest(p Product, source string, now time.Time) (string, error) {
	if !IsFileProduct(p) {
		return "", ErrUnknownProduct
	}
	list, err := c.folders(p)
	if err != nil {
		return "", err
	}
	if source != "" {
		if !contains(list, source) {
			return "", ErrNotAllowed
		}
		list = []string{source}
	}
	type found struct {
		path string
		mod  time.Time
	}
	var all []found
	for _, folder := range list {
		pat := patternFor(p, folder)
		rootDepth := strings.Count(filepath.Clean(folder), string(filepath.Separator))
		filepath.WalkDir(folder, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				if path != folder && (!pat.recursive || strings.Count(path, string(filepath.Separator))-rootDepth > 3) {
					return fs.SkipDir
				}
				return nil
			}
			if !d.Type().IsRegular() || !strings.EqualFold(filepath.Ext(d.Name()), pat.ext) {
				return nil
			}
			if pat.nameRE != nil && !pat.nameRE.MatchString(d.Name()) {
				return nil
			}
			info, err := d.Info()
			if err != nil || now.Sub(info.ModTime()) < 30*time.Second {
				return nil
			}
			all = append(all, found{path, info.ModTime()})
			return nil
		})
	}
	if len(all) == 0 {
		return "", ErrNoBackupFile
	}
	sort.Slice(all, func(i, j int) bool { return all[i].mod.After(all[j].mod) })
	return all[0].path, nil
}

// FileSHA256 is the SHA-256 of a file, in hex.
func FileSHA256(path string) (string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

// ContentHash identifies the data in a backup regardless of when it was made. For an archive this
// agent wrote, it is the SHA-256 over the manifest's file list (path and SHA-256 of each file), so
// two backups of unchanged data match even though the zips differ in their timestamps. For a file
// product it is the file's own SHA-256.
func ContentHash(p Product, path string) (string, error) {
	if IsFileProduct(p) {
		sum, _, err := FileSHA256(path)
		return sum, err
	}
	man, err := Verify(path)
	if err != nil {
		return "", err
	}
	files := append([]FileEntry(nil), man.Files...)
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	h := sha256.New()
	for _, f := range files {
		io.WriteString(h, f.Path+"\x00"+f.SHA256+"\n")
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
