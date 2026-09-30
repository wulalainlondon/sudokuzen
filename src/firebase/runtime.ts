import type { SudokuWindow } from '../facade/windowTypes';
import type { FirestoreDbLike } from '../game/state';
import { ACTIVE_EDITION, TARGET_EDITION, assertEditionProject, LEGACY_PROJECT_ID } from '../platform/appEdition';

interface FirestoreNamespace {
  (): FirestoreDbLike;
  FieldValue: { serverTimestamp(): unknown };
  Timestamp: { fromMillis(ms: number): unknown };
}

interface FirebaseUser {
  uid: string;
  getIdToken(forceRefresh?: boolean): Promise<string>;
  delete(): Promise<void>;
}

interface FirebaseAuth {
  currentUser: FirebaseUser | null;
  signInAnonymously(): Promise<{ user: { uid: string } | null }>;
  onAuthStateChanged(cb: (user: { uid: string } | null) => void): () => void;
  signOut?(): Promise<void>;
}

interface FirebaseFunctions {
  httpsCallable(name: string): (data?: unknown) => Promise<{ data: unknown }>;
}

interface FirebaseAppCompat {
  name: string;
  options: Record<string, string>;
  auth(): FirebaseAuth;
  firestore(): FirestoreDbLike;
  functions(): FirebaseFunctions;
}

export interface FirebaseCompat {
  apps: unknown[];
  initializeApp(config: Record<string, string>, name?: string): FirebaseAppCompat | void;
  firestore: FirestoreNamespace;
  auth(): FirebaseAuth;
  functions(): FirebaseFunctions;
}

let _firebaseCompat: FirebaseCompat | null = null;
let _legacyApp: FirebaseAppCompat | null = null;
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
  const globals = window as SudokuWindow & { SUDOKU_LEGACY_FIREBASE_CONFIG?: Record<string, string> };
  if (globals.SUDOKU_FIREBASE_CONFIG && (TARGET_EDITION !== 'ios' || globals.SUDOKU_LEGACY_FIREBASE_CONFIG)) return;
  if (_firebaseConfigLoadPromise) return _firebaseConfigLoadPromise;
  _firebaseConfigLoadPromise = (async () => {
    if (!globals.SUDOKU_FIREBASE_CONFIG) await appendScript(resolvePublicPath('firebase-config.js'));
    if (TARGET_EDITION === 'ios') await appendScript(resolvePublicPath('firebase-legacy-config.js'));
    if (!import.meta.env.PROD || TARGET_EDITION === 'legacy')
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
    const sdk = await loadSdk();
    if (TARGET_EDITION === 'legacy') {
      _firebaseCompat = sdk;
    } else {
      const legacyConfig = (win as SudokuWindow & { SUDOKU_LEGACY_FIREBASE_CONFIG?: Record<string, string> })
        .SUDOKU_LEGACY_FIREBASE_CONFIG;
      const config =
        ACTIVE_EDITION === 'legacy' ? (legacyConfig ?? win.SUDOKU_FIREBASE_CONFIG) : win.SUDOKU_FIREBASE_CONFIG;
      if (!config) throw new Error('Missing original Firebase configuration for room recovery');
      if (ACTIVE_EDITION === 'legacy' && config.projectId !== LEGACY_PROJECT_ID)
        throw new Error('Original Firebase project mismatch');
      assertEditionProject(config);
      const originalConfig = legacyConfig ?? (TARGET_EDITION === 'pwa' ? config : null);
      if (originalConfig?.projectId === LEGACY_PROJECT_ID) {
        _legacyApp =
          (sdk.apps as FirebaseAppCompat[]).find((a) => a.name === '[DEFAULT]') ??
          (sdk.initializeApp(originalConfig) as FirebaseAppCompat);
      }
      const name = ACTIVE_EDITION === 'legacy' ? '[DEFAULT]' : `sudoku-${ACTIVE_EDITION}`;
      const clientApp =
        (sdk.apps as FirebaseAppCompat[]).find((a) => a.name === name) ??
        (sdk.initializeApp(config, name) as FirebaseAppCompat);
      if (clientApp.options.projectId !== config.projectId)
        throw new Error('Firebase app belongs to a different edition');
      const firestore = clientApp.firestore.bind(clientApp) as FirestoreNamespace;
      firestore.FieldValue = sdk.firestore.FieldValue;
      firestore.Timestamp = sdk.firestore.Timestamp;
      _firebaseCompat = {
        ...sdk,
        apps: sdk.apps,
        initializeApp: sdk.initializeApp.bind(sdk),
        firestore,
        auth: clientApp.auth.bind(clientApp),
        functions: clientApp.functions.bind(clientApp),
      };
    }
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

/** Recover only the original authenticated identity; never create an old account. */
export async function getLegacyProfileDb(sourcePlayerId: string | null): Promise<FirestoreDbLike | null> {
  if (!sourcePlayerId || !_legacyApp || ACTIVE_EDITION === 'legacy') return null;
  const auth = _legacyApp.auth();
  if (!auth.currentUser) {
    await new Promise<void>((resolve) => {
      const observer = { unsubscribe: () => {} };
      const timer = setTimeout(() => {
        observer.unsubscribe();
        resolve();
      }, 4000);
      observer.unsubscribe = auth.onAuthStateChanged(() =>
        queueMicrotask(() => {
          clearTimeout(timer);
          observer.unsubscribe();
          resolve();
        }),
      );
    });
  }
  if (!auth.currentUser || `p_${auth.currentUser.uid}` !== sourcePlayerId) return null;
  return _legacyApp.firestore();
}

/** Original leaderboards are public and are exposed only as historical rows. */
export async function getLegacyLeaderboardDb(): Promise<FirestoreDbLike | null> {
  await ensureFirebaseRuntime();
  return _legacyApp?.firestore() ?? null;
}

export async function signOutLegacySession(): Promise<void> {
  if (_legacyApp && ACTIVE_EDITION !== 'legacy') await _legacyApp.auth().signOut?.();
}

export async function deleteCurrentAuthUser(): Promise<void> {
  const fb = await ensureFirebaseRuntime();
  const user = fb?.auth().currentUser;
  if (!user) throw new Error('Authenticated account required for deletion');
  await user.delete();
  _authUid = null;
  _authReady = null;
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
