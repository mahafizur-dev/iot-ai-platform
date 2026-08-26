import type { User } from "@prisma/client";
import type { JwtPayload } from "../common/types/auth.types";

/** Public-safe user shape — never includes passwordHash. */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  status: string;
  roles: string[];
  permissions: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export function toUserProfile(
  user: User,
  authorization: Pick<JwtPayload, "roles" | "permissions">,
): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    organizationId: user.organizationId,
    status: user.status,
    roles: authorization.roles,
    permissions: authorization.permissions,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
