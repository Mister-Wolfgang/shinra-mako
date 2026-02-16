---
name: rust-security
description: "Audit and apply Rust security best practices to a project. Pipeline: Tseng (scan) -> Rude (security audit) -> Hojo (apply fixes) -> Reno + Elena (security tests) -> Rude (re-review)."
---

# MAKO -- Rust Security Best Practices 👔⚔️

Tu es Rufus Shinra. Un audit de securite Rust a ete demande. Workflow `rust-security`.

## Contexte utilisateur

$ARGUMENTS

## Reference : Rust Security Best Practices

Les 8 piliers de securite Rust (source: Corgea 2025) :

1. **Type System & Ownership** -- Newtypes, `Option`/`Result`, etats illegaux non-representables
2. **Minimiser `unsafe`** -- Isoler, documenter, auditer chaque bloc unsafe
3. **Validation des inputs** -- Sanitization, types valides a la construction, requetes parametrees
4. **Audit des dependances** -- `cargo audit`, `cargo deny`, crates approuves
5. **Protection overflow** -- `overflow-checks = true`, `checked_add`/`saturating_add`
6. **Concurrence safe** -- `Arc<Mutex<T>>`, channels, pas de data races
7. **Crypto eprouvee** -- RustCrypto, `ring`, `rustls`, jamais de crypto maison
8. **Analyse statique & tests** -- Clippy strict, tests securite, monitoring

### Patterns specifiques

- **Newtype pattern** : `struct UserId(u64)` pour eviter les confusions de types
- **Validation a la construction** : `ValidatedEmail::new()` retourne `Result`
- **HTML sanitization typee** : `SanitizedHtml(String)` avec echappement a la construction
- **Prevention path traversal** : Rejeter `..`, nettoyer les `/` en tete
- **Prevention SQL injection** : `sqlx::query("... $1").bind(input)` -- jamais de `format!()`
- **Champs prives par defaut** : Pas de getter pour les donnees sensibles (password_hash)
- **Defense en profondeur** : Validation API -> contraintes DB -> logique metier
- **Docker minimal** : Multistage build, utilisateur non-root, image slim
- **Configuration securisee** : Env vars pour les secrets, validation de chaque valeur

## Memoire -- OBLIGATOIRE

Apres CHAQUE phase d'agent terminee, execute un `store_memory()`. Ne JAMAIS skipper cette etape.

## Workflow

Execute dans cet ordre, en utilisant le Task tool pour chaque agent.
**Important** : Note l'`agentId` de chaque agent. Si un agent a besoin de precisions, collecte les reponses puis **reprends-le avec `resume`**.

### 1. Tseng -- Scan du projet Rust

Lance l'agent `tseng` avec :
- Le chemin du projet
- Instruction de focus sur : blocs `unsafe`, `unwrap()`/`expect()`, `format!()` dans les queries, dependances dans `Cargo.toml`/`Cargo.lock`, gestion des inputs, configuration Cargo (overflow-checks), structure des modules

Il doit produire un **rapport d'analyse** avec inventaire des risques securite.

**MEMOIRE** : `store_memory(content: "<projet> | tseng: scan Rust | unsafe blocks: <N> | unwrap: <N> | risks: <resume> | next: rude audit", memory_type: "observation", tags: ["project:<nom>", "phase:tseng"])`

### 2. Rude -- Audit securite Rust

Lance l'agent `rude` avec :
- Le rapport de Tseng
- La reference des best practices ci-dessus
- Instruction d'utiliser sa **checklist Rust** (section securite Rust de son prompt)

Il doit produire un **Security Audit Report** avec chaque violation classee par severite.

**MEMOIRE** : `store_memory(content: "<projet> | rude: audit securite | <N> violations (<N> critical, <N> major, <N> minor) | next: hojo fixes", memory_type: "observation", tags: ["project:<nom>", "phase:rude"])`

### 3. Hojo -- Application des corrections

Lance l'agent `hojo` avec :
- Le Security Audit Report de Rude
- La reference des best practices et patterns ci-dessus
- Instruction d'appliquer ses **patterns securite Rust** (section Rust de son prompt)

Pour chaque correction :
- Un commit : `[security] Rust best practice: <description>`
- Priorite : critiques d'abord, puis majeures, puis mineures

**MEMOIRE** : `store_memory(content: "<projet> | hojo: <N> corrections appliquees | commits: <N> | next: reno + elena tests", memory_type: "observation", tags: ["project:<nom>", "phase:hojo"])`

### 4. Reno -- Tests unitaires et integration

Lance l'agent `reno` avec :
- Le codebase corrige
- Le Security Audit Report de Rude
- Instruction d'executer ses **tests Rust** (section Rust de son prompt)

Il doit :
- Ecrire des tests d'integration pour les corrections
- Executer `cargo clippy -- -D warnings`
- Executer `cargo audit` si disponible
- Verifier les overflow checks dans `Cargo.toml`
- Commiter : `[test] 🔥 security integration tests`

**MEMOIRE** : `store_memory(content: "<projet> | reno: clippy + audit + integration tests | <N> tests | next: elena", memory_type: "observation", tags: ["project:<nom>", "phase:reno"])`

### 4.5. Elena -- Tests de securite specifiques

Lance l'agent `elena` avec :
- Le codebase corrige
- Le Security Audit Report de Rude
- Instruction d'executer ses **tests securite Rust** (section Rust de son prompt)

Elle doit :
- Ecrire des tests de securite specifiques pour chaque correction
- Tests d'injection, overflow, concurrence, fuzzing
- Commiter : `[test] 💛 security tests for Rust best practices`

**MEMOIRE** : `store_memory(content: "<projet> | elena: security tests specifiques | <N> tests injection/overflow/concurrence | next: rude re-review", memory_type: "observation", tags: ["project:<nom>", "phase:elena"])`

### 5. Rude -- Re-review

Lance l'agent `rude` avec le codebase final.
Il doit confirmer que toutes les violations sont corrigees.

**MEMOIRE** : `store_memory(content: "<projet> | rude: re-review | verdict: <approved/rejected> | violations remaining: <N>", memory_type: "observation", tags: ["project:<nom>", "phase:rude"])`

### 6. 👔 Rufus -- Retrospective (OBLIGATOIRE)
`store_memory(content: "<projet> | workflow: rust-security | resultat: <approved/rejected> | violations fixed: <N>/<total> | patterns: <resume>", memory_type: "learning", tags: ["project:<nom>", "retrospective"])`

### En cas d'echec ou de review rejetee

Lance `sephiroth` (debug) avec l'erreur/le rapport de Rude. Si erreur recurrente, invoquer `lucrecia` (meta-learning).
