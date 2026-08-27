import { IsIn, IsOptional, IsUUID } from "class-validator";
import { ALERT_SEVERITIES, ALERT_STATUSES } from "@iot-ai-platform/shared-types";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

export class AlertQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ALERT_STATUSES)
  status?: (typeof ALERT_STATUSES)[number];

  @IsOptional()
  @IsIn(ALERT_SEVERITIES)
  severity?: (typeof ALERT_SEVERITIES)[number];

  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
