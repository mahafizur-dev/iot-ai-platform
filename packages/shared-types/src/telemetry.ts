/** Mirrors apps/api's Zod ingestion schemas (see apps/api/src/telemetry/schemas) — for FE consumption. */
export interface TelemetryReading {
  metric: string;
  value: number;
  ts?: string;
  payload?: Record<string, unknown>;
}

export interface DeviceStatusPayload {
  status: "online" | "offline";
  ts?: string;
}

export interface DeviceEventPayload {
  eventType: "connected" | "disconnected" | "error" | "firmware_update";
  payload?: Record<string, unknown>;
  ts?: string;
}

/** Shape returned by GET /devices/:id/telemetry (no agg/interval). */
export interface TelemetryPoint {
  ts: string;
  metric: string;
  value: number;
  payload: Record<string, unknown> | null;
}

/** Shape returned by GET /devices/:id/telemetry?agg=...&interval=... */
export interface TelemetryAggregatePoint {
  bucket: string;
  metric: string;
  value: number;
  sampleCount: number;
}
