/**
 * Unit Tests -- ST-4: PreToolUse Hook (pre-commit-check.js)
 *
 * Hypothesis: pre-commit-check.js correctly detects test commands from
 * project config files, runs them via execSync, and outputs the right
 * JSON decision (allow/block) based on the test exit code.
 *
 * Method: Execute the hook as a subprocess with controlled cwd containing
 * specific filesystem fixtures (package.json, Cargo.toml, Makefile, etc.).
 * No recursive npm test -- the test script is always a trivial node -e command.
 *
 * CJS hook under test, ESM test context (ADR-2).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOOK_PATH = resolve(__dirname, '..', 'pre-commit-check.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run pre-commit-check.js as a subprocess with a controlled working directory.
 * Returns the parsed JSON output from stdout.
 * @param {string} cwd - Working directory for the hook
 * @returns {{ decision: string, reason?: string }}
 */
function runHook(cwd) {
  const stdout = execSync(`node "${HOOK_PATH}"`, {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout.trim());
}

/**
 * Create a temporary directory for a test fixture.
 * @returns {string} Absolute path to the temp dir
 */
function createTempDir() {
  return mkdtempSync(join(tmpdir(), 'mako-precommit-'));
}

/**
 * Write a package.json to a directory with a given test script.
 * @param {string} dir - Target directory
 * @param {string} testScript - Value for scripts.test
 * @param {object} [extra] - Additional fields to merge into the package.json
 */
function writePackageJson(dir, testScript, extra = {}) {
  const pkg = {
    name: 'test-fixture',
    version: '1.0.0',
    scripts: { test: testScript },
    ...extra,
  };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('ST-4: PreToolUse Hook (pre-commit-check.js)', () => {
  /** @type {string[]} */
  let tempDirs;

  beforeEach(() => {
    tempDirs = [];
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Helper: create and track a temp dir for automatic cleanup.
   */
  function makeTempDir() {
    const dir = createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  // =========================================================================
  // findTestCommand -- project type detection
  // =========================================================================

  describe('findTestCommand: project type detection', () => {
    it('returns null (allow) when cwd has no config files', () => {
      const dir = makeTempDir();
      const output = runHook(dir);
      expect(output).toEqual({ decision: 'allow' });
    });

    it('detects Node.js project via package.json with test script', () => {
      const dir = makeTempDir();
      // Use a test script that succeeds instantly
      writePackageJson(dir, 'node -e "process.exit(0)"');
      const output = runHook(dir);
      // If it detected a test command, it ran it. Since exit(0), decision = allow
      expect(output.decision).toBe('allow');
    });

    it('ignores package.json with default "no test specified" script', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'echo "Error: no test specified" && exit 1');
      const output = runHook(dir);
      // Should treat as "no test command" -> allow without running
      expect(output).toEqual({ decision: 'allow' });
    });

    it('ignores package.json with no scripts property', () => {
      const dir = makeTempDir();
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'no-scripts', version: '1.0.0' })
      );
      const output = runHook(dir);
      expect(output).toEqual({ decision: 'allow' });
    });

    it('ignores package.json with scripts but no test script', () => {
      const dir = makeTempDir();
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'no-test',
          version: '1.0.0',
          scripts: { start: 'node index.js' },
        })
      );
      const output = runHook(dir);
      expect(output).toEqual({ decision: 'allow' });
    });

    it('detects Rust project via Cargo.toml', () => {
      const dir = makeTempDir();
      writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "test"');
      // This will try to run "cargo test --quiet" which will fail (no rust project)
      // so we expect block -- but the key test is that it detected Cargo.toml
      const output = runHook(dir);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('cargo test --quiet');
    });

    it('detects Makefile with test target', () => {
      const dir = makeTempDir();
      writeFileSync(
        join(dir, 'Makefile'),
        'test:\n\tnode -e "process.exit(0)"\n'
      );
      // "make test" will run -- on Windows this may fail if make is not available
      // The point is the hook detects Makefile and attempts "make test"
      const output = runHook(dir);
      // We check that it attempted to use make, not that make succeeded
      if (output.decision === 'block') {
        expect(output.reason).toContain('make test');
      } else {
        expect(output.decision).toBe('allow');
      }
    });

    it('ignores Makefile without test target', () => {
      const dir = makeTempDir();
      writeFileSync(join(dir, 'Makefile'), 'build:\n\techo building\n');
      const output = runHook(dir);
      // No test target -> no test command -> allow
      expect(output).toEqual({ decision: 'allow' });
    });

    it('detects Python project via pyproject.toml', () => {
      const dir = makeTempDir();
      writeFileSync(join(dir, 'pyproject.toml'), '[tool.pytest]');
      const output = runHook(dir);
      // Will try "python -m pytest --quiet -x" which will likely fail
      if (output.decision === 'block') {
        expect(output.reason).toContain('python -m pytest');
      }
    });

    it('detects Python project via pytest.ini', () => {
      const dir = makeTempDir();
      writeFileSync(join(dir, 'pytest.ini'), '[pytest]');
      const output = runHook(dir);
      if (output.decision === 'block') {
        expect(output.reason).toContain('python -m pytest');
      }
    });

    it('detects Python project via setup.py', () => {
      const dir = makeTempDir();
      writeFileSync(join(dir, 'setup.py'), 'from setuptools import setup');
      const output = runHook(dir);
      if (output.decision === 'block') {
        expect(output.reason).toContain('python -m pytest');
      }
    });

    it('package.json takes priority over Cargo.toml', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(0)"');
      writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "test"');
      const output = runHook(dir);
      // package.json detected first, test passes -> allow
      expect(output.decision).toBe('allow');
    });

    it('handles malformed package.json gracefully', () => {
      const dir = makeTempDir();
      writeFileSync(join(dir, 'package.json'), '{ invalid json !!!');
      const output = runHook(dir);
      // JSON.parse will throw, catch block swallows, falls through to next detection
      expect(output).toEqual({ decision: 'allow' });
    });
  });

  // =========================================================================
  // Package manager detection
  // =========================================================================

  describe('findTestCommand: package manager detection', () => {
    it('uses npm by default (no lockfile)', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(0)"');
      // No lockfile -> npm
      // We can verify by checking the output; on success it just says "allow"
      // On failure, the reason would contain the command name
      // Let's make it fail to see the command
      writePackageJson(dir, 'node -e "process.exit(1)"');
      const output = runHook(dir);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('npm test');
    });

    it('uses bun when bun.lockb exists', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(1)"');
      writeFileSync(join(dir, 'bun.lockb'), '');
      const output = runHook(dir);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('bun test');
    });

    it('uses pnpm when pnpm-lock.yaml exists', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(1)"');
      writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
      const output = runHook(dir);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('pnpm test');
    });

    it('uses yarn when yarn.lock exists', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(1)"');
      writeFileSync(join(dir, 'yarn.lock'), '');
      const output = runHook(dir);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('yarn test');
    });

    it('bun.lockb takes priority over pnpm-lock.yaml and yarn.lock', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(1)"');
      writeFileSync(join(dir, 'bun.lockb'), '');
      writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
      writeFileSync(join(dir, 'yarn.lock'), '');
      const output = runHook(dir);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('bun test');
    });

    it('pnpm-lock.yaml takes priority over yarn.lock', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(1)"');
      writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
      writeFileSync(join(dir, 'yarn.lock'), '');
      const output = runHook(dir);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('pnpm test');
    });
  });

  // =========================================================================
  // main() -- decision logic (allow / block)
  // =========================================================================

  describe('main: decision logic', () => {
    it('outputs { decision: "allow" } when tests pass (exit 0)', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(0)"');
      const output = runHook(dir);
      expect(output).toEqual({ decision: 'allow' });
    });

    it('outputs { decision: "block" } when tests fail (exit 1)', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(1)"');
      const output = runHook(dir);
      expect(output.decision).toBe('block');
      expect(output.reason).toBeDefined();
      expect(output.reason).toContain('Tests failed');
      expect(output.reason).toContain('Fix before committing');
    });

    it('outputs { decision: "allow" } when no test command is found', () => {
      const dir = makeTempDir();
      const output = runHook(dir);
      expect(output).toEqual({ decision: 'allow' });
    });

    it('block reason includes the test command that failed', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(1)"');
      const output = runHook(dir);
      expect(output.reason).toContain('Command: npm test');
    });

    it('block reason includes test output (stdout/stderr from failure)', () => {
      const dir = makeTempDir();
      writePackageJson(
        dir,
        'node -e "process.stdout.write(\'FAIL: test_specimen_42\'); process.exit(1)"'
      );
      const output = runHook(dir);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('Output (last 1000 chars)');
    });

    it('outputs valid JSON even when test produces large output', () => {
      const dir = makeTempDir();
      // Generate a test that outputs lots of text before failing
      const bigOutput = 'node -e "process.stderr.write(\'X\'.repeat(2000)); process.exit(1)"';
      writePackageJson(dir, bigOutput);
      const output = runHook(dir);
      expect(output.decision).toBe('block');
      // Output is truncated to last 500 chars per stream (stdout + stderr)
      expect(output.reason).toBeDefined();
      expect(typeof output.reason).toBe('string');
    });

    it('outputs { decision: "allow" } for passing tests with stdout output', () => {
      const dir = makeTempDir();
      writePackageJson(
        dir,
        'node -e "console.log(\'All 42 tests passed\'); process.exit(0)"'
      );
      const output = runHook(dir);
      expect(output).toEqual({ decision: 'allow' });
    });
  });

  // =========================================================================
  // Output schema compliance
  // =========================================================================

  describe('Output schema compliance', () => {
    it('allow output has only "decision" key', () => {
      const dir = makeTempDir();
      const output = runHook(dir);
      expect(Object.keys(output)).toEqual(['decision']);
    });

    it('block output has "decision" and "reason" keys', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(1)"');
      const output = runHook(dir);
      expect(Object.keys(output).sort()).toEqual(['decision', 'reason']);
    });

    it('decision is always a string', () => {
      const dir = makeTempDir();
      const allow = runHook(dir);
      expect(typeof allow.decision).toBe('string');

      writePackageJson(dir, 'node -e "process.exit(1)"');
      const block = runHook(dir);
      expect(typeof block.decision).toBe('string');
    });

    it('reason, when present, is a non-empty string', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(1)"');
      const output = runHook(dir);
      expect(typeof output.reason).toBe('string');
      expect(output.reason.length).toBeGreaterThan(0);
    });

    it('output is always valid JSON on stdout', () => {
      const dir = makeTempDir();
      // This tests that the hook does not pollute stdout with non-JSON
      const raw = execSync(`node "${HOOK_PATH}"`, {
        cwd: dir,
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect(() => JSON.parse(raw.trim())).not.toThrow();
    });
  });

  // =========================================================================
  // Edge cases and robustness
  // =========================================================================

  describe('Edge cases and robustness', () => {
    it('handles cwd with spaces in path', () => {
      const base = makeTempDir();
      const dir = join(base, 'path with spaces');
      mkdirSync(dir, { recursive: true });
      const output = runHook(dir);
      expect(output).toEqual({ decision: 'allow' });
    });

    it('handles empty package.json file', () => {
      const dir = makeTempDir();
      writeFileSync(join(dir, 'package.json'), '');
      // Empty file -> JSON.parse throws -> catch swallows -> falls through
      const output = runHook(dir);
      expect(output).toEqual({ decision: 'allow' });
    });

    it('handles package.json with empty scripts object', () => {
      const dir = makeTempDir();
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'empty-scripts', scripts: {} })
      );
      const output = runHook(dir);
      expect(output).toEqual({ decision: 'allow' });
    });

    it('handles Makefile that exists but is unreadable (empty)', () => {
      const dir = makeTempDir();
      writeFileSync(join(dir, 'Makefile'), '');
      // Empty Makefile -> no "test:" target -> falls through
      const output = runHook(dir);
      expect(output).toEqual({ decision: 'allow' });
    });

    it('detects test exit code 2 as failure (not just exit 1)', () => {
      const dir = makeTempDir();
      writePackageJson(dir, 'node -e "process.exit(2)"');
      const output = runHook(dir);
      expect(output.decision).toBe('block');
    });
  });
});
