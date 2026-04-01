// Minimal type declarations for Firebase Compat SDK
// Used instead of `any` for Firestore operations

export interface FirestoreDoc {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  id: string;
}

export interface FirestoreSnap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  docs: FirestoreDoc[];
  size: number;
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
}

export interface FirestoreCollectionRef {
  doc(id: string): FirestoreDocRef;
  orderBy(field: string, direction?: 'asc' | 'desc'): FirestoreQuery;
  where(field: string, op: string, value: unknown): FirestoreQuery;
  limit(n: number): FirestoreQuery;
}

export interface FirestoreQuery {
  get(): Promise<FirestoreSnap>;
  orderBy(field: string, direction?: 'asc' | 'desc'): FirestoreQuery;
  where(field: string, op: string, value: unknown): FirestoreQuery;
  limit(n: number): FirestoreQuery;
}
