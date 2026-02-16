/**
 * MAKO Hooks Unit Tests
 *
 * Tests for the 3 new hooks:
 *   - user-prompt-submit-rufus.js
 *   - subagent-stop-memory.js
 *   - pre-compact-save.js
 *
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert).
 * Zero dependencies.
 *
 * Run:
 *   node --test hooks/__tests__/hooks.test.js
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const HOOKS_DIR = path.join(__dirname, "..");

// Helper: Run a hook script with stdin input, return stdout
function runHook(hookFile, stdin = "", env = {}) {
  const hookPath = path.join(HOOKS_DIR, hookFile);
  const fullEnv = { ...process.env, ...env };

  try {
    const result = execSync(`node "${hookPath}"`, {
      input: stdin,
      encoding: "utf8",
      env: fullEnv,
      timeout: 5000,
    });
    return result;
  } catch (error) {
    // If the hook exits with non-zero, execSync throws
    // Return stdout anyway for testing
    return error.stdout || "";
  }
}

// Helper: Parse JSON output from hook
function parseHookOutput(output) {
  try {
    return JSON.parse(output.trim());
  } catch {
    return null;
  }
}

// Helper: Create temporary directory with files
function createTempProject(files = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mako-test-"));

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
  }

  return tmpDir;
}

// Helper: Cleanup temp directory
function cleanupTempProject(tmpDir) {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

// ============================================================================
// Tests: user-prompt-submit-rufus.js
// ============================================================================

describe("user-prompt-submit-rufus.js", () => {
  test("returns default reminder when no sprint-status.yaml exists", () => {
    const tmpDir = createTempProject({});
    const output = runHook("user-prompt-submit-rufus.js", "", {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    assert.equal(json.result, "continue");
    assert.ok(json.message.includes("No active sprint"));
    assert.ok(json.message.includes("Rufus"));

    cleanupTempProject(tmpDir);
  });

  test("includes sprint info when sprint-status.yaml exists", () => {
    const sprintStatus = `sprint:
  workflow: "create-project"
  status: "active"
  current_phase: "hojo"
  next_phase: "reno"
  quality_tier: "Standard"

stories:
  - id: "ST-1"
    status: "done"
  - id: "ST-2"
    status: "in-progress"
`;

    const tmpDir = createTempProject({ "sprint-status.yaml": sprintStatus });
    const output = runHook("user-prompt-submit-rufus.js", "", {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    assert.equal(json.result, "continue");
    assert.ok(json.message.includes("create-project"));
    assert.ok(json.message.includes("active"));
    assert.ok(json.message.includes("hojo"));
    assert.ok(json.message.includes("reno"));
    assert.ok(json.message.includes("Standard"));

    cleanupTempProject(tmpDir);
  });

  test("includes agent IDs from .mako-session-state.json", () => {
    const sessionState = JSON.stringify({
      active_agents: {
        hojo: "agent-123",
        reno: "agent-456",
      },
    });

    const tmpDir = createTempProject({
      ".mako-session-state.json": sessionState,
    });
    const output = runHook("user-prompt-submit-rufus.js", "", {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    assert.equal(json.result, "continue");
    assert.ok(json.message.includes("hojo=agent-123"));
    assert.ok(json.message.includes("reno=agent-456"));

    cleanupTempProject(tmpDir);
  });

  test("output is valid JSON with result: continue", () => {
    const tmpDir = createTempProject({});
    const output = runHook("user-prompt-submit-rufus.js", "", {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    assert.equal(json.result, "continue");

    cleanupTempProject(tmpDir);
  });
});

// ============================================================================
// Tests: subagent-stop-memory.js
// ============================================================================

describe("subagent-stop-memory.js", () => {
  test("suggests 'reno' after mako:hojo", () => {
    const input = JSON.stringify({ agent_type: "mako:hojo" });
    const tmpDir = createTempProject({});
    const output = runHook("subagent-stop-memory.js", input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    assert.ok(json.hookSpecificOutput);
    const context = json.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("hojo"));
    assert.ok(context.includes("reno"));

    cleanupTempProject(tmpDir);
  });

  test("suggests 'elena' after mako:reno", () => {
    const input = JSON.stringify({ agent_type: "mako:reno" });
    const tmpDir = createTempProject({});
    const output = runHook("subagent-stop-memory.js", input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    const context = json.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("reno"));
    assert.ok(context.includes("elena"));

    cleanupTempProject(tmpDir);
  });

  test("suggests next step after mako:elena", () => {
    const input = JSON.stringify({ agent_type: "mako:elena" });
    const tmpDir = createTempProject({});
    const output = runHook("subagent-stop-memory.js", input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    const context = json.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("elena"));
    assert.ok(context.includes("palmer") || context.includes("rude"));

    cleanupTempProject(tmpDir);
  });

  test("does not crash without sprint-status", () => {
    const input = JSON.stringify({ agent_type: "mako:hojo" });
    const tmpDir = createTempProject({});
    const output = runHook("subagent-stop-memory.js", input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    assert.ok(json.hookSpecificOutput);
    const context = json.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("store_memory"));

    cleanupTempProject(tmpDir);
  });

  test("output is valid JSON", () => {
    const input = JSON.stringify({ agent_type: "mako:tseng" });
    const tmpDir = createTempProject({});
    const output = runHook("subagent-stop-memory.js", input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    assert.ok(json.hookSpecificOutput);
    assert.equal(json.hookSpecificOutput.hookEventName, "SubagentStop");

    cleanupTempProject(tmpDir);
  });
});

// ============================================================================
// Tests: pre-compact-save.js
// ============================================================================

describe("pre-compact-save.js", () => {
  test("does not crash without any files", () => {
    const tmpDir = createTempProject({});
    const output = runHook("pre-compact-save.js", "", {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    assert.ok(json.hookSpecificOutput);
    const context = json.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("COMPACTAGE") || context.includes("Compactage"));

    cleanupTempProject(tmpDir);
  });

  test("includes sprint-status in message when present", () => {
    const sprintStatus = `sprint:
  workflow: "add-feature"
  status: "active"
  current_phase: "reno"
  next_phase: "elena"
  quality_tier: "Comprehensive"
  scale: "Standard"
`;

    const tmpDir = createTempProject({ "sprint-status.yaml": sprintStatus });
    const output = runHook("pre-compact-save.js", "", {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    const context = json.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("add-feature"));
    assert.ok(context.includes("reno"));
    assert.ok(context.includes("elena"));
    assert.ok(context.includes("Comprehensive"));

    cleanupTempProject(tmpDir);
  });

  test("writes .mako-session-state.json", () => {
    const sprintStatus = `sprint:
  workflow: "create-project"
  status: "active"
  current_phase: "hojo"
  next_phase: "reno"
`;

    const tmpDir = createTempProject({ "sprint-status.yaml": sprintStatus });
    const statePath = path.join(tmpDir, ".mako-session-state.json");

    // Ensure file doesn't exist before
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }

    runHook("pre-compact-save.js", "", { CLAUDE_PROJECT_DIR: tmpDir });

    // Check file was created
    assert.ok(fs.existsSync(statePath), ".mako-session-state.json should be created");

    const content = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.ok(content.last_compaction);
    assert.ok(content.sprint);
    assert.equal(content.sprint.workflow, "create-project");

    cleanupTempProject(tmpDir);
  });

  test("output is valid JSON", () => {
    const tmpDir = createTempProject({});
    const output = runHook("pre-compact-save.js", "", {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    const json = parseHookOutput(output);

    assert.ok(json, "Output should be valid JSON");
    assert.ok(json.hookSpecificOutput);
    assert.equal(json.hookSpecificOutput.hookEventName, "PreCompact");

    cleanupTempProject(tmpDir);
  });
});
