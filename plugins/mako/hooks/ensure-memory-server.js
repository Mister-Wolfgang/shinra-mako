/**
 * MAKO Hook: ensure-memory-server.js
 *
 * Lightweight session-start hook for mcp-memory-service (Python/SQLite-Vec).
 * Replaces ensure-shodh-server.js.
 *
 * This hook only:
 *   1. Ensures the storage directory exists (~/.shinra/)
 *   2. Verifies mcp-memory-service is installed (pip)
 *   3. Syncs .mcp.json with the correct mcp-memory-service config
 *   4. Reports status
 *
 * Constraints:
 *   - Node.js only (no external npm deps)
 *   - 120s timeout (hooks.json)
 *   - Idempotent
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");
const { isMemoryServiceHealthy, memoryFallbackMessage } = require("./lib/memory-fallback");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_DIR = path.join(__dirname, "..");
const MCP_JSON_PATH = path.join(PLUGIN_DIR, ".mcp.json");

const SHINRA_HOME = path.join(os.homedir(), ".shinra");
const MEMORY_DB_PATH = path.join(SHINRA_HOME, "memory.db");

// ---------------------------------------------------------------------------
// Find Python executable
// ---------------------------------------------------------------------------

function findPython() {
  for (const cmd of ["python", "python3"]) {
    try {
      const version = execSync(`${cmd} --version 2>&1`, {
        encoding: "utf8",
        timeout: 5000,
      }).trim();
      if (version.includes("Python 3.")) return cmd;
    } catch {}
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verify mcp-memory-service is installed
// ---------------------------------------------------------------------------

function checkMemoryServiceInstalled(pythonCmd) {
  try {
    const result = execSync(
      `${pythonCmd} -c "import mcp_memory_service; print(mcp_memory_service.__file__)"`,
      { encoding: "utf8", timeout: 10000 }
    ).trim();
    return !!result;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// .mcp.json sync
// ---------------------------------------------------------------------------

function syncMcpConfig(pythonCmd) {
  const memoryEntry = {
    command: pythonCmd,
    args: ["-m", "mcp_memory_service.server"],
    env: {
      MCP_MEMORY_STORAGE_BACKEND: "sqlite_vec",
      MCP_MEMORY_SQLITE_PATH: MEMORY_DB_PATH.replace(/\\/g, "/"),
      MCP_HTTP_ENABLED: "true",
      MCP_HTTP_PORT: "8000",
    },
  };

  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(MCP_JSON_PATH, "utf8"));
  } catch {}

  const current = JSON.stringify(existing.memory || {});
  const desired = JSON.stringify(memoryEntry);
  if (current !== desired) {
    // Remove old SHODH config if present
    existing.memory = memoryEntry;
    fs.writeFileSync(MCP_JSON_PATH, JSON.stringify(existing, null, 2) + "\n");
    log(".mcp.json updated for mcp-memory-service");
  }
}

// ---------------------------------------------------------------------------
// Logging & output
// ---------------------------------------------------------------------------

function log(msg) {
  process.stderr.write(`[memory-hook] ${msg}\n`);
}

function output(statusMessage, extra) {
  const result = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      statusMessage,
      ...extra,
    },
  };
  process.stdout.write(JSON.stringify(result));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Step 1: Ensure storage directory exists
  if (!fs.existsSync(SHINRA_HOME)) {
    fs.mkdirSync(SHINRA_HOME, { recursive: true });
    log(`Created storage directory: ${SHINRA_HOME}`);
  }

  // Step 2: Find Python
  const pythonCmd = findPython();
  if (!pythonCmd) {
    log("Python 3 not found");
    output(
      "Python 3.10+ not found. Install Python and run: pip install mcp-memory-service"
    );
    return;
  }
  log(`Python found: ${pythonCmd}`);

  // Step 3: Verify mcp-memory-service
  const installed = checkMemoryServiceInstalled(pythonCmd);
  if (!installed) {
    log("mcp-memory-service not installed");
    output(
      `mcp-memory-service not installed. Run: ${pythonCmd} -m pip install mcp-memory-service`
    );
    return;
  }
  log("mcp-memory-service is installed");

  // Step 4: Sync .mcp.json
  syncMcpConfig(pythonCmd);

  // Step 5: Check MCP Memory health (ST-9 fallback)
  const healthy = isMemoryServiceHealthy();
  if (!healthy) {
    const fallbackMsg = memoryFallbackMessage("ensure-memory-server");
    log(`WARNING: ${fallbackMsg}`);
    output("mcp-memory-service configured (SQLite-Vec) -- memory service unhealthy, fallback active");
    return;
  }

  // Step 6: Report success
  output("mcp-memory-service configured (SQLite-Vec)");
  log(`Storage path: ${MEMORY_DB_PATH}`);
  log("Ready.");
}

main().catch((err) => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  output(`memory hook error: ${err.message}`);
});
