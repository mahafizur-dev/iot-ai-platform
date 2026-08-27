import { z } from "zod";

/**
 * Generic JSON telemetry envelope (docs/ARCHITECTURE.md's open question #4
 * left this unresolved for v1 — a single reading or a batch array, both
 * accepted so single-reading devices stay simple while batching devices
 * aren't penalized). `ts` is optional: if a device has no reliable clock, the
 * ingestion processor falls back to server receipt time (see clock-skew.ts).
 */
export const telemetryReadingSchema = z.object({
  metric: z.string().min(1),
  value: z.number(),
  ts: z.iso.datetime().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const telemetryPayloadSchema = z.union([
  telemetryReadingSchema,
  z.array(telemetryReadingSchema).min(1),
]);

export type TelemetryReading = z.infer<typeof telemetryReadingSchema>;
export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;
