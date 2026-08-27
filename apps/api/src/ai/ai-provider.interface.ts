/** DI token — the app depends on this interface, never on a vendor SDK (docs/ARCHITECTURE.md §9). */
export const AI_PROVIDER = Symbol("AI_PROVIDER");

export const AI_REQUEST_TYPES = ["chat", "summary", "explain_alert"] as const;
export type AIRequestType = (typeof AI_REQUEST_TYPES)[number];

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * What the context builder assembled: bounded, already authorized, already
 * scrubbed of anything secret. Providers render it into a system prompt —
 * they never fetch data of their own.
 */
export interface AIContext {
  requestType: AIRequestType;
  organizationId: string;
  /** Human-readable facts, one per line, that the model may rely on. */
  facts: string[];
  /** The same material in structured form — logged to ai_interactions. */
  data: Record<string, unknown>;
}

export interface AIResponse {
  text: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  /** Provider-side latency only; the service measures the wall clock separately. */
  latencyMs: number;
}

/**
 * §9's interface, with one deliberate difference: `summarizeTelemetry` and
 * `explainAlert` take the already-built context rather than an id.
 *
 * The doc sketches them as `summarizeTelemetry(deviceId, range)`, which would
 * put data fetching inside the adapter — and then every new provider would
 * have to re-implement authorization and re-derive the same bounded context,
 * with a fresh chance to leak another org's rows. Keeping the fetch in one
 * context builder and passing its output down means an adapter is purely a
 * translation layer: prompt in, text out.
 */
export interface IAIProvider {
  readonly name: string;

  chat(messages: AIMessage[], context: AIContext): Promise<AIResponse>;
  summarizeTelemetry(context: AIContext): Promise<AIResponse>;
  explainAlert(context: AIContext): Promise<AIResponse>;
}
