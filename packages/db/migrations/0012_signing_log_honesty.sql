-- =====================================================================
-- SynexTax | Migration 0012 | Signing trail records what was actually checked
-- Until the server verifies a CMS signature against the token certificate,
-- a signing is logged as UNVERIFIED with an UNKNOWN token profile instead of
-- being recorded as a verified FIPS signature.
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE audit.signing_audit_logs DROP CONSTRAINT signing_audit_logs_token_profile_check;
ALTER TABLE audit.signing_audit_logs ADD CONSTRAINT signing_audit_logs_token_profile_check
  CHECK (token_profile IN ('FIPS_140_2','FIPS_140_3','EVC','AADHAAR','UNKNOWN'));

ALTER TABLE audit.signing_audit_logs DROP CONSTRAINT signing_audit_logs_status_check;
ALTER TABLE audit.signing_audit_logs ADD CONSTRAINT signing_audit_logs_status_check
  CHECK (status IN ('SUCCESS','FAILED','REJECTED','UNVERIFIED'));

RESET ROLE;
