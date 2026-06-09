# Urban3DQuest Flash Only

Ce dossier est un nouveau projet derive de Urban3DQuest, simplifie pour ne garder que le mode Flash (miniatures uniques).

## Ce qui est force dans cette variante

- Mode actif verrouille sur `unique`.
- Onglet Quete masque dans l'interface.
- UI guidee uniquement pour les captures Flash.
- FAB Quete masque.

## Lancer localement

Ce projet est statique (pas de build).

1. Servir le dossier avec un serveur HTTP statique.
2. Ouvrir `index.html` via ce serveur.
3. Configurer les cles Supabase dans `js/supabase-env.js`.

## Fichiers modifies pour le mode Flash-only

- `index.html`
- `js/config.js`
- `js/game-init.js`
- `manifest.json`
- `package.json`

## Note backend

Le projet continue d'utiliser Supabase et la table `treasures` avec `type = 'unique'` pour le gameplay Flash.
