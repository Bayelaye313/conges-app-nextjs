# Registre des Congés — campagne des vœux

Application Next.js 15 de collecte des vœux de congé des agents de terrain, avec un espace
d'administration (matricule 0568) pour suivre, valider, supprimer et exporter les vœux.

## Règles appliquées

| Règle | Détail |
|---|---|
| Acquisition | 2 jours par mois, mois d'embauche compris (règle du tableau RH, vérifiée sur les 206 agents). Le solde gagne +2 jours le 1er de chaque mois. |
| Solde au départ | Le solde est recalculé **à la date de départ** du vœu : un agent à 6 jours aujourd'hui peut demander 11 jours dans 3 mois. Les vœux déjà déposés sont déduits, dans l'ordre chronologique. |
| Décompte | Les dimanches et jours fériés ne sont pas décomptés (`lib/calendrier.ts`). |
| Minimum | 11 jours décomptés par vœu, départ le 1er ou le 16 du mois, en 1 partie (continue) ou 2 parties (1–15 et 16–fin). |
| Ancienneté | Premier congé possible à partir de la date anniversaire d'entrée (12 mois). |
| Délai | 12 mois entre la date de retour d'un congé et le départ du suivant. |
| Plafonds | Par quinzaine (1–15, 16–fin), on compte les agents absents au moins un jour : 20 AV, 3 CEV, CS sans plafond. Les vœux en attente occupent déjà une place ; une suppression la libère. |
| Congés 2026 | Repris de l'ancien suivi, ils comptent pour le délai, les chevauchements et les plafonds, mais ne sont pas re-débités (déjà dans le cumul « jours pris »). |

⚠ Les dates des fêtes musulmanes (Korité, Tabaski, Tamkharit, Magal, Maouloud) sont des
**estimations** dans `lib/calendrier.ts` : les corriger dès la publication du calendrier
officiel, puis redéployer.

## Espaces

- **Agent** : solde et évolution mois par mois, premier départ possible, places restantes par
  quinzaine, dépôt d'un vœu avec vérification préalable, annulation d'un vœu en attente.
- **Admin (0568)** : KPIs (taux de soumission global et par rôle, vœux en attente / validés /
  supprimés, agents sans vœu, moins d'un an, soldes faibles, agents connectés), liste des vœux
  avec validation (unitaire ou en lot) et suppression motivée, liste des agents sans vœu avec
  la date à laquelle leur solde atteint 11 jours, occupation par quinzaine et par rôle,
  génération d'un nouveau code pour un agent, exports CSV (vœux, agents) et sauvegarde JSON.

## Préparation (sur votre poste)

```bash
npm install
npm run importer:agents -- data/import/agents.tsv
npm run importer:conges -- data/import/conges-2026.tsv --ignorer-inconnus   # retour = jour de reprise
npm run codes:generer -- --admin 0568 --nom "Prénom Nom"                      # code admin
npm run codes:generer                                                         # codes de tous les agents
```

Les codes provisoires sont écrits dans `data/import/codes-provisoires-*.csv` : les distribuer,
puis **supprimer le fichier**. Chaque titulaire choisit son code à la première connexion.

## Déploiement sur Netlify

Le disque de Netlify n'est pas persistant : en production, le registre est stocké dans
**Netlify Blobs** (écritures conditionnelles, aucune soumission ne peut en écraser une autre).

1. Pousser le projet sur GitHub/GitLab (le dossier `data/` est exclu par `.gitignore`), puis
   « Add new site → Import an existing project ». `netlify.toml` (à la racine) indique le
   dossier `conges-app`.
2. Variables d'environnement du site :
   - `SESSION_SECRET` : `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `CONGES_STOCKAGE` = `blobs`
3. Déployer, puis envoyer le registre préparé localement :
   ```bash
   export NETLIFY_SITE_ID=...      # Site configuration → Site details → Site ID
   export NETLIFY_AUTH_TOKEN=...   # User settings → Applications → Personal access tokens
   npm run registre:publier
   ```
   À partir de là, tout se fait dans l'application (l'admin génère les codes oubliés).
4. Fin de campagne : exporter depuis l'espace admin, et/ou `npm run registre:recuperer`.

Pour un serveur classique (VPS) : `npm run build && npm start` avec `SESSION_SECRET` défini,
derrière un proxy HTTPS ; le registre reste alors dans `data/registre.json` (une seule
instance, sauvegardes à prévoir).

## Sécurité

- Session par cookie signé (HMAC, `httpOnly`, `Secure`, 8 h) ; le serveur n'accepte jamais un
  matricule envoyé par le navigateur. Comptes agent et admin strictement cloisonnés.
- Codes hachés (scrypt), code provisoire à changer à la 1ʳᵉ connexion, changement de code =
  déconnexion des autres sessions. 5 échecs → blocage 15 min (compteur persistant).
- Entrées validées (zod), POST en JSON uniquement, en-têtes CSP/HSTS, exports CSV protégés
  contre l'injection de formules Excel, sauvegarde JSON sans les empreintes de codes.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Développement (stockage fichier) |
| `npm test` | 37 tests : règles, calendrier, plafonds, solde projeté, sessions, concurrence |
| `npm run lint` / `npm run typecheck` | Qualité du code |
| `npm run registre:publier` / `registre:recuperer` | Transfert local ↔ Netlify |

## Avertissement juridique

Le contenu de `/legal` est informatif ; il ne remplace pas la loi n°97-17 du 1er décembre 1997
portant Code du travail, ses décrets d'application, ni la convention collective applicable.
