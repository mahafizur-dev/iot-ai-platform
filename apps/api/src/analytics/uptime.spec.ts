import { calculateUptime, type ConnectivityEvent } from "./uptime";

const WINDOW = {
  from: new Date("2026-08-27T00:00:00.000Z"),
  to: new Date("2026-08-28T00:00:00.000Z"),
};

const DAY_SECONDS = 86_400;

function event(eventType: string, iso: string): ConnectivityEvent {
  return { eventType, ts: new Date(iso) };
}

describe("calculateUptime", () => {
  it("reports full uptime for a device that was online throughout with no events", () => {
    // The common case: a healthy device that connected days ago. Its trail has
    // nothing inside the window, but it was up for all of it.
    const result = calculateUptime([], WINDOW, "online");

    expect(result.ratio).toBe(1);
    expect(result.onlineSeconds).toBe(DAY_SECONDS);
    expect(result.disconnections).toBe(0);
  });

  it("reports zero uptime for a device that was offline throughout", () => {
    expect(calculateUptime([], WINDOW, "offline").ratio).toBe(0);
  });

  it("counts a single mid-window disconnection", () => {
    const result = calculateUptime(
      [event("disconnected", "2026-08-27T06:00:00.000Z")],
      WINDOW,
      "online",
    );

    expect(result.ratio).toBe(0.25);
    expect(result.onlineSeconds).toBe(6 * 3600);
    expect(result.disconnections).toBe(1);
  });

  it("counts a device that came back", () => {
    const result = calculateUptime(
      [
        event("disconnected", "2026-08-27T06:00:00.000Z"),
        event("connected", "2026-08-27T12:00:00.000Z"),
      ],
      WINDOW,
      "online",
    );

    // Online 00:00–06:00 and 12:00–24:00 = 18 of 24 hours.
    expect(result.ratio).toBe(0.75);
    expect(result.disconnections).toBe(1);
  });

  it("handles a device that starts offline and recovers", () => {
    const result = calculateUptime(
      [event("connected", "2026-08-27T18:00:00.000Z")],
      WINDOW,
      "offline",
    );

    expect(result.ratio).toBe(0.25);
    expect(result.disconnections).toBe(0);
  });

  it("ignores repeated transitions in the same direction", () => {
    // A device republishing "online" must not restart the span or inflate the
    // disconnection count.
    const result = calculateUptime(
      [
        event("connected", "2026-08-27T02:00:00.000Z"),
        event("connected", "2026-08-27T04:00:00.000Z"),
        event("disconnected", "2026-08-27T12:00:00.000Z"),
        event("disconnected", "2026-08-27T13:00:00.000Z"),
      ],
      WINDOW,
      "online",
    );

    expect(result.ratio).toBe(0.5);
    expect(result.disconnections).toBe(1);
  });

  it("ignores non-connectivity events", () => {
    const result = calculateUptime(
      [
        event("error", "2026-08-27T06:00:00.000Z"),
        event("firmware_update", "2026-08-27T07:00:00.000Z"),
      ],
      WINDOW,
      "online",
    );

    expect(result.ratio).toBe(1);
  });

  it("ignores events outside the window", () => {
    const result = calculateUptime(
      [
        event("disconnected", "2026-08-26T06:00:00.000Z"),
        event("disconnected", "2026-08-29T06:00:00.000Z"),
      ],
      WINDOW,
      "online",
    );

    expect(result.ratio).toBe(1);
  });

  it("sorts events that arrive out of order", () => {
    // Ingestion timestamps come from devices, so late delivery can persist
    // rows out of chronological order.
    const result = calculateUptime(
      [
        event("connected", "2026-08-27T12:00:00.000Z"),
        event("disconnected", "2026-08-27T06:00:00.000Z"),
      ],
      WINDOW,
      "online",
    );

    expect(result.ratio).toBe(0.75);
  });

  it("counts several disconnections across the window", () => {
    const result = calculateUptime(
      [
        event("disconnected", "2026-08-27T04:00:00.000Z"),
        event("connected", "2026-08-27T05:00:00.000Z"),
        event("disconnected", "2026-08-27T10:00:00.000Z"),
        event("connected", "2026-08-27T11:00:00.000Z"),
      ],
      WINDOW,
      "online",
    );

    expect(result.disconnections).toBe(2);
    expect(result.onlineSeconds).toBe(22 * 3600);
  });

  it("returns zeroes rather than dividing by zero on an empty window", () => {
    const instant = new Date("2026-08-27T00:00:00.000Z");
    const result = calculateUptime([], { from: instant, to: instant }, "online");

    expect(result).toEqual({
      onlineSeconds: 0,
      windowSeconds: 0,
      ratio: 0,
      disconnections: 0,
    });
  });
});
