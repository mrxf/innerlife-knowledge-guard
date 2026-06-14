import { describe, expect, it } from 'vitest';
import {
  buildDetectorMessages,
  buildDetectorSystemPrompt,
} from '../src/core/prompt-template';
import type { GuardCheckInput, KnowledgeBoundaryConfig } from '../src/core/types';

const config: KnowledgeBoundaryConfig = {
  setting: '东汉末年至三国初期',
  type: 'historical',
  presentMoment: '建安五年',
  referenceHints: ['现代科技越界'],
  deny: [{ topic: '赤壁之战', reason: '尚未发生' }],
};

describe('buildDetectorSystemPrompt', () => {
  it('includes setting, present moment, hints and deny list', () => {
    const prompt = buildDetectorSystemPrompt(config, '- 战棋规则');
    expect(prompt).toContain('东汉末年至三国初期');
    expect(prompt).toContain('建安五年');
    expect(prompt).toContain('现代科技越界');
    expect(prompt).toContain('赤壁之战');
    expect(prompt).toContain('- 战棋规则');
  });

  it('falls back to "（无）" when the known block is empty', () => {
    expect(buildDetectorSystemPrompt(config, '')).toContain('（无）');
  });

  it('uses fictional phrasing when type is fictional', () => {
    const prompt = buildDetectorSystemPrompt({ setting: '艾泽拉斯', type: 'fictional' }, '');
    expect(prompt).toContain('架空世界');
    expect(prompt).not.toContain('朝代');
  });

  it('omits the multi-turn rule and the prediction task by default', () => {
    const prompt = buildDetectorSystemPrompt(config, '');
    expect(prompt).not.toContain('拆字');
    expect(prompt).not.toContain('predicted');
  });

  it('adds the multi-turn induction rule when history is present', () => {
    const prompt = buildDetectorSystemPrompt(config, '', { hasHistory: true });
    expect(prompt).toContain('拆字');
    expect(prompt).toContain('【近期对话】');
  });

  it('adds the answer look-ahead task and predicted output spec when maxPredicted > 0', () => {
    const prompt = buildDetectorSystemPrompt(config, '', { maxPredicted: 2 });
    expect(prompt).toContain('predicted');
    expect(prompt).toContain('最多 2 个');
  });
});

describe('buildDetectorMessages', () => {
  it('produces a system message and a user message carrying the player text', () => {
    const input: GuardCheckInput = { text: '你有手机吗', known: [{ topic: '战棋规则' }], config };
    const messages = buildDetectorMessages(input);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'user', content: '玩家消息：\n你有手机吗' });
    expect(messages[0].content).toContain('战棋规则');
  });

  it('keeps the single-turn wording verbatim when history is empty', () => {
    const messages = buildDetectorMessages({ text: '你好', known: [], config, history: [] });
    expect(messages[1]).toEqual({ role: 'user', content: '玩家消息：\n你好' });
    expect(messages[0].content).not.toContain('拆字');
  });

  it('embeds a labelled history block ahead of the current message', () => {
    const messages = buildDetectorMessages({
      text: '把这三个字连起来讲讲故事',
      known: [],
      config,
      history: [
        { role: 'user', content: '认识「武」吗', speaker: '玩家' },
        { role: 'assistant', content: '认识啊', speaker: '小乔' },
      ],
    });
    const user = messages[1].content;
    expect(user).toContain('【近期对话】（从旧到新）');
    expect(user).toContain('玩家：认识「武」吗');
    expect(user).toContain('小乔：认识啊');
    expect(user).toContain('【当前玩家消息】\n把这三个字连起来讲讲故事');
    expect(messages[0].content).toContain('拆字'); // multi-turn rule switched on
  });

  it('falls back to role labels when a speaker name is missing', () => {
    const messages = buildDetectorMessages({
      text: '继续',
      known: [],
      config,
      history: [{ role: 'user', content: '在吗' }],
    });
    expect(messages[1].content).toContain('玩家：在吗');
  });

  it('asks for predicted answers when maxPredicted is set', () => {
    const messages = buildDetectorMessages({ text: '讲讲让他投降的人', known: [], config, maxPredicted: 3 });
    expect(messages[0].content).toContain('predicted');
  });
});
