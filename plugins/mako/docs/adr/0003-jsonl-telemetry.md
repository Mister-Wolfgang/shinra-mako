# ADR-0003: JSONL format for telemetry

**Date:** 2026-02-17
**Status:** Accepted

---

## Context

MAKO hooks need to emit telemetry (timing, events) for observability.
Hooks run as short-lived Node.js processes -- no persistent daemon, no shared memory.

Requirements:
- Append-only writes (multiple hooks may run in sequence)
- Human-readable and machine-parseable
- Zero additional dependencies
- Fast: < 5ms overhead per hook invocation

## Decision

Write telemetry as **JSONL** (newline-delimited JSON) to `$CLAUDE_PROJECT_DIR/.mako-telemetry.jsonl`.

Each line is one self-contained JSON object:

```jsonl
{"ts":"2026-02-17T10:00:00.000Z","hook":"user-prompt-submit-rufus","event":"start","ms":0}
{"ts":"2026-02-17T10:00:00.003Z","hook":"user-prompt-submit-rufus","event":"end","ms":3}
```

Implementation: `hooks/lib/telemetry.js` -- two functions:
- `logEvent(hook, event, extra?)` -- append one line
- `wrapHook(hookName, fn)` -- decorator that auto-logs start/end

## Consequences

**Positive:**
- Append-only: `fs.appendFileSync` -- no locks, no corruption on concurrent writes
- Greppable: `grep "hook-name" .mako-telemetry.jsonl | jq .`
- No dependencies: uses only `node:fs` and `JSON.stringify`
- Recoverable: corrupt lines are isolated; one bad line does not break the file

**Negative:**
- No rotation built-in -- file grows indefinitely; manual rotation required for long-lived projects
- No aggregation layer -- raw events only, no metrics rollup

**Neutral:**
- JSONL is append-only by nature; reading requires line-by-line parsing

## Alternatives Considered

| Format | Reason rejected |
|--------|----------------|
| JSON array | Requires read-parse-append-write cycle; race conditions on concurrent writes |
| CSV | Less flexible schema; harder to add fields without breaking parsers |
| SQLite | Adds a native dependency; overkill for event logging |
| Structured logging lib (pino, winston) | External dependency; violates zero-deps hook constraint |
