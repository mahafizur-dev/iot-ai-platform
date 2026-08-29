import { IsBase64, IsString } from "class-validator";

export class WriteCharacteristicDto {
  /** Base64-encoded bytes to write. */
  @IsString()
  @IsBase64()
  data!: string;
}
