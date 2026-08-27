import { z } from "zod";

/** Published to `iot/{orgId}/{deviceId}/status`, also driven by MQTT LWT on ungraceful disconnect. */
export const deviceStatusSchema = z.object({
  status: z.enum(["online", "offline"]),
  ts: z.iso.datetime().optional(),
});

export type DeviceStatusPayload = z.infer<typeof deviceStatusSchema>;
