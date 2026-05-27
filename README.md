# SEO Product Manager

Application **interne** (non destinée à l'App Store) pour optimiser le SEO des
produits et collections de plusieurs boutiques Shopify, via un **pipeline
multi-agents IA**, avec prévisualisation, garde-fous de sécurité, sauvegarde et
rollback.

> ⚠️ App privée / custom app. Elle utilise exclusivement l'**Admin GraphQL API**
> (la REST Admin API est *legacy* depuis 2024-10).

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **Prisma** (SQLite en dev, Postgres en prod)
- **Shopify Admin GraphQL API** (client maison, zéro dépendance)
- **Gemini 2.5 Flash** par défaut, via une couche provider **interchangeable**
  (Groq / OpenAI / Anthropic ajoutables sans toucher aux agents)

## Démarrage

```bash
cp .env.example .env        # puis renseigner GEMINI_API_KEY + APP_ENCRYPTION_KEY
npm install
npm run db:push             # crée le schéma SQLite
npm run db:seed             # (optionnel) bases de mots-clés par niche
npm run dev                 # http://localhost:3000
```

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `GEMINI_API_KEY` | Clé Gemini. **Lue uniquement via `process.env`, jamais en dur, jamais loggée, jamais renvoyée au client.** |
| `APP_ENCRYPTION_KEY` | Secret servant à chiffrer (AES-256-GCM) les tokens Shopify stockés. |
| `DATABASE_URL` | `file:./dev.db` en local, URL Postgres en prod. |
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
2. **Sélectionner** des produits + cocher les champs à optimiser + choisir le mode.
3. **Générer** : le pipeline multi-agents produit un brouillon par produit.
4. **Prévisualiser** le diff avant/après + verdict QC (OK / À vérifier / Risque).
5. **Approuver** (un, lot de 10/50, tous les sûrs) puis **Publier** vers Shopify.
6. Sauvegarde automatique avant écriture + **rollback** possible.

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour la conception complète
(agents, prompts, DB, routes, mutations, sécurité, MVP → version avancée).

## Scripts

| Script | Action |
|---|---|
| `npm run dev` | Serveur de dev |
| `npm run build` | Build prod (génère Prisma + Next) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run db:push` | Applique le schéma Prisma |
| `npm run db:studio` | Explorateur de DB |
