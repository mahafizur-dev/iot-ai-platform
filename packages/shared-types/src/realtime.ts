import type { TelemetryPoint } from "./telemetry";

/**
 * One definition of the socket contract, shared by the NestJS gateway
 * (`Server<ClientToServerEvents, ServerToClientEvents>`) and the browser
 * client (`Socket<ServerToClientEvents, ClientToServerEvents>`) — so a
 * renamed event or a changed payload is a compile error on both sides
 * rather than a silently dropped message.
 */

/** Rooms (see docs/ARCHITECTURE.md §7): org room is joined on connect, device rooms on request. */
export function orgRoom(organizationId: string): string {
  return `org:${organizationId}`;
}

export function deviceRoom(deviceId: string): string {
  return `device:${deviceId}`;
}

export interface TelemetryUpdateEvent {
  deviceId: string;
  reading: TelemetryPoint;
}

export interface DeviceStatusChangedEvent {
  deviceId: string;
  status: "online" | "offline";
  at: string;
}

export interface SubscribeAck {
  ok: boolean;
  error?: string;
}

export interface ServerToClientEvents {
  "telemetry:update": (event: TelemetryUpdateEvent) => void;
  "device:status_changed": (event: DeviceStatusChangedEvent) => void;
}

export interface ClientToServerEvents {
  "subscribe:device": (deviceId: string, ack: (result: SubscribeAck) => void) => void;
  "unsubscribe:device": (deviceId: string, ack: (result: SubscribeAck) => void) => void;
}
