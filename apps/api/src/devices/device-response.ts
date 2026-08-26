import type { Device } from "@prisma/client";

export interface DeviceResponse {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  model: string | null;
  status: string;
  firmwareVersion: string | null;
  hardwareVersion: string | null;
  macAddress: string | null;
  ownerUserId: string | null;
  lastSeenAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
}

export function toDeviceResponse(device: Device): DeviceResponse {
  return {
    id: device.id,
    organizationId: device.organizationId,
    name: device.name,
    type: device.type,
    model: device.model,
    status: device.status,
    firmwareVersion: device.firmwareVersion,
    hardwareVersion: device.hardwareVersion,
    macAddress: device.macAddress,
    ownerUserId: device.ownerUserId,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    metadata: device.metadata ? (JSON.parse(device.metadata) as Record<string, unknown>) : null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
    deactivatedAt: device.deactivatedAt?.toISOString() ?? null,
  };
}
