// Migrate Steven's leaderboard records into his player_profiles document.
// Uses the public Firebase Web SDK (no admin credentials needed).

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, query, where } from 'firebase/firestore';
import { readFileSync } from 'fs';

const firebaseConfig = {
  apiKey: "REVOKED_FIREBASE_API_KEY",
  authDomain: "sudokuzen-f2aa3.firebaseapp.com",
  projectId: "sudokuzen-f2aa3",
  storageBucket: "sudokuzen-f2aa3.firebasestorage.app",
  messagingSenderId: "123072021375",
  appId: "1:123072021375:web:a7cee11c8bd7f6dffd904a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Step 1: Find Steven's playerId from alias index
async function findStevenPlayerId() {
  const aliasDoc = await getDoc(doc(db, 'alias_player_index', 'steven'));
  if (!aliasDoc.exists()) {
    console.log('Steven not found in alias index');
    return null;
  }
  const data = aliasDoc.data();
  console.log('Found Steven:', data);
  return data.playerId;
}

// Step 2: Scan all levels for Steven's records
async function scanLeaderboards() {
  // Load all level IDs from levels-data.json
  const levelsData = JSON.parse(readFileSync('levels-data.json', 'utf-8'));
  const levelIds = [...new Set(levelsData.map(l => l.id))].sort((a, b) => a - b);
  console.log(`Scanning ${levelIds.length} levels...`);

  const records = {};
  let found = 0;
  let scanned = 0;

  // Batch in groups of 10 for speed
  for (let i = 0; i < levelIds.length; i += 10) {
    const batch = levelIds.slice(i, i + 10);
    const promises = batch.map(async (levelId) => {
      try {
        const playersRef = collection(db, 'level_first_clears', String(levelId), 'players');
        const snap = await getDocs(playersRef);
        for (const playerDoc of snap.docs) {
          const data = playerDoc.data();
          const a = (data.alias || '').toLowerCase();
        if (a === 'steven' || a === 'mm') {
          if (!allPlayers[data.alias]) allPlayers[data.alias] = { pid: playerDoc.id, records: {} };
          allPlayers[data.alias].records[String(levelId)] = {
            records[String(levelId)] = {
              time: data.firstTimeSec || 0,
              stars: data.firstStars || 1,
              replayHistory: [],
            };
            found++;
          }
        }
      } catch (e) {
        // Skip errors (permission issues on some collections)
      }
    });
    await Promise.all(promises);
    scanned += batch.length;
    if (scanned % 100 === 0) {
      process.stdout.write(`  ${scanned}/${levelIds.length} scanned, ${found} found\r`);
    }
  }

  console.log(`\nDone! Found ${found} records for Steven.`);
  return records;
}

// Step 3: Write records into Steven's profile
async function writeProfile(playerId, records) {
  const profileRef = doc(db, 'player_profiles', playerId);
  const existing = await getDoc(profileRef);
  const existingData = existing.exists() ? existing.data() : {};

  // Merge: keep existing records if better
  const mergedRecords = { ...(existingData.records || {}), ...records };

  await setDoc(profileRef, {
    playerId,
    alias: 'Steven',
    records: mergedRecords,
    speedRecords: existingData.speedRecords || {},
    achievements: existingData.achievements || {},
    settings: existingData.settings || {},
  }, { merge: true });

  console.log(`Written ${Object.keys(mergedRecords).length} records to profile ${playerId}`);
}

// Main
async function main() {
  console.log('=== Steven Profile Migration ===\n');

  const playerId = await findStevenPlayerId();
  if (!playerId) {
    console.log('Aborting: no playerId found');
    process.exit(1);
  }
  console.log(`PlayerId: ${playerId}\n`);

  const records = await scanLeaderboards();
  if (Object.keys(records).length === 0) {
    console.log('No leaderboard records found for Steven');
    process.exit(0);
  }

  console.log('\nSample records:');
  const sample = Object.entries(records).slice(0, 5);
  for (const [lid, rec] of sample) {
    console.log(`  Level ${lid}: ${rec.time}s, ${rec.stars}★`);
  }

  console.log('\nWriting to profile...');
  await writeProfile(playerId, records);
  console.log('\nMigration complete!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
