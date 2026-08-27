import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, ValidateNested } from "class-validator";
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from "@iot-ai-platform/shared-types";

export class NotificationPreferenceDto {
  @IsIn(NOTIFICATION_TYPES)
  eventType!: (typeof NOTIFICATION_TYPES)[number];

  @IsIn(NOTIFICATION_CHANNELS)
  channel!: (typeof NOTIFICATION_CHANNELS)[number];

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsArray()
  // The full matrix is types × channels; anything larger is a client bug.
  @ArrayMaxSize(NOTIFICATION_TYPES.length * NOTIFICATION_CHANNELS.length)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceDto)
  preferences!: NotificationPreferenceDto[];
}
