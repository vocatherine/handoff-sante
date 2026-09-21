# Handoff Santé — Connexions réellement utilisées

_Établi par inspection directe du projet le 21/09/2026 — aucune information inventée._

## GitHub

- Dépôt : `vocatherine/handoff-sante` (`https://github.com/vocatherine/handoff-sante.git`)
- Branche : `main`
- Méthode de mise à jour utilisée jusqu'ici : upload manuel des fichiers via l'interface web GitHub ("Add file → Upload files"). Aucun push automatisé n'est configuré/possible depuis cet environnement de travail.
- Contenu du dépôt : `index.html`, dossier `api/` (fonction serverless `claude.js`), icônes PWA (`icon-192.png`, `icon-512.png`, `icon-192-maskable.png`, `icon-512-maskable.png`, `apple-touch-icon.png`, `favicon-32.png`), `manifest.json`, `sw.js` (service worker minimal pour l'installation de l'app).

## Vercel

- Héberge le site statique (`index.html`) et la fonction serverless `api/claude.js` (dossier `/api` détecté automatiquement par Vercel).
- Variable d'environnement configurée côté Vercel : `ANTHROPIC_API_KEY` (clé secrète de l'API Anthropic — jamais présente dans le code source).
- La fonction `api/claude.js` n'accepte que les requêtes POST provenant de `handoffsante.fr` (ou sous-domaines) ou de `*.vercel.app`, avec une limitation de débit (12 appels/minute/IP, best-effort en mémoire).

## Supabase

- URL du projet : `https://uklbkkfbsginkuwmidwc.supabase.co`
- Connexion depuis le front en JavaScript via le client `@supabase/supabase-js` (CDN), avec une clé publique "publishable" (`sb_publishable_...`) — utilisation normale et sans risque : Row Level Security est activée sur toutes les tables, avec des policies ouvertes en lecture/écriture publique (pas de comptes utilisateurs à ce stade).
- Tables : `etablissements`, `services`, `temoignages`, `suggestions`, `avisApp`, `reponses`.
- Modifications de schéma/données effectuées manuellement via l'éditeur SQL de Supabase (copier-coller de scripts `.sql`).

## Autre

- Domaine de production : `handoffsante.fr`
- Adresse de contact affichée sur le site : `contact@handoffsante.fr`
