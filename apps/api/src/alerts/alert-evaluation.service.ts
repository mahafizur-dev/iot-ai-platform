import { Injectable, Logger } from "@nestjs/common";
import { Prisma, type Alert, type AlertRule } from "@prisma/client";
import type { AlertSeverity } from "@iot-ai-platform/shared-types";
import { PrismaService } from "../database/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AlertRulesService } from "./alert-rules.service";
import { describeBreach, isBreached } from "./alert-evaluator";
import { toAlertResponse } from "./alert-response";

/** Statuses that mean "this breach is still live" — see the partial unique index. */
const UNRESOLVED = ["open", "acknowledged"];

export interface EvaluationInput {
  organizationId: string;
  deviceId: string;
  metric: string;
  value: number;
  ts: Date;
}

/**
 * Rule evaluation (docs/ARCHITECTURE.md §14 phase 4). Called from the
 * ingestion worker after a reading is persisted, and from the scheduled sweep.
 *
 * The invariant it maintains: **one un-resolved alert per (rule, device)**.
 * A metric that sits above its threshold for an hour produces one alert, not
 * one per reading — and when the metric recovers, that alert is resolved
 * automatically rather than lingering until a human clears it.
 */
@Injectable()
export class AlertEvaluationService {
  private readonly logger = new Logger(AlertEvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertRulesService: AlertRulesService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async evaluateReading(input: EvaluationInput): Promise<void> {
    const rules = await this.alertRulesService.findMatchingRules(
      input.organizationId,
      input.deviceId,
      input.metric,
    );

    for (const rule of rules) {
      try {
        await this.applyRule(rule, input);
      } catch (error) {
        // One bad rule must not stop the others, and must not fail the
        // ingestion job — the reading itself is already persisted.
        this.logger.error(`Alert rule "${rule.id}" evaluation failed`, error);
      }
    }
  }

  private async applyRule(rule: AlertRule, input: EvaluationInput): Promise<void> {
    const breached = isBreached(rule, input.value);

    const existing = await this.prisma.alert.findFirst({
      where: { ruleId: rule.id, deviceId: input.deviceId, status: { in: UNRESOLVED } },
    });

    if (breached && !existing) {
      await this.openAlert(rule, input);
      return;
    }

    if (!breached && existing) {
      await this.autoResolve(existing, input);
    }
  }

  private async openAlert(rule: AlertRule, input: EvaluationInput): Promise<void> {
    const message = describeBreach(rule, input.value);

    let alert: Alert;
    try {
      alert = await this.prisma.alert.create({
        data: {
          ruleId: rule.id,
          deviceId: input.deviceId,
          metric: input.metric,
          severity: rule.severity,
          message,
          status: "open",
          triggeredAt: input.ts,
          context: {
            value: input.value,
            condition: rule.condition,
            threshold: rule.threshold,
            thresholdSecondary: rule.thresholdSecondary,
            observedAt: input.ts.toISOString(),
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (error) {
      // P2002 = the partial unique index fired, i.e. a concurrent worker
      // opened this same alert first. That is the index doing its job, not a
      // failure worth logging as one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return;
      }
      throw error;
    }

    const device = await this.prisma.device.findUnique({
      where: { id: input.deviceId },
      select: { name: true },
    });

    const response = toAlertResponse({ ...alert, device });
    this.realtimeService.emitAlertTriggered(input.organizationId, response);

    await this.notificationsService.notifyOrganization(input.organizationId, {
      type: "alert:triggered",
      title: `${severityLabel(rule.severity)}: ${device?.name ?? "Device"}`,
      body: message,
      relatedEntityType: "alert",
      relatedEntityId: alert.id,
    });
  }

  private async autoResolve(existing: Alert, input: EvaluationInput): Promise<void> {
    // `resolvedBy` stays null: nobody resolved this, the metric recovered.
    const resolved = await this.prisma.alert.update({
      where: { id: existing.id },
      data: { status: "resolved", resolvedAt: new Date() },
      include: { device: { select: { name: true } } },
    });

    this.realtimeService.emitAlertUpdated(input.organizationId, toAlertResponse(resolved));

    await this.notificationsService.notifyOrganization(input.organizationId, {
      type: "alert:resolved",
      title: `Resolved: ${resolved.device?.name ?? "Device"}`,
      body: `${input.metric} is back within range (${input.value})`,
      relatedEntityType: "alert",
      relatedEntityId: resolved.id,
    });
  }
}

function severityLabel(severity: string): string {
  return (
    { info: "Info", warning: "Warning", critical: "Critical" }[severity as AlertSeverity] ??
    "Alert"
  );
}
