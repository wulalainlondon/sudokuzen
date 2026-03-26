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

## 2) Fill config safely (recommended)

Keep `firebase-config.js` in repo as `null` and use a local override file.

1. Copy:

```bash
cp firebase-config.local.example.js firebase-config.local.js
```

2. Edit `firebase-config.local.js` and fill your real key.

`firebase-config.local.js` is git-ignored and will not be pushed.

## 3) Legacy method (not recommended)

Edit `firebase-config.js` and replace `null` with your config:

```js
window.SUDOKU_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  appId: "...",
};
```

## 4) Enable Firestore

Create Firestore Database in production mode (or test mode for local testing).

## 5) Firestore data shape

Collection path used by the game:

`level_first_clears/{levelId}/players/{playerId}`

Fields:
- `playerId` (string)
- `alias` (string)
- `firstTimeSec` (number)
- `firstStars` (number)
- `createdAt` (timestamp)

## 6) Firestore data shape — Duo Room

Collection path used by duo mode:

`duo_room/current`

Fields:
- `levelId` (number)
- `status` (string: 'idle' | 'waiting' | 'countdown' | 'playing' | 'finished')
- `hostId`, `hostAlias`, `hostReady`, `hostProgress`, `hostFinishTime`, `hostStars`
- `guestId`, `guestAlias`, `guestReady`, `guestProgress`, `guestFinishTime`, `guestStars`
- `startAt` (timestamp, set when both ready)
- `updatedAt` (timestamp)

## 7) Suggested Firestore Rules

Go to Firebase Console → Firestore Database → Rules tab, paste and publish:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Leaderboard: public read, first-write-only per player
    match /level_first_clears/{levelId}/players/{playerId} {
      allow read: if true;
      allow create: if request.resource.data.playerId == playerId
                    && request.resource.data.firstTimeSec is int
                    && request.resource.data.firstStars is int;
      allow update, delete: if false;
    }

    // Duo room: public read/write (only 2 players use this)
    match /duo_room/{docId} {
      allow read, write: if true;
    }
  }
}
```

Adjust as needed for stronger anti-abuse (App Check / auth / Cloud Functions).

## 8) GitHub Actions 自動部署 Firebase 預覽站（不影響正式 GitHub Pages）

Repo 已加入 `.github/workflows/deploy-firebase-preview.yml`，會把 `main` 部署到 Firebase Hosting preview channel：`web-preview`。

你需要在 GitHub repo secrets 新增：

- `FIREBASE_SERVICE_ACCOUNT`
  - 值為 Firebase/GCP service account JSON（整段 JSON 字串）
  - 權限至少可部署 Hosting（Firebase Hosting Admin）

部署後可用 Firebase preview URL 做線上調整與驗證，不會影響 GitHub Pages 既有用戶。

## 9) 不等 GitHub，直接本機一鍵部署（推薦調整期）

已加入 npm scripts：

- `npm run deploy:preview`
  - 建置後直接部署到 Firebase preview channel `web-preview`
- `npm run deploy:live`
  - 建置後直接部署到 Firebase Hosting 正式站

兩者都會先跑 `build:firebase`，確保使用 Firebase base path 與完整靜態資產輸出。
