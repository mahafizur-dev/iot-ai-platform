import { IsString, MinLength } from "class-validator";

/** Body shape EMQX's HTTP authentication backend sends (see infra/emqx/emqx.conf). */
export class MqttAuthRequestDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @MinLength(1)
  clientid!: string;
}
