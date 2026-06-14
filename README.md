# @innerlife/knowledge-guard

为基于 [`@innerlife/agent`](https://example.invalid) 构建的 NPC 提供**可配置的「知识边界守卫」**：把「NPC 被允许知道 / 能理解什么」从散落在 prompt 里的硬编码，抽象成**可声明的边界配置 + 一个只消费传入 context 的运行时守卫**，与具体世界（三国 / 修仙 / 任意架空）解耦。

## 核心思想

每个 NPC 有一条由**世界设定**定义的「认知地平线」，线外默认不可知；在默认拒绝之上叠加：

- **特许白名单（allow）**：本该出界但允许知道的（如三国战棋游戏里的战棋规则）。
- **显式禁忌（deny）**：本在界内但必须不知道的（如尚未发生的赤壁之战）。

守卫分两层，可分别开关：

- **静态声明层**：把世界设定 / 禁忌 / 白名单渲染进 system prompt（常驻认知框架）。
- **动态守卫层**：用一个独立的廉价 LLM 扫描输入、标注越界项、在玩家消息后高信任注入。

「免标记集合」是**动态**的——`allow + 召回的 worldbook + 召回的记忆 + 自定义来源`，由**调用方**组装后传入。守卫本身不读 worldbook / memory / DB。因此「教过秦始皇手机，下次他就懂了」自然成立。

## 安装

```bash
npm i @innerlife/knowledge-guard
# peer: npm i @innerlife/agent
```

## 快速开始

```ts
import { installKnowledgeGuard } from '@innerlife/knowledge-guard';

const handle = installKnowledgeGuard(agent, {
  config: {
    setting: '东汉末年至三国初期（约 180-220 年），江东',
    type: 'historical',
    presentMoment: '建安五年（200 年）',
    referenceHints: ['现代科技 / 外语 / 网络用语 均视为越界'],
    allow: [{ topic: '战棋规则', note: '本作是三国战棋游戏，玩法概念可知' }],
    deny: [{ topic: '赤壁之战', reason: '尚未发生' }],
  },
  // 检测用 LLM：传入已构造的 provider 实例（推荐），或传 providerConfig 由包内构造
  provider: myDetectorProvider,
  // 可选：自动把召回的 worldbook / memory 作为「已知」喂入（默认全关）
  include: { worldbook: true },
});

// 卸载
handle.uninstall();
```

## 纯核心（框架无关）

`core` 层零框架依赖，可独立单测：

```ts
import { KnowledgeGuard } from '@innerlife/knowledge-guard';

const guard = new KnowledgeGuard({ client: myLLMClient });
const result = await guard.check({
  text: '你用过小米手机吗？',
  known: [{ topic: '战棋规则', source: 'allow' }],
  config,
});
// => { items: [{ value: '小米手机', reason: '现代科技产品，东汉末年不存在' }] }
```

## 设计文档

见 `docs/feature/`。
