/** Analytics contract (docs/ARCHITECTURE.md §5, §14 phase 5). */

export const ANALYTICS_RANGES = ["24h", "7d", "30d"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export interface AnalyticsOverview {
  range: AnalyticsRange;
  from: string;
  to: string;
  devices: {
    total: number;
    online: number;
    offline: number;
    unknown: number;
  };
  telemetry: {
    /** Readings stored inside the window. */
    points: number;
    /** Distinct (device, metric) pairs that reported inside the window. */
    reportingStreams: number;
  };
  alerts: {
    triggered: number;
    open: number;
    acknowledged: number;
    resolved: number;
    /** Mean time to acknowledge, in seconds; null when nothing was acknowledged. */
    meanTimeToAcknowledgeSeconds: number | null;
    /** Mean time to resolve, in seconds; null when nothing was resolved. */
    meanTimeToResolveSeconds: number | null;
  };
}

export interface TelemetryVolumePoint {
  bucket: string;
  points: number;
}

export interface DeviceTrendSeries {
  metric: string;
  points: { bucket: string; avg: number; min: number; max: number; sampleCount: number }[];
}

export interface DeviceTrends {
  deviceId: string;
  range: AnalyticsRange;
  interval: "hour" | "day";
  series: DeviceTrendSeries[];
}

export interface DeviceUptime {
  deviceId: string;
  deviceName: string;
  status: string;
  uptimeRatio: number;
  onlineSeconds: number;
  windowSeconds: number;
  disconnections: number;
}

export interface UptimeReport {
  range: AnalyticsRange;
  from: string;
  to: string;
  devices: DeviceUptime[];
  /** Unweighted mean across devices; null when the org has none. */
  fleetUptimeRatio: number | null;
}

export interface EventBreakdownEntry {
  eventType: string;
  count: number;
}

export interface EventsReport {
  range: AnalyticsRange;
  from: string;
  to: string;
  byType: EventBreakdownEntry[];
  byDay: { bucket: string; count: number }[];
  total: number;
}

export interface AlertsAnalytics {
  range: AnalyticsRange;
  from: string;
  to: string;
  bySeverity: { severity: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byDay: { bucket: string; count: number }[];
  /** Devices raising the most alerts in the window, worst first. */
  topDevices: { deviceId: string; deviceName: string; count: number }[];
  total: number;
}
