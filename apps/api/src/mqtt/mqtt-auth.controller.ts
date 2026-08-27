import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MqttAuthRequestDto } from "./dto/mqtt-auth-request.dto";
import { MqttAuthService } from "./mqtt-auth.service";

interface MqttAuthResponse {
  result: "allow" | "deny";
}

/**
 * Called by EMQX's HTTP authentication backend on every device connect
 * attempt — not part of the versioned public API (excluded from the
 * `api/v1` prefix in configure-app.ts, same as /health). Response contract
 * (`{result: "allow" | "deny"}`) matches what EMQX's HTTP auth backend expects.
 */
@Controller("mqtt")
export class MqttAuthController {
  private readonly logger = new Logger(MqttAuthController.name);

  constructor(
    private readonly mqttAuthService: MqttAuthService,
    private readonly config: ConfigService,
  ) {}

  @Post("auth")
  @HttpCode(HttpStatus.OK)
  async authenticate(
    @Body() body: MqttAuthRequestDto,
    @Headers("x-emqx-auth-secret") secret: string | undefined,
  ): Promise<MqttAuthResponse> {
    if (secret !== this.config.getOrThrow<string>("EMQX_AUTH_HOOK_SECRET")) {
      this.logger.warn("Rejected MQTT auth-hook call with missing/invalid shared secret");
      return { result: "deny" };
    }

    const allowed = await this.mqttAuthService.authenticate(body);
    return { result: allowed ? "allow" : "deny" };
  }
}
