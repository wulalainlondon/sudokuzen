#!/usr/bin/env node
/**
 * Sound Effect Downloader — Kenney.nl CC0 版本
 *
 * 從 Kenney.nl 下載四個 CC0 音效包，解壓後依映射表複製到 public/sounds/。
 * Kenney 授權：CC0 1.0，完全免費商用，不需署名。
 *
 * Run: node scripts/download-sfx.mjs
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execSync } from 'node:child_process';
import os from 'node:os';

const OUTPUT_DIR = path.resolve('public/sounds');
const TEMP_DIR = path.join(os.tmpdir(), 'kenney-sfx');

// ── Kenney 包清單 ──────────────────────────────────────────────────────────
// URL 從 Kenney 頁面的「Continue without donating」連結取得。
// 用 Playwright 重新抓，確保版本最新。

const KENNEY_PACKS = [
  {
    key: 'ui-audio',
    pageUrl: 'https://kenney.nl/assets/ui-audio',
    fallbackUrl: 'https://kenney.nl/media/pages/assets/ui-audio/e19c9b1814-1677590494/kenney_ui-audio.zip',
  },
  {
    key: 'interface-sounds',
    pageUrl: 'https://kenney.nl/assets/interface-sounds',
    fallbackUrl: 'https://kenney.nl/media/pages/assets/interface-sounds/d23a84242e-1677589452/kenney_interface-sounds.zip',
  },
  {
    key: 'impact-sounds',
    pageUrl: 'https://kenney.nl/assets/impact-sounds',
    fallbackUrl: 'https://kenney.nl/media/pages/assets/impact-sounds/8aa7b545c9-1677589768/kenney_impact-sounds.zip',
  },
  {
    key: 'music-jingles',
    pageUrl: 'https://kenney.nl/assets/music-jingles',
    fallbackUrl: 'https://kenney.nl/media/pages/assets/music-jingles/4f5dd770b7-1677590399/kenney_music-jingles.zip',
  },
];

// ── 音效映射表 ─────────────────────────────────────────────────────────────
// pack  → 哪個 Kenney 包
// file  → 包解壓後的相對路徑（OGG 優先；也接受 MP3/WAV）
// out   → 最終輸出檔名
// vol   → patch-audio-to-files.mjs 用的音量係數

const SOUND_MAP = [
  // ── 標準遊戲音效 ────────────────────────────────────────────────────────
  {
    out: 'cell_select.ogg',
    pack: 'ui-audio',
    file: 'Audio/rollover1.ogg',      // 滑鼠滑過感，輕柔
    vol: 0.55,
    desc: '格子選擇',
  },
  {
    out: 'fill.ogg',
    pack: 'ui-audio',
    file: 'Audio/click2.ogg',          // 清脆短促點擊
    vol: 0.65,
    desc: '填數字',
  },
  {
    out: 'note_toggle.ogg',
    pack: 'interface-sounds',
    file: 'Audio/tick_001.ogg',        // 最短促的 tick，比 switch 更輕
    vol: 0.45,
    desc: '候選數字切換',
  },
  {
    out: 'erase.ogg',
    pack: 'interface-sounds',
    file: 'Audio/scratch_001.ogg',     // 刮擦聲，像橡皮擦
    vol: 0.50,
    desc: '清除',
  },
  {
    out: 'unit_complete.ogg',
    pack: 'interface-sounds',
    file: 'Audio/confirmation_001.ogg', // 確認音，稍有餘韻
    vol: 0.70,
    desc: '完成行列宮',
  },
  {
    out: 'win.ogg',
    pack: 'music-jingles',
    file: 'Audio/Pizzicato jingles/jingles_PIZZI00.ogg', // 撥弦最有禪風
    vol: 0.75,
    desc: '通關',
  },
  {
    out: 'error.ogg',
    pack: 'interface-sounds',
    file: 'Audio/error_001.ogg',       // 短促錯誤提示
    vol: 0.60,
    desc: '錯誤',
  },
  // ── Zen 模式音效 ──────────────────────────────────────────────────────────
  {
    out: 'zen_bell.ogg',
    pack: 'interface-sounds',
    file: 'Audio/bong_001.ogg',        // 鐘聲感最接近木魚
    vol: 0.70,
    desc: 'Zen 進入',
  },
  {
    out: 'zen_encounter.ogg',
    pack: 'interface-sounds',
    file: 'Audio/maximize_001.ogg',    // 展開感，像捲軸打開
    vol: 0.55,
    desc: 'Zen 遭遇',
  },
  {
    out: 'zen_boss.ogg',
    pack: 'impact-sounds',
    file: 'Audio/impactBell_heavy_000.ogg', // 重鐘撞擊，有威壓感
    vol: 0.65,
    desc: 'Zen Boss',
  },
  {
    out: 'zen_mentor.ogg',
    pack: 'interface-sounds',
    file: 'Audio/drop_001.ogg',        // 輕輕落下感，像水滴
    vol: 0.50,
    desc: 'Zen 師父',
  },
  {
    out: 'zen_complete.ogg',
    pack: 'interface-sounds',
    file: 'Audio/glass_001.ogg',       // 玻璃/水晶共鳴，清澈
    vol: 0.70,
    desc: 'Zen 完成',
  },
  {
    out: 'zen_discover.ogg',
    pack: 'interface-sounds',
    file: 'Audio/pluck_001.ogg',       // 撥弦一聲，像翻頁
    vol: 0.55,
    desc: 'Zen 發現',
  },
];

// ── 工具函數 ───────────────────────────────────────────────────────────────

async function downloadZip(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadZip(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

/** 用 Playwright 取得 Kenney 頁面上最新的 zip 下載 URL */
async function getLatestZipUrl(page, pack) {
  try {
    await page.goto(pack.pageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // 「Continue without donating」按鈕有直接 zip href
    const href = await page
      .locator('a[href*="media/pages/assets"][href$=".zip"]')
      .first()
      .getAttribute('href', { timeout: 5000 });
    if (href) return href.startsWith('http') ? href : `https://kenney.nl${href}`;
  } catch { /* fallback below */ }
  return pack.fallbackUrl;
}

/** 把 pack 解壓到 TEMP_DIR/{packKey}/ */
function extractZip(zipPath, packKey) {
  const dest = path.join(TEMP_DIR, packKey);
  fs.mkdirSync(dest, { recursive: true });
  execSync(`unzip -o -q "${zipPath}" -d "${dest}"`, { stdio: 'inherit' });
  return dest;
}

/** 在解壓目錄下遞迴搜尋第一個符合 targetPath 的檔案 */
function findFile(extractDir, targetPath) {
  // Direct match
  const direct = path.join(extractDir, targetPath);
  if (fs.existsSync(direct)) return direct;

  // Search recursively by filename only
  const filename = path.basename(targetPath);
  const found = walkFind(extractDir, filename);
  return found || null;
}

function walkFind(dir, filename) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const r = walkFind(full, filename);
      if (r) return r;
    } else if (entry.name === filename) {
      return full;
    }
  }
  return null;
}

/** 列出解壓目錄中所有音效檔 */
function listAudioFiles(dir) {
  const results = [];
  function walk(d, rel = '') {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(d, entry.name), relPath);
      else if (/\.(ogg|mp3|wav)$/i.test(entry.name)) results.push(relPath);
    }
  }
  walk(dir);
  return results.sort();
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  console.log('🎵 Kenney SFX Downloader — CC0 Commercial Safe');
  console.log(`   Output : ${OUTPUT_DIR}`);
  console.log(`   Temp   : ${TEMP_DIR}\n`);

  // ── Step 1: 用 Playwright 抓最新 zip URL ──────────────────────────────
  console.log('🌐 Fetching latest download URLs from Kenney...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const packUrls = {};
  for (const pack of KENNEY_PACKS) {
    const url = await getLatestZipUrl(page, pack);
    packUrls[pack.key] = url;
    console.log(`   ${pack.key}: ${url.split('/').pop()}`);
  }
  await browser.close();

  // ── Step 2: 下載並解壓 ────────────────────────────────────────────────
  const extractDirs = {};
  for (const pack of KENNEY_PACKS) {
    const url = packUrls[pack.key];
    const zipPath = path.join(TEMP_DIR, `${pack.key}.zip`);

    if (fs.existsSync(zipPath)) {
      console.log(`\n○ ${pack.key} — zip 已存在，跳過下載`);
    } else {
      process.stdout.write(`\n⬇  ${pack.key} 下載中...`);
      await downloadZip(url, zipPath);
      const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
      console.log(` ${size} MB`);
    }

    process.stdout.write(`   解壓中...`);
    const extractDir = extractZip(zipPath, pack.key);
    extractDirs[pack.key] = extractDir;
    const files = listAudioFiles(extractDir);
    console.log(` ${files.length} 個音效檔`);
  }

  // ── Step 3: 列出所有可用檔案（供手動調整映射表用）────────────────────
  console.log('\n── 可用音效檔案清單 ────────────────────────────────────────');
  for (const pack of KENNEY_PACKS) {
    console.log(`\n[${pack.key}]`);
    const files = listAudioFiles(extractDirs[pack.key]);
    files.forEach((f) => console.log(`  ${f}`));
  }

  // ── Step 4: 依映射表複製檔案 ─────────────────────────────────────────
  console.log('\n── 複製音效 ─────────────────────────────────────────────────');
  const results = [];

  for (const entry of SOUND_MAP) {
    const outPath = path.join(OUTPUT_DIR, entry.out);
    const extractDir = extractDirs[entry.pack];

    if (!extractDir) {
      console.log(`  ✗ ${entry.desc} — pack "${entry.pack}" 未找到`);
      results.push({ ...entry, status: 'no_pack' });
      continue;
    }

    const srcPath = findFile(extractDir, entry.file);

    if (srcPath) {
      fs.copyFileSync(srcPath, outPath);
      const size = (fs.statSync(outPath).size / 1024).toFixed(1);
      console.log(`  ✓ ${entry.desc.padEnd(16)} → ${entry.out}  (${size} KB)`);
      results.push({ ...entry, status: 'ok', src: srcPath });
    } else {
      // 找不到指定檔，列出同 pack 的候選
      const all = listAudioFiles(extractDir);
      console.log(`  ✗ ${entry.desc.padEnd(16)} → "${entry.file}" 不存在`);
      const similar = all.filter((f) =>
        f.toLowerCase().includes(path.basename(entry.file, '.ogg').toLowerCase().split('_')[0])
      );
      if (similar.length > 0) {
        console.log(`     候選: ${similar.slice(0, 3).join(', ')}`);
      }
      results.push({ ...entry, status: 'not_found' });
    }
  }

  // ── 結果摘要 ──────────────────────────────────────────────────────────
  const ok = results.filter((r) => r.status === 'ok').length;
  const failed = results.filter((r) => r.status !== 'ok').length;

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  ✓ 成功: ${ok}  ✗ 失敗: ${failed}`);

  if (failed > 0) {
    console.log('\n  失敗的音效請手動調整腳本頂部的 SOUND_MAP 映射表：');
    console.log('  把 file 欄位改成上方「可用音效檔案清單」中的路徑。');
  }

  if (ok > 0) {
    // 更新 patch 腳本的 VOLUMES（讓 patch 腳本知道用 .ogg 而非 .mp3）
    console.log('\n  接著執行: node scripts/patch-audio-to-files.mjs');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
