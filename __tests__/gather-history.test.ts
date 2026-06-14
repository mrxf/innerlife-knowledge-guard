import { describe, expect, it } from 'vitest';
import type { Agent, HookContext } from '@innerlife/agent';
import { gatherHistoryFromContext } from '../src/integration/gather-history';

/** Minimal newest-first dialogue entry (only fields the mapper reads). */
interface FakeEntry {
  role: 'incoming' | 'outgoing';
  content: string;
  sourceName?: string;
}

interface FakeAgentHandle {
  agent: Agent;
  queries: Array<{ scopeId?: string; limit?: number }>;
}

function fakeAgent(entries: FakeEntry[] | null): FakeAgentHandle {
  const queries: FakeAgentHandle['queries'] = [];
  const dialogueHistory =
    entries === null
      ? undefined
      : {
          store: {
            async query(q: { scopeId?: string; limit?: number }) {
              queries.push(q);
              return entries;
            },
          },
        };
  return { agent: { dialogueHistory } as unknown as Agent, queries };
}

const ctx = {
  agentContext: { conversationScope: { id: 'peer:player-1' } },
} as unknown as HookContext;

describe('gatherHistoryFromContext', () => {
  it('maps incoming/outgoing → user/assistant and reverses to chronological order', async () => {
    // store yields newest-first
    const { agent } = fakeAgent([
      { role: 'incoming', content: '认识「天」吗', sourceName: '玩家' },
      { role: 'outgoing', content: '认识啊，武', sourceName: '小乔' },
      { role: 'incoming', content: '认识「武」吗', sourceName: '玩家' },
    ]);

    const turns = await gatherHistoryFromContext(ctx, { agent, turns: 3 });

    expect(turns).toEqual([
      { role: 'user', content: '认识「武」吗', speaker: '玩家' },
      { role: 'assistant', content: '认识啊，武', speaker: '小乔' },
      { role: 'user', content: '认识「天」吗', speaker: '玩家' },
    ]);
  });

  it('queries with the turn scope and a limit of turns × 2', async () => {
    const { agent, queries } = fakeAgent([]);
    await gatherHistoryFromContext(ctx, { agent, turns: 3 });
    expect(queries[0]).toEqual({ scopeId: 'peer:player-1', limit: 6 });
  });

  it('returns [] when turns <= 0', async () => {
    const { agent, queries } = fakeAgent([{ role: 'incoming', content: 'x' }]);
    expect(await gatherHistoryFromContext(ctx, { agent, turns: 0 })).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it('returns [] when the agent has no dialogueHistory', async () => {
    const { agent } = fakeAgent(null);
    expect(await gatherHistoryFromContext(ctx, { agent, turns: 3 })).toEqual([]);
  });

  it('returns [] when the store is empty', async () => {
    const { agent } = fakeAgent([]);
    expect(await gatherHistoryFromContext(ctx, { agent, turns: 3 })).toEqual([]);
  });

  it('clips each message to maxChars', async () => {
    const { agent } = fakeAgent([{ role: 'incoming', content: 'a'.repeat(50), sourceName: '玩家' }]);
    const [turn] = await gatherHistoryFromContext(ctx, { agent, turns: 1, maxChars: 10 });
    expect(turn.content).toBe(`${'a'.repeat(10)}…`);
  });

  it('omits speaker when the entry has no sourceName', async () => {
    const { agent } = fakeAgent([{ role: 'incoming', content: '在吗' }]);
    const [turn] = await gatherHistoryFromContext(ctx, { agent, turns: 1 });
    expect(turn).toEqual({ role: 'user', content: '在吗' });
  });

  it('uses the gatherHistory override and never touches dialogueHistory', async () => {
    const { agent, queries } = fakeAgent([{ role: 'incoming', content: 'ignored' }]);
    const turns = await gatherHistoryFromContext(ctx, {
      agent,
      turns: 3,
      gatherHistory: () => [{ role: 'user', content: '自定义历史' }],
    });
    expect(turns).toEqual([{ role: 'user', content: '自定义历史' }]);
    expect(queries).toHaveLength(0);
  });
});
