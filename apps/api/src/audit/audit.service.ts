import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write-only audit trail (see docs/ARCHITECTURE.md §8): every sensitive
 * action (login, credential rotation, device deactivation, ...) records one
 * row here. Failures are logged, never thrown — an audit write must not be
 * able to fail the request it's auditing.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: entry.actorUserId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          ipAddress: entry.ipAddress ?? null,
          metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log for action "${entry.action}"`, error);
    }
  }
}
