-- =====================================================================
-- SynexTax | Migration 0005 | Statutory Immutable Audit & Signing Logs
-- Target   : PostgreSQL 17 (AWS RDS Multi-AZ, ap-south-1)
-- Conformance: MCA Rule 3(1), CGST Rule 56(15), CERT-In (365-day log)
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 1. Audit Tables (in audit schema)
-- ---------------------------------------------------------------------
CREATE TABLE audit.immutable_audit_logs (
  id              bigserial PRIMARY KEY,
  firm_id         uuid NOT NULL,
  table_schema    varchar(32) NOT NULL DEFAULT 'public',
  table_name      varchar(64) NOT NULL,
  record_id       uuid NOT NULL,
  action          varchar(8) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data        jsonb,
  new_data        jsonb,
  diff            jsonb,
  actor_id        uuid,
  actor_kind      public.actor_kind NOT NULL DEFAULT 'USER',
  ip_addr         inet,
  user_agent      varchar(512),
  request_id      text,
  timestamp_ist   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_audit_logs_firm_table ON audit.immutable_audit_logs (firm_id, table_name, record_id);
CREATE INDEX ix_audit_logs_actor ON audit.immutable_audit_logs (actor_id, timestamp_ist);
CREATE INDEX ix_audit_logs_created ON audit.immutable_audit_logs (created_at);

-- Digital Signing Event Trail (GST RETFILE, TRACES 130/131, PAdES, Aadhaar eSign)
CREATE TABLE audit.signing_audit_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           uuid NOT NULL,
  entity_id         uuid NOT NULL,
  dsc_id            uuid,
  cert_serial_hex   varchar(64) NOT NULL,
  holder_pan        varchar(10),
  holder_name       varchar(150),
  operation         varchar(32) NOT NULL CHECK (operation IN (
                      'GST_RETFILE_PKCS7',
                      'TRACES_BATCH_PADES',
                      'FORM_130_131_PADES',
                      'EVC_VERIFICATION',
                      'IRP_EINVOICE_SIGN',
                      'AADHAAR_ESIGN'
                    )),
  payload_hash      char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  signature_nonce   uuid NOT NULL,
  token_profile     varchar(16) NOT NULL DEFAULT 'FIPS_140_3' CHECK (token_profile IN ('FIPS_140_2','FIPS_140_3','EVC','AADHAAR')),
  ip_addr           inet,
  client_user_agent varchar(512),
  status            varchar(16) NOT NULL CHECK (status IN ('SUCCESS','FAILED','REJECTED')),
  error_code        varchar(32),
  error_message     text,
  signed_at         timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_signing_logs_firm_entity ON audit.signing_audit_logs (firm_id, entity_id, signed_at);
CREATE INDEX ix_signing_logs_cert ON audit.signing_audit_logs (cert_serial_hex);

-- PII Reveal / Access Log (DPDP Act 2023 & Section 138 Income-tax Act)
CREATE TABLE audit.pii_access_logs (
  id                bigserial PRIMARY KEY,
  firm_id           uuid NOT NULL,
  entity_id         uuid,
  user_id           uuid NOT NULL,
  target_table      varchar(64) NOT NULL,
  target_column     varchar(64) NOT NULL,
  record_id         uuid NOT NULL,
  access_reason     text NOT NULL,
  ip_addr           inet,
  request_id        text,
  accessed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_pii_logs_firm_user ON audit.pii_access_logs (firm_id, user_id, accessed_at);

-- ---------------------------------------------------------------------
-- 2. Hard Immutability Guard Triggers (UPDATE, DELETE & TRUNCATE)
-- Strictly prevents UPDATE, DELETE and TRUNCATE operations on audit tables.
-- ---------------------------------------------------------------------
CREATE FUNCTION audit.prevent_audit_tampering() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, audit AS $$
BEGIN
  RAISE EXCEPTION 'STATUTORY_AUDIT_IMMUTABLE: Modifications, deletions, and truncations are strictly prohibited on statutory audit records under MCA Section 128 / Rule 3 and CGST Section 36 / Rule 56(15).'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_no_update_delete_audit_logs
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit.immutable_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit.prevent_audit_tampering();

CREATE TRIGGER trg_no_update_delete_signing_logs
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit.signing_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit.prevent_audit_tampering();

CREATE TRIGGER trg_no_update_delete_pii_logs
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit.pii_access_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit.prevent_audit_tampering();

-- ---------------------------------------------------------------------
-- 3. Audit Capture Function (Invoked by Row Triggers on Core Tables)
-- CERT-In & VAPT compliant: pinned search_path, safe jsonb extraction,
-- ciphertext and hash stripping to prevent credential leaks into audit logs.
-- ---------------------------------------------------------------------
CREATE FUNCTION app.capture_audit_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, audit AS $$
DECLARE
  v_firm_id   uuid;
  v_user_id   uuid;
  v_actor     public.actor_kind;
  v_ip        inet;
  v_req_id    text;
  v_ua        text;
  v_rec_id    uuid;
  v_old       jsonb;
  v_new       jsonb;
  v_diff      jsonb;
BEGIN
  v_firm_id := app.ctx_firm_id();
  v_user_id := app.ctx_user_id();
  v_actor   := COALESCE(app.ctx_actor_kind()::public.actor_kind, 'USER'::public.actor_kind);
  v_ip      := app.ctx_ip();
  v_req_id  := app.ctx_request_id();
  v_ua      := app.ctx_user_agent();

  IF TG_OP = 'DELETE' THEN
    v_rec_id := OLD.id;
    v_old := to_jsonb(OLD);
    -- Safe jsonb extraction for firm_id fallback
    IF v_firm_id IS NULL AND (v_old ? 'firm_id') THEN
      v_firm_id := NULLIF(v_old ->> 'firm_id', '')::uuid;
    END IF;
    -- Strip ciphertext and hash keys
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_old
    FROM jsonb_each(v_old)
    WHERE key NOT LIKE '%_ciphertext' AND key NOT LIKE '%_hash';

  ELSIF TG_OP = 'INSERT' THEN
    v_rec_id := NEW.id;
    v_new := to_jsonb(NEW);
    -- Safe jsonb extraction for firm_id fallback
    IF v_firm_id IS NULL AND (v_new ? 'firm_id') THEN
      v_firm_id := NULLIF(v_new ->> 'firm_id', '')::uuid;
    END IF;
    -- Strip ciphertext and hash keys
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_new
    FROM jsonb_each(v_new)
    WHERE key NOT LIKE '%_ciphertext' AND key NOT LIKE '%_hash';

  ELSIF TG_OP = 'UPDATE' THEN
    v_rec_id := NEW.id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    -- Safe jsonb extraction for firm_id fallback
    IF v_firm_id IS NULL AND (v_new ? 'firm_id') THEN
      v_firm_id := NULLIF(v_new ->> 'firm_id', '')::uuid;
    END IF;

    -- Strip sensitive keys from old and new
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_old
    FROM jsonb_each(v_old)
    WHERE key NOT LIKE '%_ciphertext' AND key NOT LIKE '%_hash';

    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_new
    FROM jsonb_each(v_new)
    WHERE key NOT LIKE '%_ciphertext' AND key NOT LIKE '%_hash';

    -- Calculate jsonb diff of altered keys
    SELECT jsonb_object_agg(key, jsonb_build_object('old', v_old -> key, 'new', v_new -> key))
    INTO v_diff
    FROM jsonb_each(v_new)
    WHERE v_new -> key IS DISTINCT FROM v_old -> key;

    -- Skip audit log if nothing actually changed
    IF v_diff IS NULL OR v_diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Insert directly into immutable_audit_logs
  INSERT INTO audit.immutable_audit_logs (
    firm_id, table_schema, table_name, record_id, action,
    old_data, new_data, diff, actor_id, actor_kind,
    ip_addr, user_agent, request_id, timestamp_ist
  ) VALUES (
    COALESCE(v_firm_id, '00000000-0000-0000-0000-000000000000'::uuid),
    TG_TABLE_SCHEMA, TG_TABLE_NAME, v_rec_id, TG_OP,
    v_old, v_new, v_diff, v_user_id, v_actor,
    v_ip, v_ua, v_req_id, now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app.capture_audit_event() OWNER TO synextax_audit_writer;
SET ROLE synextax_audit_writer;
GRANT EXECUTE ON FUNCTION app.capture_audit_event() TO synextax_owner, synextax_app, synextax_auth, synextax_rls_helper;
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 4. Dedicated SECURITY DEFINER Writer Functions for Application Role
-- Allows synextax_app to record signing and PII unmask events safely
-- without granting direct table INSERT privilege on the audit schema.
-- ---------------------------------------------------------------------
CREATE FUNCTION audit.log_signing_event(
  p_firm_id           uuid,
  p_entity_id         uuid,
  p_dsc_id            uuid,
  p_cert_serial_hex   varchar(64),
  p_holder_pan        varchar(10),
  p_holder_name       varchar(150),
  p_operation         varchar(32),
  p_payload_hash      char(64),
  p_signature_nonce   uuid,
  p_token_profile     varchar(16),
  p_status            varchar(16),
  p_error_code        varchar(32) DEFAULT NULL,
  p_error_message     text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, audit AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO audit.signing_audit_logs (
    firm_id, entity_id, dsc_id, cert_serial_hex, holder_pan, holder_name,
    operation, payload_hash, signature_nonce, token_profile,
    ip_addr, client_user_agent, status, error_code, error_message, signed_at
  ) VALUES (
    p_firm_id, p_entity_id, p_dsc_id, p_cert_serial_hex, p_holder_pan, p_holder_name,
    p_operation, p_payload_hash, p_signature_nonce, p_token_profile,
    app.ctx_ip(), app.ctx_user_agent(), p_status, p_error_code, p_error_message, now()
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

ALTER FUNCTION audit.log_signing_event(uuid,uuid,uuid,varchar,varchar,varchar,varchar,char,uuid,varchar,varchar,varchar,text)
  OWNER TO synextax_audit_writer;

CREATE FUNCTION audit.log_pii_access(
  p_firm_id       uuid,
  p_entity_id     uuid,
  p_target_table  varchar(64),
  p_target_column varchar(64),
  p_record_id     uuid,
  p_access_reason text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, audit AS $$
DECLARE
  v_log_id bigint;
BEGIN
  INSERT INTO audit.pii_access_logs (
    firm_id, entity_id, user_id, target_table, target_column,
    record_id, access_reason, ip_addr, request_id, accessed_at
  ) VALUES (
    p_firm_id, p_entity_id, app.ctx_user_id(), p_target_table, p_target_column,
    p_record_id, p_access_reason, app.ctx_ip(), app.ctx_request_id(), now()
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

ALTER FUNCTION audit.log_pii_access(uuid,uuid,varchar,varchar,uuid,text)
  OWNER TO synextax_audit_writer;

SET ROLE synextax_audit_writer;
GRANT EXECUTE ON FUNCTION audit.log_signing_event(uuid,uuid,uuid,varchar,varchar,varchar,varchar,char,uuid,varchar,varchar,varchar,text) TO synextax_owner, synextax_app;
GRANT EXECUTE ON FUNCTION audit.log_pii_access(uuid,uuid,varchar,varchar,uuid,text) TO synextax_owner, synextax_app;
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 5. Permissions Lockdown
-- ---------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA audit FROM synextax_app, synextax_auth, synextax_auditor, synextax_rls_helper;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO synextax_app, synextax_auditor;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO synextax_audit_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO synextax_audit_writer;

RESET ROLE;
