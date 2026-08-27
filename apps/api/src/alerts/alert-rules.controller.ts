import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { AlertRuleResponse, ApiSuccessResponse } from "@iot-ai-platform/shared-types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS } from "../common/constants/permissions";
import type { JwtPayload } from "../common/types/auth.types";
import { AuditService } from "../audit/audit.service";
import { AlertRulesService } from "./alert-rules.service";
import { toAlertRuleResponse } from "./alert-response";
import { CreateAlertRuleDto } from "./dto/create-alert-rule.dto";
import { UpdateAlertRuleDto } from "./dto/update-alert-rule.dto";

@Controller("alert-rules")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AlertRulesController {
  constructor(
    private readonly alertRulesService: AlertRulesService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ALERT_READ)
  async findAll(@CurrentUser() user: JwtPayload): Promise<ApiSuccessResponse<AlertRuleResponse[]>> {
    const rules = await this.alertRulesService.findAllForOrg(user.organizationId);
    return { success: true, data: rules.map(toAlertRuleResponse) };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.ALERT_READ)
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ): Promise<ApiSuccessResponse<AlertRuleResponse>> {
    const rule = await this.alertRulesService.findOneForOrg(user.organizationId, id);
    return { success: true, data: toAlertRuleResponse(rule) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ALERT_WRITE)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAlertRuleDto,
  ): Promise<ApiSuccessResponse<AlertRuleResponse>> {
    const rule = await this.alertRulesService.create(user.organizationId, user.sub, dto);

    // §8 lists alert-rule changes among the sensitive actions that must be audited.
    await this.auditService.log({
      actorUserId: user.sub,
      action: "alert_rule.create",
      entityType: "alert_rule",
      entityId: rule.id,
      metadata: { metric: rule.metric, condition: rule.condition, threshold: rule.threshold },
    });

    return { success: true, data: toAlertRuleResponse(rule) };
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.ALERT_WRITE)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateAlertRuleDto,
  ): Promise<ApiSuccessResponse<AlertRuleResponse>> {
    const rule = await this.alertRulesService.update(user.organizationId, id, dto);

    await this.auditService.log({
      actorUserId: user.sub,
      action: "alert_rule.update",
      entityType: "alert_rule",
      entityId: rule.id,
      metadata: { fields: Object.keys(dto) },
    });

    return { success: true, data: toAlertRuleResponse(rule) };
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.ALERT_WRITE)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ): Promise<ApiSuccessResponse<{ deleted: true }>> {
    await this.alertRulesService.remove(user.organizationId, id);

    await this.auditService.log({
      actorUserId: user.sub,
      action: "alert_rule.delete",
      entityType: "alert_rule",
      entityId: id,
    });

    return { success: true, data: { deleted: true } };
  }
}
