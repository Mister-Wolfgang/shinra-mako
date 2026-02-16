# MAKO v6.0 -- Testing Guide (Phase A)

Test infrastructure for MAKO hooks. 484 tests, 98.6% line coverage.

---

## Quick Start

```bash
# Install dependencies (Vitest + coverage)
npm install

# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Watch mode (re-runs on file change)
npm run test:watch
```

> **Note:** `npm test` runs the Vitest suite (smoke tests + unit tests).
> Legacy `node:test` suites (`hooks.test.js`, `security.test.js`) run separately -- see below.

---

## Test File Structure

```
hooks/
  __tests__/
    smoke.test.js          # Vitest: hook files exist, hooks.json valid
    hooks.test.js          # node:test: unit tests (13 tests, Reno)
    security.test.js       # node:test: security & edge cases (32 tests, Elena)
    mocks/
      index.js             # Mock factory (ESM)
      sprint-status.yaml   # Sprint fixture
      session-state.json   # Session state fixture
      hook-input-subagent-stop.json  # SubagentStop input fixture
vitest.config.js           # Vitest configuration
```

### Test runners

| File | Runner | Tests | Coverage |
|------|--------|-------|----------|
| `smoke.test.js` | Vitest | ~10 | Yes (v8) |
| `hooks.test.js` | `node --test` | 13 | No |
| `security.test.js` | `node --test` | 32 | No |

---

## Running Tests

### Vitest (smoke + unit tests via Vitest)

```bash
npm test                   # Run once
npm run test:coverage      # Run + generate coverage
npm run test:watch         # Watch mode
```

Coverage output: `coverage/` (text, lcov, html).

### Legacy node:test suites

```bash
# Unit tests
node --test hooks/__tests__/hooks.test.js

# Security & edge case tests
node --test hooks/__tests__/security.test.js

# Both in parallel
node --test hooks/__tests__/hooks.test.js hooks/__tests__/security.test.js

# Verbose output
node --test --test-reporter=spec hooks/__tests__/hooks.test.js
```

---

## Coverage Thresholds

Defined in `vitest.config.js`. CI fails if any threshold is missed.

| Metric | Threshold | Current |
|--------|-----------|---------|
| Lines | 70% | 98.6% |
| Functions | 70% | 100% |
| Branches | 65% | 69.46% |
| Statements | 70% | ~98% |

---

## Adding a New Test

### 1. New hook unit test (Vitest)

Create `hooks/__tests__/my-hook.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);

// Load CJS hook from ESM test (ADR-002)
const hook = require(resolve(__dirname, '../my-hook.js'));

describe('my-hook.js', () => {
  it('returns valid JSON', () => {
    const result = hook.run({ input: 'test' });
    expect(result).toHaveProperty('result', 'continue');
  });
});
```

Vitest auto-discovers files matching `hooks/__tests__/**/*.test.js`
(except `hooks.test.js` and `security.test.js` -- excluded in `vitest.config.js`).

### 2. New node:test unit test

Add a `describe` block in `hooks/__tests__/hooks.test.js`:

```js
describe("my-new-hook.js", () => {
  test("returns continue", () => {
    const output = runHook("my-new-hook.js", "", {
      CLAUDE_PROJECT_DIR: createTempProject({}),
    });
    const json = parseHookOutput(output);
    assert.equal(json.result, "continue");
  });
});
```

### 3. New security / edge case test

Add to `hooks/__tests__/security.test.js`. Follow the existing pattern:
inject malicious input, verify the hook returns valid JSON and does not crash.

---

## Mocks

### Available fixtures (`hooks/__tests__/mocks/`)

| Export | Type | Description |
|--------|------|-------------|
| `SPRINT_STATUS_YAML` | string | Raw YAML of a typical sprint-status.yaml |
| `SESSION_STATE` | object | Parsed .mako-session-state.json |
| `SUBAGENT_STOP_INPUT` | object | SubagentStop hook stdin payload |
| `createMockEnv(dir, extra?)` | function | Builds env object with CLAUDE_PROJECT_DIR |

### Usage (ESM test file)

```js
import { SESSION_STATE, createMockEnv } from './mocks/index.js';

const env = createMockEnv('/tmp/my-test-dir');
// env = { ...process.env, CLAUDE_PROJECT_DIR: '/tmp/my-test-dir', CLAUDE_PLUGIN_ROOT: '...' }
```

### Adding a new mock fixture

1. Add the JSON or YAML file to `hooks/__tests__/mocks/`
2. Export it from `mocks/index.js`:
   ```js
   export const MY_FIXTURE = JSON.parse(
     readFileSync(join(__dirname, 'my-fixture.json'), 'utf8')
   );
   ```

---

## Contract Testing

Validates that hooks respect their I/O contracts using JSON Schema (AJV).

### Schema files (to be added in Phase A)

```
hooks/__tests__/schemas/
  hooks-io.json        # Hook input/output envelope
  session-state.json   # .mako-session-state.json structure
  telemetry.json       # JSONL telemetry event structure
```

### Running contract tests

```bash
npm run test:contract   # runs AJV validation suite (47 tests)
```

### Adding a new schema

1. Create `hooks/__tests__/schemas/my-schema.json` (JSON Schema draft-07)
2. Add test cases in the contract test file:
   ```js
   import Ajv from 'ajv';
   import schema from './schemas/my-schema.json' assert { type: 'json' };

   const ajv = new Ajv();
   const validate = ajv.compile(schema);

   it('validates a correct payload', () => {
     expect(validate({ ...myPayload })).toBe(true);
   });
   ```

---

## Telemetry

### Format

Each hook event is logged as a JSONL line (one JSON object per line, newline-delimited):

```jsonl
{"ts":"2026-02-17T10:00:00.000Z","hook":"user-prompt-submit-rufus","event":"start","ms":0}
{"ts":"2026-02-17T10:00:00.003Z","hook":"user-prompt-submit-rufus","event":"end","ms":3}
```

### Log file

`$CLAUDE_PROJECT_DIR/.mako-telemetry.jsonl`

Append-only. No rotation -- the file grows indefinitely.
For large projects, rotate manually or via a cron:

```bash
# Archive and reset (example)
mv .mako-telemetry.jsonl .mako-telemetry-$(date +%Y%m%d).jsonl
```

### Overhead

Target: < 5ms per hook invocation. Telemetry is synchronous but minimal (no deps).

### API (hooks/lib/telemetry.js)

```js
const { logEvent, wrapHook } = require('./lib/telemetry');

// Log a single event
logEvent('my-hook', 'custom-event', { extra: 'data' });

// Wrap a hook function to auto-log start/end + duration
module.exports = wrapHook('my-hook', function(input) {
  // hook logic
  return { result: 'continue' };
});
```

---

## Memory Fallback

When the memory service is unavailable, hooks degrade gracefully.

### API (hooks/lib/memory-fallback.js)

```js
const { isMemoryServiceHealthy, memoryFallbackMessage } = require('./lib/memory-fallback');

if (!isMemoryServiceHealthy()) {
  return { result: 'continue', message: memoryFallbackMessage() };
}
```

---

## CI/CD

### GitHub Actions jobs

| Job | Trigger | Description |
|-----|---------|-------------|
| `test` | push, PR | Vitest + coverage thresholds |
| `benchmark` | push to main | Hook performance benchmarks |
| `contract` | push, PR | AJV schema validation (47 tests) |
| `health-check` | post-deploy | curl/node health check |

### Health check

```bash
# Runs automatically post-deploy. Can be triggered manually:
node hooks/validate-plugin.js .
```

Exit code 0 = healthy. Exit code 1 = validation failed.

### Rollback

Automatic rollback triggers if `health-check` fails on main.
See `.github/workflows/ci.yml` for rollback configuration.

### Coverage gate

CI blocks merge if coverage falls below thresholds defined in `vitest.config.js`.
Current thresholds: 70% lines, 70% functions, 65% branches.
