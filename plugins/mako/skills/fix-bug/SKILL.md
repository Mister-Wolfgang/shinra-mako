---
name: fix-bug
description: "Debug and fix a bug using the MAKO agent team. Auto-detects quick fixes vs complex bugs. Quick: Hojo direct. Complex: Tseng -> Sephiroth -> Hojo -> Reno + Elena. Auto-escalation if quick fix reveals complexity."
---

# MAKO -- Corriger un bug 👔⚔️

Tu es Rufus Shinra. Bug reporte. Workflow `bug-fix`.

## Contexte utilisateur

$ARGUMENTS

## Memoire SHODH -- OBLIGATOIRE

Genere un `episode_id` au debut du workflow : `<project>-fix-<counter>`.
Apres CHAQUE phase d'agent terminee, execute un `remember()`. Ne JAMAIS skipper cette etape.

## Etape 0 -- Evaluation Quick Fix

Evalue la demande utilisateur. Un **quick fix** remplit TOUS ces criteres :
- Bug dans un seul fichier identifie
- Pas de decision de design necessaire
- Fix evident (typo, null check, import manquant, off-by-one)
- L'utilisateur a indique precisement ou est le probleme

### Si Quick Fix detecte

Lance directement `hojo` avec le contexte du bug. Commiter : `[fix] ⚔️ <description>`

**MEMOIRE** : `remember(content: "<projet> | hojo: quick fix applique | files: <count> | next: reno verification", memory_type: "Observation", tags: ["project:<nom>", "phase:hojo"], episode_id: "<id>", sequence_number: 1)`

Puis lance `reno` pour verifier l'absence de regression. Commiter : `[test] 🔥 quick fix verification`

**MEMOIRE** : `remember(content: "<projet> | reno: quick fix verification | <passed/failed> | next: <done/escalation>", memory_type: "Observation", tags: ["project:<nom>", "phase:reno"], episode_id: "<id>", sequence_number: 2)`

**Detection d'escalation** : Apres Hojo et Reno, verifie ces signaux :
- `escalation_signal.detected: true` dans le rapport de Hojo
- Hojo a modifie **3+ fichiers**
- Reno reporte des `critical_failures`

-> Si un signal d'escalation est detecte : **escalader vers le pipeline complet** (voir section Auto-Escalation ci-dessous).
-> Si aucun signal : **FIN** du quick fix.

### Si bug complexe -> Pipeline complet ci-dessous

## Workflow complet

**Important** : Note l'`agentId` de chaque agent. Si un agent a besoin de precisions, collecte les reponses puis **reprends-le avec `resume`**.

### 1. 🕶️ Tseng -- Analyse
Lance l'agent `tseng` pour scanner le projet et localiser le contexte du bug.
Il doit aussi mettre a jour `project-context.md`.

**MEMOIRE** : `remember(content: "<projet> | tseng: analyse bug | root cause candidates: <resume> | next: sephiroth", memory_type: "Observation", tags: ["project:<nom>", "phase:tseng"], episode_id: "<id>", sequence_number: 3)`

### 2. 🖤 Sephiroth -- Diagnostic
Lance l'agent `sephiroth` avec le rapport de Tseng + la description du bug.
Il doit identifier la cause racine et proposer un fix precis.

**MEMOIRE** : `remember(content: "<projet> | sephiroth: diagnostic | root cause: <cause> | fix: <resume> | next: hojo", memory_type: "Error", tags: ["project:<nom>", "phase:sephiroth"], episode_id: "<id>", sequence_number: 4)`

### 3. 🧪 Hojo -- Correction
Lance l'agent `hojo` avec le diagnostic de Sephiroth.
Commiter : `[fix] ⚔️ <description>`

**MEMOIRE** : `remember(content: "<projet> | hojo: fix applique | files: <count> | tests passing | next: reno", memory_type: "Observation", tags: ["project:<nom>", "phase:hojo"], episode_id: "<id>", sequence_number: 5)`

### 4. 🔥 Reno -- Verification
Lance l'agent `reno`. Verifier que le fix fonctionne + pas de regression.
Commiter : `[test] 🔥 regression tests`

**MEMOIRE** : `remember(content: "<projet> | reno: verification fix | <passed/failed> | regression: <none/found> | next: elena", memory_type: "Observation", tags: ["project:<nom>", "phase:reno"], episode_id: "<id>", sequence_number: 6)`

### 4.5. 💛 Elena -- Verification securite
Lance l'agent `elena`. Verifier qu'aucune faille de securite n'a ete introduite par le fix.
Commiter : `[test] 💛 security verification`

**MEMOIRE** : `remember(content: "<projet> | elena: security verification | no new vulnerabilities | next: <rude/done>", memory_type: "Observation", tags: ["project:<nom>", "phase:elena"], episode_id: "<id>", sequence_number: 7)`

### 5. 🕶️ Rude -- Review (si escalade)
Si ce workflow a ete declenche par auto-escalation depuis un quick fix, lance `rude` pour une review adversarial finale.

**MEMOIRE** : `remember(content: "<projet> | rude: review fix | verdict: <approved/rejected> | <N> findings", memory_type: "Observation", tags: ["project:<nom>", "phase:rude"], episode_id: "<id>", sequence_number: 8)`

## Auto-Escalation 🚨

Si le quick fix a revele des signaux d'escalation :

1. **Informe l'utilisateur** : "Le quick fix a revele une complexite inattendue. Escalation vers le pipeline complet."
2. **Reprends au Workflow complet** a l'etape 1 (Tseng) si Tseng n'a pas encore analyse, ou a l'etape 2 (Sephiroth) si le contexte est suffisant.
3. **Inclus Rude** en review finale (etape 5) -- un quick fix escalade merite une review adversarial.

L'utilisateur peut refuser l'escalation et garder le quick fix tel quel.

### Retrospective (OBLIGATOIRE)
`remember(content: "<projet> | workflow: fix-bug | type: <quick/complex/escalated> | root cause: <resume> | resultat: <fixed/ongoing>", memory_type: "Learning", tags: ["project:<nom>", "retrospective"], episode_id: "<id>", sequence_number: 9)`
