import type { BleDevice } from "@iot-ai-platform/shared-types";
import type { IBleAdapter } from "./ble-adapter.interface";
import type { DevicesService } from "../devices/devices.service";
import { BleService } from "./ble.service";

function buildAdapter(overrides: Partial<jest.Mocked<IBleAdapter>> = {}): jest.Mocked<IBleAdapter> {
  return {
    scan: jest.fn().mockResolvedValue([]),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    readCharacteristic: jest.fn().mockResolvedValue(Buffer.from([1])),
    writeCharacteristic: jest.fn().mockResolvedValue(undefined),
    onData: jest.fn(),
    ...overrides,
  };
}

function buildDevicesService(): jest.Mocked<Pick<DevicesService, "create">> {
  return { create: jest.fn().mockResolvedValue({ id: "device-1" }) };
}

describe("BleService", () => {
  it("delegates scan/connect/disconnect straight to the adapter", async () => {
    const adapter = buildAdapter();
    const service = new BleService(adapter, buildDevicesService() as never);

    await service.scan();
    await service.connect("dev-1");
    await service.disconnect("dev-1");

    expect(adapter.scan).toHaveBeenCalled();
    expect(adapter.connect).toHaveBeenCalledWith("dev-1");
    expect(adapter.disconnect).toHaveBeenCalledWith("dev-1");
  });

  it("encodes a read result as base64 with device/characteristic metadata", async () => {
    const adapter = buildAdapter({
      readCharacteristic: jest.fn().mockResolvedValue(Buffer.from([42])),
    });
    const service = new BleService(adapter, buildDevicesService() as never);

    const value = await service.read("dev-1", "char-1");

    expect(value).toMatchObject({ deviceId: "dev-1", characteristicId: "char-1", data: "Kg==" });
    expect(value.ts).toEqual(expect.any(String));
  });

  it("decodes base64 input before writing to the adapter", async () => {
    const adapter = buildAdapter();
    const service = new BleService(adapter, buildDevicesService() as never);

    await service.write("dev-1", "char-1", "Kg==");

    expect(adapter.writeCharacteristic).toHaveBeenCalledWith("dev-1", "char-1", Buffer.from([42]));
  });

  it("registers a scanned device into the shared registry with BLE metadata", async () => {
    const scanned: BleDevice = {
      id: "ble-sim-thermostat",
      name: "Simulated Thermostat",
      rssi: -55,
      serviceUuids: ["uuid-1"],
      status: "disconnected",
      lastSeenAt: new Date().toISOString(),
    };
    const adapter = buildAdapter({ scan: jest.fn().mockResolvedValue([scanned]) });
    const devicesService = buildDevicesService();
    const service = new BleService(adapter, devicesService as never);

    await service.register("org-1", "user-1", "ble-sim-thermostat", {});

    expect(devicesService.create).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      expect.objectContaining({
        name: "Simulated Thermostat",
        type: "ble",
        metadata: expect.objectContaining({
          bleDeviceId: "ble-sim-thermostat",
          serviceUuids: ["uuid-1"],
        }),
      }),
    );
  });

  it("prefers an explicit name override over the scanned device name", async () => {
    const scanned: BleDevice = {
      id: "ble-sim-thermostat",
      name: "Simulated Thermostat",
      rssi: -55,
      serviceUuids: [],
      status: "disconnected",
      lastSeenAt: new Date().toISOString(),
    };
    const adapter = buildAdapter({ scan: jest.fn().mockResolvedValue([scanned]) });
    const devicesService = buildDevicesService();
    const service = new BleService(adapter, devicesService as never);

    await service.register("org-1", "user-1", "ble-sim-thermostat", { name: "My Thermostat" });

    expect(devicesService.create).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      expect.objectContaining({ name: "My Thermostat" }),
    );
  });

  it("falls back to the bare device id when the device wasn't found in a fresh scan", async () => {
    const adapter = buildAdapter({ scan: jest.fn().mockResolvedValue([]) });
    const devicesService = buildDevicesService();
    const service = new BleService(adapter, devicesService as never);

    await service.register("org-1", "user-1", "unknown-device", {});

    expect(devicesService.create).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      expect.objectContaining({ name: "unknown-device" }),
    );
  });
});
