import { z } from 'zod';
import type {
  KnowledgeBoundaryConfig,
  KnowledgeBoundaryOverride,
} from '../core/types';

/**
 * Zod schemas validating raw boundary config from any source (YAML / JSON / DB).
 *
 * Authoring ergonomics: `allow` / `deny` entries accept either a bare string
 * (the topic) or the full object form; both normalise to the structured shape.
 */

export const worldTypeSchema = z.enum(['historical', 'fictional']);

export const allowItemSchema = z
  .union([
    z.string().min(1),
    z.object({ topic: z.string().min(1), note: z.string().optional() }),
  ])
  .transform((value) => (typeof value === 'string' ? { topic: value } : value));

export const denyItemSchema = z
  .union([
    z.string().min(1),
    z.object({ topic: z.string().min(1), reason: z.string().optional() }),
  ])
  .transform((value) => (typeof value === 'string' ? { topic: value } : value));

export const knowledgeBoundaryConfigSchema = z.object({
  setting: z.string().min(1),
  type: worldTypeSchema.optional(),
  presentMoment: z.string().optional(),
  referenceHints: z.array(z.string().min(1)).optional(),
  allow: z.array(allowItemSchema).optional(),
  deny: z.array(denyItemSchema).optional(),
});

export const knowledgeBoundaryOverrideSchema = knowledgeBoundaryConfigSchema.partial();

/** A file/object holding several named boundary profiles + an optional default. */
export const knowledgeGuardProfilesSchema = z.object({
  profiles: z.record(z.string(), knowledgeBoundaryConfigSchema),
  defaultProfile: z.string().optional(),
});

export type KnowledgeGuardProfiles = z.infer<typeof knowledgeGuardProfilesSchema>;

/** Validate & normalise a full boundary config. Throws `ZodError` on failure. */
export function parseBoundaryConfig(data: unknown): KnowledgeBoundaryConfig {
  return knowledgeBoundaryConfigSchema.parse(data);
}

/** Validate & normalise a partial per-NPC override. Throws `ZodError` on failure. */
export function parseBoundaryOverride(data: unknown): KnowledgeBoundaryOverride {
  return knowledgeBoundaryOverrideSchema.parse(data);
}

/** Validate & normalise a named-profiles document. Throws `ZodError` on failure. */
export function parseProfiles(data: unknown): KnowledgeGuardProfiles {
  return knowledgeGuardProfilesSchema.parse(data);
}
