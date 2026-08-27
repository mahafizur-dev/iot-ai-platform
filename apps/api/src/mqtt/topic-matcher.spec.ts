import { matchesTopicFilter } from "./topic-matcher";

describe("matchesTopicFilter", () => {
  it("matches a literal topic", () => {
    expect(matchesTopicFilter("iot/org-1/device-1/telemetry", "iot/org-1/device-1/telemetry")).toBe(true);
  });

  it("matches single-level wildcards", () => {
    expect(matchesTopicFilter("iot/+/+/telemetry", "iot/org-1/device-1/telemetry")).toBe(true);
  });

  it("does not let + cross a level boundary", () => {
    expect(matchesTopicFilter("iot/+/telemetry", "iot/org-1/device-1/telemetry")).toBe(false);
  });

  it("matches trailing multi-level wildcards", () => {
    expect(matchesTopicFilter("iot/+/+/commands/#", "iot/org-1/device-1/commands/ack")).toBe(true);
  });

  it("does not match a different literal segment", () => {
    expect(matchesTopicFilter("iot/+/+/telemetry", "iot/org-1/device-1/status")).toBe(false);
  });
});
