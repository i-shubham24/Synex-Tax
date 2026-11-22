//go:build !windows

package dsc

import "time"

// List finds no signing certificates outside Windows.
func List(now time.Time) ([]Certificate, error) { return nil, nil }

// Sign is not available outside Windows.
func Sign(id string, digest []byte, now time.Time) (*SignResponse, error) { return nil, ErrUnsupported }
