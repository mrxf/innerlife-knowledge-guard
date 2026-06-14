import type { Agent, HookContext } from '@innerlife/agent';
import type { ConversationTurn } from '../core/types';

/** Caller-supplied history source (e.g. a DB-backed conversation log). */
export type GatherHistoryFn = (
  ctx: HookContext,
) => ConversationTurn[] | Promise<ConversationTurn[]>;

export interface GatherHistoryOptions {
  /** The agent owning the dialogue history (captured by the install closure). */
  agent: Agent;
  /** Number of recent exchanges (one ask + one reply) to include. `<= 0` ⇒ none. */
  turns: number;
  /** Per-message character cap, guarding against one huge turn. */
  maxChars?: number;
  /** Override; when provided, fully replaces the `dialogueHistory` auto-pull. */
  gatherHistory?: GatherHistoryFn;
}

const DEFAULT_MAX_CHARS = 1500;

/** Trim a single message to keep the history block within budget. */
function clip(text: string, maxChars: number): string {
  const trimmed = text.trim();
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}…` : trimmed;
}

/**
 * Resolve the per-turn conversation history fed to the detector.
 *
 * Resolution order:
 *   1. explicit `gatherHistory` override (DB-backed consumers),
 *   2. auto-pull from `agent.dialogueHistory` (scope-filtered, verbatim),
 *   3. empty array ⇒ the guard falls back to single-turn inspection.
 *
 * `dialogueHistory` yields newest-first; we reverse to chronological order and
 * map the framework's `incoming`/`outgoing` roles onto the core's
 * `user`/`assistant`. The current player message is intentionally **not** here
 * — at `pre-compose` it lives only on `ctx.event.text` and is recorded later.
 */
export async function gatherHistoryFromContext(
  ctx: HookContext,
  options: GatherHistoryOptions,
): Promise<ConversationTurn[]> {
  if (options.gatherHistory) return options.gatherHistory(ctx);

  const dialogueHistory = options.agent.dialogueHistory;
  if (options.turns <= 0 || !dialogueHistory) return [];

  const scopeId =
    ctx.agentContext.conversationScope?.id ?? ctx.agentContext.interaction?.scope.id;

  const entries = await dialogueHistory.store.query({
    ...(scopeId ? { scopeId } : {}),
    limit: options.turns * 2,
  });
  if (entries.length === 0) return [];

  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  return [...entries].reverse().map((entry) => ({
    role: entry.role === 'incoming' ? ('user' as const) : ('assistant' as const),
    content: clip(entry.content, maxChars),
    ...(entry.sourceName ? { speaker: entry.sourceName } : {}),
  }));
}
