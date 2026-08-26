import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/common/constants/permissions";

const prisma = new PrismaClient();

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    PERMISSIONS.DEVICE_READ,
    PERMISSIONS.DEVICE_WRITE,
    PERMISSIONS.DEVICE_DELETE,
    PERMISSIONS.DEVICE_CREDENTIALS_ROTATE,
  ],
  operator: [PERMISSIONS.DEVICE_READ, PERMISSIONS.DEVICE_WRITE, PERMISSIONS.DEVICE_CREDENTIALS_ROTATE],
  viewer: [PERMISSIONS.DEVICE_READ],
};

async function main(): Promise<void> {
  const permissionNames = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];

  for (const name of permissionNames) {
    await prisma.permission.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    for (const permissionName of permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { name: permissionName },
      });

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  console.log(`Seeded roles: ${Object.keys(ROLE_PERMISSIONS).join(", ")}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
