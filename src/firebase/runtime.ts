import type { SudokuWindow } from '../facade/windowTypes';
import type { FirestoreDbLike } from '../game/state';

interface FirestoreNamespace {
  (): FirestoreDbLike;
  FieldValue: { serverTimestamp(): unknown };
  Timestamp: { fromMillis(ms: number): unknown };
}

interface FirebaseUser {
  uid: string;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

interface FirebaseAuth {
  currentUser: FirebaseUser | null;
  signInAnonymously(): Promise<{ user: { uid: string } | null }>;
  onAuthStateChanged(cb: (user: { uid: string } | null) => void): () => void;
}

interface FirebaseFunctions {
  httpsCallable(name: string): (data?: unknown) => Promise<{ data: unknown }>;
}

export interface FirebaseCompat {
  apps: unknown[];
  initializeApp(config: Record<string, string>): void;
  firestore: FirestoreNamespace;
  auth(): FirebaseAuth;
  functions(): FirebaseFunctions;
}

let _firebaseCompat: FirebaseCompat | null = null;
let _firebaseInitPromise: Promise<FirebaseCompat | null> | null = null;
let _firebaseConfigLoadPromise: Promise<void> | null = null;
let _authUid: string | null = null;
let _authReady: Promise<void> | null = null;
let _sdkFailureUrl: string | null = null;
let _sdkLoadFailed = false;

export function hasFirebaseSdkLoadFailure(): boolean {
  return _sdkLoadFailed;
}

export function getFirebaseSdkFailureUrl(): string | null {
  return _sdkFailureUrl;
}

async function loadSdk(): Promise<FirebaseCompat> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const appModule = await import('firebase/compat/app');
        await Promise.all([
          import('firebase/compat/firestore'),
          import('firebase/compat/auth'),
          import('firebase/compat/functions'),
        ]);
        return (appModule.default || appModule) as unknown as FirebaseCompat;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Firebase SDK load timed out')), 8000);
      }),
    ]);
  } catch (error) {
    _sdkLoadFailed = true;
    const url = String(error).match(/https?:\/\/[^\s"']+\.js(?:\?[^\s"']*)?/)?.[0];
    _sdkFailureUrl = url && new URL(url).origin === window.location.origin ? url : null;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

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
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      script.remove();
      if (error && !optional) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error(`script load timed out: ${src}`)), optional ? 1500 : 8000);
    script.onload = () => finish();
    script.onerror = () => finish(new Error(`script load failed: ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureFirebaseConfigLoaded(): Promise<void> {
  if ((window as SudokuWindow).SUDOKU_FIREBASE_CONFIG) return;
  if (_firebaseConfigLoadPromise) return _firebaseConfigLoadPromise;
  _firebaseConfigLoadPromise = (async () => {
    await appendScript(resolvePublicPath('firebase-config.js'));
    await appendScript(resolvePublicPath('firebase-config.local.js'), true);
  })().finally(() => {
    _firebaseConfigLoadPromise = null;
  });
  return _firebaseConfigLoadPromise;
}

export async function ensureFirebaseRuntime(): Promise<FirebaseCompat | null> {
  if (_firebaseCompat) return _firebaseCompat;
  if (_firebaseInitPromise) return _firebaseInitPromise;

  _firebaseInitPromise = (async () => {
    await ensureFirebaseConfigLoaded();
    const win = window as SudokuWindow;
    if (!win.SUDOKU_FIREBASE_CONFIG) return null;
    _firebaseCompat = await loadSdk();
    _sdkFailureUrl = null;
    _sdkLoadFailed = false;
    return _firebaseCompat;
  })().finally(() => {
    _firebaseInitPromise = null;
  });

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

export async function initAnonymousAuth(): Promise<string | null> {
  if (import.meta.env.MODE === 'test') {
    _authUid = 'test-owner';
    return _authUid;
  }
  const fb = await ensureFirebaseRuntime();
  if (!fb) return null;
  if (_authReady) {
    await _authReady;
    return _authUid;
  }
  _authReady = (async () => {
    try {
      const auth = fb.auth();
      if (auth.currentUser) {
        _authUid = auth.currentUser.uid;
        return;
      }
      const cred = await auth.signInAnonymously();
      _authUid = cred.user?.uid ?? null;
    } catch (error) {
      console.warn('Firebase anonymous auth failed:', error);
      _authUid = null;
      _authReady = null; // Reset so the next callDuoFunction can retry auth
    }
  })().finally(() => {
    if (!_authUid) _authReady = null;
  });
  await _authReady;
  return _authUid;
}

export function getAuthUid(): string | null {
  return _authUid;
}

// 取得 Firebase ID token（Cloudflare Worker 端驗身分用）。確保已匿名登入後回 token。
export async function getFirebaseIdToken(): Promise<string | null> {
  const fb = await ensureFirebaseRuntime();
  if (!fb) return null;
  if (!fb.auth().currentUser) await initAnonymousAuth();
  const user = fb.auth().currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function callDuoFunction<T = unknown>(name: string, data: unknown): Promise<T> {
  const fb = await ensureFirebaseRuntime();
  if (!fb) throw new Error('Firebase not available');
  // Ensure auth before any CF call; retry if initAnonymousAuth previously failed silently
  if (!fb.auth().currentUser) await initAnonymousAuth();
  const fn = fb.functions().httpsCallable(name);
  const result = await fn(data);
  return result.data as T;
}
