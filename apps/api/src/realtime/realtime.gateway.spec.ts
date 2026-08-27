import { NotFoundException } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";

const PAYLOAD = {
  sub: "user-1",
  email: "a@b.c",
  organizationId: "org-1",
  roles: ["admin"],
  permissions: [],
};

function buildClient(token?: string) {
  return {
    handshake: token ? { auth: { token } } : { auth: {} },
    data: {} as { user?: typeof PAYLOAD },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
}

function buildGateway(options: { validToken?: boolean; deviceFound?: boolean } = {}) {
  const { validToken = true, deviceFound = true } = options;

  const jwtService = {
    verify: jest.fn().mockImplementation(() => {
      if (!validToken) throw new Error("invalid token");
      return PAYLOAD;
    }),
  };
  const config = { getOrThrow: jest.fn().mockReturnValue("test-secret") };
  const devicesService = {
    findOneForOrg: deviceFound
      ? jest.fn().mockResolvedValue({ id: "device-1" })
      : jest.fn().mockRejectedValue(new NotFoundException("Device not found")),
  };
  const realtimeService = { setServer: jest.fn() };

  const gateway = new RealtimeGateway(
    jwtService as never,
    config as never,
    devicesService as never,
    realtimeService as never,
  );

  return { gateway, devicesService, realtimeService };
}

describe("RealtimeGateway", () => {
  describe("handleConnection", () => {
    it("joins the org room from the verified token, with no DB lookup", () => {
      const { gateway } = buildGateway();
      const client = buildClient("good-token");

      gateway.handleConnection(client as never);

      expect(client.join).toHaveBeenCalledWith("org:org-1");
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.data.user).toEqual(PAYLOAD);
    });

    it("disconnects a socket with no token", () => {
      const { gateway } = buildGateway();
      const client = buildClient();

      gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it("disconnects a socket with an invalid/expired token", () => {
      const { gateway } = buildGateway({ validToken: false });
      const client = buildClient("bad-token");

      gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe("subscribe:device", () => {
    it("joins the device room for a device in the caller's org", async () => {
      const { gateway, devicesService } = buildGateway();
      const client = buildClient("good-token");
      gateway.handleConnection(client as never);

      const ack = await gateway.subscribeDevice(client as never, "device-1");

      expect(devicesService.findOneForOrg).toHaveBeenCalledWith("org-1", "device-1");
      expect(client.join).toHaveBeenCalledWith("device:device-1");
      expect(ack).toEqual({ ok: true });
    });

    it("refuses a device outside the caller's org without leaking existence", async () => {
      const { gateway } = buildGateway({ deviceFound: false });
      const client = buildClient("good-token");
      gateway.handleConnection(client as never);

      const ack = await gateway.subscribeDevice(client as never, "someone-elses-device");

      expect(ack).toEqual({ ok: false, error: "Device not found" });
      expect(client.join).not.toHaveBeenCalledWith("device:someone-elses-device");
    });

    it("refuses when the socket carries no authenticated user", async () => {
      const { gateway, devicesService } = buildGateway();
      const client = buildClient();

      const ack = await gateway.subscribeDevice(client as never, "device-1");

      expect(ack).toEqual({ ok: false, error: "Not authenticated" });
      expect(devicesService.findOneForOrg).not.toHaveBeenCalled();
    });
  });

  describe("unsubscribe:device", () => {
    it("leaves the device room without an ownership check", async () => {
      const { gateway, devicesService } = buildGateway();
      const client = buildClient("good-token");
      gateway.handleConnection(client as never);

      const ack = await gateway.unsubscribeDevice(client as never, "device-1");

      expect(client.leave).toHaveBeenCalledWith("device:device-1");
      expect(devicesService.findOneForOrg).not.toHaveBeenCalled();
      expect(ack).toEqual({ ok: true });
    });
  });
});
