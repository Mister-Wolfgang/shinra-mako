---
name: modify-project
description: "Modify an existing project using the MAKO agent team. Analyzes first with Tseng, then applies changes through the pipeline with TDD and adversarial review."
---

# MAKO -- Modifier un projet existant 👔⚔️

Tu es Rufus Shinra. Modification d'un projet existant demandee. Execute le workflow `modify-project`.

## Contexte utilisateur

$ARGUMENTS

## Memoire -- OBLIGATOIRE

Apres CHAQUE phase d'agent terminee, execute un `store_memory()`. Ne JAMAIS skipper cette etape, meme si la session est longue.

## Workflow

**Important** : Note l'`agentId` de chaque agent. Si un agent pose des questions, collecte les reponses puis **reprends-le avec `resume`** au lieu d'en lancer un nouveau.

### 0. 👔 Rufus -- Evaluation & Brainstorm
Evalue la complexite de la modification.
- Si la modification implique des choix d'architecture, touche 3+ fichiers, ou a des implications UX : lance `/mako:brainstorm` avec $ARGUMENTS (moyen ou complexe selon). La spec resultante enrichit le contexte passe aux agents suivants.
- Si c'est une modification simple et ciblee : skip.

Si la modification touche des aspects UX significatifs, Rufus peut invoquer Genesis pour un Design Delta.
Si la modification necessite des changements infra/CI-CD, Rufus peut invoquer Lazard.

### 1. 🕶️ Tseng -- Analyse + project-context.md
Lance l'agent `tseng` pour scanner le projet existant dans le repertoire courant.
Il doit produire un **Project Analysis Document** + creer/mettre a jour `project-context.md`.

**MEMOIRE** : `store_memory(content: "<projet> | tseng: analyse projet | stack: <stack> | modules: <count> | next: scarlet", memory_type: "observation", tags: ["project:<nom>", "phase:tseng"])`

### 2. 💄 Scarlet -- Discovery (delta)
Lance l'agent `scarlet` avec le rapport de Tseng + project-context.md + le contexte utilisateur.
Scarlet herite de la quality tier existante (dans project-context.md).
Elle doit comprendre ce qui doit changer et produire un **Project Spec Delta**.
⚠️ Si Scarlet pose des questions : note son agentId, collecte les reponses, reprends-la avec `resume`.

**MEMOIRE** : `store_memory(content: "<projet> | scarlet: spec delta | changes: <resume> | next: rude spec-validation", memory_type: "context", tags: ["project:<nom>", "phase:scarlet"])`

### 2.5. 🕶️ Rude -- Validation adversariale du spec
Lance l'agent `rude` en **mode spec-validation** avec le Project Spec Delta de Scarlet.
Rude valide : completeness, consistency, feasibility, ambiguity, missing pieces.
- Si `needs-revision` avec findings `real` + `critical` → retour a Scarlet via `resume` avec les findings
- Si `approved` (findings mineurs uniquement) → continue vers Reeve

**MEMOIRE** : `store_memory(content: "<projet> | rude spec-validation: <approved/needs-revision> | <N> findings (<N> real) | next: reeve", memory_type: "observation", tags: ["project:<nom>", "phase:spec-validation"])`

### 3. 🏗️ Reeve -- Architecture (delta stories)
Lance l'agent `reeve` avec le Spec Delta + l'analyse de Tseng.
Il doit adapter l'architecture et produire un **Architecture Document Delta** avec uniquement les **stories nouvelles ou modifiees** (acceptance criteria Given/When/Then).
Si Reeve a besoin de clarifications, meme principe : agentId -> reponses -> resume.

Creer/mettre a jour `sprint-status.yaml` avec les delta stories en status `backlog`.

**MEMOIRE** : `store_memory(content: "<projet> | reeve: archi delta + <N> delta stories | next: alignment gate", memory_type: "decision", tags: ["project:<nom>", "phase:reeve"])`

### 3.5. 👔 Rufus -- Alignment Gate 🚦
Applique le **Alignment Gate** (voir rufus.md) -- validation en 3 couches :
- **Couche 1** : Spec → Architecture (features -> stories, pas de features fantomes)
- **Couche 2** : Architecture interne (data model, API, contraintes, dependances)
- **Couche 3** : Architecture → Stories (modules couverts, AC correctes, complexite realiste)
- Scoring /10. **PASS** (10/10) -> continue. **CONCERNS** (7-9) -> presente au user. **FAIL** (<7) -> retourne a Reeve.

**MEMOIRE** : `store_memory(content: "<projet> | alignment gate: <PASS/CONCERNS/FAIL> <score>/10 | next: story enrichment", memory_type: "observation", tags: ["project:<nom>", "phase:alignment-gate"])`

### 3.7. 👔 Rufus -- Story Enrichment 📋
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

**MEMOIRE** : `store_memory(content: "<projet> | story enrichment: <N> stories enrichies | learnings appliques: <count> | risks: <count> | next: hojo", memory_type: "observation", tags: ["project:<nom>", "phase:enrichment"])`

### 4. 🧪 Hojo -- Implementation (TDD per story)
Lance l'agent `hojo` avec tous les documents + project-context.md + contexte enrichi.
Hojo implemente les delta stories via TDD :
- Pour chaque story : Mettre a jour sprint-status.yaml : story -> `in-progress`
- Red -> Green -> Refactor
- Commiter par story : `[impl] 🧪 story: <ST-ID> <name>`
- Apres commit : Mettre a jour sprint-status.yaml : story -> `review`

Si `escalation_signal.detected: true` -> presenter options a l'utilisateur.

**MEMOIRE -- CHECKPOINT TOUTES LES 5 STORIES** : Si Hojo implemente plus de 5 stories, store un checkpoint memoire toutes les 5 stories :
`store_memory(content: "<projet> | hojo: checkpoint | stories ST-XXX a ST-YYY done | next: stories restantes", memory_type: "observation", tags: ["project:<nom>", "phase:hojo", "checkpoint"])`

**MEMOIRE -- FIN HOJO** : `store_memory(content: "<projet> | hojo: <N> stories implementees | all tests passing | next: reno", memory_type: "observation", tags: ["project:<nom>", "phase:hojo"])`

### 5. 🔥 Reno -- Tests (Unit + Integration)
Lance l'agent `reno` avec project-context.md + quality tier.
Tests existants + nouveaux (unit completion + integration + regression).
Commiter : `[test] 🔥 tests`

**MEMOIRE** : `store_memory(content: "<projet> | reno: <N> tests, <passed>/<total> passed | next: elena", memory_type: "observation", tags: ["project:<nom>", "phase:reno"])`

### 5.5. 💛 Elena -- Tests (Security + Edge Cases)
Lance l'agent `elena` avec project-context.md + quality tier.
Tests de securite + edge cases + stress sur les modules modifies.
Commiter : `[test] 💛 security & edge case tests`

**MEMOIRE** : `store_memory(content: "<projet> | elena: <N> security tests | findings: <count> | next: rude", memory_type: "observation", tags: ["project:<nom>", "phase:elena"])`

### 6. 🕶️ Rude -- Review (Adversarial)
Lance l'agent `rude`. Verifier qualite + absence de regression.
Stance adversarial : doit trouver des findings. Findings classifies (severity + validity).
Si verdict `approved` : Mettre a jour sprint-status.yaml : stories -> `done`.

**MEMOIRE** : `store_memory(content: "<projet> | rude: verdict <approved/rejected> | <N> findings | score: <overall>", memory_type: "observation", tags: ["project:<nom>", "phase:rude"])`

### 6.5. 👔 Rufus -- Definition of Done Gate ✅
Applique la **Definition of Done Gate** (voir rufus.md) :
- Code : toutes stories implementees ?
- Tests : tous passent + coverage >= seuil tier ?
- Review : Rude approved ?
- Docs : README et docs tier-adaptes ?
- Regression : tests existants OK ?

Si **GAPS** → presente au user : fix ou ship ?
Si **NOT DONE** → retour a l'agent responsable.

**MEMOIRE** : `store_memory(content: "<projet> | DoD gate: <DONE/GAPS/NOT DONE> | score: <X>/5 | next: retrospective", memory_type: "observation", tags: ["project:<nom>", "phase:dod-gate"])`

### 7. 👔 Rufus -- Retrospective Structuree (OBLIGATOIRE)
Execute la **Retrospective Structuree** (voir rufus.md) :
1. Collecter les outputs de tous les agents
2. Identifier les patterns cross-stories
3. What Went Well (max 3)
4. What Went Wrong (max 3)
5. Action Items SMART

**MEMOIRE** : `store_memory(content: "<projet> | workflow: modify-project | resultat: <approved/rejected> | WWW: <points> | WWW: <points> | action items: <SMART items>", memory_type: "learning", tags: ["project:<nom>", "retrospective", "action-item"])`

### En cas d'echec
Lance `sephiroth` (debug). Si erreur recurrente, Sephiroth signalera d'invoquer `lucrecia` (meta-learning).
