import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import type { ApiSuccessResponse } from "@iot-ai-platform/shared-types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS } from "../common/constants/permissions";
import type { JwtPayload } from "../common/types/auth.types";
import { TelemetryService, type TelemetryAggregatePoint, type TelemetryPoint } from "./telemetry.service";
import { TelemetryQueryDto, LatestTelemetryQueryDto } from "./dto/telemetry-query.dto";

@Controller("devices/:deviceId/telemetry")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TELEMETRY_READ)
  async queryRange(
    @CurrentUser() user: JwtPayload,
    @Param("deviceId") deviceId: string,
    @Query() query: TelemetryQueryDto,
  ): Promise<ApiSuccessResponse<TelemetryPoint[] | TelemetryAggregatePoint[]>> {
    const data = await this.telemetryService.queryRange(user.organizationId, deviceId, query);
    return { success: true, data };
  }

  @Get("latest")
  @RequirePermissions(PERMISSIONS.TELEMETRY_READ)
  async latest(
    @CurrentUser() user: JwtPayload,
    @Param("deviceId") deviceId: string,
    @Query() query: LatestTelemetryQueryDto,
  ): Promise<ApiSuccessResponse<TelemetryPoint[]>> {
    const data = await this.telemetryService.latest(user.organizationId, deviceId, query.metric);
    return { success: true, data };
  }
}
