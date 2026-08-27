import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Notification } from "@prisma/client";
import type { NotificationResponse } from "@iot-ai-platform/shared-types";
import { PrismaService } from "../database/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

export interface NotificationDraft {
  type: string;
  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export function toNotificationResponse(notification: Notification): NotificationResponse {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    relatedEntityType: notification.relatedEntityType,
    relatedEntityId: notification.relatedEntityId,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
  ) {}

  /**
   * Fans one event out to every active user in the org who hasn't opted out of
   * it in-app, then pushes each notification to that user's socket room.
   *
   * Failures are logged, not thrown: this is called from the ingestion worker
   * after an alert has already been persisted, and losing the notification is
   * far better than failing the job and re-triggering the whole alert.
   */
  async notifyOrganization(
    organizationId: string,
    draft: NotificationDraft,
  ): Promise<NotificationResponse[]> {
    try {
      const recipients = await this.findRecipients(organizationId, draft.type);
      const created: NotificationResponse[] = [];

      for (const userId of recipients) {
        const notification = await this.prisma.notification.create({
          data: {
            userId,
            type: draft.type,
            title: draft.title,
            body: draft.body,
            relatedEntityType: draft.relatedEntityType ?? null,
            relatedEntityId: draft.relatedEntityId ?? null,
          },
        });

        const response = toNotificationResponse(notification);
        created.push(response);

        this.realtimeService.emitNotification(
          userId,
          response,
          await this.unreadCount(userId),
        );
      }

      return created;
    } catch (error) {
      this.logger.error(`Failed to fan out notification "${draft.type}"`, error);
      return [];
    }
  }

  /** Active org members minus anyone with an explicit in-app opt-out for this event. */
  private async findRecipients(organizationId: string, eventType: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        status: "active",
        // Absence of a preference row means enabled, so only an explicit
        // `enabled: false` excludes someone.
        notificationPrefs: {
          none: { eventType, channel: "in_app", enabled: false },
        },
      },
      select: { id: true },
    });

    return users.map((user) => user.id);
  }

  async findAllForUser(
    userId: string,
    options: { unreadOnly?: boolean; page: number; limit: number },
  ): Promise<{ items: NotificationResponse[]; total: number }> {
    const where = { userId, ...(options.unreadOnly ? { readAt: null } : {}) };

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items: items.map(toNotificationResponse), total };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<NotificationResponse> {
    // Scoped by userId so one user can't mark another's notification read;
    // a miss is a 404 rather than a 403, matching the device convention.
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    if (notification.readAt) {
      return toNotificationResponse(notification);
    }

    return toNotificationResponse(
      await this.prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      }),
    );
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return result.count;
  }
}
