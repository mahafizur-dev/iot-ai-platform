/** Injection token — inject via `@Inject(MQTT_CLIENT)`. */
export const MQTT_CLIENT = Symbol("MQTT_CLIENT");

export type MqttMessageHandler = (topic: string, payload: Buffer) => void;

/**
 * Broker/library-agnostic seam (see docs/ARCHITECTURE.md's stack table: "wrapped
 * behind an IMqttClient interface... keeps the broker/library swappable and
 * gives us one place to handle reconnect/backoff"). Ingestion logic depends
 * only on this interface, never on `mqtt.js` directly, so it can be unit
 * tested against a fake implementation with no real broker.
 */
export interface IMqttClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, payload: string | Buffer): Promise<void>;
  /** `topicFilter` may use MQTT wildcards (`+`, `#`). */
  subscribe(topicFilter: string, handler: MqttMessageHandler): Promise<void>;
}
