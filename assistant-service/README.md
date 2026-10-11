# Assistant d’orientation — exploitation

Service facultatif du prototype Meudon. Le site reste statique sur GitHub Pages ; ce Worker Cloudflare appelle OpenAI pour choisir des références dans un catalogue contrôlé par le serveur. Il n’effectue aucune démarche et ne fournit pas d’informations municipales en temps réel. En cas d’indisponibilité, l’interface propose la recherche locale.

- Endpoint : `https://meudon-assistant.renault-robotics-collection-observatory.workers.dev/assistant`
- Configuration du navigateur : `../assistant-config.js`, qui contient uniquement l’URL publique.
- Origine autorisée : `https://sadounyanis2003.github.io`, définie par `ALLOWED_ORIGINS` dans `wrangler.jsonc`. Une origine comprend le protocole et le domaine, sans chemin ni barre finale. CORS complète les limites serveur ; il ne constitue pas une authentification.
- Modèle fixé côté serveur : `gpt-6-luna`, raisonnement désactivé, 500 tokens de sortie maximum, aucun outil, aucun nouvel essai automatique.

## Budget et arrêt automatique

**Le plafond est de 10 USD cumulés pour ce prototype, sans réinitialisation mensuelle.** Il inclut une provision conservatrice de **0,05 USD** pour les vérifications réelles précédant le déploiement. Le service dispose donc initialement de 9,95 USD au plus pour les appels suivants.

Le Durable Object SQLite réserve le coût maximal avant chaque appel et conserve la réserve lorsque le résultat facturable est incertain : timeout, interruption ou usage manquant. Une réponse connue permet de restituer uniquement la différence vérifiable. Le calcul utilise des entiers et une majoration du coût d’entrée, y compris pour les écritures de cache. Un modèle, un niveau de service ou un usage hors limites arrête les nouveaux appels.

La réserve survit aux redéploiements. **Ne pas supprimer le namespace, changer le nom de l’objet `meudon-prototype-total-budget-v1`, restaurer une ancienne base ou créer un second déploiement indépendant avec la même enveloppe.** Un renouvellement de clé ne renouvelle pas le budget. Le plafond concerne les appels passant par cette passerelle ; il ne couvre pas un autre usage de la clé.

La clé a été créée avec une validité de 30 jours. Une garde tarifaire désactive les appels à partir du **10 novembre 2026 à 23:59:59 UTC**, ou plus tôt si la clé expire. Avant toute prolongation : vérifier les tarifs, renouveler la clé si nécessaire, contrôler le budget restant et conserver le ledger existant.

## Arrêter le service

Dans `wrangler.jsonc`, passer `vars.ENABLED` à la chaîne `"false"`, puis, depuis la racine du dépôt :

```sh
npm --prefix assistant-service run deploy
```

L’arrêt bloque les nouveaux appels après déploiement ; un appel déjà parti peut se terminer. Le site et sa recherche locale restent utilisables. Réactiver exige `"true"` et un nouveau déploiement, sans remise à zéro du budget.

## Vérifier et mettre à jour

Utiliser une version récente de Node.js 22 avec `node:sqlite`. Depuis la racine du dépôt :

```sh
npm install --prefix assistant-service
node tools/build-assistant-catalog.cjs
node tools/build-assistant-catalog.cjs --check
npm --prefix assistant-service test
npm --prefix assistant-service run check
```

Régénérer le catalogue après une modification des références ou des parcours du site. Le générateur vérifie les destinations et exclut les événements fictifs. Les tests sont hors ligne, avec appels fournisseur simulés. `run check` prépare un déploiement à blanc et ne publie pas le Worker.

Après validation, `npm --prefix assistant-service run deploy` publie le service. Le déploiement nécessite un compte Cloudflare autorisé ; conserver le **plan Workers Free avec stockage SQLite**, sans passage automatique au plan payant. Les quotas gratuits peuvent rendre le service indisponible. [Limites et tarifs des Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Clé, diagnostic et précautions

`OPENAI_API_KEY` doit rester un secret Cloudflare : ne jamais l’ajouter au code public, au catalogue, à une capture ou à un journal. Les fichiers `.env*`, `.dev.vars*` et `.wrangler/` sont exclus du dépôt. Pour une rotation, utiliser le mécanisme de secrets Cloudflare ; `wrangler secret put` déploie immédiatement, tandis que `wrangler versions secret put` prépare une version. [Gestion des secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

`GET /health` indique l’activation de la configuration et la garde temporelle ; il ne mesure pas le solde du ledger et ne réalise aucun appel OpenAI. Le serveur renvoie `budget_exhausted` lorsque l’enveloppe est atteinte ou arrêtée, `rate_limited` pour les limites de fréquence, et `unavailable` pour une indisponibilité. Les limites comprennent 6 requêtes/minute et 60/jour par IP pseudonymisée, ainsi que 60/minute et 1 000/jour pour l’ensemble du prototype. Les requêtes du navigateur sont bornées à 16 Kio, avec 600 caractères pour la demande et quatre tours d’historique maximum.

Les journaux applicatifs Cloudflare sont désactivés dans la configuration. Le registre budgétaire conserve les réservations et les compteurs nécessaires ; il ne conserve pas les conversations. Le navigateur garde l’échange en mémoire pendant la consultation, et l’appel OpenAI utilise `store: false`.
