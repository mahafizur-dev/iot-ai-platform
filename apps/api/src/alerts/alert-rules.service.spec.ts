import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AlertRulesService } from "./alert-rules.service";

const ORG_ID = "org-1";

function ruleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    organizationId: ORG_ID,
    deviceId: null,
    metric: "temperature",
    condition: "gt",
    threshold: 30,
    thresholdSecondary: null,
    severity: "warning",
    enabled: true,
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    device: null,
    ...overrides,
  };
}

function buildPrisma(found: unknown = ruleRow()) {
  return {
    alertRule: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(ruleRow(data)),
        ),
      findFirst: jest.fn().mockResolvedValue(found),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(ruleRow(data)),
        ),
      delete: jest.fn().mockResolvedValue(ruleRow()),
    },
  };
}

function buildDevices(ownsDevice = true) {
  return {
    findOneForOrg: ownsDevice
      ? jest.fn().mockResolvedValue({ id: "device-1" })
      : jest.fn().mockRejectedValue(new NotFoundException("Device not found")),
  };
}

describe("AlertRulesService", () => {
  describe("create", () => {
    it("refuses to scope a rule to a device the org does not own", async () => {
      const service = new AlertRulesService(buildPrisma() as never, buildDevices(false) as never);

      await expect(
        service.create(ORG_ID, "user-1", {
          deviceId: "someone-elses",
          metric: "temperature",
          condition: "gt",
          threshold: 30,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("skips the ownership check for an org-wide rule", async () => {
      const devices = buildDevices();
      const service = new AlertRulesService(buildPrisma() as never, devices as never);

      await service.create(ORG_ID, "user-1", {
        metric: "temperature",
        condition: "gt",
        threshold: 30,
      });

      expect(devices.findOneForOrg).not.toHaveBeenCalled();
    });

    it("drops thresholdSecondary for a non-range condition", async () => {
      const prisma = buildPrisma();
      const service = new AlertRulesService(prisma as never, buildDevices() as never);

      await service.create(ORG_ID, "user-1", {
        metric: "temperature",
        condition: "gt",
        threshold: 30,
        thresholdSecondary: 99,
      });

      expect(prisma.alertRule.create.mock.calls[0][0].data.thresholdSecondary).toBeNull();
    });
  });

  describe("update", () => {
    it("validates the MERGED rule, not just the patch", async () => {
      // Switching an existing `gt` rule to `range` without an upper bound
      // would otherwise store a rule that can never fire.
      const prisma = buildPrisma(ruleRow({ condition: "gt", thresholdSecondary: null }));
      const service = new AlertRulesService(prisma as never, buildDevices() as never);

      await expect(service.update(ORG_ID, "rule-1", { condition: "range" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("accepts the switch to range when the patch supplies the upper bound", async () => {
      const prisma = buildPrisma(ruleRow({ condition: "gt" }));
      const service = new AlertRulesService(prisma as never, buildDevices() as never);

      await service.update(ORG_ID, "rule-1", { condition: "range", thresholdSecondary: 40 });

      expect(prisma.alertRule.update.mock.calls[0][0].data.thresholdSecondary).toBe(40);
    });

    it("clears a stale upper bound when moving away from range", async () => {
      const prisma = buildPrisma(ruleRow({ condition: "range", thresholdSecondary: 40 }));
      const service = new AlertRulesService(prisma as never, buildDevices() as never);

      await service.update(ORG_ID, "rule-1", { condition: "lt" });

      expect(prisma.alertRule.update.mock.calls[0][0].data.thresholdSecondary).toBeNull();
    });

    it("404s for another org's rule", async () => {
      const service = new AlertRulesService(buildPrisma(null) as never, buildDevices() as never);

      await expect(service.update(ORG_ID, "rule-1", { threshold: 5 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("findMatchingRules", () => {
    it("matches device-scoped and org-wide rules, and only enabled ones", async () => {
      const prisma = buildPrisma();
      const service = new AlertRulesService(prisma as never, buildDevices() as never);

      await service.findMatchingRules(ORG_ID, "device-1", "temperature");

      expect(prisma.alertRule.findMany.mock.calls[0][0].where).toEqual({
        organizationId: ORG_ID,
        enabled: true,
        metric: "temperature",
        OR: [{ deviceId: "device-1" }, { deviceId: null }],
      });
    });
  });
});
