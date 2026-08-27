import { Injectable } from "@nestjs/common";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationPreferenceResponse,
} from "@iot-ai-platform/shared-types";
import { PrismaService } from "../database/prisma.service";
import type { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the full matrix rather than only the stored rows: the table holds
   * opt-outs, so a user who has never changed anything has no rows at all and
   * a raw listing would render an empty settings screen.
   */
  async findAllForUser(userId: string): Promise<NotificationPreferenceResponse[]> {
    const stored = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byKey = new Map(stored.map((row) => [`${row.eventType}:${row.channel}`, row.enabled]));

    return NOTIFICATION_TYPES.flatMap((eventType) =>
      NOTIFICATION_CHANNELS.map((channel) => ({
        eventType,
        channel,
        enabled: byKey.get(`${eventType}:${channel}`) ?? true,
      })),
    );
  }

  async update(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferenceResponse[]> {
    for (const preference of dto.preferences) {
      await this.prisma.notificationPreference.upsert({
        where: {
          userId_eventType_channel: {
            userId,
            eventType: preference.eventType,
            channel: preference.channel,
          },
        },
        update: { enabled: preference.enabled },
        create: {
          userId,
          eventType: preference.eventType,
          channel: preference.channel as NotificationChannel,
          enabled: preference.enabled,
        },
      });
    }

    return this.findAllForUser(userId);
  }
}
