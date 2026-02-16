/**
 * Unit Tests -- ST-6: PreCompact Hook (pre-compact-save.js)
 *
 * Hypothesis: pre-compact-save.js reads sprint-status.yaml and
 * .mako-session-state.json from CLAUDE_PROJECT_DIR, writes an updated
 * session state file, and outputs a JSON recovery message to stdout with
 * hookSpecificOutput.additionalContext containing compaction instructions.
 *
 * Method: Subprocess execution with isolated temp directories.
 * CJS hook under test, ESM test context (ADR-2).
 *
 * Acceptance criteria:
 *   - Session state is saved (additionalContext contains state)
 *   - Hook skips gracefully if no session is active
 *   - Hook does not crash if MCP Memory is unavailable (prep for ST-9)
 *   - Coverage > 80%
 *   - 0 regressions on existing 185 tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { SPRINT_STATUS_YAML, SESSION_STATE, createMockEnv } from './mocks/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOOKS_DIR = resolve(__dirname, '..');
const HOOK_PATH = join(HOOKS_DIR, 'pre-compact-save.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute pre-compact-save.js as a subprocess with a controlled project dir.
 * Returns { stdout, stderr, exitCode }.
 */
function execHook(projectDir, extraEnv = {}) {
  const mergedEnv = createMockEnv(projectDir, extraEnv);

  const result = spawnSync('node', [HOOK_PATH], {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 10000,
    env: mergedEnv,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    exitCode: result.status ?? 0,
  };
}

/**
 * Parse JSON from hook stdout. Returns parsed object or null.
 */
function parseOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('ST-6: PreCompact Hook (pre-compact-save.js)', () => {
  /** Isolated temp directory per test. */
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-precompact-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // =========================================================================
  // OUTPUT FORMAT -- valid JSON structure
  // =========================================================================

  describe('Output format', () => {
    it('outputs valid JSON to stdout', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
    });

    it('output has hookSpecificOutput property', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      expect(output).toHaveProperty('hookSpecificOutput');
    });

    it('hookEventName is "PreCompact"', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
    });

    it('additionalContext is a non-empty string', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      expect(typeof output.hookSpecificOutput.additionalContext).toBe('string');
      expect(output.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
    });

    it('output has exactly one top-level key: hookSpecificOutput', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      expect(Object.keys(output)).toEqual(['hookSpecificOutput']);
    });

    it('hookSpecificOutput has exactly hookEventName and additionalContext', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const keys = Object.keys(output.hookSpecificOutput).sort();
      expect(keys).toEqual(['additionalContext', 'hookEventName']);
    });

    it('exits with code 0', () => {
      const { exitCode } = execHook(tmpDir);
      expect(exitCode).toBe(0);
    });
  });

  // =========================================================================
  // SESSION STATE SAVING -- .mako-session-state.json is written
  // =========================================================================

  describe('Session state saving', () => {
    it('creates .mako-session-state.json when it does not exist', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      execHook(tmpDir);

      const statePath = join(tmpDir, '.mako-session-state.json');
      expect(existsSync(statePath)).toBe(true);
    });

    it('written state file is valid JSON', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      execHook(tmpDir);

      const statePath = join(tmpDir, '.mako-session-state.json');
      const content = readFileSync(statePath, 'utf8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('written state contains last_compaction ISO timestamp', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state).toHaveProperty('last_compaction');
      // ISO 8601 timestamp pattern
      expect(state.last_compaction).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('written state contains sprint data from sprint-status.yaml', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state).toHaveProperty('sprint');
      expect(state.sprint.workflow).toBe('create-project');
      expect(state.sprint.status).toBe('active');
      expect(state.sprint.current_phase).toBe('hojo');
      expect(state.sprint.next_phase).toBe('reno');
      expect(state.sprint.quality_tier).toBe('Standard');
    });

    it('preserves active_agents from existing session state', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify(SESSION_STATE)
      );
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.active_agents).toEqual(SESSION_STATE.active_agents);
      expect(state.active_agents.hojo).toBe('agent-mock-001');
      expect(state.active_agents.tseng).toBe('agent-mock-002');
    });

    it('preserves pending_decisions from existing session state', () => {
      const existing = {
        ...SESSION_STATE,
        pending_decisions: ['decision-alpha', 'decision-beta'],
      };
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify(existing)
      );
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.pending_decisions).toEqual(['decision-alpha', 'decision-beta']);
    });

    it('preserves notes from existing session state', () => {
      const existing = { ...SESSION_STATE, notes: 'Experiment 42 in progress.' };
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify(existing)
      );
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.notes).toBe('Experiment 42 in progress.');
    });

    it('defaults active_agents to {} when no existing state', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.active_agents).toEqual({});
    });

    it('defaults pending_decisions to [] when no existing state', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.pending_decisions).toEqual([]);
    });

    it('defaults notes to "" when no existing state', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.notes).toBe('');
    });

    it('updates last_compaction timestamp on re-run', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const oldState = {
        last_compaction: '2020-01-01T00:00:00.000Z',
        sprint: {},
        active_agents: {},
        pending_decisions: [],
        notes: '',
      };
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify(oldState)
      );
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.last_compaction).not.toBe('2020-01-01T00:00:00.000Z');
    });
  });

  // =========================================================================
  // ADDITIONAL CONTEXT -- recovery message content
  // =========================================================================

  describe('Additional context (recovery message)', () => {
    it('contains "COMPACTAGE IMMINENT" header', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain(
        'COMPACTAGE IMMINENT'
      );
    });

    it('contains sprint summary when sprint-status.yaml exists', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;

      expect(ctx).toContain('create-project');
      expect(ctx).toContain('active');
      expect(ctx).toContain('hojo');
      expect(ctx).toContain('reno');
      expect(ctx).toContain('Standard');
    });

    it('contains "No sprint-status.yaml found" when YAML is missing', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain('No sprint-status.yaml found');
    });

    it('contains agent IDs when active_agents exist in session state', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify(SESSION_STATE)
      );
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;

      expect(ctx).toContain('hojo=agent-mock-001');
      expect(ctx).toContain('tseng=agent-mock-002');
    });

    it('shows "None saved." for agent IDs when no session state', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain('None saved.');
    });

    it('contains post-compaction recovery instructions', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;

      expect(ctx).toContain('APRES LE COMPACTAGE');
      expect(ctx).toContain('sprint-status.yaml');
      expect(ctx).toContain('.mako-session-state.json');
      expect(ctx).toContain('retrieve_memory');
      expect(ctx).toContain('Rufus');
    });

    it('recovery instructions mention reading sprint-status.yaml as step 1', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain('1. Lis sprint-status.yaml');
    });

    it('recovery instructions mention reading session state as step 2', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain('2. Lis .mako-session-state.json');
    });

    it('recovery instructions mention retrieve_memory as step 3', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain('3. retrieve_memory');
    });

    it('recovery instructions mention Rufus delegation as step 4', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain('4. Tu es Rufus');
      expect(ctx).toContain('Delegue');
    });
  });

  // =========================================================================
  // SPRINT-STATUS.YAML PARSING
  // =========================================================================

  describe('Sprint-status.yaml parsing', () => {
    it('extracts all 6 fields from well-formed YAML', () => {
      const yaml = `sprint:
  workflow: "add-mako-hooks"
  status: "active"
  current_phase: "elena"
  next_phase: "palmer"
  quality_tier: "Comprehensive"
  scale: "Enterprise"
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), yaml);
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.sprint.workflow).toBe('add-mako-hooks');
      expect(state.sprint.status).toBe('active');
      expect(state.sprint.current_phase).toBe('elena');
      expect(state.sprint.next_phase).toBe('palmer');
      expect(state.sprint.quality_tier).toBe('Comprehensive');
      expect(state.sprint.scale).toBe('Enterprise');
    });

    it('uses "?" fallback for missing fields', () => {
      const yaml = `sprint:
  workflow: "minimal"
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), yaml);
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.sprint.workflow).toBe('minimal');
      expect(state.sprint.status).toBe('?');
      expect(state.sprint.current_phase).toBe('?');
      expect(state.sprint.next_phase).toBe('?');
      expect(state.sprint.quality_tier).toBe('?');
      expect(state.sprint.scale).toBe('?');
    });

    it('handles empty YAML file gracefully', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), '');
      const { stdout, exitCode } = execHook(tmpDir);
      expect(exitCode).toBe(0);

      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
      // Empty string is falsy in JS, so safeRead returns '' which is truthy...
      // Actually: safeRead returns the string. Empty string is falsy in the
      // `if (sprintRaw)` check, so sprintData stays as {}.
      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.sprint).toEqual({});
    });

    it('handles YAML with unquoted values', () => {
      const yaml = `sprint:
  workflow: bugfix-42
  status: active
  current_phase: hojo
  next_phase: reno
  quality_tier: Standard
  scale: Standard
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), yaml);
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.sprint.workflow).toBe('bugfix-42');
      expect(state.sprint.status).toBe('active');
    });
  });

  // =========================================================================
  // NO SESSION ACTIVE -- skip behavior
  // =========================================================================

  describe('No session active (skip behavior)', () => {
    it('does not crash when no files exist at all', () => {
      const { stdout, exitCode } = execHook(tmpDir);
      expect(exitCode).toBe(0);
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
      expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
    });

    it('still produces valid additionalContext with no files', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;

      // Must still contain compaction header and instructions
      expect(ctx).toContain('COMPACTAGE IMMINENT');
      expect(ctx).toContain('APRES LE COMPACTAGE');
    });

    it('writes session state even without sprint-status.yaml', () => {
      execHook(tmpDir);

      const statePath = join(tmpDir, '.mako-session-state.json');
      expect(existsSync(statePath)).toBe(true);

      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      expect(state).toHaveProperty('last_compaction');
      expect(state).toHaveProperty('sprint');
      expect(state).toHaveProperty('active_agents');
    });

    it('sprint data is empty object when no YAML exists', () => {
      execHook(tmpDir);

      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      // When sprintRaw is null, the hook sets sprintData = {} (no fields extracted)
      expect(state.sprint).toEqual({});
    });
  });

  // =========================================================================
  // MCP MEMORY UNAVAILABLE -- robustness (prep for ST-9)
  // =========================================================================

  describe('MCP Memory unavailable (robustness for ST-9)', () => {
    it('does not crash when no MCP environment variables are set', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      // Explicitly unset any MCP-related env vars
      const { stdout, exitCode } = execHook(tmpDir, {
        MCP_MEMORY_STORAGE_BACKEND: '',
        MCP_HTTP_ENABLED: '',
        MCP_HTTP_PORT: '',
      });
      expect(exitCode).toBe(0);
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
      expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
    });

    it('recovery message references retrieve_memory regardless of MCP availability', () => {
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      // Hook unconditionally includes the memory retrieval instruction
      expect(ctx).toContain('retrieve_memory');
    });

    it('hook is self-contained -- no external network/MCP calls', () => {
      // The hook only reads local files and writes local files.
      // It should complete quickly without network access.
      const start = Date.now();
      const { exitCode } = execHook(tmpDir);
      const elapsed = Date.now() - start;

      expect(exitCode).toBe(0);
      // Should complete in well under 5 seconds (no network calls)
      expect(elapsed).toBeLessThan(5000);
    });
  });

  // =========================================================================
  // ENVIRONMENT VARIABLE: CLAUDE_PROJECT_DIR
  // =========================================================================

  describe('CLAUDE_PROJECT_DIR environment variable', () => {
    it('reads files from CLAUDE_PROJECT_DIR, not cwd', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

      // Run with a different cwd but CLAUDE_PROJECT_DIR pointing to tmpDir
      const otherDir = mkdtempSync(join(tmpdir(), 'mako-other-'));
      try {
        const result = spawnSync('node', [HOOK_PATH], {
          cwd: otherDir,
          encoding: 'utf8',
          timeout: 10000,
          env: createMockEnv(tmpDir),
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const output = parseOutput((result.stdout || '').trim());
        expect(output.hookSpecificOutput.additionalContext).toContain('create-project');
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });

    it('writes session state to CLAUDE_PROJECT_DIR, not cwd', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

      const otherDir = mkdtempSync(join(tmpdir(), 'mako-other-'));
      try {
        spawnSync('node', [HOOK_PATH], {
          cwd: otherDir,
          encoding: 'utf8',
          timeout: 10000,
          env: createMockEnv(tmpDir),
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // State file should be in tmpDir (CLAUDE_PROJECT_DIR), not otherDir
        expect(existsSync(join(tmpDir, '.mako-session-state.json'))).toBe(true);
        expect(existsSync(join(otherDir, '.mako-session-state.json'))).toBe(false);
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // ERROR RESILIENCE -- ultra-robust fallback
  // =========================================================================

  describe('Error resilience (ultra-robust fallback)', () => {
    it('handles malformed JSON in existing session state', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(join(tmpDir, '.mako-session-state.json'), '{{{NOT JSON}}}');

      const { stdout, exitCode } = execHook(tmpDir);
      expect(exitCode).toBe(0);

      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
      expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
    });

    it('handles sprint-status.yaml being a directory', () => {
      mkdirSync(join(tmpDir, 'sprint-status.yaml'));
      const { stdout, exitCode } = execHook(tmpDir);
      expect(exitCode).toBe(0);

      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
    });

    it('handles .mako-session-state.json being a directory', () => {
      mkdirSync(join(tmpDir, '.mako-session-state.json'));
      const { stdout, exitCode } = execHook(tmpDir);
      expect(exitCode).toBe(0);

      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
      // The catch-all fallback message should still work
      expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
    });

    it('handles malformed YAML gracefully (binary content)', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), '\x00\x01\x02BINARY\xFF\xFE');
      const { stdout, exitCode } = execHook(tmpDir);
      expect(exitCode).toBe(0);

      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
    });

    it('fallback message still mentions compaction when main logic fails', () => {
      // Force an error by making the project dir unreadable is hard cross-platform.
      // Instead, we verify the catch-all fallback message structure by checking
      // that even with a broken .mako-session-state.json (directory), the hook
      // produces a compaction message.
      mkdirSync(join(tmpDir, '.mako-session-state.json'));
      const { stdout } = execHook(tmpDir);
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;

      // Either the main message or the fallback must contain compaction reference
      expect(
        ctx.includes('COMPACTAGE') || ctx.includes('Compactage') || ctx.includes('compactage')
      ).toBe(true);
    });

    it('handles empty session state file gracefully', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(join(tmpDir, '.mako-session-state.json'), '');

      const { stdout, exitCode } = execHook(tmpDir);
      expect(exitCode).toBe(0);

      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
    });

    it('handles session state with null fields gracefully', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify({
          active_agents: null,
          pending_decisions: null,
          notes: null,
        })
      );

      const { stdout, exitCode } = execHook(tmpDir);
      expect(exitCode).toBe(0);

      const output = parseOutput(stdout);
      expect(output).not.toBeNull();

      // Written state should have defaults for null fields
      const state = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state.active_agents).toEqual({});
      expect(state.pending_decisions).toEqual([]);
      expect(state.notes).toBe('');
    });
  });

  // =========================================================================
  // IDEMPOTENCY -- running twice is safe
  // =========================================================================

  describe('Idempotency', () => {
    it('running twice produces valid output both times', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

      const { stdout: stdout1 } = execHook(tmpDir);
      const output1 = parseOutput(stdout1);
      expect(output1).not.toBeNull();

      const { stdout: stdout2 } = execHook(tmpDir);
      const output2 = parseOutput(stdout2);
      expect(output2).not.toBeNull();

      // Both should have the same structure
      expect(output1.hookSpecificOutput.hookEventName).toBe('PreCompact');
      expect(output2.hookSpecificOutput.hookEventName).toBe('PreCompact');
    });

    it('second run preserves agents from first run state', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify(SESSION_STATE)
      );

      // First run reads existing state with agents
      execHook(tmpDir);
      const state1 = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state1.active_agents).toEqual(SESSION_STATE.active_agents);

      // Second run should still have those agents
      execHook(tmpDir);
      const state2 = JSON.parse(readFileSync(join(tmpDir, '.mako-session-state.json'), 'utf8'));
      expect(state2.active_agents).toEqual(SESSION_STATE.active_agents);
    });
  });
});
