package tallysync

import (
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Plugin interface defined for modular agent plugins.
type Plugin interface {
	Name() string
	Enabled() bool
	Status() map[string]interface{}
}

// TallySyncPlugin defines the Phase 2 TallyPrime/Busy XML-over-HTTP port 9000 sync contract.
type TallySyncPlugin struct {
	Endpoint string
	enabled  bool
	client   *http.Client
}

func NewTallySyncPlugin(endpoint string) *TallySyncPlugin {
	if endpoint == "" {
		endpoint = "http://127.0.0.1:9000"
	}
	return &TallySyncPlugin{
		Endpoint: endpoint,
		enabled:  false, // Disabled by default until CA activates Phase 2 license
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (p *TallySyncPlugin) Name() string {
	return "tally-sync"
}

func (p *TallySyncPlugin) Enabled() bool {
	return p.enabled
}

func (p *TallySyncPlugin) SetEnabled(enabled bool) {
	p.enabled = enabled
}

func (p *TallySyncPlugin) Status() map[string]interface{} {
	return map[string]interface{}{
		"plugin":   p.Name(),
		"enabled":  p.Enabled(),
		"endpoint": p.Endpoint,
		"phase":    "Phase 2 Modular Slot",
	}
}

// CheckOpenCompanyEnvelope represents Tally XML company enquiry.
type CheckCompanyResponse struct {
	XMLName   xml.Name `xml:"ENVELOPE"`
	Company   string   `xml:"BODY>DATA>TALLYMESSAGE>COMPANY>NAME"`
	GSTIN     string   `xml:"BODY>DATA>TALLYMESSAGE>COMPANY>GSTIN"`
	LineError string   `xml:"BODY>DATA>LINEERROR"`
}

// VerifyActiveCompany queries Tally on localhost:9000 to verify open company GSTIN.
func (p *TallySyncPlugin) VerifyActiveCompany(expectedGstin string) (bool, string, error) {
	if !p.enabled {
		return false, "", errors.New("tally-sync: plugin disabled in Phase 1")
	}

	reqXml := `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>CompanyInfo</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`

	resp, err := p.client.Post(p.Endpoint, "application/xml", bytes.NewBufferString(reqXml))
	if err != nil {
		return false, "", fmt.Errorf("tally connection failed on %s: %w", p.Endpoint, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, "", err
	}

	var parsed CheckCompanyResponse
	if err := xml.Unmarshal(body, &parsed); err != nil {
		return false, "", fmt.Errorf("xml unmarshal error: %w", err)
	}

	if parsed.LineError != "" {
		return false, "", fmt.Errorf("tally line error: %s", parsed.LineError)
	}

	if parsed.GSTIN != expectedGstin {
		return false, parsed.Company, fmt.Errorf("gstin mismatch: tally open company has %s, expected %s", parsed.GSTIN, expectedGstin)
	}

	return true, parsed.Company, nil
}
