# Sécurité

Ce document décrit ce qui protège l'application, ce qui tourne en permanence
pour l'empêcher de se dégrader, et ce qui n'est **pas** couvert.

---

## 1. Les trois niveaux de protection

**La base de données.** C'est le seul vrai rempart. Les droits sont écrits dans
PostgreSQL (politiques *Row Level Security*), si bien qu'un employé qui
interrogerait l'API sans passer par l'application se heurte aux mêmes murs.
L'interface, elle, ne fait que masquer des boutons — elle ne protège rien.

**Les contrôles automatiques.** Ils vérifient en continu que ces règles sont
toujours en place et qu'aucune faille connue n'est apparue dans les
bibliothèques utilisées.

**L'exploitation quotidienne.** Un compte par personne, des rôles justes, un
journal d'audit consulté de temps en temps.

---

## 2. Ce qui tourne en permanence

| Quand | Ce qui est vérifié |
|---|---|
| À chaque modification du code | Les trois contrôles ci-dessous |
| À chaque proposition de modification | Les trois contrôles ci-dessous |
| **Chaque jour à 5h17**, même sans activité | Les trois contrôles ci-dessous |
| Avant chaque mise en ligne | Les contrôles statiques |

### Contrôles statiques — `npm run audit:securite`

Vingt règles vérifient des propriétés qui doivent rester vraies quoi qu'il
arrive : sécurité par ligne active sur les 19 tables, vues qui respectent les
droits de l'appelant, fonctions privilégiées qui contrôlent leur appelant, rôle
jamais lu dans les données fournies par le client, comptes créés inactifs,
journal d'audit non falsifiable, aucun accès pour un visiteur non connecté,
tables de coûts fermées au caissier, caisse branchée sur les vues sans coût,
aucun secret dans le dépôt.

Chaque règle correspond à une faille réellement rencontrée, pas à une bonne
pratique générique. **Elles ont toutes été vérifiées par mutation** : on
réintroduit la faille, l'audit doit la voir. Sept sur sept ont été détectées.

### Failles des bibliothèques — `npm run audit:dependances`

Bloque dès qu'une faille de niveau *haut* ou supérieur apparaît dans une
bibliothèque **livrée au navigateur**. Les failles déjà examinées figurent dans
`scripts/audit-dependances.mjs` avec leur justification **et une date de
réexamen** : passée cette date, le contrôle échoue à nouveau, pour qu'une
exception ne devienne jamais un oubli permanent.

Les outils de développement (compilateur, tests) font l'objet d'un rapport
séparé, non bloquant : ils ne partent pas chez le commerçant.

### Tentatives d'intrusion — `scripts/test-intrusion.sh`

Le plus important : sur une base PostgreSQL jetable, on crée un compte de
caissier et **on rejoue réellement les attaques** — lire les prix d'achat, les
marges, la valeur du stock, les mouvements, le journal d'audit, les ventes des
autres ; modifier un prix, saisir un mouvement, annuler une vente, écrire dans
le journal. Chaque tentative doit être refusée.

Le script vérifie aussi que **les refus attendus sont bien présents** : sans
cela, une régression qui ouvrirait les droits passerait inaperçue, puisque
« plus d'erreur » ressemble à « tout va bien ».

### Quand un contrôle échoue

Vous recevez une notification de GitHub. Ouvrez l'onglet **Actions** du dépôt :
le message indique exactement quelle règle a cédé. **Ne mettez pas en ligne**
tant que ce n'est pas réglé. Les contrôles statiques tournent aussi avant chaque
déploiement, qui est donc bloqué de lui-même.

---

## 3. Risques connus et assumés

| Risque | Pourquoi il est accepté |
|---|---|
| `xlsx` — faille haute, sans correctif | Les deux failles concernent la **lecture** de classeurs. L'application n'en écrit que ; les imports sont en CSV, analysés par notre propre code. Une règle d'audit interdit d'introduire une lecture. Réexamen le 1er avril 2027. |
| Outils de développement vulnérables | Ces paquets ne sont pas livrés au navigateur. Rapport surveillé, non bloquant. |
| La clé publique est visible | C'est sa nature. Toute la sécurité repose sur les politiques RLS, pas sur le secret de cette clé. |
| Les prix sont envoyés par la caisse | Un caissier peut saisir une remise non autorisée. Choix volontaire : une caisse doit pouvoir ajuster un prix. Toute remise est enregistrée et visible dans les rapports. |

---

## 4. Ce qui n'est PAS couvert

Soyons clairs sur les limites :

- **Rien ne surveille votre base en temps réel.** Si quelqu'un obtient votre mot
  de passe d'administrateur, aucun contrôle automatique ne s'en apercevra. C'est
  le journal d'audit, consulté régulièrement, qui vous l'apprendra.
- **Aucune détection d'intrusion ni pare-feu applicatif.** Cela demanderait une
  infrastructure que ce projet n'a pas. Supabase assure de son côté la limitation
  du nombre de tentatives de connexion.
- **Les contrôles portent sur le code, pas sur vos données.** Ils ne verront pas
  qu'un employé a été promu administrateur à tort : cela se vérifie dans
  *Paramètres → Utilisateurs et rôles*.
- **Aucune sauvegarde n'est gérée ici.** L'offre gratuite de Supabase n'en
  propose pas de quotidienne ; pour une activité réelle, c'est le premier
  argument en faveur de l'offre payante.

---

## 5. À faire de votre côté

**Chaque semaine** — *Paramètres → Utilisateurs et rôles* : vérifier qu'aucun
compte inconnu n'attend d'être activé et que les rôles sont justes.

**Chaque mois** — *Paramètres → Journal d'audit* : parcourir les annulations de
vente, les ajustements de stock et les modifications de prix.

**Une fois** — activer la double authentification sur vos comptes GitHub et
Supabase. Ce sont eux qui protègent tout le reste. Et conserver le mot de passe
de la base dans un gestionnaire de mots de passe, pas dans un carnet.

**En cas de doute sur une intrusion :**
1. Supabase → `Authentication` → `Users` : supprimer les comptes inconnus.
2. Dans l'application, désactiver les comptes suspects et changer votre mot de passe.
3. Supabase → `Settings` → `API Keys` : régénérer les clés, puis mettre à jour
   les deux secrets GitHub et relancer le déploiement.
4. Lire le journal d'audit pour mesurer ce qui a été touché.

---

## 6. Lancer les contrôles soi-même

```bash
npm run audit            # contrôles statiques + failles des bibliothèques
npm run audit:securite   # règles de sécurité du schéma et du code
npm run audit:dependances# failles connues des bibliothèques livrées
npm test                 # calculs critiques (TVA, remises, rendu monnaie…)
```

Pour rejouer les attaques, il faut un PostgreSQL local :

```bash
PSQL="psql -h localhost -U postgres -d base_de_test" ./scripts/test-intrusion.sh
```

⚠ Uniquement sur une base jetable : le script crée des ventes et un compte
d'intrus, et installe une imitation du schéma `auth` de Supabase.
