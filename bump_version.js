const fs = require('fs');
const path = require('path');

const INDEX_FILE = path.join(__dirname, 'index.html');
const SW_FILE = path.join(__dirname, 'sw.js');

function getTodayString() {
    const d = new Date();
    // Use local time for YYYY.MM.DD
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd}`;
}

function computeNextVersion(currentVersion) {
    const today = getTodayString();

    // Default format is YYYY.MM.DD-V1
    // If the date matches, increment V. Otherwise, restart at V1.
    const parts = currentVersion.split('-');
    const datePart = parts[0];

    if (datePart === today && parts.length > 1) {
        // e.g. "2026.03.10-V1" -> "2026.03.10-V2"
        const vPart = parts[1]; // "V1"
        if (vPart.startsWith('V')) {
            const vNum = parseInt(vPart.substring(1));
            return `${today}-V${vNum + 1}`;
        }
    }

    // If the current version is an older non-standard format (like 2026.02.15.5),
    // or if the date doesn't match today, we just start fresh with today's date and V1.
    return `${today}-V1`;
}

function bumpFileContent(filePath, regex, replacementCallback) {
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return false;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    let updatedContent = content.replace(regex, replacementCallback);
    if (updatedContent !== content) {
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        return true;
    }
    return false;
}

console.log("Starting version bump process...");

// 1. Read the current version from SW_FILE to decide the next version
let currentVersion = '2000.01.01-V1'; // fallback
if (fs.existsSync(SW_FILE)) {
    const swContent = fs.readFileSync(SW_FILE, 'utf8');
    const match = swContent.match(/const\s+CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (match) {
        currentVersion = match[1];
    }
}

const nextVersion = computeNextVersion(currentVersion);
console.log(`Current Version detected: ${currentVersion}`);
console.log(`Bumping to next version:  ${nextVersion}`);

// 2. Update sw.js
const swRegex = /(const\s+CACHE_VERSION\s*=\s*['"])([^'"]+)(['"])/g;
const swBumped = bumpFileContent(SW_FILE, swRegex, (match, prefix, oldV, suffix) => {
    return `${prefix}${nextVersion}${suffix}`;
});

if (swBumped) {
    console.log(`[SUCCESS] Updated SW.js to ${nextVersion}`);
} else {
    console.log(`[WARNING] Failed to update SW.js (maybe pattern not found)`);
}

// 3. Update index.html
const indexRegex = /(const\s+APP_VERSION\s*=\s*['"])([^'"]+)(['"])/g;
const indexBumped = bumpFileContent(INDEX_FILE, indexRegex, (match, prefix, oldV, suffix) => {
    return `${prefix}${nextVersion}${suffix}`;
});

if (indexBumped) {
    console.log(`[SUCCESS] Updated index.html to ${nextVersion}`);
} else {
    console.log(`[WARNING] Failed to update index.html (maybe pattern not found)`);
}

console.log("\nVersion bump complete!");
console.log("Remember to commit and push changes: git commit -am \"bump: v" + nextVersion + "\"");
