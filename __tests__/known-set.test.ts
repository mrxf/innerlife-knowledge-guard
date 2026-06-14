import { describe, expect, it } from 'vitest';
import {
  allowToKnown,
  capKnown,
  dedupeKnown,
  mergeKnown,
  normaliseKnown,
  renderKnownForPrompt,
} from '../src/core/known-set';
import type { KnownItem } from '../src/core/types';

describe('mergeKnown', () => {
  it('flattens lists preserving order', () => {
    const a: KnownItem[] = [{ topic: 'a' }];
    const b: KnownItem[] = [{ topic: 'b' }, { topic: 'c' }];
    expect(mergeKnown(a, b).map((k) => k.topic)).toEqual(['a', 'b', 'c']);
  });
});

describe('dedupeKnown', () => {
  it('drops case-insensitive duplicates, keeping the first', () => {
    const out = dedupeKnown([{ topic: '战棋' }, { topic: '战棋' }]);
    expect(out).toHaveLength(1);
  });

  it('back-fills a missing note from a later duplicate', () => {
    const out = dedupeKnown([{ topic: '手机' }, { topic: '手机', note: '远距传声' }]);
    expect(out).toEqual([{ topic: '手机', note: '远距传声' }]);
  });

  it('ignores blank topics', () => {
    expect(dedupeKnown([{ topic: '   ' }, { topic: '' }])).toEqual([]);
  });
});

describe('capKnown', () => {
  const items: KnownItem[] = [{ topic: 'a' }, { topic: 'b' }, { topic: 'c' }];

  it('keeps the first N items', () => {
    expect(capKnown(items, 2).map((k) => k.topic)).toEqual(['a', 'b']);
  });

  it('returns the list unchanged when max is missing or non-positive', () => {
    expect(capKnown(items)).toBe(items);
    expect(capKnown(items, 0)).toBe(items);
  });
});

describe('allowToKnown', () => {
  it('tags items with the allow source and carries notes', () => {
    expect(allowToKnown([{ topic: '战棋规则', note: '游戏机制' }])).toEqual([
      { topic: '战棋规则', note: '游戏机制', source: 'allow' },
    ]);
  });

  it('returns an empty list for undefined input', () => {
    expect(allowToKnown(undefined)).toEqual([]);
  });
});

describe('normaliseKnown', () => {
  it('merges, dedupes, then caps', () => {
    const out = normaliseKnown([[{ topic: 'a' }, { topic: 'a' }], [{ topic: 'b' }, { topic: 'c' }]], 2);
    expect(out.map((k) => k.topic)).toEqual(['a', 'b']);
  });
});

describe('renderKnownForPrompt', () => {
  it('renders a bullet list with parenthetical notes', () => {
    const text = renderKnownForPrompt([{ topic: '战棋规则', note: '游戏机制' }, { topic: '弓箭' }]);
    expect(text).toBe('- 战棋规则（游戏机制）\n- 弓箭');
  });

  it('returns an empty string for an empty set', () => {
    expect(renderKnownForPrompt([])).toBe('');
  });
});
