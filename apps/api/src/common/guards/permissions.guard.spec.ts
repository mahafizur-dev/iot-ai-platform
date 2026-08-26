import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";

function buildContext(userPermissions: string[]): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { permissions: userPermissions } }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  it("allows the request when no permissions are required", () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(buildContext([]))).toBe(true);
  });

  it("allows the request when the user has every required permission", () => {
    const reflector = {
      getAllAndOverride: () => ["device:read", "device:write"],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(buildContext(["device:read", "device:write", "device:delete"]))).toBe(
      true,
    );
  });

  it("throws ForbiddenException when a required permission is missing", () => {
    const reflector = {
      getAllAndOverride: () => ["device:delete"],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(buildContext(["device:read"]))).toThrow(ForbiddenException);
  });
});
