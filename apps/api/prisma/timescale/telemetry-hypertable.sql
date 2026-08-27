-- Timescale-specific DDL for the `telemetry` table (docs/ARCHITECTURE.md §4a).
-- Prisma has no native hypertable/continuous-aggregate support, so this is
-- never auto-generated — it must be pasted into a scaffolded migration by hand:
--
--   pnpm --filter api exec prisma migrate dev --create-only --name telemetry_hypertable
--   # paste the contents of this file into the generated migration.sql
--   pnpm --filter api exec prisma migrate dev
--
-- Run this AFTER the plain `telemetry` table already exists (i.e. after the
-- Postgres baseline migration that creates it via the Prisma schema).

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Partition on `ts` (device-reported timestamp — see schema.prisma's comment
-- on the Telemetry model for why). 1-day chunks: small enough that indexes
-- and vacuum stay cheap, large enough not to explode chunk count at v1 scale.
SELECT create_hypertable('telemetry', 'ts', chunk_time_interval => INTERVAL '1 day');

-- Hourly + daily rollups per (device_id, metric) — the only two granularities
-- ARCHITECTURE.md §4a/§14 calls for. Anything else queries raw rows directly.
CREATE MATERIALIZED VIEW telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT
  device_id,
  metric,
  time_bucket('1 hour', ts) AS bucket,
  avg(value) AS avg_value,
  min(value) AS min_value,
  max(value) AS max_value,
  count(*) AS sample_count
FROM telemetry
GROUP BY device_id, metric, bucket;

CREATE MATERIALIZED VIEW telemetry_daily
WITH (timescaledb.continuous) AS
SELECT
  device_id,
  metric,
  time_bucket('1 day', ts) AS bucket,
  avg(value) AS avg_value,
  min(value) AS min_value,
  max(value) AS max_value,
  count(*) AS sample_count
FROM telemetry
GROUP BY device_id, metric, bucket;

SELECT add_continuous_aggregate_policy('telemetry_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

SELECT add_continuous_aggregate_policy('telemetry_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day');

-- Retention/compression per ARCHITECTURE.md §4a's example numbers: compress
-- chunks older than 7 days, drop raw rows older than 90 days (the hourly/daily
-- aggregates above are unaffected by dropping raw rows).
SELECT add_compression_policy('telemetry', compress_after => INTERVAL '7 days');
SELECT add_retention_policy('telemetry', drop_after => INTERVAL '90 days');
