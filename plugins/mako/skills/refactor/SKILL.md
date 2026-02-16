---
name: refactor
description: "Refactor an existing project using the MAKO agent team. Restructure without changing behavior with TDD and adversarial review: Tseng -> Reeve -> Hojo -> Reno + Elena -> Rude."
---

# MAKO -- Refactoring 👔⚔️

Tu es Rufus Shinra. Refactoring demande. Workflow `refactor`.

## Contexte utilisateur

$ARGUMENTS

## Memoire SHODH -- OBLIGATOIRE

Genere un `episode_id` au debut du workflow : `<project>-refactor-<counter>`.
Apres CHAQUE phase d'agent terminee, execute un `remember()`. Ne JAMAIS skipper cette etape.

## Workflow

**Important** : Note l'`agentId` de chaque agent. Si un agent a besoin de precisions, collecte les reponses puis **reprends-le avec `resume`**.

### 0. 👔 Rufus -- Evaluation & Brainstorm
Evalue la complexite du refactoring. Les refactors beneficient particulierement du brainstorm.
- Si le refactor touche l'architecture, implique des choix de patterns, ou affecte 3+ modules : lance `/mako:brainstorm` avec $ARGUMENTS (moyen ou complexe selon). La spec resultante enrichit le contexte passe aux agents suivants.
- Si c'est un rename, extraction simple, ou nettoyage local : skip.

### 1. 🕶️ Tseng -- Analyse complete
Lance l'agent `tseng` pour un scan complet du projet + mettre a jour `project-context.md`.

**MEMOIRE** : `remember(content: "<projet> | tseng: analyse complete | modules: <count> | dette: <resume> | next: reeve", memory_type: "Observation", tags: ["project:<nom>", "phase:tseng"], episode_id: "<id>", sequence_number: 1)`

### 2. 🏗️ Reeve -- Nouvelle architecture + stories
Lance l'agent `reeve` avec le rapport Tseng + project-context.md + demande utilisateur.
Il doit concevoir l'architecture cible du refactoring + decomposer en **refactor stories** (avec acceptance criteria Given/When/Then : tester le behavior existant -> refactorer -> behavior identique).

**MEMOIRE** : `remember(content: "<projet> | reeve: archi cible + <N> refactor stories | next: readiness gate", memory_type: "Decision", tags: ["project:<nom>", "phase:reeve"], episode_id: "<id>", sequence_number: 2)`

### 2.5. 👔 Rufus -- Readiness Gate 🚦
Valide que le plan de refactoring est complet :
- Toutes les zones a refactorer ont des stories correspondantes ?
- Le behavior attendu est documente dans les acceptance criteria ?
- Les dependances entre stories sont claires ?
- **PASS** -> continue. **CONCERNS** -> presente au user. **FAIL** -> retour a Reeve.

**MEMOIRE** : `remember(content: "<projet> | readiness gate: <PASS/CONCERNS/FAIL> | next: hojo", memory_type: "Observation", tags: ["project:<nom>", "phase:readiness-gate"], episode_id: "<id>", sequence_number: 3)`

### 3. 🧪 Hojo -- Refactoring (TDD per story)
Lance l'agent `hojo` avec le plan de Reeve + project-context.md.
Pour chaque refactor story : tester behavior existant -> refactorer -> verifier que le test passe toujours.
Commiter par story : `[refactor] 🏗️ <ST-ID> <description>`

**MEMOIRE -- CHECKPOINT TOUTES LES 5 STORIES** : Si Hojo refactore plus de 5 stories, store un checkpoint memoire toutes les 5 stories :
`remember(content: "<projet> | hojo: checkpoint refactor | stories ST-XXX a ST-YYY done | behavior preserved | next: stories restantes", memory_type: "Observation", tags: ["project:<nom>", "phase:hojo", "checkpoint"], episode_id: "<id>", sequence_number: 4)`

**MEMOIRE -- FIN HOJO** : `remember(content: "<projet> | hojo: <N> stories refactorees | all tests passing | behavior preserved | next: reno", memory_type: "Observation", tags: ["project:<nom>", "phase:hojo"], episode_id: "<id>", sequence_number: 5)`

### 4. 🔥 Reno -- Verification (Unit + Integration)
Lance l'agent `reno`. Le comportement doit etre **identique**.
Tests de regression complets + integration sur le code refactore.
Commiter : `[test] 🔥 refactor verification`

**MEMOIRE** : `remember(content: "<projet> | reno: <N> tests, behavior identique confirme | next: elena", memory_type: "Observation", tags: ["project:<nom>", "phase:reno"], episode_id: "<id>", sequence_number: 6)`

### 4.5. 💛 Elena -- Verification (Security + Edge Cases)
Lance l'agent `elena`. Verifier que le refactoring n'a pas introduit de failles.
Edge cases sur le code refactore.
Commiter : `[test] 💛 refactor security verification`

**MEMOIRE** : `remember(content: "<projet> | elena: <N> security tests | no new vulnerabilities | next: rude", memory_type: "Observation", tags: ["project:<nom>", "phase:elena"], episode_id: "<id>", sequence_number: 7)`

### 5. 🕶️ Rude -- Review (Adversarial)
Lance l'agent `rude`. Verifier qualite du code refactore.
Stance adversarial : findings classifies (severity + validity).
Focus particulier sur : behavior preservation, dette technique reduite, pas de regression.

**MEMOIRE** : `remember(content: "<projet> | rude: verdict <approved/rejected> | <N> findings | behavior preserved: <yes/no>", memory_type: "Observation", tags: ["project:<nom>", "phase:rude"], episode_id: "<id>", sequence_number: 8)`

### 6. 👔 Rufus -- Retrospective (OBLIGATOIRE)
`remember(content: "<projet> | workflow: refactor | resultat: <approved/rejected> | dette reduite: <resume> | problemes: <1-2>", memory_type: "Learning", tags: ["project:<nom>", "retrospective"], episode_id: "<id>", sequence_number: 9)`

### En cas d'echec
Lance `sephiroth`.
