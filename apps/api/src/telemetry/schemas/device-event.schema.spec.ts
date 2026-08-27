import { deviceEventSchema } from "./device-event.schema";

describe("deviceEventSchema", () => {
  it("accepts a known event type", () => {
    expect(deviceEventSchema.safeParse({ eventType: "error", payload: { code: "E01" } }).success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(deviceEventSchema.safeParse({ eventType: "banana" }).success).toBe(false);
  });
});
