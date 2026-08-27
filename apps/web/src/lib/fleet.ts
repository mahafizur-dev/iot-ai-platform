import type { DeviceResponse } from "@/lib/api-client";

export interface FleetSummary {
  total: number;
  online: number;
  offline: number;
  unknown: number;
  /** Distinct `type` values, most common first — feeds the mix chart. */
  byType: { type: string; count: number }[];
}

/**
 * Derived client-side rather than from a stats endpoint: none exists yet, and
 * the overview already needs the device list for its recent-devices table, so
 * a second round trip would buy nothing. Worth revisiting when a fleet grows
 * past what one page can hold — see the note in the overview screen.
 */
export function summarizeFleet(devices: DeviceResponse[]): FleetSummary {
  const counts = new Map<string, number>();
  let online = 0;
  let offline = 0;

  for (const device of devices) {
    counts.set(device.type, (counts.get(device.type) ?? 0) + 1);

    if (device.status === "online") online += 1;
    else if (device.status === "offline") offline += 1;
  }

  return {
    total: devices.length,
    online,
    offline,
    unknown: devices.length - online - offline,
    byType: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
  };
}

/** Applies a live `device:status_changed` event to a loaded device list. */
export function applyStatusChange(
  devices: DeviceResponse[],
  deviceId: string,
  status: string,
): DeviceResponse[] {
  let changed = false;

  const next = devices.map((device) => {
    if (device.id !== deviceId || device.status === status) return device;
    changed = true;
    return { ...device, status };
  });

  // Returning the same reference when nothing matched keeps React from
  // re-rendering on events for devices this screen isn't showing.
  return changed ? next : devices;
}
