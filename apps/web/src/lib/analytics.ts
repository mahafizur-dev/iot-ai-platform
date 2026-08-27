import type { AnalyticsRange } from "@iot-ai-platform/shared-types";
import type { BadgeProps } from "@/components/ui/badge";

export const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

/** "1h 5m" / "45s" / "—". Used for MTTA/MTTR and uptime totals. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  if (hours < 24) return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  return remainderHours ? `${days}d ${remainderHours}h` : `${days}d`;
}

export function formatPercent(ratio: number | null, fractionDigits = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/**
 * Uptime bands. 99% is the conventional "one nine short of fine" line and
 * 95% is where a device is plainly unreliable rather than merely flaky.
 */
export function uptimeVariant(ratio: number): NonNullable<BadgeProps["variant"]> {
  if (ratio >= 0.99) return "success";
  if (ratio >= 0.95) return "warning";
  return "destructive";
}

/** Large counts on KPI tiles: 1234 → "1.2k". */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 1000) return String(value);
  if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

/** Axis tick for a bucket timestamp — hours inside a day, dates beyond it. */
export function formatBucketTick(iso: string, range: AnalyticsRange): string {
  const date = new Date(iso);

  return range === "24h"
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}
