import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { parseDeviceTopic } from "../mqtt/topics";
import { telemetryPayloadSchema } from "./schemas/telemetry-reading.schema";
import { deviceStatusSchema } from "./schemas/device-status.schema";
import { deviceEventSchema } from "./schemas/device-event.schema";
import { commandAckSchema } from "./schemas/command-ack.schema";
import { resolveTelemetryTimestamp } from "./clock-skew";
import { INGESTION_QUEUE, type IngestionJobData } from "./telemetry.constants";

/**
 * Validate → normalize → persist (docs/ARCHITECTURE.md §6). Runs behind the
 * BullMQ queue `TelemetryIngestionService` feeds — a malformed payload or a
 * DB hiccup fails one job (BullMQ retries/logs it), it never brings down the
 * worker process or blocks other devices' messages.
 */
@Processor(INGESTION_QUEUE, { concurrency: 10 })
export class TelemetryIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(TelemetryIngestionProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<IngestionJobData>): Promise<void> {
    const { topic, rawPayload, receivedAt } = job.data;
    const parsedTopic = parseDeviceTopic(topic);

    if (!parsedTopic) {
      this.logger.warn(`Ignoring message on unrecognized topic "${topic}"`);
      return;
    }

    const { deviceId, suffix } = parsedTopic;
    const receivedAtDate = new Date(receivedAt);

    let json: unknown;
    try {
      json = JSON.parse(rawPayload);
    } catch {
      await this.recordMalformed(deviceId, topic, rawPayload, "invalid JSON");
      return;
    }

    switch (suffix) {
      case "telemetry":
        await this.handleTelemetry(deviceId, json, receivedAtDate, topic, rawPayload);
        return;
      case "status":
        await this.handleStatus(deviceId, json, receivedAtDate, topic, rawPayload);
        return;
      case "events":
        await this.handleEvent(deviceId, json, receivedAtDate, topic, rawPayload);
        return;
      case "commands/ack":
        await this.handleCommandAck(deviceId, json, receivedAtDate, topic, rawPayload);
        return;
      default:
        this.logger.warn(`Ignoring message on unhandled suffix "${suffix}" (topic "${topic}")`);
    }
  }

  private async handleTelemetry(
    deviceId: string,
    json: unknown,
    receivedAt: Date,
    topic: string,
    rawPayload: string,
  ): Promise<void> {
    const result = telemetryPayloadSchema.safeParse(json);
    if (!result.success) {
      await this.recordMalformed(deviceId, topic, rawPayload, result.error.message);
      return;
    }

    const readings = Array.isArray(result.data) ? result.data : [result.data];

    for (const reading of readings) {
      const { ts, skewed } = resolveTelemetryTimestamp(reading.ts, receivedAt);
      const payload: Prisma.InputJsonValue = { ...(reading.payload ?? {}), receivedAt: receivedAt.toISOString() };

      await this.prisma.telemetry.upsert({
        where: { deviceId_ts_metric: { deviceId, ts, metric: reading.metric } },
        create: { deviceId, ts, metric: reading.metric, value: reading.value, payload },
        update: { value: reading.value, payload },
      });

      if (skewed) {
        await this.recordEvent(deviceId, "error", {
          reason: "clock_skew_detected",
          metric: reading.metric,
          deviceReportedTs: reading.ts,
        }, receivedAt);
      }
    }

    await this.touchLastSeen(deviceId, receivedAt);
  }

  private async handleStatus(
    deviceId: string,
    json: unknown,
    receivedAt: Date,
    topic: string,
    rawPayload: string,
  ): Promise<void> {
    const result = deviceStatusSchema.safeParse(json);
    if (!result.success) {
      await this.recordMalformed(deviceId, topic, rawPayload, result.error.message);
      return;
    }

    await this.prisma.device.updateMany({
      where: { id: deviceId },
      data: { status: result.data.status, lastSeenAt: receivedAt },
    });
  }

  private async handleEvent(
    deviceId: string,
    json: unknown,
    receivedAt: Date,
    topic: string,
    rawPayload: string,
  ): Promise<void> {
    const result = deviceEventSchema.safeParse(json);
    if (!result.success) {
      await this.recordMalformed(deviceId, topic, rawPayload, result.error.message);
      return;
    }

    await this.recordEvent(deviceId, result.data.eventType, result.data.payload ?? null, receivedAt);
    await this.touchLastSeen(deviceId, receivedAt);
  }

  private async handleCommandAck(
    deviceId: string,
    json: unknown,
    receivedAt: Date,
    topic: string,
    rawPayload: string,
  ): Promise<void> {
    const result = commandAckSchema.safeParse(json);
    if (!result.success) {
      await this.recordMalformed(deviceId, topic, rawPayload, result.error.message);
      return;
    }

    await this.recordEvent(
      deviceId,
      "command_ack",
      { commandId: result.data.commandId, status: result.data.status, ...(result.data.payload ?? {}) },
      receivedAt,
    );
  }

  private async touchLastSeen(deviceId: string, receivedAt: Date): Promise<void> {
    await this.prisma.device.updateMany({ where: { id: deviceId }, data: { lastSeenAt: receivedAt } });
  }

  private async recordEvent(
    deviceId: string,
    eventType: string,
    payload: Record<string, unknown> | null,
    ts: Date,
  ): Promise<void> {
    await this.prisma.deviceEvent.create({
      data: { deviceId, eventType, payload: (payload as Prisma.InputJsonValue) ?? undefined, ts },
    });
  }

  private async recordMalformed(deviceId: string, topic: string, rawPayload: string, reason: string): Promise<void> {
    this.logger.warn(`Malformed message on topic "${topic}": ${reason}`);
    try {
      await this.prisma.deviceEvent.create({
        data: {
          deviceId,
          eventType: "error",
          payload: { reason: "malformed_payload", detail: reason, topic, rawPayload: rawPayload.slice(0, 1000) },
        },
      });
    } catch (error) {
      this.logger.error("Failed to record malformed-payload device event", error);
    }
  }
}
