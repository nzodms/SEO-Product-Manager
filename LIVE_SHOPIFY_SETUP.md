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

## B. Créer la custom app Shopify & connecter la boutique

### 10. Créer la custom app (admin Shopify)

1. Admin Shopify → **Réglages → Applications et canaux de vente → Développer des applications**.
2. **Créer une application** → nom : `SEO Product Manager`.
3. **Configuration → Admin API integration → Configure**.

### 11. Activer les scopes Admin API

Coche au minimum :

```
read_products, write_products
read_collections, write_collections
```

(Optionnels : `read_files, write_files` pour les images ; metafields si besoin.)

### 12. Installer et récupérer le token

1. **Save** → **Install app**.
2. Onglet **API credentials** → copie l'**Admin API access token** (`shpat_…`).
   Il ne s'affiche **qu'une seule fois**.

### 13. Connecter la boutique dans l'app

Dans http://localhost:3000 → **Réglages → Ajouter une boutique** :

- Nom affiché : ex. `Le Petit Luminaire`
- Domaine : `ta-boutique.myshopify.com`
- Admin API access token : colle le `shpat_…`
- Préréglage de règles : choisis (Lumio / Le Petit Luminaire / Bebilo)
- **Ajouter** (le token est chiffré AES-256-GCM avant stockage, jamais renvoyé au navigateur).

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
| Sync Shopify 401/403 | token invalide ou scopes manquants → recréer la custom app (§10-12) |
| « ne s'ouvre pas dans Shopify » | normal : l'app tourne sur localhost:3000, pas dans l'admin |
