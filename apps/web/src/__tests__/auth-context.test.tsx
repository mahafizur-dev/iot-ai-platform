import { act, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import * as api from "@/lib/api-client";

jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return {
    ...actual,
    login: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
  };
});

const mockedApi = api as jest.Mocked<typeof api>;

const USER = {
  id: "user-1",
  email: "ada@example.com",
  name: "Ada",
  organizationId: "org-1",
  roles: ["admin"],
  permissions: ["device:read"],
};

function Probe({ onReady }: { onReady?: (auth: ReturnType<typeof useAuth>) => void }) {
  const auth = useAuth();
  onReady?.(auth);

  return (
    <div>
      <span data-testid="state">
        {auth.initializing ? "initializing" : (auth.user?.email ?? "anonymous")}
      </span>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("restores a session from the refresh cookie on mount", async () => {
    mockedApi.refresh.mockResolvedValue({ accessToken: "token-1", user: USER });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("state")).toHaveTextContent("initializing");
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ada@example.com"));
  });

  it("treats a failed refresh as logged-out rather than an error", async () => {
    mockedApi.refresh.mockRejectedValue(new ApiError("Missing refresh token", 401));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("anonymous"));
  });

  it("stores the session after a successful login", async () => {
    mockedApi.refresh.mockRejectedValue(new ApiError("no cookie", 401));
    mockedApi.login.mockResolvedValue({ accessToken: "token-1", user: USER });

    let auth!: ReturnType<typeof useAuth>;
    render(
      <AuthProvider>
        <Probe onReady={(value) => (auth = value)} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("anonymous"));

    await act(async () => {
      await auth.login("ada@example.com", "correct-horse-1");
    });

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ada@example.com"));
  });

  it("clears the session on logout", async () => {
    mockedApi.refresh.mockResolvedValue({ accessToken: "token-1", user: USER });
    mockedApi.logout.mockResolvedValue(undefined);

    let auth!: ReturnType<typeof useAuth>;
    render(
      <AuthProvider>
        <Probe onReady={(value) => (auth = value)} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ada@example.com"));

    await act(async () => {
      await auth.logout();
    });

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("anonymous"));
  });

  describe("withAuth", () => {
    it("passes the current access token to the call", async () => {
      mockedApi.refresh.mockResolvedValue({ accessToken: "token-1", user: USER });

      let auth!: ReturnType<typeof useAuth>;
      render(
        <AuthProvider>
          <Probe onReady={(value) => (auth = value)} />
        </AuthProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ada@example.com"));

      const call = jest.fn().mockResolvedValue("result");
      await act(async () => {
        await expect(auth.withAuth(call)).resolves.toBe("result");
      });

      expect(call).toHaveBeenCalledWith("token-1");
    });

    it("refreshes once and retries when the call 401s", async () => {
      mockedApi.refresh
        .mockResolvedValueOnce({ accessToken: "token-1", user: USER })
        .mockResolvedValueOnce({ accessToken: "token-2", user: USER });

      let auth!: ReturnType<typeof useAuth>;
      render(
        <AuthProvider>
          <Probe onReady={(value) => (auth = value)} />
        </AuthProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ada@example.com"));

      const call = jest
        .fn()
        .mockRejectedValueOnce(new ApiError("Unauthorized", 401))
        .mockResolvedValueOnce("result-after-refresh");

      await act(async () => {
        await expect(auth.withAuth(call)).resolves.toBe("result-after-refresh");
      });

      expect(call).toHaveBeenNthCalledWith(1, "token-1");
      expect(call).toHaveBeenNthCalledWith(2, "token-2");
    });

    it("does not refresh-retry on a non-401 error", async () => {
      mockedApi.refresh.mockResolvedValue({ accessToken: "token-1", user: USER });

      let auth!: ReturnType<typeof useAuth>;
      render(
        <AuthProvider>
          <Probe onReady={(value) => (auth = value)} />
        </AuthProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ada@example.com"));

      const call = jest.fn().mockRejectedValue(new ApiError("Device not found", 404));

      await act(async () => {
        await expect(auth.withAuth(call)).rejects.toThrow("Device not found");
      });

      expect(call).toHaveBeenCalledTimes(1);
      expect(mockedApi.refresh).toHaveBeenCalledTimes(1); // only the mount refresh
    });
  });
});
