import { Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Device } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { hashToken } from "../auth/token-hash.util";
import type { CreateDeviceDto } from "./dto/create-device.dto";
import type { UpdateDeviceDto } from "./dto/update-device.dto";
import type { DeviceQueryDto } from "./dto/device-query.dto";

export interface Paginated<T> {
  items: T[];
  total: number;
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, ownerUserId: string, dto: CreateDeviceDto): Promise<Device> {
    return this.prisma.device.create({
      data: {
        organizationId,
        ownerUserId,
        name: dto.name,
        type: dto.type,
        model: dto.model,
        firmwareVersion: dto.firmwareVersion,
        hardwareVersion: dto.hardwareVersion,
        macAddress: dto.macAddress,
        metadata: dto.metadata ? JSON.stringify(dto.metadata) : null,
      },
    });
  }

  async findAllForOrg(organizationId: string, query: DeviceQueryDto): Promise<Paginated<Device>> {
    const where = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const { field, direction } = query.parseSort();

    const [items, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        orderBy: { [field]: direction },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.device.count({ where }),
    ]);

    return { items, total };
  }

  async findOneForOrg(organizationId: string, id: string): Promise<Device> {
    const device = await this.prisma.device.findFirst({ where: { id, organizationId } });

    if (!device) {
      throw new NotFoundException("Device not found");
    }

    return device;
  }

  async update(organizationId: string, id: string, dto: UpdateDeviceDto): Promise<Device> {
    await this.findOneForOrg(organizationId, id);

    return this.prisma.device.update({
      where: { id },
      data: {
        ...dto,
        metadata: dto.metadata !== undefined ? JSON.stringify(dto.metadata) : undefined,
      },
    });
  }

  async deactivate(organizationId: string, id: string): Promise<Device> {
    await this.findOneForOrg(organizationId, id);

    return this.prisma.device.update({
      where: { id },
      data: { deactivatedAt: new Date() },
    });
  }

  /** Revokes any existing active credential and issues a new one; the raw token is returned exactly once. */
  async rotateCredential(organizationId: string, deviceId: string): Promise<string> {
    await this.findOneForOrg(organizationId, deviceId);

    await this.prisma.deviceCredential.updateMany({
      where: { deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString("hex");

    await this.prisma.deviceCredential.create({
      data: {
        deviceId,
        credentialHash: hashToken(rawToken),
        rotatedAt: new Date(),
      },
    });

    return rawToken;
  }
}
