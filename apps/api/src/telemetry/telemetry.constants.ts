export const INGESTION_QUEUE = "telemetry-ingestion";

/**
 * BullMQ job payload — the MQTT `message` callback enqueues this and returns
 * immediately (docs/ARCHITECTURE.md §6's "Backpressure" requirement: ingestion
 * writes never block on synchronous DB writes per message).
 */
export interface IngestionJobData {
  topic: string;
  rawPayload: string;
  /** ISO string (Job data must be JSON-serializable) — server receipt time. */
  receivedAt: string;
}
