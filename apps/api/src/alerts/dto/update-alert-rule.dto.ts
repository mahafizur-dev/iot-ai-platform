import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import { ALERT_CONDITIONS, ALERT_SEVERITIES } from "@iot-ai-platform/shared-types";

/**
 * Not `PartialType(CreateAlertRuleDto)`: the create DTO's conditional
 * requirement on `thresholdSecondary` reads the *incoming* condition, which a
 * patch may not carry. AlertRulesService re-checks the merged rule instead.
 */
export class UpdateAlertRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  metric?: string;

  @IsOptional()
  @IsIn(ALERT_CONDITIONS)
  condition?: (typeof ALERT_CONDITIONS)[number];

  @IsOptional()
  @IsNumber()
  threshold?: number;

  @IsOptional()
  @IsNumber()
  thresholdSecondary?: number | null;

  @IsOptional()
  @IsIn(ALERT_SEVERITIES)
  severity?: (typeof ALERT_SEVERITIES)[number];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
