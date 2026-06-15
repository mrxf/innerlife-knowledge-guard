# Dynamic Blocked Items 设计文档

## 目标

`dynamic blocked items` 为知识守卫提供“本轮相关禁忌候选”能力。调用方可以按当前对话检索出一小批 NPC 可能不该知道、不该预知或不该使用最终形态的内容，传给 detector 辅助判断。

它解决的问题不是“全局知识边界”，而是细粒度时间线、人物状态、剧情阶段等高密度负向资料的按需注入。

## API

核心检测输入支持 `blocked`：

```ts
guard.check({
  text,
  known,
  blocked: [
    {
      topic: '官渡之战',
      time: '公元200年',
      reason: '当前剧本时点尚未发生',
      guidance: '不能知道战役结果，也不能说曹操已因此统一北方',
    },
  ],
  config,
});
```

`installKnowledgeGuard` 支持 `gatherBlocked`：

```ts
installKnowledgeGuard(agent, {
  config,
  gatherBlocked: async (ctx) => timelineRetriever.retrieve(ctx),
  maxBlockedItems: 5,
});
```

## 与 deny / known 的关系

- `config.deny` 是静态禁忌，属于全局边界，常驻 detector prompt 和静态边界提示。
- `blocked` 是动态候选，只在本轮 detector prompt 中出现，不直接进入主回答 prompt。
- `known` 是已知豁免，表示 NPC 已被允许知道或已经通过 worldbook / memory 召回知道的内容。
- `blocked` 与 `known` 同时出现时，detector 必须结合当前消息、近期对话与已知豁免判断是否真的越界。

## Detector 行为

`blocked` 不是强制命中项。调用方的关键词召回可能误召回，所以 detector 只把它们当候选参考：

- 玩家确实触及候选内容时，输出到 `items`。
- NPC 回答时可能主动说出候选内容时，输出到 `predicted`。
- 候选与当前意图无关时，不输出。

输出后的 item 才会由 renderer 渲染为 `<knowledge_alert>` 进入主回答 prompt。

## 设计边界

本包不负责检索，也不读取 worldbook、memory、DB 或业务 YAML。调用方负责把相关候选整理成 `BlockedItem[]`。这样 guard 保持框架无关、低耦合，也能复用于历史、架空、游戏剧情等不同世界观。

## 推荐使用方式

在业务侧维护一套“负向 guardbook”，例如时间线事件、人物状态、剧情未解锁秘密等。每轮只按关键词召回少量候选传给 `gatherBlocked`，避免把完整负向资料库塞给 detector。

这与 worldbook 的正向知识召回互补：

- worldbook 描述 NPC 可以知道什么。
- dynamic blocked items 描述当前对话可能触及但 NPC 不应预知什么。
