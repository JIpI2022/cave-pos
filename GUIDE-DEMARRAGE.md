# Guide de démarrage — Cave & Caisse

*À imprimer et à garder près de la caisse.*

**Adresse de l'application :** https://jipi2022.github.io/cave-pos/

---

## 1. Installer l'application sur le téléphone

Une seule fois, au début. L'application s'installe comme n'importe quelle
application, avec son icône sur l'écran d'accueil.

**Sur Android (Chrome)**
1. Ouvrir l'adresse ci-dessus dans Chrome.
2. Toucher le menu **⋮** (trois points, en haut à droite).
3. **Ajouter à l'écran d'accueil** → **Installer**.

**Sur iPhone (Safari obligatoire — Chrome ne sait pas le faire)**
1. Ouvrir l'adresse dans **Safari**.
2. Toucher le bouton **Partager** (carré avec une flèche vers le haut).
3. **Sur l'écran d'accueil** → **Ajouter**.

L'application se met à jour toute seule. Si un écran semble figé sur une
ancienne version, fermer complètement l'application et la rouvrir.

---

## 2. Créer son compte

1. Sur l'écran d'accueil de l'application, toucher **Créer un compte**.
2. Saisir son nom, son adresse e-mail, et un mot de passe d'au moins
   6 caractères — **à retenir ou à noter en lieu sûr**.
3. Toucher **Créer le compte**.

Un message indiquera que le compte **attend d'être activé**. C'est normal et
voulu : c'est ce qui empêche un inconnu de rentrer. Prévenir l'administrateur,
qui activera le compte depuis *Paramètres → Utilisateurs et rôles*.

> **Un compte par personne.** Chaque annulation, chaque remise, chaque
> correction de stock est enregistrée au nom de celui qui l'a faite. Un compte
> partagé rend ce suivi inutile.

---

## 3. La journée type

### Le matin — ouvrir la caisse
**Caisse** → **Ouvrir la caisse** → saisir le **fond de caisse**, c'est-à-dire
l'argent déjà présent dans le tiroir avant la première vente.

### Encaisser
1. Scanner l'article, ou le toucher dans la liste, ou taper son nom.
2. Ajuster la quantité avec **+** et **−** si besoin.
3. Toucher **Encaisser**.
4. Choisir le moyen de paiement :
   - **Espèces** : saisir le montant remis par le client — le **rendu monnaie**
     s'affiche en grand.
   - **Mobile money** : choisir l'opérateur (Orange Money, MTN, Moov, Wave).
   - **Paiement mixte** : enregistrer un premier paiement partiel, le reste à
     payer se met à jour tout seul.
5. **Valider l'encaissement** → le ticket s'affiche. **Imprimer** ou **PDF**.

### Le soir — fermer la caisse
**Caisse** → **Clôturer** → compter les espèces coupure par coupure.
L'application affiche le **théorique**, le **compté** et l'**écart**, puis
produit le rapport de fin de journée en PDF.

---

## 4. S'il n'y a pas de réseau

**On continue à vendre normalement.** Un bandeau indique « Mode hors ligne ».

Les ventes sont enregistrées **dans le téléphone** et partent toutes seules dès
que la connexion revient. Le ticket imprimé reste valable ; il porte une
référence provisoire qui commence par `HL-`.

⚠️ **Deux précautions :**
- **Ne pas vider les données du navigateur** tant que le bandeau annonce des
  ventes en attente : elles seraient perdues.
- **L'ouverture et la clôture de caisse ont besoin du réseau.** Ouvrir la caisse
  le matin quand la connexion est bonne.

---

## 5. Les petits pièges

| Situation | Quoi faire |
|---|---|
| Un code scanné est inconnu | Le responsable crée la fiche produit sur-le-champ (le code est déjà prérempli). |
| Erreur sur une vente déjà validée | Seul un gérant peut annuler : **Ventes** → ouvrir le ticket → **Annuler**. Un motif est obligatoire. |
| Un client rapporte une bouteille | **Ventes** → le ticket → **Retour** sur la ligne concernée. |
| Le stock affiché paraît faux | Faire un **Inventaire** sur l'emplacement : scanner, compter, valider. |
| Le scan ne fonctionne pas | Utiliser le bouton **appareil photo** à droite du champ, ou taper le nom du produit. |

---

## 6. Qui a le droit de quoi

| | Caissier | Gérant | Administrateur |
|---|:--:|:--:|:--:|
| Vendre, encaisser, imprimer | ✅ | ✅ | ✅ |
| Voir les prix d'achat et les marges | — | ✅ | ✅ |
| Modifier les produits et le stock | — | ✅ | ✅ |
| Annuler une vente, accepter un retour | — | ✅ | ✅ |
| Créer des comptes, changer les rôles | — | — | ✅ |

Un caissier ne voit **jamais** vos prix d'achat ni vos marges. Cette règle est
appliquée par la base de données, pas seulement par l'écran.
