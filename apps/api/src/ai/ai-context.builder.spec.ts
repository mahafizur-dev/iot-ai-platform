import { NotFoundException } from "@nestjs/common";
import { AIContextBuilder } from "./ai-context.builder";

const ORG_ID = "org-1";

const OVERVIEW = {
  range: "24h",
  from: "2026-08-26T12:00:00.000Z",
  to: "2026-08-27T12:00:00.000Z",
  devices: { total: 3, online: 2, offline: 1, unknown: 0 },
  telemetry: { points: 4200, reportingStreams: 9 },
  alerts: {
    triggered: 2,
    open: 1,
    acknowledged: 0,
    resolved: 1,
    meanTimeToAcknowledgeSeconds: null,
    meanTimeToResolveSeconds: 600,
  },
};

function buildAnalytics() {
  return {
    overview: jest.fn().mockResolvedValue(OVERVIEW),
    deviceTrends: jest.fn().mockResolvedValue({
      deviceId: "device-1",
      range: "24h",
      interval: "hour",
      series: [
        {
          metric: "temperature",
          points: [
            { bucket: "2026-08-27T10:00:00.000Z", avg: 21.5, min: 20, max: 23, sampleCount: 60 },
            { bucket: "2026-08-27T11:00:00.000Z", avg: 22.5, min: 21, max: 24, sampleCount: 60 },
          ],
        },
      ],
    }),
  };
}

function buildDevices(owns = true) {
  return {
    findOneForOrg: owns
      ? jest.fn().mockResolvedValue({
          id: "device-1",
          name: "Boiler 01",
          type: "sensor",
          model: "MX-100",
          status: "online",
          lastSeenAt: new Date("2026-08-27T11:59:00.000Z"),
        })
      : jest.fn().mockRejectedValue(new NotFoundException("Device not found")),
  };
}

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    device: { findMany: jest.fn().mockResolvedValue([]) },
    alert: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    telemetry: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe("AIContextBuilder", () => {
  describe("buildChatContext", () => {
    it("scopes both listings to the caller's organization", async () => {
      const prisma = buildPrisma();
      const builder = new AIContextBuilder(
        prisma as never,
        buildDevices() as never,
        buildAnalytics() as never,
      );

      const context = await builder.buildChatContext(ORG_ID);

      expect(prisma.device.findMany.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG_ID,
        deactivatedAt: null,
      });
      expect(prisma.alert.findMany.mock.calls[0][0].where.device).toEqual({
        organizationId: ORG_ID,
      });
      expect(context.organizationId).toBe(ORG_ID);
    });

    it("bounds both listings so a large fleet cannot produce an unbounded prompt", async () => {
      const prisma = buildPrisma();
      const builder = new AIContextBuilder(
        prisma as never,
        buildDevices() as never,
        buildAnalytics() as never,
      );

      await builder.buildChatContext(ORG_ID);

      expect(prisma.device.findMany.mock.calls[0][0].take).toBe(25);
      expect(prisma.alert.findMany.mock.calls[0][0].take).toBe(15);
    });

    it("selects only non-secret device fields", async () => {
      // The select clauses are allow-lists: credentials must never be
      // reachable from anything that becomes a prompt.
      const prisma = buildPrisma();
      const builder = new AIContextBuilder(
        prisma as never,
        buildDevices() as never,
        buildAnalytics() as never,
      );

      await builder.buildChatContext(ORG_ID);

      const { select } = prisma.device.findMany.mock.calls[0][0];
      expect(Object.keys(select).sort()).toEqual(["lastSeenAt", "name", "status", "type"]);
      expect(select).not.toHaveProperty("credentials");
    });

    it("states the fleet summary as facts the model can rely on", async () => {
      const builder = new AIContextBuilder(
        buildPrisma() as never,
        buildDevices() as never,
        buildAnalytics() as never,
      );

      const context = await builder.buildChatContext(ORG_ID);

      expect(context.facts.join("\n")).toContain("3 devices — 2 online, 1 offline");
      expect(context.requestType).toBe("chat");
    });

    it("says so explicitly when there are no devices or alerts", async () => {
      // An empty context must read as "nothing here", not as an absence the
      // model might fill in.
      const builder = new AIContextBuilder(
        buildPrisma() as never,
        buildDevices() as never,
        buildAnalytics() as never,
      );

      const facts = (await builder.buildChatContext(ORG_ID)).facts.join("\n");

      expect(facts).toContain("No devices registered.");
      expect(facts).toContain("No open alerts.");
    });
  });

  describe("buildTelemetrySummaryContext", () => {
    it("404s for a device in another org before any telemetry is read", async () => {
      const analytics = buildAnalytics();
      const builder = new AIContextBuilder(
        buildPrisma() as never,
        buildDevices(false) as never,
        analytics as never,
      );

      await expect(
        builder.buildTelemetrySummaryContext(ORG_ID, "someone-elses", "24h"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(analytics.deviceTrends).not.toHaveBeenCalled();
    });

    it("uses the Timescale rollups rather than raw rows", async () => {
      const analytics = buildAnalytics();
      const prisma = buildPrisma();
      const builder = new AIContextBuilder(
        prisma as never,
        buildDevices() as never,
        analytics as never,
      );

      await builder.buildTelemetrySummaryContext(ORG_ID, "device-1", "7d");

      expect(analytics.deviceTrends).toHaveBeenCalledWith(ORG_ID, "device-1", "7d");
      expect(prisma.telemetry.findMany).not.toHaveBeenCalled();
    });

    it("includes the device identity and the per-metric aggregates", async () => {
      const builder = new AIContextBuilder(
        buildPrisma() as never,
        buildDevices() as never,
        buildAnalytics() as never,
      );

      const context = await builder.buildTelemetrySummaryContext(ORG_ID, "device-1", "24h");
      const facts = context.facts.join("\n");

      expect(facts).toContain("Boiler 01");
      expect(facts).toContain("temperature: 2 buckets, overall avg 22, min 20, max 24");
      expect(context.requestType).toBe("summary");
    });
  });

  describe("buildAlertContext", () => {
    const ALERT = {
      id: "alert-1",
      metric: "temperature",
      status: "open",
      severity: "critical",
      message: "temperature is 34 (above 30)",
      context: null,
      triggeredAt: new Date("2026-08-27T12:00:00.000Z"),
      acknowledgedAt: null,
      resolvedAt: null,
      device: { id: "device-1", name: "Boiler 01", type: "sensor", status: "online" },
      rule: { condition: "gt", threshold: 30, thresholdSecondary: null, severity: "critical" },
    };

    it("404s for an alert in another org", async () => {
      const builder = new AIContextBuilder(
        buildPrisma() as never,
        buildDevices() as never,
        buildAnalytics() as never,
      );

      await expect(builder.buildAlertContext(ORG_ID, "someone-elses")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("scopes the alert lookup through the device's organization", async () => {
      const prisma = buildPrisma({
        alert: { findFirst: jest.fn().mockResolvedValue(ALERT), findMany: jest.fn() },
      });
      const builder = new AIContextBuilder(
        prisma as never,
        buildDevices() as never,
        buildAnalytics() as never,
      );

      await builder.buildAlertContext(ORG_ID, "alert-1");

      expect(prisma.alert.findFirst.mock.calls[0][0].where).toEqual({
        id: "alert-1",
        device: { organizationId: ORG_ID },
      });
    });

    it("pulls a bounded window of readings around the trigger", async () => {
      const prisma = buildPrisma({
        alert: { findFirst: jest.fn().mockResolvedValue(ALERT), findMany: jest.fn() },
      });
      const builder = new AIContextBuilder(
        prisma as never,
        buildDevices() as never,
        buildAnalytics() as never,
      );

      await builder.buildAlertContext(ORG_ID, "alert-1");

      const call = prisma.telemetry.findMany.mock.calls[0][0];
      // One hour before to 15 minutes after, so the model can describe the
      // approach to the threshold, not just the breaching value.
      expect(call.where.ts.gte).toEqual(new Date("2026-08-27T11:00:00.000Z"));
      expect(call.where.ts.lte).toEqual(new Date("2026-08-27T12:15:00.000Z"));
      expect(call.where.metric).toBe("temperature");
      expect(call.take).toBe(24);
    });

    it("states the rule that tripped alongside the alert", async () => {
      const prisma = buildPrisma({
        alert: { findFirst: jest.fn().mockResolvedValue(ALERT), findMany: jest.fn() },
      });
      const builder = new AIContextBuilder(
        prisma as never,
        buildDevices() as never,
        buildAnalytics() as never,
      );

      const facts = (await builder.buildAlertContext(ORG_ID, "alert-1")).facts.join("\n");

      expect(facts).toContain("Rule: temperature gt 30.");
      expect(facts).toContain("No raw readings retained around the trigger time.");
    });
  });
});
