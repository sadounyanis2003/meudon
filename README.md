# Meudon — Proposition de refonte

Conception et réalisation : **Yanis Sadoun**.

Prototype interactif de site municipal, destiné à la présentation des parcours, de la navigation et de l’identité visuelle. Cette maquette ne remplace pas le site officiel de la Ville de Meudon.

## Consultation

[Ouvrir le prototype](https://sadounyanis2003.github.io/meudon/)

## Publication

Site statique HTML, CSS et JavaScript, sans compilation. GitHub Pages publie la branche `main` depuis la racine du dépôt. Le fichier `.nojekyll` désactive le traitement Jekyll. Les chemins des ressources sont relatifs et la navigation utilise les fragments `#/`.

Pour travailler en local : servir ce dossier avec un serveur HTTP, par exemple `python3 -m http.server 8000`, puis ouvrir son adresse locale. Aucun secret ni service serveur n’est requis.

## Périmètre du prototype

- Recherche locale, annuaire de services, 30 associations, 135 activités et 46 lieux référencés.
- Les événements de démonstration sont fictifs et clairement signalés.
- Les formulaires ne transmettent aucune demande ; les démarches réelles renvoient aux sites officiels.
- Les favoris et préférences sont enregistrés uniquement dans le navigateur.

## Crédits

La conception du prototype est signée Yanis Sadoun. Les photographies, le logo municipal, les données et la police conservent leurs auteurs et licences respectifs. Consulter « Crédits & sources » sur le site et les fichiers JSON de sources dans `assets/`.
