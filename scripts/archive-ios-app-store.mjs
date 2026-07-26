import { execFileSync } from 'node:child_process';
import path from 'node:path';

const teamId = process.env.APPLE_TEAM_ID?.trim() || '';
if (!/^[A-Z0-9]{10}$/.test(teamId)) {
  console.error('Set APPLE_TEAM_ID to the 10-character Apple Developer Team ID.');
  process.exit(1);
}

let identities = '';
try {
  identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  });
} catch {
  console.error('Unable to inspect Keychain code-signing identities.');
  process.exit(1);
}

if (!/Apple Distribution|iPhone Distribution/.test(identities)) {
  console.error(
    'No Apple Distribution identity is installed. Install the distribution certificate in Keychain before archiving.',
  );
  process.exit(1);
}

const archivePath = path.resolve('build/SudokuZen-AppStore.xcarchive');
const args = [
  '-workspace',
  'ios/App/App.xcworkspace',
  '-scheme',
  'App',
  '-configuration',
  'Release',
  '-destination',
  'generic/platform=iOS',
  '-archivePath',
  archivePath,
  `DEVELOPMENT_TEAM=${teamId}`,
  'CODE_SIGN_STYLE=Automatic',
  '-allowProvisioningUpdates',
  'archive',
];

execFileSync('xcodebuild', args, { stdio: 'inherit' });
console.log(`Signed App Store archive created: ${archivePath}`);
console.log('Open it in Xcode Organizer, validate the app, then choose Distribute App → App Store Connect.');
