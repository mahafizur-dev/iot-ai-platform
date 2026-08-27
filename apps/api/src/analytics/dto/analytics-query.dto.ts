import { IsIn, IsOptional } from "class-validator";
import { ANALYTICS_RANGES } from "@iot-ai-platform/shared-types";

export class AnalyticsQueryDto {
  @IsOptional()
  @IsIn(ANALYTICS_RANGES)
  range: (typeof ANALYTICS_RANGES)[number] = "24h";
}
