import { deviceStatusSchema } from "./device-status.schema";

describe("deviceStatusSchema", () => {
  it("accepts online/offline", () => {
    expect(deviceStatusSchema.safeParse({ status: "online" }).success).toBe(true);
    expect(deviceStatusSchema.safeParse({ status: "offline", ts: "2026-08-27T12:00:00Z" }).success).toBe(true);
  });

  it("rejects an unknown status value", () => {
    expect(deviceStatusSchema.safeParse({ status: "unknown" }).success).toBe(false);
  });
});
