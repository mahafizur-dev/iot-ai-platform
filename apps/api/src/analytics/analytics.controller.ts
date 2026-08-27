import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import type {
  AlertsAnalytics,
  AnalyticsOverview,
  ApiSuccessResponse,
  DeviceTrends,
  EventsReport,
  TelemetryVolumePoint,
  UptimeReport,
} from "@iot-ai-platform/shared-types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS } from "../common/constants/permissions";
import type { JwtPayload } from "../common/types/auth.types";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsQueryDto } from "./dto/analytics-query.dto";

@Controller("analytics")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.ANALYTICS_READ)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("overview")
  async overview(
    @CurrentUser() user: JwtPayload,
    @Query() query: AnalyticsQueryDto,
  ): Promise<ApiSuccessResponse<AnalyticsOverview>> {
    return {
      success: true,
      data: await this.analyticsService.overview(user.organizationId, query.range),
    };
  }

  @Get("telemetry-volume")
  async telemetryVolume(
    @CurrentUser() user: JwtPayload,
    @Query() query: AnalyticsQueryDto,
  ): Promise<ApiSuccessResponse<TelemetryVolumePoint[]>> {
    return {
      success: true,
      data: await this.analyticsService.telemetryVolume(user.organizationId, query.range),
    };
  }

  @Get("uptime")
  async uptime(
    @CurrentUser() user: JwtPayload,
    @Query() query: AnalyticsQueryDto,
  ): Promise<ApiSuccessResponse<UptimeReport>> {
    return {
      success: true,
      data: await this.analyticsService.uptime(user.organizationId, query.range),
    };
  }

  @Get("events")
  async events(
    @CurrentUser() user: JwtPayload,
    @Query() query: AnalyticsQueryDto,
  ): Promise<ApiSuccessResponse<EventsReport>> {
    return {
      success: true,
      data: await this.analyticsService.events(user.organizationId, query.range),
    };
  }

  @Get("alerts")
  async alerts(
    @CurrentUser() user: JwtPayload,
    @Query() query: AnalyticsQueryDto,
  ): Promise<ApiSuccessResponse<AlertsAnalytics>> {
    return {
      success: true,
      data: await this.analyticsService.alerts(user.organizationId, query.range),
    };
  }

  // Declared last so the literal routes above are never captured as a device id.
  @Get("devices/:deviceId/trends")
  async deviceTrends(
    @CurrentUser() user: JwtPayload,
    @Param("deviceId") deviceId: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<ApiSuccessResponse<DeviceTrends>> {
    return {
      success: true,
      data: await this.analyticsService.deviceTrends(user.organizationId, deviceId, query.range),
    };
  }
}
