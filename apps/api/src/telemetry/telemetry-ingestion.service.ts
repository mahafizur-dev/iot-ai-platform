import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { MQTT_CLIENT, type IMqttClient } from "../mqtt/mqtt-client.interface";
import { MQTT_TOPIC_FILTERS } from "../mqtt/topics";
import { INGESTION_QUEUE, type IngestionJobData } from "./telemetry.constants";

/**
 * Subscribes to the device→backend topics and enqueues each message for the
 * BullMQ processor — this is the backpressure boundary from
 * docs/ARCHITECTURE.md §6: the MQTT `message` callback never does a
 * synchronous DB write, just an in-memory-fast `queue.add`.
 */
@Injectable()
export class TelemetryIngestionService implements OnModuleInit {
  private readonly logger = new Logger(TelemetryIngestionService.name);

  constructor(
    @Inject(MQTT_CLIENT) private readonly mqttClient: IMqttClient,
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue<IngestionJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const topicFilter of Object.values(MQTT_TOPIC_FILTERS)) {
      await this.mqttClient.subscribe(topicFilter, (topic, payload) => {
        this.enqueue(topic, payload).catch((error: unknown) =>
          this.logger.error(`Failed to enqueue message for topic "${topic}"`, error),
        );
      });
    }
  }

  private async enqueue(topic: string, payload: Buffer): Promise<void> {
    await this.queue.add("ingest", {
      topic,
      rawPayload: payload.toString("utf8"),
      receivedAt: new Date().toISOString(),
    });
  }
}
