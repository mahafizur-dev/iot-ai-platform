import type { BleCharacteristicValue } from "@iot-ai-platform/shared-types";

export function toCharacteristicValueResponse(
  deviceId: string,
  characteristicId: string,
  data: Buffer,
): BleCharacteristicValue {
  return {
    deviceId,
    characteristicId,
    data: data.toString("base64"),
    ts: new Date().toISOString(),
  };
}
