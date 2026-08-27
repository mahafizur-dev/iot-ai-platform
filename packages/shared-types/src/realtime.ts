import type { TelemetryPoint } from "./telemetry";
import type { AlertResponse, NotificationResponse } from "./alerts";

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

/**
 * Notifications are addressed to one person, not one org, so they need a room
 * of their own — joined on connect from the token's `sub`, same as the org
 * room. A user with two tabs open gets the notification in both.
 */
export function userRoom(userId: string): string {
  return `user:${userId}`;
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

export interface AlertEvent {
  alert: AlertResponse;
}

export interface NotificationEvent {
  notification: NotificationResponse;
  /** Saves the client a round trip to re-read the badge count. */
  unreadCount: number;
}

export interface ServerToClientEvents {
  "telemetry:update": (event: TelemetryUpdateEvent) => void;
  "device:status_changed": (event: DeviceStatusChangedEvent) => void;
  /** Org room: a rule matched and opened a new alert. */
  "alert:triggered": (event: AlertEvent) => void;
  /** Org room: an existing alert changed status (acknowledged/resolved). */
  "alert:updated": (event: AlertEvent) => void;
  /** User room only — notifications are per-person. */
  "notification:new": (event: NotificationEvent) => void;
}

export interface ClientToServerEvents {
  "subscribe:device": (deviceId: string, ack: (result: SubscribeAck) => void) => void;
  "unsubscribe:device": (deviceId: string, ack: (result: SubscribeAck) => void) => void;
}
