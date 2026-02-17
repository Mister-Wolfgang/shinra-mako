![SHINRA](logo.jpg)

# SHINRA Marketplace v6.1

> *"Le pouvoir n'est rien sans controle."* -- Rufus Shinra

Marketplace de plugins Claude Code -- propulse par la Shinra Electric Power Company.

Architecture multi-repo : chaque Projet est un plugin independant avec son propre repo, versioning et cycle de vie. SHINRA les assemble via git submodules.

## PROJETS

| Projet | Description | Version | Repo |
|--------|-------------|---------|------|
| **MAKO** | Modular Agent Kit for Orchestration -- 13 agents specialises avec personnalites Shinra pour gerer des projets de A a Z | v6.1.0 | [MAKO](https://github.com/Mister-Wolfgang/MAKO) |
| **JENOVA** | *A venir* | -- | -- |

## Installation

```bash
# Ajouter la marketplace SHINRA
/plugin marketplace add git@github.com:Mister-Wolfgang/SHINRA.git

# Installer un plugin
/plugin install MAKO@shinra-marketplace
```

> **Note** : Le repo SHINRA utilise des git submodules. Lors du clone manuel, utilisez `--recurse-submodules` :
> ```bash
> git clone --recurse-submodules git@github.com:Mister-Wolfgang/SHINRA.git
> ```

## Structure

```
SHINRA/
├── .claude-plugin/
│   └── marketplace.json         # Registry des plugins
├── .gitmodules                  # References aux submodules
├── PROJETS/
│   ├── MAKO/                    # git submodule -> github.com/Mister-Wolfgang/MAKO
│   └── JENOVA/                  # (a venir)
├── logo.png
└── README.md
```

## Architecture

Chaque plugin est un **repo Git independant** inclus dans SHINRA via submodule :

- **Versioning independant** -- Chaque plugin a son propre SemVer
- **CI/CD isolee** -- Un push dans MAKO ne declenche que la CI de MAKO
- **Ownership claire** -- Issues et PRs ciblees par plugin
- **Installation selective** -- L'utilisateur installe uniquement ce qu'il veut

### Ajouter un nouveau Projet

```bash
# Dans le repo SHINRA
git submodule add git@github.com:Mister-Wolfgang/<PROJET>.git PROJETS/<PROJET>
# Mettre a jour marketplace.json
# Commit et push
```

## Changelog

### v6.1.0 -- Multi-repo
- Migration vers architecture multi-repo avec git submodules
- `plugins/` renomme en `PROJETS/`
- MAKO extrait dans son propre repo independant

---

*Built with Claude Code + Shinra Electric Power Company*
