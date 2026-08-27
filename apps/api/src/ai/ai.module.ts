import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { DevicesModule } from "../devices/devices.module";
import { AuditModule } from "../audit/audit.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { AIController } from "./ai.controller";
import { AIService } from "./ai.service";
import { AIContextBuilder } from "./ai-context.builder";
import { aiProviderFactory } from "./ai-provider.factory";

@Module({
  imports: [
    DevicesModule,
    AuditModule,
    AnalyticsModule,
    // Scoped to this module rather than registered globally: §9 asks for a
    // limit on the AI endpoints specifically, and the platform-wide throttler
    // §12 calls for is a Phase 7 hardening concern with different numbers.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: 60_000,
          limit: config.get<number>("AI_RATE_LIMIT_PER_MINUTE", 10),
        },
      ],
    }),
  ],
  controllers: [AIController],
  providers: [AIService, AIContextBuilder, aiProviderFactory],
})
export class AIModule {}
