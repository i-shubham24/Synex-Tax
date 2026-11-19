-- =====================================================================
-- SynexTax | Migration 0008 | TRAI DLT Templates & RBI E-Mandate Billing
-- Target   : PostgreSQL 17 (AWS RDS Multi-AZ, ap-south-1)
-- Conformance: TRAI DLT Mandate (2025-26), RBI E-Mandate (Rs 15,000 Cap), SAC 998314
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 1. TRAI DLT Notification Templates (Telecommunications Act & TRAI Directives)
-- ---------------------------------------------------------------------
CREATE TABLE public.dlt_sms_templates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code           varchar(64) NOT NULL UNIQUE,
  dlt_pe_id               varchar(32) NOT NULL,
  dlt_template_id         varchar(32) NOT NULL,
  sender_header           char(6) NOT NULL CHECK (sender_header ~ '^[A-Z]{6}$'),
  category                varchar(24) NOT NULL CHECK (category IN ('TRANSACTIONAL','SERVICE_IMPLICIT','SERVICE_EXPLICIT')),
  pe_tm_chain_id          varchar(64),
  template_body           text NOT NULL,
  registered_variables    text[] NOT NULL DEFAULT ARRAY[]::text[],
  approved_urls           text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_dispatched_at      timestamptz,
  status                  public.lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Seed Baseline Transactional & Service Implicit Templates
INSERT INTO public.dlt_sms_templates 
  (template_code, dlt_pe_id, dlt_template_id, sender_header, category, template_body, registered_variables, approved_urls)
VALUES
  (
    'AUTH_MFA_OTP',
    '1101568940000021458',
    '1107168945672314567',
    'SYNEXT',
    'TRANSACTIONAL',
    'Your SynexTax login OTP is {#number#}. Valid for 5 minutes. Never share this code with anyone. - Synex Labs',
    ARRAY['#number#'],
    ARRAY[]::text[]
  ),
  (
    'CLIENT_PORTAL_MAGIC_LINK',
    '1101568940000021458',
    '1107168945672314568',
    'SYNEXT',
    'SERVICE_IMPLICIT',
    'Hello, your tax compliance portal link for {#cbn#} is: {#url#}. Access expires in 24 hours. - Synex Labs',
    ARRAY['#cbn#', '#url#'],
    ARRAY['https://portal.synextax.in']
  ),
  (
    'GSTR3B_APPROVAL_REQUEST',
    '1101568940000021458',
    '1107168945672314569',
    'SYNEXT',
    'SERVICE_IMPLICIT',
    'GSTR-3B for {#cbn#} for period {#cbn#} is ready for approval. Net tax payable is Rs. {#number#}. Review: {#url#} - Synex Labs',
    ARRAY['#cbn#', '#cbn#', '#number#', '#url#'],
    ARRAY['https://portal.synextax.in']
  ),
  (
    'RBI_PRE_DEBIT_NOTIFICATION',
    '1101568940000021458',
    '1107168945672314570',
    'SYNEXT',
    'SERVICE_IMPLICIT',
    'SynexTax subscription renewal reminder: Rs. {#number#} will be auto-debited in 24 hours for mandate {#cbn#}. Details: {#url#} - Synex Labs',
    ARRAY['#number#', '#cbn#', '#url#'],
    ARRAY['https://app.synextax.in/billing']
  );

CREATE VIEW public.v_dlt_inactive_template_radar WITH (security_invoker = true) AS
SELECT id, template_code, dlt_template_id, sender_header, last_dispatched_at,
       (current_date - last_dispatched_at::date) AS days_inactive
FROM public.dlt_sms_templates
WHERE status = 'ACTIVE'
  AND (last_dispatched_at IS NULL OR (current_date - last_dispatched_at::date) >= 75);

-- ---------------------------------------------------------------------
-- 2. Firm Subscription & RBI E-Mandate Management
-- ---------------------------------------------------------------------
CREATE TABLE public.firm_subscriptions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                     uuid NOT NULL REFERENCES public.firms(id),
  plan_code                   varchar(32) NOT NULL CHECK (plan_code IN ('SOLO_PRACTITIONER','GROWTH_FIRM','SCALE_PRACTICE')),
  billing_cadence             varchar(16) NOT NULL DEFAULT 'ANNUAL' CHECK (billing_cadence IN ('ANNUAL','SEMI_ANNUAL','QUARTERLY')),
  current_period_start        date NOT NULL,
  current_period_end          date NOT NULL,
  plan_base_amount            numeric(18,2) NOT NULL,
  is_rbi_auto_mandate_eligible boolean GENERATED ALWAYS AS (
                                (plan_base_amount * 1.18) <= 15000.00
                              ) STORED,
  mandate_id                  varchar(64),
  mandate_status              varchar(24) NOT NULL DEFAULT 'NOT_REGISTERED'
                              CHECK (mandate_status IN ('NOT_REGISTERED','ACTIVE','PAUSED','REVOKED','FAILED')),
  status                      public.lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  CHECK (current_period_end > current_period_start)
);
CREATE INDEX ix_subscriptions_firm ON public.firm_subscriptions (firm_id);

-- ---------------------------------------------------------------------
-- 3. B2B SaaS GST Invoices (SAC 998314 - 18% GST with Punjab 03 Split)
-- ---------------------------------------------------------------------
CREATE TABLE public.subscription_invoices (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number              varchar(32) NOT NULL UNIQUE,
  firm_id                     uuid NOT NULL REFERENCES public.firms(id),
  subscription_id             uuid NOT NULL,
  invoice_date                date NOT NULL,
  due_date                    date NOT NULL,
  sac_code                    char(6) NOT NULL DEFAULT '998314',
  recipient_gstin             varchar(15) CHECK (recipient_gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  recipient_state_code        char(2) NOT NULL,
  base_amount                 numeric(18,2) NOT NULL,

  is_intra_state              boolean GENERATED ALWAYS AS (recipient_state_code = '03') STORED,
  cgst_rate                   numeric(6,4) GENERATED ALWAYS AS (CASE WHEN recipient_state_code = '03' THEN 0.0900 ELSE 0.0000 END) STORED,
  cgst_amount                 numeric(18,2) GENERATED ALWAYS AS (CASE WHEN recipient_state_code = '03' THEN round((base_amount * 0.09), 2) ELSE 0.00 END) STORED,
  sgst_rate                   numeric(6,4) GENERATED ALWAYS AS (CASE WHEN recipient_state_code = '03' THEN 0.0900 ELSE 0.00 END) STORED,
  sgst_amount                 numeric(18,2) GENERATED ALWAYS AS (CASE WHEN recipient_state_code = '03' THEN round((base_amount * 0.09), 2) ELSE 0.00 END) STORED,
  igst_rate                   numeric(6,4) GENERATED ALWAYS AS (CASE WHEN recipient_state_code <> '03' THEN 0.1800 ELSE 0.0000 END) STORED,
  igst_amount                 numeric(18,2) GENERATED ALWAYS AS (CASE WHEN recipient_state_code <> '03' THEN round((base_amount * 0.18), 2) ELSE 0.00 END) STORED,
  total_tax_amount            numeric(18,2) GENERATED ALWAYS AS (round((base_amount * 0.18), 2)) STORED,
  total_invoice_amount        numeric(18,2) GENERATED ALWAYS AS (base_amount + round((base_amount * 0.18), 2)) STORED,

  rbi_pre_debit_sent_at       timestamptz,
  payment_method              varchar(16) NOT NULL DEFAULT 'ONLINE' CHECK (payment_method IN ('ONLINE','UPI_AUTOPAY','CARD_MANDATE','NEFT_RTGS','MANUAL')),
  payment_status              varchar(16) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID','PAID','REFUNDED','FAILED')),
  payment_link_url            text,
  paid_at                     timestamptz,
  irn                         char(64),
  qr_code_text                text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, subscription_id) REFERENCES public.firm_subscriptions (firm_id, id)
);
CREATE INDEX ix_sub_invoices_firm ON public.subscription_invoices (firm_id, payment_status);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.dlt_sms_templates      FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.firm_subscriptions     FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.subscription_invoices  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER trg_audit_sub_inv AFTER INSERT OR UPDATE OR DELETE ON public.subscription_invoices FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

RESET ROLE;
