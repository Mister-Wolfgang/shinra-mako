/**
 * Telemetry -- ST-10: Lightweight Event Logging
 *
 * Append-only JSONL telemetry for hook execution tracking.
 * Zero external dependencies. Silent failure -- telemetry NEVER crashes a hook.
 *
 * ADR-3: JSONL over SQLite -- O(1) append, human-readable, greppable.
 *
 * @module hooks/lib/telemetry
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TELEMETRY_FILE = path.join(
  process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..'),
  'telemetry',
  'events.jsonl'
);

/** Cache: once the directory is confirmed to exist, skip fs.existsSync. */
let dirEnsured = false;

/**
 * Log a telemetry event to the JSONL file.
 *
 * @param {string} event - Event type (hook_start, hook_end, hook_error)
 * @param {string} hook - Hook name
 * @param {number} [duration_ms=0] - Execution duration in milliseconds
 * @param {Object} [metadata={}] - Additional metadata (error messages, etc.)
 */
function logEvent(event, hook, duration_ms = 0, metadata = {}) {
  try {
    const entry = Object.assign(
      {
        timestamp: new Date().toISOString(),
        event,
        hook,
        duration_ms,
      },
      metadata
    );

    if (!dirEnsured) {
      const dir = path.dirname(TELEMETRY_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      dirEnsured = true;
    }

    fs.appendFileSync(TELEMETRY_FILE, JSON.stringify(entry) + '\n');
  } catch (_err) {
    // Silent failure -- telemetry NEVER crashes the hook
  }
}

/**
 * Wrap a hook function with telemetry instrumentation.
 *
 * Logs hook_start before execution, hook_end on success, hook_error on failure.
 * The original error is always re-thrown -- telemetry is transparent.
 *
 * @param {string} hookName - Name of the hook being wrapped
 * @param {Function} fn - The async hook function to wrap
 * @returns {Function} Wrapped async function with telemetry
 */
function wrapHook(hookName, fn) {
  return async function wrappedHook(...args) {
    const start = Date.now();

    logEvent('hook_start', hookName);

    try {
      const result = await fn(...args);
      logEvent('hook_end', hookName, Date.now() - start);
      return result;
    } catch (err) {
      logEvent('hook_error', hookName, Date.now() - start, {
        error: err.message,
      });
      throw err;
    }
  };
}

module.exports = {
  logEvent,
  wrapHook,
};
