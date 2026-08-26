import { Module } from "@nestjs/common";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
