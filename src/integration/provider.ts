import { OpenAIProvider, type LLMMessage, type LLMProvider } from '@innerlife/agent';
import type { ChatMessage, ChatOptions, LLMClient } from '../core/types';

/**
 * Sugar for constructing a detector provider without importing the framework's
 * `OpenAIProvider` directly. Mirrors the common OpenAI-compatible knobs; for
 * anything more exotic, pass a fully-built `LLMProvider` instead.
 */
export interface ProviderConfig {
  /** Falls back to env (`<envPrefix>_API_KEY`, then `OPENAI_API_KEY`). */
  apiKey?: string;
  /** OpenAI-compatible base URL. */
  baseUrl?: string;
  /** Model name. */
  model?: string;
  /** Extra HTTP headers (e.g. a custom `User-Agent` to dodge 403s). */
  headers?: Record<string, string>;
  /** Env-var prefix for auto-configuration (see framework `OpenAIProvider`). */
  envPrefix?: string;
}

function toLLMMessages(messages: ChatMessage[]): LLMMessage[] {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

/** Adapt a framework {@link LLMProvider} to the core {@link LLMClient} contract. */
export function wrapProvider(provider: LLMProvider): LLMClient {
  return {
    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
      const response = await provider.chat(toLLMMessages(messages), options);
      return response.data;
    },
  };
}

/** Build a framework {@link LLMProvider} from {@link ProviderConfig}. */
export function providerFromConfig(config: ProviderConfig): LLMProvider {
  return new OpenAIProvider({
    ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
    ...(config.baseUrl !== undefined ? { baseURL: config.baseUrl } : {}),
    ...(config.model !== undefined ? { model: config.model } : {}),
    ...(config.headers !== undefined ? { defaultHeaders: config.headers } : {}),
    ...(config.envPrefix !== undefined ? { envPrefix: config.envPrefix } : {}),
  });
}

/** Duck-type check: does this look like an {@link LLMProvider}? */
export function isLLMProvider(value: unknown): value is LLMProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LLMProvider).chat === 'function'
  );
}

/** Resolve either a provider instance or a config object into an {@link LLMClient}. */
export function resolveLLMClient(source: LLMProvider | ProviderConfig): LLMClient {
  return wrapProvider(isLLMProvider(source) ? source : providerFromConfig(source));
}
