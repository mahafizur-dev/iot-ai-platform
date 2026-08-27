import type { BadgeProps } from "@/components/ui/badge";

/**
 * Device status is a plain string on the API side (schema.prisma defaults it
 * to "unknown"; ingestion and the watchdog set "online"/"offline"), so this
 * maps defensively rather than exhaustively over a union.
 */
export function statusVariant(status: string): NonNullable<BadgeProps["variant"]> {
  switch (status) {
    case "online":
      return "success";
    case "offline":
      return "destructive";
    case "unknown":
      return "warning";
    default:
      return "secondary";
  }
}

const UNITS: { limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: 60_000, divisor: 1_000, unit: "second" },
  { limit: 3_600_000, divisor: 60_000, unit: "minute" },
  { limit: 86_400_000, divisor: 3_600_000, unit: "hour" },
  { limit: 2_592_000_000, divisor: 86_400_000, unit: "day" },
];

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 minutes ago" / "Never" — used for `lastSeenAt` and telemetry timestamps. */
export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "Never";

  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "Unknown";

  const deltaMs = timestamp - now;
  const magnitude = Math.abs(deltaMs);

  for (const { limit, divisor, unit } of UNITS) {
    if (magnitude < limit) {
      return relative.format(Math.round(deltaMs / divisor), unit);
    }
  }

  return new Date(iso).toLocaleDateString();
}

/** Telemetry values are doubles; trim the float noise without hiding small ones. */
export function formatMetricValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return String(value);

  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** Turns `temperature_c` / `batteryLevel` into a readable axis or column label. */
export function humanizeMetric(metric: string): string {
  return metric
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}
