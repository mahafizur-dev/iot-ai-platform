import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AIContextBuilder } from "./ai-context.builder";
import {
  AI_PROVIDER,
  type AIContext,
  type AIMessage,
  type AIRequestType,
  type AIResponse,
  type IAIProvider,
} from "./ai-provider.interface";
import { estimateCost } from "./cost";

export interface AIResult {
  text: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costEstimate: number;
  latencyMs: number;
  interactionId: string;
}

export interface AIInteractionSummary {
  id: string;
  requestType: string;
  provider: string;
  model: string;
  prompt: string;
  response: string;
  promptTokens: number;
  completionTokens: number;
  costEstimate: number;
  latencyMs: number;
  errorCode: string | null;
  createdAt: string;
}

/** Chat history the client may send back; older turns are dropped. */
const MAX_HISTORY_MESSAGES = 10;

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextBuilder: AIContextBuilder,
    @Inject(AI_PROVIDER) private readonly provider: IAIProvider,
  ) {}

  async chat(
    organizationId: string,
    userId: string,
    message: string,
    history: AIMessage[] = [],
  ): Promise<AIResult> {
    const context = await this.contextBuilder.buildChatContext(organizationId);

    // Trim before appending so the newest turn always survives the cap.
    const messages: AIMessage[] = [
      ...history.slice(-MAX_HISTORY_MESSAGES),
      { role: "user", content: message },
    ];

    return this.run(context, userId, message, () => this.provider.chat(messages, context));
  }

  async summarizeTelemetry(
    organizationId: string,
    userId: string,
    deviceId: string,
    range: "24h" | "7d" | "30d",
  ): Promise<AIResult> {
    const context = await this.contextBuilder.buildTelemetrySummaryContext(
      organizationId,
      deviceId,
      range,
    );

    return this.run(context, userId, `Summarise telemetry for device ${deviceId} over ${range}`, () =>
      this.provider.summarizeTelemetry(context),
    );
  }

  async explainAlert(organizationId: string, userId: string, alertId: string): Promise<AIResult> {
    const context = await this.contextBuilder.buildAlertContext(organizationId, alertId);

    return this.run(context, userId, `Explain alert ${alertId}`, () =>
      this.provider.explainAlert(context),
    );
  }

  /**
   * The one path every AI call takes: invoke, measure, log, return.
   *
   * Failures are logged to `ai_interactions` too. A provider outage that left
   * no trace would be invisible in exactly the audit trail §9 asks for, and
   * the failed calls are often the ones worth investigating.
   */
  private async run(
    context: AIContext,
    userId: string,
    prompt: string,
    invoke: () => Promise<AIResponse>,
  ): Promise<AIResult> {
    const startedAt = Date.now();

    let response: AIResponse;
    try {
      response = await invoke();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      this.logger.error(`AI ${context.requestType} call failed: ${message}`);

      await this.record(context, userId, prompt, {
        provider: this.provider.name,
        model: "unknown",
        text: message,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: Date.now() - startedAt,
        errorCode: this.errorCodeFor(error),
      });

      // Don't surface the provider's raw error to the caller — it can carry
      // request ids, headers, and account details that mean nothing to an
      // operator and shouldn't leave the server.
      throw new ServiceUnavailableException("The AI provider is unavailable. Try again shortly.");
    }

    const interaction = await this.record(context, userId, prompt, {
      ...response,
      errorCode: null,
      // Wall clock, not the provider's self-report: it includes serialisation
      // and network time, which is what a user actually waited.
      latencyMs: Date.now() - startedAt,
    });

    return {
      text: response.text,
      provider: response.provider,
      model: response.model,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      costEstimate: estimateCost(response.model, response.promptTokens, response.completionTokens),
      latencyMs: Date.now() - startedAt,
      interactionId: interaction.id,
    };
  }

  private errorCodeFor(error: unknown): string {
    const status = (error as { status?: number })?.status;
    return typeof status === "number" ? `http_${status}` : "provider_error";
  }

  private async record(
    context: AIContext,
    userId: string,
    prompt: string,
    outcome: {
      provider: string;
      model: string;
      text: string;
      promptTokens: number;
      completionTokens: number;
      latencyMs: number;
      errorCode: string | null;
    },
  ): Promise<{ id: string }> {
    try {
      return await this.prisma.aiInteraction.create({
        data: {
          userId,
          organizationId: context.organizationId,
          provider: outcome.provider,
          model: outcome.model,
          requestType: context.requestType,
          // The structured summary, not the rendered prompt: enough to trace
          // what the model was shown without storing the full fleet listing
          // on every single call.
          inputContext: context.data as Prisma.InputJsonObject,
          prompt,
          response: outcome.text,
          promptTokens: outcome.promptTokens,
          completionTokens: outcome.completionTokens,
          costEstimate: estimateCost(outcome.model, outcome.promptTokens, outcome.completionTokens),
          latencyMs: outcome.latencyMs,
          errorCode: outcome.errorCode,
        },
        select: { id: true },
      });
    } catch (error) {
      // Same rule as the audit log: a logging failure must not fail the call
      // it was logging.
      this.logger.error("Failed to write ai_interactions row", error);
      return { id: "" };
    }
  }

  async listInteractions(
    organizationId: string,
    options: { page: number; limit: number; requestType?: AIRequestType },
  ): Promise<{ items: AIInteractionSummary[]; total: number }> {
    const where = {
      organizationId,
      ...(options.requestType ? { requestType: options.requestType } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.aiInteraction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      this.prisma.aiInteraction.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        requestType: row.requestType,
        provider: row.provider,
        model: row.model,
        prompt: row.prompt,
        response: row.response,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        costEstimate: row.costEstimate,
        latencyMs: row.latencyMs,
        errorCode: row.errorCode,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
    };
  }
}
