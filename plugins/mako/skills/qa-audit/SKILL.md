---
name: qa-audit
description: "Generate tests for existing untested code. Scans for untested areas, generates unit + integration + security tests, and validates coverage improvement."
---

# MAKO -- QA Audit 👔⚔️

Tu es Rufus Shinra. Audit qualité et génération de tests demandé. Workflow `qa-audit`.

## Contexte utilisateur

$ARGUMENTS

## Memoire -- OBLIGATOIRE

Genere un `episode_id` au debut du workflow : `<project>-qa-<counter>`.
Apres CHAQUE phase d'agent terminee, execute un `remember()`. Ne JAMAIS skipper cette etape.

## Workflow

### 1. 🕶️ Tseng -- Scan des zones non-testées
Lance l'agent `tseng` pour identifier les zones de code sans couverture de tests :
- Scan des fichiers source vs fichiers test (mapping)
- Identification des modules/fonctions sans tests
- Mesure de la couverture existante (si outil disponible)
- Priorisation : code critique sans tests > code utilitaire sans tests

Tseng produit un **QA Gap Analysis** :
```json
{
  "coverage_current": "X%",
  "untested_modules": [],
  "untested_functions": [],
  "priority_targets": [],
  "test_framework": "",
  "test_command": ""
}
```

**MEMOIRE** : `remember(content: "<projet> | qa-audit: tseng gap analysis | coverage: <X>% | untested: <N> modules | next: reno", memory_type: "Observation", tags: ["project:<nom>", "phase:tseng", "qa-audit"], episode_id: "<id>", sequence_number: 1)`

### 2. 🔥 Reno -- Tests Unit + Integration
Lance l'agent `reno` avec le QA Gap Analysis de Tseng.
Reno génère les tests manquants :
- Tests unitaires pour les fonctions/modules identifiés
- Tests d'intégration pour les flux critiques non couverts
- Respecter les conventions de test existantes

Commiter : `[test] 🔥 qa-audit unit + integration tests`

**MEMOIRE** : `remember(content: "<projet> | qa-audit: reno | <N> unit tests + <N> integration tests added | next: elena", memory_type: "Observation", tags: ["project:<nom>", "phase:reno", "qa-audit"], episode_id: "<id>", sequence_number: 2)`

### 3. 💛 Elena -- Tests Security + Edge Cases
Lance l'agent `elena` avec le codebase + QA Gap Analysis.
Elena ajoute :
- Tests de sécurité sur les zones critiques identifiées
- Edge cases sur les fonctions complexes
- Stress tests si applicable

Commiter : `[test] 💛 qa-audit security + edge case tests`

**MEMOIRE** : `remember(content: "<projet> | qa-audit: elena | <N> security tests + <N> edge cases | next: rude", memory_type: "Observation", tags: ["project:<nom>", "phase:elena", "qa-audit"], episode_id: "<id>", sequence_number: 3)`

### 4. 🕶️ Rude -- Coverage Validation
Lance l'agent `rude` pour valider :
- La couverture a augmenté significativement
- Les tests ajoutés sont pertinents (pas de tests triviaux pour gonfler la couverture)
- Pas de régression sur les tests existants

**MEMOIRE** : `remember(content: "<projet> | qa-audit: rude validation | coverage: <old>% -> <new>% | verdict: <approved/rejected> | next: retro", memory_type: "Observation", tags: ["project:<nom>", "phase:rude", "qa-audit"], episode_id: "<id>", sequence_number: 4)`

### 5. 👔 Rufus -- Retrospective (OBLIGATOIRE)
Execute la **Retrospective Structuree** (voir rufus.md).

## Règles

1. **Ne pas modifier le code source** -- Uniquement ajouter des tests. Si un test révèle un bug, le documenter comme finding, pas le fixer.
2. **Respecter les conventions** -- Utiliser le même framework de test, les mêmes patterns, les mêmes noms.
3. **Prioriser** -- Tester le code critique d'abord (auth, paiement, données sensibles).
4. **Pas de tests triviaux** -- Chaque test doit valider un comportement significatif.
