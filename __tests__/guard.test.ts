import { describe, expect, it, vi } from 'vitest';
import { KnowledgeGuard } from '../src/core/guard';
import type { ChatMessage, KnowledgeBoundaryConfig, LLMClient } from '../src/core/types';

const config: KnowledgeBoundaryConfig = { setting: '东汉末年', type: 'historical' };

function fakeClient(reply: string): LLMClient & { messages: ChatMessage[][] } {
  const messages: ChatMessage[][] = [];
  return {
    messages,
    async chat(msgs) {
      messages.push(msgs);
      return reply;
    },
  };
}

describe('KnowledgeGuard.check', () => {
  it('returns the parsed detection result', async () => {
    const client = fakeClient('{"items":[{"value":"手机","reason":"现代通讯"}]}');
    const guard = new KnowledgeGuard({ client });

    const result = await guard.check({ text: '你有手机吗', known: [], config });

    expect(result.items).toEqual([{ value: '手机', reason: '现代通讯' }]);
  });

  it('feeds the player text and known set into the detector messages', async () => {
    const client = fakeClient('{"items":[]}');
    const guard = new KnowledgeGuard({ client });

    await guard.check({ text: '聊聊战棋', known: [{ topic: '战棋规则' }], config });

    const [system, user] = client.messages[0];
    expect(system.content).toContain('战棋规则');
    expect(user.content).toContain('聊聊战棋');
  });

  it('passes chat options through to the client', async () => {
    const chat = vi.fn(async () => '{"items":[]}');
    const guard = new KnowledgeGuard({ client: { chat }, chatOptions: { temperature: 0.4, maxTokens: 128 } });

    await guard.check({ text: 'hi', known: [], config });

    expect(chat).toHaveBeenCalledWith(expect.any(Array), { temperature: 0.4, maxTokens: 128 });
  });

  it('propagates parse errors (caller decides fail-open)', async () => {
    const guard = new KnowledgeGuard({ client: fakeClient('not json') });
    await expect(guard.check({ text: 'x', known: [], config })).rejects.toThrow();
  });

  it('threads recent history into the detector messages', async () => {
    const client = fakeClient('{"items":[]}');
    const guard = new KnowledgeGuard({ client });

    await guard.check({
      text: '把这三个字连起来讲故事',
      known: [],
      config,
      history: [{ role: 'user', content: '认识「武」吗', speaker: '玩家' }],
    });

    const [, user] = client.messages[0];
    expect(user.content).toContain('【近期对话】');
    expect(user.content).toContain('玩家：认识「武」吗');
  });

  it('parses predicted answers (origin tagged) when maxPredicted is set', async () => {
    const client = fakeClient('{"items":[],"predicted":[{"value":"邓艾","reason":"三国后期"}]}');
    const guard = new KnowledgeGuard({ client });

    const result = await guard.check({ text: '讲讲让他投降的人', known: [], config, maxPredicted: 3 });

    expect(result.items).toEqual([{ value: '邓艾', reason: '三国后期', origin: 'predicted' }]);
  });
});
