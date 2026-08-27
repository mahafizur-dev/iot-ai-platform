import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AlertRule, Device } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { DevicesService } from "../devices/devices.service";
import type { CreateAlertRuleDto } from "./dto/create-alert-rule.dto";
import type { UpdateAlertRuleDto } from "./dto/update-alert-rule.dto";

export type AlertRuleWithDevice = AlertRule & { device: Pick<Device, "name"> | null };

const WITH_DEVICE = { device: { select: { name: true } } } as const;

@Injectable()
export class AlertRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
  ) {}

  async create(
    organizationId: string,
    createdBy: string,
    dto: CreateAlertRuleDto,
  ): Promise<AlertRuleWithDevice> {
    // Scoping a rule to a device the caller's org doesn't own would let one
    // org attach rules to another's hardware; findOneForOrg 404s on that.
    if (dto.deviceId) {
      await this.devicesService.findOneForOrg(organizationId, dto.deviceId);
    }

    return this.prisma.alertRule.create({
      data: {
        organizationId,
        createdBy,
        deviceId: dto.deviceId ?? null,
        metric: dto.metric,
        condition: dto.condition,
        threshold: dto.threshold,
        thresholdSecondary: dto.condition === "range" ? (dto.thresholdSecondary ?? null) : null,
        severity: dto.severity ?? "warning",
        enabled: dto.enabled ?? true,
      },
      include: WITH_DEVICE,
    });
  }

  async findAllForOrg(organizationId: string): Promise<AlertRuleWithDevice[]> {
    return this.prisma.alertRule.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: WITH_DEVICE,
    });
  }

  async findOneForOrg(organizationId: string, id: string): Promise<AlertRuleWithDevice> {
    const rule = await this.prisma.alertRule.findFirst({
      where: { id, organizationId },
      include: WITH_DEVICE,
    });

    if (!rule) {
      throw new NotFoundException("Alert rule not found");
    }

    return rule;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateAlertRuleDto,
  ): Promise<AlertRuleWithDevice> {
    const existing = await this.findOneForOrg(organizationId, id);

    // Validate the MERGED rule, not the patch: switching an existing `gt` rule
    // to `range` without supplying an upper bound would otherwise store a rule
    // that can never fire.
    const condition = dto.condition ?? existing.condition;
    const thresholdSecondary =
      dto.thresholdSecondary !== undefined ? dto.thresholdSecondary : existing.thresholdSecondary;

    if (condition === "range" && (thresholdSecondary === null || thresholdSecondary === undefined)) {
      throw new BadRequestException("thresholdSecondary is required for a range condition");
    }

    return this.prisma.alertRule.update({
      where: { id },
      data: {
        ...dto,
        // A non-range rule must not carry a stale upper bound around.
        thresholdSecondary: condition === "range" ? thresholdSecondary : null,
      },
      include: WITH_DEVICE,
    });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.findOneForOrg(organizationId, id);
    await this.prisma.alertRule.delete({ where: { id } });
  }

  /**
   * Rules that apply to one device's metric: those scoped to the device, plus
   * the org-wide ones (`deviceId IS NULL`). Used by the ingest-time evaluator.
   */
  async findMatchingRules(
    organizationId: string,
    deviceId: string,
    metric: string,
  ): Promise<AlertRule[]> {
    return this.prisma.alertRule.findMany({
      where: {
        organizationId,
        enabled: true,
        metric,
        OR: [{ deviceId }, { deviceId: null }],
      },
    });
  }
}
