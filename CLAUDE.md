# Handoff Santé — CLAUDE.md

Application web permettant aux soignants et étudiants en santé de consulter et déposer des témoignages anonymes sur les services hospitaliers/EHPAD où ils ont travaillé (charge de travail, ambiance, maltraitance/harcèlement/racisme, écoute de la direction, rémunération). Focus initial région Auvergne-Rhône-Alpes, extension progressive à toute la France via import FINESS.

Site en production : **handoffsante.fr**

## Architecture

Application web statique **mono-fichier** (SPA), pas de framework front, pas de build step JS/CSS.

- **`escale.html`** — fichier source canonique. C'est LE fichier à éditer.
- **`index.html`** — fichier réellement déployé sur le site, généré à partir de `escale.html` par `build_index.py`. Ne jamais éditer `index.html` à la main : il sera écrasé au prochain build.
- **`build_index.py`** — script qui reconstruit `index.html` depuis `escale.html`. À exécuter après CHAQUE modification de `escale.html`, avant tout déploiement :
  ```
  python3 build_index.py
  ```
  Il affiche `OK <N> chars` en cas de succès.

Tout est dans ce fichier unique : HTML, CSS (dans une balise `<style>`), et JS (dans une balise `<script>`) — routing par hash (`#/...`), rendu manuel (pas de framework), état en variables JS globales.

### Backend / données

- **Supabase** (PostgreSQL) est la base de données, interrogée directement depuis le front en JS via `window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` (client `@supabase/supabase-js` chargé en CDN). Les identifiants (URL + clé publique "publishable") sont en dur dans `escale.html` — c'est volontaire et sans risque : Row Level Security est activée sur toutes les tables, en lecture/écriture publique ouverte (pas de comptes utilisateurs pour l'instant).
- **`migration.sql`** — schéma complet des tables (`etablissements`, `services`, `temoignages`, `suggestions`, `avisApp`, `reponses`) + policies RLS. Référence pour toute modification de schéma.
- **`seed_handoff_sante.sql`** — jeu de données initial (établissements + services de référence).
- Une fonction serverless **Vercel** (`api/claude.js`, dans le dépôt GitHub sous `repo/api/`) sert de passerelle vers l'API Anthropic (résumé IA des témoignages) : la clé `ANTHROPIC_API_KEY` reste côté serveur (variable d'environnement Vercel), jamais exposée au navigateur.

### Recherche

Recherche tolérante (fautes de frappe, ordre des mots, abréviations `st`/`ste`/`ch`/`chu`/`chru`/`hcl`, accents) implémentée via `normSearch()` + `expandAbbrev()` + `matchSearch()` dans `escale.html`. Toute nouvelle fonctionnalité de recherche/filtre doit réutiliser `matchSearch(haystack, query)` plutôt que des comparaisons `.includes()` directes.

## Conventions

- Commentaires en français dans le code, souvent avec la date et le contexte de la demande de Catherine qui a motivé le changement (ex. `// cf. demande de Catherine du 21/09/2026`) — conserver cette pratique, elle sert de journal de décisions.
- Pas de framework, pas de build tool (hors `build_index.py`), pas de `package.json`/`node_modules` dans le dépôt de production.
- Import de données FINESS : les établissements importés depuis le fichier officiel FINESS ont un `id` préfixé `fin-` (ex. `fin-690054770`) ; les autres ont un `id` de type slug (`etab-...`) ou un UUID selon leur lot d'import d'origine. Vérifier les doublons potentiels (même établissement, ids différents) avant tout nouvel import — cas déjà rencontrés plusieurs fois (ex. Saint-Joseph Saint-Luc, Lyon).
- Modifications de données en base : toujours via un script `.sql` explicite, jamais de suppression sans clause `where not exists (...)` de sécurité quand il s'agit de fusionner/nettoyer des doublons.

## Commandes

```bash
# Reconstruire index.html après toute modif de escale.html
python3 build_index.py

# Vérifier la syntaxe JS avant déploiement (extraire le <script> et le charger avec Node)
node -e "new Function(require('fs').readFileSync('<script_extrait.js>','utf8')); console.log('SYNTAX OK')"
```

## Déploiement

- **GitHub** : dépôt `vocatherine/handoff-sante` — déploiement par upload manuel des fichiers via l'interface GitHub ("Add file → Upload files"), pas de push automatisé configuré depuis cet environnement de travail.
- **Vercel** : héberge le site statique + la fonction serverless `api/claude.js`. Variable d'environnement requise côté Vercel : `ANTHROPIC_API_KEY`.
- **Supabase** : base de données de production, modifications de schéma/données via l'éditeur SQL Supabase (copier-coller des scripts `.sql`).

## Emplacement des fichiers importants

| Fichier | Rôle |
|---|---|
| `escale.html` | Source canonique à éditer |
| `index.html` | Build déployé (généré, ne pas éditer) |
| `build_index.py` | Génère `index.html` depuis `escale.html` |
| `migration.sql` | Schéma Supabase (tables + RLS) |
| `seed_handoff_sante.sql` | Données initiales |
| `repo/` | Clone local du dépôt GitHub `vocatherine/handoff-sante` (contient `index.html`, `api/claude.js`, manifest PWA, icônes) |
| `repo/api/claude.js` | Fonction serverless Vercel — passerelle vers l'API Anthropic |
| `finess/` | Fichiers et script d'import des établissements FINESS |
| `migration_export/` | Exports de données par table (étab./services/témoignages) |
