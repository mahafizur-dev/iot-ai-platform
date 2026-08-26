import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface UserAuthorization {
  roles: string[];
  permissions: string[];
}

/** Default role every new registrant gets (see prisma/seed.ts for the full catalog). */
export const DEFAULT_ROLE_NAME = "admin";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves a user's roles and the flattened, deduped set of permissions those roles grant. */
  async getAuthorizationForUser(userId: string): Promise<UserAuthorization> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const roles = new Set<string>();
    const permissions = new Set<string>();

    for (const userRole of userRoles) {
      roles.add(userRole.role.name);
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.name);
      }
    }

    return { roles: [...roles], permissions: [...permissions] };
  }

  async assignDefaultRole(userId: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: DEFAULT_ROLE_NAME } });

    if (!role) {
      throw new Error(
        `Role "${DEFAULT_ROLE_NAME}" not found — has \`pnpm prisma:seed\` been run?`,
      );
    }

    await this.prisma.userRole.create({ data: { userId, roleId: role.id } });
  }
}
