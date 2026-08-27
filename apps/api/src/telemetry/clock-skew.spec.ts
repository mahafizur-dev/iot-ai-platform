import { resolveTelemetryTimestamp } from "./clock-skew";

describe("resolveTelemetryTimestamp", () => {
  const receivedAt = new Date("2026-08-27T12:00:00.000Z");

  it("uses server receipt time when the device reports no timestamp", () => {
    const result = resolveTelemetryTimestamp(undefined, receivedAt);
    expect(result).toEqual({ ts: receivedAt, skewed: false });
  });

  it("trusts a device timestamp within tolerance", () => {
    const deviceTs = "2026-08-27T11:59:00.000Z"; // 1 minute in the past
    const result = resolveTelemetryTimestamp(deviceTs, receivedAt);
    expect(result.skewed).toBe(false);
    expect(result.ts.toISOString()).toBe(new Date(deviceTs).toISOString());
  });

  it("clamps to receivedAt when the device timestamp is far in the future", () => {
    const deviceTs = "2026-08-27T12:10:00.000Z"; // 10 minutes ahead, beyond the 5-minute tolerance
    const result = resolveTelemetryTimestamp(deviceTs, receivedAt);
    expect(result).toEqual({ ts: receivedAt, skewed: true });
  });

  it("clamps to receivedAt when the device timestamp is absurdly old", () => {
    const deviceTs = "2026-08-01T00:00:00.000Z"; // well beyond the 24-hour tolerance
    const result = resolveTelemetryTimestamp(deviceTs, receivedAt);
    expect(result).toEqual({ ts: receivedAt, skewed: true });
  });
});
