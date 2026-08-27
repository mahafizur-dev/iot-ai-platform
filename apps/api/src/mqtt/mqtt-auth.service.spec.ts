import { hashToken } from "../auth/token-hash.util";
import { MqttAuthService } from "./mqtt-auth.service";

function buildPrisma(overrides: {
  device?: unknown;
  credential?: unknown;
}): { device: { findFirst: jest.Mock }; deviceCredential: { findFirst: jest.Mock } } {
  return {
    device: { findFirst: jest.fn().mockResolvedValue(overrides.device ?? null) },
    deviceCredential: { findFirst: jest.fn().mockResolvedValue(overrides.credential ?? null) },
  };
}

describe("MqttAuthService", () => {
  const deviceId = "device-1";
  const rawToken = "raw-token-value";

  it("allows a connection with a valid, active credential", async () => {
    const prisma = buildPrisma({
      device: { id: deviceId, deactivatedAt: null },
      credential: { id: "cred-1", deviceId, revokedAt: null, credentialHash: hashToken(rawToken) },
    });
    const service = new MqttAuthService(prisma as never);

    const allowed = await service.authenticate({
      username: deviceId,
      password: rawToken,
      clientid: deviceId,
    });

    expect(allowed).toBe(true);
  });

  it("denies when username and clientid don't match", async () => {
    const prisma = buildPrisma({});
    const service = new MqttAuthService(prisma as never);

    const allowed = await service.authenticate({
      username: deviceId,
      password: rawToken,
      clientid: "someone-else",
    });

    expect(allowed).toBe(false);
    expect(prisma.device.findFirst).not.toHaveBeenCalled();
  });

  it("denies when the device is deactivated or missing", async () => {
    const prisma = buildPrisma({ device: null });
    const service = new MqttAuthService(prisma as never);

    const allowed = await service.authenticate({
      username: deviceId,
      password: rawToken,
      clientid: deviceId,
    });

    expect(allowed).toBe(false);
  });

  it("denies when the credential hash doesn't match (wrong password)", async () => {
    const prisma = buildPrisma({ device: { id: deviceId, deactivatedAt: null }, credential: null });
    const service = new MqttAuthService(prisma as never);

    const allowed = await service.authenticate({
      username: deviceId,
      password: "wrong-token",
      clientid: deviceId,
    });

    expect(allowed).toBe(false);
  });

  it("denies when the matching credential has been revoked", async () => {
    // findFirst is called with revokedAt: null in the where clause, so a
    // revoked credential simply never matches — simulate that by returning null.
    const prisma = buildPrisma({ device: { id: deviceId, deactivatedAt: null }, credential: null });
    const service = new MqttAuthService(prisma as never);

    const allowed = await service.authenticate({
      username: deviceId,
      password: rawToken,
      clientid: deviceId,
    });

    expect(allowed).toBe(false);
  });
});
