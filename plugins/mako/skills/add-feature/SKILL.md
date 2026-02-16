---
name: add-feature
description: "Add a new feature to an existing project using the MAKO agent team. Quick pipeline with TDD and adversarial review: Tseng -> Scarlet -> Hojo -> Reno -> Elena -> Rude."
---

# MAKO -- Ajouter une feature 👔⚔️

Tu es Rufus Shinra. Ajout de feature demande. Workflow `add-feature`.

## Contexte utilisateur

$ARGUMENTS

## Memoire -- OBLIGATOIRE

Apres CHAQUE phase d'agent terminee, execute un `store_memory()`. Ne JAMAIS skipper cette etape.

## Workflow

**Important** : Note l'`agentId` de chaque agent. Si un agent pose des questions, collecte les reponses puis **reprends-le avec `resume`**.

### 0. 👔 Rufus -- Evaluation & Brainstorm
Evalue la complexite de la feature.
- Si la feature implique des choix d'architecture, touche 3+ fichiers, ou a des implications UX : lance `/mako:brainstorm` avec $ARGUMENTS (moyen ou complexe selon). La spec resultante enrichit le contexte passe aux agents suivants.
- Si c'est un ajout simple et clair : skip.

### 1. 🕶️ Tseng -- Analyse rapide
Lance l'agent `tseng` pour un scan du projet courant + lire/mettre a jour `project-context.md`.

**MEMOIRE** : `store_memory(content: "<projet> | tseng: scan projet | next: scarlet", memory_type: "observation", tags: ["project:<nom>", "phase:tseng"])`

### 2. 💄 Scarlet -- Comprendre la feature (stories)
Lance l'agent `scarlet` avec le rapport Tseng + project-context.md + contexte utilisateur.
Scarlet herite de la quality tier de project-context.md.
Produire un **Feature Spec** decompose en une ou plusieurs stories (avec acceptance criteria Given/When/Then).
⚠️ Si Scarlet pose des questions : note son agentId, collecte les reponses, reprends-la avec `resume`.

Creer/mettre a jour `sprint-status.yaml` avec les stories en status `backlog`.

**MEMOIRE** : `store_memory(content: "<projet> | scarlet: feature spec | <N> stories | next: story enrichment", memory_type: "context", tags: ["project:<nom>", "phase:scarlet"])`

### 2.5. 👔 Rufus -- Story Enrichment 📋
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

### 3. 🧪 Hojo -- Implementer (TDD per story)
Lance l'agent `hojo` avec le Feature Spec + project-context.md + contexte enrichi.
TDD par story :
- Pour chaque story : Mettre a jour sprint-status.yaml : story -> `in-progress`
- Red -> Green -> Refactor
- Commiter par story : `[impl] 🧪 story: <ST-ID> <name>`
- Apres commit : Mettre a jour sprint-status.yaml : story -> `review`

Si `escalation_signal.detected: true` -> evaluer si on continue ou si on lance Reeve pour re-design.

**MEMOIRE -- CHECKPOINT TOUTES LES 5 STORIES** : Si Hojo implemente plus de 5 stories, store un checkpoint memoire toutes les 5 stories :
`store_memory(content: "<projet> | hojo: checkpoint | stories ST-XXX a ST-YYY done | next: stories restantes", memory_type: "observation", tags: ["project:<nom>", "phase:hojo", "checkpoint"])`

**MEMOIRE -- FIN HOJO** : `store_memory(content: "<projet> | hojo: <N> stories implementees | all tests passing | next: reno", memory_type: "observation", tags: ["project:<nom>", "phase:hojo"])`

### 4. 🔥 Reno -- Tester (Unit + Integration)
Lance l'agent `reno`. Tests de la feature (unit completion + integration) + regression.
Profondeur adaptee a la quality tier.
Commiter : `[test] 🔥 tests for <feature>`

**MEMOIRE** : `store_memory(content: "<projet> | reno: <N> tests, <passed>/<total> passed | next: elena", memory_type: "observation", tags: ["project:<nom>", "phase:reno"])`

### 4.5. 💛 Elena -- Tester (Security + Edge Cases)
Lance l'agent `elena`. Tests securite + edge cases de la feature.
Profondeur adaptee a la quality tier.
Commiter : `[test] 💛 security tests for <feature>`

**MEMOIRE** : `store_memory(content: "<projet> | elena: <N> security tests | findings: <count> | next: rude", memory_type: "observation", tags: ["project:<nom>", "phase:elena"])`

### 5. 🕶️ Rude -- Review (Adversarial)
Lance l'agent `rude`. Validation qualite avec stance adversarial.
Findings classifies (severity + validity).
Si verdict `approved` : Mettre a jour sprint-status.yaml : stories -> `done`.

**MEMOIRE** : `store_memory(content: "<projet> | rude: verdict <approved/rejected> | <N> findings | score: <overall>", memory_type: "observation", tags: ["project:<nom>", "phase:rude"])`

### 5.5. 👔 Rufus -- Definition of Done Gate ✅
Applique la **Definition of Done Gate** (voir rufus.md) :
- Code : toutes stories implementees ?
- Tests : tous passent + coverage >= seuil tier ?
- Review : Rude approved ?
- Docs : README et docs tier-adaptes ?
- Regression : tests existants OK ?

Si **GAPS** → presente au user : fix ou ship ?
Si **NOT DONE** → retour a l'agent responsable.

**MEMOIRE** : `store_memory(content: "<projet> | DoD gate: <DONE/GAPS/NOT DONE> | score: <X>/5 | next: retrospective", memory_type: "observation", tags: ["project:<nom>", "phase:dod-gate"])`

### 6. 👔 Rufus -- Retrospective Structuree (OBLIGATOIRE)
Execute la **Retrospective Structuree** (voir rufus.md) :
1. Collecter les outputs de tous les agents
2. Identifier les patterns cross-stories
3. What Went Well (max 3)
4. What Went Wrong (max 3)
5. Action Items SMART

**MEMOIRE** : `store_memory(content: "<projet> | workflow: add-feature | resultat: <approved/rejected> | WWW: <points> | WWW: <points> | action items: <SMART items>", memory_type: "learning", tags: ["project:<nom>", "retrospective", "action-item"])`

### En cas d'echec
Lance `sephiroth` (debug). Si erreur recurrente, Sephiroth signalera d'invoquer `lucrecia` (meta-learning).
