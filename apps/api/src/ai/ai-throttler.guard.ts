import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import type { JwtPayload } from "../common/types/auth.types";

/**
 * docs/ARCHITECTURE.md §9 asks for **per-user/org** rate limiting on the AI
 * endpoints, not per-IP. The default tracker keys on the request IP, which is
 * wrong in both directions here: a whole office behind one NAT would share a
 * budget, while one user on a mobile connection could hop addresses and
 * escape it.
 *
 * These routes sit behind JwtAuthGuard, so `request.user` is always present
 * by the time this runs. The organization is folded into the key so the limit
 * is scoped to a tenant's user rather than a bare uuid.
 */
@Injectable()
export class AiThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(request: Request): Promise<string> {
    const user = (request as Request & { user?: JwtPayload }).user;

    return user ? `ai:${user.organizationId}:${user.sub}` : `ai:anonymous:${request.ip}`;
  }
}
