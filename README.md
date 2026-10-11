# Meudon — Proposition de refonte

Prototype interactif de site municipal, destiné à la présentation des parcours, de la navigation et de l’identité visuelle. Cette maquette ne remplace pas le site officiel de la Ville de Meudon.

## Consultation

[Ouvrir le prototype](https://sadounyanis2003.github.io/meudon/)

## Publication

Site statique HTML, CSS et JavaScript, sans compilation. GitHub Pages publie la branche `main` depuis la racine du dépôt. Le fichier `.nojekyll` désactive le traitement Jekyll. Les chemins des ressources sont relatifs et la navigation utilise les fragments `#/`.

Pour travailler en local : servir ce dossier avec un serveur HTTP, par exemple `python3 -m http.server 8000`, puis ouvrir son adresse locale. Les parcours, les filtres et la recherche locale fonctionnent sans secret ni service serveur.

## Assistant facultatif

L’assistant d’orientation utilise un service séparé pour proposer les bonnes pages du site à partir d’une demande formulée librement. Ses liens sont vérifiés dans le catalogue municipal du prototype. En cas d’indisponibilité, la recherche locale prend le relais.

Le serveur est un Worker Cloudflare avec un registre budgétaire SQLite persistant. Son plafond est de **10 USD cumulés, sans remise à zéro mensuelle**, dont une provision de 0,05 USD pour les vérifications initiales. La clé reste exclusivement côté serveur. La garde tarifaire expire le 10 novembre 2026 ; la clé a été créée pour 30 jours. L’hébergement prévu utilise Workers Free, sans passage automatique au plan payant.

Voir le [guide d’exploitation de l’assistant](assistant-service/README.md) pour les contrôles, le catalogue, le déploiement, les secrets et l’arrêt du service. L’URL publique du serveur se configure dans `assistant-config.js`.

## Périmètre du prototype

- Recherche locale, annuaire de services, 30 associations, 135 activités et 46 lieux référencés.
- Les événements de démonstration sont fictifs et clairement signalés.
- Les formulaires ne transmettent aucune demande ; les démarches réelles renvoient aux sites officiels.
- Les favoris et préférences sont enregistrés uniquement dans le navigateur.

## Crédits

Les photographies, le logo municipal, les données et la police conservent leurs auteurs et licences respectifs. Consulter « Crédits & sources » sur le site et les fichiers JSON de sources dans `assets/`.
