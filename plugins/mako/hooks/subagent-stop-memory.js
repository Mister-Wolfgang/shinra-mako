/**
 * MAKO Hook: subagent-stop-memory.js
 *
 * SubagentStop hook -- fires when any sub-agent completes execution.
 * Replaces subagent-memory-reminder.js (SHODH-based).
 *
 * Responsibilities:
 *   1. Remind Rufus to persist agent results via store_memory()
 *   2. Remind Rufus to update sprint-status.yaml
 *   3. Suggest the next agent in the pipeline
 *
 * Constraints:
 *   - Node.js only (no external npm deps)
 *   - Lightweight, fast execution
 *   - Read-only -- never calls mcp-memory-service directly
 */

const fs = require("fs");
const path = require("path");
const { isMemoryServiceHealthy, memoryFallbackMessage } = require("./lib/memory-fallback");

// Basic pipeline routing table (after agent X -> suggest agent Y)
const ROUTING = {
  tseng: "scarlet or reeve (depending on workflow)",
  scarlet: "reeve (architecture)",
  genesis: "reeve or heidegger (depending on workflow)",
  reeve: "alignment gate then heidegger or hojo",
  heidegger: "lazard (if Standard+) or hojo",
  lazard: "hojo",
  hojo: "reno (testing)",
  reno: "elena (security + edge cases)",
  elena: "palmer (docs) or rude (review)",
  palmer: "rude (review)",
  rude: "DoD gate then retrospective",
  sephiroth: "hojo (apply fix) or jenova (meta-learning)",
  jenova: "report to user",
};

function main() {
  try {
    let input = "";
    try {
      input = fs.readFileSync(0, "utf8");
    } catch {}

    // Extract agent name from input
    let agentName = "unknown";
    if (input) {
      try {
        const data = JSON.parse(input);
        // agent_type format: "mako:<agent>"
        const agentType = data.agent_type || data.agentType || "";
        const match = agentType.match(/mako:(\w+)/);
        if (match) agentName = match[1];
      } catch {}
    }

    const nextStep = ROUTING[agentName] || "check workflow in sprint-status.yaml";

    // Read sprint-status for current phase info
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const sprintPath = path.join(projectDir, "sprint-status.yaml");
    let phaseInfo = "";
    if (fs.existsSync(sprintPath)) {
      try {
        const raw = fs.readFileSync(sprintPath, "utf8");
        const phase = (raw.match(/current_phase:\s*"?([^"\n]+)/) || [])[1] || "";
        const next = (raw.match(/next_phase:\s*"?([^"\n]+)/) || [])[1] || "";
        if (phase || next) {
          phaseInfo = ` | sprint-status: phase=${phase}, next=${next}`;
        }
      } catch {}
    }

    // ST-9: Check MCP Memory health for fallback
    let memoryWarning = "";
    const memoryHealthy = isMemoryServiceHealthy();
    if (!memoryHealthy) {
      const fallbackMsg = memoryFallbackMessage("subagent-stop-memory");
      process.stderr.write(`[subagent-stop] WARNING: ${fallbackMsg}\n`);
      memoryWarning = `\n\n${fallbackMsg}`;
    }

    const lines = [
      `Agent '${agentName}' a termine. Resultat recu.${phaseInfo}`,
      "",
      "ACTIONS REQUISES :",
      "1. store_memory() -- Persister le resultat de cet agent",
      `   Format: store_memory(content: "<projet> | ${agentName}: <resume 1-2 lignes> | next: <etape>", memory_type: "observation", tags: ["project:<nom>", "phase:${agentName}"])`,
      "2. Mettre a jour sprint-status.yaml (current_phase, next_phase, story statuses)",
      `3. Prochaine etape du pipeline : ${nextStep}`,
      "",
      "Si tu as deja fait le store_memory() (instruction du skill), ignore le point 1.",
    ];

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SubagentStop",
          additionalContext: lines.join("\n") + memoryWarning,
        },
      })
    );
  } catch (err) {
    // Graceful fallback -- never crash, output minimal reminder
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SubagentStop",
          additionalContext:
            "Un agent a termine. store_memory() + update sprint-status.yaml.",
        },
      })
    );
  }
}

main();
