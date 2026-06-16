import { describe, expect, it } from 'vitest';
import {
  capBlocked,
  dedupeBlocked,
  normaliseBlocked,
  renderBlockedForPrompt,
} from '../src/core/blocked-set';
import type { BlockedItem } from '../src/core/types';

describe('dedupeBlocked', () => {
  it('drops duplicate topics and trims kept topics', () => {
    const out = dedupeBlocked([{ topic: ' 赤壁之战 ' }, { topic: '赤壁之战' }]);
    expect(out).toEqual([{ topic: '赤壁之战' }]);
  });

  it('ignores blank topics', () => {
    expect(dedupeBlocked([{ topic: ' ' }, { topic: '' }])).toEqual([]);
  });
});

describe('capBlocked', () => {
  const items: BlockedItem[] = [{ topic: 'a' }, { topic: 'b' }, { topic: 'c' }];

  it('keeps the first N items', () => {
    expect(capBlocked(items, 2).map((item) => item.topic)).toEqual(['a', 'b']);
  });

  it('returns unchanged for missing or non-positive max', () => {
    expect(capBlocked(items)).toBe(items);
    expect(capBlocked(items, 0)).toBe(items);
  });
});

describe('normaliseBlocked', () => {
  it('flattens, dedupes, and caps dynamic candidates', () => {
    const out = normaliseBlocked([[{ topic: 'a' }, { topic: 'a' }], [{ topic: 'b' }]], 2);
    expect(out.map((item) => item.topic)).toEqual(['a', 'b']);
  });
});

describe('renderBlockedForPrompt', () => {
  it('renders candidates with time, reason, and guidance', () => {
    const text = renderBlockedForPrompt([
      {
        topic: '官渡之战',
        time: '公元200年',
        reason: '当前尚未发生',
        guidance: '不能说曹操已统一北方',
      },
    ]);

    expect(text).toBe('- 官渡之战（公元200年；当前尚未发生；不能说曹操已统一北方）');
  });

  it('returns an empty string for no candidates', () => {
    expect(renderBlockedForPrompt([])).toBe('');
  });
});
