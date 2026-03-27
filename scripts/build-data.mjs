#!/usr/bin/env node
/**
 * Build runtime data files from JSON sources of truth.
 *
 * Sources:           → Outputs:
 *   levels-data.json   → levels.js
 *   mid-pool-data.json → mid_pool.js
 */
import { readLevelsData, writeLevelsData, readMidPoolData, writeMidPoolData } from './lib/writeTeachData.mjs';

const levels = readLevelsData();
writeLevelsData(levels);

const pool = readMidPoolData();
writeMidPoolData(pool);
