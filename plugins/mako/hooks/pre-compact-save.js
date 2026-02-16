/**
 * MAKO Hook: pre-compact-save.js
 *
 * PreCompact hook -- fires BEFORE context compaction.
 * CRITICAL: Compaction can destroy session context. This hook:
 *   1. Reads current sprint-status.yaml
 *   2. Reads .mako-session-state.json (if exists)
 *   3. Writes updated .mako-session-state.json with current state
 *   4. Injects a recovery message telling Rufus what to do after compaction
 *
 * Constraints:
 *   - Node.js only (no external npm deps)
 *   - ULTRA-ROBUST: no crash, fallback everywhere
 *   - If a file doesn't exist, continue without it
 */

const fs = require("fs");
const path = require("path");
const { isMemoryServiceHealthy, memoryFallbackMessage } = require("./lib/memory-fallback");

function safeRead(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf8");
  } catch {}
  return null;
}

function safeParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {}
  return null;
}

function extractYAMLField(raw, field) {
  const match = raw.match(new RegExp(field + ':\\s*"?([^"\\n]+)'));
  return match ? match[1].trim() : null;
}

function main() {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const sprintPath = path.join(projectDir, "sprint-status.yaml");
    const statePath = path.join(projectDir, ".mako-session-state.json");

    // Read sprint-status.yaml
    const sprintRaw = safeRead(sprintPath);
    let sprintSummary = "No sprint-status.yaml found.";
    let sprintData = {};
    if (sprintRaw) {
      sprintData = {
        workflow: extractYAMLField(sprintRaw, "workflow") || "?",
        status: extractYAMLField(sprintRaw, "status") || "?",
        current_phase: extractYAMLField(sprintRaw, "current_phase") || "?",
        next_phase: extractYAMLField(sprintRaw, "next_phase") || "?",
        quality_tier: extractYAMLField(sprintRaw, "quality_tier") || "?",
        scale: extractYAMLField(sprintRaw, "scale") || "?",
      };
      sprintSummary = Object.entries(sprintData)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");
    }

    // Read existing session state
    const stateRaw = safeRead(statePath);
    const existingState = safeParseJSON(stateRaw) || {};

    // Build updated session state
    const sessionState = {
      last_compaction: new Date().toISOString(),
      sprint: sprintData,
      active_agents: existingState.active_agents || {},
      pending_decisions: existingState.pending_decisions || [],
      notes: existingState.notes || "",
    };

    // Write session state (best effort)
    try {
      fs.writeFileSync(statePath, JSON.stringify(sessionState, null, 2) + "\n");
    } catch {}

    // Build agent IDs summary
    let agentIdsSummary = "None saved.";
    if (
      sessionState.active_agents &&
      Object.keys(sessionState.active_agents).length > 0
    ) {
      agentIdsSummary = Object.entries(sessionState.active_agents)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
    }

    // ST-9: Check MCP Memory health for fallback
    let memoryWarning = "";
    const memoryHealthy = isMemoryServiceHealthy();
    if (!memoryHealthy) {
      const fallbackMsg = memoryFallbackMessage("pre-compact-save");
      process.stderr.write(`[pre-compact] WARNING: ${fallbackMsg}\n`);
      memoryWarning = `\n\n${fallbackMsg}`;
    }

    // Build the recovery message
    const lines = [
      "COMPACTAGE IMMINENT -- SAUVEGARDE CONTEXTE",
      "",
      "Sprint: " + sprintSummary,
      "Agent IDs: " + agentIdsSummary,
      "",
      "APRES LE COMPACTAGE :",
      "1. Lis sprint-status.yaml pour recuperer l'etat du sprint",
      "2. Lis .mako-session-state.json pour les agent IDs et decisions en cours",
      "3. retrieve_memory(query: '<nom-du-projet>') pour le contexte memoire",
      "4. Tu es Rufus. Ne code pas. Delegue. Continue le pipeline.",
    ];

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreCompact",
          additionalContext: lines.join("\n") + memoryWarning,
        },
      })
    );
  } catch (err) {
    // ULTRA-ROBUST: never crash under any circumstances
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreCompact",
          additionalContext:
            "Compactage imminent. Apres: lis sprint-status.yaml et .mako-session-state.json.",
        },
      })
    );
  }
}

main();
