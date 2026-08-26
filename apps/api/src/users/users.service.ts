import { Injectable } from "@nestjs/common";
import type { Organization, User } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

export interface CreateUserWithOrganizationInput {
  email: string;
  passwordHash: string;
  name: string;
  organizationName: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Registration creates a new organization owned by this user (see docs/ARCHITECTURE.md §4b). */
  async createUserWithOrganization(
    input: CreateUserWithOrganizationInput,
  ): Promise<{ user: User; organization: Organization }> {
    const organization = await this.prisma.organization.create({
      data: { name: input.organizationName },
    });

    const user = await this.prisma.user.create({
      data: {
        organizationId: organization.id,
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
      },
    });

    return { user, organization };
  }

  touchLastLogin(userId: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }
}
