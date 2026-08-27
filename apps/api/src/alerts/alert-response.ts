import type { Alert, AlertRule, Device } from "@prisma/client";
import type {
  AlertCondition,
  AlertResponse,
  AlertRuleResponse,
  AlertSeverity,
  AlertStatus,
} from "@iot-ai-platform/shared-types";

/**
 * Prisma stores condition/severity/status as plain strings (the schema sketch
 * in docs/ARCHITECTURE.md §4 uses SQL enums; Prisma enums would need a
 * migration per added value). The DTOs validate them on the way in, so the
 * cast here narrows what the boundary already guaranteed.
 */
export function toAlertRuleResponse(
  rule: AlertRule & { device?: Pick<Device, "name"> | null },
): AlertRuleResponse {
  return {
    id: rule.id,
    organizationId: rule.organizationId,
    deviceId: rule.deviceId,
    deviceName: rule.device?.name ?? null,
    metric: rule.metric,
    condition: rule.condition as AlertCondition,
    threshold: rule.threshold,
    thresholdSecondary: rule.thresholdSecondary,
    severity: rule.severity as AlertSeverity,
    enabled: rule.enabled,
    createdBy: rule.createdBy,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function toAlertResponse(
  alert: Alert & { device?: Pick<Device, "name"> | null },
): AlertResponse {
  return {
    id: alert.id,
    ruleId: alert.ruleId,
    deviceId: alert.deviceId,
    deviceName: alert.device?.name ?? null,
    metric: alert.metric,
    status: alert.status as AlertStatus,
    severity: alert.severity as AlertSeverity,
    message: alert.message,
    context: (alert.context as Record<string, unknown> | null) ?? null,
    triggeredAt: alert.triggeredAt.toISOString(),
    acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: alert.acknowledgedBy,
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    resolvedBy: alert.resolvedBy,
  };
}
