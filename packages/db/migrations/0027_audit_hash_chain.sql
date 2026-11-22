-- =====================================================================
-- SynexTax | Migration 0027 | Hash chain over the change log
-- Each row of audit.immutable_audit_logs carries the SHA-256 of the row
-- before it in the same firm, so a changed, removed or reordered row breaks
-- the chain from that point on. audit.chain_heads holds each firm's last
-- link, so removing rows from the end is also detected. The application
-- recomputes the chain with audit.audit_row_hash (read-only, under RLS).
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE audit.immutable_audit_logs
  ADD COLUMN chain_seq bigint,
  ADD COLUMN prev_hash char(64),
  ADD COLUMN row_hash  char(64);

CREATE UNIQUE INDEX ux_audit_logs_chain ON audit.immutable_audit_logs (firm_id, chain_seq);

CREATE TABLE audit.chain_heads (
  firm_id    uuid PRIMARY KEY,
  last_seq   bigint   NOT NULL,
  last_hash  char(64) NOT NULL
);

-- The hashed text: every logged field in a fixed order and format. jsonb prints its keys in a
-- fixed order; timestamps are printed in UTC so the session time zone does not matter.
CREATE FUNCTION audit.audit_row_hash(p_prev text, l audit.immutable_audit_logs) RETURNS char(64)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog AS $$
  SELECT encode(sha256(convert_to(concat_ws(E'\x1f',
    p_prev, l.chain_seq::text, l.id::text, l.firm_id::text, l.table_schema, l.table_name, l.record_id::text,
    l.action, coalesce(l.old_data::text, ''), coalesce(l.new_data::text, ''), coalesce(l.diff::text, ''),
    coalesce(l.actor_id::text, ''), l.actor_kind::text, coalesce(l.ip_addr::text, ''), coalesce(l.user_agent, ''),
    coalesce(l.request_id, ''),
    to_char(l.timestamp_ist AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  ), 'UTF8')), 'hex')::char(64)
$$;

-- Links each new row to its firm's chain. The head row is locked until the inserting transaction
-- ends, so rows of one firm are chained one at a time and a rolled-back row leaves no gap.
CREATE FUNCTION audit.chain_audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit AS $$
DECLARE
  v_seq  bigint;
  v_hash char(64);
BEGIN
  INSERT INTO audit.chain_heads (firm_id, last_seq, last_hash)
  VALUES (NEW.firm_id, 0, repeat('0', 64))
  ON CONFLICT (firm_id) DO NOTHING;
  SELECT last_seq, last_hash INTO v_seq, v_hash FROM audit.chain_heads WHERE firm_id = NEW.firm_id FOR UPDATE;
  NEW.chain_seq := v_seq + 1;
  NEW.prev_hash := v_hash;
  NEW.row_hash  := audit.audit_row_hash(v_hash, NEW);
  UPDATE audit.chain_heads SET last_seq = NEW.chain_seq, last_hash = NEW.row_hash WHERE firm_id = NEW.firm_id;
  RETURN NEW;
END;
$$;

-- Chain the rows written before this migration, firm by firm, in the order they were written.
-- The no-update trigger and forced RLS are lifted only for this backfill, inside this transaction.
ALTER TABLE audit.immutable_audit_logs DISABLE TRIGGER trg_no_update_delete_audit_logs;
ALTER TABLE audit.immutable_audit_logs NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  r      audit.immutable_audit_logs;
  v_firm uuid := NULL;
  v_seq  bigint;
  v_hash char(64);
BEGIN
  FOR r IN SELECT * FROM audit.immutable_audit_logs ORDER BY firm_id, id LOOP
    IF v_firm IS DISTINCT FROM r.firm_id THEN
      IF v_firm IS NOT NULL THEN
        INSERT INTO audit.chain_heads VALUES (v_firm, v_seq, v_hash);
      END IF;
      v_firm := r.firm_id;
      v_seq := 0;
      v_hash := repeat('0', 64);
    END IF;
    v_seq := v_seq + 1;
    r.chain_seq := v_seq;
    r.prev_hash := v_hash;
    v_hash := audit.audit_row_hash(v_hash, r);
    UPDATE audit.immutable_audit_logs SET chain_seq = v_seq, prev_hash = r.prev_hash, row_hash = v_hash WHERE id = r.id;
  END LOOP;
  IF v_firm IS NOT NULL THEN
    INSERT INTO audit.chain_heads VALUES (v_firm, v_seq, v_hash);
  END IF;
END;
$$;
ALTER TABLE audit.immutable_audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.immutable_audit_logs ENABLE TRIGGER trg_no_update_delete_audit_logs;

ALTER TABLE audit.chain_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.chain_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY p_chain_heads_tenant ON audit.chain_heads
  FOR SELECT TO synextax_app USING (firm_id = (SELECT app.current_firm_id()));
CREATE POLICY p_chain_heads_writer ON audit.chain_heads
  FOR ALL TO synextax_audit_writer USING (true) WITH CHECK (true);
GRANT SELECT ON audit.chain_heads TO synextax_app;
GRANT SELECT, INSERT, UPDATE ON audit.chain_heads TO synextax_audit_writer;

ALTER FUNCTION audit.chain_audit_row() OWNER TO synextax_audit_writer;
SET ROLE synextax_audit_writer;
GRANT EXECUTE ON FUNCTION audit.chain_audit_row() TO synextax_owner;
SET ROLE synextax_owner;
GRANT EXECUTE ON FUNCTION audit.audit_row_hash(text, audit.immutable_audit_logs) TO synextax_app, synextax_audit_writer, synextax_auditor;

-- Recomputes the caller's firm chain (runs as the caller, so RLS limits it to that firm).
-- first_broken is the first link whose hash, back-link or position does not match; head_ok is
-- false when rows were removed from the end.
CREATE FUNCTION audit.verify_chain() RETURNS TABLE (checked bigint, first_broken bigint, head_ok boolean)
LANGUAGE sql STABLE
SET search_path = pg_catalog, audit, app AS $$
  WITH l AS (
    SELECT c.chain_seq, c.prev_hash, c.row_hash,
           audit.audit_row_hash(c.prev_hash, c) AS computed,
           lag(c.row_hash) OVER (ORDER BY c.chain_seq) AS before,
           row_number() OVER (ORDER BY c.chain_seq) AS n
    FROM audit.immutable_audit_logs c
    WHERE c.firm_id = app.current_firm_id() AND c.chain_seq IS NOT NULL
  ), agg AS (
    SELECT count(*)::bigint AS c, max(chain_seq) AS m,
           min(chain_seq) FILTER (WHERE computed <> row_hash OR prev_hash <> coalesce(before, repeat('0', 64)) OR chain_seq <> n) AS bad
    FROM l
  )
  SELECT agg.c, agg.bad,
         CASE WHEN h.firm_id IS NULL THEN agg.c = 0
              ELSE h.last_seq = coalesce(agg.m, 0)
                   AND h.last_hash = coalesce((SELECT row_hash FROM l ORDER BY chain_seq DESC LIMIT 1), repeat('0', 64)) END
  FROM agg LEFT JOIN audit.chain_heads h ON h.firm_id = app.current_firm_id()
$$;
GRANT EXECUTE ON FUNCTION audit.verify_chain() TO synextax_app, synextax_auditor;

CREATE TRIGGER trg_chain_audit_logs
  BEFORE INSERT ON audit.immutable_audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit.chain_audit_row();

RESET ROLE;
