'use strict';

/**
 * Mock wrapper for ensure-memory-server.js -- ST-9 fallback scenarios.
 *
 * Intercepts child_process.execSync to simulate different scenarios:
 *   - "mcp-down"         : Python found, service installed, but MCP service unreachable
 *   - "python-found"     : Full success (Python + service + MCP healthy)
 *
 * Also sets MCP_MEMORY_HEALTHY=false to signal the fallback path.
 */

const Module = require('module');
const path = require('path');

const scenario = process.env.MOCK_SCENARIO || 'mcp-down';

// Force MCP_MEMORY_HEALTHY=false for mcp-down scenario
if (scenario === 'mcp-down') {
  process.env.MCP_MEMORY_HEALTHY = 'false';
}

// ---------------------------------------------------------------------------
// Mock execSync before the hook loads
// ---------------------------------------------------------------------------

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'child_process') {
    const real = originalLoad.call(this, request, parent, isMain);
    return {
      ...real,
      execSync: function mockExecSync(cmd, opts) {
        const cmdStr = String(cmd);

        // Python version check
        if (cmdStr.includes('--version')) {
          return 'Python 3.11.5';
        }

        // mcp-memory-service import check
        if (cmdStr.includes('import mcp_memory_service')) {
          return '/usr/lib/python3.11/site-packages/mcp_memory_service/__init__.py';
        }

        // Fallback: call real execSync for anything else
        return real.execSync(cmd, opts);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// Now load the real hook
require(path.join(__dirname, '..', '..', 'ensure-memory-server.js'));
