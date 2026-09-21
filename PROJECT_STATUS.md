# Handoff Santé — PROJECT_STATUS.md

_Dernière mise à jour : 21/09/2026_

## Ce qui fonctionne

- Site en ligne sur **handoffsante.fr**, connecté à Supabase.
- Annuaire établissements → services, avec recherche tolérante (fautes de frappe, ordre des mots, abréviations, accents).
- Page d'accueil : barre de recherche + menu déroulant établissement → liste de ses services (la grille de vignettes en dessous de la recherche a été retirée, jugée trop chargée).
- Dépôt de témoignage anonyme par service (charge, ambiance, direction, rémunération, maltraitance/harcèlement/racisme).
- Résumé IA des témoignages par service, via la fonction serverless Vercel `api/claude.js` (modèle `claude-haiku-4-5-20251001`).
- Import FINESS des établissements (script `finess/build_finess_import.py`).
- Ajout manuel de services par les utilisateurs quand un établissement existant n'a pas encore son service référencé.
- Base Supabase : 6 tables (`etablissements`, `services`, `temoignages`, `suggestions`, `avisApp`, `reponses`), RLS activée en lecture/écriture publique ouverte.

## Ce qui reste à faire

- **Vérification d'identité des soignants (RPPS)** : pas encore implémentée. C'est un objectif central du projet (garantir que les témoignages viennent de vrais soignants tout en garantissant leur anonymat) — à concevoir.
- **TikTok** : compte pas encore activé/lié (le site affiche un message "arrive bientôt" pour ce réseau).
- **Cagnotte / financement** : mentionnée sur le site comme "arrive bientôt", pas encore en place.
- **Mentions légales / CGU / statut d'hébergeur** : revue juridique à faire.
- **Marque INPI** : dossier de dépôt préparé (`INPI_Dossier_Depot_Marque_Handoff_Sante.docx/.pdf`), à suivre côté publication BOPI et délai d'opposition.
- **SEO / architecture des URLs** : chantier identifié, pas engagé.
- **Extension au-delà de Rhône-Alpes** : le projet vise à terme tous les établissements de France ; l'import FINESS permet cette extension mais nécessite une vigilance continue sur les doublons (voir "Problèmes connus").
- **Renommage de services existants en base** : demande en attente ("on attend"), statut inchangé.
- **Renouvellement du token GitHub** : à prévoir vers le 17/11/2026.

## Décisions prises

- **Architecture mono-fichier** (`escale.html` → build vers `index.html`) conservée délibérément, pas de migration vers un framework prévue à ce stade.
- **Pas de comptes utilisateurs** pour l'instant → RLS Supabase ouverte en lecture/écriture publique sur toutes les tables. À durcir si un vrai système de comptes est introduit un jour (note déjà présente dans `migration.sql`).
- **Grille de vignettes retirée** de la page d'accueil (sous la barre de recherche) : jugée trop chargée visuellement ; remplacée par le seul menu déroulant établissement → services.
- **Recherche tolérante** généralisée à toute l'application (pas seulement pour un établissement signalé en particulier), via une fonction `matchSearch()` centralisée.
- **Clé API Anthropic** gardée côté serveur (fonction Vercel), jamais exposée au navigateur — changement effectué après un premier essai côté client.
- **Modèle IA Haiku** mis à jour le 20/09/2026 : `claude-3-5-haiku-20241022` avait été retiré par Anthropic (erreurs 502), remplacé par `claude-haiku-4-5-20251001`.

## Problèmes connus

- **Doublons d'établissements** : plusieurs cas déjà rencontrés (établissement présent sous deux ou trois identifiants différents, ex. Centre Hospitalier Saint-Joseph Saint-Luc à Lyon — un doublon créé par erreur puis nettoyé, un doublon FINESS légitime fusionné). Rester vigilant à chaque nouvel import ou signalement utilisateur : vérifier avant toute création qu'un établissement n'existe pas déjà sous un autre nom/id.
- **Catalogue de services parfois incomplet** : certains établissements référencés en base ont beaucoup moins de services que la réalité (constaté pour Saint-Joseph Saint-Luc : 12 services en base contre 34 spécialités réelles, corrigé). D'autres établissements sont probablement dans le même cas et n'ont pas encore été vérifiés.
- **`repo/index.html` (clone GitHub local) désynchronisé** : au 21/09/2026, la version dans `repo/` n'a pas encore les derniers changements (retrait de la grille, recherche tolérante) — ces changements existent dans `escale.html`/`index.html` à la racine du répertoire de travail mais n'ont pas encore été re-déployés sur GitHub/Vercel. À uploader manuellement au prochain déploiement.
- **Pas d'accès direct GitHub depuis cet environnement de travail** : toute mise à jour du dépôt `vocatherine/handoff-sante` doit passer par un upload manuel via l'interface GitHub (glisser-déposer), pas de push automatisé possible depuis ici.
