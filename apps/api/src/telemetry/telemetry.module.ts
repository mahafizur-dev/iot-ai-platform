import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { MqttModule } from "../mqtt/mqtt.module";
import { DevicesModule } from "../devices/devices.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AlertsModule } from "../alerts/alerts.module";
import { INGESTION_QUEUE } from "./telemetry.constants";
import { TelemetryIngestionService } from "./telemetry-ingestion.service";
import { TelemetryIngestionProcessor } from "./telemetry-ingestion.processor";
import { TelemetryService } from "./telemetry.service";
import { TelemetryController } from "./telemetry.controller";
import { DeviceWatchdogService } from "./device-watchdog.service";

@Module({
  imports: [
    MqttModule,
    DevicesModule,
    RealtimeModule,
    AlertsModule,
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryIngestionService, TelemetryIngestionProcessor, TelemetryService, DeviceWatchdogService],
})
export class TelemetryModule {}
