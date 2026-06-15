import { describe, expect, it } from 'vitest';
import { installKnowledgeGuard } from '../src/integration/install';
import type { HookContext } from '@innerlife/agent';
import type { ChatMessage, LLMProvider } from '@innerlife/agent';

function createAgent() {
  const hooks: Array<any> = [];
  const userSlots: Array<any> = [];
  const slots: Array<any> = [];

  return {
    id: 'xiaoqiao',
    provider: {} as LLMProvider,
    eventBus: { emit() {} },
    hooks: {
      register: (hook: any) => hooks.push(hook),
      unregister: () => {},
    },
    composer: {
      registerSlot: (slot: any) => slots.push(slot),
      unregisterSlot: () => {},
      registerUserSlot: (slot: any) => userSlots.push(slot),
      unregisterUserSlot: () => {},
    },
    __hooks: hooks,
    __userSlots: userSlots,
    __slots: slots,
  } as any;
}

describe('installKnowledgeGuard', () => {
  it('stores detection on hook metadata so dynamic alert slots can render it', async () => {
    const agent = createAgent();
    const provider = {
      async chat(messages: ChatMessage[]) {
        expect(messages[1].content).toContain('手机');
        return { data: '{"items":[{"value":"手机","reason":"现代物件"}]}', usage: { promptTokens: 1, completionTokens: 1 } };
      },
    } as LLMProvider;

    installKnowledgeGuard(agent, {
      config: { setting: '东汉末年', type: 'historical' },
      provider,
    });

    const ctx = {
      event: { text: '你有手机吗' },
      agentContext: { agentId: 'xiaoqiao', turnId: 't1', metadata: {} },
      metadata: {},
    } as HookContext;

    await agent.__hooks[0].execute(ctx);

    expect(ctx.metadata.knowledgeGuardDetection).toEqual({
      items: [{ value: '手机', reason: '现代物件' }],
    });
    expect(ctx.agentContext.metadata.knowledgeGuardDetection).toBeUndefined();

    const alert = agent.__userSlots[0].fragment({ metadata: ctx.metadata });
    expect(alert).toContain('手机');
    expect(alert).toContain('现代物件');
  });
});
