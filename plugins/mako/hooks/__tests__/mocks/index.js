/**
 * Mock fixtures for MAKO hooks testing.
 *
 * Provides reusable test data: sprint status, session state, hook inputs.
 * All fixtures are static snapshots -- no side effects.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Raw YAML content of a typical sprint-status.yaml */
export const SPRINT_STATUS_YAML = readFileSync(
  join(__dirname, 'sprint-status.yaml'),
  'utf8'
);

/** Parsed session state fixture */
export const SESSION_STATE = JSON.parse(
  readFileSync(join(__dirname, 'session-state.json'), 'utf8')
);

/** Subagent stop hook input fixture */
export const SUBAGENT_STOP_INPUT = JSON.parse(
  readFileSync(join(__dirname, 'hook-input-subagent-stop.json'), 'utf8')
);

/**
 * Creates a minimal environment object for hook execution.
 * @param {string} projectDir - Path to use as CLAUDE_PROJECT_DIR
 * @param {object} [extra] - Additional env vars to merge
 * @returns {object} Environment variables object
 */
export function createMockEnv(projectDir, extra = {}) {
  return {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: join(__dirname, '..', '..'),
    ...extra,
  };
}
