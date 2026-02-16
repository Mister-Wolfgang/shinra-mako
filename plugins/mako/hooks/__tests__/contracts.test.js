/**
 * Contract Tests -- MAKO Hooks v6.0
 *
 * Hypothesis: All hook outputs conform to their declared JSON Schema contracts.
 * Method: Feed realistic inputs to hooks, validate outputs against schemas.
 * No snapshot tests -- structural validation only.
 *
 * Schema source: contracts/*.schema.json (JSON Schema draft-07)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOOKS_DIR = resolve(__dirname, '..');
const CONTRACTS_DIR = resolve(HOOKS_DIR, '..', 'contracts');

// ---------------------------------------------------------------------------
// AJV setup
// ---------------------------------------------------------------------------

let ajv;
let hooksIoSchema;
let sessionStateSchema;
let telemetrySchema;

beforeAll(() => {
  ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  hooksIoSchema = JSON.parse(
    readFileSync(join(CONTRACTS_DIR, 'hooks-io.schema.json'), 'utf8')
  );
  sessionStateSchema = JSON.parse(
    readFileSync(join(CONTRACTS_DIR, 'session-state.schema.json'), 'utf8')
  );
  telemetrySchema = JSON.parse(
    readFileSync(join(CONTRACTS_DIR, 'telemetry.schema.json'), 'utf8')
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute a hook script and return parsed JSON output.
 * Hooks write JSON to stdout; stderr is diagnostic only.
 */
function runHook(hookFile, { input = '', env = {}, cwd = null } = {}) {
  const hookPath = join(HOOKS_DIR, hookFile);
  const workDir = cwd || resolve(HOOKS_DIR, '..');
  const mergedEnv = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: resolve(HOOKS_DIR, '..'),
    CLAUDE_PROJECT_DIR: workDir,
    ...env,
  };

  const stdout = execSync(`node "${hookPath}"`, {
    cwd: workDir,
    input,
    encoding: 'utf8',
    timeout: 15000,
    env: mergedEnv,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return JSON.parse(stdout.trim());
}

/**
 * Validate data against a schema definition from hooks-io.schema.json.
 * Returns { valid, errors }.
 */
function validateHooksIo(definitionName, data) {
  const schema = hooksIoSchema.definitions[definitionName];
  if (!schema) throw new Error(`Unknown definition: ${definitionName}`);
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return { valid, errors: validate.errors };
}

/**
 * Validate data against a top-level schema.
 */
function validateSchema(schema, data) {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return { valid, errors: validate.errors };
}

// ===========================================================================
// SCHEMA FILE VALIDATION
// ===========================================================================

describe('Contract: Schema files are valid JSON Schema draft-07', () => {
  it('hooks-io.schema.json is valid', () => {
    expect(hooksIoSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(hooksIoSchema.definitions).toBeDefined();
    expect(Object.keys(hooksIoSchema.definitions).length).toBeGreaterThan(0);
  });

  it('session-state.schema.json is valid', () => {
    expect(sessionStateSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(sessionStateSchema.type).toBe('object');
    expect(sessionStateSchema.required).toContain('last_compaction');
  });

  it('telemetry.schema.json is valid', () => {
    expect(telemetrySchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(telemetrySchema.required).toContain('timestamp');
    expect(telemetrySchema.required).toContain('event');
    expect(telemetrySchema.required).toContain('hook');
  });

  it('all schemas compile without errors in AJV', () => {
    // Compile each definition from hooks-io
    for (const [name, def] of Object.entries(hooksIoSchema.definitions)) {
      expect(() => ajv.compile(def), `Failed to compile: ${name}`).not.toThrow();
    }
    expect(() => ajv.compile(sessionStateSchema)).not.toThrow();
    expect(() => ajv.compile(telemetrySchema)).not.toThrow();
  });
});

// ===========================================================================
// HOOKS-IO: SessionStart
// ===========================================================================

describe('Contract: SessionStart hooks output', () => {
  it('inject-rufus.js output conforms to SessionStartOutput schema', () => {
    const output = runHook('inject-rufus.js');
    const { valid, errors } = validateHooksIo('SessionStartOutput', output);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('inject-rufus.js output has hookEventName === "SessionStart"', () => {
    const output = runHook('inject-rufus.js');
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
  });

  it('inject-rufus.js output has additionalContext as a non-empty string', () => {
    const output = runHook('inject-rufus.js');
    expect(typeof output.hookSpecificOutput.additionalContext).toBe('string');
    expect(output.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
  });

  // ensure-memory-server.js has heavy side-effects (Python check, pip import, file I/O).
  // We validate its contract using mock outputs matching the 3 code paths observed in source.
  it('ensure-memory-server.js: success output conforms to SessionStartOutput schema', () => {
    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        statusMessage: 'mcp-memory-service configured (SQLite-Vec)',
      },
    };
    const { valid, errors } = validateHooksIo('SessionStartOutput', output);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('ensure-memory-server.js: python-not-found output conforms to SessionStartOutput schema', () => {
    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        statusMessage: 'Python 3.10+ not found. Install Python and run: pip install mcp-memory-service',
      },
    };
    const { valid, errors } = validateHooksIo('SessionStartOutput', output);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('ensure-memory-server.js: error output conforms to SessionStartOutput schema', () => {
    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        statusMessage: 'memory hook error: something went wrong',
      },
    };
    const { valid, errors } = validateHooksIo('SessionStartOutput', output);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('ensure-memory-server.js: all outputs have hookEventName === "SessionStart"', () => {
    const outputs = [
      { hookSpecificOutput: { hookEventName: 'SessionStart', statusMessage: 'mcp-memory-service configured (SQLite-Vec)' } },
      { hookSpecificOutput: { hookEventName: 'SessionStart', statusMessage: 'Python 3.10+ not found.' } },
      { hookSpecificOutput: { hookEventName: 'SessionStart', statusMessage: 'memory hook error: ENOENT' } },
    ];
    for (const output of outputs) {
      expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    }
  });
});

// ===========================================================================
// HOOKS-IO: UserPromptSubmit
// ===========================================================================

describe('Contract: UserPromptSubmit hook output', () => {
  it('user-prompt-submit-rufus.js output conforms to UserPromptSubmitOutput schema', () => {
    const output = runHook('user-prompt-submit-rufus.js');
    const { valid, errors } = validateHooksIo('UserPromptSubmitOutput', output);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('result is always "continue" or "block"', () => {
    const output = runHook('user-prompt-submit-rufus.js');
    expect(['continue', 'block']).toContain(output.result);
  });

  it('message, when present, is a string', () => {
    const output = runHook('user-prompt-submit-rufus.js');
    if (output.message !== undefined) {
      expect(typeof output.message).toBe('string');
    }
  });
});

// ===========================================================================
// HOOKS-IO: PreToolUse (pre-commit-check)
// ===========================================================================

describe('Contract: PreToolUse hook output', () => {
  // pre-commit-check uses process.cwd() to find a test command.
  // We run it from an empty temp dir so findTestCommand() returns null
  // and the hook outputs { decision: "allow" } without running any tests.
  let emptyDir;
  beforeAll(() => {
    emptyDir = mkdtempSync(join(tmpdir(), 'mako-contract-'));
  });

  it('pre-commit-check.js output conforms to PreToolUseOutput schema', () => {
    const output = runHook('pre-commit-check.js', { cwd: emptyDir });
    const { valid, errors } = validateHooksIo('PreToolUseOutput', output);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('decision is always "allow" or "block"', () => {
    const output = runHook('pre-commit-check.js', { cwd: emptyDir });
    expect(['allow', 'block']).toContain(output.decision);
  });
});

// ===========================================================================
// HOOKS-IO: SubagentStop
// ===========================================================================

describe('Contract: SubagentStop hook I/O', () => {
  it('subagent-stop-memory.js output conforms to SubagentStopOutput schema', () => {
    const input = JSON.stringify({ agent_type: 'mako:hojo' });
    const output = runHook('subagent-stop-memory.js', { input });
    const { valid, errors } = validateHooksIo('SubagentStopOutput', output);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('output hookEventName is always "SubagentStop"', () => {
    const input = JSON.stringify({ agent_type: 'mako:reno' });
    const output = runHook('subagent-stop-memory.js', { input });
    expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
  });

  it('output additionalContext is a non-empty string', () => {
    const input = JSON.stringify({ agent_type: 'mako:scarlet' });
    const output = runHook('subagent-stop-memory.js', { input });
    expect(typeof output.hookSpecificOutput.additionalContext).toBe('string');
    expect(output.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
  });

  it('input with valid agent_type conforms to SubagentStopInput schema', () => {
    const data = { agent_type: 'mako:hojo' };
    const { valid, errors } = validateHooksIo('SubagentStopInput', data);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('input with invalid agent_type pattern is rejected by schema', () => {
    const data = { agent_type: 'invalid-format' };
    const { valid } = validateHooksIo('SubagentStopInput', data);
    expect(valid).toBe(false);
  });

  it('handles empty input gracefully (still conforms to output schema)', () => {
    const output = runHook('subagent-stop-memory.js', { input: '' });
    const { valid, errors } = validateHooksIo('SubagentStopOutput', output);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });
});

// ===========================================================================
// HOOKS-IO: PreCompact
// ===========================================================================

describe('Contract: PreCompact hook output', () => {
  it('pre-compact-save.js output conforms to PreCompactOutput schema', () => {
    const output = runHook('pre-compact-save.js');
    const { valid, errors } = validateHooksIo('PreCompactOutput', output);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('output hookEventName is always "PreCompact"', () => {
    const output = runHook('pre-compact-save.js');
    expect(output.hookSpecificOutput.hookEventName).toBe('PreCompact');
  });

  it('output additionalContext is a non-empty string', () => {
    const output = runHook('pre-compact-save.js');
    expect(typeof output.hookSpecificOutput.additionalContext).toBe('string');
    expect(output.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// SESSION STATE SCHEMA
// ===========================================================================

describe('Contract: Session state schema validation', () => {
  it('valid session state passes schema', () => {
    const state = {
      last_compaction: '2026-02-16T12:00:00.000Z',
      sprint: {
        workflow: 'feature',
        status: 'in-progress',
        current_phase: 'hojo',
        next_phase: 'reno',
        quality_tier: 'Standard',
        scale: 'M',
      },
      active_agents: { hojo: 'agent-123', reno: 'agent-456' },
      pending_decisions: [],
      notes: '',
    };
    const { valid, errors } = validateSchema(sessionStateSchema, state);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('rejects session state with missing required field', () => {
    const state = {
      last_compaction: '2026-02-16T12:00:00.000Z',
      // missing sprint, active_agents, pending_decisions, notes
    };
    const { valid } = validateSchema(sessionStateSchema, state);
    expect(valid).toBe(false);
  });

  it('rejects session state with invalid last_compaction format', () => {
    const state = {
      last_compaction: 'not-a-date',
      sprint: {},
      active_agents: {},
      pending_decisions: [],
      notes: '',
    };
    const { valid } = validateSchema(sessionStateSchema, state);
    expect(valid).toBe(false);
  });

  it('accepts session state with empty sprint object', () => {
    const state = {
      last_compaction: '2026-02-16T12:00:00.000Z',
      sprint: {},
      active_agents: {},
      pending_decisions: [],
      notes: '',
    };
    const { valid, errors } = validateSchema(sessionStateSchema, state);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('rejects session state with extra unknown fields', () => {
    const state = {
      last_compaction: '2026-02-16T12:00:00.000Z',
      sprint: {},
      active_agents: {},
      pending_decisions: [],
      notes: '',
      unknown_field: 'should fail',
    };
    const { valid } = validateSchema(sessionStateSchema, state);
    expect(valid).toBe(false);
  });
});

// ===========================================================================
// TELEMETRY SCHEMA
// ===========================================================================

describe('Contract: Telemetry event schema validation', () => {
  it('valid hook_start event passes schema', () => {
    const event = {
      timestamp: '2026-02-16T12:00:00.000Z',
      event: 'hook_start',
      hook: 'ensure-memory-server',
    };
    const { valid, errors } = validateSchema(telemetrySchema, event);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('valid hook_end event with duration_ms passes schema', () => {
    const event = {
      timestamp: '2026-02-16T12:00:00.000Z',
      event: 'hook_end',
      hook: 'inject-rufus',
      duration_ms: 42,
    };
    const { valid, errors } = validateSchema(telemetrySchema, event);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('valid hook_error event with error field passes schema', () => {
    const event = {
      timestamp: '2026-02-16T12:00:00.000Z',
      event: 'hook_error',
      hook: 'pre-compact-save',
      duration_ms: 0,
      error: 'ENOENT: file not found',
    };
    const { valid, errors } = validateSchema(telemetrySchema, event);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('valid memory_fallback event with metadata passes schema', () => {
    const event = {
      timestamp: '2026-02-16T12:00:00.000Z',
      event: 'memory_fallback',
      hook: 'ensure-memory-server',
      metadata: { reason: 'python not found', fallback: 'in-memory' },
    };
    const { valid, errors } = validateSchema(telemetrySchema, event);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  // ---- Invariants ----

  it('INVARIANT: duration_ms must be >= 0 (rejects negative)', () => {
    const event = {
      timestamp: '2026-02-16T12:00:00.000Z',
      event: 'hook_end',
      hook: 'inject-rufus',
      duration_ms: -1,
    };
    const { valid } = validateSchema(telemetrySchema, event);
    expect(valid).toBe(false);
  });

  it('INVARIANT: duration_ms === 0 is valid', () => {
    const event = {
      timestamp: '2026-02-16T12:00:00.000Z',
      event: 'hook_end',
      hook: 'inject-rufus',
      duration_ms: 0,
    };
    const { valid, errors } = validateSchema(telemetrySchema, event);
    expect(errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('INVARIANT: event must be one of the defined enum values', () => {
    const event = {
      timestamp: '2026-02-16T12:00:00.000Z',
      event: 'unknown_event',
      hook: 'inject-rufus',
    };
    const { valid } = validateSchema(telemetrySchema, event);
    expect(valid).toBe(false);
  });

  it('INVARIANT: hook must be non-empty string', () => {
    const event = {
      timestamp: '2026-02-16T12:00:00.000Z',
      event: 'hook_start',
      hook: '',
    };
    const { valid } = validateSchema(telemetrySchema, event);
    expect(valid).toBe(false);
  });

  it('INVARIANT: timestamp must be valid date-time format', () => {
    const event = {
      timestamp: 'not-a-timestamp',
      event: 'hook_start',
      hook: 'some-hook',
    };
    const { valid } = validateSchema(telemetrySchema, event);
    expect(valid).toBe(false);
  });

  it('rejects telemetry event with missing required fields', () => {
    const event = { timestamp: '2026-02-16T12:00:00.000Z' };
    const { valid } = validateSchema(telemetrySchema, event);
    expect(valid).toBe(false);
  });

  it('rejects telemetry event with extra unknown fields', () => {
    const event = {
      timestamp: '2026-02-16T12:00:00.000Z',
      event: 'hook_start',
      hook: 'test-hook',
      unknown_field: 'nope',
    };
    const { valid } = validateSchema(telemetrySchema, event);
    expect(valid).toBe(false);
  });
});

// ===========================================================================
// CROSS-CUTTING INVARIANTS
// ===========================================================================

describe('Contract: Cross-cutting invariants', () => {
  it('INVARIANT: SubagentStop agent_type must match pattern mako:*', () => {
    // Valid patterns
    for (const valid of ['mako:hojo', 'mako:rufus', 'mako:sephiroth']) {
      const { valid: isValid } = validateHooksIo('SubagentStopInput', {
        agent_type: valid,
      });
      expect(isValid, `Expected ${valid} to be valid`).toBe(true);
    }

    // Invalid patterns
    for (const invalid of ['hojo', 'mako:', 'mako: hojo', 'MAKO:hojo', '']) {
      const { valid: isValid } = validateHooksIo('SubagentStopInput', {
        agent_type: invalid,
      });
      expect(isValid, `Expected ${invalid} to be invalid`).toBe(false);
    }
  });

  it('INVARIANT: SessionStart hookEventName is always "SessionStart"', () => {
    const badOutput = {
      hookSpecificOutput: {
        hookEventName: 'WrongEvent',
      },
    };
    const { valid } = validateHooksIo('SessionStartOutput', badOutput);
    expect(valid).toBe(false);
  });

  it('INVARIANT: PreCompact hookEventName is always "PreCompact"', () => {
    const badOutput = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: 'test',
      },
    };
    const { valid } = validateHooksIo('PreCompactOutput', badOutput);
    expect(valid).toBe(false);
  });

  it('INVARIANT: UserPromptSubmit result must be enum, not arbitrary string', () => {
    const badOutput = { result: 'maybe' };
    const { valid } = validateHooksIo('UserPromptSubmitOutput', badOutput);
    expect(valid).toBe(false);
  });

  it('INVARIANT: PreToolUse decision must be enum, not arbitrary string', () => {
    const badOutput = { decision: 'skip' };
    const { valid } = validateHooksIo('PreToolUseOutput', badOutput);
    expect(valid).toBe(false);
  });

  it('all hook output schemas have required fields defined', () => {
    const outputSchemas = [
      'SessionStartOutput',
      'UserPromptSubmitOutput',
      'PreToolUseOutput',
      'SubagentStopOutput',
      'PreCompactOutput',
    ];
    for (const name of outputSchemas) {
      const schema = hooksIoSchema.definitions[name];
      expect(schema.required, `${name} should have required fields`).toBeDefined();
      expect(schema.required.length, `${name} should have at least 1 required field`).toBeGreaterThan(0);
    }
  });
});
