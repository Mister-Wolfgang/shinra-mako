/**
 * Memory Fallback -- ST-9: Graceful Degradation when MCP Memory is Down
 *
 * Provides health check and contextual fallback messages for hooks that
 * interact with mcp-memory-service. NEVER crashes -- try/catch everywhere.
 *
 * @module hooks/lib/memory-fallback
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MCP_HTTP_PORT = parseInt(process.env.MCP_HTTP_PORT, 10) || 8000;
const HEALTH_TIMEOUT_MS = 2000;

// ---------------------------------------------------------------------------
// Fallback messages per hook
// ---------------------------------------------------------------------------

const FALLBACK_MESSAGES = {
  'ensure-memory-server':
    '[MCP MEMORY FALLBACK] mcp-memory-service est indisponible. ' +
    'La configuration MCP a ete ecrite mais le service ne repond pas. ' +
    'Les operations memoire seront ignorees jusqu\'a ce que le service soit relance.',

  'subagent-stop-memory':
    '[MCP MEMORY FALLBACK] mcp-memory-service est indisponible. ' +
    'store_memory() ne sera pas executee. ' +
    'Les resultats de l\'agent ne seront pas persistes en memoire. ' +
    'Relancez le service pour reactiver la persistance.',

  'pre-compact-save':
    '[MCP MEMORY FALLBACK] mcp-memory-service est indisponible. ' +
    'retrieve_memory() pourrait echouer apres le compactage. ' +
    'Le contexte local (sprint-status.yaml, .mako-session-state.json) reste disponible.',
};

const DEFAULT_FALLBACK =
  '[MCP MEMORY FALLBACK] mcp-memory-service est indisponible. ' +
  'Les operations memoire sont temporairement desactivees.';

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Synchronous check if mcp-memory-service is reachable.
 *
 * Uses a lightweight HTTP probe to localhost:MCP_HTTP_PORT.
 * Returns false if:
 *   - Service is not running
 *   - Connection refused
 *   - Timeout (> 2s)
 *   - Any other error
 *
 * NEVER throws.
 *
 * @returns {boolean} true if service responds, false otherwise
 */
function isMemoryServiceHealthy() {
  try {
    // Fast check: if MCP_MEMORY_HEALTHY env var is explicitly set to 'false',
    // skip the network probe entirely (used in testing and known-down scenarios)
    if (process.env.MCP_MEMORY_HEALTHY === 'false') {
      return false;
    }

    // Synchronous HTTP probe using child_process
    // We can't do async in a sync function, so we use a subprocess trick
    const { execSync } = require('child_process');

    // Use Node.js one-liner to probe the HTTP port
    const probe = `
      const http = require('http');
      const req = http.get(
        { hostname: '127.0.0.1', port: ${MCP_HTTP_PORT}, path: '/', timeout: ${HEALTH_TIMEOUT_MS} },
        (res) => { process.exit(0); }
      );
      req.on('error', () => process.exit(1));
      req.on('timeout', () => { req.destroy(); process.exit(1); });
    `;

    execSync(`node -e "${probe.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`, {
      timeout: HEALTH_TIMEOUT_MS + 500,
      stdio: 'ignore',
    });

    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fallback message
// ---------------------------------------------------------------------------

/**
 * Get a contextual fallback message for a given hook.
 *
 * NEVER throws -- returns a default message for unknown hooks.
 *
 * @param {string} hook - Hook name (e.g. 'ensure-memory-server')
 * @returns {string} Contextual fallback message
 */
function memoryFallbackMessage(hook) {
  try {
    const key = String(hook || '');
    return FALLBACK_MESSAGES[key] || DEFAULT_FALLBACK;
  } catch {
    return DEFAULT_FALLBACK;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  isMemoryServiceHealthy,
  memoryFallbackMessage,
};
