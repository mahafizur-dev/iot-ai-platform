import { z } from "zod";

/** Published to `iot/{orgId}/{deviceId}/events` (docs/ARCHITECTURE.md §6). */
export const DEVICE_EVENT_TYPES = ["connected", "disconnected", "error", "firmware_update"] as const;

export const deviceEventSchema = z.object({
  eventType: z.enum(DEVICE_EVENT_TYPES),
  payload: z.record(z.string(), z.unknown()).optional(),
  ts: z.iso.datetime().optional(),
});

export type DeviceEventPayload = z.infer<typeof deviceEventSchema>;
