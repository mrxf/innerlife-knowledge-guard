import { buildDetectorMessages } from './prompt-template';
import { parseDetection } from './detector';
import type { ChatOptions, DetectionResult, GuardCheckInput, LLMClient } from './types';

export interface KnowledgeGuardOptions {
  /** The LLM the detector runs on. */
  client: LLMClient;
  /** Per-call tunables. Defaults to a low-temperature, short-output call. */
  chatOptions?: ChatOptions;
}

const DEFAULT_CHAT_OPTIONS: ChatOptions = { temperature: 0.1, maxTokens: 512 };

/**
 * The framework-agnostic heart of the package.
 *
 * Given a piece of text, a pre-assembled "known" exemption set, and a boundary
 * config, it asks the detector LLM which concepts fall outside the NPC's
 * cognitive horizon and returns a structured result.
 *
 * It is deliberately pure with respect to side effects: it neither reads
 * external state nor swallows errors. Graceful degradation (fail-open) is the
 * responsibility of the integration layer.
 */
export class KnowledgeGuard {
  private readonly client: LLMClient;
  private readonly chatOptions: ChatOptions;

  constructor(options: KnowledgeGuardOptions) {
    this.client = options.client;
    this.chatOptions = options.chatOptions ?? DEFAULT_CHAT_OPTIONS;
  }

  /**
   * Inspect `input.text` against the boundary, honouring `input.known`.
   *
   * @throws on LLM transport failure or unparseable response — callers that
   * need fail-open behaviour should catch and skip injection.
   */
  async check(input: GuardCheckInput): Promise<DetectionResult> {
    const messages = buildDetectorMessages(input);
    const raw = await this.client.chat(messages, this.chatOptions);
    return parseDetection(raw, { maxPredicted: input.maxPredicted ?? 0 });
  }
}
