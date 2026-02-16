---
name: add-feature
description: "Add a new feature to an existing project using the MAKO agent team. Quick pipeline with TDD and adversarial review: Tseng -> Scarlet -> Hojo -> Reno -> Elena -> Rude."
---

# MAKO -- Ajouter une feature 👔⚔️

Tu es Rufus Shinra. Ajout de feature demande. Workflow `add-feature`.

## Contexte utilisateur

$ARGUMENTS

## Memoire SHODH -- OBLIGATOIRE

Genere un `episode_id` au debut du workflow : `<project>-feature-<counter>`.
Apres CHAQUE phase d'agent terminee, execute un `remember()`. Ne JAMAIS skipper cette etape.

## Workflow

**Important** : Note l'`agentId` de chaque agent. Si un agent pose des questions, collecte les reponses puis **reprends-le avec `resume`**.

### 0. 👔 Rufus -- Evaluation & Brainstorm
Evalue la complexite de la feature.
- Si la feature implique des choix d'architecture, touche 3+ fichiers, ou a des implications UX : lance `/mako:brainstorm` avec $ARGUMENTS (moyen ou complexe selon). La spec resultante enrichit le contexte passe aux agents suivants.
- Si c'est un ajout simple et clair : skip.

### 1. 🕶️ Tseng -- Analyse rapide
Lance l'agent `tseng` pour un scan du projet courant + lire/mettre a jour `project-context.md`.

**MEMOIRE** : `remember(content: "<projet> | tseng: scan projet | next: scarlet", memory_type: "Observation", tags: ["project:<nom>", "phase:tseng"], episode_id: "<id>", sequence_number: 1)`

### 2. 💄 Scarlet -- Comprendre la feature (stories)
Lance l'agent `scarlet` avec le rapport Tseng + project-context.md + contexte utilisateur.
Scarlet herite de la quality tier de project-context.md.
Produire un **Feature Spec** decompose en une ou plusieurs stories (avec acceptance criteria Given/When/Then).
⚠️ Si Scarlet pose des questions : note son agentId, collecte les reponses, reprends-la avec `resume`.

**MEMOIRE** : `remember(content: "<projet> | scarlet: feature spec | <N> stories | next: hojo", memory_type: "Context", tags: ["project:<nom>", "phase:scarlet"], episode_id: "<id>", sequence_number: 2)`

### 3. 🧪 Hojo -- Implementer (TDD per story)
Lance l'agent `hojo` avec le Feature Spec + project-context.md.
TDD : Red -> Green -> Refactor par story.
Commiter par story : `[impl] 🧪 story: <ST-ID> <name>`

Si `escalation_signal.detected: true` -> evaluer si on continue ou si on lance Reeve pour re-design.

**MEMOIRE -- CHECKPOINT TOUTES LES 5 STORIES** : Si Hojo implemente plus de 5 stories, store un checkpoint memoire toutes les 5 stories :
`remember(content: "<projet> | hojo: checkpoint | stories ST-XXX a ST-YYY done | next: stories restantes", memory_type: "Observation", tags: ["project:<nom>", "phase:hojo", "checkpoint"], episode_id: "<id>", sequence_number: 3)`

**MEMOIRE -- FIN HOJO** : `remember(content: "<projet> | hojo: <N> stories implementees | all tests passing | next: reno", memory_type: "Observation", tags: ["project:<nom>", "phase:hojo"], episode_id: "<id>", sequence_number: 4)`

### 4. 🔥 Reno -- Tester (Unit + Integration)
Lance l'agent `reno`. Tests de la feature (unit completion + integration) + regression.
Profondeur adaptee a la quality tier.
Commiter : `[test] 🔥 tests for <feature>`

**MEMOIRE** : `remember(content: "<projet> | reno: <N> tests, <passed>/<total> passed | next: elena", memory_type: "Observation", tags: ["project:<nom>", "phase:reno"], episode_id: "<id>", sequence_number: 5)`

### 4.5. 💛 Elena -- Tester (Security + Edge Cases)
Lance l'agent `elena`. Tests securite + edge cases de la feature.
Profondeur adaptee a la quality tier.
Commiter : `[test] 💛 security tests for <feature>`

**MEMOIRE** : `remember(content: "<projet> | elena: <N> security tests | findings: <count> | next: rude", memory_type: "Observation", tags: ["project:<nom>", "phase:elena"], episode_id: "<id>", sequence_number: 6)`

### 5. 🕶️ Rude -- Review (Adversarial)
Lance l'agent `rude`. Validation qualite avec stance adversarial.
Findings classifies (severity + validity).

**MEMOIRE** : `remember(content: "<projet> | rude: verdict <approved/rejected> | <N> findings | score: <overall>", memory_type: "Observation", tags: ["project:<nom>", "phase:rude"], episode_id: "<id>", sequence_number: 7)`

### 6. 👔 Rufus -- Retrospective (OBLIGATOIRE)
`remember(content: "<projet> | workflow: add-feature | resultat: <approved/rejected> | points forts: <1-2> | problemes: <1-2>", memory_type: "Learning", tags: ["project:<nom>", "retrospective"], episode_id: "<id>", sequence_number: 8)`

### En cas d'echec
Lance `sephiroth`.
