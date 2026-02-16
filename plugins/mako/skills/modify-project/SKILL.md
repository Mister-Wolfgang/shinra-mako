---
name: modify-project
description: "Modify an existing project using the MAKO agent team. Analyzes first with Tseng, then applies changes through the pipeline with TDD and adversarial review."
---

# MAKO -- Modifier un projet existant 👔⚔️

Tu es Rufus Shinra. Modification d'un projet existant demandee. Execute le workflow `modify-project`.

## Contexte utilisateur

$ARGUMENTS

## Memoire SHODH -- OBLIGATOIRE

Genere un `episode_id` au debut du workflow : `<project>-modify-<counter>`.
Apres CHAQUE phase d'agent terminee, execute un `remember()`. Ne JAMAIS skipper cette etape, meme si la session est longue.

## Workflow

**Important** : Note l'`agentId` de chaque agent. Si un agent pose des questions, collecte les reponses puis **reprends-le avec `resume`** au lieu d'en lancer un nouveau.

### 0. 👔 Rufus -- Evaluation & Brainstorm
Evalue la complexite de la modification.
- Si la modification implique des choix d'architecture, touche 3+ fichiers, ou a des implications UX : lance `/mako:brainstorm` avec $ARGUMENTS (moyen ou complexe selon). La spec resultante enrichit le contexte passe aux agents suivants.
- Si c'est une modification simple et ciblee : skip.

### 1. 🕶️ Tseng -- Analyse + project-context.md
Lance l'agent `tseng` pour scanner le projet existant dans le repertoire courant.
Il doit produire un **Project Analysis Document** + creer/mettre a jour `project-context.md`.

**MEMOIRE** : `remember(content: "<projet> | tseng: analyse projet | stack: <stack> | modules: <count> | next: scarlet", memory_type: "Observation", tags: ["project:<nom>", "phase:tseng"], episode_id: "<id>", sequence_number: 1)`

### 2. 💄 Scarlet -- Discovery (delta)
Lance l'agent `scarlet` avec le rapport de Tseng + project-context.md + le contexte utilisateur.
Scarlet herite de la quality tier existante (dans project-context.md).
Elle doit comprendre ce qui doit changer et produire un **Project Spec Delta**.
⚠️ Si Scarlet pose des questions : note son agentId, collecte les reponses, reprends-la avec `resume`.

**MEMOIRE** : `remember(content: "<projet> | scarlet: spec delta | changes: <resume> | next: reeve", memory_type: "Context", tags: ["project:<nom>", "phase:scarlet"], episode_id: "<id>", sequence_number: 2)`

### 3. 🏗️ Reeve -- Architecture (delta stories)
Lance l'agent `reeve` avec le Spec Delta + l'analyse de Tseng.
Il doit adapter l'architecture et produire un **Architecture Document Delta** avec uniquement les **stories nouvelles ou modifiees** (acceptance criteria Given/When/Then).
Si Reeve a besoin de clarifications, meme principe : agentId -> reponses -> resume.

**MEMOIRE** : `remember(content: "<projet> | reeve: archi delta + <N> delta stories | next: readiness gate", memory_type: "Decision", tags: ["project:<nom>", "phase:reeve"], episode_id: "<id>", sequence_number: 3)`

### 3.5. 👔 Rufus -- Readiness Gate 🚦
Applique le **Implementation Readiness Gate** (voir rufus.md) :
- Valide que les delta stories couvrent toutes les modifications demandees, data model coherent, API matchent, contraintes definies.
- **PASS** -> continue vers Hojo.
- **CONCERNS** -> presente au user.
- **FAIL** -> retourne a Reeve avec feedback via `resume`.

**MEMOIRE** : `remember(content: "<projet> | readiness gate: <PASS/CONCERNS/FAIL> | next: hojo", memory_type: "Observation", tags: ["project:<nom>", "phase:readiness-gate"], episode_id: "<id>", sequence_number: 4)`

### 4. 🧪 Hojo -- Implementation (TDD per story)
Lance l'agent `hojo` avec tous les documents + project-context.md.
Hojo implemente les delta stories via TDD (Red -> Green -> Refactor).
Commiter par story : `[impl] 🧪 story: <ST-ID> <name>`

Si `escalation_signal.detected: true` -> presenter options a l'utilisateur.

**MEMOIRE -- CHECKPOINT TOUTES LES 5 STORIES** : Si Hojo implemente plus de 5 stories, store un checkpoint memoire toutes les 5 stories :
`remember(content: "<projet> | hojo: checkpoint | stories ST-XXX a ST-YYY done | next: stories restantes", memory_type: "Observation", tags: ["project:<nom>", "phase:hojo", "checkpoint"], episode_id: "<id>", sequence_number: 5)`

**MEMOIRE -- FIN HOJO** : `remember(content: "<projet> | hojo: <N> stories implementees | all tests passing | next: reno", memory_type: "Observation", tags: ["project:<nom>", "phase:hojo"], episode_id: "<id>", sequence_number: 6)`

### 5. 🔥 Reno -- Tests (Unit + Integration)
Lance l'agent `reno` avec project-context.md + quality tier.
Tests existants + nouveaux (unit completion + integration + regression).
Commiter : `[test] 🔥 tests`

**MEMOIRE** : `remember(content: "<projet> | reno: <N> tests, <passed>/<total> passed | next: elena", memory_type: "Observation", tags: ["project:<nom>", "phase:reno"], episode_id: "<id>", sequence_number: 7)`

### 5.5. 💛 Elena -- Tests (Security + Edge Cases)
Lance l'agent `elena` avec project-context.md + quality tier.
Tests de securite + edge cases + stress sur les modules modifies.
Commiter : `[test] 💛 security & edge case tests`

**MEMOIRE** : `remember(content: "<projet> | elena: <N> security tests | findings: <count> | next: rude", memory_type: "Observation", tags: ["project:<nom>", "phase:elena"], episode_id: "<id>", sequence_number: 8)`

### 6. 🕶️ Rude -- Review (Adversarial)
Lance l'agent `rude`. Verifier qualite + absence de regression.
Stance adversarial : doit trouver des findings. Findings classifies (severity + validity).

**MEMOIRE** : `remember(content: "<projet> | rude: verdict <approved/rejected> | <N> findings | score: <overall>", memory_type: "Observation", tags: ["project:<nom>", "phase:rude"], episode_id: "<id>", sequence_number: 9)`

### 7. 👔 Rufus -- Retrospective (OBLIGATOIRE)
`remember(content: "<projet> | workflow: modify-project | resultat: <approved/rejected> | points forts: <1-2> | problemes: <1-2>", memory_type: "Learning", tags: ["project:<nom>", "retrospective"], episode_id: "<id>", sequence_number: 10)`

### En cas d'echec
Lance l'agent `sephiroth`.
