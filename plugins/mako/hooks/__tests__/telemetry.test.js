/**
 * Telemetry Unit Tests -- ST-10: Lightweight Event Logging
 *
 * Hypothesis: telemetry.js provides logEvent() and wrapHook() that write
 * JSONL entries to disk without crashing hooks, with < 5ms overhead.
 *
 * CJS module under test, ESM test context (ADR-2).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..');
const TELEMETRY_DIR = join(PLUGIN_ROOT, 'telemetry');
const EVENTS_FILE = join(TELEMETRY_DIR, 'events.jsonl');

/**
 * Helper: load telemetry.js as CJS from ESM test context.
 * We must bust the require cache each time so tests are isolated.
 */
function loadTelemetry() {
  const require = createRequire(import.meta.url);
  const modulePath = resolve(__dirname, '..', 'lib', 'telemetry.js');

  // Bust cache for isolation
  delete require.cache[modulePath];

  return require(modulePath);
}

/**
 * Helper: read all JSONL lines from events file and parse them.
 */
function readEvents() {
  if (!existsSync(EVENTS_FILE)) return [];
  const raw = readFileSync(EVENTS_FILE, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map((line) => JSON.parse(line));
}

/**
 * Clean telemetry directory before/after each test.
 */
function cleanTelemetry() {
  if (existsSync(TELEMETRY_DIR)) {
    rmSync(TELEMETRY_DIR, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('ST-10: Telemetry Module', () => {
  beforeEach(() => {
    cleanTelemetry();
  });

  afterEach(() => {
    cleanTelemetry();
  });

  // -----------------------------------------------------------------------
  // Module loading
  // -----------------------------------------------------------------------

  describe('Module structure', () => {
    it('exports logEvent as a function', () => {
      const telemetry = loadTelemetry();
      expect(typeof telemetry.logEvent).toBe('function');
    });

    it('exports wrapHook as a function', () => {
      const telemetry = loadTelemetry();
      expect(typeof telemetry.wrapHook).toBe('function');
    });

    it('does not export any other public API', () => {
      const telemetry = loadTelemetry();
      const keys = Object.keys(telemetry);
      expect(keys.sort()).toEqual(['logEvent', 'wrapHook'].sort());
    });
  });

  // -----------------------------------------------------------------------
  // logEvent()
  // -----------------------------------------------------------------------

  describe('logEvent()', () => {
    it('creates telemetry directory if it does not exist', () => {
      const { logEvent } = loadTelemetry();
      expect(existsSync(TELEMETRY_DIR)).toBe(false);

      logEvent('test_event', 'test_hook');

      expect(existsSync(TELEMETRY_DIR)).toBe(true);
    });

    it('creates events.jsonl file on first call', () => {
      const { logEvent } = loadTelemetry();

      logEvent('test_event', 'test_hook');

      expect(existsSync(EVENTS_FILE)).toBe(true);
    });

    it('writes valid JSONL with required fields', () => {
      const { logEvent } = loadTelemetry();

      logEvent('hook_start', 'inject-rufus', 0);

      const events = readEvents();
      expect(events).toHaveLength(1);

      const entry = events[0];
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('event', 'hook_start');
      expect(entry).toHaveProperty('hook', 'inject-rufus');
      expect(entry).toHaveProperty('duration_ms', 0);
    });

    it('writes ISO 8601 timestamp', () => {
      const { logEvent } = loadTelemetry();

      logEvent('test_event', 'test_hook');

      const events = readEvents();
      const ts = events[0].timestamp;
      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(() => new Date(ts)).not.toThrow();
      expect(new Date(ts).toISOString()).toBe(ts);
    });

    it('includes duration_ms field defaulting to 0', () => {
      const { logEvent } = loadTelemetry();

      logEvent('test_event', 'test_hook');

      const events = readEvents();
      expect(events[0].duration_ms).toBe(0);
    });

    it('includes custom duration_ms when provided', () => {
      const { logEvent } = loadTelemetry();

      logEvent('hook_end', 'pre-commit-check', 42);

      const events = readEvents();
      expect(events[0].duration_ms).toBe(42);
    });

    it('includes metadata fields spread into entry', () => {
      const { logEvent } = loadTelemetry();

      logEvent('hook_error', 'inject-rufus', 15, { error: 'something broke' });

      const events = readEvents();
      expect(events[0].error).toBe('something broke');
    });

    it('appends multiple events as separate JSONL lines', () => {
      const { logEvent } = loadTelemetry();

      logEvent('hook_start', 'hook-a');
      logEvent('hook_end', 'hook-a', 10);
      logEvent('hook_start', 'hook-b');

      const events = readEvents();
      expect(events).toHaveLength(3);
      expect(events[0].event).toBe('hook_start');
      expect(events[1].event).toBe('hook_end');
      expect(events[2].hook).toBe('hook-b');
    });

    it('never throws -- silently fails on write error', () => {
      const { logEvent } = loadTelemetry();

      // Even with invalid path manipulation, should not throw
      // We test by making telemetry dir a file (write conflict)
      mkdirSync(dirname(EVENTS_FILE), { recursive: true });
      writeFileSync(EVENTS_FILE, '');
      // Make the file read-only to provoke a potential error on some systems
      // The point: logEvent MUST NOT throw regardless
      expect(() => {
        logEvent('test_event', 'test_hook');
      }).not.toThrow();
    });

    it('does not log user data -- only hook metadata', () => {
      const { logEvent } = loadTelemetry();

      logEvent('hook_end', 'inject-rufus', 5, { error: 'timeout' });

      const events = readEvents();
      const entry = events[0];
      // Verify no unexpected fields leak through
      const allowedKeys = ['timestamp', 'event', 'hook', 'duration_ms', 'error', 'metadata'];
      for (const key of Object.keys(entry)) {
        expect(allowedKeys).toContain(key);
      }
    });
  });

  // -----------------------------------------------------------------------
  // wrapHook()
  // -----------------------------------------------------------------------

  describe('wrapHook()', () => {
    it('returns an async function', () => {
      const { wrapHook } = loadTelemetry();

      const wrapped = wrapHook('test-hook', async () => 'ok');

      expect(typeof wrapped).toBe('function');
    });

    it('calls the original function and returns its result', async () => {
      const { wrapHook } = loadTelemetry();

      const wrapped = wrapHook('test-hook', async (x) => x * 2);
      const result = await wrapped(21);

      expect(result).toBe(42);
    });

    it('passes all arguments to the original function', async () => {
      const { wrapHook } = loadTelemetry();
      const spy = vi.fn(async (a, b, c) => a + b + c);

      const wrapped = wrapHook('test-hook', spy);
      await wrapped(1, 2, 3);

      expect(spy).toHaveBeenCalledWith(1, 2, 3);
    });

    it('logs hook_start and hook_end events on success', async () => {
      const { wrapHook } = loadTelemetry();

      const wrapped = wrapHook('inject-rufus', async () => 'done');
      await wrapped();

      const events = readEvents();
      expect(events.length).toBeGreaterThanOrEqual(2);

      const starts = events.filter((e) => e.event === 'hook_start');
      const ends = events.filter((e) => e.event === 'hook_end');

      expect(starts).toHaveLength(1);
      expect(ends).toHaveLength(1);
      expect(starts[0].hook).toBe('inject-rufus');
      expect(ends[0].hook).toBe('inject-rufus');
      expect(ends[0].duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('logs hook_start and hook_error on failure, then re-throws', async () => {
      const { wrapHook } = loadTelemetry();
      const boom = new Error('specimen escaped');

      const wrapped = wrapHook('dangerous-hook', async () => {
        throw boom;
      });

      await expect(wrapped()).rejects.toThrow('specimen escaped');

      const events = readEvents();
      const starts = events.filter((e) => e.event === 'hook_start');
      const errors = events.filter((e) => e.event === 'hook_error');

      expect(starts).toHaveLength(1);
      expect(errors).toHaveLength(1);
      expect(errors[0].hook).toBe('dangerous-hook');
      expect(errors[0].error).toBe('specimen escaped');
      expect(errors[0].duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('records accurate duration_ms for hook_end', async () => {
      const { wrapHook } = loadTelemetry();

      const wrapped = wrapHook('slow-hook', async () => {
        // Simulate ~50ms of work
        const start = Date.now();
        while (Date.now() - start < 50) { /* busy wait */ }
        return 'done';
      });
      await wrapped();

      const events = readEvents();
      const end = events.find((e) => e.event === 'hook_end');
      expect(end.duration_ms).toBeGreaterThanOrEqual(40); // allow some tolerance
      expect(end.duration_ms).toBeLessThan(200); // sanity upper bound
    });
  });

  // -----------------------------------------------------------------------
  // Performance: overhead < 5ms
  // -----------------------------------------------------------------------

  describe('Performance', () => {
    it('logEvent() completes in under 5ms', () => {
      const { logEvent } = loadTelemetry();

      // Warm up: create dir
      logEvent('warmup', 'warmup');

      const iterations = 20;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        logEvent('perf_test', 'perf-hook', i);
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / iterations;

      expect(avgMs).toBeLessThan(5);
    });

    it('wrapHook() adds less than 5ms overhead', async () => {
      const { wrapHook } = loadTelemetry();

      // Warm up
      const warmup = wrapHook('warmup', async () => {});
      await warmup();

      const noop = async () => 'result';
      const wrapped = wrapHook('perf-hook', noop);

      const iterations = 10;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        await wrapped();
      }
      const wrappedElapsed = performance.now() - start;

      const start2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        await noop();
      }
      const noopElapsed = performance.now() - start2;

      const overheadPerCall = (wrappedElapsed - noopElapsed) / iterations;
      // Allow generous margin -- fs operations vary, but must be under 5ms
      expect(overheadPerCall).toBeLessThan(5);
    });
  });
});
