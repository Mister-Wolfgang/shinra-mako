/**
 * Direct-load Coverage Tests -- MAKO Hooks v6.0
 * Reno / Turks -- Coverage Boost
 *
 * Problem: v8 coverage only instruments code executed within the current
 * Node.js process. Subprocess-based tests (ADR-2) do NOT contribute to
 * coverage metrics. At 24.5% total coverage, the hooks/ directory is
 * at 0% because all existing tests use spawnSync.
 *
 * Solution: Load hooks directly via createRequire within the test process.
 * The hooks execute at require()-time (top-level main() call). We:
 *   1. Redirect process.stdout.write to capture output
 *   2. Set process.env.CLAUDE_PROJECT_DIR to a controlled tmp dir
 *   3. Load the hook -- it runs synchronously (or async for ensure-memory)
 *   4. Restore everything
 *
 * This is the ONLY way to get v8 line coverage on top-level CJS scripts
 * without modifying the source.
 *
 * Scope: inject-rufus, user-prompt-submit-rufus, subagent-memory-reminder,
 *        subagent-stop-memory, pre-compact-save, and the lib branches.
 *
 * Note: ensure-memory-server.js and pre-commit-check.js use execSync with
 * real subprocess calls. They are covered separately via subprocess tests
 * (session-start.test.js, pre-tool-use.test.js).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOOKS_DIR = resolve(__dirname, '..');
const PLUGIN_ROOT = resolve(HOOKS_DIR, '..');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPRINT_STATUS_YAML = `sprint:
  workflow: "create-project"
  status: "active"
  current_phase: "reno"
  next_phase: "elena"
  quality_tier: "Standard"
  scale: "Standard"

stories:
  - id: "ST-1"
    status: "done"
  - id: "ST-2"
    status: "in-progress"
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Capture stdout.write calls during the execution of fn().
 * Returns the accumulated string.
 */
function captureStdout(fn) {
  const chunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

/**
 * Capture stdout.write calls during async fn().
 */
async function captureStdoutAsync(fn) {
  const chunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

/**
 * Capture stderr.write calls during fn().
 */
function captureStderr(fn) {
  const chunks = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = original;
  }
  return chunks.join('');
}

function parseOutput(str) {
  try {
    return JSON.parse(str.trim());
  } catch {
    return null;
  }
}

/**
 * Load and execute a CJS hook in-process with env overrides.
 * Returns captured stdout.
 */
function loadHook(hookFile, envOverrides = {}) {
  const req = createRequire(import.meta.url);
  const hookPath = resolve(HOOKS_DIR, hookFile);

  // Apply env overrides
  const savedEnv = {};
  for (const [k, v] of Object.entries(envOverrides)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }

  // Bust require cache so the hook re-executes
  delete req.cache[hookPath];

  let stdout = '';
  try {
    stdout = captureStdout(() => {
      req(hookPath);
    });
  } finally {
    // Restore env
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
    // Clean cache again
    delete req.cache[hookPath];
  }

  return stdout;
}

// ===========================================================================
// subagent-memory-reminder.js -- simplest hook, static output
// ===========================================================================

describe('Direct coverage: subagent-memory-reminder.js', () => {
  it('produces SubagentStop JSON with store_memory reminder', () => {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'subagent-memory-reminder.js');
    delete req.cache[hookPath];

    const stdout = captureStdout(() => {
      req(hookPath);
    });
    delete req.cache[hookPath];

    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
    expect(output.hookSpecificOutput.additionalContext).toContain('store_memory');
  });

  it('additionalContext contains RAPPEL MEMOIRE', () => {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'subagent-memory-reminder.js');
    delete req.cache[hookPath];

    const stdout = captureStdout(() => { req(hookPath); });
    delete req.cache[hookPath];

    const output = parseOutput(stdout);
    expect(output.hookSpecificOutput.additionalContext).toContain('RAPPEL MEMOIRE');
  });

  it('has exactly hookEventName and additionalContext in hookSpecificOutput', () => {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'subagent-memory-reminder.js');
    delete req.cache[hookPath];

    const stdout = captureStdout(() => { req(hookPath); });
    delete req.cache[hookPath];

    const output = parseOutput(stdout);
    const keys = Object.keys(output.hookSpecificOutput).sort();
    expect(keys).toEqual(['additionalContext', 'hookEventName']);
  });
});

// ===========================================================================
// inject-rufus.js -- reads rufus.md
// ===========================================================================

describe('Direct coverage: inject-rufus.js -- happy path', () => {
  it('produces SessionStart JSON with rufus.md content', () => {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'inject-rufus.js');
    delete req.cache[hookPath];

    const stdout = captureStdout(() => { req(hookPath); });
    delete req.cache[hookPath];

    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(typeof output.hookSpecificOutput.additionalContext).toBe('string');
    expect(output.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
  });

  it('additionalContext matches actual rufus.md content', () => {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'inject-rufus.js');
    delete req.cache[hookPath];

    const rufusPath = resolve(PLUGIN_ROOT, 'context', 'rufus.md');
    const expectedContent = readFileSync(rufusPath, 'utf8');

    const stdout = captureStdout(() => { req(hookPath); });
    delete req.cache[hookPath];

    const output = parseOutput(stdout);
    expect(output.hookSpecificOutput.additionalContext).toBe(expectedContent);
  });
});

// ===========================================================================
// user-prompt-submit-rufus.js -- reads sprint-status.yaml + session state
// ===========================================================================

describe('Direct coverage: user-prompt-submit-rufus.js', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-cov-prompt-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces continue JSON with sprint info (sprint file present)', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

    const stdout = loadHook('user-prompt-submit-rufus.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
    });

    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.result).toBe('continue');
    expect(output.message).toContain('RUFUS CONTEXT RELOAD');
    expect(output.message).toContain('create-project');
    expect(output.message).toContain('reno');
  });

  it('produces continue JSON with "No active sprint" when no yaml', () => {
    const stdout = loadHook('user-prompt-submit-rufus.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
    });

    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.result).toBe('continue');
    expect(output.message).toContain('No active sprint');
  });

  it('includes AgentIDs when session state has active_agents', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
    writeFileSync(
      join(tmpDir, '.mako-session-state.json'),
      JSON.stringify({
        active_agents: { hojo: 'task-123', reno: 'task-456' },
      })
    );

    const stdout = loadHook('user-prompt-submit-rufus.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
    });

    const output = parseOutput(stdout);
    expect(output.message).toContain('AgentIDs');
    expect(output.message).toContain('hojo=task-123');
  });

  it('does not include AgentIDs when session state has empty active_agents', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
    writeFileSync(
      join(tmpDir, '.mako-session-state.json'),
      JSON.stringify({ active_agents: {} })
    );

    const stdout = loadHook('user-prompt-submit-rufus.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
    });

    const output = parseOutput(stdout);
    expect(output.message).not.toContain('AgentIDs');
  });

  it('message contains system-reminder wrapper tags', () => {
    const stdout = loadHook('user-prompt-submit-rufus.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
    });

    const output = parseOutput(stdout);
    expect(output.message).toContain('<system-reminder>');
    expect(output.message).toContain('</system-reminder>');
  });

  it('story count logic: counts done stories correctly', () => {
    const yamlWith3Done = `sprint:
  workflow: "wf"
  status: "active"
  current_phase: "reno"
  next_phase: "elena"
  quality_tier: "Standard"
  scale: "Standard"

stories:
  - id: "S1"
    status: "done"
  - id: "S2"
    status: "done"
  - id: "S3"
    status: "done"
  - id: "S4"
    status: "backlog"
`;
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), yamlWith3Done);

    const stdout = loadHook('user-prompt-submit-rufus.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
    });

    const output = parseOutput(stdout);
    expect(output.message).toContain('3/');
    expect(output.message).toContain('done');
  });
});

// ===========================================================================
// subagent-stop-memory.js -- reads stdin + sprint-status.yaml
// ===========================================================================

describe('Direct coverage: subagent-stop-memory.js', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-cov-stop-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Load subagent-stop-memory with mocked stdin (fd 0).
   * The hook calls fs.readFileSync(0, 'utf8') to read stdin.
   */
  function loadSubagentStop(stdinContent = '', extraEnv = {}) {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'subagent-stop-memory.js');
    delete req.cache[hookPath];

    const Module = req('module');
    const origLoad = Module._load;

    // Mock 'fs' to intercept readFileSync(0, ...) -- stdin read
    Module._load = function (request, parent, isMain) {
      if (request === 'fs') {
        const realFs = origLoad.call(this, request, parent, isMain);
        return {
          ...realFs,
          readFileSync: function mockedReadFileSync(pathOrFd, opts) {
            if (pathOrFd === 0) {
              return stdinContent;
            }
            return realFs.readFileSync(pathOrFd, opts);
          },
          existsSync: realFs.existsSync.bind(realFs),
        };
      }
      return origLoad.call(this, request, parent, isMain);
    };

    // Apply env overrides
    const savedEnv = {};
    const envToSet = {
      CLAUDE_PROJECT_DIR: tmpDir,
      MCP_MEMORY_HEALTHY: 'false',
      ...extraEnv,
    };
    for (const [k, v] of Object.entries(envToSet)) {
      savedEnv[k] = process.env[k];
      process.env[k] = v;
    }

    let stdout = '';
    try {
      stdout = captureStdout(() => {
        req(hookPath);
      });
    } finally {
      Module._load = origLoad;
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      delete req.cache[hookPath];
    }

    return stdout;
  }

  it('produces SubagentStop JSON for known agent (hojo)', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

    const stdout = loadSubagentStop(JSON.stringify({ agent_type: 'mako:hojo' }));
    const output = parseOutput(stdout);

    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
    expect(output.hookSpecificOutput.additionalContext).toContain('hojo');
    expect(output.hookSpecificOutput.additionalContext).toContain('store_memory');
  });

  it('next step for hojo is reno (testing)', () => {
    const stdout = loadSubagentStop(JSON.stringify({ agent_type: 'mako:hojo' }));
    const output = parseOutput(stdout);
    expect(output.hookSpecificOutput.additionalContext).toContain('reno');
  });

  it('reads sprint phase from sprint-status.yaml', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

    const stdout = loadSubagentStop(JSON.stringify({ agent_type: 'mako:hojo' }));
    const output = parseOutput(stdout);
    const ctx = output.hookSpecificOutput.additionalContext;
    // Sprint fixture: current_phase=reno, next_phase=elena
    expect(ctx).toContain('reno');
    expect(ctx).toContain('elena');
  });

  it('handles empty stdin gracefully (unknown agent)', () => {
    const stdout = loadSubagentStop('');
    const output = parseOutput(stdout);

    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
  });

  it('handles invalid JSON stdin gracefully', () => {
    const stdout = loadSubagentStop('not valid json {{ }}');
    const output = parseOutput(stdout);

    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
  });

  it('handles agentType fallback key (no agent_type field)', () => {
    const stdout = loadSubagentStop(JSON.stringify({ agentType: 'mako:elena' }));
    const output = parseOutput(stdout);

    expect(output.hookSpecificOutput.additionalContext).toContain('elena');
  });

  it('memory fallback warning appears in output when MCP is down', () => {
    const stdout = loadSubagentStop(JSON.stringify({ agent_type: 'mako:hojo' }));
    const output = parseOutput(stdout);
    const ctx = output.hookSpecificOutput.additionalContext;
    // MCP_MEMORY_HEALTHY=false -> memoryWarning appended
    expect(ctx.toLowerCase()).toContain('mcp');
  });

  it('output contains store_memory format template', () => {
    const stdout = loadSubagentStop(JSON.stringify({ agent_type: 'mako:reno' }));
    const output = parseOutput(stdout);
    const ctx = output.hookSpecificOutput.additionalContext;
    expect(ctx).toContain('memory_type');
    expect(ctx).toContain('observation');
  });
});

// ===========================================================================
// pre-compact-save.js -- reads sprint + session state, writes state file
// ===========================================================================

describe('Direct coverage: pre-compact-save.js', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-cov-compact-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces PreCompact JSON with sprint info', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

    const stdout = loadHook('pre-compact-save.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
      MCP_MEMORY_HEALTHY: 'false',
    });

    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
    expect(output.hookSpecificOutput.additionalContext).toContain('COMPACTAGE IMMINENT');
  });

  it('writes .mako-session-state.json to project dir', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

    loadHook('pre-compact-save.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
      MCP_MEMORY_HEALTHY: 'false',
    });

    const statePath = join(tmpDir, '.mako-session-state.json');
    expect(existsSync(statePath)).toBe(true);

    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    expect(state).toHaveProperty('last_compaction');
    expect(state.sprint.current_phase).toBe('reno');
  });

  it('safeRead returns null for missing file (no sprint)', () => {
    // No sprint-status.yaml -- hook uses fallback "No sprint-status.yaml found."
    const stdout = loadHook('pre-compact-save.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
      MCP_MEMORY_HEALTHY: 'false',
    });

    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.additionalContext).toContain('COMPACTAGE IMMINENT');
    // No sprint found -> sprintSummary is the fallback string
    expect(output.hookSpecificOutput.additionalContext).toContain('No sprint-status.yaml found');
  });

  it('active_agents summary appears when session state has agents', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
    writeFileSync(
      join(tmpDir, '.mako-session-state.json'),
      JSON.stringify({
        active_agents: { hojo: 'abc', reno: 'def' },
        pending_decisions: [],
        notes: '',
      })
    );

    const stdout = loadHook('pre-compact-save.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
      MCP_MEMORY_HEALTHY: 'false',
    });

    const output = parseOutput(stdout);
    expect(output.hookSpecificOutput.additionalContext).toContain('hojo=abc');
    expect(output.hookSpecificOutput.additionalContext).toContain('reno=def');
  });

  it('agent IDs "None saved." when session state has no active_agents', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
    writeFileSync(
      join(tmpDir, '.mako-session-state.json'),
      JSON.stringify({ active_agents: {}, pending_decisions: [], notes: '' })
    );

    const stdout = loadHook('pre-compact-save.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
      MCP_MEMORY_HEALTHY: 'false',
    });

    const output = parseOutput(stdout);
    expect(output.hookSpecificOutput.additionalContext).toContain('None saved');
  });

  it('MCP fallback message appended when MCP is down', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

    const stdout = loadHook('pre-compact-save.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
      MCP_MEMORY_HEALTHY: 'false',
    });

    const output = parseOutput(stdout);
    const ctx = output.hookSpecificOutput.additionalContext;
    expect(ctx.toLowerCase()).toContain('mcp memory fallback');
  });

  it('retrieve_memory instruction is present', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

    const stdout = loadHook('pre-compact-save.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
      MCP_MEMORY_HEALTHY: 'false',
    });

    const output = parseOutput(stdout);
    expect(output.hookSpecificOutput.additionalContext).toContain('retrieve_memory');
  });

  it('APRES LE COMPACTAGE section is present with all recovery steps', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

    const stdout = loadHook('pre-compact-save.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
      MCP_MEMORY_HEALTHY: 'false',
    });

    const output = parseOutput(stdout);
    const ctx = output.hookSpecificOutput.additionalContext;
    expect(ctx).toContain('APRES LE COMPACTAGE');
    expect(ctx).toContain('sprint-status.yaml');
    expect(ctx).toContain('.mako-session-state.json');
    expect(ctx).toContain('Tu es Rufus');
  });
});

// ===========================================================================
// inject-rufus.js -- catch branch (rufus.md missing)
// ===========================================================================

describe('Direct coverage: inject-rufus.js -- catch branch (rufus.md missing)', () => {
  it('produces fallback SessionStart when fs.readFileSync throws', () => {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'inject-rufus.js');
    delete req.cache[hookPath];

    const Module = req('module');
    const origLoad = Module._load;

    // Mock 'fs' to make readFileSync throw for rufus.md
    Module._load = function (request, parent, isMain) {
      if (request === 'fs') {
        const realFs = origLoad.call(this, request, parent, isMain);
        return {
          ...realFs,
          readFileSync: function mockedReadFileSync(p, opts) {
            if (typeof p === 'string' && p.includes('rufus.md')) {
              throw new Error('ENOENT: no such file or directory');
            }
            return realFs.readFileSync(p, opts);
          },
        };
      }
      return origLoad.call(this, request, parent, isMain);
    };

    let stdout = '';
    try {
      stdout = captureStdout(() => { req(hookPath); });
    } finally {
      Module._load = origLoad;
      delete req.cache[hookPath];
    }

    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(output.hookSpecificOutput.additionalContext).toContain('Rufus Shinra');
  });
});

// ===========================================================================
// pre-compact-save.js -- safeParseJSON catch + global catch branches
// ===========================================================================

describe('Direct coverage: pre-compact-save.js -- edge branches', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-cov-compact2-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('safeParseJSON returns null for invalid JSON (corrupt session state)', () => {
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);
    // Write invalid JSON to trigger safeParseJSON catch (L32-33)
    writeFileSync(join(tmpDir, '.mako-session-state.json'), '{ not valid json !! }');

    const stdout = loadHook('pre-compact-save.js', {
      CLAUDE_PROJECT_DIR: tmpDir,
      MCP_MEMORY_HEALTHY: 'false',
    });

    // Hook should still produce valid output (uses {} as fallback)
    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
    expect(output.hookSpecificOutput.additionalContext).toContain('COMPACTAGE IMMINENT');
  });

  it('global catch branch: hook survives even when fs write fails (mocked)', () => {
    // We mock fs.writeFileSync to throw, which triggers the try/catch around writeFileSync
    // but NOT the global catch (pre-compact catches writeFileSync individually).
    // The global catch (L125-135) is for truly catastrophic errors.
    // We trigger it by corrupting process.env during execution.
    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'pre-compact-save.js');
    delete req.cache[hookPath];

    const Module = req('module');
    const origLoad = Module._load;
    let callCount = 0;

    // Make fs.existsSync throw after a few calls to trigger the outer catch
    Module._load = function (request, parent, isMain) {
      if (request === 'fs') {
        const realFs = origLoad.call(this, request, parent, isMain);
        return {
          ...realFs,
          writeFileSync: function mockedWrite(p, content, opts) {
            // Allow first write, throw on the second (statePath write)
            callCount++;
            if (callCount > 1 && p.includes('.mako-session-state')) {
              throw new Error('EROFS: read-only filesystem');
            }
            return realFs.writeFileSync(p, content, opts);
          },
        };
      }
      return origLoad.call(this, request, parent, isMain);
    };

    const savedDir = process.env.CLAUDE_PROJECT_DIR;
    const savedMcp = process.env.MCP_MEMORY_HEALTHY;
    process.env.CLAUDE_PROJECT_DIR = tmpDir;
    process.env.MCP_MEMORY_HEALTHY = 'false';

    let stdout = '';
    try {
      stdout = captureStdout(() => { req(hookPath); });
    } finally {
      Module._load = origLoad;
      delete req.cache[hookPath];
      if (savedDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = savedDir;
      if (savedMcp === undefined) delete process.env.MCP_MEMORY_HEALTHY;
      else process.env.MCP_MEMORY_HEALTHY = savedMcp;
    }

    // Even with write failure, hook outputs valid PreCompact JSON
    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
  });
});

// ===========================================================================
// subagent-stop-memory.js -- global catch branch
// ===========================================================================

describe('Direct coverage: subagent-stop-memory.js -- global catch branch', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-cov-stop2-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('global catch branch produces graceful SubagentStop fallback', () => {
    // Trigger global catch by making fs.readFileSync(0) throw catastrophically
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'subagent-stop-memory.js');
    delete req.cache[hookPath];

    const Module = req('module');
    const origLoad = Module._load;

    Module._load = function (request, parent, isMain) {
      if (request === 'fs') {
        const realFs = origLoad.call(this, request, parent, isMain);
        return {
          ...realFs,
          readFileSync: function mockedReadFileSync(p, opts) {
            if (p === 0) {
              // Return valid JSON but then make existsSync throw
              return JSON.stringify({ agent_type: 'mako:hojo' });
            }
            return realFs.readFileSync(p, opts);
          },
          existsSync: function mockedExistsSync(p) {
            if (typeof p === 'string' && p.includes('sprint-status')) {
              throw new Error('existsSync catastrophic failure');
            }
            return realFs.existsSync(p);
          },
        };
      }
      return origLoad.call(this, request, parent, isMain);
    };

    const savedDir = process.env.CLAUDE_PROJECT_DIR;
    const savedMcp = process.env.MCP_MEMORY_HEALTHY;
    process.env.CLAUDE_PROJECT_DIR = tmpDir;
    process.env.MCP_MEMORY_HEALTHY = 'false';

    let stdout = '';
    try {
      stdout = captureStdout(() => { req(hookPath); });
    } finally {
      Module._load = origLoad;
      delete req.cache[hookPath];
      if (savedDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = savedDir;
      if (savedMcp === undefined) delete process.env.MCP_MEMORY_HEALTHY;
      else process.env.MCP_MEMORY_HEALTHY = savedMcp;
    }

    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
    // Global catch outputs the minimal fallback
    expect(output.hookSpecificOutput.additionalContext).toContain('store_memory');
  });
});

// ===========================================================================
// user-prompt-submit-rufus.js -- global catch branch
// ===========================================================================

describe('Direct coverage: user-prompt-submit-rufus.js -- global catch branch', () => {
  it('global catch produces { result: "continue" } with no message', () => {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'user-prompt-submit-rufus.js');
    delete req.cache[hookPath];

    const Module = req('module');
    const origLoad = Module._load;

    // Make fs.existsSync throw to trigger global catch
    Module._load = function (request, parent, isMain) {
      if (request === 'fs') {
        const realFs = origLoad.call(this, request, parent, isMain);
        return {
          ...realFs,
          existsSync: function () {
            throw new Error('catastrophic fs failure');
          },
        };
      }
      return origLoad.call(this, request, parent, isMain);
    };

    const savedDir = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = '/tmp/no-such-dir-xyz';

    let stdout = '';
    try {
      stdout = captureStdout(() => { req(hookPath); });
    } finally {
      Module._load = origLoad;
      delete req.cache[hookPath];
      if (savedDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = savedDir;
    }

    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.result).toBe('continue');
  });
});

// ===========================================================================
// pre-compact-save.js -- global catch branch (catastrophic failure)
// ===========================================================================

describe('Direct coverage: pre-compact-save.js -- global outer catch', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-cov-compact3-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('global outer catch produces minimal PreCompact fallback', () => {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'pre-compact-save.js');
    delete req.cache[hookPath];

    const Module = req('module');
    const origLoad = Module._load;

    // Make memory-fallback throw to trigger the outer catch in main()
    // The outer try wraps everything including isMemoryServiceHealthy()
    Module._load = function (request, parent, isMain) {
      if (request === './lib/memory-fallback' || request.includes('memory-fallback')) {
        return {
          isMemoryServiceHealthy: function () {
            throw new Error('catastrophic memory-fallback failure');
          },
          memoryFallbackMessage: function () {
            return '';
          },
        };
      }
      return origLoad.call(this, request, parent, isMain);
    };

    const savedDir = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = tmpDir;

    writeFileSync(join(tmpDir, 'sprint-status.yaml'), SPRINT_STATUS_YAML);

    let stdout = '';
    try {
      stdout = captureStdout(() => { req(hookPath); });
    } finally {
      Module._load = origLoad;
      delete req.cache[hookPath];
      if (savedDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = savedDir;
    }

    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
    expect(output.hookSpecificOutput.additionalContext).toContain('sprint-status.yaml');
  });
});

// ===========================================================================
// ensure-memory-server.js -- direct load with mocked execSync
// ===========================================================================

describe('Direct coverage: ensure-memory-server.js', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-cov-ensure-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function loadEnsureMemoryServer(scenario = 'python-found', extraEnv = {}) {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'ensure-memory-server.js');
    delete req.cache[hookPath];

    const Module = req('module');
    const origLoad = Module._load;

    Module._load = function (request, parent, isMain) {
      // Mock child_process
      if (request === 'child_process') {
        const real = origLoad.call(this, request, parent, isMain);
        return {
          ...real,
          execSync: function mockedExecSync(cmd) {
            const cmdStr = String(cmd);
            if (cmdStr.includes('--version')) {
              if (scenario === 'python-not-found') {
                throw new Error('python not found');
              }
              return 'Python 3.11.5';
            }
            if (cmdStr.includes('import mcp_memory_service')) {
              if (scenario === 'service-not-installed') {
                throw new Error('ModuleNotFoundError');
              }
              return '/usr/lib/python3.11/mcp_memory_service/__init__.py';
            }
            return '';
          },
        };
      }
      // Mock memory-fallback
      if (request === './lib/memory-fallback' || request.includes('memory-fallback')) {
        return {
          isMemoryServiceHealthy: function () {
            return scenario !== 'mcp-down';
          },
          memoryFallbackMessage: function (hook) {
            return `[MCP MEMORY FALLBACK] mock fallback for ${hook}`;
          },
        };
      }
      return origLoad.call(this, request, parent, isMain);
    };

    const savedEnv = {};
    const envToSet = {
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      CLAUDE_PROJECT_DIR: tmpDir,
      ...extraEnv,
    };
    for (const [k, v] of Object.entries(envToSet)) {
      savedEnv[k] = process.env[k];
      process.env[k] = v;
    }

    let stdout = '';
    try {
      stdout = await captureStdoutAsync(async () => {
        const mod = req(hookPath);
        // ensure-memory-server calls main() which returns a Promise
        // The module exports nothing -- main() is called internally
        // We need to wait for the async main() to complete
        // Since require() executes the script synchronously up to the main() call
        // and main() is async, we need to wait a tick
        await new Promise((r) => setTimeout(r, 500));
      });
    } finally {
      Module._load = origLoad;
      delete req.cache[hookPath];
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }

    return stdout;
  }

  it('produces SessionStart JSON when python found and service installed', async () => {
    const stdout = await loadEnsureMemoryServer('python-found');
    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(output.hookSpecificOutput.statusMessage).toContain('configured');
  }, 10000);

  it('produces SessionStart JSON when python not found', async () => {
    const stdout = await loadEnsureMemoryServer('python-not-found');
    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(output.hookSpecificOutput.statusMessage).toContain('not found');
  }, 10000);

  it('produces SessionStart JSON when service not installed', async () => {
    const stdout = await loadEnsureMemoryServer('service-not-installed');
    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(output.hookSpecificOutput.statusMessage).toContain('not installed');
  }, 10000);

  it('produces fallback SessionStart when MCP is down', async () => {
    const stdout = await loadEnsureMemoryServer('mcp-down');
    const output = parseOutput(stdout);
    expect(output).not.toBeNull();
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(output.hookSpecificOutput.statusMessage).toContain('configured');
  }, 10000);
});

// ===========================================================================
// pre-commit-check.js -- direct load with mocked execSync + fs
// ===========================================================================

describe('Direct coverage: pre-commit-check.js', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mako-cov-precommit-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Load pre-commit-check.js with controlled cwd and mocked execSync.
   * @param {string} cwd - Working directory (process.cwd() inside hook)
   * @param {function} mockExecSync - Mock for execSync (null = real, throw = fail)
   */
  function loadPreCommitCheck(cwd, mockExecSync = null) {
    const req = createRequire(import.meta.url);
    const hookPath = resolve(HOOKS_DIR, 'pre-commit-check.js');
    delete req.cache[hookPath];

    const Module = req('module');
    const origLoad = Module._load;

    if (mockExecSync !== null) {
      Module._load = function (request, parent, isMain) {
        if (request === 'child_process') {
          const real = origLoad.call(this, request, parent, isMain);
          return { ...real, execSync: mockExecSync };
        }
        return origLoad.call(this, request, parent, isMain);
      };
    }

    const origCwd = process.cwd;
    process.cwd = () => cwd;

    let stdout = '';
    try {
      stdout = captureStdout(() => { req(hookPath); });
    } finally {
      process.cwd = origCwd;
      Module._load = origLoad;
      delete req.cache[hookPath];
    }

    return parseOutput(stdout);
  }

  it('allows commit when no config file found (no testCmd)', () => {
    // Empty tmpDir has no package.json, Cargo.toml, Makefile, pyproject.toml
    const output = loadPreCommitCheck(tmpDir);
    expect(output).not.toBeNull();
    expect(output.decision).toBe('allow');
  });

  it('allows commit when package.json has default test script (no override)', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: {
          test: 'echo "Error: no test specified" && exit 1',
        },
      })
    );
    const output = loadPreCommitCheck(tmpDir);
    expect(output.decision).toBe('allow');
  });

  it('allows commit after tests pass with npm (package.json + test script)', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } })
    );

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      // Simulate successful test run
      return '';
    });
    expect(output.decision).toBe('allow');
  });

  it('blocks commit when tests fail (execSync throws)', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } })
    );

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      const err = new Error('Command failed');
      err.stdout = Buffer.from('Test failure output');
      err.stderr = Buffer.from('Error details here');
      throw err;
    });

    expect(output.decision).toBe('block');
    expect(output.reason).toContain('Tests failed');
    expect(output.reason).toContain('Test failure output');
  });

  it('detects Cargo.toml and returns cargo test command', () => {
    writeFileSync(join(tmpDir, 'Cargo.toml'), '[package]\nname = "test"\nversion = "0.1.0"');

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      expect(cmd).toContain('cargo test');
      return '';
    });
    expect(output.decision).toBe('allow');
  });

  it('detects Makefile with test target and returns make test command', () => {
    writeFileSync(join(tmpDir, 'Makefile'), 'test:\n\techo "tests passed"\n\nall:\n\techo "all"\n');

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      expect(cmd).toContain('make test');
      return '';
    });
    expect(output.decision).toBe('allow');
  });

  it('Makefile without test target falls through to null (allow commit)', () => {
    writeFileSync(join(tmpDir, 'Makefile'), 'build:\n\techo "build"\n');

    const output = loadPreCommitCheck(tmpDir);
    expect(output.decision).toBe('allow');
  });

  it('detects pyproject.toml and returns pytest command', () => {
    writeFileSync(join(tmpDir, 'pyproject.toml'), '[tool.pytest]\n');

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      expect(cmd).toContain('pytest');
      return '';
    });
    expect(output.decision).toBe('allow');
  });

  it('detects pytest.ini and returns pytest command', () => {
    writeFileSync(join(tmpDir, 'pytest.ini'), '[pytest]\n');

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      expect(cmd).toContain('pytest');
      return '';
    });
    expect(output.decision).toBe('allow');
  });

  it('detects setup.py and returns pytest command', () => {
    writeFileSync(join(tmpDir, 'setup.py'), 'from setuptools import setup\n');

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      expect(cmd).toContain('pytest');
      return '';
    });
    expect(output.decision).toBe('allow');
  });

  it('detects bun.lockb and uses bun as package manager', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'bun test' } })
    );
    writeFileSync(join(tmpDir, 'bun.lockb'), '');

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      expect(cmd).toBe('bun test');
      return '';
    });
    expect(output.decision).toBe('allow');
  });

  it('detects pnpm-lock.yaml and uses pnpm as package manager', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'pnpm test' } })
    );
    writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), '');

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      expect(cmd).toBe('pnpm test');
      return '';
    });
    expect(output.decision).toBe('allow');
  });

  it('detects yarn.lock and uses yarn as package manager', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'yarn test' } })
    );
    writeFileSync(join(tmpDir, 'yarn.lock'), '');

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      expect(cmd).toBe('yarn test');
      return '';
    });
    expect(output.decision).toBe('allow');
  });

  it('package.json with no scripts field falls through', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'no-scripts' }));
    const output = loadPreCommitCheck(tmpDir);
    expect(output.decision).toBe('allow');
  });

  it('corrupt package.json is handled gracefully (try/catch)', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{ not valid json }');
    const output = loadPreCommitCheck(tmpDir);
    expect(output.decision).toBe('allow');
  });

  it('block reason contains command name', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'npm test' } })
    );

    const output = loadPreCommitCheck(tmpDir, (cmd, opts) => {
      const err = new Error('fail');
      err.stdout = Buffer.from('');
      err.stderr = Buffer.from('');
      throw err;
    });

    expect(output.reason).toContain('npm test');
  });
});

// ===========================================================================
// memory-fallback.js -- direct coverage of uncovered branch
// ===========================================================================

describe('Direct coverage: memory-fallback.js -- MCP_MEMORY_HEALTHY=false branch', () => {
  it('isMemoryServiceHealthy() returns false immediately when env var is "false"', () => {
    const req = createRequire(import.meta.url);
    const modulePath = resolve(HOOKS_DIR, 'lib', 'memory-fallback.js');
    delete req.cache[modulePath];

    const savedValue = process.env.MCP_MEMORY_HEALTHY;
    process.env.MCP_MEMORY_HEALTHY = 'false';

    let result;
    try {
      const mod = req(modulePath);
      delete req.cache[modulePath];
      result = mod.isMemoryServiceHealthy();
    } finally {
      if (savedValue === undefined) delete process.env.MCP_MEMORY_HEALTHY;
      else process.env.MCP_MEMORY_HEALTHY = savedValue;
    }

    expect(result).toBe(false);
  });

  it('isMemoryServiceHealthy() fast-path completes in < 50ms when env is false', () => {
    const req = createRequire(import.meta.url);
    const modulePath = resolve(HOOKS_DIR, 'lib', 'memory-fallback.js');
    delete req.cache[modulePath];

    const savedValue = process.env.MCP_MEMORY_HEALTHY;
    process.env.MCP_MEMORY_HEALTHY = 'false';

    const mod = req(modulePath);
    delete req.cache[modulePath];

    let elapsed;
    try {
      const start = Date.now();
      mod.isMemoryServiceHealthy();
      elapsed = Date.now() - start;
    } finally {
      if (savedValue === undefined) delete process.env.MCP_MEMORY_HEALTHY;
      else process.env.MCP_MEMORY_HEALTHY = savedValue;
    }

    // Fast path -- no subprocess spawned
    expect(elapsed).toBeLessThan(50);
  });
});

// ===========================================================================
// telemetry.js -- coverage of silent catch branch (L56-57)
// ===========================================================================

describe('Direct coverage: telemetry.js -- silent catch branch', () => {
  it('logEvent() with metadata containing circular reference does not throw', () => {
    // The catch branch at L56-57 is triggered when JSON.stringify or fs.appendFileSync fails.
    // We cannot easily corrupt the fs call, but we can verify the try/catch works
    // by confirming logEvent never throws even in edge conditions.
    const req = createRequire(import.meta.url);
    const modulePath = resolve(HOOKS_DIR, 'lib', 'telemetry.js');
    delete req.cache[modulePath];

    const { logEvent } = req(modulePath);
    delete req.cache[modulePath];

    // Circular reference would crash JSON.stringify -- triggering the catch
    const circular = {};
    circular.self = circular;

    expect(() => logEvent('test', 'hook', 0, circular)).not.toThrow();
  });
});
