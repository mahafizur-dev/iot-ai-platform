import { Inject, Injectable } from "@nestjs/common";
import type { Device } from "@prisma/client";
import type { BleCharacteristicValue, BleDevice } from "@iot-ai-platform/shared-types";
import { DevicesService } from "../devices/devices.service";
import { BLE_ADAPTER, type IBleAdapter } from "./ble-adapter.interface";
import { toCharacteristicValueResponse } from "./ble-response";
import type { RegisterBleDeviceDto } from "./dto/register-ble-device.dto";

@Injectable()
export class BleService {
  constructor(
    @Inject(BLE_ADAPTER) private readonly adapter: IBleAdapter,
    private readonly devicesService: DevicesService,
  ) {}

  scan(): Promise<BleDevice[]> {
    return this.adapter.scan();
  }

  connect(deviceId: string): Promise<void> {
    return this.adapter.connect(deviceId);
  }

  disconnect(deviceId: string): Promise<void> {
    return this.adapter.disconnect(deviceId);
  }

  async read(deviceId: string, characteristicId: string): Promise<BleCharacteristicValue> {
    const data = await this.adapter.readCharacteristic(deviceId, characteristicId);
    return toCharacteristicValueResponse(deviceId, characteristicId, data);
  }

  write(deviceId: string, characteristicId: string, data: string): Promise<void> {
    return this.adapter.writeCharacteristic(
      deviceId,
      characteristicId,
      Buffer.from(data, "base64"),
    );
  }

  /**
   * Bridges a scanned BLE device into the shared `devices` registry (see
   * docs/ARCHITECTURE.md §10: BLE has no table of its own — `type: "ble"`
   * plus `metadata` is enough for the mock, and keeps every downstream
   * feature — alerts, telemetry, audit — working the same as any other
   * device without special-casing).
   */
  async register(
    organizationId: string,
    ownerUserId: string,
    bleDeviceId: string,
    dto: RegisterBleDeviceDto,
  ): Promise<Device> {
    const scanned = await this.adapter.scan();
    const found = scanned.find((d) => d.id === bleDeviceId);
    const name = dto.name ?? found?.name ?? bleDeviceId;

    return this.devicesService.create(organizationId, ownerUserId, {
      name,
      type: "ble",
      macAddress: undefined,
      metadata: {
        bleDeviceId,
        serviceUuids: found?.serviceUuids ?? [],
        rssi: found?.rssi,
      },
    });
  }
}
