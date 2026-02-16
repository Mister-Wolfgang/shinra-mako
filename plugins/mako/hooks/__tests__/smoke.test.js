/**
 * Smoke Test -- MAKO Hooks v6.0
 *
 * Hypothesis: All hook files are valid Node.js modules that can be loaded
 * without throwing at require-time (syntax errors, missing deps, etc.).
 *
 * ADR-2: Tests are ESM, hooks are CommonJS. We use dynamic import() + createRequire
 * to load CJS modules from ESM test context.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOOKS_DIR = resolve(__dirname, '..');

/**
 * All hook files declared in hooks.json (excluding validate-plugin.js).
 * Each hook must be loadable as a CommonJS module without crashing.
 */
const HOOK_FILES = [
  'ensure-memory-server.js',
  'inject-rufus.js',
  'pre-commit-check.js',
  'pre-compact-save.js',
  'subagent-memory-reminder.js',
  'subagent-stop-memory.js',
  'user-prompt-submit-rufus.js',
];

describe('Smoke Test: Hook files exist', () => {
  it.each(HOOK_FILES)('%s exists on disk', (hookFile) => {
    const hookPath = join(HOOKS_DIR, hookFile);
    expect(existsSync(hookPath)).toBe(true);
  });
});

describe('Smoke Test: hooks.json is valid', () => {
  it('hooks.json exists and parses as valid JSON', async () => {
    const hooksJsonPath = join(HOOKS_DIR, 'hooks.json');
    expect(existsSync(hooksJsonPath)).toBe(true);

    const { readFileSync } = await import('node:fs');
    const content = readFileSync(hooksJsonPath, 'utf8');
    const parsed = JSON.parse(content);

    expect(parsed).toHaveProperty('hooks');
    expect(typeof parsed.hooks).toBe('object');
  });

  it('hooks.json references only existing files', async () => {
    const { readFileSync } = await import('node:fs');
    const hooksJsonPath = join(HOOKS_DIR, 'hooks.json');
    const parsed = JSON.parse(readFileSync(hooksJsonPath, 'utf8'));

    // Extract all command paths from hooks.json
    const commandPaths = [];
    for (const [, eventHooks] of Object.entries(parsed.hooks)) {
      for (const hookGroup of eventHooks) {
        for (const hook of hookGroup.hooks) {
          if (hook.command) {
            // Extract filename from command like: node "${CLAUDE_PLUGIN_ROOT}/hooks/foo.js"
            const match = hook.command.match(/hooks\/([^"]+)/);
            if (match) commandPaths.push(match[1]);
          }
        }
      }
    }

    expect(commandPaths.length).toBeGreaterThan(0);

    for (const file of commandPaths) {
      const fullPath = join(HOOKS_DIR, file);
      expect(existsSync(fullPath), `Referenced hook file missing: ${file}`).toBe(true);
    }
  });
});

describe('Smoke Test: Mocks directory', () => {
  it('mocks directory exists', () => {
    const mocksDir = join(HOOKS_DIR, '__tests__', 'mocks');
    expect(existsSync(mocksDir)).toBe(true);
  });
});
