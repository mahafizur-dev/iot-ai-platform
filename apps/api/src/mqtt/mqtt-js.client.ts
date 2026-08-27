import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import mqtt, { type MqttClient } from "mqtt";
import type { IMqttClient, MqttMessageHandler } from "./mqtt-client.interface";
import { matchesTopicFilter } from "./topic-matcher";

/**
 * Real `mqtt.js`-backed client. Reconnect/backoff is mqtt.js's own built-in
 * behavior (default `reconnectPeriod`) — not reimplemented here, per
 * docs/ARCHITECTURE.md's rationale for wrapping the library at all.
 */
@Injectable()
export class MqttJsClient implements IMqttClient {
  private readonly logger = new Logger(MqttJsClient.name);
  private client?: MqttClient;
  private readonly handlers = new Map<string, MqttMessageHandler>();

  constructor(private readonly config: ConfigService) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(this.config.getOrThrow<string>("MQTT_BROKER_URL"), {
        username: this.config.get<string>("MQTT_USERNAME"),
        password: this.config.get<string>("MQTT_PASSWORD"),
      });

      client.once("connect", () => {
        this.logger.log("Connected to MQTT broker");
        resolve();
      });

      client.once("error", (error) => {
        this.logger.error("MQTT connection error", error);
        reject(error instanceof Error ? error : new Error(String(error)));
      });

      client.on("reconnect", () => this.logger.warn("Reconnecting to MQTT broker..."));

      client.on("message", (topic, payload) => {
        for (const [filter, handler] of this.handlers) {
          if (matchesTopicFilter(filter, topic)) {
            handler(topic, payload);
          }
        }
      });

      this.client = client;
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve();
        return;
      }

      this.client.end(false, {}, () => resolve());
    });
  }

  publish(topic: string, payload: string | Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error("MQTT client is not connected"));
        return;
      }

      this.client.publish(topic, payload, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  subscribe(topicFilter: string, handler: MqttMessageHandler): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error("MQTT client is not connected"));
        return;
      }

      this.client.subscribe(topicFilter, { qos: 1 }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        this.handlers.set(topicFilter, handler);
        resolve();
      });
    });
  }
}
