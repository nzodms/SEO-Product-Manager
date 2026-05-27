# Lancer & tester l'app sur une vraie boutique Shopify

Guide pas-à-pas (macOS) pour faire tourner SEO Product Manager en local et le
connecter à une vraie boutique Shopify, du premier `git clone` jusqu'au matching
de collections.

> ⚠️ Utilise une **nouvelle** clé Gemini (révoque toute clé partagée en clair).
> Cette app **n'est pas** une app intégrée à l'admin Shopify : elle tourne sur
> `http://localhost:3000` et se connecte à Shopify via un token de **custom app**.
> Aucun Shopify CLI n'est nécessaire.

---

## A. Installer et lancer en local

### 1. Récupérer le repo

```bash
cd ~/Documents
git clone https://github.com/nzodms/SEO-Product-Manager.git
cd SEO-Product-Manager
git checkout claude/determined-fermat-GXjt2
```

(Alternative ZIP : décompresse, puis `cd` dans le dossier extrait.)

### 2. Vérifier Node (≥ 18.18, idéalement 20)

```bash
node -v
```

Si trop ancien ou absent, installe via nvm :

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.zshrc
nvm install 20 && nvm use 20 && nvm alias default 20
```

### 3. Installer les dépendances

```bash
npm install
```

### 4. Créer le fichier .env

```bash
cp .env.example .env
```

### 5. Renseigner la clé Gemini (remplace COLLE_TA_CLE)

```bash
sed -i '' "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=COLLE_TA_CLE|" .env
```

### 6. Générer APP_ENCRYPTION_KEY

```bash
sed -i '' "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=$(openssl rand -hex 32)|" .env
```

Vérifie :

```bash
grep -E "GEMINI_API_KEY|APP_ENCRYPTION_KEY|DATABASE_URL" .env
```

### 7. Initialiser la base

```bash
npm run db:push
npm run db:seed   # optionnel : bases de mots-clés
```

### 8. Lancer l'app (terminal 1)

```bash
npm run dev
```

→ ouvre **http://localhost:3000**

### 9. Lancer le worker (terminal 2, `Cmd + T`)

```bash
cd ~/Documents/SEO-Product-Manager
npm run worker
```

→ doit afficher `[worker] started`. Laisse les **deux** terminaux ouverts.

---

## B. Connecter la boutique — 2 modes

L'app gère deux façons de se connecter à Shopify. **Choisis le mode qui
correspond à ce que ton dashboard te donne.**

| Tu as… | Mode à utiliser |
|---|---|
| un **Client ID + Client Secret** (nouveau Dev Dashboard) | **B1 — OAuth** |
| un token **`shpat_…`** (custom app dans l'admin) | **B2 — Token direct** |

> ℹ️ Le **Client Secret n'est pas** un token `shpat_`. Ne le colle jamais dans le
> champ « Admin API access token ». L'app échange automatiquement les
> credentials contre un token via OAuth.
>
> ℹ️ Le token OAuth obtenu est **hors-ligne et n'expire pas** (Shopify ne fournit
> pas de refresh token). S'il devient invalide (app désinstallée), le diagnostic
> l'affiche en **« Token invalide / expiré »** → reclique sur **Reconnecter**.

### B1 — Mode Dev Dashboard (Client ID + Client Secret) — recommandé

#### 10. Récupérer les credentials
Dans le **Dev Dashboard** de ton app Shopify : note le **Client ID** et le
**Client Secret**.

#### 11. Déclarer l'URL de redirection (OBLIGATOIRE)
Dans la configuration de l'app Shopify → section **URLs / Allowed redirection URL(s)**,
ajoute **exactement** :

```
http://localhost:3000/api/shopify/oauth/callback
```

(Sans ça, Shopify refusera la redirection. En prod, remplace par ton domaine
public et définis `APP_URL` dans `.env`.)

#### 12. Connecter dans l'app
http://localhost:3000 → **Réglages** → onglet **Dev Dashboard (Client ID + Secret)** :

- Nom affiché : `Le Petit Luminaire`
- Domaine : `dertx1-dt.myshopify.com`
- Client ID : (collé)
- Client Secret : (collé — chiffré au stockage)
- Scopes : `read_products,write_products,read_collections,write_collections`
- **Ajouter & connecter via Shopify** → tu es redirigé vers Shopify pour
  approuver les scopes, puis renvoyé sur l'app.

#### 13. Tester la connexion
Dans **Réglages**, sur la boutique → **Tester la connexion**. Le diagnostic doit
passer à **« Connecté ✓ »** (sinon il indique : Non connecté / Token généré /
Token invalide + l'erreur).

### B2 — Mode token direct (`shpat_…`), si tu l'as

1. Admin Shopify → **Réglages → Applications → Développer des applications** →
   créer l'app → scopes `read_products, write_products, read_collections,
   write_collections` → **Install** → copie l'**Admin API access token** (`shpat_…`).
2. App → **Réglages** → onglet **Token direct (shpat_)** → domaine + token → **Ajouter**.
3. **Tester la connexion**.

---

## C. Tester le cœur de l'app

### 14. Tester la connexion Shopify

Onglet **Produits** → sélectionne la boutique → **Synchroniser depuis Shopify**.
Un nombre de produits synchronisés s'affiche = connexion OK. (Sinon : token/scopes — voir §dépannage.)

### 15. Tester Gemini + générer 1 produit

1. Toujours dans **Produits** : **Sélection rapide → 5**, puis décoche pour n'en garder **1**
   (ou coche une seule case).
2. Mode **Mise à jour sécurisée**, lot **10**.
3. Champs : titre, description, meta, tags, alt text, maillage (laisse `handle` décoché).
4. **Générer pour 1 produit** → tu arrives sur la page **Job**.
5. La progression doit passer à 100 %. Si elle reste à 0 % : le worker ne tourne pas (terminal 2).
   (Une erreur `GEMINI_API_KEY is not set` dans le worker = clé absente.)

### 16. Prévisualiser le diff

Sur la page Job → **Prévisualiser les résultats** → tableau **avant / après** par champ + badge QC (OK / À vérifier / Risque) + liste des anomalies éventuelles.

### 17. Approuver 1 ligne

Sur la ligne du produit → **Approuver**. (Ou « Approuver les sûrs ».)

### 18. Publier uniquement 1 produit

Bouton **Publier 1 approuvé(s)** → cela met en file un **job d'application** qui
publie **uniquement** les lignes approuvées (les `RISK` sont ignorés sauf forçage).

### 19. Vérifier dans Shopify

Ouvre le produit dans l'admin Shopify → vérifie titre / description / SEO title /
meta description / tags. Les **images et le handle ne doivent pas avoir changé** (mode sécurisé).

### 20. Faire un rollback

Sur la page du **job d'application** (statut COMPLETED) → **Rollback** → le produit
revient à l'état sauvegardé avant modification. Re-vérifie dans Shopify.

### 21. Tester 1 collection

Onglet **Collections** → **Synchroniser** → coche 1 collection → **Optimiser** →
suis le job → prévisualise → approuve → publie → vérifie dans Shopify.

### 22. Tester un CSV produit (analyse import)

Onglet **Import produits** → upload d'un **CSV export Shopify produits** → vérifie :
produits réels vs lignes totales / images / variantes + contrôles (doublons,
alt sans src, lignes orphelines…).

### 23. Tester un export Matrixify collections (analyse)

Onglet **Import collections** → upload de l'**export Matrixify Custom Collections** →
vérifie : nombre de collections, collections vides, associations, produits uniques.

### 24. Tester le matching ancien → nouveau site

Onglet **Matching** :

1. Upload **ancien export produits** (CSV Shopify de l'ancienne boutique).
2. Upload **nouvel export produits** (CSV de la nouvelle boutique).
3. Upload **collections Matrixify** (de l'ancienne boutique).
4. **Lancer le matching** → buckets **Sûr / Moyen / Non matché**, filtres, score par produit.
5. Corrige manuellement les `newHandle` douteux si besoin.
6. **Export Matrixify CSV** ou **XLSX** → fichier corrigé (anciens `Product: ID`
   vidés, handles remplacés, positions conservées, collections vides gardées).
7. **Rapport matching CSV** + **Rapport erreurs CSV** pour les non-matchés.
8. Importe le fichier corrigé dans Matrixify (Custom Collections).

---

## D. Checklist de sécurité AVANT publication

Garde-fous appliqués automatiquement (vérifie-les en prévisualisation) :

- [ ] **Handles verrouillés** en mode sécurisé (aucun changement de handle).
- [ ] **Image Src** intouchable (jamais modifiée).
- [ ] **Image Position** intouchable.
- [ ] **Variant Image** intouchable.
- [ ] **Collections jamais supprimées**.
- [ ] **Aucun ancien Product ID** réutilisé entre deux boutiques (vidés à l'export Matrixify).
- [ ] **Aucun `Product: Handle` introuvable** dans l'export Matrixify (les non-matchés sont retirés ET listés dans le rapport).
- [ ] **Meta description ≤ 160 caractères** (sinon RISK, publication bloquée).
- [ ] **Meta description finit par `✓ Livraison gratuite.`** (sinon RISK).
- [ ] **Aucun texte public** contenant « SEO », « référencement », « maillage interne », « mot-clé principal ».
- [ ] **Alt text vide si Image Src vide**.
- [ ] **Aucun titre** finissant par `et / ou / en / de / -`.
- [ ] **Aucun nom brandé** dupliqué ou trop similaire (boutiques avec noms brandés).
- [ ] Tout produit en **RISK** reste non publiable sans forçage explicite.

Un brouillon en **RISK** n'est jamais publié tant qu'il n'est pas corrigé ou
forcé manuellement. Une **sauvegarde** est créée avant chaque écriture → rollback possible.

---

## E. Dépannage rapide

| Problème | Commande / action |
|---|---|
| `npm: command not found` | installer Node via nvm (voir §2) |
| Node trop ancien | `nvm install 20 && nvm use 20` puis `npm install` |
| Erreur Prisma | `npm run db:generate && npm run db:push` (ou `rm -f prisma/dev.db && npm run db:push`) |
| `GEMINI_API_KEY is not set` (worker) | renseigner la clé (§5), relancer `npm run worker` |
| Port 3000 occupé | `lsof -ti:3000 \| xargs kill -9` ou `PORT=3001 npm run dev` |
| Job bloqué en PENDING | le worker ne tourne pas → terminal 2 (`npm run worker`) |
| Jobs bloqués en PENDING (Vercel) | clique **« Traiter maintenant »** (page Jobs) ; vérifie que le **Cron** et `CRON_SECRET` sont configurés |
| Sync Shopify 401/403 | token invalide ou scopes manquants → **Reconnecter** (OAuth) ou recréer le token |
| OAuth « redirect_uri is not whitelisted » | ajoute `http://localhost:3000/api/shopify/oauth/callback` dans les Allowed redirection URL(s) de l'app (§11) |
| OAuth « Signature HMAC invalide » | Client Secret incorrect → recolle-le dans Réglages |
| Diagnostic « Token invalide / expiré » | app désinstallée/clé changée → **Reconnecter via Shopify** |
| « ne s'ouvre pas dans Shopify » | normal : l'app tourne sur localhost:3000, pas dans l'admin |

---

## F. Déploiement Vercel (pour que ton associé l'utilise sans terminal)

En production, il n'y a **pas** de `npm run worker`. Les jobs sont traités par un
**Cron Vercel** qui appelle `/api/jobs/tick`, et par le bouton **« Traiter
maintenant »** dans l'interface (page Jobs). Aucun terminal requis.

### 1. Base de données
SQLite ne convient pas au serverless. Utilise un **Postgres** (Vercel Postgres,
Neon, Supabase…). Dans `prisma/schema.prisma`, mets `provider = "postgresql"`,
puis `npx prisma db push` avec l'URL Postgres.

### 2. Importer le repo dans Vercel
Vercel → **New Project** → importe `nzodms/SEO-Product-Manager` → branche à déployer.

### 3. Variables d'environnement (Project Settings → Environment Variables)

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | URL Postgres |
| `GEMINI_API_KEY` | ta clé Gemini |
| `APP_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `APP_URL` | l'URL publique Vercel, ex. `https://seo-product-manager.vercel.app` |
| `CRON_SECRET` | `openssl rand -hex 32` (Vercel l'enverra automatiquement au cron) |

### 4. Cron
`vercel.json` déclare déjà le cron `*/1` sur `/api/jobs/tick`. Avec `CRON_SECRET`
défini, Vercel l'appelle en envoyant `Authorization: Bearer <CRON_SECRET>`.

> ⚠️ Le plan **Hobby** limite la fréquence des crons (≈ 1×/jour). Pour un
> traitement réactif : passe en **Pro**, ou utilise un planificateur externe
> (cron-job.org) qui appelle
> `https://<APP_URL>/api/jobs/tick?secret=<CRON_SECRET>` toutes les minutes.
> Le bouton **« Traiter maintenant »** reste disponible dans tous les cas.

### 5. URL de redirection OAuth en prod
Dans la config de l'app Shopify, ajoute aussi :
`https://<APP_URL>/api/shopify/oauth/callback` aux Allowed redirection URL(s).

### 6. Utilisation par ton associé
Il ouvre simplement l'URL Vercel → Réglages → connecte la boutique (OAuth) →
Produits → Synchroniser → générer → (le cron/bouton traite le job) → prévisualiser
→ approuver → publier. Aucun terminal.

> ℹ️ L'app n'a pas encore d'authentification utilisateur. En production, protège
> l'URL (Vercel **Password Protection** / SSO, ou un middleware d'auth) pour que
> seuls toi et ton associé puissiez y accéder.
