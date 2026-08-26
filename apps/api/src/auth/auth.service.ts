import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import type { User } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RolesService } from "../roles/roles.service";
import { UsersService } from "../users/users.service";
import { toUserProfile, type UserProfile } from "../users/user-profile";
import type { JwtPayload } from "../common/types/auth.types";
import { hashToken } from "./token-hash.util";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly auditService: AuditService,
  ) {}

  async register(dto: RegisterDto, ipAddress?: string): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const { user } = await this.usersService.createUserWithOrganization({
      email: dto.email,
      passwordHash,
      name: dto.name,
      organizationName: dto.organizationName,
    });

    await this.rolesService.assignDefaultRole(user.id);

    await this.auditService.log({
      actorUserId: user.id,
      action: "user.register",
      entityType: "user",
      entityId: user.id,
      ipAddress,
    });

    return this.issueTokensForUser(user);
  }

  async login(dto: LoginDto, ipAddress?: string): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    await this.usersService.touchLastLogin(user.id);

    await this.auditService.log({
      actorUserId: user.id,
      action: "user.login",
      entityType: "user",
      entityId: user.id,
      ipAddress,
    });

    return this.issueTokensForUser(user);
  }

  async refresh(rawToken: string | undefined): Promise<AuthResult> {
    if (!rawToken) {
      throw new UnauthorizedException("Missing refresh token");
    }

    let decoded: { sub: string };
    try {
      decoded = this.jwtService.verify<{ sub: string }>(rawToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.usersService.findById(decoded.sub);
    if (!user) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    return this.issueTokensForUser(user);
  }

  /** Idempotent: revoking an already-revoked/unknown token is a no-op, never an error. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;

    const tokenHash = hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokensForUser(user: User): Promise<AuthResult> {
    const authorization = await this.rolesService.getAuthorizationForUser(user.id);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roles: authorization.roles,
      permissions: authorization.permissions,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: this.config.getOrThrow<string>("JWT_ACCESS_EXPIRES_IN"),
    });

    const refreshToken = await this.issueRefreshToken(user.id);

    return { accessToken, refreshToken, user: toUserProfile(user, authorization) };
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    // jti guarantees uniqueness even when two tokens are issued for the same
    // user within the same second (same iat) — e.g. register immediately
    // followed by a refresh — which would otherwise produce identical JWTs
    // and collide on the tokenHash unique constraint.
    const token = this.jwtService.sign(
      { sub: userId, jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.config.getOrThrow<string>("JWT_REFRESH_EXPIRES_IN"),
      },
    );

    const decoded = this.jwtService.decode<{ exp: number }>(token);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return token;
  }
}
