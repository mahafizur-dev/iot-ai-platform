import { alertStatusVariant, applyAlertEvent, describeRule, severityVariant } from "@/lib/alerts";
import type { AlertResponse } from "@iot-ai-platform/shared-types";

function alert(overrides: Partial<AlertResponse> & { id: string }): AlertResponse {
  return {
    ruleId: "rule-1",
    deviceId: "device-1",
    deviceName: "Boiler 01",
    metric: "temperature",
    status: "open",
    severity: "critical",
    message: "temperature is 34 (above 30)",
    context: null,
    triggeredAt: "2026-08-27T12:00:00.000Z",
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}

describe("describeRule", () => {
  it("renders comparisons with a symbol", () => {
    expect(describeRule({ metric: "temperature", condition: "gt", threshold: 30, thresholdSecondary: null })).toBe(
      "temperature > 30",
    );
    expect(describeRule({ metric: "battery", condition: "lt", threshold: 20, thresholdSecondary: null })).toBe(
      "battery < 20",
    );
  });

  it("renders a range as a band, normalising the bound order", () => {
    expect(
      describeRule({ metric: "humidity", condition: "range", threshold: 60, thresholdSecondary: 40 }),
    ).toBe("humidity outside 40–60");
  });
});

describe("severityVariant / alertStatusVariant", () => {
  it("maps severities to badge variants", () => {
    expect(severityVariant("critical")).toBe("destructive");
    expect(severityVariant("warning")).toBe("warning");
    expect(severityVariant("info")).toBe("secondary");
  });

  it("maps statuses to badge variants", () => {
    expect(alertStatusVariant("open")).toBe("destructive");
    expect(alertStatusVariant("acknowledged")).toBe("warning");
    expect(alertStatusVariant("resolved")).toBe("success");
  });
});

describe("applyAlertEvent", () => {
  it("prepends a newly triggered alert that matches the filter", () => {
    const existing = [alert({ id: "a" })];

    const next = applyAlertEvent(existing, alert({ id: "b" }), "open");

    expect(next.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("ignores a new alert that does not match the filter", () => {
    const existing = [alert({ id: "a" })];

    const next = applyAlertEvent(existing, alert({ id: "b", status: "resolved" }), "open");

    expect(next).toBe(existing);
  });

  it("removes an alert that no longer matches the filter after an update", () => {
    // Acknowledging an alert should take it out of the "open" view rather
    // than leaving a row whose badge contradicts the filter.
    const existing = [alert({ id: "a" }), alert({ id: "b" })];

    const next = applyAlertEvent(existing, alert({ id: "a", status: "acknowledged" }), "open");

    expect(next.map((item) => item.id)).toEqual(["b"]);
  });

  it("replaces in place when the updated alert still matches", () => {
    const existing = [alert({ id: "a" }), alert({ id: "b" })];

    const next = applyAlertEvent(
      existing,
      alert({ id: "a", status: "acknowledged", acknowledgedBy: "user-1" }),
      "all",
    );

    expect(next.map((item) => item.id)).toEqual(["a", "b"]);
    expect(next[0]?.acknowledgedBy).toBe("user-1");
  });

  it("accepts any status under the 'all' filter", () => {
    const next = applyAlertEvent([], alert({ id: "a", status: "resolved" }), "all");

    expect(next).toHaveLength(1);
  });
});
