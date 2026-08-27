export const TELEMETRY_RANGES = ["1h", "24h", "7d", "30d"] as const;
export type TelemetryRange = (typeof TELEMETRY_RANGES)[number];

export const RANGE_LABELS: Record<TelemetryRange, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const RANGE_MS: Record<TelemetryRange, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

export interface TelemetryRangeQuery {
  from: string;
  to: string;
  metric: string;
  agg?: "avg";
  interval?: "hour" | "day";
}

/**
 * Picks raw rows vs. a Timescale continuous aggregate based on how much wall
 * clock the range covers. The raw endpoint caps at 1000 rows (see the API's
 * TelemetryService), so a week of second-resolution telemetry would come back
 * silently truncated to its oldest slice — the hourly/daily rollups cover the
 * long ranges instead, and are far cheaper to serve.
 */
export function resolveRangeQuery(
  range: TelemetryRange,
  metric: string,
  now = Date.now(),
): TelemetryRangeQuery {
  const to = new Date(now).toISOString();
  const from = new Date(now - RANGE_MS[range]).toISOString();

  if (range === "7d") {
    return { from, to, metric, agg: "avg", interval: "hour" };
  }

  if (range === "30d") {
    return { from, to, metric, agg: "avg", interval: "day" };
  }

  return { from, to, metric };
}

export function isAggregated(range: TelemetryRange): boolean {
  return range === "7d" || range === "30d";
}
