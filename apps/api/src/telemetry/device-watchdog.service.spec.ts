import { DeviceWatchdogService } from "./device-watchdog.service";

function buildPrisma(count = 0) {
  return { device: { updateMany: jest.fn().mockResolvedValue({ count }) } };
}

function buildConfig(thresholdSeconds = 90) {
  return { getOrThrow: jest.fn().mockReturnValue(thresholdSeconds) };
}

describe("DeviceWatchdogService", () => {
  it("marks stale/never-seen active devices offline", async () => {
    const prisma = buildPrisma(2);
    const config = buildConfig(90);
    const service = new DeviceWatchdogService(prisma as never, config as never);

    await service.sweep();

    const call = prisma.device.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ status: "offline" });
    expect(call.where.status).toEqual({ not: "offline" });
    expect(call.where.deactivatedAt).toBeNull();
    expect(call.where.OR).toEqual([
      { lastSeenAt: null },
      { lastSeenAt: { lt: expect.any(Date) } },
    ]);
  });

  it("swallows errors instead of throwing (must never crash the scheduler)", async () => {
    const prisma = { device: { updateMany: jest.fn().mockRejectedValue(new Error("db down")) } };
    const config = buildConfig(90);
    const service = new DeviceWatchdogService(prisma as never, config as never);

    await expect(service.sweep()).resolves.toBeUndefined();
  });
});
