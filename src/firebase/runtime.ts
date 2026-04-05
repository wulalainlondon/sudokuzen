import type { SudokuWindow } from '../facade/windowTypes';
import type { FirestoreDbLike } from '../game/state';

interface FirestoreNamespace {
  (): FirestoreDbLike;
  FieldValue: { serverTimestamp(): unknown };
  Timestamp: { fromMillis(ms: number): unknown };
}

export interface FirebaseCompat {
  apps: unknown[];
  initializeApp(config: Record<string, string>): void;
  firestore: FirestoreNamespace;
}

let _firebaseCompat: FirebaseCompat | null = null;
let _firebaseInitPromise: Promise<FirebaseCompat | null> | null = null;
let _firebaseConfigLoadPromise: Promise<void> | null = null;

function resolvePublicPath(file: string): string {
  try {
    const base = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    return new URL(file, base).href;
  } catch {
    return file;
  }
}

function appendScript(src: string, optional = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      if (optional) resolve();
      else reject(new Error(`script load failed: ${src}`));
    };
    document.head.appendChild(script);
  });
}

async function ensureFirebaseConfigLoaded(): Promise<void> {
  if ((window as SudokuWindow).SUDOKU_FIREBASE_CONFIG) return;
  if (_firebaseConfigLoadPromise) return _firebaseConfigLoadPromise;
  _firebaseConfigLoadPromise = (async () => {
    await appendScript(resolvePublicPath('firebase-config.js'));
    await appendScript(resolvePublicPath('firebase-config.local.js'), true);
  })();
  return _firebaseConfigLoadPromise;
}

export async function ensureFirebaseRuntime(): Promise<FirebaseCompat | null> {
  if (_firebaseCompat) return _firebaseCompat;
  if (_firebaseInitPromise) return _firebaseInitPromise;

  _firebaseInitPromise = (async () => {
    await ensureFirebaseConfigLoaded();
    const win = window as SudokuWindow;
    if (!win.SUDOKU_FIREBASE_CONFIG) return null;
    const appModule = await import('firebase/compat/app');
    await import('firebase/compat/firestore');
    _firebaseCompat = (appModule.default || appModule) as unknown as FirebaseCompat;
    return _firebaseCompat;
  })();

  return _firebaseInitPromise;
}

export function firebaseServerTimestamp(): unknown {
  if (_firebaseCompat) return _firebaseCompat.firestore.FieldValue.serverTimestamp();
  return Date.now();
}

export function firebaseTimestampFromMillis(ms: number): unknown {
  if (_firebaseCompat) return _firebaseCompat.firestore.Timestamp.fromMillis(ms);
  return new Date(ms);
}
