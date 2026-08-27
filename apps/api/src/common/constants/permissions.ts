/**
 * Canonical permission catalog. Every value here must be seeded by
 * prisma/seed.ts and every value seeded there must be used by a guard
 * somewhere — this file is the single source of truth for both.
 */
export const PERMISSIONS = {
  DEVICE_READ: "device:read",
  DEVICE_WRITE: "device:write",
  DEVICE_DELETE: "device:delete",
  DEVICE_CREDENTIALS_ROTATE: "device:credentials:rotate",
  TELEMETRY_READ: "telemetry:read",
  ALERT_READ: "alert:read",
  ALERT_WRITE: "alert:write",
  ALERT_ACK: "alert:ack",
  ANALYTICS_READ: "analytics:read",
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
