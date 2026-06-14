import { describe, expect, it } from 'vitest';
import { DefaultInjectionRenderer } from '../src/core/renderer';
import type { DetectionResult, KnowledgeBoundaryConfig } from '../src/core/types';

const renderer = new DefaultInjectionRenderer();

const config: KnowledgeBoundaryConfig = {
  setting: '东汉末年',
  presentMoment: '建安五年',
  deny: [{ topic: '赤壁之战', reason: '尚未发生' }],
  allow: [{ topic: '战棋规则' }],
};

describe('renderBoundary', () => {
  it('renders setting, present moment, deny and allow inside the boundary tag', () => {
    const out = renderer.renderBoundary(config)!;
    expect(out.startsWith('<knowledge_boundary>')).toBe(true);
    expect(out).toContain('你生活在东汉末年。');
    expect(out).toContain('建安五年');
    expect(out).toContain('赤壁之战（尚未发生）');
    expect(out).toContain('战棋规则');
  });

  it('returns null when there is no setting', () => {
    expect(renderer.renderBoundary({ setting: '   ' })).toBeNull();
  });

  it('honours a custom boundary tag', () => {
    const custom = new DefaultInjectionRenderer({ boundaryTag: 'world' });
    expect(custom.renderBoundary({ setting: '东汉末年' })!).toContain('<world>');
  });
});

describe('renderAlert', () => {
  it('returns null when there are no detected items', () => {
    expect(renderer.renderAlert({ items: [] }, config)).toBeNull();
  });

  it('renders one item element per detection', () => {
    const result: DetectionResult = {
      items: [{ value: '手机', reason: '现代通讯' }],
    };
    const out = renderer.renderAlert(result, config)!;
    expect(out).toContain('<knowledge_alert ');
    expect(out).toContain('<item value="手机" reason="现代通讯" />');
  });

  it('escapes XML-significant characters in attributes', () => {
    const result: DetectionResult = {
      items: [{ value: 'A&B<C>"D"', reason: 'x' }],
    };
    const out = renderer.renderAlert(result, config)!;
    expect(out).toContain('value="A&amp;B&lt;C&gt;&quot;D&quot;"');
  });

  it('keeps the flat form when input items carry no predicted origin', () => {
    const result: DetectionResult = {
      items: [{ value: '武则天', reason: '唐代人物', origin: 'input' }],
    };
    const out = renderer.renderAlert(result, config)!;
    expect(out).toContain('<knowledge_alert description=');
    expect(out).not.toContain('<answer ');
    expect(out).toContain('<item value="武则天" reason="唐代人物" />');
  });

  it('groups input and predicted items into <input>/<answer> sub-sections', () => {
    const result: DetectionResult = {
      items: [
        { value: '武则天', reason: '唐代人物' },
        { value: '邓艾', reason: '三国后期', origin: 'predicted' },
      ],
    };
    const out = renderer.renderAlert(result, config)!;
    expect(out.startsWith('<knowledge_alert>')).toBe(true);
    expect(out).toContain('<input description=');
    expect(out).toContain('<answer description=');
    expect(out).toMatch(/<input[\s\S]*武则天[\s\S]*<\/input>/);
    expect(out).toMatch(/<answer[\s\S]*邓艾[\s\S]*<\/answer>/);
  });

  it('emits only the <answer> section when there are no input items', () => {
    const result: DetectionResult = {
      items: [{ value: '邓艾', reason: '三国后期', origin: 'predicted' }],
    };
    const out = renderer.renderAlert(result, config)!;
    expect(out).toContain('<answer description=');
    expect(out).not.toContain('<input ');
  });

  it('honours custom answer description and sub-tags', () => {
    const custom = new DefaultInjectionRenderer({
      answerDescription: '别说出来',
      inputTag: 'seen',
      answerTag: 'said',
    });
    const result: DetectionResult = {
      items: [
        { value: '武则天', reason: 'x' },
        { value: '邓艾', reason: 'y', origin: 'predicted' },
      ],
    };
    const out = custom.renderAlert(result, config)!;
    expect(out).toContain('<seen description=');
    expect(out).toContain('<said description="别说出来">');
  });
});
