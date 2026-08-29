import { NotFoundException } from "@nestjs/common";
import { DevicesService } from "./devices.service";
import { DeviceQueryDto } from "./dto/device-query.dto";

function buildPrisma(
  overrides: {
    device?: unknown;
    devices?: unknown[];
    count?: number;
  } = {},
) {
  return {
    device: {
      create: jest.fn().mockResolvedValue(overrides.device ?? { id: "device-1" }),
      findMany: jest.fn().mockResolvedValue(overrides.devices ?? []),
      count: jest.fn().mockResolvedValue(overrides.count ?? 0),
      findFirst: jest.fn().mockResolvedValue(overrides.device ?? null),
      update: jest.fn().mockResolvedValue(overrides.device ?? { id: "device-1" }),
    },
    deviceCredential: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: "cred-1" }),
    },
  };
}

describe("DevicesService", () => {
  const orgId = "org-1";
  const deviceId = "device-1";

  it("creates a device, JSON-encoding metadata", async () => {
    const prisma = buildPrisma();
    const service = new DevicesService(prisma as never);

    await service.create(orgId, "user-1", {
      name: "Sensor",
      type: "temperature-sensor",
      metadata: { unit: "celsius" },
    });

    expect(prisma.device.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgId,
        ownerUserId: "user-1",
        metadata: JSON.stringify({ unit: "celsius" }),
      }),
    });
  });

  it("stores a null metadata column when none is given", async () => {
    const prisma = buildPrisma();
    const service = new DevicesService(prisma as never);

    await service.create(orgId, "user-1", { name: "Sensor", type: "temperature-sensor" });

    expect(prisma.device.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: null }),
    });
  });

  it("paginates and filters devices scoped to the organization", async () => {
    const prisma = buildPrisma({ devices: [{ id: deviceId }], count: 1 });
    const service = new DevicesService(prisma as never);
    const query = Object.assign(new DeviceQueryDto(), { status: "online" });

    const result = await service.findAllForOrg(orgId, query);

    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: orgId, status: "online" } }),
    );
    expect(result).toEqual({ items: [{ id: deviceId }], total: 1 });
  });

  it("throws NotFoundException when the device doesn't belong to the organization", async () => {
    const prisma = buildPrisma({ device: null });
    const service = new DevicesService(prisma as never);

    await expect(service.findOneForOrg(orgId, deviceId)).rejects.toThrow(NotFoundException);
  });

  it("revokes the previous credential and issues a new one on rotate", async () => {
    const prisma = buildPrisma({ device: { id: deviceId } });
    const service = new DevicesService(prisma as never);

    const rawToken = await service.rotateCredential(orgId, deviceId);

    expect(prisma.deviceCredential.updateMany).toHaveBeenCalledWith({
      where: { deviceId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("sets deactivatedAt on deactivate", async () => {
    const prisma = buildPrisma({ device: { id: deviceId } });
    const service = new DevicesService(prisma as never);

    await service.deactivate(orgId, deviceId);

    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: deviceId },
      data: { deactivatedAt: expect.any(Date) },
    });
  });
});
