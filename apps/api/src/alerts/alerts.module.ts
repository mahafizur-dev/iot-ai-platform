import { Module } from "@nestjs/common";
import { DevicesModule } from "../devices/devices.module";
import { AuditModule } from "../audit/audit.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AlertRulesService } from "./alert-rules.service";
import { AlertRulesController } from "./alert-rules.controller";
import { AlertsService } from "./alerts.service";
import { AlertsController } from "./alerts.controller";
import { AlertEvaluationService } from "./alert-evaluation.service";
import { AlertSweepService } from "./alert-sweep.service";

/**
 * `AlertEvaluationService` is exported because the telemetry ingestion worker
 * calls it — the dependency runs telemetry → alerts, never the reverse, which
 * is what keeps the two modules acyclic.
 */
@Module({
  imports: [DevicesModule, AuditModule, RealtimeModule, NotificationsModule],
  controllers: [AlertRulesController, AlertsController],
  providers: [AlertRulesService, AlertsService, AlertEvaluationService, AlertSweepService],
  exports: [AlertEvaluationService],
})
export class AlertsModule {}
