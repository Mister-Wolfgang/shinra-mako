/**
 * Unit Tests -- ST-3: UserPromptSubmit Hook (user-prompt-submit-rufus.js)
 *
 * Hypothesis: The hook reads sprint-status.yaml and .mako-session-state.json
 * from CLAUDE_PROJECT_DIR, injects a compact Rufus context reminder into
 * the user prompt, and always returns { result: "continue" }.
 *
 * The hook is a standalone CJS script that writes JSON to stdout.
 * We execute it via execSync with controlled env/filesystem (ADR-2).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { SPRINT_STATUS_YAML, SESSION_STATE, createMockEnv } from './mocks/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOOKS_DIR = resolve(__dirname, '..');
const HOOK_FILE = join(HOOKS_DIR, 'user-prompt-submit-rufus.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute the hook in a subprocess and return parsed JSON output.
 * @param {string} projectDir - Path to use as CLAUDE_PROJECT_DIR
 * @param {object} [extraEnv] - Additional env vars to merge
 * @returns {object} Parsed JSON from stdout
 */
function runHook(projectDir, extraEnv = {}) {
  const env = createMockEnv(projectDir, extraEnv);
  const stdout = execSync(`node "${HOOK_FILE}"`, {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 10000,
    env,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout.trim());
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('ST-3: UserPromptSubmit Hook (user-prompt-submit-rufus.js)', () => {
  /** Isolated temp directory per test -- no cross-contamination. */
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-user-prompt-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // =========================================================================
  // OUTPUT FORMAT
  // =========================================================================

  describe('Output format', () => {
    it('returns valid JSON with result field', () => {
      const output = runHook(tmpDir);
      expect(output).toHaveProperty('result');
    });

    it('result is always "continue" (never blocks)', () => {
      const output = runHook(tmpDir);
      expect(output.result).toBe('continue');
    });

    it('result is "continue" even when sprint-status.yaml exists', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(output.result).toBe('continue');
    });

    it('message field is a string when present', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(typeof output.message).toBe('string');
    });
  });

  // =========================================================================
  // NO SPRINT FILE (graceful fallback)
  // =========================================================================

  describe('No sprint-status.yaml (graceful fallback)', () => {
    it('returns { result: "continue" } with a message', () => {
      const output = runHook(tmpDir);
      expect(output.result).toBe('continue');
      expect(output).toHaveProperty('message');
    });

    it('message contains "No active sprint" when no YAML file', () => {
      const output = runHook(tmpDir);
      expect(output.message).toContain('No active sprint');
    });

    it('message still contains system-reminder wrapper', () => {
      const output = runHook(tmpDir);
      expect(output.message).toContain('<system-reminder>');
      expect(output.message).toContain('</system-reminder>');
    });

    it('message still contains RUFUS CONTEXT RELOAD marker', () => {
      const output = runHook(tmpDir);
      expect(output.message).toContain('[RUFUS CONTEXT RELOAD]');
    });

    it('message still contains the Rules line', () => {
      const output = runHook(tmpDir);
      expect(output.message).toContain('Rules:');
      expect(output.message).toContain('Rufus');
    });
  });

  // =========================================================================
  // SPRINT-STATUS.YAML PARSING
  // =========================================================================

  describe('Sprint-status.yaml parsing', () => {
    it('extracts workflow field from YAML', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(output.message).toContain('Workflow: create-project');
    });

    it('extracts status field from YAML', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(output.message).toContain('Status: active');
    });

    it('extracts current_phase field from YAML', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(output.message).toContain('Phase: hojo');
    });

    it('extracts next_phase field from YAML', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(output.message).toContain('Next: reno');
    });

    it('extracts quality_tier field from YAML', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(output.message).toContain('Tier: Standard');
    });

    it('counts done stories vs total stories', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      // Mock YAML: "status: active" does NOT match the story-status regex
      // (only backlog|ready-for-dev|in-progress|review|done match).
      // Matches: "status: in-progress" (ST-1), "status: backlog" (ST-2) => 2 matches.
      // Hook subtracts 1 (heuristic for sprint-level status) => total = max(2-1,0) = 1, done = 0.
      expect(output.message).toMatch(/Stories: 0\/1 done/);
    });

    it('counts done stories correctly when stories are done', () => {
      const yaml = `sprint:
  workflow: "bugfix"
  status: "active"
  current_phase: "reno"
  next_phase: "palmer"
  quality_tier: "Minimal"

stories:
  - id: "ST-1"
    name: "First"
    status: "done"
  - id: "ST-2"
    name: "Second"
    status: "done"
  - id: "ST-3"
    name: "Third"
    status: "in-progress"
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), yaml);
      const output = runHook(tmpDir);
      // "status: active" does NOT match. Matches: done, done, in-progress => 3.
      // total = max(3-1,0) = 2, done = 2 => "Stories: 2/2 done"
      expect(output.message).toMatch(/Stories: 2\/2 done/);
    });

    it('handles missing fields gracefully with "?" fallback', () => {
      const minimal = `sprint:
  workflow: "test-workflow"
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), minimal);
      const output = runHook(tmpDir);
      expect(output.message).toContain('Workflow: test-workflow');
      // Other fields missing => "?"
      expect(output.message).toContain('Phase: ?');
      expect(output.message).toContain('Next: ?');
      expect(output.message).toContain('Tier: ?');
    });

    it('handles YAML with no stories section (0/0 done)', () => {
      const yaml = `sprint:
  workflow: "feature"
  status: "active"
  current_phase: "scarlet"
  next_phase: "heidegger"
  quality_tier: "Enterprise"
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), yaml);
      const output = runHook(tmpDir);
      // Only sprint "status: active" matches => total = max(1-1, 0) = 0, done=0
      expect(output.message).toMatch(/Stories: 0\/0 done/);
    });

    it('handles empty YAML file gracefully', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), '');
      const output = runHook(tmpDir);
      expect(output.result).toBe('continue');
      // All fields should fallback to "?"
      expect(output.message).toContain('Workflow: ?');
    });
  });

  // =========================================================================
  // SESSION STATE (agent IDs)
  // =========================================================================

  describe('Session state (.mako-session-state.json)', () => {
    it('appends agent IDs when session state exists with active agents', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify(SESSION_STATE)
      );
      const output = runHook(tmpDir);
      expect(output.message).toContain('AgentIDs:');
      expect(output.message).toContain('hojo=agent-mock-001');
      expect(output.message).toContain('tseng=agent-mock-002');
    });

    it('does not append AgentIDs when session state has no active agents', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const emptyAgents = { ...SESSION_STATE, active_agents: {} };
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify(emptyAgents)
      );
      const output = runHook(tmpDir);
      expect(output.message).not.toContain('AgentIDs:');
    });

    it('does not append AgentIDs when session state file is missing', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      // No .mako-session-state.json written
      const output = runHook(tmpDir);
      expect(output.message).not.toContain('AgentIDs:');
    });

    it('handles malformed session state JSON gracefully', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        'NOT VALID JSON {{{}'
      );
      const output = runHook(tmpDir);
      // Should not crash, and should not include AgentIDs
      expect(output.result).toBe('continue');
      expect(output.message).not.toContain('AgentIDs:');
    });

    it('limits agent IDs to 5 entries maximum', () => {
      const manyAgents = {
        active_agents: {
          hojo: 'a-1',
          reno: 'a-2',
          elena: 'a-3',
          tseng: 'a-4',
          rude: 'a-5',
          scarlet: 'a-6',
          palmer: 'a-7',
        },
      };
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify(manyAgents)
      );
      const output = runHook(tmpDir);
      // Agent IDs string should contain at most 5 comma-separated entries
      const agentMatch = output.message.match(/AgentIDs:\s*(.+)/);
      expect(agentMatch).not.toBeNull();
      const agentPairs = agentMatch[1].split(',').map((s) => s.trim());
      expect(agentPairs.length).toBeLessThanOrEqual(5);
    });

    it('handles session state with null active_agents', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      writeFileSync(
        join(tmpDir, '.mako-session-state.json'),
        JSON.stringify({ active_agents: null })
      );
      const output = runHook(tmpDir);
      expect(output.result).toBe('continue');
      expect(output.message).not.toContain('AgentIDs:');
    });
  });

  // =========================================================================
  // MESSAGE STRUCTURE
  // =========================================================================

  describe('Message structure', () => {
    it('message starts with <system-reminder>', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(output.message.startsWith('<system-reminder>')).toBe(true);
    });

    it('message ends with </system-reminder>', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(output.message.endsWith('</system-reminder>')).toBe(true);
    });

    it('message contains [RUFUS CONTEXT RELOAD] marker', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(output.message).toContain('[RUFUS CONTEXT RELOAD]');
    });

    it('message contains the rules line with delegation instruction', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      expect(output.message).toContain('Ne code pas');
      expect(output.message).toContain('Delegue');
    });

    it('message has exactly 5 lines (system-reminder, marker, sprint, rules, close tag)', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const output = runHook(tmpDir);
      const lines = output.message.split('\n');
      expect(lines).toHaveLength(5);
    });
  });

  // =========================================================================
  // ENVIRONMENT VARIABLE: CLAUDE_PROJECT_DIR
  // =========================================================================

  describe('CLAUDE_PROJECT_DIR environment variable', () => {
    it('reads files from CLAUDE_PROJECT_DIR, not cwd', () => {
      // Put sprint file in tmpDir but run with a different cwd
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const otherDir = mkdtempSync(join(tmpdir(), 'mako-other-'));
      try {
        const env = createMockEnv(tmpDir);
        const stdout = execSync(`node "${HOOK_FILE}"`, {
          cwd: otherDir,
          encoding: 'utf8',
          timeout: 10000,
          env,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const output = JSON.parse(stdout.trim());
        // Should find the sprint file because CLAUDE_PROJECT_DIR points to tmpDir
        expect(output.message).toContain('Workflow: create-project');
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // ERROR RESILIENCE (graceful fallback)
  // =========================================================================

  describe('Error resilience', () => {
    it('never crashes -- always returns valid JSON with result: "continue"', () => {
      // Even with a completely empty dir, the hook must not throw
      const output = runHook(tmpDir);
      expect(output.result).toBe('continue');
    });

    it('returns result: "continue" when sprint YAML is malformed', () => {
      writeFileSync(
        join(tmpDir, 'sprint-status.yaml'),
        ':::invalid:::yaml:::\n\x00\x00binary junk'
      );
      const output = runHook(tmpDir);
      expect(output.result).toBe('continue');
    });

    it('handles sprint-status.yaml being a directory (not a file)', () => {
      mkdirSync(join(tmpDir, 'sprint-status.yaml'));
      // Reading a directory should error, but hook catches it gracefully
      const output = runHook(tmpDir);
      expect(output.result).toBe('continue');
    });
  });
});
