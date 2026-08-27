import { IsIn, IsOptional, IsUUID } from "class-validator";
import { ANALYTICS_RANGES } from "@iot-ai-platform/shared-types";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { AI_REQUEST_TYPES } from "../ai-provider.interface";

export class TelemetrySummaryDto {
  @IsUUID()
  deviceId!: string;

  @IsOptional()
  @IsIn(ANALYTICS_RANGES)
  range: (typeof ANALYTICS_RANGES)[number] = "24h";
}

export class AIInteractionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(AI_REQUEST_TYPES)
  requestType?: (typeof AI_REQUEST_TYPES)[number];
}
