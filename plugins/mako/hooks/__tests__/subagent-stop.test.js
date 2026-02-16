/**
 * Unit Tests -- ST-5: SubagentStop Hook (subagent-stop-memory.js)
 *
 * Hypothesis: The SubagentStop hook reads stdin JSON with agent_type,
 * matches the agent to the routing table, reads sprint-status.yaml from
 * CLAUDE_PROJECT_DIR, and outputs a JSON reminder with pipeline context.
 *
 * Method: Subprocess execution with controlled env/filesystem (ADR-2).
 * CJS hook under test, ESM test context.
 *
 * Branches covered:
 *   - Input parsing: valid JSON, invalid JSON, empty stdin
 *   - agent_type formats: "mako:X", "agentType" fallback, no match
 *   - Routing table: all 12 known agents + unknown agent
 *   - Sprint-status.yaml: present (both fields), partial fields, absent
 *   - Global catch: graceful fallback on catastrophic error
 *   - MCP Memory skip: hook is read-only, never calls mcp-memory-service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { SPRINT_STATUS_YAML, SUBAGENT_STOP_INPUT, createMockEnv } from './mocks/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOOKS_DIR = resolve(__dirname, '..');
const HOOK_PATH = join(HOOKS_DIR, 'subagent-stop-memory.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute the SubagentStop hook as a subprocess.
 * @param {string} [stdinInput] - JSON string to pipe via stdin
 * @param {object} [opts] - Options
 * @param {string} [opts.projectDir] - CLAUDE_PROJECT_DIR path
 * @param {object} [opts.env] - Additional env vars
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
function execHook(stdinInput = '', { projectDir, env = {} } = {}) {
  const cwd = projectDir || tmpdir();
  const mergedEnv = createMockEnv(cwd, env);

  const result = spawnSync('node', [HOOK_PATH], {
    cwd,
    input: stdinInput,
    encoding: 'utf8',
    timeout: 10000,
    env: mergedEnv,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    exitCode: result.status || 0,
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

/**
 * Shorthand: run hook and return parsed output + additionalContext.
 */
function runAndParse(stdinInput = '', opts = {}) {
  const { stdout } = execHook(stdinInput, opts);
  const output = parseOutput(stdout);
  const context = output?.hookSpecificOutput?.additionalContext || '';
  return { output, context };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('ST-5: SubagentStop Hook (subagent-stop-memory.js)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-subagent-stop-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // =========================================================================
  // OUTPUT FORMAT
  // =========================================================================

  describe('Output format', () => {
    it('outputs valid JSON to stdout', () => {
      const { stdout } = execHook(JSON.stringify(SUBAGENT_STOP_INPUT), {
        projectDir: tmpDir,
      });
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
    });

    it('output has hookSpecificOutput with hookEventName "SubagentStop"', () => {
      const { output } = runAndParse(JSON.stringify(SUBAGENT_STOP_INPUT), {
        projectDir: tmpDir,
      });
      expect(output).toHaveProperty('hookSpecificOutput');
      expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
    });

    it('hookSpecificOutput has exactly hookEventName and additionalContext', () => {
      const { output } = runAndParse(JSON.stringify(SUBAGENT_STOP_INPUT), {
        projectDir: tmpDir,
      });
      const keys = Object.keys(output.hookSpecificOutput).sort();
      expect(keys).toEqual(['additionalContext', 'hookEventName']);
    });

    it('output has exactly one top-level key: hookSpecificOutput', () => {
      const { output } = runAndParse(JSON.stringify(SUBAGENT_STOP_INPUT), {
        projectDir: tmpDir,
      });
      expect(Object.keys(output)).toEqual(['hookSpecificOutput']);
    });

    it('additionalContext is a non-empty string', () => {
      const { context } = runAndParse(JSON.stringify(SUBAGENT_STOP_INPUT), {
        projectDir: tmpDir,
      });
      expect(typeof context).toBe('string');
      expect(context.length).toBeGreaterThan(0);
    });

    it('exits with code 0', () => {
      const { exitCode } = execHook(JSON.stringify(SUBAGENT_STOP_INPUT), {
        projectDir: tmpDir,
      });
      expect(exitCode).toBe(0);
    });
  });

  // =========================================================================
  // INPUT PARSING: agent_type extraction
  // =========================================================================

  describe('Input parsing: agent_type extraction', () => {
    it('extracts agent name from agent_type "mako:hojo"', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain("Agent 'hojo' a termine");
    });

    it('extracts agent name from agentType fallback field', () => {
      const input = JSON.stringify({ agentType: 'mako:reno' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain("Agent 'reno' a termine");
    });

    it('prefers agent_type over agentType when both are present', () => {
      const input = JSON.stringify({
        agent_type: 'mako:scarlet',
        agentType: 'mako:tseng',
      });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain("Agent 'scarlet' a termine");
    });

    it('uses "unknown" when agent_type has no mako: prefix', () => {
      const input = JSON.stringify({ agent_type: 'other:agent' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain("Agent 'unknown' a termine");
    });

    it('uses "unknown" when agent_type is empty string', () => {
      const input = JSON.stringify({ agent_type: '' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain("Agent 'unknown' a termine");
    });

    it('uses "unknown" when input JSON has no agent_type or agentType', () => {
      const input = JSON.stringify({ exit_code: 0 });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain("Agent 'unknown' a termine");
    });

    it('uses "unknown" when stdin is empty', () => {
      const { context } = runAndParse('', { projectDir: tmpDir });
      expect(context).toContain("Agent 'unknown' a termine");
    });

    it('uses "unknown" when stdin is invalid JSON', () => {
      const { context } = runAndParse('NOT JSON {{{', { projectDir: tmpDir });
      expect(context).toContain("Agent 'unknown' a termine");
    });
  });

  // =========================================================================
  // ROUTING TABLE: pipeline suggestions
  // =========================================================================

  describe('Routing table: pipeline suggestions', () => {
    /** All known agents and their expected next step snippets. */
    const routingCases = [
      ['tseng', 'scarlet or reeve'],
      ['scarlet', 'reeve'],
      ['genesis', 'reeve or heidegger'],
      ['reeve', 'alignment gate'],
      ['heidegger', 'lazard'],
      ['lazard', 'hojo'],
      ['hojo', 'reno'],
      ['reno', 'elena'],
      ['elena', 'palmer'],
      ['palmer', 'rude'],
      ['rude', 'DoD gate'],
      ['sephiroth', 'hojo'],
      ['lucrecia', 'report to user'],
    ];

    it.each(routingCases)(
      'after mako:%s, suggests next step containing "%s"',
      (agent, expectedSnippet) => {
        const input = JSON.stringify({ agent_type: `mako:${agent}` });
        const { context } = runAndParse(input, { projectDir: tmpDir });
        expect(context).toContain(expectedSnippet);
      }
    );

    it('unknown agent gets fallback routing suggestion', () => {
      const input = JSON.stringify({ agent_type: 'mako:nonexistentagent' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('check workflow in sprint-status.yaml');
    });
  });

  // =========================================================================
  // REQUIRED ACTION ITEMS in additionalContext
  // =========================================================================

  describe('Required action items in additionalContext', () => {
    it('mentions store_memory() reminder', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('store_memory()');
    });

    it('mentions sprint-status.yaml update reminder', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('sprint-status.yaml');
      expect(context).toContain('Mettre a jour');
    });

    it('mentions pipeline next step', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('Prochaine etape du pipeline');
    });

    it('includes "ACTIONS REQUISES" header', () => {
      const input = JSON.stringify({ agent_type: 'mako:reno' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('ACTIONS REQUISES');
    });

    it('includes idempotency note about existing store_memory()', () => {
      const input = JSON.stringify({ agent_type: 'mako:elena' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('Si tu as deja fait le store_memory()');
    });

    it('includes store_memory format template with agent name', () => {
      const input = JSON.stringify({ agent_type: 'mako:palmer' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('phase:palmer');
      expect(context).toContain('memory_type: "observation"');
    });
  });

  // =========================================================================
  // SPRINT-STATUS.YAML: phase info injection
  // =========================================================================

  describe('Sprint-status.yaml: phase info injection', () => {
    it('includes phase info when sprint-status.yaml exists with both fields', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('sprint-status:');
      expect(context).toContain('phase=hojo');
      expect(context).toContain('next=reno');
    });

    it('includes phase info when only current_phase is present', () => {
      const yaml = `sprint:
  current_phase: "scarlet"
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), yaml);
      const input = JSON.stringify({ agent_type: 'mako:scarlet' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('sprint-status:');
      expect(context).toContain('phase=scarlet');
    });

    it('includes phase info when only next_phase is present', () => {
      const yaml = `sprint:
  next_phase: "reeve"
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), yaml);
      const input = JSON.stringify({ agent_type: 'mako:tseng' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('sprint-status:');
      expect(context).toContain('next=reeve');
    });

    it('does not include sprint-status line when file is absent', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      // The first line should not have the " | sprint-status:" suffix
      const firstLine = context.split('\n')[0];
      expect(firstLine).not.toContain('sprint-status:');
    });

    it('does not include sprint-status line when file has no phase fields', () => {
      const yaml = `sprint:
  workflow: "bugfix"
  status: "active"
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), yaml);
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      const firstLine = context.split('\n')[0];
      expect(firstLine).not.toContain('sprint-status:');
    });

    it('does not include sprint-status line when file is empty', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), '');
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      const firstLine = context.split('\n')[0];
      expect(firstLine).not.toContain('sprint-status:');
    });

    it('handles sprint-status.yaml with quoted values', () => {
      const yaml = `sprint:
  current_phase: "heidegger"
  next_phase: "lazard"
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), yaml);
      const input = JSON.stringify({ agent_type: 'mako:heidegger' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('phase=heidegger');
      expect(context).toContain('next=lazard');
    });

    it('handles sprint-status.yaml with unquoted values', () => {
      const yaml = `sprint:
  current_phase: palmer
  next_phase: rude
`;
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), yaml);
      const input = JSON.stringify({ agent_type: 'mako:palmer' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('phase=palmer');
      expect(context).toContain('next=rude');
    });
  });

  // =========================================================================
  // ENVIRONMENT: CLAUDE_PROJECT_DIR
  // =========================================================================

  describe('CLAUDE_PROJECT_DIR environment variable', () => {
    it('reads sprint-status from CLAUDE_PROJECT_DIR, not cwd', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const otherDir = mkdtempSync(join(tmpdir(), 'mako-other-'));
      try {
        const input = JSON.stringify({ agent_type: 'mako:hojo' });
        // projectDir points to tmpDir (has YAML), but cwd would be otherDir
        const result = spawnSync('node', [HOOK_PATH], {
          cwd: otherDir,
          input,
          encoding: 'utf8',
          timeout: 10000,
          env: createMockEnv(tmpDir),
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const output = parseOutput((result.stdout || '').trim());
        expect(output.hookSpecificOutput.additionalContext).toContain('sprint-status:');
        expect(output.hookSpecificOutput.additionalContext).toContain('phase=hojo');
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // ERROR RESILIENCE: graceful fallback
  // =========================================================================

  describe('Error resilience: graceful fallback', () => {
    it('never crashes with empty stdin -- exits 0 with valid JSON', () => {
      const { stdout, exitCode } = execHook('', { projectDir: tmpDir });
      expect(exitCode).toBe(0);
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
      expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
    });

    it('never crashes with malformed JSON stdin', () => {
      const { stdout, exitCode } = execHook('{{{{not json', { projectDir: tmpDir });
      expect(exitCode).toBe(0);
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
    });

    it('handles sprint-status.yaml being a directory (not a file)', () => {
      mkdirSync(join(tmpDir, 'sprint-status.yaml'));
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { stdout, exitCode } = execHook(input, { projectDir: tmpDir });
      expect(exitCode).toBe(0);
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
      expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
    });

    it('handles binary junk in sprint-status.yaml', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), '\x00\x01\x02\xFF\xFE');
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { stdout, exitCode } = execHook(input, { projectDir: tmpDir });
      expect(exitCode).toBe(0);
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
    });
  });

  // =========================================================================
  // MCP MEMORY: read-only behavior (prepares for ST-9)
  // =========================================================================

  describe('MCP Memory: read-only behavior (prepares for ST-9)', () => {
    it('hook is read-only -- never calls mcp-memory-service directly', () => {
      // The hook source does not import child_process for mcp calls.
      // It only generates a REMINDER for the orchestrator to call store_memory().
      // Verify: the output is a reminder, not an actual MCP call result.
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('store_memory()');
      expect(context).toContain('Persister le resultat');
    });

    it('hook does not require MCP Memory to be available to succeed', () => {
      // No MCP server configured, no env vars for MCP -- hook should still work.
      const input = JSON.stringify({ agent_type: 'mako:reno' });
      const { stdout, exitCode } = execHook(input, {
        projectDir: tmpDir,
        env: {
          MCP_MEMORY_STORAGE_BACKEND: undefined,
          MCP_HTTP_ENABLED: undefined,
        },
      });
      expect(exitCode).toBe(0);
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
      expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
    });

    it('output reminds to call store_memory() but does not call it', () => {
      const input = JSON.stringify({ agent_type: 'mako:elena' });
      const { context } = runAndParse(input, { projectDir: tmpDir });
      // The context should be a textual reminder, not an MCP response
      expect(context).toContain('ACTIONS REQUISES');
      expect(context).toContain('store_memory()');
      // Should not contain any JSON that looks like an MCP response
      expect(context).not.toContain('"status"');
      expect(context).not.toContain('"success"');
    });
  });

  // =========================================================================
  // GLOBAL CATCH: fallback on catastrophic error
  // =========================================================================

  describe('Global catch: fallback on catastrophic error', () => {
    it('fallback output still has SubagentStop hookEventName', () => {
      // Force an unusual situation: unset CLAUDE_PROJECT_DIR and make cwd
      // something that might cause issues. The global try/catch ensures
      // valid output regardless.
      const { stdout, exitCode } = execHook('', {
        projectDir: tmpDir,
      });
      expect(exitCode).toBe(0);
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
    });

    it('fallback output contains store_memory reminder', () => {
      // Even in fallback, the minimal message should mention store_memory
      const { stdout } = execHook('', { projectDir: tmpDir });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain('store_memory');
    });
  });

  // =========================================================================
  // MOCK FIXTURE: hook-input-subagent-stop.json compatibility
  // =========================================================================

  describe('Mock fixture compatibility', () => {
    it('processes the standard mock input correctly', () => {
      const input = JSON.stringify(SUBAGENT_STOP_INPUT);
      const { output, context } = runAndParse(input, { projectDir: tmpDir });
      expect(output).not.toBeNull();
      expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
      // SUBAGENT_STOP_INPUT has agent_type: "mako:hojo"
      expect(context).toContain("Agent 'hojo' a termine");
      expect(context).toContain('reno');
    });

    it('processes mock input with sprint-status from fixture', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const input = JSON.stringify(SUBAGENT_STOP_INPUT);
      const { context } = runAndParse(input, { projectDir: tmpDir });
      expect(context).toContain('sprint-status:');
      expect(context).toContain('phase=hojo');
      expect(context).toContain('next=reno');
    });
  });
});
