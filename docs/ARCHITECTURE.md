# SEO Product Manager — Architecture & conception

Ce document couvre les 15 livrables demandés. Il décrit le système réellement
implémenté dans ce dépôt (chemins de fichiers entre backticks) et la trajectoire
d'évolution MVP → version avancée.

---

## 1. Architecture complète

```
Navigateur (Next.js App Router, React)
        │  fetch JSON
        ▼
Route Handlers  src/app/api/**           ← validation zod, pas de secret côté client
        │  enqueue (jobs)                    réponse immédiate, aucun timeout
        ▼
File de jobs (DB-backed)  src/lib/jobs/queue.ts   ── Job / JobItem
        ▲                                  │ claim atomique
        │ pause/resume/cancel/progress     ▼
        │                          Worker  src/worker/index.ts   (npm run worker)
        │                                  │  processJob (lots + retry + pacing)
        │                                  ▼
        ├── Services
        │     ├── runs/service.ts         génération par item + apply + rollback
        │     ├── shopify/service.ts      sync (read) + apply (write) Admin GraphQL
        │     └── agents/*Pipeline.ts     enchaînement des agents IA
        │
        ├── Couche IA  src/lib/ai/**       provider interchangeable (Gemini par défaut)
        ├── Sécurité   src/lib/security/** guards déterministes + chiffrement tokens
        └── DB         Prisma (SQLite/Postgres)
        ▼
Shopify Admin GraphQL API   +   Fournisseur IA (Gemini / Groq / OpenAI)
```

> Les requêtes HTTP **mettent en file** ; le **worker** exécute le travail lourd
> hors requête. La file est en base (les tables `Job`/`JobItem` *sont* la file) ;
> elle évolue vers BullMQ/Redis en réimplémentant `JobQueue` sans changer le reste.

Principes :
- **Source de vérité = Shopify.** La DB locale est un *cache* + un journal
  (brouillons, sauvegardes, audit). On peut tout re-synchroniser.
- **Rien n'est publié sans prévisualisation et approbation humaine.**
- **Les règles de sécurité critiques sont codées (déterministes)**, pas confiées
  au LLM (`src/lib/security/guards.ts`).
- **Provider IA abstrait** : changer de modèle = 1 ligne dans le registre.

---

## 2. Structure des agents IA

Pipeline produit (`src/lib/agents/productPipeline.ts`), exécuté par agent via
`src/lib/agents/runner.ts` :

| # | Agent | Clé | Entrée → Sortie |
|---|---|---|---|
| 1 | Analyse Produit | `product_analysis` | données brutes → faits structurés (JSON) |
| 2 | Recherche Mots-Clés | `keyword_research` | analyse + niche → plan de mots-clés |
| 3 | Titre Produit | `product_title` | analyse + KW + règles → titre |
| 4 | Description Produit | `product_description` | tout + lien interne → HTML |
| 5 | Meta SEO | `meta_seo` | titre + KW → SEO title + meta (≤160, suffixe) |
| 6 | Handle | `handle` | titre → slug (désactivé en mode sécurisé) |
| 7 | Tags | `tags` | analyse + niche → tags nettoyés |
| 8 | Alt Text | `alt_text` | images + titre → alt (jamais si src vide) |
| 9 | Maillage Interne | `internal_linking` | URLs collections → 1 lien naturel |
| 10 | Description Collection | `collection_description` | collection → HTML long + meta |
| 11 | Contrôle Qualité | `quality_control` | brouillon → verdict + issues |
| 12 | Diff / Prévisualisation | *(UI)* | `src/app/runs/[id]/page.tsx` |
| 13 | Sécurité Shopify | *(code)* | `src/lib/security/guards.ts` |
| 14 | Matching | `matching` | ancien produit + candidats → correspondance |

Les agents mécaniques (handle, tags, alt) tournent sur un modèle moins cher
(`gemini-2.5-flash-lite`) ; les agents créatifs et le QC sur `gemini-2.5-flash`
(voir `src/lib/ai/registry.ts`, table `AGENT_MODELS`).

Chaque agent renvoie **strictement du JSON** ; `runner.ts` le parse de façon
tolérante (fences ` ```json `, prose parasite) et journalise latence/tailles
dans `AgentLog`.

---

## 3. Prompts système

Tous les prompts système sont dans `src/lib/agents/prompts.ts` (constantes
stables). Le contexte runtime (produit, règles boutique, mots-clés) est injecté
en message *user* par les pipelines. Règles transverses imposées dans chaque
prompt :

- **Ne jamais inventer** une donnée technique absente (sinon `null` / omission).
- **Jamais de jargon interne** ("SEO", "référencement", "mot-clé", "maillage
  interne") dans le texte client.
- Meta description **≤ 160 caractères**, finissant **exactement** par le suffixe
  boutique (`✓ Livraison gratuite.`).
- Titre jamais terminé par `et / ou / en / de / -`.
- Alt text vide si l'image n'a pas de `src`.

Le détail mot pour mot est versionné dans le fichier (12 prompts).

---

## 4. Base de données

Schéma Prisma : `prisma/schema.prisma`.

| Modèle | Rôle |
|---|---|
| `Shop` | boutique + règles éditoriales (JSON) + token **chiffré** |
| `Product` / `Collection` | cache des ressources Shopify |
| `OptimizationRun` | un lot d'optimisation (mode, statut, options) |
| `OptimizationDraft` | brouillon avant/après par ressource + verdict QC |
| `AgentLog` | trace par agent (modèle, latence, tailles) — **sans secret** |
| `Backup` | snapshot complet avant écriture (rollback + export) |
| `ChangeLog` | journal append-only des champs réellement publiés |
| `KeywordSet` | bases de mots-clés par niche |
| `Job` | entrée de file async (type, statut, progression, compteurs, lot, runId) |
| `JobItem` | une unité de travail (produit/collection/draft) + log + retries |

SQLite en dev (enums → String validés par zod) ; passer `provider = "postgresql"`
pour la prod.

---

## 5. Routes API

| Méthode & route | Rôle |
|---|---|
| `GET/POST /api/shops` | lister / créer une boutique (token chiffré, jamais renvoyé) |
| `POST /api/shops/[id]/sync?resource=products\|collections` | synchroniser depuis Shopify |
| `GET /api/products?shopId=` | produits en cache |
| `POST /api/products/intake` | créer des produits DRAFT depuis coller/CSV (placeholder `new:…`) |
| `GET /api/collections?shopId=` | collections en cache |
| `POST /api/runs` | créer un run + **enqueue** un job de génération (async) |
| `GET /api/runs/[id]` | run + brouillons (diff) |
| `POST /api/runs/[id]/approve` | approbation en lot (sûrs / 10 / 50 / tous) |
| `POST /api/runs/[id]/apply?force=` | **enqueue** un job d'application des approuvés |
| `PATCH /api/drafts/[id]` | approuver/rejeter / éditer un brouillon |
| `GET /api/jobs?shopId=` | historique des jobs |
| `GET /api/jobs/[id]` | statut + progression + logs par élément |
| `POST /api/jobs/[id]/{pause\|resume\|cancel\|rollback}` | contrôle du job |
| `GET /api/jobs/[id]/export?format=matrixify` | CSV Matrixify d'un job de matching |
| `POST /api/backups/[id]/rollback` | restaurer un snapshot |
| `GET /api/export?shopId=` | export CSV de sauvegarde |
| `POST /api/matching` | **enqueue** un job de matching (1 item / ancien produit) |

---

## 6. Scopes Shopify

Minimum requis :

```
read_products, write_products
read_collections, write_collections
```

Optionnels selon usage :

```
read_files, write_files        # gestion d'images
read_metaobjects, write_metaobjects / metafields  # champs SEO custom
```

Les metafields permettent d'attacher/modifier des données SEO sur produits et
collections quand les champs natifs ne suffisent pas.

---

## 7. Mutations & queries GraphQL

Lectures (`src/lib/shopify/queries.ts`) : `products`, `collections`, `shop`.

Écritures (`src/lib/shopify/mutations.ts`) :

- `productUpdate(input: ProductInput!)` — title, descriptionHtml, handle, tags,
  vendor, seo. **N'envoie que les champs explicitement fournis.**
- `productUpdateMedia(productId, media)` — **alt text uniquement**, ne touche ni
  `src` ni `position`.
- `collectionUpdate(input: CollectionInput!)` — descriptionHtml + seo.
- `productCreate` — mode création.

Le service (`src/lib/shopify/service.ts`) n'inclut jamais d'images dans
`productUpdate` ; l'alt passe par la mutation média dédiée, et seulement pour les
images ayant un `src` + un `alt` non vide.

---

## 8. Interface utilisateur

- **Dashboard** `src/app/page.tsx` — stats, boutiques, runs récents.
- **Produits** `src/app/products/page.tsx` — sync, sélection, choix des champs,
  choix du mode (sécurisé / création), lancement.
- **Run / Diff** `src/app/runs/[id]/page.tsx` — tableau avant/après par champ,
  badge QC (OK / À vérifier / Risque), liste d'issues, approbation unitaire ou en
  lot (10 / 50 / tous / sûrs), publication.
- **Collections** `src/app/collections/page.tsx` — optimisation des collections.
- **Réglages** `src/app/settings/page.tsx` — ajout de boutique (token chiffré).

---

## 9. Workflow produit complet

1. Sync produits → cache (`syncProducts`).
2. L'utilisateur sélectionne N produits, coche les champs, choisit le mode + le lot.
3. `POST /api/runs` crée le run et **met en file un job** (réponse immédiate).
4. Le worker traite chaque produit par lots :
   `analysis → keywords → (internal link) → title → meta → (handle) → tags →
   description → alt text → guards → QC` → brouillon avec verdict
   (`OK` / `REVIEW` / `RISK`). Progression en %, logs par produit.
5. Revue du diff, approbation, **export CSV** de sauvegarde recommandé.
6. `apply` met en file un **job d'application** : backup → `productUpdate`
   (+ `productUpdateMedia`) → changelog, **uniquement sur les lignes approuvées**.
7. Rollback par job (ou par backup) possible.

## 10. Workflow collection complet

1. Sync collections.
2. `OPTIMIZE_COLLECTIONS` → `runCollectionPipeline` (agent description collection,
   500–1000 mots, FAQ, liens internes naturels, meta conforme).
3. Guards (safeMode = true : aucun handle/image touché).
4. Diff → approbation → `collectionUpdate`.

## 11. Workflow matching collections

But : récupérer les collections d'une ancienne boutique et les réassigner aux
nouveaux produits.

1. Fournir `olds` (anciens produits + leurs collections) et `candidates`
   (nouveaux produits).
2. `POST /api/matching` → pré-filtre déterministe (handle/titre exact) sinon
   agent `matching` (score de confiance + raison).
3. Sortie JSON, ou **CSV compatible Matrixify** (`Handle, Command=MERGE,
   Collection`) pour réimport.
4. Les correspondances à faible confiance sont signalées pour revue manuelle.

---

## 12. Règles de sécurité anti-erreur

Implémentées **en code** dans `src/lib/security/guards.ts` (le QC IA n'est qu'un
second avis) :

- **Handle verrouillé** en mode mise à jour (`HANDLE_LOCKED`).
- **Images intouchables** : pas de changement de `src`, de `position`, ni du
  nombre d'images (`IMAGE_SRC_CHANGED`, `IMAGE_COUNT_CHANGED`).
- **Alt vide si src vide** (`ALT_WITHOUT_SRC`).
- **Meta ≤ 160** + suffixe obligatoire (`META_TOO_LONG`, `META_SUFFIX_MISSING`).
- **Titre** sans fin en `et/ou/en/de/-` (`TITLE_BAD_ENDING`) ; doublons signalés.
- **Pas de jargon interne** dans le texte public (`INTERNAL_JARGON`).
- **Pas de lien vers un ancien domaine** (`LEGACY_DOMAIN_LINK`).
- Verdict global `RISK` dès qu'une erreur existe → **non publiable sans `force`**.

Côté flux : on ne crée jamais de produits en mode mise à jour ; on travaille par
*handle* pour les correspondances ; **backup systématique avant écriture** ;
collections jamais supprimées.

**Noms brandés** : politique par boutique (`useBrandedNames`) — Lumio sans nom
brandé, Le Petit Luminaire avec (`Titre SEO | Nom Brandé`), Bebilo naturel. Les
noms brandés existants sont collectés depuis les titres et réinjectés à l'agent
titre ; un nom brandé dupliqué (`BRANDED_DUPLICATE`) ou trop proche
(`BRANDED_SIMILAR`, similarité Levenshtein ≥ 0,8) est signalé.

**Modes produit** : `UPDATE_PRODUCTS` (sécurisé, handle/images verrouillés),
`OPTIMIZE_SEO` (mise à jour avec handle modifiable), `CREATE_PRODUCTS` (création).
Les produits issus de l'intake portent un id `new:…` et sont **créés** dans
Shopify (statut DRAFT) à l'application, jamais mis à jour.

---

## 13. Plan technique étape par étape

1. **Socle** : Next.js + TS + Tailwind + Prisma + `.env`/`.gitignore` (clé jamais committée).
2. **DB** : modèles Shop/Product/Collection/Run/Draft/Backup/ChangeLog/AgentLog.
3. **Provider IA** : interface + Gemini + registre par agent.
4. **Agents** : prompts + runner JSON + pipelines produit/collection.
5. **Sécurité** : guards déterministes + chiffrement tokens.
6. **Shopify** : client GraphQL + sync (read) + apply (write).
7. **Runs** : création de brouillons, approbation, apply, rollback.
8. **API** : routes ci-dessus (validation zod).
9. **UI** : dashboard, produits, diff/run, collections, réglages.
10. **Matching** + export Matrixify.
11. **Durcissement** : files d'attente, rate-limit Shopify, tests, Postgres.

---

## 14. MVP réaliste (déjà couvert par ce dépôt)

- Connexion d'une boutique (token chiffré), sync produits/collections.
- Pipeline multi-agents produit + collection sur Gemini 2.5 Flash.
- **File de jobs asynchrone** (génération, application, matching, QC par lot)
  avec progression, logs, pause/reprise, annulation, retry et rollback.
- Diff avant/après, verdict QC, approbation en lot, publication GraphQL.
- Garde-fous de sécurité, backup + export CSV, rollback par job.
- Matching + export Matrixify.

Limites MVP : worker mono-process (un job à la fois), matching heuristique,
file en base (pas encore Redis). Suffisant pour 50→500 produits / 150 collections.

## 15. Version avancée idéale

- **BullMQ + Redis** + worker(s) multi-process / concurrents (l'interface
  `JobQueue` est déjà prête pour ce remplacement).
- **A/B testing SEO** et suivi des positions / clics (Search Console).
- **Détection de doublons** sémantique (embeddings) sur titres/descriptions.
- **Multi-provider par tâche** + repli automatique (Gemini → Groq → OpenAI).
- **Éditeur de règles par boutique** dans l'UI (ton, marque, URLs, suffixes).
- **Métafields SEO** et marchés/traductions (i18n) via GraphQL.
- **Rôles & permissions**, audit complet, validation à plusieurs.
- **Tests** (unitaires guards/pipelines, e2e UI) + CI.

---

## 16. File de jobs asynchrones (détail)

Objectif : traiter sans timeout 50 / 100 / 500 produits, 150 collections, le
matching et la génération/QC longue, tout en gardant **validation humaine avant
publication**.

**Composants** (`src/lib/jobs/`)
- `queue.ts` — interface `JobQueue` + `DbJobQueue` (enqueue, `claimNext` atomique,
  pause/resume/cancel). La DB *est* la file.
- `retry.ts` — `withRetry` (backoff exponentiel 2s→30s + jitter) ; `isRetryableError`
  détecte throttle / 429 / 5xx / réseau / quota / overloaded.
- `handlers.ts` — `buildContext(job)` (1 fois) + `processItem(item, ctx)` qui
  dispatche selon le type de job.
- `processor.ts` — `processJob(jobId)` : itère les items par **lots** (10/25/50),
  checkpoint pause/cancel entre lots, retry par item, **pacing** entre écritures
  Shopify, met à jour progression/compteurs, finalise (et agrège les résultats de
  matching).
- `src/worker/index.ts` — boucle de polling : `claimNext` → `processJob`, arrêt
  gracieux sur SIGINT/SIGTERM.

**Types de jobs** : `GENERATE_PRODUCTS`, `GENERATE_COLLECTIONS`, `APPLY`, `MATCHING`.

**Cycle de vie** : `PENDING → RUNNING → COMPLETED` (ou `PAUSED`, `CANCELLED`,
`FAILED`). Retry au niveau **item** (compteur `attempts`) et au niveau **job**
(jusqu'à `maxAttempts`, sinon `FAILED`).

**Reprise idempotente** : à la reprise, seuls les items `PENDING`/`FAILED` sont
retraités ; les `DONE` sont sautés → pas de double génération ni double
publication.

**Sécurité** : un job `GENERATE_*` ne publie jamais (il ne crée que des
brouillons). Un job `APPLY` ne traite que les brouillons `APPROVED` et saute les
`RISK` sauf `force=true`. Backup créé avant chaque écriture → rollback par job
(`rollbackByJob`).

**Rate limit Shopify** : pacing fixe entre items d'application + retry automatique
sur `THROTTLED`. (Évolution : lecture de `extensions.cost.throttleStatus` pour un
throttle adaptatif.)
```
