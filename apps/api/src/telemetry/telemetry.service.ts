import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { DevicesService } from "../devices/devices.service";
import type { TelemetryQueryDto } from "./dto/telemetry-query.dto";

export interface TelemetryPoint {
  ts: string;
  metric: string;
  value: number;
  payload: Record<string, unknown> | null;
}

export interface TelemetryAggregatePoint {
  bucket: string;
  metric: string;
  value: number;
  sampleCount: number;
}

const AGG_VIEW: Record<"hour" | "day", string> = {
  hour: "telemetry_hourly",
  day: "telemetry_daily",
};

const AGG_COLUMN: Record<"avg" | "min" | "max", string> = {
  avg: "avg_value",
  min: "min_value",
  max: "max_value",
};

interface RawAggregateRow {
  bucket: Date;
  metric: string;
  value: number;
  sample_count: bigint | number;
}

/**
 * Query side of telemetry (docs/ARCHITECTURE.md §5). Raw ranges go through
 * the Prisma-modeled `telemetry` table; `agg`+`interval` queries hit the
 * hourly/daily continuous-aggregate views directly via `$queryRaw`, since
 * those materialized views aren't something Prisma's schema models.
 */
@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
  ) {}

  async queryRange(organizationId: string, deviceId: string, query: TelemetryQueryDto): Promise<TelemetryPoint[] | TelemetryAggregatePoint[]> {
    await this.devicesService.findOneForOrg(organizationId, deviceId);

    if (query.agg && query.interval) {
      return this.queryAggregate(deviceId, query);
    }

    const rows = await this.prisma.telemetry.findMany({
      where: {
        deviceId,
        ...(query.metric ? { metric: query.metric } : {}),
        ts: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      },
      orderBy: { ts: "asc" },
      take: 1000,
    });

    return rows.map((row) => ({
      ts: row.ts.toISOString(),
      metric: row.metric,
      value: row.value,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
    }));
  }

  private async queryAggregate(deviceId: string, query: TelemetryQueryDto): Promise<TelemetryAggregatePoint[]> {
    if (!query.metric || !query.agg || !query.interval) {
      return [];
    }

    const view = Prisma.raw(AGG_VIEW[query.interval]);
    const column = Prisma.raw(AGG_COLUMN[query.agg]);
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    const rows = await this.prisma.$queryRaw<RawAggregateRow[]>(Prisma.sql`
      SELECT bucket, metric, ${column} AS value, sample_count
      FROM ${view}
      WHERE device_id = ${deviceId}
        AND metric = ${query.metric}
        AND (${from}::timestamptz IS NULL OR bucket >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR bucket <= ${to}::timestamptz)
      ORDER BY bucket ASC
    `);

    return rows.map((row) => ({
      bucket: row.bucket.toISOString(),
      metric: row.metric,
      value: row.value,
      sampleCount: Number(row.sample_count),
    }));
  }

  async latest(organizationId: string, deviceId: string, metric?: string): Promise<TelemetryPoint[]> {
    await this.devicesService.findOneForOrg(organizationId, deviceId);

    if (metric) {
      const row = await this.prisma.telemetry.findFirst({
        where: { deviceId, metric },
        orderBy: { ts: "desc" },
      });

      return row
        ? [{ ts: row.ts.toISOString(), metric: row.metric, value: row.value, payload: (row.payload as Record<string, unknown> | null) ?? null }]
        : [];
    }

    const rows = await this.prisma.$queryRaw<
      { device_id: string; ts: Date; metric: string; value: number; payload: unknown }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (metric) device_id, ts, metric, value, payload
      FROM telemetry
      WHERE device_id = ${deviceId}
      ORDER BY metric, ts DESC
    `);

    return rows.map((row) => ({
      ts: row.ts.toISOString(),
      metric: row.metric,
      value: row.value,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
    }));
  }
}
