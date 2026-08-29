import { MqttAuthController } from "./mqtt-auth.controller";
import type { MqttAuthService } from "./mqtt-auth.service";

function buildConfig(secret: string) {
  return { getOrThrow: () => secret };
}

describe("MqttAuthController", () => {
  const secret = "correct-shared-secret";
  const body = { username: "device-1", password: "raw-token", clientid: "device-1" };

  it("denies without calling the auth service when the shared secret header is missing", async () => {
    const mqttAuthService = { authenticate: jest.fn() } as unknown as MqttAuthService;
    const controller = new MqttAuthController(mqttAuthService, buildConfig(secret) as never);

    const result = await controller.authenticate(body, undefined);

    expect(result).toEqual({ result: "deny" });
    expect(mqttAuthService.authenticate).not.toHaveBeenCalled();
  });

  it("denies without calling the auth service when the shared secret header is wrong", async () => {
    const mqttAuthService = { authenticate: jest.fn() } as unknown as MqttAuthService;
    const controller = new MqttAuthController(mqttAuthService, buildConfig(secret) as never);

    const result = await controller.authenticate(body, "wrong-secret");

    expect(result).toEqual({ result: "deny" });
    expect(mqttAuthService.authenticate).not.toHaveBeenCalled();
  });

  it("delegates to the auth service and allows when the secret matches and credentials are valid", async () => {
    const mqttAuthService = {
      authenticate: jest.fn().mockResolvedValue(true),
    } as unknown as MqttAuthService;
    const controller = new MqttAuthController(mqttAuthService, buildConfig(secret) as never);

    const result = await controller.authenticate(body, secret);

    expect(result).toEqual({ result: "allow" });
    expect(mqttAuthService.authenticate).toHaveBeenCalledWith(body);
  });

  it("denies when the secret matches but the credentials themselves are invalid", async () => {
    const mqttAuthService = {
      authenticate: jest.fn().mockResolvedValue(false),
    } as unknown as MqttAuthService;
    const controller = new MqttAuthController(mqttAuthService, buildConfig(secret) as never);

    const result = await controller.authenticate(body, secret);

    expect(result).toEqual({ result: "deny" });
  });
});
