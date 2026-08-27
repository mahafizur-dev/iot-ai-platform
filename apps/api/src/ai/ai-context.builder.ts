import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { DevicesService } from "../devices/devices.service";
import type { AIContext } from "./ai-provider.interface";

/** Hard ceilings, so a large fleet can never produce an unbounded prompt. */
const MAX_DEVICES = 25;
const MAX_ALERTS = 15;
const MAX_TREND_POINTS = 24;
const MAX_METRICS = 6;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * docs/ARCHITECTURE.md §9: "assembles only data the requesting user is
 * authorized to see, and only bounded aggregates/summaries (not raw unlimited
 * telemetry dumps)".
 *
 * Both halves of that are load-bearing and neither is enforced anywhere else:
 *
 * - **Authorization.** Every query below is scoped by the caller's
 *   `organizationId`, and single-entity lookups go through the same
 *   `findOneForOrg` helpers the REST endpoints use, so a cross-org id 404s
 *   here exactly as it would there. The provider never queries anything, so
 *   this file is the only place an org boundary could be crossed.
 *
 * - **Boundedness.** Prompt size is cost. The caps above are what stop a
 *   thousand-device fleet or a month of one-second telemetry from becoming a
 *   single enormous request; aggregates are used in place of raw rows for the
 *   same reason.
 *
 * Nothing secret goes in: device credentials, password hashes, refresh
 * tokens, and the EMQX hook secret are simply never selected. The `select`
 * clauses below are allow-lists, not conveniences.
 */
@Injectable()
export class AIContextBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  /** Fleet-level context for free-form chat. */
  async buildChatContext(organizationId: string): Promise<AIContext> {
    const [overview, devices, openAlerts] = await Promise.all([
      this.analyticsService.overview(organizationId, "24h"),
      this.prisma.device.findMany({
        where: { organizationId, deactivatedAt: null },
        select: { name: true, type: true, status: true, lastSeenAt: true },
        orderBy: { name: "asc" },
        take: MAX_DEVICES,
      }),
      this.prisma.alert.findMany({
        where: { device: { organizationId }, status: { in: ["open", "acknowledged"] } },
        select: {
          severity: true,
          status: true,
          message: true,
          triggeredAt: true,
          device: { select: { name: true } },
        },
        orderBy: { triggeredAt: "desc" },
        take: MAX_ALERTS,
      }),
    ]);

    const facts = [
      `Fleet: ${overview.devices.total} devices — ${overview.devices.online} online, ${overview.devices.offline} offline, ${overview.devices.unknown} never reported.`,
      `Last 24h: ${overview.telemetry.points} readings across ${overview.telemetry.reportingStreams} device/metric streams.`,
      `Last 24h alerts: ${overview.alerts.triggered} triggered, ${overview.alerts.open} still open, ${overview.alerts.resolved} resolved.`,
      "",
      devices.length === 0 ? "No devices registered." : `Devices (up to ${MAX_DEVICES} shown):`,
      ...devices.map(
        (device) =>
          `- ${device.name} (${device.type}) — ${device.status}, last seen ${device.lastSeenAt?.toISOString() ?? "never"}`,
      ),
      "",
      openAlerts.length === 0
        ? "No open alerts."
        : `Open or acknowledged alerts (up to ${MAX_ALERTS} shown):`,
      ...openAlerts.map(
        (alert) =>
          `- [${alert.severity}/${alert.status}] ${alert.device.name}: ${alert.message} (since ${alert.triggeredAt.toISOString()})`,
      ),
    ];

    return {
      requestType: "chat",
      organizationId,
      facts,
      data: { overview, deviceCount: devices.length, openAlertCount: openAlerts.length },
    };
  }

  /** One device's recent behaviour, from the Timescale rollups rather than raw rows. */
  async buildTelemetrySummaryContext(
    organizationId: string,
    deviceId: string,
    range: "24h" | "7d" | "30d",
  ): Promise<AIContext> {
    const device = await this.devicesService.findOneForOrg(organizationId, deviceId);
    const trends = await this.analyticsService.deviceTrends(organizationId, deviceId, range);

    const series = trends.series.slice(0, MAX_METRICS);

    const facts = [
      `Device: ${device.name} (${device.type}${device.model ? `, model ${device.model}` : ""}).`,
      `Status: ${device.status}. Last seen: ${device.lastSeenAt?.toISOString() ?? "never"}.`,
      `Window: ${range}, bucketed by ${trends.interval}.`,
      "",
      series.length === 0
        ? "No telemetry stored for this device in the window."
        : "Telemetry (avg/min/max per bucket, most recent last):",
      ...series.flatMap((entry) => {
        // Tail rather than head: the recent end of the window is what an
        // operator is asking about.
        const points = entry.points.slice(-MAX_TREND_POINTS);
        const values = points.map((point) => point.avg);

        return [
          `- ${entry.metric}: ${points.length} buckets, overall avg ${round(
            values.reduce((sum, value) => sum + value, 0) / (values.length || 1),
          )}, min ${round(Math.min(...points.map((point) => point.min)))}, max ${round(
            Math.max(...points.map((point) => point.max)),
          )}`,
          `  series: ${points.map((point) => `${point.bucket}=${round(point.avg)}`).join(", ")}`,
        ];
      }),
    ];

    return {
      requestType: "summary",
      organizationId,
      facts,
      data: { deviceId, deviceName: device.name, range, metrics: series.map((s) => s.metric) },
    };
  }

  /** One alert, the rule behind it, and the metric's behaviour around the trigger. */
  async buildAlertContext(organizationId: string, alertId: string): Promise<AIContext> {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, device: { organizationId } },
      select: {
        id: true,
        metric: true,
        status: true,
        severity: true,
        message: true,
        context: true,
        triggeredAt: true,
        acknowledgedAt: true,
        resolvedAt: true,
        device: { select: { id: true, name: true, type: true, status: true } },
        rule: {
          select: { condition: true, threshold: true, thresholdSecondary: true, severity: true },
        },
      },
    });

    if (!alert) {
      // 404, not 403 — the same no-existence-leak convention the REST
      // endpoints follow for a cross-org id.
      throw new NotFoundException("Alert not found");
    }

    // A window around the trigger, so the model can describe the approach to
    // the threshold rather than just the single breaching value.
    const windowStart = new Date(alert.triggeredAt.getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(alert.triggeredAt.getTime() + 15 * 60 * 1000);

    const readings = await this.prisma.telemetry.findMany({
      where: {
        deviceId: alert.device.id,
        metric: alert.metric,
        ts: { gte: windowStart, lte: windowEnd },
      },
      select: { ts: true, value: true },
      orderBy: { ts: "asc" },
      take: MAX_TREND_POINTS,
    });

    const facts = [
      `Alert: ${alert.message}`,
      `Severity: ${alert.severity}. Status: ${alert.status}. Triggered at ${alert.triggeredAt.toISOString()}.`,
      alert.acknowledgedAt ? `Acknowledged at ${alert.acknowledgedAt.toISOString()}.` : "Not acknowledged.",
      alert.resolvedAt ? `Resolved at ${alert.resolvedAt.toISOString()}.` : "Not resolved.",
      `Device: ${alert.device.name} (${alert.device.type}), currently ${alert.device.status}.`,
      `Rule: ${alert.metric} ${alert.rule.condition} ${alert.rule.threshold}${
        alert.rule.thresholdSecondary === null ? "" : `..${alert.rule.thresholdSecondary}`
      }.`,
      "",
      readings.length === 0
        ? "No raw readings retained around the trigger time."
        : `Readings for ${alert.metric} from one hour before to 15 minutes after the trigger:`,
      ...readings.map((reading) => `- ${reading.ts.toISOString()}: ${round(reading.value)}`),
    ];

    return {
      requestType: "explain_alert",
      organizationId,
      facts,
      data: {
        alertId: alert.id,
        deviceId: alert.device.id,
        metric: alert.metric,
        severity: alert.severity,
        readingCount: readings.length,
      },
    };
  }
}
