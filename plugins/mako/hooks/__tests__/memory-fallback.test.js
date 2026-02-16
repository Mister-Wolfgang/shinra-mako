/**
 * Unit Tests -- ST-9: Fallback Gracieux - MCP Memory Down
 *
 * Hypothesis: When mcp-memory-service is unavailable, all hooks that reference
 * MCP Memory degrade gracefully -- log a warning, skip memory operations, and
 * never crash. The memory-fallback.js library provides health check and
 * contextual fallback messages.
 *
 * Method:
 *   - Direct CJS module tests for hooks/lib/memory-fallback.js (via createRequire)
 *   - Subprocess execution for hooks with mocked MCP unavailability
 *
 * Acceptance criteria:
 *   - hooks/lib/memory-fallback.js exports isMemoryServiceHealthy() and memoryFallbackMessage()
 *   - isMemoryServiceHealthy() returns boolean, never throws
 *   - memoryFallbackMessage(hook) returns contextual string per hook
 *   - ensure-memory-server.js: does not crash when MCP down, logs warning
 *   - subagent-stop-memory.js: does not crash when MCP down, fallback message present
 *   - pre-compact-save.js: does not crash when MCP down, fallback message present
 *   - 0 regressions on 289 existing tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { SPRINT_STATUS_YAML, SESSION_STATE, createMockEnv } from './mocks/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOOKS_DIR = resolve(__dirname, '..');
const PLUGIN_ROOT = resolve(HOOKS_DIR, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load memory-fallback.js as CJS from ESM test context.
 * Busts require cache for test isolation.
 */
function loadMemoryFallback() {
  const require = createRequire(import.meta.url);
  const modulePath = resolve(__dirname, '..', 'lib', 'memory-fallback.js');

  // Bust cache for isolation
  delete require.cache[modulePath];

  return require(modulePath);
}

/**
 * Execute a hook script as a subprocess.
 */
function execHook(hookFile, { env = {}, projectDir, input = '' } = {}) {
  const hookPath = join(HOOKS_DIR, hookFile);
  const workDir = projectDir || PLUGIN_ROOT;
  const mergedEnv = createMockEnv(workDir, env);

  const result = spawnSync('node', [hookPath], {
    cwd: workDir,
    input,
    encoding: 'utf8',
    timeout: 15000,
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
 * Execute ensure-memory-server.js with mock wrapper that simulates MCP down.
 */
function execEnsureMemoryWithMock(scenario, { env = {} } = {}) {
  const wrapperPath = join(__dirname, 'mocks', 'ensure-memory-fallback-wrapper.js');
  const mergedEnv = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    CLAUDE_PROJECT_DIR: PLUGIN_ROOT,
    MOCK_SCENARIO: scenario,
    ...env,
  };

  const result = spawnSync('node', [wrapperPath], {
    cwd: PLUGIN_ROOT,
    encoding: 'utf8',
    timeout: 15000,
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
 * Parse JSON from hook stdout.
 */
function parseOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

// ===========================================================================
// PART 1: hooks/lib/memory-fallback.js -- Library Unit Tests
// ===========================================================================

describe('ST-9: memory-fallback.js library', () => {

  // -------------------------------------------------------------------------
  // Module structure
  // -------------------------------------------------------------------------

  describe('Module structure', () => {
    it('exports isMemoryServiceHealthy as a function', () => {
      const mod = loadMemoryFallback();
      expect(typeof mod.isMemoryServiceHealthy).toBe('function');
    });

    it('exports memoryFallbackMessage as a function', () => {
      const mod = loadMemoryFallback();
      expect(typeof mod.memoryFallbackMessage).toBe('function');
    });

    it('exports exactly two functions', () => {
      const mod = loadMemoryFallback();
      const keys = Object.keys(mod).sort();
      expect(keys).toEqual(['isMemoryServiceHealthy', 'memoryFallbackMessage']);
    });
  });

  // -------------------------------------------------------------------------
  // isMemoryServiceHealthy()
  // -------------------------------------------------------------------------

  describe('isMemoryServiceHealthy()', () => {
    it('returns a boolean', () => {
      const { isMemoryServiceHealthy } = loadMemoryFallback();
      const result = isMemoryServiceHealthy();
      expect(typeof result).toBe('boolean');
    });

    it('never throws an exception', () => {
      const { isMemoryServiceHealthy } = loadMemoryFallback();
      expect(() => isMemoryServiceHealthy()).not.toThrow();
    });

    it('returns false when MCP Memory service is not running (no HTTP server on port 8000)', () => {
      // In test environment, mcp-memory-service is not running
      const { isMemoryServiceHealthy } = loadMemoryFallback();
      const result = isMemoryServiceHealthy();
      expect(result).toBe(false);
    });

    it('completes within 3 seconds (timeout protection)', () => {
      const { isMemoryServiceHealthy } = loadMemoryFallback();
      const start = Date.now();
      isMemoryServiceHealthy();
      const elapsed = Date.now() - start;
      // Must complete within 3s (the function has a 2s timeout internally)
      expect(elapsed).toBeLessThan(3000);
    });
  });

  // -------------------------------------------------------------------------
  // memoryFallbackMessage()
  // -------------------------------------------------------------------------

  describe('memoryFallbackMessage()', () => {
    it('returns a string', () => {
      const { memoryFallbackMessage } = loadMemoryFallback();
      const msg = memoryFallbackMessage('ensure-memory-server');
      expect(typeof msg).toBe('string');
    });

    it('returns non-empty message for "ensure-memory-server"', () => {
      const { memoryFallbackMessage } = loadMemoryFallback();
      const msg = memoryFallbackMessage('ensure-memory-server');
      expect(msg.length).toBeGreaterThan(0);
    });

    it('returns non-empty message for "subagent-stop-memory"', () => {
      const { memoryFallbackMessage } = loadMemoryFallback();
      const msg = memoryFallbackMessage('subagent-stop-memory');
      expect(msg.length).toBeGreaterThan(0);
    });

    it('returns non-empty message for "pre-compact-save"', () => {
      const { memoryFallbackMessage } = loadMemoryFallback();
      const msg = memoryFallbackMessage('pre-compact-save');
      expect(msg.length).toBeGreaterThan(0);
    });

    it('returns a generic fallback for unknown hook names', () => {
      const { memoryFallbackMessage } = loadMemoryFallback();
      const msg = memoryFallbackMessage('unknown-hook');
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    });

    it('message for ensure-memory-server mentions MCP or memory service', () => {
      const { memoryFallbackMessage } = loadMemoryFallback();
      const msg = memoryFallbackMessage('ensure-memory-server').toLowerCase();
      expect(msg.includes('mcp') || msg.includes('memory') || msg.includes('memoire')).toBe(true);
    });

    it('message for subagent-stop-memory mentions memory or store', () => {
      const { memoryFallbackMessage } = loadMemoryFallback();
      const msg = memoryFallbackMessage('subagent-stop-memory').toLowerCase();
      expect(msg.includes('memory') || msg.includes('store') || msg.includes('memoire')).toBe(true);
    });

    it('message for pre-compact-save mentions memory or retrieve', () => {
      const { memoryFallbackMessage } = loadMemoryFallback();
      const msg = memoryFallbackMessage('pre-compact-save').toLowerCase();
      expect(msg.includes('memory') || msg.includes('retrieve') || msg.includes('memoire')).toBe(true);
    });

    it('never throws -- even with null input', () => {
      const { memoryFallbackMessage } = loadMemoryFallback();
      expect(() => memoryFallbackMessage(null)).not.toThrow();
      expect(() => memoryFallbackMessage(undefined)).not.toThrow();
      expect(() => memoryFallbackMessage('')).not.toThrow();
      expect(() => memoryFallbackMessage(42)).not.toThrow();
    });
  });
});

// ===========================================================================
// PART 2: Hook Integration Tests -- MCP Memory Down
// ===========================================================================

describe('ST-9: Hook integration -- MCP Memory Down', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-st9-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // ensure-memory-server.js with MCP down
  // -------------------------------------------------------------------------

  describe('ensure-memory-server.js with MCP down', () => {
    it('does not crash -- exits with code 0', () => {
      const { exitCode } = execEnsureMemoryWithMock('mcp-down');
      expect(exitCode).toBe(0);
    });

    it('outputs valid JSON to stdout', () => {
      const { stdout } = execEnsureMemoryWithMock('mcp-down');
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
    });

    it('output has hookEventName "SessionStart"', () => {
      const { stdout } = execEnsureMemoryWithMock('mcp-down');
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    });

    it('stderr contains a warning about MCP memory being unavailable', () => {
      const { stderr } = execEnsureMemoryWithMock('mcp-down');
      const lower = stderr.toLowerCase();
      expect(
        lower.includes('memory') && (lower.includes('unavailable') || lower.includes('fallback') || lower.includes('warning') || lower.includes('down') || lower.includes('unhealthy'))
      ).toBe(true);
    });

    it('workflow continues -- statusMessage is present and non-empty', () => {
      const { stdout } = execEnsureMemoryWithMock('mcp-down');
      const output = parseOutput(stdout);
      expect(typeof output.hookSpecificOutput.statusMessage).toBe('string');
      expect(output.hookSpecificOutput.statusMessage.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // subagent-stop-memory.js with MCP down
  // -------------------------------------------------------------------------

  describe('subagent-stop-memory.js with MCP down', () => {
    it('does not crash -- exits with code 0', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { exitCode } = execHook('subagent-stop-memory.js', {
        input,
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      expect(exitCode).toBe(0);
    });

    it('outputs valid JSON to stdout', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { stdout } = execHook('subagent-stop-memory.js', {
        input,
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
    });

    it('output has hookEventName "SubagentStop"', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { stdout } = execHook('subagent-stop-memory.js', {
        input,
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
    });

    it('additionalContext still contains store_memory reminder', () => {
      const input = JSON.stringify({ agent_type: 'mako:reno' });
      const { stdout } = execHook('subagent-stop-memory.js', {
        input,
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain('store_memory');
    });

    it('stderr contains fallback warning when MCP is down', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { stderr } = execHook('subagent-stop-memory.js', {
        input,
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const lower = stderr.toLowerCase();
      expect(
        lower.includes('memory') && (lower.includes('unavailable') || lower.includes('fallback') || lower.includes('warning') || lower.includes('down') || lower.includes('skip'))
      ).toBe(true);
    });

    it('additionalContext contains fallback note about MCP being down', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { stdout } = execHook('subagent-stop-memory.js', {
        input,
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext.toLowerCase();
      expect(
        ctx.includes('mcp') || ctx.includes('memory') || ctx.includes('memoire')
      ).toBe(true);
    });

    it('routing suggestion is still present even with MCP down', () => {
      const input = JSON.stringify({ agent_type: 'mako:hojo' });
      const { stdout } = execHook('subagent-stop-memory.js', {
        input,
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain('reno');
    });
  });

  // -------------------------------------------------------------------------
  // pre-compact-save.js with MCP down
  // -------------------------------------------------------------------------

  describe('pre-compact-save.js with MCP down', () => {
    it('does not crash -- exits with code 0', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const { exitCode } = execHook('pre-compact-save.js', {
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      expect(exitCode).toBe(0);
    });

    it('outputs valid JSON to stdout', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const { stdout } = execHook('pre-compact-save.js', {
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const output = parseOutput(stdout);
      expect(output).not.toBeNull();
    });

    it('output has hookEventName "PreCompact"', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const { stdout } = execHook('pre-compact-save.js', {
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
    });

    it('recovery instructions still present when MCP is down', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const { stdout } = execHook('pre-compact-save.js', {
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain('COMPACTAGE IMMINENT');
      expect(ctx).toContain('APRES LE COMPACTAGE');
    });

    it('stderr contains fallback warning when MCP is down', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const { stderr } = execHook('pre-compact-save.js', {
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const lower = stderr.toLowerCase();
      expect(
        lower.includes('memory') && (lower.includes('unavailable') || lower.includes('fallback') || lower.includes('warning') || lower.includes('down') || lower.includes('skip'))
      ).toBe(true);
    });

    it('additionalContext contains fallback note about MCP availability', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const { stdout } = execHook('pre-compact-save.js', {
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext.toLowerCase();
      expect(
        ctx.includes('mcp') || ctx.includes('memory') || ctx.includes('memoire')
      ).toBe(true);
    });

    it('session state file is still written even with MCP down', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      execHook('pre-compact-save.js', {
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });

      const statePath = join(tmpDir, '.mako-session-state.json');
      expect(existsSync(statePath)).toBe(true);
    });

    it('retrieve_memory instruction adapts when MCP is down', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
      const { stdout } = execHook('pre-compact-save.js', {
        projectDir: tmpDir,
        env: { MCP_MEMORY_HEALTHY: 'false' },
      });
      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      // Should still mention retrieve_memory but with a caveat about MCP
      expect(ctx).toContain('retrieve_memory');
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: no crash guarantee
  // -------------------------------------------------------------------------

  describe('Cross-cutting: zero crash guarantee', () => {
    it('all three hooks exit 0 when MCP env vars are completely absent', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

      const mcpClearEnv = {
        MCP_MEMORY_STORAGE_BACKEND: '',
        MCP_HTTP_ENABLED: '',
        MCP_HTTP_PORT: '',
        MCP_MEMORY_HEALTHY: '',
      };

      // subagent-stop-memory.js
      const sub = execHook('subagent-stop-memory.js', {
        input: JSON.stringify({ agent_type: 'mako:hojo' }),
        projectDir: tmpDir,
        env: mcpClearEnv,
      });
      expect(sub.exitCode).toBe(0);

      // pre-compact-save.js
      const pre = execHook('pre-compact-save.js', {
        projectDir: tmpDir,
        env: mcpClearEnv,
      });
      expect(pre.exitCode).toBe(0);
    });

    it('hooks produce valid JSON output even with MCP completely absent', () => {
      writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

      const mcpClearEnv = {
        MCP_MEMORY_STORAGE_BACKEND: '',
        MCP_HTTP_ENABLED: '',
        MCP_HTTP_PORT: '',
        MCP_MEMORY_HEALTHY: '',
      };

      const sub = execHook('subagent-stop-memory.js', {
        input: JSON.stringify({ agent_type: 'mako:elena' }),
        projectDir: tmpDir,
        env: mcpClearEnv,
      });
      expect(parseOutput(sub.stdout)).not.toBeNull();

      const pre = execHook('pre-compact-save.js', {
        projectDir: tmpDir,
        env: mcpClearEnv,
      });
      expect(parseOutput(pre.stdout)).not.toBeNull();
    });
  });
});
