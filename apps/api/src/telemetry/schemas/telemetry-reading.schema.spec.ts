import { telemetryPayloadSchema } from "./telemetry-reading.schema";

describe("telemetryPayloadSchema", () => {
  it("accepts a single reading", () => {
    const result = telemetryPayloadSchema.safeParse({ metric: "temperature", value: 21.5 });
    expect(result.success).toBe(true);
  });

  it("accepts a batch of readings", () => {
    const result = telemetryPayloadSchema.safeParse([
      { metric: "temperature", value: 21.5, ts: "2026-08-27T12:00:00Z" },
      { metric: "humidity", value: 55, payload: { sensor: "sht31" } },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a reading missing a required field", () => {
    const result = telemetryPayloadSchema.safeParse({ metric: "temperature" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric value", () => {
    const result = telemetryPayloadSchema.safeParse({ metric: "temperature", value: "hot" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed ts", () => {
    const result = telemetryPayloadSchema.safeParse({ metric: "temperature", value: 1, ts: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty batch array", () => {
    const result = telemetryPayloadSchema.safeParse([]);
    expect(result.success).toBe(false);
  });
});
