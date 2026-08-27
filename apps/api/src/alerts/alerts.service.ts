import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Alert, type Device } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { toAlertResponse } from "./alert-response";
import type { AlertQueryDto } from "./dto/alert-query.dto";

export type AlertWithDevice = Alert & { device: Pick<Device, "name"> | null };

const WITH_DEVICE = { device: { select: { name: true } } } as const;

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
  ) {}

  /**
   * Org scoping goes through the alert's device, since `alerts` has no org
   * column of its own — the device is what belongs to an organization.
   */
  async findAllForOrg(
    organizationId: string,
    query: AlertQueryDto,
  ): Promise<{ items: AlertWithDevice[]; total: number }> {
    const where = {
      device: { organizationId },
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.deviceId ? { deviceId: query.deviceId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        orderBy: { triggeredAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: WITH_DEVICE,
      }),
      this.prisma.alert.count({ where }),
    ]);

    return { items, total };
  }

  async findOneForOrg(organizationId: string, id: string): Promise<AlertWithDevice> {
    const alert = await this.prisma.alert.findFirst({
      where: { id, device: { organizationId } },
      include: WITH_DEVICE,
    });

    if (!alert) {
      throw new NotFoundException("Alert not found");
    }

    return alert;
  }

  async acknowledge(organizationId: string, id: string, userId: string): Promise<AlertWithDevice> {
    const alert = await this.findOneForOrg(organizationId, id);

    if (alert.status === "resolved") {
      throw new BadRequestException("A resolved alert cannot be acknowledged");
    }

    if (alert.status === "acknowledged") {
      return alert;
    }

    return this.transition(id, {
      status: "acknowledged",
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
    });
  }

  async resolve(organizationId: string, id: string, userId: string): Promise<AlertWithDevice> {
    const alert = await this.findOneForOrg(organizationId, id);

    if (alert.status === "resolved") {
      return alert;
    }

    return this.transition(id, {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy: userId,
    });
  }

  // `Unchecked` is the variant that accepts scalar foreign keys — acknowledgedBy
  // and resolvedBy are relations to User, and the checked input would demand a
  // `{ connect: { id } }` wrapper for what is just an id we already hold.
  private async transition(
    id: string,
    data: Prisma.AlertUncheckedUpdateInput,
  ): Promise<AlertWithDevice> {
    // organizationId comes back on the same round trip because the emit needs
    // it to pick a room, and `alerts` has no org column of its own.
    const updated = await this.prisma.alert.update({
      where: { id },
      data,
      include: { device: { select: { name: true, organizationId: true } } },
    });

    this.realtimeService.emitAlertUpdated(updated.device.organizationId, toAlertResponse(updated));

    return updated;
  }
}
