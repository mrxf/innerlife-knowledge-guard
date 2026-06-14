import type { DetectedItem, DetectionOrigin, DetectionResult } from './types';

/** Thrown when the detector response cannot be parsed into a {@link DetectionResult}. */
export class DetectionParseError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'DetectionParseError';
  }
}

/** Options controlling how the detector response is interpreted. */
export interface ParseOptions {
  /**
   * When `> 0`, a `predicted` array (look-ahead answers) is also parsed,
   * tagged `origin: 'predicted'`, and capped at this many. `0` / omit ⇒ ignore it.
   */
  maxPredicted?: number;
}

/**
 * Extract the outermost JSON object from a raw LLM response, tolerating
 * surrounding prose or ```json fences. Returns `null` when no object is found.
 */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return raw.slice(start, end + 1);
}

/**
 * Coerce a raw array into {@link DetectedItem}s. `origin: 'input'` is left
 * implicit (omitted) for backward compatibility; `'predicted'` is tagged.
 */
function coerceItems(value: unknown, origin: DetectionOrigin): DetectedItem[] {
  if (!Array.isArray(value)) return [];
  const items: DetectedItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const itemValue = typeof candidate.value === 'string' ? candidate.value.trim() : '';
    if (!itemValue) continue;
    const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() : '';
    items.push(
      origin === 'predicted' ? { value: itemValue, reason, origin } : { value: itemValue, reason },
    );
  }
  return items;
}

/**
 * Parse a raw detector response into a structured {@link DetectionResult}.
 *
 * Input-side findings come from `items`; when `options.maxPredicted > 0`,
 * look-ahead answers from `predicted` are appended (tagged + capped). Both
 * collapse into a single `items` array carrying {@link DetectedItem.origin}.
 *
 * Throws {@link DetectionParseError} when the payload is not recoverable JSON,
 * letting the integration layer apply its fail-open policy and surface the error.
 */
export function parseDetection(raw: string, options: ParseOptions = {}): DetectionResult {
  const json = extractJsonObject(raw.trim());
  if (json === null) {
    throw new DetectionParseError('No JSON object found in detector response', raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new DetectionParseError(
      `Detector response is not valid JSON: ${(err as Error).message}`,
      raw,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new DetectionParseError('Detector response is not a JSON object', raw);
  }

  const payload = parsed as Record<string, unknown>;
  const items = coerceItems(payload.items, 'input');

  const maxPredicted = options.maxPredicted ?? 0;
  if (maxPredicted > 0) {
    const predicted = coerceItems(payload.predicted, 'predicted').slice(0, maxPredicted);
    return { items: [...items, ...predicted] };
  }

  return { items };
}
