import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AlertsService } from "./alerts.service";

const ORG_ID = "org-1";

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "alert-1",
    ruleId: "rule-1",
    deviceId: "device-1",
    metric: "temperature",
    status: "open",
    severity: "critical",
    message: "temperature is 34 (above 30)",
    context: null,
    triggeredAt: new Date("2026-08-27T12:00:00.000Z"),
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    device: { name: "Boiler 01", organizationId: ORG_ID },
    ...overrides,
  };
}

function buildPrisma(found: unknown = alertRow()) {
  return {
    alert: {
      findFirst: jest.fn().mockResolvedValue(found),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(alertRow(data)),
        ),
    },
  };
}

function buildRealtime() {
  return { emitAlertUpdated: jest.fn() };
}

describe("AlertsService", () => {
  describe("scoping", () => {
    it("filters through the device's organization, since alerts have no org column", async () => {
      const prisma = buildPrisma();
      const service = new AlertsService(prisma as never, buildRealtime() as never);

      await service.findAllForOrg(ORG_ID, { page: 1, limit: 20 });

      expect(prisma.alert.findMany.mock.calls[0][0].where.device).toEqual({
        organizationId: ORG_ID,
      });
    });

    it("404s rather than 403s for another org's alert (no existence leak)", async () => {
      const prisma = buildPrisma(null);
      const service = new AlertsService(prisma as never, buildRealtime() as never);

      await expect(service.findOneForOrg(ORG_ID, "someone-elses")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("acknowledge", () => {
    it("stamps who acknowledged it and pushes the change", async () => {
      const prisma = buildPrisma();
      const realtime = buildRealtime();
      const service = new AlertsService(prisma as never, realtime as never);

      await service.acknowledge(ORG_ID, "alert-1", "user-1");

      expect(prisma.alert.update.mock.calls[0][0].data).toMatchObject({
        status: "acknowledged",
        acknowledgedBy: "user-1",
      });
      expect(realtime.emitAlertUpdated).toHaveBeenCalledWith(ORG_ID, expect.anything());
    });

    it("is idempotent — acknowledging twice does not re-stamp or re-emit", async () => {
      const prisma = buildPrisma(alertRow({ status: "acknowledged" }));
      const realtime = buildRealtime();
      const service = new AlertsService(prisma as never, realtime as never);

      await service.acknowledge(ORG_ID, "alert-1", "user-2");

      expect(prisma.alert.update).not.toHaveBeenCalled();
      expect(realtime.emitAlertUpdated).not.toHaveBeenCalled();
    });

    it("refuses to acknowledge an already-resolved alert", async () => {
      const prisma = buildPrisma(alertRow({ status: "resolved" }));
      const service = new AlertsService(prisma as never, buildRealtime() as never);

      await expect(service.acknowledge(ORG_ID, "alert-1", "user-1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("resolve", () => {
    it("stamps who resolved it", async () => {
      const prisma = buildPrisma();
      const service = new AlertsService(prisma as never, buildRealtime() as never);

      await service.resolve(ORG_ID, "alert-1", "user-1");

      expect(prisma.alert.update.mock.calls[0][0].data).toMatchObject({
        status: "resolved",
        resolvedBy: "user-1",
      });
    });

    it("can resolve straight from open, without acknowledging first", async () => {
      const prisma = buildPrisma(alertRow({ status: "open" }));
      const service = new AlertsService(prisma as never, buildRealtime() as never);

      await expect(service.resolve(ORG_ID, "alert-1", "user-1")).resolves.toBeDefined();
    });

    it("is idempotent", async () => {
      const prisma = buildPrisma(alertRow({ status: "resolved" }));
      const service = new AlertsService(prisma as never, buildRealtime() as never);

      await service.resolve(ORG_ID, "alert-1", "user-1");

      expect(prisma.alert.update).not.toHaveBeenCalled();
    });
  });
});
