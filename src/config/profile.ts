import type {
  KnowledgeBoundaryConfig,
  KnowledgeBoundaryOverride,
} from '../core/types';
import type { KnowledgeGuardProfiles } from './schema';

const normalise = (value: string): string => value.trim().toLowerCase();

/** De-duplicate topic-keyed items; later entries win (overrides take precedence). */
function dedupeByTopic<T extends { topic: string }>(items: T[]): T[] {
  const byTopic = new Map<string, T>();
  for (const item of items) {
    const key = normalise(item.topic);
    if (key) byTopic.set(key, item);
  }
  return [...byTopic.values()];
}

/** De-duplicate strings case-insensitively, preserving first-seen order/casing. */
function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = normalise(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mergeArray<T>(
  base: T[] | undefined,
  override: T[] | undefined,
  dedupe: (items: T[]) => T[],
): T[] | undefined {
  if (!base && !override) return undefined;
  return dedupe([...(base ?? []), ...(override ?? [])]);
}

/**
 * Merge a per-NPC override onto a base boundary.
 *
 * Merge semantics (per design): **scalars overwrite**
 * (`setting` / `type` / `presentMoment`), **arrays merge & de-duplicate**
 * (`referenceHints` / `allow` / `deny`). Note: there is intentionally no
 * "clear" verb — an override cannot remove a base entry, only add/replace.
 */
export function mergeBoundary(
  base: KnowledgeBoundaryConfig,
  override?: KnowledgeBoundaryOverride,
): KnowledgeBoundaryConfig {
  if (!override) {
    return {
      ...base,
      ...(base.referenceHints ? { referenceHints: [...base.referenceHints] } : {}),
      ...(base.allow ? { allow: [...base.allow] } : {}),
      ...(base.deny ? { deny: [...base.deny] } : {}),
    };
  }

  return {
    setting: override.setting ?? base.setting,
    type: override.type ?? base.type,
    presentMoment: override.presentMoment ?? base.presentMoment,
    referenceHints: mergeArray(base.referenceHints, override.referenceHints, dedupeStrings),
    allow: mergeArray(base.allow, override.allow, dedupeByTopic),
    deny: mergeArray(base.deny, override.deny, dedupeByTopic),
  };
}

/**
 * Resolve a single NPC's effective boundary from a named-profile registry.
 *
 * @param registry  the profiles document.
 * @param name      profile to use; falls back to `registry.defaultProfile`.
 * @param override  optional per-NPC tweaks merged onto the chosen profile.
 * @throws if no profile can be selected or the named profile is missing.
 */
export function resolveProfile(
  registry: KnowledgeGuardProfiles,
  name?: string,
  override?: KnowledgeBoundaryOverride,
): KnowledgeBoundaryConfig {
  const profileName = name ?? registry.defaultProfile;
  if (!profileName) {
    throw new Error(
      'resolveProfile: no profile name provided and registry has no `defaultProfile`',
    );
  }

  const base = registry.profiles[profileName];
  if (!base) {
    const available = Object.keys(registry.profiles).join(', ') || '(none)';
    throw new Error(`resolveProfile: unknown profile "${profileName}". Available: ${available}`);
  }

  return mergeBoundary(base, override);
}
