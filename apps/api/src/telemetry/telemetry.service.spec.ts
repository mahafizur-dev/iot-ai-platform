import { NotFoundException } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";

function buildPrisma(overrides: { findMany?: unknown[]; findFirst?: unknown; queryRaw?: unknown[] } = {}) {
  return {
    telemetry: {
      findMany: jest.fn().mockResolvedValue(overrides.findMany ?? []),
      findFirst: jest.fn().mockResolvedValue(overrides.findFirst ?? null),
    },
    $queryRaw: jest.fn().mockResolvedValue(overrides.queryRaw ?? []),
  };
}

function buildDevicesService(shouldThrow = false) {
  return {
    findOneForOrg: shouldThrow
      ? jest.fn().mockRejectedValue(new NotFoundException("Device not found"))
      : jest.fn().mockResolvedValue({ id: "device-1" }),
  };
}

describe("TelemetryService", () => {
  it("404s (via DevicesService) instead of leaking a cross-org device's telemetry", async () => {
    const prisma = buildPrisma();
    const devices = buildDevicesService(true);
    const service = new TelemetryService(prisma as never, devices as never);

    await expect(service.queryRange("org-1", "device-1", {})).rejects.toThrow(NotFoundException);
    expect(prisma.telemetry.findMany).not.toHaveBeenCalled();
  });

  it("queries raw telemetry rows when no agg/interval is given", async () => {
    const ts = new Date("2026-08-27T12:00:00.000Z");
    const prisma = buildPrisma({ findMany: [{ ts, metric: "temperature", value: 21.5, payload: { receivedAt: ts } }] });
    const devices = buildDevicesService();
    const service = new TelemetryService(prisma as never, devices as never);

    const result = await service.queryRange("org-1", "device-1", { metric: "temperature", from: "2026-08-27T00:00:00Z" });

    expect(prisma.telemetry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deviceId: "device-1", metric: "temperature" }) }),
    );
    expect(result).toEqual([{ ts: ts.toISOString(), metric: "temperature", value: 21.5, payload: { receivedAt: ts } }]);
  });

  it("queries the continuous-aggregate view via $queryRaw when agg+interval are given", async () => {
    const bucket = new Date("2026-08-27T00:00:00.000Z");
    const prisma = buildPrisma({ queryRaw: [{ bucket, metric: "temperature", value: 20, sample_count: 24 }] });
    const devices = buildDevicesService();
    const service = new TelemetryService(prisma as never, devices as never);

    const result = await service.queryRange("org-1", "device-1", {
      metric: "temperature",
      agg: "avg",
      interval: "day",
    });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result).toEqual([{ bucket: bucket.toISOString(), metric: "temperature", value: 20, sampleCount: 24 }]);
  });

  it("returns the single latest reading for a given metric", async () => {
    const ts = new Date("2026-08-27T12:00:00.000Z");
    const prisma = buildPrisma({ findFirst: { ts, metric: "temperature", value: 21.5, payload: null } });
    const devices = buildDevicesService();
    const service = new TelemetryService(prisma as never, devices as never);

    const result = await service.latest("org-1", "device-1", "temperature");

    expect(prisma.telemetry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deviceId: "device-1", metric: "temperature" } }),
    );
    expect(result).toEqual([{ ts: ts.toISOString(), metric: "temperature", value: 21.5, payload: null }]);
  });

  it("returns the latest reading per metric via DISTINCT ON when no metric filter is given", async () => {
    const ts = new Date("2026-08-27T12:00:00.000Z");
    const prisma = buildPrisma({
      queryRaw: [
        { ts, metric: "temperature", value: 21.5, payload: null },
        { ts, metric: "humidity", value: 55, payload: null },
      ],
    });
    const devices = buildDevicesService();
    const service = new TelemetryService(prisma as never, devices as never);

    const result = await service.latest("org-1", "device-1");

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });
});
