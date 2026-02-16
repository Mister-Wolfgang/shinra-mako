# ADR-0004: curl/Node health check

**Date:** 2026-02-17
**Status:** Accepted

---

## Context

The CI/CD pipeline needs a post-deploy health check to gate automatic rollback.
The check must verify that the plugin structure is valid and all referenced hook files exist.

Candidates: dedicated health check service, curl + HTTP endpoint, Node.js script.

## Decision

Use **`node hooks/validate-plugin.js .`** as the health check command.

The existing `validate-plugin.js` script already:
- Checks `plugin.json` structure and required fields
- Verifies all hook files referenced in `hooks.json` exist on disk
- Checks `agents/`, `skills/`, and `context/rufus.md` presence
- Exits with code 0 (pass) or 1 (fail)

The GitHub Actions `health-check` job runs this script post-deploy and triggers rollback on exit code 1.

For future HTTP endpoints, a `curl` check can be added alongside:
```bash
curl --fail http://localhost:PORT/health || exit 1
```

## Consequences

**Positive:**
- Reuses existing `validate-plugin.js` -- zero new code
- No network dependency -- works offline and in isolated CI environments
- Exit codes integrate directly with GitHub Actions `if: failure()` logic

**Negative:**
- Does not validate runtime behavior -- only structural integrity
- Cannot detect issues that require executing hooks (e.g., a hook that crashes on real input)

**Neutral:**
- Pattern is consistent with how the plugin is already validated during development

## Alternatives Considered

| Approach | Reason rejected |
|----------|----------------|
| HTTP health endpoint | No HTTP server in this plugin; would require adding one |
| Jest/Vitest suite as health check | Too slow; includes unit tests irrelevant to deploy health |
| Shell script (ls + grep) | Less maintainable; duplicates validate-plugin.js logic |
