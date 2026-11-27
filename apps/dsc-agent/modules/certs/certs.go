// Package certs checks TDS certificates (Form 130, 131, 133) produced by the TRACES PDF
// converter before they go to payees. SynexTax never creates these PDFs; it reads the ones
// TRACES produced, finds the PAN each belongs to from the file name, and checks that the PDF
// carries a digital signature.
//
// Only PDFs in the agent's certificates folder are read, never a path the browser chooses.
package certs

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var ErrNotInbox = errors.New("certs: folder is not inside the certificates folder")

var panRE = regexp.MustCompile(`[A-Z]{5}[0-9]{4}[A-Z]`)
var quarterRE = regexp.MustCompile(`(?i)\bQ([1-4])\b|_Q([1-4])[_.]`)

// Certificate is one PDF found in the folder.
type Certificate struct {
	File    string `json:"file"`
	Pan     string `json:"pan"`
	Quarter string `json:"quarter,omitempty"`
	Signed  bool   `json:"signed"`
	Size    int64  `json:"size"`
	Problem string `json:"problem,omitempty"`
}

// Scan lists the PDFs in sub (a folder inside root, or root itself when sub is empty).
func Scan(root, sub string) ([]Certificate, error) {
	dir := root
	if sub != "" {
		norm := strings.ReplaceAll(sub, `\`, `/`)
		clean := filepath.Clean(filepath.FromSlash(norm))
		if filepath.IsAbs(clean) || strings.HasPrefix(norm, "/") || hasWindowsDrivePrefix(sub) || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
			return nil, ErrNotInbox
		}
		dir = filepath.Join(root, clean)
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, err
	}
	var out []Certificate
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() || !strings.EqualFold(filepath.Ext(d.Name()), ".pdf") {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		c := Certificate{File: filepath.ToSlash(rel), Size: info.Size()}
		name := strings.ToUpper(d.Name())
		if pans := panRE.FindAllString(name, -1); len(pans) == 1 {
			c.Pan = pans[0]
		} else if len(pans) > 1 {
			c.Problem = "More than one PAN in the file name."
		} else {
			c.Problem = "No PAN in the file name."
		}
		if m := quarterRE.FindStringSubmatch(name); m != nil {
			c.Quarter = "Q" + m[1] + m[2]
		}
		if info.Size() > 20<<20 {
			c.Problem = "Larger than 20 MB; not checked."
		} else if body, err := os.ReadFile(p); err == nil {
			if !bytes.HasPrefix(body, []byte("%PDF-")) {
				c.Problem = "Not a PDF."
			} else {
				c.Signed = isSigned(body)
				if !c.Signed && c.Problem == "" {
					c.Problem = "Not digitally signed."
				}
			}
		}
		out = append(out, c)
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return out[i].File < out[j].File })
	return out, err
}

// isSigned looks for a PDF signature dictionary: a /Sig field with a /ByteRange and /Contents.
func isSigned(pdf []byte) bool {
	return bytes.Contains(pdf, []byte("/ByteRange")) && bytes.Contains(pdf, []byte("/Contents")) && (bytes.Contains(pdf, []byte("/Type /Sig")) || bytes.Contains(pdf, []byte("/Type/Sig")) || bytes.Contains(pdf, []byte("/FT /Sig")) || bytes.Contains(pdf, []byte("/FT/Sig")))
}

// MaxSendSize is the largest certificate the agent hands to the browser for sending (the
// server accepts up to 2 MB).
const MaxSendSize = 2 << 20

var (
	ErrNotPDF    = errors.New("certs: not a PDF")
	ErrNotSigned = errors.New("certs: the PDF carries no digital signature")
	ErrTooLarge  = errors.New("certs: larger than 2 MB")
	ErrNotAFile  = errors.New("certs: not a PDF file in the certificates folder")
)

func hasWindowsDrivePrefix(p string) bool {
	return len(p) >= 2 && ((p[0] >= 'a' && p[0] <= 'z') || (p[0] >= 'A' && p[0] <= 'Z')) && p[1] == ':'
}

// Read returns one PDF's bytes, unchanged, from inside root. rel is the path Scan reported. The
// file must be a signed PDF of at most 2 MB; links that lead outside root are refused.
func Read(root, rel string) ([]byte, error) {
	norm := strings.ReplaceAll(rel, `\`, `/`)
	clean := filepath.Clean(filepath.FromSlash(norm))
	if rel == "" || filepath.IsAbs(clean) || filepath.VolumeName(clean) != "" || hasWindowsDrivePrefix(rel) || strings.HasPrefix(norm, "/") || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return nil, ErrNotInbox
	}
	if !strings.EqualFold(filepath.Ext(clean), ".pdf") {
		return nil, ErrNotAFile
	}
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, ErrNotAFile
	}
	realPath, err := filepath.EvalSymlinks(filepath.Join(root, clean))
	if err != nil {
		return nil, ErrNotAFile
	}
	inside, err := filepath.Rel(realRoot, realPath)
	if err != nil || inside == ".." || strings.HasPrefix(inside, ".."+string(filepath.Separator)) || filepath.IsAbs(inside) {
		return nil, ErrNotInbox
	}
	info, err := os.Stat(realPath)
	if err != nil || !info.Mode().IsRegular() {
		return nil, ErrNotAFile
	}
	if info.Size() > MaxSendSize {
		return nil, ErrTooLarge
	}
	body, err := os.ReadFile(realPath)
	if err != nil {
		return nil, err
	}
	if len(body) > MaxSendSize {
		return nil, ErrTooLarge
	}
	if !bytes.HasPrefix(body, []byte("%PDF-")) {
		return nil, ErrNotPDF
	}
	if !isSigned(body) {
		return nil, ErrNotSigned
	}
	return body, nil
}
