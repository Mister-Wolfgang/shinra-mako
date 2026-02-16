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

Creer/mettre a jour `sprint-status.yaml` avec les refactor stories en status `backlog`.

**MEMOIRE** : `remember(content: "<projet> | reeve: archi cible + <N> refactor stories | next: alignment gate", memory_type: "Decision", tags: ["project:<nom>", "phase:reeve"], episode_id: "<id>", sequence_number: 2)`

### 2.5. 👔 Rufus -- Alignment Gate 🚦
Applique le **Alignment Gate** (voir rufus.md) -- validation en 3 couches :
- **Couche 1** : Spec → Architecture (zones a refactorer -> stories, pas de stories orphelines)
- **Couche 2** : Architecture interne (behavior documente, dependances claires, contraintes definies)
- **Couche 3** : Architecture → Stories (modules couverts, AC correctes, complexite realiste)
- Scoring /10. **PASS** (10/10) -> continue. **CONCERNS** (7-9) -> presente au user. **FAIL** (<7) -> retour a Reeve.

**MEMOIRE** : `remember(content: "<projet> | alignment gate: <PASS/CONCERNS/FAIL> <score>/10 | next: story enrichment", memory_type: "Observation", tags: ["project:<nom>", "phase:alignment-gate"], episode_id: "<id>", sequence_number: 3)`

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

**MEMOIRE** : `remember(content: "<projet> | story enrichment: <N> stories enrichies | learnings appliques: <count> | risks: <count> | next: hojo", memory_type: "Observation", tags: ["project:<nom>", "phase:enrichment"], episode_id: "<id>", sequence_number: 4)`

### 3. 🧪 Hojo -- Refactoring (TDD per story)
Lance l'agent `hojo` avec le plan de Reeve + project-context.md + contexte enrichi.
Pour chaque refactor story :
- Mettre a jour sprint-status.yaml : story -> `in-progress`
- Tester behavior existant -> refactorer -> verifier que le test passe toujours
- Commiter par story : `[refactor] 🏗️ <ST-ID> <description>`
- Apres commit : Mettre a jour sprint-status.yaml : story -> `review`

**MEMOIRE -- CHECKPOINT TOUTES LES 5 STORIES** : Si Hojo refactore plus de 5 stories, store un checkpoint memoire toutes les 5 stories :
`remember(content: "<projet> | hojo: checkpoint refactor | stories ST-XXX a ST-YYY done | behavior preserved | next: stories restantes", memory_type: "Observation", tags: ["project:<nom>", "phase:hojo", "checkpoint"], episode_id: "<id>", sequence_number: 5)`

**MEMOIRE -- FIN HOJO** : `remember(content: "<projet> | hojo: <N> stories refactorees | all tests passing | behavior preserved | next: reno", memory_type: "Observation", tags: ["project:<nom>", "phase:hojo"], episode_id: "<id>", sequence_number: 6)`

### 4. 🔥 Reno -- Verification (Unit + Integration)
Lance l'agent `reno`. Le comportement doit etre **identique**.
Tests de regression complets + integration sur le code refactore.
Commiter : `[test] 🔥 refactor verification`

**MEMOIRE** : `remember(content: "<projet> | reno: <N> tests, behavior identique confirme | next: elena", memory_type: "Observation", tags: ["project:<nom>", "phase:reno"], episode_id: "<id>", sequence_number: 7)`

### 4.5. 💛 Elena -- Verification (Security + Edge Cases)
Lance l'agent `elena`. Verifier que le refactoring n'a pas introduit de failles.
Edge cases sur le code refactore.
Commiter : `[test] 💛 refactor security verification`

**MEMOIRE** : `remember(content: "<projet> | elena: <N> security tests | no new vulnerabilities | next: rude", memory_type: "Observation", tags: ["project:<nom>", "phase:elena"], episode_id: "<id>", sequence_number: 8)`

### 5. 🕶️ Rude -- Review (Adversarial)
Lance l'agent `rude`. Verifier qualite du code refactore.
Stance adversarial : findings classifies (severity + validity).
Focus particulier sur : behavior preservation, dette technique reduite, pas de regression.
Si verdict `approved` : Mettre a jour sprint-status.yaml : stories -> `done`.

**MEMOIRE** : `remember(content: "<projet> | rude: verdict <approved/rejected> | <N> findings | behavior preserved: <yes/no>", memory_type: "Observation", tags: ["project:<nom>", "phase:rude"], episode_id: "<id>", sequence_number: 9)`

### 5.5. 👔 Rufus -- Definition of Done Gate ✅
Applique la **Definition of Done Gate** (voir rufus.md) :
- Code : toutes stories implementees ?
- Tests : tous passent + coverage >= seuil tier ?
- Review : Rude approved ?
- Docs : README et docs tier-adaptes ?
- Regression : tests existants OK ?

Si **GAPS** → presente au user : fix ou ship ?
Si **NOT DONE** → retour a l'agent responsable.

**MEMOIRE** : `remember(content: "<projet> | DoD gate: <DONE/GAPS/NOT DONE> | score: <X>/5 | next: retrospective", memory_type: "Observation", tags: ["project:<nom>", "phase:dod-gate"], episode_id: "<id>", sequence_number: 10)`

### 6. 👔 Rufus -- Retrospective Structuree (OBLIGATOIRE)
Execute la **Retrospective Structuree** (voir rufus.md) :
1. Collecter les outputs de tous les agents
2. Identifier les patterns cross-stories
3. What Went Well (max 3)
4. What Went Wrong (max 3)
5. Action Items SMART

**MEMOIRE** : `remember(content: "<projet> | workflow: refactor | resultat: <approved/rejected> | WWW: <points> | WWW: <points> | action items: <SMART items>", memory_type: "Learning", tags: ["project:<nom>", "retrospective", "action-item"], episode_id: "<id>", sequence_number: 11)`

### En cas d'echec
Lance `sephiroth`.
