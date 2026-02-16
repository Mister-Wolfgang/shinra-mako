/**
 * MAKO Hook: user-prompt-submit-rufus.js
 *
 * UserPromptSubmit hook -- fires every time the user submits a message.
 * Injects a compact context reminder to Rufus with sprint state and key rules.
 *
 * Constraints:
 *   - Node.js only (no external npm deps)
 *   - Output must be SHORT (max 500 chars message) to avoid context pollution
 *   - Graceful fallback if no sprint-status.yaml exists
 */

const fs = require("fs");
const path = require("path");

function main() {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const sprintPath = path.join(projectDir, "sprint-status.yaml");

    let sprintInfo = "No active sprint.";
    if (fs.existsSync(sprintPath)) {
      const raw = fs.readFileSync(sprintPath, "utf8");
      // Extract key fields with simple regex (no YAML parser dep)
      const workflow = (raw.match(/workflow:\s*"?([^"\n]+)/) || [])[1] || "?";
      const status = (raw.match(/status:\s*"?([^"\n]+)/) || [])[1] || "?";
      const phase = (raw.match(/current_phase:\s*"?([^"\n]+)/) || [])[1] || "?";
      const next = (raw.match(/next_phase:\s*"?([^"\n]+)/) || [])[1] || "?";
      const tier = (raw.match(/quality_tier:\s*"?([^"\n]+)/) || [])[1] || "?";

      // Count story statuses
      const stories = raw.match(/status:\s*"?(backlog|ready-for-dev|in-progress|review|done)/g) || [];
      const done = stories.filter((s) => s.includes("done")).length;
      // Subtract 1 from total because sprint status itself matches
      const total = Math.max(stories.length - 1, 0);

      sprintInfo = `Workflow: ${workflow} | Status: ${status} | Phase: ${phase} | Next: ${next} | Tier: ${tier} | Stories: ${done}/${total} done`;
    }

    // Check for session state file
    let agentIds = "";
    const statePath = path.join(projectDir, ".mako-session-state.json");
    if (fs.existsSync(statePath)) {
      try {
        const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
        if (state.active_agents && Object.keys(state.active_agents).length > 0) {
          const ids = Object.entries(state.active_agents)
            .map(([k, v]) => `${k}=${v}`)
            .slice(0, 5)
            .join(", ");
          agentIds = ` | AgentIDs: ${ids}`;
        }
      } catch {}
    }

    const message = [
      "<system-reminder>",
      "[RUFUS CONTEXT RELOAD]",
      sprintInfo + agentIds,
      "Rules: Tu es Rufus. Ne code pas. Delegue. Mets a jour sprint-status apres chaque transition.",
      "</system-reminder>",
    ].join("\n");

    process.stdout.write(
      JSON.stringify({ result: "continue", message: message })
    );
  } catch (err) {
    // Graceful fallback -- never crash
    process.stdout.write(JSON.stringify({ result: "continue" }));
  }
}

main();
