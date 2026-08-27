import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../database/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

const SWEEP_INTERVAL_MS = 30_000;

/**
 * MQTT LWT alone misses broker restarts / network partitions
 * (docs/ARCHITECTURE.md §6), so this periodic sweep is the backstop: any
 * device whose `lastSeenAt` is older than the configured threshold gets
 * marked offline even if no LWT ever fired.
 */
@Injectable()
export class DeviceWatchdogService {
  private readonly logger = new Logger(DeviceWatchdogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    const thresholdSeconds = this.config.getOrThrow<number>("DEVICE_OFFLINE_THRESHOLD_SECONDS");
    const cutoff = new Date(Date.now() - thresholdSeconds * 1000);

    try {
      const where = {
        status: { not: "offline" },
        deactivatedAt: null,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
      };

      // Read the matching rows before flipping them: updateMany returns only a
      // count, and the dashboard needs to know WHICH devices went offline.
      // Without this the watchdog's transitions were invisible to the UI until
      // the next page load — an LWT-driven offline pushed live, a watchdog one
      // silently.
      const affected = await this.prisma.device.findMany({
        where,
        select: { id: true, organizationId: true },
      });

      if (affected.length === 0) {
        return;
      }

      const at = new Date();
      await this.prisma.device.updateMany({
        where: { id: { in: affected.map((device) => device.id) } },
        data: { status: "offline" },
      });

      // device_events is the record connectivity analytics reads. Without a
      // row here, a device that dies silently (no LWT, no status message)
      // would look permanently online to the uptime calculation.
      await this.prisma.deviceEvent.createMany({
        data: affected.map((device) => ({
          deviceId: device.id,
          eventType: "disconnected",
          payload: { source: "watchdog", thresholdSeconds },
          ts: at,
        })),
      });

      for (const device of affected) {
        this.realtimeService.emitDeviceStatus(device.organizationId, device.id, "offline", at);
      }

      this.logger.log(
        `Marked ${affected.length} device(s) offline (no activity since ${cutoff.toISOString()})`,
      );
    } catch (error) {
      this.logger.error("Offline-watchdog sweep failed", error);
    }
  }
}
