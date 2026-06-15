import type {
  DetectedItem,
  DetectionResult,
  InjectionRenderer,
  KnowledgeBoundaryConfig,
} from './types';

export interface RendererOptions {
  /** XML tag for the per-turn alert. Default `'knowledge_alert'`. */
  alertTag?: string;
  /** XML tag for the standing boundary block. Default `'knowledge_boundary'`. */
  boundaryTag?: string;
  /** `description` for the flat alert (input-only). Also used for the `<input>` sub-section. */
  alertDescription?: string;
  /** `description` for the predicted-answer `<answer>` sub-section. */
  answerDescription?: string;
  /** Sub-tag wrapping input-side items in grouped mode. Default `'input'`. */
  inputTag?: string;
  /** Sub-tag wrapping predicted-answer items in grouped mode. Default `'answer'`. */
  answerTag?: string;
}

const DEFAULT_ALERT_TAG = 'knowledge_alert';
const DEFAULT_BOUNDARY_TAG = 'knowledge_boundary';
const DEFAULT_ALERT_DESCRIPTION =
  '以下事物不属于你所处的世界（晚于你的时代，或本就不存在于此）。若你对它们并无任何见闻或记忆，切勿凭空展露本不该拥有的认知；但若你的设定、记忆或当前对话确实让你接触过它们，则依你已有的理解，自然应对。';
const DEFAULT_ANSWER_DESCRIPTION =
  '以下事物不属于你所处的世界（晚于你的时代，或本就不存在于此）。若你对它们并无任何见闻或记忆，切勿凭空展露本不该拥有的认知；但若你的设定、记忆或当前对话确实让你接触过它们，则依你已有的理解，自然应对。';
const DEFAULT_INPUT_TAG = 'input';
const DEFAULT_ANSWER_TAG = 'answer';

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Default renderer producing XML-flavoured fragments, mirroring the proven
 * `<...alert>` shape. Tag names and descriptions are configurable; supply a
 * custom {@link InjectionRenderer} to fully override the output.
 *
 * Alert shape depends on provenance:
 * - **input only** → flat `<alert description><item .../></alert>` (unchanged).
 * - **with predicted answers** → grouped `<alert><input .../><answer .../></alert>`,
 *   so the NPC can tell "don't recognise" (input) from "don't say" (answer) apart.
 */
export class DefaultInjectionRenderer implements InjectionRenderer {
  private readonly alertTag: string;
  private readonly boundaryTag: string;
  private readonly alertDescription: string;
  private readonly answerDescription: string;
  private readonly inputTag: string;
  private readonly answerTag: string;

  constructor(options: RendererOptions = {}) {
    this.alertTag = options.alertTag ?? DEFAULT_ALERT_TAG;
    this.boundaryTag = options.boundaryTag ?? DEFAULT_BOUNDARY_TAG;
    this.alertDescription = options.alertDescription ?? DEFAULT_ALERT_DESCRIPTION;
    this.answerDescription = options.answerDescription ?? DEFAULT_ANSWER_DESCRIPTION;
    this.inputTag = options.inputTag ?? DEFAULT_INPUT_TAG;
    this.answerTag = options.answerTag ?? DEFAULT_ANSWER_TAG;
  }

  renderBoundary(config: KnowledgeBoundaryConfig): string | null {
    const setting = config.setting?.trim();
    if (!setting) return null;

    const lines: string[] = [`你生活在${setting}。`];

    if (config.presentMoment) {
      lines.push(`当下是${config.presentMoment}，此后发生的一切你都未曾经历、无从知晓。`);
    }

    if (config.deny && config.deny.length > 0) {
      const denyList = config.deny
        .map((d) => `- ${d.topic}${d.reason ? `（${d.reason}）` : ''}`)
        .join('\n');
      lines.push(
        `以下事物你从未见过也从未听闻，若被提及，请以角色口吻表达困惑，绝不表现出理解：\n${denyList}`,
      );
    }

    if (config.allow && config.allow.length > 0) {
      lines.push(`以下事物你是知道的：${config.allow.map((a) => a.topic).join('、')}`);
    }

    return `<${this.boundaryTag}>\n${lines.join('\n')}\n</${this.boundaryTag}>`;
  }

  renderAlert(result: DetectionResult, _config: KnowledgeBoundaryConfig): string | null {
    const items = result.items ?? [];
    if (items.length === 0) return null;

    const predicted = items.filter((item) => item.origin === 'predicted');
    const inputs = items.filter((item) => item.origin !== 'predicted');

    // Backward-compatible flat form when nothing was predicted.
    if (predicted.length === 0) {
      return `<${this.alertTag} description="${escapeXmlAttr(this.alertDescription)}">\n${this.renderItems(inputs, 1)}\n</${this.alertTag}>`;
    }

    // Grouped form: separate "don't recognise" and "don't say" guidance.
    const sections: string[] = [];
    if (inputs.length > 0) {
      sections.push(this.renderSection(this.inputTag, this.alertDescription, inputs));
    }
    sections.push(this.renderSection(this.answerTag, this.answerDescription, predicted));

    return `<${this.alertTag}>\n${sections.join('\n')}\n</${this.alertTag}>`;
  }

  private renderItem(item: DetectedItem, indent: string): string {
    return `${indent}<item value="${escapeXmlAttr(item.value)}" reason="${escapeXmlAttr(item.reason)}" />`;
  }

  private renderItems(items: DetectedItem[], depth: number): string {
    const indent = '  '.repeat(depth);
    return items.map((item) => this.renderItem(item, indent)).join('\n');
  }

  private renderSection(tag: string, description: string, items: DetectedItem[]): string {
    return `  <${tag} description="${escapeXmlAttr(description)}">\n${this.renderItems(items, 2)}\n  </${tag}>`;
  }
}
