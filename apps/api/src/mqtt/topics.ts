/** Topic namespace: `iot/{orgId}/{deviceId}/...` (see docs/ARCHITECTURE.md §6). */
export const MQTT_TOPIC_FILTERS = {
  TELEMETRY: "iot/+/+/telemetry",
  STATUS: "iot/+/+/status",
  EVENTS: "iot/+/+/events",
  COMMAND_ACK: "iot/+/+/commands/ack",
} as const;

export interface ParsedDeviceTopic {
  orgId: string;
  deviceId: string;
  /** Everything after `iot/{orgId}/{deviceId}/`, e.g. "telemetry" or "commands/ack". */
  suffix: string;
}

export function parseDeviceTopic(topic: string): ParsedDeviceTopic | null {
  const parts = topic.split("/");

  if (parts.length < 4 || parts[0] !== "iot" || !parts[1] || !parts[2]) {
    return null;
  }

  return { orgId: parts[1], deviceId: parts[2], suffix: parts.slice(3).join("/") };
}
