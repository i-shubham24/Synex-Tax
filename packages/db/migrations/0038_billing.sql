/* SynexTax | Migration 0038 | Billing for small clients */
/* Items, customers, invoices and credit or debit notes with their lines, */
/* a document number series per GSTIN and financial year (CGST rule 46(b): */
/* up to 16 characters, unique for the financial year), simple purchase */
/* entries for the stock register, the IRN and e-way bill numbers recorded */
/* after the user generates them on the portals, and the batches pushed into */
/* public.gst_invoices_sales for GSTR-1. Documents are cancelled, never */
/* deleted: the application role has no DELETE on documents or lines. */
SET ROLE synextax_owner;

CREATE TABLE public.billing_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id          uuid NOT NULL REFERENCES public.firms(id),
  entity_id        uuid NOT NULL,
  name             varchar(120) NOT NULL CHECK (length(btrim(name)) >= 3),
  hsn              varchar(8) NOT NULL CHECK (hsn ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})$'),
  is_service       boolean NOT NULL DEFAULT false,
  unit             varchar(3) NOT NULL CHECK (unit ~ '^[A-Z]{3}$'),
  gst_rate         numeric(6,3) NOT NULL CHECK (gst_rate >= 0 AND gst_rate <= 100),
  cess_rate        numeric(6,3) NOT NULL DEFAULT 0 CHECK (cess_rate >= 0 AND cess_rate <= 999),
  sale_price       numeric(18,3) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  opening_qty      numeric(18,3) NOT NULL DEFAULT 0 CHECK (opening_qty >= 0),
  opening_value    numeric(18,2) NOT NULL DEFAULT 0 CHECK (opening_value >= 0),
  active           boolean NOT NULL DEFAULT true,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, entity_id, name),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);

CREATE TABLE public.billing_customers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id          uuid NOT NULL REFERENCES public.firms(id),
  entity_id        uuid NOT NULL,
  legal_name       varchar(100) NOT NULL CHECK (length(btrim(legal_name)) >= 3),
  trade_name       varchar(100),
  gstin            varchar(15) CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  state_code       char(2) NOT NULL CHECK (state_code ~ '^[0-9]{2}$'),
  address1         varchar(100) NOT NULL,
  address2         varchar(100),
  place            varchar(50) NOT NULL,
  pincode          char(6) CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$'),
  phone            varchar(15),
  email            varchar(100),
  active           boolean NOT NULL DEFAULT true,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  CHECK (gstin IS NULL OR substr(gstin, 1, 2) = state_code),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);
CREATE UNIQUE INDEX ux_billing_customers_gstin ON public.billing_customers (firm_id, entity_id, gstin) WHERE gstin IS NOT NULL;

/* The supplier's address and contact as printed on its invoices (rule 46(a)); public.entities */
/* keeps no address. */
CREATE TABLE public.billing_sellers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id              uuid NOT NULL REFERENCES public.firms(id),
  entity_id            uuid NOT NULL,
  gst_registration_id  uuid NOT NULL,
  address1             varchar(100) NOT NULL,
  address2             varchar(100),
  place                varchar(50) NOT NULL,
  pincode              char(6) NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  phone                varchar(15),
  email                varchar(100),
  bank_details         varchar(300),
  terms                varchar(500),
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, gst_registration_id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id)
);

/* One numbering series per GSTIN, financial year (start year) and document type. */
CREATE TABLE public.billing_series (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id              uuid NOT NULL REFERENCES public.firms(id),
  entity_id            uuid NOT NULL,
  gst_registration_id  uuid NOT NULL,
  fy                   smallint NOT NULL CHECK (fy BETWEEN 2017 AND 2100),
  doc_type             varchar(3) NOT NULL CHECK (doc_type IN ('INV','CRN','DBN')),
  prefix               varchar(15) NOT NULL DEFAULT '' CHECK (prefix ~ '^([A-Z1-9][A-Z0-9/-]*)?$'),
  pad_width            smallint NOT NULL DEFAULT 4 CHECK (pad_width BETWEEN 1 AND 10),
  next_no              integer NOT NULL DEFAULT 1 CHECK (next_no >= 1),
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, gst_registration_id, fy, doc_type, prefix),
  CHECK (length(prefix) + pad_width <= 16),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id)
);

CREATE TABLE public.billing_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id              uuid NOT NULL REFERENCES public.firms(id),
  entity_id            uuid NOT NULL,
  gst_registration_id  uuid NOT NULL,
  customer_id          uuid NOT NULL,
  series_id            uuid NOT NULL,
  series_no            integer NOT NULL,
  fy                   smallint NOT NULL,
  doc_type             varchar(3) NOT NULL CHECK (doc_type IN ('INV','CRN','DBN')),
  doc_no               varchar(16) NOT NULL CHECK (doc_no ~ '^[A-Z1-9][A-Z0-9/-]{0,15}$'),
  doc_date             date NOT NULL,
  place_of_supply      char(2) NOT NULL CHECK (place_of_supply ~ '^[0-9]{2}$'),
  reverse_charge       boolean NOT NULL DEFAULT false,
  inter_state          boolean NOT NULL,
  gstr1_section        varchar(5) NOT NULL CHECK (gstr1_section IN ('B2B','B2CL','B2CS','CDNR','CDNUR')),
  original_doc_no      varchar(16),
  original_doc_date    date,
  buyer                jsonb NOT NULL,  /* name, GSTIN, address and state as printed on the document (rule 46) */
  taxable_value        numeric(18,2) NOT NULL,
  igst_amount          numeric(18,2) NOT NULL DEFAULT 0,
  cgst_amount          numeric(18,2) NOT NULL DEFAULT 0,
  sgst_amount          numeric(18,2) NOT NULL DEFAULT 0,
  cess_amount          numeric(18,2) NOT NULL DEFAULT 0,
  round_off            numeric(6,2) NOT NULL DEFAULT 0,
  invoice_value        numeric(18,2) NOT NULL,
  amount_payable       numeric(18,2) NOT NULL,
  notes                varchar(500),
  status               varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
  cancelled_at         timestamptz,
  cancel_reason        varchar(200),
  irn                  char(64) CHECK (irn IS NULL OR irn ~ '^[0-9a-f]{64}$'),
  ack_no               varchar(32),
  ack_date             timestamptz,
  ewb_no               varchar(32),
  ewb_date             timestamptz,
  transport            jsonb,
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  /* Rule 46(b): unique for the financial year, across every series of the GSTIN. */
  UNIQUE (firm_id, gst_registration_id, fy, doc_no),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id),
  FOREIGN KEY (firm_id, customer_id) REFERENCES public.billing_customers (firm_id, id),
  FOREIGN KEY (firm_id, series_id) REFERENCES public.billing_series (firm_id, id)
);
CREATE INDEX ix_billing_documents_period ON public.billing_documents (firm_id, gst_registration_id, doc_date);

CREATE TABLE public.billing_document_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id          uuid NOT NULL REFERENCES public.firms(id),
  entity_id        uuid NOT NULL,
  document_id      uuid NOT NULL,
  line_no          smallint NOT NULL CHECK (line_no BETWEEN 1 AND 1000),
  item_id          uuid,
  description      varchar(300) NOT NULL,
  hsn              varchar(8) NOT NULL CHECK (hsn ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})$'),
  is_service       boolean NOT NULL,
  unit             varchar(3) NOT NULL,
  quantity         numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_price       numeric(18,3) NOT NULL CHECK (unit_price >= 0),
  discount         numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  taxable_value    numeric(18,2) NOT NULL,
  gst_rate         numeric(6,3) NOT NULL,
  igst_amount      numeric(18,2) NOT NULL DEFAULT 0,
  cgst_amount      numeric(18,2) NOT NULL DEFAULT 0,
  sgst_amount      numeric(18,2) NOT NULL DEFAULT 0,
  cess_rate        numeric(6,3) NOT NULL DEFAULT 0,
  cess_amount      numeric(18,2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, document_id, line_no),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, document_id) REFERENCES public.billing_documents (firm_id, id),
  FOREIGN KEY (firm_id, item_id) REFERENCES public.billing_items (firm_id, id)
);
CREATE INDEX ix_billing_lines_item ON public.billing_document_lines (firm_id, item_id);

/* Purchases entered for the stock register (one row per item bought). */
CREATE TABLE public.billing_purchases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id          uuid NOT NULL REFERENCES public.firms(id),
  entity_id        uuid NOT NULL,
  item_id          uuid NOT NULL,
  supplier_name    varchar(100) NOT NULL,
  supplier_gstin   varchar(15) CHECK (supplier_gstin IS NULL OR supplier_gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  bill_no          varchar(32) NOT NULL,
  bill_date        date NOT NULL,
  quantity         numeric(18,3) NOT NULL CHECK (quantity > 0),
  value            numeric(18,2) NOT NULL CHECK (value >= 0),
  status           varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, item_id) REFERENCES public.billing_items (firm_id, id)
);
CREATE INDEX ix_billing_purchases_item ON public.billing_purchases (firm_id, item_id, bill_date);

/* Each push of a month's documents into public.gst_invoices_sales is one import batch. */
CREATE TABLE public.billing_gstr1_pushes (
  id                   uuid PRIMARY KEY,  /* the import_batch written on the sales rows */
  firm_id              uuid NOT NULL REFERENCES public.firms(id),
  entity_id            uuid NOT NULL,
  gst_registration_id  uuid NOT NULL,
  return_period        varchar(7) NOT NULL CHECK (return_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  documents            integer NOT NULL,
  rows_written         integer NOT NULL,
  superseded           boolean NOT NULL DEFAULT false,
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id)
);
CREATE INDEX ix_billing_pushes_period ON public.billing_gstr1_pushes (firm_id, gst_registration_id, return_period);

/* Triggers, row-level security and grants. */
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['billing_items','billing_customers','billing_sellers','billing_series','billing_documents','billing_document_lines','billing_purchases','billing_gstr1_pushes']
  LOOP
    IF t <> 'billing_document_lines' THEN
      EXECUTE format('CREATE TRIGGER trg_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
    END IF;
    EXECUTE format('CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event()', t, t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY p_%s_tenant ON public.%I FOR ALL TO synextax_app
         USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
         WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))', t, t);
    /* As in 0036: a CLIENT login reaches the database only through the client portal. */
    EXECUTE format(
      'CREATE POLICY p_no_client_login ON public.%I AS RESTRICTIVE FOR ALL TO synextax_app
         USING ((SELECT app.current_user_role()) IS DISTINCT FROM ''CLIENT'')
         WITH CHECK ((SELECT app.current_user_role()) IS DISTINCT FROM ''CLIENT'')', t);
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_items, public.billing_customers, public.billing_sellers, public.billing_series TO synextax_app;
/* Cancel, never delete. */
GRANT SELECT, INSERT, UPDATE ON public.billing_documents, public.billing_purchases, public.billing_gstr1_pushes TO synextax_app;
GRANT SELECT, INSERT ON public.billing_document_lines TO synextax_app;

RESET ROLE;
