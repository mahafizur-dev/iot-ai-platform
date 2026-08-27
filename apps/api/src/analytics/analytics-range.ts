import type { AnalyticsRange } from "@iot-ai-platform/shared-types";

const RANGE_MS: Record<AnalyticsRange, number> = {
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

export interface ResolvedRange {
  from: Date;
  to: Date;
  /**
   * Which continuous aggregate to read. 24h is dense enough to want hourly
   * buckets; a month of hourly buckets would be 720 points on a chart nobody
   * can read, so it rolls up to daily.
   */
  interval: "hour" | "day";
  /** Postgres `time_bucket`/`date_trunc` unit matching `interval`. */
  bucketUnit: "hour" | "day";
}

export function resolveRange(range: AnalyticsRange, now = Date.now()): ResolvedRange {
  const interval = range === "24h" ? "hour" : "day";

  return {
    from: new Date(now - RANGE_MS[range]),
    to: new Date(now),
    interval,
    bucketUnit: interval,
  };
}
