# SEO Product Manager

Application **interne** (non destinée à l'App Store) pour optimiser le SEO des
produits et collections de plusieurs boutiques Shopify, via un **pipeline
multi-agents IA**, avec prévisualisation, garde-fous de sécurité, sauvegarde et
rollback.

> ⚠️ App privée / custom app. Elle utilise exclusivement l'**Admin GraphQL API**
> (la REST Admin API est *legacy* depuis 2024-10).

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **Prisma** + **PostgreSQL** (requis en local comme en production)
- **Shopify Admin GraphQL API** (client maison, zéro dépendance)
- **Gemini 2.5 Flash** par défaut, via une couche provider **interchangeable**
  (Groq / OpenAI / Anthropic ajoutables sans toucher aux agents)

## Démarrage

Prérequis : un **PostgreSQL** accessible (local ou hébergé). Renseigne son URL
dans `DATABASE_URL` (jamais `file:./dev.db`).

```bash
cp .env.example .env        # renseigner DATABASE_URL (Postgres) + GEMINI_API_KEY + APP_ENCRYPTION_KEY
npm install
npm run db:push             # crée les tables dans la base Postgres
npm run db:seed             # (optionnel) bases de mots-clés par niche
npm run dev                 # http://localhost:3000  (interface)
npm run worker              # dans un 2e terminal : traite la file de jobs (local)
```

> L'**interface** (`npm run dev`) met les tâches en file ; le **worker**
> (`npm run worker`) les exécute en arrière-plan. Les deux doivent tourner.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `GEMINI_API_KEY` | Clé Gemini. **Lue uniquement via `process.env`, jamais en dur, jamais loggée, jamais renvoyée au client.** |
| `APP_ENCRYPTION_KEY` | Secret servant à chiffrer (AES-256-GCM) les tokens Shopify stockés. |
| `DATABASE_URL` | **URL PostgreSQL** (local et prod). Jamais `file:./dev.db` — SQLite ne marche pas sur Vercel. |
| `DEFAULT_AI_PROVIDER` / `DEFAULT_AI_MODEL` | Provider/modèle par défaut. |

> 🔐 `.env` est git-ignoré. Ne committez **jamais** de clé. Si une clé a été
> exposée, révoquez-la et régénérez-la côté Google AI Studio.

## Connexion d'une boutique

1. Dans Shopify Admin → *Apps* → *Develop apps* → créez une **custom app**.
2. Scopes : `read_products, write_products, read_collections, write_collections`
   (+ `read_files, write_files` si gestion d'images, + metafields si besoin).
3. Installez l'app, copiez l'**Admin API access token** (`shpat_…`).
4. Dans l'UI → **Réglages** → *Ajouter une boutique* (le token est chiffré au repos).

## Workflow

1. **Synchroniser** les produits/collections depuis Shopify (mise en cache locale).
2. **Sélectionner** des produits + cocher les champs à optimiser + choisir le mode
   + la taille de lot (10 / 25 / 50).
3. **Générer** : un **job** est mis en file. Le worker exécute le pipeline
   multi-agents par lots et met à jour la progression en %.
4. **Suivre** le job (page Jobs) : progression, logs par produit, pause / reprise /
   annulation, retry automatique sur erreur Gemini/Shopify.
5. **Prévisualiser** le diff avant/après + verdict QC (OK / À vérifier / Risque).
6. **Approuver** (un, lot de 10/50, tous les sûrs) puis **Appliquer** : un job
   d'application publie **uniquement les lignes validées** vers Shopify.
7. Sauvegarde automatique avant écriture + **rollback** par job.

> 🛑 L'IA ne publie **jamais** directement. Les jobs de génération produisent des
> brouillons ; la publication est un job distinct, déclenché après validation.

## File de jobs (asynchrone)

| Aspect | Implémentation |
|---|---|
| File | DB-backed (`Job` + `JobItem`) — voir `src/lib/jobs/queue.ts` |
| Worker | `npm run worker` (`src/worker/index.ts`), polling + claim atomique |
| Statuts | `PENDING / RUNNING / PAUSED / COMPLETED / FAILED / CANCELLED` |
| Progression | `progress` (0–100) + compteurs `succeeded` / `failed` |
| Lots | configurables : **10 / 25 / 50** |
| Retry | backoff exponentiel (2s→…→30s) sur throttle/429/5xx (`retry.ts`) |
| Rate limit Shopify | pacing entre écritures + retry sur `THROTTLED` |
| Pause / reprise | reprise idempotente (les éléments déjà `DONE` sont sautés) |
| Logs | par élément (`JobItem.logJson`), visibles dans l'UI |
| Évolutivité | remplacer `DbJobQueue` par une impl. **BullMQ/Redis** sans toucher au processor/worker |

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour la conception complète
(agents, prompts, DB, routes, mutations, sécurité, MVP → version avancée), et
[`LIVE_SHOPIFY_SETUP.md`](LIVE_SHOPIFY_SETUP.md) pour le guide pas-à-pas de test
sur une vraie boutique Shopify (avec checklist de sécurité avant publication).

Les collections corrigées s'exportent en **CSV et XLSX** Matrixify (page Matching).

## Scripts

| Script | Action |
|---|---|
| `npm run dev` | Serveur de dev |
| `npm run build` | Build prod (génère Prisma + Next) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run db:push` | Applique le schéma Prisma |
| `npm run db:studio` | Explorateur de DB |
