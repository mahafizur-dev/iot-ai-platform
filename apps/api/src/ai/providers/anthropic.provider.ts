import { Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AIContext,
  AIMessage,
  AIResponse,
  IAIProvider,
} from "../ai-provider.interface";
import { buildSystemPrompt } from "../prompts";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
}

/**
 * Translation layer, nothing more: prompt in, text out. It never queries the
 * database and never decides what the user may see — the context builder has
 * already done both by the time anything reaches here.
 */
export class AnthropicProvider implements IAIProvider {
  readonly name = "anthropic";

  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
  }

  async chat(messages: AIMessage[], context: AIContext): Promise<AIResponse> {
    return this.send(messages, context);
  }

  async summarizeTelemetry(context: AIContext): Promise<AIResponse> {
    return this.send(
      [{ role: "user", content: "Summarise this device's recent telemetry." }],
      context,
    );
  }

  async explainAlert(context: AIContext): Promise<AIResponse> {
    return this.send([{ role: "user", content: "Explain this alert." }], context);
  }

  private async send(messages: AIMessage[], context: AIContext): Promise<AIResponse> {
    const startedAt = Date.now();

    const response = await this.client.messages.create({
      model: this.options.model,
      max_tokens: this.options.maxTokens,
      system: buildSystemPrompt(context),
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
    });

    // A response can contain several blocks (and non-text blocks once tools
    // are in play), so join the text ones rather than assuming content[0].
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      this.logger.warn(`Anthropic returned no text blocks (stop_reason: ${response.stop_reason})`);
    }

    return {
      text: text || "The model returned an empty response.",
      // The response's own model string, not the requested one: an alias like
      // "claude-sonnet-5" resolves to a dated snapshot, and the log should
      // record what actually answered.
      model: response.model,
      provider: this.name,
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      latencyMs: Date.now() - startedAt,
    };
  }
}
