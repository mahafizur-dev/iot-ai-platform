export type BleAdapterStatus = "disconnected" | "connecting" | "connected" | "error";

export interface BleDevice {
  id: string;
  name: string;
  rssi: number;
  serviceUuids: string[];
  status: BleAdapterStatus;
  lastSeenAt: string;
}

export interface BleCharacteristic {
  uuid: string;
  properties: Array<"read" | "write" | "notify">;
}

export interface BleCharacteristicValue {
  deviceId: string;
  characteristicId: string;
  /** Base64-encoded — Buffers don't survive JSON over the wire. */
  data: string;
  ts: string;
}
