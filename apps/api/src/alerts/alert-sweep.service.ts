import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AlertEvaluationService } from "./alert-evaluation.service";

const SWEEP_INTERVAL_MS = 60_000;

interface LatestReadingRow {
  device_id: string;
  organization_id: string;
  metric: string;
  value: number;
  ts: Date;
}

/**
 * The second half of "evaluation on ingest + scheduled sweep"
 * (docs/ARCHITECTURE.md §14 phase 4). Ingest-time evaluation only ever sees
 * metrics that are still arriving, which leaves two gaps this closes:
 *
 * 1. A rule created or re-enabled *after* the last reading would not fire
 *    until the device next publishes — which, for a device reporting hourly,
 *    means an hour of silence on a threshold that is already breached.
 * 2. A device that goes quiet while breached keeps its alert open forever,
 *    because nothing arrives to clear it. The sweep re-checks against the
 *    stored latest reading, so recovery is noticed even if the metric that
 *    recovered was the device's last message before it went offline.
 *
 * It reuses AlertEvaluationService, so the open/dedupe/auto-resolve invariant
 * is defined in exactly one place.
 */
@Injectable()
export class AlertSweepService {
  private readonly logger = new Logger(AlertSweepService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationService: AlertEvaluationService,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    // A sweep that overruns its interval must not stack up behind itself.
    if (this.running) {
      this.logger.warn("Previous alert sweep still running; skipping this tick");
      return;
    }

    this.running = true;
    try {
      const readings = await this.latestReadingsForRuledMetrics();

      for (const reading of readings) {
        await this.evaluationService.evaluateReading({
          organizationId: reading.organization_id,
          deviceId: reading.device_id,
          metric: reading.metric,
          value: reading.value,
          ts: reading.ts,
        });
      }
    } catch (error) {
      this.logger.error("Alert sweep failed", error);
    } finally {
      this.running = false;
    }
  }

  /**
   * The latest reading per (device, metric) — but only for the metrics some
   * enabled rule actually watches, so a fleet reporting fifty metrics with two
   * rules does two evaluations per device rather than fifty.
   *
   * Raw SQL for `DISTINCT ON`, which Prisma cannot express and which is far
   * cheaper here than ordering and de-duplicating in JS.
   */
  private async latestReadingsForRuledMetrics(): Promise<LatestReadingRow[]> {
    return this.prisma.$queryRaw<LatestReadingRow[]>(Prisma.sql`
      SELECT DISTINCT ON (t.device_id, t.metric)
             t.device_id, d.organization_id, t.metric, t.value, t.ts
      FROM telemetry t
      JOIN devices d ON d.id = t.device_id
      JOIN alert_rules r
        ON r.organization_id = d.organization_id
       AND r.metric = t.metric
       AND r.enabled = true
       AND (r.device_id IS NULL OR r.device_id = t.device_id)
      WHERE d.deactivated_at IS NULL
      ORDER BY t.device_id, t.metric, t.ts DESC
    `);
  }
}
