/**
 * MAKO Hook: ensure-shodh-server.js
 *
 * Ensures the shodh-memory-server runs as a hidden system service.
 * Cross-platform: Windows (NSSM service wrapper), Linux (systemd --user), macOS (launchd).
 *
 * Flow:
 *   1. Load or create shodh-config.json (API key, host, port)
 *   2. Set SHODH_DEV_API_KEY environment variable (persistent, machine-level)
 *   3. Check if the system service exists and is running
 *   4. If not: download binary, install service, start it
 *   5. Sync .mcp.json with current config
 *   6. Health check
 *
 * Constraints:
 *   - Node.js only (no external npm deps)
 *   - 120s timeout (hooks.json)
 *   - Idempotent: safe to run repeatedly
 *   - No visible terminal windows
 */

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const os = require("os");
const { pipeline } = require("stream/promises");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(PLUGIN_DIR, "servers", "shodh-memory", "shodh-config.json");
const MCP_JSON_PATH = path.join(PLUGIN_DIR, ".mcp.json");
const STORAGE_PATH = path.join(SHODH_HOME, "data");

const SHODH_HOME = path.join(os.homedir(), ".shodh");
const BIN_DIR = path.join(SHODH_HOME, "bin");

const PLATFORM = os.platform(); // win32 | linux | darwin
const ARCH = os.arch(); // x64 | arm64

const HEALTH_TIMEOUT_MS = 3000;
const HEALTH_POLL_MS = 500;
const HEALTH_MAX_WAIT_MS = 20000;

const GITHUB_RELEASE_BASE =
  "https://github.com/varun29ankuS/shodh-memory/releases/latest/download";

// NSSM (Non-Sucking Service Manager) -- lightweight MIT-licensed service wrapper.
// Required on Windows because `sc create` only works with binaries that implement
// StartServiceCtrlDispatcher. NSSM wraps any executable as a proper Windows service.
const NSSM_VERSION = "2.24";
const NSSM_URL = `https://nssm.cc/release/nssm-${NSSM_VERSION}.zip`;

// Service identifiers per platform
// NOTE: All `sc`, `reg`, `schtasks`, and `powershell` calls on Windows are
// wrapped with `cmd.exe /c "..."` via winExec() to prevent Git Bash (MSYS2)
// from mangling `/`-prefixed flags into Windows paths (e.g., /query ->
// C:/Program Files/Git/query). Internal double quotes are escaped as "" per
// cmd.exe conventions.
const SERVICE_NAME_WIN = "ShodhMemoryServer";
const SERVICE_NAME_LINUX = "shodh-memory";
const SERVICE_PLIST_LABEL = "com.shodh.memory-server";

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

function getPlatformKey() {
  const platformMap = { win32: "windows", linux: "linux", darwin: "macos" };
  const archMap = { x64: "x64", arm64: "arm64" };
  const p = platformMap[PLATFORM];
  const a = archMap[ARCH];
  if (!p || !a) return null;
  return { platform: p, arch: a };
}

function getBinaryName() {
  return PLATFORM === "win32" ? "shodh-memory-server.exe" : "shodh-memory-server";
}

function getBinaryPath() {
  return path.join(BIN_DIR, getBinaryName());
}

function getDownloadUrl() {
  const info = getPlatformKey();
  if (!info) return null;
  const ext = PLATFORM === "win32" ? ".zip" : ".tar.gz";
  const filename = `shodh-memory-${info.platform}-${info.arch}${ext}`;
  return `${GITHUB_RELEASE_BASE}/${filename}`;
}

/**
 * Execute a command on Windows via cmd.exe /c "..." to prevent Git Bash
 * (MSYS2) from mangling `/`-prefixed flags (e.g., /Query -> C:/Program Files/Git/Query).
 * Internal double quotes are escaped as "" per cmd.exe conventions.
 */
function winExec(command, options = {}) {
  const escaped = command.replace(/"/g, '""');
  return execSync(`cmd.exe /c "${escaped}"`, options);
}

/**
 * Get path to NSSM executable.
 */
function getNssmPath() {
  return path.join(BIN_DIR, "nssm.exe");
}

/**
 * Download and extract NSSM (Non-Sucking Service Manager) if not already present.
 * NSSM is ~350KB, MIT-licensed, and is the standard way to run non-service
 * executables as Windows services.
 */
async function ensureNssm() {
  const nssmPath = getNssmPath();
  if (fs.existsSync(nssmPath)) return nssmPath;

  log(`Downloading NSSM ${NSSM_VERSION} from ${NSSM_URL}`);
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const archivePath = path.join(BIN_DIR, `nssm-${NSSM_VERSION}.zip`);

  // Download
  const res = await httpsGet(NSSM_URL);
  const fileStream = fs.createWriteStream(archivePath);
  await pipeline(res, fileStream);

  // Extract via PowerShell
  winExec(
    `powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${BIN_DIR}' -Force"`,
    { windowsHide: true, timeout: 30000 }
  );

  // The archive extracts to nssm-<version>/win64/nssm.exe (or win32)
  const nssmArch = ARCH === "x64" ? "win64" : "win32";
  const extractedPath = path.join(BIN_DIR, `nssm-${NSSM_VERSION}`, nssmArch, "nssm.exe");

  if (fs.existsSync(extractedPath)) {
    fs.copyFileSync(extractedPath, nssmPath);
    log(`NSSM installed at ${nssmPath}`);
  } else {
    // Try the other arch as fallback
    const fallbackArch = nssmArch === "win64" ? "win32" : "win64";
    const fallbackPath = path.join(BIN_DIR, `nssm-${NSSM_VERSION}`, fallbackArch, "nssm.exe");
    if (fs.existsSync(fallbackPath)) {
      fs.copyFileSync(fallbackPath, nssmPath);
      log(`NSSM installed at ${nssmPath} (${fallbackArch})`);
    } else {
      throw new Error(`NSSM executable not found after extraction. Expected: ${extractedPath}`);
    }
  }

  // Cleanup extracted directory and archive
  try {
    fs.rmSync(path.join(BIN_DIR, `nssm-${NSSM_VERSION}`), { recursive: true, force: true });
  } catch {}
  try {
    fs.unlinkSync(archivePath);
  } catch {}

  return nssmPath;
}

// ---------------------------------------------------------------------------
// Config management
// ---------------------------------------------------------------------------

function loadOrCreateConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    // Ensure all required fields exist
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
// Environment variable: SHODH_DEV_API_KEY (persistent)
// ---------------------------------------------------------------------------

function ensureEnvVar(apiKey) {
  const current = process.env.SHODH_DEV_API_KEY;
  if (current === apiKey) return { set: false, message: "already set" };

  try {
    if (PLATFORM === "win32") {
      // setx sets at user level (no admin needed)
      execSync(`setx SHODH_DEV_API_KEY "${apiKey}"`, {
        windowsHide: true,
        timeout: 10000,
        stdio: "pipe",
      });
      // Also set for the current process so the rest of the hook sees it
      process.env.SHODH_DEV_API_KEY = apiKey;
      return { set: true, message: "set via setx (user level)" };
    }

    if (PLATFORM === "linux" || PLATFORM === "darwin") {
      const shell = process.env.SHELL || "/bin/bash";
      const rcFile = shell.includes("zsh")
        ? path.join(os.homedir(), ".zshrc")
        : path.join(os.homedir(), ".bashrc");

      const exportLine = `export SHODH_DEV_API_KEY="${apiKey}"`;
      let rcContent = "";
      try {
        rcContent = fs.readFileSync(rcFile, "utf8");
      } catch {}

      if (rcContent.includes("SHODH_DEV_API_KEY")) {
        // Replace existing line
        rcContent = rcContent.replace(
          /^export SHODH_DEV_API_KEY=.*$/m,
          exportLine
        );
      } else {
        rcContent += `\n# shodh-memory API key (auto-generated by MAKO)\n${exportLine}\n`;
      }
      fs.writeFileSync(rcFile, rcContent);
      process.env.SHODH_DEV_API_KEY = apiKey;
      return { set: true, message: `written to ${rcFile}` };
    }

    return { set: false, message: `unsupported platform: ${PLATFORM}` };
  } catch (err) {
    // Non-fatal: the hook will inject the key directly into .mcp.json
    process.env.SHODH_DEV_API_KEY = apiKey;
    return { set: false, message: `failed: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Download & extract binary
// ---------------------------------------------------------------------------

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return httpsGet(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        resolve(res);
      })
      .on("error", reject);
  });
}

async function downloadAndExtract() {
  const url = getDownloadUrl();
  if (!url) {
    throw new Error(
      `Unsupported platform/arch: ${PLATFORM}/${ARCH}. ` +
        `Supported: windows-x64, linux-x64, linux-arm64, macos-x64, macos-arm64`
    );
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });

  const isZip = url.endsWith(".zip");
  const archiveExt = isZip ? ".zip" : ".tar.gz";
  const archivePath = path.join(BIN_DIR, `shodh-memory${archiveExt}`);

  // Download
  log(`Downloading shodh-memory from ${url}`);
  const res = await httpsGet(url);
  const fileStream = fs.createWriteStream(archivePath);
  await pipeline(res, fileStream);

  const sizeMB = (fs.statSync(archivePath).size / 1024 / 1024).toFixed(1);
  log(`Downloaded ${sizeMB} MB`);

  // Extract
  log("Extracting...");
  if (isZip) {
    // Windows: PowerShell Expand-Archive (via winExec to avoid Git Bash mangling)
    winExec(
      `powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${BIN_DIR}' -Force"`,
      { windowsHide: true, timeout: 30000 }
    );
  } else {
    // Linux/macOS: tar
    execSync(`tar -xzf "${archivePath}" -C "${BIN_DIR}"`, {
      timeout: 30000,
    });
  }

  // Some archives contain a subdirectory -- flatten it
  const info = getPlatformKey();
  const subDir = path.join(BIN_DIR, `shodh-memory-${info.platform}-${info.arch}`);
  if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
    for (const file of fs.readdirSync(subDir)) {
      const src = path.join(subDir, file);
      const dest = path.join(BIN_DIR, file);
      if (!fs.existsSync(dest)) fs.renameSync(src, dest);
    }
    fs.rmSync(subDir, { recursive: true, force: true });
  }

  // Make binary executable on Unix
  if (PLATFORM !== "win32") {
    const binPath = getBinaryPath();
    if (fs.existsSync(binPath)) {
      fs.chmodSync(binPath, 0o755);
    }
  }

  // Cleanup archive
  try {
    fs.unlinkSync(archivePath);
  } catch {}

  log("shodh-memory binary installed.");
}

// ---------------------------------------------------------------------------
// Service management: check / install / start
// ---------------------------------------------------------------------------

/**
 * Returns { exists: bool, running: bool } for the system service.
 */
function checkService() {
  try {
    if (PLATFORM === "win32") {
      return checkServiceWindows();
    } else if (PLATFORM === "linux") {
      return checkServiceLinux();
    } else if (PLATFORM === "darwin") {
      return checkServiceMacOS();
    }
  } catch {
    // If anything goes wrong checking, assume not installed
  }
  return { exists: false, running: false };
}

function checkServiceWindows() {
  // Query the Windows service via `sc query`
  try {
    const result = winExec(
      `sc query ${SERVICE_NAME_WIN}`,
      { encoding: "utf8", windowsHide: true, timeout: 10000, stdio: "pipe" }
    );

    // sc query output contains "STATE" line, e.g.:
    //   STATE              : 4  RUNNING
    //   STATE              : 1  STOPPED
    const exists = result.includes("SERVICE_NAME") || result.includes("STATE");
    if (!exists) return { exists: false, running: false };

    const running = /STATE\s+:\s+4\s+RUNNING/i.test(result);
    return { exists: true, running };
  } catch {
    // sc query returns non-zero exit code if service doesn't exist
    return { exists: false, running: false };
  }
}

function checkServiceLinux() {
  try {
    const result = execSync(
      `systemctl --user is-active ${SERVICE_NAME_LINUX}.service 2>/dev/null`,
      { encoding: "utf8", timeout: 5000, stdio: "pipe" }
    );
    const active = result.trim() === "active";
    return { exists: true, running: active };
  } catch {
    // Check if the unit file exists even if not active
    const unitPath = path.join(
      os.homedir(),
      ".config",
      "systemd",
      "user",
      `${SERVICE_NAME_LINUX}.service`
    );
    if (fs.existsSync(unitPath)) {
      return { exists: true, running: false };
    }
    return { exists: false, running: false };
  }
}

function checkServiceMacOS() {
  const plistPath = path.join(
    os.homedir(),
    "Library",
    "LaunchAgents",
    `${SERVICE_PLIST_LABEL}.plist`
  );
  if (!fs.existsSync(plistPath)) {
    return { exists: false, running: false };
  }
  try {
    const result = execSync(
      `launchctl list "${SERVICE_PLIST_LABEL}" 2>/dev/null`,
      { encoding: "utf8", timeout: 5000, stdio: "pipe" }
    );
    // If launchctl list succeeds, the agent is loaded
    const running = isProcessRunning("shodh-memory-server");
    return { exists: true, running };
  } catch {
    return { exists: true, running: false };
  }
}

function isProcessRunning(name) {
  try {
    if (PLATFORM === "win32") {
      const result = winExec(
        `powershell -NoProfile -Command "Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id"`,
        { encoding: "utf8", windowsHide: true, timeout: 5000, stdio: "pipe" }
      );
      return parseInt(result.trim(), 10) > 0;
    } else {
      execSync(`pgrep -x "${name}"`, { timeout: 3000, stdio: "pipe" });
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Install the system service. Returns { success, message, manualInstructions? }
 */
async function installService(config) {
  const binPath = getBinaryPath();
  const args = [
    "--host", config.host,
    "--port", String(config.port),
    "--storage", STORAGE_PATH,
  ].join(" ");

  fs.mkdirSync(STORAGE_PATH, { recursive: true });

  if (PLATFORM === "win32") {
    return await installServiceWindows(binPath, args, config);
  } else if (PLATFORM === "linux") {
    return installServiceLinux(binPath, args, config);
  } else if (PLATFORM === "darwin") {
    return installServiceMacOS(binPath, args, config);
  }

  return {
    success: false,
    message: `Unsupported platform: ${PLATFORM}`,
    manualInstructions: `Manually run: ${binPath} ${args}`,
  };
}

async function installServiceWindows(binPath, args, config) {
  // Use NSSM (Non-Sucking Service Manager) to wrap the binary as a real Windows
  // service. This is required because `sc create` only works with binaries that
  // implement StartServiceCtrlDispatcher -- shodh-memory-server.exe is a regular
  // executable, not a service binary.
  //
  // NSSM creates an invisible service that auto-starts on boot and auto-restarts
  // on failure. Requires admin privileges for service installation.
  //
  // If admin is not available, we DO NOT fall back to schtasks (which always
  // opens a visible console window). Instead we return clear manual instructions
  // so the user can run the commands in an elevated terminal once.

  // Step 0: Clean up legacy scheduled task from previous versions (ignore errors)
  try {
    winExec(`schtasks /Delete /TN "${SERVICE_NAME_WIN}" /F`, {
      windowsHide: true,
      timeout: 10000,
      stdio: "pipe",
    });
    log("Deleted legacy scheduled task");
  } catch {
    // Task didn't exist -- that's fine
  }

  // Step 1: Ensure NSSM is available
  let nssmPath;
  try {
    nssmPath = await ensureNssm();
  } catch (err) {
    return {
      success: false,
      message: `Failed to download NSSM: ${err.message}`,
      manualInstructions: [
        `Download NSSM from ${NSSM_URL}`,
        `Extract nssm.exe to ${BIN_DIR}`,
        `Then run: nssm install ${SERVICE_NAME_WIN} "${binPath}" --host ${config.host} --port ${config.port} --storage "${STORAGE_PATH}"`,
      ].join("\n"),
    };
  }

  // Step 2: Remove existing service if any (idempotent reinstall)
  try {
    winExec(`"${nssmPath}" stop ${SERVICE_NAME_WIN}`, {
      windowsHide: true,
      timeout: 15000,
      stdio: "pipe",
    });
  } catch {
    // Service wasn't running or doesn't exist
  }

  try {
    winExec(`"${nssmPath}" remove ${SERVICE_NAME_WIN} confirm`, {
      windowsHide: true,
      timeout: 10000,
      stdio: "pipe",
    });
    log("Removed existing Windows service for reinstall");
  } catch {
    // Service didn't exist -- that's fine
  }

  // Step 3: Install the service via NSSM
  try {
    // Install: nssm install <name> <binary> <args...>
    winExec(
      `"${nssmPath}" install ${SERVICE_NAME_WIN} "${binPath}" --host ${config.host} --port ${config.port} --storage "${STORAGE_PATH}"`,
      { windowsHide: true, timeout: 10000, stdio: "pipe" }
    );

    // Set description
    winExec(
      `"${nssmPath}" set ${SERVICE_NAME_WIN} Description "Shodh Memory Server - cognitive memory system for AI agents"`,
      { windowsHide: true, timeout: 10000, stdio: "pipe" }
    );

    // Set environment variable for the service
    winExec(
      `"${nssmPath}" set ${SERVICE_NAME_WIN} AppEnvironmentExtra SHODH_API_KEYS=${config.api_key}`,
      { windowsHide: true, timeout: 10000, stdio: "pipe" }
    );

    // Set auto-start on boot
    winExec(
      `"${nssmPath}" set ${SERVICE_NAME_WIN} Start SERVICE_AUTO_START`,
      { windowsHide: true, timeout: 10000, stdio: "pipe" }
    );

    // Configure stdout/stderr logging
    const logDir = SHODH_HOME;
    winExec(
      `"${nssmPath}" set ${SERVICE_NAME_WIN} AppStdout "${path.join(logDir, "shodh-memory.log")}"`,
      { windowsHide: true, timeout: 10000, stdio: "pipe" }
    );
    winExec(
      `"${nssmPath}" set ${SERVICE_NAME_WIN} AppStderr "${path.join(logDir, "shodh-memory.err.log")}"`,
      { windowsHide: true, timeout: 10000, stdio: "pipe" }
    );

    // Append to log files (don't truncate on restart)
    winExec(
      `"${nssmPath}" set ${SERVICE_NAME_WIN} AppStdoutCreationDisposition 4`,
      { windowsHide: true, timeout: 10000, stdio: "pipe" }
    );
    winExec(
      `"${nssmPath}" set ${SERVICE_NAME_WIN} AppStderrCreationDisposition 4`,
      { windowsHide: true, timeout: 10000, stdio: "pipe" }
    );

    // Configure restart on failure (exit code != 0 -> restart after 5s)
    winExec(
      `"${nssmPath}" set ${SERVICE_NAME_WIN} AppExit Default Restart`,
      { windowsHide: true, timeout: 10000, stdio: "pipe" }
    );
    winExec(
      `"${nssmPath}" set ${SERVICE_NAME_WIN} AppRestartDelay 5000`,
      { windowsHide: true, timeout: 10000, stdio: "pipe" }
    );

    return { success: true, message: "Windows service created via NSSM (auto-start, auto-restart, invisible)" };
  } catch (err) {
    // NSSM install failed -- most likely because we're not running as admin
    const errMsg = err.message || String(err);
    const isAccessDenied = /access.*denied|5\b|privilege|elevated/i.test(errMsg);

    const manualCommands = [
      `"${nssmPath}" install ${SERVICE_NAME_WIN} "${binPath}" --host ${config.host} --port ${config.port} --storage "${STORAGE_PATH}"`,
      `"${nssmPath}" set ${SERVICE_NAME_WIN} AppEnvironmentExtra SHODH_API_KEYS=${config.api_key}`,
      `"${nssmPath}" set ${SERVICE_NAME_WIN} Start SERVICE_AUTO_START`,
      `"${nssmPath}" set ${SERVICE_NAME_WIN} AppExit Default Restart`,
      `"${nssmPath}" start ${SERVICE_NAME_WIN}`,
    ];

    return {
      success: false,
      message: isAccessDenied
        ? "Service installation requires administrator privileges"
        : `Failed to create Windows service: ${errMsg}`,
      manualInstructions: [
        "Run these commands in an elevated (Administrator) terminal:",
        "",
        ...manualCommands,
        "",
        `NSSM is located at: ${nssmPath}`,
        `Binary is located at: ${binPath}`,
      ].join("\n"),
    };
  }
}

function installServiceLinux(binPath, args, config) {
  const unitDir = path.join(os.homedir(), ".config", "systemd", "user");
  const unitPath = path.join(unitDir, `${SERVICE_NAME_LINUX}.service`);

  const unitContent = `[Unit]
Description=Shodh Memory Server
After=network.target

[Service]
Type=simple
ExecStart=${binPath} --host ${config.host} --port ${config.port} --storage ${STORAGE_PATH}
Environment=SHODH_API_KEYS=${config.api_key}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;

  try {
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(unitPath, unitContent);

    execSync("systemctl --user daemon-reload", { timeout: 10000, stdio: "pipe" });
    execSync(`systemctl --user enable --now ${SERVICE_NAME_LINUX}.service`, {
      timeout: 10000,
      stdio: "pipe",
    });

    return { success: true, message: "systemd user service installed and started" };
  } catch (err) {
    return {
      success: false,
      message: `Failed to install systemd service: ${err.message}`,
      manualInstructions: [
        `mkdir -p ${unitDir}`,
        `# Write the following to ${unitPath}:`,
        unitContent,
        `systemctl --user daemon-reload`,
        `systemctl --user enable --now ${SERVICE_NAME_LINUX}.service`,
      ].join("\n"),
    };
  }
}

function installServiceMacOS(binPath, args, config) {
  const agentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
  const plistPath = path.join(agentsDir, `${SERVICE_PLIST_LABEL}.plist`);

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binPath}</string>
    <string>--host</string>
    <string>${config.host}</string>
    <string>--port</string>
    <string>${String(config.port)}</string>
    <string>--storage</string>
    <string>${STORAGE_PATH}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SHODH_API_KEYS</key>
    <string>${config.api_key}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${path.join(SHODH_HOME, "shodh-memory.log")}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(SHODH_HOME, "shodh-memory.err.log")}</string>
</dict>
</plist>
`;

  try {
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(plistPath, plistContent);

    // Unload first if already loaded (idempotent)
    try {
      execSync(`launchctl unload "${plistPath}"`, {
        timeout: 5000,
        stdio: "pipe",
      });
    } catch {}

    execSync(`launchctl load "${plistPath}"`, {
      timeout: 5000,
      stdio: "pipe",
    });

    return { success: true, message: "macOS launch agent installed and loaded" };
  } catch (err) {
    return {
      success: false,
      message: `Failed to install launch agent: ${err.message}`,
      manualInstructions: [
        `# Write the following to ${plistPath}:`,
        plistContent,
        `launchctl load "${plistPath}"`,
      ].join("\n"),
    };
  }
}

/**
 * Start the service (or the binary directly as a fallback).
 * Returns { started, message }
 */
function startService(config) {
  const binPath = getBinaryPath();

  if (PLATFORM === "win32") {
    try {
      winExec(`sc start ${SERVICE_NAME_WIN}`, {
        windowsHide: true,
        timeout: 10000,
        stdio: "pipe",
      });
      return { started: true, message: "service started via sc start" };
    } catch {
      // Fallback: spawn the process directly (hidden, detached)
      return startDirect(binPath, config);
    }
  }

  if (PLATFORM === "linux") {
    try {
      execSync(`systemctl --user start ${SERVICE_NAME_LINUX}.service`, {
        timeout: 10000,
        stdio: "pipe",
      });
      return { started: true, message: "service started via systemctl" };
    } catch {
      return startDirect(binPath, config);
    }
  }

  if (PLATFORM === "darwin") {
    // launchctl load already starts it if RunAtLoad is true.
    // But if the process died, we can kickstart it.
    try {
      execSync(`launchctl kickstart -k gui/$(id -u)/${SERVICE_PLIST_LABEL}`, {
        timeout: 10000,
        stdio: "pipe",
      });
      return { started: true, message: "service started via launchctl kickstart" };
    } catch {
      return startDirect(binPath, config);
    }
  }

  return startDirect(binPath, config);
}

/**
 * Direct spawn fallback -- detached, hidden, no terminal.
 * On Windows, uses `cmd.exe /c start /b` to prevent any visible window.
 * On Unix, uses standard detached spawn.
 */
function startDirect(binPath, config) {
  try {
    const args = ["--host", config.host, "--port", String(config.port), "--storage", STORAGE_PATH];
    const spawnEnv = { ...process.env, SHODH_API_KEYS: config.api_key };

    let child;
    if (PLATFORM === "win32") {
      // cmd.exe /c start /b prevents any window from appearing.
      // The "" after start is the window title (required when the command has quotes).
      child = spawn(
        "cmd.exe",
        ["/c", "start", "/b", '""', `"${binPath}"`, ...args],
        {
          cwd: BIN_DIR,
          detached: true,
          stdio: "ignore",
          env: spawnEnv,
          windowsHide: true,
          shell: false,
        }
      );
    } else {
      child = spawn(binPath, args, {
        cwd: BIN_DIR,
        detached: true,
        stdio: "ignore",
        env: spawnEnv,
        windowsHide: true,
      });
    }
    child.unref();
    return {
      started: true,
      message: `started directly (PID ${child.pid}) -- note: will not survive reboot without service`,
    };
  } catch (err) {
    return { started: false, message: `direct spawn failed: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// .mcp.json sync
// ---------------------------------------------------------------------------

function syncMcpConfig(config) {
  // Claude Code does NOT resolve ${VAR} in .mcp.json env values.
  // We must inject the actual API key value directly.
  const memoryEntry = {
    command: "npx",
    args: ["-y", "@shodh/memory-mcp"],
    env: {
      SHODH_API_KEY: config.api_key,
      SHODH_API_URL: `http://${config.host}:${config.port}`,
      SHODH_USER_ID: config.user_id || "rufus",
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
          // Some servers return 200 with no JSON body -- accept that too
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

async function waitForHealth(config) {
  const start = Date.now();
  while (Date.now() - start < HEALTH_MAX_WAIT_MS) {
    if (await checkHealth(config)) return true;
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Auth check -- verifies the API key is accepted by the running server
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
// Service cmd wrapper -- keeps shodh-memory-service.cmd in sync with config
// ---------------------------------------------------------------------------

function updateServiceCmd(config) {
  const cmdPath = path.join(BIN_DIR, "shodh-memory-service.cmd");
  const content = [
    "@echo off",
    `set "SHODH_API_KEYS=${config.api_key}"`,
    `set "PATH=${BIN_DIR};%PATH%"`,
    `"${getBinaryPath()}" --host ${config.host} --port ${config.port} --storage "${STORAGE_PATH}"`,
    "",
  ].join("\r\n");
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.writeFileSync(cmdPath, content);
  log("shodh-memory-service.cmd updated");
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg) {
  process.stderr.write(`[shodh-hook] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Output helper
// ---------------------------------------------------------------------------

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

  // Step 2: Environment variable
  const envResult = ensureEnvVar(config.api_key);
  log(`SHODH_DEV_API_KEY: ${envResult.message}`);

  // Step 3: Sync .mcp.json (do this early so even if service setup fails,
  // the MCP config is correct for next time)
  syncMcpConfig(config);

  // Step 3.5: Update service cmd wrapper with current config
  updateServiceCmd(config);

  // Step 4: Check if service exists and is running
  const serviceStatus = checkService();
  log(`Service status: exists=${serviceStatus.exists}, running=${serviceStatus.running}`);

  // Step 5: Fast path -- already healthy AND auth works
  if (serviceStatus.running && (await checkHealth(config))) {
    if (await checkAuth(config)) {
      output("shodh-memory server running (service mode)");
      return;
    }
    log("Health OK but API key mismatch -- forcing restart with correct key");
    // Kill the running process so we can restart with the correct API key
    try {
      if (PLATFORM === "win32") {
        winExec(
          `powershell -NoProfile -Command "Get-Process -Name 'shodh-memory-server' -ErrorAction SilentlyContinue | Stop-Process -Force"`,
          { windowsHide: true, timeout: 10000, stdio: "pipe" }
        );
      } else {
        execSync("pkill -x shodh-memory-server", { timeout: 5000, stdio: "pipe" });
      }
      await new Promise((r) => setTimeout(r, 2000));
    } catch {}
    // Force reinstall + restart by resetting status
    serviceStatus.exists = false;
    serviceStatus.running = false;
  }

  // Step 6: Ensure binary exists
  const binPath = getBinaryPath();
  if (!fs.existsSync(binPath)) {
    try {
      await downloadAndExtract();
    } catch (err) {
      log(`ERROR: Binary download failed: ${err.message}`);
      output(
        `shodh-memory binary download failed: ${err.message}. ` +
          `Manual install: download from ${getDownloadUrl() || GITHUB_RELEASE_BASE} ` +
          `and place in ${BIN_DIR}`,
        { healthy: false }
      );
      process.exit(1);
    }
  }

  // Verify binary exists after download
  if (!fs.existsSync(binPath)) {
    output(
      `shodh-memory binary not found at ${binPath} after extraction. ` +
        `Check that the archive contains the expected binary.`,
      { healthy: false }
    );
    process.exit(1);
  }

  // Step 7: Install service if it doesn't exist
  if (!serviceStatus.exists) {
    log("Service not found, installing...");
    const installResult = await installService(config);
    log(`Service install: ${installResult.message}`);

    if (!installResult.success) {
      // Service install failed, but we can still try direct spawn
      log("Service install failed, will try direct spawn");
      if (installResult.manualInstructions) {
        log(`Manual instructions:\n${installResult.manualInstructions}`);
      }
    }
  }

  // Step 8: Start if not running
  if (!serviceStatus.running || !(await checkHealth(config))) {
    // Kill any zombie process first
    if (isProcessRunning("shodh-memory-server")) {
      log("Killing unresponsive shodh-memory-server process...");
      try {
        if (PLATFORM === "win32") {
          winExec(
            `powershell -NoProfile -Command "Get-Process -Name 'shodh-memory-server' -ErrorAction SilentlyContinue | Stop-Process -Force"`,
            { windowsHide: true, timeout: 10000, stdio: "pipe" }
          );
        } else {
          execSync("pkill -x shodh-memory-server", { timeout: 5000, stdio: "pipe" });
        }
        // Wait for process to die
        await new Promise((r) => setTimeout(r, 2000));
      } catch {}
    }

    const startResult = startService(config);
    log(`Start: ${startResult.message}`);

    if (!startResult.started) {
      output(
        `shodh-memory server could not be started: ${startResult.message}. ` +
          `Manual start: "${binPath}" --host ${config.host} --port ${config.port} --storage "${STORAGE_PATH}"`,
        { healthy: false }
      );
      process.exit(1);
    }
  }

  // Step 9: Health check with retries
  log("Waiting for health check...");
  const healthy = await waitForHealth(config);

  if (healthy) {
    const authOk = await checkAuth(config);
    const mode = serviceStatus.exists ? "service" : "direct";
    if (authOk) {
      output(`shodh-memory server running (${mode} mode)`);
      log("Health + auth check passed.");
    } else {
      output(
        `shodh-memory server started but API key rejected. ` +
          `Config key and server key are out of sync. ` +
          `Try deleting the service and restarting: kill the process, then re-open Claude Code.`,
        { healthy: false }
      );
      process.exit(1);
    }
  } else {
    output(
      `shodh-memory server started but health check failed after ${HEALTH_MAX_WAIT_MS / 1000}s. ` +
        `Check if port ${config.port} is available. ` +
        `Manual check: curl http://${config.host}:${config.port}/health`,
      { healthy: false }
    );
    process.exit(1);
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  output(`shodh-memory hook fatal error: ${err.message}`, { healthy: false });
  process.exit(1);
});
