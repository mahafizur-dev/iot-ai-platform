import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  AlertsAnalytics,
  AnalyticsOverview,
  AnalyticsRange,
  DeviceTrends,
  EventsReport,
  TelemetryVolumePoint,
  UptimeReport,
} from "@iot-ai-platform/shared-types";
import { PrismaService } from "../database/prisma.service";
import { DevicesService } from "../devices/devices.service";
import { resolveRange } from "./analytics-range";
import { calculateUptime } from "./uptime";

interface CountRow {
  key: string;
  count: bigint | number;
}

interface BucketRow {
  bucket: Date;
  count: bigint | number;
}

interface TrendRow {
  metric: string;
  bucket: Date;
  avg_value: number;
  min_value: number;
  max_value: number;
  sample_count: bigint | number;
}

interface AlertTimingRow {
  triggered: bigint | number;
  mtta_seconds: number | null;
  mttr_seconds: number | null;
}

const num = (value: bigint | number): number => Number(value);

/**
 * Read-only aggregation over data the caller can already see
 * (docs/ARCHITECTURE.md §5, §14 phase 5).
 *
 * Telemetry volume and per-device trends read the Timescale continuous
 * aggregates rather than raw rows (§4a: "pre-computed rollups for the
 * analytics module instead of scanning raw rows"). Those views keep
 * real-time aggregation on — the DDL never sets `materialized_only` — so a
 * query still sees the current hour, not only what the refresh policy has
 * materialised.
 *
 * Every raw query joins `devices` on `organization_id`. That join IS the
 * tenancy boundary here: unlike the Prisma-modelled endpoints there is no
 * relation filter doing it implicitly, so removing one would silently leak
 * another org's data.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
  ) {}

  async overview(organizationId: string, range: AnalyticsRange): Promise<AnalyticsOverview> {
    const { from, to } = resolveRange(range);

    const [devices, telemetry, alertTiming, alertStatuses] = await Promise.all([
      this.deviceStatusCounts(organizationId),
      this.telemetryTotals(organizationId, from, to),
      this.alertTimings(organizationId, from, to),
      this.alertStatusCounts(organizationId, from, to),
    ]);

    const byStatus = new Map(alertStatuses.map((row) => [row.key, num(row.count)]));

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      devices,
      telemetry,
      alerts: {
        triggered: num(alertTiming.triggered),
        open: byStatus.get("open") ?? 0,
        acknowledged: byStatus.get("acknowledged") ?? 0,
        resolved: byStatus.get("resolved") ?? 0,
        meanTimeToAcknowledgeSeconds:
          alertTiming.mtta_seconds === null ? null : Math.round(alertTiming.mtta_seconds),
        meanTimeToResolveSeconds:
          alertTiming.mttr_seconds === null ? null : Math.round(alertTiming.mttr_seconds),
      },
    };
  }

  private async deviceStatusCounts(organizationId: string): Promise<AnalyticsOverview["devices"]> {
    const grouped = await this.prisma.device.groupBy({
      by: ["status"],
      where: { organizationId, deactivatedAt: null },
      _count: { _all: true },
    });

    const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
    const online = counts.get("online") ?? 0;
    const offline = counts.get("offline") ?? 0;
    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);

    return { total, online, offline, unknown: total - online - offline };
  }

  private async telemetryTotals(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<AnalyticsOverview["telemetry"]> {
    const [row] = await this.prisma.$queryRaw<{ points: bigint | number; streams: bigint | number }[]>(
      Prisma.sql`
        SELECT COALESCE(SUM(h.sample_count), 0) AS points,
               COUNT(DISTINCT (h.device_id, h.metric)) AS streams
        FROM telemetry_hourly h
        JOIN devices d ON d.id = h.device_id
        WHERE d.organization_id = ${organizationId}
          AND h.bucket >= ${from} AND h.bucket <= ${to}
      `,
    );

    return {
      points: row ? num(row.points) : 0,
      reportingStreams: row ? num(row.streams) : 0,
    };
  }

  private async alertTimings(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<AlertTimingRow> {
    const [row] = await this.prisma.$queryRaw<AlertTimingRow[]>(Prisma.sql`
      SELECT COUNT(*) AS triggered,
             AVG(EXTRACT(EPOCH FROM (a.acknowledged_at - a.triggered_at))) AS mtta_seconds,
             AVG(EXTRACT(EPOCH FROM (a.resolved_at - a.triggered_at))) AS mttr_seconds
      FROM alerts a
      JOIN devices d ON d.id = a.device_id
      WHERE d.organization_id = ${organizationId}
        AND a.triggered_at >= ${from} AND a.triggered_at <= ${to}
    `);

    return row ?? { triggered: 0, mtta_seconds: null, mttr_seconds: null };
  }

  private async alertStatusCounts(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<CountRow[]> {
    return this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT a.status AS key, COUNT(*) AS count
      FROM alerts a
      JOIN devices d ON d.id = a.device_id
      WHERE d.organization_id = ${organizationId}
        AND a.triggered_at >= ${from} AND a.triggered_at <= ${to}
      GROUP BY a.status
    `);
  }

  /** Telemetry throughput over time — the "is data still flowing" chart. */
  async telemetryVolume(
    organizationId: string,
    range: AnalyticsRange,
  ): Promise<TelemetryVolumePoint[]> {
    const { from, to, interval } = resolveRange(range);
    const view = Prisma.raw(interval === "hour" ? "telemetry_hourly" : "telemetry_daily");

    const rows = await this.prisma.$queryRaw<BucketRow[]>(Prisma.sql`
      SELECT h.bucket, SUM(h.sample_count) AS count
      FROM ${view} h
      JOIN devices d ON d.id = h.device_id
      WHERE d.organization_id = ${organizationId}
        AND h.bucket >= ${from} AND h.bucket <= ${to}
      GROUP BY h.bucket
      ORDER BY h.bucket ASC
    `);

    return rows.map((row) => ({ bucket: row.bucket.toISOString(), points: num(row.count) }));
  }

  async deviceTrends(
    organizationId: string,
    deviceId: string,
    range: AnalyticsRange,
  ): Promise<DeviceTrends> {
    // 404s for a cross-org device before any aggregate is read.
    await this.devicesService.findOneForOrg(organizationId, deviceId);

    const { from, to, interval } = resolveRange(range);
    const view = Prisma.raw(interval === "hour" ? "telemetry_hourly" : "telemetry_daily");

    const rows = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT metric, bucket, avg_value, min_value, max_value, sample_count
      FROM ${view}
      WHERE device_id = ${deviceId}
        AND bucket >= ${from} AND bucket <= ${to}
      ORDER BY metric ASC, bucket ASC
    `);

    const byMetric = new Map<string, DeviceTrends["series"][number]["points"]>();

    for (const row of rows) {
      const points = byMetric.get(row.metric) ?? [];
      points.push({
        bucket: row.bucket.toISOString(),
        avg: row.avg_value,
        min: row.min_value,
        max: row.max_value,
        sampleCount: num(row.sample_count),
      });
      byMetric.set(row.metric, points);
    }

    return {
      deviceId,
      range,
      interval,
      series: [...byMetric.entries()].map(([metric, points]) => ({ metric, points })),
    };
  }

  async uptime(organizationId: string, range: AnalyticsRange): Promise<UptimeReport> {
    const { from, to } = resolveRange(range);

    const devices = await this.prisma.device.findMany({
      where: { organizationId, deactivatedAt: null },
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
    });

    if (devices.length === 0) {
      return {
        range,
        from: from.toISOString(),
        to: to.toISOString(),
        devices: [],
        fleetUptimeRatio: null,
      };
    }

    const deviceIds = devices.map((device) => device.id);

    const [inWindow, priorStates] = await Promise.all([
      this.prisma.deviceEvent.findMany({
        where: {
          deviceId: { in: deviceIds },
          eventType: { in: ["connected", "disconnected"] },
          ts: { gte: from, lte: to },
        },
        select: { deviceId: true, eventType: true, ts: true },
      }),
      this.lastEventBeforeWindow(deviceIds, from),
    ]);

    const eventsByDevice = new Map<string, { eventType: string; ts: Date }[]>();
    for (const event of inWindow) {
      const list = eventsByDevice.get(event.deviceId) ?? [];
      list.push({ eventType: event.eventType, ts: event.ts });
      eventsByDevice.set(event.deviceId, list);
    }

    const priorByDevice = new Map(priorStates.map((row) => [row.device_id, row.event_type]));

    const report = devices.map((device) => {
      // What the device's state was entering the window. The last event before
      // `from` is authoritative; with no such event (a fleet younger than the
      // window, or a trail older than retention) the device's current status
      // is the best available answer.
      const prior = priorByDevice.get(device.id);
      const statusAtWindowStart: "online" | "offline" =
        prior === "connected"
          ? "online"
          : prior === "disconnected"
            ? "offline"
            : device.status === "online"
              ? "online"
              : "offline";

      const result = calculateUptime(
        eventsByDevice.get(device.id) ?? [],
        { from, to },
        statusAtWindowStart,
      );

      return {
        deviceId: device.id,
        deviceName: device.name,
        status: device.status,
        uptimeRatio: result.ratio,
        onlineSeconds: result.onlineSeconds,
        windowSeconds: result.windowSeconds,
        disconnections: result.disconnections,
      };
    });

    const fleetUptimeRatio =
      Math.round(
        (report.reduce((sum, entry) => sum + entry.uptimeRatio, 0) / report.length) * 10_000,
      ) / 10_000;

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      devices: report,
      fleetUptimeRatio,
    };
  }

  /** The most recent connectivity event before the window, per device. */
  private async lastEventBeforeWindow(
    deviceIds: string[],
    from: Date,
  ): Promise<{ device_id: string; event_type: string }[]> {
    return this.prisma.$queryRaw<{ device_id: string; event_type: string }[]>(Prisma.sql`
      SELECT DISTINCT ON (device_id) device_id, event_type
      FROM device_events
      WHERE device_id IN (${Prisma.join(deviceIds)})
        AND event_type IN ('connected', 'disconnected')
        AND ts < ${from}
      ORDER BY device_id, ts DESC
    `);
  }

  async events(organizationId: string, range: AnalyticsRange): Promise<EventsReport> {
    const { from, to, bucketUnit } = resolveRange(range);
    const unit = Prisma.raw(`'${bucketUnit}'`);

    const [byType, byBucket] = await Promise.all([
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT e.event_type AS key, COUNT(*) AS count
        FROM device_events e
        JOIN devices d ON d.id = e.device_id
        WHERE d.organization_id = ${organizationId}
          AND e.ts >= ${from} AND e.ts <= ${to}
        GROUP BY e.event_type
        ORDER BY count DESC
      `),
      this.prisma.$queryRaw<BucketRow[]>(Prisma.sql`
        SELECT date_trunc(${unit}, e.ts) AS bucket, COUNT(*) AS count
        FROM device_events e
        JOIN devices d ON d.id = e.device_id
        WHERE d.organization_id = ${organizationId}
          AND e.ts >= ${from} AND e.ts <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `),
    ]);

    const entries = byType.map((row) => ({ eventType: row.key, count: num(row.count) }));

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      byType: entries,
      byDay: byBucket.map((row) => ({ bucket: row.bucket.toISOString(), count: num(row.count) })),
      total: entries.reduce((sum, entry) => sum + entry.count, 0),
    };
  }

  async alerts(organizationId: string, range: AnalyticsRange): Promise<AlertsAnalytics> {
    const { from, to, bucketUnit } = resolveRange(range);
    const unit = Prisma.raw(`'${bucketUnit}'`);

    const [bySeverity, byStatus, byBucket, topDevices] = await Promise.all([
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT a.severity AS key, COUNT(*) AS count
        FROM alerts a JOIN devices d ON d.id = a.device_id
        WHERE d.organization_id = ${organizationId}
          AND a.triggered_at >= ${from} AND a.triggered_at <= ${to}
        GROUP BY a.severity
      `),
      this.alertStatusCounts(organizationId, from, to),
      this.prisma.$queryRaw<BucketRow[]>(Prisma.sql`
        SELECT date_trunc(${unit}, a.triggered_at) AS bucket, COUNT(*) AS count
        FROM alerts a JOIN devices d ON d.id = a.device_id
        WHERE d.organization_id = ${organizationId}
          AND a.triggered_at >= ${from} AND a.triggered_at <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `),
      this.prisma.$queryRaw<{ device_id: string; name: string; count: bigint | number }[]>(
        Prisma.sql`
          SELECT a.device_id, d.name, COUNT(*) AS count
          FROM alerts a JOIN devices d ON d.id = a.device_id
          WHERE d.organization_id = ${organizationId}
            AND a.triggered_at >= ${from} AND a.triggered_at <= ${to}
          GROUP BY a.device_id, d.name
          ORDER BY count DESC
          LIMIT 5
        `,
      ),
    ]);

    const severities = bySeverity.map((row) => ({ severity: row.key, count: num(row.count) }));

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      bySeverity: severities,
      byStatus: byStatus.map((row) => ({ status: row.key, count: num(row.count) })),
      byDay: byBucket.map((row) => ({ bucket: row.bucket.toISOString(), count: num(row.count) })),
      topDevices: topDevices.map((row) => ({
        deviceId: row.device_id,
        deviceName: row.name,
        count: num(row.count),
      })),
      total: severities.reduce((sum, entry) => sum + entry.count, 0),
    };
  }
}
