import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { BleCharacteristic, BleDevice } from "@iot-ai-platform/shared-types";
import type { BleDataHandler, IBleAdapter } from "./ble-adapter.interface";

interface SimulatedDevice {
  device: BleDevice;
  characteristics: BleCharacteristic[];
}

const NOTIFY_INTERVAL_MS = 2_000;

/**
 * Simulated devices only — no real radio. This is the seam described in
 * docs/ARCHITECTURE.md §10, not a hardware integration: it exists so the
 * rest of the system (device registration, telemetry pipeline) can be built
 * and tested against `IBleAdapter` today.
 */
@Injectable()
export class MockBleAdapter implements IBleAdapter, OnModuleDestroy {
  private readonly logger = new Logger(MockBleAdapter.name);
  private readonly connected = new Set<string>();
  private readonly readCounters = new Map<string, number>();
  private readonly dataHandlers: BleDataHandler[] = [];
  private readonly notifyTimer: NodeJS.Timeout;

  private readonly devices = new Map<string, SimulatedDevice>([
    [
      "ble-sim-thermostat",
      {
        device: {
          id: "ble-sim-thermostat",
          name: "Simulated Thermostat",
          rssi: -55,
          serviceUuids: ["0000181a-0000-1000-8000-00805f9b34fb"],
          status: "disconnected",
          lastSeenAt: new Date().toISOString(),
        },
        characteristics: [
          { uuid: "00002a6e-0000-1000-8000-00805f9b34fb", properties: ["read", "notify"] },
        ],
      },
    ],
    [
      "ble-sim-lock",
      {
        device: {
          id: "ble-sim-lock",
          name: "Simulated Smart Lock",
          rssi: -68,
          serviceUuids: ["0000183a-0000-1000-8000-00805f9b34fb"],
          status: "disconnected",
          lastSeenAt: new Date().toISOString(),
        },
        characteristics: [
          { uuid: "00002a3d-0000-1000-8000-00805f9b34fb", properties: ["read", "write"] },
        ],
      },
    ],
  ]);

  constructor() {
    this.notifyTimer = setInterval(() => this.emitNotifications(), NOTIFY_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.notifyTimer);
  }

  async scan(): Promise<BleDevice[]> {
    return Array.from(this.devices.values()).map(({ device }) => ({
      ...device,
      status: this.connected.has(device.id) ? "connected" : "disconnected",
      rssi: device.rssi + jitter(),
      lastSeenAt: new Date().toISOString(),
    }));
  }

  async connect(deviceId: string): Promise<void> {
    this.getSimulated(deviceId);
    this.connected.add(deviceId);
  }

  async disconnect(deviceId: string): Promise<void> {
    this.connected.delete(deviceId);
  }

  async readCharacteristic(deviceId: string, characteristicId: string): Promise<Buffer> {
    this.getCharacteristic(deviceId, characteristicId);

    const key = `${deviceId}/${characteristicId}`;
    const count = (this.readCounters.get(key) ?? 0) + 1;
    this.readCounters.set(key, count);

    return Buffer.from([count % 256]);
  }

  async writeCharacteristic(
    deviceId: string,
    characteristicId: string,
    data: Buffer,
  ): Promise<void> {
    this.getCharacteristic(deviceId, characteristicId);
    this.logger.log(`Simulated write to ${deviceId}/${characteristicId}: ${data.toString("hex")}`);
  }

  onData(handler: BleDataHandler): void {
    this.dataHandlers.push(handler);
  }

  private getSimulated(deviceId: string): SimulatedDevice {
    const simulated = this.devices.get(deviceId);
    if (!simulated) {
      throw new NotFoundException("BLE device not found");
    }
    return simulated;
  }

  private getCharacteristic(deviceId: string, characteristicId: string): BleCharacteristic {
    if (!this.connected.has(deviceId)) {
      throw new BadRequestException("BLE device is not connected");
    }

    const simulated = this.getSimulated(deviceId);
    const characteristic = simulated.characteristics.find((c) => c.uuid === characteristicId);
    if (!characteristic) {
      throw new NotFoundException("BLE characteristic not found");
    }
    return characteristic;
  }

  private emitNotifications(): void {
    for (const deviceId of this.connected) {
      const simulated = this.devices.get(deviceId);
      const notifyChar = simulated?.characteristics.find((c) => c.properties.includes("notify"));
      if (!notifyChar) continue;

      const key = `${deviceId}/${notifyChar.uuid}`;
      const count = (this.readCounters.get(key) ?? 0) + 1;
      this.readCounters.set(key, count);

      const value = {
        deviceId,
        characteristicId: notifyChar.uuid,
        data: Buffer.from([count % 256]).toString("base64"),
        ts: new Date().toISOString(),
      };

      for (const handler of this.dataHandlers) {
        handler(deviceId, value);
      }
    }
  }
}

function jitter(): number {
  return Math.floor(Math.random() * 5) - 2;
}
