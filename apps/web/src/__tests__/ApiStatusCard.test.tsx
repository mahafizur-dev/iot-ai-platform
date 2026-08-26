import { render, screen, waitFor } from "@testing-library/react";
import { ApiStatusCard } from "@/components/ApiStatusCard";

describe("ApiStatusCard", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows a loading state, then the health status on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { status: "ok", uptimeSeconds: 42, timestamp: new Date().toISOString() },
      }),
    } as Response);

    render(<ApiStatusCard />);

    expect(screen.getByRole("status")).toHaveTextContent("Checking API");

    await waitFor(() => expect(screen.getByText("ok")).toBeInTheDocument());
  });

  it("shows an error state when the API is unreachable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));

    render(<ApiStatusCard />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("network down"));
  });
});
