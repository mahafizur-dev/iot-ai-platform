import { parseDeviceTopic } from "./topics";

describe("parseDeviceTopic", () => {
  it("parses orgId/deviceId/suffix", () => {
    expect(parseDeviceTopic("iot/org-1/device-1/telemetry")).toEqual({
      orgId: "org-1",
      deviceId: "device-1",
      suffix: "telemetry",
    });
  });

  it("joins a multi-segment suffix", () => {
    expect(parseDeviceTopic("iot/org-1/device-1/commands/ack")).toEqual({
      orgId: "org-1",
      deviceId: "device-1",
      suffix: "commands/ack",
    });
  });

  it("returns null for a topic outside the iot/ namespace", () => {
    expect(parseDeviceTopic("other/org-1/device-1/telemetry")).toBeNull();
  });

  it("returns null when a segment is missing", () => {
    expect(parseDeviceTopic("iot/org-1")).toBeNull();
  });
});
