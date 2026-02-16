/**
 * MAKO Hook: subagent-memory-reminder.js
 *
 * SubagentStop hook -- fires when any sub-agent completes execution.
 * Injects a reminder to Rufus to persist the agent's results via mcp-memory-service.
 *
 * This is a safety net: even if the skill instructions are missed during
 * long sessions (context degradation), this hook ensures Rufus is reminded
 * to call store_memory() after every agent phase.
 *
 * Constraints:
 *   - Node.js only (no external npm deps)
 *   - Lightweight, fast execution
 *   - Read-only -- never calls mcp-memory-service directly
 */

const output = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SubagentStop",
    additionalContext: [
      "RAPPEL MEMOIRE -- OBLIGATOIRE :",
      "Un agent vient de terminer son execution.",
      "Tu DOIS maintenant executer un store_memory() pour persister son resultat.",
      "Format : store_memory(content: \"<projet> | <agent>: <resume 1-2 lignes> | next: <prochaine etape>\",",
      "  memory_type: \"observation\", tags: [\"project:<nom>\", \"phase:<agent>\"])",
      "",
      "Si tu as deja fait le store_memory() pour cette phase (instruction dans le skill), ignore ce rappel.",
      "Si tu ne l'as PAS fait, fais-le MAINTENANT avant de lancer le prochain agent.",
    ].join("\n"),
  },
});

process.stdout.write(output);
