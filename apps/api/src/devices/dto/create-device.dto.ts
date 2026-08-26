import { IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  firmwareVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  hardwareVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  macAddress?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
