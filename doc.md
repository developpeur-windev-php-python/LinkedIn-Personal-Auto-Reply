# Analyse de l'extension Chrome "LinkedIn Personal Auto-Reply"

L'extension a pour but de générer des brouillons de commentaires sur les publications LinkedIn en utilisant l'API d'OpenRouter. L'utilisateur place son curseur dans une zone de commentaire, appuie sur `Alt+G` (ou utilise le popup), et l'extension génère une proposition de réponse.

## Fichiers et leurs rôles

*   **`manifest.json`**
    *   **Rôle** : Fichier de configuration principal.
    *   **Détails** : Définit le nom, la version, les permissions (`storage`, `activeTab`, `scripting`), et déclare les autres scripts. Il enregistre `background.js` comme service worker, `content-script.js` pour s'exécuter sur les pages LinkedIn, et définit les pages `popup.html` et `options.html`. Il configure également le raccourci clavier `Alt+G`.

*   **`background.js`**
    *   **Rôle** : Le "cerveau" de l'extension.
    *   **Détails** : Il tourne en arrière-plan et gère la logique principale. Il reçoit le texte d'un post LinkedIn via le `content-script.js`, construit une requête, et appelle l'API OpenRouter avec la clé et le modèle configurés par l'utilisateur. Il gère aussi un historique simple des posts déjà traités pour éviter les doublons.

*   **`content-script.js`**
    *   **Rôle** : Interaction avec la page LinkedIn.
    *   **Détails** : Ce script est injecté dans LinkedIn. Il détecte quand l'utilisateur veut générer un commentaire (via le raccourci `Alt+G`). Il extrait le texte du post concerné, tente de deviner la langue, puis envoie ces informations au `background.js`. Une fois le brouillon reçu en retour, il l'insère dans la zone de commentaire et affiche des boutons de contrôle (`Valider`, `Regénérer`, `Fermer`).

*   **`options.html` & `options.js`**
    *   **Rôle** : Page de configuration.
    *   **Détails** : Fournit une interface où l'utilisateur peut sauvegarder sa clé API OpenRouter, choisir le modèle de langue (IA), et personnaliser le "system prompt" (les instructions de base pour l'IA). Ces paramètres sont sauvegardés localement via `chrome.storage.local`.

*   **`popup.html` & `popup.js`**
    *   **Rôle** : Fenêtre d'action rapide.
    *   **Détails** : C'est la petite fenêtre qui apparaît quand on clique sur l'icône de l'extension. Elle contient un simple bouton pour déclencher la génération du commentaire, ce qui revient à utiliser le raccourci `Alt+G`.

## Résumé

C'est une extension bien structurée pour un usage personnel, qui automatise la rédaction de commentaires en s'appuyant sur un service d'IA externe, tout en laissant à l'utilisateur la validation finale.
