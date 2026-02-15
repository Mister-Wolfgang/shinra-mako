/**
 * MAKO Hook: ensure-shodh-server.js
 *
 * Lightweight session-start hook. Does NOT manage the server lifecycle.
 * The SHODH server runs as an NSSM service (Windows), systemd (Linux),
 * or launchd (macOS) -- installed once manually.
 *
 * This hook only:
 *   1. Loads or creates ~/.shodh/shodh-config.json (API key, host, port)
 *   2. Syncs .mcp.json with current config
 *   3. Verifies the server is healthy and auth works
 *   4. Reports status -- never touches the service
 *
 * Constraints:
 *   - Node.js only (no external npm deps)
 *   - 120s timeout (hooks.json)
 *   - Idempotent, read-only on the service
 *   - No visible terminal windows
 */

const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const os = require("os");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_DIR = path.join(__dirname, "..");
const MCP_JSON_PATH = path.join(PLUGIN_DIR, ".mcp.json");

const SHODH_HOME = path.join(os.homedir(), ".shodh");
const CONFIG_PATH = path.join(SHODH_HOME, "shodh-config.json");

const HEALTH_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Config management
// ---------------------------------------------------------------------------

function loadOrCreateConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    if (!cfg.api_key) cfg.api_key = crypto.randomBytes(32).toString("hex");
    if (!cfg.host) cfg.host = "127.0.0.1";
    if (!cfg.port) cfg.port = 3030;
    if (!cfg.user_id) cfg.user_id = "rufus";
    return cfg;
  }
  const config = {
    api_key: crypto.randomBytes(32).toString("hex"),
    host: "127.0.0.1",
    port: 3030,
    user_id: "rufus",
  };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  return config;
}

// ---------------------------------------------------------------------------
// .mcp.json sync
// ---------------------------------------------------------------------------

function syncMcpConfig(config) {
  const memoryEntry = {
    command: "npx",
    args: ["-y", "@shodh/memory-mcp"],
    env: {
      SHODH_API_KEY: config.api_key,
      SHODH_API_URL: `http://${config.host}:${config.port}`,
      SHODH_USER_ID: config.user_id || "rufus",
      SHODH_NO_AUTO_SPAWN: "true",
      SHODH_STREAM: "false",
    },
  };

  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(MCP_JSON_PATH, "utf8"));
  } catch {}

  const current = JSON.stringify(existing.memory || {});
  const desired = JSON.stringify(memoryEntry);
  if (current !== desired) {
    existing.memory = memoryEntry;
    fs.writeFileSync(MCP_JSON_PATH, JSON.stringify(existing, null, 2) + "\n");
    log(".mcp.json updated");
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

function checkHealth(config) {
  const url = `http://${config.host}:${config.port}/health`;
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.status === "healthy");
        } catch {
          resolve(res.statusCode === 200);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.setTimeout(HEALTH_TIMEOUT_MS, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

function checkAuth(config) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      query: "auth-check",
      user_id: config.user_id || "rufus",
      n_results: 1,
    });
    const req = http.request(
      {
        hostname: config.host,
        port: config.port,
        path: "/api/v1/memory/search",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": config.api_key,
          "Content-Length": Buffer.byteLength(postData),
        },
        timeout: HEALTH_TIMEOUT_MS,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(res.statusCode !== 401));
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.write(postData);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Logging & output
// ---------------------------------------------------------------------------

function log(msg) {
  process.stderr.write(`[shodh-hook] ${msg}\n`);
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
  // Step 1: Config
  const config = loadOrCreateConfig();
  log(`Config loaded: ${config.host}:${config.port}`);

  // Step 2: Sync .mcp.json
  syncMcpConfig(config);

  // Step 3: Health check
  const healthy = await checkHealth(config);
  if (!healthy) {
    log("Server not responding");
    output(
      `shodh-memory server not responding at ${config.host}:${config.port}. ` +
        `Ensure the ShodhMemoryServer service is running. ` +
        `Manual check: curl http://${config.host}:${config.port}/health`
    );
    return;
  }

  // Step 4: Auth check
  const authOk = await checkAuth(config);
  if (!authOk) {
    log("Auth failed -- API key mismatch");
    output(
      `shodh-memory server is running but API key rejected (401). ` +
        `Config key in ${CONFIG_PATH} does not match the server. ` +
        `Fix: update the service env SHODH_API_KEYS to match, then restart the service.`
    );
    return;
  }

  output("shodh-memory server running");
  log("Health + auth OK.");
}

main().catch((err) => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  output(`shodh-memory hook error: ${err.message}`);
});
