-- =====================================================================
-- SynexTax | Migration 0021 | Practice tasks and the firm's fee ledger
-- Tasks: one row per client, return and period, generated from the
-- statutory calendar with a stable key, assigned and closed by staff.
-- Fees: the firm's own invoices to clients (tax invoice or bill of
-- supply), receipts against them, and a per-firm, per-year number series
-- so invoice numbers are consecutive and unique (rule 46).
-- =====================================================================
SET ROLE synextax_owner;

CREATE TABLE public.practice_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id),
  entity_id     uuid NOT NULL,
  task_key      varchar(80) NOT NULL,
  kind          varchar(16) NOT NULL CHECK (kind IN ('GSTR1','IFF','GSTR3B','PMT06','CMP08','GSTR4','TDS_DEPOSIT','TDS_STATEMENT','CUSTOM')),
  reference     varchar(15),                     -- GSTIN or TAN
  title         varchar(160) NOT NULL,
  period_label  varchar(40) NOT NULL,
  due_date      date NOT NULL,
  status        varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','DONE','NOT_APPLICABLE')),
  assigned_to   uuid,
  completed_at  timestamptz,
  completed_by  uuid,
  note          varchar(500),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, task_key),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, assigned_to) REFERENCES public.users (firm_id, id)
);
CREATE INDEX ix_tasks_due ON public.practice_tasks (firm_id, status, due_date);

ALTER TABLE public.firms ADD COLUMN invoice_prefix varchar(4) NOT NULL DEFAULT 'INV' CHECK (invoice_prefix ~ '^[A-Z0-9]{1,4}$');

CREATE TABLE public.fee_invoice_series (
  firm_id   uuid NOT NULL REFERENCES public.firms(id),
  fy_start  smallint NOT NULL,
  last_no   integer NOT NULL DEFAULT 0 CHECK (last_no >= 0),
  PRIMARY KEY (firm_id, fy_start)
);

CREATE TABLE public.fee_invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        uuid NOT NULL REFERENCES public.firms(id),
  entity_id      uuid NOT NULL,
  invoice_no     varchar(16) NOT NULL,
  invoice_date   date NOT NULL,
  kind           varchar(16) NOT NULL CHECK (kind IN ('TAX_INVOICE','BILL_OF_SUPPLY')),
  client_gstin   varchar(15) CHECK (client_gstin IS NULL OR client_gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  place_of_supply char(2) NOT NULL,
  lines          jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 30),
  taxable        numeric(15,2) NOT NULL CHECK (taxable > 0),
  cgst           numeric(15,2) NOT NULL DEFAULT 0,
  sgst           numeric(15,2) NOT NULL DEFAULT 0,
  igst           numeric(15,2) NOT NULL DEFAULT 0,
  total          numeric(15,2) NOT NULL,
  status         varchar(12) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','CANCELLED')),
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, invoice_no),
  CHECK (total = taxable + cgst + sgst + igst),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);
CREATE INDEX ix_fee_invoices_client ON public.fee_invoices (firm_id, entity_id, invoice_date);

CREATE TABLE public.fee_receipts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id),
  entity_id     uuid NOT NULL,
  receipt_date  date NOT NULL,
  amount        numeric(15,2) NOT NULL CHECK (amount > 0),
  mode          varchar(12) NOT NULL CHECK (mode IN ('UPI','BANK','CHEQUE','CASH','OTHER')),
  reference     varchar(40),                     -- UTR or cheque number, never a bank account number
  note          varchar(200),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);
CREATE INDEX ix_fee_receipts_client ON public.fee_receipts (firm_id, entity_id, receipt_date);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.practice_tasks FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.fee_invoices   FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_tasks        AFTER INSERT OR UPDATE OR DELETE ON public.practice_tasks FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_fee_invoices AFTER INSERT OR UPDATE OR DELETE ON public.fee_invoices   FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_fee_receipts AFTER INSERT OR UPDATE OR DELETE ON public.fee_receipts   FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

-- An issued invoice keeps its number, date, client and amounts; it can only be cancelled.
CREATE FUNCTION app.fee_invoice_immutable() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FEE_INVOICE_IMMUTABLE: issued invoices are cancelled, not deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.invoice_no, NEW.invoice_date, NEW.entity_id, NEW.lines, NEW.taxable, NEW.cgst, NEW.sgst, NEW.igst, NEW.total)
     IS DISTINCT FROM (OLD.invoice_no, OLD.invoice_date, OLD.entity_id, OLD.lines, OLD.taxable, OLD.cgst, OLD.sgst, OLD.igst, OLD.total) THEN
    RAISE EXCEPTION 'FEE_INVOICE_IMMUTABLE: an issued invoice cannot be changed; cancel it and issue a new one' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_fee_invoice_immutable BEFORE UPDATE OR DELETE ON public.fee_invoices FOR EACH ROW EXECUTE FUNCTION app.fee_invoice_immutable();

ALTER TABLE public.practice_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_receipts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_invoice_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_tasks     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_invoices       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_receipts       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_invoice_series FORCE ROW LEVEL SECURITY;

CREATE POLICY p_tasks_tenant ON public.practice_tasks FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
CREATE POLICY p_fee_invoices_tenant ON public.fee_invoices FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
CREATE POLICY p_fee_receipts_tenant ON public.fee_receipts FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
CREATE POLICY p_fee_series_tenant ON public.fee_invoice_series FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()));

GRANT SELECT, INSERT, UPDATE ON public.practice_tasks, public.fee_invoices, public.fee_invoice_series TO synextax_app;
GRANT SELECT, INSERT ON public.fee_receipts TO synextax_app;

RESET ROLE;
