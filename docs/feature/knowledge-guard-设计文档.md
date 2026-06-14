# @innerlife/knowledge-guard 设计文档（NPC 知识边界守卫）

> 把「NPC 被允许知道 / 能理解什么」从散落在 prompt 里的硬编码，抽象成**可声明的边界配置 + 一个只消费传入 context 的运行时守卫**，与具体世界（三国 / 修仙 / 任意架空）解耦，供任意 innerlife Agent 业务接入。

- **状态**：✅ 代码已落地（core / config / integration / observability；单测 46 通过；ESM+CJS+d.ts 构建通过）。`sanguo-server` 接入待执行。
- **创建日期**：2026-06-14
- **目标消费方**：`sanguo-server`（首个迁移）、`xiuxian-server`（DB 驱动）及任意基于 `@innerlife/agent` 的业务
- **说明**：本文为「设计共识 + 实现蓝图」，含组件与函数的提前拆分。代码已落地，本文已随之迁移至 `@innerlife/knowledge-guard` 仓库的 `docs/feature/`。实现相较蓝图的细节差异见文末「§15 落地后记」。
- **后续增强**：检测器的「多轮上下文 + 答案预判」增量见 [`./多轮上下文与答案预判-设计文档.md`](./多轮上下文与答案预判-设计文档.md)（修复多轮拆字诱导盲区，如「武/则/天」拼出武则天；可选预判越界答案，如「邓艾」）。

---

## 1. 背景与动机

### 1.1 现状

`sanguo-server` 已实现「朝代背景限制（Anachronism Guard）」：

- `AnachronismCheckService`：用一个独立的廉价 LLM，带**硬编码**的「东汉末年至三国初期」提示词，判断玩家消息是否包含超时代内容，返回 `<anachronism_alert>` XML 或 `null`。
- `AnachronismHookService`：在 `pre-compose` hook 中执行检测，结果写入 `ctx.agentContext.metadata`；再通过 `post-user-system` 的 User Slot 把 alert 作为独立 `[system]` 消息注入到玩家消息之后，引导主 LLM 以「从未听说过」的角色口吻反应。
- 配置位于 `agent.config.ts` 的 `agent.anachronism`（可独立配置 key/url/model，默认 fallback 主 LLM）。
- 失败时静默降级，不阻塞对话。

### 1.2 问题

- **硬编码**：时代、规则、时间线全写死在提示词里，只服务三国。
- **不可复用**：换一个世界（修仙、架空）就得复制改写。
- **配置散落**：边界知识散落在 persona、constraints、检测提示词多处。

### 1.3 目标

- 提取为**通用包**，任何 innerlife Agent 业务可接入。
- 可配置：检测模型、知识范围（如朝代）、架空世界设定、不可知信息。
- 不同 NPC 可设定不同边界范围。
- 支持知识白名单（如「三国战棋游戏」里的 NPC 允许知道战棋规则）。

---

## 2. 关键调研结论（影响设计）

| 结论 | 证据 | 设计含义 |
|------|------|----------|
| `persona.knowledgeBoundary`（knows/doesNotKnow/believesButFalse）在框架里**只有 Zod schema**，运行时 `Persona` 不读、`toPromptFragment()` 不渲染 | `innerlife-agent/src/persona/PersonaSchema.ts` 有定义；`Persona.ts` 未消费 | guard **不接管**它，留作 innerlife 基础能力；guard 用自己的统一系统级配置 |
| 框架**无统一插件机制** | 扩展仅靠 `agent.hooks.register` + `agent.composer.registerSlot/registerUserSlot` + WorldBook visibility | guard 以 facade（`installKnowledgeGuard`）封装这些分散扩展点 |
| `runner.run()` 顺序执行管道，LLM 调用是靠后的 Stage 7；worldbook（Stage 2）/memory（Stage 3）在它**之前**已算好 | `Runner.ts` L294-301（loreResults）、L336-370（memoryRecall）、L601（pre-compose）、L641（pre-llm） | guard hook 放 `pre-compose`，可直接从 `HookContext` 拿到召回结果 |
| `runHooks` 构造 `HookContext` 时把 `loreResults`、`memoryRecall` 一并传入 | `Runner.ts` L958-963 | 「自动注入 worldbook/memory 到 known」在 hook 内零成本可取 |

---

## 3. 核心思想与心智模型

**一句话**：每个 NPC 有一条由**世界设定**定义的「认知地平线」，线外默认不可知；在默认拒绝之上叠加**特许白名单**（出界但允许）与**显式禁忌**（界内但禁止）。guard 是一个**只消费传入 context 的运行时守卫**——谁去读 worldbook/memory/DB、谁去拼「已知集合」，都是调用方的事。

**两个关键性质**：

1. **动态的「免标记集合」**：guard 的「不标记」依据不是静态白名单，而是每轮动态合成：
   `免标记集合 = allow 白名单 + 本轮召回的 worldbook + 本轮召回的记忆 + 调用方自定义来源`。
   由此「教过秦始皇手机，下次他就懂了」自然成立——只要那条记忆被召回并传入 known，guard 就不再标记它。
2. **双层协作**：
   - **静态声明层**：把世界设定 / 禁忌 / 白名单渲染进 system prompt（常驻的认知框架）。
   - **动态守卫层**：泛化后的检测器——廉价 LLM 扫描输入、标注越界项、高信任注入（解决「主 LLM 压不住静态约束」）。
   两层均可独立开关。

---

## 4. 职责分层

```
persona       → 人格 / 语气 / constraints（不含 knowledge 字段）
                knowledgeBoundary 留作 innerlife 基础能力，guard 不读、不管理
worldbook     → NPC「已知」lore（positive）；visibility / knowledgeScope 区分 per-NPC
guard config  → 统一系统级「认知边界」（negative space + 世界设定 + 白名单）
```

### 数据流（单轮 `runner.run()`）

```
 ...→ Stage2 worldbook(loreResults) → Stage3 memory(memoryRecall)
   → [pre-compose] guard hook:
        known  = config.allow
               + include.worldbook ? map(ctx.loreResults)   : []
               + include.memory    ? map(ctx.memoryRecall)  : []
               + gatherKnown(ctx)
        result = guard.check({ text: ctx.event.text, known, config })   // 独立 LLM，结构化 items
        → 写入 ctx.metadata
   → compose:
        [system] persona + ... + 【静态边界块】           (persona 之后的 system 槽位)
        [user]   玩家消息（TrustBoundary 包裹）
        [system] 【动态 alert】                            (post-user-system，来自 result)
   → Stage7 LLM 生成回复
 检测失败 → fail-open（跳过动态注入，静态层 + persona 兜底）+ event / trace
```

---

## 5. 配置模型

### 5.1 `KnowledgeBoundaryConfig`（统一系统级，非 persona）

```ts
interface KnowledgeBoundaryConfig {
  /** NPC 所处世界 / 时代的自然语言描述（喂给静态层 + 检测器） */
  setting: string;                  // 例：东汉末年至三国初期（约 180-220 年），江东
  type?: 'historical' | 'fictional';
  /** 历史向：当前时刻；之后一切默认未知（自动覆盖「未来事件」如赤壁） */
  presentMoment?: string;           // 例：建安五年（200 年）
  /** 可选精度提示：朝代时间线、「现代科技 / 外语 / 网络用语 均越界」等 */
  referenceHints?: string[];
  /** 特许白名单：本该出界但允许知道（如战棋规则） */
  allow?: AllowItem[];
  /** 显式禁忌：本在界内但必须不知道（如特定秘密） */
  deny?: DenyItem[];
}

interface AllowItem { topic: string; note?: string; }
interface DenyItem  { topic: string; reason?: string; }
```

> 设计取舍（Q4）：采用「统一自然语言 `setting` + 可选 `type/presentMoment/referenceHints`」而非两套强结构化 schema——对真实 / 架空都适用，配置负担小，把原硬编码的朝代时间线**降级为可选 referenceHints**。

### 5.2 命名 Profile + per-NPC Override（Q5 = C）

- 支持**多套命名 profile**（不同世界 / 时代），给每个 NPC 指派一套。
- 允许在某套之上对单个 NPC 做 **override**。
- 合并语义：**标量覆盖；`allow`/`deny` 数组合并去重**。

```ts
interface KnowledgeGuardProfiles {
  profiles: Record<string, KnowledgeBoundaryConfig>;   // 命名 profile
  defaultProfile?: string;
}
// resolveProfile(base, override) => KnowledgeBoundaryConfig
```

### 5.3 `KnownItem`（传入 guard 的「已知项」格式）

```ts
interface KnownItem {
  topic: string;     // 概念名，如「手机」
  note?: string;     // 一句话说明 / 为何已知，如「玩家上次解释过的远距传声之物」
  source?: 'allow' | 'worldbook' | 'memory' | string;   // 来源，便于分组拼接与调试
}
```

### 5.4 配置来源

- 包的**契约是 config 对象**（plain data）。来源（YAML / DB / 代码）是调用方的事。
- 包提供**可选 YAML loader** 作为 MVP 便捷；`xiuxian-server` 等 DB 项目自行从数据库装配 config 对象传入。

---

## 6. 运行机制

### 6.1 动态「免标记集合」

- `known` 由调用方按 `KnownItem[]` 格式组装后传入；guard 内部**不知道** worldbook/memory/DB 是什么。
- 便捷封装提供 `include` 开关（**默认全关**）：
  - `include.worldbook = true` → 自动把 `ctx.loreResults`（已经过 visibility 过滤）每条映射成 `KnownItem`（topic = 标题，note = 关键词 / 类别 / 摘要，source = `worldbook`）。
  - `include.memory = true` → `ctx.memoryRecall.combined` 是合并文本，作为「已知记忆上下文」整段喂给检测器（source = `memory`）。
- `gatherKnown(ctx)` 由调用方实现额外 / 自定义来源（如 DB「已学会概念」表），与 auto 合并去重。
- 可选 `maxKnownItems` 上限，防 token 膨胀。

### 6.2 检测器（动态守卫层）

- **LLM 注入（Q12 = C）**：接受 `LLMProvider` 实例（主推，复用各项目已处理的 provider 细节，如 sanguo 的 User-Agent 403 hack、xiuxian 的 logging wrapper），或接受 `{ apiKey, baseUrl, model, headers }` 由包内构造 `OpenAIProvider`（MVP 便捷糖）。检测模型独立可配，默认 fallback 主 LLM。
- **提示词模板**：由 config 驱动生成（区分 `historical` / `fictional` 措辞），注入 `setting / presentMoment / referenceHints / deny` 与「免标记集合」。
- **结构化输出（Q13）**：检测器返回 `DetectionResult`（而非原始 XML 字符串），便于测试、可观测、自定义渲染。

```ts
interface DetectedItem { value: string; reason: string; }
interface DetectionResult { items: DetectedItem[]; }   // items 为空表示无越界
```

### 6.3 注入（双层，Q13）

- **静态边界块**（`setting / presentMoment / deny / allow`）→ system 槽位（persona 之后），常驻。
- **动态 alert**（本轮越界项）→ `post-user-system`（玩家消息后的独立 `[system]`，指令遵从度高 + 隔离 prompt injection）。
- **renderer** 把 `DetectionResult` 渲染成可配置注入文本（**标签名、description 措辞可配**）；同时**暴露 renderer**，供自定义 composer（如 xiuxian）覆盖或手动放置 fragment 字符串。
- 两层均可单独开关。

### 6.4 时序与 hook 接入点

- guard hook 注册在 `pre-compose`（与现状一致）；此时 `ctx.loreResults` 与 `ctx.memoryRecall` 已就绪。**零 runner 改动**。
- **未来优化**：检测器需要 worldbook + memory，最早只能在 `post-memory` 启动、`pre-compose` await，可与 sentinel/hormone/urgency 并行以省一次串行等待。MVP 先在 `pre-compose` 串行。

### 6.5 失败降级与触发策略（Q14）

- **fail-open**：检测失败（超时 / 网络 / 格式错）→ 静默跳过动态注入，静态层 + persona 兜底；记 `warn` + 发 eventBus 事件 + 写 trace。
- **触发**：可选跳过过短 / 纯问候消息以省成本（默认每轮跑，保正确）。

---

## 7. 集成 API

### 7.1 核心纯函数（框架无关）

```ts
class KnowledgeGuard {
  constructor(deps: { provider: LLMProvider; renderer?: InjectionRenderer });
  /** 仅消费传入项；不读取任何外部源 */
  check(input: { text: string; known: KnownItem[]; config: KnowledgeBoundaryConfig }): Promise<DetectionResult>;
}
// renderAlert(result, config): string | null     // 动态层
// renderBoundary(config): string                 // 静态层
```

### 7.2 便捷封装（依赖 `@innerlife/agent`）

```ts
function installKnowledgeGuard(agent: Agent, options: InstallOptions): KnowledgeGuardHandle;

interface InstallOptions {
  config: KnowledgeBoundaryConfig;
  provider?: LLMProvider;                          // 二选一
  providerConfig?: { apiKey; baseUrl; model; headers? };
  include?: { worldbook?: boolean; memory?: boolean };   // 默认全关
  gatherKnown?: (ctx: AgentContext) => KnownItem[];
  maxKnownItems?: number;
  staticLayer?: boolean;                           // 默认 true
  dynamicLayer?: boolean;                          // 默认 true
  tag?: string;                                    // 注入标签名（可配）
  onError?: 'fail-open';                           // MVP 仅 fail-open
}

interface KnowledgeGuardHandle { uninstall(): void; }
```

- `installKnowledgeGuard` 内部：注册 `pre-compose` hook（拼 known → `guard.check` → 写 metadata）+ system 槽位（静态层）+ post-user-system 槽位（动态层）。
- `gatherKnownFromContext(ctx, include)`：默认助手，读取标准 `ctx.loreResults` / `ctx.memoryRecall`。

---

## 8. 包结构与工程约束

### 8.1 命名与位置（Q16）

- 包名：`@innerlife/knowledge-guard`
- 位置：独立 sibling 仓 `/Users/zed/Coding/innerlife-knowledge-guard`
- 接入：MVP 用 `file:` 链接（同现状 vendored innerlife-agent），稳定后发 npm。

### 8.2 目录树与组件拆分（Q17，提前拆分组件 / 函数）

```
@innerlife/knowledge-guard/
├── src/
│   ├── index.ts                  # 公共导出
│   ├── core/                     # 纯核心，零框架依赖、纯函数为主、可单测
│   │   ├── types.ts              # KnowledgeBoundaryConfig / KnownItem / DetectionResult / ...
│   │   ├── guard.ts              # KnowledgeGuard：check()
│   │   ├── detector.ts           # buildDetectorMessages() + parseDetection()
│   │   ├── prompt-template.ts    # config → detector system prompt（historical / fictional）
│   │   ├── renderer.ts           # renderAlert() / renderBoundary()
│   │   └── known-set.ts          # mergeKnown() / dedupeKnown() / capKnown()
│   ├── integration/              # 依赖 @innerlife/agent
│   │   ├── install.ts            # installKnowledgeGuard()
│   │   ├── gather-known.ts       # gatherKnownFromContext() / mapLore() / mapMemory()
│   │   ├── provider.ts           # resolveProvider(providerOrConfig)
│   │   └── slots.ts              # 注册 system / user 槽位的封装
│   ├── config/
│   │   ├── schema.ts             # zod schema
│   │   ├── profile.ts            # resolveProfile(base, override)
│   │   └── yaml-loader.ts        # 可选 YAML loader（MVP）
│   └── observability/
│       └── events.ts             # 事件名常量 + trace 辅助
├── docs/feature/                 # ← 本设计文档迁移目的地
├── __tests__/
├── package.json                  # peerDep @innerlife/agent；tsup 构建
├── tsconfig.json
└── README.md
```

### 8.3 代码质量原则（用户强约束）

- **低耦合高内聚**：`core` 零框架依赖、纯函数优先；框架相关全部收口到 `integration`；config 来源（YAML/DB）不进核心。
- **可读、可测**：纯核心 `check()` / `renderer` / `resolveProfile` 易单测；副作用集中在 `install`。
- **提前拆分**：按上表把组件与函数拆好，单一职责，避免巨型函数。
- 构建 `tsup`（对齐 innerlife-agent），ESM + CJS + d.ts 导出。

---

## 9. 与框架既有能力的边界（Q3 / Q15）

| 能力 | 关注点 | 与 guard 关系 |
|------|--------|----------------|
| `persona.knowledgeBoundary` | 角色静态知识声明 | innerlife 基础能力，**guard 不读不管理**（解耦） |
| WorldBook（visibility/knowledgeScope） | NPC「已知」lore（positive） | guard 只**消费** visibility 过滤后的 `loreResults` 作为 known，不泄密 |
| SecretSentinel | 「我知道但不能说」（泄密边界） | 与 guard **完全正交、无耦合**；guard = 「界外事物我不理解」（认知边界） |

---

## 10. MVP 范围

- **做**：
  - `core`：types / `check()` / renderer / 静态边界渲染（零框架依赖）+ 单测。
  - `integration`：`installKnowledgeGuard`（pre-compose hook + system 槽 + post-user-system 槽）、`gatherKnownFromContext`、`include` 开关（默认关）、provider 实例或配置、fail-open + event/trace、`maxKnownItems`。
  - `config`：zod schema + 可选 YAML loader + profile 合并。
- **不做（往后）**：并行化（post-memory 启动 / pre-compose await）、缓存、DB 配置 loader（xiuxian）、输出侧校验（post-llm）、GM 管理面。

---

## 11. sanguo-server 迁移计划

1. `file:` 链接 `@innerlife/knowledge-guard`。
2. 新建 `data/knowledge/sanguo.yaml`：`setting` = 东汉末年至三国初期（约 180-220），江东；`type` = historical；`presentMoment` = 建安年间；`referenceHints` = 朝代时间线 + 「现代科技 / 外语 / 网络用语 越界」。
3. `AnachronismCheckService` → guard core 检测器；`AnachronismHookService` → `installKnowledgeGuard`；`agent.anachronism` env 配置 → detector provider（复用 UA hack）。
4. 保行为等价（现代事物仍触发角色困惑）；可选开启 `include.worldbook`，使召回 lore 不被误标。
5. 文档 `docs/develop/朝代背景限制系统.md` 指向新包。

---

## 12. 需求覆盖核对

| 原始需求 | 实现方式 | 状态 |
|----------|----------|------|
| 任何 innerlife Agent 业务可接入 | 独立包 + 框架无关 core + `installKnowledgeGuard` | ✓ |
| 配置模型 | detector provider / model 可配，默认 fallback 主 LLM | ✓ |
| 设定知识范围（现在朝代） | `config.setting` / `presentMoment` / `referenceHints` | ✓ |
| 设定架空世界知识 | `type = fictional` + worldbook | ✓ |
| 不可知信息 | `config.deny` + `presentMoment`（未来事件自动出界） | ✓ |
| 不同 NPC 不同范围 | 命名 profile + per-NPC override | ✓ |
| 知识白名单（战棋） | `config.allow` + worldbook auto-include | ✓ |
| （加分）动态已知集合 / 「学会」连续性 | `known` = allow + worldbook + memory + 自定义，调用方传入 | ✓ |

---

## 13. 决策记录（访谈共识）

| # | 决策 | 结论 |
|---|------|------|
| Q1 | 包形态 | 独立 npm 包，peer-dep `@innerlife/agent` |
| Q2 | 核心范式 | 双层混合（静态声明层 + 动态守卫层），可分别开关 |
| Q3 | 与框架关系 | 与 SecretSentinel 正交；`persona.knowledgeBoundary` 留作 innerlife 基础能力 |
| Q4 | 世界建模 | 统一自然语言 `setting` + 可选 `type/presentMoment/referenceHints`；并升级为**动态免标记集合**（worldbook/memory/自定义由调用方传入） |
| Q5 | 多 NPC 粒度 | C：命名 profile + per-NPC override |
| Q6 | 配置来源 | config 对象为契约；YAML for MVP；DB 友好（xiuxian 后续） |
| Q7 | 动态 known 模型 | 确认；guard 只消费传入项 |
| Q8 | 「学会」持久化 | guard **不自建存储 / 不碰 DB**；由调用方把召回记忆按格式传入 |
| Q9 | guard 厚度 | 核心纯函数 `check()` + 可选便捷封装 `installKnowledgeGuard`，包不直接碰 worldbook/memory/DB |
| Q10 | KnownItem 格式 | `{ topic; note?; source? }` |
| Q11 | auto-include 默认 | 默认关闭，显式开启 |
| Q12 | 检测 LLM 注入 | C：实例（主推）或 `{apiKey,baseUrl,model,headers}` |
| Q13 | 检测产物 / 注入 | 结构化 `DetectionResult` + 内置 renderer + 双层注入（system 槽 / post-user-system），暴露 renderer |
| Q14 | 降级 / 触发 | fail-open + event/trace；可选跳过过短消息 |
| Q15 | 边界复核 | 与 SecretSentinel / WorldBook 独立无耦合 |
| Q16 | 命名 / 位置 | `@innerlife/knowledge-guard` + 独立 sibling 仓 + file: 链接 |
| Q17 | 分层 / 合并 | core / integration / config 分层；标量覆盖、allow/deny 合并去重 |
| Q18 | 蓝图认可 | 认可，先写文档 |

---

## 14. 未决 / 未来项

- 并行化检测（post-memory 启动 / pre-compose await）。
- 检测结果缓存（玩家重试等）。
- DB 配置 loader（xiuxian-server）。
- 输出侧（post-llm）二次校验。
- `gatherKnown` 的 DB「已学会概念」自定义来源参考实现。
- 自定义 composer（xiuxian）下静态 / 动态 fragment 的放置范式。

---

## 15. 落地后记（实现 vs 蓝图）

代码已按蓝图落地，整体结构与决策一致。以下为实现期的几处**有意微调**（均为增强，不违背共识）：

| 项 | 蓝图 | 实现 | 原因 |
|----|------|------|------|
| `gatherKnown` 入参 | `(ctx: AgentContext)` | `(ctx: HookContext) => KnownItem[] \| Promise<KnownItem[]>` | HookContext 更强（可达 `loreResults`/`memoryRecall`/`agentContext`），且支持 **async**（DB 读取场景） |
| `KnowledgeGuard` 依赖 | `{ provider: LLMProvider; renderer? }` | core 只依赖极简 `LLMClient { chat() }`；provider→client 适配收口在 `integration/provider.ts` | 保证 **core 零框架依赖**、可独立单测；renderer 在 `install` 层装配 |
| allow/deny 配置 | 仅对象形态 | schema 额外支持**字符串简写**（`allow: ['战棋规则']` 自动归一为 `{ topic }`） | YAML/JSON 编写更省心 |
| 触发策略 | 「可选跳过过短消息」 | `minTextLength?: number`（默认不跳过，每轮跑） | 落地为显式可配旋钮 |
| 失败降级 | warn + event + trace | 仅发 `knowledge-guard:error` 事件（不写 `console`，库不污染宿主日志），由宿主订阅决定如何记录 | 库不应擅自打印 |
| 命名可配 | `tag` | `tag` / `boundaryTag` / `names.{hook,staticSlot,dynamicSlot,metadataKey}` / `hookPriority` 全可配 | 多实例共存、避免冲突 |
| 注入产物落点 | hook 写 metadata | hook 写**结构化 `DetectionResult`** 到 `ctx.agentContext.metadata[metadataKey]`，slot 端用 renderer 渲染 | 结构化数据便于观测与自定义渲染 |

**事件清单**（`agent.eventBus.on(...)`）：`knowledge-guard:installed` / `:uninstalled` / `:detected` / `:clean` / `:error`。

**最终目录**（与 §8.2 一致，已含 `__tests__/`）：

```
src/
├── index.ts
├── core/            types · known-set · prompt-template · detector · renderer · guard · index
├── config/          schema · profile · yaml-loader · index
├── integration/     provider · gather-known · slots · install · index
└── observability/   events · index
__tests__/           known-set · profile · schema · prompt-template · detector · renderer · guard（46 例）
docs/feature/        ← 本文
```

**验证**：`tsc --noEmit` 通过；`vitest` 46/46 通过；`tsup` 产出 ESM + CJS + `.d.ts`。
