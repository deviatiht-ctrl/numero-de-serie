# AI INFLUENCE — Dashboard Tickets (10 HTG)

Tableau de bord moderne pour gérer les billets papier de l'événement, de
l'impression jusqu'à la porte d'entrée. Toutes les données sont sur **Supabase** —
plusieurs membres de l'équipe peuvent agir en même temps, et le dashboard se met
à jour **en temps réel**.

## Cycle de vie d'un billet

```
[En stock] ──vente 10 HTG──> [Vendu] ──contrôle à la porte──> [Entré]
```

1. **Stock** — enregistrez les numéros de série des billets imprimés, un par un.
2. **Vendre** — quand l'acheteur paie ses 10 gourdes, entrez le numéro du billet
   remis → il passe « Vendu » avec le nom du vendeur. Permet de compter l'argent :
   *X billets vendus × 10 HTG = montant que le vendeur doit remettre.*
3. **Entrée** — à la porte, entrez le numéro présenté :
   - Numéro inconnu → **FAUX BILLET** (rouge)
   - « En stock » → **BILLET JAMAIS VENDU** (orange — papier authentique mais non payé)
   - « Vendu » → **ENTRÉE AUTORISÉE** (vert) → passe « Entré »
   - « Entré » → **DÉJÀ ENTRÉ** (rouge — possible photocopie, un numéro ne marche qu'une fois)

## Fichiers

| Fichier      | Rôle                                                   |
| ------------ | ------------------------------------------------------ |
| `index.html` | Page de connexion + dashboard (4 sections)             |
| `styles.css` | Design (light mode, thème IA)                          |
| `app.js`     | Logique : auth, stock, ventes, check-in, stats         |
| `config.js`  | Vos clés Supabase (à modifier)                         |
| `schema.sql` | SQL pour créer la table `aif_tickets` dans Supabase    |

## Installation (5 étapes)

1. **Ouvrez votre projet Supabase** sur https://supabase.com
   (le préfixe `aif_` évite tout conflit avec vos tables actuelles).

2. **Exécutez le SQL** — Supabase Dashboard → **SQL Editor** → New query →
   copiez tout le contenu de `schema.sql` → **Run**.

3. **Créez les comptes de l'équipe** — Supabase Dashboard →
   **Authentication → Users → Add user** → email + mot de passe pour chaque membre.

4. **Renseignez `config.js`** — Supabase Dashboard →
   **Project Settings → API** → copiez `Project URL` et `anon public key`,
   remplacez `VOTRE-PROJET` et `VOTRE-ANON-KEY` dans `config.js`.

5. **Ouvrez `index.html`** — double-cliquez dessus, ou servez le dossier :
   ```
   npx serve .
   ```

## Sécurité & anti-fraude

- `serial_number` est **unique** : impossible d'enregistrer deux fois le même numéro.
- Les transitions `stock → sold → used` sont **atomiques** (`.eq("status", ...)`)
  : deux vendeurs ne peuvent pas vendre le même billet en même temps, et deux
  contrôleurs ne peuvent pas faire entrer le même billet simultanément.
- **RLS** : seuls les membres connectés lisent/écrivent ; un membre ne peut
  supprimer que les numéros **en stock** qu'il a lui-même ajoutés.
- Ne mettez jamais la `service_role` key dans le code — elle donne tous les droits.
