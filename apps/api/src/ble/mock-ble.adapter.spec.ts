import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MockBleAdapter } from "./mock-ble.adapter";

const THERMOSTAT_ID = "ble-sim-thermostat";
const THERMOSTAT_CHAR = "00002a6e-0000-1000-8000-00805f9b34fb";
const LOCK_ID = "ble-sim-lock";
const LOCK_CHAR = "00002a3d-0000-1000-8000-00805f9b34fb";

describe("MockBleAdapter", () => {
  let adapter: MockBleAdapter;

  beforeEach(() => {
    jest.useFakeTimers();
    adapter = new MockBleAdapter();
  });

  afterEach(() => {
    adapter.onModuleDestroy();
    jest.useRealTimers();
  });

  it("scans and reports simulated devices as disconnected initially", async () => {
    const devices = await adapter.scan();

    expect(devices).toHaveLength(2);
    expect(devices.every((d) => d.status === "disconnected")).toBe(true);
  });

  it("throws NotFoundException connecting to an unknown device", async () => {
    await expect(adapter.connect("does-not-exist")).rejects.toThrow(NotFoundException);
  });

  it("marks a device connected after connect(), reflected in scan()", async () => {
    await adapter.connect(THERMOSTAT_ID);
    const devices = await adapter.scan();

    expect(devices.find((d) => d.id === THERMOSTAT_ID)?.status).toBe("connected");
  });

  it("rejects reading a characteristic before connecting", async () => {
    await expect(adapter.readCharacteristic(THERMOSTAT_ID, THERMOSTAT_CHAR)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects reading an unknown characteristic on a connected device", async () => {
    await adapter.connect(THERMOSTAT_ID);

    await expect(adapter.readCharacteristic(THERMOSTAT_ID, "unknown-uuid")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("returns incrementing single-byte reads for a known, connected characteristic", async () => {
    await adapter.connect(THERMOSTAT_ID);

    const first = await adapter.readCharacteristic(THERMOSTAT_ID, THERMOSTAT_CHAR);
    const second = await adapter.readCharacteristic(THERMOSTAT_ID, THERMOSTAT_CHAR);

    expect(first).toEqual(Buffer.from([1]));
    expect(second).toEqual(Buffer.from([2]));
  });

  it("no-ops a write to a known, connected characteristic", async () => {
    await adapter.connect(LOCK_ID);

    await expect(
      adapter.writeCharacteristic(LOCK_ID, LOCK_CHAR, Buffer.from([1])),
    ).resolves.toBeUndefined();
  });

  it("returns a device to disconnected after disconnect()", async () => {
    await adapter.connect(THERMOSTAT_ID);
    await adapter.disconnect(THERMOSTAT_ID);

    const devices = await adapter.scan();
    expect(devices.find((d) => d.id === THERMOSTAT_ID)?.status).toBe("disconnected");
  });

  it("emits notify data to registered handlers only for connected devices", async () => {
    const handler = jest.fn();
    adapter.onData(handler);
    await adapter.connect(THERMOSTAT_ID);

    jest.advanceTimersByTime(2_000);

    expect(handler).toHaveBeenCalledWith(
      THERMOSTAT_ID,
      expect.objectContaining({ deviceId: THERMOSTAT_ID, characteristicId: THERMOSTAT_CHAR }),
    );
  });

  it("does not emit notify data for a device that was never connected", async () => {
    const handler = jest.fn();
    adapter.onData(handler);

    jest.advanceTimersByTime(2_000);

    expect(handler).not.toHaveBeenCalled();
  });
});
