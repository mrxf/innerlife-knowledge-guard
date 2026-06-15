import type {
  ChatMessage,
  ConversationTurn,
  GuardCheckInput,
  KnowledgeBoundaryConfig,
} from './types';
import { renderKnownForPrompt } from './known-set';

const HISTORICAL_RULES = [
  '1. 该时代及更早的事物 / 人物 / 概念 → 不标记',
  '2. 晚于该时代的朝代、人物、事件 → 标记',
  '3. 现代科技、现代物品、现代概念 → 标记',
  '4. 当时不存在的外来词汇、外语 → 标记',
  '5. 纯情感表达、日常对话、不涉及具体时代事物 → 不标记',
].join('\n');

const FICTIONAL_RULES = [
  '1. 属于该架空世界设定内的事物 / 概念 → 不标记',
  '2. 现实世界的现代科技、品牌、人物、事件（该世界不存在的）→ 标记',
  '3. 明显不属于该世界观的外来概念 → 标记',
  '4. 纯情感表达、日常对话、不涉及具体设定事物 → 不标记',
].join('\n');

/**
 * Multi-turn induction rule — only appended when recent history accompanies the
 * current message. Players can spell / pun / assemble an out-of-bounds concept
 * across several innocent-looking turns; the detector must judge the *assembled*
 * intent of the latest message in light of the recent dialogue.
 */
const MULTI_TURN_RULE =
  '注意：玩家可能通过多轮拆字 / 谐音 / 拼接 / 暗示，逐步引出越界事物。请结合【近期对话】理解【当前玩家消息】拼接后的真实意图；若越界，value 填拼接后的完整概念（例如分散提到「武」「则」「天」后要求串讲，应标记「武则天」）。';

const OUTPUT_SPEC = [
  '仅输出 JSON（不要包含任何解释或代码块标记）：',
  '- 存在越界项：{"items":[{"value":"越界事物","reason":"简要原因"}]}',
  '- 不存在越界项：{"items":[]}',
].join('\n');

/**
 * Extra task asking the detector to self-check its *own* upcoming answer.
 *
 * This is a guardrail, not a brainstorm: `predicted` must list ONLY the
 * out-of-bounds things the NPC might blurt out, never the in-world words it
 * would legitimately reach for. Framed as "default empty, flag only on real
 * risk" so the model stops slot-filling the array up to `maxPredicted`.
 */
function answerLookaheadTask(maxPredicted: number): string {
  return [
    '此外，做一次「回答前自检」：预判你作为该 NPC 回答【当前玩家消息】时，是否可能不慎说出超出认知边界的事物。',
    '这是一道安全防线，不是头脑风暴——predicted 默认应为空；只有当你确实预见到自己会脱口而出某个越界词时，才把它放入 predicted，至多 ' +
      `${maxPredicted} 个，宁缺毋滥。`,
    '关键区别：为了理解或回答而动用的本世界合法事物（例如用「书信」「信鸽」去类比一件你不认识的现代物件），它们本身并不越界，【绝不要】放入 predicted；只有当你可能顺着话头说出本世界并不存在的事物（如「信号」「充电」「快递」）时，才放入。',
    'predicted 中每一项的 reason 必须说明「它为何越界」；任何你判断为「不越界 / 不算越界」的事物都不允许出现在 predicted 中。',
  ].join('\n');
}

/** Output spec when answer look-ahead is on — two named arrays. */
function outputSpecWithPredicted(maxPredicted: number): string {
  return [
    '仅输出 JSON（不要包含任何解释或代码块标记），包含两个数组：',
    '- "items"：在【对话】中实际出现的越界事物（可为空）。',
    `- "predicted"：回答前自检——你可能不慎说出、且确实越界的事物；【默认为空】，仅在确有风险时填写，至多 ${maxPredicted} 个。每项的 reason 必须说明它为何越界。`,
    '多数情况下 predicted 应为空数组。',
    '示例：{"items":[{"value":"…","reason":"…"}],"predicted":[{"value":"…","reason":"…"}]}',
    '无任何越界：{"items":[],"predicted":[]}',
  ].join('\n');
}

/** Knobs that toggle the multi-turn rule and the answer-prediction task. */
export interface DetectorPromptOptions {
  /** A `【近期对话】` block accompanies the current message. */
  hasHistory?: boolean;
  /** `> 0` ⇒ ask the detector to also predict out-of-bounds answers. */
  maxPredicted?: number;
}

/** Build the detector's system prompt from the boundary config + per-turn known set. */
export function buildDetectorSystemPrompt(
  config: KnowledgeBoundaryConfig,
  knownPromptBlock: string,
  options: DetectorPromptOptions = {},
): string {
  const rules = config.type === 'fictional' ? FICTIONAL_RULES : HISTORICAL_RULES;
  const maxPredicted = options.maxPredicted ?? 0;

  const sections: string[] = [
    '你是一个「认知边界审核器」。该 NPC 生活在如下世界设定中：',
    config.setting,
  ];

  if (config.presentMoment) {
    sections.push(`当前时刻：${config.presentMoment}。晚于此刻发生的一切，该 NPC 都无从知晓。`);
  }

  sections.push(
    '你的任务：判断【当前玩家消息】中是否出现「超出该 NPC 认知边界」的事物、概念或人物。',
    `判定规则：\n${rules}`,
  );

  if (options.hasHistory) {
    sections.push(MULTI_TURN_RULE);
  }

  if (maxPredicted > 0) {
    sections.push(answerLookaheadTask(maxPredicted));
  }

  if (config.referenceHints && config.referenceHints.length > 0) {
    sections.push(`参考：\n${config.referenceHints.map((h) => `- ${h}`).join('\n')}`);
  }

  if (config.deny && config.deny.length > 0) {
    const denyList = config.deny
      .map((d) => `- ${d.topic}${d.reason ? `（${d.reason}）` : ''}`)
      .join('\n');
    sections.push(`以下事物即使看似属于该世界，也必须判定为越界（该 NPC 绝不可知）：\n${denyList}`);
  }

  sections.push(
    `【已知豁免】以下内容该 NPC 已经知道或被允许知道，即使看似超出边界，也【绝不要】标记：\n${
      knownPromptBlock || '（无）'
    }`,
    maxPredicted > 0 ? outputSpecWithPredicted(maxPredicted) : OUTPUT_SPEC,
  );

  return sections.join('\n\n');
}

const HISTORY_HEADER = '【近期对话】（从旧到新）';

/** Display label for a history line; prefers the explicit speaker name. */
function speakerLabel(turn: ConversationTurn): string {
  const speaker = turn.speaker?.trim();
  if (speaker) return speaker;
  return turn.role === 'user' ? '玩家' : '我';
}

/** Render the recent-dialogue block fed alongside the current message. */
function renderHistoryBlock(history: ConversationTurn[]): string {
  const lines = history.map((turn) => `${speakerLabel(turn)}：${turn.content}`);
  return `${HISTORY_HEADER}\n${lines.join('\n')}`;
}

/** Assemble the full message list for one detector call. */
export function buildDetectorMessages(input: GuardCheckInput): ChatMessage[] {
  const knownBlock = renderKnownForPrompt(input.known);
  const history = input.history ?? [];
  const hasHistory = history.length > 0;
  const maxPredicted = input.maxPredicted ?? 0;

  const system = buildDetectorSystemPrompt(input.config, knownBlock, {
    hasHistory,
    maxPredicted,
  });

  // No history ⇒ keep the proven single-turn wording verbatim (backward-compatible).
  const userContent = hasHistory
    ? `${renderHistoryBlock(history)}\n\n【当前玩家消息】\n${input.text}`
    : `玩家消息：\n${input.text}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ];
}
