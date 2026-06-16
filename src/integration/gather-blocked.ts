import type { HookContext } from '@innerlife/agent';
import type { BlockedItem } from '../core/types';
import { normaliseBlocked } from '../core/blocked-set';

/** Caller-supplied dynamic blocked source, e.g. a timeline guardbook retriever. */
export type GatherBlockedFn = (ctx: HookContext) => BlockedItem[] | Promise<BlockedItem[]>;

export interface GatherBlockedOptions {
  gatherBlocked?: GatherBlockedFn;
  maxBlockedItems?: number;
}

/** Assemble and normalise per-turn forbidden candidates. */
export async function gatherBlockedFromContext(
  ctx: HookContext,
  options: GatherBlockedOptions,
): Promise<BlockedItem[]> {
  if (!options.gatherBlocked) return [];
  return normaliseBlocked([await options.gatherBlocked(ctx)], options.maxBlockedItems);
}
