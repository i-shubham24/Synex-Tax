-- =====================================================================
-- SynexTax | Migration 0034 | TDS certificates to payees, accounting backups
--
-- A. TDS certificates. The firm uploads the PDFs the TRACES converter
--    produced (unchanged, up to 2 MB, digitally signed) for one deductor
--    client, payee PAN and quarter. Each is emailed as an attachment and,
--    when WhatsApp is set up, announced with a download link. A link is a
--    random token kept only as its SHA-256, lasts 7 days and serves one
--    certificate. Every attempt is logged: who, when, channel, status.
--
-- B. Accounting backups. A desktop agent is paired with a device token the
--    web app shows once; only its SHA-256 is kept. Rules say which product
--    the agent backs up and when; versions are the files it uploaded. A
--    scheduled job finds rules whose backup is late and emails the partners.
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- A. TDS certificates
-- ---------------------------------------------------------------------
CREATE TABLE public.tds_certificates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id),
  entity_id     uuid NOT NULL,
  payee_pan     varchar(10) NOT NULL CHECK (payee_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  tax_year      char(7) NOT NULL CHECK (tax_year ~ '^20[0-9]{2}-[0-9]{2}$'),
  quarter       varchar(2) NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  file_name     varchar(120) NOT NULL,
  storage_key   varchar(200) NOT NULL UNIQUE,
  size_bytes    integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  sha256        char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by   uuid,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, entity_id, sha256),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);
CREATE INDEX ix_tds_certificates_period ON public.tds_certificates (firm_id, entity_id, tax_year, quarter);

CREATE TABLE public.tds_certificate_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id          uuid NOT NULL REFERENCES public.firms(id),
  entity_id        uuid NOT NULL,
  certificate_id   uuid NOT NULL,
  payee_pan        varchar(10) NOT NULL CHECK (payee_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  token_hash       char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  downloads        integer NOT NULL DEFAULT 0,
  last_download_at timestamptz,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  CHECK (expires_at <= created_at + interval '7 days'),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, certificate_id) REFERENCES public.tds_certificates (firm_id, id)
);

CREATE TABLE public.tds_certificate_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         uuid NOT NULL REFERENCES public.firms(id),
  entity_id       uuid NOT NULL,
  certificate_id  uuid NOT NULL,
  channel         varchar(10) NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP')),
  recipient       varchar(254) NOT NULL,
  status          varchar(16) NOT NULL CHECK (status IN ('SENT','FAILED','NOT_SET_UP')),
  provider_id     varchar(200),
  error           varchar(300),
  link_id         uuid,
  sent_by         uuid,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, certificate_id) REFERENCES public.tds_certificates (firm_id, id),
  FOREIGN KEY (firm_id, link_id) REFERENCES public.tds_certificate_links (firm_id, id)
);
CREATE INDEX ix_tds_certificate_sends_cert ON public.tds_certificate_sends (firm_id, certificate_id, sent_at DESC);

CREATE TRIGGER trg_audit_tds_certificates      AFTER INSERT OR UPDATE OR DELETE ON public.tds_certificates      FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_tds_certificate_links AFTER INSERT OR UPDATE OR DELETE ON public.tds_certificate_links FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_tds_certificate_sends AFTER INSERT OR UPDATE OR DELETE ON public.tds_certificate_sends FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.tds_certificates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_certificate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_certificate_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_certificates      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tds_certificate_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tds_certificate_sends FORCE ROW LEVEL SECURITY;

CREATE POLICY p_tds_certificates_tenant ON public.tds_certificates FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
CREATE POLICY p_tds_certificate_links_tenant ON public.tds_certificate_links FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
CREATE POLICY p_tds_certificate_sends_tenant ON public.tds_certificate_sends FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
-- The link resolver below reads only the links table, before any firm is known.
CREATE POLICY p_tds_certificate_links_resolver ON public.tds_certificate_links FOR SELECT TO synextax_rls_helper USING (true);

GRANT SELECT, INSERT ON public.tds_certificates TO synextax_app;
GRANT SELECT, INSERT, UPDATE (revoked_at, downloads, last_download_at) ON public.tds_certificate_links TO synextax_app;
GRANT SELECT, INSERT ON public.tds_certificate_sends TO synextax_app;
GRANT SELECT ON public.tds_certificate_links TO synextax_rls_helper;

CREATE FUNCTION app.resolve_certificate_link(p_token_hash text)
RETURNS TABLE (link_id uuid, firm_id uuid, entity_id uuid, certificate_id uuid, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app AS $$
  SELECT l.id, l.firm_id, l.entity_id, l.certificate_id, l.expires_at
  FROM public.tds_certificate_links l
  WHERE l.token_hash = p_token_hash AND l.revoked_at IS NULL AND l.expires_at > now()
$$;
REVOKE ALL ON FUNCTION app.resolve_certificate_link(text) FROM PUBLIC;
ALTER FUNCTION app.resolve_certificate_link(text) OWNER TO synextax_rls_helper;

-- ---------------------------------------------------------------------
-- B. Accounting backups
-- ---------------------------------------------------------------------
CREATE TABLE public.backup_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        uuid NOT NULL REFERENCES public.firms(id),
  name           varchar(80) NOT NULL,
  token_hash     char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint     varchar(8) NOT NULL,
  agent_version  varchar(20),
  last_seen_at   timestamptz,
  revoked_at     timestamptz,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id)
);

CREATE TABLE public.backup_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           uuid NOT NULL REFERENCES public.firms(id),
  device_id         uuid NOT NULL,
  entity_id         uuid,
  label             varchar(80) NOT NULL,
  product           varchar(10) NOT NULL CHECK (product IN ('tally','busy','marg','zoho','vyapar')),
  source_folder     varchar(260),
  daily_time        time NOT NULL DEFAULT '20:00',
  retention_days    smallint CHECK (retention_days IS NULL OR retention_days BETWEEN 7 AND 3650),
  enabled           boolean NOT NULL DEFAULT true,
  last_success_at   timestamptz,
  last_error        varchar(300),
  last_error_at     timestamptz,
  late_notified_at  timestamptz,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, device_id) REFERENCES public.backup_devices (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);
CREATE INDEX ix_backup_rules_device ON public.backup_rules (firm_id, device_id);

CREATE TABLE public.backup_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         uuid NOT NULL REFERENCES public.firms(id),
  device_id       uuid NOT NULL,
  rule_id         uuid NOT NULL,
  product         varchar(10) NOT NULL CHECK (product IN ('tally','busy','marg','zoho','vyapar')),
  file_name       varchar(160) NOT NULL,
  size_bytes      bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 524288000),
  sha256          char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  content_sha256  char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  storage_key     varchar(200) NOT NULL UNIQUE,
  upload_mode     varchar(8) NOT NULL CHECK (upload_mode IN ('S3','CHUNKED')),
  status          varchar(10) NOT NULL DEFAULT 'UPLOADING' CHECK (status IN ('UPLOADING','COMPLETE','FAILED','DELETED')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  deleted_at      timestamptz,
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, device_id) REFERENCES public.backup_devices (firm_id, id),
  FOREIGN KEY (firm_id, rule_id) REFERENCES public.backup_rules (firm_id, id),
  CHECK (status <> 'COMPLETE' OR completed_at IS NOT NULL),
  CHECK (status <> 'DELETED' OR deleted_at IS NOT NULL)
);
CREATE INDEX ix_backup_versions_rule ON public.backup_versions (firm_id, rule_id, created_at DESC);

CREATE TRIGGER trg_audit_backup_devices  AFTER INSERT OR UPDATE OR DELETE ON public.backup_devices  FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_backup_rules    AFTER INSERT OR UPDATE OR DELETE ON public.backup_rules    FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_backup_versions AFTER INSERT OR UPDATE OR DELETE ON public.backup_versions FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.backup_rules FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE public.backup_devices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_devices  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.backup_rules    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.backup_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY p_backup_devices_tenant ON public.backup_devices FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()));
CREATE POLICY p_backup_rules_tenant ON public.backup_rules FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND (entity_id IS NULL OR app.is_entity_visible(entity_id)))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND (entity_id IS NULL OR app.is_entity_visible(entity_id)));
CREATE POLICY p_backup_versions_tenant ON public.backup_versions FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()));
-- The device resolver and the late-backup finder read across firms, ids only.
CREATE POLICY p_backup_devices_resolver ON public.backup_devices FOR SELECT TO synextax_rls_helper USING (true);
CREATE POLICY p_backup_rules_resolver   ON public.backup_rules   FOR SELECT TO synextax_rls_helper USING (true);

GRANT SELECT, INSERT, UPDATE (name, agent_version, last_seen_at, revoked_at) ON public.backup_devices TO synextax_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_rules TO synextax_app;
GRANT SELECT, INSERT, UPDATE (status, completed_at, deleted_at) ON public.backup_versions TO synextax_app;
GRANT SELECT ON public.backup_devices, public.backup_rules TO synextax_rls_helper;
-- Partner email addresses for the late-backup notice (see app.current_firm_partner_emails).
GRANT SELECT (id, email, status) ON auth.identities TO synextax_rls_helper;

-- Which firm a live device token belongs to. Nothing else is revealed.
CREATE FUNCTION app.resolve_backup_device(p_token_hash text)
RETURNS TABLE (device_id uuid, firm_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app AS $$
  SELECT d.id, d.firm_id FROM public.backup_devices d
  WHERE d.token_hash = p_token_hash AND d.revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION app.resolve_backup_device(text) FROM PUBLIC;
ALTER FUNCTION app.resolve_backup_device(text) OWNER TO synextax_rls_helper;

-- Rules whose last good backup (or, for a new rule, its creation) is older than the grace period
-- and that have not been reported since. Called by the scheduled job before any firm is known.
CREATE FUNCTION app.late_backup_rules(p_grace interval)
RETURNS TABLE (firm_id uuid, rule_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app AS $$
  SELECT r.firm_id, r.id
  FROM public.backup_rules r
  JOIN public.backup_devices d ON d.id = r.device_id AND d.revoked_at IS NULL
  JOIN public.firms f ON f.id = r.firm_id AND f.status = 'ACTIVE'
  WHERE r.enabled
    AND COALESCE(r.last_success_at, r.created_at) < now() - p_grace
    AND (r.late_notified_at IS NULL OR r.late_notified_at < COALESCE(r.last_success_at, r.created_at))
  ORDER BY r.firm_id
  LIMIT 5000
$$;
REVOKE ALL ON FUNCTION app.late_backup_rules(interval) FROM PUBLIC;
ALTER FUNCTION app.late_backup_rules(interval) OWNER TO synextax_rls_helper;

-- Active partners of the current firm, for a signed job of that firm or one of its partners.
CREATE FUNCTION app.current_firm_partner_emails()
RETURNS TABLE (display_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, auth AS $$
  SELECT u.display_name::text, i.email::text
  FROM public.users u
  JOIN auth.identities i ON i.id = u.identity_id AND i.status = 'ACTIVE'
  WHERE u.firm_id = app.current_firm_id()
    AND u.role = 'PARTNER' AND u.status = 'ACTIVE'
    AND (app.is_system_job() OR app.current_user_role() = 'PARTNER')
  ORDER BY u.created_at
  LIMIT 10
$$;
REVOKE ALL ON FUNCTION app.current_firm_partner_emails() FROM PUBLIC;
ALTER FUNCTION app.current_firm_partner_emails() OWNER TO synextax_rls_helper;

SET ROLE synextax_rls_helper;
GRANT EXECUTE ON FUNCTION app.resolve_certificate_link(text) TO synextax_app;
GRANT EXECUTE ON FUNCTION app.resolve_backup_device(text) TO synextax_app;
GRANT EXECUTE ON FUNCTION app.late_backup_rules(interval) TO synextax_app;
GRANT EXECUTE ON FUNCTION app.current_firm_partner_emails() TO synextax_app;
SET ROLE synextax_owner;

RESET ROLE;
