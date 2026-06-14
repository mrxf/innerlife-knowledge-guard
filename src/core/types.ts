/**
 * Core domain types for the knowledge guard.
 *
 * This module is intentionally framework-agnostic (zero dependency on
 * `@innerlife/agent`) so the detection logic can be reasoned about and
 * unit-tested in complete isolation.
 */

/** A topic the NPC is explicitly permitted to know despite being out-of-world. */
export interface AllowItem {
  /** Concept / topic name, e.g. "战棋规则". */
  topic: string;
  /** Optional one-line rationale, surfaced to the detector and the main prompt. */
  note?: string;
}

/** A topic the NPC must NOT know even though it falls inside the world. */
export interface DenyItem {
  /** Concept / topic name, e.g. "赤壁之战". */
  topic: string;
  /** Optional reason, helps the LLM react in character. */
  reason?: string;
}

/** How the boundary is reasoned about; affects detector phrasing. */
export type WorldType = 'historical' | 'fictional';

/**
 * Declarative epistemic boundary for an NPC's world.
 *
 * This is a *system-level* config and is intentionally NOT part of persona.
 * Positive knowledge ("what the NPC knows") is owned by the WorldBook; this
 * config owns the negative space ("what lies beyond the horizon").
 */
export interface KnowledgeBoundaryConfig {
  /** Natural-language description of the NPC's world / era. */
  setting: string;
  /** Reasoning mode. Defaults to `'historical'`. */
  type?: WorldType;
  /** Historical "now": everything later is, by default, unknowable. */
  presentMoment?: string;
  /** Optional accuracy hints (dynasty timeline, "modern tech is out-of-bounds", ...). */
  referenceHints?: string[];
  /** Whitelist: out-of-world topics the NPC is allowed to recognise. */
  allow?: AllowItem[];
  /** Forbidden topics that are in-world but must stay unknown. */
  deny?: DenyItem[];
}

/** A partial boundary used as a per-NPC override on top of a base profile. */
export type KnowledgeBoundaryOverride = Partial<KnowledgeBoundaryConfig>;

/** Provenance of a known item — used for prompt grouping and tracing. */
export type KnownSource = 'allow' | 'worldbook' | 'memory' | (string & {});

/**
 * A single "the NPC already knows this" hint, assembled by the caller and
 * passed into the guard. The guard never gathers these itself.
 */
export interface KnownItem {
  topic: string;
  note?: string;
  source?: KnownSource;
}

/**
 * A single prior conversation turn, framework-free. Roles are expressed from
 * the NPC's point of view so the core never needs to know about the agent
 * framework's `incoming`/`outgoing` vocabulary.
 */
export interface ConversationTurn {
  /** `'user'` = the counterpart (player / other actor); `'assistant'` = this NPC. */
  role: 'user' | 'assistant';
  /** Verbatim message text. */
  content: string;
  /** Optional display name (e.g. "玩家" / "小乔"), used only for readable rendering. */
  speaker?: string;
}

/**
 * Provenance of a detection:
 * - `'input'`     — the concept appeared in the message / recent history.
 * - `'predicted'` — a look-ahead: a concept the NPC would likely *answer* with.
 */
export type DetectionOrigin = 'input' | 'predicted';

/** A single out-of-boundary concept detected in the inspected text. */
export interface DetectedItem {
  /** The offending concept, as detected. */
  value: string;
  /** Short in-world rationale, e.g. "现代通讯方式，东汉末年不存在". */
  reason: string;
  /** Provenance. Absent ⇒ `'input'` (backward-compatible default). */
  origin?: DetectionOrigin;
}

/** Structured detection outcome. Empty `items` means nothing out-of-bounds. */
export interface DetectionResult {
  items: DetectedItem[];
}

/** Input to {@link LLMClient}-backed detection. */
export interface GuardCheckInput {
  /** Text to inspect (typically the latest player message). */
  text: string;
  /** Pre-assembled "already known" set (allow + recalled worldbook/memory + custom). */
  known: KnownItem[];
  /** The epistemic boundary to enforce. */
  config: KnowledgeBoundaryConfig;
  /**
   * Recent prior turns (oldest → newest), **excluding** the current `text`.
   * Lets the detector catch multi-turn induction (e.g. spelling out a name
   * across several messages). Omit / empty ⇒ single-turn inspection.
   */
  history?: ConversationTurn[];
  /**
   * When `> 0`, the detector additionally predicts up to this many
   * out-of-bounds *answers* the NPC might give. `0` / omit ⇒ input-side only.
   */
  maxPredicted?: number;
}

/** A single chat message for the detector LLM. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Tunables for a single detector LLM call. */
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * The only capability the guard needs from an LLM. Keeping this minimal lets
 * `core` stay framework-free; the integration layer adapts a real provider.
 */
export interface LLMClient {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}

/** Renders structured detection / config into prompt-ready strings. */
export interface InjectionRenderer {
  /** Standing system-prompt block describing the boundary. `null` ⇒ omit. */
  renderBoundary(config: KnowledgeBoundaryConfig): string | null;
  /** Per-turn alert for detected items. `null` ⇒ nothing to inject. */
  renderAlert(result: DetectionResult, config: KnowledgeBoundaryConfig): string | null;
}
