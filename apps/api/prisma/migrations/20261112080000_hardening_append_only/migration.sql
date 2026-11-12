-- Fase 08: audit log dan riwayat status menjadi append-only di level database
-- (memakai fungsi forbid_mutation dari migrasi Fase 04). TRUNCATE tidak terpengaruh (dipakai test).
CREATE TRIGGER "audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
CREATE TRIGGER "asset_status_events_append_only" BEFORE UPDATE OR DELETE ON "asset_status_events"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
CREATE TRIGGER "order_status_events_append_only" BEFORE UPDATE OR DELETE ON "order_status_events"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();

-- Rollback:
--   DROP TRIGGER "audit_logs_append_only" ON "audit_logs";
--   DROP TRIGGER "asset_status_events_append_only" ON "asset_status_events";
--   DROP TRIGGER "order_status_events_append_only" ON "order_status_events";
