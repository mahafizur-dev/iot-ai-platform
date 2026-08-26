import { Injectable } from "@nestjs/common";
import type { HealthStatus } from "@iot-ai-platform/shared-types";

@Injectable()
export class HealthService {
  getStatus(): HealthStatus {
    return {
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
