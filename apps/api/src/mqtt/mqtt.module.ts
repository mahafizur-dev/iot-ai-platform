import { Inject, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { MQTT_CLIENT, type IMqttClient } from "./mqtt-client.interface";
import { MqttJsClient } from "./mqtt-js.client";
import { MqttAuthController } from "./mqtt-auth.controller";
import { MqttAuthService } from "./mqtt-auth.service";

@Module({
  controllers: [MqttAuthController],
  providers: [MqttAuthService, { provide: MQTT_CLIENT, useClass: MqttJsClient }],
  exports: [MQTT_CLIENT],
})
export class MqttModule implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(MQTT_CLIENT) private readonly client: IMqttClient) {}

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.disconnect();
  }
}
