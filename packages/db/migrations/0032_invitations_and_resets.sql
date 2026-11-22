-- =====================================================================
-- SynexTax | Migration 0032 | Team invitations, password resets, meetings
--
-- 1. Invitations: a partner invites a manager, a staff member or a client
--    contact by email. The link carries a random 32-byte token; only its
--    SHA-256 is stored. A link is single use and expires. Client contacts
--    are linked to one or more of the firm's entities on acceptance.
--    Before any firm is known, one SECURITY DEFINER lookup resolves a live
--    token to its firm, as 0023 does for upload links.
-- 2. Password resets (auth schema, role synextax_auth as in 0011): a
--    6-digit code, stored only as a salted SHA-256, short expiry, a few
--    attempts, single use.
-- 3. Firm meetings for the practice calendar.
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 1. Invitations
-- ---------------------------------------------------------------------
CREATE TABLE public.user_invitations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           uuid NOT NULL REFERENCES public.firms(id),
  email             varchar(254) NOT NULL CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  email_normalized  varchar(254) GENERATED ALWAYS AS (lower(email)) STORED,
  display_name      varchar(120) NOT NULL CHECK (length(btrim(display_name)) >= 2),
  role              public.user_role NOT NULL CHECK (role IN ('MANAGER','STAFF','CLIENT')),
  designation       varchar(80),
  entity_ids        uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(entity_ids) <= 200),
  access_level      varchar(16) NOT NULL DEFAULT 'PREPARE'
                    CHECK (access_level IN ('VIEW','PREPARE','REVIEW','CLIENT_PORTAL')),
  token_hash        bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  expires_at        timestamptz NOT NULL,
  status            varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REVOKED')),
  send_count        smallint NOT NULL DEFAULT 1 CHECK (send_count BETWEEN 1 AND 50),
  last_sent_at      timestamptz NOT NULL DEFAULT now(),
  invited_by        uuid NOT NULL,
  accepted_user_id  uuid,
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  revoked_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, invited_by) REFERENCES public.users (firm_id, id),
  FOREIGN KEY (firm_id, accepted_user_id) REFERENCES public.users (firm_id, id),
  -- A client contact always sees at least one client, and only through the client portal level.
  CHECK (role <> 'CLIENT' OR (cardinality(entity_ids) >= 1 AND access_level = 'CLIENT_PORTAL')),
  CHECK (role = 'CLIENT' OR access_level <> 'CLIENT_PORTAL'),
  CHECK (status <> 'ACCEPTED' OR (accepted_user_id IS NOT NULL AND accepted_at IS NOT NULL)),
  CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL)
);
-- One open invitation per email per firm.
CREATE UNIQUE INDEX ux_invitations_pending ON public.user_invitations (firm_id, email_normalized) WHERE status = 'PENDING';
CREATE INDEX ix_invitations_firm ON public.user_invitations (firm_id, created_at DESC);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.user_invitations FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_invitations AFTER INSERT OR UPDATE OR DELETE ON public.user_invitations FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations FORCE ROW LEVEL SECURITY;

-- Partners manage invitations; a signed job for the firm accepts one.
CREATE POLICY p_invitations_tenant ON public.user_invitations FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id())
         AND ((SELECT app.current_user_role()) = 'PARTNER' OR (SELECT app.is_system_job())))
  WITH CHECK (firm_id = (SELECT app.current_firm_id())
              AND ((SELECT app.current_user_role()) = 'PARTNER' OR (SELECT app.is_system_job())));
-- The resolver below reads only this table and the firm's name, before any firm is known.
CREATE POLICY p_invitations_resolver ON public.user_invitations FOR SELECT TO synextax_rls_helper USING (true);

GRANT SELECT, INSERT, UPDATE ON public.user_invitations TO synextax_app;
GRANT SELECT ON public.user_invitations TO synextax_rls_helper;

-- Which firm a live invitation belongs to, and what the invitee needs to see. Nothing else.
CREATE FUNCTION app.resolve_invitation(p_token_hash bytea)
RETURNS TABLE (invitation_id uuid, firm_id uuid, firm_name text, email text, display_name text, role public.user_role, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app AS $$
  SELECT i.id, i.firm_id, COALESCE(f.trade_name, f.legal_name)::text, i.email::text, i.display_name::text, i.role, i.expires_at
  FROM public.user_invitations i
  JOIN public.firms f ON f.id = i.firm_id
  WHERE i.token_hash = p_token_hash
    AND i.status = 'PENDING'
    AND i.expires_at > now()
    AND f.status = 'ACTIVE'
$$;
REVOKE ALL ON FUNCTION app.resolve_invitation(bytea) FROM PUBLIC;
ALTER FUNCTION app.resolve_invitation(bytea) OWNER TO synextax_rls_helper;

SET ROLE synextax_rls_helper;
GRANT EXECUTE ON FUNCTION app.resolve_invitation(bytea) TO synextax_app;
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 2. Password reset codes (auth module only)
-- ---------------------------------------------------------------------
CREATE TABLE auth.password_resets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id   uuid NOT NULL REFERENCES auth.identities(id) ON DELETE CASCADE,
  code_hash     bytea NOT NULL CHECK (octet_length(code_hash) = 32),   -- sha256(id:code)
  attempts      smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  channels      varchar(32) NOT NULL DEFAULT 'EMAIL' CHECK (channels IN ('EMAIL','EMAIL,WHATSAPP')),
  requested_ip  inet,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at <= created_at + interval '1 hour')
);
CREATE INDEX ix_password_resets_identity ON auth.password_resets (identity_id, created_at DESC);

-- No DELETE, as for the other auth tables: codes are used or revoked, never removed.
GRANT SELECT, INSERT, UPDATE ON auth.password_resets TO synextax_auth;

-- ---------------------------------------------------------------------
-- 3. Firm meetings (practice calendar)
-- ---------------------------------------------------------------------
CREATE TABLE public.firm_meetings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           uuid NOT NULL REFERENCES public.firms(id),
  title             varchar(160) NOT NULL CHECK (length(btrim(title)) >= 2),
  starts_at         timestamptz NOT NULL,
  duration_minutes  smallint NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 600),
  location          varchar(200),
  entity_id         uuid,
  notes             varchar(500),
  status            varchar(12) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','CANCELLED')),
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, created_by) REFERENCES public.users (firm_id, id)
);
CREATE INDEX ix_firm_meetings_start ON public.firm_meetings (firm_id, starts_at);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.firm_meetings FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_firm_meetings AFTER INSERT OR UPDATE OR DELETE ON public.firm_meetings FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.firm_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_meetings FORCE ROW LEVEL SECURITY;

-- The firm's own people see firm meetings; a meeting about a client only by those who see that client.
CREATE POLICY p_firm_meetings_tenant ON public.firm_meetings FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id())
         AND (SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT'
         AND (entity_id IS NULL OR app.is_entity_visible(entity_id)))
  WITH CHECK (firm_id = (SELECT app.current_firm_id())
              AND (SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT'
              AND (entity_id IS NULL OR app.is_entity_visible(entity_id)));

GRANT SELECT, INSERT, UPDATE ON public.firm_meetings TO synextax_app;

RESET ROLE;
