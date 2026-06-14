import type { AllowItem, KnownItem } from './types';

const normaliseTopic = (topic: string): string => topic.trim().toLowerCase();

/** Flatten several known-item lists into one (order preserved). */
export function mergeKnown(...lists: KnownItem[][]): KnownItem[] {
  return lists.flat();
}

/**
 * De-duplicate by normalised topic, keeping the first occurrence and
 * back-filling a missing `note` from a later duplicate when available.
 */
export function dedupeKnown(items: KnownItem[]): KnownItem[] {
  const byTopic = new Map<string, KnownItem>();
  for (const item of items) {
    const key = normaliseTopic(item.topic);
    if (!key) continue;
    const existing = byTopic.get(key);
    if (!existing) {
      byTopic.set(key, { ...item });
    } else if (!existing.note && item.note) {
      existing.note = item.note;
    }
  }
  return [...byTopic.values()];
}

/** Cap the list length, keeping the first `max` items. `max <= 0` ⇒ unchanged. */
export function capKnown(items: KnownItem[], max?: number): KnownItem[] {
  if (!max || max <= 0 || items.length <= max) return items;
  return items.slice(0, max);
}

/** Convenience pipeline: merge → dedupe → cap. */
export function normaliseKnown(lists: KnownItem[][], max?: number): KnownItem[] {
  return capKnown(dedupeKnown(mergeKnown(...lists)), max);
}

/** Map a config whitelist into known items tagged with the `allow` source. */
export function allowToKnown(allow?: AllowItem[]): KnownItem[] {
  if (!allow) return [];
  return allow.map((item) => ({
    topic: item.topic,
    ...(item.note ? { note: item.note } : {}),
    source: 'allow' as const,
  }));
}

/** Render the known set as a bullet list for the detector prompt. */
export function renderKnownForPrompt(items: KnownItem[]): string {
  if (items.length === 0) return '';
  return items
    .map((item) => `- ${item.topic}${item.note ? `（${item.note}）` : ''}`)
    .join('\n');
}
