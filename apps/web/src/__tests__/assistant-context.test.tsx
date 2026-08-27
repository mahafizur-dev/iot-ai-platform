import { act, render, screen, waitFor } from "@testing-library/react";
import { AssistantProvider, useAssistant } from "@/lib/assistant-context";
import { ApiError } from "@/lib/api-client";
import * as api from "@/lib/api-client";

jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    // The real withAuth injects a token and retries once on 401; the
    // assistant only needs the call to run.
    withAuth: (call: (token: string) => Promise<unknown>) => call("token-1"),
  }),
}));

jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return {
    ...actual,
    askAssistant: jest.fn(),
    explainAlert: jest.fn(),
    summarizeDeviceTelemetry: jest.fn(),
  };
});

const mockedApi = api as jest.Mocked<typeof api>;

const RESULT = {
  text: "Two of your three devices are online.",
  provider: "mock",
  model: "mock-echo-1",
  promptTokens: 100,
  completionTokens: 20,
  costEstimate: 0,
  latencyMs: 5,
  interactionId: "interaction-1",
};

function Probe({ onReady }: { onReady: (assistant: ReturnType<typeof useAssistant>) => void }) {
  const assistant = useAssistant();
  onReady(assistant);

  return (
    <div>
      <span data-testid="open">{assistant.open ? "open" : "closed"}</span>
      <span data-testid="turns">{assistant.turns.map((turn) => `${turn.role}:${turn.content}`).join("|")}</span>
    </div>
  );
}

function setup() {
  let assistant!: ReturnType<typeof useAssistant>;

  render(
    <AssistantProvider>
      <Probe onReady={(value) => (assistant = value)} />
    </AssistantProvider>,
  );

  return () => assistant;
}

describe("AssistantProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.askAssistant.mockResolvedValue(RESULT);
    mockedApi.explainAlert.mockResolvedValue(RESULT);
    mockedApi.summarizeDeviceTelemetry.mockResolvedValue(RESULT);
  });

  it("opens the panel and records both turns", async () => {
    const assistant = setup();

    await act(async () => {
      await assistant().ask("How is the fleet?");
    });

    expect(screen.getByTestId("open")).toHaveTextContent("open");
    await waitFor(() =>
      expect(screen.getByTestId("turns")).toHaveTextContent(
        "user:How is the fleet?|assistant:Two of your three devices are online.",
      ),
    );
  });

  it("does not send the new message twice — as history and as the prompt", async () => {
    const assistant = setup();

    await act(async () => {
      await assistant().ask("first question");
    });
    await act(async () => {
      await assistant().ask("second question");
    });

    const secondCall = mockedApi.askAssistant.mock.calls[1];
    expect(secondCall?.[1]).toBe("second question");
    expect((secondCall?.[2] ?? []).map((turn) => turn.content)).toEqual([
      "first question",
      "Two of your three devices are online.",
    ]);
  });

  it("caps the history it forwards", async () => {
    const assistant = setup();

    for (let index = 0; index < 5; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await assistant().ask(`question ${index}`);
      });
    }

    const history = mockedApi.askAssistant.mock.calls.at(-1)?.[2] ?? [];
    expect(history).toHaveLength(6);
  });

  it("renders a rate-limit rejection as a readable message rather than a raw error", async () => {
    mockedApi.askAssistant.mockRejectedValue(new ApiError("ThrottlerException", 429, "TOO_MANY"));
    const assistant = setup();

    await act(async () => {
      await assistant().ask("How is the fleet?");
    });

    await waitFor(() =>
      expect(screen.getByTestId("turns")).toHaveTextContent("rate limit"),
    );
  });

  it("marks a failed turn so it is excluded from later history", async () => {
    mockedApi.askAssistant.mockRejectedValueOnce(new Error("provider down"));
    const assistant = setup();

    await act(async () => {
      await assistant().ask("first question");
    });
    await act(async () => {
      await assistant().ask("second question");
    });

    const history = mockedApi.askAssistant.mock.calls[1]?.[2] ?? [];
    // The error text is UI, not conversation — replaying it to the model
    // would teach it that it said something it never said.
    expect(history.map((turn) => turn.content)).toEqual(["first question"]);
  });

  it("routes explainAlert through the dedicated endpoint and labels the user turn", async () => {
    const assistant = setup();

    await act(async () => {
      await assistant().explainAlert("alert-1", "Boiler 01: temperature is 34");
    });

    expect(mockedApi.explainAlert).toHaveBeenCalledWith("token-1", "alert-1");
    expect(screen.getByTestId("turns")).toHaveTextContent(
      "Explain the alert: Boiler 01: temperature is 34",
    );
  });

  it("routes summarizeDevice through the dedicated endpoint with the range", async () => {
    const assistant = setup();

    await act(async () => {
      await assistant().summarizeDevice("device-1", "Boiler 01", "7d");
    });

    expect(mockedApi.summarizeDeviceTelemetry).toHaveBeenCalledWith("token-1", "device-1", "7d");
  });

  it("clears the conversation on reset", async () => {
    const assistant = setup();

    await act(async () => {
      await assistant().ask("How is the fleet?");
    });
    act(() => assistant().reset());

    expect(screen.getByTestId("turns")).toHaveTextContent("");
  });
});
