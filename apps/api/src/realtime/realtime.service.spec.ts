import { RealtimeService } from "./realtime.service";

function buildServer() {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return { server: { to } as never, to, emit };
}

const READING = { ts: "2026-08-27T12:00:00.000Z", metric: "temperature", value: 21.5, payload: null };

describe("RealtimeService", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("is a no-op before a server is attached (ingestion must not blow up pre-init)", () => {
    const service = new RealtimeService();
    expect(() => service.emitTelemetry("org-1", "device-1", READING)).not.toThrow();
  });

  it("emits telemetry to both the org room and the device room", () => {
    const { server, to, emit } = buildServer();
    const service = new RealtimeService();
    service.setServer(server);

    service.emitTelemetry("org-1", "device-1", READING);

    expect(to).toHaveBeenCalledWith(["org:org-1", "device:device-1"]);
    expect(emit).toHaveBeenCalledWith("telemetry:update", {
      deviceId: "device-1",
      reading: READING,
    });
  });

  it("throttles repeat telemetry for the same (device, metric) within the window", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-27T12:00:00.000Z"));
    const { server, emit } = buildServer();
    const service = new RealtimeService();
    service.setServer(server);

    service.emitTelemetry("org-1", "device-1", READING);
    service.emitTelemetry("org-1", "device-1", { ...READING, value: 22 });

    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("emits again once the throttle window has elapsed", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-27T12:00:00.000Z"));
    const { server, emit } = buildServer();
    const service = new RealtimeService();
    service.setServer(server);

    service.emitTelemetry("org-1", "device-1", READING);
    jest.advanceTimersByTime(1500);
    service.emitTelemetry("org-1", "device-1", { ...READING, value: 22 });

    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("throttles per metric, so a second metric is not suppressed by the first", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-27T12:00:00.000Z"));
    const { server, emit } = buildServer();
    const service = new RealtimeService();
    service.setServer(server);

    service.emitTelemetry("org-1", "device-1", READING);
    service.emitTelemetry("org-1", "device-1", { ...READING, metric: "humidity", value: 55 });

    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("does not throttle status changes", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-27T12:00:00.000Z"));
    const { server, emit } = buildServer();
    const service = new RealtimeService();
    service.setServer(server);

    const at = new Date("2026-08-27T12:00:00.000Z");
    service.emitDeviceStatus("org-1", "device-1", "online", at);
    service.emitDeviceStatus("org-1", "device-1", "offline", at);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith("device:status_changed", {
      deviceId: "device-1",
      status: "offline",
      at: at.toISOString(),
    });
  });
});
