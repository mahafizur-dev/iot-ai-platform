import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { UsersModule } from "../users/users.module";
import { RolesModule } from "../roles/roles.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    UsersModule,
    RolesModule,
    AuditModule,
    // Tighter than the platform-wide default in AppModule: §8 calls out
    // /auth/* specifically as a brute-force target. The default IP tracker
    // is correct here (unlike AIModule's), since pre-login routes have no
    // request.user to key on.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { ttl: 60_000, limit: config.get<number>("AUTH_RATE_LIMIT_PER_MINUTE", 10) },
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
