import { describe, expect, it } from 'vitest';
import { DetectionParseError, parseDetection } from '../src/core/detector';

describe('parseDetection', () => {
  it('parses a clean items array', () => {
    const out = parseDetection('{"items":[{"value":"手机","reason":"现代通讯"}]}');
    expect(out.items).toEqual([{ value: '手机', reason: '现代通讯' }]);
  });

  it('treats an empty array as no detections', () => {
    expect(parseDetection('{"items":[]}').items).toEqual([]);
  });

  it('tolerates code fences and surrounding prose', () => {
    const raw = 'Sure!\n```json\n{"items":[{"value":"飞机","reason":"x"}]}\n```\nDone.';
    expect(parseDetection(raw).items).toEqual([{ value: '飞机', reason: 'x' }]);
  });

  it('drops entries without a value and defaults a missing reason', () => {
    const out = parseDetection('{"items":[{"reason":"no value"},{"value":"雷达"}]}');
    expect(out.items).toEqual([{ value: '雷达', reason: '' }]);
  });

  it('throws when no JSON object is present', () => {
    expect(() => parseDetection('absolutely not json')).toThrow(DetectionParseError);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseDetection('{"items": [unquoted]}')).toThrow(DetectionParseError);
  });

  it('exposes the raw payload on the error', () => {
    try {
      parseDetection('nope');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DetectionParseError);
      expect((err as DetectionParseError).raw).toBe('nope');
    }
  });

  it('ignores the predicted array when maxPredicted is 0 / omitted', () => {
    const raw = '{"items":[{"value":"手机","reason":"x"}],"predicted":[{"value":"邓艾","reason":"y"}]}';
    expect(parseDetection(raw).items).toEqual([{ value: '手机', reason: 'x' }]);
  });

  it('appends predicted items tagged with origin when maxPredicted > 0', () => {
    const raw = '{"items":[{"value":"手机","reason":"x"}],"predicted":[{"value":"邓艾","reason":"三国后期"}]}';
    const out = parseDetection(raw, { maxPredicted: 3 });
    expect(out.items).toEqual([
      { value: '手机', reason: 'x' },
      { value: '邓艾', reason: '三国后期', origin: 'predicted' },
    ]);
  });

  it('caps predicted items at maxPredicted', () => {
    const raw =
      '{"items":[],"predicted":[{"value":"a","reason":"1"},{"value":"b","reason":"2"},{"value":"c","reason":"3"}]}';
    const out = parseDetection(raw, { maxPredicted: 2 });
    expect(out.items.map((i) => i.value)).toEqual(['a', 'b']);
    expect(out.items.every((i) => i.origin === 'predicted')).toBe(true);
  });

  it('tolerates a missing predicted array when look-ahead is on', () => {
    const out = parseDetection('{"items":[{"value":"飞机","reason":"x"}]}', { maxPredicted: 3 });
    expect(out.items).toEqual([{ value: '飞机', reason: 'x' }]);
  });
});
