![SHINRA -- MAKO](logo.png)

# SHINRA -- MAKO (Modular Agent Kit for Orchestration) v5.0

> *"Le pouvoir n'est rien sans controle."* -- Rufus Shinra

Plugin Claude Code -- systeme multi-agents incarne par le personnel de la Shinra Electric Power Company. Concu pour un dev solo qui veut la puissance d'une equipe complete.

## Agents

| Agent | Personnage | Role | Modele |
|-------|-----------|------|--------|
| Rufus Shinra | President Shinra | **Orchestrateur** -- commande, delegue, coordonne | -- |
| Tseng | Chef des Turks | **Analyzer** -- scanne les projets existants, produit `project-context.md` | Sonnet |
| Scarlet | Dir. Armement Avance | **Discovery** -- comprend les besoins, selectionne la quality tier | Sonnet |
| Genesis | SOLDAT 1ere Classe | **UX/Design Lead** -- concoit interfaces, user flows, design systems | Sonnet |
| Reeve | Ingenieur Shinra | **Architect** -- concoit l'architecture, decompose en Epics/Stories, ADRs | Sonnet |
| Heidegger | Dir. Securite Publique | **Scaffold** -- cree la structure, adapte a la quality tier | Haiku |
| Lazard | Directeur du SOLDAT | **DevOps/CI-CD** -- pipelines, Docker, monitoring, infra | Haiku |
| Hojo | Chef Dept. Science | **Implementor** -- code les features en TDD (Red->Green->Refactor) | Opus |
| Reno | Turk | **Tester** -- tests unitaires et integration, rapide et large | Sonnet |
| Elena | Turk (rookie) | **Tester** -- securite, edge cases, stress tests | Sonnet |
| Palmer | Dir. Programme Spatial | **Documenter** -- genere la doc, adaptee a la quality tier, commandes continues | Sonnet |
| Rude | Turk | **Reviewer** -- review adversarial + validation de specs (dual-mode) | Sonnet |
| Sephiroth | L'Ange Unique | **Debugger** -- auto-correction, meta-learning, soumet des PRs upstream. **VERROUILLE** | Opus |

### Sephiroth -- VERROUILLE

Sephiroth est dormant par defaut. Il ne s'active que si :
- Un agent echoue 2+ fois
- Rude rejette + le fix echoue
- Bug complexe explicite
- Modification du plugin MAKO

### Duo Reno/Elena

Les tests sont repartis en duo complementaire :
- **Reno** ratisse large et vite (unit + integration)
- **Elena** creuse en profondeur (securite + edge cases + stress)

## Installation

```bash
/plugin marketplace add git@github.com:Mister-Wolfgang/shinra-mako.git
/plugin install mako@shinra-marketplace
```

## Utilisation

Parlez directement a Rufus -- il analyse votre demande et delegue automatiquement aux agents concernes.

### Slash Commands

| Commande | Pipeline | Usage |
|----------|----------|-------|
| `/mako:create-project` | [Brainstorm] -> Scarlet -> [Rude spec-validation] -> [Genesis UX] -> Reeve -> [Alignment Gate] -> [Story Enrichment] -> Heidegger -> [Lazard DevOps] -> Hojo (TDD) -> Reno -> Elena -> Palmer -> Rude -> [DoD Gate] -> [Retro] | Nouveau projet from scratch |
| `/mako:modify-project` | Tseng -> [Brainstorm] -> Scarlet -> [Rude spec-validation] -> Reeve -> [Alignment Gate] -> [Story Enrichment] -> Hojo (TDD) -> Reno -> Elena -> Rude -> [DoD Gate] -> [Retro] | Modifier un projet existant |
| `/mako:add-feature` | Tseng -> [Brainstorm] -> Scarlet (stories) -> [Story Enrichment] -> Hojo (TDD) -> Reno -> Elena -> Rude -> [DoD Gate] -> [Retro] | Ajouter une feature |
| `/mako:fix-bug` | Quick Fix + **auto-escalation** -> Tseng -> Sephiroth -> Hojo -> Reno + Elena -> Rude | Corriger un bug |
| `/mako:refactor` | Tseng -> [Brainstorm] -> Reeve (stories) -> [Alignment Gate] -> [Story Enrichment] -> Hojo (TDD) -> Reno -> Elena -> Rude -> [DoD Gate] -> [Retro] | Restructurer le code |
| `/mako:correct-course` | Tseng -> SCP -> Rufus (3 options) -> User -> Adjust/Rollback/Re-plan | Correction mid-implementation |
| `/mako:brainstorm` | Perspectives paralleles -> Debat cible -> [Party Mode] -> Spec validee | Brainstorming structure |
| `/mako:onboard` | Tseng (deep scan) -> Reeve (recovery) -> Palmer (docs) -> Sprint init | Onboarding projet brownfield |
| `/mako:qa-audit` | Tseng (scan) -> Reno (unit+integ) -> Elena (security+edge) -> Rude (coverage) | Audit QA + generation tests |
| `/mako:rust-security` | Tseng -> Rude (audit) -> Hojo (fix) -> Reno + Elena (tests) -> Rude | Audit securite Rust |

### Exemples

```
"Cree un jeu de snake en Python avec pygame"
"Ajoute le multiplayer en ligne"
"Le snake traverse les murs au lieu de mourir, corrige ca"
"Separe la logique du rendu"
```

## Features v5.0

### Alignment Gate (v5.0)

Remplace le Readiness Gate avec 3 couches de validation et scoring /10 :
1. **Spec -> Architecture** : Features de Scarlet couvrent les stories de Reeve ?
2. **Architecture interne** : Data model, API, contraintes, dependances ?
3. **Architecture -> Stories** : Chaque module a une story ? ACs coherents ? Complexite realiste ?

PASS (10/10) | CONCERNS (7-9) | FAIL (<7)

### Spec Validation Adversariale (v5.0)

Rude valide le spec de Scarlet AVANT Reeve. 5 criteres : completeness, consistency, feasibility, ambiguity, missing pieces. Minimum 3 findings.

### Story Enrichment (v5.0)

Avant Hojo, Rufus enrichit chaque story : query memoire (learnings passes), contexte repo via Tseng (git log, fichiers actifs, conflits potentiels), checklist disaster prevention.

### Sprint Status Tracking (v5.0)

`sprint-status.yaml` au root du projet avec state machine : backlog -> ready-for-dev -> in-progress -> review -> done.

### Definition of Done Gate (v5.0)

5 categories adaptees au quality tier : Code, Tests (coverage 50-90% selon tier), Review, Docs, Regression.

### Architecture Decision Records (v5.0)

Reeve documente chaque choix technique avec alternatives dans des ADRs. Palmer les genere en `/docs/adr/` pour Comprehensive+.

### Review Quota (v5.0)

Rude doit produire entre 3 et 15 findings par review. Zero = halt automatique.

### Retrospective Structuree (v5.0)

6 etapes : Collect -> Patterns cross-stories -> What Went Well -> What Went Wrong -> Action Items SMART -> Store en memoire.

### Scale-Adaptive Routing (v5.0)

| Scale | Stories | Adaptations |
|-------|---------|-------------|
| Micro | < 3 | Skip brainstorm, skip Palmer, Rude optionnel |
| Standard | 3-10 | Pipeline complet (defaut) |
| Large | 10-25 | Brainstorm obligatoire, checkpoints toutes les 3 stories |
| Epic | 25+ | Split en sub-workflows, user checkpoint entre chaque |

### Elicitation Library (v5.0)

50 techniques d'elicitation en 10 categories pour Scarlet : Core, Collaboration, Adversarial, Creative, User-Centric, Prioritization, Risk, Technical, Advanced Reasoning, Retrospective.

### UX/Design Lead (v5.0)

Genesis concoit les interfaces pour projets user-facing : user flows, wireframes textuels, design system, responsive strategy, accessibilite WCAG AA.

### DevOps/CI-CD (v5.0)

Lazard configure CI/CD, Docker, monitoring adapte au quality tier. Skip pour Essential, full pipeline pour Production-Ready.

### Brownfield Onboarding (v5.0)

`/mako:onboard` -- Tseng deep scan (git history, hotspots, integrations) -> Reeve architecture recovery -> Palmer docs -> Sprint init.

### QA Audit (v5.0)

`/mako:qa-audit` -- Generer des tests sur du code existant non-teste. Tseng scan -> Reno unit+integ -> Elena security -> Rude coverage validation.

### Sprint Change Proposal (v5.0)

`/mako:correct-course` formalise avec SCP : root cause classification, impact analysis, scope routing (minor/major/architectural).

### Party Mode Brainstorm (v5.0)

Phase optionnelle de cross-challenge : chaque agent identifie 1 faiblesse d'un autre + 1 alternative. User tranche.

### Palmer Commandes Continues (v5.0)

4 commandes hors-workflow : `GENERATE: mermaid`, `VALIDATE: document`, `UPDATE: changelog`, `GENERATE: api-docs`.

### Pre-Discovery Research (v5.0)

Scarlet en mode research-first pour domaines inconnus : WebSearch competitors, landscape technique, patterns du domaine.

### TDD Protocol

Hojo implemente chaque story en TDD : test d'abord (Red), code minimal (Green), refactor. Reno complete avec tests d'integration, Elena avec securite et edge cases -- sans duplication.

### Epic/Story Decomposition

Reeve decompose chaque projet en Epics -> Stories avec criteres d'acceptation Given/When/Then, dependances explicites et estimation de complexite. Hojo implemente story par story.

### Quality Tiers

Scarlet propose 4 niveaux de qualite qui se propagent a travers tous les agents :

| Tier | Scaffold | Tests | Documentation |
|------|----------|-------|---------------|
| **Essential** | Structure + deps + linter | Unitaires + integration basique | README minimal |
| **Standard** | + CI + pre-commit hooks | + Edge cases + error scenarios | + Features + API docs |
| **Comprehensive** | + Dockerfile + coverage | + E2E + load tests basiques | + docs/ folder + CONTRIBUTING + ADRs |
| **Production-Ready** | + Docker multistage + deploy + monitoring | + Security audit + chaos tests | + Runbooks + ADRs + CHANGELOG |

### Scope Escalation

Dans `fix-bug`, si Hojo detecte une complexite inattendue (3+ fichiers modifies, decisions d'architecture necessaires), le quick fix est automatiquement promu en pipeline complet avec review de Rude.

### Project Context

Tseng produit `project-context.md` a la racine de chaque projet : tech stack, structure, conventions, decisions d'architecture, contraintes. Source de verite pour tous les agents.

### Auto-Amelioration via PR

Sephiroth ne se contente pas de corriger les erreurs -- il modifie les prompts des agents pour empecher la recurrence, puis soumet une **Pull Request** au repo upstream.

## Memoire Persistante (mcp-memory-service)

MAKO integre **mcp-memory-service** -- service Python avec SQLite-Vec pour la memoire semantique persistante.

- Recherche hybride BM25 + Vector pour des resultats precis
- Knowledge graph avec visualisation D3.js (dashboard localhost:8000)
- Stockage local dans `~/.shinra/` (SQLite)
- Hook de demarrage automatique avec validation d'installation
- Seul Rufus touche la memoire -- les subagents n'y ont pas acces

## Structure

```
shinra-mako/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/mako/
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── agents/               # 12 agents Shinra (.md avec frontmatter)
│   │   ├── elena.md          # Security + Edge Case Testing
│   │   ├── genesis.md        # UX/Design Lead (v5.0)
│   │   ├── heidegger.md      # Scaffold (tier-adapted)
│   │   ├── hojo.md           # Implementor (TDD)
│   │   ├── lazard.md         # DevOps/CI-CD (v5.0)
│   │   ├── palmer.md         # Documentation (tier-adapted) + Commandes continues
│   │   ├── reeve.md          # Architecture + Stories + ADRs
│   │   ├── reno.md           # Unit + Integration Testing
│   │   ├── rude.md           # Adversarial Review + Spec Validation
│   │   ├── scarlet.md        # Discovery + Quality Tier + Elicitation + UX + Research
│   │   ├── sephiroth.md      # Debugger + Meta-learning + PR upstream (LOCKED)
│   │   └── tseng.md          # Analyzer + Deep Scan + project-context.md
│   ├── context/              # Orchestrateur + references
│   │   ├── rufus.md          # Rufus prompt principal
│   │   ├── rufus-memory-guide.md
│   │   └── elicitation-library.md  # 50 techniques d'elicitation (v5.0)
│   ├── hooks/                # Event hooks
│   │   ├── ensure-memory-server.js
│   │   ├── inject-rufus.js
│   │   ├── pre-commit-check.js
│   │   └── hooks.json
│   ├── skills/               # 10 Slash commands
│   │   ├── add-feature/
│   │   ├── brainstorm/
│   │   ├── correct-course/
│   │   ├── create-project/
│   │   ├── fix-bug/
│   │   ├── modify-project/
│   │   ├── onboard/          # Brownfield onboarding (v5.0)
│   │   ├── qa-audit/         # QA test generation (v5.0)
│   │   ├── refactor/
│   │   └── rust-security/
├── logo.png
└── README.md
```

## Git Conventions

| Prefix | Agent | Description |
|--------|-------|-------------|
| `[scaffold]` | Heidegger | Structure initiale |
| `[impl] story: <ST-ID>` | Hojo | Implementation TDD par story |
| `[test]` | Reno | Tests unit + integration |
| `[test]` | Elena | Tests securite + edge cases |
| `[design]` | Genesis | Design UX |
| `[devops]` | Lazard | CI/CD et infrastructure |
| `[doc]` | Palmer | Documentation |
| `[fix]` | Hojo | Correction de bug |
| `[refactor]` | Hojo | Restructuration |
| `[meta]` | Sephiroth | Modification de prompt agent (branche + PR) |

## Changelog

### v5.0.0 -- "Reunion Protocol"
- **12 agents** (ajout Genesis UX/Design Lead + Lazard DevOps/CI-CD)
- **10 skills** (ajout `/mako:onboard` + `/mako:qa-audit`)
- Alignment Gate 3 couches (remplace Readiness Gate)
- Spec Validation adversariale (Rude dual-mode)
- Story Enrichment pre-dev (memoire + Tseng + disaster prevention)
- Sprint Status Tracking (`sprint-status.yaml` state machine)
- Definition of Done Gate (5 categories, coverage par tier)
- ADRs dans Reeve + generation Palmer
- Review Quota 3-15 findings
- Retrospective structuree 6 etapes + SMART actions
- Scale-Adaptive Routing (Micro/Standard/Large/Epic)
- Elicitation Library (50 techniques, 10 categories)
- UX Considerations pour projets user-facing
- Sprint Change Proposal (SCP) formalise
- Party Mode brainstorm (cross-challenge optionnel)
- Palmer commandes continues (mermaid, validate, changelog, api-docs)
- Pre-Discovery Research mode pour Scarlet

### v4.1.0
- Quality Tiers (Essential/Standard/Comprehensive/Production-Ready)
- Tier-adapted agents (Heidegger, Palmer, Reno, Elena)
- Manifests version synchronization

### v4.0.0
- Migration memoire SHODH -> mcp-memory-service (SQLite-Vec)
- Dashboard web pour knowledge graph

### v3.0.0
- Systeme multi-agents initial (10 agents)
- TDD Protocol, Epic/Story Decomposition
- Adversarial Review, Scope Escalation
- Memoire SHODH

---

*Built with Claude Code + Shinra Electric Power Company*
