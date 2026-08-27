import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { NotificationsService } from "./notifications.service";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { NotificationsController } from "./notifications.controller";

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationPreferencesService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
