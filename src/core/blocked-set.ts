import type { BlockedItem } from './types';

const normaliseTopic = (topic: string): string => topic.trim().toLowerCase();

/** De-duplicate dynamic blocked candidates by topic, preserving first-match order. */
export function dedupeBlocked(items: BlockedItem[]): BlockedItem[] {
  const byTopic = new Map<string, BlockedItem>();
  for (const item of items) {
    const key = normaliseTopic(item.topic);
    if (!key || byTopic.has(key)) continue;
    byTopic.set(key, { ...item, topic: item.topic.trim() });
  }
  return [...byTopic.values()];
}

/** Cap the list length, keeping caller-provided relevance order. `max <= 0` means unchanged. */
export function capBlocked(items: BlockedItem[], max?: number): BlockedItem[] {
  if (!max || max <= 0 || items.length <= max) return items;
  return items.slice(0, max);
}

/** Convenience pipeline for caller-provided dynamic blocked candidates. */
export function normaliseBlocked(lists: BlockedItem[][], max?: number): BlockedItem[] {
  return capBlocked(dedupeBlocked(lists.flat()), max);
}

/** Render dynamic blocked candidates for the detector prompt. */
export function renderBlockedForPrompt(items: BlockedItem[]): string {
  if (items.length === 0) return '';

  return items
    .map((item) => {
      const details = [item.time, item.reason, item.guidance].filter(Boolean).join('；');
      return `- ${item.topic}${details ? `（${details}）` : ''}`;
    })
    .join('\n');
}
