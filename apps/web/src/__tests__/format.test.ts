import { formatMetricValue, formatRelativeTime, humanizeMetric, statusVariant } from "@/lib/format";

const NOW = Date.parse("2026-08-27T12:00:00.000Z");

describe("statusVariant", () => {
  it("maps the statuses the platform actually emits", () => {
    expect(statusVariant("online")).toBe("success");
    expect(statusVariant("offline")).toBe("destructive");
    expect(statusVariant("unknown")).toBe("warning");
  });

  it("falls back for statuses it has never seen", () => {
    expect(statusVariant("decommissioned")).toBe("secondary");
  });
});

describe("formatRelativeTime", () => {
  it("renders a placeholder for a device that has never reported", () => {
    expect(formatRelativeTime(null)).toBe("Never");
  });

  it("scales the unit to the age of the timestamp", () => {
    expect(formatRelativeTime("2026-08-27T11:58:00.000Z", NOW)).toContain("minute");
    expect(formatRelativeTime("2026-08-27T09:00:00.000Z", NOW)).toContain("hour");
    expect(formatRelativeTime("2026-08-25T12:00:00.000Z", NOW)).toContain("day");
  });

  it("falls back to a date once the timestamp is older than a month", () => {
    expect(formatRelativeTime("2026-01-01T12:00:00.000Z", NOW)).not.toContain("ago");
  });

  it("does not throw on a malformed timestamp", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("Unknown");
  });
});

describe("formatMetricValue", () => {
  it("leaves integers alone and trims float noise", () => {
    expect(formatMetricValue(21)).toBe("21");
    expect(formatMetricValue(21.123456)).toBe("21.123");
  });

  it("renders a placeholder for a non-finite value", () => {
    expect(formatMetricValue(Number.NaN)).toBe("—");
  });
});

describe("humanizeMetric", () => {
  it("reads snake_case and camelCase metric keys as labels", () => {
    expect(humanizeMetric("temperature_c")).toBe("Temperature c");
    expect(humanizeMetric("batteryLevel")).toBe("Battery Level");
  });
});
