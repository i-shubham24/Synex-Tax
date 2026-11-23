package backup

import "testing"

func TestBackupFileTypes(t *testing.T) {
	for _, name := range []string{"zoho-books-backup.zip", "Zoho_Invoices.CSV", "zoho data.xls", "zoho.xlsx"} {
		if !zohoNamed.accepts(name) {
			t.Fatalf("Zoho Books backup %q was not taken", name)
		}
	}
	if zohoNamed.accepts("zoho.exe") || vyaparFiles.accepts("company.zip") || !vyaparFiles.accepts("Company.VYB") {
		t.Fatal("file types")
	}
}
