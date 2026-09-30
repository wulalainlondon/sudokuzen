import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const editions = JSON.parse(fs.readFileSync(new URL('../config/app-editions.json', import.meta.url), 'utf8'));
export function selectedEdition() {
  const edition = process.env.APP_EDITION || 'pwa';
  if (!['pwa', 'ios'].includes(edition)) throw new Error(`Unsupported APP_EDITION: ${edition}`);
  return edition;
}

export function editionBuildFiles(root, edition = selectedEdition()) {
  const sourcePath = path.join(root, 'public', edition === 'ios' ? 'firebase-config.ios.js' : 'firebase-config.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  const config = sandbox.window.SUDOKU_FIREBASE_CONFIG;
  if (!config || config.projectId !== editions[edition].projectId)
    throw new Error(`Invalid ${edition} Firebase project`);
  const files = {
    'firebase-config.js': source,
    'firebase-config.local.js': '// No runtime overrides in production.\n',
    'app-edition.json': JSON.stringify({ edition, ...editions[edition], protocolVersion: 2 }),
  };
  if (edition === 'ios') {
    const legacy = fs.readFileSync(path.join(root, 'public/firebase-config.js'), 'utf8');
    const oldSandbox = { window: {} };
    vm.runInNewContext(legacy, oldSandbox, { timeout: 1000 });
    if (oldSandbox.window.SUDOKU_FIREBASE_CONFIG?.projectId !== editions.legacy.projectId)
      throw new Error('Invalid migration Firebase project');
    files['firebase-legacy-config.js'] = legacy.replaceAll(
      'window.SUDOKU_FIREBASE_CONFIG',
      'window.SUDOKU_LEGACY_FIREBASE_CONFIG',
    );
  }
  return files;
}

export function appEditionPlugin(root) {
  return {
    name: 'app-edition-config',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const filename = req.url?.split('?')[0]?.split('/').at(-1);
        if (
          !['firebase-config.js', 'firebase-config.local.js', 'firebase-legacy-config.js', 'app-edition.json'].includes(
            filename,
          )
        )
          return next();
        const files = editionBuildFiles(root);
        if (!files[filename]) return next();
        res.setHeader('Content-Type', filename.endsWith('.json') ? 'application/json' : 'application/javascript');
        res.end(files[filename]);
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(editionBuildFiles(root)))
        this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
