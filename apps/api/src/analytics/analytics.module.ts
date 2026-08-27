import { Module } from "@nestjs/common";
import { DevicesModule } from "../devices/devices.module";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsController } from "./analytics.controller";

@Module({
  imports: [DevicesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  // The AI context builder assembles its bounded summaries from these same
  // aggregates rather than querying telemetry itself.
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
