import { ApiError, fetchDevice, login, logout } from "@/lib/api-client";

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("api-client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends credentials so the httpOnly refresh cookie is stored/sent", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(mockJsonResponse({ success: true, data: { accessToken: "t", user: {} } }));
    global.fetch = fetchMock;

    await login("ada@example.com", "correct-horse-1");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
  });

  it("targets the api/v1 prefix", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(mockJsonResponse({ success: true, data: { accessToken: "t", user: {} } }));
    global.fetch = fetchMock;

    await login("ada@example.com", "correct-horse-1");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/auth/login");
  });

  it("attaches the bearer token on authenticated calls", async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockJsonResponse({ success: true, data: {} }));
    global.fetch = fetchMock;

    await fetchDevice("token-1", "device-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/devices/device-1");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer token-1");
  });

  it("throws ApiError carrying the status and code from the error envelope", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockJsonResponse(
        { success: false, error: { code: "NOT_FOUND", message: "Device not found" } },
        404,
      ),
    );

    await expect(fetchDevice("token-1", "ghost")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      code: "NOT_FOUND",
      message: "Device not found",
    });
  });

  it("surfaces a 401 as an ApiError with status 401 so callers can refresh-retry", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockJsonResponse({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401),
    );

    await expect(fetchDevice("stale-token", "device-1")).rejects.toBeInstanceOf(ApiError);
    await expect(fetchDevice("stale-token", "device-1")).rejects.toMatchObject({ status: 401 });
  });

  it("logs out without throwing", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockJsonResponse({ success: true, data: { loggedOut: true } }));

    await expect(logout()).resolves.toBeUndefined();
  });
});
