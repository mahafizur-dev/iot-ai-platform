import type { AlertCondition } from "@iot-ai-platform/shared-types";

export interface EvaluableRule {
  metric: string;
  condition: string;
  threshold: number;
  thresholdSecondary: number | null;
}

/** Floating-point equality needs a tolerance; telemetry values are doubles off the wire. */
const EQ_EPSILON = 1e-9;

/**
 * Pure breach test — no DB, no clock, no I/O. This is the heart of the alert
 * engine (docs/ARCHITECTURE.md §14 phase 4) and the one piece that must be
 * exhaustively testable, so everything stateful lives in the services that
 * call it.
 *
 * `range` means "breached when OUTSIDE [threshold, thresholdSecondary]" — the
 * useful reading for an alert, since operators write rules to catch a value
 * leaving its acceptable band, not entering one.
 */
export function isBreached(rule: EvaluableRule, value: number): boolean {
  if (!Number.isFinite(value)) {
    // A NaN/Infinity reading is a broken sensor, not a breach. Ingestion
    // stores whatever the device sent; refusing to alert on it keeps a
    // malfunctioning device from flooding the alert list.
    return false;
  }

  switch (rule.condition as AlertCondition) {
    case "gt":
      return value > rule.threshold;
    case "lt":
      return value < rule.threshold;
    case "eq":
      return Math.abs(value - rule.threshold) < EQ_EPSILON;
    case "range": {
      // A range rule with no upper bound is unenforceable. The DTO rejects
      // that at the API boundary; if one exists anyway (hand-written SQL, an
      // older row), never firing beats firing on every reading.
      if (rule.thresholdSecondary === null) return false;

      const low = Math.min(rule.threshold, rule.thresholdSecondary);
      const high = Math.max(rule.threshold, rule.thresholdSecondary);
      return value < low || value > high;
    }
    default:
      return false;
  }
}

/** Human-readable summary used as the alert `message` and notification body. */
export function describeBreach(rule: EvaluableRule, value: number): string {
  switch (rule.condition as AlertCondition) {
    case "gt":
      return `${rule.metric} is ${value} (above ${rule.threshold})`;
    case "lt":
      return `${rule.metric} is ${value} (below ${rule.threshold})`;
    case "eq":
      return `${rule.metric} is ${value}`;
    case "range": {
      const low = Math.min(rule.threshold, rule.thresholdSecondary ?? rule.threshold);
      const high = Math.max(rule.threshold, rule.thresholdSecondary ?? rule.threshold);
      return `${rule.metric} is ${value} (outside ${low}–${high})`;
    }
    default:
      return `${rule.metric} is ${value}`;
  }
}
