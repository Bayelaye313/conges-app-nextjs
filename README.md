# Registre des Congés

L'application Next.js se trouve dans le sous-dossier `conges-app`. Vous pouvez
maintenant lancer les commandes depuis la racine du projet :

```bash
npm install
npm run dev
```

Puis ouvrez http://localhost:3000.

Avant la première utilisation (import des agents, des congés et génération des codes
d'accès), suivre la section « Mise en service » de `conges-app/README.md`.

L'installation à la racine réinstalle les dépendances de l'application à partir
de son fichier de verrouillage. C'est nécessaire après avoir copié le projet
depuis Windows vers Linux : le dossier `node_modules` peut contenir des
dépendances spécifiques à Windows.

Pour créer et lancer la version de production, toujours depuis la racine :

```bash
npm run build
npm run start
```
