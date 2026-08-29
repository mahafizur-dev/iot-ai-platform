import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Optional override for the device name recorded in the registry; defaults to the scanned BLE name. */
export class RegisterBleDeviceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}
