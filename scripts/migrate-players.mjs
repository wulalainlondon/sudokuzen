// Migrate player leaderboard records into their player_profiles.
// Scans level_first_clears for target aliases, aggregates records, writes profiles.

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
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

// Target aliases (case-insensitive match)
const TARGET_ALIASES = ['steven', 'mm'];

// Step 1: Find playerIds from alias index
async function findPlayerIds() {
  const players = {};
  for (const alias of TARGET_ALIASES) {
    const aliasDoc = await getDoc(doc(db, 'alias_player_index', alias.toLowerCase()));
    if (aliasDoc.exists()) {
      const data = aliasDoc.data();
      players[alias] = { playerId: data.playerId, aliasDisplay: data.aliasDisplay, records: {} };
      console.log(`Found ${data.aliasDisplay}: playerId=${data.playerId}`);
    } else {
      console.log(`${alias}: not in alias_player_index, will create from leaderboard data`);
      players[alias] = { playerId: null, aliasDisplay: alias, records: {} };
    }
  }
  return players;
}

// Step 2: Scan all levels for target players' records
async function scanLeaderboards(players) {
  const levelsData = JSON.parse(readFileSync('levels-data.json', 'utf-8'));
  const levelIds = [...new Set(levelsData.map(l => l.id))].sort((a, b) => a - b);
  console.log(`\nScanning ${levelIds.length} levels...`);

  let scanned = 0;
  let totalFound = 0;

  for (let i = 0; i < levelIds.length; i += 10) {
    const batch = levelIds.slice(i, i + 10);
    const promises = batch.map(async (levelId) => {
      try {
        const playersRef = collection(db, 'level_first_clears', String(levelId), 'players');
        const snap = await getDocs(playersRef);
        for (const playerDoc of snap.docs) {
          const data = playerDoc.data();
          const aliasLower = (data.alias || '').toLowerCase();
          const match = TARGET_ALIASES.find(t => t === aliasLower);
          if (match) {
            const player = players[match];
            // If we didn't have a playerId from alias_index, use the one from leaderboard
            if (!player.playerId) {
              player.playerId = data.playerId || playerDoc.id;
              player.aliasDisplay = data.alias;
            }
            player.records[String(levelId)] = {
              time: data.firstTimeSec || 0,
              stars: data.firstStars || 1,
              replayHistory: [],
            };
            totalFound++;
          }
        }
      } catch (e) {
        // Skip permission errors
      }
    });
    await Promise.all(promises);
    scanned += batch.length;
    if (scanned % 200 === 0 || scanned === levelIds.length) {
      process.stdout.write(`  ${scanned}/${levelIds.length} scanned, ${totalFound} records found\n`);
    }
  }

  return players;
}

// Step 3: Write profiles
async function writeProfiles(players) {
  for (const [alias, player] of Object.entries(players)) {
    const recordCount = Object.keys(player.records).length;
    if (recordCount === 0) {
      console.log(`\n${player.aliasDisplay}: no records found, skipping`);
      continue;
    }

    console.log(`\n${player.aliasDisplay}: ${recordCount} records`);
    const sample = Object.entries(player.records).slice(0, 5);
    for (const [lid, rec] of sample) {
      console.log(`  Level ${lid}: ${rec.time}s, ${rec.stars}★`);
    }

    if (!player.playerId) {
      // Generate a playerId
      player.playerId = `p_migrated_${alias}`;
      console.log(`  Generated playerId: ${player.playerId}`);
    }

    // Write profile
    const profileRef = doc(db, 'player_profiles', player.playerId);
    const existing = await getDoc(profileRef);
    const existingData = existing.exists() ? existing.data() : {};
    const existingRecords = existingData.records || {};

    // Merge: for each level, keep the better record (higher stars, then faster time)
    const merged = { ...existingRecords };
    for (const [lid, rec] of Object.entries(player.records)) {
      const old = merged[lid];
      if (!old || rec.stars > (old.stars || 0) || (rec.stars === (old.stars || 0) && rec.time < (old.time || Infinity))) {
        merged[lid] = rec;
      }
    }

    await setDoc(profileRef, {
      playerId: player.playerId,
      alias: player.aliasDisplay,
      records: merged,
      speedRecords: existingData.speedRecords || {},
      achievements: existingData.achievements || {},
      settings: existingData.settings || {},
    }, { merge: true });

    console.log(`  Written ${Object.keys(merged).length} records to profile ${player.playerId}`);

    // Ensure alias index exists
    const aliasKey = alias.toLowerCase();
    await setDoc(doc(db, 'alias_player_index', aliasKey), {
      aliasKey,
      aliasDisplay: player.aliasDisplay,
      playerId: player.playerId,
    }, { merge: true });
    console.log(`  Alias index updated: ${aliasKey} → ${player.playerId}`);
  }
}

// Main
async function main() {
  console.log('=== Player Profile Migration ===\n');

  const players = await findPlayerIds();
  await scanLeaderboards(players);
  console.log('\nWriting profiles...');
  await writeProfiles(players);
  console.log('\nMigration complete!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
