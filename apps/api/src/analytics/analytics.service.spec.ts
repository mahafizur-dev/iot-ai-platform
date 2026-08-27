import { NotFoundException } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";

const ORG_ID = "org-1";

function buildDevices(ownsDevice = true) {
  return {
    findOneForOrg: ownsDevice
      ? jest.fn().mockResolvedValue({ id: "device-1" })
      : jest.fn().mockRejectedValue(new NotFoundException("Device not found")),
  };
}

describe("AnalyticsService", () => {
  describe("overview", () => {
    function buildPrisma(overrides: { raw?: unknown[][]; grouped?: unknown[] } = {}) {
      const raw = overrides.raw ?? [];
      const queryRaw = jest.fn();
      raw.forEach((result) => queryRaw.mockResolvedValueOnce(result));
      queryRaw.mockResolvedValue([]);

      return {
        $queryRaw: queryRaw,
        device: {
          groupBy: jest.fn().mockResolvedValue(
            overrides.grouped ?? [
              { status: "online", _count: { _all: 5 } },
              { status: "offline", _count: { _all: 2 } },
              { status: "unknown", _count: { _all: 1 } },
            ],
          ),
        },
      };
    }

    it("derives the unknown bucket from the total rather than trusting a status label", async () => {
      const prisma = buildPrisma({
        grouped: [
          { status: "online", _count: { _all: 5 } },
          { status: "offline", _count: { _all: 2 } },
          { status: "provisioning", _count: { _all: 3 } },
        ],
      });
      const service = new AnalyticsService(prisma as never, buildDevices() as never);

      const result = await service.overview(ORG_ID, "24h");

      expect(result.devices).toEqual({ total: 10, online: 5, offline: 2, unknown: 3 });
    });

    it("converts bigint counts coming back from raw SQL into numbers", async () => {
      // pg returns COUNT(*) as bigint; leaving it would serialise as a
      // BigInt and blow up JSON.stringify in the response.
      const prisma = buildPrisma({
        raw: [
          [{ points: 1234n, streams: 7n }],
          [{ triggered: 9n, mtta_seconds: 61.4, mttr_seconds: 900.6 }],
          [{ key: "open", count: 4n }],
        ],
      });
      const service = new AnalyticsService(prisma as never, buildDevices() as never);

      const result = await service.overview(ORG_ID, "24h");

      expect(result.telemetry).toEqual({ points: 1234, reportingStreams: 7 });
      expect(result.alerts.triggered).toBe(9);
      expect(result.alerts.open).toBe(4);
    });

    it("rounds mean times and reports null when nothing was acknowledged or resolved", async () => {
      const prisma = buildPrisma({
        raw: [
          [{ points: 0n, streams: 0n }],
          [{ triggered: 2n, mtta_seconds: 61.4, mttr_seconds: null }],
          [],
        ],
      });
      const service = new AnalyticsService(prisma as never, buildDevices() as never);

      const result = await service.overview(ORG_ID, "24h");

      expect(result.alerts.meanTimeToAcknowledgeSeconds).toBe(61);
      expect(result.alerts.meanTimeToResolveSeconds).toBeNull();
    });

    it("reports zeroes rather than throwing when the aggregates return no rows", async () => {
      const prisma = buildPrisma({ raw: [[], [], []] });
      const service = new AnalyticsService(prisma as never, buildDevices() as never);

      const result = await service.overview(ORG_ID, "24h");

      expect(result.telemetry).toEqual({ points: 0, reportingStreams: 0 });
      expect(result.alerts.triggered).toBe(0);
    });

    it("scopes the device counts to the caller's organization and skips deactivated devices", async () => {
      const prisma = buildPrisma();
      const service = new AnalyticsService(prisma as never, buildDevices() as never);

      await service.overview(ORG_ID, "24h");

      expect(prisma.device.groupBy.mock.calls[0][0].where).toEqual({
        organizationId: ORG_ID,
        deactivatedAt: null,
      });
    });
  });

  describe("deviceTrends", () => {
    function buildPrisma(rows: unknown[] = []) {
      return { $queryRaw: jest.fn().mockResolvedValue(rows) };
    }

    it("404s for a cross-org device before reading any aggregate", async () => {
      const prisma = buildPrisma();
      const service = new AnalyticsService(prisma as never, buildDevices(false) as never);

      await expect(service.deviceTrends(ORG_ID, "someone-elses", "24h")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("groups flat rows into one series per metric, preserving bucket order", async () => {
      const prisma = buildPrisma([
        { metric: "humidity", bucket: new Date("2026-08-27T00:00:00Z"), avg_value: 50, min_value: 45, max_value: 55, sample_count: 60n },
        { metric: "temperature", bucket: new Date("2026-08-27T00:00:00Z"), avg_value: 21, min_value: 20, max_value: 22, sample_count: 60n },
        { metric: "temperature", bucket: new Date("2026-08-27T01:00:00Z"), avg_value: 23, min_value: 22, max_value: 24, sample_count: 60n },
      ]);
      const service = new AnalyticsService(prisma as never, buildDevices() as never);

      const result = await service.deviceTrends(ORG_ID, "device-1", "24h");

      expect(result.series.map((series) => series.metric)).toEqual(["humidity", "temperature"]);
      expect(result.series[1]?.points).toHaveLength(2);
      expect(result.series[1]?.points[0]?.sampleCount).toBe(60);
    });

    it("uses hourly buckets for 24h and daily for longer ranges", async () => {
      const service = new AnalyticsService(buildPrisma() as never, buildDevices() as never);

      expect((await service.deviceTrends(ORG_ID, "device-1", "24h")).interval).toBe("hour");
      expect((await service.deviceTrends(ORG_ID, "device-1", "30d")).interval).toBe("day");
    });
  });

  describe("uptime", () => {
    function buildPrisma(devices: unknown[], events: unknown[] = [], prior: unknown[] = []) {
      return {
        device: { findMany: jest.fn().mockResolvedValue(devices) },
        deviceEvent: { findMany: jest.fn().mockResolvedValue(events) },
        $queryRaw: jest.fn().mockResolvedValue(prior),
      };
    }

    it("returns an empty report rather than dividing by zero for an org with no devices", async () => {
      const service = new AnalyticsService(buildPrisma([]) as never, buildDevices() as never);

      const result = await service.uptime(ORG_ID, "24h");

      expect(result.devices).toEqual([]);
      expect(result.fleetUptimeRatio).toBeNull();
    });

    it("carries the last event before the window in as the starting state", async () => {
      // A device that disconnected yesterday and has published nothing since
      // has no events inside a 24h window, but was down for all of it.
      const prisma = buildPrisma(
        [{ id: "device-1", name: "Boiler 01", status: "online" }],
        [],
        [{ device_id: "device-1", event_type: "disconnected" }],
      );
      const service = new AnalyticsService(prisma as never, buildDevices() as never);

      const result = await service.uptime(ORG_ID, "24h");

      expect(result.devices[0]?.uptimeRatio).toBe(0);
    });

    it("falls back to the device's current status when no prior event exists", async () => {
      const prisma = buildPrisma([{ id: "device-1", name: "Boiler 01", status: "online" }], [], []);
      const service = new AnalyticsService(prisma as never, buildDevices() as never);

      const result = await service.uptime(ORG_ID, "24h");

      expect(result.devices[0]?.uptimeRatio).toBe(1);
    });

    it("averages across devices for the fleet figure", async () => {
      const prisma = buildPrisma(
        [
          { id: "device-1", name: "A", status: "online" },
          { id: "device-2", name: "B", status: "offline" },
        ],
        [],
        [],
      );
      const service = new AnalyticsService(prisma as never, buildDevices() as never);

      const result = await service.uptime(ORG_ID, "24h");

      expect(result.fleetUptimeRatio).toBe(0.5);
    });
  });

  describe("events", () => {
    it("totals the per-type counts rather than issuing a separate count query", async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([
          { key: "connected", count: 4n },
          { key: "error", count: 1n },
        ])
        .mockResolvedValueOnce([{ bucket: new Date("2026-08-27T00:00:00Z"), count: 5n }]);

      const service = new AnalyticsService({ $queryRaw: queryRaw } as never, buildDevices() as never);

      const result = await service.events(ORG_ID, "7d");

      expect(result.total).toBe(5);
      expect(result.byType).toEqual([
        { eventType: "connected", count: 4 },
        { eventType: "error", count: 1 },
      ]);
      expect(result.byDay).toEqual([{ bucket: "2026-08-27T00:00:00.000Z", count: 5 }]);
    });
  });

  describe("alerts", () => {
    it("shapes severity, status, bucket, and top-device breakdowns", async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([{ key: "critical", count: 3n }])
        .mockResolvedValueOnce([{ key: "open", count: 2n }])
        .mockResolvedValueOnce([{ bucket: new Date("2026-08-27T00:00:00Z"), count: 3n }])
        .mockResolvedValueOnce([{ device_id: "device-1", name: "Boiler 01", count: 3n }]);

      const service = new AnalyticsService({ $queryRaw: queryRaw } as never, buildDevices() as never);

      const result = await service.alerts(ORG_ID, "7d");

      expect(result.total).toBe(3);
      expect(result.bySeverity).toEqual([{ severity: "critical", count: 3 }]);
      expect(result.byStatus).toEqual([{ status: "open", count: 2 }]);
      expect(result.topDevices).toEqual([
        { deviceId: "device-1", deviceName: "Boiler 01", count: 3 },
      ]);
    });
  });
});
