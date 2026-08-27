import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DevicesModule } from "../devices/devices.module";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimeService } from "./realtime.service";

@Module({
  imports: [JwtModule.register({}), DevicesModule],
  providers: [RealtimeGateway, RealtimeService],
  // TelemetryModule's ingestion processor emits through RealtimeService.
  exports: [RealtimeService],
})
export class RealtimeModule {}
