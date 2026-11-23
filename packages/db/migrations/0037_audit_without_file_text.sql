/* =====================================================================
 * SynexTax | Migration 0037 | Keep whole files out of the change log
 * The change log copies each row it records. A correction draft version
 * can hold a whole TRACES consolidated file (up to 10 MB) in conso_text;
 * the log keeps its SHA-256 (conso_sha256) instead, which identifies the
 * file exactly. Same function as 0005 with that one key left out.
 * ===================================================================== */
SET ROLE synextax_audit_writer;

CREATE OR REPLACE FUNCTION app.capture_audit_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, audit AS $$
DECLARE
  v_ctx       record;
  v_firm_id   uuid;
  v_actor     public.actor_kind;
  v_ip        inet;
  v_req_id    text;
  v_ua        text;
  v_rec_id    uuid;
  v_old       jsonb;
  v_new       jsonb;
  v_diff      jsonb;
BEGIN
  /* Actor comes only from the HMAC-verified context (app.verified_context), never from raw settings. */
  SELECT * INTO v_ctx FROM app.verified_context();
  IF v_ctx.firm_id IS NOT NULL THEN
    v_actor  := v_ctx.actor_kind::public.actor_kind;
    v_ip     := app.ctx_ip();
    v_req_id := app.ctx_request_id();
    v_ua     := app.ctx_user_agent();
  ELSE
    /* No signed context: platform provisioning, migrations or an unsigned worker. */
    v_actor := 'SYSTEM_JOB';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := to_jsonb(OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := to_jsonb(NEW);
  END IF;
  v_rec_id := NULLIF(COALESCE(v_new, v_old) ->> 'id', '')::uuid;

  /* Tenant comes from the row itself (a firm row is its own tenant), then the verified context. */
  v_firm_id := NULLIF(COALESCE(v_new, v_old) ->> 'firm_id', '')::uuid;
  IF v_firm_id IS NULL AND TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'firms' THEN
    v_firm_id := v_rec_id;
  END IF;
  v_firm_id := COALESCE(v_firm_id, v_ctx.firm_id);

  /* Strip ciphertext and hash keys so credentials never reach the audit trail. */
  IF v_old IS NOT NULL THEN
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_old
    FROM jsonb_each(v_old)
    WHERE key NOT LIKE '%\_ciphertext' AND key NOT LIKE '%\_hash' AND key <> 'conso_text';
  END IF;
  IF v_new IS NOT NULL THEN
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_new
    FROM jsonb_each(v_new)
    WHERE key NOT LIKE '%\_ciphertext' AND key NOT LIKE '%\_hash' AND key <> 'conso_text';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', v_old -> key, 'new', v_new -> key))
    INTO v_diff
    FROM jsonb_each(v_new)
    WHERE v_new -> key IS DISTINCT FROM v_old -> key;

    /* Skip the audit row if nothing that is logged actually changed. */
    IF v_diff IS NULL OR v_diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO audit.immutable_audit_logs (
    firm_id, table_schema, table_name, record_id, action,
    old_data, new_data, diff, actor_id, actor_kind,
    ip_addr, user_agent, request_id, timestamp_ist
  ) VALUES (
    COALESCE(v_firm_id, '00000000-0000-0000-0000-000000000000'::uuid),
    TG_TABLE_SCHEMA, TG_TABLE_NAME, v_rec_id, TG_OP,
    v_old, v_new, v_diff, v_ctx.user_id, v_actor,
    v_ip, v_ua, v_req_id, now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

RESET ROLE;
