import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import type { KnowledgeBoundaryConfig } from '../core/types';
import {
  parseBoundaryConfig,
  parseProfiles,
  type KnowledgeGuardProfiles,
} from './schema';

/**
 * Optional YAML convenience loaders (MVP). The package's real contract is the
 * plain config object — DB-driven consumers assemble it themselves and skip
 * this module entirely.
 */

/** Parse a single boundary config from a YAML string. */
export function loadBoundaryFromYaml(yaml: string): KnowledgeBoundaryConfig {
  return parseBoundaryConfig(load(yaml));
}

/** Parse a named-profiles document from a YAML string. */
export function loadProfilesFromYaml(yaml: string): KnowledgeGuardProfiles {
  return parseProfiles(load(yaml));
}

/** Read + parse a single boundary config from a YAML file. */
export function loadBoundaryFile(path: string): KnowledgeBoundaryConfig {
  return loadBoundaryFromYaml(readFileSync(path, 'utf8'));
}

/** Read + parse a named-profiles document from a YAML file. */
export function loadProfilesFile(path: string): KnowledgeGuardProfiles {
  return loadProfilesFromYaml(readFileSync(path, 'utf8'));
}
