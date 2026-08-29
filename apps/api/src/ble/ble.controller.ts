import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type {
  ApiSuccessResponse,
  BleCharacteristicValue,
  BleDevice,
} from "@iot-ai-platform/shared-types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS } from "../common/constants/permissions";
import type { JwtPayload } from "../common/types/auth.types";
import { AuditService } from "../audit/audit.service";
import { toDeviceResponse, type DeviceResponse } from "../devices/device-response";
import { BleService } from "./ble.service";
import { WriteCharacteristicDto } from "./dto/write-characteristic.dto";
import { RegisterBleDeviceDto } from "./dto/register-ble-device.dto";

/**
 * All routes proxy the mock adapter (see docs/ARCHITECTURE.md §10) — reuses
 * device:read/device:write rather than introducing a `ble:*` permission
 * catalog for a mock-only feature.
 */
@Controller("ble")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BleController {
  constructor(
    private readonly bleService: BleService,
    private readonly auditService: AuditService,
  ) {}

  @Get("devices")
  @RequirePermissions(PERMISSIONS.DEVICE_READ)
  async scan(): Promise<ApiSuccessResponse<BleDevice[]>> {
    const devices = await this.bleService.scan();
    return { success: true, data: devices };
  }

  @Post("devices/:id/connect")
  @RequirePermissions(PERMISSIONS.DEVICE_WRITE)
  async connect(@Param("id") id: string): Promise<ApiSuccessResponse<{ connected: true }>> {
    await this.bleService.connect(id);
    return { success: true, data: { connected: true } };
  }

  @Post("devices/:id/disconnect")
  @RequirePermissions(PERMISSIONS.DEVICE_WRITE)
  async disconnect(@Param("id") id: string): Promise<ApiSuccessResponse<{ connected: false }>> {
    await this.bleService.disconnect(id);
    return { success: true, data: { connected: false } };
  }

  @Get("devices/:id/characteristics/:charId")
  @RequirePermissions(PERMISSIONS.DEVICE_READ)
  async read(
    @Param("id") id: string,
    @Param("charId") charId: string,
  ): Promise<ApiSuccessResponse<BleCharacteristicValue>> {
    const value = await this.bleService.read(id, charId);
    return { success: true, data: value };
  }

  @Post("devices/:id/characteristics/:charId")
  @RequirePermissions(PERMISSIONS.DEVICE_WRITE)
  async write(
    @Param("id") id: string,
    @Param("charId") charId: string,
    @Body() dto: WriteCharacteristicDto,
  ): Promise<ApiSuccessResponse<{ written: true }>> {
    await this.bleService.write(id, charId, dto.data);
    return { success: true, data: { written: true } };
  }

  @Post("devices/:id/register")
  @RequirePermissions(PERMISSIONS.DEVICE_WRITE)
  async register(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: RegisterBleDeviceDto,
  ): Promise<ApiSuccessResponse<DeviceResponse>> {
    const device = await this.bleService.register(user.organizationId, user.sub, id, dto);

    await this.auditService.log({
      actorUserId: user.sub,
      action: "ble.device.register",
      entityType: "device",
      entityId: device.id,
      metadata: { bleDeviceId: id },
    });

    return { success: true, data: toDeviceResponse(device) };
  }
}
