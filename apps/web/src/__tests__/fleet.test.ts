import { applyStatusChange, summarizeFleet } from "@/lib/fleet";
import type { DeviceResponse } from "@/lib/api-client";

function device(overrides: Partial<DeviceResponse> & { id: string }): DeviceResponse {
  return {
    organizationId: "org-1",
    name: `Device ${overrides.id}`,
    type: "sensor",
    model: null,
    status: "unknown",
    firmwareVersion: null,
    hardwareVersion: null,
    macAddress: null,
    ownerUserId: null,
    lastSeenAt: null,
    metadata: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deactivatedAt: null,
    ...overrides,
  };
}

describe("summarizeFleet", () => {
  it("counts online, offline, and never-reported devices", () => {
    const summary = summarizeFleet([
      device({ id: "a", status: "online" }),
      device({ id: "b", status: "online" }),
      device({ id: "c", status: "offline" }),
      device({ id: "d", status: "unknown" }),
    ]);

    expect(summary).toMatchObject({ total: 4, online: 2, offline: 1, unknown: 1 });
  });

  it("treats any non-online/offline status as never-reported", () => {
    // schema.prisma defaults status to "unknown", but it is a free-form string.
    expect(summarizeFleet([device({ id: "a", status: "provisioning" })]).unknown).toBe(1);
  });

  it("ranks the type mix by count, then name", () => {
    const summary = summarizeFleet([
      device({ id: "a", type: "gateway" }),
      device({ id: "b", type: "sensor" }),
      device({ id: "c", type: "sensor" }),
      device({ id: "d", type: "actuator" }),
    ]);

    expect(summary.byType).toEqual([
      { type: "sensor", count: 2 },
      { type: "actuator", count: 1 },
      { type: "gateway", count: 1 },
    ]);
  });

  it("handles an empty fleet", () => {
    expect(summarizeFleet([])).toEqual({
      total: 0,
      online: 0,
      offline: 0,
      unknown: 0,
      byType: [],
    });
  });
});

describe("applyStatusChange", () => {
  it("updates only the matching device", () => {
    const devices = [device({ id: "a", status: "offline" }), device({ id: "b", status: "offline" })];

    const next = applyStatusChange(devices, "a", "online");

    expect(next[0]?.status).toBe("online");
    expect(next[1]?.status).toBe("offline");
  });

  it("returns the same reference when the event is for an unlisted device", () => {
    const devices = [device({ id: "a", status: "offline" })];

    expect(applyStatusChange(devices, "ghost", "online")).toBe(devices);
  });

  it("returns the same reference when the status already matches", () => {
    const devices = [device({ id: "a", status: "online" })];

    expect(applyStatusChange(devices, "a", "online")).toBe(devices);
  });
});
