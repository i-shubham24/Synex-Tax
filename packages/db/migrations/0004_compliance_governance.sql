-- =====================================================================
-- SynexTax | Migration 0004 | Compliance Feature Flags & Governance
-- Target   : PostgreSQL 17 (AWS RDS Multi-AZ, ap-south-1)
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- Compliance Feature Flags
-- ---------------------------------------------------------------------
CREATE TABLE public.compliance_feature_flags (
  flag_key            varchar(64) PRIMARY KEY,
  enabled             boolean NOT NULL DEFAULT false,
  description         text NOT NULL,
  advisory_ref        varchar(64),
  statutory_body      varchar(16) NOT NULL CHECK (statutory_body IN ('GSTN', 'CBIC', 'CBDT', 'NIC', 'CCA', 'DPDP')),
  effective_from      date,
  enforcement_date    date,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Seed November 2026 statutory baseline flags
INSERT INTO public.compliance_feature_flags 
  (flag_key, enabled, description, advisory_ref, statutory_body, effective_from, enforcement_date, metadata)
VALUES
  (
    'EWB_ADVISORY_664_ENHANCEMENTS',
    false,
    'Mandatory Ship-to GSTIN validation and voluntary e-Way Bill closure. Placed in abeyance by Advisory 668 on July 29, 2026.',
    'GSTN_ADV_668',
    'GSTN',
    '2026-08-01',
    NULL,
    '{"status": "IN_ABEYANCE", "requires_ship_to_gstin": false, "allow_voluntary_closure": false}'::jsonb
  ),
  (
    'EWB_14DIGIT_JAN_2027',
    true,
    'Acceptance of 14-digit EWB and 11-digit CEWB alongside legacy 12/10-digit formats per Advisory 687.',
    'GSTN_ADV_687',
    'NIC',
    '2026-12-15',
    '2027-01-01',
    '{"voluntary_start": "2026-12-15", "mandatory_start": "2027-01-01", "ewb_len": [12, 14], "cewb_len": [10, 11]}'::jsonb
  ),
  (
    'RCM_EINVOICING_RCMDOM_RCMIMP',
    true,
    'Reverse Charge Mechanism self-invoice reporting on IRP (RCMDOM for domestic, RCMIMP for import services) per Advisory 688.',
    'GSTN_ADV_688',
    'NIC',
    '2026-12-15',
    '2027-01-01',
    '{"voluntary_start": "2026-12-15", "mandatory_start": "2027-01-01"}'::jsonb
  ),
  (
    'GSTR3B_TABLE_3_1_3_2_HARD_LOCK',
    true,
    'Hard locking of outward supply liability in Tables 3.1 & 3.2 of GSTR-3B auto-populated from GSTR-1/IFF.',
    'GSTN_3B_AUTOLOCK',
    'GSTN',
    '2024-11-01',
    '2024-11-01',
    '{"allow_override": false, "correction_path": "GSTR-1A"}'::jsonb
  ),
  (
    'GSTR3B_TABLE_4A_ITC_LOCK_PREPAREDNESS',
    false,
    'Preparedness flag for future GSTN locking of Table 4A eligible ITC auto-populated from GSTR-2B.',
    'GSTN_PLANNED_4A_LOCK',
    'GSTN',
    NULL,
    NULL,
    '{"allow_manual_reversal": true}'::jsonb
  ),
  (
    'POST_SALE_DISCOUNT_NO_PRIOR_AGREEMENT',
    true,
    'Notification 03/2026-CT: Section 15(3)(b) post-supply discounts without prior written agreement or 1:1 invoice link.',
    'NOTIF_03_2026_CT',
    'CBIC',
    '2026-11-01',
    '2026-11-01',
    '{"original_invoice_optional_from": "2026-11-01", "requires_ims_reversal": true}'::jsonb
  ),
  (
    'FIPS_140_3_MANDATE_CCA',
    true,
    'CCA mandate: new DSC issuance strictly on FIPS 140-3 Level 3 tokens from 21-Sep-2026; grandfathered 140-2 tokens valid till expiry.',
    'CCA_DIR_2026_FIPS3',
    'CCA',
    '2026-09-21',
    '2026-09-21',
    '{"enforce_for_new_issuance": true, "allow_fips_140_2_unexpired": true}'::jsonb
  ),
  (
    'DPDP_ACT_2023_ENFORCEMENT',
    false,
    'Digital Personal Data Protection Act, 2023 and Rules 2025 enforcement target May 13, 2027.',
    'DPDP_GSR_846E',
    'DPDP',
    '2026-11-13',
    '2027-05-13',
    '{"consent_languages": ["en", "pa", "hi"], "retention_lock_years": 8}'::jsonb
  );

-- ---------------------------------------------------------------------
-- Live Government Portal Health Status
-- ---------------------------------------------------------------------
CREATE TABLE public.portal_health_status (
  portal              varchar(16) PRIMARY KEY CHECK (portal IN ('GSTN', 'NIC_IRP', 'TRACES', 'ITD_EFILING')),
  status              varchar(16) NOT NULL DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'DEGRADED', 'OUTAGE', 'MAINTENANCE')),
  latency_ms          integer,
  last_checked_at     timestamptz NOT NULL DEFAULT now(),
  status_message      text,
  incident_history    jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.portal_health_status (portal, status, latency_ms, status_message) VALUES
  ('GSTN', 'ONLINE', 142, 'Core returns & IMS API operational'),
  ('NIC_IRP', 'ONLINE', 85, 'NIC-IRP 1 & 2 cluster healthy'),
  ('TRACES', 'ONLINE', 310, 'TRACES processing normal'),
  ('ITD_EFILING', 'ONLINE', 190, 'Income-tax portal operational');

-- ---------------------------------------------------------------------
-- DPDP Consent Records
-- ---------------------------------------------------------------------
CREATE TABLE public.dpdp_consent_records (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                         uuid NOT NULL REFERENCES public.firms(id),
  entity_id                       uuid NOT NULL,
  contact_id                      uuid,
  purpose_code                    varchar(32) NOT NULL CHECK (purpose_code IN (
                                    'TAX_FILING',
                                    'CLIENT_COMMUNICATION',
                                    'RECONCILIATION',
                                    'BANK_VERIFICATION',
                                    'WHATSAPP_ALERTS',
                                    'AI_ASSISTANCE'
                                  )),
  language                        ui_language NOT NULL DEFAULT 'en',
  consent_version                 varchar(16) NOT NULL DEFAULT '1.0',
  consent_manager_id              varchar(64),
  external_consent_artifact_id    varchar(128),
  consent_channel                 varchar(16) NOT NULL DEFAULT 'WEB'
                                  CHECK (consent_channel IN ('WEB', 'WHATSAPP', 'SMS', 'OFFLINE')),
  consent_text_hash               bytea NOT NULL,
  ip_address                      inet,
  user_agent                      varchar(512),
  granted_at                      timestamptz NOT NULL DEFAULT now(),
  withdrawn_at                    timestamptz,
  withdrawal_reason               text,
  valid_until                     timestamptz NOT NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, contact_id) REFERENCES public.entity_contacts (firm_id, id)
);
CREATE INDEX ix_dpdp_entity ON public.dpdp_consent_records (firm_id, entity_id) WHERE withdrawn_at IS NULL;

-- ---------------------------------------------------------------------
-- Statutory Legal Hold Vault
-- ---------------------------------------------------------------------
CREATE TABLE public.statutory_legal_holds (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id             uuid NOT NULL REFERENCES public.firms(id),
  entity_id           uuid NOT NULL,
  governing_act       varchar(24) NOT NULL CHECK (governing_act IN ('MCA_2013', 'CGST_2017', 'IT_ACT_1961', 'IT_ACT_2025')),
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  retention_deadline  date NOT NULL,
  hold_reason         text NOT NULL,
  is_under_litigation boolean NOT NULL DEFAULT false,
  status              lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  CHECK (period_end >= period_start),
  CHECK (retention_deadline >= period_end)
);
CREATE INDEX ix_legal_hold_entity ON public.statutory_legal_holds (firm_id, entity_id, retention_deadline);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.compliance_feature_flags FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.portal_health_status     FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.dpdp_consent_records     FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.statutory_legal_holds    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

RESET ROLE;
