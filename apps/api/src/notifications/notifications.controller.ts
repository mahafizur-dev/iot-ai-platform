import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type {
  ApiSuccessResponse,
  NotificationPreferenceResponse,
  NotificationResponse,
} from "@iot-ai-platform/shared-types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { JwtPayload } from "../common/types/auth.types";
import { NotificationsService } from "./notifications.service";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { NotificationQueryDto } from "./dto/notification-query.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";

/**
 * No PermissionsGuard: notifications are addressed to the caller personally,
 * so authentication IS the authorization — every query below is scoped by
 * `user.sub`. Adding a permission would mean a role could be configured to
 * lock someone out of their own inbox.
 */
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly preferencesService: NotificationPreferencesService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: NotificationQueryDto,
  ): Promise<ApiSuccessResponse<NotificationResponse[]>> {
    const { items, total } = await this.notificationsService.findAllForUser(user.sub, {
      unreadOnly: query.unreadOnly,
      page: query.page,
      limit: query.limit,
    });

    return {
      success: true,
      data: items,
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  @Get("unread-count")
  async unreadCount(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiSuccessResponse<{ unreadCount: number }>> {
    return {
      success: true,
      data: { unreadCount: await this.notificationsService.unreadCount(user.sub) },
    };
  }

  @Get("preferences")
  async preferences(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiSuccessResponse<NotificationPreferenceResponse[]>> {
    return { success: true, data: await this.preferencesService.findAllForUser(user.sub) };
  }

  @Patch("preferences")
  async updatePreferences(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<ApiSuccessResponse<NotificationPreferenceResponse[]>> {
    return { success: true, data: await this.preferencesService.update(user.sub, dto) };
  }

  @Post("read-all")
  async readAll(@CurrentUser() user: JwtPayload): Promise<ApiSuccessResponse<{ updated: number }>> {
    return {
      success: true,
      data: { updated: await this.notificationsService.markAllRead(user.sub) },
    };
  }

  // Declared after the literal routes above so "unread-count" and
  // "preferences" are never captured as an `:id`.
  @Patch(":id/read")
  async markRead(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ): Promise<ApiSuccessResponse<NotificationResponse>> {
    return { success: true, data: await this.notificationsService.markRead(user.sub, id) };
  }
}
