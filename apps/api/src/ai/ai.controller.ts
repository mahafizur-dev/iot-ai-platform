import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { ApiSuccessResponse } from "@iot-ai-platform/shared-types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS } from "../common/constants/permissions";
import type { JwtPayload } from "../common/types/auth.types";
import { AuditService } from "../audit/audit.service";
import { AIService, type AIInteractionSummary, type AIResult } from "./ai.service";
import { AiThrottlerGuard } from "./ai-throttler.guard";
import { AIChatDto } from "./dto/ai-chat.dto";
import { AIInteractionQueryDto, TelemetrySummaryDto } from "./dto/telemetry-summary.dto";

/**
 * Guard order matters: JwtAuthGuard must run before AiThrottlerGuard, because
 * the throttler keys on `request.user` that the JWT guard attaches.
 */
@Controller("ai")
@UseGuards(JwtAuthGuard, PermissionsGuard, AiThrottlerGuard)
@RequirePermissions(PERMISSIONS.AI_USE)
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly auditService: AuditService,
  ) {}

  @Post("chat")
  async chat(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AIChatDto,
  ): Promise<ApiSuccessResponse<AIResult>> {
    const result = await this.aiService.chat(
      user.organizationId,
      user.sub,
      dto.message,
      dto.history,
    );

    return { success: true, data: result };
  }

  @Post("telemetry-summary")
  async telemetrySummary(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TelemetrySummaryDto,
  ): Promise<ApiSuccessResponse<AIResult>> {
    const result = await this.aiService.summarizeTelemetry(
      user.organizationId,
      user.sub,
      dto.deviceId,
      dto.range,
    );

    return { success: true, data: result };
  }

  @Post("explain-alert/:alertId")
  async explainAlert(
    @CurrentUser() user: JwtPayload,
    @Param("alertId") alertId: string,
  ): Promise<ApiSuccessResponse<AIResult>> {
    const result = await this.aiService.explainAlert(user.organizationId, user.sub, alertId);

    // Audited because it sends organizational data to a third-party provider
    // — the kind of action §8 wants a trail for.
    await this.auditService.log({
      actorUserId: user.sub,
      action: "ai.explain_alert",
      entityType: "alert",
      entityId: alertId,
      metadata: { provider: result.provider, model: result.model },
    });

    return { success: true, data: result };
  }

  @Get("interactions")
  async interactions(
    @CurrentUser() user: JwtPayload,
    @Query() query: AIInteractionQueryDto,
  ): Promise<ApiSuccessResponse<AIInteractionSummary[]>> {
    const { items, total } = await this.aiService.listInteractions(user.organizationId, {
      page: query.page,
      limit: query.limit,
      requestType: query.requestType,
    });

    return {
      success: true,
      data: items,
      meta: { page: query.page, limit: query.limit, total },
    };
  }
}
