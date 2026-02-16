# ADR-0005: Coverage thresholds at 70% lines / 65% branches

**Date:** 2026-02-17
**Status:** Accepted

---

## Context

Vitest supports enforcing minimum coverage thresholds via `vitest.config.js`.
The question is: what thresholds are appropriate for MAKO v6.0 Phase A?

MAKO uses a **Standard** quality tier (defined in `project-context.md`).
The Standard tier specification requires:
- Lines: > 70%
- Branches: > 65%

## Decision

Set Vitest coverage thresholds to match the **Standard tier specification**:

```js
// vitest.config.js
thresholds: {
  lines: 70,
  functions: 70,
  branches: 65,
  statements: 70,
}
```

Current coverage (Phase A): 98.6% lines, 100% functions, 69.46% branches.
All thresholds are met.

## Consequences

**Positive:**
- Thresholds are derived from the quality tier spec -- no arbitrary numbers
- CI enforces the floor; coverage cannot silently regress below Standard tier
- Branch threshold is intentionally lower (65%) because some defensive branches
  (e.g., OS-specific permission handling) are not exercisable in all CI environments

**Negative:**
- 69.46% branch coverage is close to the 65% floor -- future changes could trip it
- Thresholds do not enforce test quality, only quantity

**Neutral:**
- If the project is upgraded to Comprehensive tier, thresholds should be raised
  (suggested: lines 80%, branches 75%)

## Alternatives Considered

| Threshold | Reason rejected |
|-----------|----------------|
| 100% all metrics | Unachievable for OS-specific and error-path branches without heavy mocking |
| 50% (minimal) | Below Standard tier spec; does not provide meaningful regression protection |
| Per-file thresholds | More granular but harder to maintain; Standard tier does not require it |
