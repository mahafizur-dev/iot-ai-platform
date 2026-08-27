import type { JwtService } from "@nestjs/jwt";
import { extractHandshakeToken, verifyHandshakeToken } from "./ws-auth.util";

describe("extractHandshakeToken", () => {
  it("reads the token from handshake.auth", () => {
    expect(extractHandshakeToken({ auth: { token: "abc" } })).toBe("abc");
  });

  it("falls back to a Bearer authorization header", () => {
    expect(extractHandshakeToken({ headers: { authorization: "Bearer abc" } })).toBe("abc");
  });

  it("prefers handshake.auth over the header", () => {
    expect(
      extractHandshakeToken({ auth: { token: "from-auth" }, headers: { authorization: "Bearer from-header" } }),
    ).toBe("from-auth");
  });

  it("returns null when no token is present", () => {
    expect(extractHandshakeToken({})).toBeNull();
    expect(extractHandshakeToken({ auth: {} })).toBeNull();
    expect(extractHandshakeToken({ auth: { token: "" } })).toBeNull();
  });

  it("returns null for a non-Bearer authorization header", () => {
    expect(extractHandshakeToken({ headers: { authorization: "Basic abc" } })).toBeNull();
  });
});

describe("verifyHandshakeToken", () => {
  const payload = { sub: "user-1", email: "a@b.c", organizationId: "org-1", roles: [], permissions: [] };

  it("returns the payload for a valid token", () => {
    const jwtService = { verify: jest.fn().mockReturnValue(payload) } as unknown as JwtService;
    expect(verifyHandshakeToken(jwtService, "secret", "good-token")).toEqual(payload);
  });

  it("returns null instead of throwing for an invalid/expired token", () => {
    const jwtService = {
      verify: jest.fn().mockImplementation(() => {
        throw new Error("jwt expired");
      }),
    } as unknown as JwtService;

    expect(verifyHandshakeToken(jwtService, "secret", "bad-token")).toBeNull();
  });
});
