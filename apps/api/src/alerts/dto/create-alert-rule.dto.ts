import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { ALERT_CONDITIONS, ALERT_SEVERITIES } from "@iot-ai-platform/shared-types";

export class CreateAlertRuleDto {
  /** Omit to apply the rule to every device in the organization. */
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @IsString()
  @MaxLength(64)
  metric!: string;

  @IsIn(ALERT_CONDITIONS)
  condition!: (typeof ALERT_CONDITIONS)[number];

  @IsNumber()
  threshold!: number;

  /**
   * Required for `range` and meaningless otherwise — a range rule without an
   * upper bound can never fire, so rejecting it here is better than storing a
   * rule that silently does nothing.
   */
  @ValidateIf((dto: CreateAlertRuleDto) => dto.condition === "range")
  @IsNumber()
  thresholdSecondary?: number;

  @IsOptional()
  @IsIn(ALERT_SEVERITIES)
  severity?: (typeof ALERT_SEVERITIES)[number];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
