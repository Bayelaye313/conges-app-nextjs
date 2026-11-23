# Registre des Congés — campagne des vœux

Application Next.js 15 de collecte des vœux de congé des agents de terrain, avec un espace
d'administration (matricule 0568) pour suivre, valider, supprimer et exporter les vœux.

## Règles appliquées

| Règle | Détail |
|---|---|
| Acquisition | 2 jours par mois, mois d'embauche compris (règle du tableau RH, vérifiée sur les 206 agents). Le solde gagne +2 jours le 1er de chaque mois. |
| Solde au départ | Le solde est recalculé **à la date de départ** du vœu : un agent à 6 jours aujourd'hui peut demander 11 jours dans 3 mois. Les vœux déjà déposés sont déduits, dans l'ordre chronologique. |
| Décompte | Les dimanches et jours fériés sénégalais ne sont pas décomptés (`lib/calendrier.ts`). |
| Minimum | Congés : 11 jours décomptés par demande, en 1 période continue ou en 2 périodes distinctes (11 jours au total). Récupérations : aucun minimum de jours et aucun délai de 12 mois par rapport aux congés. Dans les deux cas, départ le 1er ou le 16 du mois et solde vérifié à chaque départ. |
| Déduction | Seuls les jours posés hors dimanches et jours fériés sont déduits du solde ; l'aperçu détaille jours d'absence, dimanches, fériés et solde avant/après. |
| Grandes fêtes | Sur une même année, un agent ne peut pas être en congé pour la Korité **et** la Tabaski, ni pour le Grand Magal de Touba **et** le Gamou (Maouloud) (congés repris, vœux actifs et nouveau vœu confondus). Les dimanches et fériés collés à une période comptent comme absence. |
| Ancienneté | Premier congé possible à partir de la date anniversaire d'entrée (12 mois). |
| Délai | 12 mois entre la date de retour d'un congé et le départ du suivant. |
| Plafonds | On limite les absents simultanés par jour : agents de vente à 9 du 1er au 15 janvier 2027, puis 16 ; chefs d'équipe à 3 ; chefs de secteur sans plafond. Les vœux en attente et validés comptent dans le planning par quinzaine, les demandes supprimées et l'historique importé n'y comptent pas. |
| Congés 2026 | Repris de l'ancien suivi, ils comptent pour le délai, les chevauchements et la vérification des plafonds à la soumission, mais ne sont pas re-débités (déjà dans le cumul « jours pris »). |

⚠ Les dates des fêtes musulmanes (Korité, Tabaski, Tamkharit, Magal, Maouloud) sont des
**estimations** dans `lib/calendrier.ts` : les corriger dès la publication du calendrier
officiel, puis redéployer.

## Espaces

- **Agent** : solde et évolution mois par mois, premier départ possible, places restantes par
  quinzaine, dépôt d'un vœu ou d'une demande de récupération du solde avec vérification préalable,
  annulation d'une demande en attente. Les récupérations suivent les règles de solde et de validation,
  sans minimum de jours ni délai de 12 mois entre congés, et sont distinguées dans l'espace agent,
  l'administration et l'export.
- **Admin (0568)** : KPIs (taux de soumission global et par rôle, vœux en attente / validés /
  supprimés, agents sans vœu, moins d'un an, soldes faibles, agents connectés), liste des vœux
  avec validation (unitaire ou en lot) et suppression motivée, liste des agents sans vœu avec
  la date à laquelle leur solde atteint 11 jours, modification des informations RH d'un agent
  (matricule, identité, fonction, rôle, date d'embauche, cumul des jours pris et dernier congé), occupation par quinzaine et par rôle,
  génération d'un nouveau code pour un agent, exports CSV (vœux, agents) et sauvegarde JSON.

## Préparation (sur votre poste)

```bash
npm install
npm run importer:agents -- data/import/agents.tsv
npm run importer:conges -- data/import/conges-2026.tsv --ignorer-inconnus   # retour = jour de reprise
npm run codes:generer -- --admin 0568 --nom "Prénom Nom"                      # code admin
npm run codes:generer                                                         # codes de tous les agents
```

La génération charge aussi `conges-app/.env.local` si le fichier existe, afin d’utiliser le stockage configuré (`fichier` ou `postgres`).
Les codes provisoires sont écrits dans `data/import/codes-provisoires-*.csv` : les distribuer,
puis **supprimer le fichier**. Chaque titulaire peut garder ce code ou le remplacer quand il le souhaite.

## Déploiement sur Netlify

Le disque de Netlify n'est pas persistant. En production, utilisez **Neon PostgreSQL** :
les mises à jour du registre se font dans une transaction qui verrouille le document pendant
la vérification des règles et l'écriture. Cela empêche les soumissions simultanées de se
remplacer ou de dépasser un plafond de congés à cause d'une lecture obsolète. Les requêtes
concurrentes sont traitées l'une après l'autre pour préserver ces règles.

1. Créer un projet Neon PostgreSQL et récupérer l'URL de connexion **poolée** (hostname contenant
   `-pooler`). Pousser le projet sur GitHub/GitLab (le dossier `data/` est exclu par `.gitignore`), puis
   « Add new site → Import an existing project ». `netlify.toml` (à la racine) indique le
   dossier `conges-app`.
2. Variables d'environnement du site :
   - `SESSION_SECRET` : `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `CONGES_STOCKAGE` = `postgres`
   - `DATABASE_URL` = URL poolée Neon (à garder secrète)
3. En local, définir la même URL `DATABASE_URL` dans `conges-app/.env.local`, puis initialiser
   la table et importer le registre local :
   ```bash
   npm run registre:db -- publier
   ```
   La commande refuse d'écraser un registre déjà présent, sauf avec `--force`. Vérifier ensuite
   que les agents, les codes et les vœux sont bien présents, puis déployer l'application.
   À partir de là, tout se fait dans l'application (l'admin génère les codes oubliés).
4. Fin de campagne : exporter depuis l'espace admin, et/ou récupérer une copie locale :
   `npm run registre:db -- recuperer`.

Pour un serveur classique (VPS), PostgreSQL est aussi recommandé dès qu'il y a plusieurs
instances. Le stockage fichier reste disponible pour le développement ou un serveur unique
à faible trafic ; il ne convient pas à plusieurs instances.

## Sécurité

- Session par cookie signé (HMAC, `httpOnly`, `Secure`, 8 h) ; le serveur n'accepte jamais un
  matricule envoyé par le navigateur. Comptes agent et admin strictement cloisonnés.
- Codes hachés (scrypt), remplacement du code facultatif ; un remplacement déconnecte les autres
  sessions. 5 échecs → blocage 15 min (compteur persistant).
- Entrées validées (zod), POST en JSON uniquement, en-têtes CSP/HSTS, exports CSV protégés
  contre l'injection de formules Excel, sauvegarde JSON sans les empreintes de codes.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Développement (stockage fichier) |
| `npm test` | Tests : règles, calendrier, plafonds, solde projeté, sessions, concurrence |
| `npm run lint` / `npm run typecheck` | Qualité du code |
| `npm run registre:db -- publier` / `recuperer` | Transfert local ↔ PostgreSQL |

## Avertissement juridique

Le contenu de `/legal` est informatif ; il ne remplace pas la loi n°97-17 du 1er décembre 1997
portant Code du travail, ses décrets d'application, ni la convention collective applicable.
