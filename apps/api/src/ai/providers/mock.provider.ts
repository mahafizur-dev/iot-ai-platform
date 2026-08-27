import type { AIContext, AIMessage, AIResponse, IAIProvider } from "../ai-provider.interface";
import { buildSystemPrompt } from "../prompts";

/**
 * The default provider, and deliberately so — the same reasoning
 * docs/ARCHITECTURE.md §10 gives for shipping a `MockBleAdapter`: the seam is
 * what matters, and everything around it (endpoints, context builder,
 * interaction logging, the frontend assistant) should be runnable and
 * testable without a key, a network call, or spend.
 *
 * It echoes back the context it was given, which makes it genuinely useful in
 * development: if the assistant's answer is missing a fact, the mock's reply
 * shows immediately whether the builder failed to include it or the model
 * failed to use it.
 */
export class MockAIProvider implements IAIProvider {
  readonly name = "mock";
  readonly model = "mock-echo-1";

  async chat(messages: AIMessage[], context: AIContext): Promise<AIResponse> {
    const question = messages.at(-1)?.content ?? "";

    return this.respond(
      [
        `You asked: "${question}"`,
        "",
        "This is the mock AI provider — set AI_PROVIDER=anthropic with an API key for real answers.",
        "",
        this.describeContext(context),
      ].join("\n"),
      context,
    );
  }

  async summarizeTelemetry(context: AIContext): Promise<AIResponse> {
    return this.respond(
      ["Mock telemetry summary.", "", this.describeContext(context)].join("\n"),
      context,
    );
  }

  async explainAlert(context: AIContext): Promise<AIResponse> {
    return this.respond(
      ["Mock alert explanation.", "", this.describeContext(context)].join("\n"),
      context,
    );
  }

  private describeContext(context: AIContext): string {
    return context.facts.length === 0
      ? "The context builder produced no facts for this request."
      : ["Context the builder assembled:", ...context.facts.map((fact) => `- ${fact}`)].join("\n");
  }

  private async respond(text: string, context: AIContext): Promise<AIResponse> {
    // Rough token counts so the interaction log, the cost column, and any UI
    // reading them have plausibly-shaped values in mock mode. ~4 chars/token
    // is the usual English approximation.
    const prompt = buildSystemPrompt(context);

    return {
      text,
      model: this.model,
      provider: this.name,
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(text.length / 4),
      latencyMs: 0,
    };
  }
}
