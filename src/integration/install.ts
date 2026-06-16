import type { Agent, HookContext, LLMProvider } from '@innerlife/agent';
import { KnowledgeGuard } from '../core/guard';
import { DefaultInjectionRenderer } from '../core/renderer';
import type {
  ChatOptions,
  InjectionRenderer,
  KnowledgeBoundaryConfig,
} from '../core/types';
import { resolveLLMClient, wrapProvider, type ProviderConfig } from './provider';
import {
  gatherKnownFromContext,
  type GatherKnownFn,
  type IncludeOptions,
} from './gather-known';
import { gatherBlockedFromContext, type GatherBlockedFn } from './gather-blocked';
import { gatherHistoryFromContext, type GatherHistoryFn } from './gather-history';
import { registerDynamicAlertSlot, registerStaticBoundarySlot } from './slots';
import {
  KnowledgeGuardEvents,
  emitGuardEvent,
  type EventEmitterLike,
} from '../observability/events';

/** Override the names the guard uses for its hook / slots / metadata key. */
export interface GuardNames {
  hook?: string;
  staticSlot?: string;
  dynamicSlot?: string;
  metadataKey?: string;
}

export interface InstallOptions {
  /** The epistemic boundary to enforce (already resolved from any profile). */
  config: KnowledgeBoundaryConfig;

  // ── Detector LLM (pick one; falls back to the agent's main provider) ──
  /** A ready-built provider instance (preferred — reuses provider quirks). */
  provider?: LLMProvider;
  /** Or a config the package turns into an OpenAI-compatible provider. */
  providerConfig?: ProviderConfig;
  /** Per-call detector tunables. Defaults to low-temp, short output. */
  chatOptions?: ChatOptions;

  // ── Known-set assembly ──
  /** Auto-include recalled worldbook / memory as exemptions. Default: off. */
  include?: IncludeOptions;
  /** Extra caller-defined known source (e.g. DB "learned concepts"). */
  gatherKnown?: GatherKnownFn;
  /** Cap on known items fed to the detector (guards token budget). */
  maxKnownItems?: number;

  // ── Dynamic blocked candidates ──
  /** Extra caller-defined forbidden candidates; detector decides whether they apply. */
  gatherBlocked?: GatherBlockedFn;
  /** Cap on dynamic blocked candidates fed to the detector. */
  maxBlockedItems?: number;

  // ── Multi-turn context ──
  /**
   * Inject the last N exchanges (one ask + one reply) of dialogue into the
   * detector so multi-turn induction (spelling / assembling a concept across
   * turns) is caught. Default 3; set 0 to disable. Auto-pulled from
   * `agent.dialogueHistory`; gracefully degrades to single-turn when absent.
   */
  historyTurns?: number;
  /** Per-message character cap for injected history. Default 1500. */
  historyMaxChars?: number;
  /** Custom history source (DB-backed projects). Takes precedence over auto-pull. */
  gatherHistory?: GatherHistoryFn;

  // ── Answer look-ahead ──
  /**
   * Also predict out-of-bounds *answers* the NPC might give (catches innocent
   * questions whose truthful answer crosses the boundary). Default: false.
   */
  answerGuard?: boolean;
  /** Cap on predicted answers. Default 3 (0 ⇒ effectively off). */
  maxPredicted?: number;

  // ── Layers ──
  /** Standing boundary block in the system prompt. Default: true. */
  staticLayer?: boolean;
  /** Per-turn detector + alert injection. Default: true. */
  dynamicLayer?: boolean;

  // ── Rendering ──
  /** Custom renderer; defaults to {@link DefaultInjectionRenderer}. */
  renderer?: InjectionRenderer;
  /** Alert XML tag name (when using the default renderer). */
  tag?: string;
  /** Boundary XML tag name (when using the default renderer). */
  boundaryTag?: string;

  // ── Behaviour ──
  /** Skip detection for messages shorter than this (cost saver). Default: run always. */
  minTextLength?: number;
  /** Hook priority within `pre-compose`. Default: 5. */
  hookPriority?: number;
  /** Override hook / slot / metadata names. */
  names?: GuardNames;
}

export interface KnowledgeGuardHandle {
  /** The underlying core guard (useful for manual `check()` or testing). */
  readonly guard: KnowledgeGuard;
  /** Remove every hook / slot this install registered. Idempotent. */
  uninstall(): void;
}

const DEFAULT_NAMES: Required<GuardNames> = {
  hook: 'knowledge-guard',
  staticSlot: 'knowledge-boundary',
  dynamicSlot: 'knowledge-alert',
  metadataKey: 'knowledgeGuardDetection',
};
const DEFAULT_HOOK_PRIORITY = 5;
const DEFAULT_HISTORY_TURNS = 3;
const DEFAULT_MAX_PREDICTED = 3;

function resolveClient(agent: Agent, options: InstallOptions) {
  if (options.provider) return wrapProvider(options.provider);
  if (options.providerConfig) return resolveLLMClient(options.providerConfig);
  return wrapProvider(agent.provider);
}

/**
 * Wire the knowledge guard onto an existing agent: one `pre-compose` hook
 * (detect → stash structured result) + a system slot (standing boundary) +
 * a `post-user-system` slot (per-turn alert). Returns a handle to undo it all.
 *
 * Detection failures fail open — the dynamic alert is skipped, the static
 * layer still stands, and a `knowledge-guard:error` event is emitted.
 */
export function installKnowledgeGuard(
  agent: Agent,
  options: InstallOptions,
): KnowledgeGuardHandle {
  const staticLayer = options.staticLayer ?? true;
  const dynamicLayer = options.dynamicLayer ?? true;
  const names: Required<GuardNames> = { ...DEFAULT_NAMES, ...options.names };
  const bus = agent.eventBus as EventEmitterLike;

  const guard = new KnowledgeGuard({
    client: resolveClient(agent, options),
    chatOptions: options.chatOptions,
  });

  const renderer =
    options.renderer ??
    new DefaultInjectionRenderer({
      alertTag: options.tag,
      boundaryTag: options.boundaryTag,
    });

  if (staticLayer) {
    registerStaticBoundarySlot(agent.composer, names.staticSlot, options.config, renderer);
  }

  if (dynamicLayer) {
    agent.hooks.register({
      name: names.hook,
      phase: 'pre-compose',
      priority: options.hookPriority ?? DEFAULT_HOOK_PRIORITY,
      readonly: false,
      critical: false,
      execute: (ctx: HookContext) => runDetection(ctx, agent, guard, options, names, bus),
    });

    registerDynamicAlertSlot(
      agent.composer,
      names.dynamicSlot,
      names.metadataKey,
      options.config,
      renderer,
    );
  }

  emitGuardEvent(bus, KnowledgeGuardEvents.Installed, {
    agentId: agent.id,
    staticLayer,
    dynamicLayer,
  });

  let uninstalled = false;
  return {
    guard,
    uninstall(): void {
      if (uninstalled) return;
      uninstalled = true;
      if (dynamicLayer) {
        agent.hooks.unregister(names.hook);
        agent.composer.unregisterUserSlot(names.dynamicSlot);
      }
      if (staticLayer) {
        agent.composer.unregisterSlot(names.staticSlot);
      }
      emitGuardEvent(bus, KnowledgeGuardEvents.Uninstalled, { agentId: agent.id });
    },
  };
}

/** The `pre-compose` hook body: gather known + history → check → stash result (fail-open). */
async function runDetection(
  ctx: HookContext,
  agent: Agent,
  guard: KnowledgeGuard,
  options: InstallOptions,
  names: Required<GuardNames>,
  bus: EventEmitterLike,
): Promise<{ action: 'continue' }> {
  const text = ctx.event?.text?.trim();
  if (!text) return { action: 'continue' };
  if (options.minTextLength && text.length < options.minTextLength) {
    return { action: 'continue' };
  }

  const { agentId, turnId } = ctx.agentContext;
  const maxPredicted = options.answerGuard ? options.maxPredicted ?? DEFAULT_MAX_PREDICTED : 0;

  try {
    const [known, blocked, history] = await Promise.all([
      gatherKnownFromContext(ctx, {
        allow: options.config.allow,
        include: options.include,
        gatherKnown: options.gatherKnown,
        maxKnownItems: options.maxKnownItems,
      }),
      gatherBlockedFromContext(ctx, {
        gatherBlocked: options.gatherBlocked,
        maxBlockedItems: options.maxBlockedItems,
      }),
      gatherHistoryFromContext(ctx, {
        agent,
        turns: options.historyTurns ?? DEFAULT_HISTORY_TURNS,
        maxChars: options.historyMaxChars,
        gatherHistory: options.gatherHistory,
      }),
    ]);

    const result = await guard.check({
      text,
      known,
      blocked,
      config: options.config,
      history,
      maxPredicted,
    });
    // Stash on agentContext.metadata — NOT ctx.metadata. The dynamic-alert slot
    // reads from the compose context (`composer.composeMessages(agentContext, …)`),
    // i.e. `ctx.agentContext.metadata`. `ctx.metadata` is the Runner's per-turn
    // pipeline bag, a separate object the composer never sees, so writing there
    // silently drops the alert.
    ctx.agentContext.metadata[names.metadataKey] = result;

    emitGuardEvent(
      bus,
      result.items.length > 0 ? KnowledgeGuardEvents.Detected : KnowledgeGuardEvents.Clean,
      { agentId, turnId, items: result.items },
    );
  } catch (error) {
    emitGuardEvent(bus, KnowledgeGuardEvents.Error, {
      agentId,
      turnId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { action: 'continue' };
}
