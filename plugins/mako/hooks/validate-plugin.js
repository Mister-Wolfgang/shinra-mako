#!/usr/bin/env node
/**
 * MAKO Plugin Validation Script
 *
 * Validates plugin consistency across agents, skills, hooks, and docs.
 * Zero dependencies, pure Node.js.
 *
 * Usage:
 *   node validate-plugin.js [plugin-dir]
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

const fs = require("fs");
const path = require("path");

// Color codes for output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const PASS = `${colors.green}PASS${colors.reset}`;
const FAIL = `${colors.red}FAIL${colors.reset}`;
const INFO = `${colors.cyan}INFO${colors.reset}`;

let checksPassed = 0;
let checksFailed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result === true) {
      console.log(`[${PASS}] ${name}`);
      checksPassed++;
    } else {
      console.log(`[${FAIL}] ${name}`);
      if (result && typeof result === "string") {
        console.log(`       ${colors.yellow}${result}${colors.reset}`);
      }
      checksFailed++;
    }
  } catch (err) {
    console.log(`[${FAIL}] ${name}`);
    console.log(`       ${colors.red}Error: ${err.message}${colors.reset}`);
    checksFailed++;
  }
}

function main() {
  const pluginDir = process.argv[2] || process.cwd();

  console.log(`${colors.cyan}MAKO Plugin Validation${colors.reset}`);
  console.log(`Plugin dir: ${pluginDir}\n`);

  // Read directory structure
  const agentsDir = path.join(pluginDir, "agents");
  const skillsDir = path.join(pluginDir, "skills");
  const hooksDir = path.join(pluginDir, "hooks");
  const contextDir = path.join(pluginDir, "context");
  const pluginJsonPath = path.join(pluginDir, ".claude-plugin", "plugin.json");
  const hooksJsonPath = path.join(hooksDir, "hooks.json");
  const rufusPath = path.join(contextDir, "rufus.md");

  // Helper functions
  function readFile(filePath) {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  }

  function readDir(dirPath) {
    return fs.existsSync(dirPath) ? fs.readdirSync(dirPath) : [];
  }

  function parseJSON(str) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  // 1. Agents ↔ rufus.md
  check("Agents ↔ rufus.md consistency", () => {
    const rufusContent = readFile(rufusPath);
    if (!rufusContent) return "rufus.md not found";

    const agentFiles = readDir(agentsDir).filter((f) => f.endsWith(".md"));
    if (agentFiles.length === 0) return "No agent files found";

    // Extract agent names from rufus.md table
    const tableMatch = rufusContent.match(/\| Agent \| Role \| Modele \|([\s\S]*?)(?=\n\n|$)/);
    if (!tableMatch) return "Agent table not found in rufus.md";

    const rufusAgents = [];
    const lines = tableMatch[1].split("\n");
    for (const line of lines) {
      const match = line.match(/\|\s*`([a-z]+)`/);
      if (match) rufusAgents.push(match[1] + ".md");
    }

    const missing = agentFiles.filter((f) => !rufusAgents.includes(f));
    const extra = rufusAgents.filter((a) => !agentFiles.includes(a));

    if (missing.length > 0 || extra.length > 0) {
      const msgs = [];
      if (missing.length > 0) msgs.push(`Missing in rufus.md: ${missing.join(", ")}`);
      if (extra.length > 0) msgs.push(`Missing files: ${extra.join(", ")}`);
      return msgs.join("; ");
    }

    return true;
  });

  // 2. Skills ↔ rufus.md
  check("Skills ↔ rufus.md consistency", () => {
    const rufusContent = readFile(rufusPath);
    if (!rufusContent) return "rufus.md not found";

    const skillDirs = readDir(skillsDir).filter((f) =>
      fs.statSync(path.join(skillsDir, f)).isDirectory()
    );
    if (skillDirs.length === 0) return "No skill directories found";

    // Extract skill commands from rufus.md
    const skillTableMatch = rufusContent.match(/\| Commande \| Workflow \|([\s\S]*?)(?=\n\n|##)/);
    if (!skillTableMatch) return "Skills table not found in rufus.md";

    const rufusSkills = [];
    const lines = skillTableMatch[1].split("\n");
    for (const line of lines) {
      const match = line.match(/`\/mako:([a-z-]+)`/);
      if (match) rufusSkills.push(match[1]);
    }

    const missing = skillDirs.filter((s) => !rufusSkills.includes(s));
    const extra = rufusSkills.filter((s) => !skillDirs.includes(s));

    if (missing.length > 0 || extra.length > 0) {
      const msgs = [];
      if (missing.length > 0) msgs.push(`Missing in rufus.md: ${missing.join(", ")}`);
      if (extra.length > 0) msgs.push(`Missing dirs: ${extra.join(", ")}`);
      return msgs.join("; ");
    }

    return true;
  });

  // 3. Frontmatter coherence
  check("Agent frontmatter coherence", () => {
    const agentFiles = readDir(agentsDir).filter((f) => f.endsWith(".md"));
    const errors = [];

    for (const agentFile of agentFiles) {
      const content = readFile(path.join(agentsDir, agentFile));
      if (!content) continue;

      // Check frontmatter exists
      if (!content.startsWith("---")) {
        errors.push(`${agentFile}: No frontmatter`);
        continue;
      }

      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        errors.push(`${agentFile}: Invalid frontmatter`);
        continue;
      }

      const fm = frontmatterMatch[1];
      const required = ["name:", "description:", "tools:", "model:"];
      const missing = required.filter((field) => !fm.includes(field));

      if (missing.length > 0) {
        errors.push(`${agentFile}: Missing ${missing.join(", ")}`);
      }
    }

    return errors.length === 0 || errors.join("; ");
  });

  // 4. API mémoire cohérence (no remember())
  check("Memory API migration complete (no remember())", () => {
    const errors = [];

    // Check skills
    const skillDirs = readDir(skillsDir);
    for (const skillDir of skillDirs) {
      const skillPath = path.join(skillsDir, skillDir, "SKILL.md");
      if (fs.existsSync(skillPath)) {
        const content = readFile(skillPath);
        if (content && content.includes("remember(")) {
          errors.push(`${skillDir}/SKILL.md contains remember()`);
        }
      }
    }

    // Check hooks (excluding comments and validation script itself)
    const hookFiles = readDir(hooksDir).filter(
      (f) => f.endsWith(".js") && !f.includes("validate-plugin") && !f.includes("test")
    );
    for (const hookFile of hookFiles) {
      const content = readFile(path.join(hooksDir, hookFile));
      if (!content) continue;

      // Remove comments and strings
      const cleaned = content
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/"[^"]*"/g, "")
        .replace(/'[^']*'/g, "");

      if (cleaned.includes("remember(")) {
        errors.push(`${hookFile} contains remember() in code`);
      }
    }

    return errors.length === 0 || errors.join("; ");
  });

  // 5. No episode_id
  check("No episode_id references", () => {
    const errors = [];

    // Check skills
    const skillDirs = readDir(skillsDir);
    for (const skillDir of skillDirs) {
      const skillPath = path.join(skillsDir, skillDir, "SKILL.md");
      if (fs.existsSync(skillPath)) {
        const content = readFile(skillPath);
        if (content && content.includes("episode_id")) {
          errors.push(`${skillDir}/SKILL.md`);
        }
      }
    }

    // Check hooks (excluding comments and validation script itself)
    const hookFiles = readDir(hooksDir).filter(
      (f) => f.endsWith(".js") && !f.includes("validate-plugin") && !f.includes("test")
    );
    for (const hookFile of hookFiles) {
      const content = readFile(path.join(hooksDir, hookFile));
      if (!content) continue;

      // Remove comments and strings
      const cleaned = content
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/"[^"]*"/g, "")
        .replace(/'[^']*'/g, "");

      if (cleaned.includes("episode_id")) {
        errors.push(`${hookFile}`);
      }
    }

    return errors.length === 0 || errors.join("; ");
  });

  // 6. No SHODH references (in active code)
  check("SHODH migration complete (comments OK)", () => {
    const errors = [];

    // Check hooks (excluding comments which are OK, and validation script itself)
    const hookFiles = readDir(hooksDir).filter(
      (f) => f.endsWith(".js") && !f.includes("validate-plugin") && !f.includes("test")
    );
    for (const hookFile of hookFiles) {
      const content = readFile(path.join(hooksDir, hookFile));
      if (!content) continue;

      // Remove comments (SHODH is OK in comments)
      const cleaned = content
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");

      if (cleaned.includes("SHODH")) {
        errors.push(`${hookFile}`);
      }
    }

    return errors.length === 0 || errors.join("; ");
  });

  // 7. hooks.json valid
  check("hooks.json valid JSON", () => {
    const hooksJson = readFile(hooksJsonPath);
    if (!hooksJson) return "hooks.json not found";

    const parsed = parseJSON(hooksJson);
    if (!parsed) return "Invalid JSON";

    // Check all referenced files exist
    const errors = [];
    const hooks = parsed.hooks || {};

    for (const [hookType, entries] of Object.entries(hooks)) {
      for (const entry of entries) {
        const subhooks = entry.hooks || [];
        for (const subhook of subhooks) {
          if (subhook.command) {
            // Extract file path from command
            const match = subhook.command.match(/["']([^"']+\.js)["']/);
            if (match) {
              const relPath = match[1].replace("${CLAUDE_PLUGIN_ROOT}/hooks/", "");
              const fullPath = path.join(hooksDir, relPath);
              if (!fs.existsSync(fullPath)) {
                errors.push(`${hookType}: ${relPath} not found`);
              }
            }
          }
        }
      }
    }

    return errors.length === 0 || errors.join("; ");
  });

  // 8. plugin.json valid
  check("plugin.json valid", () => {
    const pluginJson = readFile(pluginJsonPath);
    if (!pluginJson) return "plugin.json not found";

    const parsed = parseJSON(pluginJson);
    if (!parsed) return "Invalid JSON";

    const required = ["name", "description", "version"];
    const missing = required.filter((field) => !parsed[field]);

    if (missing.length > 0) {
      return `Missing fields: ${missing.join(", ")}`;
    }

    return true;
  });

  // 9. Cross-references agents
  check("Agent cross-references valid", () => {
    const errors = [];

    // Get list of valid agent names
    const agentFiles = readDir(agentsDir).filter((f) => f.endsWith(".md"));
    const validAgents = agentFiles.map((f) => f.replace(".md", ""));

    // Known non-agent references that are valid (skills, gates, etc.)
    const validNonAgents = ["brainstorm"];

    // Check skills for agent invocations
    const skillDirs = readDir(skillsDir);
    for (const skillDir of skillDirs) {
      const skillPath = path.join(skillsDir, skillDir, "SKILL.md");
      if (fs.existsSync(skillPath)) {
        const content = readFile(skillPath);
        if (!content) continue;

        // Find mako:agent references
        const matches = content.matchAll(/mako:([a-z-]+)/g);
        for (const match of matches) {
          const agent = match[1];
          if (!validAgents.includes(agent) && !validNonAgents.includes(agent)) {
            errors.push(`${skillDir}: references non-existent mako:${agent}`);
          }
        }
      }
    }

    return errors.length === 0 || errors.join("; ");
  });

  // 10. JENOVA exists
  check("JENOVA agent exists", () => {
    const jenovaPath = path.join(agentsDir, "jenova.md");
    if (!fs.existsSync(jenovaPath)) {
      return "jenova.md not found in agents/";
    }

    const rufusContent = readFile(rufusPath);
    if (!rufusContent) return "rufus.md not found";

    if (!rufusContent.includes("jenova") && !rufusContent.includes("JENOVA")) {
      return "JENOVA not referenced in rufus.md";
    }

    return true;
  });

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${colors.green}Passed: ${checksPassed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${checksFailed}${colors.reset}`);
  console.log(`${"=".repeat(60)}`);

  process.exit(checksFailed > 0 ? 1 : 0);
}

main();
