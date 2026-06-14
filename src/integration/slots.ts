import type { Composer } from '@innerlife/agent';
import type {
  DetectionResult,
  InjectionRenderer,
  KnowledgeBoundaryConfig,
} from '../core/types';

/**
 * Register the standing boundary block as a system slot right after `<persona>`.
 *
 * The rendered text is constant for a given config, so it is computed once at
 * registration time. A no-op (returns `null`) when the renderer omits a block.
 */
export function registerStaticBoundarySlot(
  composer: Composer,
  slot: string,
  config: KnowledgeBoundaryConfig,
  renderer: InjectionRenderer,
): void {
  const rendered = renderer.renderBoundary(config);
  composer.registerSlot({ slot, after: 'persona', fragment: () => rendered });
}

/**
 * Register the per-turn alert as a `post-user-system` slot.
 *
 * Reads the structured {@link DetectionResult} the hook stashed in
 * `ctx.metadata[metadataKey]` and renders it; absent / empty ⇒ nothing injected.
 * Placing it after the user message keeps it in the high-trust zone, isolated
 * from prompt-injection in the user's own text.
 */
export function registerDynamicAlertSlot(
  composer: Composer,
  slot: string,
  metadataKey: string,
  config: KnowledgeBoundaryConfig,
  renderer: InjectionRenderer,
): void {
  composer.registerUserSlot({
    slot,
    position: 'post-user-system',
    fragment: (ctx) => {
      const result = ctx.metadata[metadataKey] as DetectionResult | undefined;
      if (!result) return null;
      return renderer.renderAlert(result, config);
    },
  });
}
