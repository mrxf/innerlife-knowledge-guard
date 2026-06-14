import { describe, expect, it } from 'vitest';
import {
  parseBoundaryConfig,
  parseBoundaryOverride,
  parseProfiles,
} from '../src/config/schema';

describe('parseBoundaryConfig', () => {
  it('accepts the full object form', () => {
    const out = parseBoundaryConfig({
      setting: '东汉末年',
      type: 'historical',
      allow: [{ topic: '战棋规则', note: '游戏机制' }],
      deny: [{ topic: '赤壁之战', reason: '尚未发生' }],
    });
    expect(out.allow).toEqual([{ topic: '战棋规则', note: '游戏机制' }]);
    expect(out.deny).toEqual([{ topic: '赤壁之战', reason: '尚未发生' }]);
  });

  it('normalises string shorthand for allow / deny', () => {
    const out = parseBoundaryConfig({ setting: '东汉末年', allow: ['战棋规则'], deny: ['火药'] });
    expect(out.allow).toEqual([{ topic: '战棋规则' }]);
    expect(out.deny).toEqual([{ topic: '火药' }]);
  });

  it('rejects a missing setting', () => {
    expect(() => parseBoundaryConfig({ type: 'historical' })).toThrow();
  });

  it('rejects an invalid world type', () => {
    expect(() => parseBoundaryConfig({ setting: 'x', type: 'sci-fi' })).toThrow();
  });
});

describe('parseBoundaryOverride', () => {
  it('allows a fully partial object', () => {
    expect(parseBoundaryOverride({ allow: ['飞剑'] })).toEqual({ allow: [{ topic: '飞剑' }] });
    expect(parseBoundaryOverride({})).toEqual({});
  });
});

describe('parseProfiles', () => {
  it('parses a named-profiles document', () => {
    const out = parseProfiles({
      profiles: { sanguo: { setting: '东汉末年' } },
      defaultProfile: 'sanguo',
    });
    expect(out.defaultProfile).toBe('sanguo');
    expect(out.profiles.sanguo.setting).toBe('东汉末年');
  });
});
