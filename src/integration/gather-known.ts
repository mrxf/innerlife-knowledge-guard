import type {
  HookContext,
  LoreRetrievalResult,
  MemoryRecallResult,
} from '@innerlife/agent';
import type { AllowItem, KnownItem } from '../core/types';
import { allowToKnown, normaliseKnown } from '../core/known-set';

/** Auto-include switches for context-sourced known items. Default: all off. */
export interface IncludeOptions {
  /** Map this turn's recalled WorldBook lore into the known set. */
  worldbook?: boolean;
  /** Feed this turn's combined memory recall as a known-context blob. */
  memory?: boolean;
}

/** Caller-supplied extra source (e.g. a DB "concepts the NPC has learned" table). */
export type GatherKnownFn = (ctx: HookContext) => KnownItem[] | Promise<KnownItem[]>;

export interface GatherOptions {
  allow?: AllowItem[];
  include?: IncludeOptions;
  gatherKnown?: GatherKnownFn;
  maxKnownItems?: number;
}

const MEMORY_KNOWN_TOPIC = '已知记忆上下文';

/** Map visibility-filtered WorldBook hits into known items. */
export function mapLore(loreResults: LoreRetrievalResult[]): KnownItem[] {
  return loreResults.map(({ entry }) => {
    const topic = entry.title?.trim() || entry.keywords[0] || entry.id;
    const note = entry.keywords.length > 0 ? entry.keywords.join('、') : entry.category;
    return { topic, ...(note ? { note } : {}), source: 'worldbook' as const };
  });
}

/** Map the combined memory recall into a single known-context item. */
export function mapMemory(memoryRecall: MemoryRecallResult): KnownItem[] {
  const combined = memoryRecall.combined?.trim();
  if (!combined) return [];
  return [{ topic: MEMORY_KNOWN_TOPIC, note: combined, source: 'memory' as const }];
}

/**
 * Assemble the per-turn known set from the standard context sources plus any
 * caller-defined source, then normalise (merge → dedupe → cap).
 *
 * The guard never reads context itself — this helper is the single place that
 * bridges `@innerlife/agent`'s pipeline data into the framework-free core.
 */
export async function gatherKnownFromContext(
  ctx: HookContext,
  options: GatherOptions,
): Promise<KnownItem[]> {
  const lists: KnownItem[][] = [allowToKnown(options.allow)];

  if (options.include?.worldbook && ctx.loreResults) {
    lists.push(mapLore(ctx.loreResults));
  }
  if (options.include?.memory && ctx.memoryRecall) {
    lists.push(mapMemory(ctx.memoryRecall));
  }
  if (options.gatherKnown) {
    lists.push(await options.gatherKnown(ctx));
  }

  return normaliseKnown(lists, options.maxKnownItems);
}
