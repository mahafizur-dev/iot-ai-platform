import type { BleCharacteristicValue, BleDevice } from "@iot-ai-platform/shared-types";

/** Injection token — inject via `@Inject(BLE_ADAPTER)`. */
export const BLE_ADAPTER = Symbol("BLE_ADAPTER");

export type BleDataHandler = (deviceId: string, value: BleCharacteristicValue) => void;

/**
 * Hardware-agnostic seam (see docs/ARCHITECTURE.md §10). Cloud API instances
 * have no BLE radio, so v1 ships only this interface plus a `MockBleAdapter`
 * — a real adapter (e.g. `@abandonware/noble`) is expected to run in a
 * future `apps/edge-agent` process, never in this module.
 */
export interface IBleAdapter {
  scan(): Promise<BleDevice[]>;
  connect(deviceId: string): Promise<void>;
  readCharacteristic(deviceId: string, characteristicId: string): Promise<Buffer>;
  writeCharacteristic(deviceId: string, characteristicId: string, data: Buffer): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  onData(handler: BleDataHandler): void;
}
