import { z } from "zod";

/**
 * Published to `iot/{orgId}/{deviceId}/commands/ack`. No command-dispatch
 * feature exists yet (that lands with a later phase) — this just gives the
 * ingestion pipeline somewhere to record acks so nothing is silently dropped
 * once command dispatch does exist.
 */
export const commandAckSchema = z.object({
  commandId: z.string().min(1),
  status: z.enum(["ack", "failed"]),
  payload: z.record(z.string(), z.unknown()).optional(),
  ts: z.iso.datetime().optional(),
});

export type CommandAckPayload = z.infer<typeof commandAckSchema>;
