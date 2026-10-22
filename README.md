# Cave & Caisse

Application web complète de **gestion de cave / dépôt** avec **module de caisse
(point de vente)**. Elle fonctionne sur ordinateur, tablette et smartphone,
s'installe comme une application mobile, continue d'encaisser **sans connexion
internet**, et ne dépend d'aucun ordinateur allumé en permanence.

| | |
|---|---|
| **Interface** | React + Vite + TypeScript + Tailwind CSS (site statique) |
| **Hébergement** | GitHub Pages (gratuit), déploiement automatique à chaque modification |
| **Base de données** | Supabase (PostgreSQL + authentification + sécurité par ligne) |
| **Mobile** | PWA installable, caisse utilisable hors ligne |
| **Langue / devise** | Français, dates JJ/MM/AAAA, devise paramétrable (EUR, FCFA…) |
| **Paiements** | Espèces, carte, **mobile money par opérateur** (Orange Money, MTN MoMo, Moov Money, Wave…) |

---

## Sommaire

1. [Ce que fait l'application](#1-ce-que-fait-lapplication)
2. [Installation pas à pas (pour débutant)](#2-installation-pas-à-pas)
   - [Étape 1 — Créer la base de données Supabase](#étape-1--créer-la-base-de-données-supabase)
   - [Étape 2 — Créer le premier compte administrateur](#étape-2--créer-le-premier-compte-administrateur)
   - [Étape 3 — Mettre le code sur GitHub](#étape-3--mettre-le-code-sur-github)
   - [Étape 4 — Ajouter les clés secrètes](#étape-4--ajouter-les-clés-secrètes)
   - [Étape 5 — Activer GitHub Pages](#étape-5--activer-github-pages)
3. [Installer l'application sur un téléphone](#3-installer-lapplication-sur-un-téléphone)
4. [Brancher une douchette code-barres](#4-brancher-une-douchette-code-barres)
5. [Utilisation au quotidien](#5-utilisation-au-quotidien)
6. [Rôles et sécurité](#6-rôles-et-sécurité)
7. [Mode hors ligne](#7-mode-hors-ligne)
8. [Développement local](#8-développement-local)
9. [Modèle de données](#9-modèle-de-données)
10. [Questions fréquentes et dépannage](#10-questions-fréquentes-et-dépannage)

---

## 1. Ce que fait l'application

**Produits** — catalogue complet (nom, catégorie, appellation, millésime,
contenance, fournisseur, prix d'achat HT, prix de vente TTC, TVA, code-barres,
code interne, conditionnement, seuil d'alerte, photo), import et export CSV,
impression d'étiquettes code-barres en PDF.

**Stock** — stock par produit **et par emplacement** (cave, dépôt, réserve,
boutique). Chaque mouvement est tracé : entrée, sortie, transfert, casse/perte,
ajustement d'inventaire, retour — avec date, utilisateur, quantité et motif.
Conversion carton ↔ bouteille partout.

**Inventaire** — session de comptage par scan, comparaison stock théorique /
compté, validation des écarts avec motif (génère les ajustements de stock).

**Fournisseurs et réceptions** — bons de réception avec mise à jour du stock et
du prix d'achat à la validation.

**Caisse (point de vente)** — écran tactile, scan en continu, panier, remises par
ligne ou sur le ticket (en % ou en montant), paiements espèces (avec rendu
monnaie), carte, **mobile money avec choix de l'opérateur** et **paiement mixte**, ouverture de caisse avec
fond de caisse, clôture avec comptage des espèces et calcul de l'écart
(**rapport Z**), ticket imprimable au format 80 mm et téléchargeable en PDF,
numérotation séquentielle, annulation et retour d'article réservés au gérant.

**Clients** — fiche simple et historique d'achats (facultatif : la caisse accepte
les clients de passage).

**Tableau de bord** — CA du jour / semaine / mois, marge brute, top produits,
produits sous seuil d'alerte, valeur du stock, répartition par moyen de paiement,
graphiques.

**Exports** — ventes, ventes détaillées ligne par ligne, mouvements de stock et
état du stock, en **CSV** et en **Excel (.xlsx)**.

---

## 2. Installation pas à pas

> Comptez **30 à 45 minutes** la première fois. Aucune connaissance en
> programmation n'est nécessaire : il s'agit de copier-coller et de cliquer.
> Tout est gratuit (offre gratuite de Supabase et de GitHub Pages).

### Étape 1 — Créer la base de données Supabase

1. Allez sur **<https://supabase.com>** et cliquez sur **Start your project**.
   Créez un compte (vous pouvez utiliser votre compte GitHub).
2. Cliquez sur **New project**.
   - **Name** : `cave-pos` (ou le nom de votre boutique).
   - **Database Password** : cliquez sur *Generate a password* et
     **conservez-la dans un endroit sûr** (gestionnaire de mots de passe, coffre).
   - **Region** : choisissez une région proche en termes de *réseau*, pas de
     carte. Depuis l'Afrique de l'Ouest (Côte d'Ivoire, Sénégal, Bénin…),
     préférez `West EU (Ireland)`, `West EU (London)` ou `Central EU (Frankfurt)` :
     la quasi-totalité du trafic ivoirien transite par l'Europe via les câbles
     sous-marins, et `South Africa (Cape Town)` donne souvent de moins bons
     temps de réponse malgré sa proximité apparente. Depuis l'Europe,
     prenez la région européenne la plus proche.
3. Cliquez sur **Create new project** et patientez 1 à 2 minutes.
4. Dans le menu de gauche, ouvrez **SQL Editor** puis **New query**.
5. Ouvrez le fichier **`supabase/schema.sql`** de ce projet, **copiez tout son
   contenu**, collez-le dans l'éditeur, puis cliquez sur **Run** (ou `Ctrl+Entrée`).
   Le message *Success. No rows returned* indique que tout s'est bien passé.
6. **Facultatif mais recommandé pour démarrer** : répétez l'opération avec le
   fichier **`supabase/seed.sql`**. Il crée les catégories, les emplacements,
   5 fournisseurs et 26 références de démonstration avec du stock, ce qui permet
   de tester la caisse immédiatement.
   *(Pour partir d'une base vide, exécutez uniquement les sections « Catégories »
   et « Emplacements » du fichier : l'application a besoin d'au moins un
   emplacement marqué « point de vente ».)*
7. Récupérez vos deux clés : menu **Project Settings** (roue dentée) →
   **API**. Notez :
   - **Project URL** — ressemble à `https://abcdefghijkl.supabase.co`
   - **anon public** — une longue clé qui commence par `eyJ...`

> **La clé `anon` est publique par nature** : elle est visible dans toute
> application web. La sécurité ne repose pas sur elle mais sur les **politiques
> RLS** installées par `schema.sql`, qui décident ligne par ligne qui a le droit
> de lire et d'écrire quoi. **Ne publiez jamais la clé `service_role`**, qui,
> elle, contourne toutes les sécurités.

#### Facultatif — autoriser les photos de produits

`schema.sql` crée automatiquement un espace de stockage public nommé
`produits`. Si votre projet Supabase refuse la création des règles d'accès, créez
l'espace à la main : **Storage** → **New bucket** → nom `produits`, case
**Public bucket** cochée. Sans cet espace, vous pouvez toujours coller l'adresse
d'une photo hébergée ailleurs dans la fiche produit.

#### Facultatif — simplifier la création des comptes

Par défaut, Supabase envoie un e-mail de confirmation à chaque inscription. Pour
créer les comptes de vos salariés sans attendre ces e-mails :
**Authentication → Sign In / Providers → Email** → décochez **Confirm email**.

### Étape 2 — Créer le premier compte administrateur

Le tout premier compte créé devient **automatiquement administrateur** (c'est le
rôle du déclencheur `handle_new_user` installé par `schema.sql`). Deux méthodes :

**Méthode A — depuis l'application** (la plus simple, après l'étape 5)
1. Ouvrez l'adresse de votre application.
2. Cliquez sur **Créer un compte**, saisissez vos nom, e-mail et mot de passe.
3. Si la confirmation d'e-mail est active, cliquez sur le lien reçu, puis
   connectez-vous.

**Méthode B — depuis Supabase** (possible dès maintenant)
1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Saisissez l'e-mail et le mot de passe, cochez **Auto Confirm User**.
3. Vérifiez dans **Table Editor → profiles** que la ligne existe avec
   `role = admin`.

> Les comptes suivants arrivent avec le rôle **caissier**. Un administrateur les
> ajuste dans **Paramètres → Utilisateurs et rôles**.

### Étape 3 — Mettre le code sur GitHub

1. Créez un compte sur **<https://github.com>** si vous n'en avez pas.
2. Cliquez sur **+** (en haut à droite) → **New repository**.
   - **Repository name** : `cave-pos` — *retenez ce nom, il sert à l'adresse finale*.
   - Visibilité **Public** (GitHub Pages est gratuit pour les dépôts publics ;
     en privé, il faut un abonnement payant).
   - **Ne cochez pas** « Add a README file ».
   - Cliquez sur **Create repository**.
3. Envoyez le code. Depuis le dossier du projet, dans un terminal :

   ```bash
   git init
   git add .
   git commit -m "Première version de l'application cave et caisse"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/cave-pos.git
   git push -u origin main
   ```

   *Sans terminal :* sur la page du dépôt vide, cliquez sur **uploading an
   existing file** et glissez-déposez tous les fichiers et dossiers du projet
   (y compris les dossiers cachés `.github` et `supabase`).

### Étape 4 — Ajouter les clés secrètes

1. Sur la page de votre dépôt : **Settings** → menu de gauche **Secrets and
   variables** → **Actions**.
2. Cliquez sur **New repository secret** et créez le premier secret :
   - **Name** : `VITE_SUPABASE_URL`
   - **Secret** : l'adresse relevée à l'étape 1 (`https://abcdefghijkl.supabase.co`)
3. Recommencez pour le second :
   - **Name** : `VITE_SUPABASE_ANON_KEY`
   - **Secret** : la clé `anon public` (`eyJ...`)

> Les noms doivent être **exactement** ceux-ci, en majuscules. Les clés ne sont
> jamais écrites dans le code : elles sont injectées à la compilation par
> GitHub Actions.

### Étape 5 — Activer GitHub Pages

Cette étape est **manuelle et obligatoire** : le workflow ne peut pas activer
Pages lui-même (créer un site Pages demande un droit d'administration que le
jeton de GitHub Actions n'a pas). Sans elle, le déploiement échoue sur
*Get Pages site failed*.

1. **Settings** → menu de gauche **Pages**.
2. Rubrique **Build and deployment** → **Source** : choisissez
   **GitHub Actions** (et non « Deploy from a branch »).
3. Ouvrez l'onglet **Actions** du dépôt. Si aucun déploiement n'a démarré,
   sélectionnez **Déploiement GitHub Pages** dans la liste de gauche, puis
   **Run workflow** → **Run workflow**.
4. Attendez 2 à 3 minutes (pastille verte ✓).
5. Votre application est en ligne à l'adresse :

   ```
   https://VOTRE-COMPTE.github.io/cave-pos/
   ```

À partir de maintenant, **chaque modification envoyée sur `main` redéploie
automatiquement le site**.

---

## 3. Installer l'application sur un téléphone

L'application est une **PWA** : elle s'installe comme une application normale,
avec son icône, son écran de démarrage et son fonctionnement hors ligne.

**Android (Chrome)**
1. Ouvrez l'adresse de l'application dans Chrome.
2. Menu **⋮** → **Ajouter à l'écran d'accueil** (ou la bannière « Installer »).
3. Confirmez. L'icône apparaît sur l'écran d'accueil.

**iPhone et iPad (Safari — obligatoire)**
1. Ouvrez l'adresse dans **Safari** (Chrome iOS ne sait pas installer les PWA).
2. Touchez le bouton **Partager** (carré avec une flèche vers le haut).
3. **Sur l'écran d'accueil** → **Ajouter**.

**Ordinateur (Chrome, Edge)**
Icône d'installation ⊕ dans la barre d'adresse → **Installer**.

> **Mise à jour** : l'application se met à jour toute seule au lancement suivant
> un déploiement. Si un écran semble figé sur une ancienne version, fermez
> complètement l'application et rouvrez-la.

---

## 4. Brancher une douchette code-barres

Une douchette (lecteur de codes-barres) **USB ou Bluetooth** se comporte comme un
clavier : elle « tape » le code puis appuie sur **Entrée**. Aucun pilote, aucune
configuration logicielle n'est nécessaire.

**Douchette USB (caisse fixe)**
1. Branchez la douchette sur un port USB de l'ordinateur ou de la tablette
   (adaptateur USB-C si besoin).
2. Ouvrez l'écran **Caisse**. Le champ de scan est **toujours actif** : il
   reprend le focus automatiquement.
3. Scannez : l'article s'ajoute au panier.

**Douchette Bluetooth (mobile)**
1. Mettez la douchette en mode appairage (voir sa notice — souvent un code-barres
   « Bluetooth HID » à scanner dans le manuel).
2. Sur le téléphone : **Réglages → Bluetooth** → sélectionnez la douchette.
3. Ouvrez l'application et scannez.

**Réglages recommandés de la douchette** (codes-barres de configuration fournis
dans sa notice) :

| Réglage | Valeur conseillée |
|---|---|
| Suffixe | **Entrée (CR)** — indispensable pour valider automatiquement |
| Symbologies | EAN-13, EAN-8, UPC-A et **Code 128** activés |
| Clavier | AZERTY (France) si la douchette propose ce choix |

**Pas de douchette ?** Deux solutions fonctionnent tout aussi bien :
- le bouton **appareil photo** à droite du champ de scan utilise la caméra du
  téléphone ou de la tablette (autorisez la caméra à la première utilisation) ;
- la **recherche par nom** : tapez les premières lettres du produit.

> **La caméra exige une adresse en `https`.** GitHub Pages est en `https`, tout
> fonctionne. En développement local sur `http://`, seul `localhost` est autorisé
> par les navigateurs.

---

## 5. Utilisation au quotidien

### Ouvrir la caisse le matin
**Caisse** → **Ouvrir la caisse** → saisissez le **fond de caisse** (les espèces
présentes dans le tiroir). Une seule caisse peut être ouverte à la fois par
point de vente.

### Encaisser
1. Scannez les articles (ou touchez-les dans la grille).
2. Ajustez les quantités avec **+** / **−**, ajoutez une remise si besoin
   (sur une ligne ou sur tout le ticket).
3. **Encaisser** → choisissez le moyen de paiement.
   - **Espèces** : saisissez le montant remis, le **rendu monnaie** s'affiche en
     grand. Des boutons de coupures accélèrent la saisie.
   - **Paiement mixte** : enregistrez un premier paiement partiel, le reste à
     payer se met à jour automatiquement.
4. **Valider l'encaissement** → le ticket s'affiche : **Imprimer (80 mm)** ou
   **PDF**.

### Fermer la caisse le soir
**Caisse** → **Clôturer** → comptez les espèces coupure par coupure. L'application
affiche le **théorique**, le **compté** et l'**écart**, puis génère le
**rapport Z** en PDF.

> Espèces théoriques = fond de caisse + espèces encaissées − remboursements.
> Les ventes annulées sont exclues du calcul.

### Réceptionner une livraison
**Réceptions** → **Nouveau bon de réception** → fournisseur, emplacement, puis
scannez les produits reçus. Indiquez le nombre de **colis** et les **bouteilles
par colis** : l'entrée en stock est convertie automatiquement.
**Valider et entrer en stock** met à jour le stock **et** les prix d'achat.

### Faire l'inventaire
**Inventaire** → **Nouvelle session** → choisissez l'emplacement → scannez
(chaque scan ajoute 1, le bouton **Scan continu** garde la caméra ouverte).
Corrigez les quantités à la main si besoin, renseignez le motif des écarts, puis
**Valider l'inventaire** : un mouvement d'ajustement est créé pour chaque écart.

### Étiqueter des produits sans code-barres
**Produits** → cochez les produits → **Étiquettes** → choisissez la disposition
(14, 24 ou 40 étiquettes par page A4) et le nombre d'exemplaires →
**Imprimer** ou **Télécharger le PDF**. Les produits sans code-barres reçoivent
automatiquement un code interne (`CAV000123`, préfixe modifiable dans les
paramètres) imprimé en **Code 128**.

---

## 6. Rôles et sécurité

| Rôle | Droits |
|---|---|
| **Administrateur** | Tout, y compris les paramètres, les utilisateurs et la suppression de produits |
| **Gérant** | Stock, réceptions, inventaire, produits, rapports, **annulations et retours** |
| **Caissier** | Caisse et clients uniquement |

Ces règles sont appliquées **par la base de données** (politiques *Row Level
Security*), pas seulement par l'interface : même en manipulant l'application, un
caissier ne peut pas lire les marges ni modifier le stock.

### Ce que la base refuse, pas seulement l'interface

Les restrictions sont écrites dans PostgreSQL (politiques *Row Level Security*).
Un employé qui interrogerait l'API directement, sans passer par l'application,
se heurte exactement aux mêmes murs. Le fichier
[`supabase/tests/securite.sql`](supabase/tests/securite.sql) rejoue ces
tentatives et affiche `OK` ou `ECHEC` pour chacune — vous pouvez le lancer sur
une base de démonstration pour le vérifier vous-même.

Ce qu'un **caissier** ne peut pas obtenir, même en contournant l'interface :

| Il tente de lire… | Résultat |
|---|---|
| Les prix d'achat (`products`) | refusé |
| Les marges (`v_products_full`) | refusé |
| La valeur du stock | refusé |
| Les mouvements de stock (ils portent le coût unitaire) | refusé |
| Les lignes de vente (coût d'achat figé) | refusé |
| Le journal d'audit | refusé |
| Les ventes des autres caissiers | refusé |
| Le catalogue de vente (`v_pos_catalog`) | **autorisé** — sans aucun coût |

La caisse passe par une vue dédiée, `v_pos_catalog`, amputée de toute donnée de
coût. C'est volontairement la seule porte d'entrée du caissier vers le catalogue.

De même, il ne peut ni modifier un prix, ni saisir un mouvement de stock, ni
générer un code produit, ni annuler une vente, ni écrire dans le journal d'audit.

### Deux protections à connaître

**1. Le rôle ne s'auto-attribue pas.** Les informations saisies à l'inscription
sont choisies librement par la personne qui s'inscrit. Elles ne décident donc
jamais du rôle : seul le **tout premier** compte devient administrateur, tous
les autres arrivent en « caissier ».

**2. Tout nouveau compte est INACTIF.** Un compte qui vient d'être créé ne voit
rien et ne peut rien faire tant qu'un administrateur ne l'a pas activé dans
**Paramètres → Utilisateurs et rôles** (les comptes en attente apparaissent en
tête de liste, signalés en orange). C'est la protection essentielle si l'adresse
de votre application venait à circuler : un inconnu peut créer un compte, il
reste devant une porte close.

> Vous pouvez aussi fermer complètement les inscriptions :
> Supabase → `Authentication` → `Sign Ups` → désactiver, puis créer les comptes
> vous-même depuis `Authentication` → `Users`.

**En cas de verrouillage** — si vous n'aviez plus aucun compte administrateur
actif — l'éditeur SQL de Supabase reste une porte de secours, réservée au
propriétaire du projet :

```sql
update public.profiles set role = 'admin', active = true
 where email = 'votre.adresse@exemple.com';
```

> 📄 **Le détail complet est dans [`SECURITE.md`](SECURITE.md)** : ce qui tourne
> en permanence pour empêcher une régression, les risques assumés, les limites
> honnêtes du dispositif, et la marche à suivre en cas de doute.

### Bonnes pratiques

- **Ne publiez jamais la clé `sb_secret_…`** (ou `service_role`) : elle contourne
  toutes les protections ci-dessus. Seule la clé *publishable* / `anon` va dans
  l'application — elle est conçue pour être publique, la sécurité reposant sur
  les politiques RLS.
- **Un compte par personne.** Les annulations, remises et ajustements sont tracés
  nominativement ; un compte partagé rend le journal d'audit inutile.
- **Désactivez plutôt que supprimer** un compte qui quitte l'entreprise :
  son historique reste lisible.
- Activez la **double authentification** sur vos comptes GitHub et Supabase :
  ce sont eux qui protègent l'ensemble.

**Journal d'audit** — les opérations sensibles sont enregistrées automatiquement
et ne peuvent être ni modifiées ni supprimées : modification de prix, suppression
de produit, annulation de vente, retour d'article, casse, ajustement de stock,
validation d'inventaire et de réception, ouverture et clôture de caisse,
changement de rôle. Consultable dans **Paramètres → Journal d'audit**.

---

## 7. Mode hors ligne

La caisse continue de fonctionner sans internet :

1. Le **catalogue** est mis en cache sur l'appareil à chaque chargement réussi.
2. Chaque vente est **d'abord écrite dans la mémoire du navigateur** (IndexedDB),
   avec un identifiant unique généré par le poste de caisse.
3. Un bandeau indique le nombre de ventes en attente.
4. Dès le retour du réseau, les ventes partent vers le serveur automatiquement
   (ou manuellement avec **Synchroniser**).

> **Aucun doublon possible** : la fonction serveur `pos_create_sale` est
> *idempotente* sur l'identifiant de vente. Rejouer une vente déjà enregistrée
> renvoie simplement le ticket existant.

**Limites honnêtes du mode hors ligne** : l'**ouverture** et la **clôture** de
caisse nécessitent une connexion (elles doivent être uniques côté serveur), et
le **numéro de ticket définitif** est attribué à la synchronisation — le ticket
imprimé hors ligne porte une référence provisoire (`HL-XXXXXX`) et reste valable.

---

## 8. Développement local

```bash
npm install                 # installer les dépendances
cp .env.example .env        # puis renseigner les 2 clés Supabase
npm run dev                 # http://localhost:5173
```

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | compilation de production (dossier `dist/`) |
| `npm run preview` | prévisualiser la compilation |
| `npm run typecheck` | vérification des types TypeScript |
| `npm test` | **tests des calculs critiques** (Vitest) |

### Tests automatisés

`npm test` vérifie **60 cas** portant sur ce qui ne doit jamais se tromper :

- arrondis au centime (y compris les pièges binaires du type `2.675`) et devises
  sans décimale (FCFA) ;
- remises de ligne et remise sur ticket, **répartie au prorata** avec le reliquat
  d'arrondi imputé à la dernière ligne (la somme des lignes est toujours égale au
  total, au centime) ;
- TVA déduite du TTC, ventilation par taux, marges ;
- **rendu monnaie**, paiement mixte, reste à payer ;
- comptage des espèces, **espèces théoriques et écart de caisse** ;
- sens des mouvements de stock, écarts d'inventaire, conversions carton ↔ bouteille ;
- codes-barres : clés de contrôle EAN-13 / EAN-8 / UPC-A, codes internes,
  nettoyage des saisies de douchette ;
- import / export CSV (échappement, séparateurs, guillemets).

Les montants attendus des tests marqués « parité avec PostgreSQL » ont été
**relevés sur une vraie base PostgreSQL** en exécutant `supabase/tests/smoke.sql` :
l'interface et le serveur affichent donc exactement les mêmes chiffres.

### Vérifier la base de données

Le fichier **`supabase/tests/smoke.sql`** déroule un scénario complet (ouverture
de caisse, vente avec remises, idempotence, annulation, retour, transfert,
inventaire, clôture) et affiche les résultats. À n'exécuter **que sur une base de
démonstration** : il crée de vraies ventes.

---

## 9. Modèle de données

```
auth.users ──1:1── profiles (role: admin | gerant | caissier)
                        │
app_settings            │ (devise, TVA, préfixes, pied de ticket, fuseau)
                        │
categories ──┐          │
suppliers ───┼── products ──┬── stock_levels ──── locations
             │              │        ▲
             │              │        │ (trigger)
             │              └── stock_movements ──┘
             │                   entrée / sortie / transfert
             │                   casse / ajustement / retour
             │
             ├── reception_lines ── receptions
             ├── inventory_lines ── inventory_sessions
             └── sale_items ─── sales ─── payments
                                  │  │
                      cash_sessions  └── sale_returns
                                  │
customers ────────────────────────┘        audit_log
```

**Principes**

- **Unité de base = 1 bouteille.** Un carton de 6 est enregistré comme 6 unités
  (champ `pack_size`). `purchase_price_ht` et `sale_price_ttc` sont toujours des
  prix **à l'unité de base**.
- **`stock_levels` n'est jamais écrit directement** : un déclencheur l'alimente à
  partir de `stock_movements`. L'historique est **immuable** (ni modification, ni
  suppression) : pour corriger, on crée un mouvement inverse.
- **Les ventes ne s'insèrent que par la fonction `pos_create_sale`**, qui calcule
  tous les montants côté serveur, décrémente le stock et contrôle que les
  paiements couvrent le ticket. Une vente ne se supprime pas : elle s'annule.
- **Les vues de reporting** (`v_products_full`, `v_stock_by_location`,
  `v_low_stock`, `v_stock_value`, `v_movements_full`, `v_sale_items_full`,
  `v_sales_daily`, `v_top_products`, `v_payments_breakdown`,
  `v_cash_session_report`, `v_inventory_lines_full`) respectent les mêmes
  politiques RLS que les tables.

**Fonctions appelables depuis l'application**

| Fonction | Rôle requis | Effet |
|---|---|---|
| `pos_create_sale(jsonb)` | caissier | Crée une vente (idempotente), décrémente le stock |
| `cancel_sale(uuid, text)` | gérant | Annule une vente, remet le stock, trace |
| `return_sale_item(uuid, numeric, text)` | gérant | Retour partiel d'un article |
| `open_cash_session` / `close_cash_session` | caissier | Ouverture / clôture (rapport Z) |
| `record_movement` / `transfer_stock` | gérant | Mouvement simple / transfert |
| `validate_reception(uuid)` | gérant | Entrée en stock + mise à jour des prix d'achat |
| `inventory_scan` / `validate_inventory` | gérant | Comptage / application des écarts |
| `next_internal_code()` | caissier | Code interne unique pour un nouveau produit |

---

## 10. Questions fréquentes et dépannage

**L'application affiche « Configuration Supabase manquante ».**
Les secrets GitHub sont absents ou mal nommés. Vérifiez
`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Settings → Secrets and
variables → Actions), puis relancez le workflow dans l'onglet **Actions**.

**Page blanche ou erreur 404 après le déploiement.**
Le chemin de base ne correspond pas au nom du dépôt. Le workflow le règle tout
seul ; si vous compilez à la main, utilisez
`VITE_BASE_PATH=/nom-du-depot/ npm run build`. L'application utilise `HashRouter`
(adresses avec `#`), ce qui évite les 404 au rafraîchissement.

**« Droits insuffisants » sur une action.**
Votre rôle ne le permet pas. Un administrateur peut le modifier dans
**Paramètres → Utilisateurs et rôles**.

**La caméra ne démarre pas.**
Vérifiez que l'adresse commence par `https`, puis autorisez la caméra dans le
navigateur. Sur iPhone : **Réglages → Safari → Caméra → Autoriser**.

**La douchette tape les codes mais rien ne se passe.**
Elle n'envoie probablement pas de touche **Entrée** en fin de scan. Reportez-vous
à sa notice et scannez le code de configuration « suffixe CR / Entrée ».

**Le stock est négatif.**
C'est autorisé volontairement (une vente hors ligne peut passer avant une
réception). La valeur apparaît en rouge et un inventaire la corrige.

**Je veux passer en FCFA.**
**Paramètres → Boutique et devise** → choisissez la devise : le symbole et le
nombre de décimales (0 pour le FCFA) s'ajustent, y compris les coupures proposées
au comptage de caisse. Le jeu de démonstration (`seed.sql`) est déjà livré en
FCFA, avec le fuseau `Africa/Abidjan` pour que les journées comptables se
clôturent à minuit heure locale.

**Quel taux de TVA en Côte d'Ivoire ?**
Le taux normal est de **18 %**. Les fichiers livrés sont réglés sur **20 %** :
changez-le dans **Paramètres → Boutique et devise → Taux de TVA par défaut**,
puis sur les fiches produits déjà créées (le taux est figé par produit, pour
pouvoir gérer plusieurs taux). Les ventes déjà enregistrées conservent le taux
appliqué au moment de la vente, comme le veut la comptabilité.

**Comment suivre Orange Money, Wave et les autres séparément ?**
C'est automatique : en caisse, le mode « Mobile money » demande l'opérateur.
Le rapport Z et l'onglet **Rapports → Moyens de paiement** détaillent ensuite
chaque opérateur, ce qui permet de rapprocher son relevé compte par compte.
La liste des opérateurs se modifie dans **Paramètres → Boutique et devise**.

**Mes ventes hors ligne ont-elles été perdues ?**
Non. Elles restent sur l'appareil tant qu'elles ne sont pas synchronisées. Le
bandeau en haut indique combien sont en attente ; **ne videz pas les données du
navigateur** avant leur envoi.

**Combien ça coûte ?**
L'offre gratuite de Supabase (500 Mo de base, projet mis en veille après une
semaine d'inactivité) suffit largement pour une cave. GitHub Pages est gratuit
pour les dépôts publics. Pour un usage professionnel continu, l'offre payante
Supabase (environ 25 $/mois) évite la mise en veille et ajoute les sauvegardes
automatiques.

---

## Structure du projet

```
cave-pos/
├─ .github/workflows/
│  ├─ deploy.yml           # déploiement GitHub Pages à chaque push sur main
│  └─ ci.yml               # vérification des pull requests
├─ supabase/
│  ├─ schema.sql           # tables, index, triggers, vues, fonctions, RLS
│  ├─ seed.sql             # données de démonstration (26 références)
│  └─ tests/smoke.sql      # scénario de test de bout en bout
├─ public/icons/           # icônes de la PWA
├─ scripts/
│  └─ generate-icons.py    # régénère les icônes
├─ src/
│  ├─ lib/                 # calculs, formats, codes-barres, PDF, exports, hors ligne
│  ├─ hooks/               # authentification, paramètres, synchronisation, réseau
│  ├─ components/          # kit d'interface, scan, fiche produit, étiquettes
│  ├─ pos/                 # caisse : paiement, ticket, sessions
│  ├─ pages/               # un fichier par écran
│  ├─ store/cart.ts        # panier de la caisse
│  ├─ types/database.ts    # types TypeScript miroir du schéma SQL
│  └─ test/                # tests Vitest
└─ README.md
```

## Licence

Code fourni tel quel, librement réutilisable et modifiable pour votre activité.
