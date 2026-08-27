import { IsIn, IsISO8601, IsOptional, IsString } from "class-validator";

export const TELEMETRY_AGGREGATIONS = ["avg", "min", "max"] as const;
export const TELEMETRY_INTERVALS = ["hour", "day"] as const;

export class TelemetryQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Required when `agg`/`interval` are used — the continuous-aggregate views are grouped per metric. */
  @IsOptional()
  @IsString()
  metric?: string;

  @IsOptional()
  @IsIn(TELEMETRY_AGGREGATIONS)
  agg?: (typeof TELEMETRY_AGGREGATIONS)[number];

  @IsOptional()
  @IsIn(TELEMETRY_INTERVALS)
  interval?: (typeof TELEMETRY_INTERVALS)[number];
}

export class LatestTelemetryQueryDto {
  @IsOptional()
  @IsString()
  metric?: string;
}
