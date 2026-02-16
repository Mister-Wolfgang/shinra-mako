# ADR-0002: CommonJS hooks, ESM tests

**Date:** 2026-02-17
**Status:** Accepted

---

## Context

MAKO hooks (`hooks/*.js`) are loaded by Claude Code's hook runner, which uses `require()`.
Changing hooks to ESM would break the hook runner -- a breaking change for all existing users.

New test files use Vitest, which works natively with ESM.

## Decision

Keep all hook files in **CommonJS** (`module.exports`).
Write new test files in **ESM** (`import`/`export`).
Load CJS hooks from ESM tests via `createRequire`.

```js
// In an ESM test file:
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const myHook = require('../my-hook.js');
```

## Consequences

**Positive:**
- Zero breaking change for hook consumers
- Test files can use modern ESM syntax and Vitest globals
- `mocks/index.js` exports cleanly as ESM

**Negative:**
- Requires `createRequire` boilerplate in each test file that imports a hook
- Two module systems coexist -- can be confusing for new contributors

**Neutral:**
- `smoke.test.js` uses `existsSync` rather than `require()` to avoid loading side effects

## Alternatives Considered

| Approach | Reason rejected |
|----------|----------------|
| Migrate hooks to ESM | Breaking change -- Claude Code hook runner uses `require()` |
| Keep tests in CJS | Cannot use Vitest's ESM-native features; mock system is awkward |
| Dynamic `import()` for hooks | Async-only; complicates sync test helpers |
