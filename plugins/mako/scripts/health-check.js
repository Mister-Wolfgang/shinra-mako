#!/usr/bin/env node

/**
 * Health Check Script -- ST-7: CI/CD Pipeline
 *
 * Post-merge health verification for main branch.
 * Runs a subset of critical tests to confirm no regressions.
 *
 * Exit codes:
 *   0 = healthy
 *   1 = unhealthy (tests failed or critical error)
 *
 * Used by CI to decide whether to trigger rollback.
 */

import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const CHECKS = [
  {
    name: 'Smoke tests',
    command: 'npx vitest run -t "Smoke" --reporter=verbose',
  },
  {
    name: 'Contract validation',
    command: 'npx vitest run -t "Contract:" --reporter=verbose',
  },
  {
    name: 'Telemetry overhead < 5ms',
    command: 'npx vitest run -t "Performance" --reporter=verbose',
  },
];

let allPassed = true;
const results = [];

for (const check of CHECKS) {
  const start = Date.now();
  try {
    execSync(check.command, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 120_000,
    });
    const elapsed = Date.now() - start;
    results.push({ name: check.name, status: 'PASS', elapsed_ms: elapsed });
  } catch (err) {
    const elapsed = Date.now() - start;
    results.push({
      name: check.name,
      status: 'FAIL',
      elapsed_ms: elapsed,
      error: err.stderr ? err.stderr.slice(0, 500) : err.message.slice(0, 500),
    });
    allPassed = false;
  }
}

// Output structured JSON for CI parsing
const report = {
  timestamp: new Date().toISOString(),
  healthy: allPassed,
  checks: results,
};

console.log(JSON.stringify(report, null, 2));

process.exit(allPassed ? 0 : 1);
