import type { Job } from "bullmq";
import { TelemetryIngestionProcessor } from "./telemetry-ingestion.processor";
import type { IngestionJobData } from "./telemetry.constants";

const ORG_ID = "org-1";

function buildPrisma(device: unknown = { id: "device-1", organizationId: ORG_ID }) {
  return {
    telemetry: { upsert: jest.fn().mockResolvedValue(undefined) },
    device: {
      findFirst: jest.fn().mockResolvedValue(device),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceEvent: { create: jest.fn().mockResolvedValue(undefined) },
  };
}

function buildRealtime() {
  return { emitTelemetry: jest.fn(), emitDeviceStatus: jest.fn() };
}

function buildJob(data: IngestionJobData): Job<IngestionJobData> {
  return { data } as Job<IngestionJobData>;
}

const RECEIVED_AT = "2026-08-27T12:00:00.000Z";

describe("TelemetryIngestionProcessor", () => {
  it("upserts a valid single telemetry reading keyed on (deviceId, ts, metric)", async () => {
    const prisma = buildPrisma();
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await processor.process(
      buildJob({
        topic: "iot/org-1/device-1/telemetry",
        rawPayload: JSON.stringify({ metric: "temperature", value: 21.5, ts: "2026-08-27T11:59:30.000Z" }),
        receivedAt: RECEIVED_AT,
      }),
    );

    expect(prisma.telemetry.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.telemetry.upsert.mock.calls[0][0];
    expect(call.where.deviceId_ts_metric).toEqual({
      deviceId: "device-1",
      ts: new Date("2026-08-27T11:59:30.000Z"),
      metric: "temperature",
    });
    expect(call.create.value).toBe(21.5);
    expect(prisma.device.updateMany).toHaveBeenCalled();

    expect(realtime.emitTelemetry).toHaveBeenCalledWith(ORG_ID, "device-1", {
      ts: "2026-08-27T11:59:30.000Z",
      metric: "temperature",
      value: 21.5,
      payload: null,
    });
  });

  it("emits realtime updates using the device's stored org, not the org in the topic", async () => {
    // The EMQX ACL pins only the device segment (`iot/+/${username}/#`), so a
    // device can publish under another org's path — the emit must not follow it.
    const prisma = buildPrisma({ id: "device-1", organizationId: ORG_ID });
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await processor.process(
      buildJob({
        topic: "iot/someone-elses-org/device-1/telemetry",
        rawPayload: JSON.stringify({ metric: "temperature", value: 21.5 }),
        receivedAt: RECEIVED_AT,
      }),
    );

    expect(realtime.emitTelemetry).toHaveBeenCalledWith(ORG_ID, "device-1", expect.anything());
  });

  it("drops messages for an unknown device instead of violating the telemetry FK", async () => {
    const prisma = buildPrisma(null);
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await processor.process(
      buildJob({
        topic: "iot/org-1/ghost-device/telemetry",
        rawPayload: JSON.stringify({ metric: "temperature", value: 21.5 }),
        receivedAt: RECEIVED_AT,
      }),
    );

    expect(prisma.telemetry.upsert).not.toHaveBeenCalled();
    expect(realtime.emitTelemetry).not.toHaveBeenCalled();
  });

  it("upserts every reading in a batch", async () => {
    const prisma = buildPrisma();
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await processor.process(
      buildJob({
        topic: "iot/org-1/device-1/telemetry",
        rawPayload: JSON.stringify([
          { metric: "temperature", value: 21.5 },
          { metric: "humidity", value: 55 },
        ]),
        receivedAt: RECEIVED_AT,
      }),
    );

    expect(prisma.telemetry.upsert).toHaveBeenCalledTimes(2);
  });

  it("clamps a far-future device timestamp and logs a clock-skew device event", async () => {
    const prisma = buildPrisma();
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await processor.process(
      buildJob({
        topic: "iot/org-1/device-1/telemetry",
        rawPayload: JSON.stringify({ metric: "temperature", value: 21.5, ts: "2099-01-01T00:00:00.000Z" }),
        receivedAt: RECEIVED_AT,
      }),
    );

    const upsertArgs = prisma.telemetry.upsert.mock.calls[0][0];
    expect(upsertArgs.where.deviceId_ts_metric.ts).toEqual(new Date(RECEIVED_AT));

    expect(prisma.deviceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "error",
          payload: expect.objectContaining({ reason: "clock_skew_detected" }),
        }),
      }),
    );
  });

  it("records a malformed_payload device event on invalid JSON, without crashing", async () => {
    const prisma = buildPrisma();
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await expect(
      processor.process(
        buildJob({
          topic: "iot/org-1/device-1/telemetry",
          rawPayload: "{not valid json",
          receivedAt: RECEIVED_AT,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(prisma.telemetry.upsert).not.toHaveBeenCalled();
    expect(prisma.deviceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: "error" }) }),
    );
  });

  it("records a malformed_payload device event when the schema doesn't match", async () => {
    const prisma = buildPrisma();
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await processor.process(
      buildJob({
        topic: "iot/org-1/device-1/telemetry",
        rawPayload: JSON.stringify({ metric: "temperature" }), // missing `value`
        receivedAt: RECEIVED_AT,
      }),
    );

    expect(prisma.telemetry.upsert).not.toHaveBeenCalled();
    expect(prisma.deviceEvent.create).toHaveBeenCalled();
  });

  it("updates device status and lastSeenAt on a status message", async () => {
    const prisma = buildPrisma();
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await processor.process(
      buildJob({
        topic: "iot/org-1/device-1/status",
        rawPayload: JSON.stringify({ status: "offline" }),
        receivedAt: RECEIVED_AT,
      }),
    );

    expect(prisma.device.updateMany).toHaveBeenCalledWith({
      where: { id: "device-1" },
      data: { status: "offline", lastSeenAt: new Date(RECEIVED_AT) },
    });

    expect(realtime.emitDeviceStatus).toHaveBeenCalledWith(
      ORG_ID,
      "device-1",
      "offline",
      new Date(RECEIVED_AT),
    );
  });

  it("records a device_events row for an events-topic message", async () => {
    const prisma = buildPrisma();
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await processor.process(
      buildJob({
        topic: "iot/org-1/device-1/events",
        rawPayload: JSON.stringify({ eventType: "firmware_update", payload: { version: "1.2.3" } }),
        receivedAt: RECEIVED_AT,
      }),
    );

    expect(prisma.deviceEvent.create).toHaveBeenCalledWith({
      data: {
        deviceId: "device-1",
        eventType: "firmware_update",
        payload: { version: "1.2.3" },
        ts: new Date(RECEIVED_AT),
      },
    });
  });

  it("records a command_ack device event for a commands/ack message", async () => {
    const prisma = buildPrisma();
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await processor.process(
      buildJob({
        topic: "iot/org-1/device-1/commands/ack",
        rawPayload: JSON.stringify({ commandId: "cmd-1", status: "ack" }),
        receivedAt: RECEIVED_AT,
      }),
    );

    expect(prisma.deviceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: "command_ack" }) }),
    );
  });

  it("ignores messages on an unrecognized topic shape without throwing", async () => {
    const prisma = buildPrisma();
    const realtime = buildRealtime();
    const processor = new TelemetryIngestionProcessor(prisma as never, realtime as never);

    await expect(
      processor.process(buildJob({ topic: "not-iot-shaped", rawPayload: "{}", receivedAt: RECEIVED_AT })),
    ).resolves.toBeUndefined();

    expect(prisma.telemetry.upsert).not.toHaveBeenCalled();
    expect(prisma.deviceEvent.create).not.toHaveBeenCalled();
  });
});
