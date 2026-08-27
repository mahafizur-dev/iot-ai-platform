import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../database/prisma.service";

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
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    const thresholdSeconds = this.config.getOrThrow<number>("DEVICE_OFFLINE_THRESHOLD_SECONDS");
    const cutoff = new Date(Date.now() - thresholdSeconds * 1000);

    try {
      const result = await this.prisma.device.updateMany({
        where: {
          status: { not: "offline" },
          deactivatedAt: null,
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
        },
        data: { status: "offline" },
      });

      if (result.count > 0) {
        this.logger.log(`Marked ${result.count} device(s) offline (no activity since ${cutoff.toISOString()})`);
      }
    } catch (error) {
      this.logger.error("Offline-watchdog sweep failed", error);
    }
  }
}
