import { describe, expect, it } from 'vitest';
import { mergeBoundary, resolveProfile } from '../src/config/profile';
import type { KnowledgeBoundaryConfig } from '../src/core/types';
import type { KnowledgeGuardProfiles } from '../src/config/schema';

const base: KnowledgeBoundaryConfig = {
  setting: '东汉末年',
  type: 'historical',
  presentMoment: '建安五年',
  referenceHints: ['现代科技越界'],
  allow: [{ topic: '战棋规则', note: 'base note' }],
  deny: [{ topic: '赤壁之战' }],
};

describe('mergeBoundary', () => {
  it('returns a defensive clone when no override is given', () => {
    const out = mergeBoundary(base);
    expect(out).toEqual(base);
    expect(out.allow).not.toBe(base.allow);
  });

  it('overwrites scalars from the override', () => {
    const out = mergeBoundary(base, { setting: '架空大陆', type: 'fictional', presentMoment: '第三纪元' });
    expect(out.setting).toBe('架空大陆');
    expect(out.type).toBe('fictional');
    expect(out.presentMoment).toBe('第三纪元');
  });

  it('merges & dedupes arrays, with override notes winning', () => {
    const out = mergeBoundary(base, {
      allow: [{ topic: '战棋规则', note: 'override note' }, { topic: '军令' }],
      referenceHints: ['现代科技越界', '外语越界'],
    });
    expect(out.allow).toEqual([
      { topic: '战棋规则', note: 'override note' },
      { topic: '军令' },
    ]);
    expect(out.referenceHints).toEqual(['现代科技越界', '外语越界']);
  });

  it('keeps base arrays when the override omits them', () => {
    const out = mergeBoundary(base, { setting: 'x' });
    expect(out.deny).toEqual([{ topic: '赤壁之战' }]);
  });
});

describe('resolveProfile', () => {
  const registry: KnowledgeGuardProfiles = {
    profiles: { sanguo: base, xiuxian: { setting: '修仙界', type: 'fictional' } },
    defaultProfile: 'sanguo',
  };

  it('resolves a named profile with override applied', () => {
    const out = resolveProfile(registry, 'xiuxian', { allow: [{ topic: '飞剑' }] });
    expect(out.setting).toBe('修仙界');
    expect(out.allow).toEqual([{ topic: '飞剑' }]);
  });

  it('falls back to the default profile', () => {
    expect(resolveProfile(registry).setting).toBe('东汉末年');
  });

  it('throws on an unknown profile', () => {
    expect(() => resolveProfile(registry, 'nope')).toThrow(/unknown profile/);
  });

  it('throws when no name and no default', () => {
    expect(() => resolveProfile({ profiles: { a: base } })).toThrow(/no profile name/);
  });
});
