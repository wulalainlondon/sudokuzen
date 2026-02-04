# Firebase Setup (First-Clear Leaderboard)

This game now supports a public "first clear" leaderboard per level (`TOP 3`):
- first clear time
- first clear stars
- player alias (local generated)

## 1) Create Firebase project + Web app

1. Go to Firebase Console.
2. Create a project.
3. Add a Web app.
4. Copy the web config object.

## 2) Fill config

Edit `firebase-config.js` and replace `null` with your config:

```js
window.SUDOKU_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  appId: "...",
};
```

## 3) Enable Firestore

Create Firestore Database in production mode (or test mode for local testing).

## 4) Firestore data shape

Collection path used by the game:

`level_first_clears/{levelId}/players/{playerId}`

Fields:
- `playerId` (string)
- `alias` (string)
- `firstTimeSec` (number)
- `firstStars` (number)
- `createdAt` (timestamp)

## 5) Suggested Firestore Rules

These rules allow public read and first-write-only per player doc id.

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /level_first_clears/{levelId}/players/{playerId} {
      allow read: if true;
      allow create: if request.resource.data.playerId == playerId
                    && request.resource.data.firstTimeSec is int
                    && request.resource.data.firstStars is int;
      allow update, delete: if false;
    }
  }
}
```

Adjust as needed for stronger anti-abuse (App Check / auth / Cloud Functions).

