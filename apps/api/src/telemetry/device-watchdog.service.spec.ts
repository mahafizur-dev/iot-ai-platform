import { DeviceWatchdogService } from "./device-watchdog.service";

const STALE_DEVICES = [
  { id: "device-1", organizationId: "org-1" },
  { id: "device-2", organizationId: "org-1" },
];

function buildPrisma(affected: { id: string; organizationId: string }[] = STALE_DEVICES) {
  return {
    device: {
      findMany: jest.fn().mockResolvedValue(affected),
      updateMany: jest.fn().mockResolvedValue({ count: affected.length }),
    },
    deviceEvent: { createMany: jest.fn().mockResolvedValue({ count: affected.length }) },
  };
}

function buildConfig(thresholdSeconds = 90) {
  return { getOrThrow: jest.fn().mockReturnValue(thresholdSeconds) };
}

function buildRealtime() {
  return { emitDeviceStatus: jest.fn() };
}

describe("DeviceWatchdogService", () => {
  it("selects stale/never-seen active devices", async () => {
    const prisma = buildPrisma();
    const service = new DeviceWatchdogService(
      prisma as never,
      buildConfig(90) as never,
      buildRealtime() as never,
    );

    await service.sweep();

    const { where } = prisma.device.findMany.mock.calls[0][0];
    expect(where.status).toEqual({ not: "offline" });
    expect(where.deactivatedAt).toBeNull();
    expect(where.OR).toEqual([{ lastSeenAt: null }, { lastSeenAt: { lt: expect.any(Date) } }]);
  });

  it("marks exactly the devices it selected offline", async () => {
    const prisma = buildPrisma();
    const service = new DeviceWatchdogService(
      prisma as never,
      buildConfig(90) as never,
      buildRealtime() as never,
    );

    await service.sweep();

    const call = prisma.device.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ status: "offline" });
    expect(call.where).toEqual({ id: { in: ["device-1", "device-2"] } });
  });

  it("pushes a status change for each device it flipped", async () => {
    const prisma = buildPrisma();
    const realtime = buildRealtime();
    const service = new DeviceWatchdogService(
      prisma as never,
      buildConfig(90) as never,
      realtime as never,
    );

    await service.sweep();

    // Without this the dashboard only learned about watchdog-driven offline
    // transitions on the next page load.
    expect(realtime.emitDeviceStatus).toHaveBeenCalledTimes(2);
    expect(realtime.emitDeviceStatus).toHaveBeenNthCalledWith(
      1,
      "org-1",
      "device-1",
      "offline",
      expect.any(Date),
    );
  });

  it("records a disconnected event per device, which uptime analytics reads", async () => {
    const prisma = buildPrisma();
    const service = new DeviceWatchdogService(
      prisma as never,
      buildConfig(90) as never,
      buildRealtime() as never,
    );

    await service.sweep();

    // Without these rows a device that dies silently — no LWT, no status
    // message — would look permanently online to calculateUptime.
    const { data } = prisma.deviceEvent.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      deviceId: "device-1",
      eventType: "disconnected",
      payload: { source: "watchdog", thresholdSeconds: 90 },
    });
  });

  it("does nothing at all when no device is stale", async () => {
    const prisma = buildPrisma([]);
    const realtime = buildRealtime();
    const service = new DeviceWatchdogService(
      prisma as never,
      buildConfig(90) as never,
      realtime as never,
    );

    await service.sweep();

    expect(prisma.device.updateMany).not.toHaveBeenCalled();
    expect(prisma.deviceEvent.createMany).not.toHaveBeenCalled();
    expect(realtime.emitDeviceStatus).not.toHaveBeenCalled();
  });

  it("swallows errors instead of throwing (must never crash the scheduler)", async () => {
    const prisma = { device: { findMany: jest.fn().mockRejectedValue(new Error("db down")) } };
    const service = new DeviceWatchdogService(
      prisma as never,
      buildConfig(90) as never,
      buildRealtime() as never,
    );

    await expect(service.sweep()).resolves.toBeUndefined();
  });
});
