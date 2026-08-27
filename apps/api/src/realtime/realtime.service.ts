import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  TelemetryPoint,
} from "@iot-ai-platform/shared-types";
import { deviceRoom, orgRoom } from "@iot-ai-platform/shared-types";

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** docs/ARCHITECTURE.md §7: "coalesce to at most 1 emit/second even if the device publishes faster". */
const TELEMETRY_THROTTLE_MS = 1000;

/**
 * The emit side of the realtime feature, deliberately separate from the
 * gateway: the ingestion processor depends on THIS, not on the gateway, so
 * there's no module cycle (gateway → DevicesService → ...) and the processor
 * stays unit-testable against a mock.
 */
@Injectable()
export class RealtimeService {
  private server?: RealtimeServer;
  private readonly lastTelemetryEmitAt = new Map<string, number>();

  setServer(server: RealtimeServer): void {
    this.server = server;
  }

  /**
   * Throttled per (device, metric) so a high-frequency device can't overwhelm
   * browsers. Per-instance by design: each instance throttles what it emits,
   * and the Redis adapter fans the survivors out to the other instances.
   */
  emitTelemetry(organizationId: string, deviceId: string, reading: TelemetryPoint): void {
    if (!this.server) return;

    const key = `${deviceId}:${reading.metric}`;
    const now = Date.now();
    const lastEmit = this.lastTelemetryEmitAt.get(key);

    if (lastEmit !== undefined && now - lastEmit < TELEMETRY_THROTTLE_MS) {
      return;
    }

    this.lastTelemetryEmitAt.set(key, now);

    this.server
      .to([orgRoom(organizationId), deviceRoom(deviceId)])
      .emit("telemetry:update", { deviceId, reading });
  }

  /** Not throttled — status changes are low-frequency and each one matters. */
  emitDeviceStatus(organizationId: string, deviceId: string, status: "online" | "offline", at: Date): void {
    if (!this.server) return;

    this.server
      .to([orgRoom(organizationId), deviceRoom(deviceId)])
      .emit("device:status_changed", { deviceId, status, at: at.toISOString() });
  }
}
