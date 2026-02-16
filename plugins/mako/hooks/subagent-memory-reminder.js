/**
 * MAKO Hook: subagent-memory-reminder.js
 *
 * SubagentStop hook -- fires when any sub-agent completes execution.
 * Injects a reminder to Rufus to persist the agent's results in SHODH memory.
 *
 * This is a safety net: even if the skill instructions are missed during
 * long sessions (context degradation), this hook ensures Rufus is reminded
 * to call remember() after every agent phase.
 *
 * Constraints:
 *   - Node.js only (no external npm deps)
 *   - Lightweight, fast execution
 *   - Read-only -- never calls SHODH directly
 */

const output = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SubagentStop",
    additionalContext: [
      "RAPPEL MEMOIRE SHODH -- OBLIGATOIRE :",
      "Un agent vient de terminer son execution.",
      "Tu DOIS maintenant executer un remember() pour persister son resultat.",
      "Format : remember(content: \"<projet> | <agent>: <resume 1-2 lignes> | next: <prochaine etape>\",",
      "  memory_type: \"Observation\", tags: [\"project:<nom>\", \"phase:<agent>\"],",
      "  episode_id: \"<episode-id-en-cours>\", sequence_number: <n>)",
      "",
      "Si tu as deja fait le remember() pour cette phase (instruction dans le skill), ignore ce rappel.",
      "Si tu ne l'as PAS fait, fais-le MAINTENANT avant de lancer le prochain agent.",
    ].join("\n"),
  },
});

process.stdout.write(output);
