import { ServiceUnavailableException } from "@nestjs/common";
import { AIService } from "./ai.service";
import type { AIContext, AIResponse } from "./ai-provider.interface";

const ORG_ID = "org-1";
const USER_ID = "user-1";

const CONTEXT: AIContext = {
  requestType: "chat",
  organizationId: ORG_ID,
  facts: ["Fleet: 3 devices — 2 online, 1 offline, 0 never reported."],
  data: { deviceCount: 3 },
};

const RESPONSE: AIResponse = {
  text: "Two of your three devices are online.",
  model: "claude-sonnet-5-20260101",
  provider: "anthropic",
  promptTokens: 1200,
  completionTokens: 400,
  latencyMs: 700,
};

function buildPrisma() {
  return {
    aiInteraction: {
      create: jest.fn().mockResolvedValue({ id: "interaction-1" }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

function buildContextBuilder() {
  return {
    buildChatContext: jest.fn().mockResolvedValue(CONTEXT),
    buildTelemetrySummaryContext: jest
      .fn()
      .mockResolvedValue({ ...CONTEXT, requestType: "summary" }),
    buildAlertContext: jest.fn().mockResolvedValue({ ...CONTEXT, requestType: "explain_alert" }),
  };
}

function buildProvider(response: AIResponse | Error = RESPONSE) {
  const result =
    response instanceof Error
      ? jest.fn().mockRejectedValue(response)
      : jest.fn().mockResolvedValue(response);

  return {
    name: "anthropic",
    chat: result,
    summarizeTelemetry: result,
    explainAlert: result,
  };
}

describe("AIService", () => {
  describe("chat", () => {
    it("logs every call to ai_interactions with tokens, latency, and cost", async () => {
      const prisma = buildPrisma();
      const service = new AIService(
        prisma as never,
        buildContextBuilder() as never,
        buildProvider() as never,
      );

      const result = await service.chat(ORG_ID, USER_ID, "How is the fleet?");

      const { data } = prisma.aiInteraction.create.mock.calls[0][0];
      expect(data).toMatchObject({
        userId: USER_ID,
        organizationId: ORG_ID,
        provider: "anthropic",
        requestType: "chat",
        promptTokens: 1200,
        completionTokens: 400,
        errorCode: null,
      });
      // 1200 in + 400 out on Sonnet pricing.
      expect(data.costEstimate).toBe(0.0096);
      expect(result.interactionId).toBe("interaction-1");
    });

    it("logs the structured context summary, not the rendered prompt", async () => {
      const prisma = buildPrisma();
      const service = new AIService(
        prisma as never,
        buildContextBuilder() as never,
        buildProvider() as never,
      );

      await service.chat(ORG_ID, USER_ID, "How is the fleet?");

      // Storing the full fleet listing on every call would bloat the table
      // for no traceability gain.
      expect(prisma.aiInteraction.create.mock.calls[0][0].data.inputContext).toEqual({
        deviceCount: 3,
      });
    });

    it("records the model the provider actually answered with", async () => {
      // "claude-sonnet-5" resolves to a dated snapshot; the log should say which.
      const prisma = buildPrisma();
      const service = new AIService(
        prisma as never,
        buildContextBuilder() as never,
        buildProvider() as never,
      );

      await service.chat(ORG_ID, USER_ID, "How is the fleet?");

      expect(prisma.aiInteraction.create.mock.calls[0][0].data.model).toBe(
        "claude-sonnet-5-20260101",
      );
    });

    it("caps the history it forwards so the newest turn always survives", async () => {
      const provider = buildProvider();
      const service = new AIService(
        buildPrisma() as never,
        buildContextBuilder() as never,
        provider as never,
      );

      const history = Array.from({ length: 20 }, (_, index) => ({
        role: "user" as const,
        content: `turn-${index}`,
      }));

      await service.chat(ORG_ID, USER_ID, "the newest question", history);

      const [messages] = provider.chat.mock.calls[0];
      expect(messages).toHaveLength(11); // 10 history + the new turn
      expect(messages.at(-1)).toEqual({ role: "user", content: "the newest question" });
      expect(messages[0]).toEqual({ role: "user", content: "turn-10" });
    });
  });

  describe("provider failures", () => {
    it("logs the failed call rather than leaving no trace", async () => {
      const prisma = buildPrisma();
      const service = new AIService(
        prisma as never,
        buildContextBuilder() as never,
        buildProvider(new Error("upstream exploded")) as never,
      );

      await expect(service.chat(ORG_ID, USER_ID, "hi")).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(prisma.aiInteraction.create).toHaveBeenCalledTimes(1);
      expect(prisma.aiInteraction.create.mock.calls[0][0].data).toMatchObject({
        errorCode: "provider_error",
        response: "upstream exploded",
      });
    });

    it("captures an HTTP status from the provider error as the error code", async () => {
      const prisma = buildPrisma();
      const failure = Object.assign(new Error("rate limited"), { status: 429 });
      const service = new AIService(
        prisma as never,
        buildContextBuilder() as never,
        buildProvider(failure) as never,
      );

      await expect(service.chat(ORG_ID, USER_ID, "hi")).rejects.toThrow();
      expect(prisma.aiInteraction.create.mock.calls[0][0].data.errorCode).toBe("http_429");
    });

    it("does not leak the provider's raw error to the caller", async () => {
      const failure = new Error("request_id=req_abc123 account=acct_xyz quota exceeded");
      const service = new AIService(
        buildPrisma() as never,
        buildContextBuilder() as never,
        buildProvider(failure) as never,
      );

      await expect(service.chat(ORG_ID, USER_ID, "hi")).rejects.toThrow(
        "The AI provider is unavailable. Try again shortly.",
      );
    });

    it("still returns an answer when the interaction log write fails", async () => {
      // Same rule as the audit log: logging must not fail the call it logs.
      const prisma = buildPrisma();
      prisma.aiInteraction.create.mockRejectedValue(new Error("db down"));
      const service = new AIService(
        prisma as never,
        buildContextBuilder() as never,
        buildProvider() as never,
      );

      const result = await service.chat(ORG_ID, USER_ID, "hi");

      expect(result.text).toBe(RESPONSE.text);
    });
  });

  describe("explainAlert / summarizeTelemetry", () => {
    it("builds the alert context for the caller's org and tags the request type", async () => {
      const prisma = buildPrisma();
      const contextBuilder = buildContextBuilder();
      const service = new AIService(
        prisma as never,
        contextBuilder as never,
        buildProvider() as never,
      );

      await service.explainAlert(ORG_ID, USER_ID, "alert-1");

      expect(contextBuilder.buildAlertContext).toHaveBeenCalledWith(ORG_ID, "alert-1");
      expect(prisma.aiInteraction.create.mock.calls[0][0].data.requestType).toBe("explain_alert");
    });

    it("passes the requested range through to the summary context", async () => {
      const contextBuilder = buildContextBuilder();
      const service = new AIService(
        buildPrisma() as never,
        contextBuilder as never,
        buildProvider() as never,
      );

      await service.summarizeTelemetry(ORG_ID, USER_ID, "device-1", "7d");

      expect(contextBuilder.buildTelemetrySummaryContext).toHaveBeenCalledWith(
        ORG_ID,
        "device-1",
        "7d",
      );
    });
  });

  describe("listInteractions", () => {
    it("scopes the listing to the caller's organization", async () => {
      const prisma = buildPrisma();
      const service = new AIService(
        prisma as never,
        buildContextBuilder() as never,
        buildProvider() as never,
      );

      await service.listInteractions(ORG_ID, { page: 1, limit: 20 });

      expect(prisma.aiInteraction.findMany.mock.calls[0][0].where).toEqual({
        organizationId: ORG_ID,
      });
    });

    it("filters by request type when asked", async () => {
      const prisma = buildPrisma();
      const service = new AIService(
        prisma as never,
        buildContextBuilder() as never,
        buildProvider() as never,
      );

      await service.listInteractions(ORG_ID, { page: 1, limit: 20, requestType: "chat" });

      expect(prisma.aiInteraction.findMany.mock.calls[0][0].where).toEqual({
        organizationId: ORG_ID,
        requestType: "chat",
      });
    });
  });
});
