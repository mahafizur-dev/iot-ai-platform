import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { JwtPayload } from "../types/auth.types";

/** Requires JwtAuthGuard to have run first so `req.user` is populated. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
  return request.user;
});
