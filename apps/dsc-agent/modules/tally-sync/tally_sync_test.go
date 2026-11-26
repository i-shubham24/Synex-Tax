package tallysync

import (
	"testing"
)

func TestTallySyncPluginInterface(t *testing.T) {
	plugin := NewTallySyncPlugin("http://127.0.0.1:9000")
	if plugin.Name() != "tally-sync" {
		t.Fatalf("expected name 'tally-sync', got %s", plugin.Name())
	}
	if plugin.Enabled() {
		t.Fatalf("tally-sync plugin must be disabled by default in Phase 1")
	}

	st := plugin.Status()
	if st["phase"] != "Phase 2 Modular Slot" {
		t.Fatalf("expected phase descriptor, got %v", st["phase"])
	}
}
