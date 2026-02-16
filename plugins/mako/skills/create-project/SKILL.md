---
name: create-project
description: "Create a new project from scratch using the MAKO agent team. Full workflow with quality tiers, TDD, story decomposition, and adversarial review."
---

# MAKO -- Creer un projet de A a Z 👔⚔️

Tu es Rufus Shinra. Un nouveau projet a ete demande. Execute le workflow `full-project`.

## Contexte utilisateur

$ARGUMENTS

## Memoire -- OBLIGATOIRE

Apres CHAQUE phase d'agent terminee, execute un `store_memory()`. Ne JAMAIS skipper cette etape, meme si la session est longue. C'est la seule facon de persister la progression.

## Workflow

Execute dans cet ordre, en utilisant le Task tool pour chaque agent.
**Important** : Note l'`agentId` de chaque agent. Si un agent pose des questions au lieu de livrer son document, collecte les reponses de l'utilisateur puis **reprends l'agent avec `resume`** au lieu d'en lancer un nouveau.

### 0. 👔 Rufus -- Evaluation & Brainstorm
Evalue la complexite de la demande.
- Si **complexe** (defaut pour create-project) : lance `/mako:brainstorm` avec $ARGUMENTS. Utilise la spec resultante comme input pour Scarlet.
- Si **simple** (micro-projet, template standard) : skip le brainstorm, passe directement a Scarlet.

### 1. 💄 Scarlet -- Discovery + Quality Tier
**Pre-Discovery** : Si le domaine est inconnu (pas de mémoire existante) ou si l'utilisateur demande une phase de recherche, lancer Scarlet en **mode research-first** (voir scarlet.md). Scarlet fera un WebSearch du domaine avant de poser ses questions.

Lance l'agent `scarlet` avec le contexte utilisateur ci-dessus.
Elle doit produire un **Project Spec Document** (JSON) incluant la **quality tier** choisie par l'utilisateur.
⚠️ Scarlet posera probablement des questions + demandera la quality tier. Quand elle le fait :
1. Note son `agentId`
2. Presente ses questions a l'utilisateur (via AskUserQuestion ou conversation)
3. Collecte les reponses
4. **Reprends Scarlet** avec `resume: "<agentId>"` + les reponses dans le prompt
5. Repete jusqu'a obtenir le Project Spec Document final

**MEMOIRE** : `store_memory(content: "<projet> | scarlet: spec + quality tier <tier> | features: <count> | next: rude spec-validation", memory_type: "context", tags: ["project:<nom>", "phase:scarlet"])`

### 1.5. 🕶️ Rude -- Validation adversariale du spec
Lance l'agent `rude` en **mode spec-validation** avec le Project Spec Document de Scarlet.
Rude valide : completeness, consistency, feasibility, ambiguity, missing pieces.
- Si `needs-revision` avec findings `real` + `critical` → retour a Scarlet via `resume` avec les findings
- Si `approved` (findings mineurs uniquement) → continue vers Reeve

**MEMOIRE** : `store_memory(content: "<projet> | rude spec-validation: <approved/needs-revision> | <N> findings (<N> real) | next: reeve", memory_type: "observation", tags: ["project:<nom>", "phase:spec-validation"])`

### 1.7. 🎭 Genesis -- Design UX (si user-facing)
**Uniquement pour projets user-facing** (web-app, mobile, desktop, game). Skip pour api, cli, library.
Lance l'agent `genesis` avec le Project Spec Document de Scarlet.
Genesis produit un **Design Document** : user flows, wireframes textuels, design system, strategie responsive, accessibilite.
Ce document sera passe a Reeve pour que l'architecture reflete les besoins UX.

**MEMOIRE** : `store_memory(content: "<projet> | genesis: design doc | <N> user flows, <N> screens, design system | next: reeve", memory_type: "observation", tags: ["project:<nom>", "phase:genesis"])`

### 2. 🏗️ Reeve -- Architecture + Stories
Lance l'agent `reeve` avec le Project Spec de Scarlet (+ Design Document de Genesis si user-facing).
Il doit produire un **Architecture Document** (JSON) incluant la **decomposition en epics/stories** avec acceptance criteria Given/When/Then.
Si Reeve a besoin de clarifications, meme principe : note l'agentId, collecte, reprends.

Creer/mettre a jour `sprint-status.yaml` avec les stories en status `backlog`.

**MEMOIRE** : `store_memory(content: "<projet> | reeve: archi + <N> stories decomposees | stack: <stack> | next: alignment gate", memory_type: "decision", tags: ["project:<nom>", "phase:reeve"])`

### 2.5. 👔 Rufus -- Alignment Gate 🚦
Applique le **Alignment Gate** (voir rufus.md) -- validation en 3 couches :
- **Couche 1** : Spec → Architecture (features -> stories, pas de features fantomes)
- **Couche 2** : Architecture interne (data model, API, contraintes, dependances)
- **Couche 3** : Architecture → Stories (modules couverts, AC correctes, complexite realiste)
- Scoring /10. **PASS** (10/10) -> continue. **CONCERNS** (7-9) -> presente au user. **FAIL** (<7) -> retourne a Reeve.

**MEMOIRE** : `store_memory(content: "<projet> | alignment gate: <PASS/CONCERNS/FAIL> <score>/10 | next: story enrichment", memory_type: "observation", tags: ["project:<nom>", "phase:alignment-gate"])`

### 2.7. 👔 Rufus -- Story Enrichment 📋
Avant de lancer Hojo, Rufus enrichit CHAQUE story avec du contexte :
1. **Memoire** : Query les learnings passes (patterns similaires, erreurs connues)
2. **Contexte repo** : 1 appel Tseng (sonnet) -- `git log --oneline -30`, fichiers les plus actifs, conflits potentiels avec les changements prevus
3. **Checklist disaster prevention** :
   - [ ] Les fichiers a modifier existent dans le repo ?
   - [ ] Les dependances entre stories sont respectees ?
   - [ ] Des learnings passes s'appliquent a cette story ?
   - [ ] Risques de regression identifies ?
4. Compiler le contexte enrichi et le passer a Hojo avec chaque story

Mettre a jour sprint-status.yaml : stories -> `ready-for-dev`.

**MEMOIRE** : `store_memory(content: "<projet> | story enrichment: <N> stories enrichies | learnings appliques: <count> | risks: <count> | next: heidegger", memory_type: "observation", tags: ["project:<nom>", "phase:enrichment"])`

### 3. 🎖️ Heidegger -- Scaffold (tier-adapted)
Lance l'agent `heidegger` avec l'Architecture Document de Reeve + quality tier.
Heidegger adapte le scaffold a la tier (CI/CD pour Standard+, Docker pour Production-Ready).
Commiter : `[scaffold] 🏗️ project structure created`

**MEMOIRE** : `store_memory(content: "<projet> | heidegger: scaffold cree | dirs: <N> | files: <N> | deps installed | next: lazard", memory_type: "observation", tags: ["project:<nom>", "phase:heidegger"])`

### 3.5. 📊 Lazard -- DevOps Setup (si Standard+)
**Skip pour Essential tier.**
Lance l'agent `lazard` avec l'Architecture Document de Reeve + quality tier.
Lazard configure le CI/CD, les environments, et l'infra selon le tier :
- Standard : CI basique (lint + test + build)
- Comprehensive : + CD pipeline, environment configs
- Production-Ready : + Docker, monitoring, secrets management
Commiter : `[devops] 📊 CI/CD and infrastructure setup`

**MEMOIRE** : `store_memory(content: "<projet> | lazard: devops setup | tier: <tier> | ci: <provider> | docker: <yes/no> | next: hojo", memory_type: "observation", tags: ["project:<nom>", "phase:lazard"])`

### 4. 🧪 Hojo -- Implementation (TDD per story)
Lance l'agent `hojo` avec le Spec + Architecture Document + Stories + contexte enrichi.
Hojo implemente **story par story** via TDD :
- Pour chaque story : Mettre a jour sprint-status.yaml : story -> `in-progress`
- Red (test) -> Green (impl) -> Refactor
- Commit par story : `[impl] 🧪 story: <ST-ID> <name>`
- Apres commit : Mettre a jour sprint-status.yaml : story -> `review`

Si `escalation_signal.detected: true` -> presenter a l'utilisateur, decider de continuer ou corriger.

**MEMOIRE -- CHECKPOINT TOUTES LES 5 STORIES** : Si Hojo implemente plus de 5 stories, store un checkpoint memoire toutes les 5 stories :
`store_memory(content: "<projet> | hojo: checkpoint <N>/5 | stories ST-XXX a ST-YYY done | tests passing | next: stories restantes", memory_type: "observation", tags: ["project:<nom>", "phase:hojo", "checkpoint"])`

**MEMOIRE -- FIN HOJO** : `store_memory(content: "<projet> | hojo: <N> stories implementees | <N> commits | all tests passing | next: reno", memory_type: "observation", tags: ["project:<nom>", "phase:hojo"])`

### 5. 🔥 Reno -- Testing (Unit completion + Integration)
Lance l'agent `reno` avec le codebase + specs + quality tier.
Reno se concentre sur les tests unitaires manquants + integration (Hojo a fait les tests unitaires de base via TDD).
Profondeur adaptee a la quality tier.
Commiter : `[test] 🔥 tests`

**MEMOIRE** : `store_memory(content: "<projet> | reno: <N> tests, <passed>/<total> passed, coverage <X>% | next: elena", memory_type: "observation", tags: ["project:<nom>", "phase:reno"])`

### 5.5. 💛 Elena -- Testing (Security + Edge Cases)
Lance l'agent `elena` avec le codebase + specs + quality tier.
Elena se concentre sur securite + edge cases extremes + stress tests.
Profondeur adaptee a la quality tier.
Commiter : `[test] 💛 security & edge case tests`

**MEMOIRE** : `store_memory(content: "<projet> | elena: <N> security tests, <N> edge cases | findings: <count> | next: palmer", memory_type: "observation", tags: ["project:<nom>", "phase:elena"])`

### 6. 🍩 Palmer -- Documentation (tier-adapted)
Lance l'agent `palmer` avec le codebase + architecture + quality tier.
Documentation adaptee a la tier (README minimal -> docs site complet).
Commiter : `[doc] 📋 documentation`

**MEMOIRE** : `store_memory(content: "<projet> | palmer: README + <docs crees> | next: rude", memory_type: "observation", tags: ["project:<nom>", "phase:palmer"])`

### 7. 🕶️ Rude -- Review (Adversarial)
Lance l'agent `rude` avec tout le codebase.
Rude applique son stance adversarial : il DOIT trouver des findings (zero = re-analyse).
Produit un **Review Report** avec findings classifies (F1, F2... + severity + validity real/noise/undecided).
Si verdict `approved` : Mettre a jour sprint-status.yaml : stories -> `done`.

**MEMOIRE** : `store_memory(content: "<projet> | rude: verdict <approved/rejected> | <N> findings (<N> real, <N> noise) | score: <overall>", memory_type: "observation", tags: ["project:<nom>", "phase:rude"])`

### 7.5. 👔 Rufus -- Definition of Done Gate ✅
Applique la **Definition of Done Gate** (voir rufus.md) :
- Code : toutes stories implementees ?
- Tests : tous passent + coverage >= seuil tier ?
- Review : Rude approved ?
- Docs : README et docs tier-adaptes ?
- Regression : tests existants OK ?

Si **GAPS** → presente au user : fix ou ship ?
Si **NOT DONE** → retour a l'agent responsable.

**MEMOIRE** : `store_memory(content: "<projet> | DoD gate: <DONE/GAPS/NOT DONE> | score: <X>/5 | next: retrospective", memory_type: "observation", tags: ["project:<nom>", "phase:dod-gate"])`

### 8. 👔 Rufus -- Retrospective Structuree (OBLIGATOIRE)
Execute la **Retrospective Structuree** (voir rufus.md) :
1. Collecter les outputs de tous les agents
2. Identifier les patterns cross-stories
3. What Went Well (max 3)
4. What Went Wrong (max 3)
5. Action Items SMART

**MEMOIRE** : `store_memory(content: "<projet> | workflow: create-project | resultat: <approved/rejected> | WWW: <points> | WWW: <points> | action items: <SMART items>", memory_type: "learning", tags: ["project:<nom>", "retrospective", "action-item"])`

### En cas d'echec ou de review rejetee
Lance l'agent `sephiroth` (debug) avec l'erreur/le rapport de Rude.
Il analysera la cause racine et proposera un fix. Si l'erreur est recurrente, Sephiroth signalera a Rufus d'invoquer `lucrecia` (meta-learning).
