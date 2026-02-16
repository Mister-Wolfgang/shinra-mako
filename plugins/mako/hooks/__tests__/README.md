# MAKO Hooks Test Suite

## Overview

Two complementary test suites for MAKO v5.1.0 hooks:

| Test Suite | Author | Focus | Tests |
|------------|--------|-------|-------|
| `hooks.test.js` | Reno | Unit tests, integration, basic functionality | 13 |
| `security.test.js` | Elena | Security vulnerabilities, edge cases, stress tests | 32 |

**Total coverage: 45 tests**

## Running Tests

```bash
# Run all tests
cd hooks/
node --test __tests__/hooks.test.js
node --test __tests__/security.test.js

# Run tests with verbose output
node --test --test-reporter=spec __tests__/hooks.test.js
node --test --test-reporter=spec __tests__/security.test.js

# Run both in parallel
node --test __tests__/*.test.js
```

## Test Coverage

### hooks.test.js (Reno)
- user-prompt-submit-rufus.js: 5 tests (basic functionality, sprint status, agent IDs, JSON output)
- subagent-stop-memory.js: 5 tests (routing, next step suggestions, fallbacks)
- pre-compact-save.js: 4 tests (file creation, sprint status parsing, JSON output)

### security.test.js (Elena)
1. **Security: stdin JSON injection** (3 tests)
   - __proto__ pollution
   - Template literal injection
   - Code injection via agent names

2. **Security: Path traversal** (2 tests)
   - Malicious CLAUDE_PROJECT_DIR
   - Path traversal in YAML values

3. **Security: Oversized input** (2 tests)
   - 10MB stdin JSON
   - 1MB sprint-status.yaml

4. **Edge Cases: Malformed JSON** (4 tests)
   - Non-JSON stdin
   - Truncated JSON
   - JSON with trailing garbage
   - Empty stdin

5. **Edge Cases: Malformed YAML** (4 tests)
   - Invalid YAML syntax
   - Broken indentation
   - Empty files
   - Whitespace-only files

6. **Edge Cases: Unicode** (3 tests)
   - Japanese/Arabic text
   - Emojis in agent names
   - XSS patterns in workflow names

7. **Edge Cases: Missing files** (3 tests)
   - Missing .mako-session-state.json
   - Corrupted session state
   - File creation from scratch

8. **Edge Cases: Permissions** (1 test)
   - Read-only directory (graceful degradation)

9. **Edge Cases: Concurrency** (2 tests)
   - 5 concurrent writes
   - 10 concurrent reads

10. **validate-plugin.js robustness** (7 tests)
    - Empty directory
    - Missing agents/
    - Corrupted rufus.md
    - Invalid plugin.json
    - Missing required fields
    - Non-existent hook files
    - Valid plugin structure

11. **Summary** (1 test)
    - Coverage report

## Test Results

**Latest run: 2026-02-16**

| Suite | Tests | Passed | Failed | Skipped | Duration |
|-------|-------|--------|--------|---------|----------|
| hooks.test.js | 13 | 13 | 0 | 0 | 1.1s |
| security.test.js | 32 | 32 | 0 | 0 | 3.4s |
| **TOTAL** | **45** | **45** | **0** | **0** | **4.5s** |

## Security Findings

**Status: ALL CLEAR**

No vulnerabilities found. See `SECURITY-REPORT.json` for detailed findings.

Key security properties:
- No eval() or Function() constructor
- All JSON parsing wrapped in try-catch
- Path operations use Node.js path module correctly
- Zero external dependencies (no supply chain risk)
- Graceful fallback on all error conditions
- Timeout protection against DoS
- Read-only by default (only pre-compact-save writes)

## Test Philosophy

**Reno**: Fast, broad coverage. Test the happy path and basic failures.

**Elena**: Deep, paranoid coverage. Test what Reno missed -- security, edge cases, malformed input, race conditions.

> "Reno tests that it works. Elena tests that it doesn't break." -- Rufus

## Adding New Tests

1. **Unit tests → hooks.test.js**
   - Basic functionality
   - Expected inputs
   - Simple error handling

2. **Security/edge cases → security.test.js**
   - Malicious inputs
   - Boundary conditions
   - Stress tests
   - Concurrent access

## Continuous Integration

To run tests in CI:

```yaml
# .github/workflows/test.yml
- name: Run MAKO tests
  run: |
    cd hooks/
    node --test __tests__/*.test.js
```

## Dependencies

**ZERO** external dependencies. Uses only Node.js built-in modules:
- `node:test` (test runner)
- `node:assert/strict` (assertions)
- `child_process` (execSync, spawnSync)
- `fs` (file operations)
- `path` (path manipulation)
- `os` (temp directory)

## License

Part of MAKO plugin. See parent directory for license.
