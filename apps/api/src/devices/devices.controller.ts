import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { ApiSuccessResponse } from "@iot-ai-platform/shared-types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS } from "../common/constants/permissions";
import type { JwtPayload } from "../common/types/auth.types";
import { AuditService } from "../audit/audit.service";
import { DevicesService } from "./devices.service";
import { CreateDeviceDto } from "./dto/create-device.dto";
import { UpdateDeviceDto } from "./dto/update-device.dto";
import { DeviceQueryDto } from "./dto/device-query.dto";
import { toDeviceResponse, type DeviceResponse } from "./device-response";

@Controller("devices")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DEVICE_READ)
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: DeviceQueryDto,
  ): Promise<ApiSuccessResponse<DeviceResponse[]>> {
    const { items, total } = await this.devicesService.findAllForOrg(user.organizationId, query);

    return {
      success: true,
      data: items.map(toDeviceResponse),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.DEVICE_READ)
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ): Promise<ApiSuccessResponse<DeviceResponse>> {
    const device = await this.devicesService.findOneForOrg(user.organizationId, id);
    return { success: true, data: toDeviceResponse(device) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DEVICE_WRITE)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDeviceDto,
  ): Promise<ApiSuccessResponse<DeviceResponse>> {
    const device = await this.devicesService.create(user.organizationId, user.sub, dto);

    await this.auditService.log({
      actorUserId: user.sub,
      action: "device.create",
      entityType: "device",
      entityId: device.id,
    });

    return { success: true, data: toDeviceResponse(device) };
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.DEVICE_WRITE)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateDeviceDto,
  ): Promise<ApiSuccessResponse<DeviceResponse>> {
    const device = await this.devicesService.update(user.organizationId, id, dto);

    await this.auditService.log({
      actorUserId: user.sub,
      action: "device.update",
      entityType: "device",
      entityId: device.id,
      metadata: { fields: Object.keys(dto) },
    });

    return { success: true, data: toDeviceResponse(device) };
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.DEVICE_DELETE)
  async deactivate(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ): Promise<ApiSuccessResponse<DeviceResponse>> {
    const device = await this.devicesService.deactivate(user.organizationId, id);

    await this.auditService.log({
      actorUserId: user.sub,
      action: "device.deactivate",
      entityType: "device",
      entityId: device.id,
    });

    return { success: true, data: toDeviceResponse(device) };
  }

  @Post(":id/credentials/rotate")
  @RequirePermissions(PERMISSIONS.DEVICE_CREDENTIALS_ROTATE)
  async rotateCredential(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ): Promise<ApiSuccessResponse<{ credential: string }>> {
    const credential = await this.devicesService.rotateCredential(user.organizationId, id);

    await this.auditService.log({
      actorUserId: user.sub,
      action: "device.credentials.rotate",
      entityType: "device",
      entityId: id,
    });

    return { success: true, data: { credential } };
  }
}
