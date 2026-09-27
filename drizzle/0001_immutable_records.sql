-- Will versions and generated documents are legal records: once written they must never change.
-- Row-level UPDATE/DELETE is rejected at the database level (TRUNCATE, used only by the test
-- suite, is unaffected).
CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable (attempted %)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER will_versions_immutable
  BEFORE UPDATE OR DELETE ON will_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER documents_immutable
  BEFORE UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_plan_check CHECK (plan IN ('individual', 'couple'));
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('draft', 'paid', 'documents_ready', 'awaiting_execution', 'executed', 'filing_in_progress', 'filed', 'vaulted', 'cancelled', 'refunded'));
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_amount_check CHECK (amount_cents >= 0);
--> statement-breakpoint
ALTER TABLE wills ADD CONSTRAINT wills_position_check CHECK (position IN (1, 2));
--> statement-breakpoint
ALTER TABLE filing_tasks ADD CONSTRAINT filing_tasks_status_check CHECK (status IN ('pending', 'sent_to_court', 'filed', 'vaulted', 'cancelled'));
--> statement-breakpoint
ALTER TABLE filing_tasks ADD CONSTRAINT filing_tasks_method_check CHECK (method IN ('court_deposit', 'vault'));
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK (role IN ('customer', 'staff', 'admin'));
