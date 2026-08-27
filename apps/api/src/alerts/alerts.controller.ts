import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { AlertResponse, ApiSuccessResponse } from "@iot-ai-platform/shared-types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS } from "../common/constants/permissions";
import type { JwtPayload } from "../common/types/auth.types";
import { AuditService } from "../audit/audit.service";
import { AlertsService } from "./alerts.service";
import { toAlertResponse } from "./alert-response";
import { AlertQueryDto } from "./dto/alert-query.dto";

@Controller("alerts")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ALERT_READ)
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: AlertQueryDto,
  ): Promise<ApiSuccessResponse<AlertResponse[]>> {
    const { items, total } = await this.alertsService.findAllForOrg(user.organizationId, query);

    return {
      success: true,
      data: items.map(toAlertResponse),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.ALERT_READ)
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ): Promise<ApiSuccessResponse<AlertResponse>> {
    const alert = await this.alertsService.findOneForOrg(user.organizationId, id);
    return { success: true, data: toAlertResponse(alert) };
  }

  @Post(":id/acknowledge")
  @RequirePermissions(PERMISSIONS.ALERT_ACK)
  async acknowledge(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ): Promise<ApiSuccessResponse<AlertResponse>> {
    const alert = await this.alertsService.acknowledge(user.organizationId, id, user.sub);

    await this.auditService.log({
      actorUserId: user.sub,
      action: "alert.acknowledge",
      entityType: "alert",
      entityId: id,
    });

    return { success: true, data: toAlertResponse(alert) };
  }

  @Post(":id/resolve")
  @RequirePermissions(PERMISSIONS.ALERT_ACK)
  async resolve(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ): Promise<ApiSuccessResponse<AlertResponse>> {
    const alert = await this.alertsService.resolve(user.organizationId, id, user.sub);

    await this.auditService.log({
      actorUserId: user.sub,
      action: "alert.resolve",
      entityType: "alert",
      entityId: id,
    });

    return { success: true, data: toAlertResponse(alert) };
  }
}
