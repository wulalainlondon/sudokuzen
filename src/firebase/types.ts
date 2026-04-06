// Minimal type declarations for Firebase Compat SDK
// Used instead of `any` for Firestore operations

export interface FirestoreDoc {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  id: string;
  ref: FirestoreDocRef;
}

export interface FirestoreSnap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  docs: FirestoreDoc[];
  size: number;
  forEach(callback: (doc: FirestoreDoc) => void): void;
}

export interface FirestoreTransaction {
  get(ref: FirestoreDocRef): Promise<FirestoreDoc>;
  set(ref: FirestoreDocRef, data: Record<string, unknown>): FirestoreTransaction;
  update(ref: FirestoreDocRef, data: Record<string, unknown>): FirestoreTransaction;
}

export interface FirestoreDocRef {
  get(): Promise<FirestoreDoc>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  collection(name: string): FirestoreCollectionRef;
  onSnapshot(
    onNext: (snap: FirestoreDoc) => void,
    onError?: (err: unknown) => void,
  ): () => void;
}

export interface FirestoreCollectionRef {
  doc(id: string): FirestoreDocRef;
  orderBy(field: string, direction?: 'asc' | 'desc'): FirestoreQuery;
  where(field: string, op: string, value: unknown): FirestoreQuery;
  limit(n: number): FirestoreQuery;
  get(): Promise<FirestoreSnap>;
  onSnapshot(
    onNext: (snap: FirestoreSnap) => void,
    onError?: (err: unknown) => void,
  ): () => void;
}

export interface FirestoreQuery {
  get(): Promise<FirestoreSnap>;
  orderBy(field: string, direction?: 'asc' | 'desc'): FirestoreQuery;
  where(field: string, op: string, value: unknown): FirestoreQuery;
  limit(n: number): FirestoreQuery;
  onSnapshot(
    onNext: (snap: FirestoreSnap) => void,
    onError?: (err: unknown) => void,
  ): () => void;
}
