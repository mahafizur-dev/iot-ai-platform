import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { UsersModule } from "../users/users.module";
import { RolesModule } from "../roles/roles.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule, RolesModule, AuditModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
