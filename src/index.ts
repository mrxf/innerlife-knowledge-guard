/**
 * @innerlife/knowledge-guard
 *
 * Configurable NPC knowledge-boundary guard for `@innerlife/agent`.
 *
 * - `core/*`         — framework-free detection, rendering, known-set logic.
 * - `config/*`       — Zod schema, profile merging, optional YAML loaders.
 * - `integration/*`  — `installKnowledgeGuard` + the `@innerlife/agent` glue.
 * - `observability/*`— event names & payloads.
 */
export * from './core';
export * from './config';
export * from './integration';
export * from './observability';
