import { Controller, Get } from "@nestjs/common";
import type { ApiSuccessResponse, HealthStatus } from "@iot-ai-platform/shared-types";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): ApiSuccessResponse<HealthStatus> {
    return { success: true, data: this.healthService.getStatus() };
  }
}
