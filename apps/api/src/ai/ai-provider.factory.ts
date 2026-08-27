import { Logger, type Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AI_PROVIDER, type IAIProvider } from "./ai-provider.interface";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { MockAIProvider } from "./providers/mock.provider";

/**
 * docs/ARCHITECTURE.md §9: the adapter is chosen by `AI_PROVIDER`, so adding
 * or swapping a vendor never touches calling code. Everything downstream
 * depends on the `AI_PROVIDER` token, not on a concrete class.
 */
export function createAIProvider(config: ConfigService): IAIProvider {
  const logger = new Logger("AIProviderFactory");
  const provider = config.get<string>("AI_PROVIDER", "mock");

  if (provider === "anthropic") {
    const model = config.getOrThrow<string>("AI_MODEL");
    logger.log(`AI provider: anthropic (${model})`);

    return new AnthropicProvider({
      // Joi requires the key when AI_PROVIDER=anthropic, so this cannot be
      // missing by the time the app has booted.
      apiKey: config.getOrThrow<string>("ANTHROPIC_API_KEY"),
      model,
      maxTokens: config.getOrThrow<number>("AI_MAX_TOKENS"),
    });
  }

  logger.log("AI provider: mock (no API key required, no spend)");
  return new MockAIProvider();
}

export const aiProviderFactory: Provider = {
  provide: AI_PROVIDER,
  inject: [ConfigService],
  useFactory: createAIProvider,
};
