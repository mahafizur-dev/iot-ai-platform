export interface ResolvedTimestamp {
  ts: Date;
  /** True if the device-reported ts was out of tolerance and got clamped to `receivedAt`. */
  skewed: boolean;
}

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
const PAST_TOLERANCE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Telemetry's partition key is the device-reported timestamp (see
 * schema.prisma's comment on the Telemetry model) so that a re-delivered
 * QoS1 message upserts onto the same row. A device with a badly wrong clock
 * would otherwise poison that partition key, so readings too far in the
 * future or absurdly old get clamped to server receipt time instead of
 * trusted outright — flagged via `skewed`, never silently dropped
 * (docs/ARCHITECTURE.md §6).
 */
export function resolveTelemetryTimestamp(deviceReportedTs: string | undefined, receivedAt: Date): ResolvedTimestamp {
  if (!deviceReportedTs) {
    return { ts: receivedAt, skewed: false };
  }

  const parsed = new Date(deviceReportedTs);
  const deltaMs = parsed.getTime() - receivedAt.getTime();

  if (deltaMs > FUTURE_TOLERANCE_MS || deltaMs < -PAST_TOLERANCE_MS) {
    return { ts: receivedAt, skewed: true };
  }

  return { ts: parsed, skewed: false };
}
