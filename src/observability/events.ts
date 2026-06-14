import type { DetectedItem } from '../core/types';

/**
 * Minimal emitter contract. `@innerlife/agent`'s `EventBus` satisfies it, but
 * keeping the local shape means this module carries no framework dependency.
 */
export interface EventEmitterLike {
  emit(event: string, ...args: unknown[]): void;
}

/** Event names emitted by the guard. Subscribe via `agent.eventBus.on(...)`. */
export const KnowledgeGuardEvents = {
  /** Guard installed on an agent. */
  Installed: 'knowledge-guard:installed',
  /** Guard removed from an agent. */
  Uninstalled: 'knowledge-guard:uninstalled',
  /** A turn was inspected and out-of-boundary items were found. */
  Detected: 'knowledge-guard:detected',
  /** A turn was inspected and found clean. */
  Clean: 'knowledge-guard:clean',
  /** Detection failed; the guard failed open (no dynamic injection this turn). */
  Error: 'knowledge-guard:error',
} as const;

export type KnowledgeGuardEvent =
  (typeof KnowledgeGuardEvents)[keyof typeof KnowledgeGuardEvents];

export interface GuardInstalledPayload {
  agentId: string;
  staticLayer: boolean;
  dynamicLayer: boolean;
}

export interface GuardUninstalledPayload {
  agentId: string;
}

export interface GuardDetectionPayload {
  agentId: string;
  turnId: string;
  items: DetectedItem[];
}

export interface GuardErrorPayload {
  agentId: string;
  turnId: string;
  error: string;
}

export type GuardEventPayload =
  | GuardInstalledPayload
  | GuardUninstalledPayload
  | GuardDetectionPayload
  | GuardErrorPayload;

/** Emit a guard event on any {@link EventEmitterLike}. Never throws. */
export function emitGuardEvent(
  bus: EventEmitterLike | undefined,
  event: KnowledgeGuardEvent,
  payload: GuardEventPayload,
): void {
  bus?.emit(event, payload);
}
