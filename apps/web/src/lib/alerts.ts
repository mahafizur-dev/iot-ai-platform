import type { AlertResponse, AlertRuleResponse } from "@iot-ai-platform/shared-types";
import type { BadgeProps } from "@/components/ui/badge";

export function severityVariant(severity: string): NonNullable<BadgeProps["variant"]> {
  switch (severity) {
    case "critical":
      return "destructive";
    case "warning":
      return "warning";
    case "info":
      return "secondary";
    default:
      return "outline";
  }
}

export function alertStatusVariant(status: string): NonNullable<BadgeProps["variant"]> {
  switch (status) {
    case "open":
      return "destructive";
    case "acknowledged":
      return "warning";
    case "resolved":
      return "success";
    default:
      return "secondary";
  }
}

const CONDITION_SYMBOL: Record<string, string> = {
  gt: ">",
  lt: "<",
  eq: "=",
};

/** "temperature > 30" / "temperature outside 10–20" — the rule in one line. */
export function describeRule(rule: Pick<AlertRuleResponse, "metric" | "condition" | "threshold" | "thresholdSecondary">): string {
  if (rule.condition === "range") {
    const low = Math.min(rule.threshold, rule.thresholdSecondary ?? rule.threshold);
    const high = Math.max(rule.threshold, rule.thresholdSecondary ?? rule.threshold);
    return `${rule.metric} outside ${low}–${high}`;
  }

  return `${rule.metric} ${CONDITION_SYMBOL[rule.condition] ?? rule.condition} ${rule.threshold}`;
}

/**
 * Applies a live `alert:triggered` / `alert:updated` event to a loaded list.
 *
 * Both events go through here because the list is filtered: an alert that was
 * acknowledged may no longer belong in an "open" view, so an update is an
 * upsert-or-remove rather than a straight replace. Returning the same
 * reference when nothing changed keeps React from re-rendering on events for
 * alerts this view isn't showing.
 */
export function applyAlertEvent(
  alerts: AlertResponse[],
  incoming: AlertResponse,
  statusFilter: string,
): AlertResponse[] {
  const matchesFilter = statusFilter === "all" || incoming.status === statusFilter;
  const index = alerts.findIndex((alert) => alert.id === incoming.id);

  if (index === -1) {
    // Newest first, matching the API's triggeredAt DESC ordering.
    return matchesFilter ? [incoming, ...alerts] : alerts;
  }

  if (!matchesFilter) {
    return alerts.filter((alert) => alert.id !== incoming.id);
  }

  const next = [...alerts];
  next[index] = incoming;
  return next;
}
