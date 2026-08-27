/** Alerts & notifications contract (docs/ARCHITECTURE.md §4, §5). */

export const ALERT_CONDITIONS = ["gt", "lt", "eq", "range"] as const;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ["open", "acknowledged", "resolved"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ["in_app", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Notification `type` doubles as the preference `eventType` key, so a user
 * silencing "alert:triggered" silences exactly the notifications that carry
 * that type. Keep the two in step.
 */
export const NOTIFICATION_TYPES = ["alert:triggered", "alert:resolved"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AlertRuleResponse {
  id: string;
  organizationId: string;
  /** null means the rule applies to every device in the org. */
  deviceId: string | null;
  deviceName: string | null;
  metric: string;
  condition: AlertCondition;
  threshold: number;
  /** Upper bound; set only when `condition` is "range". */
  thresholdSecondary: number | null;
  severity: AlertSeverity;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertResponse {
  id: string;
  ruleId: string;
  deviceId: string;
  deviceName: string | null;
  metric: string;
  status: AlertStatus;
  severity: AlertSeverity;
  message: string;
  context: Record<string, unknown> | null;
  triggeredAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface NotificationResponse {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferenceResponse {
  eventType: string;
  channel: NotificationChannel;
  enabled: boolean;
}
