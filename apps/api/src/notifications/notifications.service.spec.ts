import { NotFoundException } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

const ORG_ID = "org-1";

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-1",
    userId: "user-1",
    type: "alert:triggered",
    title: "Critical: Boiler 01",
    body: "temperature is 34 (above 30)",
    relatedEntityType: "alert",
    relatedEntityId: "alert-1",
    readAt: null,
    createdAt: new Date("2026-08-27T12:00:00.000Z"),
    ...overrides,
  };
}

function buildPrisma(users: { id: string }[] = [{ id: "user-1" }, { id: "user-2" }]) {
  return {
    user: { findMany: jest.fn().mockResolvedValue(users) },
    notification: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(notificationRow(data)),
        ),
      findFirst: jest.fn().mockResolvedValue(notificationRow()),
      findMany: jest.fn().mockResolvedValue([notificationRow()]),
      count: jest.fn().mockResolvedValue(3),
      update: jest.fn().mockResolvedValue(notificationRow({ readAt: new Date() })),
      updateMany: jest.fn().mockResolvedValue({ count: 5 }),
    },
  };
}

function buildRealtime() {
  return { emitNotification: jest.fn() };
}

const DRAFT = {
  type: "alert:triggered",
  title: "Critical: Boiler 01",
  body: "temperature is 34 (above 30)",
  relatedEntityType: "alert",
  relatedEntityId: "alert-1",
};

describe("NotificationsService", () => {
  describe("notifyOrganization", () => {
    it("creates one notification per recipient and pushes each to its own room", async () => {
      const prisma = buildPrisma();
      const realtime = buildRealtime();
      const service = new NotificationsService(prisma as never, realtime as never);

      await service.notifyOrganization(ORG_ID, DRAFT);

      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(realtime.emitNotification).toHaveBeenCalledTimes(2);
      expect(realtime.emitNotification).toHaveBeenNthCalledWith(
        1,
        "user-1",
        expect.objectContaining({ type: "alert:triggered" }),
        3,
      );
    });

    it("excludes only users with an explicit in-app opt-out for this event type", async () => {
      const prisma = buildPrisma();
      const service = new NotificationsService(prisma as never, buildRealtime() as never);

      await service.notifyOrganization(ORG_ID, DRAFT);

      // Absence of a preference row means enabled, so the query must exclude
      // on `none: { ... enabled: false }` rather than require an opt-in row.
      const { where } = prisma.user.findMany.mock.calls[0][0];
      expect(where).toMatchObject({ organizationId: ORG_ID, status: "active" });
      expect(where.notificationPrefs).toEqual({
        none: { eventType: "alert:triggered", channel: "in_app", enabled: false },
      });
    });

    it("swallows failures — the alert is already persisted and must not be re-triggered", async () => {
      const prisma = buildPrisma();
      prisma.user.findMany.mockRejectedValue(new Error("db down"));
      const service = new NotificationsService(prisma as never, buildRealtime() as never);

      await expect(service.notifyOrganization(ORG_ID, DRAFT)).resolves.toEqual([]);
    });
  });

  describe("markRead", () => {
    it("scopes the lookup to the caller so one user cannot read another's inbox", async () => {
      const prisma = buildPrisma();
      const service = new NotificationsService(prisma as never, buildRealtime() as never);

      await service.markRead("user-1", "notification-1");

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: "notification-1", userId: "user-1" },
      });
    });

    it("404s for a notification belonging to someone else", async () => {
      const prisma = buildPrisma();
      prisma.notification.findFirst.mockResolvedValue(null);
      const service = new NotificationsService(prisma as never, buildRealtime() as never);

      await expect(service.markRead("user-1", "someone-elses")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("does not re-stamp an already-read notification", async () => {
      const prisma = buildPrisma();
      prisma.notification.findFirst.mockResolvedValue(
        notificationRow({ readAt: new Date("2026-08-01T00:00:00.000Z") }),
      );
      const service = new NotificationsService(prisma as never, buildRealtime() as never);

      const result = await service.markRead("user-1", "notification-1");

      expect(prisma.notification.update).not.toHaveBeenCalled();
      expect(result.readAt).toBe("2026-08-01T00:00:00.000Z");
    });
  });

  it("counts only unread notifications for the badge", async () => {
    const prisma = buildPrisma();
    const service = new NotificationsService(prisma as never, buildRealtime() as never);

    await service.unreadCount("user-1");

    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: "user-1", readAt: null },
    });
  });

  it("marks all read in one statement and reports how many changed", async () => {
    const prisma = buildPrisma();
    const service = new NotificationsService(prisma as never, buildRealtime() as never);

    expect(await service.markAllRead("user-1")).toBe(5);
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
      readAt: null,
    });
  });
});
