import { Module } from "@nestjs/common";
import { DevicesModule } from "../devices/devices.module";
import { AuditModule } from "../audit/audit.module";
import { BLE_ADAPTER } from "./ble-adapter.interface";
import { MockBleAdapter } from "./mock-ble.adapter";
import { BleService } from "./ble.service";
import { BleController } from "./ble.controller";

/**
 * Unlike MqttModule, there's no OnModuleInit connect-on-boot here: BLE
 * connections are per-device and API-triggered, not one persistent broker
 * connection.
 */
@Module({
  imports: [DevicesModule, AuditModule],
  controllers: [BleController],
  providers: [BleService, { provide: BLE_ADAPTER, useClass: MockBleAdapter }],
  exports: [BLE_ADAPTER],
})
export class BleModule {}
