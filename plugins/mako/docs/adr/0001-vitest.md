# ADR-0001: Vitest as test runner

**Date:** 2026-02-17
**Status:** Accepted

---

## Context

MAKO hooks need a test runner for the Phase A consolidation effort.
The project uses ES Modules internally for test utilities (`mocks/index.js`),
but hook files are CommonJS (ADR-0002).

Candidates evaluated: Jest, Vitest, node:test (built-in).

## Decision

Use **Vitest** as the primary test runner for new test files.

## Consequences

**Positive:**
- Native ESM support -- no Babel transform required
- Fast startup (Vite-based, no heavy JIT compilation)
- Built-in benchmark support via `bench()` -- used by the `benchmark` CI job
- Built-in coverage via `@vitest/coverage-v8` -- single dependency
- Compatible with `vitest.config.js` for threshold enforcement

**Negative:**
- Additional `devDependency` (Vitest + esbuild)
- Requires `"type": "module"` in test context, or explicit `.mjs` handling

**Neutral:**
- Legacy test files (`hooks.test.js`, `security.test.js`) keep `node:test` -- no migration required

## Alternatives Considered

| Runner | Reason rejected |
|--------|----------------|
| Jest | Requires Babel for ESM; slow startup; heavier setup |
| node:test (built-in) | No coverage integration; no watch mode; no benchmark support |
