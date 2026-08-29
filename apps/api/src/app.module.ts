import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { envValidationSchema } from "./config/env.validation";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { RolesModule } from "./roles/roles.module";
import { DevicesModule } from "./devices/devices.module";
import { AuditModule } from "./audit/audit.module";
import { TelemetryModule } from "./telemetry/telemetry.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { AlertsModule } from "./alerts/alerts.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AIModule } from "./ai/ai.module";
import { BleModule } from "./ble/ble.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ScheduleModule.forRoot(),
    // Platform-wide floor (see docs/ARCHITECTURE.md §8/§12). Scoped modules
    // (AuthModule, AIModule) additionally register their own tighter
    // ThrottlerModule for routes that need a different limit or tracker —
    // each dynamic registration gets its own storage, so those stack with
    // this one rather than overriding it.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { ttl: 60_000, limit: config.get<number>("RATE_LIMIT_PER_MINUTE", 100) },
      ],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(config.getOrThrow<string>("REDIS_URL"));
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port) || 6379,
            password: redisUrl.password || undefined,
          },
        };
      },
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RolesModule,
    DevicesModule,
    AuditModule,
    RealtimeModule,
    NotificationsModule,
    AlertsModule,
    AnalyticsModule,
    AIModule,
    TelemetryModule,
    BleModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
