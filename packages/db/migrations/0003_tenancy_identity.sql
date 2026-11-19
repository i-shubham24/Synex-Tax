-- =====================================================================
-- SynexTax | Migration 0003 | Identity + 4-tier tenancy
-- Target   : PostgreSQL 17 (AWS RDS Multi-AZ, ap-south-1)
--   firms (CA practice) -> client_groups (sister concerns) -> entities (PAN)
--     -> gst_registrations (GSTIN) & tan_registrations (TAN)
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- Firms
-- ---------------------------------------------------------------------
CREATE TABLE public.firms (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name                      varchar(200) NOT NULL,
  trade_name                      varchar(200),
  firm_kind                       varchar(24)  NOT NULL
                                  CHECK (firm_kind IN ('CA_FIRM','CA_PROPRIETOR','TAX_ADVOCATE','TAX_PRACTITIONER','SME_SELF_SERVICE')),
  icai_frn                        varchar(16),
  pan                             varchar(10)  CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  gstin                           varchar(15)  CHECK (gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  state_code                      char(2),
  plan_code                       varchar(32)  NOT NULL DEFAULT 'PILOT',
  enforce_segregation_of_duties   boolean      NOT NULL DEFAULT true,  -- maker != checker
  default_ui_language             ui_language  NOT NULL DEFAULT 'en',
  data_residency_region           varchar(16)  NOT NULL DEFAULT 'ap-south-1'
                                  CHECK (data_residency_region = 'ap-south-1'),
  status                          lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_at                      timestamptz  NOT NULL DEFAULT now(),
  updated_at                      timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- auth schema: global login identities
-- ---------------------------------------------------------------------
CREATE TABLE auth.identities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             varchar(254) NOT NULL,
  email_normalized  varchar(254) GENERATED ALWAYS AS (lower(email)) STORED,
  password_hash     text,                       -- argon2id PHC string; NULL for passkey-only
  mfa_required      boolean      NOT NULL DEFAULT true,
  failed_attempts   smallint     NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  status            lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_identities_email ON auth.identities (email_normalized);

CREATE TABLE auth.mfa_factors (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id             uuid NOT NULL REFERENCES auth.identities(id) ON DELETE CASCADE,
  kind                    varchar(16) NOT NULL CHECK (kind IN ('TOTP','PASSKEY','RECOVERY_CODE')),
  label                   varchar(64),
  totp_secret_ciphertext  bytea,                -- KMS envelope encrypted
  totp_last_used_step     bigint,               -- replay protection for the 30s window
  passkey_credential_id   bytea,
  passkey_public_key      bytea,
  passkey_sign_count      bigint,
  recovery_code_hash      bytea,
  confirmed_at            timestamptz,
  last_used_at            timestamptz,
  revoked_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'TOTP'          OR totp_secret_ciphertext IS NOT NULL),
  CHECK (kind <> 'PASSKEY'       OR (passkey_credential_id IS NOT NULL AND passkey_public_key IS NOT NULL)),
  CHECK (kind <> 'RECOVERY_CODE' OR recovery_code_hash IS NOT NULL)
);
CREATE INDEX ix_mfa_factors_identity ON auth.mfa_factors (identity_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- Users = firm memberships (role is per firm)
-- ---------------------------------------------------------------------
CREATE TABLE public.users (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                 uuid NOT NULL REFERENCES public.firms(id),
  identity_id             uuid NOT NULL REFERENCES auth.identities(id),
  display_name            varchar(120) NOT NULL,
  role                    user_role NOT NULL,
  designation             varchar(80),
  icai_membership_no      varchar(16),
  can_approve_delegated   boolean NOT NULL DEFAULT false,  -- MANAGER acting as checker
  status                  lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, identity_id),
  CHECK (can_approve_delegated = false OR role = 'MANAGER')
);

CREATE TABLE auth.sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id         uuid NOT NULL REFERENCES auth.identities(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES public.users(id),     -- selected firm membership
  refresh_token_hash  bytea NOT NULL UNIQUE,                 -- sha256 of opaque refresh token
  mfa_verified_at     timestamptz,
  ip_addr             inet,
  user_agent          varchar(512),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz,
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz,
  revoke_reason       varchar(64)
);
CREATE INDEX ix_sessions_identity_live ON auth.sessions (identity_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- Client master
-- ---------------------------------------------------------------------
CREATE TABLE public.client_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid NOT NULL REFERENCES public.firms(id),
  name        varchar(200) NOT NULL,
  code        varchar(32),
  notes       text,
  status      lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id)
);
CREATE UNIQUE INDEX ux_client_groups_name ON public.client_groups (firm_id, lower(name));

CREATE TABLE public.entities (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                   uuid NOT NULL REFERENCES public.firms(id),
  client_group_id           uuid NOT NULL,
  legal_name                varchar(200) NOT NULL,
  trade_name                varchar(200),
  pan                       varchar(10) NOT NULL CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  constitution              entity_constitution NOT NULL,
  is_company                boolean GENERATED ALWAYS AS (
                              constitution IN ('PRIVATE_LIMITED','PUBLIC_LIMITED','ONE_PERSON_COMPANY',
                                               'SECTION_8_COMPANY','FOREIGN_COMPANY')) STORED,
  cin                       varchar(21) CHECK (cin ~ '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'),
  llpin                     varchar(8)  CHECK (llpin ~ '^[A-Z]{3}-[0-9]{4}$'),
  date_of_incorporation     date,
  pan_aadhaar_link_status   varchar(12) NOT NULL DEFAULT 'UNKNOWN'
                            CHECK (pan_aadhaar_link_status IN ('LINKED','NOT_LINKED','EXEMPT','UNKNOWN')),
  pan_aadhaar_checked_at    timestamptz,
  onboarding_source         varchar(24) NOT NULL DEFAULT 'MANUAL'
                            CHECK (onboarding_source IN ('MANUAL','EXCEL_IMPORT','SMARTBIZ_IMPORT',
                                                         'COMPUTAX_IMPORT','TRACES_CONSO_IMPORT','CLEAR_IMPORT','API')),
  status                    lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, pan),
  FOREIGN KEY (firm_id, client_group_id) REFERENCES public.client_groups (firm_id, id)
);
CREATE INDEX ix_entities_group ON public.entities (firm_id, client_group_id);
CREATE INDEX ix_entities_name  ON public.entities (firm_id, lower(legal_name));

CREATE TABLE public.user_client_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id          uuid NOT NULL REFERENCES public.firms(id),
  user_id          uuid NOT NULL,
  client_group_id  uuid,
  entity_id        uuid,
  access_level     varchar(16) NOT NULL DEFAULT 'PREPARE'
                   CHECK (access_level IN ('VIEW','PREPARE','REVIEW','CLIENT_PORTAL')),
  assigned_by      uuid NOT NULL,
  assigned_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,
  revoked_by       uuid,
  FOREIGN KEY (firm_id, user_id)         REFERENCES public.users (firm_id, id),
  FOREIGN KEY (firm_id, client_group_id) REFERENCES public.client_groups (firm_id, id),
  FOREIGN KEY (firm_id, entity_id)       REFERENCES public.entities (firm_id, id),
  CHECK (num_nonnulls(client_group_id, entity_id) = 1)
);
CREATE UNIQUE INDEX ux_uca_live
  ON public.user_client_assignments (firm_id, user_id, COALESCE(entity_id, client_group_id))
  WHERE revoked_at IS NULL;
CREATE INDEX ix_uca_user ON public.user_client_assignments (user_id) WHERE revoked_at IS NULL;

CREATE TABLE public.entity_contacts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                  uuid NOT NULL REFERENCES public.firms(id),
  entity_id                uuid NOT NULL,
  full_name                varchar(150) NOT NULL,
  designation              varchar(80),
  email                    varchar(254),
  mobile_e164              varchar(16) CHECK (mobile_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  preferred_language       ui_language NOT NULL DEFAULT 'en',
  is_authorised_signatory  boolean NOT NULL DEFAULT false,
  signatory_pan            varchar(10) CHECK (signatory_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  is_primary               boolean NOT NULL DEFAULT false,
  status                   lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);
CREATE INDEX ix_entity_contacts_entity ON public.entity_contacts (firm_id, entity_id);

CREATE TABLE public.entity_bank_accounts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                     uuid NOT NULL REFERENCES public.firms(id),
  entity_id                   uuid NOT NULL,
  bank_name                   varchar(120),
  ifsc                        char(11) NOT NULL CHECK (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  account_number_ciphertext   bytea NOT NULL,
  account_number_last4        char(4) NOT NULL CHECK (account_number_last4 ~ '^[0-9A-Z]{4}$'),
  account_number_hmac         bytea NOT NULL,
  account_type                varchar(16) CHECK (account_type IN ('SAVINGS','CURRENT','CASH_CREDIT','OVERDRAFT','NRE','NRO','OTHER')),
  is_primary                  boolean NOT NULL DEFAULT false,
  status                      lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, entity_id, account_number_hmac),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);

-- ---------------------------------------------------------------------
-- GST registrations (GSTIN)
-- ---------------------------------------------------------------------
CREATE TABLE public.gst_registrations (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                         uuid NOT NULL REFERENCES public.firms(id),
  entity_id                       uuid NOT NULL,
  gstin                           varchar(15) NOT NULL CHECK (gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  state_code                      char(2) GENERATED ALWAYS AS (substr(gstin, 1, 2)) STORED,
  registration_type               gst_registration_type NOT NULL DEFAULT 'REGULAR',
  is_isd_registration             boolean GENERATED ALWAYS AS (registration_type = 'ISD') STORED,
  legal_name_on_portal            varchar(200),
  trade_name_on_portal            varchar(200),
  
  -- Return cadence with split Composition (10(1) vs 10(2A))
  filing_category                 varchar(24) NOT NULL DEFAULT 'REGULAR_MONTHLY'
                                  CHECK (filing_category IN ('REGULAR_MONTHLY','QRMP','COMPOSITION_10_1','COMPOSITION_10_2A','ISD','SPECIAL')),
  qrmp_effective_from             date,
  qrmp_payment_method             varchar(16) CHECK (qrmp_payment_method IN ('FIXED_SUM','SELF_ASSESSMENT')),
  
  -- E-Commerce Operator under Rule 14B & Rule 86B Exemption Flags
  is_rule_14b_eco                 boolean NOT NULL DEFAULT false,
  rule_86b_exempt                 boolean NOT NULL DEFAULT false,
  rule_86b_exempt_reason          varchar(64),

  portal_registration_status      varchar(24) NOT NULL DEFAULT 'UNKNOWN'
                                  CHECK (portal_registration_status IN ('ACTIVE','SUSPENDED','CANCELLED',
                                         'CANCELLATION_PENDING','PROVISIONAL','UNKNOWN')),
  portal_status_checked_at        timestamptz,
  einvoice_applicable             boolean NOT NULL DEFAULT false,
  einvoice_reporting_window_days  smallint CHECK (einvoice_reporting_window_days > 0),
  aato_band                       varchar(16),
  portal_username                 varchar(64),
  api_access_status               varchar(16) NOT NULL DEFAULT 'NOT_ENABLED'
                                  CHECK (api_access_status IN ('NOT_ENABLED','OTP_REQUIRED','ACTIVE','EXPIRED','REVOKED','ERROR')),
  gsp_provider_code               varchar(24),
  effective_from                  date,
  cancelled_on                    date,
  status                          lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_by                      uuid,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, gstin),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  CHECK ((registration_type = 'ISD') = (filing_category = 'ISD')),
  CHECK ((registration_type = 'COMPOSITION_10_1') = (filing_category = 'COMPOSITION_10_1')),
  CHECK ((registration_type = 'COMPOSITION_10_2A') = (filing_category = 'COMPOSITION_10_2A')),
  CHECK (filing_category <> 'QRMP' OR qrmp_effective_from IS NOT NULL)
);
CREATE INDEX ix_gst_registrations_entity ON public.gst_registrations (firm_id, entity_id);

CREATE VIEW public.v_isd_radar WITH (security_invoker = true) AS
SELECT e.firm_id, e.id AS entity_id, e.pan, e.legal_name,
       count(*) FILTER (WHERE g.registration_type <> 'ISD' AND g.status = 'ACTIVE') AS active_gstins,
       bool_or(g.registration_type = 'ISD' AND g.status = 'ACTIVE')                AS has_isd
FROM public.entities e
JOIN public.gst_registrations g ON g.firm_id = e.firm_id AND g.entity_id = e.id
GROUP BY e.firm_id, e.id, e.pan, e.legal_name
HAVING count(*) FILTER (WHERE g.registration_type <> 'ISD' AND g.status = 'ACTIVE') >= 2
   AND NOT bool_or(g.registration_type = 'ISD' AND g.status = 'ACTIVE');

CREATE FUNCTION app.check_gstin_matches_pan() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, audit AS $$
DECLARE v_pan varchar(10);
BEGIN
  IF NEW.registration_type IN ('REGULAR','COMPOSITION_10_1','COMPOSITION_10_2A','SEZ_UNIT','SEZ_DEVELOPER','ISD','CASUAL','TCS_COLLECTOR') THEN
    SELECT e.pan INTO v_pan FROM public.entities e WHERE e.firm_id = NEW.firm_id AND e.id = NEW.entity_id;
    IF v_pan IS NULL THEN
      RAISE EXCEPTION 'ENTITY_NOT_VISIBLE: entity % not found for GSTIN %', NEW.entity_id, NEW.gstin
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF substr(NEW.gstin, 3, 10) <> v_pan THEN
      RAISE EXCEPTION 'GSTIN_PAN_MISMATCH: GSTIN % does not embed entity PAN %', NEW.gstin, v_pan
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gstin_pan BEFORE INSERT OR UPDATE OF gstin, entity_id, registration_type
  ON public.gst_registrations FOR EACH ROW EXECUTE FUNCTION app.check_gstin_matches_pan();

-- ---------------------------------------------------------------------
-- TAN registrations
-- ---------------------------------------------------------------------
CREATE TABLE public.tan_registrations (
  id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                          uuid NOT NULL REFERENCES public.firms(id),
  entity_id                        uuid NOT NULL,
  tan                              varchar(10) NOT NULL CHECK (tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'),
  deductor_type_code               varchar(2) NOT NULL,
  branch_name                      varchar(120),
  responsible_person_name          varchar(120),
  responsible_person_designation   varchar(80),
  responsible_person_pan           varchar(10) CHECK (responsible_person_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  address                          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ain                              varchar(7),
  traces_registered                boolean NOT NULL DEFAULT false,
  traces_user_id                   varchar(32),
  status                           lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_by                       uuid,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, tan),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);
CREATE INDEX ix_tan_registrations_entity ON public.tan_registrations (firm_id, entity_id);

-- ---------------------------------------------------------------------
-- DSC inventory & registrations
-- ---------------------------------------------------------------------
CREATE TABLE public.dsc_inventory (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                 uuid NOT NULL REFERENCES public.firms(id),
  entity_id               uuid NOT NULL,
  contact_id              uuid,
  holder_name             varchar(150) NOT NULL,
  holder_pan              varchar(10) CHECK (holder_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  subject_dn              text NOT NULL,
  issuer_cn               varchar(256) NOT NULL,
  cert_serial_hex         varchar(64) NOT NULL,
  thumbprint_sha256       char(64) NOT NULL CHECK (thumbprint_sha256 ~ '^[0-9a-f]{64}$'),
  dsc_class               varchar(8) NOT NULL DEFAULT 'CLASS_3' CHECK (dsc_class IN ('CLASS_3','DGFT','OTHER')),
  key_usage               text[] NOT NULL DEFAULT ARRAY['SIGNING'],
  valid_from              timestamptz NOT NULL,
  valid_to                timestamptz NOT NULL,
  token_vendor            varchar(64),
  token_fips_profile      varchar(12) NOT NULL DEFAULT 'UNKNOWN'
                          CHECK (token_fips_profile IN ('FIPS_140_2','FIPS_140_3','UNKNOWN')),
  custody                 varchar(12) NOT NULL DEFAULT 'CLIENT' CHECK (custody IN ('CLIENT','FIRM_OFFICE')),
  custodian_user_id       uuid,
  last_seen_by_agent_at   timestamptz,
  status                  lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, thumbprint_sha256),
  CHECK (valid_to > valid_from),
  FOREIGN KEY (firm_id, entity_id)  REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, contact_id) REFERENCES public.entity_contacts (firm_id, id),
  FOREIGN KEY (firm_id, custodian_user_id) REFERENCES public.users (firm_id, id)
);
CREATE INDEX ix_dsc_expiry ON public.dsc_inventory (firm_id, valid_to) WHERE status = 'ACTIVE';

CREATE TABLE public.dsc_portal_registrations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id               uuid NOT NULL REFERENCES public.firms(id),
  entity_id             uuid NOT NULL,
  dsc_id                uuid NOT NULL,
  portal                varchar(12) NOT NULL CHECK (portal IN ('GST','TRACES','ITD_EFILING')),
  gst_registration_id   uuid,
  tan_registration_id   uuid,
  registered_on         date,
  verified_by           uuid,
  status                lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (firm_id, dsc_id)              REFERENCES public.dsc_inventory (firm_id, id),
  FOREIGN KEY (firm_id, entity_id)           REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id),
  FOREIGN KEY (firm_id, tan_registration_id) REFERENCES public.tan_registrations (firm_id, id),
  CHECK ((portal = 'GST'    AND gst_registration_id IS NOT NULL)
      OR (portal = 'TRACES' AND tan_registration_id IS NOT NULL)
      OR  portal = 'ITD_EFILING')
);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.firms                FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON auth.identities             FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.users                FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.client_groups        FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.entities             FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.entity_contacts      FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.entity_bank_accounts FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.gst_registrations    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.tan_registrations    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.dsc_inventory        FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.dsc_portal_registrations FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

RESET ROLE;
