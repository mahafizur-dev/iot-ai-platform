-- Hand-written DDL Prisma cannot express (same situation as
-- prisma/timescale/telemetry-hypertable.sql): a UNIQUE index with a WHERE
-- clause. Apply it the same way — `prisma migrate dev --create-only`, paste
-- this into the generated migration, then `prisma migrate dev`.
--
-- Why it matters: AlertEvaluationService keeps at most one un-resolved alert
-- per (rule, device) so a metric that stays breached produces one alert rather
-- than one per reading. The service checks before inserting, but the ingestion
-- worker runs at concurrency 10, so two readings for the same device can be
-- in-flight together and both pass the check. This index makes the database
-- the arbiter; the service catches the resulting P2002 and treats it as
-- "someone else already opened it".

CREATE UNIQUE INDEX IF NOT EXISTS alerts_one_open_per_rule_device
  ON alerts (rule_id, device_id)
  WHERE status <> 'resolved';
