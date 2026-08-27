import { Prisma } from "@prisma/client";
import { AlertEvaluationService, type EvaluationInput } from "./alert-evaluation.service";

const ORG_ID = "org-1";
const DEVICE_ID = "device-1";

const RULE = {
  id: "rule-1",
  organizationId: ORG_ID,
  deviceId: DEVICE_ID,
  metric: "temperature",
  condition: "gt",
  threshold: 30,
  thresholdSecondary: null,
  severity: "critical",
  enabled: true,
};

function buildPrisma(existingAlert: unknown = null) {
  return {
    alert: {
      findFirst: jest.fn().mockResolvedValue(existingAlert),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "alert-1", ...data }),
      ),
      update: jest.fn().mockResolvedValue({
        id: "alert-1",
        ruleId: RULE.id,
        deviceId: DEVICE_ID,
        metric: "temperature",
        status: "resolved",
        severity: "critical",
        message: "temperature is 34 (above 30)",
        context: null,
        triggeredAt: new Date(),
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: new Date(),
        resolvedBy: null,
        device: { name: "Boiler 01" },
      }),
    },
    device: { findUnique: jest.fn().mockResolvedValue({ name: "Boiler 01" }) },
  };
}

function buildRules(rules: unknown[] = [RULE]) {
  return { findMatchingRules: jest.fn().mockResolvedValue(rules) };
}

function buildNotifications() {
  return { notifyOrganization: jest.fn().mockResolvedValue([]) };
}

function buildRealtime() {
  return { emitAlertTriggered: jest.fn(), emitAlertUpdated: jest.fn() };
}

function input(value: number): EvaluationInput {
  return {
    organizationId: ORG_ID,
    deviceId: DEVICE_ID,
    metric: "temperature",
    value,
    ts: new Date("2026-08-27T12:00:00.000Z"),
  };
}

function build(prisma: unknown, rules = buildRules(), notifications = buildNotifications(), realtime = buildRealtime()) {
  const service = new AlertEvaluationService(
    prisma as never,
    rules as never,
    notifications as never,
    realtime as never,
  );

  return { service, rules, notifications, realtime };
}

describe("AlertEvaluationService", () => {
  it("opens an alert when a reading breaches a rule with nothing already open", async () => {
    const prisma = buildPrisma(null);
    const { service, realtime, notifications } = build(prisma);

    await service.evaluateReading(input(34));

    expect(prisma.alert.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.alert.create.mock.calls[0][0];
    expect(data).toMatchObject({
      ruleId: RULE.id,
      deviceId: DEVICE_ID,
      status: "open",
      severity: "critical",
      message: "temperature is 34 (above 30)",
    });
    expect(realtime.emitAlertTriggered).toHaveBeenCalledTimes(1);
    expect(notifications.notifyOrganization).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ type: "alert:triggered", relatedEntityId: "alert-1" }),
    );
  });

  it("records the observed value and threshold in the alert context", async () => {
    const prisma = buildPrisma(null);
    const { service } = build(prisma);

    await service.evaluateReading(input(34));

    expect(prisma.alert.create.mock.calls[0][0].data.context).toMatchObject({
      value: 34,
      condition: "gt",
      threshold: 30,
    });
  });

  it("does NOT open a second alert while one is already un-resolved", async () => {
    // The core dedupe guarantee: a metric parked above its threshold produces
    // one alert, not one per reading.
    const prisma = buildPrisma({ id: "alert-1", status: "open" });
    const { service, realtime, notifications } = build(prisma);

    await service.evaluateReading(input(34));

    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect(realtime.emitAlertTriggered).not.toHaveBeenCalled();
    expect(notifications.notifyOrganization).not.toHaveBeenCalled();
  });

  it("treats an acknowledged alert as still live", async () => {
    const prisma = buildPrisma({ id: "alert-1", status: "acknowledged" });
    const { service } = build(prisma);

    await service.evaluateReading(input(34));

    expect(prisma.alert.create).not.toHaveBeenCalled();
    // The lookup must cover both un-resolved statuses, not just "open".
    expect(prisma.alert.findFirst.mock.calls[0][0].where.status).toEqual({
      in: ["open", "acknowledged"],
    });
  });

  it("auto-resolves an open alert once the metric recovers", async () => {
    const prisma = buildPrisma({ id: "alert-1", status: "open" });
    const { service, realtime, notifications } = build(prisma);

    await service.evaluateReading(input(21));

    expect(prisma.alert.update).toHaveBeenCalledTimes(1);
    const { data } = prisma.alert.update.mock.calls[0][0];
    expect(data.status).toBe("resolved");
    // Nobody resolved it — the metric recovered.
    expect(data.resolvedBy).toBeUndefined();
    expect(realtime.emitAlertUpdated).toHaveBeenCalledTimes(1);
    expect(notifications.notifyOrganization).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ type: "alert:resolved" }),
    );
  });

  it("does nothing when a healthy reading has no open alert", async () => {
    const prisma = buildPrisma(null);
    const { service, realtime } = build(prisma);

    await service.evaluateReading(input(21));

    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect(prisma.alert.update).not.toHaveBeenCalled();
    expect(realtime.emitAlertUpdated).not.toHaveBeenCalled();
  });

  it("swallows a unique-violation from a concurrent worker without re-notifying", async () => {
    const prisma = buildPrisma(null);
    prisma.alert.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "5.22.0",
      }),
    );
    const { service, notifications, realtime } = build(prisma);

    await expect(service.evaluateReading(input(34))).resolves.toBeUndefined();
    expect(notifications.notifyOrganization).not.toHaveBeenCalled();
    expect(realtime.emitAlertTriggered).not.toHaveBeenCalled();
  });

  it("keeps evaluating the remaining rules when one throws", async () => {
    const prisma = buildPrisma(null);
    prisma.alert.findFirst
      .mockRejectedValueOnce(new Error("db hiccup"))
      .mockResolvedValueOnce(null);

    const rules = buildRules([RULE, { ...RULE, id: "rule-2" }]);
    const { service } = build(prisma, rules);

    await expect(service.evaluateReading(input(34))).resolves.toBeUndefined();
    expect(prisma.alert.create).toHaveBeenCalledTimes(1);
  });

  it("evaluates nothing when no rule watches the metric", async () => {
    const prisma = buildPrisma(null);
    const { service } = build(prisma, buildRules([]));

    await service.evaluateReading(input(999));

    expect(prisma.alert.findFirst).not.toHaveBeenCalled();
  });
});
